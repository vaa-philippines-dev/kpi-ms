/**
 * Diagnostic tool: for one report type (WEEKLY or MONTHLY), shows exactly
 * what runKPISummary() would see — whether the source sheet exists, whether
 * hasDataFromRow3() passes, the actual header row, which expected headers
 * matched vs came up missing (-1), and a sample of the first data row's
 * values for each mapped column. Use this whenever a report type produces
 * zero rows or looks wrong compared to the other.
 */
function diagnoseKPISummaryHeaders(reportTypeKey) {
  const ui = SpreadsheetApp.getUi();
  const key = (reportTypeKey || '').toUpperCase();
  const config = REPORT_TYPES[key];
  if (!config) {
    ui.alert(`Unknown report type "${reportTypeKey}". Use "WEEKLY" or "MONTHLY".`);
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(config.sourceSheet);
  const lines = [];
  lines.push(`Report type: ${config.key}  (source sheet: "${config.sourceSheet}")`);
  lines.push('');

  if (!sheet) {
    lines.push(`⚠ Sheet "${config.sourceSheet}" was NOT FOUND in this spreadsheet. This alone explains zero rows — runKPISummary() logs an ERROR and stops immediately.`);
    ui.alert('KPI Summary Diagnosis: ' + config.key, lines.join('\n'), ui.ButtonSet.OK);
    return;
  }

  const lastRow = sheet.getLastRow();
  lines.push(`Sheet found. Last row: ${lastRow}.`);

  const dataOk = hasDataFromRow3(sheet);
  lines.push(`hasDataFromRow3() (checks column B, row 3 downward): ${dataOk ? 'PASS — data found' : 'FAIL — column B is empty from row 3 down. This is why nothing runs; it gets logged as SKIPPED.'}`);
  lines.push('');

  const expectedHeaders = ['ReportID', 'ConnectionID', 'KPIID', config.periodField, 'AccountLabel', 'Target', 'Actual', 'NoDataAvailable', 'Status', 'SubmittedBy', 'SubmittedAt'];
  const headerRow = lastRow >= 1 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
  lines.push(`Actual header row (row 1): ${JSON.stringify(headerRow)}`);
  lines.push('');
  lines.push('--- Expected header -> found column? ---');

  const col = buildColumnMap(headerRow, expectedHeaders);
  const missing = [];
  expectedHeaders.forEach(name => {
    const idx = col[name];
    if (idx === -1) {
      missing.push(name);
      lines.push(`❌ "${name}": NOT FOUND — every row will read this as blank/undefined.`);
    } else {
      lines.push(`✓ "${name}": column ${String.fromCharCode(65 + idx)} (index ${idx})`);
    }
  });

  if (missing.length > 0) {
    lines.push('');
    lines.push(`⚠ ${missing.length} expected header(s) missing: ${missing.join(', ')}. This is the most likely cause of "zero rows" — in particular, if "ConnectionID" is missing, EVERY row gets silently skipped (the code treats a blank ConnectionID as "nothing to group"), producing a SUCCESS log that says "Summarized 0 group(s)" rather than an error.`);
  }

  if (lastRow >= 3 && col.ConnectionID !== -1) {
    const sampleRow = sheet.getRange(3, 1, 1, sheet.getLastColumn()).getValues()[0];
    lines.push('');
    lines.push(`--- Sample: row 3, mapped columns ---`);
    expectedHeaders.forEach(name => {
      const idx = col[name];
      lines.push(`${name}: "${idx === -1 ? '(column not found)' : sampleRow[idx]}"`);
    });
  }

  ui.alert('KPI Summary Diagnosis: ' + config.key, lines.join('\n'), ui.ButtonSet.OK);
}

/** Convenience wrapper so it can be run directly from the Apps Script editor without typing an argument. */
function diagnoseKPIMonthlySummary() {
  diagnoseKPISummaryHeaders('MONTHLY');
}

/** Convenience wrapper for Weekly, useful to compare side-by-side against Monthly. */
function diagnoseKPIWeeklySummary() {
  diagnoseKPISummaryHeaders('WEEKLY');
}