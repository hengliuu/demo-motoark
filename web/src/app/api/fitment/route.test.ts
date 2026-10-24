import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCloudflareContext } = vi.hoisted(() => ({ getCloudflareContext: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(),
}));

import nextConfig from "../../../../next.config";
import { GET } from "./route";

const UNAVAILABLE_BODY = {
  error: { code: "unavailable", message: "Fitment check is unavailable right now" },
};
const UNKNOWN_VIN_BODY = {
  error: {
    code: "unknown_vin",
    message: "We couldn't find this VIN. Check it against your registration card",
  },
};

function request(search = "?part=A0004204102&vin=WDD2050421R123456", headers: HeadersInit = {}) {
  return new NextRequest(`http://localhost:3105/api/fitment${search}`, { headers });
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GET /api/fitment", () => {
  const fetchStub = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchStub);
    vi.stubEnv("API_BASE_URL", "http://api.test");
    getCloudflareContext.mockImplementation(() => {
      throw new Error("no cloudflare context");
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchStub.mockReset();
    getCloudflareContext.mockReset();
  });

  it("MOTO-01-TC20 Go API unreachable gives 503 unavailable", async () => {
    fetchStub.mockRejectedValue(new TypeError("fetch failed"));

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(UNAVAILABLE_BODY);
  });

  it("MOTO-01-TC20 Go 502 gives 503 unavailable", async () => {
    fetchStub.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(UNAVAILABLE_BODY);
  });

  it("MOTO-01-TC20 Go API silent for 5 seconds gives 503 unavailable", async () => {
    vi.useFakeTimers();
    fetchStub.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );

    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await pending;

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(UNAVAILABLE_BODY);
  });

  it("MOTO-01-TC07 Go 404 unknown_vin passes through unchanged", async () => {
    fetchStub.mockResolvedValue(jsonResponse(UNKNOWN_VIN_BODY, 404));

    const response = await GET(request("?part=A0004204102&vin=WDD2050421R999999"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(UNKNOWN_VIN_BODY);
  });

  it("MOTO-01-TC01 Go 200 passes through and part, vin and X-Request-ID reach the Go API", async () => {
    const body = { result: "fits", listings: [] };
    fetchStub.mockResolvedValue(jsonResponse(body, 200));

    const response = await GET(request(undefined, { "x-request-id": "req-123" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    const [url, init] = fetchStub.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api.test/v1/fitment?part=A0004204102&vin=WDD2050421R123456");
    expect(new Headers(init?.headers).get("x-request-id")).toBe("req-123");
  });

  it("MOTO-01-TC23 uses the API service binding when Cloudflare provides one", async () => {
    const binding = { fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ result: "fits" }, 200)) };
    getCloudflareContext.mockReturnValue({ env: { API: binding } });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(binding.fetch).toHaveBeenCalledOnce();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("MOTO-01-TC21 an upstream failure logs nothing that holds the VIN", async () => {
    const calledUrl = "http://api.test/v1/fitment?part=A0004204102&vin=WDD2050421R123456";
    fetchStub.mockRejectedValue(new TypeError(`fetch failed for ${calledUrl}`, { cause: new Error(calledUrl) }));
    const logged = [
      vi.spyOn(console, "error").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "log").mockImplementation(() => {}),
    ];

    const response = await GET(request());

    expect(response.status).toBe(503);
    const loggedText = logged.flatMap((spy) => spy.mock.calls.flat()).map(String);
    expect(loggedText.length).toBeGreaterThan(0);
    expect(loggedText.join("\n")).not.toContain("R123456");
  });

  it("MOTO-01-TC21 the Next request log skips /api/fitment, where the query string holds the VIN", () => {
    const incoming = typeof nextConfig.logging === "object" ? nextConfig.logging.incomingRequests : undefined;
    const ignore = typeof incoming === "object" ? (incoming.ignore ?? []) : [];

    expect(ignore.some((pattern) => pattern.test("/api/fitment?part=A0004204102&vin=WDD2050421R123456"))).toBe(true);
  });
});
