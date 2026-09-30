# 데이터 모델·API·상태 계약

기준일: 2026-09-30 · 상태: **백엔드 구현 전 검토용 초안**

이 문서는 데이터 관계와 불변 조건을 제안한다. 현재 코드의 문자열 상태·고정 `me` ID·로컬 저장 형식을 그대로 서버 스키마로 옮기지 않는다. 운영 정책 미결정 항목은 [개발·검증 계획](개발_검증_계획.md)에서 승인한다.

## 1. 공통 데이터 규칙

- 기본키: 불투명 UUID 제안. 사용자에게 의미 있는 별칭과 분리. 모든 FK에 관계와 삭제 정책 명시.
- 시간: API는 UTC RFC3339, 화면은 Asia/Seoul 표시. date-only는 `YYYY-MM-DD`. 모집 마감 날짜를 받으면 서버가 서울 기준 다음 날 00:00을 배타적 마감 시각으로 변환한다.
- 마감 판정: `now < closesAt`일 때만 지원 가능. 마감 Job 지연과 관계없이 API에서 검사. D-day 숫자만으로 지원 가능 여부를 판단하지 않는다.
- 금액: KRW 원 단위 정수, 소수·음수 불가. 운영 입력 상한은 정책 설정으로 관리하고 JSON 안전 정수 범위 이내로 제한.
- 금액 유형: `FIXED(min=max)`, `RANGE(0<min<=max)`, `NEGOTIABLE(min=max=null)`. 검색의 0원 경계 허용과 실제 의뢰 금액의 양수 조건은 다르다.
- 기간: 양의 정수 일수(초기안 1~365). 기간 검색은 0/음수·역전 범위 거절.
- 수정 충돌: 변경 가능한 핵심 리소스에 `version` 정수. 쓰기는 `expectedVersion`, 불일치 시 409와 새로고침 안내.
- 공개 DTO는 명시적 필드 허용 목록으로 구성. 계정 모델을 통째로 serialize하지 않는다.
- 작성 길이 제안: 제목 100자, 요약 200자, 소개 2,000자, 본문/제안 10,000자, 메시지 4,000자. 클라이언트·API·DB 제한을 일치시키고 이모지 포함 길이 기준을 schema에 명시.

## 2. 관계 개요

```text
User ── Profile ── Portfolio ── PortfolioVersion ── Media
 │         ├─ ProfileSkill / ProfileField
 │         ├─ Career
 │         └─ OfferedService
 ├─ SchoolVerification / Session / Consent
 ├─ Project (owner) ── Proposal (applicant) ── ProposalPortfolioSnapshot
 │        └─ Match (수행자 1명) ── Workroom ── Contract ── ContractVersion
 │                                  │                       └─ Acceptance
 │                                  ├─ Conversation ── Message
 │                                  └─ CompletionRequest ── Review
 ├─ DirectRequest (sender / recipient) ── Match / Project
 ├─ ConversationMember / Notification / Favorite
 └─ Report / SupportTicket

Category ── ServiceField ── FieldSkill ── Skill ── SkillAlias
OutboxEvent / Job / AuditLog는 위 변경을 추적·전달
```

하나의 프로젝트는 MVP에서 수행자 1명만 선정한다는 제안이다. 여러 수행자를 동시에 고용하는 기능은 별도 확장으로 분리한다.

## 3. 테이블 및 제약 초안

