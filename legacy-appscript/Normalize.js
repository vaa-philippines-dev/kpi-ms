/**
 * KPI Weekly & Monthly Summary Generator
 * ------------------------------------------------------------
 * Aggregates per-KPI rows from KPI_Weekly_Reports / KPI_Monthly_Reports
 * into one summary row per ConnectionID + period-start-date, written to
 * KPI_Weekly_Summary / KPI_Monthly_Summary.
 *
 * Designed to run unattended from a trigger: no ui.alert()/dialogs are
 * used anywhere. Every run (success, skip, or error) writes one row to
 * the Audit_Log tab instead.
 *
 * Before summarizing either report type, column B from row 3 downward
 * is checked for data. If it's empty, that report type is skipped for
 * this run (logged as SKIPPED) rather than writing an empty summary.
 *
 * If any output cell (typically the KPIs JSON blob) would exceed the
 * Sheets 50,000-character cell limit, it's logged to the matching
 * *_Summary_Errors tab (ConnectionID + period + size) and truncated so
 * the write doesn't throw.
 *
 * RETENTION WINDOW (temporary workaround for the Sheets row-count
 * limitation): only report rows whose period start date falls within
 * the last RETENTION_DAYS days are included in the aggregation. Rows
 * older than that are skipped entirely (not grouped, not counted) —
 * this mirrors the fact that the underlying form data older than
 * RETENTION_DAYS is being deleted, and keeps the summary sheets from
 * growing rows for data that's about to disappear anyway.
 */

const MAX_CELL_CHARS = 50000;

// Temporary retention workaround — only rows within this many days of
// "today" (script timezone) are included when summarizing. Raise/remove
// this once the row-count limitation is resolved.
const RETENTION_DAYS = 35;

// One config block per report cadence. Adding a new cadence later (e.g.
// quarterly) only requires adding an entry here.
const REPORT_TYPES = {
  WEEKLY: {
    key: 'Weekly',
    sourceSheet:  'KPI_Weekly_Reports',
    summarySheet: 'KPI_Weekly_Summary',
    errorSheet:   'KPI_Weekly_Summary_Errors',
    periodField:  'WeekStartDate',
    summaryIdPrefix: 'WS-',
  },
  MONTHLY: {
    key: 'Monthly',
    sourceSheet:  'KPI_Monthly_Reports',
    summarySheet: 'KPI_Monthly_Summary',
    errorSheet:   'KPI_Monthly_Summary_Errors',
    periodField:  'MonthStartDate',
    summaryIdPrefix: 'MS-',
  },
};

/**
 * Adds the custom menu when the spreadsheet opens.
 */
// function onOpen() {
//   SpreadsheetApp.getUi()
//     .createMenu('KPI Tools')
//     .addItem('Summarize Weekly Reports', 'summarizeKPIWeeklyReports')
//     .addItem('Summarize Monthly Reports', 'summarizeKPIMonthlyReports')
//     .addItem('Summarize Both', 'summarizeAllKPIReports')
//     .addSeparator()
//     .addItem('☑ Normalize Unchecked Only (skip error rows)', 'normalizeUncheckedOnly')
//     .addItem('🔁 Recheck All Against Normalized Table', 'recheckAllAgainstNormalizedTable')
//     .addItem('🔧 Check/Repair Checkbox Column Detection', 'repairCheckboxColumnLabels')
//     .addSeparator()
//     .addItem('View Audit Log', 'openAuditLog')
//     .addToUi();
// }

/** Entry point for Weekly summaries — safe to use as a trigger target. */
function summarizeKPIWeeklyReports() {
  runKPISummary(REPORT_TYPES.WEEKLY);
}

/** Entry point for Monthly summaries — safe to use as a trigger target. */
function summarizeKPIMonthlyReports() {
  runKPISummary(REPORT_TYPES.MONTHLY);
}

/** Convenience entry point that runs both cadences from a single trigger. */
function summarizeAllKPIReports() {
  runKPISummary(REPORT_TYPES.WEEKLY);
  runKPISummary(REPORT_TYPES.MONTHLY);
}

/** Activates the Audit_Log tab for quick review. */
function openAuditLog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setActiveSheet(ensureAuditLogSheet(ss));
}

// ============================================================
// Core logic (shared by Weekly and Monthly)
// ============================================================

/**
 * Reads a report sheet defined by `config`, aggregates per
 * ConnectionID + period-start-date, and writes/updates the matching
 * summary sheet. Every outcome (success, skip, error) is written to
 * Audit_Log — no dialogs are shown.
 *
 * @param {Object} config - one of REPORT_TYPES.WEEKLY / REPORT_TYPES.MONTHLY
 */
