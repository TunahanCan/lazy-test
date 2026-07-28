#!/usr/bin/env node

import {
  constants as fileSystemConstants,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import ts from "../third_party/typescript/lib/typescript.js";

const moduleExtensions = new Set([".js", ".mjs"]);
const emittedFileExtensions = new Set([".js", ".mjs", ".map"]);
const reservedOutputNames = new Set(["assets", "index.html", "modules"]);

function usage() {
  return `Usage:
  node scripts/package-typescript.mjs \\
    --emit-dir .typescript-build/esm \\
    --out-dir dist \\
    --entry main.js \\
    --public-dir public \\
    --style src/styles.css

Required:
  --emit-dir <path>   JavaScript module tree emitted by tsc
  --out-dir <path>    Static site output directory

Optional:
  --entry <path>      Entry relative to --emit-dir (default: main.js)
  --public-dir <path> Copy this directory into the artifact root
  --style <path>      Copy a stylesheet; may be repeated
  --title <text>      Document title (default: Validex)
  --lang <tag>        HTML language tag (default: en)
  --root-id <id>      Application mount element ID (default: root)
  --replace           Replace an existing output directory
  --help              Show this help

The emitted module graph must be browser-native and dependency-free: imports
must be relative .js/.mjs paths contained by --emit-dir. Bare package imports
and remote URLs are rejected.`;
}

function valueAfter(argumentsList, index, option) {
  const value = argumentsList[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

export function parseArguments(argumentsList) {
  const options = {
    emitDirectory: "",
    entry: "main.js",
    language: "en",
    outputDirectory: "",
    publicDirectory: "",
    replace: false,
    rootID: "root",
    styles: [],
    title: "Validex",
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    switch (argument) {
      case "--emit-dir":
        options.emitDirectory = valueAfter(argumentsList, index, argument);
        index += 1;
        break;
      case "--out-dir":
        options.outputDirectory = valueAfter(argumentsList, index, argument);
        index += 1;
        break;
      case "--entry":
        options.entry = valueAfter(argumentsList, index, argument);
        index += 1;
        break;
      case "--public-dir":
        options.publicDirectory = valueAfter(argumentsList, index, argument);
        index += 1;
        break;
      case "--style":
        options.styles.push(valueAfter(argumentsList, index, argument));
        index += 1;
        break;
      case "--title":
        options.title = valueAfter(argumentsList, index, argument);
        index += 1;
        break;
      case "--lang":
        options.language = valueAfter(argumentsList, index, argument);
        index += 1;
        break;
      case "--root-id":
        options.rootID = valueAfter(argumentsList, index, argument);
        index += 1;
        break;
      case "--replace":
        options.replace = true;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function isContained(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent !== "" &&
    pathFromParent !== ".." &&
    !pathFromParent.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
    !isAbsolute(pathFromParent);
}

function containedPath(parent, pathWithinParent, label) {
  if (!pathWithinParent || isAbsolute(pathWithinParent)) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
  const candidate = resolve(parent, pathWithinParent);
  if (!isContained(parent, candidate)) {
    throw new Error(`${label} escapes its root: ${pathWithinParent}`);
  }
  return candidate;
}

async function requireDirectory(directory, label) {
  let information;
  try {
    information = await stat(directory);
  } catch {
    throw new Error(`${label} does not exist: ${directory}`);
  }
  if (!information.isDirectory()) {
    throw new Error(`${label} is not a directory: ${directory}`);
  }
}

async function pathExists(path) {
  return Boolean(await pathInformation(path));
}

async function pathInformation(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function requireRegularFile(path, label) {
  const information = await pathInformation(path);
  if (!information) {
    throw new Error(`${label} does not exist: ${path}`);
  }
  if (!information.isFile()) {
    throw new Error(`${label} is not a regular file: ${path}`);
  }
}

function moduleSpecifiers(source, modulePath) {
  const sourceFile = ts.createSourceFile(
    modulePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    const diagnostic = sourceFile.parseDiagnostics[0];
    throw new Error(
      `${modulePath} is not valid JavaScript: ${ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        "\n",
      )}`,
    );
  }

  const specifiers = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) ||
        ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      if (!ts.isStringLiteralLike(node.moduleSpecifier)) {
        throw new Error(
          `${modulePath} contains a non-literal module specifier`,
        );
      }
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const specifier = node.arguments[0];
      if (!specifier || !ts.isStringLiteralLike(specifier)) {
        throw new Error(
          `${modulePath} contains a computed dynamic import`,
        );
      }
      specifiers.push(specifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

function assertSafeBrowserPath(value, label) {
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)) {
    throw new Error(`${label} contains a control character`);
  }
  if (value.includes("%")) {
    throw new Error(`${label} contains percent encoding`);
  }
  if (value.includes("\\")) {
    throw new Error(`${label} contains a backslash`);
  }
  if (value.includes("?") || value.includes("#")) {
    throw new Error(`${label} contains a query or fragment`);
  }
}

function assertModuleURLContained(
  emitRoot,
  modulePath,
  specifier,
) {
  const moduleRelativePath = relative(emitRoot, modulePath)
    .replaceAll("\\", "/");
  const modulesRoot = new URL("https://validex.invalid/modules/");
  const moduleURL = new URL(moduleRelativePath, modulesRoot);
  const importedURL = new URL(specifier, moduleURL);
  if (
    importedURL.origin !== modulesRoot.origin ||
    !importedURL.pathname.startsWith(modulesRoot.pathname)
  ) {
    throw new Error(
      `${modulePath} imports outside the browser module tree: ${specifier}`,
    );
  }
}

function resolvedModuleCandidate(
  emitRoot,
  modulePath,
  specifier,
) {
  assertSafeBrowserPath(
    specifier,
    `${modulePath} import ${JSON.stringify(specifier)}`,
  );
  if (
    !specifier.startsWith("./") &&
    !specifier.startsWith("../")
  ) {
    throw new Error(
      `${modulePath} imports non-local module ${JSON.stringify(specifier)}`,
    );
  }
  if (!moduleExtensions.has(extname(specifier))) {
    throw new Error(
      `${modulePath} must use an explicit .js or .mjs import: ${specifier}`,
    );
  }
  assertModuleURLContained(emitRoot, modulePath, specifier);
  return resolve(dirname(modulePath), specifier);
}

async function emittedFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`symbolic links are not allowed in emitted output: ${entryPath}`);
    }
    if (entry.isDirectory()) {
      files.push(...await emittedFiles(entryPath));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`unsupported emitted filesystem entry: ${entryPath}`);
    }
    if (!emittedFileExtensions.has(extname(entry.name))) {
      throw new Error(`unexpected file in emitted output: ${entryPath}`);
    }
    files.push(entryPath);
  }
  return files;
}

export async function validateEmittedModules(emitDirectory, entry = "main.js") {
  const emitRoot = resolve(emitDirectory);
  await requireDirectory(emitRoot, "emit directory");
  assertSafeBrowserPath(entry, "entry");
  const entryPath = containedPath(emitRoot, entry, "entry");
  assertModuleURLContained(
    emitRoot,
    join(emitRoot, "index.js"),
    `./${entry}`,
  );
  if (!moduleExtensions.has(extname(entryPath))) {
    throw new Error(`entry module does not exist: ${entryPath}`);
  }
  await requireRegularFile(entryPath, "entry module");

  const files = await emittedFiles(emitRoot);
  const moduleFiles = files.filter((file) => moduleExtensions.has(extname(file)));
  if (moduleFiles.length === 0) {
    throw new Error(`emit directory contains no JavaScript modules: ${emitRoot}`);
  }

  for (const modulePath of moduleFiles) {
    const source = await readFile(modulePath, "utf8");
    for (const specifier of moduleSpecifiers(source, modulePath)) {
      const importedPath = resolvedModuleCandidate(
        emitRoot,
        modulePath,
        specifier,
      );
      if (!isContained(emitRoot, importedPath)) {
        throw new Error(`${modulePath} imports outside the emitted tree: ${specifier}`);
      }
      const importedInformation = await pathInformation(importedPath);
      if (!importedInformation) {
        throw new Error(`${modulePath} imports missing module: ${specifier}`);
      }
      if (!importedInformation.isFile()) {
        throw new Error(
          `${modulePath} imports a path that is not a regular file: ${specifier}`,
        );
      }
    }
  }
  return { entryPath, files, moduleFiles };
}

async function copyDirectoryContents(source, destination) {
  await requireDirectory(source, "public directory");
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (reservedOutputNames.has(entry.name.toLowerCase())) {
      throw new Error(`public directory uses reserved output name: ${entry.name}`);
    }
    await validateStaticTree(join(source, entry.name));
    await cp(
      join(source, entry.name),
      join(destination, entry.name),
      {
        errorOnExist: true,
        force: false,
        recursive: true,
        verbatimSymlinks: true,
      },
    );
  }
}

