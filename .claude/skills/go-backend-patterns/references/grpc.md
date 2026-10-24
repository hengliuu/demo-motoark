# gRPC

## Contents

- Where gRPC code lives
- Server adapter in the module
- Registering the server
- Client for another service
- Service-token authentication
- Error mapping

## Where gRPC code lives

| Piece | Location |
|---|---|
| `.proto` files and generated code | `<org>/shared/proto/<service>/v1/` (shared module) or the project's `proto/` |
| Server for a module | `internal/<module>/grpc.go`, an adapter over the module's `*Service` |
| Client to another service | `internal/platform/clients/<service>/` when several modules use it, or inside the one module that does |
| Interceptors (auth, logging, recovery) | `internal/platform/grpcx/` |

The gRPC server is a third adapter next to the HTTP handler and the queue consumer. It maps
proto requests to the same params and calls the same service methods. It never calls a
repository directly: that would skip the module's rules (workspace scoping, soft delete).

## Server adapter in the module

```go
// internal/account/grpc.go
package account

type GRPCServer struct {
    authv1.UnimplementedAuthServiceServer
    svc *Service
}

func (m *Module) GRPCServer() *GRPCServer { return &GRPCServer{svc: m.Service} }

func (s *GRPCServer) CheckWorkspaceAccess(ctx context.Context, req *authv1.CheckWorkspaceAccessRequest) (*authv1.CheckWorkspaceAccessResponse, error) {
    userID, err := uuid.Parse(req.GetUserId())
    if err != nil {
        return nil, status.Error(codes.InvalidArgument, "invalid user_id")
    }
    workspaceID, err := uuid.Parse(req.GetWorkspaceId())
    if err != nil {
        return nil, status.Error(codes.InvalidArgument, "invalid workspace_id")
    }

    member, err := s.svc.GetMembership(ctx, GetMembershipParams{UserID: userID, WorkspaceID: workspaceID})
    if errors.Is(err, ErrNotMember) {
        return &authv1.CheckWorkspaceAccessResponse{HasAccess: false}, nil
    }
    if err != nil {
        return nil, grpcx.Status(err) // apperr kind → gRPC code, see Error mapping
    }

    return &authv1.CheckWorkspaceAccessResponse{
        HasAccess: true,
        Role:      string(member.Role),
        IsActive:  member.Status == MemberActive,
    }, nil
}
```

Use the request's `ctx` (deadline and cancellation come from the caller) and the generated
getters (`req.GetUserId()`), which are nil-safe.

## Registering the server

```go
// cmd/api/main.go (excerpt), when the binary serves gRPC too
srv := grpc.NewServer(
    grpc.ChainUnaryInterceptor(
        grpcx.Recovery(log),
        grpcx.Logging(log),
        grpcx.RequireServiceToken(cfg.GRPC.ServiceTokens),
    ),
)
authv1.RegisterAuthServiceServer(srv, accounts.GRPCServer())
// run it next to the HTTP server with errgroup, stop it with srv.GracefulStop()
```

## Client for another service

`grpc.Dial` and `grpc.DialContext` are deprecated. Use `grpc.NewClient`, which connects lazily
on the first call and uses the `dns` resolver by default. `WithBlock` and `WithTimeout` belong to
the old dial and do not apply. Put deadlines on each call instead.

```go
// internal/platform/clients/account/client.go
type Client struct {
    conn    *grpc.ClientConn
    rpc     authv1.AuthServiceClient
    token   string
    timeout time.Duration
}

func New(cfg Config) (*Client, error) {
    creds := insecure.NewCredentials() // inside a private network only; use TLS credentials across trust boundaries
    conn, err := grpc.NewClient(cfg.Target, grpc.WithTransportCredentials(creds))
    if err != nil {
        return nil, fmt.Errorf("account grpc client: %w", err)
    }
    return &Client{conn: conn, rpc: authv1.NewAuthServiceClient(conn), token: cfg.ServiceToken, timeout: 5 * time.Second}, nil
}

func (c *Client) Close() error { return c.conn.Close() }

func (c *Client) CheckWorkspaceAccess(ctx context.Context, userID, workspaceID uuid.UUID) (*authv1.CheckWorkspaceAccessResponse, error) {
    ctx, cancel := context.WithTimeout(ctx, c.timeout) // the caller's deadline still wins if shorter
    defer cancel()
    ctx = metadata.AppendToOutgoingContext(ctx, "x-service-token", c.token)

    resp, err := c.rpc.CheckWorkspaceAccess(ctx, &authv1.CheckWorkspaceAccessRequest{
        UserId:      userID.String(),
        WorkspaceId: workspaceID.String(),
    })
    if err != nil {
        return nil, fmt.Errorf("CheckWorkspaceAccess: %w", err)
    }
    return resp, nil
}
```

- Create the client once in `cmd/`, defer `Close`, and pass it through `Deps`. No package-level
  singleton with `sync.Once`: a hidden global is hard to fake and hides the dependency.
- The module that uses it declares the method it needs as a small interface, exactly like a
  cross-module call (module-layout.md), so its tests fake it.
- Always derive the call context from the incoming request context, never
  `context.Background()`, so a cancelled request cancels its downstream calls.

## Service-token authentication

```go
// internal/platform/grpcx/auth.go
func RequireServiceToken(valid []string) grpc.UnaryServerInterceptor {
    return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
        md, ok := metadata.FromIncomingContext(ctx)
        if !ok {
            return nil, status.Error(codes.Unauthenticated, "missing metadata")
        }
        tokens := md.Get("x-service-token")
        if len(tokens) == 0 || !tokenAllowed(tokens[0], valid) {
            return nil, status.Error(codes.Unauthenticated, "invalid service token")
        }
        return handler(ctx, req)
    }
}

func tokenAllowed(got string, valid []string) bool {
    for _, v := range valid {
        if subtle.ConstantTimeCompare([]byte(got), []byte(v)) == 1 {
            return true
        }
    }
    return false
}
```

Compare secrets with `crypto/subtle.ConstantTimeCompare`, never `==`, which returns faster the
earlier the strings differ and leaks the token byte by byte. Accepting a list of valid tokens
lets you rotate without downtime (add the new one, deploy clients, remove the old one). Where the
platform supports it, mutual TLS replaces shared tokens.

## Error mapping

```go
// internal/platform/grpcx/status.go
func Status(err error) error {
    e, ok := errors.AsType[*apperr.Error](err) // Go 1.26+, errors.As before
    if !ok {
        return status.Error(codes.Internal, "internal error")
    }
    switch e.Kind {
    case apperr.KindInvalid:
        return status.Error(codes.InvalidArgument, e.Msg)
    case apperr.KindNotFound:
        return status.Error(codes.NotFound, e.Msg)
    case apperr.KindConflict:
        return status.Error(codes.Aborted, e.Msg)
    case apperr.KindForbidden:
        return status.Error(codes.PermissionDenied, e.Msg)
    case apperr.KindUnauthorized:
        return status.Error(codes.Unauthenticated, e.Msg)
    default:
        return status.Error(codes.Internal, "internal error")
    }
}
```

The same `apperr` kinds drive HTTP status codes in `httpx.WriteError`, so a module's errors mean
the same thing on every transport. Internal error text never goes to the caller, the logging
interceptor logs it.
