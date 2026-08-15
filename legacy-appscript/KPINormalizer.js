// ============================================================
// KPI_Normalization.gs — Everything in one file
// ============================================================
//
// STATE MODEL: each submission tab has a checkbox column in column A
// ("Normalized?"). TRUE = this row's data is already reflected in the
// Monthly_Normalized / Weekly_Normalized output tabs. FALSE/unchecked = this
// row still needs to be (re)considered.
//
// This checkbox is the single source of truth for what gets normalized:
//   - The very first run treats every row as unchecked, so it behaves like a
//     full backfill automatically — there's no separate "first run" mode.
//   - Every later run only looks at unchecked rows, so it's cheap regardless
//     of how much history has piled up.
//   - If staff fixes a bad row (wrong ConnectionID, wrong client name, etc.)
//     or fills in KPI values that were missing, they just UNCHECK the box on
//     that row. The next run — manual or hourly trigger — picks it up again,
//     no matter how old the Report Date is.
//
// IMPORTANT — Google Forms caution: these tabs are Google Form response
// sheets. Forms remembers which column each question writes to by position,
// not by header text. Inserting the checkbox column at the very left (column
// A) shifts every existing form-owned column one to the right. Run
// setupNormalizationCheckboxes() on ONE tab first, submit a test Form
// response, and confirm it still lands in the correct columns before running
// it on the rest.
//
// IMPORTANT — Manual row deletion caution: if rows are deleted directly from
// a submission tab (e.g. as part of a data-retention cleanup), any resume
// checkpoint saved mid-tab by a previous timed-out run may now point past
// the end of that tab's remaining data, or into a different logical row than
// when it was saved. runNormalization() validates the saved checkpoint
// against the tab's current size on every run and resets it if it's stale —
// see the checkpoint validation block below — so this is handled
// automatically, but it's worth knowing about if you ever see a tab get
// skipped unexpectedly right after a bulk row deletion.

const CONFIG_KPI = {
  SUBMISSION_TABS: ['AMZ', 'WS', 'PPC', 'SM', 'CW', 'WM', 'EA', 'CSR', 'QA', 'PA', 'GD', 'VE'],

  // Friendly display names for the targeted-normalization modal dropdown.
  DEPARTMENT_LABELS: {
    AMZ: 'Amazon',
    WS:  'Wholesale',
    PPC: 'PPC',
    SM:  'Social Media',
    CW:  'Copywriting',
    WM:  'Walmart',
    EA:  'Executive Assistant',
    CSR: 'Customer Service Representative',
    QA:  'Quality Assurance',
    PA:  'Production Artist',
    GD:  'Graphic Design',
    VE:  'Video Editing',
  },

  // Column layout in every submission tab (0-indexed), AFTER the checkbox
  // column has been inserted at column A via setupNormalizationCheckboxes().
  CHECKBOX_COL: 0,
  CHECKBOX_HEADER_LABEL: 'Normalized',

  HEADER_FIELDS: {
    CONNECTION_ID: 1,
    TIMESTAMP: 2,
    EMAIL_ADDRESS: 3,
    VA_NAME: 4,
    WORK_EMAIL: 5,
    CLIENT_NAME: 6,
    REPORT_TYPE: 7,
    REPORT_DATE: 8,
  },

  // KPI columns start after the checkbox + 8 standard header columns, by default.
  // Some tabs have extra columns before their first KPI (e.g. PPC's KPI data
  // starts one column later than most). KPI_START_COL is the default (matches
  // AMZ, column J); override per-tab in KPI_START_COL_OVERRIDES as needed —
  // use getKpiStartCol(tabName) everywhere rather than the raw constant.
  KPI_START_COL: 9, // column J
  KPI_START_COL_OVERRIDES: {
    PPC: 10, // column K
  },

  // Row indices (0-indexed) — unaffected by the column insert
  KPI_ID_ROW: 1,     // Row 2 in sheet = index 1: the actual KPI ID codes, one per KPI column pair
  KPI_LABEL_ROW: 2,  // Row 3 in sheet = index 2: field headers (ConnectionID, Timestamp, ...) + human-readable KPI names — used to detect which columns hold a KPI pair
  DATA_START_ROW: 3, // Row 4 onwards = actual submissions

  // Output tab names
  OUTPUT_MONTHLY: 'Monthly_Normalized',
  OUTPUT_WEEKLY:  'Weekly_Normalized',
  AUDIT_LOG_SHEET: 'Audit_Log',

  OUTPUT_HEADERS: [
    'Source Tab', 'ConnectionID', 'VA Name', 'Work Email Address',
    'Client Name', 'Report Date', 'KPI ID', 'Target', 'Actual'
  ],

  // Report type keywords (case-insensitive match)
  MONTHLY_KEYWORDS: ['month'],
  WEEKLY_KEYWORDS:  ['week'],

  // ConnectionID values that indicate a bad/errored submission row. Rows like
  // this are left UNCHECKED (never marked Normalized) so they keep getting
  // picked up on every run until someone corrects them.
  ERROR_CONNECTION_IDS: ['DATA MISMATCH', 'INCORRECT CLIENT NAME', 'INCORRECT WORK EMAIL'],

  // Time-budget protection for Apps Script's ~6 min execution limit. A run
  // that has a lot of unprocessed rows to catch up on chunks itself and
  // resumes on the next call (manual re-run or the next hourly trigger).
  MAX_RUNTIME_MS: 4.5 * 60 * 1000,
  ROWS_PER_TIME_CHECK: 25,
  PROP_TAB_INDEX: 'KPI_UNPROC_TAB_INDEX',
  PROP_ROW_INDEX: 'KPI_UNPROC_ROW_INDEX',

  // Scopes: run everything together, or Monthly/Weekly independently. Each
  // scope tracks its own resume checkpoint (via scopedProp() below). A row
  // is only checked off once it's been written under the scope that actually
  // covers its report type — e.g. a Weekly-only run leaves Monthly rows
  // untouched and unchecked, for a future Monthly (or ALL) run to pick up.
  SCOPES: { ALL: 'ALL', MONTHLY: 'MONTHLY', WEEKLY: 'WEEKLY' },
};

/** Returns the resolved KPI_START_COL for a given tab — its override if one is set, otherwise the default. */
function getKpiStartCol(tabName) {
  const overrides = CONFIG_KPI.KPI_START_COL_OVERRIDES || {};
  return overrides.hasOwnProperty(tabName) ? overrides[tabName] : CONFIG_KPI.KPI_START_COL;
}

/** Returns the Script Property key to use for a given base key + scope. */
function scopedProp(baseKey, scope) {
  return scope === CONFIG_KPI.SCOPES.ALL ? baseKey : `${baseKey}_${scope}`;
}


// ============================================================
// Entry Points & Main Logic
// ============================================================

/** Adds a custom menu when the spreadsheet opens */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Normalize Submissions')
    .addItem('Summarize Weekly Reports', 'summarizeKPIWeeklyReports')
    .addItem('Summarize Monthly Reports', 'summarizeKPIMonthlyReports')
    .addItem('Summarize Both', 'summarizeAllKPIReports')

   // .addItem('▶ Run Normalization Now (Monthly + Weekly)', 'normalizeAllSubmissions')
   // .addItem('🗓 Run Monthly Only', 'normalizeMonthlyOnly')
   // .addItem('📅 Run Weekly Only', 'normalizeWeeklyOnly')
    .addItem('☑ Normalize Unchecked Only (skip error rows)', 'normalizeUncheckedOnly')
    .addSeparator()
   // .addItem('🎯 Normalize Specific Tab + Date Range…', 'showTargetedNormalizationDialog')
    .addSeparator()
   // .addItem('🧩 Setup Normalization Checkbox Column…', 'setupNormalizationCheckboxes')
   // .addItem('🔧 Check/Repair Checkbox Column Detection', 'repairCheckboxColumnLabels')
    .addItem('🔁 Recheck All Against Normalized Table', 'recheckAllAgainstNormalizedTable')
    .addItem('🔁▶ Recheck Then Normalize (trigger-safe)', 'recheckThenNormalize')
    .addItem('🩺 Diagnose Column Layout…', 'diagnoseColumnLayout')
   // .addItem('♻ Force Recheck All (Uncheck Everything)', 'uncheckAllSubmissions')
    //.addSeparator()
    //.addItem('⏱ Set Up Hourly Trigger', 'setupHourlyTrigger')
    //.addItem('⏹ Remove Hourly Trigger', 'removeHourlyTrigger')
    .addSeparator()
    .addItem('📄 View Audit Log', 'openAuditLog')
    .addItem('🗑 Clear Output Tabs', 'clearOutputTabs')
    .addToUi();
}

/** Creates (or replaces) the hourly time-driven trigger used in production */
function setupHourlyTrigger() {
  removeHourlyTrigger();
  ScriptApp.newTrigger('normalizeAllSubmissions')
    .timeBased()
    .everyHours(1)
    .create();
  safeToast(SpreadsheetApp.getActiveSpreadsheet(), 'Hourly trigger created.');
}

/** Removes any existing time-driven triggers for normalizeAllSubmissions */
function removeHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'normalizeAllSubmissions') ScriptApp.deleteTrigger(t);
  });
}

/**
 * Creates (or replaces) an hourly trigger that runs recheckThenNormalize —
 * the combined "recheck against output, then normalize unchecked rows"
 * entry point. This is the function you'd point a time-driven trigger at
 * for unattended production use; both steps are trigger-safe (no ui.alert).
 */
function setupRecheckThenNormalizeTrigger() {
  removeRecheckThenNormalizeTrigger();
  ScriptApp.newTrigger('recheckThenNormalize')
    .timeBased()
    .everyHours(1)
    .create();
  safeToast(SpreadsheetApp.getActiveSpreadsheet(), 'Hourly "Recheck then Normalize" trigger created.');
}

