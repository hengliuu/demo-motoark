"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, type ReactElement } from "react";
import { useForm } from "react-hook-form";
import { useCheckFitment } from "../api/use-fitment-mutations";
import type { FitmentErrorCode } from "../types/fitment-error";
import { fitmentFormSchema, type FitmentFormValues } from "../types/fitment-schema";
import "../fitment-tokens.css";
import { FitmentForm } from "./FitmentForm";
import { FitmentResult } from "./FitmentResult";
import { ResultSkeleton } from "./ResultSkeleton";
import { UnavailableAlert } from "./UnavailableAlert";
import { VinHint } from "./VinHint";

const EMPTY_VALUES: FitmentFormValues = { part: "", vin: "" };

function fieldForError(code: FitmentErrorCode): keyof FitmentFormValues | null {
  switch (code) {
    case "invalid_part":
      return "part";
    case "invalid_vin":
    case "unknown_vin":
      return "vin";
    case "unavailable":
      return null;
    default: {
      const unreachable: never = code;
      throw new Error(`Unhandled fitment error: ${unreachable}`);
    }
  }
}

export function FitmentCheck(): ReactElement {
  const form = useForm<FitmentFormValues>({
    resolver: zodResolver(fitmentFormSchema),
    defaultValues: EMPTY_VALUES,
  });
  const check = useCheckFitment();
  const shouldFocusPart = useRef(false);

  useEffect(() => {
    if (!shouldFocusPart.current || check.isSuccess) return;
    shouldFocusPart.current = false;
    form.setFocus("part");
  }, [check.isSuccess, form]);

  function submit(values: FitmentFormValues) {
    check.mutate(values, {
      onError: (error) => {
        const field = fieldForError(error.code);
        if (field) form.setError(field, { type: "server", message: error.message });
      },
    });
  }

  function startNewSearch() {
    check.reset();
    form.reset(EMPTY_VALUES);
  }

  function checkAnotherPart() {
    const vin = check.variables?.vin ?? "";
    check.reset();
    form.reset({ part: "", vin });
    shouldFocusPart.current = true;
  }

  function retry() {
    if (check.variables) submit(check.variables);
  }

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
      {check.isSuccess ? (
        <FitmentResult response={check.data} searched={check.variables.part} onNewSearch={startNewSearch} onCheckAnother={checkAnotherPart} />
      ) : (
        <>
          <header className="flex flex-col gap-2.5">
            <p className="text-xs leading-4 font-bold tracking-[1.2px] text-brand">FITMENT CHECK</p>
            <h1 className="font-display text-2xl leading-[30px] font-extrabold tracking-[-0.48px] text-ink md:text-[32px] md:leading-9 md:tracking-[-0.64px]">
              Will this part fit your car?
            </h1>
            <p className="text-[15px] leading-[22px] text-(color:--fitment-fg-2) md:text-lg md:leading-7">
              Enter the OEM part number and your VIN. We check the official catalogue before you pay.
            </p>
          </header>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_384px]">
            <FitmentForm form={form} onSubmit={submit} isPending={check.isPending} />
            <VinHint />
          </div>
          {check.isPending && <ResultSkeleton />}
          {check.isError && check.error.code === "unavailable" && <UnavailableAlert onRetry={retry} />}
        </>
      )}
    </main>
  );
}
