// ============================================================
// KPI MANAGEMENT PLATFORM - SubmissionsCore.gs
// Split out of Code.gs for maintainability. Google Apps Script merges all
// .gs files into one shared global scope, so these functions call (and are
// called by) functions in Code.gs and other files exactly as before.
// ============================================================



function summaryLookup(sheetName, dateField) {
  var _log = [];
  _log.push('[summaryLookup] START sheetName='+sheetName+' dateField='+dateField);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) { _log.push('[summaryLookup] ERROR: sheet not found: '+sheetName); return {map:{}, log:_log}; }
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  _log.push('[summaryLookup] lastRow='+lastRow+' lastCol='+lastCol);
  if (lastRow < 2) { _log.push('[summaryLookup] EMPTY: lastRow<2'); return {map:{}, log:_log}; }

  var hdrs = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  _log.push('[summaryLookup] headers='+JSON.stringify(hdrs));
  var cidIdx  = hdrs.indexOf('ConnectionID');
  var wsdIdx  = hdrs.indexOf(dateField);
  var statIdx = hdrs.indexOf('Status');
  _log.push('[summaryLookup] cidIdx='+cidIdx+' wsdIdx='+wsdIdx+' statIdx='+statIdx);
  if (cidIdx < 0 || wsdIdx < 0) { _log.push('[summaryLookup] ERROR: column not found'); return {map:{}, log:_log}; }

  var numRows = lastRow - 1;
  // Use getDisplayValues() for ConnectionID — avoids numeric precision issues
  // if the column was ever formatted as a number type
  var cidVals  = sheet.getRange(2, cidIdx+1,  numRows, 1).getDisplayValues();
  var wsdVals  = sheet.getRange(2, wsdIdx+1,  numRows, 1).getValues();
  var statVals = statIdx >= 0 ? sheet.getRange(2, statIdx+1, numRows, 1).getDisplayValues() : null;

  _log.push('[summaryLookup] cidVals.length='+cidVals.length+' wsdVals.length='+wsdVals.length);

  for (var ri = 0; ri < Math.min(3, cidVals.length); ri++) {
    var rawCid = cidVals[ri][0];
    var rawWsd = wsdVals[ri][0];
    _log.push('[summaryLookup] row'+ri+
      ' cid='+JSON.stringify(String(rawCid||'').trim())+
      ' wsdType='+(rawWsd instanceof Date ? 'Date' : typeof rawWsd)+
      ' wsdRaw='+JSON.stringify(String(rawWsd||'')));
    _log.push('[summaryLookup] row'+ri+' _normDateStr='+_normDateStr(rawWsd));
  }

  var map = {};
  var skipped = 0;
  for (var i = 0; i < numRows; i++) {
    var cid = String(cidVals[i][0]||'').trim();
    if (!cid) { skipped++; continue; }
    var wsd  = wsdVals[i][0];
    var stat = statVals ? String(statVals[i][0]||'') : 'submitted';
    var wsdStr = _normDateStr(wsd);
    if (!wsdStr || wsdStr.length < 7) { skipped++; continue; }
    // Index by full ID, normalized suffix, AND raw ID — handles all formats
    var normCid = _normConnId(cid);
    if (!map[cid])     map[cid]     = {};
    if (!map[normCid]) map[normCid] = {};
    map[cid][wsdStr]     = stat || 'submitted';
    map[normCid][wsdStr] = stat || 'submitted';
  }

  var totalConns = Object.keys(map).length;
  var sampleDates = [];
  Object.values(map).slice(0,3).forEach(function(cm){ sampleDates = sampleDates.concat(Object.keys(cm).slice(0,2)); });
  _log.push('[summaryLookup] DONE totalConns='+totalConns+' skipped='+skipped+' sampleDates='+JSON.stringify(sampleDates));
  summaryLookup._lastLog = _log; // store log without bloating return value
  return map; // return map directly — callers no longer need {map, log} wrapper
}

// Fast check: is this connection submitted for this week/month?
function isSummarySubmitted(sheetName, dateField, connectionId, periodKey, isMonthly) {
  var map = summaryLookup(sheetName, dateField);
  var connMap = map[String(connectionId).trim()];
  if (!connMap) return false;
  var cmpLen = isMonthly ? 7 : 10;
  var pKey   = periodKey.slice(0, cmpLen);
  return Object.keys(connMap).some(function(k){ return k.slice(0,cmpLen) === pKey; });
}

// Build a submitted-set for a given week from summary sheet (fast path)
function buildSubmittedSet(sheetName, dateField, periodKey, isMonthly) {
  var map  = summaryLookup(sheetName, dateField);
  var _log = summaryLookup._lastLog || [];
  var cmpLen = isMonthly ? 7 : 10;
  var pKey   = periodKey.slice(0, cmpLen);
  _log.push('[buildSubmittedSet] pKey='+pKey+' totalConnsInMap='+Object.keys(map).length);
  var set = {};
  Object.keys(map).forEach(function(cid) {
    if (Object.keys(map[cid]).some(function(k){ return k.slice(0,cmpLen) === pKey; })) {
      set[cid] = true;
    }
  });
  var sampleKeys = [];
  Object.values(map).slice(0,3).forEach(function(cm){ sampleKeys = sampleKeys.concat(Object.keys(cm).slice(0,2)); });
  _log.push('[buildSubmittedSet] sampleStoredKeys='+JSON.stringify(sampleKeys)+' matchedCount='+Object.keys(set).length);
  // Attach log to set object so callers can surface it
  // Store log separately — don't attach to set to avoid serialization issues
  buildSubmittedSet._lastLog = _log;
  return set;
}

function _wsdStr(val, monthly) {
  if (!val) return '';
  if (val instanceof Date) {
    return monthly
      ? val.getFullYear() + '-' + String(val.getMonth()+1).padStart(2,'0')
      : localDateStr(val);
  }
  var s = String(val);
  // Handle "Mon Jun 02 2026 00:00:00..." format from serialisation
  if (s.length > 10 && !/^\d{4}-\d{2}/.test(s)) {
    try { var d=new Date(s); if(!isNaN(d)) return monthly ? d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0') : localDateStr(d); } catch(e){}
  }
  return s.slice(0, monthly ? 7 : 10);
}

function hasWeeklySubmission(connectionId, weekStartDate, requesterId) {
  // Returns { submitted: bool, canEdit: bool }
  // Reads from KPI_Weekly_Summary — one row per connection per week
  var wsd = String(weekStartDate||'').slice(0,10);
  var submitted = isSummarySubmitted(SHEET_NAMES.KPI_WEEKLY_SUMMARY, 'WeekStartDate', connectionId, wsd, false);
  var u = getUserById(requesterId);
  var role = u ? u.Role : '';
  var canEdit = [ROLES.ADMIN, ROLES.MANAGER, ROLES.TEAM_LEADER].includes(role);
  return { success: true, submitted: submitted, canEdit: canEdit, role: role };
}

// ── Direct test function — call from browser via gsr('testSubmissions') ──
// Returns everything needed to diagnose the submission count issue
// ── Performance Analytics diagnostic ──────────────────────────────────────
// ── Run this directly from GAS Editor to diagnose performance data ──
// Extensions > Apps Script > run debugPerfData()
function debugPerfData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.KPI_WEEKLY_SUMMARY);
  var log = [];

  log.push('=== SHEET NAME: ' + SHEET_NAMES.KPI_WEEKLY_SUMMARY);
  log.push('Sheet found: ' + (!!sheet));
  if (!sheet) { Logger.log(log.join('\n')); return; }

  var lastRow = sheet.getLastRow();
  log.push('Last row: ' + lastRow);

  var hdrs = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  log.push('Headers: ' + JSON.stringify(hdrs));

  var cidIdx = hdrs.indexOf('ConnectionID');
  var wsdIdx = hdrs.indexOf('WeekStartDate');
  log.push('CID col: ' + cidIdx + '  WSD col: ' + wsdIdx);

  if (lastRow < 2 || wsdIdx < 0) { Logger.log(log.join('\n')); return; }

  var numRows = Math.min(lastRow - 1, 2000);
  var wsdVals = sheet.getRange(2, wsdIdx+1, numRows, 1).getValues();
  var cidVals = sheet.getRange(2, cidIdx+1, numRows, 1).getValues();

  // Sample first 5
  log.push('\nFirst 5 rows:');
  for (var i=0; i<Math.min(5,numRows); i++) {
    var raw = wsdVals[i][0];
    var norm = _normDateStr(raw);
    log.push('  row '+(i+2)+': cid='+cidVals[i][0]+' raw='+raw+' type='+(raw instanceof Date?'Date':typeof raw)+' normalized='+norm);
  }

  // Count unique normalized dates
  var counts = {};
  for (var j=0; j<numRows; j++) {
    var n = _normDateStr(wsdVals[j][0]);
    if (n) counts[n] = (counts[n]||0)+1;
  }
  var sorted = Object.keys(counts).sort().reverse().slice(0,10);
  log.push('\nWeeks (normalized, most recent):');
  sorted.forEach(function(k){ log.push('  '+k+' -> '+counts[k]+' rows'); });

  // Test specific week
  var testWeek = getMondayStr(new Date());
  log.push('\nCurrent Monday: ' + testWeek);
  var matched = 0;
  for (var k=0; k<numRows; k++) {
    if (_normDateStr(wsdVals[k][0]) === testWeek) matched++;
  }
  log.push('Rows matching current week: ' + matched);

  // Test summaryByPeriod
  var perfMap = summaryByPeriod(SHEET_NAMES.KPI_WEEKLY_SUMMARY, 'WeekStartDate', testWeek, false);
  log.push('summaryByPeriod result size: ' + Object.keys(perfMap).length);
  if (Object.keys(perfMap).length === 0 && sorted.length > 0) {
    // Try the most recent week in the sheet
    var mostRecent = sorted[0];
    log.push('Trying most recent week: ' + mostRecent);
    var pm2 = summaryByPeriod(SHEET_NAMES.KPI_WEEKLY_SUMMARY, 'WeekStartDate', mostRecent, false);
    log.push('summaryByPeriod for '+mostRecent+': ' + Object.keys(pm2).length + ' rows');
    if (Object.keys(pm2).length > 0) {
      var sampleKey = Object.keys(pm2)[0];
      log.push('Sample: '+sampleKey+' => '+JSON.stringify(pm2[sampleKey]));
    }
  }

  Logger.log(log.join('\n'));
  SpreadsheetApp.getUi().alert('Debug complete — check Apps Script Logs (View > Logs)', log.join('\n').slice(0,500), SpreadsheetApp.getUi().ButtonSet.OK);
}

