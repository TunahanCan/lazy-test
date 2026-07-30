import { argv, stdin, stdout } from "node:process";

const frameHeaderBytes = 4;
let input = Buffer.alloc(0);

function writeResponse(response: object, chunkBytes?: number): void {
  const payload = Buffer.from(JSON.stringify(response), "utf8");
  const frame = Buffer.allocUnsafe(frameHeaderBytes + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, frameHeaderBytes);
  if (chunkBytes === undefined) {
    stdout.write(frame);
    return;
  }

  let offset = 0;
  const writeNext = (): void => {
    if (offset >= frame.length) return;
    const end = Math.min(offset + chunkBytes, frame.length);
    const chunk = frame.subarray(offset, end);
    offset = end;
    stdout.write(chunk, () => {
      setImmediate(writeNext);
    });
  };
  writeNext();
}

if (argv.includes("--ignore-shutdown")) {
  process.on("SIGTERM", () => undefined);
  setInterval(() => undefined, 60_000);
}

stdin.on("data", (chunk: Buffer) => {
  input =
    input.length === 0 ? Buffer.from(chunk) : Buffer.concat([input, chunk]);

  while (input.length >= frameHeaderBytes) {
    const payloadBytes = input.readUInt32BE(0);
    if (input.length < frameHeaderBytes + payloadBytes) return;

    const request = JSON.parse(
      input
        .subarray(frameHeaderBytes, frameHeaderBytes + payloadBytes)
        .toString("utf8"),
    ) as { id: string; method: string; args: string };
    input = input.subarray(frameHeaderBytes + payloadBytes);

    if (
      request.method === "Hold" ||
      request.method === "CancelRequest" ||
      request.method === "SaveCollectionLibrary"
    ) {
      continue;
    }
    if (request.method === "Fail") {
      writeResponse({ id: request.id, error: "fixture failure" });
      continue;
    }
    if (request.method === "Chunked") {
      writeResponse(
        {
          id: request.id,
          result: {
            value: "x".repeat(512 * 1024),
          },
        },
        113,
      );
      continue;
    }
    writeResponse({
      id: request.id,
      result: {
        method: request.method,
        args: JSON.parse(request.args) as unknown,
      },
    });
  }
});

stdin.resume();
