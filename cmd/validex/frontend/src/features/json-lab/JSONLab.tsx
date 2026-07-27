import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Braces,
  Check,
  FileCode2,
  FileJson2,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslation } from "../../i18n";
import type { Translate } from "../../i18n/LocaleProvider";
import {
  compareJSON,
  formatJSON,
  inferJSONSchema,
  javaDTOToJSONExample,
  minifyJSON,
  queryJSONPath,
  sortJSON,
  type JSONDifference,
} from "../../lib/developerTools";
import { cn } from "../../lib/utils";
import {
  CopyButton,
  ToolCardHeader,
  ToolNotice,
  ToolPage,
  ToolTabs,
  Button,
} from "../../shared/ui";
import {
  inputGroupForMode,
  type JSONInputGroup,
  type JSONMode,
} from "./model";

function printable(value: unknown): string {
  if (value === undefined) return "—";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function localizedJSONError(error: unknown, t: Translate): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "JSON içeriği boş.") {
    return t("json.error.empty");
  }
  if (message.startsWith("Geçersiz JSON: ")) {
    return t("json.error.invalid", {
      details: message.slice("Geçersiz JSON: ".length),
    });
  }
  if (message === "JSONPath $ ile başlamalıdır.") {
    return t("json.error.pathRoot");
  }
  if (message === "Bu JSONPath ifadesi desteklenmiyor.") {
    return t("json.error.pathUnsupported");
  }
  if (message.endsWith(" için değer bulunamadı.")) {
    return t("json.error.pathMissing", {
      path: message.slice(0, -" için değer bulunamadı.".length),
    });
  }
  if (message === "Java response DTO içeriği boş.") {
    return t("json.error.dtoEmpty");
  }
  if (
    message ===
    "Desteklenen record veya field içeren class bulunamadı."
  ) {
    return t("json.error.dtoUnsupported");
  }
  return message;
}

function DifferenceList({ items }: { items: JSONDifference[] }) {
  const t = useTranslation();
  const kindLabels: Record<JSONDifference["kind"], string> = {
    added: t("json.difference.added"),
    removed: t("json.difference.removed"),
    changed: t("json.difference.changed"),
    type: t("json.difference.type"),
  };
  if (items.length === 0) {
    return (
      <div className="tool-success-card" role="status">
        <Check size={17} />
        <span>{t("json.difference.same")}</span>
      </div>
    );
  }
  return (
    <div
      className="json-difference-list"
      aria-label={t("json.difference.aria")}
    >
      {items.map((item, index) => (
        <article className={cn("json-difference", item.kind)} key={`${item.path}-${index}`}>
          <header>
            <code>{item.path}</code>
            <span>{kindLabels[item.kind]}</span>
          </header>
          <div>
            <code>{printable(item.left)}</code>
            <span>→</span>
            <code>{printable(item.right)}</code>
          </div>
        </article>
      ))}
    </div>
  );
}

