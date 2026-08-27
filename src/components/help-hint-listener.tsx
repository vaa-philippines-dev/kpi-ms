"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

const REMINDER_INTERVAL_MS = 20 * 60 * 1000;
const FIRST_LOGIN_DELAY_MS = 60 * 1000;

/**
 * Periodic bottom-right nudge pointing people at Tickets for help. Repeats
 * every 20 minutes for as long as the dashboard stays open. On someone's
 * very first login (loginCount === 1, see auth.ts's jwt callback) the first
 * nudge fires after just 1 minute instead of 20, since a brand-new user is
 * more likely to hit friction early; every nudge after that — first login or
 * not — is spaced 20 minutes apart.
 */
export function HelpHintListener({ loginCount }: { loginCount: number }) {
  const router = useRouter();
  const { toast } = useToast();

  // Re-scheduling reads these through refs rather than the effect's own
  // closure so router/toast identity changes don't tear down and restart
  // the timer chain mid-wait. Kept current via their own effects (not a
  // plain assignment during render) since writing to `.current` outside an
  // effect/handler is a lint error.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function schedule(delay: number) {
      timer = setTimeout(() => {
        toastRef.current("Ask for help in “Tickets” if something's not working.", "info", {
          title: "Problems?",
          onClick: () => routerRef.current.push("/dashboard/dev/tickets"),
        });
        schedule(REMINDER_INTERVAL_MS);
      }, delay);
    }

    schedule(loginCount === 1 ? FIRST_LOGIN_DELAY_MS : REMINDER_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [loginCount]);

  return null;
}
