import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCloudflareContext } = vi.hoisted(() => ({ getCloudflareContext: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(),
}));

import { GET } from "./route";

describe("GET /api/healthz", () => {
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
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchStub.mockReset();
    getCloudflareContext.mockReset();
  });

  it("MOTO-01-TC12 healthz is ok when the Go API is up", async () => {
    fetchStub.mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(String(fetchStub.mock.calls[0]?.[0])).toBe("http://api.test/healthz");
  });

  it("MOTO-01-TC20 healthz is unavailable when the Go API is down", async () => {
    fetchStub.mockRejectedValue(new TypeError("fetch failed"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("MOTO-01-TC20 healthz is unavailable when the Go API answers non-200", async () => {
    fetchStub.mockResolvedValue(new Response("nope", { status: 500 }));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("MOTO-01-TC20 healthz is unavailable when the Go API is silent for 5 seconds", async () => {
    vi.useFakeTimers();
    fetchStub.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );

    const pending = GET();
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await pending;

    expect(response.status).toBe(503);
  });

  it("MOTO-01-TC23 healthz uses the API service binding when Cloudflare provides one", async () => {
    const binding = { fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 })) };
    getCloudflareContext.mockReturnValue({ env: { API: binding } });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(String(binding.fetch.mock.calls[0]?.[0])).toBe("http://api/healthz");
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
