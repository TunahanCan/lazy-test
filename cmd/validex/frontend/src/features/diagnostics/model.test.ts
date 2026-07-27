import { describe, expect, it } from "vitest";
import {
  translate,
  type Locale,
  type TranslationKey,
} from "../../i18n";
import type { Translate } from "../../i18n/LocaleProvider";
import { resultIssue } from "./model";

const translator = (locale: Locale): Translate =>
  (key, values) => translate(locale, key, values);

const diagnosticsCases: ReadonlyArray<{
  code: string;
  message: TranslationKey;
  hint: TranslationKey;
}> = [
  {
    code: "invalid_input",
    message: "diagnostics.error.invalidInputMessage",
    hint: "diagnostics.error.invalidInputHint",
  },
  {
    code: "unsafe_method",
    message: "diagnostics.error.unsafeMethodMessage",
    hint: "diagnostics.error.unsafeMethodHint",
  },
  {
    code: "request_failed",
    message: "diagnostics.error.requestFailedMessage",
    hint: "diagnostics.error.requestFailedHint",
  },
  {
    code: "response_too_large",
    message: "diagnostics.error.responseTooLargeMessage",
    hint: "diagnostics.error.responseTooLargeHint",
  },
  {
    code: "invalid_response",
    message: "diagnostics.error.invalidResponseMessage",
    hint: "diagnostics.error.invalidResponseHint",
  },
  {
    code: "limit_exceeded",
    message: "diagnostics.error.limitExceededMessage",
    hint: "diagnostics.error.limitExceededHint",
  },
  {
    code: "diagnostic_failed",
    message: "diagnostics.error.diagnosticFailedMessage",
    hint: "diagnostics.error.operationHint",
  },
  {
    code: "coverage_spec_missing",
    message: "diagnostics.error.coverageSpecMissingMessage",
    hint: "diagnostics.error.coverageSpecMissingHint",
  },
];

describe.each(["en", "tr"] as const)("resultIssue (%s)", (locale) => {
  it.each(diagnosticsCases)(
    "maps $code to the locale catalog and keeps backend text technical",
    ({ code, message, hint }) => {
      const t = translator(locale);
      const issue = resultIssue(
        {
          error: {
            code,
            title: "RAW backend title",
            message: "RAW backend message",
            hint: "RAW backend hint",
            technical: "raw stack",
          },
        },
        t,
      );

      expect(issue).toEqual({
        tone: "error",
        title: t("diagnostics.error.operationTitle"),
        text: t(message),
        hint: t(hint),
        technical:
          "RAW backend title · RAW backend message · RAW backend hint · raw stack",
      });
    },
  );

  it("maps backend_unavailable without exposing backend display text", () => {
    const t = translator(locale);
    const issue = resultIssue(
      {
        error: {
          code: "backend_unavailable",
          title: "RAW bridge title",
          message: "RAW bridge message",
          hint: "RAW bridge hint",
          technical: "raw bridge stack",
        },
      },
      t,
    );

    expect(issue).toEqual({
      tone: "error",
      title: t("diagnostics.error.bridgeTitle"),
      text: t("diagnostics.error.operationMessage"),
      hint: t("diagnostics.error.bridgeHint"),
      technical:
        "RAW bridge title · RAW bridge message · RAW bridge hint · raw bridge stack",
    });
  });

  it("uses a localized fallback for unknown structured codes", () => {
    const t = translator(locale);
    const issue = resultIssue(
      {
        error: {
          code: "future_diagnostics_error",
          title: "RAW future title",
          message: "RAW future message",
          hint: "RAW future hint",
        },
      },
      t,
    );

    expect(issue).toEqual({
      tone: "error",
      title: t("diagnostics.error.operationTitle"),
      text: t("diagnostics.error.operationMessage"),
      hint: t("diagnostics.error.operationHint"),
      technical: "RAW future title · RAW future message · RAW future hint",
    });
  });
});