/** Removes any existing time-driven triggers for recheckThenNormalize */
function removeRecheckThenNormalizeTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'recheckThenNormalize') ScriptApp.deleteTrigger(t);
  });
}

/** Activates the Audit_Log tab so the user can review recent runs */
function openAuditLog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ensureAuditLogSheet(ss);
  ss.setActiveSheet(sheet);
}

/**
 * Main entry point. Safe to run unattended from an hourly trigger — never
 * calls SpreadsheetApp.getUi()/ui.alert. Results go to the Audit_Log tab.
 * Automatically resumes a paused chunk if one is in progress.
 */
function normalizeAllSubmissions() {
  runNormalization(CONFIG_KPI.SCOPES.ALL);
}

/** Normalizes unprocessed Monthly-type rows only — Weekly rows are left untouched/unchecked. */
function normalizeMonthlyOnly() {
  runNormalization(CONFIG_KPI.SCOPES.MONTHLY);
}

/** Normalizes unprocessed Weekly-type rows only — Monthly rows are left untouched/unchecked. */
function normalizeWeeklyOnly() {
  runNormalization(CONFIG_KPI.SCOPES.WEEKLY);
}

/**
 * Explicit entry point: normalizes ONLY rows whose "Normalized" checkbox is
 * unchecked — this is the same engine normalizeAllSubmissions() uses, named
 * directly for clarity. A row is excluded from normalization (left unchecked,
 * counted as "needs attention") whenever its ConnectionID is:
 *   - blank/missing, or
 *   - one of the known error sentinels: "Incorrect Client Name",
 *     "Incorrect Work Email", "Data Mismatch"
 * Everything else that's unchecked gets normalized and checked off.
 */
function normalizeUncheckedOnly() {
  runNormalization(CONFIG_KPI.SCOPES.ALL);
}

/**
 * Trigger-safe combined entry point: first reconciles every submission row
 * against what's actually in Monthly_Normalized/Weekly_Normalized — catching
 * rows whose submission data changed since they were last normalized (and
 * deleting the stale output rows for them) — then runs normalization over
 * whatever is left unchecked (newly-added rows, plus anything the recheck
 * step just unchecked because it had changed). Attach this to a time-driven
 * trigger for unattended operation; see setupRecheckThenNormalizeTrigger().
 */
function recheckThenNormalize() {
  recheckAllAgainstNormalizedTableCore();
  runNormalization(CONFIG_KPI.SCOPES.ALL);
  summarizeAllKPIReports();

}

/**
 * Shared dispatcher: scans every submission tab for rows whose checkbox is
 * not TRUE, normalizes whatever fits in the time budget, checks off every
 * row it successfully handles, and saves a resume checkpoint if it runs out
 * of time — the next call (manual or hourly trigger) picks up right where
 * it left off. Because state lives in the checkbox column itself, there is
 * no separate "first run" mode: a brand-new sheet where nothing is checked
 * behaves exactly like a full backfill, automatically.
 *
 * CHECKPOINT VALIDATION: the saved resume position (tab index + row index)
 * is only meaningful relative to the tab's row layout at the moment it was
 * saved. If rows are deleted directly from a submission tab afterward (e.g.
 * as part of a data-retention cleanup), a stale checkpoint could point past
 * the end of that tab's current data. Before trusting the saved checkpoint,
 * it's validated against the current sheet size for that tab and reset back
 * to the default start row if it no longer fits — see the block right after
 * the checkpoint is read below.
 *
 * @param {string} scope - CONFIG_KPI.SCOPES.ALL / MONTHLY / WEEKLY
 */
function runNormalization(scope) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  const startTime = Date.now();

  try {
    safeToast(ss, 'Normalizing unprocessed submissions…');

    const startTabIndex = parseInt(props.getProperty(scopedProp(CONFIG_KPI.PROP_TAB_INDEX, scope)), 10) || 0;
    let startRowIndex = parseInt(props.getProperty(scopedProp(CONFIG_KPI.PROP_ROW_INDEX, scope)), 10) || CONFIG_KPI.DATA_START_ROW;

    // Checkpoint validation — guards against manual row deletion between runs.
    // If the saved row index for the tab we're about to resume on no longer
    // fits that tab's current row count, the checkpoint is stale: reset it to
    // the default start row rather than silently scanning zero rows (or the
    // wrong rows) for the rest of that tab.
    const checkpointTabName = CONFIG_KPI.SUBMISSION_TABS[startTabIndex];
    if (checkpointTabName) {
      const checkpointSheet = ss.getSheetByName(checkpointTabName);
      if (checkpointSheet && startRowIndex >= checkpointSheet.getLastRow()) {
        console.warn(
          `[${scope}] Saved resume checkpoint pointed at row index ${startRowIndex} on "${checkpointTabName}", ` +
          `but that tab now only has ${checkpointSheet.getLastRow()} row(s) — likely due to a manual row deletion. ` +
          `Resetting checkpoint to the default start row for this tab.`
        );
        startRowIndex = CONFIG_KPI.DATA_START_ROW;
      }
    }

    const monthlyRows = [];
    const weeklyRows = [];
    const skippedTabs = [];       // tab not found
    const kpiMapEmptyTabs = [];   // tab found, but no KPI columns detected at KPI_ID_ROW
    const perTabAttention = [];   // "TAB (n needing attention)"
    const pendingCheckboxUpdates = []; // { sheet, tabName, rowsToCheck } — applied only after a successful write

    let timedOut = false;
    let resumeTabIndex = startTabIndex;
    let resumeRowIndex = startRowIndex;
    let totalNeedsAttention = 0;

    const tabs = CONFIG_KPI.SUBMISSION_TABS;

    for (let ti = startTabIndex; ti < tabs.length; ti++) {
      if (isOverTimeBudget(startTime)) {
        timedOut = true;
        resumeTabIndex = ti;
        resumeRowIndex = CONFIG_KPI.DATA_START_ROW;
        break;
      }

      const tabName = tabs[ti];
      const sheet = ss.getSheetByName(tabName);
      if (!sheet) {
        skippedTabs.push(tabName);
        continue;
      }

      const rowStartForThisTab = (ti === startTabIndex) ? startRowIndex : CONFIG_KPI.DATA_START_ROW;
      const result = normalizeTabUnprocessed(sheet, tabName, rowStartForThisTab, startTime, scope);

      if (result.kpiMapEmpty) {
        kpiMapEmptyTabs.push(tabName);
        continue;
      }

      monthlyRows.push(...result.monthly);
      weeklyRows.push(...result.weekly);
      totalNeedsAttention += result.needsAttentionCount;
      if (result.needsAttentionCount > 0) {
        perTabAttention.push(`${tabName} (${result.needsAttentionCount})`);
      }

      // Don't touch checkboxes yet — queue them until we know the output write succeeded.
      if (result.rowsToCheck.length > 0) {
        pendingCheckboxUpdates.push({ sheet, tabName, rowsToCheck: result.rowsToCheck });
      }

      if (result.timedOut) {
        timedOut = true;
        resumeTabIndex = ti;
        resumeRowIndex = result.resumeRowIndex;
        break;
      }
    }

    // Report Date is required in the output tabs — filter right before writing.
    const monthlyFiltered = filterMissingReportDate(monthlyRows);
    const weeklyFiltered  = filterMissingReportDate(weeklyRows);

    // Write output FIRST. Only if this succeeds do we check off the source rows —
    // this keeps "checked = true" and "actually present in the output tab" in sync.
    if (monthlyFiltered.kept.length > 0) writeOutputTabAppend(ss, CONFIG_KPI.OUTPUT_MONTHLY, monthlyFiltered.kept);
    if (weeklyFiltered.kept.length > 0)  writeOutputTabAppend(ss, CONFIG_KPI.OUTPUT_WEEKLY, weeklyFiltered.kept);

    let totalNewlyChecked = 0;
    for (const u of pendingCheckboxUpdates) {
      applyCheckboxUpdates(u.sheet, u.rowsToCheck);
      totalNewlyChecked += u.rowsToCheck.length;
    }

    if (timedOut) {
      props.setProperty(scopedProp(CONFIG_KPI.PROP_TAB_INDEX, scope), String(resumeTabIndex));
      props.setProperty(scopedProp(CONFIG_KPI.PROP_ROW_INDEX, scope), String(resumeRowIndex));
    } else {
      props.deleteProperty(scopedProp(CONFIG_KPI.PROP_TAB_INDEX, scope));
      props.deleteProperty(scopedProp(CONFIG_KPI.PROP_ROW_INDEX, scope));
    }

    const skipMsg = skippedTabs.length ? ` | Tabs not found: ${skippedTabs.join(', ')}` : '';
    const kpiEmptyMsg = kpiMapEmptyTabs.length ? ` | SKIPPED (no KPI columns detected at row ${CONFIG_KPI.KPI_LABEL_ROW + 1} — run Diagnose Column Layout): ${kpiMapEmptyTabs.join(', ')}` : '';
    const attnMsg = perTabAttention.length ? ` | Needs attention: ${perTabAttention.join(', ')}` : '';
    const noDateMsg = (monthlyFiltered.skippedCount + weeklyFiltered.skippedCount) > 0
      ? ` | Rows skipped (missing Report Date): Monthly ${monthlyFiltered.skippedCount}, Weekly ${weeklyFiltered.skippedCount}`
      : '';
    const pauseMsg = timedOut ? ` | Paused at tab "${tabs[resumeTabIndex]}" (time budget) — will resume next run.` : '';

    const summary = `[${scope}] Newly normalized rows: ${totalNewlyChecked}. New output rows — Monthly: ${monthlyFiltered.kept.length}, Weekly: ${weeklyFiltered.kept.length}. `
      + `Still needing attention (unfixed error rows / missing Report Date): ${totalNeedsAttention}.${skipMsg}${kpiEmptyMsg}${attnMsg}${noDateMsg}${pauseMsg}`;

    // If nothing at all happened, surface the most likely reason directly in the toast —
    // not just buried in the audit log — since that's the confusing case to debug blind.
    if (totalNewlyChecked === 0 && monthlyFiltered.kept.length === 0 && weeklyFiltered.kept.length === 0) {
      if (kpiMapEmptyTabs.length > 0) {
        safeToast(ss, `Nothing normalized — no KPI columns detected on: ${kpiMapEmptyTabs.join(', ')}. Run "Diagnose Column Layout" on one of these.`);
      } else if (totalNeedsAttention > 0) {
        safeToast(ss, `Nothing normalized — ${totalNeedsAttention} unchecked row(s) all have bad/missing ConnectionID or no Report Date. See Audit Log.`);
      } else {
        safeToast(ss, 'Nothing to normalize — every row is already checked off.');
      }
    } else {
      safeToast(ss, timedOut ? 'Normalization paused (time budget) — will resume.' : 'Normalization complete.');
    }

    logAudit(ss, timedOut ? 'PARTIAL' : 'SUCCESS', summary, {
      scope,
      newlyChecked: totalNewlyChecked,
      newMonthlyRows: monthlyFiltered.kept.length,
      newWeeklyRows: weeklyFiltered.kept.length,
      needsAttention: totalNeedsAttention,
      skippedMissingTabs: skippedTabs,
      tabsWithNoKpiColumnsDetected: kpiMapEmptyTabs,
      skippedNoReportDate: { monthly: monthlyFiltered.skippedCount, weekly: weeklyFiltered.skippedCount },
      timedOut,
      resumeTab: timedOut ? tabs[resumeTabIndex] : null,
    });

  } catch (err) {
    console.error('runNormalization error:', err);
    safeToast(ss, `Error occurred during normalization: ${err.message}`);
    logAudit(ss, 'ERROR', `[${scope}] ${err.message}`, { scope, stack: err.stack });
  }
}

