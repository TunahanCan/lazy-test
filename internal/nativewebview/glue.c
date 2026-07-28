//go:build canbridge && cgo

#include "webview.h"

#include <stdint.h>
#include <stdlib.h>

struct nativewebview_binding_context {
	webview_t view;
	uintptr_t handle;
};

void nativewebviewDispatchGoCallback(uintptr_t handle);
void nativewebviewBindingGoCallback(
	webview_t view,
	char *sequence,
	char *request,
	uintptr_t handle
);

static void nativewebview_dispatch_callback(webview_t view, void *argument) {
	(void)view;
	nativewebviewDispatchGoCallback((uintptr_t)argument);
}

static void nativewebview_binding_callback(
	const char *sequence,
	const char *request,
	void *argument
) {
	struct nativewebview_binding_context *context =
		(struct nativewebview_binding_context *)argument;
	nativewebviewBindingGoCallback(
		context->view,
		(char *)sequence,
		(char *)request,
		context->handle
	);
}

void nativewebview_dispatch(webview_t view, uintptr_t handle) {
	webview_dispatch(
		view,
		nativewebview_dispatch_callback,
		(void *)handle
	);
}

struct nativewebview_binding_context *nativewebview_bind(
	webview_t view,
	const char *name,
	uintptr_t handle
) {
	struct nativewebview_binding_context *context =
		calloc(1, sizeof(struct nativewebview_binding_context));
	if (context == NULL) {
		return NULL;
	}
	context->view = view;
	context->handle = handle;
	webview_bind(view, name, nativewebview_binding_callback, context);
	return context;
}

void nativewebview_free_binding_context(
	struct nativewebview_binding_context *context
) {
	free(context);
}
