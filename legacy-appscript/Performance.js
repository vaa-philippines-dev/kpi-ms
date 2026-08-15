// ============================================================
// KPI MANAGEMENT PLATFORM - Performance.gs
// Split out of Code.gs for maintainability. Google Apps Script merges all
// .gs files into one shared global scope, so these functions call (and are
// called by) functions in Code.gs and other files exactly as before.
// ============================================================



// ─── DASHBOARDS ───────────────────────────────────────────────
// ── Combined dashboard data loader ─────────────────────────────────────────
// Loads ALL dashboard data in a single GAS execution so the 34K-row
// KPI_Weekly sheet is read exactly ONCE regardless of how many metrics needed.
function getDashboardData(userId, userRole, deptId, weekStartDate, period) {
  try {
    clearSheetCache(); // fresh start for this execution
    var week    = weekStartDate ? String(weekStartDate).slice(0,10) : getMondayStr(new Date());
    var useMonthly = (period === 'monthly');

    // 1. Get scoped connections
    var conns = getVAConnections(userId, userRole).data || [];
    var allConns = sheetData(SHEET_NAMES.CONNECTIONS); // for long-running (all)
    if (deptId) conns = conns.filter(function(c){ return String(c.DeptID||'')===String(deptId); });

    // 2. Summary (stat cards) — reads KPI sheet once, cached
    var summary = getDashboardSummary(userId, userRole, deptId, week, period);

    // 3. Trend — reuses cached sheet
    var trend = getSystemPerformanceTrend(userId, userRole, deptId, '', '', period, week);

    // 4. Long-running connections — reuses cached Connections
    var lr = getLongRunningConnections(180, deptId, '', userId, userRole);

    // 5. Departments for filter dropdown
    var depts = getDepartments();

    // 6. VA user map
    var vaUsers = getVAConnectionUsers();

    return {
      success:  true,
      summary:  summary.data  || {},
      trend:    trend.data    || [],
      longRun:  lr.data       || [],
      depts:    depts.data    || [],
      vaUsers:  vaUsers.data  || []
    };
  } catch(e) {
    return { success: false, message: 'getDashboardData: ' + e.message,
             summary:{}, trend:[], longRun:[], depts:[], vaUsers:[] };
  }
}

// Combined Performance + Trend loader (one GAS execution)
function getPerformanceData(userId, userRole, deptId, teamId, serviceId, weekStartDate, period) {
  try {
    clearSheetCache();
    // Period keys come in two shapes: weekly "YYYY-MM-DD" (10 chars) or monthly "YYYY-MM"
    // (7 chars). A blind slice(0,10) is a no-op for monthly keys today, but is fragile —
    // this makes the truncation explicit so it can never silently keep a stray day suffix.
    var cmpLen = (period === 'monthly') ? 7 : 10;
    var week = weekStartDate ? String(weekStartDate).slice(0, cmpLen) : getMondayStr(new Date());
    var perf  = getSystemPerformance(week, deptId, serviceId, period, teamId, userId, userRole);
    var trend = getSystemPerformanceTrend(userId, userRole, deptId, teamId, serviceId, period, week);
    var depts = getDepartments();
    // Build teamMap: {TeamID: {name, number, leader}}
    var teamsData = sheetData(SHEET_NAMES.TEAMS);
    var usersData = sheetData(SHEET_NAMES.USERS);
    // Build user name lookup
    var uMap2 = {};
    usersData.forEach(function(u){ uMap2[String(u.UserID||'')] = ((u.FirstName||'')+' '+(u.LastName||'')).trim(); });
    // Build teamInfo by TeamID
    var teamInfoById = {};
    teamsData.forEach(function(t){
      var lid = String(t.TeamLeaderUserID||t.TempLeader1UserID||'');
      teamInfoById[String(t.TeamID||'')] = {
        name:   String(t.TeamName  ||''),
        number: String(t.TeamNumber||''),
        leader: lid ? (uMap2[lid]||'') : ''
      };
    });
    // Build teamMap keyed by VAUserID_DeptID (dept-aware: a VA can be in 2 teams in 2 depts)
    // Also keyed by VAUserID alone (fallback) and TID_teamId (for side panel)
    var teamDeptMap = {}; // {TeamID: DeptID}
    teamsData.forEach(function(t){ teamDeptMap[String(t.TeamID||'')] = String(t.DeptID||''); });
    var teamMap = {};
    usersData.forEach(function(u){
      var uid = String(u.UserID||'');
      var tid = String(u.TeamID||'');
      if (!uid || !tid || !teamInfoById[tid]) return;
      var deptId3 = teamDeptMap[tid] || '';
      var info = Object.assign({ teamId: tid, deptId: deptId3 }, teamInfoById[tid]);
      // Index by VAUserID_DeptID (primary — dept-aware lookup)
      if (deptId3) teamMap[uid+'_'+deptId3] = info;
      // Index by VAUserID alone (fallback for non-dept-filtered views)
      if (!teamMap[uid]) teamMap[uid] = info;
    });
    // Also index by TID_ prefix for side panel grouping
    teamsData.forEach(function(t){
      var tid = String(t.TeamID||'');
      if (tid && teamInfoById[tid]) teamMap['TID_'+tid] = Object.assign({ teamId: tid }, teamInfoById[tid]);
    });
    Logger.log('[getPerformanceData] teamMap keys='+Object.keys(teamMap).length
      +' sample='+JSON.stringify(Object.keys(teamMap).slice(0,2).reduce(function(o,k){o[k]=teamMap[k];return o;},{})));
    return {
      success:      true,
      perf:         perf.data           || {},
      trend:        trend.data          || [],
      connTrendMap: trend.connTrendMap  || {},
      teamMap:      teamMap,
      depts:        depts.data          || []
    };
  } catch(e) {
    Logger.log('[getPerformanceData] ERROR: '+e.message+' '+e.stack);
    return { success:false, message:'getPerformanceData: '+e.message, perf:{}, trend:[], depts:[] };
  }
}

// Combined Reports data loader (one GAS execution)
function getReportsData(userId, userRole, deptId, serviceId, weekStartDate, period) {
  try {
    clearSheetCache();
    var week      = weekStartDate ? String(weekStartDate).slice(0,10) : getMondayStr(new Date());
    var useMonthly = period === 'monthly';
    var subResult = useMonthly
      ? getMonthlySubmissionStatus(userId, userRole, week, deptId, serviceId)
      : getWeeklySubmissionStatus(userId, userRole, week, deptId, serviceId);
    var perf  = getSystemPerformance(week, deptId, serviceId, period, teamId);
    var trend = getSystemPerformanceTrend(userId, userRole, deptId, '', serviceId, period, week);
    var deptSub = useMonthly
      ? getDeptMonthlySubmissionSummary(userId, userRole, week, deptId, serviceId)
      : getDeptSubmissionSummary(userId, userRole, week, deptId, serviceId);
    var newConns = useMonthly ? { data:[] }
      : getNewConnectionsForWeek(userId, userRole, week, deptId, serviceId);
    return {
      success:  true,
      subRows:  subResult.data  || [],
      perf:     perf.data       || {},
      trend:    trend.data      || [],
      deptSub:  deptSub.data    || [],
      newConns: newConns.data   || []
    };
  } catch(e) {
    return { success:false, message:'getReportsData: '+e.message,
             subRows:[], perf:{}, trend:[], deptSub:[], newConns:[] };
  }
}

function getDashboardSummary(userId, userRole, deptId, weekStartDate, period) {
  try {
    var useMonthly = (period === 'monthly');
    var conns = getVAConnections(userId, userRole).data || [];
    if (deptId) conns = conns.filter(function(c){ return String(c.DeptID||'') === String(deptId); });

    var thisWeek, weekStart, weekEnd;
    if (useMonthly) {
      // For monthly: use YYYY-MM from weekStartDate (or current month)
      var now = new Date();
      var defaultYM = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
      thisWeek = weekStartDate ? String(weekStartDate).slice(0,7) : defaultYM;
      // Month bounds for active-during-month check
      var mParts = thisWeek.split('-');
      weekStart = new Date(parseInt(mParts[0]), parseInt(mParts[1])-1, 1);
      weekEnd   = new Date(parseInt(mParts[0]), parseInt(mParts[1]), 0); // last day of month
    } else {
      thisWeek  = weekStartDate ? String(weekStartDate).slice(0,10) : getMondayStr(new Date());
      weekStart = new Date(thisWeek + 'T00:00:00');
      weekEnd   = new Date(thisWeek + 'T00:00:00');
      weekEnd.setDate(weekEnd.getDate() + 6);
    }

    // Filter to connections active during the selected period
    conns = conns.filter(function(c) {
      var started = c.StartDate ? new Date(String(c.StartDate).slice(0,10) + 'T00:00:00') : null;
      if (!started || started > weekEnd) return false;
      var status = String(c.Status||'').toLowerCase();
      if (status === 'active') return true;
      var inactiveStr = String(c.InactiveDate||'').slice(0,10);
      if (inactiveStr && /^\d{4}-\d{2}-\d{2}$/.test(inactiveStr)) {
        return new Date(inactiveStr + 'T00:00:00') >= weekStart;
      }
      return false;
    });

    // Read from Summary sheet (one row per connection per period — fast)
    var summarySheet = useMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
    var dateField    = useMonthly ? 'MonthStartDate' : 'WeekStartDate';
    var periodMap    = summaryByPeriod(summarySheet, dateField, thisWeek, useMonthly);
    var summary      = { total: conns.length, onTarget:0, atRisk:0, critical:0, noData:0, period: period||'weekly' };

    conns.forEach(function(conn) {
      var s = periodMap[String(conn.ConnectionID)];
      if (!s) { summary.noData++; return; }
      if (s.status === KPI_STATUS.CRITICAL)  { summary.critical++; }
      else if (s.status === KPI_STATUS.AT_RISK)   { summary.atRisk++; }
      else { summary.onTarget++; }
    });
    return { success: true, data: summary };
  } catch(e) { return { success: false, message: e.message }; }
}

