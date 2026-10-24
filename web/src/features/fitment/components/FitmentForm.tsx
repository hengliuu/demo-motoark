"use client";

import { LoaderCircle, Search } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { InputForm } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { FitmentFormValues } from "../types";

const INPUT_CLASS =
  "h-11 rounded-input border-(--fitment-line-2) bg-white px-3.5 text-[15px] md:text-[15px] placeholder:text-(color:--fitment-fg-4)";
const HINT_CLASS = "text-(color:--fitment-fg-2)";

interface FitmentFormProps {
  form: UseFormReturn<FitmentFormValues>;
  onSubmit: (values: FitmentFormValues) => void;
  isPending: boolean;
}

export function FitmentForm({ form, onSubmit, isPending }: FitmentFormProps) {
  return (
    <Card className="gap-5 rounded-card bg-white p-5 ring-0 border border-(--fitment-line) md:p-7">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg leading-[26px] font-bold text-ink">Check a part</h2>
        <p className="text-[13px] leading-5 text-(color:--fitment-fg-2)">
          Enter the OEM part number from the label and the VIN of your car.
        </p>
      </div>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col items-start gap-5">
        <div className="grid w-full gap-4 md:grid-cols-2">
          <InputForm
            control={form.control}
            name="part"
            label="Part number"
            placeholder="e.g. A 205 906 22 03"
            description="Spaces, dots and dashes are fine"
            autoComplete="off"
            autoCapitalize="characters"
            className={INPUT_CLASS}
            descriptionClassName={HINT_CLASS}
          />
          <InputForm
            control={form.control}
            name="vin"
            label="VIN"
            placeholder="17 characters, e.g. WDD2050421R123456"
            description="17 characters, on your registration card (Mulkiya)"
            autoComplete="off"
            autoCapitalize="characters"
            className={INPUT_CLASS}
            descriptionClassName={HINT_CLASS}
          />
        </div>
        <Button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          className="h-11 w-full gap-2 rounded-input bg-ink px-[18px] text-[15px] font-bold text-white hover:bg-ink/90 md:w-auto"
        >
          {isPending ? (
            <LoaderCircle aria-hidden className="size-[18px] animate-spin" />
          ) : (
            <Search aria-hidden className="size-[18px]" />
          )}
          Check fitment
        </Button>
      </form>
    </Card>
  );
}
