// ============================================================
// KPI MANAGEMENT PLATFORM - Code.gs (Main Backend)
// Google Apps Script Backend — Production Ready
// ============================================================

// ─── CONSTANTS ───────────────────────────────────────────────
const SHEET_NAMES = {
  USERS: 'Users', DEPARTMENTS: 'Departments', SERVICES: 'Services',
  KPI_MASTER: 'KPI_Master', CONNECTIONS: 'Connections', KPI_CONFIG: 'KPI_Config',
  KPI_WEEKLY: 'KPI_Weekly_Reports', KPI_MONTHLY: 'KPI_Monthly_Reports',
  KPI_WEEKLY_SUMMARY:  'KPI_Weekly_Summary',
  KPI_MONTHLY_SUMMARY: 'KPI_Monthly_Summary',
  INTERVENTIONS: 'Interventions', SETTINGS: 'Settings', KPI_CONFIG_HISTORY: 'KPI_Config_History',
  TEAMS: 'Teams'
};
const ROLES = {
  ADMIN: 'Administrator', MANAGER: 'Manager', TEAM_LEADER: 'Team Leader',
  CS_SPECIALIST: 'CS Specialist', VA: 'Virtual Assistant'
};
const KPI_STATUS = { ON_TARGET: 'On Target', AT_RISK: 'At Risk', CRITICAL: 'Critical', NO_DATA: 'No Data' };

// ─── CUSTOMERS ADMIN MODULE (placeholder — NOT yet connected) ──────────────
// The "Customers" admin page (AppUsers.html: renderCustomersAdmin) currently
// renders with hardcoded sample rows only. No backend functions exist yet.
// When this module is connected, the customer data will come from a
// SEPARATE Google Sheet (not this spreadsheet) — do not add a CUSTOMERS key
// to SHEET_NAMES above pointing at a sheet in THIS spreadsheet.
// Intended initial column schema for that external sheet:
//   CustomerID, CustomerName, AccountName, AccountStatus
// No SHEET_NAMES entry, no sheetData() calls, and no gsr() functions for this
// have been added — wiring this up is a separate, deliberate future task.

