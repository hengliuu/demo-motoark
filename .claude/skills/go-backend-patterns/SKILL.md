---
name: go-backend-patterns
description: Module-first (feature-based) patterns for Go backend services and workers built on Gin and PostgreSQL (GORM or go-pg). Each business module is one package under internal/ (for example internal/order) that owns its handler (HTTP), service (business logic), repository (data access), queue consumer and tests, wired once in cmd/api and cmd/worker. Use PROACTIVELY whenever writing, reviewing or restructuring Go backend code. Triggers on adding a module or entity, REST endpoints, handlers, routes and DTOs, CRUD, repositories, queries, models, migrations, pagination, sorting, soft delete and optimistic locking, services, params, validation, domain errors and transactions, cross-module calls and import cycles, background workers, queue consumers, outbox, retries and graceful shutdown, gRPC clients and servers, oapi-codegen strict handlers, unit tests with fakes and integration tests with testcontainers. Also use it when someone asks how to structure or folder a Go service, even if the word module is never used.
---

# Go Backend Patterns (module-first)

A service is a set of **business modules**. Each module is one Go package that owns its whole
vertical slice: HTTP handler, service, repository, queue consumer, and tests. Infrastructure
that every module uses lives in `internal/platform/`. Binaries in `cmd/` are the only place
modules get wired together.

Placeholders: `<module>` is the service's own Go module path (from `go.mod`), `<org>/shared`
is the org's shared utilities module. Read the project's `AGENTS.md` or `CLAUDE.md` first: it
wins on project facts (module path, ORM, response envelope, auth).

## Layout

```
<service>/
  cmd/
    api/main.go              HTTP binary: config, db, modules, router, graceful shutdown
    worker/main.go           worker binary: same modules, consumers and relays instead of routes
  internal/
    order/                   one business module = one package (singular, lowercase)
      module.go              Deps, New(), RegisterRoutes(), RegisterConsumers()
      handler.go             Gin adapter: bind, call service, write response
      dto.go                 request/response structs + converters (JSON tags live here only)
      service.go             business rules and transactions
      params.go              service inputs (transport-agnostic, no JSON tags)
      repository.go          repository interface + GORM implementation (both unexported)
      model.go               Order model, status type, column constants
      errors.go              module errors (ErrNotFound, ErrVersionConflict)
      consumer.go            queue handlers for this module (worker side)
      grpc.go                gRPC server adapter, only if the module is exposed over gRPC
      service_test.go        unit tests with fakes
      repository_test.go     integration tests against real Postgres
    invoice/
    platform/                infrastructure only, never business rules
      database/              Open, Transactor (WithinTx, WithinTenantTx), Conn(ctx, db)
      apperr/                error kinds shared by all modules (NotFound, Invalid, Conflict...)
      httpx/                 router setup, middleware, WriteError, Run with graceful shutdown
      queue/                 Message, Consumer port, broker adapter
      outbox/                Add() inside the business tx, Relay worker
      config/  logging/
  migrations/
```

Why this shape: a change to orders touches `internal/order/` and nothing else, a module can be
moved to its own service by moving one folder, and Go's package boundary does the
encapsulation for free (unexported repository and helpers cannot be imported by anyone else).

## Rules that make module-first work

1. **One package per module, files per layer.** Grow by splitting files
   (`service_checkout.go`, `handler_admin.go`), not by creating sub-packages. Sub-packages
   force everything to be exported and bring back layer-first inside the module.
2. **Name things for the package.** `order.Service`, `order.New`, `order.ErrNotFound`, never
   `order.OrderService` (it stutters at every call site).
3. **Export the module's API only:** `Deps`, `New`, `Module`, `Service` and its methods, the
   params and model types those methods use, and the errors. The repository implementation,
   DTOs, handler and helpers stay unexported.
4. **Modules talk through services, never through repositories or tables.** Module B declares
   the small interface it needs (consumer-defined, unexported) and `cmd/` passes module A's
   `*Service` into B's `Deps`. Details in references/module-layout.md.
5. **No import cycles, by design.** If A imports B and B needs A, the shared behaviour belongs
   in a third module, an event (outbox), or an interface on one side with its own types.
6. **`platform/` never imports a module.** It is infrastructure. Business rules there are a
   module hiding in the wrong folder. `scripts/check_boundaries.sh` checks both directions.
7. **`context.Context` is the first parameter** of every service, repository, consumer and
   client method. Handlers pass `c.Request.Context()`. Without it, timeouts, cancellation,
   tracing and the transaction in context are all lost.
8. **Services return `error`, not HTTP.** Domain errors wrap an `apperr` kind, and
   `httpx.WriteError` maps kinds to status codes once. The same service then works unchanged
   behind HTTP, gRPC and a queue consumer.
9. **Transactions are opened by the service** with `Transactor.WithinTx(ctx, fn)`. Repositories
   read the transaction from the context with `database.Conn(ctx, r.db)`. A service calling
   another module's service inside `WithinTx` joins the same transaction.
