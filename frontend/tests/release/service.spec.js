import { test, expect } from "@playwright/test";
const password = "Release-test-123!";
let batchStarted = Date.now(),
  batchTests = 0;
test.beforeEach(async ({}, info) => {
  // All browser contexts share the proxy's IP. Keep batches inside the real
  // 600 requests/minute budget; never disable the production rate limiter.
  if (batchTests === 6) {
    const wait = Math.max(0, 61000 - (Date.now() - batchStarted));
    info.setTimeout(info.timeout + wait);
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    batchStarted = Date.now();
    batchTests = 0;
  }
  batchTests++;
});
async function login(page, role) {
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill(`${role}@release.test`);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/my$/);
}
test("empty launch has no fabricated people, reviews or badges; outage differs from empty", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("아직 공개된 의뢰가 없어요.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("함께해서 더 좋았던 순간들")).toHaveCount(0);
  await expect(page.getByText("인기 검색어", { exact: true })).toHaveCount(0);
  await expect(page.locator(".verified")).toHaveCount(0);
  await expect(page.locator(".header .brand")).toBeVisible();
  await expect(page.locator(".hero-sticker")).toBeVisible();
  await expect(page.locator(".categories a")).not.toHaveCount(1);
  await expect(page.locator(".promo img")).toBeVisible();
  await page.screenshot({
    path: "test-results/restored-home.png",
    fullPage: true,
  });
  await page.goto("/projects");
  await expect(page.getByText("아직 공개된 항목이 없어요.")).toBeVisible();
  await page.screenshot({
    path: "test-results/restored-explore.png",
    fullPage: true,
  });
  await page.route("**/api/v1/projects?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "조회 서버 일시 중단" } }),
    }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("조회 서버 일시 중단");
  await expect(page.getByText("아직 공개된 항목이 없어요.")).toHaveCount(0);
});
test("signup, verification evidence, staff decision and profile readiness", async ({
  page,
  browser,
}) => {
  await page.goto("/signup");
  await expect(page.locator(".auth-shell .auth-motto")).toBeVisible();
  await page.screenshot({
    path: "test-results/restored-signup.png",
    fullPage: true,
  });
  await page.getByLabel("이름", { exact: true }).fill("첫 회원");
  await page.getByLabel("이메일", { exact: true }).fill("first@release.test");
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByLabel("비밀번호 확인", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("가입 요청");
  await login(page, "first");
  await page.goto("/my/profile");
  await page.getByLabel("프로필 공개", { exact: true }).selectOption("PUBLIC");
  await page.getByRole("button", { name: "프로필 저장" }).click();
  await expect(page.getByRole("alert")).toContainText("소개 문구");
  await page.goto("/my/verification");
  await page.getByLabel("인증 증빙").setInputFiles({
    name: "evidence.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nTest evidence\n%%EOF"),
  });
  await expect(page.getByText("증빙 업로드 완료")).toBeVisible();
  await page.getByRole("button", { name: "학교 인증 신청" }).click();
  await expect(page.getByText("대기 중", { exact: true })).toBeVisible();
  const staff = await browser.newContext(),
    admin = await staff.newPage();
  await login(admin, "staff");
  await admin.goto("/admin");
  await admin.getByRole("button", { name: "증빙 심사" }).first().click();
  await admin.getByLabel("심사 사유").fill("학교 소속 확인");
  await admin.getByLabel("인증 만료일").fill("2030-12-31");
  await admin.getByRole("button", { name: "인증 승인", exact: true }).click();
  await expect(
    admin.locator("article").first().getByText("인증 완료", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("인증 완료", { exact: true })).toBeVisible();
  await admin.getByLabel("심사 사유").fill("인증 해제 검증");
  await admin.getByRole("button", { name: "인증 해제", exact: true }).click();
  await expect(
    admin.locator("article").first().getByText("인증 해제", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("인증 해제", { exact: true })).toBeVisible();
  await staff.close();
});
test("first public project → proposal → selection → both signatures → completion → first review", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext(),
    providerContext = await browser.newContext();
  const owner = await ownerContext.newPage(),
    provider = await providerContext.newPage();
  await login(owner, "owner");
  await login(provider, "provider");
  await provider.goto("/my/profile");
  await provider.getByLabel("소개 문구").fill("프론트엔드 제작");
  const field = await provider
    .getByLabel("활동 분야")
    .locator("option")
    .first()
    .getAttribute("value");
  await provider.getByLabel("활동 분야").selectOption(field);
  await provider
    .getByLabel("프로필 공개", { exact: true })
    .selectOption("PUBLIC");
  await provider.getByRole("button", { name: "프로필 저장" }).click();
  await expect(provider.getByRole("alert")).toHaveCount(0);
  await owner.goto("/request/new");
  await owner.getByLabel("제목", { exact: true }).fill("첫 실제 의뢰");
  await owner.getByLabel("한 줄 요약").fill("서버 연동 거래 검증");
  await owner.getByLabel("활동 분야").selectOption(field);
  await owner.getByRole("button", { name: "다음", exact: true }).click();
  await owner
    .getByLabel("작업 내용", { exact: true })
    .fill("홈페이지를 제작합니다");
  await owner.getByLabel("원하는 결과물").fill("소스 코드와 이미지");
  await owner.getByRole("button", { name: "다음", exact: true }).click();
  await owner.getByLabel("모집 마감일").fill("2030-12-31");
  await owner.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    owner.getByRole("heading", { name: "등록 전 미리보기" }),
  ).toBeVisible();
  await owner
    .getByLabel("참고자료 첨부")
    .setInputFiles({
      name: "brief.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nProject brief\n%%EOF"),
    });
  await expect(
    owner.getByRole("button", { name: "첨부 1", exact: true }),
  ).toBeVisible();
  await owner.getByRole("button", { name: "의뢰 초안 저장" }).click();
  await expect(owner).toHaveURL(/\/my\/projects\//);
  const projectId = owner.url().split("/").pop();
  await owner.getByRole("button", { name: "의뢰 게시", exact: true }).click();
  await expect(owner.getByText("모집 중", { exact: false })).toBeVisible();
  await provider.goto(`/projects/${projectId}/apply`);
  await provider.getByLabel("제안 내용").fill("첫 지원서입니다");
  await provider.getByLabel("제안 금액 (원)").fill("100000");
  await provider.getByLabel("예상 기간 (일)").fill("7");
  await provider.getByRole("button", { name: "지원서 제출" }).click();
  await expect(provider).toHaveURL(/\/my\/proposals\//);
  await provider
    .getByRole("button", { name: "지원서 수정", exact: true })
    .click();
  await provider
    .getByRole("dialog")
    .getByLabel("제안 내용")
    .fill("변경한 첫 지원서입니다");
  await provider.getByRole("button", { name: "지원서 변경 저장" }).click();
  await expect(provider.getByRole("dialog")).toHaveCount(0);
  await expect(
    provider.getByText("변경한 첫 지원서입니다", { exact: true }),
  ).toBeVisible();
  await owner.reload();
  await owner.getByRole("button", { name: "이 지원자 선정" }).click();
  await expect(owner).toHaveURL(/\/workrooms\//);
  const room = owner.url();
  await owner.screenshot({
    path: "test-results/restored-workroom.png",
    fullPage: true,
  });
  await provider.goto(room);
  await owner.getByRole("button", { name: "대화", exact: true }).click();
  await owner
    .getByRole("textbox", { name: "메시지", exact: true })
    .fill("첫 프로젝트 대화입니다.");
  await owner.getByRole("button", { name: "메시지 보내기" }).click();
  await provider.getByRole("button", { name: "대화", exact: true }).click();
  await expect(
    provider.getByText("첫 프로젝트 대화입니다.", { exact: true }),
  ).toBeVisible();
  await owner.getByRole("button", { name: "계약", exact: true }).click();
  await owner.getByRole("button", { name: "계약 검토 요청" }).click();
  await owner.getByRole("button", { name: "이 계약 내용에 동의" }).click();
  await expect(owner.getByText("동의한 당사자: 1 / 2")).toBeVisible();
  await provider.getByRole("button", { name: "계약", exact: true }).click();
  await provider.getByRole("button", { name: "이 계약 내용에 동의" }).click();
  await expect(
    provider.getByText("계약 1차 · 체결", { exact: true }),
  ).toBeVisible();
  await provider
    .getByRole("button", { name: "완료·취소", exact: true })
    .click();
  await provider
    .getByLabel("완료 내용 / 처리 사유")
    .fill("결과물을 확인해 주세요");
  await provider
    .getByRole("button", { name: "완료 확인 요청", exact: true })
    .click();
  await owner.reload();
  await owner.getByRole("button", { name: "완료·취소", exact: true }).click();
  await owner.getByRole("button", { name: "완료 승인", exact: true }).click();
  await expect(owner.getByRole("heading", { name: "거래 후기" })).toBeVisible();
  await owner.getByLabel("후기 내용").fill("실제 완료 거래에서 남긴 첫 후기");
  await owner.getByRole("button", { name: "후기 등록", exact: true }).click();
  await expect(owner.getByText("등록한 후기 · 5점")).toBeVisible();
  await owner.goto("/experts");
  await expect(
    owner.getByText("★ 5.0 · 후기 1개", { exact: true }),
  ).toBeVisible();
  await owner.goto("/");
  await expect(owner.getByText("함께해서 더 좋았던 순간들")).toHaveCount(0);
  await owner.goto("/my");
  await owner.getByRole("button", { name: "내 메뉴", exact: true }).click();
  await owner.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(owner).toHaveURL(/\/login/);
  await expect(owner.getByText("첫 실제 의뢰", { exact: true })).toHaveCount(0);
  await login(owner, "provider");
  await owner.goto("/my");
  await expect(
    owner.getByRole("heading", { name: "provider님의 활동" }),
  ).toBeVisible();
  await expect(owner.getByText("첫 실제 의뢰", { exact: true })).toHaveCount(0);
  await owner.route("**/api/v1/me/dashboard", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "UNAUTHENTICATED" } }),
    }),
  );
  await owner.reload();
  await expect(owner).toHaveURL(/\/login/);
  await expect(
    owner.getByRole("heading", { name: "provider님의 활동" }),
  ).toHaveCount(0);
  await ownerContext.close();
  await providerContext.close();
});
test("bad recipient never becomes public request and private routes require session", async ({
  page,
}) => {
  await page.goto("/request/new");
  await expect(page).toHaveURL(/\/login\?next=/);
  await login(page, "owner");
  await page.goto("/request/new?expert=00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("alert")).toContainText("현재 볼 수 없는 항목");
  await expect(
    page.getByRole("button", { name: "의뢰 초안 저장" }),
  ).toHaveCount(0);
});
test("mobile empty and signed-in screens have no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/projects", "/experts", "/login"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  }
});
test("sample filter mega menu keeps draft selections, applies OR fields, cancels and supports mobile", async ({
  page,
}) => {
  await page.goto("/projects");
  await page
    .getByRole("button", { name: "카테고리 선택", exact: true })
    .click();
  const panel = page.getByRole("dialog", { name: "분야 선택" });
  await expect(panel).toBeVisible();
  await panel.locator(".field-service input").first().check();
  await panel.getByRole("button", { name: "개발·IT", exact: true }).click();
  await panel.locator(".field-service input").first().check();
  await expect(panel).toBeVisible();
  await page.screenshot({
    path: "test-results/restored-mega-menu.png",
    fullPage: true,
  });
  await panel.getByRole("button", { name: "결과 보기" }).click();
  expect(new URL(page.url()).searchParams.getAll("fieldId")).toHaveLength(2);
  await expect(page.locator(".applied-filters button")).toHaveCount(2);
  await page.getByRole("button", { name: "예산", exact: true }).click();
  await page.getByLabel("최소 예산 (원)").fill("500000");
  await page.getByLabel("최대 예산 (원)").fill("100000");
  await page.getByRole("button", { name: "결과 보기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("최솟값");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  expect(new URL(page.url()).searchParams.has("budgetMin")).toBeFalsy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "카테고리 선택", exact: true })
    .click();
  await expect(panel).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});
test("member support, operator reply, preferences and account settings persist through API", async ({
  page,
  browser,
}) => {
  await login(page, "owner");
  await page.goto("/support");
  await page.getByLabel("문의 제목").fill("기능 연결 확인");
  await page.getByLabel("문의 내용").fill("자료 공개 방법을 문의합니다.");
  await page.getByRole("button", { name: "문의 접수" }).click();
  await expect(page).toHaveURL(/\/support\/tickets\//);
  const ticket = page.url().split("/").pop();
  const context = await browser.newContext(),
    staff = await context.newPage();
  await login(staff, "staff");
  await staff.goto(`/admin/tickets/${ticket}`);
  await staff
    .getByLabel("답변 내용")
    .fill("완료 워크룸에서 공개 승인을 요청해 주세요.");
  await staff.getByRole("button", { name: "답변 등록" }).click();
  await expect(
    staff.getByText("완료 워크룸에서 공개 승인을 요청해 주세요.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("완료 워크룸에서 공개 승인을 요청해 주세요.", {
      exact: true,
    }),
  ).toBeVisible();
  await context.close();
  await page.goto("/settings/account");
  await page.getByLabel("새 메시지 알림").uncheck();
  await page.getByRole("button", { name: "알림 설정 저장" }).click();
  await expect(page.getByText("알림 설정을 저장했습니다.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("새 메시지 알림")).not.toBeChecked();
});
test("portfolio create, edit, preview, publication and featured selection use real uploaded images", async ({
  page,
}) => {
  await login(page, "provider");
  await page.goto("/my/portfolios");
  await page.getByLabel("작업물 제목").fill("첫 결과물");
  await page.getByLabel("작업물 소개").fill("실제 작업물 소개");
  await page.getByLabel("담당 역할").fill("디자인");
  const field = await page
    .getByLabel("분야", { exact: true })
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await page.getByLabel("분야", { exact: true }).selectOption(field);
  await page
    .getByLabel("작업 이미지 (최대 10개)")
    .setInputFiles({
      name: "work.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWPgTHqHFTEMLQkAendWQYV5VW4AAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(page.getByText("준비된 파일 1개")).toBeVisible();
  await page.getByRole("button", { name: "미리보기", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("첫 결과물");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "작업물 초안 저장" }).click();
  await expect(
    page
      .locator("article")
      .filter({
        has: page.getByRole("heading", { name: "첫 결과물", exact: true }),
      }),
  ).toBeVisible();
  await page.getByRole("button", { name: "공개하기", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "비공개로 변경", exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "첫 결과물", exact: true }).check();
  await page.getByRole("button", { name: "대표 작업물 저장" }).click();
  await expect(page.getByText("대표 작업물을 저장했습니다.")).toBeVisible();
  await page.getByRole("button", { name: "작업물 수정", exact: true }).click();
  await page.getByLabel("작업물 제목").fill("수정한 결과물");
  await page
    .getByRole("button", { name: "작업물 수정 저장", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "수정한 결과물", exact: true }),
  ).toBeVisible();
});
