# Module Layout and Wiring

## Contents

- What a module is
- Naming
- `module.go`: the module's front door
- `internal/app/container.go`: one file wires everything
- `cmd/api/main.go`
- `cmd/worker/main.go`
- Coming from `container/` + `controller/` + `routes/`
- Cross-module calls
- Cross-module transactions
- When to split a module, when to merge
- Moving from layer-first

## What a module is

A module is one business capability (orders, invoices, customers) with its own tables. It is
one Go package in `internal/<module>/` and holds every layer of that capability:

| File | Layer | Exported? |
|---|---|---|
| `module.go` | wiring: `Deps`, `Module`, `New`, `RegisterRoutes`, `RegisterConsumers` | yes |
| `handler.go`, `dto.go` | HTTP adapter | no |
| `consumer.go` | queue adapter | no |
| `grpc.go` | gRPC adapter | the server type only, if `cmd/` registers it |
| `service.go`, `params.go` | business logic and its inputs | `Service`, its methods, params |
| `repository.go` | data access | no (interface and implementation both unexported) |
| `model.go` | model, enums, column constants | model and enums yes, columns no |
| `errors.go` | domain errors | yes |

Go's visibility rule is the module boundary. An unexported `gormRepository` cannot be imported
by another module even if someone tries, so "never touch another module's tables" holds by
construction instead of by review.

Tables belong to exactly one module. A query that joins two modules' tables is a sign that one
module should ask the other's service, or that the two are really one module.

## Naming

- Package: singular, lowercase, one word: `order`, `invoice`, `customer`. Not `orders`,
  `order_service` or `orderModule`.
- Types read with the package name: `order.Service`, `order.Order`, `order.Status`,
  `order.CreateParams`, `order.ErrNotFound`.
- Files are named by layer (`service.go`). When a file passes roughly 400 lines, split it by
  use case: `service_checkout.go`, `service_refund.go`, `handler_admin.go`.
- Tests sit next to the code: `service_test.go`, `repository_test.go`, `handler_test.go`.

## `module.go`: the module's front door

```go
package order

import (
    "log/slog"

    "<module>/internal/platform/database"
    "<module>/internal/platform/queue"

    "github.com/gin-gonic/gin"
    "gorm.io/gorm"
)

// Deps is everything the module needs from outside. cmd/ builds it.
type Deps struct {
    DB  *gorm.DB
    Tx  *database.Transactor
    Log *slog.Logger
}

// Module is the assembled order module.
type Module struct {
    Service  *Service
    handler  *handler
    consumer *consumer
}

func New(d Deps) *Module {
    repo := newGormRepository(d.DB)
    svc := NewService(repo, d.Tx, d.Log)
    return &Module{
        Service:  svc,
        handler:  &handler{svc: svc, log: d.Log},
        consumer: &consumer{svc: svc},
    }
}

// RegisterRoutes mounts the module under an authenticated group, for example /api/v1.
func (m *Module) RegisterRoutes(rg *gin.RouterGroup) {
    g := rg.Group("/orders")
    g.POST("", m.handler.create)
    g.GET("", m.handler.list)
    g.GET("/:id", m.handler.get)
    g.PATCH("/:id", m.handler.update)
    g.DELETE("/:id", m.handler.delete)
}

// RegisterConsumers subscribes the module's queue handlers (worker binary only).
func (m *Module) RegisterConsumers(c queue.Consumer) {
    c.Handle("payment.captured.v1", m.consumer.onPaymentCaptured)
}
```

Every module exposes the same three verbs, so the container reads like a table of contents.

## `internal/app/container.go`: one file wires everything

The container is the one place that builds infrastructure and modules, in dependency order,
and registers them. Both binaries use it, so wiring is written once.

