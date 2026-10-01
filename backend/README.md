# BU CMONG 백엔드

2026-10-01 기준. `docs/01`~`09`와 현재 프론트엔드를 대조해 구현한 **NestJS + TypeScript + PostgreSQL API**다. 회원·학교 인증 심사, 공개 탐색, 의뢰·지원·지정 요청, 워크룸, 계약, 완료·취소, 후기, 파일, 알림, 운영 API를 제공한다. 현재 프론트엔드의 기본 진입점 `frontend/src/live/App.jsx`는 이 API에 연결된다. [루트 README](../README.md)에 운영 노출 정책과 첫 거래 흐름을 정리했다.

## 바로 실행

Node.js 24 권장. 모든 명령은 `backend`에서 실행한다.

```powershell
cd C:\Users\dltmd\Desktop\bu-cmong\backend
npm ci
Copy-Item .env.example .env
npm run migrate
npm run dev
```

기본 API는 `http://127.0.0.1:3000/api/v1`, 프론트 Origin은 `http://127.0.0.1:5173`이다. `.env`의 `SESSION_SECRET`은 충분히 긴 임의 값으로 설정한다. `.env` 자체를 생략하면 개발용 무작위 키를 `.data/session.key`에 생성한다. `.data`, `.env`는 Git에서 제외한다.

`DATABASE_URL`이 없으면 **PGlite**에 PostgreSQL SQL을 실행하며 `.data/postgres`에 저장한다. 별도 PostgreSQL 설치 없이 로컬 기능을 검증하기 위한 모드다. PGlite DB는 한 프로세스만 열어야 하므로 서버 실행 중 별도 migrate/seed/staff CLI를 실행하지 않는다. 이 모드의 Worker는 API 프로세스 안에서 실행한다.

```powershell
npm run build
npm start
npm test
npm run openapi
```

- `GET /health/live`: 프로세스 생존 확인
- `GET /health/ready`: DB 및 마이그레이션 테이블 접근 확인
- `GET /openapi.json`: OpenAPI JSON 원문
- [contracts/openapi.json](contracts/openapi.json): 라우트 및 Zod 요청 스키마에서 생성한 계약

## 개발 계정과 운영 권한

기본 계정이나 고정 관리자 비밀번호는 만들지 않는다. 테스트용 인증 계정이 필요하면 서버를 종료한 상태에서 다음을 실행한다. seed는 개발 환경에서만 동작한다.

```powershell
$env:DEV_OWNER_PASSWORD = '사용할-개발-비밀번호'
$env:DEV_PROVIDER_PASSWORD = '별도의-개발-비밀번호'
npm run seed:dev
```

생성되는 이메일은 `owner@example.test`, `provider@example.test`이며 합성 학교 인증에는 만료 시각이 있다. 실제 학교 인증을 의미하지 않는다.

운영 권한은 HTTP로 자기 부여할 수 없다. DB 접근이 허용된 운영자가 가입된 계정에 명시적으로 부여한다. CLI 실행은 감사 로그를 남기고 해당 계정의 기존 세션을 폐기한다.

```powershell
npm run staff:grant -- owner@example.test verification,support "개발 심사 담당 지정"
npm run staff:grant -- owner@example.test none "권한 회수"
```

허용 scope는 `verification`, `support`, `dispute`, `audit`, `operations`다. CLI 실행자 자체의 신원은 배포 플랫폼/호스트 감사 로그에서 관리해야 한다.

## 프론트 연결 계약

1. `GET /auth/csrf`로 사전 세션 쿠키와 `data.csrfToken`을 받는다.
2. 변경 요청에 `credentials: 'include'`, `X-CSRF-Token`, JSON Content-Type을 보낸다. 브라우저가 보내는 Origin은 설정과 정확히 일치해야 한다.
3. 로그인은 세션 쿠키와 CSRF를 교체한다. 이후 `GET /auth/session`으로 복구할 수 있다.
4. 생성·선정·수락 등 일반 회원 POST에는 `Idempotency-Key`를 보낸다. 재시도는 **동일 키와 동일 body**를 사용한다. 로그인·메일·메시지·viewer-state 등 예외는 OpenAPI에 표시한다.
5. 수정·결정에는 응답받은 `version`을 `expectedVersion`으로 보낸다. 409는 최신 상태를 다시 조회하고 사용자 판단 후 새 명령으로 처리한다.

