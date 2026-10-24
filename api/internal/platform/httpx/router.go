package httpx

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

// NewRouter does not use gin.Logger or gin.Recovery: both print the request line, which
// carries the full VIN.
func NewRouter(log *slog.Logger) *gin.Engine {
	r := gin.New()
	r.Use(WithRequestID(), Logging(log), Recovery(log))
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	return r
}
