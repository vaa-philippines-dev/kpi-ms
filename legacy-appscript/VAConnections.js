// ============================================================
// KPI MANAGEMENT PLATFORM - VAConnections.gs
// Split out of Code.gs for maintainability. Google Apps Script merges all
// .gs files into one shared global scope, so these functions call (and are
// called by) functions in Code.gs and other files exactly as before.
// ============================================================



// ─── CONNECTIONS ──────────────────────────────────────────────
// Absolute minimal test — no dependencies, always returns an object
function testPing() {
  return { ok: true, time: new Date().toISOString() };
}

// Returns the raw Connections sheet headers and row count — no sheetData, no helpers
function testVAConnSheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var allSheets = ss.getSheets().map(function(s){ return s.getName(); });
    var sheet = ss.getSheetByName('Connections');
    if (!sheet) return {
      ok: false,
      msg: 'Sheet named Connections not found',
      spreadsheetName: ss.getName(),
      spreadsheetId: ss.getId(),
      allSheets: allSheets
    };
    var vals = sheet.getDataRange().getValues();
    return {
      ok: true,
      spreadsheetName: ss.getName(),
      allSheets: allSheets,
      headers: vals[0] || [],
      rowCount: vals.length - 1,
      sampleRow: vals[1] || []
    };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function getVAConnections(userId, userRole) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Connections');
    if (!sheet) {
      var names = ss.getSheets().map(function(s){ return s.getName(); }).join(', ');
      return { success: false, data: [],
        message: 'Connections sheet not found. Sheets in this spreadsheet: ' + names };
    }
    var vals = sheet.getDataRange().getValues();
    if (vals.length <= 1) return { success: true, data: [] };
    var headers = vals[0].map(function(h){ return String(h).trim(); });
    var rows = [];
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[0] || String(row[0]).trim() === '') continue;
      var obj = {};
      for (var h = 0; h < headers.length; h++) {
        if (!headers[h]) continue;
        var cell = row[h];
        // Serialize everything to string/number/bool to avoid JSON serialization issues with Date objects
        if (cell instanceof Date) {
          obj[headers[h]] = cell ? cell.toISOString().split('T')[0] : '';
        } else {
          obj[headers[h]] = cell;
        }
      }
      rows.push(obj);
    }
    // Role-based filter
    if (userRole === 'Virtual Assistant') {
      rows = rows.filter(function(c){ return String(c.VAUserID||'') === String(userId); });
    } else if (userRole === 'Team Leader') {
      var allUsers2 = sheetData(SHEET_NAMES.USERS);

      // Find teams led by this TL (primary or temp) — the ONLY source of truth
      // for "which team does this TL lead." Do NOT fall back to "same department"
      // or "same dept as any connection" — those fallbacks leaked VAs/connections
      // belonging to OTHER team leaders in the same department.
      var allTeams2 = sheetData(SHEET_NAMES.TEAMS);
      var myTeams2  = allTeams2.filter(function(t){
        return (t.IsActive===true||t.IsActive==='TRUE') && (
          String(t.TeamLeaderUserID||'')  === String(userId) ||
          String(t.TempLeader1UserID||'') === String(userId) ||
          String(t.TempLeader2UserID||'') === String(userId)
        );
      });
      var teamIds2 = myTeams2.map(function(t){ return String(t.TeamID); });

      // VA UserIDs from those teams via Users.TeamID — the only reliable
      // membership signal. (Connections.TeamLeaderUserID is NOT used here:
      // it's set once at connection-creation time and never kept in sync
      // when a VA is later transferred to a different team, so trusting it
      // causes a TL to keep seeing connections that now belong to another TL.)
      var vaUserIds2 = allUsers2.filter(function(u){
        return teamIds2.length > 0 && teamIds2.indexOf(String(u.TeamID||'')) >= 0;
      }).map(function(u){ return String(u.UserID); });
      // Some Team Leaders also personally carry clients (their own VA connections,
      // i.e. VAUserID === their own UserID) even though their own Users.TeamID
      // isn't set to the team they lead. Always include those too.
      if (vaUserIds2.indexOf(String(userId)) < 0) vaUserIds2.push(String(userId));

      rows = rows.filter(function(c){
        return vaUserIds2.indexOf(String(c.VAUserID||'')) >= 0;
      });
    } else if (userRole === 'Manager') {
      var mgr = getUserById(userId);
      if (mgr && mgr.Department) {
        rows = rows.filter(function(c){ return String(c.DeptID||'') === String(mgr.Department); });
      }
    }
    return { success: true, data: rows };
  } catch(e) {
    return { success: false, data: [], message: 'getVAConnections error: ' + e.message };
  }
}