```js
const api = "http://127.0.0.1:3000/api/v1";
const { data } = await fetch(`${api}/auth/csrf`, {
  credentials: "include",
}).then((r) => r.json());
const response = await fetch(`${api}/auth/login`, {
  method: "POST",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    "X-CSRF-Token": data.csrfToken,
  },
  body: JSON.stringify({
    email: "owner@example.test",
    password: "설정한 비밀번호",
  }),
});
const session = await response.json();
// 이후 변경 요청은 session.data.csrfToken 사용
```

실제 ID는 UUID이며 frontend seed의 `p1`, `e1` 등과 호환되지 않는다. `recipientId`는 userId, `/experts/:id`는 profileId다. 분야/기술은 `/categories`, `/skills`의 ID를 사용한다. 현재 UI의 한글 예산·진행 방식은 아래 서버 값으로 변환해야 한다.

```json
{
  "terms": {
    "title": "학과 홍보 포스터 디자인",
    "summary": "행사 홍보용 포스터를 제작합니다",
    "content": "A3 포스터와 SNS 이미지를 제작합니다",
    "deliverables": "편집 가능한 원본과 PNG",
    "fieldId": "categories API에서 받은 분야 ID",
    "skillIds": [],
    "mediaIds": [],
    "budgetType": "FIXED",
    "budgetMin": 100000,
    "budgetMax": 100000,
    "days": 7,
    "mode": "ONLINE"
  },
  "closesAt": "2030-01-01T00:00:00.000Z"
}
```

예산은 원 단위 정수다. `NEGOTIABLE`은 min/max 둘 다 null, `RANGE`는 min≤max다. 프로젝트는 부분 초안 저장 후 publish에서 전체 검증한다. 지정 요청은 원본 수신자가 ORIGINAL을 수락하고, 견적 QUOTE는 원래 발신자가 수락한다. 협의 금액이 null인 계약 초안은 명시적인 계약 금액을 넣은 새 버전을 작성해야 발행할 수 있다.

목록은 `{data,meta}`, 단건은 `{data,meta:{requestId}}`, 오류는 `{error:{code,message,fieldErrors,requestId}}`다. messages cursor는 순번, notifications/files cursor는 서버가 반환한 UUID를 그대로 전달한다. SSE는 쿠키를 사용하는 `/events`이며 `Last-Event-ID` 또는 `after`로 재연결한다. 7일 replay 범위를 벗어나면 `stream.reset` 이후 관련 목록을 재조회한다.

## 구현 구조와 불변 조건

| 파일                                 | 책임                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `src/app.ts`, `http.ts`              | Nest 호스트, Express 라우트 등록, 세션·CSRF·권한·트랜잭션·멱등·OpenAPI  |
| `modules/identity.ts`, `oauth.ts`    | scrypt 계정, 쿠키 세션, 일회용 메일 토큰, 카카오·네이버 식별자 연결     |
| `modules/matching.ts`                | 프로젝트 revision, 지원 revision/snapshot, 지정 견적, 원자적 Match 생성 |
| `modules/trade.ts`                   | 대화, 순번·중복 메시지, 계약 버전과 쌍방 동의, 완료·취소·후기           |
| `modules/profile.ts`, `queries.ts`   | 프로필·대표작, 공개 검색·필터·찜·개인 조회                              |
| `modules/media.ts`, `storage.ts`     | 목적·대상별 업로드, 로컬/S3 어댑터, READY 파일 ACL                      |
| `modules/operations.ts`, `events.ts` | 인증 심사·문의·분쟁·감사·실패 작업, 수신자 SSE                          |
| `worker.ts`                          | Outbox→Job, lease/retry/dedup, 알림·PDF·검사·메일·만료 처리             |
| `migrations/`                        | FK·unique·부분 unique·불변 revision trigger 및 인덱스                   |
| `tests/api.test.ts`                  | 독립 DB와 실제 HTTP 서버를 사용하는 통합 테스트                         |

Nest는 애플리케이션 호스트로 사용하고 도메인은 명시적 함수 모듈로 나눴다. Nest decorator controller/DI provider를 도메인마다 추가한 구조는 아니다. 초기에는 한 API와 한 DB의 모듈형 모놀리스이며 Worker만 별도 프로세스로 분리할 수 있다.

