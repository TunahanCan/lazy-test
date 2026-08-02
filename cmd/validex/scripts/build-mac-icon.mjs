#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const applicationRoot = resolve(dirname(scriptPath), "..");

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function currentIcon(sourceHash, output, markerPath) {
  try {
    const [outputContent, marker] = await Promise.all([
      readFile(output),
      readFile(markerPath, "utf8").then(JSON.parse),
    ]);
    return (
      marker.schema === 1 &&
      marker.sourceSHA256 === sourceHash &&
      marker.outputSHA256 === sha256(outputContent)
    );
  } catch {
    return false;
  }
}

export async function buildMacIcon(root = applicationRoot) {
  if (process.platform !== "darwin") return undefined;

  const buildRoot = join(resolve(root), "build");
  const source = join(buildRoot, "appicon.png");
  const output = join(buildRoot, "Validex.icns");
  const markerPath = join(buildRoot, ".validex-mac-icon.json");

  const sourceInformation = await stat(source);
  if (!sourceInformation.isFile()) {
    throw new Error(`Validex icon source is not a file: ${source}`);
  }
  const sourceHash = sha256(await readFile(source));
  if (await currentIcon(sourceHash, output, markerPath)) return output;
  await mkdir(buildRoot, { recursive: true });
  const temporaryRoot = await mkdtemp(
    join(buildRoot, ".validex-icon-"),
  );
  const iconset = join(temporaryRoot, "Validex.iconset");
  const temporaryOutput = join(temporaryRoot, "Validex.icns");
  await mkdir(iconset);

  try {
    for (const [pixels, filename] of [
      [16, "icon_16x16.png"],
      [32, "icon_16x16@2x.png"],
      [32, "icon_32x32.png"],
      [64, "icon_32x32@2x.png"],
      [128, "icon_128x128.png"],
      [256, "icon_128x128@2x.png"],
      [256, "icon_256x256.png"],
      [512, "icon_256x256@2x.png"],
      [512, "icon_512x512.png"],
    ]) {
      execFileSync(
        "sips",
        [
          "-z",
          String(pixels),
          String(pixels),
          source,
          "--out",
          join(iconset, filename),
        ],
        { stdio: "ignore" },
      );
    }
    await copyFile(source, join(iconset, "icon_512x512@2x.png"));
    execFileSync(
      "iconutil",
      ["-c", "icns", iconset, "-o", temporaryOutput],
      { stdio: "inherit" },
    );
    const outputHash = sha256(await readFile(temporaryOutput));
    await rename(temporaryOutput, output);
    await writeFile(
      markerPath,
      `${JSON.stringify(
        {
          outputSHA256: outputHash,
          schema: 1,
          sourceSHA256: sourceHash,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
  return output;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === scriptPath) {
  await buildMacIcon();
}