function getSubmissionTrendData(weekStartDate, deptId, svcId, isMonthly, connectionType, userId, userRole, teamId) {
  try {
    var cmpLen    = isMonthly ? 7 : 10;
    var sheetName = isMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
    var dateField = isMonthly ? 'MonthStartDate' : 'WeekStartDate';

    // Build 6 periods ending at weekStartDate
    var refDate   = weekStartDate ? String(weekStartDate).slice(0, cmpLen) : (
      isMonthly
        ? (function(){ var n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); })()
        : getMondayStr(new Date())
    );
    var periods = [];
    for (var i = 5; i >= 0; i--) {
      if (isMonthly) {
        var parts = refDate.split('-');
        var dm = new Date(parseInt(parts[0]), parseInt(parts[1])-1-i, 1);
        periods.push(dm.getFullYear()+'-'+String(dm.getMonth()+1).padStart(2,'0'));
      } else {
        var rp = refDate.split('-');
        var dd = new Date(parseInt(rp[0]), parseInt(rp[1])-1, parseInt(rp[2]) - i*7);
        periods.push(getMondayStr(dd));  // snap to Monday
      }
    }

    // Build connection reference: index active connections by BOTH current AND legacy ID formats
    // This handles cases where summary sheet still has old CONN_* format IDs
    var allowSetSTD = (userId && userRole) ? _roleScopedConnIdSet(userId, userRole) : null;
    var teamUserIdsSTD = null;
    if (teamId) {
      teamUserIdsSTD = {};
      sheetData(SHEET_NAMES.USERS).forEach(function(u){
        if (String(u.TeamID||'')===String(teamId)) teamUserIdsSTD[String(u.UserID||'')] = true;
      });
    }
    var conns = sheetData(SHEET_NAMES.CONNECTIONS).filter(function(c){
      if (String(c.Status||'').toLowerCase() !== 'active') return false;
      if (deptId && String(c.DeptID||'') !== String(deptId)) return false;
      if (svcId  && String(c.ServiceID||'') !== String(svcId)) return false;
      if (connectionType && normConnectionType(c.ConnectionType) !== connectionType) return false;
      if (teamUserIdsSTD && !teamUserIdsSTD[String(c.VAUserID||'')]) return false;
      if (allowSetSTD) {
        var cidChk = String(c.ConnectionID||'').trim();
        var suffixChk = cidChk.split('_').pop();
        if (!allowSetSTD[cidChk] && !allowSetSTD[suffixChk]) return false;
      }
      return true;
    });
    var totalConns = conns.length;
    // Build forward + reverse connId lookup (handles ID migration: CON_XXXXXX ↔ CONN_*_*)
    var connLookup = {}; // {anyIdFormat: connCurrentId}
    conns.forEach(function(c){
      var cid = String(c.ConnectionID).trim();
      connLookup[cid] = cid;
      var parts = cid.split('_');
      if (parts.length > 1) connLookup[parts[parts.length-1]] = cid;
    });

    // Each connection's "join period" — the week/month it started in.
    // A period BEFORE this is excluded entirely (empty/not counted, not "pending").
    // The join period itself is Not Applicable (also excluded from totals).
    // Only periods AFTER the join period count the connection toward total/pending.
    var joinPeriodByConn = {};
    var historyByConn = {};
    var statusByConnCur = {};
    conns.forEach(function(c){
      var cid = String(c.ConnectionID).trim();
      joinPeriodByConn[cid] = c.StartDate ? _periodKeyOf(c.StartDate, isMonthly) : '';
      historyByConn[cid] = c.StatusHistory;
      statusByConnCur[cid] = c.Status;
    });

    // Guarantee the target sheet exists with the correct header row before reading it.
    // For KPI_Monthly_Summary specifically, this sheet may not exist yet if no VA has
    // ever submitted a monthly report — without this, getSheetByName() below returns
    // null and (correctly) short-circuits to "0 submitted", which is fine. But if the
    // sheet DOES exist with a renamed/reordered/missing column, we want a clear error
    // instead of a cryptic "range column 0" crash from getRange(row, -1+1, ...).
    var ssApp = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheetExists(ssApp, sheetName);
    var sheet = ssApp.getSheetByName(sheetName);
    var submittedByPeriod = {};
    periods.forEach(function(p){ submittedByPeriod[p] = {}; });

    if (sheet && sheet.getLastRow() > 1) {
      var hdrs    = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
      var cidIdx  = hdrs.indexOf('ConnectionID');
      var wsdIdx  = hdrs.indexOf(dateField);
      if (cidIdx < 0 || wsdIdx < 0) {
        var missing = [];
        if (cidIdx < 0) missing.push('ConnectionID');
        if (wsdIdx < 0) missing.push(dateField);
        throw new Error('Sheet "'+sheetName+'" is missing required column(s): '+missing.join(', ')
          +'. Expected headers: SummaryID, ConnectionID, '+dateField+', Status, OnTargetCount, '
          +'AtRiskCount, CriticalCount, NoDataCount, TotalKPIs, KPIs. Found: '+hdrs.join(', '));
      }
      var numRows = sheet.getLastRow()-1;
      var cidVals = sheet.getRange(2, cidIdx+1, numRows, 1).getValues();
      var wsdVals = sheet.getRange(2, wsdIdx+1, numRows, 1).getValues();
      for (var j=0; j<numRows; j++) {
        var rawCid = String(cidVals[j][0]||'').trim();
        if (!rawCid) continue;
        // Match by full ID or by last-segment suffix (tolerates format mismatches)
        var parts_c   = rawCid.split('_');
        var suffix    = parts_c[parts_c.length-1];
        var canonical = connLookup[rawCid] || connLookup[suffix];
        if (!canonical) continue;        // not one of our active+dept-filtered connections
        var wsd = _normDateStr(wsdVals[j][0]).slice(0, cmpLen);
        if (submittedByPeriod[wsd]) submittedByPeriod[wsd][canonical] = true;
      }
    }

    var result = periods.map(function(p) {
      var periodEnd = _periodEndDateOf(p, isMonthly);
      // Only count connections that had already fully joined before this period —
      // i.e. exclude connections whose join period is this period (Not Applicable)
      // or later (didn't exist yet, so it's blank/not counted rather than "pending").
      // Also exclude connections that were Paused as of this period — paused time
      // is never counted toward submission totals either.
      var countableIds = Object.keys(connLookup).filter(function(k){ return connLookup[k] === k; }) // dedupe to canonical ids
        .filter(function(cid){
          var joinP = joinPeriodByConn[cid];
          // Weekly: exclude the join week itself (Not Applicable) and anything before it.
          // Monthly: the join month counts normally — only exclude months before it existed.
          var excludeJoin = isMonthly ? (joinP && joinP > p) : (joinP && joinP >= p);
          if (excludeJoin) return false;
          var statusThen = _statusAsOfDate(historyByConn[cid], statusByConnCur[cid], periodEnd);
          if (statusThen === 'Paused') return false;
          return true;
        });
      var total = countableIds.length;
      var submitted = countableIds.filter(function(cid){ return !!(submittedByPeriod[p]||{})[cid]; }).length;
      return { week: p, submitted: submitted, pending: total - submitted, total: total };
    });
    Logger.log('[getSubmissionTrendData] isMonthly='+isMonthly+' sheet='+sheetName+' periods='+JSON.stringify(periods)+' totalConns='+totalConns
      +' refDate='+refDate
      +' submitted='+JSON.stringify(result.map(function(r){return r.submitted;})));
    return { success: true, data: result };
  } catch(e) {
    Logger.log('[getSubmissionTrendData] ERROR (isMonthly='+isMonthly+'): '+e.message);
    return { success:false, message:e.message, data:[] };
  }
}


// ── Per-connection submission status for a SINGLE period ──────────────────
// Powers the Submission Trend scorecards (rate + count) and the "No Submissions"
// drill-down list. A connection that joined during this exact period is Not
// Applicable (excluded from total/submitted/pending); one that joined after
// this period is excluded entirely (not yet counted).
function getSubmissionStatusList(weekStartDate, deptId, svcId, isMonthly, connectionType, userId, userRole, teamId) {
  try {
    var cmpLen    = isMonthly ? 7 : 10;
    var sheetName = isMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
    var dateField = isMonthly ? 'MonthStartDate' : 'WeekStartDate';
    var periodKey = weekStartDate ? String(weekStartDate).slice(0, cmpLen) : (
      isMonthly
        ? (function(){ var n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); })()
        : getMondayStr(new Date())
    );

    var allowSetSSL = (userId && userRole) ? _roleScopedConnIdSet(userId, userRole) : null;
    var teamUserIdsSSL = null;
    if (teamId) {
      teamUserIdsSSL = {};
      sheetData(SHEET_NAMES.USERS).forEach(function(u){
        if (String(u.TeamID||'')===String(teamId)) teamUserIdsSSL[String(u.UserID||'')] = true;
      });
    }
    var conns = sheetData(SHEET_NAMES.CONNECTIONS).filter(function(c){
      if (String(c.Status||'').toLowerCase() !== 'active') return false;
      if (deptId && String(c.DeptID||'') !== String(deptId)) return false;
      if (svcId  && String(c.ServiceID||'') !== String(svcId)) return false;
      if (connectionType && normConnectionType(c.ConnectionType) !== connectionType) return false;
      if (teamUserIdsSSL && !teamUserIdsSSL[String(c.VAUserID||'')]) return false;
      if (allowSetSSL) {
        var cidChk2 = String(c.ConnectionID||'').trim();
        var suffixChk2 = cidChk2.split('_').pop();
        if (!allowSetSSL[cidChk2] && !allowSetSSL[suffixChk2]) return false;
      }
      return true;
    });

    // Split into: not-yet-started (excluded), Not Applicable (joined this period —
    // weekly only; a mid-month join still gets a full month's report so monthly
    // skips this), Paused (excluded, tracked separately), countable
    var periodEndSSL = _periodEndDateOf(periodKey, isMonthly);
    var countable = [], naCount = 0, pausedCount = 0;
    conns.forEach(function(c){
      var joinP = c.StartDate ? _periodKeyOf(c.StartDate, isMonthly) : '';
      if (joinP && joinP > periodKey) return;         // doesn't exist yet — excluded
      if (!isMonthly && joinP && joinP === periodKey) { naCount++; return; } // joined this week — N/A
      var statusThen = _statusAsOfDate(c.StatusHistory, c.Status, periodEndSSL);
      if (statusThen === 'Paused') { pausedCount++; return; } // paused this period — excluded
      countable.push(c);
    });

    var connLookup = {};
    countable.forEach(function(c){
      var cid = String(c.ConnectionID).trim();
      connLookup[cid] = cid;
      var parts = cid.split('_');
      if (parts.length > 1) connLookup[parts[parts.length-1]] = cid;
    });

    var ssApp = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheetExists(ssApp, sheetName);
    var sheet = ssApp.getSheetByName(sheetName);
    var submittedSet = {};
    if (sheet && sheet.getLastRow() > 1) {
      var hdrs   = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
      var cidIdx = hdrs.indexOf('ConnectionID');
      var wsdIdx = hdrs.indexOf(dateField);
      if (cidIdx >= 0 && wsdIdx >= 0) {
        var numRows = sheet.getLastRow()-1;
        var cidVals = sheet.getRange(2, cidIdx+1, numRows, 1).getValues();
        var wsdVals = sheet.getRange(2, wsdIdx+1, numRows, 1).getValues();
        for (var j=0; j<numRows; j++) {
          var rawCid = String(cidVals[j][0]||'').trim();
          if (!rawCid) continue;
          var parts_c   = rawCid.split('_');
          var suffix    = parts_c[parts_c.length-1];
          var canonical = connLookup[rawCid] || connLookup[suffix];
          if (!canonical) continue;
          var wsd = _normDateStr(wsdVals[j][0]).slice(0, cmpLen);
          if (wsd === periodKey) submittedSet[canonical] = true;
        }
      }
    }

    var submittedList = [], pendingList = [];
    countable.forEach(function(c){
      var cid = String(c.ConnectionID).trim();
      var entry = { ConnectionID: cid, ClientName: c.ClientName || '', VAUserID: c.VAUserID || '',
                    DeptID: c.DeptID || '', DeptName: c.DeptName || c.DeptID || '', ServiceID: c.ServiceID || '' };
      if (submittedSet[cid]) submittedList.push(entry); else pendingList.push(entry);
    });

    return {
      success: true,
      data: {
        period: periodKey, total: countable.length, submitted: submittedList.length,
        pending: pendingList.length, naCount: naCount, pausedCount: pausedCount,
        submittedList: submittedList, pendingList: pendingList
      }
    };
  } catch(e) {
    Logger.log('[getSubmissionStatusList] ERROR: '+e.message);
    return { success:false, message:e.message, data:null };
  }
}


