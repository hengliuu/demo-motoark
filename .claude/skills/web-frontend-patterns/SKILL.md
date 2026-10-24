---
name: web-frontend-patterns
description: Module-first (feature-based) frontend patterns for React and TypeScript apps on Next.js App Router or Vite with TanStack Router. Use PROACTIVELY whenever writing or modifying frontend code, and whenever someone asks where frontend code should live. Triggers on pages, routes, layouts and protected routes, adding or changing a feature module under src/features, components, Shadcn UI and form wrappers (react-hook-form and Zod), TanStack Query hooks, query-key factories, the feature's mutations file and API service, where a type belongs (feature-local or global), Zustand stores and server vs client state, barrel index.ts files and cross-feature imports, ESLint import boundaries, porting between Next.js and Vite, and TailwindCSS v4 theming. Pairs with typescript-conventions (load it first), the impeccable and ui-ux-pro-max design skills, and the shadcn MCP.
---

# Web Frontend Patterns (module-first)

Load `typescript-conventions` first. It owns how code is written. This skill owns where it
goes and how it is wired. Read the project's `AGENTS.md` or `CLAUDE.md` before this skill: it
wins on project facts (auth model, i18n, ports, package versions).

## The one idea: the app is a set of feature modules

Every business capability is one folder, `src/features/<feature>/`, holding everything that
capability needs from the HTTP call up to the components. Routes are thin doors into
features. Shared folders hold only what two or more features use.

```
src/
  app/ (Next.js) or routes/ (Vite)   thin route files, render one feature component
  features/
    orders/                          one business module, named like the backend module
      api/                           orders-service.ts, orders-keys.ts,
                                     use-orders-queries.ts, use-orders-mutations.ts
      components/                    PascalCase files, index.ts barrel = public surface
      hooks/  types/  store/  constants/  utils/   only the folders it needs
    customers/
  components/ui/                     layer 1: shadcn primitives (CLI-managed, never hand-edited)
  components/base/                   layer 2: custom atoms shadcn lacks (CheckboxCard, CurrencyInput)
  components/forms/                  layer 3: one react-hook-form wrapper per atom
  components/shared/                 layer 4: compositions used by 2+ features (DataTable, EmptyState)
  hooks/  store/  types/             cross-feature hooks, global stores, shared types
  lib/                               api client, auth, i18n, providers, utils
```

Why module-first: one feature changes in one folder, a PR touches one place, a feature can be
deleted or moved by moving its folder, and the frontend speaks the same vocabulary as a
module-first backend (`features/orders` on the web, the `order` module in the API).

Dependency direction is one way: **routes → features → shared** (`components`, `hooks`, `lib`,
`store`, `types`). A feature never imports another feature, and shared code never imports a
feature. When a page needs two features, the route or a feature component composes them by
rendering, not by reaching into each other's internals.

## Where does this go?

| Task | Location | Reference |
|------|----------|-----------|
| New business capability | `features/<x>/` (run the checklist below) | feature-structure.md |
| New page or route | Next `app/**/page.tsx`, Vite `src/routes/**`. Route only, renders a feature component | routing-layer.md |
| HTTP calls for one feature | `features/<x>/api/<x>-service.ts` | data-fetching.md |
| Reading server data | `features/<x>/api/use-<x>-queries.ts` | data-fetching.md |
| Writing server data | `features/<x>/api/use-<x>-mutations.ts`, **all** of the feature's mutations | data-fetching.md |
| A type | one feature uses it: `features/<x>/types/`. Two or more, or the API client: `types/` | feature-structure.md |
| Client or UI state | feature store `features/<x>/store/` or global `store/` (Zustand) | data-fetching.md |
| A control or display shadcn lacks (custom checkbox, currency input) | `components/base/`, plus its wrapper in `components/forms/` | component-layers.md |
| App-wide variant of a shadcn primitive | `components/base/` wrapper with `cva` | component-layers.md |
| UI used by 2+ features | `components/shared/` | component-layers.md |
| Form field wrapper | `components/forms/<Name>Form.tsx` | form-wrappers.md |
| Building a form | a feature component using react-hook-form + Zod + the wrappers | form-wrappers.md |
| Shadcn primitive | `components/ui/` via the shadcn CLI or MCP | shadcn-mcp.md |
| Transport shared by features (upload, auth refresh) | `lib/` or top-level `services/` | data-fetching.md |

## Adding a feature module (checklist)

1. **Name it after the backend module and the URL resource** (`/orders` → `features/orders`).
   Check whether it already exists, and extend it instead of creating `orders-v2`.
2. **Types first** in `features/<x>/types/index.ts`: Zod schemas for forms and responses, types
   via `z.infer`, list params as an intersection with the shared `ListQueryParams`.
3. **API layer** in `features/<x>/api/`: the service (plain HTTP via the shared client), the
   key factory, then the queries file and the mutations file.
4. **Components** in `features/<x>/components/`, exported through `components/index.ts`. Use
   the form wrappers for fields and `t("key")` for every user-facing string (add the key to
   every locale file the project has).
