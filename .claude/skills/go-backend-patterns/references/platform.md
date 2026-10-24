# Platform (shared infrastructure)

`internal/platform/` holds what every module uses and no module owns. It never imports a
module, and it holds no business rules.

## Contents

- `platform/database`: Open, Transactor, Conn, scopes, pagination
- Tenant transactions (row-level security)
- `platform/apperr`: error kinds
- `platform/httpx`: router, identity, WriteError, PageFrom, Run
- Config and logging
- `<org>/shared` utilities

## `platform/database`

```go
package database

type txKey struct{}

// Transactor opens transactions and puts them in the context. Repositories pick them up
// with Conn, so services never handle *gorm.DB.
type Transactor struct {
    db *gorm.DB
}

func NewTransactor(db *gorm.DB) *Transactor { return &Transactor{db: db} }

// WithinTx runs fn in a transaction. Called inside another WithinTx, it joins the outer
// transaction instead of opening a second one. fn returning an error rolls back.
func (t *Transactor) WithinTx(ctx context.Context, fn func(ctx context.Context) error) error {
    if _, ok := ctx.Value(txKey{}).(*gorm.DB); ok {
        return fn(ctx)
    }
    return t.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
        return fn(context.WithValue(ctx, txKey{}, tx))
    })
}

// Conn returns the transaction in ctx, or the pool when there is none.
func Conn(ctx context.Context, db *gorm.DB) *gorm.DB {
    if tx, ok := ctx.Value(txKey{}).(*gorm.DB); ok {
        return tx.WithContext(ctx)
    }
    return db.WithContext(ctx)
}

// NotDeleted is a scope that hides soft-deleted rows.
func NotDeleted(db *gorm.DB) *gorm.DB {
    return db.Where(ColDeletedAt + " IS NULL")
}
```

GORM's `Transaction` commits when the callback returns nil and rolls back on an error or panic.
A joined inner call that returns an error rolls back the whole outer transaction once the error
reaches the outer callback, so always return errors up, never swallow them inside `fn`.

### Pagination and search helpers

```go
const (
    defaultPageSize = 10
    maxPageSize     = 100
)

func PageSize(n int) int {
    if n <= 0 {
        return defaultPageSize
    }
    return min(n, maxPageSize)
}

// Paginate orders by an allowlisted column (falling back to defaultSort), adds id as a
// tie-breaker so pages are stable, and applies limit and offset.
func Paginate(pq response.PaginationQuery, sortable map[string]string, defaultSort string) func(*gorm.DB) *gorm.DB {
    return func(db *gorm.DB) *gorm.DB {
        col, ok := sortable[pq.SortBy]
        if !ok {
            col = defaultSort
        }
        desc := !strings.EqualFold(pq.SortOrder, "asc")
        size := PageSize(pq.PageSize)
        page := max(pq.Page, 1)
        return db.
            Order(clause.OrderByColumn{Column: clause.Column{Name: col}, Desc: desc}).
            Order(clause.OrderByColumn{Column: clause.Column{Name: ColID}, Desc: desc}).
            Limit(size).
            Offset((page - 1) * size)
    }
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// ContainsPattern turns user input into an ILIKE pattern that matches it literally.
func ContainsPattern(s string) string {
    return "%" + likeEscaper.Replace(s) + "%"
}
```

Without the escaper a user who searches for `%` matches every row, and a search for `a_b`
matches `axb`. PostgreSQL's default `LIKE` escape character is the backslash, so no `ESCAPE`
clause is needed.

### Opening the pool

```go
func Open(cfg Config) (*gorm.DB, error) {
    db, err := gorm.Open(postgres.Open(cfg.DSN), &gorm.Config{
        TranslateError: true, // unique violations become gorm.ErrDuplicatedKey
        Logger: logger.New(log.New(os.Stderr, "", log.LstdFlags), logger.Config{
            SlowThreshold:             200 * time.Millisecond,
            LogLevel:                  logger.Warn,
            IgnoreRecordNotFoundError: true, // a 404 lookup is not a database error
        }),
    })
    if err != nil {
        return nil, err
    }
    sqlDB, err := db.DB()
    if err != nil {
        return nil, err
    }
    sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)       // below the database's max_connections divided by replicas
    sqlDB.SetMaxIdleConns(cfg.MaxOpenConns / 2)
    sqlDB.SetConnMaxLifetime(30 * time.Minute)
    return db, nil
}
```