```go
package app

// Container holds the infrastructure and every module of the service. Adding a module is
// one field, one line in New, and one entry in modules().
type Container struct {
    Config config.Config
    Log    *slog.Logger
    DB     *gorm.DB
    Tx     *database.Transactor

    Orders   *order.Module
    Invoices *invoice.Module

    closers []func() error
}

// New builds the container. Any failure stops startup: a service that starts with half
// its dependencies missing fails later, on a customer request.
func New(cfg config.Config) (_ *Container, err error) {
    c := &Container{Config: cfg, Log: logging.New(cfg.LogLevel)}
    defer func() {
        if err != nil {
            err = errors.Join(err, c.Close()) // release whatever opened before the failure
        }
    }()

    if c.DB, err = database.Open(cfg.Database); err != nil {
        return nil, fmt.Errorf("open database: %w", err)
    }
    c.onClose(func() error { return database.Close(c.DB) })
    c.Tx = database.NewTransactor(c.DB)

    // Modules in dependency order. A module that needs another receives its Service.
    c.Orders = order.New(order.Deps{DB: c.DB, Tx: c.Tx, Log: c.Log})
    c.Invoices = invoice.New(invoice.Deps{DB: c.DB, Tx: c.Tx, Log: c.Log, Orders: c.Orders.Service})

    return c, nil
}

// modules lists every module once, so a module cannot be built and then forgotten by a
// registration loop.
func (c *Container) modules() []any {
    return []any{c.Orders, c.Invoices}
}

type routeRegistrar interface{ RegisterRoutes(rg *gin.RouterGroup) }
type consumerRegistrar interface{ RegisterConsumers(q queue.Consumer) }

func (c *Container) RegisterRoutes(rg *gin.RouterGroup) {
    for _, m := range c.modules() {
        if r, ok := m.(routeRegistrar); ok {
            r.RegisterRoutes(rg)
        }
    }
}

func (c *Container) RegisterConsumers(q queue.Consumer) {
    for _, m := range c.modules() {
        if r, ok := m.(consumerRegistrar); ok {
            r.RegisterConsumers(q)
        }
    }
}

func (c *Container) onClose(fn func() error) { c.closers = append(c.closers, fn) }

// Close releases resources in reverse order of creation.
func (c *Container) Close() error {
    var errs []error
    for i := len(c.closers) - 1; i >= 0; i-- {
        errs = append(errs, c.closers[i]())
    }
    c.closers = nil
    return errors.Join(errs...)
}
```

Why it stays one readable file as the service grows:

- Each module wires its own handler, service and repository inside `module.go`, so the
  container holds **one line per module**, not one per controller plus one per service.
  Thirty modules is about thirty lines in `New`.
- `modules()` is the only list the registration loops read.
- Dependencies are explicit `Deps` fields, visible in this file. A missing one is a compile
  error, never a hidden global.
- Infrastructure that is optional for a deployment (an image generator, an external API) is
  switched by config (`if cfg.Generation.Enabled { ... }`), never by "it failed to connect, so
  leave it nil and keep going".

No DI framework is needed. Reflection-based containers (fx, dig) and generated ones (wire) hide
the same thirty lines behind tooling. If the project already uses one, follow it.

## `cmd/api/main.go`

`main` only handles signals and the exit code. Everything that can fail lives in `run`, which
returns an error, so deferred cleanups always execute.

```go
package main

func main() {
    ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
    defer stop()

    if err := run(ctx); err != nil {
        slog.Error("api stopped", "err", err)
        os.Exit(1)
    }
}

func run(ctx context.Context) error {
    cfg, err := config.Load()
    if err != nil {
        return fmt.Errorf("load config: %w", err)
    }
    c, err := app.New(cfg)
    if err != nil {
        return err
    }
    defer c.Close()

    router := httpx.NewRouter(c.Log, cfg.HTTP)
    c.RegisterRoutes(router.Group("/api/v1", httpx.RequireAuth(cfg.Auth)))

    return httpx.Run(ctx, cfg.HTTP.Addr, router, c.Log)
}
```

Shutdown order falls out of the structure: `httpx.Run` returns after the server drained
in-flight requests, then the deferred `c.Close` closes the database. Nothing closes the
database while a request still uses it.

## `cmd/worker/main.go`

The worker builds **the same container** and registers consumers instead of routes. Business
logic is never duplicated into a worker package, the consumer calls the module's service.

```go
func run(ctx context.Context) error {
    cfg, err := config.Load()
    if err != nil {
        return fmt.Errorf("load config: %w", err)
    }
    c, err := app.New(cfg)
    if err != nil {
        return err
    }
    defer c.Close()

    consumer, err := queue.NewConsumer(cfg.Queue, c.Log)
    if err != nil {
        return fmt.Errorf("create consumer: %w", err)
    }
    c.RegisterConsumers(consumer)

    publisher, err := queue.NewPublisher(cfg.Queue)
    if err != nil {
        return fmt.Errorf("create publisher: %w", err)
    }
    defer publisher.Close()
    relay := outbox.NewRelay(c.DB, publisher, c.Log)

    g, ctx := errgroup.WithContext(ctx)
    g.Go(func() error { return consumer.Run(ctx) })
    g.Go(func() error { return relay.Run(ctx) })
    return g.Wait()
}
```

`errgroup` (`golang.org/x/sync/errgroup`) cancels the shared context when either loop fails or
a signal arrives, and `Wait` returns after both loops have stopped. Details in worker.md.

One binary with a subcommand (`app api`, `app worker`) is fine too when deployment prefers one
image. Keep the two `run` functions separate either way, so the API never starts consumers by
accident.

## Coming from `container/` + `controller/` + `routes/`

A layer-first service with a `ServiceContainer`, a `ControllerContainer` and one
`routes/<entity>_routes.go` per entity maps one to one:

