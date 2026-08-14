"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { AuthModal } from "@/components/auth-modal";

export function DashboardAccessButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
      >
        Access KPI Dashboard
        <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
      </button>
      <AuthModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
