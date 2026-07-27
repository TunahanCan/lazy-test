import {
  useEffect,
  useMemo,
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
    icon: Variable,
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

function methodAllowsBody(method: HTTPMethod): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
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
  const updateTab = useWorkspaceStore((state) => state.updateTab);
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

  useEffect(() => {
    form.reset({
      method: tab.method,
      url: tab.url,
      body: tab.body,
      headers: tab.headers,
      timeoutMs: 30_000,
    });
  }, [tab.headers, tab.id]);

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

  const requestCounts = {
    params: queryRows.length,
    headers: countEnabledHeaders(tab),
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
                const nextName = requestNameFromURL(watchedURL);
                if (nextName) updateTab(tab.id, { name: nextName });
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
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <div className="request-editor-content">
            <Tabs.Content value="params">
              <div className="params-editor-stack">
                <QueryParamsEditor
                  rawURL={watchedURL}
                  rows={queryRows}
                  onURLChange={setRequestURL}
                  disabled={tab.running}
                />
                <section
                  className="params-secondary-section"
                  aria-label={t("requests.workbench.templateVariables")}
                >
                  <ParamsEditor
                    variables={variables}
                    overriddenKeys={overriddenVariableKeys}
                    scopeName={
                      environment?.id === "none"
                        ? t("requests.workbench.workspace")
                        : (environment?.name ??
                          t("requests.workbench.workspace"))
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
                </section>
              </div>
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
    </section>
  );
}
