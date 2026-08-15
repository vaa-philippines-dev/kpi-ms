// ============================================================
// KPI MANAGEMENT PLATFORM - Interventions.gs
// Split out of Code.gs for maintainability. Google Apps Script merges all
// .gs files into one shared global scope, so these functions call (and are
// called by) functions in Code.gs and other files exactly as before.
// ============================================================



// ── Connection IDs with at least one intervention (for table flag column) ──
function getConnectionsWithInterventions(userId, userRole) {
  try {
    var rows = sheetData(SHEET_NAMES.INTERVENTIONS);
    var set = {};
    rows.forEach(function(r){ var cid=String(r.ConnectionID||'').trim(); if(cid) set[cid]=true; });
    var ids = Object.keys(set);
    if (userId && userRole) {
      var allowSetCWI = _roleScopedConnIdSet(userId, userRole);
      ids = ids.filter(function(cid){
        var suffix = cid.split('_').pop();
        return allowSetCWI[cid] || allowSetCWI[suffix];
      });
    }
    return { success: true, data: ids };
  } catch(e) {
    return { success: false, message: e.message, data: [] };
  }
}

// ── Weekly Interventions Report: VA, client, status, intervention notes ────
function getWeeklyInterventionsReport(userId, userRole, deptId, teamId, weekStartDate) {
  try {
    clearSheetCache();
    var weekAnchor = weekStartDate ? getMondayStr(weekStartDate) : getMondayStr(new Date());
    var weekEnd = (function(){
      var p = weekAnchor.split('-');
      var d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2])+6);
      return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    })();

    // Scope connections per role (same pattern as getSystemPerformance)
    var conns = getVAConnections(userId, userRole).data || [];
    if (deptId) conns = conns.filter(function(c){ return String(c.DeptID||'')===String(deptId); });
    if (teamId) {
      var teamUserIds = {};
      sheetData(SHEET_NAMES.USERS).forEach(function(u){
        if (String(u.TeamID||'')===String(teamId)) teamUserIds[String(u.UserID||'')] = true;
      });
      conns = conns.filter(function(c){ return teamUserIds[String(c.VAUserID||'')]; });
    }
    var connMap = {};
    conns.forEach(function(c){ connMap[String(c.ConnectionID||'')] = c; });

    // Latest status per connection for this week from summary sheet
    var statusByConn = summaryByPeriod(SHEET_NAMES.KPI_WEEKLY_SUMMARY, 'WeekStartDate', weekAnchor, false);

    // Users for VA name lookup
    var userMap = {};
    sheetData(SHEET_NAMES.USERS).forEach(function(u){ userMap[String(u.UserID||'')] = ((u.FirstName||'')+' '+(u.LastName||'')).trim(); });

    // Interventions created within this week, scoped to in-scope connections
    var allIntvs = sheetData(SHEET_NAMES.INTERVENTIONS);
    var rows = allIntvs.filter(function(iv) {
      var cid = String(iv.ConnectionID||'');
      if (!connMap[cid]) return false;
      var created = String(iv.CreatedAt||'').slice(0,10);
      return created >= weekAnchor && created <= weekEnd;
    }).map(function(iv) {
      var cid  = String(iv.ConnectionID||'');
      var conn = connMap[cid] || {};
      var statusInfo = statusByConn[cid] || statusByConn[_normConnId(cid)] || {};
      return {
        vaName:      userMap[String(conn.VAUserID||'')] || '\u2014',
        clientName:  conn.ClientName || '\u2014',
        connId:      cid,
        status:      statusInfo.status || 'No Data',
        type:        iv.Type || '\u2014',
        description: iv.Description || '',
        actionTaken: iv.ActionTaken || '',
        outcome:     iv.Outcome || '',
        createdAt:   iv.CreatedAt || '',
        createdBy:   userMap[String(iv.CreatedBy||'')] || iv.CreatedBy || ''
      };
    });

    return { success: true, data: rows, week: weekAnchor };
  } catch(e) {
    Logger.log('[getWeeklyInterventionsReport] ERROR: '+e.message);
    return { success: false, message: e.message, data: [] };
  }
}

function exportWeeklyInterventionsReport(userId, userRole, deptId, teamId, weekStartDate) {
  try {
    var res = getWeeklyInterventionsReport(userId, userRole, deptId, teamId, weekStartDate);
    if (!res.success) return { success: false, message: res.message };
    var rows = res.data || [];
    var week = res.week;

    var fname = 'Weekly Interventions Report - ' + week;
    var exportSS = SpreadsheetApp.create(fname);
    var sheet = exportSS.getSheets()[0];
    sheet.setName('Interventions');

    var headers = ['Virtual Assistant','Client','Status','Type','Description','Action Taken','Outcome','Logged By','Logged At'];
    sheet.appendRow(['Weekly Interventions Report \u2014 Week of ' + week]);
    sheet.getRange(1,1,1,headers.length).merge().setFontWeight('bold').setFontSize(13);
    sheet.appendRow(headers);
    sheet.getRange(2,1,1,headers.length).setFontWeight('bold').setBackground('#f1f3f4');

    rows.forEach(function(r) {
      sheet.appendRow([
        r.vaName, r.clientName, r.status, r.type, r.description, r.actionTaken, r.outcome, r.createdBy,
        r.createdAt ? Utilities.formatDate(new Date(r.createdAt), Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a') : ''
      ]);
    });

    sheet.autoResizeColumns(1, headers.length);
    sheet.setFrozenRows(2);

    return { success: true, url: exportSS.getUrl(), name: fname, count: rows.length };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

function getInterventions(connId) {
  return { success: true, data: sheetData(SHEET_NAMES.INTERVENTIONS).filter(i => i.ConnectionID === connId) };
}
function createIntervention(data, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER, ROLES.TEAM_LEADER])) return { success: false, message: 'Unauthorized.' };
  const now = new Date().toISOString();
  appendRowByHeaders(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.INTERVENTIONS), {
      InterventionID:genId('INT'), ConnectionID:data.connectionId, Type:data.type,
      Description:data.description, ActionTaken:data.actionTaken||'', Outcome:data.outcome||'',
      CreatedBy:requesterId, CreatedAt:now, UpdatedAt:now
    });
  return { success: true, message: 'Intervention logged.' };
}
function updateIntervention(id, data, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER, ROLES.TEAM_LEADER])) return { success: false, message: 'Unauthorized.' };
  var fields = { UpdatedAt: new Date().toISOString() };
  if (data.outcome     !== undefined) fields.Outcome     = data.outcome;
  if (data.actionTaken !== undefined) fields.ActionTaken = data.actionTaken;
  if (data.description !== undefined) fields.Description = data.description;
  if (data.type        !== undefined) fields.Type        = data.type;
  return updateRow(SHEET_NAMES.INTERVENTIONS, 'InterventionID', id, fields);
}