// ── Client detail (Performance Analytics → Per Client → click a client) ───
// Returns this client's connections (active + inactive, with start/end dates)
// and a 6-period aggregate performance trend across their ACTIVE connections,
// anchored to the currently selected week/month (not just "today").
function getClientDetail(userId, userRole, clientName, period, weekStartDate) {
  try {
    clearSheetCache();
    var isMonthly = (period === 'monthly');
    var cmpLen    = isMonthly ? 7 : 10;
    var sheetName = isMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
    var dateField = isMonthly ? 'MonthStartDate' : 'WeekStartDate';
    var periodKey = weekStartDate ? String(weekStartDate).slice(0, cmpLen)
                  : (isMonthly ? (function(){ var n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); })()
                                : getMondayStr(new Date()));

    // Trailing 6 periods ending at (and including) periodKey
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

    // All of this client's connections, scoped by role — any status, so we can
    // still surface when a VA on this client ended/paused and when.
    var allConns = getVAConnections(userId, userRole).data || [];
    var clientConns = allConns.filter(function(c){ return String(c.ClientName||'') === String(clientName); });

    var users = sheetData(SHEET_NAMES.USERS);
    var uMap = {}; users.forEach(function(u){ uMap[String(u.UserID||'')] = ((u.FirstName||'')+' '+(u.LastName||'')).trim() || u.UserID; });
    var deptMap = {}; sheetData(SHEET_NAMES.DEPARTMENTS).forEach(function(d){ deptMap[String(d.DeptID||'')] = d.DeptName || d.DeptID; });
    var svcMap  = {}; sheetData(SHEET_NAMES.SERVICES).forEach(function(s){ svcMap[String(s.ServiceID||'')] = s.ServiceName || s.ServiceID; });

    var connectionsOut = clientConns.map(function(c){
      var status   = String(c.Status||'') || 'Unknown';
      var isActive = status.toLowerCase() === 'active';
      return {
        ConnectionID: c.ConnectionID, VAUserID: c.VAUserID||'',
        VAName:      uMap[String(c.VAUserID||'')] || c.VAUserID || '\u2014',
        Department:  deptMap[String(c.DeptID||'')] || c.DeptID || '\u2014',
        Service:     svcMap[String(c.ServiceID||'')] || c.ServiceID || '\u2014',
        ConnectionType: normConnectionType(c.ConnectionType),
        Status: status, IsActive: isActive,
        StartDate: c.StartDate ? String(c.StartDate).slice(0,10) : '',
        EndDate:   (!isActive && c.InactiveDate) ? String(c.InactiveDate).slice(0,10) : ''
      };
    });
    var activeConnections = connectionsOut.filter(function(c){ return c.IsActive; });

    // 6-period aggregate trend across this client's ACTIVE connections
    var idSet = {};
    activeConnections.forEach(function(c){
      var cid = String(c.ConnectionID).trim();
      idSet[cid] = true;
      var parts = cid.split('_'); if (parts.length > 1) idSet[parts[parts.length-1]] = true;
    });

    var periodMaps = {}; periods.forEach(function(p){ periodMaps[p] = {}; });
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (sheet && sheet.getLastRow() > 1 && Object.keys(idSet).length) {
      var hdrs    = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
      var cidIdx  = hdrs.indexOf('ConnectionID');
      var wsdIdx  = hdrs.indexOf(dateField);
      var statIdx = hdrs.indexOf('Status');
      if (cidIdx >= 0 && wsdIdx >= 0 && statIdx >= 0) {
        var nr   = sheet.getLastRow()-1;
        var cidV = sheet.getRange(2, cidIdx+1,  nr, 1).getValues();
        var wsdV = sheet.getRange(2, wsdIdx+1,  nr, 1).getValues();
        var stV  = sheet.getRange(2, statIdx+1, nr, 1).getValues();
        for (var r = 0; r < nr; r++) {
          var rawCid = String(cidV[r][0]||'').trim();
          if (!rawCid) continue;
          var suffix = rawCid.split('_').pop();
          if (!idSet[rawCid] && !idSet[suffix]) continue;
          var wsd = _normDateStr(wsdV[r][0]).slice(0, cmpLen);
          if (!periodMaps[wsd]) continue;
          periodMaps[wsd][rawCid] = String(stV[r][0]||'');
        }
      }
    }

    var trend = periods.map(function(p) {
      var pMap = periodMaps[p] || {};
      var onT=0, atR=0, crit=0, noD=0;
      activeConnections.forEach(function(c) {
        var cid = String(c.ConnectionID).trim();
        var suffix = cid.split('_').pop();
        var st = pMap[cid] || pMap[suffix];
        if (!st)                          { noD++; }
        else if (st === KPI_STATUS.CRITICAL) crit++;
        else if (st === KPI_STATUS.AT_RISK)  atR++;
        else                               onT++;
      });
      return { week: p, onTarget: onT, atRisk: atR, critical: crit, noData: noD, total: activeConnections.length };
    });

    return {
      success: true, clientName: clientName, period: periodKey,
      connections: connectionsOut, activeConnections: activeConnections, trend: trend
    };
  } catch(e) {
    Logger.log('[getClientDetail] ERROR: '+e.message+' '+e.stack);
    return { success: false, message: e.message };
  }
}

function getClientPerformanceTrend(connectionIds, period) {
  try {
    var useMonthly   = (period === 'monthly');
    var summarySheet = useMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
    var dateField    = useMonthly ? 'MonthStartDate' : 'WeekStartDate';
    var summaryRows  = sheetData(summarySheet);
    var idSet = {};
    (connectionIds||[]).forEach(function(id){ idSet[String(id)] = true; });
    var periods = [];
    var now = new Date();
    var cmpLen = useMonthly ? 7 : 10;
    if (useMonthly) {
      for (var i = 5; i >= 0; i--) {
        var dm = new Date(now.getFullYear(), now.getMonth()-i, 1);
        periods.push(dm.getFullYear()+'-'+String(dm.getMonth()+1).padStart(2,'0'));
      }
    } else {
      for (var i = 5; i >= 0; i--) {
        var d = new Date(now);
        d.setDate(d.getDate() - (d.getDay()===0?6:d.getDay()-1) - i*7);
        periods.push(localDateStr(d));
      }
    }
    // Index summary rows by period → connId
    var pMaps = {}; periods.forEach(function(p){ pMaps[p] = {}; });
    summaryRows.forEach(function(r){
      if (!idSet[String(r.ConnectionID)]) return;
      var pd = String(r[dateField]||'').slice(0, cmpLen);
      if (pMaps[pd]) pMaps[pd][String(r.ConnectionID)] = r.Status;
    });
    var trend = periods.map(function(pKey) {
      var pMap = pMaps[pKey] || {};
      var onTarget=0, atRisk=0, critical=0, noData=0;
      (connectionIds||[]).forEach(function(cid) {
        var st = pMap[String(cid)];
        if (!st)                        { noData++; }
        else if (st===KPI_STATUS.CRITICAL)  { critical++; }
        else if (st===KPI_STATUS.AT_RISK)   { atRisk++; }
        else                            { onTarget++; }
      });
      return { week:pKey, onTarget:onTarget, atRisk:atRisk, critical:critical, noData:noData, total:(connectionIds||[]).length };
    });
    return { success: true, data: trend };
  } catch(e) { return { success: false, message: e.message }; }
}

