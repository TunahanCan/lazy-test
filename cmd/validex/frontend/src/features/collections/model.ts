import type { HTTPMethod, KeyValue, RequestTab } from "../../lib/types";

export const COLLECTION_NAME_LENGTH_LIMITS = [1, 80] as const;
export const SAVED_REQUEST_NAME_LENGTH_LIMITS = [1, 120] as const;

export type NameLengthLimits =
  | typeof COLLECTION_NAME_LENGTH_LIMITS
  | typeof SAVED_REQUEST_NAME_LENGTH_LIMITS;

export interface RequestCollection {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sortOrder: number;
}

export interface SavedRequest {
  id: string;
  collectionId: string;
  name: string;
  method: HTTPMethod;
  url: string;
  headers: KeyValue[];
  body: string;
  createdAt: string;
  updatedAt: string;
  sortOrder: number;
}

export type SavedRequestSnapshot = Pick<
  RequestTab,
  "name" | "method" | "url" | "headers" | "body"
>;

export type OpenRequestSnapshot = SavedRequestSnapshot &
  Required<Pick<RequestTab, "savedRequestId" | "collectionId">>;

export function normalizedLibraryName(
  value: string,
  limits: NameLengthLimits,
): string | undefined {
  const normalized = value.trim().replace(/\s+/g, " ");
  const [minimum, maximum] = limits;
  if (normalized.length < minimum || normalized.length > maximum) {
    return undefined;
  }
  return normalized;
}

export function cloneRequestHeaders(
  headers: readonly KeyValue[],
): KeyValue[] {
  return headers.map((header) => ({ ...header }));
}

export function createOpenRequestSnapshot(
  request: SavedRequest,
): OpenRequestSnapshot {
  return {
    savedRequestId: request.id,
    collectionId: request.collectionId,
    name: request.name,
    method: request.method,
    url: request.url,
    headers: cloneRequestHeaders(request.headers),
    body: request.body,
  };
}

export function bySortOrder<
  T extends Pick<RequestCollection | SavedRequest, "sortOrder" | "createdAt">,
>(left: T, right: T): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.createdAt.localeCompare(right.createdAt)
  );
}