/** True once we're within CONFIG_KPI.MAX_RUNTIME_MS of exceeding Apps Script's execution limit. */
function isOverTimeBudget(startTime) {
  return (Date.now() - startTime) > CONFIG_KPI.MAX_RUNTIME_MS;
}

/** Clears both output tabs (keeps headers). Does NOT touch any checkbox state. */
function clearOutputTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [CONFIG_KPI.OUTPUT_MONTHLY, CONFIG_KPI.OUTPUT_WEEKLY].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
  });
  safeToast(ss, 'Output tabs cleared. Note: checkbox state was NOT reset — run "Force Recheck All" too if you want a full rebuild.');
}

/**
 * Unchecks every checkbox across every submission tab, so the next
 * normalization run treats every row as unprocessed again. Use this after a
 * bug fix or logic change where you need everything reconsidered from
 * scratch. Does not touch the output tabs — pair with "Clear Output Tabs" if
 * you also want to wipe Monthly_Normalized / Weekly_Normalized first.
 */
function uncheckAllSubmissions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert(
    'Force Recheck All',
    'This will uncheck every "Normalized" box on every submission tab, so the next normalization run reprocesses everything. It does NOT clear Monthly_Normalized/Weekly_Normalized (rows may be appended again as duplicates unless you also clear the output tabs first). Continue?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  let touchedTabs = 0;
  for (const tabName of CONFIG_KPI.SUBMISSION_TABS) {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) continue;
    const lastRow = sheet.getLastRow();
    const numRows = lastRow - CONFIG_KPI.DATA_START_ROW;
    if (numRows > 0) {
      sheet.getRange(CONFIG_KPI.DATA_START_ROW + 1, 1, numRows, 1).setValue(false);
      touchedTabs++;
    }
  }
  safeToast(ss, `Unchecked all rows on ${touchedTabs} tab(s).`);
  logAudit(ss, 'SUCCESS', `[FORCE-RECHECK] Unchecked all "Normalized" boxes on ${touchedTabs} tab(s).`, { touchedTabs });
}

/**
 * Clears any saved resume checkpoint (for all scopes) without running
 * anything. Useful right after a manual bulk row deletion if you'd rather
 * force a clean restart than rely on the automatic checkpoint-validation
 * check inside runNormalization(). Safe to run any time — if there was no
 * checkpoint saved, this is a no-op.
 */
function resetNormalizationCheckpoints() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  const scopes = Object.values(CONFIG_KPI.SCOPES);
  let cleared = 0;

  scopes.forEach(scope => {
    const tabKey = scopedProp(CONFIG_KPI.PROP_TAB_INDEX, scope);
    const rowKey = scopedProp(CONFIG_KPI.PROP_ROW_INDEX, scope);
    if (props.getProperty(tabKey) !== null) { props.deleteProperty(tabKey); cleared++; }
    if (props.getProperty(rowKey) !== null) { props.deleteProperty(rowKey); cleared++; }
  });

  const msg = cleared > 0
    ? `Cleared ${cleared} saved checkpoint value(s) across all scopes. The next run will start from the top.`
    : 'No saved checkpoints found — nothing to clear.';
  safeToast(ss, msg);
  logAudit(ss, 'SUCCESS', `[RESET-CHECKPOINTS] ${msg}`, { cleared });
}


// ============================================================
// Checkbox Column Setup
// ============================================================

/**
 * True if column A already functions as our checkbox column. Checks the header
 * label first (case-insensitive, trimmed); if that doesn't match — e.g. the
 * checkboxes were added manually, or the header text differs slightly — falls
 * back to checking whether column A's first data row actually has checkbox
 * data validation applied. Either signal is treated as "already set up", so a
 * cosmetic header mismatch never blocks normalization.
 */
function isCheckboxColumnSetUp(sheet) {
  const headerValue = String(sheet.getRange(1, 1).getValue()).trim().toLowerCase();
  if (headerValue === CONFIG_KPI.CHECKBOX_HEADER_LABEL.toLowerCase()) return true;

  const lastRow = sheet.getLastRow();
  const firstDataRow = CONFIG_KPI.DATA_START_ROW + 1;
  if (lastRow < firstDataRow) return false;

  try {
    const validation = sheet.getRange(firstDataRow, 1).getDataValidation();
    return !!(validation && validation.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.CHECKBOX);
  } catch (e) {
    return false;
  }
}

/**
 * Utility to fix header-label mismatches without touching any existing
 * checkbox values: for every submission tab where column A already has
 * checkbox validation but the header text doesn't match, relabels A1 to the
 * expected header so future checks are unambiguous. Safe to run any time.
 */
function repairCheckboxColumnLabels() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fixed = [];
  const alreadyOk = [];
  const noCheckboxFound = [];

  for (const tabName of CONFIG_KPI.SUBMISSION_TABS) {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) continue;

    const headerValue = String(sheet.getRange(1, 1).getValue()).trim().toLowerCase();
    if (headerValue === CONFIG_KPI.CHECKBOX_HEADER_LABEL.toLowerCase()) {
      alreadyOk.push(tabName);
      continue;
    }

    if (isCheckboxColumnSetUp(sheet)) {
      sheet.getRange(1, 1).setValue(CONFIG_KPI.CHECKBOX_HEADER_LABEL).setFontWeight('bold');
      fixed.push(tabName);
    } else {
      noCheckboxFound.push(tabName);
    }
  }

  const msg = `Relabeled: ${fixed.join(', ') || 'none'} | Already correct: ${alreadyOk.join(', ') || 'none'} | No checkbox column detected: ${noCheckboxFound.join(', ') || 'none'}`;
  safeToast(ss, 'Checkbox label check complete — see Audit Log for details.');
  logAudit(ss, 'SUCCESS', `[REPAIR-LABELS] ${msg}`, { fixed, alreadyOk, noCheckboxFound });
  SpreadsheetApp.getUi().alert('Checkbox Column Check', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * One-time (per tab) setup: inserts a new column A with a checkbox for every
 * data row, then seeds it by checking the existing Monthly_Normalized /
 * Weekly_Normalized tabs for a match. Safe to re-run — tabs that already have
 * the checkbox column (detected via the header label) are skipped.
 *
 * MATCHING CAVEAT: the output tabs don't store the submission's Timestamp, so
 * seeding matches on (Source Tab, ConnectionID, Report Date). That's a solid
 * proxy given each connection normally reports once per period, but spot-check
 * a few tabs after running this — if the same ConnectionID+Report Date appears
 * more than once historically (e.g. a correction that changed the Report Date),
 * the match could be imperfect for that specific row.
 *
 * GOOGLE FORMS CAUTION: inserting a column shifts every column the linked
 * Form writes to. Run this on ONE tab, submit a test Form response, and
 * confirm the response still lands in the right columns before running the
 * rest.
 */
function setupNormalizationCheckboxes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const resp = ui.alert(
    'Setup Normalization Checkbox Column',
    'This inserts a new "Normalized" checkbox column at the LEFT of every submission tab, and checks off rows already present in Monthly_Normalized/Weekly_Normalized.\n\n' +
    'IMPORTANT: these are Google Form response sheets. Inserting a column shifts every column the Form writes to. If you have not already tested this on one tab, click Cancel, run this once, then submit a test Form response before continuing.\n\n' +
    'Proceed for all tabs now?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  const outputIndex = buildOutputMatchIndex(ss);
  const results = [];

  for (const tabName of CONFIG_KPI.SUBMISSION_TABS) {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) { results.push(`${tabName}: tab not found`); continue; }

    if (isCheckboxColumnSetUp(sheet)) {
      results.push(`${tabName}: already set up, skipped`);
      continue;
    }

    sheet.insertColumnBefore(1);
    sheet.getRange(1, 1).setValue(CONFIG_KPI.CHECKBOX_HEADER_LABEL).setFontWeight('bold');

    const lastRow = sheet.getLastRow();
    const numDataRows = lastRow - CONFIG_KPI.DATA_START_ROW;
    if (numDataRows <= 0) { results.push(`${tabName}: column added, no data rows`); continue; }

    const checkboxRange = sheet.getRange(CONFIG_KPI.DATA_START_ROW + 1, 1, numDataRows, 1);
    checkboxRange.insertCheckboxes();

    const seedResult = seedCheckboxesForTab(sheet, tabName, outputIndex);
    results.push(`${tabName}: column added, ${seedResult.checkedCount}/${numDataRows} rows already found in output`);
  }

  safeToast(ss, 'Checkbox column setup complete.');
  logAudit(ss, 'SUCCESS', `[SETUP] ${results.join(' | ')}`, { results });
  ui.alert('Setup complete', results.join('\n'), ui.ButtonSet.OK);
}

