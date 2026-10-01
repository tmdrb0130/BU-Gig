# 백석대학교 긱창업 프론트엔드

`docs`의 2026-09-30 기능 명세·디자인 가이드와 `frontend/sample` 시안을 바탕으로 구현한 React 프론트엔드입니다. `frontend/image/baekseok_gig_assets_20260930/webp`의 제공 이미지를 사용합니다.

## 백엔드 실행

설계 문서를 기반으로 NestJS·TypeScript·PostgreSQL API와 Worker를 구현했습니다. [백엔드 README](backend/README.md)에 실행·테스트·배포 방법과 검증 범위를 정리했습니다. 현재 프론트엔드는 localStorage 데모를 유지하며 서버 API 연결은 별도 작업입니다.

```sh
cd backend
npm ci
npm run dev
```

## 프론트엔드 실행

```sh
cd frontend
npm install
npm run dev
```

기본 주소는 `http://127.0.0.1:5173`입니다.

```sh
npm run build
npm run preview
npm test
npm run test:e2e
```

E2E 테스트는 설치된 Microsoft Edge를 사용합니다. 다른 환경에서는 `frontend/playwright.config.js`의 `channel`을 변경하거나 Playwright Chromium을 설치하고 해당 옵션을 제거합니다.

## 구현 화면

| 경로                     | 화면 / 동작                                            |
| ------------------------ | ------------------------------------------------------ |
| `/`                      | 홈, 카테고리, 작업물, 전문가, 신규 의뢰, 예시 후기     |
| `/search`                | 프로젝트·전문가·작업물 통합 검색                       |
| `/projects`              | 프로젝트 검색, 필터, 정렬, 찜                          |
| `/projects/:id`          | 텍스트·조건 중심 상세, 본인 의뢰 모집 마감             |
| `/projects/:id/apply`    | 견적 제안, 기존 대표작 최대 3개 선택                   |
| `/experts`               | 전문가 검색, 분야·기술·평점·활동 조건 필터             |
| `/experts/:id`           | 공개 프로필, 대표작, 소개, 경력·기술, 예시 후기        |
| `/works` / `/works/:id`  | 이미지 중심 작업물 탐색 및 상세                        |
| `/request/new`           | 4단계 의뢰 작성, 자동 임시저장, 검증, 미리보기, 등록   |
| `/request/new?expert=e1` | 특정 전문가에게 지정 요청 작성                         |
| `/my`                    | 내 의뢰, 내 지원, 보낸 지정 요청                       |
| `/saved`                 | 저장한 프로젝트·전문가·작업물                          |
| `/workroom`              | 예시 프로젝트 개요, 로컬 채팅, 내 계약 동의, 파일 보관 |
| `/guide`                 | 이용 흐름과 FAQ                                        |

모바일 하단 내비게이션, 필터 시트, 데스크톱 호버/클릭 메가 메뉴, 빈 결과, 토스트, 확인 대화상자와 키보드 접근을 지원합니다. 검색·필터·정렬·페이지는 URL에 유지됩니다.

## 데이터와 범위

상세 문서와 백엔드 준비 명세는 [docs 인덱스](docs/README.md), 로그인 시안 및 공식 카카오·네이버 버튼 출처는 [소셜 로그인 적용 기록](docs/소셜로그인_디자인_연동.md)을 참고하세요. 소셜 인증은 UI만 있고 실제 연동은 준비 중입니다. 데모의 ‘로그인 상태 유지’를 선택하면 이 브라우저에서 7일간 계정 ID를 기억합니다.

- `/login`, `/signup`, `/password-reset`: 브라우저 한정 데모 회원가입·로그인·로그아웃과 재설정 미연결 안내입니다. 이름·이메일·솔트·PBKDF2 파생 해시는 `bu-gig:demo-accounts` localStorage, 로그인 계정 ID는 `bu-gig:demo-session` sessionStorage에 저장됩니다. 원문 비밀번호는 저장하지 않습니다. 실제 개인정보/재사용 비밀번호를 입력하지 마세요. 이 저장소는 변조 가능하며 서버 인증이나 접근 통제를 제공하지 않습니다.
- 가입 시 학교 인증은 부여하지 않습니다. 이메일 발송/본인 확인/비밀번호 재설정은 구현되지 않았습니다. 프로젝트·찜 등 기존 시연 데이터는 계정별 분리 없이 공유됩니다. 실제 운영에는 서버 계정 저장소·세션·권한 검사·정식 약관 및 개인정보 처리방침이 필요합니다.

- API 없이 실행되는 프론트엔드 데모입니다. 로그인·학교 인증·관리자 권한·실시간 메시지·서버 업로드·양측 계약 체결·완료 승인 기능은 연결되어 있지 않습니다.
- 프로젝트, 찜, 제안, 지정 요청, 워크룸 메시지·파일 등은 `bu-gig:*` 키로 현재 브라우저의 `localStorage`에 저장됩니다. 다른 사용자나 기기로 전송되지 않습니다.
- 워크룸은 별도의 예시 프로젝트입니다. 실제 지원자 선정에 따라 자동 생성되는 워크룸은 서버 연동 범위입니다. 계약은 내 동의만 기록하며 상대방 동의를 자동으로 처리하지 않습니다.
- 워크룸 파일은 파일당 2MB, 전체 3MB로 제한됩니다. 의뢰 작성에는 선택적 참고 URL을 지원하며 실제 첨부 업로드는 서버 연동 시 추가해야 합니다.
- 의뢰 등록과 지원은 데모 계정으로 동작합니다. 지원 시 선택하는 포트폴리오, 인물, 인증 배지, 프로젝트, 후기는 시연용 데이터입니다.
- 제공 이미지는 에셋 팩 설명에 명시된 프로토타입용 크롭입니다. 운영용 이미지 교체 시 `frontend/src/data.js`의 매핑을 활용할 수 있습니다.
- 웹 폰트는 Google Fonts의 Noto Sans KR을 사용하며, 로딩할 수 없으면 시스템 폰트로 표시됩니다.
- 배포 서버는 `/projects/...` 등의 직접 접속을 위해 SPA fallback을 `index.html`로 설정해야 합니다.

## 구조

- `frontend/`: React 소스, 이미지·시안, 테스트, npm 및 Vite 설정
- `backend/`: NestJS·TypeScript·PostgreSQL API, Worker, 마이그레이션 및 통합 테스트 ([실행 안내](backend/README.md))
- `docs/`: 공통 기능 명세, 디자인 가이드 및 API 설계


```text
frontend/src/
  App.jsx          라우팅 및 공통 레이아웃
  components.jsx   헤더, 카드, 필터, 검색, 푸터, 모달
  pages.jsx        홈, 탐색, 상세, 마이페이지, 이용안내
  forms.jsx        의뢰 등록 및 지원서
  Workroom.jsx     예시 워크룸
  store.jsx        공통 상태와 브라우저 저장
  data.js          데모 데이터와 이미지 매핑
  lib.js           필터, 정렬, 날짜 및 금액 처리
  styles.css       디자인 시스템과 반응형 스타일
frontend/tests/
  filter.test.js   검색·필터·정렬·금액·마감 단위 테스트
  e2e/             주요 사용자 흐름과 반응형 브라우저 테스트
```

공통 문서는 `docs/`, 원본 시안과 이미지 에셋은 `frontend/sample/`, `frontend/image/`에 있습니다.
