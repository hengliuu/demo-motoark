# Workers and Background Jobs

## Contents

- Pick the kind of background work
- Durable consumers (`cmd/worker`)
  - The queue port
  - A module's consumer
  - Idempotency with an inbox table
  - What every broker adapter must do
- Periodic jobs
- In-process pool (best-effort jobs)
- Graceful shutdown
- Rules

## Pick the kind of background work

| Question | Durable consumer | In-process pool |
|---|---|---|
| Is it acceptable to lose the job when a pod restarts or deploys? | no | yes |
| Must it survive the API being down? | yes | no |
| Examples | mark order paid, send invoice, sync to ERP, anything with money or a customer promise | warm a cache, record a metric, best-effort webhook ping |
| Lives in | module `consumer.go`, run by `cmd/worker` | `platform/jobs`, submitted from a service |

When in doubt, choose durable. A pool keeps jobs in memory, and a deploy drops whatever is still
buffered.

## Durable consumers (`cmd/worker`)

### The queue port

Modules depend on a small port in `platform/queue`, never on a broker client. The adapter
(Kafka, RabbitMQ, SQS, Redis Streams) implements it once.

```go
package queue

type Message struct {
    ID      string // event id, the idempotency key (UUID v7 from the outbox)
    Topic   string
    Key     string
    Payload []byte
    Attempt int // 1 on first delivery
}

type HandlerFunc func(ctx context.Context, msg Message) error

type Consumer interface {
    Handle(topic string, h HandlerFunc)
    // Run blocks until ctx is cancelled, then finishes in-flight messages and returns.
    Run(ctx context.Context) error
}

type permanentError struct{ err error }

func (e permanentError) Error() string { return e.err.Error() }
func (e permanentError) Unwrap() error { return e.err }

// Permanent marks an error that retrying cannot fix (bad payload, unknown version,
// missing aggregate). The adapter dead-letters the message at once.
func Permanent(err error) error { return permanentError{err: err} }

func IsPermanent(err error) bool {
    var p permanentError
    return errors.As(err, &p)
}
```

### A module's consumer

The consumer is the queue twin of the handler: decode, map to params, call one service method.

```go
// internal/order/consumer.go
package order

type consumer struct {
    svc *Service
}

// paymentCapturedV1 is the payment module's published contract, versioned in the topic.
type paymentCapturedV1 struct {
    OrderID     uuid.UUID `json:"order_id"`
    WorkspaceID uuid.UUID `json:"workspace_id"`
    PaymentID   uuid.UUID `json:"payment_id"`
}

func (c *consumer) onPaymentCaptured(ctx context.Context, msg queue.Message) error {
    var evt paymentCapturedV1
    if err := json.Unmarshal(msg.Payload, &evt); err != nil {
        return queue.Permanent(fmt.Errorf("decode payment.captured.v1: %w", err))
    }

    err := c.svc.MarkPaid(ctx, MarkPaidParams{
        MessageID:   msg.ID,
        OrderID:     evt.OrderID,
        WorkspaceID: evt.WorkspaceID,
        PaymentID:   evt.PaymentID,
    })
    if errors.Is(err, ErrNotFound) {
        return queue.Permanent(err) // retrying will not make the order appear
    }
    return err // transient errors (database down) are retried by the adapter
}
```

Registered in `module.go` with `c.Handle("payment.captured.v1", m.consumer.onPaymentCaptured)`.

### Idempotency with an inbox table

Delivery is at least once, so every consumer must tolerate duplicates. Record the message id in
the **same transaction** as the change. A duplicate then finds its id already claimed and does
nothing.

```sql
CREATE TABLE processed_messages (
    consumer     text        NOT NULL,
    message_id   text        NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer, message_id)
);
```

