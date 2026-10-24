# Testing

## Contents

- What to test where
- Fakes for the service's dependencies
- Table-driven service tests
- Handler tests
- Repository tests against real Postgres (testcontainers)
- Testing workers and retries with synctest
- Commands

## What to test where

| Test | File | Dependencies | Runs in |
|---|---|---|---|
| Business rules | `service_test.go` | fake repository, fake transactor, fake other modules | milliseconds, no Docker |
| HTTP contract (status, body shape, binding) | `handler_test.go` | real service over fake repository, `httptest` | milliseconds |
| SQL correctness (filters, soft delete, version check, sorting) | `repository_test.go` | real Postgres via testcontainers | seconds, needs Docker |
| Consumers | `consumer_test.go` | real service over fakes, handcrafted `queue.Message` | milliseconds |
| Pool and periodic jobs | `platform/jobs/*_test.go` | `testing/synctest` | milliseconds, fake clock |

Tests live in the module's package (`package order`), so they can use unexported types and fakes
without exporting anything for tests' sake.

## Fakes for the service's dependencies

Hand-written fakes over the small interfaces. No mocking framework is needed when the
interfaces are this small, and a fake that behaves like the real thing catches more than a mock
that only checks calls.

```go
// internal/order/fakes_test.go
type fakeRepo struct {
    orders map[uuid.UUID]*Order
    err    error // when set, every call fails with it
}

func newFakeRepo(orders ...*Order) *fakeRepo {
    r := &fakeRepo{orders: map[uuid.UUID]*Order{}}
    for _, o := range orders {
        r.orders[o.ID] = o
    }
    return r
}

func (r *fakeRepo) insert(_ context.Context, o *Order) error {
    if r.err != nil {
        return r.err
    }
    o.ID = uuid.New()
    o.Version = 1
    r.orders[o.ID] = o
    return nil
}

func (r *fakeRepo) findByID(_ context.Context, id, workspaceID uuid.UUID) (*Order, error) {
    if r.err != nil {
        return nil, r.err
    }
    o, ok := r.orders[id]
    if !ok || o.WorkspaceID != workspaceID || o.DeletedAt != nil {
        return nil, ErrNotFound
    }
    clone := *o
    return &clone, nil
}

func (r *fakeRepo) updateWithVersion(_ context.Context, id uuid.UUID, version int, updates map[string]any) error {
    o, ok := r.orders[id]
    if !ok || o.Version != version {
        return ErrVersionConflict
    }
    if v, ok := updates[colStatus]; ok {
        o.Status = v.(Status)
    }
    if v, ok := updates[colCustomerName]; ok {
        o.CustomerName = v.(string)
    }
    o.Version++
    return nil
}

// list and softDelete follow the same pattern.

type fakeTx struct{}

func (fakeTx) WithinTx(ctx context.Context, fn func(ctx context.Context) error) error {
    return fn(ctx)
}

func newTestService(repo repository) *Service {
    return NewService(repo, fakeTx{}, slog.New(slog.DiscardHandler))
}
```

`slog.DiscardHandler` needs Go 1.24 or newer. On older versions use
`slog.New(slog.NewTextHandler(io.Discard, nil))`.

## Table-driven service tests

```go
func TestService_Cancel(t *testing.T) {
    ws := uuid.New()
    pending := &Order{Base: database.Base{ID: uuid.New(), Version: 1}, WorkspaceID: ws, Status: StatusPending}
    paid := &Order{Base: database.Base{ID: uuid.New(), Version: 1}, WorkspaceID: ws, Status: StatusPaid}

    tests := []struct {
        name    string
        params  CancelParams
        wantErr error
    }{
        {"pending order is cancelled", CancelParams{ID: pending.ID, WorkspaceID: ws, Version: 1}, nil},
        {"paid order cannot be cancelled", CancelParams{ID: paid.ID, WorkspaceID: ws, Version: 1}, ErrNotCancellable},
        {"stale version conflicts", CancelParams{ID: pending.ID, WorkspaceID: ws, Version: 7}, ErrVersionConflict},
        {"other workspace is not found", CancelParams{ID: pending.ID, WorkspaceID: uuid.New(), Version: 1}, ErrNotFound},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            clonePending, clonePaid := *pending, *paid // each case starts from fresh rows
            svc := newTestService(newFakeRepo(&clonePending, &clonePaid))

            err := svc.Cancel(t.Context(), tt.params)

            if !errors.Is(err, tt.wantErr) {
                t.Fatalf("Cancel() error = %v, want %v", err, tt.wantErr)
            }
        })
    }
}
```

- `t.Context()` (Go 1.24+) is cancelled when the test ends, so goroutines started with it stop.
- Assert on errors with `errors.Is` against the module's sentinels, never on message text.
- Each case builds its own fake state. Shared mutable state between cases makes the order of
  cases matter.

## Handler tests

