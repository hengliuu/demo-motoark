# Reusable Form Wrappers

## Contents

- Why the wrappers exist
- Which shadcn form style the project uses
- Existing wrappers
- The wrapper contract (Field style, then the older Form style)
- Adding a new wrapper
- Using wrappers in a feature form

Location: `src/components/forms/`, re-exported from `components/forms/index.ts`.

## Why

Shadcn gives low-level primitives (`Input`, `Textarea`, `Checkbox`) plus form layout pieces.
Used raw, **every field** in a page needs around ten lines of boilerplate. We wrap each
primitive once in a generic, type-safe component so feature forms stay short:

```tsx
<InputForm control={form.control} name="email" label={t("auth.login.email")} startIcon={Mail} />
```

## Which shadcn form style the project uses

Look in `components/ui/` before writing a wrapper:

| File present | Style | Inner pieces |
|---|---|---|
| `field.tsx` | current shadcn docs | react-hook-form `Controller` + `Field`, `FieldLabel`, `FieldDescription`, `FieldError` |
| `form.tsx` only | older shadcn | `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` |

Keep whichever the project already uses. Mixing both in one app gives two error styles. The
wrapper's **props contract is the same in both**, so feature forms never notice which one is
inside.

## Existing wrappers

Check the barrel first. Typical set:

- `InputForm`: text, email or password input, `startIcon`, password toggle, `onEnter`.
- `TextareaForm`: multi-line, `rows`, `maxLength`, `showCount`.
- `NumberInputForm`: numeric, `prefix` and `suffix`, optional thousand separators.
- `CheckboxForm`: boolean.
- `SelectForm`: options list.
- `TagInputForm`: array of strings.
- `FileUploadForm`: file picker with preview.

Extend an existing wrapper with an optional prop rather than forking a near-duplicate.

Custom atoms in `components/base/` (component-layers.md) get a wrapper here too, in the same
change that adds the atom, for example `CheckboxCardForm` wrapping `base/CheckboxCard`.

## The wrapper contract

### Field style (current shadcn)

```tsx
"use client"; // Next.js only, omit in a Vite SPA

import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface InputFormProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>; // typed against T, autocompletes the schema's field names
  label?: string;
  placeholder?: string;
  description?: string;
  className?: string;
}

export function InputForm<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  description,
  className,
}: InputFormProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          {label && <FieldLabel htmlFor={field.name}>{label}</FieldLabel>}
          <Input
            {...field}
            id={field.name}
            value={field.value ?? ""}
            placeholder={placeholder}
            aria-invalid={fieldState.invalid}
            className={cn(className)}
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
```

### Form style (older shadcn)

Same props, different inside:

```tsx
<FormField
  control={control}
  name={name}
  render={({ field }) => (
    <FormItem>
      {label && <FormLabel>{label}</FormLabel>}
      <FormControl>
        <Input {...field} value={field.value ?? ""} placeholder={placeholder} className={cn(className)} />
      </FormControl>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      <FormMessage />
    </FormItem>
  )}
/>
```

### Rules

1. **Generic over `T extends FieldValues`.** `control: Control<T>` with `name: Path<T>` makes
   `name` autocomplete and type-check against the form's Zod-inferred type. Never type `name`
   as plain `string`.
2. **One component per primitive.** No mega-wrapper with a `type` switch across unrelated
   primitives.
3. **Render the standard pieces:** optional label, the primitive, optional description, the
   error (`FieldError` or `FormMessage`).
4. **Mark invalid state for assistive tech:** `aria-invalid` on the control and
   `data-invalid` on `Field` (Field style).
5. **Guard controlled values:** `value={field.value ?? ""}` avoids React's controlled vs
   uncontrolled warning when a field starts undefined.
6. **Merge `className` with `cn()`**, never overwrite the primitive's base classes.
7. **`"use client"` at the top in Next.js only.** A Vite SPA has no client boundary.

## Adding a new wrapper

1. Create `components/forms/<Name>Form.tsx` following the contract above.
2. Add `export { <Name>Form } from "./<Name>Form";` to `components/forms/index.ts`.
3. Use it in feature forms via `import { <Name>Form } from "@/components/forms";`.

## Using wrappers in a feature form

```tsx
"use client"; // Next.js only, omit in a Vite SPA

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { InputForm, TextareaForm } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { useCreateOrder } from "../api/use-orders-mutations";
import { createOrderSchema, type CreateOrderValues } from "../types";

export function CreateOrderForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { mutate, isPending } = useCreateOrder();
  const form = useForm<CreateOrderValues>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: { customerName: "", notes: "" },
  });

  function onSubmit(values: CreateOrderValues) {
    mutate(values, { onSuccess: onDone });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <InputForm control={form.control} name="customerName" label={t("orders.form.customer")} />
      <TextareaForm control={form.control} name="notes" label={t("orders.form.notes")} showCount maxLength={280} />
      <Button type="submit" disabled={isPending}>{t("common.save")}</Button>
    </form>
  );
}
```

The older Form style wraps the `<form>` in shadcn's `<Form {...form}>` provider. The Field
style does not need it. The schema and inferred type live in `features/<x>/types/`, and the
mutation hook comes from the same feature's `api/` (sibling import by direct path).