5. **Route** last: a route file that imports from `@/features/<x>/components` and renders.
6. **Verify**: `pnpm type-check` and `pnpm lint` (the lint run includes the import boundary
   rule, see feature-structure.md).

## Component layers (atomic)

UI is built in five layers, and each layer imports only from the layers below it:
`ui/` (shadcn) → `base/` (custom atoms) → `forms/` (react-hook-form wrappers) → `shared/`
(compositions) → `features/<x>/components/` (domain UI).

Before creating a component, look in `ui/`, then `base/` and `shared/`, then the shadcn
registry. When a feature needs UI that none of them has, build it **outside the feature**
without being asked: the generic atom in `base/`, its form wrapper in `forms/`, and only the
domain mapping in the feature. The second feature that needs it then imports it instead of
copying it. Full rules and a worked custom-checkbox example: references/component-layers.md.

## Quick reference

### Data flow inside a feature

```
component → use-<x>-queries / use-<x>-mutations → <x>-service → lib/api-client (Axios)
```

```ts
// features/orders/api/orders-keys.ts
export const orderKeys = {
  all: ["orders"] as const,
  lists: () => [...orderKeys.all, "list"] as const,
  list: (params?: ListOrdersParams) => [...orderKeys.lists(), params] as const,
  details: () => [...orderKeys.all, "detail"] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
};
```

Components import hooks and nothing else from `api/`. `queryFn`, `mutationFn`, `queryKey`,
`invalidateQueries`, `useQueryClient` and service imports live only in `features/<x>/api/`.

### Barrels

`features/<x>/components/index.ts` and `features/<x>/types/index.ts` are the feature's public
surface. Consumers (routes) import `@/features/orders/components`, never a deep file path.
Inside a feature, files import siblings by direct path, not through their own barrel, which
avoids import cycles.

## Critical rules

1. **Type safety first.** Zod schemas at the boundary, `z.infer` for types, no `any`.
2. **Routes are thin.** A route imports a feature component and renders it. No business logic,
   fetching or inline forms in route files.
3. **Features don't import features.** Promote shared UI to `components/shared/`, shared logic
   to `lib/` or `hooks/`, shared types to `types/`. The lint rule enforces it, so a violation
   fails `pnpm lint`.
4. **All server-data logic lives in `features/<x>/api/`.** One service, one keys file, one
   queries file, one mutations file per feature. One file per CRUD operation is banned.
5. **Know your branch.** Next.js: Server Components by default, `"use client"` only for hooks,
   events or browser APIs, on the smallest subtree. Vite: everything is a client component,
   never write `"use client"`.
6. **Types live at the lowest level that covers every consumer.** Extend shared bases with `&`,
   never re-declare their fields.
7. **Never hand-edit `components/ui/`.** Those files are shadcn-generated. Variants and
   custom atoms go in `components/base/`, one home per component, never a copy inside a feature.
8. **Never hardcode user-facing text.** Use `t("key")` and add the key to every locale file.
9. **Formatting is automated.** Prettier owns formatting, ESLint owns code quality. Run them.
10. **Verify before done:** `pnpm type-check` and `pnpm lint` pass, or say which one could not run.

## Design skills

This skill owns structure and wiring. For how the UI should look and feel, hand off:

| Need | Use |
|------|-----|
| Wire a page, form or feature into our structure | **this skill** |
| Design, redesign, polish or audit a UI (hierarchy, motion, empty and error states, accessibility) | **impeccable** |
| Pick a style, palette, font pairing, chart, or a shadcn component for a product type | **ui-ux-pro-max** |
| Find, preview or install a shadcn component | **shadcn MCP** (references/shadcn-mcp.md) |

## Reference stack (team default)

React, TypeScript, TailwindCSS v4, Shadcn UI, Zustand, TanStack Query, react-hook-form + Zod,
Axios, react-i18next, Vitest, pnpm. The app shell is Next.js App Router or Vite + TanStack
Router. That choice changes the routing layer and nothing under `features/`. Check
`package.json` for real versions before writing version-specific code.

## References

Load the one the task needs:

- **[references/feature-structure.md](references/feature-structure.md)**: module layout and
  naming, public surface and barrels, feature-local vs global types, where shared code goes,
  the ESLint boundary rule, and moving a layer-first app to modules.
- **[references/data-fetching.md](references/data-fetching.md)**: the feature service, key
  factory, queries and mutations files, the no-Query-in-components rule, state routing and
  Zustand.
- **[references/component-layers.md](references/component-layers.md)**: the five component
  layers, the lookup order before creating a component, custom atoms and their form wrappers,
  `cva` variants instead of copies, promotion rules.
- **[references/form-wrappers.md](references/form-wrappers.md)**: the generic field wrapper
  contract for both shadcn form styles (`Field` + `Controller`, and the older `Form`).
- **[references/routing-layer.md](references/routing-layer.md)**: the only Next.js vs Vite
  difference (route files, client boundary, `proxy.ts` and `beforeLoad` guards, env vars,
  porting checklist).
- **[references/shadcn-mcp.md](references/shadcn-mcp.md)**: searching, previewing and
  installing components through the shadcn MCP, plus the post-add audit.
