package fitment

import "github.com/hengliuu/demo-motoark/api/internal/platform/apperr"

var (
	ErrInvalidPart = apperr.Invalid("invalid_part", "Enter a part number", nil)
	ErrInvalidVIN  = apperr.Invalid("invalid_vin", "Enter the 17-character VIN from your registration card", nil)
	ErrUnknownVIN  = apperr.NotFound("unknown_vin", "We couldn't find this VIN. Check it against your registration card", nil)
)
