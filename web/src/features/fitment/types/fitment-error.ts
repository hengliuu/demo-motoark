import { FITMENT_MESSAGES } from "../constants/fitment-messages";

export type FitmentErrorCode = keyof typeof FITMENT_MESSAGES;

export class FitmentError extends Error {
  readonly code: FitmentErrorCode;

  constructor(code: FitmentErrorCode, options?: ErrorOptions) {
    super(FITMENT_MESSAGES[code], options);
    this.name = "FitmentError";
    this.code = code;
  }
}
