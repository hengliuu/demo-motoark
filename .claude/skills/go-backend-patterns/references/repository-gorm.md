# Repository (GORM)

## Contents

- Contract
- Structure
- Insert and find
- Filters and search
- List with pagination and a sort allowlist
- Update with version (optimistic locking)
- Soft delete with actor
- Base model and UUID v7 keys
- Migrations

Use this file when `go.mod` has `gorm.io/gorm`. For `go-pg/pg` use repository-gopg.md, the
contract is identical.

## Contract

- The repository is **unexported** (`repository` interface, `gormRepository` struct). Only the
  module's service uses it, and the service's tests fake it.
- Every method takes `ctx` first and gets its connection from `database.Conn(ctx, r.db)`, which
  returns the transaction the service opened, or the pool when there is none.
- Not found returns the module's `ErrNotFound`, never `(nil, nil)`. A `nil, nil` result invites
  a nil-pointer panic in the first caller that forgets to check.
- Every read filters soft-deleted rows and scopes by workspace or tenant.
- Column names come from constants (`colStatus`, `database.ColDeletedAt`), never typed inline.
- Raw values never reach SQL text. Values are bind parameters (`?`), and identifiers (sort
  columns) come from an allowlist.

## Structure

```go
package order

type repository interface {
    insert(ctx context.Context, o *Order) error
    findByID(ctx context.Context, id, workspaceID uuid.UUID) (*Order, error)
    list(ctx context.Context, q listQuery) ([]Order, int64, error)
    updateWithVersion(ctx context.Context, id uuid.UUID, version int, updates map[string]any) error
    softDelete(ctx context.Context, id, actor uuid.UUID) error
}

type listQuery struct {
    WorkspaceID uuid.UUID
    Status      Status
    Search      string
    Page        response.PaginationQuery
}

type gormRepository struct {
    db *gorm.DB
}

func newGormRepository(db *gorm.DB) *gormRepository {
    return &gormRepository{db: db}
}

func (r *gormRepository) conn(ctx context.Context) *gorm.DB {
    return database.Conn(ctx, r.db)
}
```

## Insert and find

```go
func (r *gormRepository) insert(ctx context.Context, o *Order) error {
    return r.conn(ctx).Create(o).Error // Base.BeforeCreate assigns the UUID v7
}

func (r *gormRepository) findByID(ctx context.Context, id, workspaceID uuid.UUID) (*Order, error) {
    var o Order
    err := r.conn(ctx).
        Scopes(database.NotDeleted).
        Where(colID+" = ? AND "+colWorkspaceID+" = ?", id, workspaceID).
        First(&o).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrNotFound
    }
    if err != nil {
        return nil, err
    }
    return &o, nil
}
```

## Filters and search

```go
// filtered builds a fresh query each call. Reusing one *gorm.DB chain for Count and Find
// carries state from the first call into the second, so build it twice instead.
func (r *gormRepository) filtered(ctx context.Context, q listQuery) *gorm.DB {
    db := r.conn(ctx).
        Model(&Order{}).
        Scopes(database.NotDeleted).
        Where(colWorkspaceID+" = ?", q.WorkspaceID)

    if q.Status != "" {
        db = db.Where(colStatus+" = ?", q.Status)
    }
    if q.Search != "" {
        pattern := database.ContainsPattern(q.Search) // escapes % and _ typed by the user
        db = db.Where("("+colCustomerName+" ILIKE ? OR "+colNotes+" ILIKE ?)", pattern, pattern)
    }
    return db
}
```

The parentheses around the `OR` matter: without them `workspace_id = ? AND name ILIKE ? OR
notes ILIKE ?` matches notes from every workspace.

## List with pagination and a sort allowlist

```go
// sortable maps the API's sort_by values to real columns. Anything else falls back to
// the default, so user input never becomes SQL text.
var sortable = map[string]string{
    "created_at":    database.ColCreatedAt,
    "updated_at":    database.ColUpdatedAt,
    "customer_name": colCustomerName,
    "status":        colStatus,
}

func (r *gormRepository) list(ctx context.Context, q listQuery) ([]Order, int64, error) {
    var total int64
    if err := r.filtered(ctx, q).Count(&total).Error; err != nil {
        return nil, 0, err
    }

    var orders []Order
    err := r.filtered(ctx, q).
        Scopes(database.Paginate(q.Page, sortable, database.ColCreatedAt)).
        Find(&orders).Error
    if err != nil {
        return nil, 0, err
    }
    return orders, total, nil
}
```

