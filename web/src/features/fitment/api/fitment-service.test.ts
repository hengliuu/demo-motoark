import { afterEach, describe, expect, it, vi } from "vitest";
import { FitmentError } from "../types/fitment-error";
import { fitmentService } from "./fitment-service";

const REQUEST = { part: "A0004204102", vin: "WDD2050421R123456" };

const FITS_BODY = {
  result: "fits",
  vehicle: { vin: "WDD2050421R123456", make: "Mercedes-Benz", model: "C 200", chassis: "W205", year: 2019 },
  part: { number: "A0004204102", name: "Front brake pad set" },
  resolved: { number: "A0004204102", name: "Front brake pad set", chain: ["A0004204102"] },
  listings: [
    { id: "L-1001", yard: "Al Quoz Auto Recyclers", grade: "A", price_aed: 899, warranty_days: 30, delivery: "Next day" },
  ],
};

function stubFetch(response: Response | Error): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function errorFrom(promise: Promise<unknown>): Promise<FitmentError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(FitmentError);
  return error as FitmentError;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fitmentService.check", () => {
  it("MOTO-01-TC10 a network error maps to unavailable", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    const error = await errorFrom(fitmentService.check(REQUEST));
    expect(error.code).toBe("unavailable");
    expect(error.message).toBe("Fitment check is unavailable right now");
  });

  it("MOTO-01-TC10 a 503 from the route maps to unavailable", async () => {
    stubFetch(
      jsonResponse(
        { error: { code: "unavailable", message: "Fitment check is unavailable right now" } },
        503,
      ),
    );
    const error = await errorFrom(fitmentService.check(REQUEST));
    expect(error.code).toBe("unavailable");
  });

  it("MOTO-01-TC10 any other 5xx, even with a body that is not JSON, maps to unavailable", async () => {
    stubFetch(new Response("<html>Bad gateway</html>", { status: 502 }));
    const error = await errorFrom(fitmentService.check(REQUEST));
    expect(error.code).toBe("unavailable");
  });

  it("MOTO-01-TC10 a 200 with a body that breaks the contract maps to unavailable", async () => {
    stubFetch(jsonResponse({ result: "maybe" }, 200));
    const error = await errorFrom(fitmentService.check(REQUEST));
    expect(error.code).toBe("unavailable");
  });

  it("MOTO-01-TC07 a 404 unknown_vin maps to the unknown VIN error", async () => {
    stubFetch(
      jsonResponse(
        { error: { code: "unknown_vin", message: "We couldn't find this VIN. Check it against your registration card" } },
        404,
      ),
    );
    const error = await errorFrom(fitmentService.check(REQUEST));
    expect(error.code).toBe("unknown_vin");
    expect(error.message).toBe("We couldn't find this VIN. Check it against your registration card");
  });

  it("MOTO-01-TC05 a 400 invalid_vin keeps its code", async () => {
    stubFetch(
      jsonResponse(
        { error: { code: "invalid_vin", message: "Enter the 17-character VIN from your registration card" } },
        400,
      ),
    );
    const error = await errorFrom(fitmentService.check(REQUEST));
    expect(error.code).toBe("invalid_vin");
  });

  it("MOTO-01-TC01 a 200 fits response is parsed, and the request carries part and VIN", async () => {
    const fetchMock = stubFetch(jsonResponse(FITS_BODY, 200));
    const response = await fitmentService.check(REQUEST);
    expect(response.result).toBe("fits");
    expect(response.listings[0]?.priceAed).toBe(899);
    expect(fetchMock).toHaveBeenCalledOnce();
    const calledWith = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledWith).toContain("/api/fitment?");
    expect(calledWith).toContain("part=A0004204102");
    expect(calledWith).toContain("vin=WDD2050421R123456");
  });
});