function exportReportHtml(userId, userRole, deptId) {
  try {
    var today = new Date();
    var tz    = Session.getScriptTimeZone();
    var genDate = Utilities.formatDate(today, tz, 'MMM d, yyyy h:mm a');

    // Build 6 weeks and 6 months
    var weeks = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(d.getDate() - (d.getDay()===0?6:d.getDay()-1) - i*7);
      weeks.push(localDateStr(d));
    }
    var months = [];
    for (var i = 5; i >= 0; i--) {
      var dm = new Date(today.getFullYear(), today.getMonth()-i, 1);
      months.push(dm.getFullYear()+'-'+String(dm.getMonth()+1).padStart(2,'0'));
    }

    var allConns    = getVAConnections(userId, userRole).data || [];
    if (deptId) allConns = allConns.filter(function(c){ return String(c.DeptID||'')===String(deptId); });
    var activeConns = allConns.filter(function(c){ return String(c.Status||'').toLowerCase()==='active'; });
    var depts2  = sheetData(SHEET_NAMES.DEPARTMENTS);
    var deptMap = {}; depts2.forEach(function(d){ deptMap[d.DeptID]=d.DeptName; });

    // ── Submission rate helper — uses buildSubmittedSet (column reads only) ──
    function calcRate(conns2, sheetName, dateField, pKey, isMonthly) {
      var submitted = buildSubmittedSet(sheetName, dateField, pKey, isMonthly);
      var tot=conns2.length, sub=conns2.filter(function(c){return !!submitted[String(c.ConnectionID).trim()];}).length;
      return {total:tot,sub:sub,rate:tot>0?Math.round(sub/tot*100):0};
    }

    // ── Customer-level data — uses summaryByPeriod (direct column reads) ──
    function buildCustomers(periods2, useMonthly2) {
      var df2      = useMonthly2 ? 'MonthStartDate' : 'WeekStartDate';
      var sName    = useMonthly2 ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
      var custMap  = {};
      activeConns.forEach(function(conn){
        var key = conn.ClientName||'—';
        if(!custMap[key]) custMap[key]={name:key,conns:0,periods:periods2.map(function(){return 'No Data';})};
        custMap[key].conns++;
        periods2.forEach(function(p,pi){
          var pMap = summaryByPeriod(sName, df2, p, useMonthly2);
          var s    = pMap[String(conn.ConnectionID).trim()];
          if (!s) return;
          var rank = {'Critical':4,'At Risk':3,'On Target':2,'No Data':1};
          if ((rank[s.status]||0) > (rank[custMap[key].periods[pi]]||0)) custMap[key].periods[pi]=s.status;
        });
      });
      return Object.values(custMap).sort(function(a,b){return b.conns-a.conns;});
    }

    var wkCustomers = buildCustomers(weeks, false);
    var moCustomers = buildCustomers(months, true);

    // ── Submission rates per week and per month ──
    var wkRates = weeks.map(function(w){ return calcRate(activeConns,SHEET_NAMES.KPI_WEEKLY_SUMMARY,'WeekStartDate',w,false); });
    var moRates = months.map(function(m){ return calcRate(activeConns,SHEET_NAMES.KPI_MONTHLY_SUMMARY,'MonthStartDate',m,true); });

    // ── Inline SVG bar chart helper ──
    function miniBarChart(data, labels, color) {
      var W=520,H=120,PL=32,PR=12,PT=8,PB=28;
      var cW=W-PL-PR,cH=H-PT-PB,n=data.length;
      var maxV=Math.max.apply(null,data.concat([1]));
      var barW=Math.floor(cW/n*0.6);
      var gap =Math.floor(cW/n);
      var bars='',xlbls='';
      data.forEach(function(v,i){
        var bh=Math.round((v/maxV)*cH);
        var bx=PL+i*gap+(gap-barW)/2;
        var by=PT+cH-bh;
        bars+='<rect x="'+bx+'" y="'+by+'" width="'+barW+'" height="'+bh+'" rx="3" fill="'+color+'" opacity="0.85"/>';
        bars+='<text x="'+(bx+barW/2)+'" y="'+(by-3)+'" text-anchor="middle" font-size="9" fill="#374151">'+v+'%</text>';
        xlbls+='<text x="'+(bx+barW/2)+'" y="'+(H-6)+'" text-anchor="middle" font-size="8" fill="#9ca3af">'+labels[i]+'</text>';
      });
      return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="display:block;">'
        +'<line x1="'+PL+'" y1="'+PT+'" x2="'+PL+'" y2="'+(PT+cH)+'" stroke="#e5e7eb" stroke-width="1"/>'
        +'<line x1="'+PL+'" y1="'+(PT+cH)+'" x2="'+(W-PR)+'" y2="'+(PT+cH)+'" stroke="#e5e7eb" stroke-width="1"/>'
        +bars+xlbls+'</svg>';
    }

    // ── Status color helper ──
    var SCOL={'Critical':'#fee2e2','At Risk':'#fef3c7','On Target':'#dcfce7','No Data':'#f3f4f6'};
    var STXT={'Critical':'#b91c1c','At Risk':'#92400e','On Target':'#166534','No Data':'#6b7280'};
    function stCell(st){ return '<td style="text-align:center;background:'+(SCOL[st]||'#f3f4f6')+';color:'+(STXT[st]||'#374151')+';font-weight:700;font-size:11px;padding:4px 6px;border:1px solid #e5e7eb;">'+st+'</td>'; }

    function customerTable(customers2, periods2, useMonthly2) {
      if(!customers2.length) return '<p style="color:#6b7280;text-align:center;">No data.</p>';
      var fmtP=function(p){ if(useMonthly2){var d=new Date(p+'-01T00:00:00');return d.toLocaleDateString('en-US',{month:'short',year:'2-digit'});}var d=new Date(p+'T00:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); };
      var hdr='<thead style="background:#1e3a5f;color:white;"><tr><th style="padding:8px 10px;text-align:left;">Customer</th><th style="padding:8px;text-align:center;">Active</th>'
        +periods2.map(function(p,i){return '<th style="padding:8px;text-align:center;font-size:11px;'+(i===periods2.length-1?'font-weight:900;background:#2d5a9e;':'')+'">'+fmtP(p)+(i===periods2.length-1?'<div style="font-size:9px;opacity:.8;">Latest</div>':'')+'</th>';}).join('')
        +'</tr></thead>';
      var body='<tbody>'+customers2.map(function(c,idx){
        return '<tr style="background:'+(idx%2===0?'#fff':'#f9fafb')+';">'
          +'<td style="padding:6px 10px;font-weight:600;border-bottom:1px solid #e5e7eb;">'+c.name+'</td>'
          +'<td style="text-align:center;padding:6px;border-bottom:1px solid #e5e7eb;"><span style="background:#dcfce7;color:#166534;font-weight:700;padding:2px 8px;border-radius:12px;font-size:12px;">'+c.conns+'</span></td>'
          +c.periods.map(function(p){return stCell(p);}).join('')
          +'</tr>';
      }).join('')+'</tbody>';
      return '<table style="border-collapse:collapse;width:100%;font-size:12px;">'+hdr+body+'</table>';
    }

    // ── Format period labels ──
    var wkLabels = weeks.map(function(w){ var d=new Date(w+'T00:00:00'); return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); });
    var moLabels = months.map(function(m){ var d=new Date(m+'-01T00:00:00'); return d.toLocaleDateString('en-US',{month:'short',year:'2-digit'}); });

    var wkRateVals = wkRates.map(function(r){return r.rate;});
    var moRateVals = moRates.map(function(r){return r.rate;});

    // ── Totals ──
    var totalActive = activeConns.length;
    var totalCusts  = Object.keys((function(){var m={};activeConns.forEach(function(c){m[c.ClientName]=1;});return m;})()).length;

    var css = '<style>'
      +'*{box-sizing:border-box;margin:0;padding:0;}'
      +'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f3f4f6;color:#111827;}'
      +'.shell{max-width:1100px;margin:0 auto;padding:24px 16px;}'
      +'.topbar{background:linear-gradient(135deg,#1e3a5f 0%,#2d5a9e 100%);color:white;padding:20px 28px;border-radius:16px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;}'
      +'.topbar h1{font-size:22px;font-weight:800;letter-spacing:-.02em;}'
      +'.topbar .meta{font-size:12px;opacity:.75;margin-top:4px;}'
      +'.topbar .badge-pill{background:rgba(255,255,255,.18);padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;}'
      +'.scorecards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}'
      +'.sc{background:white;border-radius:12px;padding:16px 18px;box-shadow:0 1px 4px rgba(0,0,0,.07);}'
      +'.sc-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:6px;}'
      +'.sc-val{font-size:28px;font-weight:800;color:#111827;line-height:1;}'
      +'.section{background:white;border-radius:12px;padding:20px 22px;box-shadow:0 1px 4px rgba(0,0,0,.07);margin-bottom:16px;}'
      +'.section-title{font-size:15px;font-weight:800;color:#1e3a5f;margin-bottom:4px;display:flex;align-items:center;gap:8px;}'
      +'.section-sub{font-size:12px;color:#6b7280;margin-bottom:16px;}'
      +'.period-badge{background:#1e3a5f;color:white;font-size:11px;font-weight:700;padding:2px 10px;border-radius:10px;}'
      +'.period-badge.monthly{background:#7c3aed;}'
      +'.chart-wrap{background:#f9fafb;border-radius:10px;padding:12px;margin-bottom:12px;}'
      +'.chart-label{font-size:11px;font-weight:600;color:#6b7280;margin-bottom:6px;}'
      +'table{border-collapse:collapse;width:100%;}'
      +'@media print{body{background:white;}.shell{padding:8px;}.topbar{print-color-adjust:exact;-webkit-print-color-adjust:exact;}.no-print{display:none!important;}}'
      +'</style>';

    var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VAA KPI Report — '+genDate+'</title>'+css+'</head><body>'

    +'<div class="shell">'

    // Top bar
    +'<div class="topbar">'
    +'<div><div class="topbar h1" style="font-size:22px;font-weight:800;">VAA KPI Report</div><div class="meta">Generated '+genDate+'</div></div>'
    +'<div class="badge-pill no-print" style="cursor:pointer;" onclick="window.print()">🖨 Print / Save PDF</div>'
    +'</div>'

    // Scorecards
    +'<div class="scorecards">'
    +'<div class="sc"><div class="sc-label">Active Customers</div><div class="sc-val">'+totalCusts+'</div></div>'
    +'<div class="sc"><div class="sc-label">Active Connections</div><div class="sc-val">'+totalActive+'</div></div>'
    +'<div class="sc"><div class="sc-label">Avg Weekly Sub Rate</div><div class="sc-val">'+(wkRateVals.length?Math.round(wkRateVals.reduce(function(a,b){return a+b;},0)/wkRateVals.length):0)+'%</div></div>'
    +'<div class="sc"><div class="sc-label">Avg Monthly Sub Rate</div><div class="sc-val">'+(moRateVals.length?Math.round(moRateVals.reduce(function(a,b){return a+b;},0)/moRateVals.length):0)+'%</div></div>'
    +'</div>'

    // Submission rate charts
    +'<div class="section">'
    +'<div class="section-title">Submission Rate Over Time</div>'
    +'<div class="section-sub">Percentage of active connections that submitted KPI reports</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">'
    +'<div class="chart-wrap"><div class="chart-label"><span class="period-badge">Weekly</span> Past 6 Weeks</div>'
    +miniBarChart(wkRateVals, wkLabels, '#2d5a9e')
    +'</div>'
    +'<div class="chart-wrap"><div class="chart-label"><span class="period-badge monthly">Monthly</span> Past 6 Months</div>'
    +miniBarChart(moRateVals, moLabels, '#7c3aed')
    +'</div>'
    +'</div></div>'

    // Weekly Customer Overview
    +'<div class="section">'
    +'<div class="section-title"><span class="period-badge">Weekly</span> Customer Performance Overview</div>'
    +'<div class="section-sub">KPI performance status per customer — past 6 weeks. If any VA connection is Critical, the customer status is Critical.</div>'
    +customerTable(wkCustomers, weeks, false)
    +'</div>'

    // Monthly Customer Overview
    +'<div class="section">'
    +'<div class="section-title"><span class="period-badge monthly">Monthly</span> Customer Performance Overview</div>'
    +'<div class="section-sub">KPI performance status per customer — past 6 months.</div>'
    +customerTable(moCustomers, months, true)
    +'</div>'

    +'</div>'  // shell
    +'</body></html>';

    return { success: true, html: html };
  } catch(e) { return { success: false, message: e.message }; }
}

