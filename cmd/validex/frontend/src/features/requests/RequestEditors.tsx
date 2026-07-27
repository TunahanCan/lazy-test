import { lazy, Suspense, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { UseFormRegister } from "react-hook-form";
import { useResolvedTheme } from "../../app/useResolvedTheme";
import {
  useTranslation,
  type TranslationKey,
} from "../../i18n";
import { HTTP_METHODS } from "../../lib/http";
import type { RequestFormValues } from "../../lib/schemas";
import { isSecretKey } from "../../lib/secrets";
import type { HTTPMethod } from "../../lib/types";
import {
  addURLQueryRow,
  removeURLQueryRow,
  updateURLQueryRow,
  type URLQueryRow,
} from "../../lib/urlQuery";
import { Button, IconButton, MethodBadge } from "../../shared/ui";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((module) => ({ default: module.default })),
);

function sourceLabelKey(
  source: RequestFormValues["headers"][number]["source"],
): TranslationKey {
  switch (source) {
    case "OpenAPI":
      return "requests.editor.source.openapi";
    case "Environment":
      return "requests.editor.source.environment";
    case "Extracted":
      return "requests.editor.source.extracted";
    case "Generated":
      return "requests.editor.source.generated";
    case "Manual":
    default:
      return "requests.editor.source.manual";
  }
}

export function MethodSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: HTTPMethod;
  onChange: (method: HTTPMethod) => void;
  disabled?: boolean;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState("");
  const filtered = HTTP_METHODS.filter((method) =>
    method.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <DropdownMenu.Root onOpenChange={(open) => !open && setQuery("")}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="method-select"
          aria-label={t("requests.editor.method.select")}
          disabled={disabled}
        >
          <MethodBadge method={value} />
          <ChevronDown size={13} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu method-menu"
          align="start"
          sideOffset={5}
        >
          <div
            className="menu-search"
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Search size={14} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("requests.editor.method.search")}
              aria-label={t("requests.editor.method.search")}
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

export function QueryParamsEditor({
  rawURL,
  rows,
  onURLChange,
  disabled = false,
}: {
  rawURL: string;
  rows: URLQueryRow[];
  onURLChange: (url: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslation();
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addError, setAddError] = useState<TranslationKey | "">("");

  const addParameter = () => {
    if (!newKey) {
      setAddError("requests.editor.query.nameRequired");
      return;
    }
    onURLChange(
      addURLQueryRow(rawURL, {
        key: newKey,
        value: newValue,
      }),
    );
    setAdding(false);
    setNewKey("");
    setNewValue("");
    setAddError("");
  };

  return (
    <section
      className="query-params-editor"
      aria-label={t("requests.editor.query.label")}
    >
      <div className="table-toolbar">
        <div>
          <strong>{t("requests.editor.query.title")}</strong>
          <span>{t("requests.editor.query.description")}</span>
        </div>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => {
            setAdding(true);
            setAddError("");
          }}
        >
          <Plus size={13} /> {t("requests.editor.query.add")}
        </Button>
      </div>
      <div className="query-param-table">
        <div className="query-param-row query-param-heading">
          <span>{t("requests.editor.column.key")}</span>
          <span>{t("requests.editor.column.value")}</span>
          <span>{t("requests.editor.column.source")}</span>
          <span />
        </div>
        {rows.map((row) => (
          <div className="query-param-row" key={row.id}>
            <input
              value={row.key}
              onChange={(event) =>
                onURLChange(
                  updateURLQueryRow(rawURL, row.index, {
                    key: event.target.value,
                  }),
                )
              }
              aria-label={t("requests.editor.query.nameAt", {
                index: row.index + 1,
              })}
              disabled={disabled}
            />
            <input
              value={row.value}
              onChange={(event) =>
                onURLChange(
                  updateURLQueryRow(rawURL, row.index, {
                    value: event.target.value,
                  }),
                )
              }
              aria-label={t("requests.editor.query.valueAt", {
                index: row.index + 1,
              })}
              disabled={disabled}
            />
            <span className="source-badge">
              {t("requests.editor.query.detected")}
            </span>
            <IconButton
              label={t("requests.editor.query.deleteAt", {
                index: row.index + 1,
              })}
              disabled={disabled}
              onClick={() =>
                onURLChange(removeURLQueryRow(rawURL, row.index))
              }
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))}
        {rows.length === 0 && !adding && (
          <p className="query-param-empty">
            {t("requests.editor.query.empty")}
          </p>
        )}
        {adding && (
          <div className="variable-composer query-param-composer">
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
                  addParameter();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setAdding(false);
                }
              }}
              placeholder={t("requests.editor.query.namePlaceholder")}
              aria-label={t("requests.editor.query.newName")}
            />
            <input
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addParameter();
                }
              }}
              placeholder={t("requests.editor.column.value")}
              aria-label={t("requests.editor.query.newValue")}
            />
            <Button size="sm" variant="primary" onClick={addParameter}>
              {t("requests.editor.query.confirmAdd")}
            </Button>
            <IconButton
              label={t("requests.editor.query.cancelAdd")}
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
            {t(addError)}
          </p>
        )}
      </div>
    </section>
  );
}

