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
 */
export function ConfirmSubmitButton({
  action,
  fields,
  label,
  confirmLabel = "Sure?",
  successMessage,
  tone = "danger",
  onSuccess,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  label: React.ReactNode;
  confirmLabel?: string;
  successMessage?: string;
  tone?: Tone;
  onSuccess?: () => void;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

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
      }
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-muted">{confirmLabel}</span>
        <TextAction type="button" tone={tone} onClick={submit} loading={isPending}>
          Yes
        </TextAction>
        <TextAction type="button" tone="muted" onClick={() => setConfirming(false)}>
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
