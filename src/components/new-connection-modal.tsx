"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createConnection } from "@/app/dashboard/connections/actions";

type Department = { id: string; name: string };
type Service = { id: string; name: string; departmentId: string };
type VaUser = { id: string; name: string | null; email: string };

/**
 * "+ New Connection" button + form modal — mirrors legacy's connOpenForm()
 * (AppVAConnections.html:307-373): Primary Account Name, optional Secondary
 * Name, a Department select that narrows the Service select, a VA select,
 * Start Date (defaults to today), and Connection Type.
 */
export function NewConnectionModal({
  departments,
  services,
  vaUsers,
  lockedDepartmentId,
}: {
  departments: Department[];
  services: Service[];
  vaUsers: VaUser[];
  /** DM/Ops Manager can only create within their own department — fixes the
   * department instead of offering the full list a picker would imply. */
  lockedDepartmentId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState(lockedDepartmentId ?? "");
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const lockedDepartment = lockedDepartmentId
    ? departments.find((d) => d.id === lockedDepartmentId)
    : undefined;

  const servicesForDept = services.filter((s) => s.departmentId === departmentId);

  function close() {
    setOpen(false);
    setDepartmentId(lockedDepartmentId ?? "");
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        + New Connection
      </Button>

      <Modal open={open} onClose={close} title="New Connection">
        <form
          action={async (formData) => {
            await createConnection(formData);
            close();
          }}
          className="space-y-3"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase">
              Primary Account Name *
            </label>
            <Input name="clientName" required autoComplete="off" className="w-full" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase">
              Secondary Name
            </label>
            <Input
              name="secondaryName"
              autoComplete="off"
              placeholder="Alias or alternative name"
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase">
                Department *
              </label>
              {lockedDepartmentId ? (
                <>
                  <input type="hidden" name="departmentId" value={lockedDepartmentId} />
                  <p className="rounded-lg border border-surface-border bg-surface-hover/40 px-3 py-2.5 text-sm">
                    {lockedDepartment?.name ?? "Your department"}
                  </p>
                </>
              ) : (
                <Select
                  name="departmentId"
                  required
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full"
                >
                  <option value="" disabled>
                    — Select —
                  </option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase">
                Service
              </label>
              <Select
                name="serviceId"
                disabled={!departmentId}
                defaultValue=""
                className="w-full"
              >
                <option value="">
                  {departmentId ? "— Select Service —" : "— Select department first —"}
                </option>
                {servicesForDept.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase">
                VA Name *
              </label>
              <Select name="vaUserId" required defaultValue="" className="w-full">
                <option value="" disabled>
                  — Select VA —
                </option>
                {vaUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase">
                Start Date *
              </label>
              <Input name="startDate" type="date" required defaultValue={today} className="w-full" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase">
              Connection Type
            </label>
            <Select name="connectionType" defaultValue="REGULAR" className="w-full">
              <option value="REGULAR">Regular</option>
              <option value="PROJECT_BASED">Project-based</option>
            </Select>
            <p className="mt-1 text-xs text-muted">
              Regular: daily/weekly basis. Project-based: on/off based on total hours.
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-surface-border pt-3">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit">Save Connection</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
