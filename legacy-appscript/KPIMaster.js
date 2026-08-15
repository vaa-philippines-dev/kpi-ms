// ============================================================
// KPI MANAGEMENT PLATFORM - KPIMaster.gs
// Split out of Code.gs for maintainability. Google Apps Script merges all
// .gs files into one shared global scope, so these functions call (and are
// called by) functions in Code.gs and other files exactly as before.
// ============================================================



// ─── KPI MASTER ───────────────────────────────────────────────
function getKPIClusters() {
  var kpis = sheetData(SHEET_NAMES.KPI_MASTER);
  var seen = {};
  kpis.forEach(function(k){ var cl = String(k.Cluster||'').trim(); if(cl) seen[cl]=true; });
  return { success:true, data: Object.keys(seen).sort() };
}

function getKPIMaster() {
  return { success: true, data: sheetData(SHEET_NAMES.KPI_MASTER).filter(k => k.IsActive === true || k.IsActive === 'TRUE') };
}
function createKPI(data, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN])) return { success: false, message: 'Unauthorized.' };
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.KPI_MASTER);
  // Ensure Cluster column exists on live KPI_Master sheet
  migrateSheetColumns(sheet, ['KPIID','DeptID','ServiceID','Cluster','KPIName','Description','CalculationLogic','DataSource','Unit','WeeklyTarget','MonthlyTarget','PerformanceDirection','DeviationThreshold','AtRiskThreshold','IsActive','CreatedAt']);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var id = genId('KPI');
  var now = new Date().toISOString();
  var values = {
    KPIID: id, DeptID: data.deptId||'', ServiceID: data.serviceId||'',
    Cluster: data.cluster||'',
    KPIName: data.name, Description: data.description||'',
    CalculationLogic: data.calculationLogic||'', DataSource: data.dataSource||'',
    Unit: data.unit, WeeklyTarget: data.weeklyTarget, MonthlyTarget: data.monthlyTarget,
    PerformanceDirection: data.performanceDirection,
    DeviationThreshold: data.deviationThreshold, AtRiskThreshold: data.atRiskThreshold,
    IsActive: true, CreatedAt: now
  };
  var row = headers.map(function(h) { return values.hasOwnProperty(h) ? values[h] : ''; });
  sheet.appendRow(row);
  return { success: true, message: 'KPI created.' };
}
function updateKPI(id, data, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) return { success: false, message: 'Unauthorized.' };
  return updateRow(SHEET_NAMES.KPI_MASTER, 'KPIID', id, {
    Cluster:data.cluster||'',
    DeptID:data.deptId, ServiceID:data.serviceId,
    KPIName:data.name, Description:data.description, Unit:data.unit,
    WeeklyTarget:data.weeklyTarget, MonthlyTarget:data.monthlyTarget,
    PerformanceDirection:data.performanceDirection,
    DeviationThreshold:data.deviationThreshold, AtRiskThreshold:data.atRiskThreshold
  });
}
function deleteKPI(id, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN])) return { success: false, message: 'Unauthorized.' };
  return updateRow(SHEET_NAMES.KPI_MASTER, 'KPIID', id, { IsActive: false });
}// Normalize ConnectionType to its correct text label, regardless of what raw
// type or string the sheet cell resolves to. Defends against the column ever
// being checkbox-formatted in Sheets (native booleans) OR containing the
// literal text "TRUE"/"FALSE" (e.g. from a checkbox cell that was later
// converted to plain text, or pasted-as-values) instead of the
// "Regular"/"Project-based" labels we expect.