```go
func TestHandler_Get_NotFound(t *testing.T) {
    gin.SetMode(gin.TestMode)
    m := &Module{}
    svc := newTestService(newFakeRepo())
    m.handler = &handler{svc: svc, log: slog.New(slog.DiscardHandler)}

    r := gin.New()
    r.Use(func(c *gin.Context) { // stand-in for the auth middleware
        httpx.WithIdentity(c, httpx.Identity{UserID: uuid.New(), WorkspaceID: uuid.New()})
    })
    m.RegisterRoutes(r.Group(""))

    rec := httptest.NewRecorder()
    req := httptest.NewRequest(http.MethodGet, "/orders/"+uuid.NewString(), nil)
    r.ServeHTTP(rec, req)

    if rec.Code != http.StatusNotFound {
        t.Fatalf("status = %d, want 404, body = %s", rec.Code, rec.Body.String())
    }
}
```

Handler tests check the HTTP contract (status codes, binding errors, response shape). Business
cases belong in service tests, where they are cheaper.

## Repository tests against real Postgres (testcontainers)

SQL is where fakes lie, so the repository is tested against a real database.

```go
// internal/platform/database/dbtest/dbtest.go
func New(t *testing.T) *gorm.DB {
    t.Helper()
    ctx := t.Context()

    ctr, err := postgres.Run(ctx, "postgres:17-alpine",
        postgres.WithDatabase("app"),
        postgres.WithUsername("app"),
        postgres.WithPassword("app"),
        postgres.BasicWaitStrategies(),
    )
    testcontainers.CleanupContainer(t, ctr)
    if err != nil {
        t.Fatalf("start postgres: %v", err)
    }

    dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
    if err != nil {
        t.Fatalf("connection string: %v", err)
    }
    db, err := gorm.Open(gormpostgres.Open(dsn), &gorm.Config{TranslateError: true})
    if err != nil {
        t.Fatalf("open: %v", err)
    }
    if err := migrate.Up(db); err != nil { // the project's real migrations, not AutoMigrate
        t.Fatalf("migrate: %v", err)
    }
    return db
}
```

```go
// internal/order/repository_test.go
func TestRepository_List_SortAllowlist(t *testing.T) {
    if testing.Short() {
        t.Skip("needs Docker")
    }
    db := dbtest.New(t)
    repo := newGormRepository(db)
    ws := uuid.New()
    // ...insert three orders with different customer names

    got, _, err := repo.list(t.Context(), listQuery{
        WorkspaceID: ws,
        Page:        response.PaginationQuery{Page: 1, PageSize: 10, SortBy: "customer_name; DROP TABLE orders", SortOrder: "asc"},
    })
    if err != nil {
        t.Fatalf("list: %v", err)
    }
    // unknown sort_by falls back to created_at, and the table still exists
}
```

- Use the project's real migrations so tests exercise the real schema, indexes and constraints.
- One container per package (start it in `TestMain` and share it) when container start-up time
  matters. Give each test its own workspace id so tests do not see each other's rows.
- `go test -short ./...` skips these for a fast local loop.
- With Colima or another non-default Docker socket, testcontainers fails with "rootless Docker
  not found". Point it at the active context first:
  `export DOCKER_HOST=$(docker context inspect --format '{{.Endpoints.docker.Host}}')`. If the
  Ryuk reaper container cannot start there, `TESTCONTAINERS_RYUK_DISABLED=true` works, and
  `CleanupContainer` still removes the container when the test ends.

## Testing workers and retries with synctest

`testing/synctest` (Go 1.25+) runs the test in a bubble with a fake clock. `time.Sleep` and
timers inside the bubble advance instantly once every goroutine in it is blocked, so a retry
schedule of 2s and 4s runs in microseconds and the test is deterministic.

```go
func TestPool_RetriesThenSucceeds(t *testing.T) {
    synctest.Test(t, func(t *testing.T) {
        var calls atomic.Int32
        pool := NewPool(1, 10, slog.New(slog.DiscardHandler))
        pool.Start()

        err := pool.Submit(t.Context(), Task{
            Name: "flaky",
            Run: func(context.Context) error {
                if calls.Add(1) < 3 {
                    return errors.New("temporary")
                }
                return nil
            },
        })
        if err != nil {
            t.Fatalf("submit: %v", err)
        }

        time.Sleep(10 * time.Second) // fake time: covers the 2s and 4s backoffs instantly
        synctest.Wait()

        if got := calls.Load(); got != 3 {
            t.Fatalf("calls = %d, want 3", got)
        }
        if err := pool.Stop(t.Context()); err != nil {
            t.Fatalf("stop: %v", err)
        }
    })
}
```

Everything the test starts must run inside the bubble (create the pool inside the function
passed to `synctest.Test`) and must finish before the function returns, which `pool.Stop` does.
Go 1.27 adds `synctest.Sleep`, which combines the sleep and the wait. For HTTP inside a bubble,
Go 1.27's `httptest.NewTestServer` provides an in-memory network.

## Commands

```bash
go test ./...                       # everything (needs Docker for repository tests)
go test -short ./...                # skip Docker-backed tests
go test -race ./...                 # any package with goroutines, before calling it done
go test -run TestService_Cancel ./internal/order/
```
