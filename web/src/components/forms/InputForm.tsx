"use client";

import { CircleX } from "lucide-react";
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface InputFormProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  placeholder?: string;
  description?: string;
  autoComplete?: string;
  autoCapitalize?: string;
  maxLength?: number;
  className?: string;
  descriptionClassName?: string;
}

export function InputForm<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  description,
  autoComplete,
  autoCapitalize,
  maxLength,
  className,
  descriptionClassName,
}: InputFormProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className="gap-2">
          {label && (
            <FieldLabel htmlFor={field.name} className="text-sm leading-5 font-semibold text-ink">
              {label}
            </FieldLabel>
          )}
          <Input
            {...field}
            id={field.name}
            value={field.value ?? ""}
            placeholder={placeholder}
            autoComplete={autoComplete}
            autoCapitalize={autoCapitalize}
            maxLength={maxLength}
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.invalid ? `${field.name}-error` : undefined}
            className={cn("aria-invalid:border-brand aria-invalid:ring-brand/20", className)}
          />
          {fieldState.invalid ? (
            <FieldError id={`${field.name}-error`} className="flex items-start gap-1.5 text-[13px] leading-5 text-brand">
              <CircleX aria-hidden className="mt-[3px] size-3.5 shrink-0" />
              <span>{fieldState.error?.message}</span>
            </FieldError>
          ) : (
            description && (
              <FieldDescription className={cn("text-[13px] leading-5", descriptionClassName)}>{description}</FieldDescription>
            )
          )}
        </Field>
      )}
    />
  );
}