async function validateStaticTree(path) {
  const information = await lstat(path);
  if (information.isSymbolicLink()) {
    throw new Error(`symbolic links are not allowed in public assets: ${path}`);
  }
  if (information.isDirectory()) {
    for (const entry of await readdir(path)) {
      await validateStaticTree(join(path, entry));
    }
    return;
  }
  if (!information.isFile()) {
    throw new Error(`unsupported public filesystem entry: ${path}`);
  }
}

function escapeHTML(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function generatedHTML({
  entry,
  language,
  rootID,
  styles,
  title,
  hasPNGIcon,
  hasSVGIcon,
}) {
  const styleLinks = styles
    .map((style) => `    <link rel="stylesheet" href="./assets/${escapeHTML(style)}" />`)
    .join("\n");
  const iconLinks = [
    hasSVGIcon
      ? '    <link rel="icon" type="image/svg+xml" href="./appicon.svg" />'
      : "",
    hasPNGIcon
      ? '    <link rel="icon" type="image/png" href="./appicon.png" />'
      : "",
  ].filter(Boolean).join("\n");
  const optionalLinks = [iconLinks, styleLinks].filter(Boolean).join("\n");

  return `<!doctype html>
<html lang="${escapeHTML(language)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
${optionalLinks ? `${optionalLinks}\n` : ""}    <title>${escapeHTML(title)}</title>
  </head>
  <body>
    <div id="${escapeHTML(rootID)}"></div>
    <script type="module" src="./modules/${escapeHTML(entry)}"></script>
  </body>
</html>
`;
}

async function assertProductionArtifact(directory) {
  for (const entry of await readdir(directory, {
    withFileTypes: true,
  })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `symbolic links are not allowed in a production artifact: ${path}`,
      );
    }
    if (entry.isDirectory()) {
      await assertProductionArtifact(path);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(
        `unsupported production artifact entry: ${path}`,
      );
    }
    if (entry.name.toLowerCase().endsWith(".map")) {
      throw new Error(
        `production artifact contains a source map: ${path}`,
      );
    }
    if (
      ![".css", ".html", ".js", ".mjs"].includes(
        extname(entry.name).toLowerCase(),
      )
    ) {
      continue;
    }
    const source = await readFile(path, "utf8");
    if (/sourceMappingURL\s*=/i.test(source)) {
      throw new Error(
        `production artifact references a source map: ${path}`,
      );
    }
    if (/window\.__VALIDEX_DEV__\s*=\s*true/.test(source)) {
      throw new Error(
        `production artifact contains the development injection: ${path}`,
      );
    }
  }
}

