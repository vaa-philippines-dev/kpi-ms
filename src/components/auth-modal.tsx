"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, X } from "lucide-react";
import { GoogleIcon } from "@/components/icons/google-icon";
import { LogoBadge } from "@/components/logo-badge";
import { signInWithGoogle } from "@/app/sign-in/actions";

function GoogleSignInButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-border bg-background px-5 py-2.5 text-sm font-medium transition hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
      Continue with Google
    </button>
  );
}

export function AuthModal({
  open,
  onClose = () => {},
  redirectTo = "/dashboard",
}: {
  open: boolean;
  onClose?: () => void;
  redirectTo?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-modal-pop relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface p-8 text-center shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-muted transition hover:text-foreground"
        >
          <X className="size-4" />
        </button>
        <div className="flex justify-center">
          <LogoBadge className="h-10 w-auto" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight">
          KPI Dashboard
        </h2>
        <p className="mt-2 text-sm text-muted">
          Sign in with the Google account your admin added for you to continue.
        </p>
        <form action={signInWithGoogle.bind(null, redirectTo)} className="mt-8">
          <GoogleSignInButton />
        </form>
        <p className="mt-4 text-xs text-muted">
          Problems? contact{" "}
          <a
            href="mailto:business-support@vaaphilippines.com"
            className="text-accent hover:underline"
          >
            business-support@vaaphilippines.com
          </a>
        </p>
      </div>
    </div>
  );
}
