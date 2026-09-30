import { test, expect } from "@playwright/test";

test("프로젝트와 전문가 목록 카드의 공통 규격", async ({ page }) => {
  for (const width of [1440, 1280, 1024, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const records = [];
    for (const route of ["/projects", "/experts"]) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      const cards = page.locator(".result-list .list-card");
      await expect(cards.first()).toBeVisible();
      records.push(await cards.evaluateAll(items => items.map(card => {
        const image = card.querySelector(".project-image, .expert-image");
        return { height: card.getBoundingClientRect().height, width: card.getBoundingClientRect().width, imageWidth: image.getBoundingClientRect().width, imageHeight: image.getBoundingClientRect().height, padding: getComputedStyle(card).padding };
      })));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      if (width === 1440 || width === 320) await page.screenshot({path: `test-results/cards-${route.slice(1)}-${width}.png`, fullPage: true});
    }
    for (const [index, cards] of records.entries()) for (const card of cards) expect(card, `viewport ${width}, list ${index}, heights ${JSON.stringify(records.map(list => list.map(item => item.height)))}`).toEqual(records[0][0]);
  }
});

test("카드 저장 피드백과 주요 버튼 위치", async ({ page }) => {
  for (const width of [1440, 820, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/projects", "/experts"]) {
      await page.goto(route);
      const card = page.locator(".result-list .list-card").first();
      const save = card.locator(".save");
      const active = await save.getAttribute("aria-pressed");
      await save.click();
      await expect(save).toHaveAttribute("aria-pressed", active === "true" ? "false" : "true");
      await expect(save.locator(".save-feedback")).toHaveCount(1);
      expect(new URL(page.url()).pathname).toBe(route);
      const box = await card.boundingBox();
      const heart = await save.boundingBox();
      const button = await card.locator(".btn").boundingBox();
      expect(heart.x + heart.width).toBeLessThanOrEqual(box.x + box.width);
      expect(heart.y + heart.height).toBeLessThan(button.y);
      expect(button.y + button.height).toBeLessThanOrEqual(box.y + box.height);
      await page.reload();
      await expect(save).toHaveAttribute("aria-pressed", active === "true" ? "false" : "true");
      await expect(save.locator(".save-feedback")).toHaveCount(0);
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const save = page.locator(".result-list .save").first();
  await save.click();
  expect(await save.locator(".save-feedback").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
});
