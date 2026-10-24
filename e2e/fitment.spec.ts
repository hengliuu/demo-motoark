import { expect, test } from "@playwright/test";
import { banner, checkFitment, checkFittingPart, VIN } from "./support/fitment";

test("MOTO-01-TC01 a fitting part shows Fits", { tag: "@smoke" }, async ({ page }) => {
  await checkFittingPart(page);

  const summary = page.getByRole("region", { name: "Vehicle and part checked" });
  await expect(summary).toContainText("Mercedes-Benz C 200");
  await expect(summary).toContainText("W205, 2019");

  await expect(page.getByRole("heading", { name: "3 sellers have this part" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
  await expect(page.getByText(/^AED [\d,]+$/)).toHaveText(["AED 899", "AED 1,250", "AED 1,480"]);
  await expect(page.getByRole("button", { name: /add to cart/i })).toHaveCount(0);
});

test("MOTO-01-TC02 a superseded part shows the new number", async ({ page }) => {
  await checkFitment(page, "A2059062203", VIN);

  const alert = banner(page, "Superseded");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("A 205 906 22 03");
  await expect(alert).toContainText("A 205 906 59 03");
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2);
  await expect(page.getByText(/^AED [\d,]+$/)).toHaveText(["AED 1,250", "AED 2,150"]);
});

test("MOTO-01-TC03 a part that does not fit shows No fit", async ({ page }) => {
  await checkFitment(page, "A1669060103", VIN);

  await expect(banner(page, "Does not fit this vehicle")).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
  await expect(page.getByText(/^AED [\d,]+$/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Search parts/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Check another part" }).click();
  await expect(page.getByLabel("VIN", { exact: true })).toHaveValue(VIN);
  await expect(page.getByLabel("Part number")).toHaveValue("");
  await expect(banner(page, "Does not fit this vehicle")).toHaveCount(0);
});

test("MOTO-01-TC05 a short VIN is rejected in the browser", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/fitment")) apiRequests.push(request.url());
  });

  await checkFitment(page, "A0004204102", "WDD2050421R12345");

  await expect(page.getByText("Enter the 17-character VIN from your registration card")).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test("MOTO-01-TC07 a valid but unknown VIN", async ({ page }) => {
  await checkFitment(page, "A0004204102", "WDD2050421R999999");

  await expect(page.getByText("We couldn't find this VIN. Check it against your registration card")).toBeVisible();
});

test("MOTO-01-TC09 prices and the Tabby split", async ({ page }) => {
  await checkFittingPart(page);

  const card1250 = page.getByRole("heading", { level: 3 }).filter({ hasText: "Sharjah Parts Yard" }).locator("../../..");
  await expect(card1250).toContainText("AED 1,250");
  await expect(card1250).toContainText("or 4 payments of AED 312.50 with Tabby");

  const card899 = page.getByRole("heading", { level: 3 }).filter({ hasText: "Al Quoz Auto Recyclers" }).locator("../../..");
  await expect(card899).toContainText("AED 899");
  await expect(card899).toContainText("or 4 payments of AED 224.75 with Tabby");
});

test("MOTO-01-TC11 mobile layout at 390 px", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "TC11 runs at 390 by 844 on the mobile project only");

  await page.goto("/fitment");
  const partBox = await page.getByLabel("Part number").boundingBox();
  const vinBox = await page.getByLabel("VIN", { exact: true }).boundingBox();
  expect(partBox).not.toBeNull();
  expect(vinBox).not.toBeNull();
  expect(vinBox!.y).toBeGreaterThanOrEqual(partBox!.y + partBox!.height);

  await checkFittingPart(page);

  const noHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noHorizontalScroll).toBe(true);
  await expect(banner(page, "Fits your vehicle")).toBeVisible();
});