function normalizedOptions(options) {
  if (!options.emitDirectory) throw new Error("--emit-dir is required");
  if (!options.outputDirectory) throw new Error("--out-dir is required");
  if (!/^[A-Za-z][A-Za-z0-9:_-]*$/.test(options.rootID)) {
    throw new Error("--root-id must be a valid simple HTML id");
  }
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(options.language)) {
    throw new Error("--lang must be a simple BCP 47 language tag");
  }

  const emitDirectory = resolve(options.emitDirectory);
  const outputDirectory = resolve(options.outputDirectory);
  const publicDirectory = options.publicDirectory
    ? resolve(options.publicDirectory)
    : "";
  const styles = options.styles.map((style) => resolve(style));

  for (const protectedPath of [emitDirectory, publicDirectory, ...styles].filter(Boolean)) {
    if (
      outputDirectory === protectedPath ||
      isContained(outputDirectory, protectedPath) ||
      isContained(protectedPath, outputDirectory)
    ) {
      throw new Error(`output directory overlaps an input path: ${protectedPath}`);
    }
  }
  if (outputDirectory === resolve(process.cwd())) {
    throw new Error("output directory must not be the current working directory");
  }

  return {
    ...options,
    emitDirectory,
    outputDirectory,
    publicDirectory,
    production: options.production !== false,
    styles,
  };
}