10. **Handlers are thin:** bind and validate shape, read identity from context, map DTO to
    params, call one service method, map the result. No business rules, no database.
11. **Log once, at the boundary.** The handler or consumer logs failures with request context.
    Services and repositories wrap errors with `fmt.Errorf("...: %w", err)` and return them.
    Logging and returning the same error produces duplicate log lines for one failure.

## Existing projects win

These rules describe new modules. In a project that already does it differently, match the
project, mention the difference, and don't refactor without being asked:

| Project already has | Do this |
|---|---|
| Layer-first folders (`controller/`, `service/<entity>/`, `repository/<entity>/`) | Follow them for changes. For a migration plan, see references/module-layout.md "Moving from layer-first" |
| Services returning `*response.HTTPError` | Keep returning it in that project. Consistency beats this skill |
| Explicit `tx` arguments with `pgtx`/`gormtx` | Keep passing `tx`. The ctx-based `Transactor` is for new code |
| `<org>/shared/logger` | Use it instead of `log/slog` |
| `go-pg/pg` in `go.mod` | Use references/repository-gopg.md for the repository layer |

## What to load for the task

| Task | Read |
|---|---|
| New module, or "how should this service be structured" | module-layout.md, then handler.md, service.md, repository-gorm.md |
| New endpoint on an existing module | handler.md, service.md |
| New business rule, validation, domain error | service.md |
| New query, filter, sort, pagination, field | repository-gorm.md (or repository-gopg.md) |
| One module needs data or behaviour from another | module-layout.md "Cross-module calls" |
| Optimistic locking, UUID v7 keys, soft delete with actor | repository-gorm.md |
| Background job, queue consumer, worker binary | worker.md |
| Publish events reliably | outbox.md, worker.md |
| Tenant isolation with Postgres row-level security | platform.md "Tenant transactions" |
| gRPC client or server | grpc.md |
| HTTP layer generated by oapi-codegen strict-server | openapi-strict.md |
| Tests | testing.md |
| Router, middleware, config, logging, shared utilities | platform.md |

## Go version notes (check the `go` line in `go.mod`)

| Feature | Needs | Use it for |
|---|---|---|
| `errors.AsType[*apperr.Error](err)` | Go 1.26 | error mapping without a target variable (`errors.As` before 1.26) |
| `new(expr)`, for example `new("draft")` | Go 1.26 | pointer fields in tests and params (`utils.StringPtr` before 1.26) |
| `sync.WaitGroup.Go(fn)` | Go 1.25 | starting worker goroutines without manual `Add`/`Done` |
| `testing/synctest` | Go 1.25 | testing retries, timeouts and backoff without real sleeping |
| stdlib `uuid` package | Go 1.27 | check `go doc uuid` before replacing `github.com/google/uuid` in an existing project |

Never use a feature newer than the `go` directive. `go vet` (run by `go test`) reports standard
library symbols that are too new for it.

## Verify before done

```bash
gofmt -l .                      # must print nothing
go vet ./...
go test ./...                   # add -race for anything with goroutines
golangci-lint run               # if the project has a config
bash .claude/skills/go-backend-patterns/scripts/check_boundaries.sh   # module boundaries
```

Integration tests need Docker for testcontainers. If something could not run, say which and why
instead of implying it passed.

## References

- [references/module-layout.md](references/module-layout.md): layout, naming, exports,
  `module.go` wiring, `cmd/api` and `cmd/worker`, cross-module calls, when to split, moving from
  layer-first.
- [references/handler.md](references/handler.md): Gin handlers, DTOs, binding, identity from
  context, pagination response, Swagger annotations.
- [references/service.md](references/service.md): service struct, params, validation, domain
  errors, transactions, update maps, logging.
- [references/repository-gorm.md](references/repository-gorm.md): GORM repository, filters,
  sort allowlist, pagination, soft delete, optimistic locking, UUID v7.
- [references/repository-gopg.md](references/repository-gopg.md): the same repository for
  go-pg projects.
- [references/worker.md](references/worker.md): durable consumers in `cmd/worker`, idempotency,
  retries, dead letters, the in-process pool for best-effort jobs, graceful shutdown.
- [references/outbox.md](references/outbox.md): transactional outbox and relay.
- [references/grpc.md](references/grpc.md): gRPC server adapter per module, clients with
  `grpc.NewClient`, service-token auth.
- [references/openapi-strict.md](references/openapi-strict.md): oapi-codegen strict-server
  handlers split per module.
- [references/platform.md](references/platform.md): `platform/database`, `apperr`, `httpx`,
  tenant row-level security, config, logging, and the `<org>/shared` utilities.
- [references/testing.md](references/testing.md): fakes, table-driven service tests, handler
  tests, testcontainers repository tests, synctest for workers.
