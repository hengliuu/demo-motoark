# Repository (go-pg)

Same contract as repository-gorm.md, translated to `github.com/go-pg/pg/v10`. Read that file
first for the rules (unexported repository, `ErrNotFound`, sort allowlist, soft delete). This
file only shows what differs.

go-pg is in maintenance mode (its README points new development to Bun). Keep it in projects
that already use it, and don't start a new service on it.

## Contents

- Connection from context
- Transactor for go-pg
- Find
- List with filters, search and allowlisted sort
- Update with version
- Soft delete

## Connection from context

`*pg.DB` and `*pg.Tx` both satisfy `orm.DB`, so the repository works with either:

```go
// internal/platform/database (go-pg variant)
type txKey struct{}

func Conn(ctx context.Context, db *pg.DB) orm.DB {
    if tx, ok := ctx.Value(txKey{}).(*pg.Tx); ok {
        return tx
    }
    return db
}
```

## Transactor for go-pg

```go
type Transactor struct {
    db *pg.DB
}

func NewTransactor(db *pg.DB) *Transactor { return &Transactor{db: db} }

func (t *Transactor) WithinTx(ctx context.Context, fn func(ctx context.Context) error) error {
    if _, ok := ctx.Value(txKey{}).(*pg.Tx); ok {
        return fn(ctx) // join the transaction already in ctx
    }
    return t.db.RunInTransaction(ctx, func(tx *pg.Tx) error {
        return fn(context.WithValue(ctx, txKey{}, tx))
    })
}
```

`RunInTransaction` commits when `fn` returns nil and rolls back on an error or a panic.

## Find

```go
type pgRepository struct {
    db *pg.DB
}

func (r *pgRepository) findByID(ctx context.Context, id, workspaceID uuid.UUID) (*Order, error) {
    var o Order
    err := database.Conn(ctx, r.db).ModelContext(ctx, &o).
        Where("? = ?", pg.Ident(colID), id).
        Where("? = ?", pg.Ident(colWorkspaceID), workspaceID).
        Where("? IS NULL", pg.Ident(database.ColDeletedAt)).
        Select()
    if errors.Is(err, pg.ErrNoRows) {
        return nil, ErrNotFound
    }
    if err != nil {
        return nil, err
    }
    return &o, nil
}
```

`pg.Ident` quotes identifiers. Prefer it to `fmt.Sprintf` with column names, which only stays
safe as long as every argument is a constant.

## List with filters, search and allowlisted sort

```go
func (r *pgRepository) filtered(ctx context.Context, q listQuery, dest *[]Order) *orm.Query {
    query := database.Conn(ctx, r.db).ModelContext(ctx, dest).
        Where("? IS NULL", pg.Ident(database.ColDeletedAt)).
        Where("? = ?", pg.Ident(colWorkspaceID), q.WorkspaceID)

    if q.Status != "" {
        query = query.Where("? = ?", pg.Ident(colStatus), q.Status)
    }
    if q.Search != "" {
        pattern := database.ContainsPattern(q.Search)
        query = query.WhereGroup(func(g *orm.Query) (*orm.Query, error) {
            return g.WhereOr("? ILIKE ?", pg.Ident(colCustomerName), pattern).
                WhereOr("? ILIKE ?", pg.Ident(colNotes), pattern), nil
        })
    }
    return query
}

func (r *pgRepository) list(ctx context.Context, q listQuery) ([]Order, int64, error) {
    var orders []Order
    query := r.filtered(ctx, q, &orders)

    col, ok := sortable[q.Page.SortBy]
    if !ok {
        col = database.ColCreatedAt
    }
    dir := "DESC"
    if strings.EqualFold(q.Page.SortOrder, "asc") {
        dir = "ASC"
    }
    size := database.PageSize(q.Page.PageSize) // default 10, max 100
    page := max(q.Page.Page, 1)

    total, err := query.
        OrderExpr("? "+dir+", ? "+dir, pg.Ident(col), pg.Ident(database.ColID)). // dir is one of two constants
        Limit(size).
        Offset((page - 1) * size).
        SelectAndCount()
    if err != nil {
        return nil, 0, err
    }
    return orders, int64(total), nil
}
```

`SelectAndCount` runs the count without the limit and offset, in one round trip.

## Update with version

```go
func (r *pgRepository) updateWithVersion(ctx context.Context, id uuid.UUID, version int, updates map[string]any) error {
    query := database.Conn(ctx, r.db).ModelContext(ctx, (*Order)(nil)).
        Where("? = ?", pg.Ident(colID), id).
        Where("? = ?", pg.Ident(database.ColVersion), version).
        Where("? IS NULL", pg.Ident(database.ColDeletedAt)).
        Set("? = ?", pg.Ident(database.ColUpdatedAt), time.Now()).
        Set("? = ? + 1", pg.Ident(database.ColVersion), pg.Ident(database.ColVersion))

    for col, val := range updates {
        query = query.Set("? = ?", pg.Ident(col), val)
    }

    res, err := query.Update()
    if err != nil {
        return err
    }
    if res.RowsAffected() == 0 {
        return ErrVersionConflict
    }
    return nil
}
```

## Soft delete

```go
func (r *pgRepository) softDelete(ctx context.Context, id, actor uuid.UUID) error {
    now := time.Now()
    _, err := database.Conn(ctx, r.db).ModelContext(ctx, (*Order)(nil)).
        Where("? = ?", pg.Ident(colID), id).
        Where("? IS NULL", pg.Ident(database.ColDeletedAt)).
        Set("? = ?", pg.Ident(database.ColDeletedAt), now).
        Set("? = ?", pg.Ident(database.ColDeletedBy), actor).
        Set("? = ?", pg.Ident(database.ColUpdatedAt), now).
        Update()
    return err
}
```

The go-pg model generates UUID v7 ids in a `BeforeInsert(ctx) (context.Context, error)` hook on
the base model, the go-pg equivalent of GORM's `BeforeCreate`.
