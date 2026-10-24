package fitment

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/hengliuu/demo-motoark/api/internal/platform/apperr"
	"github.com/hengliuu/demo-motoark/api/internal/platform/httpx"
)

type handler struct {
	svc *Service
	log *slog.Logger
}

// check handles GET /v1/fitment?part=&vin=
func (h *handler) check(c *gin.Context) {
	var q fitmentQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		httpx.WriteError(c, h.log, toAppError(ErrInvalidPart))
		return
	}
	res, err := h.svc.Check(c.Request.Context(), CheckParams{Part: q.Part, VIN: q.VIN})
	if err != nil {
		httpx.WriteError(c, h.log, toAppError(err))
		return
	}
	c.JSON(http.StatusOK, toFitmentResponse(res))
}

// toAppError lives here and not in apperr because apperr is imported by every module and
// must not import a domain.
func toAppError(err error) error {
	switch {
	case errors.Is(err, ErrInvalidPart):
		return apperr.Invalid("invalid_part", "Enter a part number", err)
	case errors.Is(err, ErrInvalidVIN):
		return apperr.Invalid("invalid_vin", "Enter the 17-character VIN from your registration card", err)
	case errors.Is(err, ErrUnknownVIN):
		return apperr.NotFound("unknown_vin", "We couldn't find this VIN. Check it against your registration card", err)
	default:
		return err
	}
}
