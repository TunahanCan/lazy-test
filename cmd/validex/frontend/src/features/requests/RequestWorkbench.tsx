import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertCircle,
  Braces,
  ChevronDown,
  Clipboard,
  FileText,
  ListFilter,
  Save as SaveIcon,
  Send,
  Variable,
  X,
} from "lucide-react";
import {
  useFieldArray,
  useForm,
  type FieldErrors,
} from "react-hook-form";
import {
  messages,
  supportedLocales,
  useTranslation,
  type TranslationKey,
} from "../../i18n";
import { backend } from "../../lib/backend";
import { methodAllowsBody } from "../../lib/http";
import { requestURLMatchesOpenAPIPath } from "../../lib/openapi";
import { useCancelRequest, useSendRequest } from "../../lib/queries";
import {
  missingVariables,
  requestFormResolver,
  requestURLValidationMessage,
  resolveVariableReferences,
  type RequestFormValues,
} from "../../lib/schemas";
import { parseURLQuery } from "../../lib/urlQuery";
import type {
  BootstrapData,
  HTTPMethod,
  RequestTab,
} from "../../lib/types";
import { cn } from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/workspace";
import { Button, CountBadge } from "../../shared/ui";
import { SaveRequestDialog } from "../collections/SaveRequestDialog";
import { useCollectionLibraryStore } from "../../stores/collectionLibrary";
import {
  useCollectionLibraryPersistence,
  waitForCollectionLibraryPersistence,
} from "../../stores/collectionLibraryStorage";
import {
  BodyEditor,
  HeadersEditor,
  MethodSelect,
  ParamsEditor,
  QueryParamsEditor,
} from "./RequestEditors";
import { requestNameFromURL } from "./model/requestName";
import { ResponsePanel } from "./ResponsePanel";

const requestSections = [
  {
    id: "params",
    labelKey: "requests.workbench.section.params",
    icon: ListFilter,
  },
  {
    id: "headers",
    labelKey: "requests.workbench.section.headers",
    icon: FileText,
  },
  {
    id: "body",
    labelKey: "requests.workbench.section.body",
    icon: Braces,
  },
  {
    id: "variables",
    labelKey: "requests.workbench.section.variables",
    icon: Variable,
  },
] as const;

const validationMessageKeys: Readonly<Record<string, TranslationKey>> = {
  "Request URL gerekli.": "requests.validation.urlRequired",
  "URL başında veya sonunda boşluk içeremez.":
    "requests.validation.urlWhitespace",
  "URL açıkça http:// veya https:// ile başlamalı.":
    "requests.validation.urlScheme",
  "Yalnızca HTTP ve HTTPS URL’leri desteklenir.":
    "requests.validation.httpOnly",
  "URL kullanıcı bilgisi içeremez. Kimlik doğrulamayı Headers üzerinden yönetin.":
    "requests.validation.userInfo",
  "URL fragment (#…) içeremez.": "requests.validation.fragment",
  "Geçerli bir HTTP veya HTTPS URL’si girin.":
    "requests.validation.invalidURL",
  "HTTP metodu geçersiz.": "requests.validation.invalidMethod",
};

const untitledRequestNames = new Set(
  supportedLocales.map((locale) => messages[locale]["requests.untitled"]),
);

function countEnabledHeaders(tab: RequestTab) {
  return tab.headers.filter((header) => header.enabled && header.key).length;
}

function validationMessage(errors: FieldErrors<RequestFormValues>) {
  if (errors.url?.message) return errors.url.message;
  if (errors.method?.message) return errors.method.message;
  return undefined;
}