```go
// internal/platform/inbox/inbox.go
type Inbox struct {
    db *gorm.DB
}

// Claim returns true the first time a consumer sees a message id. Call it inside the
// transaction that applies the change, so the claim and the change commit together.
func (i *Inbox) Claim(ctx context.Context, consumer, messageID string) (bool, error) {
    res := database.Conn(ctx, i.db).Exec(
        `INSERT INTO processed_messages (consumer, message_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
        consumer, messageID,
    )
    if res.Error != nil {
        return false, res.Error
    }
    return res.RowsAffected == 1, nil
}
```

```go
// internal/order/service.go
func (s *Service) MarkPaid(ctx context.Context, p MarkPaidParams) error {
    return s.tx.WithinTx(ctx, func(ctx context.Context) error {
        first, err := s.inbox.Claim(ctx, "order.mark_paid", p.MessageID)
        if err != nil {
            return fmt.Errorf("claim message: %w", err)
        }
        if !first {
            return nil // duplicate delivery, already applied
        }

        o, err := s.repo.findByID(ctx, p.OrderID, p.WorkspaceID)
        if err != nil {
            return err
        }
        if o.Status == StatusPaid {
            return nil
        }
        return s.repo.updateWithVersion(ctx, o.ID, o.Version, map[string]any{colStatus: StatusPaid})
    })
}
```

The service gets the inbox through `Deps` as a one-method interface (`claimer`), so its tests
fake it like the repository.

### What every broker adapter must do

| Behaviour | Why |
|---|---|
| Acknowledge or commit the offset only after the handler returned nil | a crash mid-handler must redeliver, not lose |
| Retry transient errors with exponential backoff and jitter, up to a limit (for example 5) | a short database outage should not dead-letter everything |
| Send `queue.IsPermanent` errors and exhausted retries to a dead-letter topic or queue, with the error text and attempt count | poison messages must not block the partition, and someone has to see them |
| Pass a context that is cancelled on shutdown, and stop fetching new messages first | in-flight work finishes, nothing new starts |
| Recover a panicking handler, log it, and treat it as a failed attempt | one bad message must not kill the worker |
| Log each failure once with topic, message id and attempt | the consumer itself does not log |

Library choice is per project and documented in its `AGENTS.md` (for Kafka, for example,
`github.com/twmb/franz-go`). Configure acknowledgements from all in-sync replicas and the
idempotent producer where the library supports them.

## Periodic jobs

Cleanup, reconciliation and report jobs run as a ticker loop inside `cmd/worker`:

```go
// internal/platform/jobs/every.go
func Every(ctx context.Context, interval time.Duration, log *slog.Logger, name string, fn func(ctx context.Context) error) error {
    t := time.NewTicker(interval)
    defer t.Stop()
    for {
        if err := fn(ctx); err != nil && ctx.Err() == nil {
            log.ErrorContext(ctx, "periodic job failed", "job", name, "err", err)
        }
        select {
        case <-ctx.Done():
            return nil
        case <-t.C:
        }
    }
}
```

With several worker replicas every replica runs the loop. When the job must run once per tick,
take a Postgres advisory lock at the start (`SELECT pg_try_advisory_xact_lock(?)` inside a
transaction) and skip the tick when it returns false, or claim rows with
`FOR UPDATE SKIP LOCKED` so replicas split the work.

## In-process pool (best-effort jobs)

A generic pool in `platform/jobs`. Modules submit closures, so the pool knows nothing about
orders or invoices.

```go
package jobs

var ErrClosed = errors.New("jobs: pool closed")

type Task struct {
    Name string
    Run  func(ctx context.Context) error
}

type Pool struct {
    tasks       chan Task
    workers     int
    maxAttempts int
    log         *slog.Logger

    mu     sync.RWMutex // guards closed, so Submit never sends on a closed channel
    closed bool
    wg     sync.WaitGroup
    ctx    context.Context // cancelled when Stop gives up waiting
    cancel context.CancelFunc
}

func NewPool(workers, buffer int, log *slog.Logger) *Pool {
    ctx, cancel := context.WithCancel(context.Background())
    return &Pool{
        tasks:       make(chan Task, buffer),
        workers:     workers,
        maxAttempts: 3,
        log:         log,
        ctx:         ctx,
        cancel:      cancel,
    }
}

func (p *Pool) Start() {
    for range p.workers {
        p.wg.Go(func() { // Go 1.25+, use wg.Add(1) and defer wg.Done() before that
            for t := range p.tasks {
                p.run(t)
            }
        })
    }
}