// ─── WEB APP ENTRY ────────────────────────────────────────────
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('VAA Philippines — KPI Management Portal')
    .addMetaTag('viewport', 'width=1280, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Call this ONCE manually from the GAS editor (Run > setupDatabase) to initialise sheets.
// It is intentionally NOT called in doGet to keep page load fast.
function setupDatabase() {
  initializeDatabase();
  Logger.log('Database setup complete.');
}

// ─── DATABASE INIT ────────────────────────────────────────────
function initializeDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schemas = {
    USERS: { name: 'Users', headers: ['UserID','Email','PasswordHash','Role','Department','ServiceID','TeamID','FirstName','LastName','IsActive','MustChangePassword','CreatedAt','LastLogin','LoginCount'], seed: seedAdmin },
    DEPARTMENTS: { name: 'Departments', headers: ['DeptID','DeptName','Description','IsActive','CreatedAt'], seed: seedDepartments },
    SERVICES: { name: 'Services', headers: ['ServiceID','DeptID','ServiceName','Description','IsActive','CreatedAt'] },
    KPI_MASTER: { name: 'KPI_Master', headers: ['KPIID','DeptID','ServiceID','Cluster','KPIName','Description','CalculationLogic','DataSource','Unit','WeeklyTarget','MonthlyTarget','PerformanceDirection','DeviationThreshold','AtRiskThreshold','IsActive','CreatedAt'], seed: seedKPIMaster },
    CONNECTIONS: { name: 'Connections', headers: ['ConnectionID','DeptID','ServiceID','VAUserID','ClientName','SecondaryName','ClientEmail','StartDate','Status','ConnectionType','InactiveDate','StatusHistory','TeamID','TeamLeaderUserID','HasKPIConfig','IsFlagged','CreatedAt','UpdatedAt'] },
    KPI_CONFIG: { name: 'KPI_Config', headers: ['ConfigID','ConnectionID','KPIID','WeeklyTarget','MonthlyTarget','DeviationThreshold','AtRiskThreshold','IsApplicable','Notes','UpdatedBy','UpdatedAt','Version'] },
    KPI_CONFIG_HISTORY: { name: 'KPI_Config_History', headers: ['HistoryID','ConfigID','ConnectionID','KPIID','FieldChanged','OldValue','NewValue','ChangedBy','ChangedAt'] },
    KPI_WEEKLY: { name: 'KPI_Weekly_Reports', headers: ['ReportID','ConnectionID','KPIID','WeekStartDate','AccountLabel','Target','Actual','NoDataAvailable','Status','SubmittedBy','SubmittedAt'] },
    KPI_WEEKLY_SUMMARY:  { name: 'KPI_Weekly_Summary',  headers: ['SummaryID','ConnectionID','WeekStartDate','Status','OnTargetCount','AtRiskCount','CriticalCount','NoDataCount','TotalKPIs','KPIs','SubmittedBy','SubmittedAt'] },
    KPI_MONTHLY: { name: 'KPI_Monthly_Reports', headers: ['ReportID','ConnectionID','KPIID','MonthStartDate','AccountLabel','Target','Actual','NoDataAvailable','Status','SubmittedBy','SubmittedAt'] },
    KPI_MONTHLY_SUMMARY: { name: 'KPI_Monthly_Summary', headers: ['SummaryID','ConnectionID','MonthStartDate','Status','OnTargetCount','AtRiskCount','CriticalCount','NoDataCount','TotalKPIs','KPIs','SubmittedBy','SubmittedAt'] },
    INTERVENTIONS: { name: 'Interventions', headers: ['InterventionID','ConnectionID','Type','Description','ActionTaken','Outcome','CreatedBy','CreatedAt','UpdatedAt'] },
    SETTINGS: { name: 'Settings', headers: ['SettingKey','SettingValue','UpdatedBy','UpdatedAt'], seed: seedSettings },
    TEAMS: { name: 'Teams', headers: ['TeamID','TeamName','TeamNumber','DeptID','ServiceID','TeamLeaderUserID','TempLeader1UserID','TempLeader2UserID','Description','IsActive','CreatedAt'] }
  };
  Object.values(schemas).forEach(schema => {
    let sheet = ss.getSheetByName(schema.name);
    if (!sheet) {
      sheet = ss.insertSheet(schema.name);
      sheet.appendRow(schema.headers);
      sheet.getRange(1, 1, 1, schema.headers.length)
        .setBackground('#1f1f2e').setFontColor('#ff6b35').setFontWeight('bold');
      if (schema.seed) schema.seed(sheet);
    } else {
      // Add any columns that exist in the schema but are missing from the sheet
      migrateSheetColumns(sheet, schema.headers);
    }
  });
}

// ─── SCHEMA MIGRATION ─────────────────────────────────────────
// Adds any columns declared in expectedHeaders that are missing from the sheet.
// Runs every time doGet() is called — safe to run on existing data.
function migrateSheetColumns(sheet, expectedHeaders) {
  var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var existingHeaders = headerRow.map(function(h) { return String(h).trim(); });
  expectedHeaders.forEach(function(col) {
    if (existingHeaders.indexOf(col) === -1) {
      var newColIdx = sheet.getLastColumn() + 1;
      var cell = sheet.getRange(1, newColIdx);
      cell.setValue(col);
      cell.setBackground('#1f1f2e').setFontColor('#ff6b35').setFontWeight('bold');
      existingHeaders.push(col);
    }
  });
}


// Writes a row using header names — immune to column order changes in the sheet.
function appendRowByHeaders(sheet, values) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(h) { return values.hasOwnProperty(h) ? values[h] : ''; });
  sheet.appendRow(row);
}

