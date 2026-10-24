package fitment

import "errors"

var (
	ErrInvalidPart = errors.New("fitment: invalid part number")
	ErrInvalidVIN  = errors.New("fitment: invalid VIN")
	ErrUnknownVIN  = errors.New("fitment: unknown VIN")
)
