import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertCircle,
  Braces,
  Check,
  ChevronDown,
  Clipboard,
  Code2,
  Download,
  FileCode2,
  FileText,
  KeyRound,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Variable,
  X,
  Zap,
} from "lucide-react";
import {
  useFieldArray,
  useForm,
  type FieldErrors,
} from "react-hook-form";
import { useCancelRequest, useSendRequest } from "../lib/queries";
import {
  missingVariables,
  requestSchema,
  type RequestFormValues,
} from "../lib/schemas";
import type {
  BootstrapData,
  HTTPMethod,
  RequestTab,
  ResponseEnvelope,
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
  { id: "params", label: "Params", icon: Variable },
  { id: "authorization", label: "Authorization", icon: KeyRound },
  { id: "headers", label: "Headers", icon: FileText },
  { id: "body", label: "Body", icon: Braces },
  { id: "scripts", label: "Scripts", icon: Code2 },
  { id: "assertions", label: "Assertions", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "documentation", label: "Documentation", icon: FileCode2 },
] as const;

function countEnabledHeaders(tab: RequestTab) {
  return tab.headers.filter((header) => header.enabled && header.key).length;
}

function validationMessage(errors: FieldErrors<RequestFormValues>) {
  if (errors.url?.message) return errors.url.message;
  if (errors.method?.message) return errors.method.message;
  return undefined;
}

function MethodSelect({
  value,
  onChange,
}: {
  value: HTTPMethod;
  onChange: (method: HTTPMethod) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = methods.filter((method) =>
    method.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <DropdownMenu.Root onOpenChange={(open) => !open && setQuery("")}>
      <DropdownMenu.Trigger asChild>
        <button className="method-select" aria-label="HTTP method seç">
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
}: {
  variables: Record<string, string>;
}) {
  const rows = Object.entries(variables).map(([key, value], index) => ({
    key,
    value,
    type: key.toLowerCase().includes("token") ? "Secret" : "String",
    source: "Environment",
    enabled: index === 0,
  }));
  return (
    <div className="parameter-editor">
      <div className="table-toolbar">
        <div>
          <strong>Query & path parameters</strong>
          <span>Request URL ile birlikte çözümlenir.</span>
        </div>
        <Button size="sm">
          <Plus size={13} /> Add parameter
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
            <input
              type="checkbox"
              defaultChecked={row.enabled}
              aria-label={`${row.key} parametresini etkinleştir`}
            />
            <input defaultValue={row.key} />
            <input
              defaultValue={
                row.type === "Secret" ? "••••••••••••" : row.value
              }
              className={row.type === "Secret" ? "secret-value" : ""}
            />
            <span>{row.type}</span>
            <span className="source-badge">{row.source}</span>
            <IconButton label={`${row.key} satırını sil`}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))}
        <button className="add-table-row">
          <Plus size={13} /> Add row
        </button>
      </div>
    </div>
  );
}

function AuthorizationEditor() {
  const authMethods = [
    ["No Auth", "Request’e auth bilgisi eklenmez."],
    ["Bearer Token", "Authorization: Bearer header’ı."],
    ["API Key", "Header veya query API key."],
    ["OAuth 2.0", "Adım adım authorization flow."],
    ["Basic Auth", "Kullanıcı adı ve parola."],
    ["mTLS", "Client certificate ile doğrulama."],
  ];
  return (
    <div className="auth-editor">
      <div className="table-toolbar">
        <div>
          <strong>Authorization</strong>
          <span>Secret değerleri varsayılan olarak maskelenir.</span>
        </div>
        <label className="inherit-auth">
          <input type="checkbox" defaultChecked /> Inherit from collection
        </label>
      </div>
      <div className="auth-grid">
        {authMethods.map(([name, description], index) => (
          <button className={cn("auth-card", index === 1 && "selected")} key={name}>
            <span className="auth-card-icon">
              <KeyRound size={17} />
            </span>
            <span>
              <strong>{name}</strong>
              <small>{description}</small>
            </span>
            {index === 1 && <Check size={15} className="auth-check" />}
          </button>
        ))}
      </div>
      <div className="secret-field">
        <label>
          Token
          <input type="password" value="environment-token-reference" readOnly />
        </label>
        <span className="secret-reference">Environment · token</span>
        <Button size="sm">Show</Button>
      </div>
    </div>
  );
}