function testPerfData(weekStartDate, period) {
  try {
    var ss      = SpreadsheetApp.getActiveSpreadsheet();
    var isMonthly = period === 'monthly';
    var sheetName = isMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
    var dateField = isMonthly ? 'MonthStartDate' : 'WeekStartDate';
    var cmpLen    = isMonthly ? 7 : 10;
    var pKey      = String(weekStartDate||'').slice(0, cmpLen);
    if (!pKey) pKey = isMonthly
      ? (function(){ var n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); })()
      : getMondayStr(new Date());

    var sheet = ss.getSheetByName(sheetName);
    var result = {
      sheetName:   sheetName,
      sheetExists: !!sheet,
      sheetLastRow: sheet ? sheet.getLastRow() : 0,
      headers: [], cidIdx:-1, wsdIdx:-1,
      numRows: 0, matched: 0,
      sampleRaw: [], sampleMatches: [],
      activeConns: 0, perfMapSize: 0
    };

    if (!sheet || sheet.getLastRow() < 2) return { success:true, ...result };

    var lastCol = sheet.getLastColumn();
    var hdrs    = sheet.getRange(1,1,1,lastCol).getValues()[0];
    result.headers = hdrs;
    result.cidIdx  = hdrs.indexOf('ConnectionID');
    result.wsdIdx  = hdrs.indexOf(dateField);

    if (result.cidIdx >= 0 && result.wsdIdx >= 0) {
      var numRows = sheet.getLastRow() - 1;
      result.numRows = numRows;
      var cidVals = sheet.getRange(2, result.cidIdx+1, numRows, 1).getValues();
      var wsdVals = sheet.getRange(2, result.wsdIdx+1, numRows, 1).getValues();
      var onTIdx  = hdrs.indexOf('OnTargetCount');
      var atRIdx  = hdrs.indexOf('AtRiskCount');
      var criIdx  = hdrs.indexOf('CriticalCount');
      var onTVals = onTIdx>=0 ? sheet.getRange(2,onTIdx+1,numRows,1).getValues() : null;
      var atRVals = atRIdx>=0 ? sheet.getRange(2,atRIdx+1,numRows,1).getValues() : null;
      var criVals = criIdx>=0 ? sheet.getRange(2,criIdx+1,numRows,1).getValues() : null;

      // Sample first 5 rows
      for (var i=0; i<Math.min(5,numRows); i++) {
        var rawWsd = wsdVals[i][0];
        var wsdStr = _normDateStr(rawWsd);
        result.sampleRaw.push({
          cid:String(cidVals[i][0]||'').trim(), wsd:wsdStr,
          wsdType: rawWsd instanceof Date ? 'Date' : typeof rawWsd,
          onT: onTVals?Number(onTVals[i][0]||0):0,
          atR: atRVals?Number(atRVals[i][0]||0):0,
          crit:criVals?Number(criVals[i][0]||0):0
        });
      }

      // Count matches
      for (var j=0; j<numRows; j++) {
        var cid = String(cidVals[j][0]||'').trim();
        if (!cid) continue;
        var rawW = wsdVals[j][0];
        var wsd2 = _normDateStr(rawW);
        if (isMonthly) wsd2 = wsd2.slice(0,7);
        if (wsd2.slice(0,cmpLen)===pKey) {
          result.matched++;
          if (result.sampleMatches.length < 3) result.sampleMatches.push(cid);
        }
      }
    }

    // Active connections
    var conns = getVAConnections(Session.getActiveUser().getEmail(), 'Administrator');
    result.activeConns = ((conns&&conns.data)||[]).filter(function(c){ return String(c.Status||'').toLowerCase()==='active'; }).length;

    // Perf map
    var pm = summaryByPeriod(sheetName, dateField, pKey, isMonthly);
    result.perfMapSize = Object.keys(pm).length;

    return { success:true, ...result };
  } catch(e) {
    return { success:false, message:e.message+'\n'+e.stack };
  }
}

function inspectPerfSheet() {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAMES.KPI_WEEKLY_SUMMARY);
    if (!sheet) return { success:false, message:'Sheet not found: '+SHEET_NAMES.KPI_WEEKLY_SUMMARY };
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var hdrs    = sheet.getRange(1,1,1,lastCol).getValues()[0];
    var cidIdx  = hdrs.indexOf('ConnectionID');
    var wsdIdx  = hdrs.indexOf('WeekStartDate');
    var onTIdx  = hdrs.indexOf('OnTargetCount');
    var atRIdx  = hdrs.indexOf('AtRiskCount');
    var criIdx  = hdrs.indexOf('CriticalCount');
    if (lastRow < 2) return { success:true, sheetName:SHEET_NAMES.KPI_WEEKLY_SUMMARY, lastRow:lastRow, headers:hdrs, rows:[], weeks:[] };

    var numRows = lastRow-1;
    var cidVals = sheet.getRange(2,cidIdx+1,numRows,1).getValues();
    var wsdVals = sheet.getRange(2,wsdIdx+1,numRows,1).getValues();
    var onTVals = onTIdx>=0?sheet.getRange(2,onTIdx+1,numRows,1).getValues():null;
    var atRVals = atRIdx>=0?sheet.getRange(2,atRIdx+1,numRows,1).getValues():null;
    var criVals = criIdx>=0?sheet.getRange(2,criIdx+1,numRows,1).getValues():null;

    // First 5 rows
    var rows5 = [];
    for (var i=0;i<Math.min(5,numRows);i++) {
      var rw = wsdVals[i][0];
      var wsdP = _normDateStr(rw);
      rows5.push({cid:String(cidVals[i][0]||'').trim(),wsdRaw:String(rw||''),wsdType:rw instanceof Date?'Date':typeof rw,wsdParsed:wsdP,
        onT:onTVals?Number(onTVals[i][0]||0):0,atR:atRVals?Number(atRVals[i][0]||0):0,crit:criVals?Number(criVals[i][0]||0):0});
    }

    // Week counts
    var wkCounts = {};
    for (var j=0;j<numRows;j++) {
      var wk = _normDateStr(wsdVals[j][0]);
      if (wk) wkCounts[wk]=(wkCounts[wk]||0)+1;
    }
    var weeks = Object.keys(wkCounts).sort().reverse().slice(0,10).map(function(k){return{key:k,count:wkCounts[k]};});
    return {success:true,sheetName:SHEET_NAMES.KPI_WEEKLY_SUMMARY,lastRow:lastRow,headers:hdrs.filter(function(h){return h!=='KPIs';}),rows:rows5,weeks:weeks};
  } catch(e) { return {success:false,message:e.message+'\n'+e.stack}; }
}

