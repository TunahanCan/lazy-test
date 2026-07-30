export interface StartupBannerOptions {
  appVersion: string;
  backendName: string;
  chromiumVersion: string;
  electronVersion: string;
  endpoint: string;
  mode: "Development" | "Production";
}

function textWidth(value: string): number {
  return [...value].length;
}

export function startupBanner(options: StartupBannerOptions): string {
  const tagline = "API workbench · Web UI. Go core. Chromium desktop.";
  const details = [
    `Interface  ${options.endpoint}`,
    `Mode       ${options.mode}`,
    `Runtime    Electron ${options.electronVersion} · Chromium ${options.chromiumVersion}`,
    "Frontend   browser-native TypeScript · Node isolated",
    `Backend    ${options.backendName} · Go sidecar`,
    "Transport  secure preload IPC → framed JSON stdio",
  ];
  const status = "● Validex desktop ready";
  const heading = `─ VALIDEX ${options.appVersion} `;
  const contentWidth = Math.max(
    58,
    ...[tagline, ...details, status].map(textWidth),
  );
  const innerWidth = Math.max(contentWidth + 4, textWidth(heading));
  const rowWidth = innerWidth - 4;
  const horizontal = "─".repeat(innerWidth);
  const row = (value: string): string =>
    `│  ${value}${" ".repeat(rowWidth - textWidth(value))}  │`;

  return [
    `╭${heading}${"─".repeat(innerWidth - textWidth(heading))}╮`,
    row(tagline),
    `├${horizontal}┤`,
    ...details.map(row),
    `├${horizontal}┤`,
    row(status),
    `╰${horizontal}╯`,
  ].join("\n");
}
