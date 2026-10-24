import { expect, type Locator, type Page } from "@playwright/test";

export const VIN = "WDD2050421R123456";

export async function checkFitment(page: Page, part: string, vin: string): Promise<void> {
  await page.goto("/fitment");
  await page.getByLabel("Part number").fill(part);
  await page.getByLabel("VIN", { exact: true }).fill(vin);
  await page.getByRole("button", { name: "Check fitment" }).click();
}

export function banner(page: Page, title: string): Locator {
  return page.getByRole("alert").filter({ hasText: title });
}

export async function checkFittingPart(page: Page): Promise<void> {
  await checkFitment(page, "A0004204102", VIN);
  await expect(banner(page, "Fits your vehicle")).toBeVisible();
}

export type BannerResult = "fits" | "superseded" | "no_fit";

// Computed colours of the Figma banner fills (fitment-tokens.css). A swapped style fails here.
const BANNER_BACKGROUNDS = {
  fits: "rgb(234, 247, 238)",
  superseded: "rgb(255, 246, 224)",
  no_fit: "rgb(255, 241, 242)",
} satisfies Record<BannerResult, string>;

export async function expectBannerStyle(banner: Locator, result: BannerResult): Promise<void> {
  await expect(banner).toHaveAttribute("data-result", result);
  await expect(banner).toHaveCSS("background-color", BANNER_BACKGROUNDS[result]);
}

export function hasNoHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}