export function ParamsEditor({
  variables,
  overriddenKeys,
  scopeName,
  onChange,
  onRemove,
  disabled = false,
}: {
  variables: Record<string, string>;
  overriddenKeys: ReadonlySet<string>;
  scopeName: string;
  onChange: (key: string, value: string) => void;
  onRemove: (key: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslation();
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addError, setAddError] = useState<TranslationKey | "">("");
  const rows = Object.entries(variables).map(([key, value]) => ({
    key,
    value,
    secret: isSecretKey(key),
    source: overriddenKeys.has(key)
      ? t("requests.editor.source.override", { scope: scopeName })
      : t("requests.editor.source.default"),
    removable: overriddenKeys.has(key),
  }));
  const addVariable = () => {
    const key = newKey.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) {
      setAddError("requests.editor.variables.invalidName");
      return;
    }
    if (Object.hasOwn(variables, key)) {
      setAddError("requests.editor.variables.duplicate");
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
          <strong>
            {t("requests.editor.variables.title", { scope: scopeName })}
          </strong>
          <span>{t("requests.editor.variables.description")}</span>
        </div>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => {
            setAdding(true);
            setAddError("");
          }}
        >
          <Plus size={13} /> {t("requests.editor.variables.add")}
        </Button>
      </div>
      <div className="parameter-table">
        <div className="parameter-row parameter-header">
          <span />
          <span>{t("requests.editor.column.key")}</span>
          <span>{t("requests.editor.column.value")}</span>
          <span>{t("requests.editor.column.type")}</span>
          <span>{t("requests.editor.column.source")}</span>
          <span />
        </div>
        {rows.map((row) => (
          <div className="parameter-row" key={row.key}>
            {row.removable ? (
              <IconButton
                label={t("requests.editor.variables.removeOverride", {
                  key: row.key,
                })}
                disabled={disabled}
                onClick={() => onRemove(row.key)}
              >
                <Trash2 size={13} />
              </IconButton>
            ) : (
              <span title={t("requests.editor.variables.environmentDefault")}>
                —
              </span>
            )}
            <input
              value={row.key}
              readOnly
              aria-label={t("requests.editor.variables.name", {
                key: row.key,
              })}
            />
            <input
              type={row.secret ? "password" : "text"}
              value={row.value}
              onChange={(event) => onChange(row.key, event.target.value)}
              aria-label={t("requests.editor.variables.value", {
                key: row.key,
              })}
              className={row.secret ? "secret-value" : ""}
              disabled={disabled}
            />
            <span>
              {row.secret
                ? t("requests.editor.type.secret")
                : t("requests.editor.type.string")}
            </span>
            <span className="source-badge">{row.source}</span>
            <span />
          </div>
        ))}
        {rows.length === 0 && (
          <p className="context-note">
            {t("requests.editor.variables.empty")}
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
              placeholder={t("requests.editor.variables.namePlaceholder")}
              aria-label={t("requests.editor.variables.newName")}
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
              placeholder={t("requests.editor.column.value")}
              aria-label={t("requests.editor.variables.newValue")}
            />
            <Button size="sm" variant="primary" onClick={addVariable}>
              {t("requests.editor.variables.confirmAdd")}
            </Button>
            <IconButton
              label={t("requests.editor.variables.cancelAdd")}
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
            {t(addError)}
          </p>
        )}
      </div>
    </div>
  );
}

