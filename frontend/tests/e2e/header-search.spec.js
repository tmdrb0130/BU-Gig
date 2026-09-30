import { test, expect } from "@playwright/test";

test("헤더 검색이 펼쳐지고 입력과 포커스를 유지한다", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const search = page.locator(".header-search");
  const trigger = search.getByRole("button");
  const input = search.getByRole("textbox");
  const navBefore = await page.locator(".desktop-nav").boundingBox();
  await expect(input).toBeHidden();
  await trigger.hover();
  await expect(input).toBeVisible();
  await expect.poll(async () => (await search.locator("form").boundingBox()).width).toBeGreaterThan(300);
  await page.mouse.move(0, 250);
  await expect(input).toBeHidden();
  await trigger.focus();
  await expect(input).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await input.fill("React");
  await page.locator("h1").click();
  await expect(input).toBeVisible();
  expect(await page.locator(".desktop-nav").boundingBox()).toEqual(navBefore);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=React/);
  await expect(input).toHaveValue("React");
  await input.fill("");
  await page.locator("h1").click();
  await expect(input).toBeHidden();
});

test("확장된 검색창이 데스크톱 헤더 안에 정렬된다", async ({ page }) => {
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".header-search button").hover();
    await expect(page.locator(".header-search input")).toBeVisible();
    const nav = await page.locator(".desktop-nav").boundingBox();
    const search = await page.locator(".header-search").boundingBox();
    const cta = await page.locator(".header-cta").boundingBox();
    expect(search.x).toBeGreaterThanOrEqual(nav.x + nav.width);
    expect(search.x - (nav.x + nav.width)).toBeCloseTo(30, 0);
    await expect.poll(async () => {
      const form = await page.locator(".header-search form").boundingBox();
      return Math.abs(form.x - search.x);
    }).toBeLessThan(1);
    expect(cta.x + cta.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});

test("작은 화면에서 검색창이 메뉴를 밀지 않고 열린다", async ({ page }) => {
  for (const width of [900, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/");
    const search = page.locator(".header-search");
    if (width < 768) {
      const cta = page.locator(".header-cta");
      const menu = page.getByRole("button", { name: "전체 메뉴", exact: true });
      await expect(cta).toBeVisible();
      const ctaBounds = await cta.boundingBox();
      const menuBounds = await menu.boundingBox();
      expect(menuBounds.x).toBeGreaterThanOrEqual(ctaBounds.x + ctaBounds.width);
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(".header-popover")).toBeVisible();
      await menu.click();
    }
    await search.getByRole("button", { name: "헤더 검색 열기" }).click();
    const input = search.getByRole("textbox");
    await expect(input).toBeFocused();
    await input.fill("로고");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await input.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=/);
  }
});

test("모바일은 헤더 전체 검색 모드로 전환하고 닫기와 지우기를 지원한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const search = page.locator(".header-search");
  const trigger = search.getByRole("button", { name: "헤더 검색 열기" });
  await trigger.click();
  await expect(page.locator(".header .brand")).toBeHidden();
  const header = await page.locator(".header").boundingBox();
  const mode = await page.locator(".header-search-mode").boundingBox();
  expect(mode.y).toBe(header.y);
  expect(mode.height).toBeLessThanOrEqual(header.height);
  const input = search.getByRole("textbox");
  await input.fill("디자인");
  await search.getByRole("button", { name: "검색어 지우기" }).click();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await input.fill("React");
  await search.getByRole("button", { name: "검색 닫기" }).click();
  await expect(page.locator(".header .brand")).toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(input).toHaveValue("React");
  await input.press("Escape");
  await expect(input).toBeHidden();
});

test("태블릿은 확보된 공간에 따라 인라인 검색과 전체 헤더 모드를 선택한다", async ({ page }) => {
  for (const width of [768, 820, 900, 1024, 1051]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const search = page.locator(".header-search");
    const available = await search.evaluate(el => el.clientWidth);
    await search.getByRole("button", { name: "헤더 검색 열기" }).click();
    await expect(search.getByRole("textbox")).toBeFocused();
    await expect(page.locator(".header-search-mode")).toHaveCount(available < 240 ? 1 : 0);
    const input = await search.getByRole("textbox").boundingBox();
    const header = await page.locator(".header").boundingBox();
    expect(input.y + input.height).toBeLessThanOrEqual(header.y + header.height);
  }
});