// Reads Connections sheet directly by header name — immune to column order
// Used as the primary read for the Connections module
function getVAConnectionsData(userId, userRole) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Connections');
    if (!sheet) return { success: false, message: 'Connections sheet not found.', data: [] };
    var vals = sheet.getDataRange().getValues();
    if (vals.length <= 1) return { success: true, data: [], message: 'No data rows found.' };
    var headers = vals[0].map(function(h){ return String(h).trim(); });
    var rows = [];
    for (var i = 1; i < vals.length; i++) {
      var row = vals[i];
      if (!row[0] || row[0] === '') continue; // skip blank rows
      var obj = {};
      headers.forEach(function(h, idx){ if (h) obj[h] = row[idx]; });
      rows.push(obj);
    }
    // Filter by role
    if (userRole === 'Virtual Assistant') {
      rows = rows.filter(function(r){ return String(r.VAUserID||'') === String(userId); });
    } else if (userRole === 'Team Leader') {
      // Use the same reliable Users.TeamID-based lookup as getVAConnections
      // (Connections.TeamLeaderUserID is stale and not kept in sync on transfer).
      var teamsD = sheetData(SHEET_NAMES.TEAMS).filter(function(t){
        return (t.IsActive===true||t.IsActive==='TRUE') && (
          String(t.TeamLeaderUserID||'')  === String(userId) ||
          String(t.TempLeader1UserID||'') === String(userId) ||
          String(t.TempLeader2UserID||'') === String(userId)
        );
      });
      var teamIdsD = teamsD.map(function(t){ return String(t.TeamID); });
      var vaIdsD = sheetData(SHEET_NAMES.USERS).filter(function(u){
        return teamIdsD.length > 0 && teamIdsD.indexOf(String(u.TeamID||'')) >= 0;
      }).map(function(u){ return String(u.UserID); });
      rows = rows.filter(function(r){ return vaIdsD.indexOf(String(r.VAUserID||'')) >= 0; });
    } else if (userRole === 'Manager') {
      var u = getUserById(userId);
      if (u && u.Department) {
        rows = rows.filter(function(r){ return String(r.DeptID||'') === String(u.Department); });
      }
    }
    return { success: true, data: rows, total: rows.length };
  } catch(e) {
    return { success: false, message: e.message, data: [] };
  }
}

// Full diagnostic — call this from frontend to see exactly what is in the sheet
function pingVAConnections() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.CONNECTIONS);
    if (!sheet) return { exists: false, message: 'Sheet "Connections" not found in spreadsheet.' };
    const vals = sheet.getDataRange().getValues();
    const headers = vals[0] || [];
    const rawRows = vals.length - 1;
    const parsed = sheetData(SHEET_NAMES.CONNECTIONS);
    const sample = parsed.slice(0, 3).map(function(r) {
      return { ConnectionID: r.ConnectionID, ClientName: r.ClientName, Status: r.Status };
    });
    return {
      exists: true,
      sheetName: sheet.getName(),
      headers: headers,
      rawRowCount: rawRows,
      parsedRowCount: parsed.length,
      sample: sample,
      spreadsheetName: ss.getName()
    };
  } catch(e) {
    return { exists: false, error: e.message };
  }
}

// Returns the raw sheet header row and first 3 data rows for diagnosis
function getVAConnectionsRaw() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CONNECTIONS);
  if (!sheet) return { success: false, message: 'Connections sheet not found.' };
  const vals = sheet.getDataRange().getValues();
  return {
    success: true,
    headers: vals[0] || [],
    rowCount: vals.length - 1,
    sample: vals.slice(1, 4)
  };
}

// Recreates the Connections sheet with correct column order, preserving data
function rebuildVAConnectionsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const correctHeaders = ['ConnectionID','DeptID','ServiceID','VAUserID','ClientName','ClientEmail',
    'StartDate','Status','TeamID','TeamLeaderUserID','HasKPIConfig','IsFlagged','CreatedAt','UpdatedAt'];
  const sheet = ss.getSheetByName(SHEET_NAMES.CONNECTIONS);
  if (!sheet) {
    const newSheet = ss.insertSheet(SHEET_NAMES.CONNECTIONS);
    newSheet.appendRow(correctHeaders);
    newSheet.getRange(1,1,1,correctHeaders.length).setBackground('#1f1f2e').setFontColor('#ff6b35').setFontWeight('bold');
    return { success: true, message: 'Created new empty Connections sheet.' };
  }
  const vals = sheet.getDataRange().getValues();
  const existingHeaders = vals[0].map(String);
  const data = vals.slice(1).filter(r => r[0] !== '' && r[0] !== null);
  // Remap each row to correct column order
  const colIndex = {};
  existingHeaders.forEach(function(h, i) { if (h) colIndex[h] = i; });
  const reordered = data.map(function(row) {
    return correctHeaders.map(function(col) {
      return colIndex[col] !== undefined ? row[colIndex[col]] : '';
    });
  });
  sheet.clearContents();
  sheet.appendRow(correctHeaders);
  if (reordered.length > 0) {
    sheet.getRange(2, 1, reordered.length, correctHeaders.length).setValues(reordered);
  }
  sheet.getRange(1,1,1,correctHeaders.length).setBackground('#1f1f2e').setFontColor('#ff6b35').setFontWeight('bold');
  return { success: true, message: 'Rebuilt Connections sheet. ' + reordered.length + ' rows preserved.', rows: reordered.length };
}