| 엔터티 | 핵심 필드 | 제약 / 비공개 범위 |
| --- | --- | --- |
| users | id, normalized_email, password_hash, status, email_verified_at | 이메일 unique, 상태 ACTIVE/SUSPENDED/WITHDRAWN. 공개 DTO에서 이메일 제외 |
| sessions / auth_tokens | user_id, token_hash, expires_at, revoked_at, purpose | 원문 토큰 저장 금지, 만료·일회용 사용 원자 처리 |
| consents | user_id, document_type, document_version, agreed_at, withdrawn_at | 필수/선택 구분, 당시 문서 버전 참조 |
| school_verifications | user_id, method, affiliation_type, state, expires_at, evidence_media_id | 인증 이력 보존, 현재 유효 승인은 사용자당 1개, 증빙 접근 제한 |
| profiles | user_id, display_name, headline, bio, availability, visibility | 계정당 1개. 공개 여부와 학교 인증 별도 |
| categories / service_fields | id, label, parent_category_id, enabled, sort_order | 서비스는 대분류 FK. 화면 그룹 제목과 검색 가능한 leaf를 구분 |
| skills / skill_aliases / field_skills | id, normalized_label, alias, field_id | React/react 같은 별칭은 표준 ID로 매핑. 분야와 기술은 N:M |
| profile_fields / profile_skills | profile_id, field_id / skill_id | 복합 unique. 다분야 활동 지원 |
| careers / offered_services | profile_id, title, description, dates, category/skills | 소유자 편집, 서비스 카드 최대치는 승인 후 설정 |
| portfolios / portfolio_versions | owner_id, visibility, current_version, title, role, summary, field_id, content | 등록/수정 화면 디자인 대기. content JSON 블록 스키마는 시안 이후 확정 |
| portfolio_media / featured_portfolios | portfolio_version_id, media_id, order / profile_id, portfolio_id, order | 대표작 최대 3개, 본인 소유·공개 작업만 프로필에 노출 |
| projects / project_revisions | owner_id, visibility, status, budget_type/min/max, closes_at, days, mode, version | PUBLIC/DIRECT_ONLY, 공개 초안 구분. 과거 조건 스냅샷 보존 |
| project_fields / project_skills | project_id, field_id / skill_id | 등록은 현재 대표 세부분야 1개 기준, 탐색 다중 조건과 혼동 금지 |
| proposals | project_id, applicant_id, status, quote, days, content, project_revision_id, version | project+applicant unique, 본인 지원 금지. 재지원은 동일 행 이력 정책 |
| proposal_portfolio_snapshots | proposal_id, portfolio_version_id, snapshot_metadata | 최대 3개, 제출 시 소유권·열람 허용 검사. 비공개 작업은 해당 의뢰자에게만 명시적 공유 |
| direct_requests | sender_id, recipient_id, status, expires_at, terms_snapshot, quote_version, final_quote_id | 자기 요청 금지. 수신자 견적 변경은 별도 quote 이력 |
| matches | project_id, provider_id, proposal_id 또는 direct_request_id | project_id unique, 출처는 정확히 하나만 존재 |
| workrooms | project_id, match_id, status | project_id 및 match_id unique, 선정 트랜잭션에서 생성 |
| conversations / members | context_type/id, owner/provider IDs / conversation_id, user_id, last_read_sequence | 프로젝트+지원자 또는 지정 요청별 유일 대화. 멤버 복합 unique |
| messages | conversation_id, sender_id, client_message_id, sequence, kind, text, created_at | conversation+sequence 및 conversation+sender+client ID unique |
| contracts / contract_versions | workroom_id, current_version_id / sequence, body, content_hash, status | 워크룸당 계약 1개, 버전 내용은 발행 후 불변 |
| contract_acceptances | version_id, user_id, content_hash, accepted_at | version+user unique. 해당 버전 당사자만 동의 |
| completion_requests | project_id, requester_id, state, note, media_refs, version | 활성 요청 1개. 제출/승인/보완 요청 이력 보존 |
| reviews | project_id, author_id, subject_id, rating, body, visibility | project+author unique, 양측만 작성, rating 1~5 정수 |
| publication_approvals | project_id, portfolio_version_id, requester_id, state, decided_by | 승인 대상 버전 고정. 작업 내용 변경 시 재승인 |
| media_objects / media_links | owner_id, object_key, state, mime, size, checksum / target_type/id | 연결 권한 검사, 공개 파생본과 원본 구분 |
| favorites | user_id, target_type, target_id | 사용자+유형+대상 unique. 다형 참조는 서비스 계층 존재 검사 또는 유형별 FK 테이블 사용 |
| notifications | recipient_id, event_id, type, target_ref, read_at | recipient+event unique, 목록/읽음 API |
| reports / support_tickets | reporter_id, target_ref, reason, status, assignee | 처리 전담 권한, 증빙 비공개, 분쟁 보존 플래그 |
| audit_logs / outbox_events / jobs | actor, action, target, reason, request_id / event_id, payload, state | 감사 내용에서 비밀 제거, 이벤트 재처리 중복 방지 |

