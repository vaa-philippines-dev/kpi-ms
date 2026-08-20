import { PageHeader, ComingSoon } from "@/components/page-header";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getInterventionTypes, getAppName, getWeekStartDay } from "@/lib/settings";
import { LegacySyncPanel } from "@/components/legacy-sync-panel";
import { getEffectiveSession } from "@/lib/view-as";
import { updateSetting } from "./actions";

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

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="System Settings" />
        <ComingSoon note="Only admins can view system settings." />
      </>
    );
  }

  const [interventionTypes, appName, weekStartDay] = await Promise.all([
    getInterventionTypes(),
    getAppName(),
    getWeekStartDay(),
  ]);

  return (
    <>
      <PageHeader
        title="System Settings"
        description="App-wide configuration values."
      />

      <div className="max-w-2xl space-y-6">
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
      </div>
    </>
  );
}
