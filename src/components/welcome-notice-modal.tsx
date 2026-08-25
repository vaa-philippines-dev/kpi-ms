"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

const FEEDBACK_FORM_URL =
  "https://docs.google.com/spreadsheets/d/1JhoPixCN_OwziE2k4u3xgvY-dftL8Nmp-3smRaPirq4/edit?gid=1797116981#gid=1797116981";
const STORAGE_KEY = "kpi-ms:welcome-notice-login-count";

/**
 * One-time-per-login heads-up that the system is still under active
 * development. `loginCount` only changes server-side on an actual sign-in
 * (see auth.ts's jwt callback — it's skipped on every other session
 * refresh), so it's a stable marker for "this login" rather than "this page
 * load": stashed in localStorage the moment this shows, a reload or
 * client-side nav within the same login won't re-trigger it, but signing out
 * and back in always will, even without closing the browser.
 */
export function WelcomeNoticeModal({ loginCount }: { loginCount: number }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const seen = window.localStorage.getItem(STORAGE_KEY);
    if (seen === String(loginCount)) return;
    window.localStorage.setItem(STORAGE_KEY, String(loginCount));
    // localStorage isn't available during SSR, so this can't be a lazy
    // useState initializer without risking a hydration mismatch — an effect
    // is the correct place to read it and flip state for this one-tick-later
    // client-only reveal.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [loginCount]);

  function close() {
    setOpen(false);
  }

  return (
    <Modal open={open} onClose={close} title="Before you dive in">
      <div className="space-y-5 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Info className="size-6" />
        </div>
        <p className="text-sm leading-relaxed text-muted">
          This system is still actively being built and refined. If you run into a bug, a
          glitch, or anything that looks off, please log it in the feedback form so we can
          track it down and fix it.
        </p>
        <p className="text-sm leading-relaxed text-muted">
          Something urgent blocking your work? Email{" "}
          <a
            href="mailto:business-support@vaaphilippines.com"
            className="font-medium text-accent hover:underline"
          >
            business-support@vaaphilippines.com
          </a>{" "}
          and we&apos;ll jump on it right away.
        </p>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
          <a
            href={FEEDBACK_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Open Feedback Form
          </a>
          <Button type="button" variant="outline" onClick={close}>
            Got it
          </Button>
        </div>
      </div>
    </Modal>
  );
}
