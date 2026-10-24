import { expect, test } from "@playwright/test";
import { checkFittingPart } from "./support/fitment";

test("MOTO-01-TC12 smoke test on staging", { tag: "@smoke" }, async ({ page, request }) => {
  const health = await request.get("/api/healthz");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });

  await checkFittingPart(page);
});