// Lightweight user list for display purposes — returns id, name, role only (no sensitive data)
function getVAConnectionUsers() {
  return {
    success: true,
    data: sheetData(SHEET_NAMES.USERS)
      .filter(function(u) { return u.IsActive === true || u.IsActive === 'TRUE'; })
      .map(function(u) { return { UserID: u.UserID, Name: (u.FirstName||'') + ' ' + (u.LastName||''), Role: u.Role, Email: u.Email, Department: u.Department||'', TeamID: u.TeamID||'', IsActive: u.IsActive }; })
  };
}

// Returns the set of UserIDs that currently have at least one ACTIVE VA connection.
// Used by Team Management to recognize Team Leaders (or anyone) who personally
// carry clients — their Users.TeamID may not point at the team they lead, but
// they should still show up as a working team member there.
function getUsersWithActiveConnections() {
  try {
    var ids = {};
    sheetData(SHEET_NAMES.CONNECTIONS).forEach(function(c){
      if (String(c.Status||'').toLowerCase() !== 'active') return;
      var vid = String(c.VAUserID||'').trim();
      if (vid) ids[vid] = true;
    });
    return { success: true, data: Object.keys(ids) };
  } catch(e) {
    return { success: false, message: e.message, data: [] };
  }
}

// Run this directly in the GAS editor to verify Connections data
function testGetConnections() {
  const rows = sheetData(SHEET_NAMES.CONNECTIONS);
  Logger.log('Total connection rows: ' + rows.length);
  if (rows.length > 0) Logger.log('First row: ' + JSON.stringify(rows[0]));
  return rows.length;
}

function runDiagnostics() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var expectedSchemas = {
    'Users':              ['UserID','Email','PasswordHash','Role','Department','ServiceID','TeamID','FirstName','LastName','IsActive','MustChangePassword','CreatedAt','LastLogin','LoginCount'],
    'Departments':        ['DeptID','DeptName','Description','IsActive','CreatedAt'],
    'Services':           ['ServiceID','DeptID','ServiceName','Description','IsActive','CreatedAt'],
    'KPI_Master':         ['KPIID','DeptID','ServiceID','Cluster','KPIName','Description','CalculationLogic','DataSource','Unit','WeeklyTarget','MonthlyTarget','PerformanceDirection','DeviationThreshold','AtRiskThreshold','IsActive','CreatedAt'],
    'Connections':        ['ConnectionID','DeptID','ServiceID','VAUserID','ClientName','ClientEmail','StartDate','Status','TeamID','TeamLeaderUserID','HasKPIConfig','IsFlagged','CreatedAt','UpdatedAt'],
    'KPI_Config':         ['ConfigID','ConnectionID','KPIID','WeeklyTarget','MonthlyTarget','DeviationThreshold','AtRiskThreshold','IsApplicable','Notes','UpdatedBy','UpdatedAt','Version'],
    'KPI_Config_History': ['HistoryID','ConfigID','ConnectionID','KPIID','FieldChanged','OldValue','NewValue','ChangedBy','ChangedAt'],
    'KPI_Weekly_Reports': ['ReportID','ConnectionID','KPIID','WeekStartDate','AccountLabel','Target','Actual','NoDataAvailable','Status','SubmittedBy','SubmittedAt'],
    'KPI_Monthly_Reports':['ReportID','ConnectionID','KPIID','MonthStartDate','AccountLabel','Target','Actual','NoDataAvailable','Status','SubmittedBy','SubmittedAt'],
    'Interventions':      ['InterventionID','ConnectionID','Type','Description','ActionTaken','Outcome','CreatedBy','CreatedAt','UpdatedAt'],
    'Settings':           ['SettingKey','SettingValue','UpdatedBy','UpdatedAt'],
    'Teams':              ['TeamID','TeamName','DeptID','ServiceID','TeamLeaderUserID','Description','IsActive','CreatedAt']
  };

  var results = [];

  Object.keys(expectedSchemas).forEach(function(sheetName) {
    var expected = expectedSchemas[sheetName];
    var sheet = ss.getSheetByName(sheetName);
    var item = { sheet: sheetName, exists: !!sheet, rowCount: 0, actualHeaders: [], missingCols: [], extraCols: [], colOrderCorrect: true, sampleRow: null, issues: [] };

    if (!sheet) {
      item.issues.push('Sheet does not exist');
      results.push(item);
      return;
    }

    var range = sheet.getDataRange().getValues();
    item.rowCount = range.length - 1; // exclude header
    item.actualHeaders = range[0].map(function(h) { return String(h).trim(); });

    // Check missing
    expected.forEach(function(col) {
      if (item.actualHeaders.indexOf(col) === -1) item.missingCols.push(col);
    });

    // Check extra (non-empty columns not in schema)
    item.actualHeaders.forEach(function(h) {
      if (h !== '' && expected.indexOf(h) === -1) item.extraCols.push(h);
    });

    // Check order matches for non-empty headers
    var actualFiltered = item.actualHeaders.filter(function(h) { return h !== ''; });
    var expectedInActual = expected.filter(function(c) { return actualFiltered.indexOf(c) !== -1; });
    for (var i = 0; i < expectedInActual.length; i++) {
      if (actualFiltered.indexOf(expectedInActual[i]) !== i) { item.colOrderCorrect = false; break; }
    }

    // Sample first data row
    if (range.length > 1) {
      var sampleObj = {};
      item.actualHeaders.forEach(function(h, i) { if (h) sampleObj[h] = range[1][i]; });
      item.sampleRow = sampleObj;
    }

    // Raw sheetData() count (filters blank rows)
    var sdRows = sheetData(sheetName);
    item.sheetDataCount = sdRows.length;

    if (item.missingCols.length > 0) item.issues.push('Missing columns: ' + item.missingCols.join(', '));
    if (!item.colOrderCorrect) item.issues.push('Column order does not match schema');
    if (item.rowCount > 0 && item.sheetDataCount === 0) item.issues.push('Has ' + item.rowCount + ' raw rows but sheetData() returns 0 — blank ID column suspected');

    results.push(item);
  });

  return { success: true, data: results, timestamp: new Date().toISOString() };
}

