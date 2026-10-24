import { getCloudflareContext } from "@opennextjs/cloudflare";

const UPSTREAM_TIMEOUT_MS = 5_000;
const SERVICE_BINDING_ORIGIN = "http://api";

interface Upstream {
  fetch(input: string, init: RequestInit): Promise<Response>;
}

export interface UpstreamResult {
  status: number;
  body: string;
  contentType: string;
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

function resolveUpstream(path: string): { upstream: Upstream; url: string } {
  const binding = serviceBinding();
  if (binding) return { upstream: binding, url: `${SERVICE_BINDING_ORIGIN}${path}` };

  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) throw new Error("Neither the API service binding nor API_BASE_URL is configured");
  return { upstream: { fetch: (input, init) => fetch(input, init) }, url: `${baseUrl}${path}` };
}

export async function callUpstream(path: string, headers: Headers): Promise<UpstreamResult> {
  const { upstream, url } = resolveUpstream(path);

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
