import { apiGet, NetworkError, type ApiResult } from "@/lib/api-client";
import {
  FitmentError,
  fitmentErrorBodySchema,
  fitmentResponseSchema,
  type FitmentErrorCode,
  type FitmentFormValues,
  type FitmentResponse,
} from "../types";
import { normalizePartNumber } from "../utils/format";

const FITMENT_PATH = "/api/fitment";
const CLIENT_ERROR_CODES = ["invalid_part", "invalid_vin", "unknown_vin"] as const satisfies readonly FitmentErrorCode[];

function toClientErrorCode(body: unknown): (typeof CLIENT_ERROR_CODES)[number] | null {
  const parsed = fitmentErrorBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return CLIENT_ERROR_CODES.find((code) => code === parsed.data.error.code) ?? null;
}

function interpret(result: ApiResult): FitmentResponse {
  if (result.status === 200) {
    const parsed = fitmentResponseSchema.safeParse(result.body);
    if (parsed.success) return parsed.data;
    throw new FitmentError("unavailable", { cause: parsed.error });
  }

  const code = result.status < 500 ? toClientErrorCode(result.body) : null;
  throw new FitmentError(code ?? "unavailable");
}

export const fitmentService = {
  async check({ part, vin }: FitmentFormValues): Promise<FitmentResponse> {
    try {
      return interpret(await apiGet(FITMENT_PATH, { part: normalizePartNumber(part), vin }));
    } catch (error) {
      if (error instanceof NetworkError) throw new FitmentError("unavailable", { cause: error });
      throw error;
    }
  },
};
