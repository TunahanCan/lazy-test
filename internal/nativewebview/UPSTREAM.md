# Native WebView upstream sources

Validex maintains the application-specific Go and C glue in this directory and
exposes only the native window operations used by `internal/canbridge`. The
glue was derived from the WebView Go wrapper and retains its license at
`third_party/webview_go/LICENSE`. The platform engine remains an unmodified
upstream header because its Cocoa, GTK/WebKitGTK and Windows/WebView2
implementations are tightly coupled.

Vendored snapshots:

- `third_party/webview/webview.h`
  - Project: `webview/webview`
  - Version: 0.11.0
  - Commit: `fb6b17d826041411e6346cd9a785a5ceba7987c4`
  - SHA-256: `8d0cb39a5228b6ce1097bded9dfb3a5d81dc434e3d621a511d69f6b719a1c663`
  - License: `third_party/webview/LICENSE`
- `third_party/webview2/WebView2.h`
  - Project: Microsoft Edge WebView2 SDK
  - Version: 1.0.1150.38
  - SHA-256: `557d5c751148732242b6ced2dbf99d35bed4c4cb471fa50ccf2069a342244cf4`
  - License: `third_party/webview2/LICENSE`
- Application-specific Go/C wrapper
  - Source: `github.com/webview/webview_go`
  - Source snapshot: `6173450d4dd6`
  - License: `third_party/webview_go/LICENSE`

The snapshots were previously delivered by
`github.com/webview/webview_go` at `6173450d4dd6`, with the Linux
`webkit2gtk-4.1` build setting taken from `github.com/lvlrt/webview_go` at
`fc6fe8152db0`. The headers are byte-for-byte identical in those two modules.

To verify the snapshots:

```bash
cd internal/nativewebview
shasum -a 256 -c SHA256SUMS
```

To update a snapshot, replace the header, version file and matching license
together; update `SHA256SUMS`, the provenance above and the corresponding
section in the repository-root `THIRD_PARTY_NOTICES.md`; then build the
`canbridge` target on macOS, Linux and Windows.
