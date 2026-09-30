import { test, expect } from "@playwright/test";

test("회원가입과 로그인 카드 및 입력 규격이 동일하다", async ({ page }) => {
  for (const [width, height] of [[1440, 900], [1366, 768], [390, 844], [320, 720]]) {
    await page.setViewportSize({ width, height });
    const sizes = [];
    for (const route of ["/login", "/signup"]) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      sizes.push(await page.evaluate(() => {
        const card = document.querySelector(".auth-card");
        const input = document.querySelector('input[name="email"]');
        const button = document.querySelector(".auth-submit");
        return {
          cardWidth: card.getBoundingClientRect().width,
          padding: getComputedStyle(card).padding,
          inputWidth: input.getBoundingClientRect().width,
          inputHeight: input.getBoundingClientRect().height,
          buttonHeight: button.getBoundingClientRect().height,
          titleSize: getComputedStyle(document.querySelector("h1")).fontSize,
        };
      }));
    }
    expect(sizes[1]).toEqual(sizes[0]);
  }
});

test("데모 가입, 로그인 검증, 세션 유지, 로그아웃", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("이름", { exact: true }).fill("테스트학생");
  await page.getByLabel("이메일", { exact: true }).fill("student@example.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("demo-only-1234");
  await page
    .getByLabel("비밀번호 확인", { exact: true })
    .fill("different-1234");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("일치하지");
  await page
    .getByLabel("비밀번호 확인", { exact: true })
    .fill("demo-only-1234");
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "가입이 완료되었어요" }),
  ).toBeVisible();
  const stored = await page.evaluate(() =>
    localStorage.getItem("bu-gig:demo-accounts"),
  );
  expect(stored).not.toContain("demo-only-1234");
  await page.getByRole("link", { name: "로그인하기", exact: true }).click();
  await page.getByLabel("이메일", { exact: true }).fill("STUDENT@example.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("wrong-pass");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("확인해");
  await page.getByLabel("비밀번호", { exact: true }).fill("demo-only-1234");
  await page
    .getByRole("button", { name: "비밀번호 보기", exact: true })
    .click();
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByLabel("로그인 상태 유지", { exact: true }).check();
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/my$/);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "테스트학생",
  );
  await page.getByRole("button", { name: "내 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.locator(".header-login")).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("bu-gig:demo-session")),
  ).toBeNull();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bu-gig:demo-remembered-session"),
    ),
  ).toBeNull();
});

test("인증 전용 레이아웃과 공식 소셜 버튼", async ({ page }) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/login");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".auth-header")).toBeVisible();
    await expect(
      page.getByText("BAEKSEOK UNIVERSITY", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".auth-header").getByRole("link")).toHaveCount(1);
    await expect(
      page.locator(".auth-header").getByRole("link"),
    ).toHaveAttribute("href", "/");
    await expect(page.locator(".mobile-nav")).toHaveCount(0);
    for (const provider of ["kakao", "naver"]) {
      const button = page.locator(`.social-button.${provider}`);
      await expect(button).toBeVisible();
      expect(
        await button
          .locator("img")
          .evaluate((img) => img.complete && img.naturalWidth > 0),
      ).toBeTruthy();
      await expect(button).toHaveCSS("height", "56px");
    }
    await expect(page.locator(".social-button.kakao")).toHaveCSS(
      "background-color",
      "rgb(254, 229, 0)",
    );
    await expect(page.locator(".social-button.naver")).toHaveCSS(
      "background-color",
      "rgb(3, 169, 77)",
    );
    await page.screenshot({
      path: `test-results/login-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "카카오 로그인", exact: true })
    .click();
  await expect(page.locator(".auth-social-notice")).toContainText(
    "아직 연결되지 않았습니다",
  );
  await expect(page).toHaveURL(/\/login$/);
  await page
    .getByRole("button", { name: "네이버 로그인", exact: true })
    .click();
  await expect(page.locator(".auth-social-notice")).toContainText("네이버");
  await page.goto("/signup");
  await page.screenshot({
    path: "test-results/signup-mobile.png",
    fullPage: true,
  });
});

test("노트북 로그인 카드가 푸터를 제외하고 한 화면에 들어온다", async ({
  page,
}) => {
  for (const [width, height] of [
    [1366, 768],
    [1440, 900],
    [1280, 720],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/login");
    await page.evaluate(() => document.fonts.ready);
    const bounds = await page.locator(".auth-card").boundingBox();
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    await page.screenshot({
      path: `test-results/login-fit-${width}.png`,
      fullPage: true,
    });
  }
});

test("모바일 로그인 진입과 인증 화면 반응형", async ({ page }) => {
  for (const width of [320, 390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/login", "/signup", "/password-reset"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "전체 메뉴", exact: true }).click();
  await page
    .locator(".header-popover")
    .getByRole("link", { name: "회원가입", exact: true })
    .click();
  await expect(page).toHaveURL(/\/signup$/);
});
