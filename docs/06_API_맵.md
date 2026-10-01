# 06. API 맵

기준일: 2026-10-01 · 상태: **기능별 API 계약 제안, OpenAPI 및 서버 미구현**

이 문서는 현재 프론트 기능과 목표 서버 operation을 연결한다. 데이터는 [03](03_ERD.md), 전이는 [04](04_도메인_상태도.md), 객체 권한은 [07](07_권한_매트릭스.md)이 기준이다. 표의 묶음 경로는 각각 별도 operation이며 OpenAPI 작성 시 풀어 쓴다.

## 1. 공통 계약

- 접두어 `/api/v1`. JSON 필드는 camelCase, DB는 snake_case. ID는 불투명 문자열이다.
- 단건 `{data, meta:{requestId}}`, 페이지 `{data:[],meta:{page,pageSize,total,requestId}}`, cursor 목록은 `nextCursor`, `hasMore`를 사용한다.
- 오류 `{error:{code,message,fieldErrors:[{field,message}],requestId}}`. 204는 본문이 없다.
- 400 형식/미지원 필터, 401 미로그인, 403 인증·행동 권한 부족, 404 없거나 노출 불가, 409 버전·상태·중복, 413 크기, 422 입력값, 429 제한, 503 장애.
- 상태 변경은 세션·CSRF·Origin 검증. 사용자·owner·수신자 역할·인증·집계를 클라이언트 지정으로 신뢰하지 않는다.
- 생성·제출·선정·수락·발행·동의·완료·취소 결정 POST에는 `Idempotency-Key`를 요구한다. auth, 읽기 전용 batch는 별도 계약이며 멱등 키 대상이 아니다. PUT/DELETE는 동일 최종 효과로 설계한다.
- 변경 명령은 대상 aggregate의 `expectedVersion`을 요구한다. 생성에는 없다. 메시지는 `clientMessageId`, 읽음은 단조 순번으로 중복을 처리한다.
- 멱등 범위는 사용자+메서드+정규 경로+키, body hash 비교, 초기 보관 24시간 제안. 같은 키 다른 body는 409. 응답 재생 전 현재 접근 권한도 확인한다.
- 공개 API는 개인 상태를 포함하지 않는다. 내 정보·viewer-state·거래 응답은 `Cache-Control: no-store`.
- 목록 기본 20/최대 50 제안. 현재 탐색 UI는 `pageSize=6`을 보낸다. 메시지·알림·파일은 cursor를 사용한다.

## 2. 화면 → API → 주요 응답

| 현재/목표 화면 | 조회·행동 API | 필요한 데이터 |
| --- | --- | --- |
| 홈 `/` | GET `/home` | 공개 작업물·전문가·최신 의뢰·공개 후기 preview, 추천 키워드 |
| `/projects`, `/experts`, `/works` | GET `/projects`, `/experts`, `/portfolios` | 카드 DTO, total, 정렬·페이지 |
| `/search` | GET `/search?type=...` | 선택 종류의 페이지; type 생략은 종류별 preview/count |
| 분야 패널 | GET `/categories`, GET 각 목록의 `countOnly=true` | 그룹 포함 taxonomy, 적용 전 조건의 total |
| 프로젝트 상세 | GET `/projects/:id`, POST `/me/viewer-state` | 상세 조건·작성자·지원자 수 / 내 지원·찜·allowedActions |
| 전문가 상세 | GET `/experts/:id`, `/experts/:id/portfolios`, `/experts/:id/reviews` | 소개·경력·서비스·대표작 / 작업물 페이지 / 후기 페이지 |
| 작업물 상세 | GET `/portfolios/:id`, `/portfolios/:id/reviews` | 공개 버전·작성자·미디어·검증 배지 / 승인된 거래 관련 후기 |
| `/request/new` | POST `/projects`, PATCH `/projects/:id`, POST `/projects/:id/publish` | DRAFT id/version → 게시 상태 |
| `/request/new?expert=:id` | GET `/experts/:id`, POST `/direct-requests` | 수신자 확인, 요청 id·latestTermsId |
| `/projects/:id/apply` | GET `/me/portfolios`, POST `/projects/:id/proposals` | 본인 선택 가능 버전 / 지원 결과 |
| `/my` | GET `/me/dashboard`, `/me/projects`, `/me/proposals`, `/me/direct-requests`, `/me/workrooms` | 서버 total·내 상태·대상 요약·다음 행동 |
| `/saved` | GET `/me/favorites`, PUT/DELETE `/me/favorites/:type/:id` | 유형별 카드 요약, 제거된 대상 제외 |
| 새 `/workrooms/:id` | GET `/workrooms/:id` 및 아래 협업 API | 실제 방별 개요·채팅·계약·파일·완료 |
| 헤더 알림 | GET `/me/notifications`, PUT 읽음, GET `/events` | 수신자별 unreadCount·목록·변경 이벤트 |

