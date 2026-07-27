//go:build canbridge && linux

package canbridge

/*
#cgo pkg-config: gtk+-3.0

#include <gtk/gtk.h>
#include <stdlib.h>
#include <string.h>

static char *canbridge_copy_native_error(const char *message) {
	if (message == NULL) {
		message = "unknown native error";
	}
	size_t size = strlen(message) + 1;
	char *copy = (char *)malloc(size);
	if (copy != NULL) {
		memcpy(copy, message, size);
	}
	return copy;
}

static void canbridge_prepare_native_application(
	const char *app_id,
	const char *title
) {
	if (app_id != NULL && app_id[0] != '\0') {
		g_set_prgname(app_id);
	}
	if (title != NULL && title[0] != '\0') {
		g_set_application_name(title);
	}
}

static int canbridge_apply_native_window_icon(
	GtkWindow *window,
	const unsigned char *png_data,
	size_t png_size,
	char **error_message
) {
	*error_message = NULL;
	if (window == NULL || png_data == NULL || png_size == 0) {
		return 1;
	}
	if (!GTK_IS_WINDOW(window)) {
		*error_message = canbridge_copy_native_error(
			"native WebView handle is not a GtkWindow"
		);
		return 0;
	}

	GdkPixbufLoader *loader = gdk_pixbuf_loader_new();
	if (loader == NULL) {
		*error_message = canbridge_copy_native_error(
			"could not create a GdkPixbuf loader"
		);
		return 0;
	}

	GError *native_error = NULL;
	if (!gdk_pixbuf_loader_write(
		loader,
		png_data,
		(gsize)png_size,
		&native_error
	)) {
		*error_message = canbridge_copy_native_error(
			native_error == NULL ? "could not decode PNG icon" : native_error->message
		);
		g_clear_error(&native_error);
		gdk_pixbuf_loader_close(loader, NULL);
		g_object_unref(loader);
		return 0;
	}

	if (!gdk_pixbuf_loader_close(loader, &native_error)) {
		*error_message = canbridge_copy_native_error(
			native_error == NULL ? "PNG icon data is incomplete" : native_error->message
		);
		g_clear_error(&native_error);
		g_object_unref(loader);
		return 0;
	}

	GdkPixbuf *icon = gdk_pixbuf_loader_get_pixbuf(loader);
	if (icon == NULL) {
		*error_message = canbridge_copy_native_error(
			"decoded PNG icon does not contain an image"
		);
		g_object_unref(loader);
		return 0;
	}

	gtk_window_set_icon(window, icon);
	gtk_window_set_default_icon(icon);
	g_object_unref(loader);
	return 1;
}
*/
import "C"

import (
	"errors"
	"unsafe"
)

func prepareNativeApplication(appID, title string) {
	appID, title = nativeApplicationMetadata(appID, title)
	nativeAppID := C.CString(appID)
	nativeTitle := C.CString(title)
	defer C.free(unsafe.Pointer(nativeAppID))
	defer C.free(unsafe.Pointer(nativeTitle))

	C.canbridge_prepare_native_application(nativeAppID, nativeTitle)
}

func applyNativeWindowIcon(window unsafe.Pointer, pngData []byte) error {
	if !hasNativeWindowIcon(window, pngData) {
		return nil
	}

	var nativeError *C.char
	applied := C.canbridge_apply_native_window_icon(
		(*C.GtkWindow)(window),
		(*C.uchar)(unsafe.Pointer(&pngData[0])),
		C.size_t(len(pngData)),
		&nativeError,
	)
	if nativeError != nil {
		defer C.free(unsafe.Pointer(nativeError))
	}
	if applied == 0 {
		if nativeError == nil {
			return errors.New("apply native window icon")
		}
		return errors.New(C.GoString(nativeError))
	}
	return nil
}