function fixColumnOrder(sheetName) {
  // Reorders columns of an existing sheet to match the expected schema WITHOUT losing data
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, message: 'Sheet not found: ' + sheetName };

  var expectedSchemas = {
    'Users':              ['UserID','Email','PasswordHash','Role','Department','ServiceID','TeamID','FirstName','LastName','IsActive','MustChangePassword','CreatedAt','LastLogin','LoginCount'],
    'Departments':        ['DeptID','DeptName','Description','IsActive','CreatedAt'],
    'Services':           ['ServiceID','DeptID','ServiceName','Description','IsActive','CreatedAt'],
    'KPI_Master':         ['KPIID','DeptID','ServiceID','Cluster','KPIName','Description','CalculationLogic','DataSource','Unit','WeeklyTarget','MonthlyTarget','PerformanceDirection','DeviationThreshold','AtRiskThreshold','IsActive','CreatedAt'],
    'Connections':        ['ConnectionID','DeptID','ServiceID','VAUserID','ClientName','ClientEmail','StartDate','Status','TeamID','TeamLeaderUserID','HasKPIConfig','IsFlagged','CreatedAt','UpdatedAt'],
    'KPI_Config':         ['ConfigID','ConnectionID','KPIID','WeeklyTarget','MonthlyTarget','DeviationThreshold','AtRiskThreshold','IsApplicable','Notes','UpdatedBy','UpdatedAt','Version'],
    'KPI_Config_History': ['HistoryID','ConfigID','ConnectionID','KPIID','FieldChanged','OldValue','NewValue','ChangedBy','ChangedAt'],
    'KPI_Weekly_Reports': ['ReportID','ConnectionID','KPIID','WeekStartDate','AccountLabel','Target','Actual','NoDataAvailable','Status','SubmittedBy','SubmittedAt'],
    'KPI_Monthly_Reports':['ReportID','ConnectionID','KPIID','MonthStartDate','AccountLabel','Target','Actual','NoDataAvailable','Status','SubmittedBy','SubmittedAt'],
    'Interventions':      ['InterventionID','ConnectionID','Type','Description','ActionTaken','Outcome','CreatedBy','CreatedAt','UpdatedAt'],
    'Settings':           ['SettingKey','SettingValue','UpdatedBy','UpdatedAt'],
    'Teams':              ['TeamID','TeamName','DeptID','ServiceID','TeamLeaderUserID','Description','IsActive','CreatedAt']
  };

  var expected = expectedSchemas[sheetName];
  if (!expected) return { success: false, message: 'No schema defined for: ' + sheetName };

  var data = sheet.getDataRange().getValues();
  var actualHeaders = data[0].map(function(h) { return String(h).trim(); });

  // Build lookup: colName -> column index
  var colIndex = {};
  actualHeaders.forEach(function(h, i) { if (h) colIndex[h] = i; });

  // Rebuild all rows in correct column order; append any extra unknown columns at end
  var extraCols = actualHeaders.filter(function(h) { return h && expected.indexOf(h) === -1; });
  var fullOrder = expected.concat(extraCols);

  var reordered = data.map(function(row) {
    return fullOrder.map(function(col) {
      var idx = colIndex[col];
      return idx !== undefined ? row[idx] : '';
    });
  });
  reordered[0] = fullOrder; // ensure header row is clean strings

  // Clear and rewrite
  sheet.clearContents();
  sheet.getRange(1, 1, reordered.length, reordered[0].length).setValues(reordered);
  // Re-style header row
  sheet.getRange(1, 1, 1, reordered[0].length).setBackground('#1f1f2e').setFontColor('#ff6b35').setFontWeight('bold');

  return { success: true, message: 'Column order fixed for ' + sheetName + '. ' + reordered.length - 1 + ' data rows preserved.' };
}
function createVAConnection(data, requesterId) {
  try {
    if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER, ROLES.TEAM_LEADER])) return { success: false, message: 'Unauthorized.' };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Connections');
    if (!sheet) {
      sheet = ss.insertSheet('Connections');
      var hdrs = ['ConnectionID','DeptID','ServiceID','VAUserID','ClientName','SecondaryName','StartDate','Status','ConnectionType','HasKPIConfig','IsFlagged','CreatedAt','UpdatedAt'];
      sheet.appendRow(hdrs);
      sheet.getRange(1,1,1,hdrs.length).setBackground('#1f1f2e').setFontColor('#ff6b35').setFontWeight('bold');
    }
    var connId = genId('CONN');
    var now = new Date().toISOString();
    // Ensure live sheet has all required columns (safe migration)
    migrateSheetColumns(sheet, ['ConnectionID','DeptID','ServiceID','VAUserID','ClientName','SecondaryName','ClientEmail','StartDate','Status','ConnectionType','InactiveDate','StatusHistory','TeamID','TeamLeaderUserID','HasKPIConfig','IsFlagged','CreatedAt','UpdatedAt']);
    // Read headers to map columns correctly
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h){ return String(h).trim(); });
    var vals = {
      ConnectionID: connId,
      DeptID: data.deptId || '',
      ServiceID: data.serviceId || '',
      VAUserID: data.vaUserId || '',
      ClientName: data.clientName || '',
      SecondaryName: data.secondaryName || '',
      StartDate: data.startDate || now.split('T')[0],
      Status: data.status || 'Pending',
      ConnectionType: data.connectionType || 'Regular',
      InactiveDate: '',
      StatusHistory: JSON.stringify([{ status: data.status || 'Pending', date: localDateStr(new Date()), changedBy: requesterId, at: new Date().toISOString() }]),
      HasKPIConfig: false,
      IsFlagged: false,
      CreatedAt: now,
      UpdatedAt: now
    };
    var row = headers.map(function(h){ return vals.hasOwnProperty(h) ? vals[h] : ''; });
    sheet.appendRow(row);
    try { generateKPIConfig(connId, requesterId); } catch(e) {
      Logger.log('KPI config generation error: ' + e.message);
    }
    return { success: true, message: 'Connection saved.', id: connId };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

