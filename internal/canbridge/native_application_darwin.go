//go:build canbridge && darwin

package canbridge

/*
#cgo CFLAGS: -x objective-c -fno-objc-arc
#cgo LDFLAGS: -framework Cocoa

#import <Cocoa/Cocoa.h>
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
	(void)app_id;
	if (title == NULL || title[0] == '\0') {
		return;
	}

	@autoreleasepool {
		setprogname(title);
		NSString *application_name = [NSString stringWithUTF8String:title];
		if (application_name != nil) {
			[[NSUserDefaults standardUserDefaults]
				setObject:application_name
				forKey:@"NSApplicationName"];
		}
	}
}

static int canbridge_apply_native_window_icon(
	const unsigned char *png_data,
	size_t png_size,
	char **error_message
) {
	*error_message = NULL;
	if (png_data == NULL || png_size == 0) {
		return 1;
	}

	@autoreleasepool {
		NSData *data = [[NSData alloc]
			initWithBytes:png_data
			length:(NSUInteger)png_size];
		if (data == nil) {
			*error_message = canbridge_copy_native_error(
				"could not allocate native PNG icon data"
			);
			return 0;
		}

		NSImage *icon = [[NSImage alloc] initWithData:data];
		[data release];
		if (icon == nil) {
			*error_message = canbridge_copy_native_error(
				"could not decode PNG icon"
			);
			return 0;
		}

		[[NSApplication sharedApplication] setApplicationIconImage:icon];
		[icon release];
		return 1;
	}
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
		(*C.uchar)(unsafe.Pointer(&pngData[0])),
		C.size_t(len(pngData)),
		&nativeError,
	)
	if nativeError != nil {
		defer C.free(unsafe.Pointer(nativeError))
	}
	if applied == 0 {
		if nativeError == nil {
			return errors.New("apply native application icon")
		}
		return errors.New(C.GoString(nativeError))
	}
	return nil
}
