// Package apperr holds the error kinds the HTTP layer understands. Domain packages build
// these from their own sentinels, so this package never imports a domain.
package apperr

import "net/http"

type Kind int

const (
	KindInternal Kind = iota
	KindInvalid
	KindNotFound
)

func (k Kind) HTTPStatus() int {
	switch k {
	case KindInvalid:
		return http.StatusBadRequest
	case KindNotFound:
		return http.StatusNotFound
	default:
		return http.StatusInternalServerError
	}
}

// Error is safe to show to clients through Code and Msg. Err is the cause, logged but never shown.
type Error struct {
	Kind Kind
	Code string
	Msg  string
	Err  error
}

func (e *Error) Error() string {
	if e.Err != nil {
		return e.Code + ": " + e.Msg + ": " + e.Err.Error()
	}
	return e.Code + ": " + e.Msg
}

func (e *Error) Unwrap() error { return e.Err }

func Invalid(code, msg string, cause error) *Error {
	return &Error{Kind: KindInvalid, Code: code, Msg: msg, Err: cause}
}

func NotFound(code, msg string, cause error) *Error {
	return &Error{Kind: KindNotFound, Code: code, Msg: msg, Err: cause}
}