function bulkCreateVAConnections(rows, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER, ROLES.TEAM_LEADER])) return { success: false, message: 'Unauthorized.' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Connections');
  if (!sheet) {
    sheet = ss.insertSheet('Connections');
    var hdrs = ['ConnectionID','DeptID','ServiceID','VAUserID','ClientName','SecondaryName','StartDate','Status','ConnectionType','HasKPIConfig','IsFlagged','CreatedAt','UpdatedAt'];
    sheet.appendRow(hdrs);
    sheet.getRange(1,1,1,hdrs.length).setBackground('#1f1f2e').setFontColor('#ff6b35').setFontWeight('bold');
  }
  var depts = sheetData(SHEET_NAMES.DEPARTMENTS);
  var svcs  = sheetData(SHEET_NAMES.SERVICES);
  var users = sheetData(SHEET_NAMES.USERS);
  var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(function(h){ return String(h).trim(); });
  var now = new Date().toISOString();
  var results = [];
  rows.forEach(function(row, idx) {
    try {
      if (!row.clientName) { results.push({ row:idx+1, success:false, message:'Client Name is required.' }); return; }
      var dept = depts.find(function(d){ return d.DeptName.toLowerCase().trim() === (row.deptName||'').toLowerCase().trim() && (d.IsActive===true||d.IsActive==='TRUE'); });
      var svc  = svcs.find(function(s){  return s.ServiceName.toLowerCase().trim() === (row.serviceName||'').toLowerCase().trim() && (s.IsActive===true||s.IsActive==='TRUE'); });
      var va   = row.vaName ? users.find(function(u){ return (u.FirstName+' '+u.LastName).toLowerCase().trim() === row.vaName.toLowerCase().trim() && u.Role==='Virtual Assistant'; }) : null;
      if (!dept) { results.push({ row:idx+1, success:false, message:'Department "'+row.deptName+'" not found.', clientName:row.clientName }); return; }
      if (!svc)  { results.push({ row:idx+1, success:false, message:'Service "'+row.serviceName+'" not found.', clientName:row.clientName }); return; }
      var connId = genId('CONN');
      var vals = { ConnectionID:connId, DeptID:dept.DeptID, ServiceID:svc.ServiceID, VAUserID:va?va.UserID:'',
        ClientName:row.clientName, SecondaryName:row.secondaryName||'',
        StartDate:row.startDate||now.split('T')[0], Status:'Pending',
        HasKPIConfig:false, IsFlagged:false, CreatedAt:now, UpdatedAt:now };
      var sheetRow = headers.map(function(h){ return vals.hasOwnProperty(h) ? vals[h] : ''; });
      sheet.appendRow(sheetRow);
      var kpiResult = { count: 0 };
      try { kpiResult = generateKPIConfig(connId, requesterId) || { count: 0 }; } catch(e) {
        Logger.log('KPI config error for ' + connId + ': ' + e.message);
      }
      results.push({ row:idx+1, success:true, clientName:row.clientName, kpiCount: kpiResult.count || 0 });
    } catch(e) {
      results.push({ row:idx+1, success:false, message:e.message, clientName:row.clientName });
    }
  });
  var ok = results.filter(function(r){ return r.success; }).length;
  return { success:true, results:results, imported:ok, failed:results.length-ok };
}
function bulkCreateConnections(rows, requesterId) { return bulkCreateVAConnections(rows, requesterId); }
function updateVAConnectionType(connId, newType, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) return { success: false, message: 'Unauthorized.' };
  var allowed = ['Regular', 'Project-based'];
  if (allowed.indexOf(newType) < 0) return { success: false, message: 'Invalid connection type.' };
  var conns = sheetData(SHEET_NAMES.CONNECTIONS);
  var conn  = conns.find(function(c){ return String(c.ConnectionID) === String(connId); });
  if (!conn) return { success: false, message: 'Connection not found.' };
  var oldType = normConnectionType(conn.ConnectionType);
  if (oldType === newType) return { success: false, message: 'Type is already ' + newType + '.' };
  // Parse existing StatusHistory — we'll reuse it to also log type changes
  var history = [];
  try { var raw = String(conn.StatusHistory||''); if (raw && raw !== 'undefined') history = JSON.parse(raw); if (!Array.isArray(history)) history = []; } catch(e) { history = []; }
  history.push({ typeChange: true, from: oldType, to: newType, changedBy: requesterId, at: new Date().toISOString() });
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CONNECTIONS);
  migrateSheetColumns(sheet, ['ConnectionID','DeptID','ServiceID','VAUserID','ClientName','SecondaryName','ClientEmail','StartDate','Status','ConnectionType','InactiveDate','StatusHistory','TeamID','TeamLeaderUserID','HasKPIConfig','IsFlagged','CreatedAt','UpdatedAt']);
  return updateRow(SHEET_NAMES.CONNECTIONS, 'ConnectionID', connId, {
    ConnectionType: newType,
    StatusHistory:  JSON.stringify(history),
    UpdatedAt:      new Date().toISOString()
  });
}