/**
 * Builds a lookup Set of "TabName|ConnectionID|ReportDate" keys from the
 * existing Monthly_Normalized and Weekly_Normalized tabs, used to seed initial
 * checkbox state.
 */
function buildOutputMatchIndex(ss) {
  const set = new Set();
  [CONFIG_KPI.OUTPUT_MONTHLY, CONFIG_KPI.OUTPUT_WEEKLY].forEach(tabName => {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    const values = sheet.getRange(2, 1, lastRow - 1, CONFIG_KPI.OUTPUT_HEADERS.length).getValues();
    values.forEach(row => {
      const key = buildOutputMatchKey(row[0], row[1], row[5]);
      if (key) set.add(key);
    });
  });
  return set;
}

/** Builds the "TabName|ConnectionID|ReportDate" match key used by the output index. */
function buildOutputMatchKey(sourceTab, connectionId, reportDate) {
  const tab = String(sourceTab || '').trim();
  const cid = String(connectionId || '').trim();
  const date = formatDate(reportDate);
  if (!tab || !date) return null;
  return `${tab}|${cid}|${date}`;
}

/** Checks off every row in a tab whose (tab, ConnectionID, Report Date) already appears in the output index. */
function seedCheckboxesForTab(sheet, tabName, outputIndex) {
  const allValues = sheet.getDataRange().getValues();
  const rowsToCheck = [];

  for (let r = CONFIG_KPI.DATA_START_ROW; r < allValues.length; r++) {
    const row = allValues[r];
    if (row.every(cell => cell === '' || cell === null || cell === undefined)) continue;

    const connectionId = row[CONFIG_KPI.HEADER_FIELDS.CONNECTION_ID];
    const reportDate = row[CONFIG_KPI.HEADER_FIELDS.REPORT_DATE];
    const key = buildOutputMatchKey(tabName, connectionId, reportDate);
    if (key && outputIndex.has(key)) {
      rowsToCheck.push(r + 1); // convert 0-indexed array row to 1-indexed sheet row
    }
  }

  applyCheckboxUpdates(sheet, rowsToCheck);
  return { checkedCount: rowsToCheck.length };
}

/**
 * Diagnostic tool: prints out, for one tab and one specific row, exactly
 * which column the script believes holds each field, along with the header
 * text and the actual value found there, and lists every KPI that has data
 * on that row. Use this whenever normalization checks off rows but doesn't
 * write output.
 */
function diagnoseColumnLayout() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const tabResp = ui.prompt('Diagnose Column Layout', 'Enter the submission tab name to check (e.g. AMZ):', ui.ButtonSet.OK_CANCEL);
  if (tabResp.getSelectedButton() !== ui.Button.OK) return;

  const tabName = tabResp.getResponseText().trim().toUpperCase();
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) { ui.alert('Tab not found: ' + tabName); return; }

  const rowResp = ui.prompt(
    'Diagnose Column Layout',
    `Which sheet row number to inspect? (Leave blank for the first data row, row ${CONFIG_KPI.DATA_START_ROW + 1}.) Tip: pick a row that's currently UNCHECKED and that you know has real KPI data entered.`,
    ui.ButtonSet.OK_CANCEL
  );
  if (rowResp.getSelectedButton() !== ui.Button.OK) return;

  const rowInput = rowResp.getResponseText().trim();
  const targetSheetRow = rowInput ? parseInt(rowInput, 10) : CONFIG_KPI.DATA_START_ROW + 1;
  if (!targetSheetRow || isNaN(targetSheetRow) || targetSheetRow < CONFIG_KPI.DATA_START_ROW + 1) {
    ui.alert(`Invalid row number. Must be ${CONFIG_KPI.DATA_START_ROW + 1} or higher.`);
    return;
  }
  const sampleRowIndex = targetSheetRow - 1; // convert to 0-indexed array position

  const allValues = sheet.getDataRange().getValues();
  if (allValues.length <= sampleRowIndex) {
    ui.alert(`Row ${targetSheetRow} doesn't exist on "${tabName}" — this tab only has ${allValues.length} row(s).`);
    return;
  }

  const checkboxHeaderRow = allValues[0];   // row 1 — only the checkbox column's own header lives here
  const kpiIdRow = allValues[CONFIG_KPI.KPI_ID_ROW];       // row 2 — actual KPI ID codes
  const fieldHeaderRow = allValues[CONFIG_KPI.KPI_LABEL_ROW]; // row 3 — field names + human-readable KPI names
  const sampleRow = allValues[sampleRowIndex];

  const colLetter = (idx) => String.fromCharCode(65 + idx);
  const describe = (label, colIdx) =>
    `Col ${colLetter(colIdx)} (${label}): header="${fieldHeaderRow[colIdx]}"  |  row ${targetSheetRow} value = "${sampleRow[colIdx]}"`;

  const lines = [];
  lines.push(`Tab: ${tabName}, row ${targetSheetRow}  (field headers read from row ${CONFIG_KPI.KPI_LABEL_ROW + 1}, KPI IDs from row ${CONFIG_KPI.KPI_ID_ROW + 1})`);
  lines.push('');
  lines.push(`--- Checkbox column (header lives on row 1) ---`);
  lines.push(`Col ${colLetter(CONFIG_KPI.CHECKBOX_COL)} (Checkbox): header="${checkboxHeaderRow[CONFIG_KPI.CHECKBOX_COL]}"  |  row ${targetSheetRow} value = "${sampleRow[CONFIG_KPI.CHECKBOX_COL]}"`);
  lines.push('');
  lines.push('--- Fields the script expects, and what it actually finds there ---');
  lines.push(describe('ConnectionID', CONFIG_KPI.HEADER_FIELDS.CONNECTION_ID));
  lines.push(describe('Timestamp', CONFIG_KPI.HEADER_FIELDS.TIMESTAMP));
  lines.push(describe('Email Address', CONFIG_KPI.HEADER_FIELDS.EMAIL_ADDRESS));
  lines.push(describe('VA Name', CONFIG_KPI.HEADER_FIELDS.VA_NAME));
  lines.push(describe('Work Email', CONFIG_KPI.HEADER_FIELDS.WORK_EMAIL));
  lines.push(describe('Client Name', CONFIG_KPI.HEADER_FIELDS.CLIENT_NAME));
  lines.push(describe('Report Type', CONFIG_KPI.HEADER_FIELDS.REPORT_TYPE));
  lines.push(describe('Report Date', CONFIG_KPI.HEADER_FIELDS.REPORT_DATE));
  lines.push('');
  const resolvedStartCol = getKpiStartCol(tabName);
  lines.push(`--- KPI columns (name detected from row ${CONFIG_KPI.KPI_LABEL_ROW + 1}, ID value read from row ${CONFIG_KPI.KPI_ID_ROW + 1}, starting at col ${colLetter(resolvedStartCol)}) ---`);

  const kpiMap = buildKpiMap(kpiIdRow, fieldHeaderRow, resolvedStartCol);
  if (kpiMap.length === 0) {
    lines.push(`⚠ No KPI columns detected — row ${CONFIG_KPI.KPI_LABEL_ROW + 1} is blank from the expected start column onward. This alone would explain "checked but not appended": every row would have nothing to write.`);
  } else {
    const withData = kpiMap.filter(k => sampleRow[k.targetCol] !== '' || sampleRow[k.actualCol] !== '');
    lines.push(`${kpiMap.length} KPI column(s) detected total. ${withData.length} have a target/actual value on row ${targetSheetRow}:`);
    if (withData.length === 0) {
      lines.push('(none — every KPI column is blank on this row, so there is genuinely nothing to write for it.)');
    } else {
      withData.forEach(k => {
        lines.push(`KPI "${k.kpiId}": target col ${colLetter(k.targetCol)} = "${sampleRow[k.targetCol]}"  |  actual col ${colLetter(k.actualCol)} = "${sampleRow[k.actualCol]}"`);
      });
    }
  }

  lines.push('');
  lines.push('Compare the "header=" text above to what you actually see in that column letter/row on your sheet. If they don\'t match, the columns have shifted relative to what the script expects.');

  ui.alert('Column Layout Diagnosis: ' + tabName, lines.join('\n'), ui.ButtonSet.OK);
}

/**
 * Builds a DETAILED index of every row currently in one output tab, grouped
 * by the (Source Tab, ConnectionID, Report Date) key — one entry per KPI row,
 * since a single submission row produces one output row per KPI. Includes
 * arrIndex (0-based position in the values array, i.e. sheet row = arrIndex + 2)
 * so matching rows can be deleted later if they turn out to be stale.
 *
 * Rows whose Report Date (or Source Tab) is blank can't form a valid key at
 * all — Report Date is supposed to be required in every output row, so a row
 * like this is already invalid data, most likely a leftover from an earlier
 * bug. These are collected separately in `invalidArrIndices` rather than
 * silently dropped, so the caller can clean them up.
 *
 * @returns {{map: Map, invalidArrIndices: number[]}}
 */
