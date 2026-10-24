package httpx_test

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/hengliuu/demo-motoark/api/internal/platform/httpx"
)

func TestRequestLogging(t *testing.T) {
	newRouter := func(buf *bytes.Buffer) *gin.Engine {
		r := httpx.NewRouter(slog.New(slog.NewTextHandler(buf, nil)))
		r.GET("/v1/fitment", func(c *gin.Context) { c.Status(http.StatusOK) })
		return r
	}

	t.Run("MOTO-01-TC13 the log line masks the VIN and carries a request ID", func(t *testing.T) {
		var buf bytes.Buffer
		rec := httptest.NewRecorder()
		newRouter(&buf).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/fitment?part=A0004204102&vin=WDD2050421R123456", nil))

		out := buf.String()
		if !strings.Contains(out, "WDD2050421R******") {
			t.Fatalf("log lacks masked VIN: %s", out)
		}
		if strings.Contains(out, "R123456") {
			t.Fatalf("log leaks the VIN tail: %s", out)
		}
		id := rec.Header().Get("X-Request-ID")
		if id == "" || !strings.Contains(out, id) {
			t.Fatalf("request ID %q missing from response header or log: %s", id, out)
		}
		for _, want := range []string{"method=GET", "path=/v1/fitment", "status=200", "latency"} {
			if !strings.Contains(out, want) {
				t.Fatalf("log lacks %q: %s", want, out)
			}
		}
	})

	t.Run("MOTO-01-TC13 the VIN is masked for an upper-case key and a lower-case VIN", func(t *testing.T) {
		var buf bytes.Buffer
		newRouter(&buf).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/fitment?VIN=wdd2050421r123456", nil))
		if out := buf.String(); strings.Contains(strings.ToLower(out), "r123456") {
			t.Fatalf("log leaks the VIN tail: %s", out)
		}
	})

	t.Run("MOTO-01-TC13 a VIN in the part parameter is masked and unknown keys are not logged", func(t *testing.T) {
		var buf bytes.Buffer
		newRouter(&buf).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/fitment?part=WDD2050421R123456&vin=A0004204102&token=secret-value", nil))
		out := buf.String()
		if strings.Contains(out, "R123456") || strings.Contains(out, "secret-value") || strings.Contains(out, "token") {
			t.Fatalf("log leaks a VIN or an unknown key: %s", out)
		}
		if !strings.Contains(out, "WDD2050421R******") {
			t.Fatalf("log lacks the masked VIN-shaped part: %s", out)
		}
	})

	t.Run("MOTO-01-TC13 a semicolon-joined query does not leak the VIN", func(t *testing.T) {
		var buf bytes.Buffer
		newRouter(&buf).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/fitment?part=A1;vin=WDD2050421R123456", nil))
		if out := buf.String(); strings.Contains(out, "R123456") {
			t.Fatalf("log leaks the VIN tail: %s", out)
		}
	})

	for _, part := range []string{"WDD 2050421R123456", "WDD-2050421-R123456", "WDD.2050421.R123456"} {
		t.Run("MOTO-01-TC13 a VIN typed into the part field with separators is masked: "+part, func(t *testing.T) {
			var buf bytes.Buffer
			q := url.Values{"part": {part}, "vin": {"WDD2050421R123456"}}
			newRouter(&buf).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/fitment?"+q.Encode(), nil))
			if out := buf.String(); strings.Contains(out, "R123456") {
				t.Fatalf("log leaks the VIN tail: %s", out)
			}
		})
	}

	t.Run("MOTO-01-TC13 a panic log does not carry the VIN", func(t *testing.T) {
		var buf bytes.Buffer
		r := httpx.NewRouter(slog.New(slog.NewTextHandler(&buf, nil)))
		r.GET("/v1/fitment", func(c *gin.Context) { panic("boom") })
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/fitment?vin=WDD2050421R123456", nil))
		if rec.Code != http.StatusInternalServerError {
			t.Fatalf("status = %d", rec.Code)
		}
		if out := buf.String(); strings.Contains(out, "R123456") || !strings.Contains(out, "boom") {
			t.Fatalf("panic log wrong: %s", out)
		}
	})

	t.Run("an incoming X-Request-ID is reused and echoed", func(t *testing.T) {
		var buf bytes.Buffer
		req := httptest.NewRequest(http.MethodGet, "/v1/fitment", nil)
		req.Header.Set("X-Request-ID", "req-abc-123")
		rec := httptest.NewRecorder()
		newRouter(&buf).ServeHTTP(rec, req)
		if rec.Header().Get("X-Request-ID") != "req-abc-123" || !strings.Contains(buf.String(), "req-abc-123") {
			t.Fatalf("header %q, log %s", rec.Header().Get("X-Request-ID"), buf.String())
		}
	})
}
