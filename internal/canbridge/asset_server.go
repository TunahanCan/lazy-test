package canbridge

import (
	"errors"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"path"
	"strings"
	"syscall"
)

const (
	productionAssetAddress = "127.0.0.1:34117"
	dynamicAssetAddress    = "127.0.0.1:0"
)

type frontendAssetListener struct {
	net.Listener
	Host            string
	URL             string
	DynamicFallback bool
}

func listenForFrontendAssets(preferredAddress string) (frontendAssetListener, error) {
	listener, preferredErr := net.Listen("tcp4", preferredAddress)
	dynamicFallback := false
	if preferredErr != nil {
		if !errors.Is(preferredErr, syscall.EADDRINUSE) {
			return frontendAssetListener{}, fmt.Errorf(
				"listen for frontend assets on %s: %w",
				preferredAddress,
				preferredErr,
			)
		}
		listener, preferredErr = net.Listen("tcp4", dynamicAssetAddress)
		if preferredErr != nil {
			return frontendAssetListener{}, fmt.Errorf(
				"preferred frontend address %s is busy and dynamic bind failed: %w",
				preferredAddress,
				preferredErr,
			)
		}
		dynamicFallback = true
	}

	host := listener.Addr().String()
	return frontendAssetListener{
		Listener:        listener,
		Host:            host,
		URL:             "http://" + host + "/",
		DynamicFallback: dynamicFallback,
	}, nil
}

func assetHandler(assets fs.FS, root string, expectedHost string) (http.Handler, error) {
	if strings.TrimSpace(expectedHost) == "" {
		return nil, errors.New("frontend asset host is required")
	}
	frontend, err := fs.Sub(assets, root)
	if err != nil {
		return nil, err
	}
	if _, err := fs.Stat(frontend, "index.html"); err != nil {
		return nil, err
	}
	files := http.FileServer(http.FS(frontend))

	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Host != expectedHost {
			http.Error(response, "not found", http.StatusNotFound)
			return
		}
		if request.Method != http.MethodGet && request.Method != http.MethodHead {
			response.Header().Set("Allow", "GET, HEAD")
			http.Error(response, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		requestPath := strings.TrimPrefix(path.Clean("/"+request.URL.Path), "/")
		if requestPath == "." || requestPath == "" {
			requestPath = "index.html"
		}
		if _, err := fs.Stat(frontend, requestPath); err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				http.NotFound(response, request)
				return
			}
			http.Error(response, "asset unavailable", http.StatusInternalServerError)
			return
		}

		response.Header().Set("Cache-Control", "no-store")
		response.Header().Set("X-Content-Type-Options", "nosniff")
		files.ServeHTTP(response, request)
	}), nil
}