function safeSwapPaths(stagingDirectory, outputDirectory) {
  const staging = resolve(stagingDirectory);
  const output = resolve(outputDirectory);
  const outputParent = dirname(output);
  const outputName = basename(output);
  if (!outputName || output === outputParent) {
    throw new Error(`refusing to replace an unsafe output path: ${output}`);
  }
  if (
    staging === output ||
    dirname(staging) !== outputParent ||
    !basename(staging).startsWith(`.${outputName}-staging-`)
  ) {
    throw new Error(
      `staging directory must be a dedicated sibling of the output: ${staging}`,
    );
  }
  return {
    backup: join(outputParent, `.${outputName}-backup`),
    output,
    outputName,
    outputParent,
    record: join(outputParent, `.${outputName}-swap.json`),
    staging,
  };
}

async function directoryIdentity(path) {
  const information = await lstat(path, { bigint: true });
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new Error(`swap path is not a regular directory: ${path}`);
  }
  return {
    birthtimeMilliseconds: String(information.birthtimeMs),
    device: String(information.dev),
    inode: String(information.ino),
  };
}

function sameDirectoryIdentity(left, right) {
  return (
    left.birthtimeMilliseconds === right.birthtimeMilliseconds &&
    left.device === right.device &&
    left.inode === right.inode
  );
}

function validDirectoryIdentity(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.birthtimeMilliseconds === "string" &&
    typeof value.device === "string" &&
    typeof value.inode === "string" &&
    /^-?\d+$/.test(value.birthtimeMilliseconds) &&
    /^\d+$/.test(value.device) &&
    /^\d+$/.test(value.inode)
  );
}

async function inspectedSwapDirectory(path, label) {
  const information = await pathInformation(path);
  if (!information) return undefined;
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new Error(`${label} is not a regular directory: ${path}`);
  }
  return {
    identity: await directoryIdentity(path),
    path,
  };
}

async function removeVerifiedSwapDirectory(
  directory,
  expectedIdentity,
  label,
  removeEntry,
) {
  const inspected = await inspectedSwapDirectory(directory, label);
  if (!inspected) return;
  if (!sameDirectoryIdentity(inspected.identity, expectedIdentity)) {
    throw new Error(
      `refusing to clean ${label} because its identity changed: ${directory}`,
    );
  }
  await removeEntry(directory, { force: true, recursive: true });
}

async function readSwapRecord(paths) {
  const information = await pathInformation(paths.record);
  if (!information) return undefined;
  if (
    information.isSymbolicLink() ||
    !information.isFile() ||
    information.size > 16_384
  ) {
    throw new Error(
      `refusing to use an unsafe artifact swap record: ${paths.record}`,
    );
  }
  let record;
  try {
    record = JSON.parse(await readFile(paths.record, "utf8"));
  } catch {
    throw new Error(`artifact swap record is invalid: ${paths.record}`);
  }
  if (
    !record ||
    record.version !== 1 ||
    record.outputName !== paths.outputName ||
    record.backupName !== basename(paths.backup) ||
    typeof record.stagingName !== "string" ||
    basename(record.stagingName) !== record.stagingName ||
    !record.stagingName.startsWith(`.${paths.outputName}-staging-`) ||
    typeof record.transaction !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      record.transaction,
    ) ||
    !validDirectoryIdentity(record.previousIdentity) ||
    !validDirectoryIdentity(record.stagingIdentity)
  ) {
    throw new Error(`artifact swap record is invalid: ${paths.record}`);
  }
  return record;
}

