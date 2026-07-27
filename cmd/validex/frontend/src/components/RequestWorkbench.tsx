import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertCircle,
  Braces,
  Check,
  ChevronDown,
  Clipboard,
  FileText,
  KeyRound,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Variable,
  X,
} from "lucide-react";
import {
  useFieldArray,
  useForm,
  type FieldErrors,
} from "react-hook-form";
import { useCancelRequest, useSendRequest } from "../lib/queries";
import {
  missingVariables,
  normalizeRequestURL,
  requestSchema,
  resolveVariableReferences,
  type RequestFormValues,
} from "../lib/schemas";
import { isSecretKey } from "../lib/secrets";
import type {
  BootstrapData,
  HTTPMethod,
  RequestTab,
} from "../lib/types";
import { cn } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { Button, CountBadge, EmptyState, IconButton, MethodBadge } from "./ui";
import { ResponsePanel } from "./ResponsePanel";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((module) => ({ default: module.default })),
);

const methods: HTTPMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
];

const requestSections = [
  { id: "params", label: "Variables", icon: Variable },
  { id: "authorization", label: "Authorization", icon: KeyRound },
  { id: "headers", label: "Headers", icon: FileText },
  { id: "body", label: "Body", icon: Braces },
] as const;

function countEnabledHeaders(tab: RequestTab) {
  return tab.headers.filter((header) => header.enabled && header.key).length;
}

function methodAllowsBody(method: HTTPMethod): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

function withInferredJSONContentType(
  values: RequestFormValues,
): RequestFormValues["headers"] {
  if (
    !methodAllowsBody(values.method) ||
    !values.body.trim() ||
    values.headers.some(
      (header) =>
        header.enabled && header.key.trim().toLowerCase() === "content-type",
    )
  ) {
    return values.headers;
  }
  try {
    JSON.parse(values.body);
  } catch {
    return values.headers;
  }
  return [
    ...values.headers,
    {
      id: crypto.randomUUID(),
      enabled: true,
      key: "Content-Type",
      value: "application/json",
      description: "JSON body için otomatik eklendi",
      source: "Generated",
    },
  ];
}

function validationMessage(errors: FieldErrors<RequestFormValues>) {
  if (errors.url?.message) return errors.url.message;
  if (errors.method?.message) return errors.method.message;
  return undefined;
}

function MethodSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: HTTPMethod;
  onChange: (method: HTTPMethod) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = methods.filter((method) =>
    method.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <DropdownMenu.Root onOpenChange={(open) => !open && setQuery("")}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="method-select"
          aria-label="HTTP method seç"
          disabled={disabled}
        >
          <MethodBadge method={value} />
          <ChevronDown size={13} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu method-menu" align="start" sideOffset={5}>
          <div className="menu-search" onKeyDown={(event) => event.stopPropagation()}>
            <Search size={14} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search method"
              aria-label="HTTP method ara"
            />
          </div>
          {filtered.map((method) => (
            <DropdownMenu.Item
              key={method}
              className="menu-item method-menu-item"
              onSelect={() => onChange(method)}
            >
              <MethodBadge method={method} />
              {value === method && <Check size={14} className="menu-check" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ParamsEditor({
  variables,
  scopeName,
  onChange,
  disabled = false,
}: {
  variables: Record<string, string>;
  scopeName: string;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addError, setAddError] = useState("");
  const rows = Object.entries(variables).map(([key, value]) => ({
    key,
    value,
    type: isSecretKey(key) ? "Secret" : "String",
    source: scopeName,
  }));
  const addVariable = () => {
    const key = newKey.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) {
      setAddError("Variable adı harf veya _ ile başlamalıdır.");
      return;
    }
    if (Object.hasOwn(variables, key)) {
      setAddError("Bu variable zaten mevcut.");
      return;
    }
    onChange(key, newValue);
    setAdding(false);
    setNewKey("");
    setNewValue("");
    setAddError("");
  };
  return (
    <div className="parameter-editor">
      <div className="table-toolbar">
        <div>
          <strong>{scopeName} variables</strong>
          <span>URL, header ve body içindeki değişkenlerde kullanılır.</span>
        </div>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => {
            setAdding(true);
            setAddError("");
          }}
        >
          <Plus size={13} /> Add variable
        </Button>
      </div>
      <div className="parameter-table">
        <div className="parameter-row parameter-header">
          <span />
          <span>Key</span>
          <span>Value</span>
          <span>Type</span>
          <span>Source</span>
          <span />
        </div>
        {rows.map((row) => (
          <div className="parameter-row" key={row.key}>
            <span />
            <input value={row.key} readOnly aria-label={`${row.key} variable adı`} />
            <input
              type={row.type === "Secret" ? "password" : "text"}
              value={row.value}
              onChange={(event) => onChange(row.key, event.target.value)}
              aria-label={`${row.key} variable değeri`}
              className={row.type === "Secret" ? "secret-value" : ""}
              disabled={disabled}
            />
            <span>{row.type}</span>
            <span className="source-badge">{row.source}</span>
            <span />
          </div>
        ))}
        {rows.length === 0 && (
          <p className="context-note">
            Henüz variable yok. URL’de <code>{"{{baseUrl}}"}</code> gibi bir
            ifade kullanacaksanız önce değerini ekleyin.
          </p>
        )}
        {adding && (
          <div className="variable-composer">
            <input
              autoFocus
              value={newKey}
              onChange={(event) => {
                setNewKey(event.target.value);
                setAddError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addVariable();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setAdding(false);
                }
              }}
              placeholder="Variable name"
              aria-label="Yeni variable adı"
            />
            <input
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addVariable();
                }
              }}
              placeholder="Value"
              aria-label="Yeni variable değeri"
            />
            <Button size="sm" variant="primary" onClick={addVariable}>
              Add
            </Button>
            <IconButton
              label="Variable eklemeyi iptal et"
              onClick={() => {
                setAdding(false);
                setAddError("");
              }}
            >
              <X size={13} />
            </IconButton>
          </div>
        )}
        {addError && (
          <p className="variable-composer-error" role="alert">
            {addError}
          </p>
        )}
      </div>
    </div>
  );
}