삭제 정책: 계정 탈퇴로 계약·분쟁 기록을 CASCADE 삭제하지 않는다. 공개 콘텐츠 비노출, 개인 식별정보 삭제/가명화, 증빙 보존·폐기는 승인된 보유 정책에 따라 처리한다. 유효한 계약/지원 스냅샷과 일반 공개 원본의 수명을 분리한다.

인덱스 초기안: projects(status, visibility, closes_at), projects(created_at,id), proposals(project_id,status), portfolios(visibility,created_at,id), notifications(recipient_id,read_at,created_at), messages(conversation_id,sequence), join 테이블 역방향 인덱스. 실제 검색 실행 계획·데이터 분포로 조정한다.

## 4. 상태 전이와 불변 조건

### 4.1 프로젝트

| 현재 | 명령/주체 | 다음 | 조건 |
| --- | --- | --- | --- |
| DRAFT | 게시 / 소유자 | OPEN | 필수 입력·학교 인증·첨부 검사 완료 |
| OPEN | 모집 종료 / 소유자 또는 마감 Job | CLOSED | 이후 신규 지원 불가, 기존 지원 검토는 가능 |
| OPEN 또는 CLOSED | 선정 / 소유자 | MATCHED | 기존 유효 지원서 1개 선정, 자기 선정 금지, 워크룸 원자 생성 |
| DRAFT 또는 OPEN 또는 CLOSED | 취소 / 소유자 | CANCELLED | 선정 전. 제출 지원자에게 알림 |
| MATCHED | 양측 최신 계약 동의 / 서버 | IN_PROGRESS | SIGNED 계약이 있고 같은 버전에 양측 동의 |
| IN_PROGRESS | 완료 요청 / 수행자 | COMPLETION_REQUESTED | 완료 근거·산출물 첨부 권한 검사 |
| COMPLETION_REQUESTED | 보완 요청 / 의뢰자 | IN_PROGRESS | 사유 필수, 이력 보존 |
| COMPLETION_REQUESTED | 완료 확인 / 의뢰자 | COMPLETED | 같은 활성 완료 요청 검토, 후기 허용 |
| MATCHED 또는 IN_PROGRESS 또는 COMPLETION_REQUESTED | 취소 합의 / 양측 또는 권한 운영자 | CANCELLED | 단독 상태 변경 불가, 합의·처리 사유 보존 |

`CLOSED`는 모집 종료이지 거래 완료가 아니다. CLOSED에서 신규 지원은 불가하지만 기존 지원을 선정할 수 있다. 재모집/재선정은 MVP 범위 밖으로 두고 후속 정책으로 처리한다.

기존 문서의 프로젝트 `IN_DISCUSSION`은 제안/대화 상태로 이동하고, `CONTRACTED`는 계약 SIGNED와 중복되므로 프로젝트 상태에서 제외하는 제안이다. 분쟁은 `disputeStatus`/별도 신고 엔터티로 분리해 거래 진행 상태를 잃지 않게 한다. 초기 제안은 활성 분쟁 동안 계약 개정·완료 확정을 제한하고 자료 열람·대화는 보존한다.

### 4.2 지원·지정 요청