async function removeSwapRecord(paths, removeEntry) {
  const information = await pathInformation(paths.record);
  if (!information) return;
  if (information.isSymbolicLink() || !information.isFile()) {
    throw new Error(
      `refusing to clean an unsafe artifact swap record: ${paths.record}`,
    );
  }
  await removeEntry(paths.record, { force: true });
}

async function recoverInterruptedSwap(
  paths,
  currentStaging,
  { removeEntry, renameEntry },
) {
  const record = await readSwapRecord(paths);
  const backup = await inspectedSwapDirectory(
    paths.backup,
    "artifact backup",
  );
  if (!record) {
    if (backup) {
      throw new Error(
        `refusing to remove an unverified artifact backup: ${paths.backup}`,
      );
    }
    return;
  }
  if (
    backup &&
    !sameDirectoryIdentity(backup.identity, record.previousIdentity)
  ) {
    throw new Error(
      `artifact backup does not match its swap record: ${paths.backup}`,
    );
  }

  let output = await inspectedSwapDirectory(
    paths.output,
    "artifact output",
  );
  if (backup && !output) {
    await renameEntry(paths.backup, paths.output);
    output = await inspectedSwapDirectory(
      paths.output,
      "restored artifact output",
    );
    if (
      !output ||
      !sameDirectoryIdentity(output.identity, record.previousIdentity)
    ) {
      throw new Error(
        `previous artifact restoration could not be verified: ${paths.output}`,
      );
    }
  } else if (backup && output) {
    if (!sameDirectoryIdentity(output.identity, record.stagingIdentity)) {
      throw new Error(
        `artifact output is not the promoted staging directory; backup preserved at ${paths.backup}`,
      );
    }
    await removeVerifiedSwapDirectory(
      paths.backup,
      record.previousIdentity,
      "artifact backup",
      removeEntry,
    );
  } else if (!output) {
    throw new Error(
      `artifact swap record has neither an output nor a backup: ${paths.record}`,
    );
  } else if (
    !sameDirectoryIdentity(output.identity, record.previousIdentity) &&
    !sameDirectoryIdentity(output.identity, record.stagingIdentity)
  ) {
    throw new Error(
      `artifact output does not match its swap record: ${paths.output}`,
    );
  }

  const recordedStaging = join(
    paths.outputParent,
    record.stagingName,
  );
  const orphanedStaging = await inspectedSwapDirectory(
    recordedStaging,
    "recorded staging directory",
  );
  if (orphanedStaging) {
    if (
      !sameDirectoryIdentity(
        orphanedStaging.identity,
        record.stagingIdentity,
      )
    ) {
      throw new Error(
        `recorded staging directory does not match its swap record: ${recordedStaging}`,
      );
    }
    if (recordedStaging !== currentStaging) {
      await removeVerifiedSwapDirectory(
        recordedStaging,
        record.stagingIdentity,
        "recorded staging directory",
        removeEntry,
      );
    }
  }
  await removeSwapRecord(paths, removeEntry);
}

/**
 * Promotes a fully prepared sibling staging directory with rollback and
 * next-run recovery. Portable directory renames cannot provide uninterrupted
 * visibility at the canonical output path, so the verified backup and swap
 * record are retained until promotion succeeds.
 */
