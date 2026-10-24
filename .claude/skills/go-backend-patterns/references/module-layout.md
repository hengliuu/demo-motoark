# Module Layout and Wiring

## Contents

- What a module is
- Naming
- `module.go`: the module's front door
- `cmd/api/main.go`
- `cmd/worker/main.go`
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

Every module exposes the same three verbs, so `cmd/` reads like a table of contents and a new
module is wired by adding two lines.

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
    log := logging.New(cfg.LogLevel)

    db, err := database.Open(cfg.Database)
    if err != nil {
        return fmt.Errorf("open database: %w", err)
    }
    defer database.Close(db)
    tx := database.NewTransactor(db)

    // Modules, in dependency order. A module that needs another receives its Service.
    orders := order.New(order.Deps{DB: db, Tx: tx, Log: log})
    invoices := invoice.New(invoice.Deps{DB: db, Tx: tx, Log: log, Orders: orders.Service})

    router := httpx.NewRouter(log, cfg.HTTP)
    api := router.Group("/api/v1", httpx.RequireAuth(cfg.Auth))
    orders.RegisterRoutes(api)
    invoices.RegisterRoutes(api)

    return httpx.Run(ctx, cfg.HTTP.Addr, router, log)
}
```

Shutdown order falls out of the structure: `httpx.Run` returns after the server drained
in-flight requests, then the deferred `database.Close` runs. Nothing closes the database while a
request still uses it.

## `cmd/worker/main.go`

The worker builds **the same modules** and registers consumers instead of routes. Business
logic is never duplicated into a worker package, the consumer calls the module's service.

```go
func run(ctx context.Context) error {
    // ...config, log, db, tx exactly as in cmd/api

    orders := order.New(order.Deps{DB: db, Tx: tx, Log: log})
    invoices := invoice.New(invoice.Deps{DB: db, Tx: tx, Log: log, Orders: orders.Service})

    consumer, err := queue.NewConsumer(cfg.Queue, log)
    if err != nil {
        return fmt.Errorf("create consumer: %w", err)
    }
    orders.RegisterConsumers(consumer)
    invoices.RegisterConsumers(consumer)

    publisher, err := queue.NewPublisher(cfg.Queue)
    if err != nil {
        return fmt.Errorf("create publisher: %w", err)
    }
    defer publisher.Close()
    relay := outbox.NewRelay(db, publisher, log)

    g, ctx := errgroup.WithContext(ctx)
    g.Go(func() error { return consumer.Run(ctx) })
    g.Go(func() error { return relay.Run(ctx) })
    return g.Wait()
}
```

`errgroup` (`golang.org/x/sync/errgroup`) cancels the shared context when either loop fails or
a signal arrives, and `Wait` returns after both loops have stopped. Details in worker.md.

One binary with a flag (`app api`, `app worker`) is fine too when deployment prefers one image.
Keep the two `run` functions separate either way, so the API never starts consumers by accident.

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
