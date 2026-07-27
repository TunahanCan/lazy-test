import { describe, expect, it } from "vitest";
import {
  translate,
  type Locale,
  type TranslationKey,
} from "../../i18n";
import type { Translate } from "../../i18n/LocaleProvider";
import { issueFrom } from "./model";

const translator = (locale: Locale): Translate =>
  (key, values) => translate(locale, key, values);

const protocolCases: ReadonlyArray<{
  code: string;
  title: TranslationKey;
  message: TranslationKey;
  hint?: TranslationKey;
}> = [
  {
    code: "backend_unavailable",
    title: "protocol.error.bridgeTitle",
    message: "protocol.error.bridgeMessage",
    hint: "protocol.error.bridgeHint",
  },
  {
    code: "sse_failed",
    title: "protocol.error.sseFailedTitle",
    message: "protocol.error.sseFailedMessage",
    hint: "protocol.error.operationHint",
  },
  {
    code: "websocket_failed",
    title: "protocol.error.websocketFailedTitle",
    message: "protocol.error.websocketFailedMessage",
    hint: "protocol.error.operationHint",
  },
  {
    code: "grpc_failed",
    title: "protocol.error.grpcFailedTitle",
    message: "protocol.error.grpcFailedMessage",
    hint: "protocol.error.operationHint",
  },
  {
    code: "tool_timeout",
    title: "protocol.error.toolTimeoutTitle",
    message: "protocol.error.toolTimeoutMessage",
    hint: "protocol.error.operationHint",
  },
  {
    code: "tool_canceled",
    title: "protocol.error.toolCanceledTitle",
    message: "protocol.error.toolCanceledMessage",
  },
  {
    code: "invalid_input",
    title: "protocol.error.invalidInputTitle",
    message: "protocol.error.invalidInputMessage",
    hint: "protocol.error.operationHint",
  },
];

describe.each(["en", "tr"] as const)("issueFrom (%s)", (locale) => {
  it.each(protocolCases)(
    "maps $code to the locale catalog and keeps backend text technical",
    ({ code, title, message, hint }) => {
      const t = translator(locale);
      const issue = issueFrom(
        {
          code,
          title: "RAW backend title",
          message: "RAW backend message",
          hint: "RAW backend hint",
          technical: "raw stack",
        },
        t,
      );

      expect(issue).toEqual({
        title: t(title),
        message: t(message),
        hint: hint ? t(hint) : undefined,
        technical:
          "RAW backend title · RAW backend message · RAW backend hint · raw stack",
      });
    },
  );

  it("uses a localized fallback for unknown structured codes", () => {
    const t = translator(locale);
    const issue = issueFrom(
      {
        code: "future_protocol_error",
        title: "RAW future title",
        message: "RAW future message",
        hint: "RAW future hint",
      },
      t,
    );

    expect(issue.title).toBe(t("protocol.error.connectionTitle"));
    expect(issue.message).toBe(t("protocol.error.operationMessage"));
    expect(issue.hint).toBe(t("protocol.error.operationHint"));
    expect(issue.technical).toBe(
      "RAW future title · RAW future message · RAW future hint",
    );
  });
});
