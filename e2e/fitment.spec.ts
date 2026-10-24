import { expect, test, type Page } from "@playwright/test";
import { banner, checkFitment, checkFittingPart, expectBannerStyle, hasNoHorizontalScroll, VIN } from "./support/fitment";

test("MOTO-01-TC01 a fitting part shows Fits", { tag: "@smoke" }, async ({ page }) => {
  await checkFittingPart(page);
  await expectBannerStyle(banner(page, "Fits your vehicle"), "fits");

  const summary = page.getByRole("region", { name: "Vehicle and part checked" });
  await expect(summary).toContainText("Mercedes-Benz C 200");
  await expect(summary).toContainText("W205, 2019");

  await expect(page.getByRole("heading", { name: "3 sellers have this part" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
  await expect(page.getByText(/^AED [\d,]+$/)).toHaveText(["AED 899", "AED 1,250", "AED 1,480"]);
});

test("MOTO-01-TC02 a superseded part shows the new number", async ({ page }) => {
  await checkFitment(page, "A2059062203", VIN);

  const alert = banner(page, "Superseded");
  await expect(alert).toBeVisible();
  await expectBannerStyle(alert, "superseded");
  await expect(alert).toContainText("A 205 906 22 03");
  await expect(alert).toContainText("A 205 906 59 03");
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2);
  await expect(page.getByText(/^AED [\d,]+$/)).toHaveText(["AED 1,250", "AED 2,150"]);
});

test("MOTO-01-TC03 a part that does not fit shows No fit", async ({ page }) => {
  await checkFitment(page, "A1669060103", VIN);

  const alert = banner(page, "Does not fit this vehicle");
  await expect(alert).toBeVisible();
  await expectBannerStyle(alert, "no_fit");
  const summary = page.getByRole("region", { name: "Vehicle and part checked" });
  await expect(summary).toContainText("Mercedes-Benz C 200");
  await expect(summary).toContainText("W205, 2019");
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
  await expect(page.getByText(/^AED [\d,]+$/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Search parts/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Check another part" }).click();
  await expect(page.getByLabel("VIN", { exact: true })).toHaveValue(VIN);
  await expect(page.getByLabel("Part number")).toHaveValue("");
  await expect(banner(page, "Does not fit this vehicle")).toHaveCount(0);
});

test("MOTO-01-TC14 a part number outside the catalogue shows No fit", async ({ page }) => {
  await checkFitment(page, "Z9999999999", VIN);

  const alert = banner(page, "Does not fit this vehicle");
  await expect(alert).toBeVisible();
  await expectBannerStyle(alert, "no_fit");
  await expect(page.locator("[data-listing-id]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check another part" })).toBeVisible();
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

  const card1250 = page.locator('[data-listing-id="L-1002"]');
  await expect(card1250).toContainText("AED 1,250");
  await expect(card1250).toContainText("or 4 payments of AED 312.50 with Tabby");

  const card899 = page.locator('[data-listing-id="L-1001"]');
  await expect(card899).toContainText("AED 899");
  await expect(card899).toContainText("or 4 payments of AED 224.75 with Tabby");
});

test("MOTO-01-TC11 mobile layout at 390 px", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "TC11 runs at 390 by 844 on the mobile project only");

  await page.goto("/fitment");
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  const partBox = await page.getByLabel("Part number").boundingBox();
  const vinBox = await page.getByLabel("VIN", { exact: true }).boundingBox();
  expect(partBox).not.toBeNull();
  expect(vinBox).not.toBeNull();
  expect(vinBox!.y).toBeGreaterThanOrEqual(partBox!.y + partBox!.height);

  await checkFittingPart(page);

  expect(await hasNoHorizontalScroll(page)).toBe(true);
  await expect(banner(page, "Fits your vehicle")).toBeVisible();
});

async function openForm(page: Page): Promise<void> {
  await page.goto("/fitment");
}

test("MOTO-01-TC22 every control on the page works and nothing is fake", async ({ page }) => {
  await page.goto("/fitment");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toHaveText(/^\s*MotoArk\s*DEMO\s*Fitment Check\s*$/);
  await expect(nav.getByRole("link")).toHaveCount(2);
  await expect(nav.getByRole("button")).toHaveCount(0);

  const links = [
    { label: "wordmark", locator: nav.getByRole("link", { name: /MotoArk/ }), url: /\/$/ },
    { label: "breadcrumb Home", locator: page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Home" }), url: /\/$/ },
    { label: "Fitment Check", locator: nav.getByRole("link", { name: "Fitment Check" }), url: /\/fitment$/ },
  ];
  for (const open of [openForm, checkFittingPart]) {
    for (const { label, locator, url } of links) {
      await open(page);
      await locator.click();
      await expect(page, `${open.name}: ${label}`).toHaveURL(url);
    }
  }
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "MotoArk demo" })).toBeVisible();

  await checkFittingPart(page);
  await expect(page.getByRole("button", { name: /add to cart/i })).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /sort/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /search|cart/i })).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await page.getByRole("button", { name: "New search" }).click();
  await expect(banner(page, "Fits your vehicle")).toHaveCount(0);
  await expect(page.getByLabel("Part number")).toHaveValue("");
  await expect(page.getByLabel("VIN", { exact: true })).toHaveValue("");

  await checkFitment(page, "A1669060103", VIN);
  await expect(banner(page, "Does not fit this vehicle")).toBeVisible();
  await expect(page.getByRole("link", { name: /search|cart/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Check another part" }).click();
  await expect(banner(page, "Does not fit this vehicle")).toHaveCount(0);
  await expect(page.getByLabel("VIN", { exact: true })).toHaveValue(VIN);
  await expect(page.getByLabel("Part number")).toHaveValue("");
  await expect(page.getByLabel("Part number")).toBeFocused();
});