- 지원: `SUBMITTED → IN_DISCUSSION → SELECTED`, SUBMITTED에서도 바로 SELECTED 가능. 미선정 상태에서 작성자 WITHDRAWN, 의뢰자 REJECTED 가능. 선정 시 다른 활성 지원은 REJECTED(reason=MATCHED_ELSEWHERE), 선정된 지원은 단순 철회 금지.
- 동일 의뢰에 중복 지원은 409. WITHDRAWN 후 재지원 허용 여부는 정책 승인 전 금지 기본안. 금액·기간 수정은 선정 전 새 revision으로 기록한다.
- 지정 요청: `PENDING → ACCEPTED / REJECTED / EXPIRED / CANCELLED`. 원래 조건을 수신자가 수락하면 ACCEPTED. 견적 회신이 있으면 PENDING을 유지하고 발신자가 최신 견적을 수락할 때 ACCEPTED.
- ACCEPTED 전환과 동시에 DIRECT_ONLY 프로젝트·선정·워크룸을 한 트랜잭션으로 생성한다. 이미 생성된 방은 재수락으로 중복 생성하지 않는다. 지정 요청 수락은 계약 체결이 아니다.
- 거래 전 문의는 프로젝트/지원자 또는 지정 요청을 context로 한 대화방에서 진행하고, 선정 시 같은 대화방을 워크룸에 연결한다. 미선정 지원자의 다른 대화를 워크룸에 합치지 않는다.

### 4.3 계약·공개 승인

- 계약 버전: `DRAFT → WAITING_ACCEPTANCE → SIGNED`; 미체결 버전 대체는 SUPERSEDED, 거래 취소 시 CANCELLED. 열람 여부는 read receipt이며 별도 REVIEWING 거래 상태로 쓰지 않는다.
- 새 버전 발행은 이전 미체결 버전의 동의를 새 버전으로 승계하지 않는다. 동의 이력 자체는 삭제하지 않는다.
- 체결된 버전은 불변. 변경 계약을 새 버전으로 제안해도 기존 체결본은 새 버전 쌍방 체결 전까지 유효한 기록으로 남긴다. UI에 ‘현재 체결본’과 ‘변경 검토본’을 구분한다.
- 계약 당사자·범위·금액·일정·수정 범위·산출물·기타 합의의 스냅샷을 포함하고, PDF는 그 버전에서 생성한다. PDF 실패는 체결 롤백 대신 생성 재시도 상태로 표시.
- 완료 요청: PENDING → APPROVED / CHANGES_REQUESTED / CANCELLED. 자동 완료 처리/분쟁 자동 해결은 초기 범위에 넣지 않는다.
- 후기: COMPLETED의 거래 당사자가 상대방에게 한 번 작성. 본인 후기 금지, 숨긴 후기는 공개 평균·개수 집계에서 제외. 후기가 없으면 null/‘신규’, 0점으로 표시하지 않는다.
- 검증 포트폴리오: PENDING_APPROVAL → APPROVED / REJECTED, 취소는 CANCELLED. 완료한 거래의 수행자만 요청하고 의뢰자가 정확한 portfolioVersion을 승인한다. 실제 거래 완료 배지와 학교 인증 배지는 별개다.

## 5. API 공통 계약

접두어 `/api/v1`. 아래 경로는 **제안**이며 아직 구현되지 않았다. 표의 `ME`는 세션 사용자, `OWNER`는 대상 소유자, `MEMBER`는 거래/방 당사자, `STAFF`는 지정 관리 권한이다. 공개 조회도 비공개/제재 필터를 적용한다.

- 성공: `{ "data": ..., "meta": { "requestId": "..." } }`.
- 목록: `{data: [], meta: {page, pageSize, total, requestId}}`; 메시지/알림 스트림 복구는 cursor/nextCursor 사용. 페이지 기본 20, 최대 50 제안.
- 오류: `{error:{code,message,fieldErrors:[{field,message}],requestId}}`. 운영 로그 상세를 사용자에게 노출하지 않는다.
- 상태 코드: 400 형식, 401 세션 없음/만료, 403 권한·인증 부족, 404 없음/노출 불가, 409 중복·버전·상태 충돌, 413 용량, 422 필드 검증, 429 속도 제한, 503 일시 장애.
- `ownerId`, `senderId`, `verified`, 집계 수치 등 서버 유도 필드는 request body에서 받지 않거나 거절한다.
- 선정·수락·계약 동의·완료 승인은 Idempotency-Key 필수 제안. 사용자+메서드+정규 경로+키+body hash를 저장. 같은 요청 재전송은 같은 결과, 같은 키 다른 body는 409. 보존 기간 초기안 24시간; 기간 이후에도 도메인 유일 제약으로 중복 효과 방지.
- GET으로 상태를 바꾸지 않는다. 모든 비공개 응답은 적절한 private/no-store 캐시 정책을 사용한다.

