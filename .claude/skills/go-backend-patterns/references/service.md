# Service (business logic)

## Contents

- Structure
- Model and column constants (`model.go`)
- Params (`params.go`)
- Errors (`errors.go`)
- Create
- Get (scoped, not-found as 404)
- List
- Update with an update map and optimistic locking
- Delete (soft)
- Validation
- Transactions
- Logging

## Structure

```go
package order

type Service struct {
    repo repository
    tx   transactor
    log  *slog.Logger
}

// transactor is the part of database.Transactor the service uses. Tests pass a fake
// that just calls fn(ctx).
type transactor interface {
    WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}

func NewService(repo repository, tx transactor, log *slog.Logger) *Service {
    return &Service{repo: repo, tx: tx, log: log}
}
```

Accept interfaces, return structs: the service depends on small interfaces it can fake
(`repository`, `transactor`, other modules' readers) and is itself a concrete `*Service`.
Methods take `ctx context.Context` first and return `error`.

## Model and column constants (`model.go`)

```go
package order

type Status string

const (
    StatusPending   Status = "pending"
    StatusPaid      Status = "paid"
    StatusCancelled Status = "cancelled"
)

func (s Status) Valid() bool {
    switch s {
    case StatusPending, StatusPaid, StatusCancelled:
        return true
    }
    return false
}

type Order struct {
    database.Base                    // ID (UUID v7), Version, CreatedAt, UpdatedAt, DeletedAt, DeletedBy
    WorkspaceID  uuid.UUID `gorm:"type:uuid;not null;index"`
    CreatedBy    uuid.UUID `gorm:"type:uuid;not null"`
    CustomerName string    `gorm:"not null"`
    Notes        *string
    Status       Status    `gorm:"not null"`
}

func (Order) TableName() string { return "orders" }

// Column names, used as keys in update maps and in filters. Unexported: only this
// module writes to its table.
const (
    colID           = "id"
    colWorkspaceID  = "workspace_id"
    colCustomerName = "customer_name"
    colNotes        = "notes"
    colStatus       = "status"
)
```

Column constants replace the old global `constanta/db-fields/` package. They live with the one
module that owns the table. Base columns (`created_at`, `updated_at`, `deleted_at`,
`deleted_by`, `version`) are exported from `platform/database` because every module shares them.

## Params (`params.go`)

Params are the service's inputs. They are transport-agnostic: the HTTP handler, the queue
consumer and the gRPC adapter all build the same params. No JSON tags.

```go
type CreateParams struct {
    WorkspaceID  uuid.UUID
    UserID       uuid.UUID
    CustomerName string
    Notes        *string
}

type GetParams struct {
    ID          uuid.UUID
    WorkspaceID uuid.UUID
}

type ListParams struct {
    WorkspaceID uuid.UUID
    Status      Status // zero value = any
    Search      string
    Page        response.PaginationQuery
}

type UpdateParams struct {
    ID           uuid.UUID
    WorkspaceID  uuid.UUID
    UserID       uuid.UUID
    Version      int     // the version the client read; required, so not a pointer
    CustomerName *string // nil = leave unchanged
    Notes        *string
}

type DeleteParams struct {
    ID          uuid.UUID
    WorkspaceID uuid.UUID
    UserID      uuid.UUID
}

type CancelParams struct {
    ID          uuid.UUID
    WorkspaceID uuid.UUID
    Version     int
}
```

Optional fields are pointers so "not sent" (nil) and "set to empty" (`""`) stay different.

## Errors (`errors.go`)

```go
package order

var (
    ErrNotFound        = apperr.NotFound("Order not found")
    ErrVersionConflict = apperr.Conflict("Order was changed by someone else, reload and retry")
    ErrNotCancellable  = apperr.Invalid("Only pending orders can be cancelled", nil)
)
```

Each error carries an `apperr` kind (platform.md), and `httpx.WriteError` maps kinds to status
codes in one place. Callers check with `errors.Is(err, order.ErrNotFound)` even after wrapping
with `%w`, so other modules and consumers can react without parsing messages.

## Create

```go
func (s *Service) Create(ctx context.Context, p CreateParams) (*Order, error) {
    if err := validateCustomerName(p.CustomerName); err != nil {
        return nil, err
    }

    o := &Order{
        WorkspaceID:  p.WorkspaceID,
        CreatedBy:    p.UserID,
        CustomerName: strings.TrimSpace(p.CustomerName),
        Notes:        p.Notes,
        Status:       StatusPending,
    }
    if err := s.repo.insert(ctx, o); err != nil {
        return nil, fmt.Errorf("insert order: %w", err)
    }

    s.log.InfoContext(ctx, "order created", "order_id", o.ID, "workspace_id", p.WorkspaceID)
    return o, nil
}
```

A single insert needs no explicit transaction. Open one when the method writes twice (two
tables, or a row plus an outbox event).

## Get (scoped, not-found as 404)

```go
func (s *Service) Get(ctx context.Context, p GetParams) (*Order, error) {
    o, err := s.repo.findByID(ctx, p.ID, p.WorkspaceID)
    if err != nil {
        return nil, fmt.Errorf("find order %s: %w", p.ID, err) // ErrNotFound wraps through
    }
    return o, nil
}
```

The repository filters by workspace, so an order from another workspace is simply not found.
Answering 404 instead of 403 for foreign ids avoids telling an attacker which ids exist.

## List

```go
func (s *Service) List(ctx context.Context, p ListParams) ([]Order, *response.PaginationResult, error) {
    if p.Status != "" && !p.Status.Valid() {
        return nil, nil, apperr.Invalid(fmt.Sprintf("Unknown status %q", p.Status), nil)
    }
    orders, total, err := s.repo.list(ctx, listQuery{
        WorkspaceID: p.WorkspaceID,
        Status:      p.Status,
        Search:      p.Search,
        Page:        p.Page,
    })
    if err != nil {
        return nil, nil, fmt.Errorf("list orders: %w", err)
    }
    return orders, p.Page.GetPaginationResult(total), nil
}
```

## Update with an update map and optimistic locking

Partial updates use `map[string]any` keyed by column constants. A struct update in GORM skips
zero values, so "set notes to empty" would silently do nothing.

```go
func (s *Service) Update(ctx context.Context, p UpdateParams) (*Order, error) {
    updates := map[string]any{}
    if p.CustomerName != nil {
        if err := validateCustomerName(*p.CustomerName); err != nil {
            return nil, err
        }
        updates[colCustomerName] = strings.TrimSpace(*p.CustomerName)
    }
    if p.Notes != nil {
        updates[colNotes] = *p.Notes
    }

    var updated *Order
    err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
        current, err := s.repo.findByID(ctx, p.ID, p.WorkspaceID) // 404 before 409
        if err != nil {
            return err
        }
        if len(updates) == 0 {
            updated = current
            return nil
        }
        if err := s.repo.updateWithVersion(ctx, p.ID, p.Version, updates); err != nil {
            return err // ErrVersionConflict when someone else saved first
        }
        updated, err = s.repo.findByID(ctx, p.ID, p.WorkspaceID)
        return err
    })
    if err != nil {
        return nil, fmt.Errorf("update order %s: %w", p.ID, err)
    }
    return updated, nil
}
```

The version comes from the request, never re-read inside the transaction. Re-reading it would
hide exactly the conflict the check exists to catch.

## Delete (soft)

```go
func (s *Service) Delete(ctx context.Context, p DeleteParams) error {
    err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
        if _, err := s.repo.findByID(ctx, p.ID, p.WorkspaceID); err != nil {
            return err
        }
        return s.repo.softDelete(ctx, p.ID, p.UserID)
    })
    if err != nil {
        return fmt.Errorf("delete order %s: %w", p.ID, err)
    }
    s.log.InfoContext(ctx, "order deleted", "order_id", p.ID, "by", p.UserID)
    return nil
}
```

## Validation

Shape is checked by DTO binding tags. The service checks rules that need meaning or state, and
returns `apperr.Invalid` with a message the client can show:

```go
func validateCustomerName(name string) error {
    if strings.TrimSpace(name) == "" {
        return apperr.Invalid("Customer name is required", nil)
    }
    return nil
}

func (s *Service) Cancel(ctx context.Context, p CancelParams) error {
    return s.tx.WithinTx(ctx, func(ctx context.Context) error {
        o, err := s.repo.findByID(ctx, p.ID, p.WorkspaceID)
        if err != nil {
            return err
        }
        if o.Status != StatusPending {
            return ErrNotCancellable
        }
        return s.repo.updateWithVersion(ctx, p.ID, p.Version, map[string]any{colStatus: StatusCancelled})
    })
}
```

## Transactions

- Open a transaction in the service with `s.tx.WithinTx(ctx, fn)` whenever a method writes more
  than once, or reads then writes based on what it read.
- Inside `fn`, use **the `ctx` passed to `fn`**, not the outer one. The transaction travels in
  that context. Shadowing it with the same name `ctx`, as above, makes the outer one unreachable.
- Never call the broker, an HTTP API or another slow external system inside a transaction. It
  holds row locks for the duration of the call. Write an outbox row instead (outbox.md).
- Tenant-scoped data with row-level security uses `WithinTenantTx(ctx, tenantID, fn)`
  (platform.md), reads included, because the tenant setting lasts for one transaction.

## Logging

- Log business events worth knowing about (created, cancelled, paid) at Info with ids, from the
  service.
- Do not log errors you return. The boundary (handler, consumer) logs a failure once with the
  request id. Return `fmt.Errorf("what was being done: %w", err)` so that one log line carries
  the full chain.
- Use `slog` with the context (`InfoContext`) so the request id and trace id from middleware
  appear on every line. In a project with `<org>/shared/logger`, use that instead.
- Never log secrets, tokens, passwords or full request bodies.