function exportReport(userId, userRole, deptId) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var today = new Date();
    var fname = 'VAA_Export_' + Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');

    // ── Build export workbook in a temp spreadsheet ──
    var exportSS = SpreadsheetApp.create(fname);
    // Remove default sheet
    var defaultSheet = exportSS.getSheets()[0];

    // ════════════════════════════════════════════════════
    // TAB 1: SUBMISSION RATES (weekly + monthly, by dept)
    // ════════════════════════════════════════════════════
    var subSheet = exportSS.insertSheet('Submission Rates');

    // Build 8 weeks + 6 months of submission data
    var weeks = [];
    for (var i = 7; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(d.getDate() - (d.getDay()===0?6:d.getDay()-1) - i*7);
      weeks.push(localDateStr(d));
    }
    var months = [];
    for (var i = 5; i >= 0; i--) {
      var dm = new Date(today.getFullYear(), today.getMonth()-i, 1);
      months.push(dm.getFullYear()+'-'+String(dm.getMonth()+1).padStart(2,'0'));
    }

    var allConns   = getVAConnections(userId, userRole).data || [];
    if (deptId) allConns = allConns.filter(function(c){ return String(c.DeptID||'')===String(deptId); });
    var activeConns= allConns.filter(function(c){ return String(c.Status||'').toLowerCase()==='active'; });

    var weekly  = sheetData(SHEET_NAMES.KPI_WEEKLY);
    var monthly = sheetData(SHEET_NAMES.KPI_MONTHLY);
    var depts2  = sheetData(SHEET_NAMES.DEPARTMENTS);
    var deptMap2= {}; depts2.forEach(function(d){ deptMap2[d.DeptID]=d.DeptName; });

    function calcSubRate(conns2, reportRows, dateField, periodKey, isMonthly) {
      var reported = {};
      reportRows.forEach(function(r){
        var rd=r[dateField]; var rdStr=rd instanceof Date
          ?(isMonthly?rd.getFullYear()+'-'+String(rd.getMonth()+1).padStart(2,'0'):localDateStr(rd))
          :String(rd||'').slice(0,isMonthly?7:10);
        if (rdStr===periodKey) reported[String(r.ConnectionID)]=true;
      });
      var total=conns2.length, sub=conns2.filter(function(c){return reported[String(c.ConnectionID)];}).length;
      return { total:total, submitted:sub, rate: total>0?Math.round(sub/total*100):0 };
    }

    // Headers
    var wkHdrs  = weeks.map(function(w){ return 'Week '+w; });
    var moHdrs  = months.map(function(m){ return m; });
    var hdr1    = ['',''].concat(wkHdrs).concat(['']).concat(moHdrs);
    var hdr2    = ['Department','Metric'].concat(weeks.map(function(){ return 'Rate %'; })).concat(['']).concat(months.map(function(){ return 'Rate %'; }));

    subSheet.appendRow(['Submission Rate Report — Generated: '+Utilities.formatDate(today, Session.getScriptTimeZone(), 'MMM d, yyyy')]);
    subSheet.appendRow(hdr1);
    subSheet.appendRow(hdr2);

    // All Departments row
    var allWkRates = weeks.map(function(w){  return calcSubRate(activeConns, SHEET_NAMES.KPI_WEEKLY_SUMMARY, 'WeekStartDate', w, false).rate+'%'; });
    var allMoRates = months.map(function(m){ return calcSubRate(activeConns, SHEET_NAMES.KPI_MONTHLY_SUMMARY, 'MonthStartDate', m, true).rate+'%';  });
    subSheet.appendRow(['All Departments','Submission Rate'].concat(allWkRates).concat(['']).concat(allMoRates));

    // Per-department rows
    var deptIds = [...new Set(activeConns.map(function(c){ return c.DeptID; }))];
    deptIds.forEach(function(did){
      var dConns = activeConns.filter(function(c){ return String(c.DeptID)===String(did); });
      var dWkRates = weeks.map(function(w){  return calcSubRate(dConns, SHEET_NAMES.KPI_WEEKLY_SUMMARY, 'WeekStartDate', w, false).rate+'%'; });
      var dMoRates = months.map(function(m){ return calcSubRate(dConns, SHEET_NAMES.KPI_MONTHLY_SUMMARY, 'MonthStartDate', m, true).rate+'%';  });
      subSheet.appendRow([deptMap2[did]||did,'Submission Rate'].concat(dWkRates).concat(['']).concat(dMoRates));
    });

    // ════════════════════════════════════════════════════
    // TAB 2: VA CONNECTION PERFORMANCE (past 6 weeks & 6 months)
    // ════════════════════════════════════════════════════
    var perfSheet = exportSS.insertSheet('VA Performance');

    var last6Wks  = weeks.slice(-6);
    var users2    = sheetData(SHEET_NAMES.USERS);
    var svcs2     = sheetData(SHEET_NAMES.SERVICES);
    var uMap2     = {}; users2.forEach(function(u){ uMap2[u.UserID]=(u.FirstName||'')+' '+(u.LastName||''); });
    var sMap2     = {}; svcs2.forEach(function(s){ sMap2[s.ServiceID]=s.ServiceName; });

    var perfHdr = ['Client','VA','Department','Service','Status','Start Date']
      .concat(last6Wks.map(function(w){ return 'Wk '+w; }))
      .concat([''])
      .concat(months.map(function(m){ return m; }));
    perfSheet.appendRow(['VA Performance Report — Generated: '+Utilities.formatDate(today, Session.getScriptTimeZone(), 'MMM d, yyyy')]);
    perfSheet.appendRow(perfHdr);

    function connPerfStatus(cid, sheetName, dateField, pKey, isMonthly) {
      // Use summaryByPeriod which does direct column reads
      var pMap = summaryByPeriod(sheetName, dateField, pKey, isMonthly);
      var s    = pMap[String(cid).trim()];
      return s ? s.status : 'No Data';
    }

    allConns.forEach(function(conn) {
      var wkStatuses = last6Wks.map(function(w){  return connPerfStatus(conn.ConnectionID, SHEET_NAMES.KPI_WEEKLY_SUMMARY,  'WeekStartDate',  w, false); });
      var moStatuses = months.map(function(m){    return connPerfStatus(conn.ConnectionID, SHEET_NAMES.KPI_MONTHLY_SUMMARY, 'MonthStartDate', m, true);  });
      var start = conn.StartDate ? String(conn.StartDate).slice(0,10) : '';
      perfSheet.appendRow([
        conn.ClientName||'', uMap2[conn.VAUserID]||'', deptMap2[conn.DeptID]||'',
        sMap2[conn.ServiceID]||'', conn.Status||'', start
      ].concat(wkStatuses).concat(['']).concat(moStatuses));
    });

    // ════════════════════════════════════════════════════
    // TAB 3: CUSTOMER OVERVIEW
    // ════════════════════════════════════════════════════
    var custSheet = exportSS.insertSheet('Customer Overview');

    var coReport = getCustomerOverviewReport(userId, userRole, deptId||'', 'weekly', localDateStr(today));
    var customers3 = (coReport.data||{}).customers||[];
    var periods3   = (coReport.data||{}).periods||[];

    var coHdr = ['Customer','Active Connections','Duration (days)']
      .concat(periods3.map(function(p){ return 'Wk '+p; }))
      .concat(['Latest Status']);
    custSheet.appendRow(['Customer Overview — Generated: '+Utilities.formatDate(today, Session.getScriptTimeZone(), 'MMM d, yyyy')]);
    custSheet.appendRow(coHdr);

    customers3.forEach(function(cust) {
      var row = [cust.clientName, cust.activeConns, cust.maxDays||0]
        .concat(cust.periodStatuses||[])
        .concat([cust.periodStatuses[cust.periodStatuses.length-1]||'No Data']);
      custSheet.appendRow(row);
    });

    // ── Clean up default empty sheet ──
    try { exportSS.deleteSheet(defaultSheet); } catch(e){}

    // ── Return the export spreadsheet URL ──
    return { success: true, url: exportSS.getUrl(), name: fname };
  } catch(e) { return { success: false, message: e.message }; }
}

