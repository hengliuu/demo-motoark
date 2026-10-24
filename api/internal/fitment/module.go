package fitment

import (
	"log/slog"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r gin.IRouter, log *slog.Logger) error {
	repo, err := NewSeedRepository()
	if err != nil {
		return err
	}
	h := &handler{svc: New(repo), log: log}
	r.GET("/v1/fitment", h.check)
	return nil
}
