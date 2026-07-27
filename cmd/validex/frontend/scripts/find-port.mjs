import { createServer } from "node:net";

const preferredPort = Number.parseInt(process.argv[2] ?? "34116", 10);
const maximumAttempts = 100;

if (
  !Number.isInteger(preferredPort) ||
  preferredPort < 1 ||
  preferredPort > 65_535
) {
  throw new Error(`Invalid preferred port: ${process.argv[2] ?? ""}`);
}

function isAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.listen(
      {
        host: "127.0.0.1",
        port,
        exclusive: true,
      },
      () => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(true);
        });
      },
    );
  });
}

let selectedPort;
for (
  let candidate = preferredPort;
  candidate <= 65_535 && candidate < preferredPort + maximumAttempts;
  candidate += 1
) {
  if (await isAvailable(candidate)) {
    selectedPort = candidate;
    break;
  }
}

if (!selectedPort) {
  throw new Error(
    `No free development port found from ${preferredPort} ` +
      `through ${Math.min(65_535, preferredPort + maximumAttempts - 1)}`,
  );
}

process.stdout.write(String(selectedPort));
