import type { Cleanup } from "./dom.js";

export const FEEDBACK_TONE = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
} as const;

export type FeedbackTone =
  (typeof FEEDBACK_TONE)[keyof typeof FEEDBACK_TONE];

export interface FeedbackMessage {
  id: number;
  message: string;
  tone: FeedbackTone;
  durationMs: number;
}

export interface FeedbackInput {
  message: string;
  tone?: FeedbackTone;
  durationMs?: number;
}

type FeedbackListener = (feedback: FeedbackMessage) => void;

const listeners = new Set<FeedbackListener>();
let feedbackSequence = 0;

/**
 * Publishes transient, user-visible application feedback.
 *
 * Domain-specific controllers decide the tone; the mounted presentation layer
 * owns timing, accessibility semantics, and dismissal.
 */
export function notify(input: FeedbackInput | string): void {
  const normalized =
    typeof input === "string"
      ? { message: input }
      : input;
  const message = normalized.message.trim();
  if (!message) return;
  const feedback: FeedbackMessage = {
    id: ++feedbackSequence,
    message,
    tone: normalized.tone ?? FEEDBACK_TONE.INFO,
    durationMs: Math.max(1_500, normalized.durationMs ?? 4_500),
  };
  for (const listener of listeners) listener(feedback);
}

export function subscribeFeedback(listener: FeedbackListener): Cleanup {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
