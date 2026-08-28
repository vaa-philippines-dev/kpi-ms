import { PageHeader, ComingSoon } from "@/components/page-header";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getInterventionTypes,
  getAppName,
  getWeekStartDay,
  getSystemMessage,
  type SystemMessageTone,
} from "@/lib/settings";
import { LegacySyncPanel } from "@/components/legacy-sync-panel";
import { SyncButton } from "@/components/sync-button";
import { getEffectiveSession } from "@/lib/view-as";
import { updateSetting, updateSystemMessage } from "./actions";

const SYSTEM_MESSAGE_TONES: { value: SystemMessageTone; label: string }[] = [
  { value: "update", label: "Update" },
  { value: "notice", label: "Notice" },
  { value: "caution", label: "Caution" },
];

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default async function SettingsPage() {
  const session = await getEffectiveSession();
  const isAdmin = session?.role === "ADMIN";
  const canView = isAdmin || session?.role === "EXECUTIVE";

  if (!canView) {
    return (
      <>
        <PageHeader title="System Settings" />
        <ComingSoon note="Only admins can view system settings." />
      </>
    );
  }

  const [interventionTypes, appName, weekStartDay, systemMessage] = await Promise.all([
    getInterventionTypes(),
    getAppName(),
    getWeekStartDay(),
    getSystemMessage(),
  ]);

  return (
    <>
      <PageHeader
        title="System Settings"
        description="App-wide configuration values."
      />

      <div className="max-w-2xl space-y-6">
        {isAdmin ? (
          <>
            <form
              action={updateSetting}
              className="space-y-2 rounded-lg border border-surface-border p-4"
            >
              <input type="hidden" name="key" value="APP_NAME" />
              <label className="block text-sm font-medium">
                App Name
                <span className="ml-2 text-xs text-muted">
                  shown next to the logo in the dashboard sidebar
                </span>
              </label>
              <Input name="value" defaultValue={appName} className="w-full" />
              <Button type="submit">Save</Button>
            </form>

            <form
              action={updateSetting}
              className="space-y-2 rounded-lg border border-surface-border p-4"
            >
              <input type="hidden" name="key" value="WEEK_START_DAY" />
              <label className="block text-sm font-medium">
                Week Start Day
                <span className="ml-2 text-xs text-muted">
                  which day weekly periods start on, for target calculations
                </span>
              </label>
              <Select name="value" defaultValue={String(weekStartDay)} className="w-full">
                {WEEKDAYS.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </Select>
              <Button type="submit">Save</Button>
            </form>

            <form
              action={updateSetting}
              className="space-y-2 rounded-lg border border-surface-border p-4"
            >
              <input type="hidden" name="key" value="INTERVENTION_TYPES" />
              <label className="block text-sm font-medium">
                Intervention Types
                <span className="ml-2 text-xs text-muted">
                  comma-separated, shown as options when logging an intervention
                </span>
              </label>
              <Input
                name="value"
                defaultValue={interventionTypes.join(", ")}
                className="w-full"
              />
              <Button type="submit">Save</Button>
            </form>

            <form
              action={updateSystemMessage}
              className="space-y-2 rounded-lg border border-surface-border p-4"
            >
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={systemMessage.enabled}
                  className="size-4 rounded border-surface-border accent-accent"
                />
                System Message
                <span className="ml-1 text-xs font-normal text-muted">
                  shown as a toast in the bottom-right corner for every signed-in user
                </span>
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  name="tone"
                  defaultValue={systemMessage.tone}
                  className="sm:w-40"
                >
                  {SYSTEM_MESSAGE_TONES.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
                <Textarea
                  name="text"
                  defaultValue={systemMessage.text}
                  placeholder="Message to show users…"
                  rows={2}
                  className="w-full"
                />
              </div>
              <Button type="submit">Save</Button>
            </form>

            <div>
              <h2 className="mb-3 text-sm font-semibold text-muted uppercase">
                Sync Connection IDs
              </h2>
              <p className="mb-3 text-xs text-muted">
                Pulls new VA↔client connections from the real CMS on demand.
                Create-only: existing connections here are never modified, and
                rows that already match an existing connection (by CMS ID or by
                VA + client name) are skipped, not duplicated. Also available
                from the VA Connections page for Admin, DM, and Operations
                Manager.
              </p>
              <SyncButton label="Sync Connection IDs" endpoint="/api/cms-sync/connections" />
            </div>

            <div>
              <h2 className="mb-3 text-sm font-semibold text-muted uppercase">
                Legacy Sync
              </h2>
              <p className="mb-3 text-xs text-muted">
                Pulls from the legacy Google Sheet on demand — no cron job. Safe
                to re-run: every row is upserted by its legacy ID, so nothing
                gets duplicated.
              </p>
              <LegacySyncPanel />
            </div>
          </>
        ) : (
          // EXECUTIVE — same values, read-only: no form/Save, and the Sync
          // panels are hidden entirely since they're action triggers rather
          // than configuration values there's anything to "view".
          <>
            <div className="space-y-1 rounded-lg border border-surface-border p-4">
              <p className="text-sm font-medium">
                App Name
                <span className="ml-2 text-xs text-muted">
                  shown next to the logo in the dashboard sidebar
                </span>
              </p>
              <p className="text-sm text-muted">{appName}</p>
            </div>

            <div className="space-y-1 rounded-lg border border-surface-border p-4">
              <p className="text-sm font-medium">
                Week Start Day
                <span className="ml-2 text-xs text-muted">
                  which day weekly periods start on, for target calculations
                </span>
              </p>
              <p className="text-sm text-muted">{WEEKDAYS[weekStartDay]}</p>
            </div>

            <div className="space-y-1 rounded-lg border border-surface-border p-4">
              <p className="text-sm font-medium">
                Intervention Types
                <span className="ml-2 text-xs text-muted">
                  comma-separated, shown as options when logging an intervention
                </span>
              </p>
              <p className="text-sm text-muted">{interventionTypes.join(", ")}</p>
            </div>

            <div className="space-y-1 rounded-lg border border-surface-border p-4">
              <p className="text-sm font-medium">
                System Message
                <span className="ml-2 text-xs text-muted">
                  shown as a toast in the bottom-right corner for every signed-in user
                </span>
              </p>
              <p className="text-sm text-muted">
                {systemMessage.enabled
                  ? `${SYSTEM_MESSAGE_TONES.find((t) => t.value === systemMessage.tone)?.label} — ${systemMessage.text || "(no message set)"}`
                  : "Disabled"}
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
