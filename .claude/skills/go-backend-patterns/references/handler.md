# Handler (HTTP adapter)

## Contents

- Responsibilities
- Structure
- Create
- Get
- List with pagination
- Update (partial, with optimistic locking)
- Delete (soft)
- DTOs and converters
- Identity from context
- Swagger annotations

## Responsibilities

A handler translates HTTP into a service call and back. It does exactly five things, in order:

1. Bind and validate the **shape** of the input (JSON, query, path).
2. Read identity (user, workspace, tenant) from the context that auth middleware filled.
3. Map the DTO to service params.
4. Call **one** service method with `c.Request.Context()`.
5. Map the result to a response DTO, or hand the error to `httpx.WriteError`.

Business rules (allowed statuses, ownership, limits) belong to the service, so they also hold
when the same service runs behind a queue consumer or gRPC.

## Structure

```go
package order

type handler struct {
    svc *Service
    log *slog.Logger
}
```

Unexported, constructed in `module.go`, routes registered in `RegisterRoutes`. The handler holds
the concrete `*Service`: handler tests run the real service over a fake repository (see
testing.md), so no service interface is needed.

## Create

```go
// create handles POST /orders
// @Summary   Create an order
// @Tags      Orders
// @Accept    json
// @Produce   json
// @Security  BearerAuth
// @Param     request body createOrderRequest true "Order"
// @Success   201 {object} object{success=bool,message=string,data=orderResponse}
// @Failure   400 {object} object{success=bool,message=string}
// @Failure   401 {object} object{success=bool,message=string}
// @Router    /orders [post]
func (h *handler) create(c *gin.Context) {
    var req createOrderRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        httpx.WriteError(c, h.log, apperr.Invalid("Invalid request body", err))
        return
    }

    id, err := httpx.IdentityFrom(c)
    if err != nil {
        httpx.WriteError(c, h.log, err)
        return
    }

    o, err := h.svc.Create(c.Request.Context(), CreateParams{
        WorkspaceID:  id.WorkspaceID,
        UserID:       id.UserID,
        CustomerName: req.CustomerName,
        Notes:        req.Notes,
    })
    if err != nil {
        httpx.WriteError(c, h.log, err)
        return
    }

    response.JSONResponse(c, toOrderResponse(o), "Order created", http.StatusCreated)
}
```

`response.JSONResponse` is the org envelope from `<org>/shared/response`. If the project has no
shared envelope, `httpx.JSON(c, status, data)` in platform plays the same role. Use one writer
for every response so success and error bodies share a shape.

## Get

```go
// get handles GET /orders/:id
func (h *handler) get(c *gin.Context) {
    orderID, err := uuid.Parse(c.Param("id"))
    if err != nil {
        httpx.WriteError(c, h.log, apperr.Invalid("Invalid order ID", err))
        return
    }
    id, err := httpx.IdentityFrom(c)
    if err != nil {
        httpx.WriteError(c, h.log, err)
        return
    }

    o, err := h.svc.Get(c.Request.Context(), GetParams{ID: orderID, WorkspaceID: id.WorkspaceID})
    if err != nil {
        httpx.WriteError(c, h.log, err) // ErrNotFound → 404
        return
    }
    response.JSONResponse(c, toOrderResponse(o), "Order retrieved", http.StatusOK)
}
```

## List with pagination

```go
// list handles GET /orders?status=&search=&page=&page_size=&sort_by=&sort_order=
func (h *handler) list(c *gin.Context) {
    var q listOrdersQuery
    if err := c.ShouldBindQuery(&q); err != nil {
        httpx.WriteError(c, h.log, apperr.Invalid("Invalid query", err))
        return
    }
    id, err := httpx.IdentityFrom(c)
    if err != nil {
        httpx.WriteError(c, h.log, err)
        return
    }

    orders, page, err := h.svc.List(c.Request.Context(), ListParams{
        WorkspaceID: id.WorkspaceID,
        Status:      Status(q.Status),
        Search:      q.Search,
        Page:        httpx.PageFrom(q.Page, q.PageSize, q.SortBy, q.SortOrder),
    })
    if err != nil {
        httpx.WriteError(c, h.log, err)
        return
    }
    response.JSONPaginatedResponse(c, toOrderResponses(orders), response.ToPaginationMeta(page), "Orders retrieved", http.StatusOK)
}
```

`httpx.PageFrom` applies defaults (page 1, size 10) and a maximum page size (100), so one
request cannot ask for a million rows. Sort fields are **not** trusted here: the repository
checks them against an allowlist (repository-gorm.md).

## Update (partial, with optimistic locking)

