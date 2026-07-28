import type {
  RequestCollection,
  SavedRequest,
} from "../collections/model.js";

export const SAVED_COLLECTION_RUNNER_VERSION = 2 as const;

export interface SavedCollectionRunnerHeaderV2 {
  enabled: boolean;
  key: string;
  value: string;
}

export interface SavedCollectionRunnerRequestV2 {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: SavedCollectionRunnerHeaderV2[];
  body: string;
  literalValues: boolean;
}

export interface SavedCollectionRunnerDefinitionV2 {
  version: typeof SAVED_COLLECTION_RUNNER_VERSION;
  name: string;
  requests: SavedCollectionRunnerRequestV2[];
}

/**
 * Anti-corruption layer between the persisted UI collection model and the
 * versioned runner wire contract.
 *
 * Callers provide requests in their logical execution order. Runtime
 * variables deliberately are not accepted here: they travel separately in
 * CollectionRunInput so generated definitions never persist or expose them.
 */
export function savedCollectionRunnerDefinition(
  collection: Pick<RequestCollection, "id" | "name">,
  orderedRequests: readonly SavedRequest[],
): string {
  const definition: SavedCollectionRunnerDefinitionV2 = {
    version: SAVED_COLLECTION_RUNNER_VERSION,
    name: collection.name,
    requests: orderedRequests
      .filter((request) => request.collectionId === collection.id)
      .map((request) => ({
        id: request.id,
        name: request.name,
        method: request.method,
        url: request.url,
        headers: request.headers.map((header) => ({
          enabled: header.enabled,
          key: header.key,
          value: header.value,
        })),
        body: request.body,
        literalValues: request.literalValues === true,
      })),
  };
  return JSON.stringify(definition, null, 2);
}
