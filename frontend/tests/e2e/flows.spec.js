import { test, expect } from "@playwright/test";

test("홈과 모든 주요 페이지가 오류 없이 렌더링된다", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "실력 있는 사람",
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  for (const route of [
    "/projects",
    "/experts",
    "/works",
    "/projects/p1",
    "/experts/e1",
    "/works/w1",
    "/guide",
    "/my",
    "/saved",
    "/workroom",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});

test("검색·카테고리·정렬·빈 결과·필터 초기화", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: "카테고리 선택" }).hover();
  await expect(page.locator(".mega-menu")).toBeVisible();
  await page
    .locator(".mega-categories")
    .getByRole("button", { name: "디자인", exact: true })
    .click();
  await page
    .locator(".field-picker")
    .getByRole("checkbox", { name: "디자인 전체" })
    .check();
  await page
    .locator(".field-picker")
    .getByRole("button", { name: "결과 2건 보기" })
    .click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page.getByLabel("결과 정렬").selectOption("budget");
  await expect(page.locator(".project-card").first()).toContainText(
    "카페 브랜드",
  );
  await page.reload();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page.goto("/projects?q=검색결과없음");
  await expect(page.getByText("조건에 맞는 결과가 없어요")).toBeVisible();
  await page.getByRole("button", { name: "필터 초기화", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(6);
  await page.goto("/experts?available=1&rating=4.9");
  await expect(page.locator(".expert-card")).toHaveCount(3);
  await page.screenshot({
    path: "test-results/experts-desktop.png",
    fullPage: true,
  });
});

test("찜 상태 유지와 관심 목록 이동", async ({ page }) => {
  await page.goto("/projects");
  await page
    .locator(".project-card")
    .first()
    .getByRole("button", { name: "관심 목록에 저장" })
    .click();
  await page.reload();
  await expect(
    page
      .locator(".project-card")
      .first()
      .getByRole("button", { name: "저장 취소" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/saved");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("button", { name: "저장 취소" }).click();
  await expect(page.getByText("아직 저장한 항목이 없어요")).toBeVisible();
});

test("의뢰 임시저장·검증·등록·상세·마감", async ({ page }) => {
  await page.goto("/request/new");
  await page.getByRole("button", { name: "다음 단계" }).click();
  await expect(page.getByRole("alert")).toContainText("입력해 주세요");
  await page.getByLabel("프로젝트 제목").fill("테스트 캠퍼스 포스터 제작");
  await page.getByRole("button", { name: "디자인", exact: true }).click();
  await page.getByLabel("세부 분야").selectOption("포스터·인쇄물");
  await page
    .getByLabel("한 줄 요약")
    .fill("신입생 환영 행사를 위한 포스터입니다.");
  await page.reload();
  await expect(page.getByLabel("프로젝트 제목")).toHaveValue(
    "테스트 캠퍼스 포스터 제작",
  );
  await page.getByRole("button", { name: "다음 단계" }).click();
  await page
    .getByLabel("프로젝트 내용")
    .fill("밝고 생동감 있는 캠퍼스 홍보물을 제작합니다.");
  await page.getByLabel("원하는 결과물").fill("A2 포스터 1종\n편집 원본 파일");
  await page.getByRole("button", { name: "다음 단계" }).click();
  await page.getByLabel("예산 (원)", { exact: false }).fill("120000");
  await page.getByLabel("작업 희망 기간").fill("7");
  await page.getByLabel("모집 마감일").fill("2099-10-10");
  await page.getByRole("button", { name: "다음 단계" }).click();
  await expect(page.locator(".request-preview")).toContainText("120,000원");
  await page.screenshot({
    path: "test-results/request-preview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "의뢰 등록하기" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "테스트 캠퍼스 포스터 제작",
  );
  await expect(page.locator(".deliverables")).toContainText("편집 원본 파일");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "테스트 캠퍼스 포스터 제작",
  );
  await page.getByRole("button", { name: "모집 마감하기" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "모집 마감", exact: true })
    .click();
  await expect(page.locator(".detail-title")).toContainText("모집 마감");
});

test("기존 대표작 최대 3개 첨부 후 제안 저장", async ({ page }) => {
  // A future project keeps this flow independent from the seed listing deadlines.
  await page.goto("/");
  await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem("bu-gig:projects"));
    all[0].deadline = "2099-10-10";
    localStorage.setItem("bu-gig:projects", JSON.stringify(all));
  });
  await page.goto("/projects/p1/apply");
  await page
    .getByLabel("제안 한마디")
    .fill(
      "비슷한 행사 홍보물을 제작한 경험이 있어요. 목적에 맞는 디자인을 제안합니다.",
    );
  await page.getByLabel("제안 금액").fill("100000");
  await page.getByLabel("예상 기간").fill("7");
  const choices = page.locator(".portfolio-picker input");
  for (let i = 0; i < 3; i++) await choices.nth(i).check();
  await expect(choices.nth(3)).toBeDisabled();
  await page.getByRole("button", { name: "제안 보내기" }).click();
  await expect(page.getByRole("button", { name: "지원 완료" })).toBeDisabled();
  await page.goto("/my");
  await page.locator(".tabs").getByRole("button", { name: "내 지원" }).click();
  await expect(page.locator(".activity-card")).toContainText(
    "대표 작업물 3개 첨부",
  );
});