- 프로젝트를 잠그고 최신 버전·소유권·조건 revision을 검사한 후 선정, Match, Workroom, Contract, Outbox를 한 DB 트랜잭션으로 생성한다.
- revision과 지원 대표작 snapshot은 고정된다. 발행 계약의 본문/hash와 SIGNED 상태는 DB trigger로도 보호한다.
- 계약은 `signedVersionId`와 `reviewVersionId`를 별도로 둔다. 변경 계약 검토 중 기존 체결본을 덮지 않는다. 동의는 당사자·버전·hash를 묶는다.
- 완료 요청은 특정 체결본을 참조한다. 취소 협의·분쟁 중에는 계약/완료의 제한된 행동을 차단한다. 취소 후에도 과거 체결본을 보존한다.
- 이벤트 수신자 순번과 `(consumer,eventId)`, `(handler,dedupKey)`로 알림·작업 중복을 방어한다. 이메일 전송은 외부 SMTP 특성상 exactly-once를 보장하지 않는다.
- 공개 응답에 이메일·학번·비공개 계약/채팅을 포함하지 않는다. 학교 인증 만료·박탈은 신규 거래 자격에 반영하지만 기존 당사자의 거래 조회를 제거하지 않는다.

## 파일과 외부 서비스

업로드 순서는 `/uploads` → 반환된 URL로 PUT → `/uploads/:id/complete`(202) → Worker 검사 → `/uploads/:id`에서 READY 확인 → 대상에 연결이다. 이미지 10MB, 일반 파일 20MB, 계정 총량 200MB를 적용한다. 용도와 대상이 다른 첨부 재사용 및 인증 증빙의 공개 연결은 거절한다.

- 격리 객체와 READY 객체 키를 분리하고 완료 시 checksum을 고정한다. 검사 후 이미지 재인코딩으로 메타데이터를 제거한다. PDF와 텍스트도 기본 형식 검증을 한다.
- 개발 scanner는 **실제 백신이 아니다**. 이미지/형식 검증과 EICAR 테스트 문자열 거부를 제공한다. hosted 모드는 clamd를 요구하고 장애 시 READY로 승격하지 않는다.
- 다운로드 발급 시 현재 ACL을 확인한다. 로컬 다운로드는 실제 전송 때도 검사한다. S3 서명 URL은 발급 후 120초간 bearer URL이므로 그 기간 내 즉시 회수되지는 않는다. 버킷은 비공개이며 브라우저 PUT용 CORS를 별도 설정한다.
- 개발 메일은 `.data/mail` JSON에만 저장하며 실제 발송하지 않는다. SMTP 설정 시에만 외부로 전송한다. 메일 Job 토큰은 세션 비밀키로 암호화하고 DB 인증 토큰은 hash로 보관한다.
- 학교 인증은 **증빙 제출→담당자 심사**를 구현했다. 이메일 계정 확인이 학교 인증을 자동 부여하지 않는다. 공식 학교 도메인/소속 정책이 확정되면 별도 학교 메일 인증을 추가한다.
- 카카오·네이버는 공식 OAuth adapter와 일회용 session-bound state를 구현했다. 제공자 앱 등록·redirect URI·실제 자격증명 연동 검증이 필요하다. 이메일 문자열만으로 기존 계정을 합치지 않는다.
- 계약 PDF는 Worker가 체결 본문/hash/양측 동의 기록을 사용해 생성한다. Windows는 맑은 고딕, 컨테이너는 나눔고딕을 사용한다. 다른 환경은 `PDF_FONT_PATH`를 지정한다.

## 배포

```powershell
docker compose config --quiet
docker compose up --build -d
docker compose logs -f api worker
```

Compose는 개발용 PostgreSQL + migration + API + Worker다. DB와 파일을 named volume에 보관한다. 여기의 비밀번호/메일/검사 설정은 로컬 전용이다. Docker daemon이 실행 중이어야 한다.

staging/production은 [.env.hosted.example](.env.hosted.example)을 참고한다. PostgreSQL·S3·SMTP·clamd·HTTPS·폰트 설정이 없으면 시작하지 않는다. API와 Worker가 동일한 secret/DB/storage 설정을 사용해야 한다. 외부 PostgreSQL은 먼저 `node dist/migrate.js`, API는 `node dist/main.js`, Worker는 `node dist/worker-main.js`를 실행한다. 운영 서버는 자동 migration을 수행하지 않는다.

TLS reverse proxy는 `/api/v1/events`의 buffering을 끄고 장시간 연결을 허용해야 한다. 현재 rate limiter는 프로세스 단위이므로 여러 API 인스턴스 운영 시 ingress의 공유 제한을 함께 적용한다. 원본 인증 증빙·계약 보관 및 삭제 기간은 운영 정책 확정 후 적용하고, S3 quarantine lifecycle·백업/PITR·복구 훈련·알림 임계치는 인프라 배포에서 설정해야 한다. DB 테이블이 준비되었다는 readiness가 외부 OAuth/SMTP/S3/clamd 연결 정상까지 보장하지는 않는다.

## 검증 범위와 설계와의 차이

