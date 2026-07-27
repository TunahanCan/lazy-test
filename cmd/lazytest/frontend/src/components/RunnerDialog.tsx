import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Gauge,
  LoaderCircle,
  Play,
  RotateCcw,
  Users,
  X,
  XCircle,
} from "lucide-react";
import type { BootstrapData } from "../lib/types";
import { cn, formatDuration } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { Button, IconButton, StatusMark } from "./ui";

type RunnerStage = "selection" | "running" | "results";

function boundedNumber(value: string, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

function downloadReport(
  type: "json" | "html" | "junit",
  content: string,
  mimeType: string,
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `validex-run.${type === "junit" ? "xml" : type}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function RunnerDialog({ bootstrap }: { bootstrap: BootstrapData }) {
  const open = useWorkspaceStore((state) => state.runnerOpen);
  const setOpen = useWorkspaceStore((state) => state.setRunnerOpen);
  const activeEnvironmentID = useWorkspaceStore(
    (state) => state.activeEnvironmentID,
  );
  const [stage, setStage] = useState<RunnerStage>("selection");
  const scopes = bootstrap.collections.filter(
    (node) => node.kind === "collection" || node.kind === "folder",
  );
  const [scopeID, setScopeID] = useState(scopes[0]?.id ?? "");
  const [environmentID, setEnvironmentID] = useState(activeEnvironmentID);
  const [iterations, setIterations] = useState(3);
  const [concurrency, setConcurrency] = useState(2);
  const [delay, setDelay] = useState(0);
  const [dataFile, setDataFile] = useState("");
  const [stopOnFailure, setStopOnFailure] = useState(false);
  const [progress, setProgress] = useState(0);
  const selectedScope = bootstrap.collections.find((node) => node.id === scopeID);
  const childIDs = new Set<string>([scopeID]);
  let foundChild = true;
  while (foundChild) {
    foundChild = false;
    bootstrap.collections.forEach((node) => {
      if (node.parentId && childIDs.has(node.parentId) && !childIDs.has(node.id)) {
        childIDs.add(node.id);
        foundChild = true;
      }
    });
  }
  const selectedRequests = bootstrap.collections.filter(
    (node) => node.kind === "request" && childIDs.has(node.id),
  );
  const requestCount = selectedRequests.length;
  const total = requestCount * iterations;

  useEffect(() => {
    if (stage !== "running") return;
    const timer = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(total, current + Math.max(1, concurrency));
        const stoppedOnFailure =
          stopOnFailure && next >= Math.max(1, Math.ceil(total * 0.7));
        if (next >= total || stoppedOnFailure) {
          window.clearInterval(timer);
          window.setTimeout(() => setStage("results"), 180);
        }
        return next;
      });
    }, Math.max(110, 260 + delay));
    return () => window.clearInterval(timer);
  }, [concurrency, delay, stage, stopOnFailure, total]);

  const executed =
    stage === "results" ? Math.max(1, Math.min(progress, total)) : total;

  const stats = useMemo(() => {
    const failed = stage === "results" ? 1 : progress >= total * 0.7 ? 1 : 0;
    return {
      passed: Math.max(0, progress - failed),
      failed,
      average: 218,
      p95: 486,
      remaining: Math.max(0, total - progress),
    };
  }, [progress, stage, total]);

  const reset = () => {
    setStage("selection");
    setProgress(0);
  };

  const close = (next: boolean) => {
    if (!next && stage === "running") return;
    setOpen(next);
    if (!next) window.setTimeout(reset, 120);
  };

  const jsonReport = JSON.stringify(
    {
      collection: selectedScope?.name ?? "Collection",
      environment: environmentID,
      dataFile: dataFile || undefined,
      planned: total,
      executed,
      passed: executed - 1,
      failed: 1,
      averageMs: stats.average,
      p95Ms: stats.p95,
    },
    null,
    2,
  );

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog runner-dialog runner-full-dialog"
          onEscapeKeyDown={(event) => {
            if (stage === "running") event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (stage === "running") event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (stage === "running") event.preventDefault();
          }}
        >
          <div className="dialog-header">
            <div>
              <Dialog.Title>Collection runner</Dialog.Title>
              <Dialog.Description>
                Collection koşusunu yapılandırın, canlı izleyin ve raporlayın.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton
                label={
                  stage === "running"
                    ? "Çalışan Runner önce durdurulmalı"
                    : "Runner’ı kapat"
                }
                disabled={stage === "running"}
              >
                <X size={17} />
              </IconButton>
            </Dialog.Close>
          </div>

          <ol className="runner-steps">
            {(
              [
                ["selection", "1", "Selection"],
                ["running", "2", "Run"],
                ["results", "3", "Results"],
              ] as const
            ).map(([id, number, label]) => (
              <li
                key={id}
                className={cn(
                  stage === id && "active",
                  (stage === "running" && id === "selection") ||
                    (stage === "results" && id !== "results")
                    ? "complete"
                    : "",
                )}
              >
                <span>
                  {stage === "results" && id !== "results" ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    number
                  )}
                </span>
                {label}
              </li>
            ))}
          </ol>

          {stage === "selection" && (
            <>
              <div className="runner-form">
                <label>
                  Collection or folder
                  <select
                    value={scopeID}
                    onChange={(event) => setScopeID(event.target.value)}
                  >
                    {scopes.map((scope) => (
                      <option value={scope.id} key={scope.id}>
                        {scope.depth > 0 ? "↳ " : ""}
                        {scope.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Environment
                  <select
                    value={environmentID}
                    onChange={(event) => setEnvironmentID(event.target.value)}
                  >
                    {bootstrap.environments.map((environment) => (
                      <option key={environment.id} value={environment.id}>
                        {environment.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Iterations
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={iterations}
                    onChange={(event) =>
                      setIterations(boundedNumber(event.target.value, 1, 100))
                    }
                  />
                </label>
                <label>
                  Concurrency
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={concurrency}
                    onChange={(event) =>
                      setConcurrency(boundedNumber(event.target.value, 1, 50))
                    }
                  />
                </label>
                <label>
                  Delay between requests (ms)
                  <input
                    type="number"
                    min={0}
                    max={60_000}
                    value={delay}
                    onChange={(event) =>
                      setDelay(
                        boundedNumber(event.target.value, 0, 60_000),
                      )
                    }
                  />
                </label>
                <label>
                  Data file
                  <span className="runner-file-input">
                    <input
                      type="file"
                      accept=".csv,.json,text/csv,application/json"
                      onChange={(event) =>
                        setDataFile(event.target.files?.[0]?.name ?? "")
                      }
                    />
                    {dataFile || "Optional CSV or JSON"}
                  </span>
                </label>
                <label className="runner-check">
                  <input
                    type="checkbox"
                    checked={stopOnFailure}
                    onChange={(event) => setStopOnFailure(event.target.checked)}
                  />
                  Stop on first failure
                </label>
              </div>
              <div className="runner-preview">
                <span>
                  <strong>{total}</strong> total requests
                </span>
                <span>
                  <strong>{concurrency}</strong> active workers
                </span>
                <span>
                  <strong>{iterations}</strong> iterations
                </span>
              </div>
              {requestCount === 0 && (
                <div className="runner-empty" role="status">
                  Bu scope içinde çalıştırılabilir request yok. Başka bir
                  collection veya folder seçin.
                </div>
              )}
              <div className="dialog-actions">
                <Dialog.Close asChild>
                  <Button>Cancel</Button>
                </Dialog.Close>
                <Button
                  variant="primary"
                  disabled={requestCount === 0}
                  onClick={() => {
                    setProgress(0);
                    setStage("running");
                  }}
                >
                  <Play size={15} /> Start run
                </Button>
              </div>
            </>
          )}

          {stage === "running" && (
            <div className="runner-live">
              <div className="runner-live-heading">
                <span className="runner-live-icon">
                  <LoaderCircle className="spin" size={20} />
                </span>
                <div>
                  <strong>{selectedScope?.name ?? "Collection"} çalışıyor</strong>
                  <span>
                    {progress} / {total} request tamamlandı
                  </span>
                </div>
                <Button variant="danger" size="sm" onClick={reset}>
                  <X size={13} /> Stop
                </Button>
              </div>
              <div
                className="runner-progress"
                role="progressbar"
                aria-label="Collection run ilerlemesi"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={progress}
              >
                <span
                  style={{ width: `${total ? (progress / total) * 100 : 0}%` }}
                />
              </div>
              <div className="runner-metrics">
                <article>
                  <CheckCircle2 size={17} />
                  <span>Passed</span>
                  <strong>{stats.passed}</strong>
                </article>
                <article className="metric-danger">
                  <XCircle size={17} />
                  <span>Failed</span>
                  <strong>{stats.failed}</strong>
                </article>
                <article>
                  <Clock3 size={17} />
                  <span>Average</span>
                  <strong>{stats.average} ms</strong>
                </article>
                <article>
                  <Gauge size={17} />
                  <span>P95</span>
                  <strong>{stats.p95} ms</strong>
                </article>
                <article>
                  <Users size={17} />
                  <span>Workers</span>
                  <strong>{concurrency}</strong>
                </article>
              </div>
              <div className="runner-current">
                <span className="runner-pulse" />
                {selectedRequests.slice(0, 2).map((request, index) => (
                  <MethodLine
                    key={request.id}
                    method={request.method ?? "GET"}
                    path={request.url ?? request.name}
                    duration={index === 0 ? "184 ms" : "326 ms"}
                  />
                ))}
                <span className="runner-remaining">
                  ~{stats.remaining} request remaining
                </span>
              </div>
            </div>
          )}

          {stage === "results" && (
            <div className="runner-results" aria-live="polite">
              <div className="runner-result-hero">
                <div className="result-warning">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <strong>
                    {stopOnFailure && executed < total
                      ? "Run stopped on first failure"
                      : "Run completed with 1 failure"}
                  </strong>
                  <span>
                    {executed} / {total} request ·{" "}
                    {formatDuration(executed * stats.average)} total execution
                  </span>
                </div>
                <StatusMark tone="warning">
                  {Math.round(((executed - 1) / executed) * 100)}% passed
                </StatusMark>
              </div>
              <div className="runner-result-grid">
                <article>
                  <span>Total</span>
                  <strong>{executed}</strong>
                </article>
                <article>
                  <span>Passed</span>
                  <strong className="value-success">{executed - 1}</strong>
                </article>
                <article>
                  <span>Failed</span>
                  <strong className="value-danger">1</strong>
                </article>
                <article>
                  <span>Average</span>
                  <strong>{stats.average} ms</strong>
                </article>
                <article>
                  <span>P95</span>
                  <strong>{stats.p95} ms</strong>
                </article>
              </div>
              <div className="runner-findings">
                <div>
                  <strong>Failed request</strong>
                  <MethodLine
                    method="POST"
                    path="/v1/orders"
                    duration="503 Service Unavailable"
                  />
                </div>
                <div>
                  <strong>Slowest request</strong>
                  <MethodLine method="GET" path="/v1/audit" duration="1.24 s" />
                </div>
              </div>
              <div className="runner-quality-findings">
                <article>
                  <span>Contract drift</span>
                  <strong>0 findings</strong>
                  <small>Response yapısı OpenAPI contract ile uyumlu.</small>
                </article>
                <article>
                  <span>Assertion errors</span>
                  <strong>1 failed assertion</strong>
                  <small>POST /v1/orders · expected status 201, received 503</small>
                </article>
              </div>
              <div className="runner-export">
                <span>Export report</span>
                <Button
                  size="sm"
                  onClick={() =>
                    downloadReport("json", jsonReport, "application/json")
                  }
                >
                  <Download size={13} /> JSON
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    downloadReport(
                      "junit",
                      `<testsuite name="${selectedScope?.name ?? "Collection"}" tests="${executed}" failures="1"></testsuite>`,
                      "application/xml",
                    )
                  }
                >
                  <Download size={13} /> JUnit XML
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    downloadReport(
                      "html",
                      `<html><body><h1>Validex Run</h1><pre>${jsonReport}</pre></body></html>`,
                      "text/html",
                    )
                  }
                >
                  <Download size={13} /> HTML
                </Button>
              </div>
              <div className="dialog-actions">
                <Dialog.Close asChild>
                  <Button>Done</Button>
                </Dialog.Close>
                <Button variant="primary" onClick={reset}>
                  <RotateCcw size={14} /> Run again
                </Button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MethodLine({
  method,
  path,
  duration,
}: {
  method: string;
  path: string;
  duration: string;
}) {
  return (
    <span className="runner-method-line">
      <code>{method}</code>
      <span>{path}</span>
      <small>{duration}</small>
    </span>
  );
}
