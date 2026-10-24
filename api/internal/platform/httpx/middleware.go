package httpx

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	requestIDHeader = "X-Request-ID"
	requestIDKey    = "request_id"
	maskedVINKeep   = 11
)

func WithRequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(requestIDHeader)
		if !validRequestID(id) {
			id = newRequestID()
		}
		c.Set(requestIDKey, id)
		c.Header(requestIDHeader, id)
		c.Next()
	}
}

func RequestID(c *gin.Context) string { return c.GetString(requestIDKey) }

func validRequestID(id string) bool {
	if id == "" || len(id) > 64 {
		return false
	}
	for _, r := range id {
		ok := r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_' || r == '.'
		if !ok {
			return false
		}
	}
	return true
}

func newRequestID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Logging writes one line per request. The VIN in the query is masked: the first 11
// characters stay, the rest become '*'.
func Logging(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.LogAttrs(c.Request.Context(), slog.LevelInfo, "request",
			slog.String("request_id", RequestID(c)),
			slog.String("method", c.Request.Method),
			slog.String("path", c.Request.URL.Path),
			slog.String("query", MaskQuery(c.Request.URL.RawQuery)),
			slog.Int("status", c.Writer.Status()),
			slog.Duration("latency", time.Since(start)),
		)
	}
}

// Recovery logs the panic without the request line and answers the generic 500 body.
func Recovery(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if rec := recover(); rec != nil {
				log.ErrorContext(c.Request.Context(), "panic",
					"request_id", RequestID(c), "method", c.Request.Method, "path", c.Request.URL.Path, "panic", rec)
				c.AbortWithStatusJSON(http.StatusInternalServerError,
					errorBody{Error: errorDetail{Code: "internal", Message: "Something went wrong"}})
			}
		}()
		c.Next()
	}
}

// MaskQuery masks the value of every vin parameter, whatever the key's case.
func MaskQuery(raw string) string {
	if raw == "" {
		return ""
	}
	pairs := strings.Split(raw, "&")
	for i, p := range pairs {
		k, v, found := strings.Cut(p, "=")
		if !found {
			continue
		}
		if key, err := url.QueryUnescape(k); err == nil && strings.EqualFold(key, "vin") {
			pairs[i] = k + "=" + maskVIN(v)
		}
	}
	return strings.Join(pairs, "&")
}

func maskVIN(raw string) string {
	v, err := url.QueryUnescape(raw)
	if err != nil {
		v = raw
	}
	v = strings.TrimSpace(v)
	if len(v) <= maskedVINKeep {
		return strings.Repeat("*", len(v))
	}
	return v[:maskedVINKeep] + strings.Repeat("*", len(v)-maskedVINKeep)
}