function updateVAConnectionStatus(connId, status, requesterId, statusDate) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER, ROLES.TEAM_LEADER])) return { success: false, message: 'Unauthorized.' };

  // Load current connection
  var conns = sheetData(SHEET_NAMES.CONNECTIONS);
  var conn  = conns.find(function(c){ return String(c.ConnectionID) === String(connId); });
  if (!conn) return { success: false, message: 'Connection not found.' };

  var curStatus  = String(conn.Status || '');
  var terminalStatuses = ['End of Contract', 'End of Project'];

  // Rule: ended connections cannot be reactivated
  if (terminalStatuses.indexOf(curStatus) >= 0) {
    return { success: false, message: 'This connection has ended and cannot be changed.' };
  }

  // Rule: Active can only go to the correct statuses based on type
  var connType = normConnectionType(conn.ConnectionType);
  var allowed  = connType === 'Project-based'
    ? ['Active', 'Paused', 'End of Project']
    : ['Active', 'Paused', 'End of Contract'];
  if (allowed.indexOf(status) < 0) {
    return { success: false, message: 'Invalid status "' + status + '" for ' + connType + ' connection.' };
  }

  // Build status history entry
  var now       = new Date();
  var entryDate = statusDate || localDateStr(now);
  var historyEntry = { status: status, date: entryDate, changedBy: requesterId, at: now.toISOString() };

  // Parse existing history
  var existingHistory = [];
  try {
    var raw = String(conn.StatusHistory || '');
    if (raw && raw !== 'undefined') existingHistory = JSON.parse(raw);
    if (!Array.isArray(existingHistory)) existingHistory = [];
  } catch(e) { existingHistory = []; }
  existingHistory.push(historyEntry);

  // Build update object
  var vals = {
    Status:        status,
    StatusHistory: JSON.stringify(existingHistory),
    UpdatedAt:     now.toISOString()
  };
  // Track InactiveDate for non-active statuses; clear it when Active
  if (status === 'Active') {
    vals.InactiveDate = '';
  } else {
    vals.InactiveDate = entryDate;
  }

  // migrateSheetColumns to ensure StatusHistory exists on live sheet
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CONNECTIONS);
  migrateSheetColumns(sheet, ['ConnectionID','DeptID','ServiceID','VAUserID','ClientName','SecondaryName','ClientEmail','StartDate','Status','ConnectionType','InactiveDate','StatusHistory','TeamID','TeamLeaderUserID','HasKPIConfig','IsFlagged','CreatedAt','UpdatedAt']);

  return updateRow(SHEET_NAMES.CONNECTIONS, 'ConnectionID', connId, vals);
}
function updateVAConnection(id, data, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER, ROLES.TEAM_LEADER])) return { success: false, message: 'Unauthorized.' };
  var fields = { UpdatedAt: new Date().toISOString() };
  if (data.status        !== undefined) fields.Status           = data.status;
  if (data.clientName    !== undefined) fields.ClientName       = data.clientName;
  if (data.secondaryName !== undefined) fields.SecondaryName    = data.secondaryName;
  if (data.clientEmail   !== undefined) fields.ClientEmail      = data.clientEmail;
  if (data.startDate     !== undefined) fields.StartDate        = data.startDate;
  if (data.teamLeaderUserId !== undefined) fields.TeamLeaderUserID = data.teamLeaderUserId;
  if (data.teamId        !== undefined) fields.TeamID           = data.teamId;
  if (data.vaUserId      !== undefined) fields.VAUserID         = data.vaUserId;
  if (data.deptId        !== undefined) fields.DeptID           = data.deptId;
  if (data.serviceId     !== undefined) fields.ServiceID        = data.serviceId;
  return updateRow(SHEET_NAMES.CONNECTIONS, 'ConnectionID', id, fields);
}
// Permanently deletes a VA connection. Only Admins and Managers may delete —
// the frontend requires the user to type CONFIRM before calling this.
function deleteVAConnection(id, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) return { success: false, message: 'Unauthorized.' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAMES.CONNECTIONS);
    if (!sheet) return { success: false, message: 'Connections sheet not found.' };
    var data = sheet.getDataRange().getValues();
    var hdrs = data[0];
    var idCol = hdrs.indexOf('ConnectionID');
    if (idCol < 0) return { success: false, message: 'ConnectionID column not found.' };
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(id)) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, message: 'Connection not found.' };
  } catch(e) {
    return { success: false, message: e.message };
  }
}
function flagConnection(connId, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.TEAM_LEADER])) return { success: false, message: 'Unauthorized.' };
  const conn = sheetData(SHEET_NAMES.CONNECTIONS).find(c => c.ConnectionID === connId);
  if (!conn) return { success: false, message: 'Not found.' };
  const newFlag = !(conn.IsFlagged === true || conn.IsFlagged === 'TRUE');
  return updateRow(SHEET_NAMES.CONNECTIONS, 'ConnectionID', connId, { IsFlagged: newFlag, UpdatedAt: new Date().toISOString() });
}