export function HeadersEditor({
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
  register: UseFormRegister<RequestFormValues>;
  remove: (index: number) => void;
  append: (value: RequestFormValues["headers"][number]) => void;
  sync: () => void;
  disabled?: boolean;
}) {
  const t = useTranslation();

  return (
    <div className="parameter-editor">
      <div className="table-toolbar">
        <div>
          <strong>{t("requests.editor.headers.title")}</strong>
          <span>{t("requests.editor.headers.description")}</span>
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
          <Plus size={13} /> {t("requests.editor.headers.add")}
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
          <span>{t("requests.response.header")}</span>
          <span>{t("requests.editor.column.value")}</span>
          <span>{t("requests.editor.column.source")}</span>
          <span />
        </div>
        {fields.map((field, index) => (
          <div className="header-row" key={field.id}>
            <input
              type="checkbox"
              {...register(`headers.${index}.enabled`)}
              onBlur={sync}
              disabled={disabled}
              aria-label={t("requests.editor.headers.enabledAt", {
                index: index + 1,
              })}
            />
            <input
              list="header-suggestions"
              {...register(`headers.${index}.key`)}
              placeholder={t("requests.editor.headers.namePlaceholder")}
              onBlur={sync}
              disabled={disabled}
              aria-label={t("requests.editor.headers.nameAt", {
                index: index + 1,
              })}
            />
            <input
              {...register(`headers.${index}.value`)}
              placeholder={t("requests.editor.headers.valuePlaceholder")}
              onBlur={sync}
              disabled={disabled}
              aria-label={t("requests.editor.headers.valueAt", {
                index: index + 1,
              })}
            />
            <span className="source-badge">
              {t(sourceLabelKey(field.source))}
            </span>
            <IconButton
              label={t("requests.editor.headers.delete")}
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
        {fields.length === 0 && (
          <p className="header-empty">
            {t("requests.editor.headers.empty")}
          </p>
        )}
      </div>
    </div>
  );
}

export function BodyEditor({
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
  const t = useTranslation();
  const resolvedTheme = useResolvedTheme();
  const [jsonError, setJSONError] = useState<TranslationKey | "">("");
  const format = () => {
    try {
      const formatted = JSON.stringify(JSON.parse(value || "{}"), null, 2);
      onChange(formatted);
      setJSONError("");
    } catch {
      setJSONError("requests.editor.body.invalidJSON");
    }
  };
  return (
    <div className="body-editor">
      <div className="body-toolbar">
        <div className="body-types">
          <strong>{t("requests.editor.body.title")}</strong>
        </div>
        <div>
          <button type="button" onClick={format} disabled={disabled}>
            <Sparkles size={14} /> {t("requests.editor.body.format")}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              try {
                onChange(JSON.stringify(JSON.parse(value)));
                setJSONError("");
              } catch {
                setJSONError("requests.editor.body.minifyFailed");
              }
            }}
          >
            {t("requests.editor.body.minify")}
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
          <AlertCircle size={14} /> {t(jsonError)}
        </div>
      )}
      <Suspense
        fallback={
          <div className="editor-loading">
            {t("requests.editor.body.loading")}
          </div>
        }
      >
        <MonacoEditor
          height="100%"
          language="json"
          value={value}
          onChange={(next) => onChange(next ?? "")}
          theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
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