function testSubmissions() {
  try {
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var tz  = Session.getScriptTimeZone();
    var now = new Date();
    var thisWeek = getMondayStr(now);

    // ── 1. Read KPI_Weekly_Summary directly ──
    var sheet = ss.getSheetByName('KPI_Weekly_Summary');
    if (!sheet) return { success: false, message: 'KPI_Weekly_Summary not found' };
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2) return { success: false, message: 'Sheet empty' };
    var hdrs   = sheet.getRange(1,1,1,lastCol).getValues()[0];
    var cidIdx = hdrs.indexOf('ConnectionID');
    var wsdIdx = hdrs.indexOf('WeekStartDate');
    var numRows = lastRow - 1;
    var cidCol = sheet.getRange(2, cidIdx+1, numRows, 1).getDisplayValues();
    var wsdCol = sheet.getRange(2, wsdIdx+1, numRows, 1).getValues();

    // ── 2. Build week stats ──
    var matchCount = 0, totalRows = 0;
    var uniqueWeeks = {};
    var summaryIds = {};
    for (var j = 0; j < numRows; j++) {
      var cid    = String(cidCol[j][0]||'').trim();
      if (!cid) continue;
      totalRows++;
      var normed = _normDateStr(wsdCol[j][0]);
      uniqueWeeks[normed] = (uniqueWeeks[normed]||0) + 1;
      if (normed === thisWeek) { matchCount++; summaryIds[cid] = true; }
    }
    var allWeeks = Object.keys(uniqueWeeks).sort().reverse().slice(0,10);

    // ── 3. Get active connections from Connections sheet ──
    var connSheet  = ss.getSheetByName('Connections');
    var connHdrs   = connSheet.getRange(1,1,1,connSheet.getLastColumn()).getValues()[0];
    var connCidIdx = connHdrs.indexOf('ConnectionID');
    var connStIdx  = connHdrs.indexOf('Status');
    var connVals   = connSheet.getRange(2,1,connSheet.getLastRow()-1,connSheet.getLastColumn()).getDisplayValues();
    var activeConns = connVals.filter(function(r){
      return String(r[connStIdx]||'').toLowerCase() === 'active';
    }).map(function(r){ return String(r[connCidIdx]||'').trim(); }).filter(Boolean);

    // ── 4. Cross-match ──
    var matchedConns = activeConns.filter(function(cid){ return !!summaryIds[cid]; });
    var sampleActive  = activeConns.slice(0,5);
    var sampleSummary = Object.keys(summaryIds).slice(0,5);

    // ── 5. Sample rows with raw data ──
    var sampleRows = [];
    for (var i = 0; i < Math.min(5, numRows); i++) {
      sampleRows.push({
        row: i+2,
        cid: String(cidCol[i][0]||''),
        wsdRaw: String(wsdCol[i][0]||''),
        wsdType: typeof wsdCol[i][0],
        normalized: _normDateStr(wsdCol[i][0])
      });
    }

    // ── 6. Check KPI_Weekly_Reports for this week too ──
    var rptSheet  = ss.getSheetByName('KPI_Weekly_Reports');
    var rptCount  = 0;
    var rptSampleIds = [];
    if (rptSheet && rptSheet.getLastRow() > 1) {
      var rptHdrs   = rptSheet.getRange(1,1,1,rptSheet.getLastColumn()).getValues()[0];
      var rptCidIdx = rptHdrs.indexOf('ConnectionID');
      var rptWsdIdx = rptHdrs.indexOf('WeekStartDate');
      var rptNumRows = rptSheet.getLastRow() - 1;
      var rptCids   = rptSheet.getRange(2, rptCidIdx+1, rptNumRows, 1).getDisplayValues();
      var rptWsds   = rptSheet.getRange(2, rptWsdIdx+1, rptNumRows, 1).getValues();
      var rptSeen   = {};
      for (var ri = 0; ri < rptNumRows; ri++) {
        var rCid = String(rptCids[ri][0]||'').trim();
        var rWsd = _normDateStr(rptWsds[ri][0]);
        if (rWsd === thisWeek && rCid && !rptSeen[rCid]) {
          rptSeen[rCid] = true; rptCount++;
          if (rptSampleIds.length < 5) rptSampleIds.push(rCid);
        }
      }
    }

    return {
      success:          true,
      timezone:         tz,
      thisWeek:         thisWeek,
      sheetLastRow:     lastRow,
      totalDataRows:    totalRows,
      matchCount:       matchCount,
      allWeeksStored:   allWeeks,
      weekCounts:       uniqueWeeks,
      sampleRows:       sampleRows,
      activeConnCount:  activeConns.length,
      matchedConnCount: matchedConns.length,
      sampleActive:     sampleActive,
      sampleSummaryIds: sampleSummary,
      rptUniqueConns:   rptCount,
      rptSampleIds:     rptSampleIds
    };
  } catch(e) { return { success:false, message:e.message }; }
}

// entries = [{kpiId, target, actual, noData, status}]
// statuses = [status strings] — derived from entries if not passed separately
function upsertWeeklySummary(connectionId, weekStartDate, statuses, submittedBy, submittedAt, ss, entries) {
  try {
    var ssObj = ss || SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ssObj.getSheetByName(SHEET_NAMES.KPI_WEEKLY_SUMMARY);
    if (!sheet) { ensureSheetExists(ssObj, SHEET_NAMES.KPI_WEEKLY_SUMMARY); sheet = ssObj.getSheetByName(SHEET_NAMES.KPI_WEEKLY_SUMMARY); }
    var worst = _worstStatus(statuses);
    // Build compact KPI JSON array — only the fields needed for drill-down
    var kpisJson = JSON.stringify((entries||[]).map(function(e) {
      return { kpiId:e.kpiId||e.KPIID, target:e.target, actual:e.actual, noData:e.noData||false, status:e.status };
    }));
    // Store WeekStartDate as plain YYYY-MM-DD string to avoid ISO/timezone issues on read
    var wsdClean = _normDateStr(weekStartDate) || String(weekStartDate).slice(0,10);
    var row = {
      SummaryID:      genId('WS'),
      ConnectionID:   connectionId,
      WeekStartDate:  wsdClean,
      Status:         worst,
      OnTargetCount:  _countStatus(statuses, KPI_STATUS.ON_TARGET),
      AtRiskCount:    _countStatus(statuses, KPI_STATUS.AT_RISK),
      CriticalCount:  _countStatus(statuses, KPI_STATUS.CRITICAL),
      NoDataCount:    _countStatus(statuses, KPI_STATUS.NO_DATA),
      TotalKPIs:      statuses.length,
      KPIs:           kpisJson,
      SubmittedBy:    submittedBy,
      SubmittedAt:    submittedAt
    };
    var data   = sheet.getDataRange().getValues();
    var hdrs   = data[0];
    var cidIdx = hdrs.indexOf('ConnectionID');
    var wsdIdx = hdrs.indexOf('WeekStartDate');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][cidIdx]||'') === String(connectionId) &&
          _normDateStr(data[i][wsdIdx]) === wsdClean) {
        hdrs.forEach(function(h, hi) { if (row[h] !== undefined) sheet.getRange(i+1, hi+1).setValue(row[h]); });
        return;
      }
    }
    appendRowByHeaders(sheet, row);
  } catch(e) { Logger.log('upsertWeeklySummary error: ' + e.message); }
}

function upsertMonthlySummary(connectionId, monthStartDate, statuses, submittedBy, submittedAt, ss, entries) {
  try {
    var ssObj = ss || SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ssObj.getSheetByName(SHEET_NAMES.KPI_MONTHLY_SUMMARY);
    if (!sheet) { ensureSheetExists(ssObj, SHEET_NAMES.KPI_MONTHLY_SUMMARY); sheet = ssObj.getSheetByName(SHEET_NAMES.KPI_MONTHLY_SUMMARY); }
    var worst    = _worstStatus(statuses);
    var kpisJson = JSON.stringify((entries||[]).map(function(e) {
      return { kpiId:e.kpiId||e.KPIID, target:e.target, actual:e.actual, noData:e.noData||false, status:e.status };
    }));
    var msdClean = _normDateStr(monthStartDate) || String(monthStartDate).slice(0,10);
    var row = {
      SummaryID:      genId('MS'),
      ConnectionID:   connectionId,
      MonthStartDate: msdClean,
      Status:         worst,
      OnTargetCount:  _countStatus(statuses, KPI_STATUS.ON_TARGET),
      AtRiskCount:    _countStatus(statuses, KPI_STATUS.AT_RISK),
      CriticalCount:  _countStatus(statuses, KPI_STATUS.CRITICAL),
      NoDataCount:    _countStatus(statuses, KPI_STATUS.NO_DATA),
      TotalKPIs:      statuses.length,
      KPIs:           kpisJson,
      SubmittedBy:    submittedBy,
      SubmittedAt:    submittedAt
    };
    var data   = sheet.getDataRange().getValues();
    var hdrs   = data[0];
    var cidIdx = hdrs.indexOf('ConnectionID');
    var msdIdx = hdrs.indexOf('MonthStartDate');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][cidIdx]||'') === String(connectionId) &&
          _normDateStr(data[i][msdIdx]).slice(0,7) === msdClean.slice(0,7)) {
        hdrs.forEach(function(h, hi) { if (row[h] !== undefined) sheet.getRange(i+1, hi+1).setValue(row[h]); });
        return;
      }
    }
    appendRowByHeaders(sheet, row);
  } catch(e) { Logger.log('upsertMonthlySummary error: ' + e.message); }
}

// ── Summary sheet fast readers (replaces full sheet reads for performance data) ──
// Returns {connectionId: {status, onTarget, atRisk, critical, noData, total}} for a given period key
function summaryByPeriod(sheetName, dateField, periodKey, isMonthly) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log('[summaryByPeriod] empty or not found: '+sheetName);
    return {};
  }
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var hdrs    = sheet.getRange(1,1,1,lastCol).getValues()[0];
  var cmpLen  = isMonthly ? 7 : 10;
  var pKey    = String(periodKey||'').slice(0, cmpLen);
  // For weekly: ensure pKey is snapped to Monday using local-safe parse
  if (!isMonthly && pKey.length === 10) pKey = getMondayStr(pKey);

  var iConn  = hdrs.indexOf('ConnectionID');
  var iWsd   = hdrs.indexOf(dateField);
  var iStat  = hdrs.indexOf('Status');
  var iOnT   = hdrs.indexOf('OnTargetCount');
  var iAtR   = hdrs.indexOf('AtRiskCount');
  var iCrit  = hdrs.indexOf('CriticalCount');
  var iNoD   = hdrs.indexOf('NoDataCount');
  var iTot   = hdrs.indexOf('TotalKPIs');
  var iSubBy = hdrs.indexOf('SubmittedBy');
  var iSubAt = hdrs.indexOf('SubmittedAt');
  // KPIs blob column intentionally NOT read here

  if (iConn < 0 || iWsd < 0) {
    Logger.log('[summaryByPeriod] Missing columns. hdrs='+JSON.stringify(hdrs));
    return {};
  }

  var numRows = lastRow - 1;
  // Read ONLY individual columns needed — never the KPIs blob (causes memory/timeout issues)
  var cidVals  = sheet.getRange(2, iConn+1,  numRows, 1).getValues();
  var wsdVals  = sheet.getRange(2, iWsd+1,   numRows, 1).getValues();
  var statVals = iStat  >= 0 ? sheet.getRange(2, iStat+1,  numRows, 1).getValues() : null;
  var onTVals  = iOnT   >= 0 ? sheet.getRange(2, iOnT+1,   numRows, 1).getValues() : null;
  var atRVals  = iAtR   >= 0 ? sheet.getRange(2, iAtR+1,   numRows, 1).getValues() : null;
  var critVals = iCrit  >= 0 ? sheet.getRange(2, iCrit+1,  numRows, 1).getValues() : null;
  var noDVals  = iNoD   >= 0 ? sheet.getRange(2, iNoD+1,   numRows, 1).getValues() : null;
  var totVals  = iTot   >= 0 ? sheet.getRange(2, iTot+1,   numRows, 1).getValues() : null;
  var subByVals= iSubBy >= 0 ? sheet.getRange(2, iSubBy+1, numRows, 1).getValues() : null;
  var subAtVals= iSubAt >= 0 ? sheet.getRange(2, iSubAt+1, numRows, 1).getValues() : null;

  var out = {};
  var matched = 0;
  for (var i = 0; i < numRows; i++) {
    var cid = String(cidVals[i][0]||'').trim();
    if (!cid) continue;
    var wsdRaw = wsdVals[i][0];
    // _normDateStr handles ALL formats: Date object, ISO string, "Apr 06 2026", "2026-04-06"
    var wsd = _normDateStr(wsdRaw);
    if (isMonthly) wsd = wsd.slice(0,7); // monthly: compare YYYY-MM only
    if (!wsd || wsd.slice(0,cmpLen) !== pKey) continue;
    matched++;
    out[cid] = {
      status:      statVals  ? String(statVals[i][0]||'')  : '',
      onTarget:    onTVals   ? Number(onTVals[i][0]||0)    : 0,
      atRisk:      atRVals   ? Number(atRVals[i][0]||0)    : 0,
      critical:    critVals  ? Number(critVals[i][0]||0)   : 0,
      noData:      noDVals   ? Number(noDVals[i][0]||0)    : 0,
      total:       totVals   ? Number(totVals[i][0]||0)    : 0,
      kpis:        [],       // fetch per-connection via getConnWeeklySubmissions
      submittedBy: subByVals ? String(subByVals[i][0]||'') : '',
      submittedAt: subAtVals ? String(subAtVals[i][0]||'') : ''
    };
  }
  Logger.log('[summaryByPeriod] sheet='+sheetName+' pKey='+pKey+' scanned='+numRows+' matched='+matched);
  return out;
}

function backfillSummarySheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetExists(ss, SHEET_NAMES.KPI_WEEKLY_SUMMARY);
  ensureSheetExists(ss, SHEET_NAMES.KPI_MONTHLY_SUMMARY);

  Logger.log('Backfilling weekly summary...');
  var weekly = sheetData(SHEET_NAMES.KPI_WEEKLY);
  var weekGroups = {};
  weekly.forEach(function(r) {
    var key = String(r.ConnectionID) + '|' + String(r.WeekStartDate).slice(0,10);
    if (!weekGroups[key]) weekGroups[key] = { connectionId:r.ConnectionID, wsd:String(r.WeekStartDate).slice(0,10), statuses:[], submittedBy:r.SubmittedBy, submittedAt:r.SubmittedAt };
    weekGroups[key].statuses.push(r.Status);
    if (r.SubmittedAt > weekGroups[key].submittedAt) { weekGroups[key].submittedBy = r.SubmittedBy; weekGroups[key].submittedAt = r.SubmittedAt; }
  });
  Object.values(weekGroups).forEach(function(g) {
    upsertWeeklySummary(g.connectionId, g.wsd, g.statuses, g.submittedBy, g.submittedAt, ss);
  });
  Logger.log('Weekly summary: ' + Object.keys(weekGroups).length + ' rows written');

  Logger.log('Backfilling monthly summary...');
  var monthly = sheetData(SHEET_NAMES.KPI_MONTHLY);
  var monthGroups = {};
  monthly.forEach(function(r) {
    var key = String(r.ConnectionID) + '|' + String(r.MonthStartDate).slice(0,7);
    if (!monthGroups[key]) monthGroups[key] = { connectionId:r.ConnectionID, msd:String(r.MonthStartDate).slice(0,7)+'-01', statuses:[], submittedBy:r.SubmittedBy, submittedAt:r.SubmittedAt };
    monthGroups[key].statuses.push(r.Status);
    if (r.SubmittedAt > monthGroups[key].submittedAt) { monthGroups[key].submittedBy = r.SubmittedBy; monthGroups[key].submittedAt = r.SubmittedAt; }
  });
  Object.values(monthGroups).forEach(function(g) {
    upsertMonthlySummary(g.connectionId, g.msd, g.statuses, g.submittedBy, g.submittedAt, ss);
  });
  Logger.log('Monthly summary: ' + Object.keys(monthGroups).length + ' rows written');
  return { success: true, message: 'Backfill complete. Weekly: ' + Object.keys(weekGroups).length + ', Monthly: ' + Object.keys(monthGroups).length };
}

function submitWeeklyReport(data, requesterId) {
  try {
    if (!hasRole(requesterId, [ROLES.VA, ROLES.ADMIN, ROLES.MANAGER, ROLES.TEAM_LEADER])) return { success: false, message: 'Unauthorized.' };
    var u = getUserById(requesterId);
    var role = u ? u.Role : '';
    var wsd = String(data.weekStartDate).slice(0,10);
    if (role === ROLES.VA) {
      var alreadySubmitted = isSummarySubmitted(SHEET_NAMES.KPI_WEEKLY_SUMMARY, 'WeekStartDate', data.connectionId, wsd, false);
      if (alreadySubmitted) return { success: false, message: 'You have already submitted a report for this week. Only a Team Leader or above can edit it.' };
    }
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAMES.KPI_WEEKLY);
    var now = new Date().toISOString();
    var statuses = [], summaryEntries = [];
    data.entries.forEach(function(entry) {
      var cfg    = getConfigForKPI(data.connectionId, entry.kpiId);
      var status = calcStatus(entry.actual, entry.target, cfg);
      statuses.push(status);
      summaryEntries.push({ kpiId:entry.kpiId, target:entry.target, actual:entry.actual, noData:entry.noData||false, status:status });
      appendRowByHeaders(sheet, {
        ReportID:genId('WR'), ConnectionID:data.connectionId, KPIID:entry.kpiId,
        WeekStartDate:wsd, AccountLabel:entry.accountLabel||'',
        Target:entry.target, Actual:entry.actual, NoDataAvailable:entry.noData||false,
        Status:status, SubmittedBy:requesterId, SubmittedAt:now
      });
    });
    // Upsert summary row with full KPI detail JSON
    upsertWeeklySummary(data.connectionId, wsd, statuses, requesterId, now, ss, summaryEntries);
    clearSheetCache(SHEET_NAMES.KPI_WEEKLY);
    clearSheetCache(SHEET_NAMES.KPI_WEEKLY_SUMMARY);
    return { success: true, message: 'Weekly report submitted successfully.' };
  } catch(e) { return { success: false, message: e.message }; }
}
function submitMonthlyReport(data, requesterId) {
  try {
    if (!hasRole(requesterId, [ROLES.VA, ROLES.ADMIN])) return { success: false, message: 'Unauthorized.' };
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAMES.KPI_MONTHLY);
    var now   = new Date().toISOString();
    var msd   = String(data.monthStartDate).slice(0,10);
    var statuses = [], summaryEntries = [];
    data.entries.forEach(function(entry) {
      var cfg    = getConfigForKPI(data.connectionId, entry.kpiId);
      var status = calcStatus(entry.actual, entry.target, cfg);
      statuses.push(status);
      summaryEntries.push({ kpiId:entry.kpiId, target:entry.target, actual:entry.actual, noData:entry.noData||false, status:status });
      appendRowByHeaders(sheet, {
        ReportID:genId('MR'), ConnectionID:data.connectionId, KPIID:entry.kpiId,
        MonthStartDate:msd, AccountLabel:entry.accountLabel||'',
        Target:entry.target, Actual:entry.actual, NoDataAvailable:entry.noData||false,
        Status:status, SubmittedBy:requesterId, SubmittedAt:now
      });
    });
    upsertMonthlySummary(data.connectionId, msd, statuses, requesterId, now, ss, summaryEntries);
    clearSheetCache(SHEET_NAMES.KPI_MONTHLY);
    clearSheetCache(SHEET_NAMES.KPI_MONTHLY_SUMMARY);
    return { success: true, message: 'Monthly report submitted successfully.' };
  } catch(e) { return { success: false, message: e.message }; }
}
function getMonthlySubmissionStatus(requesterId, userRole, monthOverride, deptId, serviceId) {
  try {
    var allConns = getVAConnections(requesterId, userRole).data || [];
    if (deptId)    allConns = allConns.filter(function(c){ return String(c.DeptID||'')    === String(deptId);    });
    if (serviceId) allConns = allConns.filter(function(c){ return String(c.ServiceID||'') === String(serviceId); });
    var allUsers = sheetData(SHEET_NAMES.USERS);
    var allDepts = sheetData(SHEET_NAMES.DEPARTMENTS);
    var allSvcs  = sheetData(SHEET_NAMES.SERVICES);
    var now = new Date();
    var thisMonth = monthOverride ? String(monthOverride).slice(0,7)
      : now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');

    var userMap = {}; allUsers.forEach(function(u){ userMap[String(u.UserID)] = u; });
    var deptMap = {}; allDepts.forEach(function(d){ deptMap[String(d.DeptID)] = d.DeptName; });
    var svcMap  = {}; allSvcs.forEach(function(s){ svcMap[String(s.ServiceID)] = s.ServiceName; });

    // Build submitted set from KPI_Monthly_Summary (one row per connection per month)
    var submittedConnIds = buildSubmittedSet(SHEET_NAMES.KPI_MONTHLY_SUMMARY, 'MonthStartDate', thisMonth, true);

    allConns = allConns.filter(function(c){ return String(c.Status||'').toLowerCase() === 'active'; });

    // Group by VA
    var vaGroups = {};
    allConns.forEach(function(conn) {
      var vaId = conn.VAUserID;
      if (!vaGroups[vaId]) {
        var u = userMap[String(vaId)] || {};
        vaGroups[vaId] = {
          vaId: vaId, vaName: (u.FirstName||'') + ' ' + (u.LastName||''),
          deptId: conn.DeptID, serviceId: conn.ServiceID,
          deptName: deptMap[conn.DeptID]||conn.DeptID||'—',
          serviceName: svcMap[conn.ServiceID]||conn.ServiceID||'—',
          teamId: u.TeamID||'', connections: [], submittedCount: 0, totalCount: 0
        };
      }
      vaGroups[vaId].connections.push(conn);
      vaGroups[vaId].totalCount++;
      if (submittedConnIds[String(conn.ConnectionID)]) vaGroups[vaId].submittedCount++;
    });
    return { success: true, data: Object.values(vaGroups), month: thisMonth };
  } catch(e) { return { success: false, message: e.message }; }
}

function getDeptMonthlySubmissionSummary(requesterId, userRole, monthOverride, deptId, serviceId) {
  try {
    var allConns = getVAConnections(requesterId, userRole||ROLES.ADMIN).data || [];
    if (deptId)    allConns = allConns.filter(function(c){ return String(c.DeptID||'')===String(deptId); });
    if (serviceId) allConns = allConns.filter(function(c){ return String(c.ServiceID||'')===String(serviceId); });
    allConns = allConns.filter(function(c){ return String(c.Status||'').toLowerCase() === 'active'; });
    var depts   = sheetData(SHEET_NAMES.DEPARTMENTS);
    var deptMap = {}; depts.forEach(function(d){ deptMap[d.DeptID] = d.DeptName; });
    var now = new Date();
    var thisMonth = monthOverride ? String(monthOverride).slice(0,7)
      : now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    var submittedIds = buildSubmittedSet(SHEET_NAMES.KPI_MONTHLY_SUMMARY, 'MonthStartDate', thisMonth, true);
    var deptGroups = {};
    allConns.forEach(function(c){
      if (!deptGroups[c.DeptID]) deptGroups[c.DeptID] = { deptName: deptMap[c.DeptID]||c.DeptID||'—', submitted:0, total:0 };
      deptGroups[c.DeptID].total++;
      if (submittedIds[String(c.ConnectionID)]) deptGroups[c.DeptID].submitted++;
    });
    return { success: true, data: Object.values(deptGroups) };
  } catch(e) { return { success: false, message: e.message }; }
}