`/home`은 초기 고정 편집 기준 또는 공개 목록의 최신순 조합을 사용한다는 제안이다. 실제 인기 검색 집계 전 키워드는 “추천 검색어”로 표시한다. 현재 `/workroom`은 데모로 분리하거나 내 방 목록으로 안내한다.

## 3. 조회 DTO 최소 필드

| DTO | 필수 데이터 및 의미 |
| --- | --- |
| UserSummary | userId, profileId?, displayName, avatarUrl?, schoolVerified; 이메일·학번 없음 |
| ProjectCard | id,title,summary,field,skills,budgetType,budgetMin,budgetMax,days,mode,closesAt,status,createdAt,owner:UserSummary,applicantCount |
| ProjectDetail | ProjectCard + content,deliverables,requirements,referenceUrl,attachments,currentRevisionId,version |
| ExpertCard | id=profileId,userId,displayName,headline,bioExcerpt,fields,skills,coverUrl,avatarUrl,schoolVerified,availability,providerCompletedCount,rating,reviewCount,responseHours:null |
| ExpertDetail | ExpertCard + bio,careers,services,featuredPortfolios 최대 3개; 작업물·후기는 별도 페이지 |
| PortfolioCard | id,title,summary,field,skills,coverUrl,author:UserSummary,publishedVersionId,verifiedWork,favoriteCount,viewCount:null,publishedAt |
| PortfolioDetail | PortfolioCard + role,content,media,approvedProjectSummary?; 승인된 공개 정보만 |
| ViewerState | targetType,targetId,isSaved,isOwner,myProposal:{id,status,revisionId} 또는 null,allowedActions,denialReasons |
| WorkroomDetail | id,projectSummary,participants,conversationId,contractId,signedVersion,reviewVersion,activeCompletionRequest,activeCancellationRequest,recentMessages,recentFiles,version,allowedActions |
| FileItem | mediaId,name,mime,size,uploadedBy,createdAt,state; 영구 공개 원본 URL 없음 |

POST `/me/viewer-state`는 `{targets:[{type,id}]}` 최대 50개를 받아 개인 상태를 일괄 조회하는 읽기 전용 API다. 존재/접근 가능한 대상만 반환하며 내 비공개 응답이다. 카드마다 전체 seed에서 작성자를 찾거나 N개의 개인 API를 호출하지 않는다.

공개 작업물 작성자가 프로필을 비공개로 바꾸면 허용된 최소 작성자 요약과 `profileId:null`을 반환하는 제안이다. 거래 자료 보존과 공개 프로필 연결을 구분한다. 전문가 생성·노출은 공개 프로필 준비 이후이며 회원가입만으로 전문가 카드가 만들어지지 않는다.

## 4. 인증·프로필·포트폴리오

