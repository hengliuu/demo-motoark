# oapi-codegen strict-server (replaces hand-written handlers)

## Contents

- When to use
- What changes
- One generated interface, many modules
- A module's strict handler
- Wiring and error mapping

## When to use

The project generates its HTTP layer from an OpenAPI document with `oapi-codegen`
(`gin-server`, `strict-server` and `models` generators). The OpenAPI document is then the
contract, and handler.md (hand-written Gin handlers, DTOs, swag comments) does not apply.

## What changes

| Piece | With strict-server |
|---|---|
| `handler.go` | a strict handler implementing the module's slice of the generated interface |
| `dto.go` | gone: use the generated request and response types |
| service, params, repository, errors | unchanged |
| shape validation | the OpenAPI document, enforced by the generated binding or a request validator middleware |

The strict handler is still a thin adapter: generated request → params → service → generated
response. No business logic in it.

## One generated interface, many modules

oapi-codegen generates one `StrictServerInterface` for the whole document. Keep the generated
code in `internal/api/` (generated, never edited) and let each module implement only its own
operations. Go embedding assembles them into one value that satisfies the full interface:

```go
// internal/api/server.go (hand-written, next to the generated api.gen.go)
type Server struct {
    *order.OrderAPI
    *invoice.InvoiceAPI
}

var _ gen.StrictServerInterface = Server{} // compile error when an operation has no implementation
```

Each module's type gets a distinct name (`order.OrderAPI`, `invoice.InvoiceAPI`). This is the
one place the no-stutter rule gives way: an embedded field is named after its type, so two
embedded types both called `StrictHandler` are a duplicate field and do not compile. Operation
ids are unique across the document, so the embedded method sets never collide. An operation with no implementation fails to compile,
which is exactly the check you want after editing the spec.

Very large documents can instead be generated per tag into one package per module with
oapi-codegen's tag filtering options. Check the oapi-codegen configuration docs for the current
option names before relying on them.

Import direction: `internal/api` imports the modules, and modules import the generated types
from `internal/api`. That is a cycle. Avoid it by generating the **types** (`models`) into a
leaf package such as `internal/api/gen` that imports nothing of yours, and keep `Server` in
`internal/api` or in `cmd/api`.

## A module's strict handler

```go
// internal/order/strict.go
package order

// OrderAPI implements the order operations of gen.StrictServerInterface.
type OrderAPI struct {
    svc *Service
}

func (m *Module) API() *OrderAPI { return &OrderAPI{svc: m.Service} }

func (h *OrderAPI) GetOrder(ctx context.Context, req gen.GetOrderRequestObject) (gen.GetOrderResponseObject, error) {
    id, err := httpx.IdentityFromContext(ctx)
    if err != nil {
        return nil, err
    }
    o, err := h.svc.Get(ctx, GetParams{ID: req.OrderId, WorkspaceID: id.WorkspaceID})
    if errors.Is(err, ErrNotFound) {
        return gen.GetOrder404JSONResponse{Message: "Order not found"}, nil
    }
    if err != nil {
        return nil, err
    }
    return gen.GetOrder200JSONResponse(toAPIOrder(o)), nil
}

func (h *OrderAPI) UpdateOrder(ctx context.Context, req gen.UpdateOrderRequestObject) (gen.UpdateOrderResponseObject, error) {
    id, err := httpx.IdentityFromContext(ctx)
    if err != nil {
        return nil, err
    }
    o, err := h.svc.Update(ctx, UpdateParams{
        ID:           req.OrderId,
        WorkspaceID:  id.WorkspaceID,
        UserID:       id.UserID,
        Version:      req.Body.Version,
        CustomerName: req.Body.CustomerName,
        Notes:        req.Body.Notes,
    })
    if errors.Is(err, ErrVersionConflict) {
        return gen.UpdateOrder409JSONResponse{Message: "Order was changed by someone else"}, nil
    }
    if err != nil {
        return nil, err
    }
    return gen.UpdateOrder200JSONResponse(toAPIOrder(o)), nil
}
```

Names like `GetOrderRequestObject` and `GetOrder404JSONResponse` come from the `operationId` and
the responses declared in the spec. Declare every status a handler returns on purpose (404,
409) as a typed response, so the generated type guards the body. Return `error` for everything
else.

The identity reaches `ctx` because the auth middleware stores it on the Gin context and the
`gin-server` generator passes that context through.

## Wiring and error mapping

```go
server := api.Server{OrderAPI: orders.API(), InvoiceAPI: invoices.API()}

strict := gen.NewStrictHandlerWithOptions(server, nil, gen.StrictGinServerOptions{
    RequestErrorHandlerFunc: func(c *gin.Context, err error) {
        httpx.WriteError(c, log, apperr.Invalid("Invalid request", err))
    },
    ResponseErrorHandlerFunc: func(c *gin.Context, err error) {
        httpx.WriteError(c, log, err) // apperr kind → status, logs 5xx once
    },
})
gen.RegisterHandlers(apiGroup, strict)
```

Because modules return `apperr`-kinded errors, the single `ResponseErrorHandlerFunc` maps every
untyped error the same way the hand-written handlers do, and the error body stays identical
across the service. Authentication, logging and recovery stay as Gin middleware on the group
before `RegisterHandlers`.
