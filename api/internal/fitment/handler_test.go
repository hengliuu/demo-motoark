package fitment_test

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/hengliuu/demo-motoark/api/internal/fitment"
	"github.com/hengliuu/demo-motoark/api/internal/platform/httpx"
)

const goodVIN = "WDD2050421R123456"

func newRouter(t *testing.T) *gin.Engine {
	t.Helper()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	r := httpx.NewRouter(log)
	if err := fitment.RegisterRoutes(r, log); err != nil {
		t.Fatalf("RegisterRoutes: %v", err)
	}
	return r
}

func get(t *testing.T, part, vin string) *httptest.ResponseRecorder {
	t.Helper()
	q := url.Values{"part": {part}, "vin": {vin}}
	req := httptest.NewRequest(http.MethodGet, "/v1/fitment?"+q.Encode(), nil)
	rec := httptest.NewRecorder()
	newRouter(t).ServeHTTP(rec, req)
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body is not JSON: %v: %s", err, rec.Body.String())
	}
	return body
}

func keys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func assertKeys(t *testing.T, name string, m map[string]any, want ...string) {
	t.Helper()
	got := map[string]bool{}
	for _, k := range keys(m) {
		got[k] = true
	}
	if len(got) != len(want) {
		t.Fatalf("%s keys = %v, want %v", name, keys(m), want)
	}
	for _, k := range want {
		if !got[k] {
			t.Fatalf("%s keys = %v, want %v", name, keys(m), want)
		}
	}
}