function getCustomerOverviewReport(userId, userRole, deptId, period, dateStr) {
  try {
    var useMonthly  = (period === 'monthly');
    var conns       = getVAConnections(userId, userRole).data || [];
    var users       = sheetData(SHEET_NAMES.USERS);
    var depts       = sheetData(SHEET_NAMES.DEPARTMENTS);
    var svcs        = sheetData(SHEET_NAMES.SERVICES);
    var dateField   = useMonthly ? 'MonthStartDate' : 'WeekStartDate';

    var userMap = {}; users.forEach(function(u){ userMap[String(u.UserID)] = (u.FirstName||'')+' '+(u.LastName||''); });
    var deptMap = {}; depts.forEach(function(d){ deptMap[String(d.DeptID)] = d.DeptName; });
    var svcMap  = {}; svcs.forEach(function(s){ svcMap[String(s.ServiceID)] = s.ServiceName; });

    if (deptId) conns = conns.filter(function(c){ return String(c.DeptID||'') === String(deptId); });

    // Build 6 periods first (weeks or months)
    var now   = new Date();
    var periods = [];
    var anchor = dateStr ? dateStr : null;

    if (useMonthly) {
      // anchor = YYYY-MM-DD (first of some month), build 6 months ending there
      var anchorDate = anchor ? new Date(anchor.slice(0,7)+'-01T00:00:00') : now;
      for (var i = 5; i >= 0; i--) {
        var d2 = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
        periods.push(d2.getFullYear() + '-' + String(d2.getMonth()+1).padStart(2,'0'));
      }
    } else {
      // anchor = YYYY-MM-DD monday, build 6 weeks ending there
      var anchorMon = anchor ? getMondayStr(anchor.slice(0,10)) : getMondayStr(now);
      var ap = anchorMon.split('-');
      for (var i = 5; i >= 0; i--) {
        var d3 = new Date(parseInt(ap[0]), parseInt(ap[1])-1, parseInt(ap[2]) - i*7);
        periods.push(getMondayStr(d3));
      }
    }

    // Now filter active connections using the built periods array
    var cmpLen2b = useMonthly ? 7 : 10;
    var periodEnd2 = periods.length ? periods[periods.length-1] : '';
    var activeConns = conns.filter(function(c) {
      var startD = String(c.StartDate||'').slice(0, cmpLen2b);
      // Exclude connections that start after the last period
      if (startD && periodEnd2 && startD > periodEnd2) return false;
      return true;
    });

    // For each period, build a map: connectionId → status
    // Read ONLY CID, date, and status columns — never the KPIs blob
    var summarySheet = useMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
    var cmpLen2 = useMonthly ? 7 : 10;
    var ss2     = SpreadsheetApp.getActiveSpreadsheet();
    var sumSh2  = ss2.getSheetByName(summarySheet);
    var _periodMapsByCid = {}; // {pKey: {cid: status}}
    periods.forEach(function(p){ _periodMapsByCid[p] = {}; });
    if (sumSh2 && sumSh2.getLastRow() > 1) {
      var sh2Hdrs  = sumSh2.getRange(1,1,1,sumSh2.getLastColumn()).getValues()[0];
      var sh2CidI  = sh2Hdrs.indexOf('ConnectionID');
      var sh2WsdI  = sh2Hdrs.indexOf(dateField);
      var sh2StatI = sh2Hdrs.indexOf('Status');
      var sh2NR    = sumSh2.getLastRow()-1;
      var sh2Cid   = sumSh2.getRange(2,sh2CidI+1,sh2NR,1).getValues();
      var sh2Wsd   = sumSh2.getRange(2,sh2WsdI+1,sh2NR,1).getValues();
      var sh2Stat  = sh2StatI>=0 ? sumSh2.getRange(2,sh2StatI+1,sh2NR,1).getValues() : null;
      for (var si=0; si<sh2NR; si++) {
        var sCid = String(sh2Cid[si][0]||'').trim();
        if (!sCid) continue;
        var sWsd = _normDateStr(sh2Wsd[si][0]).slice(0,cmpLen2);
        if (_periodMapsByCid[sWsd]) {
          _periodMapsByCid[sWsd][sCid] = sh2Stat ? String(sh2Stat[si][0]||'') : '';
        }
      }
    }
    var periodReports = periods.map(function(pKey) {
      return { pKey: pKey, connStatus: _periodMapsByCid[pKey] || {} };
    });

    // Build maxDays per customer across ALL connections (including inactive)
    var today = new Date();
    var custMaxDays = {};
    conns.forEach(function(conn) {
      var key = conn.ClientName || '—';
      var start = conn.StartDate ? new Date(String(conn.StartDate).slice(0,10)+'T00:00:00') : null;
      var days  = start ? Math.floor((today - start) / 86400000) : 0;
      if (!custMaxDays[key] || days > custMaxDays[key]) custMaxDays[key] = days;
    });

    // Aggregate by customer
    var custMap = {};
    activeConns.forEach(function(conn) {
      var key = conn.ClientName || '—';
      if (!custMap[key]) {
        custMap[key] = {
          clientName:    key,
          secondaryName: conn.SecondaryName || '',
          activeConns:   0,
          maxDays:       custMaxDays[key] || 0,
          connections:   [],
          periodStatuses:periods.map(function(){ return null; })
        };
      }
      var cust = custMap[key];
      cust.activeConns++;
      cust.connections.push({
        connectionId:   conn.ConnectionID,
        vaName:         userMap[String(conn.VAUserID)] || '—',
        department:     deptMap[String(conn.DeptID)]   || '—',
        service:        svcMap[String(conn.ServiceID)] || '—',
        connectionType: normConnectionType(conn.ConnectionType),
        startDate:      conn.StartDate ? String(conn.StartDate).slice(0,10) : '—',
        status:         conn.Status || '—',
        periodStatuses: []
      });
      // Assign per-period status for this connection
      var connIdx = cust.connections.length - 1;
      var connStartD = conn.StartDate ? new Date(String(conn.StartDate).slice(0,10)+'T00:00:00') : null;
      cust.connections[connIdx].periodStatuses = periodReports.map(function(pr) {
        // Determine period bounds
        var pStart, pEnd;
        if (useMonthly) {
          var ymp=pr.pKey.split('-'); pStart=new Date(parseInt(ymp[0]),parseInt(ymp[1])-1,1); pEnd=new Date(parseInt(ymp[0]),parseInt(ymp[1]),0);
        } else {
          pStart=new Date(pr.pKey+'T00:00:00'); pEnd=new Date(pr.pKey+'T00:00:00'); pEnd.setDate(pEnd.getDate()+6);
        }
        // Not yet started
        if (!connStartD || connStartD > pEnd) return 'empty';
        // Was inactive before this period
        var connStat=String(conn.Status||'').toLowerCase();
        if (connStat!=='active') {
          var inactStr=String(conn.InactiveDate||'').slice(0,10);
          if (!inactStr||new Date(inactStr+'T00:00:00')<pStart) return 'empty';
        }
        return pr.connStatus[String(conn.ConnectionID)] || 'No Data';
      });
      // Roll up: worst per period across all connections (ignore 'empty')
      periodReports.forEach(function(pr, pi) {
        var cs = cust.connections[connIdx].periodStatuses[pi];
        if (cs === 'empty') return;
        var prev = cust.periodStatuses[pi];
        var rank = { 'Critical':4, 'At Risk':3, 'On Target':2, 'No Data':1 };
        if (!prev || prev === 'empty' || (rank[cs]||0) > (rank[prev]||0)) cust.periodStatuses[pi] = cs;
      });
    });

    var customers = Object.values(custMap).sort(function(a,b){
      return b.activeConns - a.activeConns || a.clientName.localeCompare(b.clientName);
    });

    return { success: true, data: { customers: customers, periods: periods, useMonthly: useMonthly } };
  } catch(e) {
    Logger.log('[getCustomerOverviewReport] ERROR: '+e.message+' stack:'+e.stack);
    return { success: false, message: 'CO Error: '+e.message };
  }
}

function getLifetimeValueReport(userId, userRole, deptId, dateStr, period) {
  try {
    var useMonthly = (period === 'monthly');
    var conns  = getVAConnections(userId, userRole).data || [];
    var users  = sheetData(SHEET_NAMES.USERS);
    var depts  = sheetData(SHEET_NAMES.DEPARTMENTS);
    var svcs   = sheetData(SHEET_NAMES.SERVICES);
    var dateField   = useMonthly ? 'MonthStartDate' : 'WeekStartDate';

    var userMap = {}; users.forEach(function(u){ userMap[u.UserID] = (u.FirstName||'')+ ' '+(u.LastName||''); });
    var deptMap = {}; depts.forEach(function(d){ deptMap[d.DeptID] = d.DeptName; });
    var svcMap  = {}; svcs.forEach(function(s){ svcMap[s.ServiceID] = s.ServiceName; });

    // Connections that have at least one intervention logged (for "Intv" indicator)
    var intvConnSet = {};
    sheetData(SHEET_NAMES.INTERVENTIONS).forEach(function(iv){
      var cid = String(iv.ConnectionID||'').trim();
      if (cid) intvConnSet[cid] = true;
    });

    if (deptId) conns = conns.filter(function(c){ return String(c.DeptID||'') === String(deptId); });

    var today = new Date();
    var now = new Date();
    var thisWeek = dateStr
      ? (useMonthly ? String(dateStr).slice(0,7) : String(dateStr).slice(0,10))
      : (useMonthly ? (now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')) : getMondayStr(now));

    var _lvSummaryMap = null;
    var rows = conns.map(function(conn) {
      var start = conn.StartDate ? new Date(String(conn.StartDate).slice(0,10)+'T00:00:00') : null;
      var days  = start ? Math.floor((today - start) / 86400000) : 0;

      // Determine performance status from latest week
      // Use summary sheet for performance status
      if (!_lvSummaryMap) {
        _lvSummaryMap = {};
        sheetData(useMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY)
          .forEach(function(r){ var pd=String(r[dateField]||'').slice(0,useMonthly?7:10); if(pd===thisWeek.slice(0,useMonthly?7:10)) _lvSummaryMap[String(r.ConnectionID)]=r.Status; });
      }
      var perfStatus = _lvSummaryMap[String(conn.ConnectionID)] || 'No Data';

      return {
        connectionId:  conn.ConnectionID,
        clientName:    conn.ClientName    || '—',
        secondaryName: conn.SecondaryName || '',
        vaName:        userMap[conn.VAUserID] || '—',
        department:    deptMap[conn.DeptID]   || '—',
        service:       svcMap[conn.ServiceID] || '—',
        connectionType: normConnectionType(conn.ConnectionType),
        startDate:     conn.StartDate ? String(conn.StartDate).slice(0,10) : '—',
        status:        conn.Status || '—',
        inactiveDate:  conn.InactiveDate ? String(conn.InactiveDate).slice(0,10) : '',
        daysActive:    days,
        perfStatus:    perfStatus,
        hasIntervention: !!intvConnSet[String(conn.ConnectionID||'')]
      };
    });

    // ── Customer-level aggregation ──
    var customerMap = {};
    rows.forEach(function(row) {
      var key = row.clientName;
      if (!customerMap[key]) {
        customerMap[key] = {
          clientName:    row.clientName,
          secondaryName: row.secondaryName,
          department:    row.department,
          connections:   [],
          maxDays:       0,
          perfStatus:    'No Data'
        };
      }
      var cust = customerMap[key];
      cust.connections.push(row);
      if (row.daysActive > cust.maxDays) cust.maxDays = row.daysActive;
      // Roll up: critical wins, then at-risk, then on-target
      var rank = { 'Critical':4,'At Risk':3,'On Target':2,'No Data':1 };
      if ((rank[row.perfStatus]||0) > (rank[cust.perfStatus]||0)) cust.perfStatus = row.perfStatus;
    });

    var customers = Object.values(customerMap).map(function(c){
      return {
        clientName:       c.clientName,
        secondaryName:    c.secondaryName,
        department:       c.department,
        activeConnections: c.connections.filter(function(r){ return r.status==='Active'; }).length,
        totalConnections:  c.connections.length,
        maxDays:           c.maxDays,
        perfStatus:        c.perfStatus
      };
    }).sort(function(a,b){ return b.maxDays - a.maxDays; });

    return {
      success: true,
      data: {
        rows:        rows,
        customers:   customers,
        top10long:   customers.slice(0,10),
        top10short:  customers.slice().sort(function(a,b){ return a.maxDays - b.maxDays; }).slice(0,10)
      }
    };
  } catch(e) { return { success:false, message:e.message }; }
}

function _fmtDuration2(days) {
  if (!days || days < 0) return '0 days';
  var yrs = Math.floor(days/365);
  var mos = Math.floor((days%365)/30);
  var rem = days % 30;
  var parts = [];
  if (yrs) parts.push(yrs + ' yr' + (yrs!==1?'s':''));
  if (mos) parts.push(mos + ' mo' + (mos!==1?'s':''));
  if (!yrs && !mos) parts.push(rem + ' day' + (rem!==1?'s':''));
  return parts.join(' ');
}

function getTeamPerformance(teamLeaderId, weekStartDate) {
  const conns = getVAConnections(teamLeaderId, ROLES.TEAM_LEADER).data || [];
  return buildPerfSummary(conns, weekStartDate);
}
function getDeptPerformance(managerId, weekStartDate) {
  const conns = getVAConnections(managerId, ROLES.MANAGER).data || [];
  return buildPerfSummary(conns, weekStartDate);
}
function getAvailableWeeks() {
  var map  = summaryLookup(SHEET_NAMES.KPI_WEEKLY_SUMMARY, 'WeekStartDate');
  var seen = {};
  Object.values(map).forEach(function(connMap) {
    Object.keys(connMap).forEach(function(wsd) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(wsd)) seen[getMondayStr(wsd)] = true; // getMondayStr now parses as local
    });
  });
  var weeks = Object.keys(seen).sort().reverse();
  var cur = getMondayStr(new Date());
  if (!seen[cur]) weeks.unshift(cur);
  return { success: true, data: weeks };
}