function runKPISummary(config) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportsSheet = ss.getSheetByName(config.sourceSheet);

  if (!reportsSheet) {
    logAudit(ss, 'ERROR', `Sheet "${config.sourceSheet}" not found — ${config.key} summary skipped.`, { reportType: config.key });
    return;
  }

  // Guard: require actual data in column B, row 3 downward, before summarizing.
  if (!hasDataFromRow3(reportsSheet)) {
    logAudit(ss, 'SKIPPED', `${config.sourceSheet}: no data found in B3:B${reportsSheet.getLastRow()} — ${config.key} summary skipped.`, { reportType: config.key });
    return;
  }

  const summarySheet = ss.getSheetByName(config.summarySheet) || ss.insertSheet(config.summarySheet);
  const summaryHeaders = buildSummaryHeaders(config.periodField);
  ensureSummaryHeaders(summarySheet, summaryHeaders);

  try {
    const result = buildAndWriteSummary(ss, reportsSheet, summarySheet, summaryHeaders, config);

    let summary = `Summarized ${result.groupCount} group(s) within the last ${RETENTION_DAYS} days: ${result.updated} updated, ${result.added} added.`;
    if (result.skippedOldRows > 0) {
      summary += ` ${result.skippedOldRows} row(s) skipped as older than ${RETENTION_DAYS} days.`;
    }
    if (result.errorRows.length > 0) {
      summary += ` ${result.errorRows.length} oversized cell(s) — see ${config.errorSheet}.`;
    }

    logAudit(ss, 'SUCCESS', summary, {
      reportType: config.key,
      groupCount: result.groupCount,
      updated: result.updated,
      added: result.added,
      oversizedCells: result.errorRows.length,
      skippedOldRows: result.skippedOldRows,
      retentionDays: RETENTION_DAYS,
    });

  } catch (err) {
    console.error(`${config.key} summary error:`, err);
    logAudit(ss, 'ERROR', `${config.key} summary failed: ${err.message}`, { reportType: config.key, stack: err.stack });
  }
}

/**
 * Does the actual read/aggregate/write work for one report type.
 * Split out from runKPISummary so error handling stays in one place.
 */
