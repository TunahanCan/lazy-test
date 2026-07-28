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

static NSMenuItem *canbridge_add_menu_item(
	NSMenu *menu,
	NSString *title,
	SEL action,
	NSString *key
) {
	NSMenuItem *item = [[NSMenuItem alloc]
		initWithTitle:title
		action:action
		keyEquivalent:key == nil ? @"" : key];
	[item setTarget:nil];
	if (key != nil && [key length] > 0) {
		[item setKeyEquivalentModifierMask:NSEventModifierFlagCommand];
	}
	[menu addItem:item];
	[item release];
	return item;
}

static void canbridge_install_native_menus(
	NSApplication *application,
	NSString *application_name
) {
	if (application == nil || application_name == nil ||
		[application mainMenu] != nil) {
		return;
	}

	NSMenu *main_menu = [[NSMenu alloc] initWithTitle:@""];

	NSMenuItem *application_menu_item = [[NSMenuItem alloc]
		initWithTitle:application_name
		action:nil
		keyEquivalent:@""];
	NSMenu *application_menu = [[NSMenu alloc]
		initWithTitle:application_name];
	canbridge_add_menu_item(
		application_menu,
		[NSString stringWithFormat:@"About %@", application_name],
		@selector(orderFrontStandardAboutPanel:),
		@""
	);
	[application_menu addItem:[NSMenuItem separatorItem]];
	NSMenuItem *services_item = [[NSMenuItem alloc]
		initWithTitle:@"Services"
		action:nil
		keyEquivalent:@""];
	NSMenu *services_menu = [[NSMenu alloc] initWithTitle:@"Services"];
	[services_item setSubmenu:services_menu];
	[application_menu addItem:services_item];
	[application setServicesMenu:services_menu];
	[services_menu release];
	[services_item release];
	[application_menu addItem:[NSMenuItem separatorItem]];
	canbridge_add_menu_item(
		application_menu,
		[NSString stringWithFormat:@"Hide %@", application_name],
		@selector(hide:),
		@"h"
	);
	NSMenuItem *hide_others = canbridge_add_menu_item(
		application_menu,
		@"Hide Others",
		@selector(hideOtherApplications:),
		@"h"
	);
	[hide_others setKeyEquivalentModifierMask:
		NSEventModifierFlagCommand | NSEventModifierFlagOption];
	canbridge_add_menu_item(
		application_menu,
		@"Show All",
		@selector(unhideAllApplications:),
		@""
	);
	[application_menu addItem:[NSMenuItem separatorItem]];
	canbridge_add_menu_item(
		application_menu,
		[NSString stringWithFormat:@"Quit %@", application_name],
		@selector(terminate:),
		@"q"
	);
	[application_menu_item setSubmenu:application_menu];
	[main_menu addItem:application_menu_item];
	[application_menu release];
	[application_menu_item release];

	NSMenuItem *edit_menu_item = [[NSMenuItem alloc]
		initWithTitle:@"Edit"
		action:nil
		keyEquivalent:@""];
	NSMenu *edit_menu = [[NSMenu alloc] initWithTitle:@"Edit"];
	canbridge_add_menu_item(edit_menu, @"Undo", @selector(undo:), @"z");
	NSMenuItem *redo = canbridge_add_menu_item(
		edit_menu,
		@"Redo",
		@selector(redo:),
		@"z"
	);
	[redo setKeyEquivalentModifierMask:
		NSEventModifierFlagCommand | NSEventModifierFlagShift];
	[edit_menu addItem:[NSMenuItem separatorItem]];
	canbridge_add_menu_item(edit_menu, @"Cut", @selector(cut:), @"x");
	canbridge_add_menu_item(edit_menu, @"Copy", @selector(copy:), @"c");
	canbridge_add_menu_item(edit_menu, @"Paste", @selector(paste:), @"v");
	[edit_menu addItem:[NSMenuItem separatorItem]];
	canbridge_add_menu_item(
		edit_menu,
		@"Select All",
		@selector(selectAll:),
		@"a"
	);
	[edit_menu_item setSubmenu:edit_menu];
	[main_menu addItem:edit_menu_item];
	[edit_menu release];
	[edit_menu_item release];

	NSMenuItem *window_menu_item = [[NSMenuItem alloc]
		initWithTitle:@"Window"
		action:nil
		keyEquivalent:@""];
	NSMenu *window_menu = [[NSMenu alloc] initWithTitle:@"Window"];
	canbridge_add_menu_item(
		window_menu,
		@"Minimize",
		@selector(performMiniaturize:),
		@"m"
	);
	canbridge_add_menu_item(
		window_menu,
		@"Zoom",
		@selector(performZoom:),
		@""
	);
	[window_menu_item setSubmenu:window_menu];
	[main_menu addItem:window_menu_item];
	[application setWindowsMenu:window_menu];
	[window_menu release];
	[window_menu_item release];

	[application setMainMenu:main_menu];
	[main_menu release];
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
			canbridge_install_native_menus(
				[NSApplication sharedApplication],
				application_name
			);
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
