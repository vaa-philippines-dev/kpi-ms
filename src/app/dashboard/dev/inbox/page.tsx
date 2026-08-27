import { MessageCircle } from "lucide-react";

// Right-pane empty state for the messenger-style Inbox (see
// dev/inbox/layout.tsx / InboxShell) — rendered when no conversation is
// selected yet. Admin-gating and data fetching both live in the layout.
export default function DevInboxIndexPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted">
      <MessageCircle className="size-8" />
      <p className="text-sm font-medium text-foreground">Select a conversation</p>
      <p className="text-xs">Pick a ticket from the list to view it here.</p>
    </div>
  );
}