function seedAdmin(sheet) {
  const now = new Date().toISOString();
  sheet.appendRow([genId('USR'),'admin@company.com',hashPwd('1234'),ROLES.ADMIN,'','System','Administrator',true,true,now,'']);
}
function seedDepartments(sheet) {
  const now = new Date().toISOString();
  [['Customer Support','Handles client support'],['Operations','Core ops'],['Quality Assurance','QA team']].forEach(d => {
    sheet.appendRow([genId('DEPT'),d[0],d[1],true,now]);
  });
}
function seedKPIMaster(sheet) {
  const now = new Date().toISOString();
  [
    ['Response Time','Avg time to respond','Sum of times / total queries','Ticket System','hours',2,2,'lower',20,50],
    ['CSAT Score','Client satisfaction %','Ratings sum/count*100','Survey Tool','%',90,88,'higher',5,10],
    ['FCR Rate','First contact resolution','Resolved first/total*100','CRM','%',85,83,'higher',5,15],
    ['Ticket Volume','Total tickets handled','Count of tickets','Ticket System','number',100,400,'higher',15,30],
    ['SLA Compliance','Tickets within SLA','SLA compliant/total*100','SLA Tool','%',95,93,'higher',3,8],
    ['Escalation Rate','Tickets escalated','Escalated/total*100','CRM','%',5,5,'lower',2,5],
    ['Average Handle Time','Time per ticket','Total time/tickets','CRM','minutes',15,15,'lower',20,40],
    ['Quality Score','QA eval score','Sum scores/evaluations','QA Tool','%',90,88,'higher',5,10]
  ].forEach(function(k) {
    // Col order: KPIID, DeptID, ServiceID, KPIName, Description, CalculationLogic, DataSource, Unit, WeeklyTarget, MonthlyTarget, PerformanceDirection, DeviationThreshold, AtRiskThreshold, IsActive, CreatedAt
    sheet.appendRow([genId('KPI'), '', '', k[0], k[1], k[2], k[3], k[4], k[5], k[6], k[7], k[8], k[9], true, now]);
  });
}
function seedSettings(sheet) {
  const now = new Date().toISOString();
  [['APP_NAME','KPI Management Platform'],['WEEK_START_DAY','Monday'],
   ['INTERVENTION_TYPES','Coaching,Training,Performance Plan,Process Change,Escalation,1-on-1 Meeting'],
   ['MAX_LOGIN_ATTEMPTS','5']].forEach(s => sheet.appendRow([s[0],s[1],'system',now]));
}

// ─── AUTH ─────────────────────────────────────────────────────
function verifyPassword(userId, password) {
  try {
    var user = sheetData(SHEET_NAMES.USERS).find(function(u){ return String(u.UserID) === String(userId); });
    if (!user) return { success: false, message: 'User not found.' };
    if (user.PasswordHash !== hashPwd(password)) return { success: false, message: 'Incorrect password.' };
    return { success: true };
  } catch(e) { return { success: false, message: e.message }; }
}

function login(email, password) {
  try {
    const users = sheetData(SHEET_NAMES.USERS);
    const user = users.find(u => u.Email === email && (u.IsActive === true || u.IsActive === 'TRUE'));
    if (!user) return { success: false, message: 'Invalid email or password.' };
    if (user.PasswordHash !== hashPwd(password)) return { success: false, message: 'Invalid email or password.' };
    var newLoginCount = (parseInt(user.LoginCount, 10) || 0) + 1;
    updateRow(SHEET_NAMES.USERS, 'UserID', user.UserID, { LastLogin: new Date().toISOString(), LoginCount: newLoginCount });
    return {
      success: true,
      user: { id: user.UserID, email: user.Email, role: user.Role, department: user.Department,
              firstName: user.FirstName, lastName: user.LastName },
      mustChangePassword: user.MustChangePassword === true || user.MustChangePassword === 'TRUE'
    };
  } catch(e) { return { success: false, message: e.message }; }
}

function changePassword(userId, oldPwd, newPwd) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.USERS);
    const data = sheet.getDataRange().getValues();
    const h = data[0];
    const iID = h.indexOf('UserID'), iPwd = h.indexOf('PasswordHash'), iMust = h.indexOf('MustChangePassword');
    for (let i = 1; i < data.length; i++) {
      if (data[i][iID] === userId) {
        if (data[i][iPwd] !== hashPwd(oldPwd)) return { success: false, message: 'Current password is incorrect.' };
        if (newPwd.length < 8) return { success: false, message: 'Password must be at least 8 characters.' };
        sheet.getRange(i+1, iPwd+1).setValue(hashPwd(newPwd));
        sheet.getRange(i+1, iMust+1).setValue(false);
        return { success: true, message: 'Password changed successfully.' };
      }
    }
    return { success: false, message: 'User not found.' };
  } catch(e) { return { success: false, message: e.message }; }
}