function getSystemPerformance(weekStartDate, deptId, serviceId, period, teamId, userId, userRole) {
  try {
    var conns = sheetData(SHEET_NAMES.CONNECTIONS);
    // Enforce the caller's actual role scope first — deptId/teamId below can only
    // narrow further within it, never see beyond what their role allows.
    if (userId && userRole) {
      var allowSet = _roleScopedConnIdSet(userId, userRole);
      conns = conns.filter(function(c){
        var cid = String(c.ConnectionID||'').trim();
        var suffix = cid.split('_').pop();
        return allowSet[cid] || allowSet[suffix];
      });
    }
    if (deptId)    conns = conns.filter(function(c){ return String(c.DeptID||'')    === String(deptId);    });
    if (serviceId) conns = conns.filter(function(c){ return String(c.ServiceID||'') === String(serviceId); });
    // Team scoping: filter to connections whose VA is on the given team
    if (teamId) {
      var teamUserIds = {};
      sheetData(SHEET_NAMES.USERS).forEach(function(u){
        if (String(u.TeamID||'')===String(teamId)) teamUserIds[String(u.UserID||'')] = true;
      });
      conns = conns.filter(function(c){ return teamUserIds[String(c.VAUserID||'')]; });
    }
    return buildPerfSummary(conns, weekStartDate, period);
  } catch(e) { return { success:false, message:'getSystemPerformance: '+e.message, data:{total:0,onTarget:[],atRisk:[],critical:[],noData:[]} }; }
}

function buildPerfSummary(conns, weekStartDate, period) {
  var useMonthly = (period === 'monthly');
  var summarySheet = useMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
  var dateField    = useMonthly ? 'MonthStartDate' : 'WeekStartDate';
  const depts  = sheetData(SHEET_NAMES.DEPARTMENTS);
  const svcs   = sheetData(SHEET_NAMES.SERVICES);
  const users  = sheetData(SHEET_NAMES.USERS);
  const deptMap = {}; depts.forEach(function(d){ deptMap[d.DeptID] = d.DeptName; });
  const svcMap  = {}; svcs.forEach(function(s){ svcMap[s.ServiceID] = s.ServiceName; });
  const userMap = {}; users.forEach(function(u){ userMap[String(u.UserID||'')] = ((u.FirstName||'')+' '+(u.LastName||'')).trim() || u.UserID; });
  const thisWeek = weekStartDate
    ? (useMonthly ? String(weekStartDate).slice(0,7) : String(weekStartDate).slice(0,10))
    : (useMonthly ? (function(){ var n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); })() : getMondayStr(new Date()));

  // Compute period bounds for active-during-period check
  var periodStart, periodEnd;
  if (useMonthly) {
    var ymParts = thisWeek.split('-');
    periodStart = new Date(parseInt(ymParts[0]), parseInt(ymParts[1])-1, 1);
    periodEnd   = new Date(parseInt(ymParts[0]), parseInt(ymParts[1]), 0);
  } else {
    var _wp = thisWeek.split('-');
    periodStart = new Date(parseInt(_wp[0]), parseInt(_wp[1])-1, parseInt(_wp[2]));
    periodEnd   = new Date(parseInt(_wp[0]), parseInt(_wp[1])-1, parseInt(_wp[2]) + 6);
  }

  // Read from Summary sheet — one row per connection per period
  var periodMap = summaryByPeriod(summarySheet, dateField, thisWeek, useMonthly);

  const r = { total: 0, onTarget: [], atRisk: [], critical: [], noData: [] };
  var periodEndStr = periodEnd.getFullYear()+'-'+String(periodEnd.getMonth()+1).padStart(2,'0')+'-'+String(periodEnd.getDate()).padStart(2,'0');
  conns.forEach(function(conn) {
    var connStart = conn.StartDate ? new Date(String(conn.StartDate).slice(0,10)+'T00:00:00') : null;
    if (!connStart || connStart > periodEnd) return;
    var statusThen = _statusAsOfDate(conn.StatusHistory, conn.Status, periodEndStr);
    // Paused (at the time of this period) — excluded entirely, not counted at all.
    if (statusThen === 'Paused') return;
    if (statusThen !== 'Active') {
      var inactStr = String(conn.InactiveDate||'').slice(0,10);
      if (!inactStr || inactStr < thisWeek.slice(0,10)) return;
    }
    r.total++;
    var enriched = Object.assign({}, conn, {
      DeptName:      deptMap[conn.DeptID]    || conn.DeptID    || '—',
      ServiceName:   svcMap[conn.ServiceID]  || conn.ServiceID || '—',
      ConnectionType: normConnectionType(conn.ConnectionType),
      PausedDays:    _computePausedDays(conn.StatusHistory, null),
      VAName:        userMap[String(conn.VAUserID||'')] || conn.VAUserID || '—',
      vaName:        userMap[String(conn.VAUserID||'')] || conn.VAUserID || '—'
    });
    var s = periodMap[String(conn.ConnectionID)];
    if (!s) { r.noData.push(enriched); return; }
    if (s.status === KPI_STATUS.CRITICAL)       r.critical.push(enriched);
    else if (s.status === KPI_STATUS.AT_RISK)   r.atRisk.push(enriched);
    else                                         r.onTarget.push(enriched);
  });
  return { success: true, data: r };
}

function getVAConnectionPerformance(connId, weekCount) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.KPI_WEEKLY_SUMMARY);
  var kpiMap = {}; sheetData(SHEET_NAMES.KPI_MASTER).forEach(function(k){ kpiMap[k.KPIID]=k; });
  if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };
  var hdrs   = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  var iConn  = hdrs.indexOf('ConnectionID');
  var iWsd   = hdrs.indexOf('WeekStartDate');
  var iKPIs  = hdrs.indexOf('KPIs');
  var iSubBy = hdrs.indexOf('SubmittedBy');
  var iSubAt = hdrs.indexOf('SubmittedAt');
  // Read ONLY individual columns — never all columns (KPIs blob causes timeout)
  var numRows = sheet.getLastRow()-1;
  var cidVals = sheet.getRange(2, iConn+1,  numRows, 1).getValues();
  var wsdVals = sheet.getRange(2, iWsd+1,   numRows, 1).getValues();
  var kpiVals = iKPIs  >= 0 ? sheet.getRange(2, iKPIs+1,  numRows, 1).getValues() : null;
  var subByV  = iSubBy >= 0 ? sheet.getRange(2, iSubBy+1, numRows, 1).getValues() : null;
  var subAtV  = iSubAt >= 0 ? sheet.getRange(2, iSubAt+1, numRows, 1).getValues() : null;
  var normId  = String(connId).trim();
  var normSuffix = normId.split('_').pop();
  var matched = [];
  for (var ri=0; ri<numRows; ri++) {
    var rowCid = String(cidVals[ri][0]||'').trim();
    if (rowCid !== normId && rowCid.split('_').pop() !== normSuffix) continue;
    var wsdRaw = wsdVals[ri][0];
    var wsd = _normDateStr(wsdRaw).slice(0,10);
    matched.push({
      wsd:    wsd,
      KPIs:   kpiVals  ? kpiVals[ri][0]  : '',
      SubmittedBy: subByV ? subByV[ri][0] : '',
      SubmittedAt: subAtV ? subAtV[ri][0] : ''
    });
  }
  matched.sort(function(a,b){ return b.wsd.localeCompare(a.wsd); });
  matched = matched.slice(0, weekCount||6);
  var grouped = {};
  matched.forEach(function(row) {
    var kpisArr = []; try { if (row.KPIs) kpisArr = JSON.parse(row.KPIs); } catch(e) {}
    kpisArr.forEach(function(e) {
      if (!grouped[e.kpiId]) grouped[e.kpiId] = [];
      grouped[e.kpiId].push({ WeekStartDate:row.wsd, Target:e.target, Actual:e.actual,
                               NoDataAvailable:e.noData, Status:e.status,
                               SubmittedBy:row.SubmittedBy, SubmittedAt:row.SubmittedAt });
    });
  });
  var data = Object.keys(grouped).map(function(kpiId) {
    var kpi = kpiMap[kpiId] || {};
    var sorted = grouped[kpiId].sort(function(a,b){ return String(a.WeekStartDate).localeCompare(String(b.WeekStartDate)); });
    return { kpiId:kpiId, kpiName:kpi.KPIName, unit:kpi.Unit, direction:kpi.PerformanceDirection, reports:sorted };
  });
  return { success: true, data: data };
}


// ── Team Leader: roster of VAs on their team (for "My Team" page) ─────────
function getMyTeamRoster(requesterId) {
  try {
    clearSheetCache();
    var teams = sheetData(SHEET_NAMES.TEAMS);
    var myTeam = teams.find(function(t){
      return String(t.TeamLeaderUserID||'')===String(requesterId)
          || String(t.TempLeader1UserID||'')===String(requesterId)
          || String(t.TempLeader2UserID||'')===String(requesterId);
    });
    if (!myTeam) return { success: true, data: { team: null, members: [] } };

    var users = sheetData(SHEET_NAMES.USERS);
    var members = users.filter(function(u) {
      return String(u.TeamID||'')===String(myTeam.TeamID)
        && String(u.Role||'')==='Virtual Assistant'
        && (u.IsActive===true||u.IsActive==='TRUE');
    });

    var conns = sheetData(SHEET_NAMES.CONNECTIONS).filter(function(c){
      return String(c.Status||'').toLowerCase()==='active';
    });

    var roster = members.map(function(u) {
      var uid = String(u.UserID||'');
      var vaConns = conns.filter(function(c){ return String(c.VAUserID||'')===uid; });
      return {
        userId:      uid,
        name:        ((u.FirstName||'')+' '+(u.LastName||'')).trim(),
        email:       u.Email||'',
        department:  u.Department||'',
        connCount:   vaConns.length,
        clientNames: vaConns.map(function(c){ return c.ClientName||''; }).filter(Boolean)
      };
    });

    return {
      success: true,
      data: {
        team: {
          teamId:     myTeam.TeamID,
          teamName:   myTeam.TeamName,
          teamNumber: myTeam.TeamNumber,
          deptId:     myTeam.DeptID
        },
        members: roster
      }
    };
  } catch(e) {
    return { success: false, message: e.message, data: { team: null, members: [] } };
  }
}

function getManagerDeptId(userId) {
  var u = sheetData(SHEET_NAMES.USERS).find(function(u){ return String(u.UserID)===String(userId); });
  return u ? String(u.Department||'') : '';
}
function getTLTeamId(userId) {
  // Team where this user is TeamLeader (primary or temp)
  var team = sheetData(SHEET_NAMES.TEAMS).find(function(t){
    return String(t.TeamLeaderUserID||'')  === String(userId) ||
           String(t.TempLeader1UserID||'') === String(userId) ||
           String(t.TempLeader2UserID||'') === String(userId);
  });
  return team ? String(team.TeamID) : '';
}