| 메서드 | 경로 | 권한 / 계약 |
| --- | --- | --- |
| GET | `/auth/csrf` | 비회원 포함, 사전 세션에 연결한 CSRF token; no-store |
| POST | `/auth/signup` | email,password,displayName,consents → 가입 접수; 학교 인증 없음 |
| POST | `/auth/login` | email,password,remember → 쿠키·내 계정 요약·새 csrfToken |
| GET | `/auth/session` | ME → user,verification,permissions,csrfToken; 미로그인 401 |
| POST | `/auth/logout` | 현재 세션 폐기, 204 |
| POST | `/auth/email-verifications`, `/auth/email-verifications/confirm` | 발송 / token 일회용 확인 |
| POST | `/auth/password-resets`, `/auth/password-resets/confirm` | 일반화 응답 / token,newPassword, 성공 시 세션 폐기 |
| GET | `/auth/oauth/:provider/start`, `/auth/oauth/:provider/callback` | start에서 일회용 state, callback 검증 후 자체 세션. OAuth 프로토콜 경로는 일반 GET 불변 규칙의 명시적 예외 |
| GET | `/me/identities` | 본인 연결된 제공자 요약 |
| POST | `/me/identities/:provider/link` | 재인증 후 연결용 일회성 인증 흐름 시작 |
| DELETE | `/me/identities/:provider` | 재인증, 마지막 로그인 수단 제거 금지 |
| GET/PATCH/DELETE | `/me` | 내 계정 / 허용 필드 / 재인증 탈퇴 접수 |
| GET/POST | `/me/school-verifications` | 본인 상태·이력 / 인증 신청, 심사는 STAFF |
| GET/PATCH | `/me/profile` | 본인 프로필·expectedVersion; 아바타는 READY mediaId |
| GET/POST | `/me/careers`, `/me/services` | 본인 목록·생성 |
| PATCH/DELETE | `/me/careers/:id`, `/me/services/:id` | 본인 항목 변경 |
| GET | `/categories`, `/skills?q=&fieldId=` | 활성 사전·별칭·추천, taxonomyVersion 포함 |
| GET | `/me/portfolios` | 본인 draft/private/public, 선택 가능한 version과 공유 조건 |
| POST | `/portfolios` | 본인 초안 생성; content schema는 D-08 디자인 대기 |
| PATCH | `/portfolios/:id` | OWNER, 새 콘텐츠 버전 생성, expectedVersion |
| POST | `/portfolios/:id/publish`, `/portfolios/:id/unpublish` | OWNER, 공개 버전 포인터 변경·미디어 검증 |
| PUT | `/me/featured-portfolios` | 본인 공개 작업 최대 3개와 순서, expectedVersion |

OAuth 제공자별 파라미터와 지원 방식은 구현 시 공식 문서로 재확인한다. 이메일 문자열 일치 자동 병합은 하지 않는다. 학교 인증과 소셜 인증은 독립적이다.

## 5. 의뢰·지원·지정 요청

| 메서드 | 경로 | 권한 / 요청·결과 |
| --- | --- | --- |
| GET | `/projects`, `/projects/:id` | 공개 게시물 / DRAFT는 OWNER, DIRECT_ONLY는 당사자 |
| POST | `/projects` | ME, 부분 입력 DRAFT 생성, id/version |
| PATCH | `/projects/:id` | OWNER, 부분 저장·expectedVersion. 게시 후 핵심 변경은 revision |
| POST | `/projects/:id/publish`, `/close`, `/cancel` | OWNER. cancel은 선정 전만 허용 |
| GET | `/me/projects?status=DRAFT` | 초안 복구·전체 내 의뢰는 status 생략 |
| POST | `/projects/:id/proposals` | 인증 ME, content,amount,days,portfolioVersionIds,explicitShareIds,mediaIds |
| GET | `/projects/:id/proposals` | OWNER, 지원자 프로필·통계·최신 revision 목록 |
| GET/PATCH | `/proposals/:id` | 당사자 조회 / 작성자 수정, 새 revision·expectedVersion |
| POST | `/proposals/:id/withdraw`, `/proposals/:id/reject` | 작성자 철회 / 의뢰자 거절 |
| POST | `/projects/:id/selection` | OWNER, proposalId,proposalRevisionId,expectedVersion,acknowledgedProjectRevisionId → matchId/workroomId |
| POST | `/direct-requests` | 인증 ME, recipientId=userId,terms,expiresAt,mediaIds → ORIGINAL terms |
| GET | `/direct-requests/:id`, `/direct-requests/:id/quotes` | 발신/수신자, 요청 상세·전체 조건 이력 |
| GET | `/me/direct-requests?direction=sent` 또는 `received` | 본인 목록·latestTerms 요약 |
| POST | `/direct-requests/:id/quotes` | 원래 수신자, terms,mediaIds,expectedVersion |
| POST | `/direct-requests/:id/accept` | ORIGINAL은 수신자 / QUOTE는 원래 발신자, termsId,expectedVersion |
| POST | `/direct-requests/:id/reject`, `/direct-requests/:id/cancel` | 원래 수신자 / 원래 발신자, PENDING만 |
| GET | `/me/proposals`, `/me/workrooms`, `/me/dashboard` | 계정별 목록·요약 |

존재하지 않는 expertId는 404/수신 불가로 표시하고 공개 의뢰로 전환하지 않는다. Project 초안은 서버 저장, 지정 요청·지원서 초안은 초기 계정+대상별 로컬 저장 제안이다. 거래 제출 후 로컬 초안을 제거하고 계정 변경 시 다른 사용자의 초안을 읽지 않는다. 서버 초안 동기화는 별도 후속 범위다.