function HeadersEditor({
  fields,
  register,
  remove,
  append,
  sync,
}: {
  fields: { id: string }[];
  register: ReturnType<typeof useForm<RequestFormValues>>["register"];
  remove: (index: number) => void;
  append: (value: RequestFormValues["headers"][number]) => void;
  sync: () => void;
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
          onClick={() =>
            append({
              id: crypto.randomUUID(),
              enabled: true,
              key: "",
              value: "",
              source: "Manual",
            })
          }
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
            />
            <input
              list="header-suggestions"
              {...register(`headers.${index}.key`)}
              placeholder="Header name"
              onBlur={sync}
            />
            <input
              {...register(`headers.${index}.value`)}
              placeholder="Value or {{variable}}"
              onBlur={sync}
            />
            <span className="source-badge">
              {register(`headers.${index}.source`).name
                ? "Configured"
                : "Manual"}
            </span>
            <IconButton
              label="Header’ı sil"
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
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [bodyType, setBodyType] = useState("JSON");
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
        <div className="body-types" role="tablist" aria-label="Request body type">
          {["None", "JSON", "XML", "Text", "GraphQL", "Form", "Multipart"].map(
            (type) => (
              <button
                key={type}
                className={cn(bodyType === type && "active")}
                onClick={() => setBodyType(type)}
              >
                {type}
              </button>
            ),
          )}
        </div>
        <div>
          <button onClick={format}>
            <Sparkles size={14} /> Format
          </button>
          <button
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
      {jsonError && (
        <div className="inline-error">
          <AlertCircle size={14} /> {jsonError}
        </div>
      )}
      <Suspense fallback={<div className="editor-loading">Editor hazırlanıyor…</div>}>
        <MonacoEditor
          height="100%"
          language={bodyType.toLowerCase()}
          value={bodyType === "None" ? "" : value}
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
            padding: { top: 12, bottom: 12 },
          }}
        />
      </Suspense>
    </div>
  );
}

function EditorEmpty({
  section,
}: {
  section: RequestTab["requestSection"];
}) {
  const content: Record<
    "scripts" | "assertions" | "settings" | "documentation",
    [string, string, string]
  > = {
    scripts: [
      "Request script’i ekleyin",
      "Request öncesi değişken üretin veya response sonrası extraction çalıştırın.",
      "Add script",
    ],
    assertions: [
      "Henüz assertion yok",
      "Status, süre, header veya JSON alanlarını otomatik doğrulayın.",
      "Add assertion",
    ],
    settings: [
      "Request ayarları",
      "Redirect, timeout, SSL validation ve history davranışını yönetin.",
      "Configure",
    ],
    documentation: [
      "Request’i belgelendirin",
      "Ekip arkadaşlarınız için açıklama, örnek ve kullanım notları ekleyin.",
      "Add documentation",
    ],
  };
  const [title, description, action] =
    content[
      section as "scripts" | "assertions" | "settings" | "documentation"
    ];
  return (
    <EmptyState
      icon="new"
      title={title}
      description={description}
      primaryLabel={action}
    />
  );
}