function getSubmissionListByStatus(requesterId, userRole, weekOverride, statusFilter) {
  // statusFilter: 'submitted' | 'not_submitted' | 'all'
  try {
    var allConns = getVAConnections(requesterId, userRole).data || [];
    allConns = allConns.filter(function(conn){ return String(conn.Status||'').toLowerCase() === 'active'; });
    var allUsers = sheetData(SHEET_NAMES.USERS);
    var depts    = sheetData(SHEET_NAMES.DEPARTMENTS);
    var svcs     = sheetData(SHEET_NAMES.SERVICES);
    var thisWeek = (weekOverride && String(weekOverride).trim()) ? String(weekOverride).slice(0,10) : getMondayStr(new Date());
    var userMap = {};
    allUsers.forEach(function(u){ userMap[u.UserID] = { name:(u.FirstName||'')+' '+(u.LastName||''), dept:u.Department, svc:u.ServiceID, teamId:u.TeamID||'' }; });
    var deptMap = {}; depts.forEach(function(d){ deptMap[d.DeptID] = d.DeptName; });
    var svcMap  = {}; svcs.forEach(function(s){ svcMap[s.ServiceID] = s.ServiceName; });
    // Build submitted set from KPI_Weekly_Summary
    var submittedSet = buildSubmittedSet(SHEET_NAMES.KPI_WEEKLY_SUMMARY, 'WeekStartDate', thisWeek, false);
    var result = [];
    allConns.forEach(function(conn) {
      var _cid = String(conn.ConnectionID);
      var submitted = !!submittedSet[_cid] || !!submittedSet[_normConnId(_cid)];
      var include = statusFilter==='all' || (statusFilter==='submitted' && submitted) || (statusFilter==='not_submitted' && !submitted);
      if (!include) return;
      var uInfo = userMap[conn.VAUserID] || {};
      result.push({
        connectionId: conn.ConnectionID,
        clientName:   conn.ClientName || '—',
        secondaryName: conn.SecondaryName || '',
        vaName:       uInfo.name || conn.VAUserID || '—',
        department:   deptMap[conn.DeptID]   || conn.DeptID   || '—',
        service:      svcMap[conn.ServiceID] || conn.ServiceID || '—',
        submitted:    submitted
      });
    });
    result.sort(function(a,b){ return a.vaName.localeCompare(b.vaName)||a.clientName.localeCompare(b.clientName); });
    return { success:true, data:result, weekStartDate:thisWeek };
  } catch(e) { return { success:false, message:e.message }; }
}

function getWeeklySubmissionStatus(requesterId, userRole, weekOverride, deptId, serviceId) {
  // Source of truth: KPI_Weekly_Reports for the given week.
  // Active connections with no report row = not submitted.
  try {
    var allConns = getVAConnections(requesterId, userRole).data || [];
    if (deptId)    allConns = allConns.filter(function(c){ return String(c.DeptID||'')    === String(deptId);    });
    if (serviceId) allConns = allConns.filter(function(c){ return String(c.ServiceID||'') === String(serviceId); });
    var allUsers = sheetData(SHEET_NAMES.USERS);
    var allDepts = sheetData(SHEET_NAMES.DEPARTMENTS);
    var allSvcs  = sheetData(SHEET_NAMES.SERVICES);
    var thisWeek = (weekOverride && String(weekOverride).trim())
                    ? String(weekOverride).slice(0,10)
                    : getMondayStr(new Date());

    var userMap = {}; allUsers.forEach(function(u){ userMap[String(u.UserID)] = u; });
    var deptMap = {}; allDepts.forEach(function(d){ deptMap[String(d.DeptID)] = d.DeptName; });
    var svcMap  = {}; allSvcs.forEach(function(s){ svcMap[String(s.ServiceID)] = s.ServiceName; });

    // Build submitted set from KPI_Weekly_Summary (one row per connection per week)
    var submittedConnIds = buildSubmittedSet(SHEET_NAMES.KPI_WEEKLY_SUMMARY, 'WeekStartDate', thisWeek, false);
    var _subLog = buildSubmittedSet._lastLog || [];
    _subLog.push('[getWeeklySubmissionStatus] week='+thisWeek+' submittedCount='+Object.keys(submittedConnIds).length);
    _subLog.push('[getWeeklySubmissionStatus] allConns BEFORE active filter='+allConns.length);
    _subLog.push('[getWeeklySubmissionStatus] sampleConns='+JSON.stringify(allConns.slice(0,3).map(function(c){return c.ConnectionID;})));
    _subLog.push('[getWeeklySubmissionStatus] sampleSubmittedIds='+JSON.stringify(Object.keys(submittedConnIds).filter(function(k){return k!=='_log';}).slice(0,3)));

    // Only Active connections are expected to submit
    allConns = allConns.filter(function(conn){
      return String(conn.Status||'').toLowerCase() === 'active';
    });

    // Group by VA
    var vaMap = {};
    allConns.forEach(function(conn) {
      var vaId = String(conn.VAUserID||'');
      if (!vaId) return;
      if (!vaMap[vaId]) {
        var u = userMap[vaId] || {};
        vaMap[vaId] = {
          vaId:             vaId,
          vaName:           (u.FirstName||'') + ' ' + (u.LastName||''),
          deptId:           String(u.Department||''),
          teamId:           String(u.TeamID||''),
          connections:      [],
          submittedCount:   0,
          notSubmittedCount:0
        };
      }
      var connId    = String(conn.ConnectionID);
      var submitted = !!submittedConnIds[connId] ||
                      !!submittedConnIds[_normConnId(connId)];
      vaMap[vaId].connections.push({
        connectionId: String(conn.ConnectionID),
        clientName:   conn.ClientName   || '—',
        serviceId:    String(conn.ServiceID||''),
        serviceName:  svcMap[String(conn.ServiceID||'')] || '—',
        deptId:       String(conn.DeptID||''),
        deptName:     deptMap[String(conn.DeptID||'')] || '—',
        status:       conn.Status,
        submitted:    submitted
      });
      if (submitted) vaMap[vaId].submittedCount++;
      else           vaMap[vaId].notSubmittedCount++;
    });

    var rows = Object.values(vaMap).sort(function(a,b){
      return a.vaName.localeCompare(b.vaName);
    });
    return { success: true, data: rows, weekStartDate: thisWeek };
  } catch(e) { return { success: false, message: e.message }; }
}

function getDeptSubmissionSummary(requesterId, userRole, weekOverride, deptId, serviceId) {
  try {
    var allConns = getVAConnections(requesterId, userRole||ROLES.ADMIN).data || [];
    if (deptId)    allConns = allConns.filter(function(c){ return String(c.DeptID||'')    === String(deptId);    });
    if (serviceId) allConns = allConns.filter(function(c){ return String(c.ServiceID||'') === String(serviceId); });
    var depts    = sheetData(SHEET_NAMES.DEPARTMENTS);
    var thisWeek = (weekOverride && String(weekOverride).trim()) ? String(weekOverride).slice(0,10) : getMondayStr(new Date());
    var deptMap  = {};
    depts.forEach(function(d){ deptMap[d.DeptID] = d.DeptName; });
    var submittedSet = buildSubmittedSet(SHEET_NAMES.KPI_WEEKLY_SUMMARY, 'WeekStartDate', thisWeek, false);
    var grouped  = {};
    allConns = allConns.filter(function(conn){ return String(conn.Status||'').toLowerCase() === 'active'; });
    allConns.forEach(function(conn) {
      var dId = String(conn.DeptID||'__none__');
      if (!grouped[dId]) grouped[dId] = { deptId:dId, deptName:deptMap[dId]||dId, total:0, submitted:0, notSubmitted:0 };
      grouped[dId].total++;
      var _cid = String(conn.ConnectionID);
      var submitted = !!submittedSet[_cid] || !!submittedSet[_normConnId(_cid)];
      if (submitted) grouped[dId].submitted++; else grouped[dId].notSubmitted++;
    });
    return { success:true, data: Object.values(grouped).sort(function(a,b){ return a.deptName.localeCompare(b.deptName); }), weekStartDate: thisWeek };
  } catch(e) { return { success:false, message:e.message }; }
}

function getTeamSubmissionSummary(requesterId, weekOverride) {
  try {
    var allConns = getVAConnections(requesterId, ROLES.MANAGER).data || [];
    var teams    = sheetData(SHEET_NAMES.TEAMS);
    var users    = sheetData(SHEET_NAMES.USERS);
    var thisWeek = (weekOverride && String(weekOverride).trim()) ? String(weekOverride).slice(0,10) : getMondayStr(new Date());
    var submittedTeamSet = buildSubmittedSet(SHEET_NAMES.KPI_WEEKLY_SUMMARY, 'WeekStartDate', thisWeek, false);
    var teamMap  = {};
    teams.forEach(function(t){ teamMap[t.TeamID] = t.TeamName||t.TeamID; });
    // Build userId→teamId map
    var userTeamMap = {};
    users.forEach(function(u){ userTeamMap[u.UserID] = u.TeamID||'__none__'; });
    var grouped = {};
    allConns = allConns.filter(function(conn){ return String(conn.Status||'').toLowerCase() === 'active'; });
    allConns.forEach(function(conn) {
      var tId = userTeamMap[conn.VAUserID] || '__none__';
      var tName = teamMap[tId] || (tId==='__none__'?'No Team':tId);
      if (!grouped[tId]) grouped[tId] = { teamId:tId, teamName:tName, total:0, submitted:0, notSubmitted:0 };
      grouped[tId].total++;
      var _cid2 = String(conn.ConnectionID);
      var submitted = !!submittedTeamSet[_cid2] || !!submittedTeamSet[_normConnId(_cid2)];
      if (submitted) grouped[tId].submitted++; else grouped[tId].notSubmitted++;
    });
    return { success:true, data: Object.values(grouped).sort(function(a,b){ return a.teamName.localeCompare(b.teamName); }), weekStartDate: thisWeek };
  } catch(e) { return { success:false, message:e.message }; }
}