test("워크룸 메시지·계약 동의·파일이 새로고침 후 유지된다", async ({
  page,
}) => {
  await page.goto("/workroom");
  await page.getByRole("button", { name: "채팅", exact: true }).click();
  await page
    .getByLabel("메시지", { exact: true })
    .fill("초안을 확인해 주세요.");
  await page.getByRole("button", { name: "메시지 보내기" }).click();
  await expect(page.locator(".message.mine")).toContainText(
    "초안을 확인해 주세요.",
  );
  await page.getByRole("button", { name: "계약", exact: true }).click();
  await page.getByRole("button", { name: "내용 확인 및 동의" }).click();
  await expect(
    page.getByRole("button", { name: "동의 완료", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "파일", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "test.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("preview file"),
  });
  await expect(page.locator(".file-row")).toContainText("test.txt");
  await page.reload();
  await page.getByRole("button", { name: "계약", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "동의 완료", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "파일", exact: true }).click();
  await expect(page.locator(".file-row")).toContainText("test.txt");
});

test("모바일 레이아웃과 필터 시트에 가로 넘침이 없다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/",
    "/projects",
    "/experts",
    "/works",
    "/projects/p1",
    "/experts/e1",
    "/works/w1",
    "/request/new",
    "/my",
    "/workroom",
  ]) {
    await page.goto(route);
    await expect(page.locator(".mobile-nav")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      route,
    ).toBeTruthy();
    if (route === "/")
      await page.screenshot({
        path: "test-results/home-mobile.png",
        fullPage: true,
      });
    if (route === "/request/new")
      await page.screenshot({
        path: "test-results/request-mobile.png",
        fullPage: true,
      });
  }
  await page.goto("/projects");
  await page.getByRole("button", { name: "카테고리 선택" }).click();
  await expect(page.locator(".filter-panel")).toBeVisible();
  await page.screenshot({
    path: "test-results/filter-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "분야 선택 닫기" }).click();
  await expect(page.locator(".filter-panel")).toHaveCount(0);
});

test("태블릿 레이아웃, 필터 키보드 닫기, 통합 검색", async ({ page }) => {
  for (const width of [360, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/projects", "/experts", "/request/new"]) {
      await page.goto(route);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${width} ${route}`,
      ).toBeTruthy();
    }
  }
  await page.goto("/projects");
  await page.getByRole("button", { name: "카테고리 선택" }).click();
  await expect(page.locator(".filter-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".filter-panel")).toHaveCount(0);
  await page.goto("/");
  await page.locator(".home-search").getByLabel("검색어").fill("영상");
  await page
    .locator(".home-search")
    .getByRole("button", { name: "검색하기" })
    .click();
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page
    .locator(".tabs")
    .getByRole("button", { name: "전문가", exact: true })
    .click();
  await expect(page.locator(".expert-card")).toHaveCount(1);
});
