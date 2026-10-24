import { expect, type Page } from "@playwright/test";

export const VIN = "WDD2050421R123456";

export async function checkFitment(page: Page, part: string, vin: string) {
  await page.goto("/fitment");
  await page.getByLabel("Part number").fill(part);
  await page.getByLabel("VIN", { exact: true }).fill(vin);
  await page.getByRole("button", { name: "Check fitment" }).click();
}

export function banner(page: Page, title: string) {
  return page.getByRole("alert").filter({ hasText: title });
}

export async function checkFittingPart(page: Page) {
  await checkFitment(page, "A0004204102", VIN);
  await expect(banner(page, "Fits your vehicle")).toBeVisible();
}