### 5.1 계정·프로필·탐색

| 메서드/경로 | 권한 | 요청/응답 및 동작 |
| --- | --- | --- |
| POST `/auth/signup` | 비회원 | email,password,displayName,consents → 가입 접수, 학교 인증 없음 |
| POST `/auth/login` | 비회원 | email,password → 세션 쿠키, 공개용 내 계정 요약 |
| GET `/auth/session` | ME | user, verification, permissions; 미로그인은 401 |
| POST `/auth/logout` | ME | 현재 세션 폐기, 204 |
| POST `/auth/email-verifications`, `/auth/email-verifications/confirm` | 대상 계정/토큰 | 발송, 일회용 확인 |
| POST `/auth/password-resets`, `/auth/password-resets/confirm` | 비회원/토큰 | 존재 여부 일반화 응답, token+newPassword, 성공 시 세션 폐기 |
| GET/PATCH `/me` | ME | 비공개 계정 조회·허용 필드만 변경 |
| DELETE `/me` | ME+재인증 | 탈퇴 접수, 진행 거래·보존 정책 안내 |
| POST/GET `/me/school-verifications` | ME | 신청/상태, 승인 결정은 STAFF만 |
| GET/PATCH `/me/profile` | ME | 소개·활동명·분야·기술·공개·의뢰 가능·expectedVersion |
| GET/POST `/me/careers`, `/me/services` | ME | 목록/생성, `/:id` PATCH/DELETE는 OWNER |
| GET `/categories`, `/skills?q=&fieldId=` | 공개 | 활성 사전, 기술 별칭·분야별 추천; 사전 버전 포함 |
| GET `/experts`, `/experts/:id` | 공개 | 공개 프로필 DTO, 후기·완료 집계 |
| GET `/portfolios`, `/portfolios/:id` | 공개/OWNER | visibility에 따라 권한 분기 |
| POST/PATCH `/portfolios`, `/portfolios/:id` | ME/OWNER | 등록/수정 API 예약, 콘텐츠 schema는 디자인 후 확정 |
| POST `/portfolios/:id/publish`, `/portfolios/:id/unpublish` | OWNER | 검증된 파일·필수 필드 검사, 검색 반영/비노출 |
| PUT `/me/featured-portfolios` | ME | 본인 공개 작업 ID 최대 3개, 순서 포함 |
| GET `/search` | 공개 | q, type=projects/experts/portfolios, 공통 필터; type 생략 시 종류별 preview/count |
| GET/PUT/DELETE `/me/favorites` 또는 `/me/favorites/:type/:id` | ME | 목록 / 추가 / 해제, 멱등 처리 |

### 5.2 의뢰·매칭

| 메서드/경로 | 권한 | 요청/응답 및 동작 |
| --- | --- | --- |
| GET `/projects`, `/projects/:id` | 공개/당사자 | PUBLIC만 공개 검색; DIRECT_ONLY는 당사자 |
| POST `/projects` | ME | DRAFT 생성. owner는 세션으로 결정 |
| PATCH `/projects/:id` | OWNER | 부분 저장, expectedVersion. 게시 상태는 필드별 변경 제한 |
| POST `/projects/:id/publish`, `/close`, `/cancel` | OWNER | 도메인 상태 명령, 인증·지원·선정 조건 확인 |
| POST `/projects/:id/proposals` | 인증 ME | content,amount,days,portfolioVersionIds; 마감·본인·중복 검사 |
| GET `/projects/:id/proposals` | OWNER | 개인정보 최소화한 지원 목록, 비교 화면도 같은 권한 |
| GET/PATCH `/proposals/:id` | 작성자/의뢰자(조회) | 수정은 작성자+선정 전, revision 생성 |
| POST `/proposals/:id/withdraw` | 작성자 | 상태 검사 |
| POST `/projects/:id/selection` | OWNER | proposalId,expectedVersion; matchId/workroomId 응답 |
| POST `/direct-requests` | 인증 ME | recipientId, 요청 조건, expiresAt |
| GET `/me/direct-requests?direction=received|sent` | ME | 받은/보낸 요청, latestQuote 요약 |
| POST `/direct-requests/:id/quotes` | 수신자 | 금액·범위·기간 새 견적 버전 |
| POST `/direct-requests/:id/accept` | 수신자 또는 최신 견적의 발신자 | 수락하는 조건/견적 버전 명시, DIRECT_ONLY 프로젝트·워크룸 생성 |
| POST `/direct-requests/:id/reject`, `/cancel` | 수신자/발신자 | 상태 검사, 상대 알림 |
| GET `/me/projects`, `/me/proposals`, `/me/workrooms` | ME | 계정별 MY 목록, 필터/페이지 |

