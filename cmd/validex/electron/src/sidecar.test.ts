import { deepStrictEqual, rejects } from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { SidecarClient } from "./sidecar";

function fixturePath(): string {
  return join(__dirname, "test-backend.js");
}

test("sidecar client exchanges framed JSON results and errors", async () => {
  const client = new SidecarClient();
  await client.start(process.execPath, [fixturePath()]);

  deepStrictEqual(await client.invoke("Echo", [{ ok: true }]), {
    method: "Echo",
    args: [{ ok: true }],
  });
  await rejects(client.invoke("Fail", []), /fixture failure/);
  deepStrictEqual(await client.invoke("Chunked", []), {
    value: "x".repeat(512 * 1024),
  });

  await client.shutdown();
});

test("sidecar client bounds concurrent, cancellation, and serial requests", async () => {
  const client = new SidecarClient();
  await client.start(process.execPath, [fixturePath()]);

  const concurrent = Array.from({ length: 16 }, () =>
    client.invoke("Hold", []).catch((error: unknown) => error),
  );
  await rejects(
    client.invoke("Hold", []),
    /concurrent request limit of 16 is full/,
  );

  const cancellations = Array.from({ length: 8 }, () =>
    client.invoke("CancelRequest", ["request"]).catch(
      (error: unknown) => error,
    ),
  );
  await rejects(
    client.invoke("CancelRequest", ["request"]),
    /cancellation request limit of 8 is full/,
  );

  const serial = Array.from({ length: 128 }, () =>
    client.invoke("SaveCollectionLibrary", ["state"]).catch(
      (error: unknown) => error,
    ),
  );
  await rejects(
    client.invoke("SaveCollectionLibrary", ["state"]),
    /serial request limit of 128 is full/,
  );

  await client.shutdown();
  await Promise.all([...concurrent, ...cancellations, ...serial]);
});

test("sidecar shutdown escalates when the backend ignores SIGTERM", async () => {
  const client = new SidecarClient();
  await client.start(process.execPath, [fixturePath(), "--ignore-shutdown"]);
  await client.invoke("Echo", []);

  await client.shutdown(10);
  await rejects(client.invoke("Echo", []), /not running/);
});