`database.Paginate` (platform.md) quotes the chosen column with `clause.OrderByColumn`, accepts
only `asc` or `desc`, adds `id` as a tie-breaker so pages are stable, and caps the page size.

**Never** build `ORDER BY` with `fmt.Sprintf("%s %s", sortBy, sortOrder)` from request values.
That is SQL injection through a query parameter, and it is easy to miss because it looks like
pagination code. If the API should answer 400 for an unknown `sort_by` instead of falling back,
check the key against `sortable` in the service.

Offset pagination slows down on deep pages of big tables. For feeds or exports over large
tables, use keyset pagination (`WHERE (created_at, id) < (?, ?) ORDER BY created_at DESC, id
DESC LIMIT ?`) and return a cursor instead of a page number.

## Update with version (optimistic locking)

```go
func (r *gormRepository) updateWithVersion(ctx context.Context, id uuid.UUID, version int, updates map[string]any) error {
    updates[database.ColUpdatedAt] = time.Now()
    updates[database.ColVersion] = gorm.Expr(database.ColVersion + " + 1")

    res := r.conn(ctx).
        Model(&Order{}).
        Scopes(database.NotDeleted).
        Where(colID+" = ? AND "+database.ColVersion+" = ?", id, version).
        Updates(updates)
    if res.Error != nil {
        return res.Error
    }
    if res.RowsAffected == 0 {
        return ErrVersionConflict
    }
    return nil
}
```

- Always the map form of `Updates`. The struct form skips zero values, so setting a field to
  `""`, `0` or `false` silently does nothing.
- `gorm.Expr` increments in SQL, so the bump is atomic with the version match.
- Zero rows also happens for a missing id. The service loads the row first, so a missing id
  answers 404 before this runs (service.md).
- The new version goes back to the client in the response, ready for its next edit.

## Soft delete with actor

```go
func (r *gormRepository) softDelete(ctx context.Context, id, actor uuid.UUID) error {
    now := time.Now()
    return r.conn(ctx).
        Model(&Order{}).
        Scopes(database.NotDeleted).
        Where(colID+" = ?", id).
        Updates(map[string]any{
            database.ColDeletedAt: now,
            database.ColDeletedBy: actor,
            database.ColUpdatedAt: now,
        }).Error
}
```

The base model uses a plain `*time.Time` for `DeletedAt`, not `gorm.DeletedAt`, so GORM does not
filter automatically and every read uses the `database.NotDeleted` scope. Pick one mechanism per
project and never mix them.

For a project with no hard delete, don't write a hard-delete method at all and enforce it in the
database: grant the application role `SELECT, INSERT, UPDATE` without `DELETE`. Unique indexes
then need `WHERE deleted_at IS NULL`, so a deleted row does not block its replacement.

## Base model and UUID v7 keys

```go
// internal/platform/database/base.go
type Base struct {
    ID        uuid.UUID  `gorm:"type:uuid;primaryKey"`
    Version   int        `gorm:"not null;default:1"`
    CreatedAt time.Time
    UpdatedAt time.Time
    DeletedAt *time.Time `gorm:"index"`
    DeletedBy *uuid.UUID `gorm:"type:uuid"`
}

func (b *Base) BeforeCreate(*gorm.DB) error {
    if b.ID != uuid.Nil {
        return nil
    }
    id, err := uuid.NewV7()
    if err != nil {
        return err
    }
    b.ID = id
    return nil
}

const (
    ColID        = "id"
    ColCreatedAt = "created_at"
    ColUpdatedAt = "updated_at"
    ColDeletedAt = "deleted_at"
    ColDeletedBy = "deleted_by"
    ColVersion   = "version"
)
```

UUID v7 is time-ordered, so inserts append to the index instead of scattering across it, and
`ORDER BY id` is creation order. `uuid.NewV7` here is `github.com/google/uuid`. PostgreSQL 18
adds a native `uuidv7()`, and Go 1.27 adds a standard library `uuid` package. Check both against
the project's versions before switching, and switch the whole project at once.

The hook runs for `Create` and batch inserts. A row inserted with raw SQL skips it and must set
its own id.

## Migrations

- Schema lives in versioned SQL files in `migrations/` (goose or golang-migrate, whichever the
  project uses), applied by a separate step or command, never by `AutoMigrate` at startup in
  production.
- Prefix a migration with its module so ownership is visible:
  `20261024093000_order_create_orders.sql`.
- One module's migration never alters another module's table. Ask that module's owner, or add
  the change in that module.
- Run migrations with a role that owns the tables. The application role does not, which keeps
  row-level security enforced (platform.md).