function AuthorizationEditor() {
  return (
    <EmptyState
      title="Authorization header üzerinden yönetiliyor"
      description="Bearer, Basic veya API key değerini Headers sekmesinde Authorization header’ı olarak ekleyin."
    />
  );
}

function HeadersEditor({
  fields,
  register,
  remove,
  append,
  sync,
  disabled = false,
}: {
  fields: {
    id: string;
    source?: RequestFormValues["headers"][number]["source"];
  }[];
  register: ReturnType<typeof useForm<RequestFormValues>>["register"];
  remove: (index: number) => void;
  append: (value: RequestFormValues["headers"][number]) => void;
  sync: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="parameter-editor">
      <div className="table-toolbar">
        <div>
          <strong>Request headers</strong>
          <span>Tekrarlanan header adları desteklenir.</span>
        </div>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => {
            append({
              id: crypto.randomUUID(),
              enabled: true,
              key: "",
              value: "",
              source: "Manual",
            });
            window.setTimeout(sync);
          }}
        >
          <Plus size={13} /> Add header
        </Button>
      </div>
      <datalist id="header-suggestions">
        {[
          "Accept",
          "Content-Type",
          "Authorization",
          "User-Agent",
          "Cache-Control",
          "If-None-Match",
          "X-Request-ID",
          "traceparent",
        ].map((header) => (
          <option key={header} value={header} />
        ))}
      </datalist>
      <div className="header-table">
        <div className="header-row header-row-heading">
          <span />
          <span>Header</span>
          <span>Value</span>
          <span>Source</span>
          <span />
        </div>
        {fields.map((field, index) => (
          <div className="header-row" key={field.id}>
            <input
              type="checkbox"
              {...register(`headers.${index}.enabled`)}
              onBlur={sync}
              disabled={disabled}
              aria-label={`${index + 1}. header etkin`}
            />
            <input
              list="header-suggestions"
              {...register(`headers.${index}.key`)}
              placeholder="Header name"
              onBlur={sync}
              disabled={disabled}
              aria-label={`${index + 1}. header adı`}
            />
            <input
              {...register(`headers.${index}.value`)}
              placeholder="Value or {{variable}}"
              onBlur={sync}
              disabled={disabled}
              aria-label={`${index + 1}. header değeri`}
            />
            <span className="source-badge">
              {field.source ?? "Manual"}
            </span>
            <IconButton
              label="Header’ı sil"
              disabled={disabled}
              onClick={() => {
                remove(index);
                window.setTimeout(sync);
              }}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))}
      </div>
    </div>
  );
}