function getSystemPerformanceTrend(userId, userRole, deptId, teamId, serviceId, period, weekStartDate) {
  try {
    var useMonthly = (period === 'monthly');
    // Read connections directly and filter by dept/team/service
    var conns = sheetData(SHEET_NAMES.CONNECTIONS);
    // Enforce the caller's actual role scope first — deptId/teamId below can only
    // narrow further within it, never see beyond what their role allows.
    if (userId && userRole) {
      var allowSetTrend = _roleScopedConnIdSet(userId, userRole);
      conns = conns.filter(function(c){
        var cid = String(c.ConnectionID||'').trim();
        var suffix = cid.split('_').pop();
        return allowSetTrend[cid] || allowSetTrend[suffix];
      });
    }
    if (deptId)    conns = conns.filter(function(c){ return String(c.DeptID||'')    === String(deptId);    });
    if (teamId) {
      // Connections.TeamID is unreliable — resolve team membership via Users.TeamID
      var teamUserIds2 = {};
      sheetData(SHEET_NAMES.USERS).forEach(function(u){
        if (String(u.TeamID||'')===String(teamId)) teamUserIds2[String(u.UserID||'')] = true;
      });
      conns = conns.filter(function(c){ return teamUserIds2[String(c.VAUserID||'')]; });
    }
    if (serviceId) conns = conns.filter(function(c){ return String(c.ServiceID||'') === String(serviceId); });
    // Read Summary sheet for each period — dramatically faster than scanning detail rows
    var summarySheet = useMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
    var dateField    = useMonthly ? 'MonthStartDate' : 'WeekStartDate';
    var summaryRows  = sheetData(summarySheet);

    // Build 6 periods ending at weekStartDate (selected week), not the live system date
    var periods = [];
    var anchorDate = weekStartDate ? new Date(String(weekStartDate).slice(0,10)+'T00:00:00') : new Date();
    if (useMonthly) {
      for (var i = 5; i >= 0; i--) {
        var dm = new Date(anchorDate.getFullYear(), anchorDate.getMonth()-i, 1);
        periods.push(dm.getFullYear()+'-'+String(dm.getMonth()+1).padStart(2,'0'));
      }
    } else {
      // Snap anchor to Monday first, then step back in whole weeks
      var anchorMonday = getMondayStr(anchorDate);
      var amp = anchorMonday.split('-');
      for (var i = 5; i >= 0; i--) {
        var d = new Date(parseInt(amp[0]), parseInt(amp[1])-1, parseInt(amp[2]) - i*7);
        periods.push(localDateStr(d));
      }
    }

    // Build a map: periodKey → {connId → summaryRow}
    var cmpLen = useMonthly ? 7 : 10;
    var periodMaps = {};
    periods.forEach(function(p){ periodMaps[p] = {}; });
    summaryRows.forEach(function(r){
      var pd = String(r[dateField]||'').slice(0, cmpLen);
      if (periodMaps[pd]) periodMaps[pd][String(r.ConnectionID)] = r;
    });

    // Also build per-connection historical data for frontend re-aggregation
    var connTrendMap = {}; // {connId: [{week, status},...]}

    var result = periods.map(function(pKey) {
      var onT = 0, atR = 0, crit = 0, noD = 0, tot = 0;
      var pMap = periodMaps[pKey] || {};
      var pStart, pEnd;
      if (useMonthly) {
        var ymp=pKey.split('-'); pStart=new Date(parseInt(ymp[0]),parseInt(ymp[1])-1,1); pEnd=new Date(parseInt(ymp[0]),parseInt(ymp[1]),0);
      } else {
        var _pp=pKey.split('-');
        pStart=new Date(parseInt(_pp[0]),parseInt(_pp[1])-1,parseInt(_pp[2]));
        pEnd  =new Date(parseInt(_pp[0]),parseInt(_pp[1])-1,parseInt(_pp[2])+6);
      }
      conns.forEach(function(conn) {
        var connStart = conn.StartDate ? new Date(String(conn.StartDate).slice(0,10)+'T00:00:00') : null;
        if (!connStart || connStart > pEnd) return;
        var pEndStr = pEnd.getFullYear()+'-'+String(pEnd.getMonth()+1).padStart(2,'0')+'-'+String(pEnd.getDate()).padStart(2,'0');
        var statusThen = _statusAsOfDate(conn.StatusHistory, conn.Status, pEndStr);
        // Paused (at any point, not just currently) — excluded entirely, not
        // counted as No Data. Terminal statuses that predate this period are
        // also excluded (connection didn't exist in an active capacity yet then).
        if (statusThen === 'Paused') return;
        if (statusThen !== 'Active') {
          var inactStr = String(conn.InactiveDate||'').slice(0,10);
          if (!inactStr || new Date(inactStr+'T00:00:00') < pStart) return;
        }
        tot++;
        var cid_t = String(conn.ConnectionID).trim();
        var s = pMap[cid_t] || pMap[_normConnId(cid_t)];
        if (!s) {
          noD++;
          if (!connTrendMap[cid_t]) connTrendMap[cid_t] = [];
          connTrendMap[cid_t].push({week: pKey, status: 'No Data'});
          return;
        }
        var st_t = String(s.Status||'');
        if      (st_t === KPI_STATUS.CRITICAL) crit++;
        else if (st_t === KPI_STATUS.AT_RISK)  atR++;
        else                                    onT++;
        // Populate per-connection trend map for frontend filtering
        if (!connTrendMap[cid_t]) connTrendMap[cid_t] = [];
        connTrendMap[cid_t].push({week: pKey, status: st_t || 'No Data'});
      });
      return { week: pKey, onTarget: onT, atRisk: atR, critical: crit, noData: noD, total: tot };
    });
    return { success: true, data: result, connTrendMap: connTrendMap };
  } catch(e) { return { success: false, message: e.message }; }
}

