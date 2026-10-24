# Feature Modules

## Contents

- Feature module layout and file naming
- Naming a feature
- Public surface: barrels
- Types: feature-local vs global, and extending shared bases
- Where shared code goes
- Enforcing the boundary with ESLint
- Moving a layer-first app to modules

## Feature module layout

Each feature under `src/features/<name>/` is self-contained and holds **only the subfolders
it needs**:

```
features/<name>/
  api/             <name>-service.ts, <name>-keys.ts,
                   use-<name>-queries.ts, use-<name>-mutations.ts
  components/      feature UI, PascalCase files, index.ts barrel re-exports the public ones
  hooks/           feature-only hooks, kebab-case (use-order-filters.ts)
  types/           Zod schemas + inferred types used only by this feature, index.ts barrel
  store/           feature-local Zustand store, only if the feature needs client state
  constants/       feature config maps (status-config.ts)
  utils/           feature-only pure helpers
```

**Naming:** components are PascalCase (`OrderCard.tsx`). Everything else (hooks, api, types,
constants, utils) is kebab-case.

Typical shapes: `auth/` (components, hooks, api, types), `orders/` (components, api,
constants, store, types), and thin ones like `sidebar/` (components only). An empty folder
"for later" is noise, create it when the first file needs it.

A feature that grows sub-areas nests them as folders inside `components/` (for example
`components/checkout/` with its own barrel), not as a second feature. Split into two features
only when the backend splits them into two modules or the two parts never render together.

## Naming a feature

- Use the backend module's word and the URL's plurality: backend module `order`, endpoint
  `/orders`, frontend `features/orders`. One vocabulary across the stack makes "where is the
  code for X" answerable without searching.
- Name by business capability (`orders`, `invoices`, `customers`), not by UI shape (`tables`,
  `modals`, `forms`). UI shapes belong in `components/shared/` or `components/forms/`.

## Public surface: barrels

The barrels are the feature's public API. Routes and the app shell import through them, and
nothing outside the feature imports a deep path.

```ts
// features/orders/components/index.ts
// Pages
export { OrdersPage } from "./OrdersPage";
export { OrderDetailPage } from "./OrderDetailPage";
// Pieces other routes render
export { OrderStatusBadge } from "./OrderStatusBadge";
```

```tsx
// consumer: stable path, internal file moves don't break it
import { OrdersPage } from "@/features/orders/components";
```

When a barrel earns its place:

- The public surface of a feature or a component group (`features/<x>/components/index.ts`,
  `components/forms/index.ts`).
- A sub-area with several files (`components/checkout/`).
- Types: `features/<x>/types/index.ts` exports every schema and inferred type together.

When to skip one:

- A folder with a single file imported in one place.
- `components/ui/` (shadcn): import `@/components/ui/<x>` directly.
- Never a top-level "god barrel" re-exporting several features.

Barrel hygiene: one `export { Name } from "./Name";` per line, export only the public pieces,
and inside the feature import siblings by direct path (a file that imports its own barrel is
the usual cause of an import cycle).

## Types: feature-local vs global

A type lives at the **lowest level that still covers every consumer**:

| Used by | Lives in | Examples |
|---------|----------|----------|
| One feature only | `features/<x>/types/` | `Order`, `CreateOrderRequest`, `OrderStatus` |
| Two or more features, or the API client | `types/` (top level) | `PaginationMeta`, `ApiResponse<T>`, `ListQueryParams`, `SortOrder` |

**Promote, don't cross-import.** The moment a second feature needs a type from
`features/a/types/`, move it to `types/` and import it from there in both.

### Extending a shared base type

```ts
// types/api.ts: global, every list endpoint shares these
export type ListQueryParams = {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

// Match the backend's list envelope. Adjust the field names to the real response.
export type PaginatedResponse<T> = {
  data: T[];
  meta: PaginationMeta;
};
```

```ts
// features/orders/types/index.ts: feature-local, adds only what is specific
export type ListOrdersParams = ListQueryParams & {
  status?: OrderStatus;
  customerId?: string | null;
};
```

Never copy `page`, `limit` or `search` into a feature type, intersect the base. Keep added
fields optional unless the endpoint requires them, and match the API's nullability. A field
shared by three list endpoints belongs in the base.

## Where shared code goes

| Code | Location |
|------|----------|
| UI used by 2+ features | `components/shared/` |
| react-hook-form field wrappers | `components/forms/` |
| Shadcn primitives | `components/ui/` (CLI or MCP managed) |
| Cross-feature hooks | `hooks/` |
| Global Zustand stores | `store/` (`auth-store.ts`, `sidebar-store.ts`) |
| Types used by 2+ features or the API client | `types/` |
| API client, auth, i18n, providers, utils | `lib/` |
| Transport used by several features (file upload, auth refresh) | `lib/` or `services/` |

A feature's own HTTP calls never go in a top-level `services/` folder. They live in
`features/<x>/api/<x>-service.ts`, so deleting the feature deletes its transport too.

## Enforcing the boundary with ESLint

A rule people must remember drifts. Make the linter hold it. With `eslint-plugin-import` (or
its fork `eslint-plugin-import-x`, same options under the `import-x/` prefix), add
`no-restricted-paths` zones to the flat config. Check which plugin `package.json` already has
before adding one.

```js
// eslint.config.js (excerpt)
import fs from "node:fs";
import importPlugin from "eslint-plugin-import";

const features = fs.readdirSync("./src/features", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

// A feature may not import any other feature
const featureZones = features.map((feature) => ({
  target: `./src/features/${feature}`,
  from: "./src/features",
  except: [`./${feature}`],
  message: "Features must not import each other. Promote shared code to components/shared, hooks, lib or types.",
}));

export default [
  // ...existing config
  {
    plugins: { import: importPlugin },
    rules: {
      "import/no-restricted-paths": ["error", {
        zones: [
          ...featureZones,
          // Shared layers never depend on features or routes
          {
            target: ["./src/components", "./src/hooks", "./src/lib", "./src/store", "./src/types"],
            from: ["./src/features", "./src/app", "./src/routes"],
            message: "Shared code must not depend on features or routes.",
          },
          // Features never depend on routes
          {
            target: "./src/features",
            from: ["./src/app", "./src/routes"],
            message: "Features must not import route files.",
          },
        ],
      }],
    },
  },
];
```

The `@/` alias must resolve for the plugin to see these paths, so the import resolver for
TypeScript (`eslint-import-resolver-typescript`) has to be configured. Run `pnpm lint` once on
a deliberate violation to prove the rule fires before trusting it.

## Moving a layer-first app to modules

When an app has top-level `services/`, `hooks/` and `types/` full of single-feature code, move
one feature at a time, in its own PR:

1. Create `features/<x>/` and move that feature's service, hooks, types and components in.
2. Update imports (the editor's move refactor, or `pnpm tsc --noEmit` to find the breaks).
3. Leave genuinely shared pieces where they are.
4. Turn on the lint zone for that feature once it is clean.

Don't mix a structural move with a behavior change in one PR. Reviewers can verify a pure move
quickly, and a move mixed with logic changes hides the logic change.