func TestFitmentHandler(t *testing.T) {
	t.Run("MOTO-01-TC01 a fitting part returns 200 fits with listings sorted by price", func(t *testing.T) {
		rec := get(t, "A0004204102", goodVIN)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
		}
		body := decode(t, rec)
		assertKeys(t, "body", body, "result", "vehicle", "part", "resolved", "listings")
		assertKeys(t, "vehicle", body["vehicle"].(map[string]any), "vin", "make", "model", "chassis", "year")
		assertKeys(t, "part", body["part"].(map[string]any), "number", "name")
		assertKeys(t, "resolved", body["resolved"].(map[string]any), "number", "name", "chain")
		if body["result"] != "fits" {
			t.Fatalf("result = %v", body["result"])
		}
		if v := body["vehicle"].(map[string]any); v["vin"] != goodVIN || v["model"] != "C 200" || v["chassis"] != "W205" || v["year"] != float64(2019) {
			t.Fatalf("vehicle = %v", v)
		}
		if r := body["resolved"].(map[string]any); r["number"] != "A0004204102" || !reflect.DeepEqual(r["chain"], []any{"A0004204102"}) {
			t.Fatalf("resolved = %v", r)
		}
		ls := body["listings"].([]any)
		if len(ls) != 3 {
			t.Fatalf("listings = %v", ls)
		}
		first := ls[0].(map[string]any)
		assertKeys(t, "listing", first, "id", "yard", "grade", "price_aed", "warranty_days", "delivery")
		if first["id"] != "L-1001" || first["price_aed"] != float64(899) {
			t.Fatalf("first listing = %v", first)
		}
		if ls[1].(map[string]any)["price_aed"] != float64(1250) || ls[2].(map[string]any)["price_aed"] != float64(1480) {
			t.Fatalf("listings not sorted by price: %v", ls)
		}
	})

	t.Run("MOTO-01-TC02 a superseded part returns the chain and listings for the new number", func(t *testing.T) {
		rec := get(t, "A 205 906 22 03", goodVIN)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
		}
		body := decode(t, rec)
		if body["result"] != "superseded" {
			t.Fatalf("result = %v", body["result"])
		}
		if p := body["part"].(map[string]any); p["number"] != "A2059062203" {
			t.Fatalf("part = %v", p)
		}
		r := body["resolved"].(map[string]any)
		if r["number"] != "A2059065903" || !reflect.DeepEqual(r["chain"], []any{"A2059062203", "A2059065903"}) {
			t.Fatalf("resolved = %v", r)
		}
		ls := body["listings"].([]any)
		if len(ls) != 2 || ls[0].(map[string]any)["id"] != "L-2001" || ls[1].(map[string]any)["id"] != "L-2002" {
			t.Fatalf("listings = %v", ls)
		}
	})

	t.Run("MOTO-01-TC03 a part for another chassis returns 200 no_fit with an empty listings array", func(t *testing.T) {
		rec := get(t, "A1669060103", goodVIN)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
		}
		body := decode(t, rec)
		if body["result"] != "no_fit" {
			t.Fatalf("result = %v", body["result"])
		}
		ls, ok := body["listings"].([]any)
		if !ok || len(ls) != 0 {
			t.Fatalf("listings = %#v, want []", body["listings"])
		}
	})

	t.Run("MOTO-01-TC14 a part outside the catalogue answers 200 no_fit with empty names and no listings", func(t *testing.T) {
		rec := get(t, "Z9999999999", goodVIN)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
		}
		body := decode(t, rec)
		if body["result"] != "no_fit" {
			t.Fatalf("result = %v", body["result"])
		}
		if p := body["part"].(map[string]any); p["number"] != "Z9999999999" || p["name"] != "" {
			t.Fatalf("part = %v", p)
		}
		if r := body["resolved"].(map[string]any); r["number"] != "Z9999999999" || r["name"] != "" {
			t.Fatalf("resolved = %v", r)
		}
		if ls, ok := body["listings"].([]any); !ok || len(ls) != 0 {
			t.Fatalf("listings = %#v, want []", body["listings"])
		}
	})

	t.Run("MOTO-01-TC18 a VIN of the wrong length answers 400 invalid_vin", func(t *testing.T) {
		assertError(t, get(t, "A0004204102", "WDD2050421R12345"), http.StatusBadRequest, "invalid_vin",
			"Enter the 17-character VIN from your registration card")
	})

	t.Run("MOTO-01-TC06 a VIN with an excluded letter returns 400 invalid_vin", func(t *testing.T) {
		assertError(t, get(t, "A0004204102", "WDD2050421R12345I"), http.StatusBadRequest, "invalid_vin",
			"Enter the 17-character VIN from your registration card")
	})

	t.Run("MOTO-01-TC15 a blank part number returns 400 invalid_part", func(t *testing.T) {
		assertError(t, get(t, "  ", goodVIN), http.StatusBadRequest, "invalid_part", "Enter a part number")
	})

	t.Run("MOTO-01-TC15 a missing query returns 400 invalid_part", func(t *testing.T) {
		rec := httptest.NewRecorder()
		newRouter(t).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/fitment", nil))
		assertError(t, rec, http.StatusBadRequest, "invalid_part", "Enter a part number")
	})

	t.Run("MOTO-01-TC07 a valid but unknown VIN returns 404 unknown_vin", func(t *testing.T) {
		assertError(t, get(t, "A0004204102", "WDD2050421R999999"), http.StatusNotFound, "unknown_vin",
			"We couldn't find this VIN. Check it against your registration card")
	})

	t.Run("MOTO-01-TC12 healthz returns ok", func(t *testing.T) {
		rec := httptest.NewRecorder()
		newRouter(t).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
		if rec.Code != http.StatusOK || rec.Body.String() != `{"status":"ok"}` {
			t.Fatalf("healthz = %d %s", rec.Code, rec.Body)
		}
	})
}

func assertError(t *testing.T, rec *httptest.ResponseRecorder, status int, code, msg string) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status = %d, want %d, body %s", rec.Code, status, rec.Body)
	}
	body := decode(t, rec)
	assertKeys(t, "body", body, "error")
	e := body["error"].(map[string]any)
	assertKeys(t, "error", e, "code", "message")
	if e["code"] != code || e["message"] != msg {
		t.Fatalf("error = %v, want %s / %s", e, code, msg)
	}
}
