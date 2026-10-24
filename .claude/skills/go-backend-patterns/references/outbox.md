# Transactional Outbox

## Contents

- When to use
- Table and model
- Writing an event from a module
- The relay
- Rules

## When to use

A module must change its database **and** tell other modules or services about it. Doing both
directly leaves a window where one succeeds and the other fails. The outbox closes the window:
the event is a row written in the same transaction as the change, and the relay in
`cmd/worker` publishes committed rows to the broker. Delivery is at least once, so consumers
dedupe on the event id (worker.md, inbox table).

The outbox is infrastructure, so it lives in `internal/platform/outbox/`. Modules call it, it
never imports a module.

## Table and model

```go
// internal/platform/outbox/model.go
type Event struct {
    ID          uuid.UUID       `gorm:"type:uuid;primaryKey"` // UUID v7, also the consumer's idempotency key
    Topic       string          `gorm:"not null"`
    Key         string          `gorm:"not null"`             // partition key, usually the aggregate id
    Payload     json.RawMessage `gorm:"type:jsonb;not null"`
    CreatedAt   time.Time
    PublishedAt *time.Time `gorm:"index:idx_outbox_unpublished,where:published_at IS NULL"`
}

func (Event) TableName() string { return "outbox_events" }

func (e *Event) BeforeCreate(*gorm.DB) error {
    if e.ID != uuid.Nil {
        return nil
    }
    id, err := uuid.NewV7()
    if err != nil {
        return err
    }
    e.ID = id
    return nil
}
```

Time-ordered ids let the relay read oldest first with `ORDER BY id`.

## Writing an event from a module

```go
// internal/platform/outbox/outbox.go
type Writer struct {
    db *gorm.DB
}

func NewWriter(db *gorm.DB) *Writer { return &Writer{db: db} }

// Add records an event in the transaction found in ctx. Call it inside WithinTx so the
// event commits or rolls back with the business change.
func (w *Writer) Add(ctx context.Context, topic string, key uuid.UUID, payload any) error {
    body, err := json.Marshal(payload)
    if err != nil {
        return fmt.Errorf("encode %s: %w", topic, err)
    }
    return database.Conn(ctx, w.db).Create(&Event{Topic: topic, Key: key.String(), Payload: body}).Error
}
```

The module defines its published payloads next to the code that emits them, versioned:

```go
// internal/order/events.go
type orderPaidV1 struct {
    OrderID     uuid.UUID `json:"order_id"`
    WorkspaceID uuid.UUID `json:"workspace_id"`
    PaidAt      time.Time `json:"paid_at"`
}

// inside Service.MarkPaid, within the same WithinTx as the status update
if err := s.events.Add(ctx, "order.paid.v1", o.ID, orderPaidV1{
    OrderID:     o.ID,
    WorkspaceID: o.WorkspaceID,
    PaidAt:      time.Now(),
}); err != nil {
    return fmt.Errorf("record order.paid.v1: %w", err)
}
```

`s.events` is a one-method interface (`Add`) in `Deps`, faked in tests. The payload is a stable,
versioned contract, never the GORM model. Adding a field is a compatible change. Renaming or
removing one means a new topic version (`order.paid.v2`) published alongside the old one until
every consumer has moved.

## The relay

The relay claims a batch with `FOR UPDATE SKIP LOCKED`, so several worker replicas can run it
without sending the same row at the same time. It publishes, then marks the sent rows.

```go
// internal/platform/outbox/relay.go
type Publisher interface {
    Publish(ctx context.Context, topic, key string, value []byte, id string) error
}

type Relay struct {
    db    *gorm.DB
    pub   Publisher
    log   *slog.Logger
    batch int
    idle  time.Duration
}

func NewRelay(db *gorm.DB, pub Publisher, log *slog.Logger) *Relay {
    return &Relay{db: db, pub: pub, log: log, batch: 100, idle: 500 * time.Millisecond}
}

// Run relays until ctx is cancelled. It sleeps only when a tick found nothing to send.
func (r *Relay) Run(ctx context.Context) error {
    for {
        sent, err := r.tick(ctx)
        if err != nil && ctx.Err() == nil {
            r.log.ErrorContext(ctx, "outbox relay tick failed", "err", err, "sent", sent)
        }
        if sent > 0 && err == nil {
            continue
        }
        select {
        case <-ctx.Done():
            return nil
        case <-time.After(r.idle):
        }
    }
}

func (r *Relay) tick(ctx context.Context) (int, error) {
    sent := 0
    var publishErr error
    err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
        var events []Event
        if err := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
            Where("published_at IS NULL").
            Order("id").
            Limit(r.batch).
            Find(&events).Error; err != nil {
            return err
        }

        done := make([]uuid.UUID, 0, len(events))
        for _, e := range events {
            if publishErr = r.pub.Publish(ctx, e.Topic, e.Key, e.Payload, e.ID.String()); publishErr != nil {
                break
            }
            done = append(done, e.ID)
        }
        if len(done) > 0 {
            if err := tx.Model(&Event{}).Where("id IN ?", done).Update("published_at", time.Now()).Error; err != nil {
                return err
            }
        }
        sent = len(done)
        return nil
    })
    if err != nil {
        return sent, err
    }
    return sent, publishErr
}
```

Behaviour worth knowing:

- If publishing row N fails, rows before it are marked and committed, and the error is
  returned after the transaction, so `Run` logs it and waits before retrying.
- A crash between a publish and the commit re-sends that batch. That is the at-least-once
  guarantee, and why the event id travels with the message (as a header) for consumer dedupe.
- The transaction stays open while publishing, so keep the batch small (100) and give the
  publisher a per-call timeout. A broker stall then cannot hold the locks for minutes.
- Ordering: rows go out in `id` order, which keeps per-key order with one relay. With several
  replicas, rows of one key can interleave. Run one active relay when strict per-key order
  matters (an advisory lock around `tick` does it), or accept order per partition only.
- Row-level security: the relay is not a tenant request. Give it a role exempt from the tenant
  policy, or leave `outbox_events` out of RLS (tenants never read it).
- Housekeeping: a periodic job removes rows with `published_at` older than the retention you
  need. Where the project forbids hard deletes, partition the table by month and detach old
  partitions to an archive.

## Rules

1. The event insert and the business change share one transaction, always.
2. Never publish to the broker from inside a business transaction or from a handler. The relay
   is the only publisher.
3. The relay marks rows only after the broker accepted them.
4. Consumers dedupe on the event id. The relay never promises exactly once.
5. Payloads are versioned contracts owned by the emitting module, not model structs.
