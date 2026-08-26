import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

const frameHeaderBytes = 4;
const maximumFrameBytes = 64 * 1024 * 1024;
const maximumIDBytes = 256;
const maximumArgumentBytes = 32 * 1024 * 1024;

type AdmissionLane = "concurrent" | "cancellation" | "serial";

const admissionLimits = {
  concurrent: {
    calls: 16,
    argumentBytes: 64 * 1024 * 1024,
  },
  cancellation: {
    calls: 8,
    argumentBytes: 1024 * 1024,
  },
  serial: {
    calls: 128,
    argumentBytes: 64 * 1024 * 1024,
  },
} as const;

const cancellationMethods = new Set([
  "CancelRequest",
  "CancelToolOperation",
]);

const serialMethods = new Set([
  "LoadCollectionLibrary",
  "SaveCollectionLibrary",
]);

interface SidecarRequest {
  id: string;
  method: string;
  args: string;
}

interface SidecarResponse {
  id: string;
  result?: unknown;
  error?: string;
}

interface PendingInvocation {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  lane: AdmissionLane;
  argumentBytes: number;
}

function own(object: object, property: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function asResponse(value: unknown): SidecarResponse {
  if (value === null || typeof value !== "object") {
    throw new Error("backend response must be a JSON object");
  }

  const response = value as Record<string, unknown>;
  if (
    typeof response.id !== "string" ||
    response.id.length === 0 ||
    Buffer.byteLength(response.id, "utf8") > maximumIDBytes
  ) {
    throw new Error("backend response has an invalid id");
  }

  const hasResult = own(response, "result");
  const hasError = own(response, "error");
  if (hasResult === hasError) {
    throw new Error(
      "backend response must contain exactly one of result or error",
    );
  }
  if (hasError && typeof response.error !== "string") {
    throw new Error("backend response error must be a string");
  }

  return response as unknown as SidecarResponse;
}

export class SidecarClient {
  private child: ChildProcessWithoutNullStreams | undefined;
  private readonly frameHeader = Buffer.allocUnsafe(frameHeaderBytes);
  private frameHeaderOffset = 0;
  private framePayload: Buffer | undefined;
  private framePayloadOffset = 0;
  private readonly pending = new Map<string, PendingInvocation>();
  private readonly admittedCalls: Record<AdmissionLane, number> = {
    concurrent: 0,
    cancellation: 0,
    serial: 0,
  };
  private readonly admittedArgumentBytes: Record<AdmissionLane, number> = {
    concurrent: 0,
    cancellation: 0,
    serial: 0,
  };
  private exitPromise: Promise<void> = Promise.resolve();
  private stopped = false;

  async start(executable: string, arguments_: readonly string[] = []): Promise<void> {
    if (this.child !== undefined) {
      throw new Error("Validex backend has already been started");
    }

    const child = spawn(executable, [...arguments_], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    this.stopped = false;
    this.resetFrameDecoder();

    let resolveExit: () => void = () => undefined;
    this.exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });

    child.stdout.on("data", (chunk: Buffer) => {
      this.acceptOutput(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(`[validex-backend] ${chunk.toString("utf8")}`);
    });
    child.stdin.on("error", (error) => {
      this.stopWithError(error);
      child.kill("SIGTERM");
    });

    child.once("exit", (code, signal) => {
      this.stopped = true;
      this.child = undefined;
      this.resetFrameDecoder();
      resolveExit();
      if (this.pending.size > 0) {
        const reason =
          signal !== null
            ? `signal ${signal}`
            : `exit code ${code ?? "unknown"}`;
        this.rejectPending(new Error(`Validex backend stopped (${reason})`));
      }
    });

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", (error) => {
        this.stopped = true;
        this.child = undefined;
        resolveExit();
        this.rejectPending(error);
        reject(
          new Error(
            `Validex backend could not be started at ${executable}: ${error.message}`,
          ),
        );
      });
    });
  }

  invoke(method: string, args: unknown[]): Promise<unknown> {
    const child = this.child;
    if (
      this.stopped ||
      child === undefined ||
      child.stdin.destroyed ||
      !child.stdin.writable
    ) {
      return Promise.reject(new Error("Validex backend is not running"));
    }

    const id = randomUUID();
    let payload: Buffer;
    let encodedArguments: string;
    try {
      encodedArguments = JSON.stringify(args);
      const argumentBytes = Buffer.byteLength(encodedArguments, "utf8");
      if (argumentBytes > maximumArgumentBytes) {
        return Promise.reject(
          new Error(
            `Backend arguments exceed the ${maximumArgumentBytes}-byte limit`,
          ),
        );
      }
      const request: SidecarRequest = {
        id,
        method,
        args: encodedArguments,
      };
      payload = Buffer.from(JSON.stringify(request), "utf8");
    } catch (error) {
      return Promise.reject(
        error instanceof Error
          ? error
          : new Error("Backend request could not be encoded"),
      );
    }

    if (payload.length > maximumFrameBytes) {
      return Promise.reject(
        new Error(
          `Backend request exceeds the ${maximumFrameBytes}-byte frame limit`,
        ),
      );
    }

    const frame = Buffer.allocUnsafe(frameHeaderBytes + payload.length);
    frame.writeUInt32BE(payload.length, 0);
    payload.copy(frame, frameHeaderBytes);

    const argumentBytes = Buffer.byteLength(encodedArguments, "utf8");
    const lane = cancellationMethods.has(method)
      ? "cancellation"
      : serialMethods.has(method)
        ? "serial"
        : "concurrent";
    const admissionError = this.admissionError(lane, argumentBytes);
    if (admissionError !== undefined) {
      return Promise.reject(admissionError);
    }
    this.admittedCalls[lane] += 1;
    this.admittedArgumentBytes[lane] += argumentBytes;

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, lane, argumentBytes });
      try {
        child.stdin.write(frame, (error) => {
          if (error === null || error === undefined) return;
          const invocation = this.takePending(id);
          if (invocation === undefined) return;
          invocation.reject(error);
        });
      } catch (error) {
        this.takePending(id);
        reject(
          error instanceof Error
            ? error
            : new Error("Backend request could not be written"),
        );
      }
    });
  }

  async shutdown(graceMilliseconds = 11_000): Promise<void> {
    const child = this.child;
    if (child === undefined) return;

    if (!child.stdin.destroyed && !child.stdin.writableEnded) {
      child.stdin.end();
    }
    if (await this.waitForExit(graceMilliseconds)) return;

    child.kill("SIGTERM");
    if (await this.waitForExit(1_000)) return;

    child.kill("SIGKILL");
    await this.waitForExit(1_000);
  }

  private async waitForExit(milliseconds: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(false);
      }, milliseconds);
      void this.exitPromise.then(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  private acceptOutput(chunk: Buffer): void {
    if (this.stopped) return;
    let chunkOffset = 0;
    while (chunkOffset < chunk.length) {
      if (this.framePayload === undefined) {
        const copied = chunk.copy(
          this.frameHeader,
          this.frameHeaderOffset,
          chunkOffset,
          chunkOffset + frameHeaderBytes - this.frameHeaderOffset,
        );
        this.frameHeaderOffset += copied;
        chunkOffset += copied;
        if (this.frameHeaderOffset < frameHeaderBytes) return;

        const payloadBytes = this.frameHeader.readUInt32BE(0);
        this.frameHeaderOffset = 0;
        if (payloadBytes === 0 || payloadBytes > maximumFrameBytes) {
          this.protocolFailure(
            new Error(`backend emitted an invalid frame size: ${payloadBytes}`),
          );
          return;
        }
        this.framePayload = Buffer.allocUnsafe(payloadBytes);
        this.framePayloadOffset = 0;
      }

      const payload = this.framePayload;
      const copied = chunk.copy(
        payload,
        this.framePayloadOffset,
        chunkOffset,
        chunkOffset + payload.length - this.framePayloadOffset,
      );
      this.framePayloadOffset += copied;
      chunkOffset += copied;
      if (this.framePayloadOffset < payload.length) continue;

      this.framePayload = undefined;
      this.framePayloadOffset = 0;
      try {
        this.acceptResponse(JSON.parse(payload.toString("utf8")));
      } catch (error) {
        this.protocolFailure(
          error instanceof Error
            ? error
            : new Error("backend emitted an invalid response"),
        );
        return;
      }
    }
  }

  private acceptResponse(value: unknown): void {
    const response = asResponse(value);
    const invocation = this.takePending(response.id);
    if (invocation === undefined) {
      throw new Error(`backend responded with an unknown id: ${response.id}`);
    }

    if (own(response, "error")) {
      invocation.reject(new Error(response.error));
      return;
    }
    invocation.resolve(response.result);
  }

  private protocolFailure(error: Error): void {
    this.stopWithError(new Error(`Validex backend protocol error: ${error.message}`));
    this.child?.kill("SIGTERM");
  }

  private stopWithError(error: Error): void {
    if (this.stopped) return;
    this.stopped = true;
    this.resetFrameDecoder();
    this.rejectPending(error);
  }

  private resetFrameDecoder(): void {
    this.frameHeaderOffset = 0;
    this.framePayload = undefined;
    this.framePayloadOffset = 0;
  }

  private rejectPending(error: Error): void {
    for (const id of [...this.pending.keys()]) {
      const invocation = this.takePending(id);
      if (invocation === undefined) continue;
      invocation.reject(error);
    }
  }

  private admissionError(
    lane: AdmissionLane,
    argumentBytes: number,
  ): Error | undefined {
    const limits = admissionLimits[lane];
    if (this.admittedCalls[lane] >= limits.calls) {
      return new Error(
        `Backend ${lane} request limit of ${limits.calls} is full`,
      );
    }
    if (
      this.admittedArgumentBytes[lane] + argumentBytes >
      limits.argumentBytes
    ) {
      return new Error(
        `Backend ${lane} argument budget of ${limits.argumentBytes} bytes is full`,
      );
    }
    return undefined;
  }

  private takePending(id: string): PendingInvocation | undefined {
    const invocation = this.pending.get(id);
    if (invocation === undefined) return undefined;
    this.pending.delete(id);
    this.admittedCalls[invocation.lane] -= 1;
    this.admittedArgumentBytes[invocation.lane] -=
      invocation.argumentBytes;
    return invocation;
  }
}
