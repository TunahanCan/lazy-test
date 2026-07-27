import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Braces,
  Check,
  Clipboard,
  FileCode2,
  FileJson2,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  compareJSON,
  formatJSON,
  inferJSONSchema,
  javaDTOToJSONExample,
  minifyJSON,
  queryJSONPath,
  sortJSON,
  type JSONDifference,
} from "../lib/developerTools";
import { cn } from "../lib/utils";
import { Button } from "./ui";

type JSONMode = "format" | "diff" | "query" | "schema" | "dto";

const modes: Array<{
  id: JSONMode;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: "format", label: "Formatter", icon: Braces },
  { id: "diff", label: "Diff", icon: ArrowLeftRight },
  { id: "query", label: "JSONPath", icon: Search },
  { id: "schema", label: "Schema", icon: FileJson2 },
  { id: "dto", label: "Java DTO → JSON", icon: FileCode2 },
];

function printable(value: unknown): string {
  if (value === undefined) return "—";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function DifferenceList({ items }: { items: JSONDifference[] }) {
  if (items.length === 0) {
    return (
      <div className="tool-success-card" role="status">
        <Check size={17} />
        <span>JSON içerikleri seçilen ignore kurallarıyla aynı.</span>
      </div>
    );
  }
  return (
    <div className="json-difference-list" aria-label="JSON farkları">
      {items.map((item, index) => (
        <article className={cn("json-difference", item.kind)} key={`${item.path}-${index}`}>
          <header>
            <code>{item.path}</code>
            <span>{item.kind}</span>
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
  const [mode, setMode] = useState<JSONMode>("format");
  const [input, setInput] = useState("");
  const [compareInput, setCompareInput] = useState("");
  const [ignorePaths, setIgnorePaths] = useState("$.traceId\n$.timestamp");
  const [path, setPath] = useState("$");
  const [result, setResult] = useState("");
  const [differences, setDifferences] = useState<JSONDifference[] | null>(null);
  const [notice, setNotice] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  const inputSize = useMemo(
    () => new Blob([input]).size,
    [input],
  );

  const run = (operation: () => string, success: string) => {
    try {
      setResult(operation());
      setNotice({ tone: "success", text: success });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const copyResult = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setNotice({ tone: "success", text: "Sonuç panoya kopyalandı." });
    } catch {
      setNotice({ tone: "error", text: "Pano kullanılamadı." });
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
        text: next.length === 0 ? "Fark bulunamadı." : `${next.length} fark bulundu.`,
      });
    } catch (error) {
      setDifferences(null);
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const query = () =>
    run(() => JSON.stringify(queryJSONPath(input, path), null, 2), "JSONPath sonucu hazır.");

  return (
    <section className="tool-page" aria-labelledby="json-lab-title">
      <header className="tool-page-header">
        <div>
          <span className="tool-eyebrow">LOCAL · READ ONLY</span>
          <h1 id="json-lab-title">JSON Lab</h1>
          <p>
            JSON verisini biçimlendirin, karşılaştırın, sorgulayın; schema veya
            Java response DTO’dan mock örneği çıkarın.
          </p>
        </div>
        <div className="tool-header-meta">
          <strong>{inputSize.toLocaleString("tr-TR")} B</strong>
          <span>İçerik cihazdan çıkmaz</span>
        </div>
      </header>

      <nav className="tool-tabs" aria-label="JSON araçları">
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={cn(mode === id && "active")}
            onClick={() => {
              setMode(id);
              setResult("");
              setDifferences(null);
              setNotice(null);
            }}
            aria-current={mode === id ? "page" : undefined}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </nav>

      {notice && (
        <div className={cn("tool-notice", notice.tone)} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.text}
        </div>
      )}

      <div className={cn("json-lab-grid", mode === "diff" && "json-diff-mode")}>
        <div className="tool-editor-card">
          <div className="tool-card-header">
            <div>
              <strong>
                {mode === "diff"
                  ? "A · Kaynak"
                  : mode === "dto"
                    ? "Java response DTO"
                    : "JSON input"}
              </strong>
              <span>
                {mode === "dto"
                  ? "Record veya field içeren class yapıştırın"
                  : "JSON yapıştırın veya yazın"}
              </span>
            </div>
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
              <Trash2 size={13} /> Temizle
            </Button>
          </div>
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
            aria-label={mode === "dto" ? "Java response DTO" : "JSON input"}
          />
          {mode === "format" && (
            <div className="tool-card-actions">
              <Button variant="primary" onClick={() => run(() => formatJSON(input), "JSON formatlandı.")}>
                <Sparkles size={14} /> Format
              </Button>
              <Button onClick={() => run(() => minifyJSON(input), "JSON küçültüldü.")}>
                Minify
              </Button>
              <Button onClick={() => run(() => sortJSON(input), "JSON anahtarları sıralandı.")}>
                Anahtarları sırala
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
                <Search size={14} /> Sorgula
              </Button>
            </div>
          )}
          {mode === "schema" && (
            <div className="tool-card-actions">
              <Button
                variant="primary"
                onClick={() => run(() => inferJSONSchema(input), "JSON Schema oluşturuldu.")}
              >
                <FileJson2 size={14} /> Schema oluştur
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
                    "Response DTO’dan mock JSON örneği oluşturuldu.",
                  )
                }
              >
                <FileCode2 size={14} /> Mock JSON oluştur
              </Button>
              <span>Çıktıyı bir mock route body’sine kopyalayabilirsiniz.</span>
            </div>
          )}
        </div>

        {mode === "diff" ? (
          <div className="tool-editor-card">
            <div className="tool-card-header">
              <div>
                <strong>B · Karşılaştırılan</strong>
                <span>Değişiklikleri A ile karşılaştırın</span>
              </div>
            </div>
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
              aria-label="Karşılaştırılacak JSON"
            />
            <div className="tool-diff-options">
              <label>
                Ignore JSONPath’leri
                <textarea
                  value={ignorePaths}
                  onChange={(event) => {
                    setIgnorePaths(event.target.value);
                    setDifferences(null);
                    setNotice(null);
                  }}
                  aria-label="Yok sayılacak JSONPath ifadeleri"
                />
              </label>
              <Button variant="primary" onClick={compare}>
                <ArrowLeftRight size={14} /> Karşılaştır
              </Button>
            </div>
          </div>
        ) : (
          <div className="tool-editor-card result-card">
            <div className="tool-card-header">
              <div>
                <strong>Sonuç</strong>
                <span>İşlem sonucu burada görünür</span>
              </div>
              <Button size="sm" variant="ghost" disabled={!result} onClick={() => void copyResult()}>
                <Clipboard size={13} /> Kopyala
              </Button>
            </div>
            {result ? (
              <textarea className="tool-code-input" value={result} readOnly aria-label="JSON işlem sonucu" />
            ) : (
              <div className="tool-empty-result">
                <Braces size={24} />
                <strong>Henüz sonuç yok</strong>
                <span>Soldaki işlemlerden birini çalıştırın.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {mode === "diff" && differences && <DifferenceList items={differences} />}
    </section>
  );
}