선정 요청 예:

```http
POST /api/v1/projects/{projectId}/selection
Idempotency-Key: <client-generated-uuid>
Content-Type: application/json

{"proposalId":"<uuid>","expectedVersion":4}
```

성공 시 project.status=MATCHED 및 workroomId 반환. 두 탭에서 다른 지원자를 동시에 선정하면 한 건만 성공하며 다른 요청은 409 `PROJECT_ALREADY_MATCHED`.

### 5.3 워크룸·계약·운영

| 메서드/경로 | 권한 | 동작 |
| --- | --- | --- |
| GET `/workrooms/:id` | MEMBER | 당사자·현재 상태·체결본·검토본·최근 파일 |
| POST/GET `/conversations` | ME | context 기반 생성/참여 목록. 일반 임의 DM 생성 금지 |
| GET/POST `/conversations/:id/messages` | MEMBER | cursor 조회 / text,clientMessageId,mediaIds 전송 |
| PUT `/conversations/:id/read` | MEMBER | lastReadSequence 단조 증가 |
| GET `/events` | ME | 인증된 SSE, event ID/type/payload; 비멤버 데이터 금지 |
| POST `/workrooms/:id/contracts/versions` | MEMBER | baseVersion, 계약 조건 → 새 초안 |
| POST `/contract-versions/:id/publish` | 버전 작성 당사자 | 변경 불변화, 검토 요청 |
| POST `/contract-versions/:id/acceptances` | MEMBER | contentHash,expectedVersion, 동의 확인 → 양측 완료 시 체결 |
| GET `/contracts/:id`, `/contract-versions/:id/document` | MEMBER | 버전 이력 / PDF 준비 상태·다운로드 |
| POST `/workrooms/:id/completion-requests` | 수행자 | 완료 요청, note/mediaIds |
| POST `/completion-requests/:id/approve`, `/request-changes` | 의뢰자 | expectedVersion 및 사유, 프로젝트 상태 갱신 |
| POST `/projects/:id/reviews` | 완료 거래 당사자 | rating/body, 상대방은 서버 유도 |
| POST `/portfolios/:id/publication-requests` | 완료 거래 수행자 | projectId,portfolioVersionId |
| POST `/publication-requests/:id/approve`, `/reject` | 해당 의뢰자 | 버전별 승인/반려 |
| POST `/uploads`, `/uploads/:id/complete` | ME+대상 권한 | 허가/검사 요청, mediaId 및 상태 |
| GET `/media/:id/download` | 파일 대상 접근자 | READY·visibility 검사 후 짧은 다운로드 URL |
| GET `/me/notifications`; PUT `/me/notifications/:id/read` | ME | 알림 목록/읽음 |
| POST/GET `/me/tickets`, `/me/reports` | ME | 내 문의·신고 생성/목록 |
| GET/PATCH `/admin/verifications/:id`, `/admin/reports/:id` | STAFF | 범위별 조회·승인·처리 사유 필수 |
| GET `/admin/audit-logs` | 감사 전용 STAFF | 민감 필드 마스킹·열람 기록 |

목록만 나열된 관리자 계정·콘텐츠 관리 API는 핵심 운영 정책 확정 후 개별 OpenAPI operation으로 상세화한다. 임의로 모든 엔터티에 범용 CRUD 관리자 권한을 부여하지 않는다.

## 6. 탐색 쿼리와 데이터 의미

