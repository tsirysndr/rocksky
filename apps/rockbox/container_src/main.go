package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var (
	defaultTarget = &url.URL{Scheme: "http", Host: "localhost:6062"}
	mediaTarget   = &url.URL{Scheme: "http", Host: "localhost:7882"}

	// matches URI="/absolute/path" in M3U8 tags
	uriAttrRe = regexp.MustCompile(`URI="(/[^"]*)"`)
	// matches ="(/absolute/path)" in DASH MPD XML attributes
	xmlAttrRe = regexp.MustCompile(`="(/[^"]*)"`)
)

// retryTransport retries requests when the upstream is not yet ready (ECONNREFUSED).
type retryTransport struct {
	maxRetries int
	delay      time.Duration
}

func (t *retryTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	for i := 0; ; i++ {
		resp, err := http.DefaultTransport.RoundTrip(req)
		if err == nil || i >= t.maxRetries || !errors.Is(err, syscall.ECONNREFUSED) {
			return resp, err
		}
		log.Printf("upstream not ready, retrying in %s (%d/%d)...", t.delay, i+1, t.maxRetries)
		select {
		case <-req.Context().Done():
			return nil, req.Context().Err()
		case <-time.After(t.delay):
		}
	}
}

// rewriteMPD prefixes all absolute paths in a DASH MPD XML body.
func rewriteMPD(body []byte, prefix string) []byte {
	return []byte(xmlAttrRe.ReplaceAllString(string(body), `="`+prefix+`$1"`))
}

func newProxy(target *url.URL) *httputil.ReverseProxy {
	p := httputil.NewSingleHostReverseProxy(target)
	p.Transport = &retryTransport{maxRetries: 30, delay: time.Second}
	return p
}

func newMediaProxy(target *url.URL) *httputil.ReverseProxy {
	p := httputil.NewSingleHostReverseProxy(target)
	p.Transport = &retryTransport{maxRetries: 30, delay: time.Second}

	// Disable compression for playlist requests so ModifyResponse can read plain text.
	director := p.Director
	p.Director = func(req *http.Request) {
		director(req)
		if isManifest(req.URL.Path) {
			req.Header.Del("Accept-Encoding")
		}
	}

	p.ModifyResponse = func(resp *http.Response) error {
		ct := resp.Header.Get("Content-Type")
		id := resp.Request.Header.Get("X-Rockbox-Id")
		if id == "" {
			return nil
		}
		var rewrite func([]byte, string) []byte
		switch {
		case strings.Contains(ct, "mpegurl"):
			rewrite = rewriteM3U8
		case strings.Contains(ct, "dash+xml"):
			rewrite = rewriteMPD
		default:
			return nil
		}
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return err
		}
		rewritten := rewrite(body, "/"+id)
		resp.Body = io.NopCloser(bytes.NewReader(rewritten))
		resp.ContentLength = int64(len(rewritten))
		resp.Header.Set("Content-Length", strconv.Itoa(len(rewritten)))
		resp.Header.Del("Content-Encoding")
		return nil
	}

	return p
}

func isManifest(path string) bool {
	return strings.HasSuffix(path, ".m3u8") || strings.HasSuffix(path, ".m3u") || strings.HasSuffix(path, ".mpd")
}

// rewriteM3U8 prefixes all absolute paths in an M3U8 playlist body.
func rewriteM3U8(body []byte, prefix string) []byte {
	lines := bytes.Split(body, []byte("\n"))
	for i, line := range lines {
		s := string(line)
		// Rewrite URI="..." attributes (e.g. #EXT-X-MAP:URI="/init.mp4")
		s = uriAttrRe.ReplaceAllString(s, `URI="`+prefix+`$1"`)
		// Rewrite bare absolute segment paths
		trimmed := strings.TrimSpace(s)
		if strings.HasPrefix(trimmed, "/") && !strings.HasPrefix(trimmed, "//") {
			s = prefix + trimmed
		}
		lines[i] = []byte(s)
	}
	return bytes.Join(lines, []byte("\n"))
}

func main() {
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	defaultProxy := newProxy(defaultTarget)
	mediaProxy := newMediaProxy(mediaTarget)

	mux := http.NewServeMux()
	mux.HandleFunc("/hls/", func(w http.ResponseWriter, r *http.Request) {
		mediaProxy.ServeHTTP(w, r)
	})
	mux.HandleFunc("/dash/", func(w http.ResponseWriter, r *http.Request) {
		mediaProxy.ServeHTTP(w, r)
	})
	mux.HandleFunc("/seg/", func(w http.ResponseWriter, r *http.Request) {
		mediaProxy.ServeHTTP(w, r)
	})
	mux.HandleFunc("/init.mp4", func(w http.ResponseWriter, r *http.Request) {
		mediaProxy.ServeHTTP(w, r)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		defaultProxy.ServeHTTP(w, r)
	})

	server := &http.Server{
		Addr:    ":8080",
		Handler: mux,
	}

	go func() {
		log.Printf("Proxy listening on %s (default → %s, /hls/ /dash/ → %s)\n",
			server.Addr, defaultTarget, mediaTarget)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	sig := <-stop
	log.Printf("Received signal (%s), shutting down...", sig)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatal(err)
	}

	log.Println("Server shutdown successfully")
}
