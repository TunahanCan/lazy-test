import type { UserError } from "../../lib/types";
import type { Locale, TranslationKey } from "../../i18n";
import type { Translate } from "../../i18n/LocaleProvider";

export interface ProtocolIssue {
  title: string;
  message: string;
  hint?: string;
  technical?: string;
}

interface TranslatedProtocolError {
  title: TranslationKey;
  message: TranslationKey;
  hint?: TranslationKey;
}

const translatedProtocolErrors: Readonly<
  Record<string, TranslatedProtocolError>
> = {
  backend_unavailable: {
    title: "protocol.error.bridgeTitle",
    message: "protocol.error.bridgeMessage",
    hint: "protocol.error.bridgeHint",
  },
  sse_failed: {
    title: "protocol.error.sseFailedTitle",
    message: "protocol.error.sseFailedMessage",
    hint: "protocol.error.operationHint",
  },
  tool_timeout: {
    title: "protocol.error.toolTimeoutTitle",
    message: "protocol.error.toolTimeoutMessage",
    hint: "protocol.error.operationHint",
  },
  tool_canceled: {
    title: "protocol.error.toolCanceledTitle",
    message: "protocol.error.toolCanceledMessage",
  },
  invalid_input: {
    title: "protocol.error.invalidInputTitle",
    message: "protocol.error.invalidInputMessage",
    hint: "protocol.error.operationHint",
  },
};

let protocolOperationSequence = 0;

function structuredErrorDetails(error: Partial<UserError>): string | undefined {
  const details = [error.title, error.message, error.hint, error.technical]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  return details || undefined;
}

export function createOperationID(): string {
  protocolOperationSequence += 1;
  return `protocol-sse-${Date.now().toString(36)}-${protocolOperationSequence.toString(36)}`;
}

export function parseStringMap(
  raw: string,
  label: string,
  t: Translate,
): Record<string, string> {
  const source = raw.trim();
  if (!source) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(t("protocol.validation.json", { label }));
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(t("protocol.validation.object", { label }));
  }

  const entries = Object.entries(parsed);
  for (const [key, value] of entries) {
    if (!key.trim()) {
      throw new Error(t("protocol.validation.emptyKey", { label }));
    }
    if (typeof value !== "string") {
      throw new Error(t("protocol.validation.textValue", { key, label }));
    }
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

export function positiveInteger(
  raw: string,
  label: string,
  maximum: number,
  t: Translate,
  locale: Locale,
): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(
      t("protocol.validation.integer", {
        label,
        maximum: maximum.toLocaleString(locale),
      }),
    );
  }
  return value;
}

export function timeoutMilliseconds(
  raw: string,
  t: Translate,
  locale: Locale,
): number {
  return positiveInteger(
    raw,
    t("protocol.label.timeout"),
    600,
    t,
    locale,
  ) * 1_000;
}

export function validateURL(
  raw: string,
  protocols: string[],
  label: string,
  t: Translate,
): string {
  const value = raw.trim();
  if (!value) throw new Error(t("protocol.validation.required", { label }));

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(t("protocol.validation.invalid", { label }));
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(
      t("protocol.validation.protocol", {
        label,
        protocols: protocols.join(t("protocol.validation.or")),
      }),
    );
  }
  if (!parsed.hostname) {
    throw new Error(t("protocol.validation.hostname", { label }));
  }
  return value;
}

export function usesSecureProtocol(
  raw: string,
  protocol: "https:",
): boolean {
  try {
    return new URL(raw.trim()).protocol === protocol;
  } catch {
    return false;
  }
}

export function issueFrom(
  value: unknown,
  t: Translate,
  bridgeFailure = false,
): ProtocolIssue {
  if (value instanceof Error) {
    if (bridgeFailure) {
      return {
        title: t("protocol.error.bridgeTitle"),
        message: t("protocol.error.bridgeMessage"),
        hint: t("protocol.error.bridgeHint"),
        technical: value.message,
      };
    }
    return {
      title: t("protocol.error.connectionTitle"),
      message: value.message,
    };
  }
  if (value && typeof value === "object") {
    const error = value as Partial<UserError>;
    const translated = error.code
      ? translatedProtocolErrors[error.code]
      : undefined;
    if (translated) {
      return {
        title: t(translated.title),
        message: t(translated.message),
        hint: translated.hint ? t(translated.hint) : undefined,
        technical: structuredErrorDetails(error),
      };
    }
    return {
      title: t("protocol.error.connectionTitle"),
      message: t("protocol.error.operationMessage"),
      hint: t("protocol.error.operationHint"),
      technical: structuredErrorDetails(error),
    };
  }
  return {
    title: t("protocol.error.connectionTitle"),
    message: typeof value === "string" ? value : t("protocol.error.unknown"),
  };
}

export function durationLabel(
  durationMs: number,
  locale: Locale,
  t: Translate,
): string {
  if (!Number.isFinite(durationMs)) return "—";
  if (durationMs < 1_000) return `${Math.max(0, Math.round(durationMs))} ms`;
  return `${(durationMs / 1_000).toLocaleString(locale, {
    maximumFractionDigits: 2,
  })} ${t("protocol.unit.seconds")}`;
}