function buildAndWriteSummary(ss, reportsSheet, summarySheet, summaryHeaders, config) {
  const periodField = config.periodField;

  // --- Read source data ---
  const reportData = reportsSheet.getDataRange().getValues();
  const reportHeaders = reportData[0];
  const reportRows = reportData.slice(1);

  const col = buildColumnMap(reportHeaders, [
    'ReportID', 'ConnectionID', 'KPIID', periodField, 'AccountLabel',
    'Target', 'Actual', 'NoDataAvailable', 'Status', 'SubmittedBy', 'SubmittedAt'
  ]);

  // Cutoff date for the retention window: anything with a period start
  // strictly before this date is skipped from aggregation.
  const cutoffDate = getRetentionCutoffDate();

  // --- Group rows by ConnectionID + period start date ---
  const groups = {};
  let skippedOldRows = 0;

  reportRows.forEach(row => {
    if (row.every(cell => cell === '' || cell === null)) return;

    let connectionId = row[col.ConnectionID];
    if (connectionId === '' || connectionId === null || connectionId === undefined) return;
    connectionId = String(connectionId).trim();

    const periodStart = formatDateOnly(row[col[periodField]]);

    // Skip rows outside the retention window (temporary workaround for
    // the Sheets row-count limitation — see header comment).
    if (!isWithinRetentionWindow(periodStart, cutoffDate)) {
      skippedOldRows++;
      return;
    }

    const key = connectionId + '|' + periodStart;

    if (!groups[key]) {
      groups[key] = {
        connectionId: connectionId,
        periodStart: periodStart,
        kpis: [],
        statusCounts: { 'On Target': 0, 'At Risk': 0, 'Critical': 0, 'No Data': 0 },
        latestSubmittedAt: null,
        submittedBy: ''
      };
    }

    const group = groups[key];
    const status = row[col.Status] || '';
    const noData = row[col.NoDataAvailable] === true || row[col.NoDataAvailable] === 'TRUE';

    group.kpis.push({
      kpiId: row[col.KPIID] || '',
      target: formatValue(row[col.Target]),
      actual: formatValue(row[col.Actual]),
      noData: noData,
      status: status
    });

    if (group.statusCounts.hasOwnProperty(status)) {
      group.statusCounts[status]++;
    }

    const submittedAt = row[col.SubmittedAt];
    if (submittedAt) {
      const submittedAtDate = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);
      if (!isNaN(submittedAtDate.getTime()) &&
          (!group.latestSubmittedAt || submittedAtDate > group.latestSubmittedAt)) {
        group.latestSubmittedAt = submittedAtDate;
        group.submittedBy = row[col.SubmittedBy] || '';
      }
    }
  });

  // --- Read existing summary rows so we update instead of duplicate ---
  const summaryData = summarySheet.getDataRange().getValues();
  const summaryCol = buildColumnMap(summaryData[0], summaryHeaders);

  const existingRowByKey = {};
  let maxSummaryNum = 0;

  for (let i = 1; i < summaryData.length; i++) {
    const r = summaryData[i];
    if (r.every(cell => cell === '' || cell === null)) continue;

    const connId = String(r[summaryCol.ConnectionID] || '').trim();
    const period = formatDateOnly(r[summaryCol[periodField]]);
    existingRowByKey[connId + '|' + period] = i + 1; // 1-based row number

    const idMatch = String(r[summaryCol.SummaryID] || '').match(/(\d+)$/);
    if (idMatch) {
      maxSummaryNum = Math.max(maxSummaryNum, parseInt(idMatch[1], 10));
    }
  }

  // --- Build output rows ---
  const rowsToAppend = [];
  const rowsToUpdate = [];
  const errorRows = [];

  Object.keys(groups).forEach(key => {
    const group = groups[key];
    const counts = group.statusCounts;
    const totalKPIs = group.kpis.length;
    const overallStatus = determineOverallStatus(counts, totalKPIs);

    const existingRowNum = existingRowByKey[key];
    let summaryId;
    if (existingRowNum) {
      summaryId = summaryData[existingRowNum - 1][summaryCol.SummaryID];
    } else {
      maxSummaryNum++;
      summaryId = config.summaryIdPrefix + String(maxSummaryNum).padStart(6, '0');
    }

    let kpisJson = JSON.stringify(group.kpis);
    kpisJson = checkAndTruncate(kpisJson, {
      connectionId: group.connectionId,
      periodStart: group.periodStart,
      column: 'KPIs',
      totalKPIs: totalKPIs
    }, errorRows);

    const values = [
      summaryId,
      group.connectionId,
      group.periodStart,
      overallStatus,
      counts['On Target'],
      counts['At Risk'],
      counts['Critical'],
      counts['No Data'],
      totalKPIs,
      kpisJson,
      group.submittedBy,
      group.latestSubmittedAt || ''
    ];

    if (existingRowNum) {
      rowsToUpdate.push({ rowNumber: existingRowNum, values: values });
    } else {
      rowsToAppend.push(values);
    }
  });

  // --- Write updates and new rows in batch ---
  rowsToUpdate.forEach(update => {
    summarySheet.getRange(update.rowNumber, 1, 1, summaryHeaders.length).setValues([update.values]);
  });

  if (rowsToAppend.length > 0) {
    const startRow = summarySheet.getLastRow() + 1;
    summarySheet.getRange(startRow, 1, rowsToAppend.length, summaryHeaders.length).setValues(rowsToAppend);
  }

  // --- Write/clear the matching *_Summary_Errors tab ---
  writeErrorRows(ss, config.errorSheet, buildErrorHeaders(periodField), errorRows);

  return {
    groupCount: Object.keys(groups).length,
    updated: rowsToUpdate.length,
    added: rowsToAppend.length,
    errorRows,
    skippedOldRows
  };
}

/**
 * Checks column B, from row 3 to the last row, for any non-empty cell.
 * Used as the "is there anything to summarize" guard for both report types.
 */
function hasDataFromRow3(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return false;
  const values = sheet.getRange(3, 2, lastRow - 2, 1).getValues();
  return values.some(r => r[0] !== '' && r[0] !== null && r[0] !== undefined);
}

/**
 * Returns today's date (midnight, script timezone) minus RETENTION_DAYS.
 * Report rows whose period start date is before this are excluded from
 * aggregation.
 */
function getRetentionCutoffDate() {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  return cutoff;
}

/**
 * True if a 'yyyy-MM-dd' period-start string falls on or after the given
 * cutoff date. Invalid/empty period strings are treated as outside the
 * window (excluded) so bad data doesn't silently get grouped.
 */
function isWithinRetentionWindow(periodStartStr, cutoffDate) {
  if (!periodStartStr) return false;
  const periodDate = new Date(periodStartStr);
  if (isNaN(periodDate.getTime())) return false;
  return periodDate >= cutoffDate;
}

