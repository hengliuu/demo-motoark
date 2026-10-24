export class NetworkError extends Error {
  constructor(options?: ErrorOptions) {
    super("The request did not reach the server", options);
    this.name = "NetworkError";
  }
}

export interface ApiResult {
  status: number;
  body: unknown;
}

export async function apiGet(path: string, params: Record<string, string> = {}): Promise<ApiResult> {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${path}?${query}` : path;

  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (cause) {
    throw new NetworkError({ cause });
  }

  return { status: response.status, body: await readJson(response) };
}

// A gateway error page is HTML, so an unreadable body is data (null), not a failure.
// Callers decide from the status.
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