function adminResetPassword(targetUserId, requesterId) {
  try {
    var requester = getUserById(requesterId);
    if (!requester) return { success: false, message: 'Unauthorized.' };
    var reqRole = requester.Role;
    // Admin can reset anyone; Manager can only reset TL and VA in their dept
    if (reqRole !== ROLES.ADMIN && reqRole !== ROLES.MANAGER)
      return { success: false, message: 'Unauthorized.' };
    var target = getUserById(targetUserId);
    if (!target) return { success: false, message: 'User not found.' };
    if (reqRole === ROLES.MANAGER) {
      // Manager can only reset TL and VA
      if ([ROLES.ADMIN, ROLES.MANAGER].indexOf(target.Role) >= 0)
        return { success: false, message: 'Managers cannot reset passwords of Administrators or other Managers.' };
      // Must be in same department
      if (String(target.Department||'') !== String(requester.Department||''))
        return { success: false, message: 'You can only reset passwords for users in your department.' };
    }
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.USERS);
    const data  = sheet.getDataRange().getValues();
    const h     = data[0];
    const iID   = h.indexOf('UserID'), iPwd = h.indexOf('PasswordHash'), iMust = h.indexOf('MustChangePassword');
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][iID]) === String(targetUserId)) {
        sheet.getRange(i+1, iPwd+1).setValue(hashPwd('1234'));
        sheet.getRange(i+1, iMust+1).setValue(true);
        clearSheetCache(SHEET_NAMES.USERS);
        return { success: true, message: 'Password reset to 1234. User must change on next login.' };
      }
    }
    return { success: false, message: 'User not found.' };
  } catch(e) { return { success: false, message: e.message }; }
}

function _normConnId(cid) {
  if (!cid) return '';
  var s     = String(cid).trim();
  var parts = s.split('_');
  // Return last segment — the truly unique part (e.g. "TG6T340")
  return parts[parts.length - 1] || s;
}

function _normDateStr(val) {
  if (!val && val !== 0) return '';
  // Already a proper Date object — use local components
  if (val instanceof Date) {
    return val.getFullYear() + '-' +
           String(val.getMonth() + 1).padStart(2, '0') + '-' +
           String(val.getDate()).padStart(2, '0');
  }
  var s = String(val).trim();
  // ISO format with time component: "2026-04-05T16:00:00.000Z"
  // The date part may be one day behind in UTC+8, so parse and use local time
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() + '-' +
             String(d.getMonth() + 1).padStart(2, '0') + '-' +
             String(d.getDate()).padStart(2, '0');
    }
  }
  // Plain YYYY-MM-DD — use as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Any other string — try parsing as Date
  if (s.length > 0) {
    var d2 = new Date(s);
    if (!isNaN(d2.getTime())) {
      return d2.getFullYear() + '-' +
             String(d2.getMonth() + 1).padStart(2, '0') + '-' +
             String(d2.getDate()).padStart(2, '0');
    }
  }
  return s.slice(0, 10);
}

// ── Submission trend: submitted vs pending per period (last 6 weeks/months) ──
// ── StatusHistory helpers ───────────────────────────────────────────────
// Connections log every status change (Active/Paused/End of Contract/etc.) with
// an effective date in StatusHistory (JSON array: {status, date, changedBy, at}).
// These helpers use that log so paused time is never counted as active — for
// "days active" math, and for deciding whether a connection should count toward
// a given week/month's submission totals.
function _parseStatusHistory(raw) {
  var history = [];
  try {
    var s = String(raw||'');
    if (s && s !== 'undefined') history = JSON.parse(s);
    if (!Array.isArray(history)) history = [];
  } catch(e) { history = []; }
  return history.filter(function(h){ return h && h.status && h.date && !h.typeChange; })
    .sort(function(a,b){ return String(a.date).localeCompare(String(b.date)); });
}