자동 저장은 debounce·한 리소스당 직렬 쓰기·expectedVersion을 사용한다. 저장 중 추가 편집은 다음 저장에 반영하며 409에서 최신 내용을 무조건 덮지 않는다. 최종 publish/submit은 모든 단계 필드를 재검증한다. 초기 입력 상한은 기존 UI에 맞춰 제목 80, 요약 160, 메시지 3,000 UTF-16 code unit 제안으로 기존 100/200/4,000 초안을 대체하며 OpenAPI 확정 때 클라이언트·서버를 함께 맞춘다.

## 6. 워크룸·계약·완료·취소

| 메서드 | 경로 | 권한 / 동작 |
| --- | --- | --- |
| GET | `/workrooms/:id` | MEMBER, 개요 DTO |
| POST/GET | `/conversations` | context 기반 생성 / 본인 대화 목록; 임의 사용자 DM 금지 |
| GET/POST | `/conversations/:id/messages` | MEMBER, cursor / text,clientMessageId,mediaIds |
| PUT | `/conversations/:id/read` | MEMBER, lastReadSequence 단조 증가 |
| GET | `/events` | 본인 SSE, 유한 replay와 권한 재검사 |
| GET | `/workrooms/:id/files` | MEMBER, cursor 기반 전체 공유 파일 |
| POST | `/workrooms/:id/files` | MEMBER, READY mediaId를 방에 독립 연결; 메시지 없이 가능 |
| GET | `/contracts/:id` | MEMBER, signed/review 본문·동의·이력·version |
| POST | `/workrooms/:id/contracts/versions` | MEMBER, body,baseSignedVersionId,expectedVersion → 새 DRAFT |
| POST | `/contract-versions/:id/publish`, `/contract-versions/:id/withdraw` | 버전 작성 당사자, 현재 검토본만 |
| POST | `/contract-versions/:id/acceptances` | MEMBER, contentHash,expectedVersion(Contract), 명시적 동의 |
| GET | `/contract-versions/:id/document` | MEMBER, 생성 상태; READY면 짧은 다운로드 URL |
| POST | `/workrooms/:id/completion-requests` | 수행자, signedVersionId,note,mediaIds,expectedVersion(Project) |
| GET | `/completion-requests/:id` | MEMBER, 기준 계약·요청·첨부·version |
| POST | `/completion-requests/:id/approve`, `/request-changes` | 의뢰자, expectedVersion(요청), 보완은 reason 필수 |
| POST | `/completion-requests/:id/cancel` | 요청 수행자, PENDING 철회 |
| POST | `/projects/:id/cancellation-requests` | MEMBER, 매칭 이후 reason,expectedVersion(Project) |
| GET | `/cancellation-requests/:id` | MEMBER, 합의 상태 |
| POST | `/cancellation-requests/:id/approve`, `/reject`, `/withdraw` | 상대 승인·거절 / 요청자 철회, expectedVersion(요청) |
| POST | `/projects/:id/reviews` | 완료 당사자, rating/body; subject와 역할은 서버 결정 |
| GET | `/me/reviews?direction=received` 또는 `written` | 본인 받은/작성한 후기 |
| POST | `/portfolios/:id/publication-requests` | 완료 수행자, projectId,portfolioVersionId |
| GET | `/me/publication-requests`, `/publication-requests/:id` | 관련 당사자 목록·상세 |
| POST | `/publication-requests/:id/approve`, `/reject`, `/cancel` | 의뢰자 결정 / 수행자 요청 취소, expectedVersion |

## 7. 파일·알림·운영

