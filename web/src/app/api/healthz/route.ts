import { connection, NextResponse } from "next/server";
import { callUpstream } from "../_lib/upstream";

const UPSTREAM_PATH = "/healthz";

export async function GET(): Promise<Response> {
  // Cache Components would otherwise try to prerender this handler at build time.
  await connection();
  try {
    const { status } = await callUpstream(UPSTREAM_PATH, new Headers({ Accept: "application/json" }));
    if (status === 200) return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("healthz route: Go API call failed", error instanceof Error ? error.name : "unknown");
  }
  return NextResponse.json({ status: "unavailable" }, { status: 503 });
}