With `TranslateError`, a repository maps `errors.Is(err, gorm.ErrDuplicatedKey)` to a module
error such as `ErrDuplicateNumber` (kind Conflict) instead of returning a 500.

## Tenant transactions (row-level security)

When PostgreSQL row-level security isolates tenants, the policy reads a setting that must be
set inside the same transaction as every query. `set_config(name, value, true)` is the function
form of `SET LOCAL`: transaction-local, and it takes a bind parameter, so the tenant id is never
concatenated into SQL.

```go
const tenantSetting = "app.tenant_id"

func (t *Transactor) WithinTenantTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
    return t.WithinTx(ctx, func(ctx context.Context) error {
        if err := Conn(ctx, t.db).Exec("SELECT set_config(?, ?, true)", tenantSetting, tenantID.String()).Error; err != nil {
            return fmt.Errorf("set tenant: %w", err)
        }
        return fn(ctx)
    })
}
```

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
```

Rules that make it hold:

- The tenant id comes from the verified identity, never from the request body.
- The setting disappears at commit or rollback, so it cannot leak to the next request on a
  pooled connection (safe with PgBouncer transaction pooling too).
- The policy fails closed: an unset setting matches no rows.
- The application connects as a role that does not own the tables and has no `BYPASSRLS`.
  Migrations run as a different role.
- Reads go through `WithinTenantTx` too. A query outside it returns no rows by design. Never
  work around that by setting the variable at session level.

## `platform/apperr`

```go
package apperr

type Kind int

const (
    KindInternal Kind = iota
    KindInvalid
    KindUnauthorized
    KindForbidden
    KindNotFound
    KindConflict
)

func (k Kind) HTTPStatus() int {
    switch k {
    case KindInvalid:
        return http.StatusBadRequest
    case KindUnauthorized:
        return http.StatusUnauthorized
    case KindForbidden:
        return http.StatusForbidden
    case KindNotFound:
        return http.StatusNotFound
    case KindConflict:
        return http.StatusConflict
    default:
        return http.StatusInternalServerError
    }
}

// Error is a domain error. Msg is safe to show to clients. Err is the cause, logged but
// never shown.
type Error struct {
    Kind Kind
    Msg  string
    Err  error
}

func (e *Error) Error() string {
    if e.Err != nil {
        return e.Msg + ": " + e.Err.Error()
    }
    return e.Msg
}

func (e *Error) Unwrap() error { return e.Err }

func Invalid(msg string, cause error) *Error { return &Error{Kind: KindInvalid, Msg: msg, Err: cause} }
func NotFound(msg string) *Error             { return &Error{Kind: KindNotFound, Msg: msg} }
func Conflict(msg string) *Error             { return &Error{Kind: KindConflict, Msg: msg} }
func Forbidden(msg string) *Error            { return &Error{Kind: KindForbidden, Msg: msg} }
func Unauthorized(msg string) *Error         { return &Error{Kind: KindUnauthorized, Msg: msg} }
```

Functions return `error`, never `*apperr.Error`. A function declared to return `*apperr.Error`
that returns a nil pointer produces a **non-nil** `error` interface at the caller, the classic
Go nil-interface bug.

## `platform/httpx`

### WriteError

```go
func WriteError(c *gin.Context, log *slog.Logger, err error) {
    if errors.Is(err, context.Canceled) {
        c.Status(499) // client went away, nothing useful to send or log
        return
    }

    status, msg := http.StatusInternalServerError, "Internal server error"
    if e, ok := errors.AsType[*apperr.Error](err); ok && e.Kind != apperr.KindInternal { // Go 1.26+, errors.As before
        status, msg = e.Kind.HTTPStatus(), e.Msg
    }
    if status >= http.StatusInternalServerError {
        log.ErrorContext(c.Request.Context(), "request failed",
            "method", c.Request.Method, "route", c.FullPath(), "err", err)
    }
    response.JSONResponse(c, nil, msg, status)
}
```

One function decides status, message and logging for every module, so error bodies match
everywhere and a 500 is logged exactly once with the full wrapped chain.

### Identity

```go
type Identity struct {
    UserID      uuid.UUID
    WorkspaceID uuid.UUID
    TenantID    uuid.UUID
    Role        string
}