// ─── REPORTS ─────────────────────────────────────────────────
// Safe date string extractor — handles Date objects, ISO strings, locale strings
// Read only ConnectionID + WeekStartDate (+ Status) from summary sheet — skips the large KPIs column
// This is much faster than sheetData() for summary sheets with large KPIs blobs
// Normalise any Sheets date value to "YYYY-MM-DD" in local script timezone.
// Handles: Date object, ISO string "...T16:00:00.000Z", plain "2026-06-02", locale strings.
// Normalize a ConnectionID to its unique suffix for comparison.
// "CONN_1778163817915_TG6T340" → "TG6T340"
// "63817915_TG6T340"           → "TG6T340"
// Matches regardless of numeric truncation in the middle segment.
// ── Migrate all ConnectionIDs to short format ──────────────────────────────
// Run migrateConnectionIDs() once from the GAS editor.
// Renames every CONN_<timestamp>_<rand> across all sheets to CONN_<short>_<rand>
function migrateConnectionIDs() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var ui   = SpreadsheetApp.getUi();
  var log  = [];

  // 1. Build mapping: old long ID → new short ID from the Connections sheet
  var connSheet = ss.getSheetByName('Connections');
  if (!connSheet) { ui.alert('Connections sheet not found'); return; }
  var connVals = connSheet.getDataRange().getValues();
  var connHdrs = connVals[0];
  var cidCol   = connHdrs.indexOf('ConnectionID');
  if (cidCol < 0) { ui.alert('ConnectionID column not found'); return; }

  var idMap = {}; // oldId → newId
  var newIds = connVals.map(function(row, ri) {
    if (ri === 0) return row; // header
    var old = String(row[cidCol] || '').trim();
    if (!old || !old.startsWith('CONN_')) return row;
    // Already short? (short = no 13-digit timestamp segment)
    var parts = old.split('_');
    // Long format: CONN_<13digits>_<4-5chars> = 3 parts, middle is numeric >10 digits
    var isLong = parts.length === 3 && /^\d{10,}$/.test(parts[1]);
    if (!isLong) { idMap[old] = old; return row; } // already short
    var ts  = Math.floor(Date.now() / 1000).toString(36).toUpperCase().slice(-6);
    var rnd = parts[2]; // keep existing random suffix for consistency
    var newId = 'CONN_' + ts + '_' + rnd;
    idMap[old] = newId;
    var newRow = row.slice();
    newRow[cidCol] = newId;
    return newRow;
  });

  var changed = Object.keys(idMap).filter(function(k){ return idMap[k] !== k; }).length;
  log.push('Connections: ' + changed + ' IDs to rename');
  if (changed === 0) { ui.alert('No long ConnectionIDs found — already migrated.'); return; }

  // 2. Write new IDs to Connections sheet
  connSheet.getDataRange().setValues(newIds);
  log.push('✓ Connections sheet updated');

  // 3. Update every other sheet that references ConnectionID
  var otherSheets = [
    'KPI_Config', 'KPI_Weekly_Reports', 'KPI_Monthly_Reports',
    'KPI_Weekly_Summary', 'KPI_Monthly_Summary', 'Interventions'
  ];

  otherSheets.forEach(function(sName) {
    var sheet = ss.getSheetByName(sName);
    if (!sheet || sheet.getLastRow() < 2) { log.push('Skip: '+sName+' (not found/empty)'); return; }
    var vals  = sheet.getDataRange().getValues();
    var hdrs  = vals[0];
    var cIdx  = hdrs.indexOf('ConnectionID');
    if (cIdx < 0) { log.push('Skip: '+sName+' (no ConnectionID col)'); return; }
    var fixes = 0;
    for (var r = 1; r < vals.length; r++) {
      var old = String(vals[r][cIdx] || '').trim();
      if (idMap[old] && idMap[old] !== old) {
        vals[r][cIdx] = idMap[old];
        fixes++;
      }
    }
    sheet.getDataRange().setValues(vals);
    log.push('✓ '+sName+': '+fixes+' rows updated');
  });

  // 4. Force ConnectionID columns to plain text in all sheets
  var allSheets = ['Connections','KPI_Config','KPI_Weekly_Reports',
                   'KPI_Monthly_Reports','KPI_Weekly_Summary','KPI_Monthly_Summary','Interventions'];
  allSheets.forEach(function(sName) {
    var sheet = ss.getSheetByName(sName);
    if (!sheet || sheet.getLastRow() < 2) return;
    var hdrs  = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    var cIdx  = hdrs.indexOf('ConnectionID');
    if (cIdx < 0) return;
    sheet.getRange(2, cIdx+1, sheet.getLastRow()-1, 1).setNumberFormat('@');
    log.push('✓ '+sName+': ConnectionID column set to plain text');
  });

  Logger.log(log.join('\n'));
  ui.alert('Migration Complete',
    log.join('\n') + '\n\nTotal IDs renamed: ' + changed,
    ui.ButtonSet.OK);
}
function getNewConnectionsForWeek(userId, userRole, weekStartDate, deptId, serviceId) {
  try {
    var conns = getVAConnections(userId, userRole).data || [];
    if (deptId)    conns = conns.filter(function(c){ return String(c.DeptID||'')    === String(deptId);    });
    if (serviceId) conns = conns.filter(function(c){ return String(c.ServiceID||'') === String(serviceId); });
    var thisWeek = weekStartDate ? String(weekStartDate).slice(0,10) : getMondayStr(new Date());
    var weekStart = new Date(thisWeek + 'T00:00:00');
    var weekEnd   = new Date(thisWeek + 'T00:00:00');
    weekEnd.setDate(weekEnd.getDate() + 6);
    var users = sheetData(SHEET_NAMES.USERS);
    var userMap = {};
    users.forEach(function(u){ userMap[u.UserID] = (u.FirstName||'') + ' ' + (u.LastName||''); });
    var depts = sheetData(SHEET_NAMES.DEPARTMENTS);
    var deptMap = {}; depts.forEach(function(d){ deptMap[d.DeptID] = d.DeptName; });
    var svcs = sheetData(SHEET_NAMES.SERVICES);
    var svcMap = {}; svcs.forEach(function(s){ svcMap[s.ServiceID] = s.ServiceName; });
    var newConns = conns.filter(function(c) {
      if (!c.StartDate) return false;
      var started = new Date(String(c.StartDate).slice(0,10) + 'T00:00:00');
      return started >= weekStart && started <= weekEnd;
    }).map(function(c) {
      return {
        clientName:  c.ClientName  || '—',
        vaName:      userMap[c.VAUserID] || c.VAUserID || '—',
        department:  deptMap[c.DeptID]   || c.DeptID   || '—',
        service:     svcMap[c.ServiceID] || c.ServiceID || '—',
        type:        normConnectionType(c.ConnectionType),
        startDate:   String(c.StartDate||'').slice(0,10)
      };
    });
    return { success: true, data: newConns };
  } catch(e) { return { success: false, message: e.message }; }
}