| Layer-first | Module-first |
|---|---|
| `service_container.go`: a field and a constructor call per service | gone, `module.go` builds the service inside the module |
| `controller_container.go`: a field and a constructor call per controller | gone, `module.go` builds the handler |
| `routes/<entity>_routes.go` plus a line in `routes.go` | `RegisterRoutes` in the module's `module.go` |
| `server.go` building both containers and the router | `app.New` and `c.RegisterRoutes` in `cmd/api` |
| adding an entity touches about six files in five folders | adding a module touches its own folder plus three lines in `container.go` |

Per-route middleware (rate limits, permission checks) moves into `RegisterRoutes`. Pass the
middleware factory through `Deps` (`RateLimit func(key string) gin.HandlerFunc`) so the module
does not reach for a global.

## Cross-module calls

The invoice module needs order data. It declares the narrow interface it needs, in its own
package, and receives order's `*Service` through `Deps`:

```go
// internal/invoice/module.go
type orderReader interface {
    Get(ctx context.Context, p order.GetParams) (*order.Order, error)
}

type Deps struct {
    DB     *gorm.DB
    Tx     *database.Transactor
    Log    *slog.Logger
    Orders orderReader // satisfied by *order.Service
}
```

```go
// internal/invoice/service.go
func (s *Service) CreateForOrder(ctx context.Context, p CreateForOrderParams) (*Invoice, error) {
    o, err := s.orders.Get(ctx, order.GetParams{ID: p.OrderID, WorkspaceID: p.WorkspaceID})
    if err != nil {
        return nil, fmt.Errorf("load order: %w", err) // order.ErrNotFound passes through as 404
    }
    if o.Status != order.StatusPaid {
        return nil, ErrOrderNotPaid
    }
    // ...
}
```

Why this way:

- The interface lists only what invoice uses, so invoice's tests fake two methods, not twenty.
- The dependency is visible in `Deps` and in `cmd/`, not hidden in a global or an `init`.
- Going through `order.Service` keeps order's rules (workspace scoping, soft delete) in force.
  Reading the `orders` table from invoice would bypass them.

Allowed and not allowed:

| From invoice | Allowed? |
|---|---|
| `order.Service` methods, `order.Order`, `order.Status`, `order.GetParams`, `order.ErrNotFound` | yes |
| `order`'s repository, DTOs, handler, or the `orders` table | impossible (unexported) or forbidden (raw SQL) |
| order importing invoice back | no: import cycle. See below |

### Breaking a cycle

The compiler rejects A → B → A. When both modules seem to need each other, pick one:

1. **Event:** A writes an event to the outbox, B consumes it. Best when B reacts after the fact
   ("order paid" → "create invoice").
2. **Third module:** move the orchestration into a module that depends on both (`checkout`
   uses `order` and `payment`). Best when one use case spans both.
3. **Interface with local types:** B defines an interface whose methods use B's own types, and
   a small adapter in `cmd/` converts. Use it only when the other two do not fit, it costs the
   most code.

## Cross-module transactions

`Transactor.WithinTx` joins an existing transaction found in the context, so one service can
call another inside its own transaction and both commit or roll back together:

```go
err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
    if err := s.repo.Insert(ctx, inv); err != nil {
        return fmt.Errorf("insert invoice: %w", err)
    }
    return s.orders.MarkInvoiced(ctx, order.MarkInvoicedParams{ID: p.OrderID, InvoiceID: inv.ID})
})
```

Use this sparingly. Two modules that always change together in one transaction are often one
module. When the second step may happen a moment later, prefer an outbox event: the modules
stay independent and a slow second step cannot hold the first one's locks.

## When to split a module, when to merge

| Signal | Action |
|---|---|
| A module passes about 15 to 20 files or has two groups of files that never call each other | split into two modules along that seam |
| Two modules call each other on almost every request, or share a transaction on most writes | merge them |
| A "common" or "utils" module appears with business rules in it | move each rule into the module that owns the data |
| A module must scale or deploy on its own | it is ready to become its own service: its folder already is the boundary |

## Moving from layer-first

A layer-first service (`controller/<entity>/`, `service/<entity>/`, `repository/<entity>/`,
`dto/<entity>/`, `constanta/db-fields/`) moves one entity at a time, one PR each:

1. Create `internal/<entity>/` and move that entity's controller, service, params, repository,
   DTOs, model and db-fields constants into it. Rename files to the layer names above and fix
   the package clause to `package <entity>`.
2. Unexport what nothing outside uses (`go build ./...` tells you what breaks).
3. Add `module.go` and replace the entity's lines in the old container and router with
   `<entity>.New(...)` and `RegisterRoutes`.
4. Run the tests and `scripts/check_boundaries.sh`. Then the next entity.

Keep each move free of behaviour changes. A pure move is quick to review, and a move mixed with
logic changes hides the logic change. Contracts (context first, `error` instead of
`*response.HTTPError`) are a separate, later PR per module, if the team decides on them.