function BodyEditor({
  value,
  onChange,
  disabled = false,
  unavailableMessage,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  unavailableMessage?: string;
}) {
  const [jsonError, setJSONError] = useState("");
  const format = () => {
    try {
      const formatted = JSON.stringify(JSON.parse(value || "{}"), null, 2);
      onChange(formatted);
      setJSONError("");
    } catch {
      setJSONError("JSON sözdizimi geçerli değil. Hatalı satırı düzeltin.");
    }
  };
  return (
    <div className="body-editor">
      <div className="body-toolbar">
        <div className="body-types">
          <strong>JSON / raw body</strong>
        </div>
        <div>
          <button type="button" onClick={format} disabled={disabled}>
            <Sparkles size={14} /> Format
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              try {
                onChange(JSON.stringify(JSON.parse(value)));
                setJSONError("");
              } catch {
                setJSONError("JSON minify edilemedi; sözdizimini kontrol edin.");
              }
            }}
          >
            Minify
          </button>
        </div>
      </div>
      {unavailableMessage && (
        <div className="inline-error">
          <AlertCircle size={14} /> {unavailableMessage}
        </div>
      )}
      {jsonError && (
        <div className="inline-error">
          <AlertCircle size={14} /> {jsonError}
        </div>
      )}
      <Suspense fallback={<div className="editor-loading">Editor hazırlanıyor…</div>}>
        <MonacoEditor
          height="100%"
          language="json"
          value={value}
          onChange={(next) => onChange(next ?? "")}
          theme={
            document.documentElement.dataset.theme === "dark" ? "vs-dark" : "light"
          }
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineHeight: 19,
            scrollBeyondLastLine: false,
            wordWrap: "on",
            folding: true,
            automaticLayout: true,
            readOnly: disabled,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </Suspense>
    </div>
  );
}

