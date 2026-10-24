package httpx

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/hengliuu/demo-motoark/api/internal/platform/apperr"
)

type errorBody struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// WriteError writes the contract error body. Anything that is not an *apperr.Error becomes a
// generic 500 whose cause is logged here and never sent to the client.
func WriteError(c *gin.Context, log *slog.Logger, err error) {
	if errors.Is(err, context.Canceled) {
		c.Status(499)
		return
	}

	status, code, msg := http.StatusInternalServerError, "internal", "Something went wrong"
	if e, ok := errors.AsType[*apperr.Error](err); ok && e.Kind != apperr.KindInternal {
		status, code, msg = e.Kind.HTTPStatus(), e.Code, e.Msg
	} else {
		log.ErrorContext(c.Request.Context(), "request failed",
			"request_id", RequestID(c), "method", c.Request.Method, "path", c.Request.URL.Path, "err", err)
	}
	c.AbortWithStatusJSON(status, errorBody{Error: errorDetail{Code: code, Message: msg}})
}
