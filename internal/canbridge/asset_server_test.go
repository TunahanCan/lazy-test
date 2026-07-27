package canbridge

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestAssetHandlerServesOnlyEmbeddedFilesForExpectedHost(t *testing.T) {
	const expectedHost = "127.0.0.1:43117"
	handler, err := assetHandler(fstest.MapFS{
		"dist/index.html":    {Data: []byte("<h1>Validex</h1>")},
		"dist/assets/app.js": {Data: []byte("window.ready = true;")},
	}, "dist", expectedHost)
	if err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodGet, "http://"+expectedHost+"/", nil)
	request.Host = expectedHost
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
	const expectedHost = "127.0.0.1:43118"
	handler, err := assetHandler(fstest.MapFS{
		"dist/index.html": {Data: []byte("<h1>Validex</h1>")},
	}, "dist", expectedHost)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(
		http.MethodGet,
		"http://"+expectedHost+"/missing.js",
		nil,
	)
	request.Host = expectedHost
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", response.Code)
	}
}

func TestListenForFrontendAssetsUsesPreferredAddressWhenAvailable(t *testing.T) {
	endpoint, err := listenForFrontendAssets("127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = endpoint.Close() })

	if endpoint.DynamicFallback {
		t.Fatal("an available preferred address was reported as a fallback")
	}
	if endpoint.Host == "" || endpoint.URL != "http://"+endpoint.Host+"/" {
		t.Fatalf("unexpected endpoint: %#v", endpoint)
	}
}

func TestListenForFrontendAssetsFallsBackWhenPreferredPortIsBusy(t *testing.T) {
	occupied, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = occupied.Close() })

	endpoint, err := listenForFrontendAssets(occupied.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = endpoint.Close() })

	if !endpoint.DynamicFallback {
		t.Fatal("occupied preferred address did not select a dynamic fallback")
	}
	if endpoint.Host == occupied.Addr().String() {
		t.Fatalf("fallback reused occupied address %s", endpoint.Host)
	}
	if endpoint.URL != "http://"+endpoint.Host+"/" {
		t.Fatalf("unexpected fallback URL %q", endpoint.URL)
	}

	handler, err := assetHandler(fstest.MapFS{
		"dist/index.html": {Data: []byte("<h1>Validex</h1>")},
	}, "dist", endpoint.Host)
	if err != nil {
		t.Fatal(err)
	}
	accepted := httptest.NewRequest(http.MethodGet, endpoint.URL, nil)
	accepted.Host = endpoint.Host
	acceptedResponse := httptest.NewRecorder()
	handler.ServeHTTP(acceptedResponse, accepted)
	if acceptedResponse.Code != http.StatusOK {
		t.Fatalf("dynamic host status = %d, want 200", acceptedResponse.Code)
	}

	rejected := httptest.NewRequest(http.MethodGet, "http://"+occupied.Addr().String(), nil)
	rejected.Host = occupied.Addr().String()
	rejectedResponse := httptest.NewRecorder()
	handler.ServeHTTP(rejectedResponse, rejected)
	if rejectedResponse.Code != http.StatusNotFound {
		t.Fatalf("old host status = %d, want 404", rejectedResponse.Code)
	}
}