// Reads per-KPI detail from Summary KPIs JSON — no detail sheet read
function getWeeklyReports(connId, weekStart) {
  // Direct sheet read — avoids loading KPIs JSON for all rows
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.KPI_WEEKLY_SUMMARY);
  var kpiMap = {}; sheetData(SHEET_NAMES.KPI_MASTER).forEach(function(k){ kpiMap[k.KPIID]=k; });
  var out = [];
  if (!sheet || sheet.getLastRow() < 2) return { success: true, data: out };
  var hdrs   = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  var iConn  = hdrs.indexOf('ConnectionID');
  var iWsd   = hdrs.indexOf('WeekStartDate');
  var iStat  = hdrs.indexOf('Status');
  var iKPIs  = hdrs.indexOf('KPIs');
  var iSubBy = hdrs.indexOf('SubmittedBy');
  var iSubAt = hdrs.indexOf('SubmittedAt');
  var vals   = sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues();
  var wsStart = weekStart ? String(weekStart).slice(0,10) : '';
  vals.forEach(function(row) {
    if (String(row[iConn]||'').trim() !== String(connId).trim()) return;
    var wsdRaw = row[iWsd];
    var wsd = wsdRaw instanceof Date
      ? wsdRaw.getFullYear()+'-'+String(wsdRaw.getMonth()+1).padStart(2,'0')+'-'+String(wsdRaw.getDate()).padStart(2,'0')
      : String(wsdRaw||'').slice(0,10);
    if (wsStart && wsd < wsStart) return;
    var kpisArr = []; try { if (row[iKPIs]) kpisArr = JSON.parse(row[iKPIs]); } catch(e) {}
    kpisArr.forEach(function(e) {
      var kpi = kpiMap[e.kpiId]||{};
      out.push({ ConnectionID:connId, KPIID:e.kpiId, KPIName:kpi.KPIName||e.kpiId,
                 Unit:kpi.Unit||'', WeekStartDate:wsd, Target:e.target, Actual:e.actual,
                 NoDataAvailable:e.noData, Status:e.status,
                 SubmittedBy:row[iSubBy], SubmittedAt:row[iSubAt] });
    });
  });
  return { success: true, data: out };
}
function getMonthlyReports(connId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.KPI_MONTHLY_SUMMARY);
  var kpiMap = {}; sheetData(SHEET_NAMES.KPI_MASTER).forEach(function(k){ kpiMap[k.KPIID]=k; });
  var out = [];
  if (!sheet || sheet.getLastRow() < 2) return { success: true, data: out };
  var hdrs   = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  var iConn  = hdrs.indexOf('ConnectionID');
  var iMsd   = hdrs.indexOf('MonthStartDate');
  var iStat  = hdrs.indexOf('Status');
  var iKPIs  = hdrs.indexOf('KPIs');
  var iSubBy = hdrs.indexOf('SubmittedBy');
  var iSubAt = hdrs.indexOf('SubmittedAt');
  var vals   = sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues();
  vals.forEach(function(row) {
    if (String(row[iConn]||'').trim() !== String(connId).trim()) return;
    var msdRaw = row[iMsd];
    var msd = msdRaw instanceof Date
      ? msdRaw.getFullYear()+'-'+String(msdRaw.getMonth()+1).padStart(2,'0')+'-'+String(msdRaw.getDate()).padStart(2,'0')
      : String(msdRaw||'').slice(0,10);
    var kpisArr = []; try { if (row[iKPIs]) kpisArr = JSON.parse(row[iKPIs]); } catch(e) {}
    kpisArr.forEach(function(e) {
      var kpi = kpiMap[e.kpiId]||{};
      out.push({ ConnectionID:connId, KPIID:e.kpiId, KPIName:kpi.KPIName||e.kpiId,
                 Unit:kpi.Unit||'', MonthStartDate:msd, Target:e.target, Actual:e.actual,
                 NoDataAvailable:e.noData, Status:e.status,
                 SubmittedBy:row[iSubBy], SubmittedAt:row[iSubAt] });
    });
  });
  return { success: true, data: out };
}// Read per-KPI detail for one connection+week from the Summary sheet's KPIs JSON field.
// Zero detail-sheet reads — all data comes from KPI_Weekly_Summary (4K rows, cached).
function getConnWeeklySubmissions(connId, weekStartDate, isMonthly) {
  try {
    var conn    = sheetData(SHEET_NAMES.CONNECTIONS).filter(function(c){ return String(c.ConnectionID) === String(connId); })[0];
    var kpis    = sheetData(SHEET_NAMES.KPI_MASTER);
    var users   = sheetData(SHEET_NAMES.USERS);
    var kpiMap  = {}; kpis.forEach(function(k){ kpiMap[k.KPIID] = k; });
    var userMap = {}; users.forEach(function(u){ userMap[u.UserID] = (u.FirstName||'')+' '+(u.LastName||''); });

    // ── Read from Summary sheet KPIs JSON — no detail sheet scan needed ──
    // Read directly from sheet to get KPIs JSON for this specific connection+period.
    // isMonthly may not be passed explicitly by older callers — infer it from the
    // date string length (weekly = 10-char "YYYY-MM-DD", monthly = 7-char "YYYY-MM")
    // as a fallback so this still works either way.
    if (isMonthly === undefined || isMonthly === null) {
      isMonthly = weekStartDate ? (String(weekStartDate).length === 7) : false;
    }
    var summarySheetName = isMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
    var dateFieldName    = isMonthly ? 'MonthStartDate' : 'WeekStartDate';
    var cmpLen3          = isMonthly ? 7 : 10;
    var wsdFilter = weekStartDate ? String(weekStartDate).slice(0, cmpLen3) : '';
    var matchRow  = null;
    var sumSheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(summarySheetName);
    if (sumSheet && sumSheet.getLastRow() > 1) {
      var sHdrs  = sumSheet.getRange(1,1,1,sumSheet.getLastColumn()).getValues()[0];
      var sCidI  = sHdrs.indexOf('ConnectionID');
      var sWsdI  = sHdrs.indexOf(dateFieldName);
      var sStatI = sHdrs.indexOf('Status');
      var sKpiI  = sHdrs.indexOf('KPIs');
      var sSubBI = sHdrs.indexOf('SubmittedBy');
      var sSubAI = sHdrs.indexOf('SubmittedAt');
      var sVals  = sumSheet.getRange(2,1,sumSheet.getLastRow()-1,sumSheet.getLastColumn()).getValues();
      for (var i = 0; i < sVals.length; i++) {
        var sr = sVals[i];
        if (String(sr[sCidI]||'').trim() !== String(connId).trim()) continue;
        var rowWsd = sr[sWsdI];
        var rowWsdStr = rowWsd instanceof Date
          ? (isMonthly ? rowWsd.getFullYear()+'-'+String(rowWsd.getMonth()+1).padStart(2,'0')
                       : rowWsd.getFullYear()+'-'+String(rowWsd.getMonth()+1).padStart(2,'0')+'-'+String(rowWsd.getDate()).padStart(2,'0'))
          : String(rowWsd||'').slice(0, cmpLen3);
        if (wsdFilter && rowWsdStr !== wsdFilter) continue;
        matchRow = { WeekStartDate:rowWsdStr, Status:sr[sStatI], KPIs:sr[sKpiI],
                     SubmittedBy:sr[sSubBI], SubmittedAt:sr[sSubAI] };
        break;
      }
    }

    var rows = [];
    if (matchRow && matchRow.KPIs) {
      var kpisArr = [];
      try { kpisArr = JSON.parse(matchRow.KPIs); } catch(e) {}
      // Build cfgMap for custom targets per KPIID
      var cfgList   = sheetData(SHEET_NAMES.KPI_CONFIG).filter(function(cfg){ return String(cfg.ConnectionID||'').trim()===String(connId).trim(); });
      var cfgMap    = {};
      cfgList.forEach(function(cfg){ cfgMap[String(cfg.KPIID||'')] = cfg; });

      rows = kpisArr.map(function(entry) {
        var kpi  = kpiMap[entry.kpiId] || {};
        var cfg2 = cfgMap[entry.kpiId] || {};
        // Custom target: from KPI_Config if set, otherwise from submitted entry.target
        var useMonthly2 = String(matchRow.WeekStartDate||'').length === 7;
        var masterTarget = useMonthly2 ? (kpi.MonthlyTarget||kpi.WeeklyTarget||'') : (kpi.WeeklyTarget||'');
        var configTarget = useMonthly2 ? (cfg2.MonthlyTarget||cfg2.WeeklyTarget||'') : (cfg2.WeeklyTarget||'');
        return {
          kpiId:              entry.kpiId,
          kpiName:            kpi.KPIName || entry.kpiId,
          unit:               kpi.Unit    || '',
          target:             entry.target,
          configTarget:       configTarget || '',
          masterTarget:       masterTarget || '',
          actual:             entry.actual,
          status:             entry.status,
          noData:             entry.noData || false,
          accountLabel:       entry.accountLabel || '',
          submittedBy:        userMap[matchRow.SubmittedBy] || matchRow.SubmittedBy || '',
          submittedAt:        matchRow.SubmittedAt || '',
          weekStartDate:      matchRow.WeekStartDate,
          direction:          kpi.PerformanceDirection || '',
          deviationThreshold: cfg2.DeviationThreshold  || kpi.DeviationThreshold  || '',
          atRiskThreshold:    cfg2.AtRiskThreshold     || kpi.AtRiskThreshold     || ''
        };
      });
    }

    // Team info for the VA
    var teamInfo = (function(){
      var vaUser  = sheetData(SHEET_NAMES.USERS).filter(function(u){ return String(u.UserID||'')===String(conn.VAUserID||''); })[0] || {};
      var tid     = String(vaUser.TeamID||'');
      if (!tid) return { teamName:'—', teamNumber:'', leaderName:'—' };
      var team    = sheetData(SHEET_NAMES.TEAMS).filter(function(t){ return String(t.TeamID||'')===tid; })[0] || {};
      var lidRaw  = team.TeamLeaderUserID||team.TempLeader1UserID||'';
      var ldrUser = lidRaw ? (sheetData(SHEET_NAMES.USERS).filter(function(u){ return String(u.UserID||'')===String(lidRaw); })[0]||{}) : {};
      var ldrName = ((ldrUser.FirstName||'')+' '+(ldrUser.LastName||'')).trim() || '—';
      return {
        teamName:   team.TeamName   || '—',
        teamNumber: team.TeamNumber ? 'Team '+String(team.TeamNumber).padStart(2,'0') : '—',
        leaderName: ldrName
      };
    })();

    return { success: true, data: rows, conn: conn, teamInfo: teamInfo,
             summaryStatus: matchRow ? matchRow.Status : 'No Data',
             submittedBy: matchRow ? (userMap[matchRow.SubmittedBy]||matchRow.SubmittedBy||'') : '',
             submittedAt: matchRow ? (matchRow.SubmittedAt||'') : '' };
  } catch(e) { return { success: false, message: e.message }; }
}

