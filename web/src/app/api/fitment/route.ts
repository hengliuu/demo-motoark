import { getCloudflareContext } from "@opennextjs/cloudflare";
import { connection, type NextRequest, NextResponse } from "next/server";

const UPSTREAM_PATH = "/v1/fitment";
const UPSTREAM_TIMEOUT_MS = 5_000;
const SERVICE_BINDING_ORIGIN = "http://api";

const UNAVAILABLE_BODY = {
  error: { code: "unavailable", message: "Fitment check is unavailable right now" },
} as const;

interface Upstream {
  fetch(input: string, init: RequestInit): Promise<Response>;
}

function isUpstream(value: unknown): value is Upstream {
  return typeof value === "object" && value !== null && "fetch" in value && typeof value.fetch === "function";
}

function serviceBinding(): Upstream | null {
  try {
    const binding: unknown = Reflect.get(getCloudflareContext().env, "API");
    return isUpstream(binding) ? binding : null;
  } catch {
    // No Cloudflare context, as under plain `next dev` or `next start`.
    return null;
  }
}

function resolveUpstream(query: URLSearchParams): { upstream: Upstream; url: string } {
  const path = `${UPSTREAM_PATH}?${query.toString()}`;

  const binding = serviceBinding();
  if (binding) return { upstream: binding, url: `${SERVICE_BINDING_ORIGIN}${path}` };

  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) throw new Error("Neither the API service binding nor API_BASE_URL is configured");
  return { upstream: { fetch: (input, init) => fetch(input, init) }, url: `${baseUrl}${path}` };
}

function unavailable(): NextResponse {
  return NextResponse.json(UNAVAILABLE_BODY, { status: 503 });
}

async function callUpstream(request: NextRequest): Promise<{ status: number; body: string; contentType: string }> {
  const { searchParams } = request.nextUrl;
  const query = new URLSearchParams({
    part: searchParams.get("part") ?? "",
    vin: searchParams.get("vin") ?? "",
  });
  const { upstream, url } = resolveUpstream(query);

  const headers = new Headers({ Accept: "application/json" });
  const requestId = request.headers.get("x-request-id");
  if (requestId) headers.set("X-Request-ID", requestId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await upstream.fetch(url, { headers, signal: controller.signal });
    return {
      status: response.status,
      body: await response.text(),
      contentType: response.headers.get("content-type") ?? "application/json",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  // Cache Components would otherwise try to prerender this handler at build time.
  await connection();
  try {
    const { status, body, contentType } = await callUpstream(request);
    if (status >= 500) return unavailable();
    return new Response(body, { status, headers: { "content-type": contentType } });
  } catch (error) {
    // The query string holds the VIN, so log only the error, never the URL.
    console.error("fitment route: Go API call failed", error instanceof Error ? error.name : "unknown");
    return unavailable();
  }
}
