import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n";
import { Button } from "./core";

export function CopyButton({
  value,
  label,
  copiedLabel,
  size = "sm",
  variant = "ghost",
  disabled = false,
  onError,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  onError?: () => void;
}) {
  const t = useTranslation();
  const [copied, setCopied] = useState(false);
  const resolvedLabel = label ?? t("common.copy");
  const resolvedCopiedLabel = copiedLabel ?? t("common.copied");

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1_600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      onError?.();
    }
  };

  return (
    <Button
      size={size}
      variant={variant}
      disabled={disabled || !value}
      onClick={() => void copy()}
      aria-live="polite"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? resolvedCopiedLabel : resolvedLabel}
    </Button>
  );
}