// ── Export Weekly Interventions Report to a new Google Sheet (.xlsx-downloadable) ──
// ── VA KPI Sheet: one row per VA connection, one column-pair per KPI ───────
// Powers the spreadsheet-style "VA KPI Sheet" page: rows are role-scoped
// (Manager → own dept, Team Leader → own team incl. their own clients, Admin →
// all/dept-filtered), columns are every applicable KPI for the depts/services
// represented, grouped by Cluster.
function getVAKPISheetData(userId, userRole, deptId, teamId, weekStartDate, period) {
  try {
    var isMonthly = (period === 'monthly');
    var cmpLen    = isMonthly ? 7 : 10;
    var sheetName = isMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
    var dateField = isMonthly ? 'MonthStartDate' : 'WeekStartDate';
    var periodKey = weekStartDate ? String(weekStartDate).slice(0, cmpLen) : (
      isMonthly ? (function(){ var n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); })()
                : getMondayStr(new Date())
    );

    // 1. Role-scoped active connections (Manager→dept, TL→team incl. own clients, Admin→all)
    var conns = (getVAConnections(userId, userRole).data || []).filter(function(c){
      return String(c.Status||'').toLowerCase() === 'active';
    });
    if (deptId) conns = conns.filter(function(c){ return String(c.DeptID||'') === String(deptId); });
    if (teamId) {
      var teamUserIds = {};
      sheetData(SHEET_NAMES.USERS).forEach(function(u){
        if (String(u.TeamID||'')===String(teamId)) teamUserIds[String(u.UserID||'')] = true;
      });
      conns = conns.filter(function(c){ return teamUserIds[String(c.VAUserID||'')]; });
    }
    // Exclude connections not yet joined, or Paused as of this period (same rule
    // used everywhere else — paused time is never counted).
    var periodEnd = _periodEndDateOf(periodKey, isMonthly);
    conns = conns.filter(function(c){
      var joinP = c.StartDate ? _periodKeyOf(c.StartDate, isMonthly) : '';
      if (joinP && joinP > periodKey) return false;
      return _statusAsOfDate(c.StatusHistory, c.Status, periodEnd) !== 'Paused';
    });

    if (!conns.length) return { success: true, period: periodKey, clusters: [], rows: [] };

    // 2. Reference maps
    var userMap = {}; sheetData(SHEET_NAMES.USERS).forEach(function(u){ userMap[String(u.UserID||'')] = u; });
    var deptMap = {}; sheetData(SHEET_NAMES.DEPARTMENTS).forEach(function(d){ deptMap[String(d.DeptID||'')] = d.DeptName || d.DeptID; });

    // 3. KPI Master — union of active KPIs applicable to the depts/services
    // represented among conns. A KPI with a blank ServiceID applies to ALL
    // services in its department (same rule used everywhere else in the app,
    // e.g. getKPIConfigForConn) — do NOT require an exact DeptID+ServiceID match,
    // that silently produces zero columns whenever KPIs are defined dept-wide.
    var deptIdsInScope = {};
    var deptSvcPairs = [];
    conns.forEach(function(c){
      var d = String(c.DeptID||''), s = String(c.ServiceID||'');
      deptIdsInScope[d] = true;
      deptSvcPairs.push({dept:d, svc:s});
    });
    var kpiMaster = sheetData(SHEET_NAMES.KPI_MASTER).filter(function(k){
      if (!(k.IsActive===true || k.IsActive==='TRUE')) return false;
      var kd = String(k.DeptID||''), ks = String(k.ServiceID||'');
      if (!deptIdsInScope[kd]) return false;
      if (!ks) return true; // applies to all services in this dept
      return deptSvcPairs.some(function(p){ return p.dept===kd && (!p.svc || p.svc===ks); });
    });
    var kpiMetaById = {};
    kpiMaster.forEach(function(k){ kpiMetaById[String(k.KPIID)] = k; });
    var allKpiIds = kpiMaster.map(function(k){ return String(k.KPIID); });

    // Per-connection KPI Config overrides (applicability + custom targets)
    var kpiConfigByConn = {};
    sheetData(SHEET_NAMES.KPI_CONFIG).forEach(function(cfg){
      var cid = String(cfg.ConnectionID||'').trim();
      if (!kpiConfigByConn[cid]) kpiConfigByConn[cid] = {};
      kpiConfigByConn[cid][String(cfg.KPIID||'')] = cfg;
    });

    // Group KPIs by Cluster (alphabetical cluster order, KPIs sorted by name within)
    var clusterMap = {};
    kpiMaster.forEach(function(k){
      var cl = k.Cluster || 'General';
      if (!clusterMap[cl]) clusterMap[cl] = [];
      clusterMap[cl].push({ kpiId: String(k.KPIID), name: k.KPIName || k.KPIID, unit: k.Unit || '', direction: k.PerformanceDirection || 'higher' });
    });
    var clusters = Object.keys(clusterMap).sort().map(function(cl){
      clusterMap[cl].sort(function(a,b){ return a.name.localeCompare(b.name); });
      return { cluster: cl, kpis: clusterMap[cl] };
    });

    // Previous period (for the week/month-over-week trend arrow)
    var prevPeriodKey = isMonthly
      ? (function(){ var yp=periodKey.split('-'); var d=new Date(parseInt(yp[0]),parseInt(yp[1])-2,1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); })()
      : (function(){ var wp=periodKey.split('-'); var d=new Date(parseInt(wp[0]),parseInt(wp[1])-1,parseInt(wp[2])-7); return getMondayStr(d); })();

    // 4. Read a period's summary rows — build connId → {status, kpisByKpiId}
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheetExists(ss, sheetName);
    function _readSummary(targetPeriodKey) {
      var map = {};
      var ss2 = SpreadsheetApp.getActiveSpreadsheet();
      var sheet2 = ss2.getSheetByName(sheetName);
      if (sheet2 && sheet2.getLastRow() > 1) {
        var hdrs2    = sheet2.getRange(1,1,1,sheet2.getLastColumn()).getValues()[0];
        var cidIdx2  = hdrs2.indexOf('ConnectionID');
        var wsdIdx2  = hdrs2.indexOf(dateField);
        var statIdx2 = hdrs2.indexOf('Status');
        var kpisIdx2 = hdrs2.indexOf('KPIs');
        if (cidIdx2>=0 && wsdIdx2>=0 && kpisIdx2>=0) {
          var nr2   = sheet2.getLastRow()-1;
          var cidV2 = sheet2.getRange(2, cidIdx2+1,  nr2, 1).getValues();
          var wsdV2 = sheet2.getRange(2, wsdIdx2+1,  nr2, 1).getValues();
          var stV2  = statIdx2>=0 ? sheet2.getRange(2, statIdx2+1, nr2, 1).getValues() : null;
          var kV2   = sheet2.getRange(2, kpisIdx2+1, nr2, 1).getValues();
          for (var i2 = 0; i2 < nr2; i2++) {
            var wsd2 = _normDateStr(wsdV2[i2][0]).slice(0, cmpLen);
            if (wsd2 !== targetPeriodKey) continue;
            var rawCid2 = String(cidV2[i2][0]||'').trim();
            if (!rawCid2) continue;
            var kpisArr2 = [];
            try { kpisArr2 = JSON.parse(kV2[i2][0] || '[]'); } catch(e) {}
            var kMap2 = {};
            kpisArr2.forEach(function(e){ if (e && e.kpiId) kMap2[String(e.kpiId)] = e; });
            var entry2 = { status: stV2 ? String(stV2[i2][0]||'') : '', kpis: kMap2 };
            map[rawCid2] = entry2;
            var suffix2 = rawCid2.split('_').pop();
            if (suffix2 !== rawCid2) map[suffix2] = entry2;
          }
        }
      }
      return map;
    }
    var summaryByConn = _readSummary(periodKey);
    var prevSummaryByConn = _readSummary(prevPeriodKey);

    // 5. Build one row per connection (VA + Client)
    var rows = conns.map(function(c){
      var cid    = String(c.ConnectionID).trim();
      var suffix = cid.split('_').pop();
      var summ   = summaryByConn[cid] || summaryByConn[suffix] || null;
      var vaU    = userMap[String(c.VAUserID||'')] || {};
      var vaName = ((vaU.FirstName||'')+' '+(vaU.LastName||'')).trim() || c.VAUserID || '\u2014';
      var cfgForConn = kpiConfigByConn[cid] || kpiConfigByConn[suffix] || {};

      var connDept = String(c.DeptID||''), connSvc = String(c.ServiceID||'');
      var prevSumm = prevSummaryByConn[cid] || prevSummaryByConn[suffix] || null;
      var kpiValues = {};
      allKpiIds.forEach(function(kpiId){
        var meta = kpiMetaById[kpiId] || {};
        var kDept = String(meta.DeptID||''), kSvc = String(meta.ServiceID||'');
        // Does this KPI even apply to this connection's dept/service?
        var appliesToConn = (kDept === connDept) && (!kSvc || !connSvc || kSvc === connSvc);
        if (!appliesToConn) { kpiValues[kpiId] = { na: true }; return; }
        var cfg = cfgForConn[kpiId];
        var notApplicable = cfg && (cfg.IsApplicable===false || cfg.IsApplicable==='FALSE');
        if (notApplicable) { kpiValues[kpiId] = { na: true }; return; }
        var defaultTarget = isMonthly ? meta.MonthlyTarget : meta.WeeklyTarget;
        var cfgTarget = cfg ? (isMonthly ? cfg.MonthlyTarget : cfg.WeeklyTarget) : undefined;
        var e = summ ? summ.kpis[kpiId] : null;
        var pe = prevSumm ? prevSumm.kpis[kpiId] : null;
        var prevActual = (pe && !pe.noData && pe.actual !== undefined && pe.actual !== null && pe.actual !== '') ? pe.actual : null;
        if (e) {
          kpiValues[kpiId] = {
            actual: e.actual, target: (e.target !== undefined && e.target !== null && e.target !== '') ? e.target : (cfgTarget || defaultTarget),
            status: e.noData ? 'No Data' : (e.status || 'No Data'), noData: !!e.noData, prevActual: prevActual
          };
        } else {
          kpiValues[kpiId] = { actual: null, target: (cfgTarget || defaultTarget), status: 'No Data', noData: true, prevActual: prevActual };
        }
      });

      return {
        connId: cid, vaName: vaName, clientName: c.ClientName || '\u2014',
        overallStatus: summ ? (summ.status || 'No Data') : 'No Data',
        deptName: deptMap[String(c.DeptID||'')] || c.DeptID || '\u2014',
        kpis: kpiValues
      };
    });
    rows.sort(function(a,b){ return a.vaName.localeCompare(b.vaName) || a.clientName.localeCompare(b.clientName); });

    return { success: true, period: periodKey, clusters: clusters, rows: rows };
  } catch(e) {
    Logger.log('[getVAKPISheetData] ERROR: '+e.message+' '+e.stack);
    return { success: false, message: e.message, clusters: [], rows: [] };
  }
}

// Exports the VA KPI Sheet to a downloadable Excel-compatible Google Sheet
// (same "export" pattern used by exportWeeklyInterventionsReport — opens a
// new spreadsheet the user can download as .xlsx).
function exportVAKPISheet(userId, userRole, deptId, teamId, weekStartDate, period) {
  try {
    var res = getVAKPISheetData(userId, userRole, deptId, teamId, weekStartDate, period);
    if (!res.success) return { success: false, message: res.message };
    var clusters = res.clusters || [];
    var rows = res.rows || [];
    var periodLabel = res.period;

    var fname = 'VA KPI Sheet - ' + periodLabel;
    var exportSS = SpreadsheetApp.create(fname);
    var sheet = exportSS.getSheets()[0];
    sheet.setName('VA KPI Sheet');

    var fixedCols = ['VA Name', 'Client', 'Overall Status'];
    var totalKpiCols = clusters.reduce(function(s,c){ return s + c.kpis.length*2; }, 0);
    var totalCols = fixedCols.length + totalKpiCols;

    // A brand-new sheet only has 26 columns by default — with more than ~11
    // KPIs (very common) totalCols exceeds that and every getRange() below
    // would throw "range does not exist". Grow the sheet first.
    if (sheet.getMaxColumns() < totalCols) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), totalCols - sheet.getMaxColumns());
    }

    // Row 1: title
    sheet.getRange(1,1,1,totalCols).merge().setValue('VA KPI Sheet \u2014 ' + (period==='monthly'?'Month of ':'Week of ') + periodLabel)
      .setFontWeight('bold').setFontSize(13);

    // Row 2: cluster group headers
    var clusterRow = ['', '', ''];
    clusters.forEach(function(cl){
      clusterRow.push(cl.cluster);
      for (var i=1; i<cl.kpis.length*2; i++) clusterRow.push('');
    });
    sheet.getRange(2,1,1,totalCols).setValues([clusterRow]);
    // Merge each cluster's header cells
    var colPtr = fixedCols.length + 1;
    clusters.forEach(function(cl){
      var span = cl.kpis.length*2;
      if (span > 1) sheet.getRange(2, colPtr, 1, span).merge();
      sheet.getRange(2, colPtr, 1, span).setFontWeight('bold').setBackground('#e8eaf6').setHorizontalAlignment('center');
      colPtr += span;
    });
    sheet.getRange(2,1,1,fixedCols.length).merge();

    // Row 3: column headers (KPI name + Actual/Status sub-columns)
    var headerRow = fixedCols.slice();
    clusters.forEach(function(cl){
      cl.kpis.forEach(function(k){
        headerRow.push(k.name + ' \u2014 Actual / Target');
        headerRow.push(k.name + ' \u2014 Status');
      });
    });
    sheet.getRange(3,1,1,totalCols).setValues([headerRow]).setFontWeight('bold').setBackground('#f1f3f4');

    // Data rows
    var dataRows = rows.map(function(r){
      var out = [r.vaName, r.clientName, r.overallStatus];
      clusters.forEach(function(cl){
        cl.kpis.forEach(function(k){
          var kv = r.kpis[k.kpiId];
          if (!kv || kv.na) { out.push('N/A'); out.push('N/A'); return; }
          var actualTxt = (kv.actual===null||kv.actual===undefined||kv.actual==='') ? '\u2014' : kv.actual;
          var targetTxt = (kv.target===null||kv.target===undefined||kv.target==='') ? '\u2014' : kv.target;
          out.push(actualTxt + ' / ' + targetTxt);
          out.push(kv.status || 'No Data');
        });
      });
      return out;
    });
    if (dataRows.length) sheet.getRange(4,1,dataRows.length,totalCols).setValues(dataRows);

    sheet.setFrozenRows(3);
    sheet.setFrozenColumns(3);
    sheet.autoResizeColumns(1, totalCols);

    return { success: true, url: exportSS.getUrl(), name: fname, count: rows.length };
  } catch(e) {
    return { success: false, message: e.message };
  }
}