# Data Fetching and State

## Contents

- State routing: which tool for which kind of state
- The four files in `api/`
- Service, key factory, queries, mutations
- Components consume hooks (the no-Query-in-components rule)
- Rules
- Zustand stores

## State routing

| Kind of state | Tool | Where |
|---------------|------|-------|
| Server data (read or write the backend) | **TanStack Query** | `features/<x>/api/` |
| Form state | **react-hook-form + Zod** | the form component |
| Global app or UI state (auth user, sidebar) | **Zustand (global)** | `store/` |
| Complex feature-local client state (wizard steps) | **Zustand (feature)** | `features/<x>/store/` |
| Trivial local state | `useState` | the component |

Never store server data in Zustand, and never store tokens in JavaScript-readable storage. The
project's `AGENTS.md` describes the auth model (usually an httpOnly cookie).

## The four files in `api/`

```
features/<x>/api/
  <x>-service.ts              HTTP for this feature, through the shared client
  <x>-keys.ts                 query-key factory
  use-<x>-queries.ts          every read hook
  use-<x>-mutations.ts        every create, update and delete hook
```

**One file per CRUD operation is banned.** A feature's write hooks share the same service, the
same `queryClient` and the same invalidation targets. Splitting them into `useCreateX.ts`,
`useUpdateX.ts` and `useDeleteX.ts` multiplies files and imports while isolating nothing.

Split the mutations file only when it stops being readable (around 200+ lines) or one mutation
carries heavy bespoke logic (an optimistic update with rollback). Move *that* hook to
`use-<x>-<action>-mutation.ts` and keep the rest together.

## 1. Service (transport)

HTTP lives in the feature's service, not in the hook. It uses the shared Axios client from
`lib/` and types every response.

```ts
// features/orders/api/orders-service.ts
import { api } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/api";
import type { CreateOrderRequest, ListOrdersParams, Order, UpdateOrderRequest } from "../types";

export const ordersService = {
  list: (params?: ListOrdersParams) =>
    api.get<PaginatedResponse<Order>>("/orders", { params }).then((res) => res.data),
  getById: (id: string) => api.get<Order>(`/orders/${id}`).then((res) => res.data),
  create: (data: CreateOrderRequest) => api.post<Order>("/orders", data).then((res) => res.data),
  update: (id: string, data: UpdateOrderRequest) =>
    api.patch<Order>(`/orders/${id}`, data).then((res) => res.data),
  remove: (id: string) => api.delete<void>(`/orders/${id}`),
};
```

When the response is untrusted or the backend contract is still moving, parse it at this
boundary (`orderSchema.parse(res.data)`) so the rest of the feature trusts a validated value.

Transport shared by several features (file upload, auth refresh, a generic export endpoint)
goes in `lib/` or a top-level `services/`. That folder is for genuinely shared transport only.

## 2. Query-key factory: `<x>-keys.ts`

Keys are consistent and invalidation is targeted. Always `as const`, always built from the
parent keys:

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

When data is scoped (workspace, tenant), the scope id is part of every key below `all`, so
switching workspace never shows another workspace's cache.

## 3. Queries: `use-<x>-queries.ts`

```ts
// features/orders/api/use-orders-queries.ts
export function useOrders(params?: ListOrdersParams) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: () => ordersService.list(params),
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => ordersService.getById(id),
    enabled: !!id, // guard required inputs
  });
}
```

## 4. Mutations: `use-<x>-mutations.ts`, all of them in one file

A local invalidation helper keeps the `queryClient` wiring in one place:

```ts
// features/orders/api/use-orders-mutations.ts
function useInvalidateOrders() {
  const queryClient = useQueryClient();
  return {
    lists: () => queryClient.invalidateQueries({ queryKey: orderKeys.lists() }),
    detail: (id: string) => queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) }),
  };
}

export function useCreateOrder() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: (data: CreateOrderRequest) => ordersService.create(data),
    onSuccess: () => invalidate.lists(),
  });
}

export function useUpdateOrder() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateOrderRequest }) =>
      ordersService.update(id, data),
    onSuccess: (_, { id }) => {
      invalidate.lists();
      invalidate.detail(id);
    },
  });
}

export function useDeleteOrder() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: (id: string) => ordersService.remove(id),
    onSuccess: () => invalidate.lists(),
  });
}
```

## 5. Components consume hooks

This is the rule that drifts in practice: half the components import a hook, the other half
call `useMutation({ mutationFn })` inline. Then the same invalidation lives in two places and
neither is authoritative.

```tsx
// never: service call and invalidation leak into the component
const queryClient = useQueryClient();
const { mutate } = useMutation({
  mutationFn: (data: CreateOrderRequest) => ordersService.create(data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
});

// always: the component knows the hook's name and its input, nothing else
const { mutate, isPending } = useCreateOrder();
```

`queryFn`, `mutationFn`, `queryKey`, `invalidateQueries`, `useQueryClient` and any `*Service`
import belong **only** in `features/<x>/api/`. UI-only reactions (toast, redirect, closing a
dialog) stay in the component, passed per call:
`mutate(data, { onSuccess: () => setOpen(false) })`.

## Rules

1. **Components call hooks, hooks call the feature service, the service calls the shared
   client.** No raw `axios` or `fetch` outside a service, no Query primitives outside `api/`.
2. **One mutations file per feature**, split only on the triggers above.
3. **Use the key factory** for both `queryKey` and `invalidateQueries`. Never inline an array
   literal like `["orders"]` at a call site.
4. **`enabled: !!input`** for queries that depend on a value, so they don't fire with `undefined`.
5. **Invalidate the narrowest key** that covers what changed. Updates invalidate `lists()` and
   the specific `detail(id)`.
6. **Type the generics.** `api.get<Order>(...)`, no untyped responses.
7. **Errors:** extract user-facing messages with the project's error helper (for example
   `lib/utils/get-error-message.ts`), and type `error` in `onError`.

## Zustand stores

- Global: `store/<name>-store.ts` exporting `use<Name>Store` (`auth-store.ts` → `useAuthStore`).
- Feature-local: `features/<x>/store/<name>-store.ts` (`order-wizard-store.ts`).
- Keep stores small and serializable, derive instead of duplicating, and keep server data in
  Query, not in a store.
