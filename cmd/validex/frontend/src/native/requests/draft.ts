import type {
  KeyValue,
  RequestTab,
} from "../../lib/types.js";

export interface RequestDraft {
  method: RequestTab["method"];
  url: string;
  body: string;
  headers: KeyValue[];
}

export type RequestDraftField = keyof RequestDraft;

export function cloneRequestDraft(
  source: Pick<RequestTab, RequestDraftField> | RequestDraft,
): RequestDraft {
  return {
    method: source.method,
    url: source.url,
    body: source.body,
    headers: source.headers.map((header) => ({ ...header })),
  };
}

export function requestDraftMatchesTab(
  draft: RequestDraft,
  tab: Pick<RequestTab, RequestDraftField>,
): boolean {
  return (
    draft.method === tab.method &&
    draft.url === tab.url &&
    draft.body === tab.body &&
    JSON.stringify(draft.headers) === JSON.stringify(tab.headers)
  );
}

export function requestDraftPatchForFields(
  draft: RequestDraft,
  tab: Pick<RequestTab, RequestDraftField>,
  fields: ReadonlySet<RequestDraftField>,
): Partial<RequestDraft> | undefined {
  const patch: Partial<RequestDraft> = {};
  if (fields.has("method") && draft.method !== tab.method) {
    patch.method = draft.method;
  }
  if (fields.has("url") && draft.url !== tab.url) {
    patch.url = draft.url;
  }
  if (fields.has("body") && draft.body !== tab.body) {
    patch.body = draft.body;
  }
  if (
    fields.has("headers") &&
    JSON.stringify(draft.headers) !== JSON.stringify(tab.headers)
  ) {
    patch.headers = draft.headers.map((header) => ({ ...header }));
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}

export function isValidRequestVariableName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name);
}
