"use client";

import { useState, useTransition } from "react";
import { TextAction } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Tone = "danger" | "accent" | "muted";

/**
 * Drop-in replacement for `<form action={x}><input type="hidden" .../>
 * <TextAction type="submit">Label</TextAction></form>` for actions that
 * change or remove something — first click reveals an inline "Sure? Yes /
 * Cancel" rather than submitting immediately, and surfaces the result (or
 * any thrown error) as a toast instead of leaving the user guessing
 * whether anything happened.
 *
 * `typeToConfirm` raises the bar for actions destructive enough that a
 * misclick shouldn't be enough — "Yes" stays disabled until the exact text
 * (e.g. the record's name) is retyped, the same pattern GitHub uses for repo
 * deletion.
 */
export function ConfirmSubmitButton({
  action,
  fields,
  label,
  confirmLabel = "Sure?",
  typeToConfirm,
  successMessage,
  tone = "danger",
  onSuccess,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  label: React.ReactNode;
  confirmLabel?: string;
  /** Exact text the user must retype before "Yes" becomes clickable. */
  typeToConfirm?: string;
  successMessage?: string;
  tone?: Tone;
  onSuccess?: () => void;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function cancel() {
    setConfirming(false);
    setTypedValue("");
  }

  function submit() {
    startTransition(async () => {
      const formData = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        formData.set(key, value);
      }
      try {
        await action(formData);
        if (successMessage) toast(successMessage, "success");
        onSuccess?.();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Something went wrong.", "error");
      } finally {
        setConfirming(false);
        setTypedValue("");
      }
    });
  }

  if (confirming && typeToConfirm) {
    const matches = typedValue === typeToConfirm;
    return (
      <div className="flex flex-col items-end gap-1.5">
        <span className="text-xs text-muted">{confirmLabel}</span>
        <span className="text-xs text-muted">
          Type <span className="font-mono font-semibold text-foreground">{typeToConfirm}</span> to
          confirm.
        </span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            autoFocus
            className="w-40 rounded-md border border-surface-border bg-surface px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <TextAction
            type="button"
            tone={tone}
            onClick={submit}
            loading={isPending}
            disabled={!matches}
          >
            Yes
          </TextAction>
          <TextAction type="button" tone="muted" onClick={cancel}>
            Cancel
          </TextAction>
        </div>
      </div>
    );
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-muted">{confirmLabel}</span>
        <TextAction type="button" tone={tone} onClick={submit} loading={isPending}>
          Yes
        </TextAction>
        <TextAction type="button" tone="muted" onClick={cancel}>
          Cancel
        </TextAction>
      </span>
    );
  }

  return (
    <TextAction
      type="button"
      tone={tone}
      className={className}
      onClick={() => setConfirming(true)}
    >
      {label}
    </TextAction>
  );
}
