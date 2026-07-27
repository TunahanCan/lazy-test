package canbridge

import (
	"errors"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

const (
	productionAssetAddress = "127.0.0.1:34117"
	productionAssetHost    = productionAssetAddress
	productionAssetURL     = "http://" + productionAssetHost + "/"
)

func assetHandler(assets fs.FS, root string) (http.Handler, error) {
	frontend, err := fs.Sub(assets, root)
	if err != nil {
		return nil, err
	}
	if _, err := fs.Stat(frontend, "index.html"); err != nil {
		return nil, err
	}
	files := http.FileServer(http.FS(frontend))

	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Host != productionAssetHost {
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