export function RequestWorkbench({
  tab,
  bootstrap,
  compact = false,
}: {
  tab: RequestTab;
  bootstrap: BootstrapData;
  compact?: boolean;
}) {
  const t = useTranslation();
  const sendMutation = useSendRequest();
  const cancelMutation = useCancelRequest();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [saveNotice, setSaveNotice] = useState<
    "secret-headers" | "write-error" | null
  >(null);
  const saveDialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const updateTab = useWorkspaceStore((state) => state.updateTab);
  const collections = useCollectionLibraryStore(
    (state) => state.collections,
  );
  const savedRequests = useCollectionLibraryStore((state) => state.requests);
  const createCollection = useCollectionLibraryStore(
    (state) => state.createCollection,
  );
  const saveRequest = useCollectionLibraryStore(
    (state) => state.saveRequest,
  );
  const upsertRequest = useCollectionLibraryStore(
    (state) => state.upsertRequest,
  );
  const renameSavedRequest = useCollectionLibraryStore(
    (state) => state.renameRequest,
  );
  const collectionLibraryPersistence =
    useCollectionLibraryPersistence();
  const collectionLibraryWritable =
    collectionLibraryPersistence.hydrated &&
    collectionLibraryPersistence.error?.code !==
      "collection_library_conflict";
  const responsePlacement = useWorkspaceStore(
    (state) => state.responsePlacement,
  );
  const effectiveResponsePlacement = compact
    ? "vertical"
    : responsePlacement;
  const responseSize = useWorkspaceStore((state) => state.responseSize);
  const setResponseSize = useWorkspaceStore((state) => state.setResponseSize);
  const environmentID = useWorkspaceStore((state) => state.activeEnvironmentID);
  const environmentVariables = useWorkspaceStore(
    (state) => state.environmentVariables,
  );
  const setEnvironmentVariable = useWorkspaceStore(
    (state) => state.setEnvironmentVariable,
  );
  const removeEnvironmentVariable = useWorkspaceStore(
    (state) => state.removeEnvironmentVariable,
  );
  const environment =
    bootstrap.environments.find((item) => item.id === environmentID) ??
    bootstrap.environments[0];
  const variables = useMemo(
    () => ({
      ...(environment?.variables ?? {}),
      ...(environment ? environmentVariables[environment.id] : {}),
    }),
    [environment, environmentVariables],
  );
  const overriddenVariableKeys = useMemo(
    () =>
      new Set(
        environment
          ? Object.keys(environmentVariables[environment.id] ?? {})
          : [],
      ),
    [environment, environmentVariables],
  );
  const linkedSavedRequest = tab.savedRequestId
    ? savedRequests.find((request) => request.id === tab.savedRequestId)
    : undefined;

  const form = useForm<RequestFormValues>({
    resolver: requestFormResolver,
    mode: "onChange",
    defaultValues: {
      method: tab.method,
      url: tab.url,
      body: tab.body,
      headers: tab.headers,
      timeoutMs: 30_000,
    },
  });
  const headers = useFieldArray({ control: form.control, name: "headers" });
  const formTabIDRef = useRef(tab.id);

  useEffect(() => {
    const current = form.getValues();
    const next = {
      method: tab.method,
      url: tab.url,
      body: tab.body,
      headers: tab.headers,
      timeoutMs: current.timeoutMs,
    };
    const tabChanged = formTabIDRef.current !== tab.id;
    formTabIDRef.current = tab.id;
    if (
      !tabChanged &&
      current.method === next.method &&
      current.url === next.url &&
      current.body === next.body &&
      JSON.stringify(current.headers) === JSON.stringify(next.headers)
    ) {
      return;
    }
    form.reset(next);
  }, [form, tab.body, tab.headers, tab.id, tab.method, tab.url]);

  const watchedURL = form.watch("url");
  const watchedBody = form.watch("body");
  const watchedMethod = form.watch("method");
  const watchedHeaders = form.watch("headers");
  const queryRows = useMemo(() => parseURLQuery(watchedURL), [watchedURL]);
  const unresolvedURL = useMemo(
    () => missingVariables(watchedURL, variables),
    [variables, watchedURL],
  );
  const unresolved = useMemo(
    () =>
      missingVariables(
        [
          watchedURL,
          methodAllowsBody(watchedMethod) ? watchedBody : "",
          ...watchedHeaders
            .filter((header) => header.enabled)
            .map((header) => header.value),
        ].join("\n"),
        variables,
      ),
    [variables, watchedBody, watchedHeaders, watchedMethod, watchedURL],
  );
  const resolvedURLMessage = useMemo(
    () =>
      unresolvedURL.length > 0
        ? undefined
        : requestURLValidationMessage(
            resolveVariableReferences(watchedURL, variables),
          ),
    [unresolvedURL.length, variables, watchedURL],
  );

  const setRequestURL = (url: string) => {
    form.setValue("url", url, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    updateTab(tab.id, {
      url,
      dirty: true,
      error: false,
      userError: undefined,
    });
  };

  const syncHeaders = () => {
    const nextHeaders = form.getValues("headers");
    if (JSON.stringify(nextHeaders) === JSON.stringify(tab.headers)) return;
    updateTab(tab.id, {
      headers: nextHeaders,
      dirty: true,
      error: false,
      userError: undefined,
    });
  };

  const setSection = (section: RequestTab["requestSection"]) =>
    updateTab(tab.id, { requestSection: section });

  const submit = form.handleSubmit(async (values) => {
    const resolvedURL = resolveVariableReferences(values.url, variables);
    const urlError = requestURLValidationMessage(resolvedURL);
    if (urlError) {
      form.setError("url", { type: "validate", message: urlError });
      return;
    }
    updateTab(tab.id, {
      running: true,
      error: false,
      userError: undefined,
      response: undefined,
      method: values.method,
      url: values.url,
      body: values.body,
      headers: values.headers,
    });
    try {
      const result = await sendMutation.mutateAsync({
        id: tab.id,
        name: tab.name,
        method: values.method,
        url: values.url,
        headers: values.headers.map(({ id: _id, ...header }) => header),
        body: values.body,
        variables,
        timeoutMs: values.timeoutMs,
        saveHistory: true,
      });
      if (result.response) {
        let response = result.response;
        if (tab.openApi) {
          if (!requestURLMatchesOpenAPIPath(values.url, tab.openApi.path)) {
            response = {
              ...response,
              contract: {
                available: false,
                ok: false,
                truncated: false,
                method: values.method,
                path: tab.openApi.path,
                findings: [],
                error: {
                  code: "operation_changed",
                  title: t("requests.error.operationChanged.title"),
                  message: t("requests.error.operationChanged.message", {
                    path: tab.openApi.path,
                  }),
                  hint: t("requests.error.operationChanged.hint"),
                },
              },
            };
          } else {
            try {
              const contract = await backend.validateOpenAPIResponse({
                specId: tab.openApi.specId,
                method: values.method,
                path: tab.openApi.path,
                statusCode: response.statusCode,
                contentType: response.contentType,
                body: response.rawBody,
              });
              response = { ...response, contract };
            } catch (error) {
              response = {
                ...response,
                contract: {
                  available: false,
                  ok: false,
                  truncated: false,
                  method: values.method,
                  path: tab.openApi.path,
                  findings: [],
                  error: {
                    code: "contract_check_failed",
                    title: t("requests.error.contractCheck.title"),
                    message: t("requests.error.contractCheck.message"),
                    technical:
                      error instanceof Error ? error.message : String(error),
                  },
                },
              };
            }
          }
        }
        updateTab(tab.id, {
          running: false,
          error: false,
          userError: undefined,
          response,
        });
        return;
      }
      updateTab(tab.id, {
        running: false,
        error: result.error?.code !== "request_canceled",
        userError:
          result.error ??
          {
            code: "empty_response",
            title: t("requests.error.emptyResponse.title"),
            message: t("requests.error.emptyResponse.message"),
            hint: t("requests.error.emptyResponse.hint"),
          },
      });
    } catch (error) {
      updateTab(tab.id, {
        running: false,
        error: true,
        userError: {
          code: "bridge_error",
          title: t("requests.error.bridge.title"),
          message: t("requests.error.bridge.message"),
          hint: t("requests.error.bridge.hint"),
          technical: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  const cancelRequest = async () => {
    try {
      const canceled = await cancelMutation.mutateAsync(tab.id);
      if (!canceled) {
        updateTab(tab.id, {
          running: false,
          error: true,
          userError: {
            code: "cancel_not_found",
            title: t("requests.error.cancelNotFound.title"),
            message: t("requests.error.cancelNotFound.message"),
            hint: t("requests.error.cancelNotFound.hint"),
          },
        });
      }
    } catch (error) {
      updateTab(tab.id, {
        running: false,
        error: true,
        userError: {
          code: "cancel_failed",
          title: t("requests.error.cancelFailed.title"),
          message: t("requests.error.cancelFailed.message"),
          hint: t("requests.error.cancelFailed.hint"),
          technical: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };

  const copyAsCurl = () => {
    const values = form.getValues();
    const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
    const resolvedURL = resolveVariableReferences(values.url, variables);
    const urlError = requestURLValidationMessage(resolvedURL);
    if (urlError) {
      form.setError("url", { type: "validate", message: urlError });
      return;
    }
    const headerArguments = values.headers
      .filter((header) => header.enabled && header.key)
      .flatMap((header) => [
        "--header",
        quote(
          `${header.key}: ${resolveVariableReferences(header.value, variables)}`,
        ),
      ]);
    const bodyArguments =
      methodAllowsBody(values.method) && values.body
        ? [
            "--data-raw",
            quote(resolveVariableReferences(values.body, variables)),
          ]
        : [];
    const command = [
      "curl",
      "--request",
      values.method,
      "--url",
      quote(resolvedURL),
      ...headerArguments,
      ...bodyArguments,
    ].join(" ");
    void navigator.clipboard?.writeText(command);
  };

  const savedSnapshot = (name: string) => {
    const values = form.getValues();
    return {
      name,
      method: values.method,
      url: values.url,
      body: values.body,
      headers: values.headers,
    };
  };

  const finishSavedRequest = async (
    requestId: string,
    collectionId: string,
    name: string,
    snapshot: ReturnType<typeof savedSnapshot>,
  ) => {
    updateTab(tab.id, {
      savedRequestId: requestId,
      collectionId,
      name,
      method: snapshot.method,
      url: snapshot.url,
      body: snapshot.body,
      headers: snapshot.headers,
      dirty: true,
    });
    setSavePending(true);
    setSaveNotice(null);

    const durable = await waitForCollectionLibraryPersistence();
    const persistedRequest = useCollectionLibraryStore
      .getState()
      .requests.find((request) => request.id === requestId);
    const secretsWereRemoved =
      Boolean(persistedRequest) &&
      JSON.stringify(persistedRequest?.headers) !==
        JSON.stringify(snapshot.headers);
    const currentValues = form.getValues();
    const currentTab = useWorkspaceStore
      .getState()
      .tabs.find((candidate) => candidate.id === tab.id);
    const unchangedSinceSave =
      currentTab?.savedRequestId === requestId &&
      currentTab.collectionId === collectionId &&
      currentTab.name === name &&
      currentValues.method === snapshot.method &&
      currentValues.url === snapshot.url &&
      currentValues.body === snapshot.body &&
      JSON.stringify(currentValues.headers) ===
        JSON.stringify(snapshot.headers);

    if (currentTab) {
      updateTab(tab.id, {
        dirty:
          !durable || secretsWereRemoved || !unchangedSinceSave,
      });
    }
    setSaveNotice(
      !durable
        ? "write-error"
        : secretsWereRemoved
          ? "secret-headers"
          : null,
    );
    setSavePending(false);
  };

  const openSaveDialog = () => {
    if (!collectionLibraryWritable) return;
    saveDialogReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSaveDialogOpen(true);
  };

  const saveCurrentRequest = () => {
    if (
      !collectionLibraryWritable ||
      tab.running ||
      savePending
    ) {
      return;
    }
    if (!linkedSavedRequest) {
      openSaveDialog();
      return;
    }
    const snapshot = savedSnapshot(tab.name);
    const requestId = upsertRequest(
      linkedSavedRequest.collectionId,
      snapshot,
      tab.savedRequestId,
    );
    if (requestId) {
      void finishSavedRequest(
        requestId,
        linkedSavedRequest.collectionId,
        tab.name,
        snapshot,
      );
    }
  };

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      const workspace = useWorkspaceStore.getState();
      if (
        event.key.toLowerCase() !== "s" ||
        (!event.ctrlKey && !event.metaKey) ||
        event.defaultPrevented ||
        workspace.activeView !== "requests" ||
        workspace.activeTabID !== tab.id ||
        tab.running ||
        savePending ||
        !collectionLibraryWritable ||
        saveDialogOpen ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      event.preventDefault();
      saveCurrentRequest();
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [
    collectionLibraryWritable,
    savePending,
    saveDialogOpen,
    tab.collectionId,
    tab.name,
    tab.running,
    tab.savedRequestId,
    linkedSavedRequest,
    updateTab,
    upsertRequest,
  ]);

  const requestCounts = {
    params: queryRows.length,
    headers: countEnabledHeaders(tab),
    variables: Object.keys(variables).length,
  };
  const rawErrorMessage =
    validationMessage(form.formState.errors) ?? resolvedURLMessage;
  const errorMessage = rawErrorMessage
    ? validationMessageKeys[rawErrorMessage]
      ? t(validationMessageKeys[rawErrorMessage])
      : rawErrorMessage
    : undefined;
  const activeRequestSection = requestSections.some(
    (section) => section.id === tab.requestSection,
  )
    ? tab.requestSection
    : "params";

  const startResponseResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = responseSize;
    const bounds = container.getBoundingClientRect();
    document.body.classList.add("resizing");
    const move = (moveEvent: PointerEvent) => {
      const delta =
        effectiveResponsePlacement === "vertical"
          ? ((moveEvent.clientY - startY) / bounds.height) * 100
          : ((moveEvent.clientX - startX) / bounds.width) * 100;
      setResponseSize(Math.max(24, Math.min(72, startSize - delta)));
    };
    const stop = () => {
      document.body.classList.remove("resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  const resizeResponseWithKeyboard = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const decrease =
      effectiveResponsePlacement === "vertical"
        ? event.key === "ArrowDown"
        : event.key === "ArrowRight";
    const increase =
      effectiveResponsePlacement === "vertical"
        ? event.key === "ArrowUp"
        : event.key === "ArrowLeft";
    if (!increase && !decrease) return;
    event.preventDefault();
    setResponseSize(
      Math.max(24, Math.min(72, responseSize + (increase ? 2 : -2))),
    );
  };

  return (
    <section
      id={`request-panel-${tab.id}`}
      role="tabpanel"
      aria-labelledby={`request-tab-${tab.id}`}
      className={cn(
        "request-workbench",
        effectiveResponsePlacement === "horizontal" && "response-horizontal",
      )}
      style={{ "--response-size": `${responseSize}%` } as React.CSSProperties}
    >
      <form className="request-form" onSubmit={submit}>
        <div className="request-line">
          <MethodSelect
            value={watchedMethod}
            disabled={tab.running}
            onChange={(method) => {
              form.setValue("method", method, { shouldValidate: true });
              updateTab(tab.id, {
                method,
                openApi: method === tab.method ? tab.openApi : undefined,
                dirty: true,
                error: false,
                userError: undefined,
              });
            }}
          />
          <div className={cn("url-field", errorMessage && "invalid")}>
            <input
              name="url"
              ref={form.register("url").ref}
              value={watchedURL}
              list="recent-url-list"
              placeholder={t("requests.workbench.urlPlaceholder")}
              spellCheck={false}
              aria-label={t("requests.workbench.url")}
              aria-invalid={Boolean(errorMessage)}
              disabled={tab.running}
              onChange={(event) => setRequestURL(event.target.value)}
              onBlur={() => {
                if (!untitledRequestNames.has(tab.name)) return;
                if (
                  tab.savedRequestId &&
                  !collectionLibraryWritable
                ) {
                  return;
                }
                const nextName = requestNameFromURL(watchedURL);
                if (!nextName) return;
                if (tab.savedRequestId) {
                  renameSavedRequest(tab.savedRequestId, nextName);
                }
                updateTab(tab.id, { name: nextName });
              }}
            />
            <datalist id="recent-url-list">
              {bootstrap.recentUrls.map((url) => (
                <option value={url} key={url} />
              ))}
            </datalist>
            {unresolved.length > 0 && (
              <span
                className="url-warning"
                title={t("requests.workbench.missingVariable")}
              >
                <AlertCircle size={14} />
                {unresolved.length}
              </span>
            )}
          </div>
          <Button
            type="button"
            className={cn(
              "request-save-button",
              linkedSavedRequest && !tab.dirty && "is-saved",
            )}
            disabled={
              tab.running ||
              savePending ||
              !collectionLibraryWritable
            }
            title={t("requests.workbench.saveShortcut")}
            onClick={saveCurrentRequest}
          >
            <SaveIcon size={14} />
            <span>
              {savePending
                ? t("requests.workbench.saving")
                : linkedSavedRequest && !tab.dirty
                ? t("requests.workbench.saved")
                : t("requests.workbench.save")}
            </span>
          </Button>
          {tab.running ? (
            <Button
              type="button"
              variant="danger"
              className="send-button cancel-button"
              onClick={() => void cancelRequest()}
            >
              <X size={15} />
              {t("requests.workbench.cancel")}
            </Button>
          ) : (
            <div className="send-split">
              <Button
                type="submit"
                variant="primary"
                className="send-button"
                disabled={unresolved.length > 0 || Boolean(errorMessage)}
                title={
                  unresolved.length > 0
                    ? t("requests.workbench.completeVariables")
                    : errorMessage
                      ? t("requests.workbench.enterValidURL")
                    : undefined
                }
              >
                <Send size={15} />
                {t("requests.workbench.send")}
              </Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="send-dropdown"
                    aria-label={t("requests.workbench.moreSendOptions")}
                  >
                    <ChevronDown size={14} />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="menu" align="end" sideOffset={5}>
                    <DropdownMenu.Item
                      className="menu-item"
                      disabled={
                        !collectionLibraryWritable ||
                        savePending
                      }
                      onSelect={openSaveDialog}
                    >
                      <SaveIcon size={15} />{" "}
                      {t("requests.workbench.saveAs")}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className="menu-item" onSelect={copyAsCurl}>
                      <Clipboard size={15} />{" "}
                      {t("requests.workbench.copyAsCurl")}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          )}
        </div>

        {(errorMessage || unresolved.length > 0 || saveNotice) && (
          <div className="request-notices">
            {(errorMessage || unresolved.length > 0) && (
              <div className="request-validation" role="alert">
                <AlertCircle size={13} />
                {errorMessage ??
                  t("requests.workbench.missingVariables", {
                    variables: unresolved
                      .map((item) => `{{${item}}}`)
                      .join(", "),
                  })}
              </div>
            )}
            {saveNotice && (
              <div className="request-save-notice" role="alert">
                <AlertCircle size={13} aria-hidden="true" />
                {saveNotice === "secret-headers"
                  ? t("requests.workbench.secretHeadersNotSaved")
                  : t("requests.workbench.saveWriteFailed")}
              </div>
            )}
          </div>
        )}

        <Tabs.Root
          value={activeRequestSection}
          onValueChange={(value) =>
            setSection(value as RequestTab["requestSection"])
          }
          className="request-editor-tabs"
        >
          <Tabs.List
            className="request-section-tabs"
            aria-label={t("requests.workbench.settings")}
          >
            {requestSections.map(({ id, labelKey, icon: Icon }) => (
              <Tabs.Trigger
                key={id}
                value={id}
                aria-label={
                  id === "params" && requestCounts.params > 0
                    ? t(
                        requestCounts.params === 1
                          ? "requests.workbench.queryCount.one"
                          : "requests.workbench.queryCount.many",
                        { count: requestCounts.params },
                      )
                    : undefined
                }
              >
                <Icon size={13} aria-hidden="true" />
                {t(labelKey)}
                {id === "params" && requestCounts.params > 0 && (
                  <CountBadge>{requestCounts.params}</CountBadge>
                )}
                {id === "headers" && requestCounts.headers > 0 && (
                  <CountBadge>{requestCounts.headers}</CountBadge>
                )}
                {id === "variables" && requestCounts.variables > 0 && (
                  <CountBadge>{requestCounts.variables}</CountBadge>
                )}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <div className="request-editor-content">
            <Tabs.Content value="params">
              <QueryParamsEditor
                rawURL={watchedURL}
                rows={queryRows}
                onURLChange={setRequestURL}
                disabled={tab.running}
              />
            </Tabs.Content>
            <Tabs.Content value="headers">
              <HeadersEditor
                fields={headers.fields}
                register={form.register}
                remove={headers.remove}
                append={headers.append}
                sync={syncHeaders}
                disabled={tab.running}
              />
            </Tabs.Content>
            <Tabs.Content value="body" className="full-height-tab">
              <BodyEditor
                value={watchedBody}
                disabled={tab.running || !methodAllowsBody(watchedMethod)}
                unavailableMessage={
                  methodAllowsBody(watchedMethod)
                    ? undefined
                    : t("requests.workbench.bodyUnavailable", {
                        method: watchedMethod,
                      })
                }
                onChange={(body) => {
                  form.setValue("body", body, { shouldValidate: true });
                  updateTab(tab.id, {
                    body,
                    dirty: true,
                    error: false,
                    userError: undefined,
                  });
                }}
              />
            </Tabs.Content>
            <Tabs.Content value="variables">
              <ParamsEditor
                variables={variables}
                overriddenKeys={overriddenVariableKeys}
                scopeName={
                  environment?.id === "none"
                    ? t("requests.workbench.workspace")
                    : (environment?.name ?? t("requests.workbench.workspace"))
                }
                disabled={tab.running}
                onChange={(key, value) => {
                  if (!environment) return;
                  setEnvironmentVariable(environment.id, key, value);
                }}
                onRemove={(key) => {
                  if (!environment) return;
                  removeEnvironmentVariable(environment.id, key);
                }}
              />
            </Tabs.Content>
          </div>
        </Tabs.Root>
      </form>

      <div
        className="response-resizer"
        onPointerDown={startResponseResize}
        onKeyDown={resizeResponseWithKeyboard}
        role="separator"
        tabIndex={0}
        aria-orientation={
          effectiveResponsePlacement === "vertical"
            ? "horizontal"
            : "vertical"
        }
        aria-label={t("requests.workbench.resize")}
        aria-valuemin={24}
        aria-valuemax={72}
        aria-valuenow={Math.round(responseSize)}
      >
        <span />
      </div>
      <ResponsePanel tab={tab} />
      <SaveRequestDialog
        open={saveDialogOpen}
        collections={collections}
        initialCollectionId={tab.collectionId}
        initialName={
          untitledRequestNames.has(tab.name)
            ? requestNameFromURL(watchedURL) || tab.name
            : tab.name
        }
        returnFocus={saveDialogReturnFocusRef.current}
        onOpenChange={setSaveDialogOpen}
        onSave={(target) => {
          if (
            !collectionLibraryWritable ||
            savePending
          ) {
            return;
          }
          const collectionId =
            target.collectionId ??
            (target.newCollectionName
              ? createCollection(target.newCollectionName)
              : undefined);
          if (!collectionId) return;
          const snapshot = savedSnapshot(target.name);
          const requestId = saveRequest(collectionId, snapshot);
          if (!requestId) return;
          setSaveDialogOpen(false);
          void finishSavedRequest(
            requestId,
            collectionId,
            target.name,
            snapshot,
          );
        }}
      />
    </section>
  );
}
