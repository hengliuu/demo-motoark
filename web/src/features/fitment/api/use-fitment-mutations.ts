import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { FitmentError } from "../types/fitment-error";
import type { FitmentFormValues, FitmentResponse } from "../types/fitment-schema";
import { fitmentService } from "./fitment-service";

export function useCheckFitment(): UseMutationResult<FitmentResponse, FitmentError, FitmentFormValues> {
  return useMutation<FitmentResponse, FitmentError, FitmentFormValues>({
    mutationFn: (values) => fitmentService.check(values),
  });
}