export function JSONLab() {
  const t = useTranslation();
  const { locale } = useLocale();
  const jsonLabModes = [
    { id: "format", label: t("json.tab.format"), icon: Braces },
    { id: "diff", label: t("json.tab.diff"), icon: ArrowLeftRight },
    { id: "query", label: t("json.tab.query"), icon: Search },
    { id: "schema", label: t("json.tab.schema"), icon: FileJson2 },
    { id: "dto", label: t("json.tab.dto"), icon: FileCode2 },
  ] as const;
  const [mode, setMode] = useState<JSONMode>("format");
  const [inputs, setInputs] = useState<Record<JSONInputGroup, string>>({
    json: "",
    diff: "",
    dto: "",
  });
  const [compareInput, setCompareInput] = useState("");
  const [ignorePaths, setIgnorePaths] = useState("$.traceId\n$.timestamp");
  const [path, setPath] = useState("$");
  const [result, setResult] = useState("");
  const [differences, setDifferences] = useState<JSONDifference[] | null>(null);
  const [notice, setNotice] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  const inputGroup = inputGroupForMode(mode);
  const input = inputs[inputGroup];
  const inputSize = useMemo(() => new Blob([input]).size, [input]);

  const setInput = (value: string) => {
    setInputs((current) => ({ ...current, [inputGroup]: value }));
  };

  const run = (operation: () => string, success: string) => {
    try {
      setResult(operation());
      setNotice({ tone: "success", text: success });
    } catch (error) {
      setNotice({
        tone: "error",
        text: localizedJSONError(error, t),
      });
    }
  };

  const compare = () => {
    try {
      const ignored = ignorePaths
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      const next = compareJSON(input, compareInput, ignored);
      setDifferences(next);
      setNotice({
        tone: "success",
        text:
          next.length === 0
            ? t("json.notice.noDifference")
            : t("json.notice.differences", { count: next.length }),
      });
    } catch (error) {
      setDifferences(null);
      setNotice({
        tone: "error",
        text: localizedJSONError(error, t),
      });
    }
  };

  const query = () =>
    run(
      () => JSON.stringify(queryJSONPath(input, path), null, 2),
      t("json.notice.queryReady"),
    );

  return (
    <ToolPage
      labelledBy="json-lab-title"
      eyebrow={t("json.eyebrow")}
      title={t("json.title")}
      description={t("json.description")}
      meta={
        <>
          <strong>
            {inputSize.toLocaleString(
              locale === "tr" ? "tr-TR" : "en-US",
            )}{" "}
            B
          </strong>
          <span>{t("json.meta.private")}</span>
        </>
      }
    >
      <ToolTabs
        value={mode}
        tabs={jsonLabModes}
        label={t("json.tabs.label")}
        idBase="json-lab"
        onChange={(nextMode) => {
          setMode(nextMode);
          setResult("");
          setDifferences(null);
          setNotice(null);
        }}
      />

      {notice && (
        <ToolNotice tone={notice.tone}>
          {notice.text}
        </ToolNotice>
      )}

      <div
        className={cn("json-lab-grid", mode === "diff" && "json-diff-mode")}
        id={`json-lab-panel-${mode}`}
        role="tabpanel"
        aria-labelledby={`json-lab-tab-${mode}`}
      >
        <div className="tool-editor-card">
          <ToolCardHeader
            title={
              <>
                {mode === "diff"
                  ? t("json.input.source")
                  : mode === "dto"
                    ? t("json.input.dto")
                    : t("json.input.json")}
              </>
            }
            description={
              <>
                {mode === "dto"
                  ? t("json.input.dtoDescription")
                  : t("json.input.jsonDescription")}
              </>
            }
            actions={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setInput("");
                  setResult("");
                  setDifferences(null);
                  setNotice(null);
                }}
              >
                <Trash2 size={13} /> {t("json.action.clear")}
              </Button>
            }
          />
          <textarea
            className="tool-code-input"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setResult("");
              setDifferences(null);
              setNotice(null);
            }}
            placeholder={
              mode === "dto"
                ? "public record UserResponse(UUID id, String name, boolean active) {}"
                : '{\n  "id": 42,\n  "status": "ACTIVE"\n}'
            }
            spellCheck={false}
            aria-label={
              mode === "dto"
                ? t("json.input.dto")
                : t("json.input.json")
            }
          />
          {mode === "format" && (
            <div className="tool-card-actions">
              <Button
                variant="primary"
                onClick={() =>
                  run(
                    () => formatJSON(input),
                    t("json.notice.formatted"),
                  )
                }
              >
                <Sparkles size={14} /> {t("json.action.format")}
              </Button>
              <Button
                onClick={() =>
                  run(
                    () => minifyJSON(input),
                    t("json.notice.minified"),
                  )
                }
              >
                {t("json.action.minify")}
              </Button>
              <Button
                onClick={() =>
                  run(
                    () => sortJSON(input),
                    t("json.notice.sorted"),
                  )
                }
              >
                {t("json.action.sort")}
              </Button>
            </div>
          )}
          {mode === "query" && (
            <div className="tool-inline-action">
              <label>
                JSONPath
                <input
                  value={path}
                  onChange={(event) => {
                    setPath(event.target.value);
                    setResult("");
                    setNotice(null);
                  }}
                  placeholder="$.users[0].name"
                />
              </label>
              <Button variant="primary" onClick={query}>
                <Search size={14} /> {t("json.action.query")}
              </Button>
            </div>
          )}
          {mode === "schema" && (
            <div className="tool-card-actions">
              <Button
                variant="primary"
                onClick={() =>
                  run(
                    () => inferJSONSchema(input),
                    t("json.notice.schemaCreated"),
                  )
                }
              >
                <FileJson2 size={14} /> {t("json.action.schema")}
              </Button>
            </div>
          )}
          {mode === "dto" && (
            <div className="tool-card-actions">
              <Button
                variant="primary"
                onClick={() =>
                  run(
                    () => javaDTOToJSONExample(input),
                    t("json.notice.dtoCreated"),
                  )
                }
              >
                <FileCode2 size={14} /> {t("json.action.mock")}
              </Button>
              <span>{t("json.dto.hint")}</span>
            </div>
          )}
        </div>

        {mode === "diff" ? (
          <div className="tool-editor-card">
            <ToolCardHeader
              title={t("json.diff.target")}
              description={t("json.diff.targetDescription")}
            />
            <textarea
              className="tool-code-input"
              value={compareInput}
              onChange={(event) => {
                setCompareInput(event.target.value);
                setDifferences(null);
                setNotice(null);
              }}
              placeholder={'{\n  "id": 42,\n  "status": "DISABLED"\n}'}
              spellCheck={false}
              aria-label={t("json.diff.targetAria")}
            />
            <div className="tool-diff-options">
              <label>
                {t("json.diff.ignore")}
                <textarea
                  value={ignorePaths}
                  onChange={(event) => {
                    setIgnorePaths(event.target.value);
                    setDifferences(null);
                    setNotice(null);
                  }}
                  aria-label={t("json.diff.ignoreAria")}
                />
              </label>
              <Button variant="primary" onClick={compare}>
                <ArrowLeftRight size={14} />{" "}
                {t("json.action.compare")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="tool-editor-card result-card">
            <ToolCardHeader
              title={t("json.result.title")}
              description={t("json.result.description")}
              actions={
                <CopyButton
                  value={result}
                  disabled={!result}
                  label={t("json.copy.action")}
                  copiedLabel={t("json.copy.copied")}
                  onError={() =>
                    setNotice({
                      tone: "error",
                      text: t("json.copy.failed"),
                    })
                  }
                />
              }
            />
            {result ? (
              <textarea
                className="tool-code-input"
                value={result}
                readOnly
                aria-label={t("json.result.aria")}
              />
            ) : (
              <div className="tool-empty-result">
                <Braces size={24} />
                <strong>{t("json.result.empty.title")}</strong>
                <span>{t("json.result.empty.description")}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {mode === "diff" && differences && <DifferenceList items={differences} />}
    </ToolPage>
  );
}
