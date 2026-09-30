import { test, expect } from "@playwright/test";

test("대분류를 넘나들며 세부 분야를 선택하고 적용·해제·취소한다", async ({
  page,
}) => {
  await page.goto("/projects");
  await page
    .getByRole("button", { name: "카테고리 선택", exact: true })
    .click();
  const panel = page.locator(".field-picker");
  await panel
    .getByRole("checkbox", { name: "로고 디자인", exact: true })
    .check();
  await page.getByRole("button", { name: "예산", exact: true }).hover();
  await expect(panel).toBeVisible();
  await panel
    .locator(".mega-categories")
    .getByRole("button", { name: "개발·IT" })
    .click();
  await panel
    .getByRole("checkbox", { name: "프론트엔드", exact: true })
    .check();
  await panel.getByRole("checkbox", { name: "백엔드", exact: true }).check();
  await expect(panel.locator(".field-selection")).toContainText(
    "디자인 · 로고 디자인",
  );
  await expect(page.locator(".project-card")).toHaveCount(6);
  await expect(page).not.toHaveURL(/field=/);
  await panel.getByRole("button", { name: "결과 2건 보기" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".project-card")).toHaveCount(2);
  await expect(
    page.locator(".applied-filters").getByRole("button"),
  ).toHaveCount(3);
  await page.reload();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page.getByRole("button", { name: /카테고리 선택/ }).click();
  await panel.getByRole("button", { name: "선택 초기화" }).click();
  await panel.getByRole("button", { name: "취소", exact: true }).click();
  await expect(
    page.locator(".applied-filters").getByRole("button"),
  ).toHaveCount(3);
  await page
    .locator(".applied-filters")
    .getByRole("button", { name: "디자인 · 로고 디자인" })
    .click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("button", { name: /카테고리 선택/ }).click();
  await panel
    .locator(".mega-categories")
    .getByRole("button", { name: "디자인", exact: true })
    .click();
  await panel.getByRole("checkbox", { name: "디자인 전체" }).check();
  await panel.getByRole("button", { name: "결과 3건 보기" }).click();
  await expect(page.locator(".project-card")).toHaveCount(3);
  await page.getByRole("button", { name: /카테고리 선택/ }).click();
  await panel
    .locator(".mega-categories")
    .getByRole("button", { name: /^디자인/ })
    .click();
  await panel
    .getByRole("checkbox", { name: "로고 디자인", exact: true })
    .uncheck();
  await expect(
    panel.getByRole("checkbox", { name: "포스터·인쇄물", exact: true }),
  ).toBeChecked();
  await panel.getByRole("button", { name: "결과 2건 보기" }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
});

test("모바일 분야 전체 선택과 실제 결과 수, 전문가·작업물에서도 공유", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/projects?budgetMax=200000");
  await page
    .getByRole("button", { name: "카테고리 선택", exact: true })
    .click();
  const panel = page.locator(".field-picker");
  await panel.getByRole("checkbox", { name: "디자인 전체" }).check();
  await panel
    .locator(".mega-categories")
    .getByRole("button", { name: "개발·IT" })
    .click();
  await panel.getByRole("checkbox", { name: "개발·IT 전체" }).check();
  await expect(
    panel.locator(".field-selection").getByRole("button"),
  ).toHaveCount(2);
  await panel.getByRole("button", { name: "결과 2건 보기" }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const query = new URL(page.url()).search;
  await page.goto(
    "/experts" + query.replace(/budgetMax=200000&?/, "").replace("?&", "?"),
  );
  await expect(page.locator(".expert-card")).toHaveCount(2);
  await page.getByRole("button", { name: /전문 분야 선택/ }).click();
  await expect(
    panel.locator(".field-selection").getByRole("button"),
  ).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await page.goto("/works?category=디자인");
  await page.getByRole("button", { name: /카테고리/ }).click();
  await expect(
    panel.getByRole("checkbox", { name: "디자인 전체" }),
  ).toBeChecked();
  await panel.getByRole("button", { name: "결과 3건 보기" }).click();
  await expect(page.locator(".portfolio-card")).toHaveCount(3);
});