function buildDetailedOutputIndex(ss, outputTabName) {
  const map = new Map();
  const invalidArrIndices = [];
  const sheet = ss.getSheetByName(outputTabName);
  if (!sheet) return { map, invalidArrIndices };
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { map, invalidArrIndices };

  const values = sheet.getRange(2, 1, lastRow - 1, CONFIG_KPI.OUTPUT_HEADERS.length).getValues();
  values.forEach((row, i) => {
    const key = buildOutputMatchKey(row[0], row[1], row[5]);
    if (!key) {
      invalidArrIndices.push(i); // blank Report Date (or Source Tab) — invalid, should never have been written
      return;
    }
    const entry = {
      arrIndex: i,
      connectionId: row[1],
      vaName: row[2],
      workEmail: row[3],
      clientName: row[4],
      kpiId: row[6],
      target: row[7],
      actual: row[8],
    };
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  });
  return { map, invalidArrIndices };
}

/**
 * Builds a comparable signature string for a set of {kpiId, target, actual}
 * entries — order-independent, so it can be compared between "what the
 * submission row currently has" and "what the output tab currently has" to
 * detect any change (new KPI, removed KPI, or an edited value).
 */
function buildKpiSignature(kpiEntries) {
  return kpiEntries
    .map(k => `${k.kpiId}::${String(k.target)}::${String(k.actual)}`)
    .sort()
    .join('||');
}

/**
 * Deletes specific rows (by 0-based arrIndex, from a snapshot read via
 * buildDetailedOutputIndex) out of an output tab, in a single rewrite —
 * used to remove stale rows once a submission has been found to have changed.
 * @returns {number} how many rows were actually removed
 */
function deleteOutputRowsByArrIndex(ss, outputTabName, arrIndexSet) {
  if (!arrIndexSet || arrIndexSet.size === 0) return 0;
  const sheet = ss.getSheetByName(outputTabName);
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  const values = sheet.getRange(2, 1, lastRow - 1, CONFIG_KPI.OUTPUT_HEADERS.length).getValues();
  const kept = values.filter((row, i) => !arrIndexSet.has(i));
  const deletedCount = values.length - kept.length;
  if (deletedCount === 0) return 0;

  sheet.getRange(2, 1, values.length, CONFIG_KPI.OUTPUT_HEADERS.length).clearContent();
  if (kept.length > 0) {
    sheet.getRange(2, 1, kept.length, CONFIG_KPI.OUTPUT_HEADERS.length).setValues(kept);
  }
  return deletedCount;
}

/**
 * Rechecks EVERY submission row on every tab against what's actually present
 * in Monthly_Normalized / Weekly_Normalized right now, and brings the
 * checkbox — and the output tables — back in line with reality:
 *
 *   - Never normalized (no matching output rows at all) -> checkbox FALSE.
 *   - Found in output AND content still matches (same VA Name/Work Email/
 *     Client Name, and the exact same set of KPI target/actual values) ->
 *     checkbox stays/becomes TRUE, output untouched.
 *   - Found in output BUT the submission has since changed (a KPI value was
 *     edited, VA/Client/Email was corrected, or the Report Type switched
 *     between Weekly/Monthly so it now belongs in the other output tab) ->
 *     the STALE output rows are deleted, and the checkbox is set FALSE so
 *     the next normalization run rewrites it fresh with current data.
 *
 * NOTE ON MANUALLY DELETED SUBMISSION ROWS: this recheck only iterates rows
 * that currently EXIST on each submission tab. If a submission row was
 * deleted outright (e.g. a retention cleanup), there's nothing left to
 * iterate for it — its corresponding output rows in Monthly_Normalized /
 * Weekly_Normalized (if any) are simply left as-is; they are NOT treated as
 * stale by this pass, since there's no current row to compare them against.
 * That's intentional: those output rows are historical KPI records, not
 * live-vs-source cache entries. This will only be a discrepancy for periods
 * summarized by KPI_Weekly_Summary/KPI_Monthly_Summary that also apply their
 * own trailing retention window (currently 35 days) — see the summary
 * generator — since both are pruned to a similar horizon in practice.
 *
 * Matching uses the (Source Tab, ConnectionID, Report Date) key, same as
 * initial setup seeding — see buildOutputMatchKey(). Reporting is via a
 * toast plus an Audit_Log entry, not a dialog — see recheckAllAgainstNormalizedTable()
 * below for the menu-bound entry point, and recheckAllAgainstNormalizedTableCore()
 * for the trigger-safe version used by recheckThenNormalize().
 *
 * KNOWN LIMITATION: if ConnectionID itself is corrected (e.g. from "Data
 * Mismatch" to a real ID), the match key changes entirely, so any old output
 * rows filed under the previous ConnectionID won't be found or cleaned up by
 * key lookup alone — they'd need a manual check/removal in that specific case.
 */
/**
 * Menu-bound entry point for the recheck. Runs the core reconciliation logic
 * (see recheckAllAgainstNormalizedTableCore()) and lets it handle reporting —
 * a toast plus an Audit_Log entry. No modal dialog; check the Audit_Log tab
 * for the full summary of what changed.
 */
function recheckAllAgainstNormalizedTable() {
  recheckAllAgainstNormalizedTableCore();
}

/**
 * Trigger-safe core of the recheck logic (no ui.alert) — see
 * recheckAllAgainstNormalizedTable() for the full behavior description.
 * Used directly by recheckThenNormalize() for unattended/trigger use.
 * @returns {{message: string}}
 */
