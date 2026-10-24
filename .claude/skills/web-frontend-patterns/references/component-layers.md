# Component Layers (atomic, on top of shadcn)

## Contents

- The five layers
- Before creating any component: the lookup order
- When a feature needs UI that shadcn does not have
- Worked example: a custom checkbox card
- Variants instead of copies
- Promotion and duplication rules

## The five layers

Components are layered from generic to specific. A layer may import from the layers **below**
it, never from above or sideways into a feature.

| Layer | Folder | Holds | Knows about |
|---|---|---|---|
| 1. Primitives | `components/ui/` | shadcn components (`Button`, `Input`, `Checkbox`, `Field`, `Dialog`) | nothing app-specific. CLI-managed, never hand-edited |
| 2. Custom atoms | `components/base/` | atoms shadcn lacks, or app-wide variants of a primitive (`CheckboxCard`, `CurrencyInput`, `StatusBadge`, `UserAvatar`) | props only. No form library, no data fetching, no domain words |
| 3. Form fields | `components/forms/` | one react-hook-form wrapper per atom (`InputForm`, `CheckboxCardForm`, `CurrencyInputForm`) | react-hook-form. No domain words |
| 4. Shared blocks | `components/shared/` | compositions used by 2+ features (`DataTable`, `PageHeader`, `EmptyState`, `ConfirmDialog`, `FilterBar`) | props only. Data comes in, events go out |
| 5. Feature components | `features/<x>/components/` | domain UI (`OrderTable`, `CreateOrderForm`, `OrderStatusBadge`) | the feature's hooks, types and i18n keys |

Routes sit above all of them and render one feature component.

Why layers instead of "put it somewhere in components": a custom checkbox written inside one
feature gets copied into the second feature that needs it, and the two copies drift (one gets
the focus ring fix, the other does not). A layer gives every reusable piece exactly one home,
so the second use is an import, not a copy.

## Before creating any component: the lookup order

1. **`components/ui/`**: is there a primitive that does it? Use it.
2. **`components/base/` and `components/shared/`**: did someone already build it, or something
   close? Use it, or extend it with an optional prop or a variant.
3. **The shadcn registry** (shadcn MCP, shadcn-mcp.md): is it an installable component or block?
   Install it into `ui/` with the CLI.
4. **Only then create it**, in the lowest layer that fits (next section).

Search by role, not by name: `grep -rli "checkbox" src/components` finds `CheckboxCard`,
`CheckboxGroup` and `ConsentCheckbox` alike.

## When a feature needs UI that shadcn does not have

Build it outside the feature, even when only one feature needs it today. The feature then
composes it. Do this without being asked: the request will say "add a plan picker with
selectable cards", and the right answer is an atom, a form field and a feature component, not
one large feature file.

| What the new piece is | Where it goes |
|---|---|
| A generic control or display with no domain meaning (card-style checkbox, currency input, tag chip) | `components/base/<Name>.tsx` |
| Its react-hook-form binding | `components/forms/<Name>Form.tsx`, wrapping the atom |
| A generic composition (table with toolbar, empty state with action) | `components/shared/<Name>.tsx` |
| Something that maps domain data to UI (order status to badge color, plan to card content) | `features/<x>/components/`, composing the atoms |

A quick test for "generic": if the component's props and code contain a domain word (`order`,
`invoice`, `plan`), it belongs in the feature. If they don't, it belongs in `base/` or `shared/`.

## Worked example: a custom checkbox card

Request: "On the subscription form, plans should be selectable cards with a checkbox, title and
description."

**Layer 2: the atom.** Built on the shadcn `Checkbox`, controlled through its own props, with
no form library inside.

```tsx
// components/base/CheckboxCard.tsx
import type { ComponentProps } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface CheckboxCardProps extends Omit<ComponentProps<typeof Checkbox>, "title"> {
  title: string;
  description?: string;
}

export function CheckboxCard({ title, description, className, id, checked, ...props }: CheckboxCardProps) {
  return (
    <label
      htmlFor={id}
      data-checked={checked === true}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
        "hover:bg-accent/50 data-[checked=true]:border-primary data-[checked=true]:bg-primary/5",
        className,
      )}
    >
      <Checkbox id={id} checked={checked} {...props} />
      <span className="grid gap-1">
        <span className="text-sm leading-none font-medium">{title}</span>
        {description && <span className="text-sm text-muted-foreground">{description}</span>}
      </span>
    </label>
  );
}
```