export function RequestWorkbench({
  tab,
  bootstrap,
}: {
  tab: RequestTab;
  bootstrap: BootstrapData;
}) {
  const queryClient = useQueryClient();
  const sendMutation = useSendRequest();
  const cancelMutation = useCancelRequest();
  const updateTab = useWorkspaceStore((state) => state.updateTab);
  const responsePlacement = useWorkspaceStore(
    (state) => state.responsePlacement,
  );
  const responseSize = useWorkspaceStore((state) => state.responseSize);
  const setResponseSize = useWorkspaceStore((state) => state.setResponseSize);
  const environmentID = useWorkspaceStore((state) => state.activeEnvironmentID);
  const setCodeGeneratorOpen = useWorkspaceStore(
    (state) => state.setCodeGeneratorOpen,
  );
  const environment =
    bootstrap.environments.find((item) => item.id === environmentID) ??
    bootstrap.environments[0];

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

  const responseQuery = useQuery<ResponseEnvelope | null>({
    queryKey: ["response", tab.id],
    queryFn: async () => null,
    enabled: false,
    initialData: null,
  });

  const watchedURL = form.watch("url");
  const watchedBody = form.watch("body");
  const unresolved = useMemo(
    () => missingVariables(watchedURL, environment?.variables ?? {}),
    [environment?.variables, watchedURL],
  );
  const urlField = form.register("url");

  const syncHeaders = () => {
    updateTab(tab.id, { headers: form.getValues("headers"), dirty: true });
  };

  const setSection = (section: RequestTab["requestSection"]) =>
    updateTab(tab.id, { requestSection: section });

  const submit = form.handleSubmit(async (values) => {
    updateTab(tab.id, {
      running: true,
      error: false,
      userError: undefined,
      method: values.method,
      url: values.url,
      body: values.body,
      headers: values.headers,
    });
    const result = await sendMutation.mutateAsync({
      id: tab.id,
      name: tab.name,
      method: values.method,
      url: values.url,
      headers: values.headers.map(({ id: _id, ...header }) => header),
      body: values.body,
      variables: environment?.variables ?? {},
      timeoutMs: values.timeoutMs,
      saveHistory: true,
    });
    if (result.response) {
      queryClient.setQueryData(["response", tab.id], result.response);
      updateTab(tab.id, {
        running: false,
        error: false,
        userError: undefined,
        response: result.response,
      });
    } else {
      updateTab(tab.id, {
        running: false,
        error: result.error?.code !== "request_canceled",
        userError: result.error,
      });
    }
  });

  const copyAsCurl = () => {
    const values = form.getValues();
    const headersText = values.headers
      .filter((header) => header.enabled && header.key)
      .map((header) => `-H '${header.key}: ${header.value}'`)
      .join(" ");
    const bodyText = values.body
      ? ` --data '${values.body.replace(/'/g, "'\\''")}'`
      : "";
    void navigator.clipboard?.writeText(
      `curl -X ${values.method} ${headersText}${bodyText} '${values.url}'`,
    );
  };

  const requestCounts = {
    params: Object.keys(environment?.variables ?? {}).length,
    headers: countEnabledHeaders(tab),
    assertions: 0,
  };
  const errorMessage = validationMessage(form.formState.errors);

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
            value={form.watch("method")}
            onChange={(method) => {
              form.setValue("method", method, { shouldValidate: true });
              updateTab(tab.id, { method, dirty: true });
            }}
          />
          <div className={cn("url-field", errorMessage && "invalid")}>
            <input
              {...urlField}
              list="recent-url-list"
              placeholder="https://api.example.com/v1/users or {{baseUrl}}/v1/users"
              spellCheck={false}
              aria-invalid={Boolean(errorMessage)}
              onChange={(event) => {
                void urlField.onChange(event);
                updateTab(tab.id, {
                  url: event.target.value,
                  dirty: true,
                });
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
              onClick={() => void cancelMutation.mutateAsync(tab.id)}
            >
              <X size={15} />
              Cancel
            </Button>
          ) : (
            <div className="send-split">
              <Button type="submit" variant="primary" className="send-button">
                <Send size={15} />
                Send
              </Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="send-dropdown" aria-label="Diğer gönderme seçenekleri">
                    <ChevronDown size={14} />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="menu" align="end" sideOffset={5}>
                    <DropdownMenu.Item
                      className="menu-item"
                      onSelect={() => void submit()}
                    >
                      <Download size={15} /> Send and download
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="menu-item"
                      onSelect={() => void submit()}
                    >
                      <Zap size={15} /> Send without history
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="menu-separator" />
                    <DropdownMenu.Item className="menu-item" onSelect={copyAsCurl}>
                      <Clipboard size={15} /> Copy as cURL
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className="menu-item">
                      <FileCode2 size={15} /> Copy as IntelliJ HTTP request
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
          value={tab.requestSection}
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
                {id === "assertions" && requestCounts.assertions > 0 && (
                  <CountBadge>{requestCounts.assertions}</CountBadge>
                )}
              </Tabs.Trigger>
            ))}
            <button type="button" className="tab-overflow" aria-label="Daha fazla">
              <MoreHorizontal size={15} />
            </button>
          </Tabs.List>
          <div className="request-editor-content">
            <Tabs.Content value="params">
              <ParamsEditor variables={environment?.variables ?? {}} />
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
              />
            </Tabs.Content>
            <Tabs.Content value="body" className="full-height-tab">
              <BodyEditor
                value={watchedBody}
                onChange={(body) => {
                  form.setValue("body", body, { shouldValidate: true });
                  updateTab(tab.id, { body, dirty: true });
                }}
              />
            </Tabs.Content>
            {(["scripts", "assertions", "settings", "documentation"] as const).map(
              (section) => (
                <Tabs.Content value={section} key={section}>
                  <EditorEmpty section={section} />
                </Tabs.Content>
              ),
            )}
          </div>
        </Tabs.Root>
      </form>

      <div
        className="response-resizer"
        onPointerDown={startResponseResize}
        role="separator"
        aria-orientation={
          responsePlacement === "vertical" ? "horizontal" : "vertical"
        }
        aria-label="Request ve response alanlarını yeniden boyutlandır"
      >
        <span />
      </div>
      <ResponsePanel tab={tab} response={responseQuery.data} />
    </main>
  );
}