function recheckAllAgainstNormalizedTableCore() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const { map: monthlyIndex, invalidArrIndices: monthlyInvalid } = buildDetailedOutputIndex(ss, CONFIG_KPI.OUTPUT_MONTHLY);
  const { map: weeklyIndex, invalidArrIndices: weeklyInvalid } = buildDetailedOutputIndex(ss, CONFIG_KPI.OUTPUT_WEEKLY);

  // Rows with a blank Report Date (or Source Tab) are already invalid — Report Date
  // is required in every output row — and can never be matched back to a submission
  // key, so they'd otherwise sit there forever unmanaged. Queue them for deletion
  // right away, independent of the per-submission-row comparison below.
  const monthlyArrIndicesToDelete = new Set(monthlyInvalid);
  const weeklyArrIndicesToDelete = new Set(weeklyInvalid);
  const results = [];
  const changedRowDetails = []; // diagnostic detail per changed row, capped below
  const MAX_CHANGED_DETAILS = 20;
  let wrongTableCount = 0;
  let duplicateOutputCount = 0;
  let valueMismatchCount = 0;
  let nameMismatchCount = 0;

  for (const tabName of CONFIG_KPI.SUBMISSION_TABS) {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) { results.push(`${tabName}: tab not found`); continue; }

    const allValues = sheet.getDataRange().getValues();
    if (allValues.length < CONFIG_KPI.DATA_START_ROW + 1) {
      results.push(`${tabName}: no data rows`);
      continue;
    }

    const kpiMap = buildKpiMap(allValues[CONFIG_KPI.KPI_ID_ROW], allValues[CONFIG_KPI.KPI_LABEL_ROW], getKpiStartCol(tabName));

    const trueRows = [];
    const falseRows = [];
    let unchangedCount = 0;
    let changedCount = 0;
    let newCount = 0;

    for (let r = CONFIG_KPI.DATA_START_ROW; r < allValues.length; r++) {
      const row = allValues[r];
      if (row.every(cell => cell === '' || cell === null || cell === undefined)) continue;

      const connectionId = row[CONFIG_KPI.HEADER_FIELDS.CONNECTION_ID];
      const vaName       = row[CONFIG_KPI.HEADER_FIELDS.VA_NAME];
      const workEmail    = row[CONFIG_KPI.HEADER_FIELDS.WORK_EMAIL];
      const clientName   = row[CONFIG_KPI.HEADER_FIELDS.CLIENT_NAME];
      const reportType   = String(row[CONFIG_KPI.HEADER_FIELDS.REPORT_TYPE] || '').trim().toLowerCase();
      const reportDate   = row[CONFIG_KPI.HEADER_FIELDS.REPORT_DATE];
      const sheetRowNum  = r + 1;

      const key = buildOutputMatchKey(tabName, connectionId, reportDate);
      if (!key) { falseRows.push(sheetRowNum); newCount++; continue; } // no usable Report Date — can't match, leave unchecked

      const isMonthly = CONFIG_KPI.MONTHLY_KEYWORDS.some(k => reportType.includes(k));
      const isWeekly  = CONFIG_KPI.WEEKLY_KEYWORDS.some(k  => reportType.includes(k));
      const destinationIsWeekly = isWeekly || !isMonthly;

      const primaryIndex = destinationIsWeekly ? weeklyIndex : monthlyIndex;
      const otherIndex = destinationIsWeekly ? monthlyIndex : weeklyIndex;
      const primaryEntries = primaryIndex.get(key) || [];
      const otherEntries = otherIndex.get(key) || [];

      if (primaryEntries.length === 0 && otherEntries.length === 0) {
        falseRows.push(sheetRowNum);
        newCount++;
        continue; // never normalized — nothing stale to delete
      }

      // Current KPI values for this row, in the same shape the output rows use —
      // only pairs with at least one non-blank value, matching what would actually be written.
      const currentKpis = kpiMap
        .map(({ kpiId, targetCol, actualCol }) => ({
          kpiId,
          target: row[targetCol] !== undefined ? row[targetCol] : '',
          actual: row[actualCol] !== undefined ? row[actualCol] : '',
        }))
        .filter(k => k.target !== '' || k.actual !== '');
      const currentSignature = buildKpiSignature(currentKpis);

      let isChanged = false;
      const reasons = [];

      // Data sitting in the WRONG output table (Report Type was switched Weekly<->Monthly
      // since this was last normalized) is always stale, regardless of content.
      if (otherEntries.length > 0) {
        isChanged = true;
        reasons.push('wrong_table');
        wrongTableCount++;
        otherEntries.forEach(e => (destinationIsWeekly ? monthlyArrIndicesToDelete : weeklyArrIndicesToDelete).add(e.arrIndex));
      }

      if (primaryEntries.length > 0) {
        // Detect duplicate output rows for the same kpiId — e.g. leftover from an
        // earlier double-write. Duplicates alone make the signature comparison
        // below fail forever (the current row only has each kpiId once), even
        // though nothing about the submission itself actually changed.
        const kpiIdCounts = {};
        primaryEntries.forEach(e => { kpiIdCounts[e.kpiId] = (kpiIdCounts[e.kpiId] || 0) + 1; });
        const duplicateKpiIds = Object.keys(kpiIdCounts).filter(id => kpiIdCounts[id] > 1);

        const existingSignature = buildKpiSignature(primaryEntries.map(e => ({ kpiId: e.kpiId, target: e.target, actual: e.actual })));
        const first = primaryEntries[0];
        const namesMatch = first &&
          String(first.vaName) === String(vaName) &&
          String(first.workEmail) === String(workEmail) &&
          String(first.clientName) === String(clientName);

        if (existingSignature !== currentSignature || !namesMatch) {
          isChanged = true;
          if (duplicateKpiIds.length > 0) { reasons.push('duplicate_output_rows'); duplicateOutputCount++; }
          if (!namesMatch) { reasons.push('name_field_mismatch'); nameMismatchCount++; }
          if (existingSignature !== currentSignature && duplicateKpiIds.length === 0) { reasons.push('kpi_value_mismatch'); valueMismatchCount++; }
          primaryEntries.forEach(e => (destinationIsWeekly ? weeklyArrIndicesToDelete : monthlyArrIndicesToDelete).add(e.arrIndex));

          if (changedRowDetails.length < MAX_CHANGED_DETAILS) {
            changedRowDetails.push({
              tab: tabName, row: sheetRowNum, reasons,
              duplicateKpiIds,
              existingSignature: existingSignature.slice(0, 300),
              currentSignature: currentSignature.slice(0, 300),
              existingNames: first ? { vaName: first.vaName, workEmail: first.workEmail, clientName: first.clientName } : null,
              currentNames: { vaName, workEmail, clientName },
            });
          }
        }
      }

      if (isChanged) {
        falseRows.push(sheetRowNum);
        changedCount++;
      } else {
        trueRows.push(sheetRowNum);
        unchangedCount++;
      }
    }

    applyCheckboxUpdates(sheet, trueRows, true);
    applyCheckboxUpdates(sheet, falseRows, false);
    results.push(`${tabName}: ${unchangedCount} unchanged, ${changedCount} changed (reset for renormalization), ${newCount} new/unmatched`);
  }

  const monthlyDeletedCount = deleteOutputRowsByArrIndex(ss, CONFIG_KPI.OUTPUT_MONTHLY, monthlyArrIndicesToDelete);
  const weeklyDeletedCount = deleteOutputRowsByArrIndex(ss, CONFIG_KPI.OUTPUT_WEEKLY, weeklyArrIndicesToDelete);
  const invalidMsg = (monthlyInvalid.length + weeklyInvalid.length) > 0
    ? ` (including ${monthlyInvalid.length} Monthly / ${weeklyInvalid.length} Weekly row(s) that already had a blank Report Date and were purged as invalid)`
    : '';
  const reasonMsg = (wrongTableCount + duplicateOutputCount + valueMismatchCount + nameMismatchCount) > 0
    ? ` | Changed-row reasons — wrong table: ${wrongTableCount}, duplicate output rows: ${duplicateOutputCount}, KPI value differs: ${valueMismatchCount}, name field differs: ${nameMismatchCount}`
    : '';

  const message = results.join(' | ') + ` || Stale output rows deleted — Monthly: ${monthlyDeletedCount}, Weekly: ${weeklyDeletedCount}${invalidMsg}${reasonMsg}`;

  safeToast(ss, 'Recheck against normalized tables complete.');
  logAudit(ss, 'SUCCESS', `[RECHECK-VS-OUTPUT] ${message}`, {
    results, monthlyDeletedCount, weeklyDeletedCount,
    blankReportDateRowsPurged: { monthly: monthlyInvalid.length, weekly: weeklyInvalid.length },
    changedRowReasonCounts: { wrongTableCount, duplicateOutputCount, valueMismatchCount, nameMismatchCount },
    changedRowSampleDetails: changedRowDetails,
  });

  return { message };
}

/** Sets column A (checkbox) to the given boolean for the given 1-indexed sheet row numbers, in a single batched call. */
function applyCheckboxUpdates(sheet, sheetRowNumbers, value) {
  if (!sheetRowNumbers || sheetRowNumbers.length === 0) return;
  const boolValue = value === undefined ? true : value;
  const a1Ranges = sheetRowNumbers.map(r => `A${r}`);
  sheet.getRangeList(a1Ranges).setValue(boolValue);
}


// ============================================================
// Processing Logic
// ============================================================

/**
 * Scans one submission tab starting at `startRowIndex`, skipping any row
 * already checked TRUE. Rows outside the current scope's report type are left
 * completely untouched (not written, not checked). Error-ConnectionID rows
 * and rows with no usable Report Date are left unchecked and counted as
 * "needs attention" rather than written.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} tabName
 * @param {number} startRowIndex - 0-based row index (into getDataRange values) to start at
 * @param {number} startTime - Date.now() at the start of this run, for the time budget check
 * @param {string} scope - CONFIG_KPI.SCOPES.ALL / MONTHLY / WEEKLY
 * @returns {{monthly: Array[], weekly: Array[], rowsToCheck: number[], needsAttentionCount: number, timedOut: boolean, resumeRowIndex?: number}}
 */
function normalizeTabUnprocessed(sheet, tabName, startRowIndex, startTime, scope) {
  const allValues = sheet.getDataRange().getValues();
  const monthly = [];
  const weekly = [];
  const rowsToCheck = [];
  let needsAttentionCount = 0;

  if (allValues.length < 3) {
    return { monthly, weekly, rowsToCheck, needsAttentionCount, timedOut: false, kpiMapEmpty: false };
  }

  const kpiMap = buildKpiMap(allValues[CONFIG_KPI.KPI_ID_ROW], allValues[CONFIG_KPI.KPI_LABEL_ROW], getKpiStartCol(tabName));

  // Safety net: if no KPI columns are detected at all, this tab's row layout doesn't
  // match what the script expects (e.g. KPI_ID_ROW pointing at the wrong sheet row).
  // Processing anyway would check every row off with nothing ever written — so
  // instead, skip the whole tab and surface it loudly rather than silently.
  if (kpiMap.length === 0) {
    return { monthly, weekly, rowsToCheck, needsAttentionCount, timedOut: false, kpiMapEmpty: true };
  }

  const includeMonthly = scope !== CONFIG_KPI.SCOPES.WEEKLY;
  const includeWeekly  = scope !== CONFIG_KPI.SCOPES.MONTHLY;

  // Guard against a checkpoint (or caller-supplied start) that's out of
  // range for this tab's *current* size — e.g. rows were deleted below the
  // saved position since the checkpoint was written. Clamp rather than let
  // the loop below simply not execute and look like "nothing to do."
  const safeStartRowIndex = Math.min(Math.max(startRowIndex, CONFIG_KPI.DATA_START_ROW), allValues.length);

  for (let r = safeStartRowIndex; r < allValues.length; r++) {
    if ((r - safeStartRowIndex) % CONFIG_KPI.ROWS_PER_TIME_CHECK === 0 && isOverTimeBudget(startTime)) {
      return { monthly, weekly, rowsToCheck, needsAttentionCount, timedOut: true, resumeRowIndex: r };
    }

    const row = allValues[r];
    if (row.every(cell => cell === '' || cell === null || cell === undefined)) continue;
    if (row[CONFIG_KPI.CHECKBOX_COL] === true) continue; // already normalized — skip cheaply

    const connectionId = row[CONFIG_KPI.HEADER_FIELDS.CONNECTION_ID];
    const vaName       = row[CONFIG_KPI.HEADER_FIELDS.VA_NAME];
    const workEmail    = row[CONFIG_KPI.HEADER_FIELDS.WORK_EMAIL];
    const clientName   = row[CONFIG_KPI.HEADER_FIELDS.CLIENT_NAME];
    const reportType   = String(row[CONFIG_KPI.HEADER_FIELDS.REPORT_TYPE] || '').trim().toLowerCase();
    const reportDate   = formatDate(row[CONFIG_KPI.HEADER_FIELDS.REPORT_DATE]);

    const isMonthly = CONFIG_KPI.MONTHLY_KEYWORDS.some(k => reportType.includes(k));
    const isWeekly  = CONFIG_KPI.WEEKLY_KEYWORDS.some(k  => reportType.includes(k));
    // Unrecognised report type defaults to Weekly, matching the original convention.
    const destinationIsWeekly = isWeekly || !isMonthly;

    if (destinationIsWeekly && !includeWeekly) continue;  // out of scope this run — leave unchecked for later
    if (!destinationIsWeekly && !includeMonthly) continue;

    const cid = String(connectionId || '').trim().toUpperCase();
    const isErrorRow = cid === '' || CONFIG_KPI.ERROR_CONNECTION_IDS.some(e => e.toUpperCase() === cid);
    if (isErrorRow) {
      needsAttentionCount++;
      continue; // leave unchecked — bad/missing ConnectionID, will be retried every run until corrected
    }

    if (!reportDate) {
      needsAttentionCount++;
      continue; // leave unchecked — Report Date is required for output
    }

    let wroteAnyKpi = false;
    for (const { kpiId, targetCol, actualCol } of kpiMap) {
      const target = row[targetCol] !== undefined ? row[targetCol] : '';
      const actual = row[actualCol] !== undefined ? row[actualCol] : '';
      if (target === '' && actual === '') continue;

      const outputRow = [tabName, connectionId, vaName, workEmail, clientName, reportDate, kpiId, target, actual];
      wroteAnyKpi = true;

      if (destinationIsWeekly) {
        weekly.push(outputRow);
      } else {
        monthly.push(outputRow);
      }
    }

    // Whether or not there was KPI data to write, this row has now been fully
    // considered under this scope — check it off so it isn't rescanned forever.
    rowsToCheck.push(r + 1); // convert 0-indexed array row to 1-indexed sheet row
    if (!wroteAnyKpi) {
      console.warn(`${tabName}: row ${r + 1} had no KPI target/actual values — checked off with nothing to normalize.`);
    }
  }

  return { monthly, weekly, rowsToCheck, needsAttentionCount, timedOut: false };
}