The checked style keys off the component's own `data-checked` attribute, not the primitive's
internal attributes, so it keeps working if shadcn changes what `Checkbox` renders underneath.

**Layer 3: the form field.** Same contract as every wrapper (form-wrappers.md).

```tsx
// components/forms/CheckboxCardForm.tsx
"use client"; // Next.js only, omit in a Vite SPA

import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { CheckboxCard } from "@/components/base/CheckboxCard";
import { Field, FieldError } from "@/components/ui/field";

interface CheckboxCardFormProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  title: string;
  description?: string;
}

export function CheckboxCardForm<T extends FieldValues>({ control, name, title, description }: CheckboxCardFormProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <CheckboxCard
            id={field.name}
            ref={field.ref}
            title={title}
            description={description}
            checked={field.value === true}
            onCheckedChange={(value) => field.onChange(value === true)}
            onBlur={field.onBlur}
            aria-invalid={fieldState.invalid}
          />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
```

Then add `export { CheckboxCardForm } from "./CheckboxCardForm";` to `components/forms/index.ts`.

**Layer 5: the feature** composes it with domain data, TanStack Query and i18n:

```tsx
// features/subscriptions/components/PlanPicker.tsx
const { data: plans } = usePlans(); // features/subscriptions/api/use-subscriptions-queries.ts

return plans?.map((plan) => (
  <CheckboxCardForm
    key={plan.id}
    control={form.control}
    name={`plans.${plan.id}`}
    title={t(`subscriptions.plans.${plan.code}.title`)}
    description={t(`subscriptions.plans.${plan.code}.description`)}
  />
));
```

Three small files, each with one job. The next feature that needs selectable cards imports
`CheckboxCard` or `CheckboxCardForm` and writes nothing new.

## Variants instead of copies

`components/ui/` is never hand-edited, so an app-wide variant of a primitive (a `success`
button, a compact input) lives in `base/` as a thin wrapper using `cva`:

```tsx
// components/base/StatusBadge.tsx
import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusBadge = cva("", {
  variants: {
    tone: {
      neutral: "bg-muted text-muted-foreground",
      success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
      warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      danger: "bg-destructive/15 text-destructive",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export type StatusBadgeProps = ComponentProps<typeof Badge> & VariantProps<typeof statusBadge>;

export function StatusBadge({ tone, className, ...props }: StatusBadgeProps) {
  return <Badge variant="outline" className={cn(statusBadge({ tone }), className)} {...props} />;
}
```

The feature maps its domain to a tone, and that mapping is the only feature-specific part:

```tsx
// features/orders/components/OrderStatusBadge.tsx
const TONE = { pending: "warning", paid: "success", cancelled: "danger" } satisfies Record<OrderStatus, StatusBadgeProps["tone"]>;

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return <StatusBadge tone={TONE[status]}>{t(`orders.status.${status}`)}</StatusBadge>;
}
```

Need a new look? Add a variant to the existing atom. Never copy the atom to change one class.
Colors come from theme tokens (`primary`, `muted`, `destructive`) wherever a token exists, so
dark mode and rebranding stay one-file changes.

## Promotion and duplication rules

1. **Second use promotes.** When a second feature needs a component that lives in a feature,
   move it down to `base/` or `shared/` (removing the domain words) and import it from both.
2. **A near-copy is a defect.** Two components that differ by a class or a label should be one
   component with a prop or a variant.
3. **Atoms stay dumb.** No `useQuery`, no `useForm`, no store reads, no `t()` with feature keys in
   `base/` or `shared/`. They receive text and data as props, so any feature can use them.
4. **One form wrapper per atom.** A new atom used in forms gets its `<Name>Form` wrapper in the
   same change, so no feature writes `Controller` boilerplate for it.
5. **Layers are enforced by lint.** The `no-restricted-paths` zones in feature-structure.md
   already stop `components/` from importing features. Add a zone stopping `components/ui` and
   `components/base` from importing `components/forms` or `components/shared` if the project
   wants the lower layers locked too.
