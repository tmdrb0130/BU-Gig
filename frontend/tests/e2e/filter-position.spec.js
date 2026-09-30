import { test, expect } from "@playwright/test";

test("필터 패널이 해당 버튼 아래에 열리고 화면 너비 변경에 맞춰 정렬된다", async ({
  page,
}) => {
  for (const route of ["/projects", "/experts"]) {
    await page.goto(route);
    for (const width of [1440, 900]) {
      await page.setViewportSize({ width, height: 1000 });
      const buttons = page.locator(".filter-button[aria-expanded]");
      for (const button of await buttons.all()) {
        await button.hover();
        const panel = page.locator(".filter-panel");
        await expect(panel).toBeVisible();
        const anchor = await button.boundingBox();
        const wrap = await page.locator(".filter-wrap").boundingBox();
        await expect
          .poll(async () => {
            const bounds = await panel.boundingBox();
            const expectedLeft = Math.max(
              wrap.x,
              Math.min(anchor.x, wrap.x + wrap.width - bounds.width),
            );
            return (
              Math.abs(bounds.x - expectedLeft) < 2 &&
              Math.abs(bounds.y - anchor.y - anchor.height - 6) < 2
            );
          })
          .toBeTruthy();
        const bounds = await panel.boundingBox();
        await page.mouse.move(bounds.x + 20, bounds.y + 20);
        await expect(panel).toBeVisible();
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".filter-panel")).toBeVisible();
  const mobile = await page.locator(".filter-panel").boundingBox();
  expect(mobile.x).toBe(0);
  expect(mobile.width).toBe(390);
  await page.getByRole("button", { name: "필터 닫기" }).click();
  await expect(page.locator(".filter-panel")).toHaveCount(0);
});