/**
 * Date-bounded scan used by the targeted-normalization modal. Ignores the
 * checkbox for selection (the user is explicitly asking to (re)normalize this
 * exact tab + window), but returns the row numbers touched so the caller can
 * check them off afterward for consistency with the main engine.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} tabName
 * @param {Date} startDate - inclusive
 * @param {Date} endDate - inclusive
 * @returns {{monthly: Array[], weekly: Array[], rowsToCheck: number[], skipped: boolean, reason?: string, skippedNoDateCount: number}}
 */
function processTabForRange(sheet, tabName, startDate, endDate) {
  const allValues = sheet.getDataRange().getValues();

  if (allValues.length < 3) {
    return { monthly: [], weekly: [], rowsToCheck: [], skipped: false, skippedNoDateCount: 0 };
  }

  const kpiMap = buildKpiMap(allValues[CONFIG_KPI.KPI_ID_ROW], allValues[CONFIG_KPI.KPI_LABEL_ROW], getKpiStartCol(tabName));
  if (kpiMap.length === 0) {
    return {
      monthly: [], weekly: [], rowsToCheck: [], skipped: true, skippedNoDateCount: 0,
      reason: `No KPI columns detected at row ${CONFIG_KPI.KPI_LABEL_ROW + 1} — check the sheet's header layout (run Diagnose Column Layout).`,
    };
  }

  const candidates = []; // { row, sheetRowNum }
  let skippedNoDateCount = 0;

  for (let r = CONFIG_KPI.DATA_START_ROW; r < allValues.length; r++) {
    const row = allValues[r];
    if (row.every(cell => cell === '' || cell === null || cell === undefined)) continue;

    const rowDate = coerceDate(row[CONFIG_KPI.HEADER_FIELDS.REPORT_DATE]) ||
                    coerceDate(row[CONFIG_KPI.HEADER_FIELDS.TIMESTAMP]);

    if (!rowDate) {
      skippedNoDateCount++;
      continue;
    }
    if (rowDate < startDate || rowDate > endDate) continue;

    candidates.push({ row, sheetRowNum: r + 1 });
  }

  const total = candidates.length;
  let errorCount = 0;
  for (const { row } of candidates) {
    const cid = String(row[CONFIG_KPI.HEADER_FIELDS.CONNECTION_ID] || '').trim().toUpperCase();
    if (cid === '' || CONFIG_KPI.ERROR_CONNECTION_IDS.some(e => e.toUpperCase() === cid)) errorCount++;
  }
  const errorRatio = total > 0 ? errorCount / total : 0;
  const ERROR_ID_SKIP_THRESHOLD = 0.9;

  if (total > 0 && errorRatio >= ERROR_ID_SKIP_THRESHOLD) {
    return {
      monthly: [], weekly: [], rowsToCheck: [], skipped: true, skippedNoDateCount,
      reason: `${errorCount}/${total} rows (${(errorRatio * 100).toFixed(1)}%) are error ConnectionIDs`,
    };
  }

  const monthly = [];
  const weekly = [];
  const rowsToCheck = [];

  for (const { row, sheetRowNum } of candidates) {
    const connectionId = row[CONFIG_KPI.HEADER_FIELDS.CONNECTION_ID];
    const vaName       = row[CONFIG_KPI.HEADER_FIELDS.VA_NAME];
    const workEmail    = row[CONFIG_KPI.HEADER_FIELDS.WORK_EMAIL];
    const clientName   = row[CONFIG_KPI.HEADER_FIELDS.CLIENT_NAME];
    const reportType   = String(row[CONFIG_KPI.HEADER_FIELDS.REPORT_TYPE] || '').trim().toLowerCase();
    const reportDate   = formatDate(row[CONFIG_KPI.HEADER_FIELDS.REPORT_DATE]);

    const cid = String(connectionId || '').trim().toUpperCase();
    if (cid === '' || CONFIG_KPI.ERROR_CONNECTION_IDS.some(e => e.toUpperCase() === cid)) continue; // leave unchecked — bad/missing ConnectionID

    const isMonthly = CONFIG_KPI.MONTHLY_KEYWORDS.some(k => reportType.includes(k));
    const isWeekly  = CONFIG_KPI.WEEKLY_KEYWORDS.some(k  => reportType.includes(k));
    const destinationIsWeekly = isWeekly || !isMonthly;

    let wroteAnyKpi = false;
    for (const { kpiId, targetCol, actualCol } of kpiMap) {
      const target = row[targetCol] !== undefined ? row[targetCol] : '';
      const actual = row[actualCol] !== undefined ? row[actualCol] : '';
      if (target === '' && actual === '') continue;

      const outputRow = [tabName, connectionId, vaName, workEmail, clientName, reportDate, kpiId, target, actual];
      wroteAnyKpi = true;

      if (destinationIsWeekly) {
        weekly.push(outputRow);
      } else {
        monthly.push(outputRow);
      }
    }

    if (wroteAnyKpi) rowsToCheck.push(sheetRowNum);
  }

  return { monthly, weekly, rowsToCheck, skipped: false, skippedNoDateCount };
}

/**
 * Builds a map of { kpiId, targetCol, actualCol } for every KPI column pair,
 * starting the scan at `startCol` (the resolved per-tab KPI start column —
 * see getKpiStartCol()). Which columns hold a KPI pair is detected from
 * KPI_LABEL_ROW (row 3 — human-readable KPI names, alongside the other field
 * headers), since that's where a reliable non-blank marker exists for each
 * pair. The actual kpiId VALUE stored in the output tabs always comes from
 * KPI_ID_ROW (row 2) at that same column — never from the label row, even if
 * row 2 is unexpectedly blank for that column (a blank ID is surfaced via a
 * console warning rather than silently substituting the name).
 *
 * @param {Array} idRow - allValues[CONFIG_KPI.KPI_ID_ROW] (row 2)
 * @param {Array} labelRow - allValues[CONFIG_KPI.KPI_LABEL_ROW] (row 3)
 * @param {number} startCol - resolved via getKpiStartCol(tabName)
 */
function buildKpiMap(idRow, labelRow, startCol) {
  const map = [];
  let col = startCol;
  const detectRow = labelRow || idRow;

  while (col < detectRow.length) {
    const labelValue = String(detectRow[col] || '').trim();
    if (labelValue !== '') {
      const idValue = String((idRow && idRow[col]) || '').trim();
      if (idValue === '') {
        console.warn(`KPI column at index ${col} (label "${labelValue}") has a blank ID in row ${CONFIG_KPI.KPI_ID_ROW + 1} — using a blank kpiId rather than falling back to the label.`);
      }
      map.push({ kpiId: idValue, targetCol: col, actualCol: col + 1 });
      col += 2;
    } else {
      col++;
    }
  }
  return map;
}

/**
 * Filters out any output row whose Report Date column (index 5) is blank —
 * a final safety net right before every write.
 * @param {Array[]} rows
 * @returns {{kept: Array[], skippedCount: number}}
 */
function filterMissingReportDate(rows) {
  let skippedCount = 0;
  const kept = rows.filter(row => {
    const hasDate = row[5] !== '' && row[5] !== null && row[5] !== undefined;
    if (!hasDate) skippedCount++;
    return hasDate;
  });
  return { kept, skippedCount };
}

/** Appends rows to an output tab without touching any existing content. */
/** Appends rows to an output tab without touching any existing content, then re-sorts the whole tab by Report Date. */
function writeOutputTabAppend(ss, tabName, rows) {
  const sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
  writeOutputHeader(sheet);

  if (rows.length === 0) return;

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, CONFIG_KPI.OUTPUT_HEADERS.length).setValues(rows);
  sheet.autoResizeColumns(1, CONFIG_KPI.OUTPUT_HEADERS.length);

  sortOutputTabByReportDate(sheet);
}

/**
 * Sorts an output tab's data rows (everything below the header) by Report
 * Date ascending. Report Date is stored as a 'yyyy-MM-dd' string (see
 * formatDate()), so a plain lexicographic sort already puts it in correct
 * chronological order. Column 6 = Report Date (see CONFIG_KPI.OUTPUT_HEADERS).
 */
function sortOutputTabByReportDate(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 2) return; // 0 or 1 data row — nothing to sort
  const reportDateCol = CONFIG_KPI.OUTPUT_HEADERS.indexOf('Report Date') + 1; // 1-indexed sheet column
  sheet.getRange(2, 1, lastRow - 1, CONFIG_KPI.OUTPUT_HEADERS.length).sort({ column: reportDateCol, ascending: true });
}