```go
// update handles PATCH /orders/:id
func (h *handler) update(c *gin.Context) {
    orderID, err := uuid.Parse(c.Param("id"))
    if err != nil {
        httpx.WriteError(c, h.log, apperr.Invalid("Invalid order ID", err))
        return
    }
    var req updateOrderRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        httpx.WriteError(c, h.log, apperr.Invalid("Invalid request body", err))
        return
    }
    id, err := httpx.IdentityFrom(c)
    if err != nil {
        httpx.WriteError(c, h.log, err)
        return
    }

    o, err := h.svc.Update(c.Request.Context(), UpdateParams{
        ID:           orderID,
        WorkspaceID:  id.WorkspaceID,
        UserID:       id.UserID,
        Version:      req.Version,
        CustomerName: req.CustomerName, // pointers: nil means "leave unchanged"
        Notes:        req.Notes,
    })
    if err != nil {
        httpx.WriteError(c, h.log, err) // ErrVersionConflict → 409
        return
    }
    response.JSONResponse(c, toOrderResponse(o), "Order updated", http.StatusOK)
}
```

PATCH for partial updates, PUT only when the client sends the full resource.

## Delete (soft)

```go
// delete handles DELETE /orders/:id
func (h *handler) delete(c *gin.Context) {
    orderID, err := uuid.Parse(c.Param("id"))
    if err != nil {
        httpx.WriteError(c, h.log, apperr.Invalid("Invalid order ID", err))
        return
    }
    id, err := httpx.IdentityFrom(c)
    if err != nil {
        httpx.WriteError(c, h.log, err)
        return
    }

    if err := h.svc.Delete(c.Request.Context(), DeleteParams{ID: orderID, WorkspaceID: id.WorkspaceID, UserID: id.UserID}); err != nil {
        httpx.WriteError(c, h.log, err)
        return
    }
    response.JSONResponse(c, nil, "Order deleted", http.StatusOK)
}
```

## DTOs and converters

`dto.go` holds the wire format. JSON and binding tags live **only** here, so a renamed column
or an internal field never leaks into the API by accident.

```go
package order

type createOrderRequest struct {
    CustomerName string  `json:"customer_name" binding:"required,max=200"`
    Notes        *string `json:"notes" binding:"omitempty,max=2000"`
}

type updateOrderRequest struct {
    Version      int     `json:"version" binding:"required,min=1"`
    CustomerName *string `json:"customer_name" binding:"omitempty,max=200"`
    Notes        *string `json:"notes" binding:"omitempty,max=2000"`
}

type listOrdersQuery struct {
    Status    string `form:"status"`
    Search    string `form:"search"`
    Page      int    `form:"page"`
    PageSize  int    `form:"page_size"`
    SortBy    string `form:"sort_by"`
    SortOrder string `form:"sort_order"`
}

type orderResponse struct {
    ID           uuid.UUID `json:"id"`
    CustomerName string    `json:"customer_name"`
    Notes        *string   `json:"notes"`
    Status       Status    `json:"status"`
    Version      int       `json:"version"` // the client sends it back on the next update
    CreatedAt    time.Time `json:"created_at"`
    UpdatedAt    time.Time `json:"updated_at"`
}

func toOrderResponse(o *Order) orderResponse {
    return orderResponse{
        ID:           o.ID,
        CustomerName: o.CustomerName,
        Notes:        o.Notes,
        Status:       o.Status,
        Version:      o.Version,
        CreatedAt:    o.CreatedAt,
        UpdatedAt:    o.UpdatedAt,
    }
}

func toOrderResponses(orders []Order) []orderResponse {
    out := make([]orderResponse, 0, len(orders)) // empty list encodes as [] not null
    for i := range orders {
        out = append(out, toOrderResponse(&orders[i]))
    }
    return out
}
```

Binding tags check shape (required, length, format). Rules that need data or state (status
transitions, uniqueness, ownership) are service validation.

## Identity from context

Auth middleware verifies the token once and stores an identity. Handlers read it through one
helper, never by parsing headers themselves:

```go
id, err := httpx.IdentityFrom(c) // returns apperr.Unauthorized when missing
```

Workspace or tenant ids come from the verified identity or a path segment the middleware
already authorized, **never from the request body**. A body field lets any user write into
another tenant's data.

## Swagger annotations

Put swag comments on each handler method, as shown in `create`, when the project generates
Swagger with `swag`. The DTO names in `@Param` and `@Success` must match the
unexported types in `dto.go`, swag reads them from source. When the project generates handlers
from an OpenAPI file instead, see openapi-strict.md and drop these comments.