function buildSummaryHeaders(periodField) {
  return [
    'SummaryID', 'ConnectionID', periodField, 'Status',
    'OnTargetCount', 'AtRiskCount', 'CriticalCount', 'NoDataCount',
    'TotalKPIs', 'KPIs', 'SubmittedBy', 'SubmittedAt'
  ];
}

function buildErrorHeaders(periodField) {
  return ['ConnectionID', periodField, 'Column', 'CharacterCount', 'TotalKPIs', 'Preview'];
}

/** Ensures the summary sheet has the expected header row. */
function ensureSummaryHeaders(sheet, summaryHeaders) {
  const firstRow = sheet.getRange(1, 1, 1, summaryHeaders.length).getValues()[0];
  const isEmpty = firstRow.every(cell => cell === '' || cell === null);
  if (isEmpty) {
    sheet.getRange(1, 1, 1, summaryHeaders.length).setValues([summaryHeaders]);
  }
}

/** Maps header name -> column index (0-based) based on the actual header row. */
function buildColumnMap(headerRow, expectedHeaders) {
  const map = {};
  expectedHeaders.forEach(name => {
    const idx = headerRow.indexOf(name);
    map[name] = idx >= 0 ? idx : -1;
  });
  return map;
}

/**
 * Formats a date-only value (Date object or string) as 'yyyy-MM-dd'.
 *
 * IMPORTANT: If the value is already a plain "yyyy-MM-dd" (or
 * "yyyy-MM-ddTHH:mm:ss...") string, it's used as-is WITHOUT going through
 * `new Date(...)` + timezone conversion. This avoids the classic bug where
 * a date-only string like "2024-01-15" is parsed as UTC midnight and then
 * shifted to the previous day once converted to the script's timezone —
 * which would otherwise split what should be one group into two.
 */
function formatDateOnly(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (!value) return '';

  const str = String(value).trim();

  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return str;
}

/**
 * Formats a Target/Actual cell value for the KPIs JSON:
 * Date -> ISO string, number -> number, empty -> "", else as-is.
 */
function formatValue(value) {
  if (value === '' || value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return value;
  return value;
}

/**
 * Determines overall status for a group: Critical > At Risk >
 * No Data (if every KPI is No Data) > On Target.
 */
function determineOverallStatus(counts, totalKPIs) {
  if (counts['Critical'] > 0) return 'Critical';
  if (counts['At Risk'] > 0) return 'At Risk';
  if (counts['No Data'] === totalKPIs && totalKPIs > 0) return 'No Data';
  return 'On Target';
}

/**
 * Checks a string value's length against MAX_CELL_CHARS. If it exceeds the
 * limit, pushes a row onto errorRows (ConnectionID, period, column, length,
 * KPI count, preview) and returns a truncated version so setValues() won't
 * throw. Otherwise returns the value unchanged.
 */
function checkAndTruncate(value, ctx, errorRows) {
  if (typeof value !== 'string') return value;

  const len = value.length;
  if (len <= MAX_CELL_CHARS) return value;

  errorRows.push([
    ctx.connectionId,
    ctx.periodStart,
    ctx.column,
    len,
    ctx.totalKPIs,
    value.substring(0, 200) + '...'
  ]);

  return value.substring(0, MAX_CELL_CHARS);
}

/** Rebuilds a *_Summary_Errors tab from the given error rows. */
function writeErrorRows(ss, sheetName, errorHeaders, errorRows) {
  let errorSheet = ss.getSheetByName(sheetName);
  if (!errorSheet) {
    errorSheet = ss.insertSheet(sheetName);
  } else {
    errorSheet.clearContents();
  }

  errorSheet.getRange(1, 1, 1, errorHeaders.length).setValues([errorHeaders]);
  const headerRange = errorSheet.getRange(1, 1, 1, errorHeaders.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#cc0000');
  headerRange.setFontColor('#ffffff');

  if (errorRows.length > 0) {
    errorSheet.getRange(2, 1, errorRows.length, errorHeaders.length).setValues(errorRows);
  }
  errorSheet.autoResizeColumns(1, errorHeaders.length);
}

// ============================================================
// Audit logging (no dialogs — safe for unattended trigger runs)
// ============================================================

/** Ensures the Audit_Log sheet exists with headers, and returns it. */
function ensureAuditLogSheet(ss) {
  let sheet = ss.getSheetByName('Audit_Log');
  if (!sheet) {
    sheet = ss.insertSheet('Audit_Log');
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

/** True if called with no active user/UI session (i.e. from a trigger). */
function isRunningFromTrigger() {
  try {
    SpreadsheetApp.getUi();
    return false;
  } catch (e) {
    return true;
  }
}