type identityKey struct{}

// WithIdentity is called by the auth middleware after verifying the token. It stores the
// identity on the request context, so services, strict handlers and gRPC share one path.
func WithIdentity(c *gin.Context, id Identity) {
    c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), identityKey{}, id))
}

func IdentityFromContext(ctx context.Context) (Identity, error) {
    id, ok := ctx.Value(identityKey{}).(Identity)
    if !ok {
        return Identity{}, apperr.Unauthorized("Authentication required")
    }
    return id, nil
}

func IdentityFrom(c *gin.Context) (Identity, error) {
    return IdentityFromContext(c.Request.Context())
}
```

### PageFrom

```go
func PageFrom(page, size int, sortBy, sortOrder string) response.PaginationQuery {
    return response.PaginationQuery{
        Page:      max(page, 1),
        PageSize:  database.PageSize(size),
        SortBy:    sortBy,    // checked against the repository's allowlist, never trusted
        SortOrder: sortOrder, // only "asc" changes anything, everything else means desc
    }
}
```

### Router and server

```go
func NewRouter(log *slog.Logger, cfg Config) *gin.Engine {
    gin.SetMode(cfg.GinMode)
    r := gin.New() // not gin.Default: we choose the logger and recovery ourselves
    r.Use(RequestID(), AccessLog(log), Recovery(log), CORS(cfg.CORS))
    r.GET("/healthz", func(c *gin.Context) { c.Status(http.StatusOK) }) // liveness: no dependencies
    r.GET("/readyz", Ready(cfg.Ready))                                  // readiness: pings the database
    return r
}

// Run serves until ctx is cancelled, then drains in-flight requests.
func Run(ctx context.Context, addr string, h http.Handler, log *slog.Logger) error {
    srv := &http.Server{
        Addr:              addr,
        Handler:           h,
        ReadHeaderTimeout: 10 * time.Second, // slow-header clients cannot hold connections forever
    }
    errCh := make(chan error, 1)
    go func() { errCh <- srv.ListenAndServe() }()
    log.Info("http listening", "addr", addr)

    select {
    case err := <-errCh:
        return err
    case <-ctx.Done():
    }

    shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
    defer cancel()
    return srv.Shutdown(shutdownCtx)
}
```

## Config and logging

- `platform/config` loads one typed `Config` from the environment (and flags) in `main`. Nothing
  below `cmd/` calls `os.Getenv`, so every setting is visible in one struct and testable.
- Fail at startup on a missing required setting, not on the first request that needs it.
- `platform/logging` builds a `*slog.Logger` with the JSON handler in production and the text
  handler locally. Wrap the handler so it adds the request id from the context to every record,
  then `InfoContext(ctx, ...)` lines carry it automatically.
- In a project that already uses `<org>/shared/logger`, use it and skip this package.

## `<org>/shared` utilities

When the org's shared module exists, prefer it over writing platform code again:

| Package | Provides | Note |
|---|---|---|
| `<org>/shared/response` | `JSONResponse`, `JSONPaginatedResponse`, `PaginationQuery`, `PaginationResult`, `ToPaginationMeta`, `HTTPError` constructors | the response envelope. New modules use `apperr` for errors and keep the envelope |
| `<org>/shared/logger` | structured logging with field maps | use it where the project does |
| `<org>/shared/utils/pgtx`, `gormtx` | explicit-`tx` transaction helpers returning `*response.HTTPError` | existing projects only, `Transactor` replaces them in new code |
| `<org>/shared/utils` | pointer helpers (`StringPtr`), slugs, random tokens, JWT helpers, client type detection | on Go 1.26+, `new("x")` replaces the pointer helpers |
| `<org>/shared/connection/psql`, `redis` | connection constructors from config | wrap them in `platform/database.Open` |
| `<org>/shared/middleware`, `middleware/ratelimit` | CORS, Redis-backed rate limiting | mount in `httpx.NewRouter` or per route group |

Check the shared module's actual exports with `go doc <org>/shared/<package>` before calling a
function from this table: names drift between versions.
