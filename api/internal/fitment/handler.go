package fitment

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

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
		httpx.WriteError(c, h.log, ErrInvalidPart)
		return
	}
	res, err := h.svc.Check(c.Request.Context(), CheckParams{Part: q.Part, VIN: q.VIN})
	if err != nil {
		httpx.WriteError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, toFitmentResponse(res))
}
