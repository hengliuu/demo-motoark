package httpx

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	requestIDHeader = "X-Request-ID"
	requestIDKey    = "request_id"
	maskedVINKeep   = 11
	maskedVINTail   = "******"
)

var (
	loggedQueryKeys = []string{"part", "vin"}
	partSeparators  = strings.NewReplacer(" ", "", ".", "", "-", "")
	vinShape        = regexp.MustCompile(`^[A-HJ-NPR-Z0-9]{17}$`)
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

// Logging writes one line per request. The query is rebuilt by LogQuery, never copied.
func Logging(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.LogAttrs(c.Request.Context(), slog.LevelInfo, "request",
			slog.String("request_id", RequestID(c)),
			slog.String("method", c.Request.Method),
			slog.String("path", c.Request.URL.Path),
			slog.String("query", LogQuery(c.Request.URL.RawQuery)),
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

// LogQuery returns the part of the query that is safe to log. It never echoes the raw query:
// only the keys in loggedQueryKeys appear, so a VIN under any other key is dropped, and a
// VIN-shaped value under a logged key is masked too.
func LogQuery(raw string) string {
	// ParseQuery returns the pairs it could read together with its error. A pair it rejects,
	// such as one joined by ';', is dropped and never logged.
	values, _ := url.ParseQuery(raw)
	var parts []string
	for _, key := range loggedQueryKeys {
		for _, v := range values[key] {
			parts = append(parts, key+"="+logValue(key, v))
		}
	}
	return strings.Join(parts, "&")
}

func logValue(key, v string) string {
	if key == "vin" {
		return maskVIN(v)
	}
	if stripped := partSeparators.Replace(v); vinShape.MatchString(strings.ToUpper(strings.TrimSpace(stripped))) {
		return maskVIN(stripped)
	}
	return url.QueryEscape(v)
}

func maskVIN(v string) string {
	v = strings.TrimSpace(v)
	return url.QueryEscape(v[:min(len(v), maskedVINKeep)]) + maskedVINTail
}