export function RequestWorkbench({
  tab,
  bootstrap,
}: {
  tab: RequestTab;
  bootstrap: BootstrapData;
}) {
  const sendMutation = useSendRequest();
  const cancelMutation = useCancelRequest();
  const updateTab = useWorkspaceStore((state) => state.updateTab);
  const responsePlacement = useWorkspaceStore(
    (state) => state.responsePlacement,
  );
  const responseSize = useWorkspaceStore((state) => state.responseSize);
  const setResponseSize = useWorkspaceStore((state) => state.setResponseSize);
  const environmentID = useWorkspaceStore((state) => state.activeEnvironmentID);
  const environmentVariables = useWorkspaceStore(
    (state) => state.environmentVariables,
  );
  const setEnvironmentVariable = useWorkspaceStore(
    (state) => state.setEnvironmentVariable,
  );
  const setCodeGeneratorOpen = useWorkspaceStore(
    (state) => state.setCodeGeneratorOpen,
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

  const form = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
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
  }, [tab.id]);

  const watchedURL = form.watch("url");
  const watchedBody = form.watch("body");
  const watchedMethod = form.watch("method");
  const watchedHeaders = form.watch("headers");
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
    const normalizedURL = normalizeRequestURL(values.url);
    const requestHeaders = withInferredJSONContentType(values);
    form.setValue("url", normalizedURL, {
      shouldDirty: true,
      shouldValidate: true,
    });
    updateTab(tab.id, {
      running: true,
      error: false,
      userError: undefined,
      response: undefined,
      method: values.method,
      url: normalizedURL,
      body: values.body,
      headers: values.headers,
    });
    try {
      const result = await sendMutation.mutateAsync({
        id: tab.id,
        name: tab.name,
        method: values.method,
        url: normalizedURL,
        headers: requestHeaders.map(({ id: _id, ...header }) => header),
        body: values.body,
        variables,
        timeoutMs: values.timeoutMs,
        saveHistory: true,
      });
      if (result.response) {
        updateTab(tab.id, {
          running: false,
          error: false,
          userError: undefined,
          response: result.response,
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
            title: "Request tamamlanamadı",
            message: "Backend geçerli bir response döndürmedi.",
            hint: "Uygulamayı yeniden başlatıp request’i tekrar deneyin.",
          },
      });
    } catch (error) {
      updateTab(tab.id, {
        running: false,
        error: true,
        userError: {
          code: "bridge_error",
          title: "Backend bağlantısı koptu",
          message: "Request native backend’e iletilemedi.",
          hint: "Uygulamayı yeniden başlatıp tekrar deneyin.",
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
            title: "Çalışan request bulunamadı",
            message: "Backend bu request için aktif bir işlem bulamadı.",
            hint: "Request’i yeniden gönderin veya uygulamayı yeniden başlatın.",
          },
        });
      }
    } catch (error) {
      updateTab(tab.id, {
        running: false,
        error: true,
        userError: {
          code: "cancel_failed",
          title: "Request iptal edilemedi",
          message: "Native backend iptal komutuna yanıt vermedi.",
          hint: "Uygulamayı yeniden başlatıp tekrar deneyin.",
          technical: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };

  const copyAsCurl = () => {
    const values = form.getValues();
    const requestHeaders = withInferredJSONContentType(values);
    const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
    const resolvedURL = normalizeRequestURL(
      resolveVariableReferences(values.url, variables),
    );
    const headerArguments = requestHeaders
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
    params: Object.keys(variables).length,
    headers: countEnabledHeaders(tab),
  };
  const errorMessage = validationMessage(form.formState.errors);
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
        responsePlacement === "vertical"
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
      responsePlacement === "vertical"
        ? event.key === "ArrowDown"
        : event.key === "ArrowRight";
    const increase =
      responsePlacement === "vertical"
        ? event.key === "ArrowUp"
        : event.key === "ArrowLeft";
    if (!increase && !decrease) return;
    event.preventDefault();
    setResponseSize(
      Math.max(24, Math.min(72, responseSize + (increase ? 2 : -2))),
    );
  };

  return (
    <main
      className={cn(
        "request-workbench",
        responsePlacement === "horizontal" && "response-horizontal",
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
              placeholder="https://api.example.com/v1/users or {{baseUrl}}/v1/users"
              spellCheck={false}
              aria-label="Request URL"
              aria-invalid={Boolean(errorMessage)}
              disabled={tab.running}
              onChange={(event) => {
                form.setValue("url", event.target.value, {
                  shouldDirty: true,
                  shouldTouch: true,
                  shouldValidate: true,
                });
                updateTab(tab.id, {
                  url: event.target.value,
                  dirty: true,
                  error: false,
                  userError: undefined,
                });
              }}
              onBlur={() => {
                const currentURL = form.getValues("url");
                const normalizedURL = normalizeRequestURL(currentURL);
                form.setValue("url", normalizedURL, {
                  shouldDirty: normalizedURL !== tab.url,
                  shouldTouch: true,
                  shouldValidate: true,
                });
                if (normalizedURL !== currentURL) {
                  updateTab(tab.id, {
                    url: normalizedURL,
                    dirty: true,
                    error: false,
                    userError: undefined,
                  });
                }
              }}
            />
            <datalist id="recent-url-list">
              {bootstrap.recentUrls.map((url) => (
                <option value={url} key={url} />
              ))}
            </datalist>
            {unresolved.length > 0 && (
              <span className="url-warning" title="Eksik variable">
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
              Cancel
            </Button>
          ) : (
            <div className="send-split">
              <Button
                type="submit"
                variant="primary"
                className="send-button"
                disabled={unresolved.length > 0}
                title={
                  unresolved.length > 0
                    ? "Eksik variable değerlerini tamamlayın"
                    : undefined
                }
              >
                <Send size={15} />
                Send
              </Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="send-dropdown"
                    aria-label="Diğer gönderme seçenekleri"
                  >
                    <ChevronDown size={14} />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="menu" align="end" sideOffset={5}>
                    <DropdownMenu.Item className="menu-item" onSelect={copyAsCurl}>
                      <Clipboard size={15} /> Copy as cURL
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="menu-item"
                      onSelect={() => setCodeGeneratorOpen(true)}
                    >
                      <Sparkles size={15} /> Generate Java test
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
              `Eksik variable: ${unresolved.map((item) => `{{${item}}}`).join(", ")}`}
          </div>
        )}

        <Tabs.Root
          value={activeRequestSection}
          onValueChange={(value) =>
            setSection(value as RequestTab["requestSection"])
          }
          className="request-editor-tabs"
        >
          <Tabs.List className="request-section-tabs" aria-label="Request settings">
            {requestSections.map(({ id, label, icon: Icon }) => (
              <Tabs.Trigger key={id} value={id}>
                <Icon size={13} aria-hidden="true" />
                {label}
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
              <ParamsEditor
                variables={variables}
                scopeName={
                  environment?.id === "none"
                    ? "Workspace"
                    : (environment?.name ?? "Workspace")
                }
                disabled={tab.running}
                onChange={(key, value) => {
                  if (!environment) return;
                  setEnvironmentVariable(environment.id, key, value);
                }}
              />
            </Tabs.Content>
            <Tabs.Content value="authorization">
              <AuthorizationEditor />
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
                    : `${watchedMethod} request body göndermez. Body için POST, PUT, PATCH veya DELETE seçin.`
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
          responsePlacement === "vertical" ? "horizontal" : "vertical"
        }
        aria-label="Request ve response alanlarını yeniden boyutlandır"
        aria-valuemin={24}
        aria-valuemax={72}
        aria-valuenow={Math.round(responseSize)}
      >
        <span />
      </div>
      <ResponsePanel tab={tab} />
    </main>
  );
}