목표 API 예:

```text
/projects?fieldId=frontend&fieldId=backend&categoryId=design
 &skillId=react&skillId=figma&budgetMin=100000&budgetMax=500000
 &daysMin=3&daysMax=14&mode=ONLINE&mode=HYBRID&urgent=true&page=1&pageSize=20
```

- 같은 축은 OR, 다른 축은 AND. 대분류/세부분야는 하나의 분야 축으로 합쳐 OR: `(디자인 전체 OR 프론트엔드 OR 백엔드) AND (React OR Figma)`.
- 대분류 전체가 선택되면 그 하위 선택은 요청에서 정규화. 대분류/세부분야 별도 AND로 처리하면 교차 분야 선택이 깨진다.
- 프리셋과 직접 예산 모두 `[projectMin,projectMax]`와 입력 범위가 겹치면 포함. 경계값 포함. 한쪽만 입력 가능. NEGOTIABLE은 금액 필터 사용 시 기본 제외, 별도 포함 옵션은 추후 결정.
- `daysMin <= days <= daysMax`; urgent=true는 OPEN이고 `now < closesAt <= now+72h`라는 제안. 기존 로컬 D-day 계산과 API 전환 시 경계 테스트 필요.
- `ratingMin=4.5|4.0|3.5`는 평균 원값으로 비교, 반올림 표시값으로 비교하지 않음. 후기 없는 사람은 평점 필터 사용 시 제외, 필터 없으면 탐색 가능.
- `schoolVerified=true`와 `verifiedWork=true`를 분리. 전문가의 학교 인증이 작업물의 거래 완료 인증을 의미하지 않는다.
- 기술은 표준 ID 선택 + 별칭 검색. 분야 선택 시 관련 기술을 우선 추천하되 전체 기술 검색도 제공. 분야 변경으로 이미 선택한 기술을 조용히 삭제하지 않는다.
- 검색 입력에서 임의 기술을 생성하지 않는다. 등록 과정의 새 기술 제안은 별도 검토 상태로 두고 표준 필터와 분리.
- 정렬 whitelist: projects `newest/deadline/budget`, experts `reviews/rating/completed`, portfolios `newest/popular`. 동률은 id 또는 createdAt+id로 안정 정렬. 미정의 정렬은 400.
- LIKE/검색어 escape·파라미터 바인딩 사용. 초기 한국어 부분검색 품질과 대용량 성능은 부하 테스트에서 확인하며 자동으로 형태소 검색을 지원한다고 가정하지 않는다.
- total과 미리보기 결과 수는 같은 필터 의미를 사용한다. 패널 초안 조회는 debounce/cancel하고 확정 URL은 적용 버튼에서만 바꾼다.

## 7. 이벤트와 실패 복구

이벤트 envelope 제안: `{eventId,type,occurredAt,aggregateId,aggregateVersion,data}`. 민감한 전문 대신 대상 ID와 최소 정보만 전송하고 상세는 인증 API로 조회.

| 이벤트 | 수신 대상 / 효과 |
| --- | --- |
| proposal.submitted | 의뢰자 알림, MY 지원 수 갱신 |
| direct_request.received/quoted/resolved | 상대방 알림, 요청 상태 갱신 |
| project.matched | 양측 워크룸 진입, 미선정자 결과 알림 |
| message.created/read | 해당 대화 멤버만 메시지/읽음 반영 |
| contract.published/accepted/signed | 양측 계약 상태 갱신, signed PDF Job |
| completion.requested/resolved | 상대방 확인 안내, 작업 상태 갱신 |
| portfolio.publication_resolved | 수행자 공개 승인 상태·검증 배지 갱신 |
| verification.changed | 당사자 인증 상태, 공개 배지 캐시 무효화 |

Outbox는 업무 변경과 같은 트랜잭션에 기록. Worker claim/lease, 지수 백오프, 최대 재시도, 실패 큐와 관리자 재처리를 설계한다. 전달은 at-least-once를 전제로 소비자가 eventId 중복을 제거한다. Exactly-once 네트워크 전달을 보장한다고 표현하지 않는다.
