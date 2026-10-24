import { useMutation } from "@tanstack/react-query";
import type { FitmentError, FitmentFormValues, FitmentResponse } from "../types";
import { fitmentService } from "./fitment-service";

export function useCheckFitment() {
  return useMutation<FitmentResponse, FitmentError, FitmentFormValues>({
    mutationFn: (values) => fitmentService.check(values),
  });
}