// Same but for monthly
function getConnMonthlySubmissions(connId, monthStartDate) {
  try {
    var conn    = sheetData(SHEET_NAMES.CONNECTIONS).filter(function(c){ return String(c.ConnectionID) === String(connId); })[0];
    var kpis    = sheetData(SHEET_NAMES.KPI_MASTER);
    var users   = sheetData(SHEET_NAMES.USERS);
    var kpiMap  = {}; kpis.forEach(function(k){ kpiMap[k.KPIID] = k; });
    var userMap = {}; users.forEach(function(u){ userMap[u.UserID] = (u.FirstName||'')+' '+(u.LastName||''); });

    var msdFilter = monthStartDate ? String(monthStartDate).slice(0,7) : '';
    var matchRow  = null;
    var mSumSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.KPI_MONTHLY_SUMMARY);
    if (mSumSheet && mSumSheet.getLastRow() > 1) {
      var mHdrs  = mSumSheet.getRange(1,1,1,mSumSheet.getLastColumn()).getValues()[0];
      var mCidI  = mHdrs.indexOf('ConnectionID');
      var mMsdI  = mHdrs.indexOf('MonthStartDate');
      var mStatI = mHdrs.indexOf('Status');
      var mKpiI  = mHdrs.indexOf('KPIs');
      var mSubBI = mHdrs.indexOf('SubmittedBy');
      var mSubAI = mHdrs.indexOf('SubmittedAt');
      var mVals  = mSumSheet.getRange(2,1,mSumSheet.getLastRow()-1,mSumSheet.getLastColumn()).getValues();
      for (var i = 0; i < mVals.length; i++) {
        var mr = mVals[i];
        if (String(mr[mCidI]||'').trim() !== String(connId).trim()) continue;
        var mRowMsd = mr[mMsdI];
        var mRowStr = mRowMsd instanceof Date
          ? mRowMsd.getFullYear()+'-'+String(mRowMsd.getMonth()+1).padStart(2,'0')
          : String(mRowMsd||'').slice(0,7);
        if (msdFilter && mRowStr !== msdFilter) continue;
        matchRow = { MonthStartDate:mRowStr+'-01', Status:mr[mStatI], KPIs:mr[mKpiI],
                     SubmittedBy:mr[mSubBI], SubmittedAt:mr[mSubAI] };
        break;
      }
    }

    var rows = [];
    if (matchRow && matchRow.KPIs) {
      var kpisArr = [];
      try { kpisArr = JSON.parse(matchRow.KPIs); } catch(e) {}
      rows = kpisArr.map(function(entry) {
        var kpi = kpiMap[entry.kpiId] || {};
        return {
          kpiId:        entry.kpiId,
          kpiName:      kpi.KPIName || entry.kpiId,
          unit:         kpi.Unit    || '',
          target:       entry.target,
          actual:       entry.actual,
          status:       entry.status,
          noData:       entry.noData || false,
          accountLabel: entry.accountLabel || '',
          submittedBy:  userMap[matchRow.SubmittedBy] || matchRow.SubmittedBy || '',
          submittedAt:  matchRow.SubmittedAt || '',
          monthStartDate:matchRow.MonthStartDate
        };
      });
    }
    return { success: true, data: rows, conn: conn,
             summaryStatus: matchRow ? matchRow.Status : 'No Data',
             submittedBy: matchRow ? (userMap[matchRow.SubmittedBy]||matchRow.SubmittedBy||'') : '',
             submittedAt: matchRow ? (matchRow.SubmittedAt||'') : '' };
  } catch(e) { return { success: false, message: e.message }; }
}
// Browser-callable diagnosis — returns actual data so you can see it without the GAS editor
function getSubmissionDiag(userId, userRole, weekOverride) {
  try {
    clearSheetCache(); // fresh reads
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var out = {};
    
    // 1. KPI_Weekly_Summary state
    var summarySheet = ss.getSheetByName('KPI_Weekly_Summary');
    if (!summarySheet) return { success: false, message: 'KPI_Weekly_Summary sheet does not exist. Run backfillWeeklySummary() first.' };
    var rawVals = summarySheet.getDataRange().getValues();
    out.summaryRowCount   = rawVals.length - 1;
    out.summaryHeaders    = rawVals[0];
    out.summaryFirstRow   = rawVals.length > 1 ? rawVals[1] : null;
    
    // 2. Parsed by sheetData
    var parsed = sheetData(SHEET_NAMES.KPI_WEEKLY_SUMMARY);
    out.parsedRowCount    = parsed.length;
    if (parsed.length > 0) {
      out.firstParsedConnId  = parsed[0].ConnectionID;
      out.firstParsedWSD     = parsed[0].WeekStartDate;
      out.firstParsedWSDStr  = _wsdStr(parsed[0].WeekStartDate);
    }
    
    // 3. Current week check
    var thisWeek = weekOverride ? String(weekOverride).slice(0,10) : getMondayStr(new Date());
    out.queryWeek = thisWeek;
    var weekMatches = parsed.filter(function(r){ return _wsdStr(r.WeekStartDate) === thisWeek; });
    out.rowsMatchingWeek = weekMatches.length;
    out.sampleWSDValues  = parsed.slice(0,5).map(function(r){ return _wsdStr(r.WeekStartDate); });
    
    // 4. Connection ID cross-check
    var conns = getVAConnections(userId, userRole).data || [];
    out.connectionCount = conns.length;
    if (conns.length > 0 && parsed.length > 0) {
      var firstConnId  = String(conns[0].ConnectionID).trim();
      var summaryConnId = String(parsed[0].ConnectionID).trim();
      out.firstConnId          = firstConnId;
      out.summaryFirstConnId   = summaryConnId;
      out.connIdMatch          = firstConnId === summaryConnId;
      out.connIdInSummary      = parsed.some(function(r){ return String(r.ConnectionID).trim() === firstConnId; });
    }
    
    // 5. Submitted connection count for thisWeek
    var submittedSet = {};
    parsed.forEach(function(r){ if (_wsdStr(r.WeekStartDate) === thisWeek) submittedSet[String(r.ConnectionID).trim()] = true; });
    out.submittedCount = Object.keys(submittedSet).length;
    out.submittedConnIds = Object.keys(submittedSet).slice(0,5); // first 5
    
    return { success: true, data: out };
  } catch(e) { return { success: false, message: e.message }; }
}

function diagSubmissions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('=== SUBMISSION DIAGNOSIS ===');
  Logger.log('Script timezone: ' + Session.getScriptTimeZone());

  // 1. Check KPI_Weekly_Summary sheet exists and has data
  var summarySheet = ss.getSheetByName('KPI_Weekly_Summary');
  if (!summarySheet) { Logger.log('ERROR: KPI_Weekly_Summary sheet does NOT exist!'); return; }
  var rawVals = summarySheet.getDataRange().getValues();
  Logger.log('KPI_Weekly_Summary: ' + rawVals.length + ' rows (including header)');
  if (rawVals.length < 2) { Logger.log('ERROR: KPI_Weekly_Summary is EMPTY — run backfillWeeklySummary()'); return; }

  // 2. Show header row
  Logger.log('Headers: ' + JSON.stringify(rawVals[0]));

  // 3. Show first 3 data rows raw
  for (var ri = 1; ri <= Math.min(3, rawVals.length-1); ri++) {
    Logger.log('Row '+ri+' raw: ' + JSON.stringify(rawVals[ri]));
    Logger.log('  ConnectionID type: ' + typeof rawVals[ri][rawVals[0].indexOf('ConnectionID')]);
    Logger.log('  WeekStartDate type: ' + typeof rawVals[ri][rawVals[0].indexOf('WeekStartDate')]);
    Logger.log('  WeekStartDate val: ' + String(rawVals[ri][rawVals[0].indexOf('WeekStartDate')]));
  }

  // 4. What sheetData() returns for it
  clearSheetCache(SHEET_NAMES.KPI_WEEKLY_SUMMARY);
  var parsed = sheetData(SHEET_NAMES.KPI_WEEKLY_SUMMARY);
  Logger.log('sheetData() rows: ' + parsed.length);
  if (parsed.length > 0) {
    Logger.log('First parsed row ConnectionID: ' + JSON.stringify(parsed[0].ConnectionID) + ' (type: '+typeof parsed[0].ConnectionID+')');
    Logger.log('First parsed row WeekStartDate: ' + JSON.stringify(parsed[0].WeekStartDate) + ' (type: '+typeof parsed[0].WeekStartDate+')');
    Logger.log('_wsdStr result: ' + _wsdStr(parsed[0].WeekStartDate));
  }

  // 5. Check KPI_Weekly_Reports for comparison
  var reportSheet = ss.getSheetByName('KPI_Weekly_Reports');
  if (reportSheet) {
    var rVals = reportSheet.getDataRange().getValues();
    Logger.log('KPI_Weekly_Reports: ' + rVals.length + ' rows');
    if (rVals.length > 1) {
      var rHdrs = rVals[0];
      var rcIdx = rHdrs.indexOf('ConnectionID');
      var rwIdx = rHdrs.indexOf('WeekStartDate');
      Logger.log('KPI_Weekly_Reports first ConnectionID: ' + JSON.stringify(rVals[1][rcIdx]));
      Logger.log('KPI_Weekly_Reports first WeekStartDate: ' + JSON.stringify(rVals[1][rwIdx]));
    }
  }

  // 6. Compare a ConnectionID from summary vs from Connections sheet
  var connSheet = ss.getSheetByName('Connections');
  if (connSheet && parsed.length > 0) {
    var connVals = connSheet.getDataRange().getValues();
    var cHdrs    = connVals[0];
    var cidIdx   = cHdrs.indexOf('ConnectionID');
    if (cidIdx >= 0 && connVals.length > 1) {
      var firstConnId = String(connVals[1][cidIdx]).trim();
      var summaryConnId = String(parsed[0].ConnectionID).trim();
      Logger.log('Connections sheet first ConnectionID: '+JSON.stringify(firstConnId));
      Logger.log('Summary first ConnectionID: '+JSON.stringify(summaryConnId));
      Logger.log('IDs match: ' + (firstConnId === summaryConnId));
    }
  }

  // 7. Current week
  var now = new Date();
  var thisWeek = getMondayStr(now);
  Logger.log('getMondayStr(now): ' + thisWeek);
  var thisWeekRows = parsed.filter(function(r){ return _wsdStr(r.WeekStartDate) === thisWeek; });
  Logger.log('Summary rows matching current week ('+thisWeek+'): ' + thisWeekRows.length);
  if (thisWeekRows.length === 0 && parsed.length > 0) {
    Logger.log('Sample _wsdStr values in summary: ' + parsed.slice(0,5).map(function(r){ return _wsdStr(r.WeekStartDate); }).join(', '));
  }

  Logger.log('=== END DIAGNOSIS ===');
  return { success: true, message: 'Check Apps Script Logs' };
}