// What status was this connection in as of a given date (inclusive)?
// Falls back to the connection's current Status if history doesn't cover that date.
function _statusAsOfDate(historyRaw, currentStatus, asOfDateStr) {
  var history = _parseStatusHistory(historyRaw);
  if (!history.length) return currentStatus || '';
  var lastEntry = history[history.length - 1];
  // If we're asking about a date on/after the most recent logged transition,
  // trust the connection's CURRENT live Status rather than extrapolating that
  // last history entry forward forever. This matters because a connection's
  // history can be incomplete (e.g. a resume that didn't get logged) — without
  // this, a connection that's genuinely Active right now but has a stale old
  // "Paused" entry as its last logged transition would be wrongly treated as
  // still paused for every period from then on, silently dropping its real
  // submissions out of every count.
  if (String(asOfDateStr) >= String(lastEntry.date)) {
    return currentStatus || lastEntry.status || '';
  }
  var status = null;
  for (var i = 0; i < history.length; i++) {
    if (String(history[i].date) <= asOfDateStr) status = history[i].status;
    else break;
  }
  return status || currentStatus || '';
}

// Total whole days this connection has spent in "Paused" status, from StartDate
// up through `uptoDateStr` (defaults to today). Used to subtract paused time out
// of "days active" so a long pause doesn't inflate a connection's apparent tenure.
function _computePausedDays(historyRaw, uptoDateStr) {
  var history = _parseStatusHistory(historyRaw);
  if (!history.length) return 0;
  var upto = uptoDateStr ? new Date(uptoDateStr+'T00:00:00') : new Date();
  var pausedDays = 0;
  for (var i = 0; i < history.length; i++) {
    if (history[i].status !== 'Paused') continue;
    var from = new Date(String(history[i].date)+'T00:00:00');
    var to = (i+1 < history.length) ? new Date(String(history[i+1].date)+'T00:00:00') : upto;
    if (to > upto) to = upto;
    var days = Math.floor((to - from) / 86400000);
    if (days > 0) pausedDays += days;
  }
  return pausedDays;
}
// Returns a lookup of ConnectionIDs (both full ID and legacy suffix form) that
// this user is actually allowed to see, based on getVAConnections' role logic
// (VA → own connections, Team Leader → own team, Manager → own department,
// Admin → everything). Callers should ALWAYS intersect their data against this
// set — deptId/teamId/serviceId params from the frontend may only narrow
// further within it, never expand beyond it.
function _roleScopedConnIdSet(userId, userRole) {
  var set = {};
  (getVAConnections(userId, userRole).data || []).forEach(function(c){
    var cid = String(c.ConnectionID||'').trim();
    if (!cid) return;
    set[cid] = true;
    var parts = cid.split('_');
    if (parts.length > 1) set[parts[parts.length-1]] = true;
  });
  return set;
}

// ── Period-key helper: maps any date to the period (week-Monday or YYYY-MM) it falls in ──
// Used to determine, for a given period, whether a connection had even started yet —
// so brand-new connections are never counted as "pending" for periods before they joined.
function _periodKeyOf(dateVal, isMonthly) {
  if (!dateVal) return '';
  var s = String(dateVal).slice(0, 10);
  if (isMonthly) return s.slice(0, 7);
  return getMondayStr(s);
}

