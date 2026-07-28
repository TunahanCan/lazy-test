import { escapeHTML, trustedHTML, type TrustedHTMLFragment } from "./dom.js";

export type IconName =
  | "activity"
  | "automation"
  | "braces"
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "close"
  | "code"
  | "collection"
  | "copy"
  | "download"
  | "error"
  | "eye"
  | "eye-off"
  | "folder"
  | "folder-open"
  | "history"
  | "import"
  | "info"
  | "language"
  | "menu"
  | "mock"
  | "moon"
  | "more"
  | "panel-left"
  | "panel-right"
  | "pin"
  | "play"
  | "plus"
  | "protocols"
  | "refresh"
  | "request"
  | "save"
  | "search"
  | "settings"
  | "spinner"
  | "stop"
  | "sun"
  | "terminal"
  | "trash"
  | "warning"
  | "workspace";

const paths: Record<IconName, string> = {
  activity:
    '<path d="M3 12h4l2.2-6 4.1 12 2.2-6H21"/><circle cx="12" cy="12" r="9"/>',
  automation:
    '<path d="M5 5h6v6H5zM13 13h6v6h-6zM14 6h5M17 3l3 3-3 3M10 18H5M7 15l-3 3 3 3"/>',
  braces: '<path d="M8 3H6a2 2 0 0 0-2 2v4l-2 3 2 3v4a2 2 0 0 0 2 2h2M16 3h2a2 2 0 0 1 2 2v4l2 3-2 3v4a2 2 0 0 1-2 2h-2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-right": '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  code: '<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>',
  collection:
    '<path d="M4 5h6l2 2h8v12H4z"/><path d="M4 10h16"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>',
  eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  "eye-off": '<path d="M3 3l18 18M10.5 6.2A9.8 9.8 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-2.2 2.8M6.2 6.2C3.5 8 2 12 2 12s4 6 10 6c1.7 0 3.2-.5 4.5-1.2"/>',
  folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
  "folder-open": '<path d="M3 7h7l2 2h9l-2 10H4L2 10h18"/>',
  history: '<path d="M4 4v6h6M5 9a8 8 0 1 1 1 8M12 8v5l3 2"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  language: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  mock: '<rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01M8 17h.01"/>',
  moon: '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  "panel-left": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  "panel-right": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  pin: '<path d="m9 3 6 6M8 8l8 8M6 10l8-6 6 6-6 8-4-4-6 6"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  protocols: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.2 4.2a11 11 0 0 0 0 15.6M19.8 4.2a11 11 0 0 1 0 15.6"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5"/>',
  request: '<path d="M4 12h14M14 7l5 5-5 5"/><rect x="3" y="4" width="18" height="16" rx="2"/>',
  save: '<path d="M4 4h13l3 3v13H4zM8 4v6h8V4M8 20v-6h8v6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  spinner: '<path d="M21 12a9 9 0 0 1-9 9M3 12a9 9 0 0 1 9-9"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 16h4"/>',
  trash: '<path d="M4 7h16M9 3h6l1 4H8zM6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  warning: '<path d="M12 3 2.5 20h19zM12 9v5M12 17h.01"/>',
  workspace: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
};

export function icon(
  name: IconName,
  size = 16,
  className = "",
): TrustedHTMLFragment {
  const safeClass = escapeHTML(className);
  return trustedHTML(
    `<svg class="native-icon ${safeClass}" width="${size}" height="${size}" ` +
      `viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ` +
      `aria-hidden="true" focusable="false">${paths[name]}</svg>`,
  );
}
