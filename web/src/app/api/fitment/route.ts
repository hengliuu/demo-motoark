import { connection, type NextRequest, NextResponse } from "next/server";
import { callUpstream } from "../_lib/upstream";

const UPSTREAM_PATH = "/v1/fitment";

const UNAVAILABLE_BODY = {
  error: { code: "unavailable", message: "Fitment check is unavailable right now" },
} as const;

function unavailable(): NextResponse {
  return NextResponse.json(UNAVAILABLE_BODY, { status: 503 });
}

function callFitment(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = new URLSearchParams({
    part: searchParams.get("part") ?? "",
    vin: searchParams.get("vin") ?? "",
  });

  const headers = new Headers({ Accept: "application/json" });
  const requestId = request.headers.get("x-request-id");
  if (requestId) headers.set("X-Request-ID", requestId);

  return callUpstream(`${UPSTREAM_PATH}?${query.toString()}`, headers);
}

export async function GET(request: NextRequest): Promise<Response> {
  // Cache Components would otherwise try to prerender this handler at build time.
  await connection();
  try {
    const { status, body, contentType } = await callFitment(request);
    if (status >= 500) return unavailable();
    return new Response(body, { status, headers: { "content-type": contentType } });
  } catch (error) {
    // The query string holds the VIN, so log only the error, never the URL.
    console.error("fitment route: Go API call failed", error instanceof Error ? error.name : "unknown");
    return unavailable();
  }
}
