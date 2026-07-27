package canbridge

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestAssetHandlerServesOnlyEmbeddedFilesForExpectedHost(t *testing.T) {
	handler, err := assetHandler(fstest.MapFS{
		"dist/index.html":    {Data: []byte("<h1>Validex</h1>")},
		"dist/assets/app.js": {Data: []byte("window.ready = true;")},
	}, "dist")
	if err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodGet, productionAssetURL, nil)
	request.Host = productionAssetHost
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.Code)
	}
	if !strings.Contains(response.Body.String(), "Validex") {
		t.Fatalf("unexpected response body: %s", response.Body.String())
	}

	wrongHost := httptest.NewRequest(http.MethodGet, "http://example.test/", nil)
	wrongHost.Host = "example.test"
	wrongHostResponse := httptest.NewRecorder()
	handler.ServeHTTP(wrongHostResponse, wrongHost)
	if wrongHostResponse.Code != http.StatusNotFound {
		t.Fatalf("wrong-host status = %d, want 404", wrongHostResponse.Code)
	}
}

func TestAssetHandlerDoesNotFallbackUnknownPathsToIndex(t *testing.T) {
	handler, err := assetHandler(fstest.MapFS{
		"dist/index.html": {Data: []byte("<h1>Validex</h1>")},
	}, "dist")
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, productionAssetURL+"missing.js", nil)
	request.Host = productionAssetHost
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", response.Code)
	}
}
