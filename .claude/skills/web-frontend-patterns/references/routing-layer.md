# Routing Layer: Next.js App Router vs Vite SPA

## Contents

- Which branch am I in?
- What differs / what does not
- Next.js branch
- Vite + TanStack Router branch (incl. the Next → TanStack mapping)
- Vite-branch rules

Everything else in this skill is framework-agnostic. This file is the **only** place the two
setups differ.

## Which branch am I in?

`next.config.*` present → Next.js. `vite.config.*` present → Vite SPA. Confirm against the
project's `AGENTS.md` / `package.json` before assuming, and never mix the two branches' idioms
in one repo.

## What differs

| Concern | Next.js (App Router) | Vite SPA (TanStack Router) |
|---------|----------------------|----------------------------|
| Route file | `app/**/page.tsx` | `src/routes/**/*.tsx` |
| Client boundary | Server Components by default, `"use client"` opt-in | everything is a client component |
| Data on first paint | server fetch in an RSC, or Query on the client | Query on the client only |
| Auth guard | `proxy.ts` (Next.js 16+, formerly `middleware.ts`) reading the session cookie | `_authenticated` pathless layout route with `beforeLoad` |
| Env vars | `process.env.NEXT_PUBLIC_*` | `import.meta.env.VITE_*` |
| Navigation | `next/link`, `useRouter` from `next/navigation` | `Link`, `useNavigate` from `@tanstack/react-router` |
| Images | `next/image` | plain `<img>` or a shared wrapper |

## What does not differ

`features/<x>/` layout, barrels, form wrappers, the three-file `api/` split, the query-key
factory, Zustand routing, types placement, shadcn usage, i18n, and every critical rule in
SKILL.md apply **unchanged**. Porting a feature between the two should touch its route file
and nothing under `features/`. If a port is making you edit feature code, something leaked
into the wrong layer.

## Next.js branch

Routes are thin: import a feature component, render it, nothing else:

```tsx
// app/(main)/orders/page.tsx
import { OrdersPage } from "@/features/orders/components";

export default function Page() {
  return <OrdersPage />;
}
```

- Route groups (`(main)`, `(no-layout)`, `auth`) organize layout without adding URL segments.
- `"use client"` only for hooks, events, or browser APIs. Any component calling our Query
  hooks or a Zustand store is a client component: mark the smallest subtree, not the page.
- Auth protection lives in `proxy.ts` at the project root (or in `src/`). Next.js 16 renamed
  `middleware.ts` to `proxy.ts` and the exported function to `proxy`, and it runs on the
  Node.js runtime. `middleware.ts` still works but is deprecated, so new code uses `proxy.ts`
  (`npx @next/codemod@canary upgrade` migrates an old one). Keep it to cheap checks: session
  cookie present, continue, otherwise redirect to login. Real authorization happens in the
  backend on every request. The project's `AGENTS.md` names the cookie and the auth model.

## Vite + TanStack Router branch

There is no server component boundary. **Never carry `"use client"` over from a Next
codebase**: it is dead weight and signals a bad port.

### Coming from Next.js: how the conventions map

| Next.js App Router | TanStack Router (file-based) |
|--------------------|------------------------------|
| root `app/layout.tsx` | `src/routes/__root.tsx` |
| `app/orders/page.tsx` | `src/routes/orders/index.tsx` |
| `app/orders/[id]/page.tsx` | `src/routes/orders/$id.tsx` |
| `app/(main)/layout.tsx`: wraps children, no URL segment | `src/routes/_main.tsx`: pathless layout |
| `proxy.ts` (or legacy `middleware.ts`) guarding a group | `beforeLoad` on the pathless layout route |
| `useParams()` from `next/navigation` | `Route.useParams()` |
| `useSearchParams()`: untyped strings | `Route.useSearch()`: typed by the route's `validateSearch` |

The mental model carries over: folders are segments, a layout wraps its children. What is new
is that params and search params come back **typed from the route you declared**, instead of
`string | undefined`. Outside a route component use `useParams({ strict: false })` or
`useSearch({ from: "/orders" })`.

File conventions in the configured routes directory (default `src/routes/`):

| File | Meaning |
|------|---------|
| `__root.tsx` | root route, must sit at the root of the routes directory |
| `index.tsx` | matches the parent path exactly |
| `$param.tsx` | parameterized segment, extracted as a route param |
| `_name.tsx` | pathless layout route: wraps children without adding a URL segment |
| `blog.post.tsx` | `.` denotes nesting, `post` becomes a child of `blog` |
| `routeTree.gen.ts` | generated: never hand-edit, never review its diff |

Route files stay thin, same as Next:

```tsx
// src/routes/_authenticated/orders/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { OrdersPage } from "@/features/orders/components";

export const Route = createFileRoute("/_authenticated/orders/")({
  component: OrdersPage,
});
```

Auth guard on the pathless layout, so every child inherits it:

```tsx
// src/routes/_authenticated.tsx
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
});
```

`beforeLoad` runs before every child route's `beforeLoad`, which is what makes it the guard
point. If the auth check itself can throw, catch it and re-throw redirects untouched
(`isRedirect(error)`) so an intentional redirect isn't swallowed as an error.

### Vite-branch rules

1. **Query is the only data path.** No route `loader` doing its own fetch. If you want to
   prefetch, call `queryClient.ensureQueryData(...)` in the loader: the component still
   reads through the same `use-<feature>-queries.ts` hook, never the loader's return value.
2. **Validated search params for list filters.** A list route's `validateSearch` (Zod) is the
   natural home for page/limit/search: feed the parsed object straight into the `Params`
   type from `types/` rather than a second, parallel shape.
3. **The `@/` alias must be declared twice**: `resolve.alias` in `vite.config` *and* `paths`
   in `tsconfig.json`. Setting one without the other type-checks or builds, never both.
4. **Env vars are typed.** Declare `import.meta.env.VITE_*` in `vite-env.d.ts`, don't read
   them with `as string`.
5. **Router plugin setup comes from TanStack Router's install docs, not from memory**: the
   plugin's exported name has moved between versions. Copy the current snippet.

Already on React Router instead? The conventions above still hold: thin route files, guard
in a layout route, Query as the only data path. Only the API names change.