| 메서드 | 경로 | 권한 / 동작 |
| --- | --- | --- |
| POST | `/uploads` | ME+목적별 권한, filename,size,mime,purpose,target → uploadId,mediaId,url,expiresAt |
| POST | `/uploads/:id/complete` | 업로더, 실제 객체 검증 후 SCANNING, 202 |
| GET | `/uploads/:id` | 업로더, 발급·검사 상태·거절 사유 |
| GET | `/media/:id/download` | 해당 연결 대상 열람자, READY 검사 후 짧은 URL |
| GET | `/me/notifications` | cursor 목록과 전체 unreadCount |
| PUT | `/me/notifications/:id/read` | 본인 수신 알림 읽음 |
| POST/GET | `/me/tickets`, `/me/reports` | 본인 문의·신고 생성/목록 |
| GET | `/me/tickets/:id`, `/me/reports/:id` | 본인 상세, 문의 답변 이력 |
| POST | `/me/tickets/:id/replies` | 본인 추가 답변 |
| GET/PATCH | `/admin/verifications/:id`, `/admin/reports/:id` | 범위별 STAFF, 심사·처리 사유·expectedVersion |
| GET | `/admin/verifications`, `/admin/reports`, `/admin/tickets` | 담당 범위 목록 |
| GET/POST | `/admin/tickets/:id/replies` | 담당 STAFF 조회/답변 |
| POST | `/admin/projects/:id/cancel` | 분쟁 담당 STAFF, 강제 처리 사유·감사·expectedVersion |
| GET | `/admin/audit-logs` | 감사 전용 STAFF, 마스킹·조회 기록 |
| GET | `/admin/jobs` | 운영 STAFF, 실패 작업과 최소 오류 정보 |
| POST | `/admin/jobs/:id/retry` | 운영 STAFF, 사유 기록·동일 dedup_key 재처리 |

상세 관리자 회원 제재·콘텐츠 숨김은 범위별 operation을 별도 OpenAPI로 확정한다. 범용 테이블 CRUD 권한은 제공하지 않는다.

## 8. URL·검색 의미

| 현재 URL | 서버 쿼리 / 의미 |
| --- | --- |
| `field=[분야명,세부분야명]`, 이전 category/service | taxonomy ID로 변환 → 반복 categoryId/fieldId; 분야 안 OR |
| `skill=React` | 별칭 해석 → skillId; 반복 기술은 OR, 분야와 AND |
| `budget=10만원 이하/10~30만원/30만원 이상` | budgetMax=100000 / min=100000,max=300000 / min=300000 |
| `budgetMin`, `budgetMax` | 구간 겹침, 경계 포함, 한쪽 가능, NEGOTIABLE 제외 |
| `days=7` | daysMax=7; 후속 직접 범위는 daysMin/daysMax |
| `mode=온라인/오프라인/혼합` | ONLINE/OFFLINE/HYBRID |
| `rating=4.5`, `completed=10`, `available=1` | ratingMin=4.5,completedMin=10,available=true; 전문가 전용 |
| `verified=1` | 프로젝트/전문가는 schoolVerified=true, 작업물은 verifiedWork=true |
| `urgent=1` | urgent=true, OPEN이고 now < closesAt <= now+72h |
| `/search?tab=works` | `/search?type=portfolios` |

q는 프로젝트 제목·요약·본문·분야·기술, 전문가 활동명·소개·전문분야·기술, 작업물 제목·요약·분야·기술에서 부분 검색하는 초기안이다. 원본 계약·채팅·증빙·비공개 버전은 검색하지 않는다. 빈 q는 전체, 잘못된/폐기 분야 ID는 400과 수정 안내다.

정렬은 프로젝트 newest/deadline/budget, 전문가 reviews/rating/completed, 작업물 newest/popular다. 전문가 기본값은 reviews를 제안하며 현재 “추천순” 문구를 “리뷰 많은순”으로 맞춘다. 프로젝트 budget은 최소 금액 내림차순·협의 마지막, deadline은 모집 중 우선·마감 시각 오름차순이다. 작업물 popular는 찜 수 내림차순, 최신순은 publishedAt이다. 동률은 createdAt/publishedAt와 id로 안정 정렬한다.

전문가 평균은 수행자 역할의 공개 후기만 계산하며 미존재는 null, 평점 필터에서 제외한다. completedMin도 수행자 완료 수, schoolVerified는 서버에서 유효한 true만 통과한다. 프로젝트 학교 인증은 의뢰자 기준이다. 같은 필터를 목록·count·통합 검색에 재사용한다.

분야 패널 초안 조회는 debounce·취소/응답 순서 검사, 적용 버튼에서만 URL을 변경한다. 로컬 최근 본 항목은 type+id만 저장하고 현재 공개 요약을 재조회한다. 삭제·비공개 항목은 제외한다.

## 9. OpenAPI 작성 전 확인

각 operation에 권한·request/response schema·nullable·enum·필드 길이·오류 예·멱등 적용·버전 대상을 기재한다. ID 타입과 profileId/userId를 혼용하지 않는다. 프론트 adapter와 consumer contract로 기존 한글 예산/진행 방식 및 날짜를 변환한다. 문서 API 표만으로 구현 완료를 판단하지 않는다.

다음: [07 권한 매트릭스](07_권한_매트릭스.md) · [문서 인덱스](README.md)