// ── KPI Performance Breakdown: which KPIs are most often Critical/At Risk ───
// Scoped by role: Manager/Team Leader see only KPIs relevant to their dept/team.
function getKPIPerformanceBreakdown(userId, userRole, weekStartDate, period) {
  try {
    clearSheetCache();
    var isMonthly = (period === 'monthly');
    var cmpLen    = isMonthly ? 7 : 10;
    var sheetName = isMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
    var dateField = isMonthly ? 'MonthStartDate' : 'WeekStartDate';
    var periodKey = weekStartDate ? String(weekStartDate).slice(0, cmpLen)
                  : (isMonthly ? (function(){ var n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); })()
                                : getMondayStr(new Date()));

    // Trailing 6 periods ending at (and including) periodKey — same windowing
    // convention used by the other trend endpoints in this app.
    var periods = [];
    if (isMonthly) {
      var ymp = periodKey.split('-');
      for (var i = 5; i >= 0; i--) {
        var dm = new Date(parseInt(ymp[0]), parseInt(ymp[1])-1-i, 1);
        periods.push(dm.getFullYear()+'-'+String(dm.getMonth()+1).padStart(2,'0'));
      }
    } else {
      var wp = periodKey.split('-');
      for (var i = 5; i >= 0; i--) {
        var dd = new Date(parseInt(wp[0]), parseInt(wp[1])-1, parseInt(wp[2]) - i*7);
        periods.push(getMondayStr(dd));
      }
    }
    var periodSet = {}; periods.forEach(function(p){ periodSet[p] = true; });

    // Scope connections by role (Manager → their dept, Team Leader → their team, Admin → all)
    var conns = getVAConnections(userId, userRole).data || [];
    var inScopeIds = {};
    conns.forEach(function(c){
      var cid = String(c.ConnectionID||'').trim();
      if (cid) inScopeIds[cid] = true;
      var suffix = cid.split('_').pop();
      if (suffix) inScopeIds[suffix] = true;
    });

    // KPI master lookup: kpiId -> {name, deptId, cluster}
    var kpiMap = {};
    sheetData(SHEET_NAMES.KPI_MASTER).forEach(function(k){
      kpiMap[String(k.KPIID||'')] = { name: k.KPIName||k.KPIID, deptId: String(k.DeptID||''), cluster: k.Cluster||'' };
    });
    var deptMap = {};
    sheetData(SHEET_NAMES.DEPARTMENTS).forEach(function(d){ deptMap[String(d.DeptID||'')] = d.DeptName || d.DeptID; });

    // Read ONLY ConnectionID, date, and KPIs columns across the trailing 6 periods
    // (never read the whole row set across all history — that's the slow path)
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    var aggCurrent = {}; // {kpiId: {name, cluster, deptId, onTarget, atRisk, critical, noData, total}}
    var agg6       = {}; // same shape, aggregated over the trailing 6 periods (incl. current)

    function bump(target, kpiId, meta, entry) {
      if (!target[kpiId]) {
        target[kpiId] = { kpiId: kpiId, name: meta.name, cluster: meta.cluster, deptId: meta.deptId,
                           onTarget: 0, atRisk: 0, critical: 0, noData: 0, total: 0 };
      }
      target[kpiId].total++;
      if (entry.noData)                     target[kpiId].noData++;
      else if (entry.status === 'Critical') target[kpiId].critical++;
      else if (entry.status === 'At Risk')  target[kpiId].atRisk++;
      else if (entry.status === 'On Target')target[kpiId].onTarget++;
    }

    if (sheet && sheet.getLastRow() > 1) {
      var hdrs   = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
      var cidIdx = hdrs.indexOf('ConnectionID');
      var wsdIdx = hdrs.indexOf(dateField);
      var kpisIdx= hdrs.indexOf('KPIs');
      var numRows = sheet.getLastRow()-1;
      var cidVals  = sheet.getRange(2, cidIdx+1,  numRows, 1).getValues();
      var wsdVals  = sheet.getRange(2, wsdIdx+1,  numRows, 1).getValues();
      var kpisVals = sheet.getRange(2, kpisIdx+1, numRows, 1).getValues();

      for (var r = 0; r < numRows; r++) {
        var rawCid = String(cidVals[r][0]||'').trim();
        if (!rawCid) continue;
        var wsd = _normDateStr(wsdVals[r][0]).slice(0, cmpLen);
        if (!periodSet[wsd]) continue; // only rows within the trailing 6 periods

        // Scope check: full ID or suffix match against in-scope connections
        var suffix2 = rawCid.split('_').pop();
        if (!inScopeIds[rawCid] && !inScopeIds[suffix2]) continue;

        var kpisRaw = kpisVals[r][0];
        if (!kpisRaw) continue;
        var kpisArr = [];
        try { kpisArr = JSON.parse(kpisRaw); } catch(e) { continue; }
        if (!kpisArr || !kpisArr.length) continue;

        kpisArr.forEach(function(entry) {
          var kpiId = String(entry.kpiId||'');
          if (!kpiId) return;
          var meta = kpiMap[kpiId] || { name: kpiId, deptId: '', cluster: '' };
          bump(agg6, kpiId, meta, entry);
          if (wsd === periodKey) bump(aggCurrent, kpiId, meta, entry);
        });
      }
    }

    function dominant(o) {
      if (!o || !o.total) return { status: 'No Data', pct: 0 };
      var cands = [
        { status:'Critical',   n:o.critical },
        { status:'At Risk',    n:o.atRisk },
        { status:'On Target',  n:o.onTarget },
        { status:'No Data',    n:o.noData }
      ].sort(function(a,b){ return b.n - a.n; });
      return { status: cands[0].status, pct: Math.round((cands[0].n / o.total) * 100) };
    }

    // agg6 is the superset (every KPI seen in current period was also seen in the
    // 6-period window, since current is one of the 6) — iterate that for the full list.
    var result = Object.keys(agg6).map(function(kpiId){
      var six = agg6[kpiId];
      var cur = aggCurrent[kpiId] || { onTarget:0, atRisk:0, critical:0, noData:0, total:0 };
      var deptName = deptMap[six.deptId] || (six.deptId || 'Unassigned');
      return {
        kpiId: kpiId, name: six.name, cluster: six.cluster,
        deptId: six.deptId, deptName: deptName,
        // Legacy flat fields (current period) — kept so existing sort options still work
        onTarget: cur.onTarget, atRisk: cur.atRisk, critical: cur.critical, noData: cur.noData, total: cur.total,
        current:   { onTarget:cur.onTarget, atRisk:cur.atRisk, critical:cur.critical, noData:cur.noData, total:cur.total, dominant:dominant(cur) },
        sixPeriod: { onTarget:six.onTarget, atRisk:six.atRisk, critical:six.critical, noData:six.noData, total:six.total, dominant:dominant(six) }
      };
    }).sort(function(a,b){ return b.critical - a.critical || b.atRisk - a.atRisk; });

    // Group by department for "all KPIs per department" display
    var byDept = {};
    result.forEach(function(k){
      var d = k.deptName || 'Unassigned';
      if (!byDept[d]) byDept[d] = [];
      byDept[d].push(k);
    });
    var grouped = Object.keys(byDept).sort().map(function(d){ return { deptName: d, kpis: byDept[d] }; });

    return { success: true, data: result, grouped: grouped, period: periodKey, periods: periods };
  } catch(e) {
    Logger.log('[getKPIPerformanceBreakdown] ERROR: '+e.message+' '+e.stack);
    return { success: false, message: e.message, data: [] };
  }
}