function writeOutputHeader(sheet) {
  sheet.getRange(1, 1, 1, CONFIG_KPI.OUTPUT_HEADERS.length)
       .setValues([CONFIG_KPI.OUTPUT_HEADERS])
       .setFontWeight('bold')
       .setBackground('#4A90D9')
       .setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);
}

/** Formats a cell value as a readable date string, or returns it as-is. */
function formatDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value).trim();
}

/** Parses a cell value into a comparable Date object, or null if not parseable. */
function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Parses a 'yyyy-MM-dd' string (the format an HTML <input type="date"> sends) into
 * a local Date. Used by the targeted normalization modal.
 * @param {string} dateStr - 'yyyy-MM-dd'
 * @param {boolean} endOfDay - if true, sets the time to 23:59:59.999 (for an inclusive end date)
 * @returns {Date|null}
 */
function parseDialogDate(dateStr, endOfDay) {
  if (!dateStr) return null;
  const parts = String(dateStr).split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return isNaN(date.getTime()) ? null : date;
}


// ============================================================
// Targeted Normalization Modal (one department + one date range)
// ============================================================

/**
 * Opens the "Normalize Specific Tab + Date Range" modal. The HTML is built as
 * an inline template string so the whole feature lives in this one .gs file.
 */
function showTargetedNormalizationDialog() {
  const html = HtmlService.createHtmlOutput(buildTargetedNormalizationModalHtml_())
    .setWidth(420)
    .setHeight(430);
  SpreadsheetApp.getUi().showModalDialog(html, 'Normalize Specific Department + Date Range');
}

/** Builds the modal's HTML, with the department dropdown options baked in server-side. */
function buildTargetedNormalizationModalHtml_() {
  const optionsHtml = CONFIG_KPI.SUBMISSION_TABS.map(tab => {
    const label = (CONFIG_KPI.DEPARTMENT_LABELS && CONFIG_KPI.DEPARTMENT_LABELS[tab]) || tab;
    return `<option value="${tab}">${label}</option>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <style>
    body { font-family: Arial, sans-serif; padding: 14px; font-size: 13px; color: #222; }
    label { display: block; margin-top: 12px; font-weight: bold; }
    select, input[type="date"] {
      width: 100%; padding: 6px; margin-top: 4px; box-sizing: border-box;
      border: 1px solid #ccc; border-radius: 4px; font-size: 13px;
    }
    .row { display: flex; gap: 10px; }
    .row > div { flex: 1; }
    button {
      margin-top: 18px; padding: 8px 16px; cursor: pointer;
      background: #4A90D9; color: #fff; border: none; border-radius: 4px; font-size: 13px;
    }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    #status { margin-top: 12px; font-size: 12px; white-space: pre-wrap; line-height: 1.4; }
    .error { color: #b00020; }
    .success { color: #1a7f37; }
    .hint { color: #666; font-size: 11px; margin-top: 2px; }
  </style>
</head>
<body>
  <label for="dept">Department</label>
  <select id="dept">${optionsHtml}</select>

  <div class="row">
    <div>
      <label for="startDate">Start date</label>
      <input type="date" id="startDate">
    </div>
    <div>
      <label for="endDate">End date</label>
      <input type="date" id="endDate">
    </div>
  </div>
  <div class="hint">Both dates are inclusive. Rows in this window are normalized and checked off regardless of current checkbox state.</div>

  <button id="runBtn" onclick="runNormalization()">Normalize</button>
  <div id="status"></div>

  <script>
    function runNormalization() {
      const dept = document.getElementById('dept').value;
      const startDate = document.getElementById('startDate').value;
      const endDate = document.getElementById('endDate').value;
      const status = document.getElementById('status');
      const btn = document.getElementById('runBtn');

      if (!dept || !startDate || !endDate) {
        status.innerHTML = '<span class="error">Please fill in department, start date, and end date.</span>';
        return;
      }

      btn.disabled = true;
      status.innerHTML = 'Running…';

      google.script.run
        .withSuccessHandler(result => {
          btn.disabled = false;
          status.innerHTML = '<span class="' + (result.success ? 'success' : 'error') + '">' + result.message + '</span>';
        })
        .withFailureHandler(err => {
          btn.disabled = false;
          status.innerHTML = '<span class="error">Error: ' + err.message + '</span>';
        })
        .runTargetedNormalization(dept, startDate, endDate);
    }
  </script>
</body>
</html>`;
}

/**
 * Normalizes ONE submission tab for ONE date range (both Monthly and Weekly
 * report types included — whichever each row's Report Type indicates), APPENDS
 * the freshly normalized rows to the matching output tab, and checks off every
 * row that was written. Because this appends rather than replacing a window,
 * re-running it over already-normalized rows would duplicate them — that's why
 * it checks rows off, so a second run over the same range is a no-op unless
 * you first uncheck those rows (e.g. via "Force Recheck All" or manually).
 *
 * @param {string} tabName - one of CONFIG_KPI.SUBMISSION_TABS, e.g. 'AMZ'
 * @param {string} startDateStr - 'yyyy-MM-dd', inclusive
 * @param {string} endDateStr - 'yyyy-MM-dd', inclusive
 * @returns {{success: boolean, message: string}}
 */
function runTargetedNormalization(tabName, startDateStr, endDateStr) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (CONFIG_KPI.SUBMISSION_TABS.indexOf(tabName) === -1) {
    throw new Error(`Unknown department/tab: ${tabName}`);
  }

  const startDate = parseDialogDate(startDateStr, false);
  const endDate = parseDialogDate(endDateStr, true);
  if (!startDate || !endDate) {
    throw new Error('Please provide a valid start and end date.');
  }
  if (startDate > endDate) {
    throw new Error('Start date must be on or before the end date.');
  }

  const sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    throw new Error(`Tab "${tabName}" was not found in this spreadsheet.`);
  }

  try {
    safeToast(ss, `Normalizing ${tabName} for ${startDateStr} to ${endDateStr}…`);

    const result = processTabForRange(sheet, tabName, startDate, endDate);

    if (result.skipped) {
      const msg = `${tabName}: skipped — ${result.reason}`;
      safeToast(ss, msg);
      logAudit(ss, 'PARTIAL', `[TARGETED] ${msg}`, { tabName, startDate: startDateStr, endDate: endDateStr, reason: result.reason });
      return { success: false, message: msg };
    }

    const monthlyFiltered = filterMissingReportDate(result.monthly);
    const weeklyFiltered  = filterMissingReportDate(result.weekly);

    if (monthlyFiltered.kept.length > 0) writeOutputTabAppend(ss, CONFIG_KPI.OUTPUT_MONTHLY, monthlyFiltered.kept);
    if (weeklyFiltered.kept.length > 0)  writeOutputTabAppend(ss, CONFIG_KPI.OUTPUT_WEEKLY, weeklyFiltered.kept);

    applyCheckboxUpdates(sheet, result.rowsToCheck);

    let summary = `Done — ${tabName}, ${startDateStr} to ${endDateStr}: `
      + `added ${monthlyFiltered.kept.length} Monthly row(s), ${weeklyFiltered.kept.length} Weekly row(s). `
      + `Checked off ${result.rowsToCheck.length} submission row(s).`;

    if (result.skippedNoDateCount > 0) {
      summary += ` ${result.skippedNoDateCount} source row(s) had no usable date and were excluded.`;
    }

    safeToast(ss, 'Targeted normalization complete.');
    logAudit(ss, 'SUCCESS', `[TARGETED] ${summary}`, {
      tabName, startDate: startDateStr, endDate: endDateStr,
      newMonthlyRows: monthlyFiltered.kept.length, newWeeklyRows: weeklyFiltered.kept.length,
      checkedOff: result.rowsToCheck.length, sourceRowsSkippedNoDate: result.skippedNoDateCount,
    });

    return { success: true, message: summary };

  } catch (err) {
    console.error('runTargetedNormalization error:', err);
    logAudit(ss, 'ERROR', `[TARGETED] ${tabName} ${startDateStr}-${endDateStr}: ${err.message}`, { tabName, stack: err.stack });
    throw err; // surfaces to the modal's failure handler
  }
}


// ============================================================
// Audit Log & Trigger-safe UI helpers
// ============================================================

/** Ensures the Audit_Log sheet exists with headers, and returns it. */
function ensureAuditLogSheet(ss) {
  let sheet = ss.getSheetByName(CONFIG_KPI.AUDIT_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_KPI.AUDIT_LOG_SHEET);
    sheet.getRange(1, 1, 1, 5)
         .setValues([['Timestamp', 'Status', 'Summary', 'Details (JSON)', 'Run Type']])
         .setFontWeight('bold')
         .setBackground('#333333')
         .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(3, 420);
    sheet.setColumnWidth(4, 420);
  }
  return sheet;
}

/** Appends one row to the Audit_Log tab describing the outcome of a run. */
function logAudit(ss, status, summaryText, details) {
  const sheet = ensureAuditLogSheet(ss);
  sheet.appendRow([
    new Date(),
    status,
    summaryText,
    JSON.stringify(details),
    isRunningFromTrigger() ? 'Time-driven trigger' : 'Manual (menu)',
  ]);
}

/** True if called with no active user/UI session (i.e. from a time-driven trigger). */
function isRunningFromTrigger() {
  try {
    SpreadsheetApp.getUi();
    return false;
  } catch (e) {
    return true;
  }
}

/** Toast that never throws, since some contexts (rare) may not support it either. */
function safeToast(ss, msg) {
  try {
    ss.toast(msg, 'KPI Normalization', 5);
  } catch (e) {
    // no-op — safe to ignore, this is only a nice-to-have in trigger context
  }
}