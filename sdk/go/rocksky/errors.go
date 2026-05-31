package rocksky

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// Error is returned for non-2xx responses from the API. It mirrors the standard
// XRPC error envelope { "error": "...", "message": "..." } and exposes the raw
// HTTP status code.
//
// Use errors.As to inspect:
//
//	var apiErr *rocksky.Error
//	if errors.As(err, &apiErr) {
//	    if apiErr.IsUnauthorized() { ... }
//	}
type Error struct {
	StatusCode int    `json:"-"`
	Kind       string `json:"error,omitempty"`
	Message    string `json:"message,omitempty"`
	Body       []byte `json:"-"`
}

// Error implements the error interface.
func (e *Error) Error() string {
	switch {
	case e.Kind != "" && e.Message != "":
		return fmt.Sprintf("rocksky: %d %s: %s", e.StatusCode, e.Kind, e.Message)
	case e.Kind != "":
		return fmt.Sprintf("rocksky: %d %s", e.StatusCode, e.Kind)
	case e.Message != "":
		return fmt.Sprintf("rocksky: %d %s", e.StatusCode, e.Message)
	default:
		return fmt.Sprintf("rocksky: %d %s", e.StatusCode, http.StatusText(e.StatusCode))
	}
}

// IsUnauthorized reports whether the server returned 401.
func (e *Error) IsUnauthorized() bool { return e.StatusCode == http.StatusUnauthorized }

// IsForbidden reports whether the server returned 403.
func (e *Error) IsForbidden() bool { return e.StatusCode == http.StatusForbidden }

// IsNotFound reports whether the server returned 404.
func (e *Error) IsNotFound() bool { return e.StatusCode == http.StatusNotFound }

// IsRateLimited reports whether the server returned 429.
func (e *Error) IsRateLimited() bool { return e.StatusCode == http.StatusTooManyRequests }

func parseError(resp *http.Response) error {
	body, _ := io.ReadAll(resp.Body)
	apiErr := &Error{StatusCode: resp.StatusCode, Body: body}
	// Try the standard XRPC envelope first; tolerate plain-text fallbacks.
	if len(body) > 0 {
		_ = json.Unmarshal(body, apiErr)
		if apiErr.Kind == "" && apiErr.Message == "" {
			apiErr.Message = string(body)
		}
	}
	return apiErr
}