// End date (inclusive) of a period — Sunday for a week-Monday key, last day of month for YYYY-MM.
function _periodEndDateOf(periodKey, isMonthly) {
  if (isMonthly) {
    var ymP = String(periodKey).split('-');
    var d = new Date(parseInt(ymP[0]), parseInt(ymP[1]), 0); // day 0 of next month = last day of this month
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  var wp = String(periodKey).split('-');
  var d2 = new Date(parseInt(wp[0]), parseInt(wp[1])-1, parseInt(wp[2])+6);
  return d2.getFullYear()+'-'+String(d2.getMonth()+1).padStart(2,'0')+'-'+String(d2.getDate()).padStart(2,'0');
}

// ── Summary sheet helpers ────────────────────────────────────────────────────

function _worstStatus(statuses) {
  if (statuses.indexOf(KPI_STATUS.CRITICAL) >= 0)  return KPI_STATUS.CRITICAL;
  if (statuses.indexOf(KPI_STATUS.AT_RISK)  >= 0)  return KPI_STATUS.AT_RISK;
  if (statuses.indexOf(KPI_STATUS.ON_TARGET) >= 0) return KPI_STATUS.ON_TARGET;
  return KPI_STATUS.NO_DATA;
}

function _countStatus(statuses, val) {
  return statuses.filter(function(s){ return s === val; }).length;
}

function ensureSheetExists(ss, name) {
  if (!ss.getSheetByName(name)) {
    var schema = SHEET_SCHEMA[name] || Object.values(SHEET_SCHEMA).find(function(s){ return s.name === name; });
    var newSheet = ss.insertSheet(name);
    if (schema && schema.headers) {
      newSheet.appendRow(schema.headers);
      newSheet.getRange(1,1,1,schema.headers.length).setBackground('#1f1f2e').setFontColor('#ff6b35').setFontWeight('bold');
    }
  }
}

// ─── KPI STATUS ENGINE ────────────────────────────────────────
function calcStatus(actual, target, cfg) {
  if (actual === null || actual === undefined || actual === '' || actual === false) return KPI_STATUS.NO_DATA;
  const a = parseFloat(actual), t = parseFloat(target);
  if (isNaN(a) || isNaN(t) || t === 0) return KPI_STATUS.NO_DATA;
  const dev = Math.abs(((a - t) / t) * 100);
  const dir = cfg.PerformanceDirection || 'higher';
  const devThresh = parseFloat(cfg.DeviationThreshold) || 10;
  const riskThresh = parseFloat(cfg.AtRiskThreshold) || 25;
  const underperforming = dir === 'higher' ? a < t : a > t;
  if (!underperforming || dev <= devThresh) return KPI_STATUS.ON_TARGET;
  if (dev <= riskThresh) return KPI_STATUS.AT_RISK;
  return KPI_STATUS.CRITICAL;
}
function getConfigForKPI(connId, kpiId) {
  const cfgs = sheetData(SHEET_NAMES.KPI_CONFIG);
  const kpis = sheetData(SHEET_NAMES.KPI_MASTER);
  const cfg = cfgs.find(c => c.ConnectionID === connId && c.KPIID === kpiId);
  const kpi = kpis.find(k => k.KPIID === kpiId) || {};
  return cfg ? { ...kpi, ...cfg } : kpi;
}
// ─── SETTINGS ────────────────────────────────────────────────
function getSettings() {
  const s = {}; sheetData(SHEET_NAMES.SETTINGS).forEach(r => { s[r.SettingKey] = r.SettingValue; });
  return { success: true, data: s };
}
function updateSetting(key, value, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN])) return { success: false, message: 'Unauthorized.' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  const data = sheet.getDataRange().getValues();
  const h = data[0];
  const iKey = h.indexOf('SettingKey'), iVal = h.indexOf('SettingValue'), iUpd = h.indexOf('UpdatedBy'), iDate = h.indexOf('UpdatedAt');
  const now = new Date().toISOString();
  for (let i = 1; i < data.length; i++) {
    if (data[i][iKey] === key) {
      sheet.getRange(i+1, iVal+1).setValue(value);
      sheet.getRange(i+1, iUpd+1).setValue(requesterId);
      sheet.getRange(i+1, iDate+1).setValue(now);
      return { success: true };
    }
  }
  appendRowByHeaders(sheet, { SettingKey:key, SettingValue:value, UpdatedBy:requesterId, UpdatedAt:now });
  return { success: true };
}
function getInterventionTypes() {
  const s = getSettings();
  return { success: true, data: (s.data.INTERVENTION_TYPES||'').split(',').map(t=>t.trim()).filter(Boolean) };
}

// ─── UTILITIES ────────────────────────────────────────────────
// ── Execution-level sheet cache ──────────────────────────────────────────────
// GAS server functions run in a single JS execution. This cache ensures each
// sheet is read from Sheets API at most ONCE per server call, no matter how
// many functions call sheetData(). Eliminates the 34K-row reload problem.
var _sheetCache = {};