// Submit queues a task. It blocks while the buffer is full (backpressure) and returns
// ErrClosed after Stop.
func (p *Pool) Submit(ctx context.Context, t Task) error {
    p.mu.RLock()
    defer p.mu.RUnlock()
    if p.closed {
        return ErrClosed
    }
    select {
    case p.tasks <- t:
        return nil
    case <-ctx.Done():
        return ctx.Err()
    }
}

func (p *Pool) run(t Task) {
    for attempt := 1; ; attempt++ {
        err := t.Run(p.ctx)
        if err == nil {
            return
        }
        if attempt == p.maxAttempts || !p.sleep(backoff(attempt)) {
            p.log.Error("task dead-lettered", "task", t.Name, "attempts", attempt, "err", err)
            return
        }
    }
}

func (p *Pool) sleep(d time.Duration) bool {
    timer := time.NewTimer(d)
    defer timer.Stop()
    select {
    case <-timer.C:
        return true
    case <-p.ctx.Done():
        return false
    }
}

func backoff(attempt int) time.Duration {
    return time.Duration(1<<attempt) * time.Second // 2s, 4s
}

// Stop refuses new tasks, lets workers drain the buffer, and cancels running tasks if
// ctx expires first.
func (p *Pool) Stop(ctx context.Context) error {
    p.mu.Lock()
    if !p.closed {
        p.closed = true
        close(p.tasks)
    }
    p.mu.Unlock()

    done := make(chan struct{})
    go func() {
        p.wg.Wait()
        close(done)
    }()

    select {
    case <-done:
        p.cancel()
        return nil
    case <-ctx.Done():
        p.cancel() // aborts backoff waits and tells running tasks to stop
        <-done
        return ctx.Err()
    }
}
```

Why the mutex: closing a channel while another goroutine may still send on it panics. A
`select` between `p.tasks <- t` and `<-ctx.Done()` does not prevent that, because when both
cases are ready Go picks one at random. The `closed` flag under the lock makes "send after
close" impossible.

Submitting from a service:

```go
err := s.jobs.Submit(ctx, jobs.Task{
    Name: "order.warm_summary_cache",
    Run: func(ctx context.Context) error {
        return s.cache.WarmSummary(ctx, workspaceID) // capture ids, never the request context
    },
})
```

The task receives the pool's context. Never capture the request's `ctx` inside `Run`: it is
cancelled as soon as the response is written. If the task needs request-scoped values such as
the trace id, copy them into the closure as plain values.

Tuning: `workers` at or below the downstream rate limit, `buffer` sized for bursts (a full
buffer makes `Submit` block, which is intended backpressure, so never add a `default:` case that
silently drops), and three attempts.

## Graceful shutdown

Order matters: stop intake, drain work, then close connections the work needs.

| Binary | Order |
|---|---|
| `cmd/api` | stop accepting HTTP (`Server.Shutdown`), stop the pool (`pool.Stop`), close the broker publisher, close the database |
| `cmd/worker` | cancel the context (signal), consumers and relay finish in-flight messages, `errgroup.Wait` returns, close publisher, close database |

With `defer`, this order falls out naturally: open the database first and defer its close, then
create the pool and defer `pool.Stop`. Deferred calls run in reverse, so the pool drains before
the database closes. Give each stop a deadline shorter than the orchestrator's grace period (for
example 20 seconds of a 30-second Kubernetes `terminationGracePeriodSeconds`).

## Rules

1. Work that must not be lost goes through the outbox and a durable consumer, never the pool.
2. No bare `go func()` for background work in request code. Use the pool or a consumer, so
   shutdown can wait for it and failures get logged.
3. Consumers are idempotent: inbox claim and change in one transaction.
4. Classify errors: `queue.Permanent` for errors retrying cannot fix, plain errors for the rest.
5. Every wait (backoff, ticker, channel send) also selects on a context, so shutdown is never
   stuck behind a sleep.
6. A dead-lettered message or task is logged with enough ids to replay it by hand.
