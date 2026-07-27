import { useCallback, useMemo, useState } from "react";
import {
  useTranslation,
  type TranslationKey,
  type TranslationValues,
} from "../../i18n";
import { useImportOpenAPI } from "../../lib/queries";
import type { ImportSpecResult } from "../../lib/types";
import { useWorkspaceStore } from "../../stores/workspace";

export interface OpenAPIImportNotice {
  message: string;
  tone: "success" | "error";
}

interface OpenAPIImportNoticeState {
  key?: TranslationKey;
  values?: TranslationValues;
  literal?: string;
  tone: OpenAPIImportNotice["tone"];
}

export function useOpenAPIImport() {
  const t = useTranslation();
  const { isPending, mutateAsync } = useImportOpenAPI();
  const setImportedSpec = useWorkspaceStore((state) => state.setImportedSpec);
  const [noticeState, setNoticeState] =
    useState<OpenAPIImportNoticeState | null>(null);
  const notice = useMemo<OpenAPIImportNotice | null>(() => {
    if (!noticeState) return null;
    return {
      message: noticeState.key
        ? t(noticeState.key, noticeState.values)
        : (noticeState.literal ?? ""),
      tone: noticeState.tone,
    };
  }, [noticeState, t]);

  const successNotice = useCallback(
    (result: ImportSpecResult): OpenAPIImportNoticeState => {
      const title = result.title || "OpenAPI";
      if (result.endpoints.length === 0) {
        return {
          key: "requests.openapiImport.empty",
          values: { title },
          tone: "error",
        };
      }
      return {
        key:
          result.endpoints.length === 1
            ? "requests.openapiImport.loaded.one"
            : "requests.openapiImport.loaded.many",
        values: { title, count: result.endpoints.length },
        tone: "success",
      };
    },
    [],
  );

  const importErrorNotice = useCallback(
    (
      error: NonNullable<ImportSpecResult["error"]>,
    ): OpenAPIImportNoticeState => {
      switch (error.code) {
        case "backend_unavailable":
        case "runtime_unavailable":
          return {
            key: "requests.openapiImport.runtimeUnavailable",
            tone: "error",
          };
        case "file_dialog_failed":
          return {
            key: "requests.openapiImport.fileDialogFailed",
            tone: "error",
          };
        case "invalid_openapi":
          return {
            key: "requests.openapiImport.invalid",
            tone: "error",
          };
        default:
          return {
            literal: `${error.title}: ${error.message}`,
            tone: "error",
          };
      }
    },
    [],
  );

  const importSpec = useCallback(async (): Promise<
    ImportSpecResult | undefined
  > => {
    setNoticeState(null);
    try {
      const result = await mutateAsync();
      if (result.canceled) return result;
      if (result.error) {
        setNoticeState(importErrorNotice(result.error));
        return result;
      }

      setImportedSpec(result);
      setNoticeState(successNotice(result));
      return result;
    } catch (error) {
      const details =
        error instanceof Error
          ? error.message
          : t("requests.openapiImport.unexpected");
      setNoticeState({
        key: "requests.openapiImport.failed",
        values: { details },
        tone: "error",
      });
      return undefined;
    }
  }, [
    importErrorNotice,
    mutateAsync,
    setImportedSpec,
    successNotice,
    t,
  ]);

  const dismissNotice = useCallback(() => setNoticeState(null), []);

  return {
    dismissNotice,
    importSpec,
    isPending,
    notice,
  };
}