export async function commitStagedDirectory(
  stagingDirectory,
  outputDirectory,
  {
    removeEntry = rm,
    renameEntry = rename,
    replace = false,
  } = {},
) {
  const paths = safeSwapPaths(stagingDirectory, outputDirectory);
  const staging = await inspectedSwapDirectory(
    paths.staging,
    "staging path",
  );
  if (!staging) {
    throw new Error(`staging path does not exist: ${paths.staging}`);
  }
  await recoverInterruptedSwap(paths, paths.staging, {
    removeEntry,
    renameEntry,
  });

  const output = await inspectedSwapDirectory(
    paths.output,
    "artifact output",
  );
  if (!output) {
    await renameEntry(paths.staging, paths.output);
    return;
  }
  if (!replace) {
    throw new Error(
      `output directory already exists; pass --replace to replace it: ${paths.output}`,
    );
  }
  const record = {
    backupName: basename(paths.backup),
    outputName: paths.outputName,
    previousIdentity: output.identity,
    stagingIdentity: staging.identity,
    stagingName: basename(paths.staging),
    transaction: randomUUID(),
    version: 1,
  };
  await writeFile(
    paths.record,
    `${JSON.stringify(record)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
  try {
    await renameEntry(paths.output, paths.backup);
    await renameEntry(paths.staging, paths.output);
  } catch (promotionError) {
    try {
      await recoverInterruptedSwap(paths, paths.staging, {
        removeEntry,
        renameEntry,
      });
    } catch (recoveryError) {
      throw new AggregateError(
        [promotionError, recoveryError],
        `artifact promotion failed and automatic recovery failed; backup preserved at ${paths.backup}`,
      );
    }
    throw promotionError;
  }

  await recoverInterruptedSwap(paths, paths.staging, {
    removeEntry,
    renameEntry,
  });
}

export async function packageStaticSite(rawOptions) {
  const options = normalizedOptions(rawOptions);
  const validation = await validateEmittedModules(
    options.emitDirectory,
    options.entry,
  );
  if (await pathExists(options.outputDirectory) && !options.replace) {
    throw new Error(
      `output directory already exists; pass --replace to replace it: ${options.outputDirectory}`,
    );
  }

  const outputParent = dirname(options.outputDirectory);
  await mkdir(outputParent, { recursive: true });
  const stagingDirectory = await mkdtemp(
    join(outputParent, `.${basename(options.outputDirectory)}-staging-`),
  );

  try {
    if (options.publicDirectory) {
      await copyDirectoryContents(options.publicDirectory, stagingDirectory);
    }

    const modulesDirectory = join(stagingDirectory, "modules");
    await mkdir(modulesDirectory);
    for (const emittedFile of validation.files) {
      const destination = containedPath(
        modulesDirectory,
        relative(options.emitDirectory, emittedFile),
        "emitted file",
      );
      await mkdir(dirname(destination), { recursive: true });
      await cp(emittedFile, destination, {
        errorOnExist: true,
        force: false,
      });
    }

    const assetsDirectory = join(stagingDirectory, "assets");
    const styleNames = [];
    if (options.styles.length > 0) {
      await mkdir(assetsDirectory);
    }
    for (const style of options.styles) {
      const information = await stat(style);
      if (!information.isFile()) {
        throw new Error(`stylesheet is not a file: ${style}`);
      }
      const styleName = basename(style);
      if (styleNames.includes(styleName)) {
        throw new Error(`stylesheet basename is duplicated: ${styleName}`);
      }
      styleNames.push(styleName);
      await cp(style, join(assetsDirectory, styleName), {
        errorOnExist: true,
        force: false,
        mode: fileSystemConstants.COPYFILE_EXCL,
      });
    }

    await writeFile(
      join(stagingDirectory, "index.html"),
      generatedHTML({
        entry: options.entry.replaceAll("\\", "/"),
        language: options.language,
        rootID: options.rootID,
        styles: styleNames,
        title: options.title,
        hasPNGIcon: await pathExists(join(stagingDirectory, "appicon.png")),
        hasSVGIcon: await pathExists(join(stagingDirectory, "appicon.svg")),
      }),
      "utf8",
    );

    if (options.production) {
      await assertProductionArtifact(stagingDirectory);
    }

    await commitStagedDirectory(
      stagingDirectory,
      options.outputDirectory,
      { replace: options.replace },
    );
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true });
    throw error;
  }

  return {
    moduleCount: validation.moduleFiles.length,
    outputDirectory: options.outputDirectory,
    styleCount: options.styles.length,
  };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const result = await packageStaticSite(options);
    process.stdout.write(
      `Packaged ${result.moduleCount} modules and ${result.styleCount} styles at ${result.outputDirectory}\n`,
    );
  } catch (error) {
    process.stderr.write(`package-typescript: ${error.message}\n\n${usage()}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  await main();
}