통합 테스트는 PGlite의 PostgreSQL 엔진과 실제 HTTP 요청을 사용한다. DB mocking 테스트가 아니다. 다만 PGlite는 단일 연결에서 직렬화하므로 동시 요청 테스트만으로 외부 PostgreSQL의 다중 연결 lock 경합을 검증했다고 보지 않는다. Docker 구성 문법은 검사했으며 이 환경의 Docker daemon이 꺼져 있어 컨테이너 실행·외부 PostgreSQL 및 S3/SMTP/OAuth/clamd 실연동 검증은 하지 않았다.

번호 설계 문서는 목표 모델이고 실제 DB/요청 계약은 migration과 OpenAPI가 기준이다. 초기 구현 차이는 다음과 같다.

- 프로필의 분야/기술은 배열, 조건/본문은 JSONB로 저장하고 API에서 taxonomy를 검증한다. ERD의 모든 논리 관계를 별도 join table로 만들지는 않았다.
- 포트폴리오는 제목·요약·역할·분야·미디어 및 고정 버전/공개 승인까지만 구현했다. 문서 D-08의 디자인 미확정 편집 블록은 추가하지 않았다.
- OpenAPI는 전체 라우트·요청 검증·권한·멱등 헤더를 포함한다. 응답은 공통 envelope 수준이므로 프론트 타입 자동 생성에 필요한 operation별 상세 response schema는 후속 보완 대상이다. 통합 테스트가 핵심 실제 응답 흐름을 검증한다.
- 공개 탐색은 SQL pagination/filter를 사용한다. 일부 개인·운영 목록과 워크룸 파일은 권한으로 범위를 좁힌 뒤 메모리에서 페이지를 자르므로 대량 데이터 성능 튜닝이 필요하다.
- 현재 API는 결제·정산을 제공하지 않는다. 실제 계정 제재 UI, 운영자 배정 workflow, 영구 보관/파기 정책, 자동 배포 인프라는 별도다. 핵심 회원·거래 프론트는 API에 연결했으며 운영 관리 UI는 인증 심사·문의 답변·신고 처리·작업 재시도·감사 조회를 제공한다.

## 샘플 화면 복원 지원

- Migration 005는 `notification_preferences`를 추가한다. `GET/PUT /me/notification-preferences`는 현재 계정의 메시지·매칭 알림 설정만 조회/변경한다. Worker는 선택 알림만 생략하고 SSE 이벤트와 필수 알림은 유지한다.
- 지원서 조회는 지원자 공개 요약과 권한 확인된 첨부 목록을 제공한다. 전문가 카드 이미지는 실제 공개 대표 작업물에서 가져온다.
- 대화 목록은 프로젝트 제목·워크룸 연결을, 메시지 조회는 첨부 ID를 반환한다. 기존 당사자 권한 검사를 유지한다.

## 출시 화면 연동 변경

- Migration 004는 후기의 홈 노출 선택 동의를 추가하며 기본값은 false다. 공개 완료 거래·활성 계정·공개 후기·홈 노출 동의 조건을 만족하는 거래가 3건 이상일 때만 홈 후기 목록을 반환한다. 개인 프로필의 평점·후기 집계와 홈 큐레이션 조건은 구분한다.
- `GET /public-config`는 공개 정책 URL/버전과 설정된 OAuth 공급자만 반환한다. hosted 신규 가입에는 `TERMS_URL`, `PRIVACY_URL`의 HTTPS 주소와 `TERMS_VERSION`, `PRIVACY_VERSION`이 필요하다. 비밀키는 반환하지 않는다.
- `GET /projects/:id/my-review`, `PATCH /me/reviews/:id`로 본인 후기 확인과 공개 철회를 제공한다. 프로필을 PUBLIC으로 설정할 때 소개와 활동 분야를 검증한다.
- 세션 인증 상태는 만료 시간을 즉시 반영한다. 세션/CSRF 조회는 일반 요청 제한을 사용하고 로그인·가입 등 민감 인증 요청은 별도 60회/분 제한을 유지한다.
- 메일 Worker에 실제 프론트의 비밀번호 재설정·이메일 확인 링크를 포함한다. 개발 메일은 파일이며 실제 발송은 하지 않는다.
- `tests/serve-release.ts`는 브라우저 테스트 전용 메모리 DB 서버다. 운영 진입점에서 실행하지 않으며 별도 환경 플래그가 필요하다.

기술 참고: [NestJS](https://docs.nestjs.com/), [node-postgres 트랜잭션](https://node-postgres.com/features/transactions), [PGlite](https://pglite.dev/docs/), [카카오 REST API](https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api), [네이버 로그인 API](https://developers.naver.com/docs/login/api/api.md).