function getLongRunningConnections(days, deptId, teamId) {
  const threshold = days || 180;
  const today = new Date();
  const users = sheetData(SHEET_NAMES.USERS);
  const userMap = {};
  users.forEach(u => { userMap[u.UserID] = (u.FirstName||'') + ' ' + (u.LastName||''); });
  let conns = sheetData(SHEET_NAMES.CONNECTIONS).filter(c => {
    var status = String(c.Status||'').toLowerCase();
    if (!c.StartDate || status === 'inactive' || status === 'end of contract' || status === 'end of project') return false;
    if (deptId && String(c.DeptID||'') !== String(deptId)) return false;
    if (teamId && String(c.TeamID||'') !== String(teamId)) return false;
    return (today - new Date(c.StartDate)) / 86400000 >= threshold;
  }).map(c => ({
    ...c,
    daysActive: Math.floor((today - new Date(c.StartDate)) / 86400000),
    VAName: userMap[c.VAUserID] || c.VAUserID || '—'
  })).sort((a,b) => b.daysActive - a.daysActive);
  return { success: true, data: conns };
}

// ─── INTERVENTIONS ────────────────────────────────────────────
function saveConnectionNote(connId, note, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER, ROLES.TEAM_LEADER])) return { success: false, message: 'Unauthorized.' };
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CONNECTIONS);
  migrateSheetColumns(sheet, ['ConnectionID','DeptID','ServiceID','VAUserID','ClientName','SecondaryName','ClientEmail','StartDate','Status','ConnectionType','InactiveDate','StatusHistory','Notes','TeamID','TeamLeaderUserID','HasKPIConfig','IsFlagged','CreatedAt','UpdatedAt']);
  return updateRow(SHEET_NAMES.CONNECTIONS, 'ConnectionID', connId, { Notes: note, UpdatedAt: new Date().toISOString() });
}
function getConnectionNote(connId) {
  var conn = sheetData(SHEET_NAMES.CONNECTIONS).find(function(c){ return String(c.ConnectionID)===String(connId); });
  return { success: true, data: conn ? (conn.Notes||'') : '' };
}