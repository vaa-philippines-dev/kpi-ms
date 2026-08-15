// ═══════════════════════════════════════════════════════════════════════════
// BACKFILL SCRIPT v2 — Populates KPIs JSON column in summary sheets.
// Run backfillBoth() from the GAS editor to backfill both sheets at once.
// Safe to re-run — clears and rewrites summary sheets each time.
// ═══════════════════════════════════════════════════════════════════════════

function backfillBoth() {
  backfillWeeklySummary();
  backfillMonthlySummary();
}

// ── Helper: worst-case status rollup ──
function _backfillWorst(statuses) {
  if (statuses.indexOf('Critical')  >= 0) return 'Critical';
  if (statuses.indexOf('At Risk')   >= 0) return 'At Risk';
  if (statuses.indexOf('On Target') >= 0) return 'On Target';
  return 'No Data';
}

function backfillWeeklySummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var srcSheet = ss.getSheetByName('KPI_Weekly_Reports');
  if (!srcSheet) { Logger.log('ERROR: KPI_Weekly_Reports not found.'); return; }
  var srcData  = srcSheet.getDataRange().getValues();
  if (srcData.length < 2) { Logger.log('KPI_Weekly_Reports is empty.'); return; }
  var srcH = srcData[0];

  // Column indexes — order-independent
  var iConn   = srcH.indexOf('ConnectionID');
  var iWSD    = srcH.indexOf('WeekStartDate');
  var iKPI    = srcH.indexOf('KPIID');
  var iTarget = srcH.indexOf('Target');
  var iActual = srcH.indexOf('Actual');
  var iNoData = srcH.indexOf('NoDataAvailable');
  var iStatus = srcH.indexOf('Status');
  var iSubBy  = srcH.indexOf('SubmittedBy');
  var iSubAt  = srcH.indexOf('SubmittedAt');

  if ([iConn,iWSD,iKPI,iStatus].some(function(i){return i<0;})) {
    Logger.log('ERROR: Missing columns. Found: ' + srcH.join(', ')); return;
  }

  // Group by ConnectionID + WeekStartDate
  // Each group collects: statuses[], entries[] (full per-KPI detail)
  var groups = {};
  for (var r = 1; r < srcData.length; r++) {
    var row    = srcData[r];
    var connId = String(row[iConn]||'').trim();
    var wsdRaw = row[iWSD];
    var wsd    = wsdRaw instanceof Date
      ? Utilities.formatDate(wsdRaw, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(wsdRaw||'').slice(0,10);
    var status = String(row[iStatus]||'').trim();
    var subBy  = String(row[iSubBy]||'').trim();
    var subAt  = String(row[iSubAt]||'').trim();
    var kpiId  = String(row[iKPI]||'').trim();
    var target = row[iTarget];
    var actual = row[iActual];
    var noData = row[iNoData];

    if (!connId || !wsd || wsd.length < 10) continue;

    var key = connId + '|' + wsd;
    if (!groups[key]) {
      groups[key] = {
        connectionId: connId, weekStartDate: wsd,
        statuses: [], entries: [], submittedBy: subBy, submittedAt: subAt
      };
    }
    var g = groups[key];
    g.statuses.push(status);
    g.entries.push({ kpiId:kpiId, target:target, actual:actual,
                     noData:(noData===true||noData==='TRUE'||noData==='true'),
                     status:status });
    if (subAt > g.submittedAt) { g.submittedBy = subBy; g.submittedAt = subAt; }
  }

  Logger.log('KPI_Weekly_Reports: ' + (srcData.length-1) + ' rows → '
    + Object.keys(groups).length + ' summary groups');

  // Create / clear destination sheet
  var destSheet = ss.getSheetByName('KPI_Weekly_Summary');
  if (!destSheet) destSheet = ss.insertSheet('KPI_Weekly_Summary');
  destSheet.clearContents();

  var headers = ['SummaryID','ConnectionID','WeekStartDate','Status',
                 'OnTargetCount','AtRiskCount','CriticalCount','NoDataCount',
                 'TotalKPIs','KPIs','SubmittedBy','SubmittedAt'];
  destSheet.appendRow(headers);
  destSheet.getRange(1,1,1,headers.length)
    .setBackground('#1f1f2e').setFontColor('#ff6b35').setFontWeight('bold');

  // Build output rows
  var outRows = [];
  var idx = 1;
  Object.values(groups).forEach(function(g) {
    var s = g.statuses;
    outRows.push([
      'WS-' + String(idx++).padStart(6,'0'),
      g.connectionId,
      g.weekStartDate,
      _backfillWorst(s),
      s.filter(function(x){return x==='On Target';}).length,
      s.filter(function(x){return x==='At Risk';  }).length,
      s.filter(function(x){return x==='Critical'; }).length,
      s.filter(function(x){return x==='No Data';  }).length,
      s.length,
      JSON.stringify(g.entries),   // ← KPIs column: full per-KPI detail
      g.submittedBy,
      g.submittedAt
    ]);
  });

  // Sort by WeekStartDate asc, ConnectionID asc
  outRows.sort(function(a,b){
    var d = String(a[2]).localeCompare(String(b[2]));
    return d!==0 ? d : String(a[1]).localeCompare(String(b[1]));
  });

  if (outRows.length > 0) {
    destSheet.getRange(2, 1, outRows.length, headers.length).setValues(outRows);
  }

  Logger.log('✓ KPI_Weekly_Summary: ' + outRows.length + ' rows written.');
  SpreadsheetApp.getUi().alert('Weekly Backfill Complete',
    outRows.length + ' summary rows written to KPI_Weekly_Summary\n' +
    'Each row contains the full KPIs JSON for that connection+week.\n' +
    '(from ' + (srcData.length-1) + ' detail rows)',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function backfillMonthlySummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var srcSheet = ss.getSheetByName('KPI_Monthly_Reports');
  if (!srcSheet) { Logger.log('ERROR: KPI_Monthly_Reports not found.'); return; }
  var srcData  = srcSheet.getDataRange().getValues();
  if (srcData.length < 2) { Logger.log('KPI_Monthly_Reports is empty.'); return; }
  var srcH = srcData[0];

  var iConn   = srcH.indexOf('ConnectionID');
  var iMSD    = srcH.indexOf('MonthStartDate');
  var iKPI    = srcH.indexOf('KPIID');
  var iTarget = srcH.indexOf('Target');
  var iActual = srcH.indexOf('Actual');
  var iNoData = srcH.indexOf('NoDataAvailable');
  var iStatus = srcH.indexOf('Status');
  var iSubBy  = srcH.indexOf('SubmittedBy');
  var iSubAt  = srcH.indexOf('SubmittedAt');

  if ([iConn,iMSD,iKPI,iStatus].some(function(i){return i<0;})) {
    Logger.log('ERROR: Missing columns. Found: ' + srcH.join(', ')); return;
  }

  var groups = {};
  for (var r = 1; r < srcData.length; r++) {
    var row    = srcData[r];
    var connId = String(row[iConn]||'').trim();
    var msdRaw = row[iMSD];
    var msd    = msdRaw instanceof Date
      ? Utilities.formatDate(msdRaw, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(msdRaw||'').slice(0,10);
    var status = String(row[iStatus]||'').trim();
    var subBy  = String(row[iSubBy]||'').trim();
    var subAt  = String(row[iSubAt]||'').trim();
    var kpiId  = String(row[iKPI]||'').trim();

    if (!connId || !msd || msd.length < 7) continue;

    var msdNorm = msd.slice(0,7) + '-01';
    var key     = connId + '|' + msd.slice(0,7);

    if (!groups[key]) {
      groups[key] = {
        connectionId: connId, monthStartDate: msdNorm,
        statuses: [], entries: [], submittedBy: subBy, submittedAt: subAt
      };
    }
    var g = groups[key];
    g.statuses.push(status);
    g.entries.push({ kpiId:kpiId, target:row[iTarget], actual:row[iActual],
                     noData:(row[iNoData]===true||row[iNoData]==='TRUE'||row[iNoData]==='true'),
                     status:status });
    if (subAt > g.submittedAt) { g.submittedBy = subBy; g.submittedAt = subAt; }
  }

  Logger.log('KPI_Monthly_Reports: ' + (srcData.length-1) + ' rows → '
    + Object.keys(groups).length + ' summary groups');

  var destSheet = ss.getSheetByName('KPI_Monthly_Summary');
  if (!destSheet) destSheet = ss.insertSheet('KPI_Monthly_Summary');
  destSheet.clearContents();

  var headers = ['SummaryID','ConnectionID','MonthStartDate','Status',
                 'OnTargetCount','AtRiskCount','CriticalCount','NoDataCount',
                 'TotalKPIs','KPIs','SubmittedBy','SubmittedAt'];
  destSheet.appendRow(headers);
  destSheet.getRange(1,1,1,headers.length)
    .setBackground('#1f1f2e').setFontColor('#ff6b35').setFontWeight('bold');

  var outRows = [];
  var idx = 1;
  Object.values(groups).forEach(function(g) {
    var s = g.statuses;
    outRows.push([
      'MS-' + String(idx++).padStart(6,'0'),
      g.connectionId,
      g.monthStartDate,
      _backfillWorst(s),
      s.filter(function(x){return x==='On Target';}).length,
      s.filter(function(x){return x==='At Risk';  }).length,
      s.filter(function(x){return x==='Critical'; }).length,
      s.filter(function(x){return x==='No Data';  }).length,
      s.length,
      JSON.stringify(g.entries),
      g.submittedBy,
      g.submittedAt
    ]);
  });

  outRows.sort(function(a,b){
    var d = String(a[2]).localeCompare(String(b[2]));
    return d!==0 ? d : String(a[1]).localeCompare(String(b[1]));
  });

  if (outRows.length > 0) {
    destSheet.getRange(2, 1, outRows.length, headers.length).setValues(outRows);
  }

  Logger.log('✓ KPI_Monthly_Summary: ' + outRows.length + ' rows written.');
  SpreadsheetApp.getUi().alert('Monthly Backfill Complete',
    outRows.length + ' summary rows written to KPI_Monthly_Summary\n' +
    '(from ' + (srcData.length-1) + ' detail rows)',
    SpreadsheetApp.getUi().ButtonSet.OK);
}