"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createTicket } from "@/app/dashboard/dev/actions";
import { TICKET_CATEGORY_LABELS, TICKET_PRIORITY_LABELS } from "@/lib/ticket-labels";
import { TicketCategory, TicketPriority } from "@/generated/prisma/enums";

export function NewTicketModal() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  function close() {
    if (saving) return;
    setOpen(false);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        + New Ticket
      </Button>

      <Modal open={open} onClose={close} title="Raise a Ticket">
        <form
          className="space-y-3"
          action={async (formData) => {
            setSaving(true);
            try {
              await createTicket(formData);
              toast("Ticket sent.", "success");
              setOpen(false);
            } catch (e) {
              toast(e instanceof Error ? e.message : "Failed to create ticket.", "error");
            } finally {
              setSaving(false);
            }
          }}
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase">Subject *</label>
            <Input name="subject" required autoComplete="off" placeholder="Short summary of your concern" className="w-full" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase">Category</label>
              <Select name="category" defaultValue={TicketCategory.OTHER} className="w-full">
                {Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase">Priority</label>
              <Select name="priority" defaultValue={TicketPriority.NORMAL} className="w-full">
                {Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase">Message *</label>
            <Textarea name="body" required rows={4} placeholder="What's going on?" className="w-full" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase">
              Attachment link (optional)
            </label>
            <Input
              name="attachmentUrl"
              type="url"
              autoComplete="off"
              placeholder="Paste an image/video link"
              className="w-full"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-surface-border pt-3">
            <Button type="button" variant="outline" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Send
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
