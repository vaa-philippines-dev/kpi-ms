"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { UserRole } from "@/generated/prisma/enums";
import { roleLabel } from "@/lib/roles";

type Option = { id: string; name: string };

export function UserActions({
  departments,
  services,
  teams,
  roles = Object.values(UserRole),
  createUser,
  bulkCreateUsers,
}: {
  departments: Option[];
  services: Option[];
  teams: Option[];
  /** Role choices offered in the Add-user form — a DM only offers OM/VA (mirrors legacy's Manager create form). */
  roles?: UserRole[];
  createUser: (formData: FormData) => void | Promise<void>;
  bulkCreateUsers: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState<"add" | "bulk" | null>(null);

  return (
    <>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="outline"
          className="px-3 py-2 text-xs"
          onClick={() => setOpen("bulk")}
        >
          Bulk import
        </Button>
        <Button
          type="button"
          className="px-3 py-2 text-xs"
          onClick={() => setOpen("add")}
        >
          + Add user
        </Button>
      </div>

      <Modal open={open === "add"} onClose={() => setOpen(null)} title="Add user">
        <form
          action={createUser}
          onSubmit={() => setOpen(null)}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <Input
            name="email"
            type="email"
            placeholder="Work email"
            required
            className="sm:col-span-2"
          />
          <Input name="name" placeholder="Name (optional)" />
          <Select name="role" defaultValue={roles.includes(UserRole.VA) ? UserRole.VA : roles[0]} required>
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </Select>
          <Select name="departmentId" defaultValue="">
            <option value="">Department (optional)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select name="serviceId" defaultValue="">
            <option value="">Service (optional)</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select name="teamId" defaultValue="">
            <option value="">Team (optional)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button type="submit" className="col-span-2 sm:col-span-4">
            Add User
          </Button>
        </form>
      </Modal>

      <Modal open={open === "bulk"} onClose={() => setOpen(null)} title="Bulk import users">
        <form
          action={bulkCreateUsers}
          onSubmit={() => setOpen(null)}
          className="space-y-3"
        >
          <p className="text-xs text-muted">
            One per line: <code>email,name,role</code> (name and role optional,
            role defaults to VA)
          </p>
          <Textarea
            name="rows"
            placeholder={"va1@vaaphilippines.com,VA One,VA\nva2@vaaphilippines.com"}
            rows={4}
            required
            className="w-full font-mono"
          />
          <div className="grid grid-cols-3 gap-3">
            <Select name="departmentId" defaultValue="">
              <option value="">Department (optional)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select name="serviceId" defaultValue="">
              <option value="">Service (optional)</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select name="teamId" defaultValue="">
              <option value="">Team (optional)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit">Bulk Import</Button>
        </form>
      </Modal>
    </>
  );
}