function clearSheetCache(name) {
  if (name) { delete _sheetCache[name]; }
  else { _sheetCache = {}; }
}

function sheetData(name) {
  if (_sheetCache[name]) return _sheetCache[name];
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) { _sheetCache[name] = []; return []; }
  const vals = sheet.getDataRange().getValues();
  if (vals.length <= 1) { _sheetCache[name] = []; return []; }
  const h = vals[0];
  const keyCol = h.findIndex(function(v) { return v !== '' && v !== null; });
  if (keyCol === -1) { _sheetCache[name] = []; return []; }
  var result = vals.slice(1)
    .filter(function(row) {
      const v = row[keyCol];
      return v !== '' && v !== null && v !== undefined;
    })
    .map(function(row) {
      const o = {};
      h.forEach(function(k, i) {
        if (k !== '') {
          const cell = row[i];
          o[k] = (cell instanceof Date) ? (cell ? localDateStr(cell) : '') : cell;
        }
      });
      return o;
    });
  _sheetCache[name] = result;
  return result;
}
function updateRow(sheetName, idField, idValue, updates) {
  try {
    clearSheetCache(sheetName); // invalidate cache on write
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    const data = sheet.getDataRange().getValues();
    const h = data[0];
    const iID = h.indexOf(idField);
    for (let i = 1; i < data.length; i++) {
      if (data[i][iID] === idValue) {
        Object.entries(updates).forEach(([f,v]) => { const idx=h.indexOf(f); if(idx>-1) sheet.getRange(i+1,idx+1).setValue(v); });
        return { success: true, message: 'Updated.' };
      }
    }
    return { success: false, message: 'Record not found.' };
  } catch(e) { return { success: false, message: e.message }; }
}
function getUserById(id) { return sheetData(SHEET_NAMES.USERS).find(u => u.UserID === id) || null; }
function hasRole(userId, roles) { const u=getUserById(userId); return u && roles.includes(u.Role); }
function genId(prefix) {
  // Short IDs: CON_XXXXXX (10 chars) for connections, USR_XXXXXX (10 chars) for users
  // All other prefixes keep legacy format: PREFIX_TIMESTAMP_RAND
  var SHORT_PREFIXES = { 'CONN': 'CON_', 'USR': 'USR_' };
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0, I/1 ambiguity
  if (SHORT_PREFIXES[prefix]) {
    var id = SHORT_PREFIXES[prefix];
    for (var i = 0; i < 6; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return id; // e.g. CON_A3B9K2 or USR_M7K2PX — exactly 10 chars
  }
  var ts  = Math.floor(Date.now() / 1000).toString(36).toUpperCase().slice(-6);
  var rnd = Math.random().toString(36).substr(2, 4).toUpperCase();
  return prefix + '_' + ts + '_' + rnd;
}
function hashPwd(p) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p)); }

function normConnectionType(val) {
  if (val === true)  return 'Project-based';
  if (val === false) return 'Regular';
  var s = (val !== undefined && val !== null) ? String(val).trim() : '';
  var sLower = s.toLowerCase();
  if (sLower === 'true')  return 'Project-based';
  if (sLower === 'false') return 'Regular';
  // Already-correct labels pass through unchanged (case-preserved)
  if (sLower === 'regular' || sLower === 'project-based') return s;
  return s || 'Regular';
}

function getMondayStr(date) {
  // Parse YYYY-MM-DD strings as LOCAL time (not UTC) to avoid off-by-one in UTC+8
  var d;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    var p = date.slice(0,10).split('-');
    d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
  } else {
    d = new Date(date);
  }
  var day = d.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  var diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.getFullYear() + '-'
       + String(d.getMonth()+1).padStart(2,'0') + '-'
       + String(d.getDate()).padStart(2,'0');
}

function localDateStr(date) {
  // Return YYYY-MM-DD in local time (not UTC)
  var yr = date.getFullYear();
  var mo = String(date.getMonth() + 1).padStart(2, '0');
  var dy = String(date.getDate()).padStart(2, '0');
  return yr + '-' + mo + '-' + dy;
}