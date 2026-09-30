import { test, expect } from "@playwright/test";

test("예산 직접 입력, 유효성 검사, 새로고침 유지 및 빠른 선택 전환", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: "예산", exact: true }).click();
  await page.getByLabel("최소 금액").fill("90,000");
  await page.getByLabel("최대 금액").fill("160,000");
  await page.getByRole("button", { name: "예산 적용" }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await expect(page.locator(".applied-filters")).toContainText(
    "예산 90,000원 ~ 160,000원",
  );
  await page.reload();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page.getByRole("button", { name: "예산", exact: true }).click();
  await expect(page.getByLabel("최소 금액")).toHaveValue("90000");
  await page.getByLabel("최대 금액").fill("80000");
  await page.getByRole("button", { name: "예산 적용" }).click();
  await expect(page.getByRole("alert")).toContainText("최대 금액");
  await page.getByLabel("최소 금액").fill("");
  await page.getByLabel("최대 금액").press("Enter");
  await expect(page.locator(".project-card")).toHaveCount(2);
  await expect(page.locator(".applied-filters")).toContainText(
    "예산 80,000원 이하",
  );
  await page.getByRole("button", { name: "예산", exact: true }).click();
  await page.getByRole("button", { name: "30만원 이상", exact: true }).click();
  await expect(page).not.toHaveURL(/budgetMin|budgetMax/);
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "예산", exact: true }).click();
  await page.getByLabel("최소 금액").fill("150000");
  await page.getByRole("button", { name: "예산 적용" }).click();
  await expect(page.locator(".project-card")).toHaveCount(3);
  await expect(page).not.toHaveURL(/budget=/);
  await page
    .locator(".applied-filters")
    .getByRole("button", { name: "예산 150,000원 이상" })
    .click();
  await expect(page.locator(".project-card")).toHaveCount(6);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
