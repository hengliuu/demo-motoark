import { z } from "zod";
import { FITMENT_MESSAGES } from "../constants/fitment-messages";
import { normalizePartNumber } from "../utils/format";

const PART_NUMBER_PATTERN = /^[A-Z0-9]+$/;
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export const fitmentFormSchema = z.object({
  part: z
    .string()
    .refine((value) => PART_NUMBER_PATTERN.test(normalizePartNumber(value)), FITMENT_MESSAGES.invalid_part),
  vin: z.string().trim().toUpperCase().regex(VIN_PATTERN, FITMENT_MESSAGES.invalid_vin),
});

export type FitmentFormValues = z.infer<typeof fitmentFormSchema>;

const vehicleSchema = z.object({
  vin: z.string(),
  make: z.string(),
  model: z.string(),
  chassis: z.string(),
  year: z.number().int(),
});

const listingSchema = z
  .object({
    id: z.string(),
    yard: z.string(),
    grade: z.enum(["A", "B", "C"]),
    price_aed: z.number().int().nonnegative(),
    warranty_days: z.number().int().nonnegative(),
    delivery: z.string(),
  })
  .transform(({ price_aed, warranty_days, ...listing }) => ({
    ...listing,
    priceAed: price_aed,
    warrantyDays: warranty_days,
  }));

export const fitmentResponseSchema = z.object({
  result: z.enum(["fits", "superseded", "no_fit"]),
  vehicle: vehicleSchema,
  part: z.object({ number: z.string(), name: z.string() }),
  resolved: z.object({ number: z.string(), name: z.string(), chain: z.array(z.string()) }),
  listings: z.array(listingSchema),
});

export type FitmentResponse = z.infer<typeof fitmentResponseSchema>;
export type FitmentResult = FitmentResponse["result"];
export type FitmentListing = FitmentResponse["listings"][number];

export const fitmentErrorBodySchema = z.object({
  error: z.object({ code: z.string() }),
});
