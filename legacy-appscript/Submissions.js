// ============================================================
// Submissions.gs — Submission Tracker Backend v3
// ============================================================

// ── Shared date parser — handles every format Sheets can produce ───────────
function _parseSummaryDate(raw, isMonthly) {
  if (!raw) return '';
  var cmpLen = isMonthly ? 7 : 10;
  var wsd;
  if (raw instanceof Date) {
    wsd = raw.getFullYear()+'-'
        + String(raw.getMonth()+1).padStart(2,'0')
        + (isMonthly ? '' : '-'+String(raw.getDate()).padStart(2,'0'));
  } else {
    var s = String(raw).trim();
    // ISO with time: "2026-04-05T16:00:00.000Z"
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      var d = new Date(s);
      if (!isNaN(d.getTime())) {
        wsd = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')
            +(isMonthly ? '' : '-'+String(d.getDate()).padStart(2,'0'));
      } else { wsd = s.slice(0,cmpLen); }
    }
    // Plain YYYY-MM-DD
    else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      wsd = s.slice(0,cmpLen);
    }
    // Locale string "Apr 06 2026" or "Apr 06 2026 ..." 
    else if (s.length > 0) {
      // Try native parsing — works for most locale formats
      var d2 = new Date(s);
      if (!isNaN(d2.getTime())) {
        wsd = d2.getFullYear()+'-'+String(d2.getMonth()+1).padStart(2,'0')
            +(isMonthly ? '' : '-'+String(d2.getDate()).padStart(2,'0'));
      } else {
        wsd = s.slice(0,cmpLen);
      }
    }
  }
  return wsd || '';
}

// ── Core loader ────────────────────────────────────────────────────────────
function getSubmissionsData(requesterId, userRole, periodKey, isMonthly) {
  try {
    var cmpLen = isMonthly ? 7 : 10;
    // Snap weekly key to Monday
    var pKey = String(periodKey||'').slice(0,cmpLen);
    if (!pKey) {
      var n = new Date();
      pKey = isMonthly
        ? n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')
        : getMondayStr(n);
    } else if (!isMonthly) {
      // Always ensure it's a Monday
      var snap = new Date(pKey+'T00:00:00');
      if (!isNaN(snap.getTime())) pKey = getMondayStr(snap);
    }
    Logger.log('[getSubmissionsData] pKey='+pKey+' isMonthly='+isMonthly);

    // 1. Scoped active connections
    var allConns = getVAConnections(requesterId, userRole).data || [];
    allConns = allConns.filter(function(c){
      return String(c.Status||'').toLowerCase() === 'active';
    });

    // A connection's "join period" is the week/month its StartDate falls in.
    // Viewing a period BEFORE a connection joined: it didn't exist yet, so drop it
    // entirely (shows up as nothing, not "Pending"). Viewing the period it joined
    // in: keep it, but flag Not Applicable and exclude it from all counts below.
    function _joinPeriodKey(startDate) {
      if (!startDate) return '';
      return isMonthly ? String(startDate).slice(0,7) : getMondayStr(String(startDate).slice(0,10));
    }
    allConns = allConns.filter(function(c){
      var joinP = _joinPeriodKey(c.StartDate);
      return !joinP || joinP <= pKey;
    });
    var naSet = {};
    allConns.forEach(function(c){
      if (_joinPeriodKey(c.StartDate) === pKey) naSet[String(c.ConnectionID).trim()] = true;
    });
    // Paused connections don't count toward this period's submission totals either —
    // use the same StatusHistory-based check the rest of the app uses.
    var periodEndForPause = _periodEndDateOf(pKey, isMonthly);
    var pausedSet = {};
    allConns.forEach(function(c){
      var cid = String(c.ConnectionID).trim();
      if (naSet[cid]) return;
      if (_statusAsOfDate(c.StatusHistory, c.Status, periodEndForPause) === 'Paused') pausedSet[cid] = true;
    });
    var countableConns = allConns.filter(function(c){
      var cid = String(c.ConnectionID).trim();
      return !naSet[cid] && !pausedSet[cid];
    });

    // 2. Reference maps
    var users = sheetData(SHEET_NAMES.USERS);
    var depts = sheetData(SHEET_NAMES.DEPARTMENTS);
    var svcs  = sheetData(SHEET_NAMES.SERVICES);
    var teams = sheetData(SHEET_NAMES.TEAMS);
    var userMap = {}; users.forEach(function(u){ userMap[u.UserID]   = u; });
    var deptMap = {}; depts.forEach(function(d){ deptMap[d.DeptID]   = d.DeptName; });
    var svcMap  = {}; svcs.forEach(function(s){  svcMap[s.ServiceID] = s.ServiceName; });
    var teamMap = {}; teams.forEach(function(t){
      teamMap[t.TeamID] = {
        name:     t.TeamName,
        number:   t.TeamNumber || '',
        deptId:   String(t.DeptID||''),
        leaderId: t.TeamLeaderUserID||''
      };
    });

    // 3. Build submittedSet — read ONLY ConnectionID and WeekStartDate columns
    //    Never read all columns (KPIs blob causes memory issues)
    var sheetName = isMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
    var dateField = isMonthly ? 'MonthStartDate' : 'WeekStartDate';
    var submittedSet = {};

    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      Logger.log('[getSubmissionsData] SHEET NOT FOUND: '+sheetName);
    } else if (sheet.getLastRow() < 2) {
      Logger.log('[getSubmissionsData] Sheet empty: '+sheetName);
    } else {
      var lastRow  = sheet.getLastRow();
      var lastCol  = sheet.getLastColumn();
      var hdrs     = sheet.getRange(1,1,1,lastCol).getValues()[0];
      var cidIdx   = hdrs.indexOf('ConnectionID');
      var wsdIdx   = hdrs.indexOf(dateField);
      Logger.log('[getSubmissionsData] cidIdx='+cidIdx+' wsdIdx='+wsdIdx+' lastRow='+lastRow);

      if (cidIdx >= 0 && wsdIdx >= 0) {
        var numRows = lastRow - 1;
        // Read ONLY the two needed columns — critical to avoid KPIs blob
        var cidCol  = sheet.getRange(2, cidIdx+1, numRows, 1).getValues();
        var wsdCol  = sheet.getRange(2, wsdIdx+1, numRows, 1).getValues();
        var matched = 0;
        for (var i = 0; i < numRows; i++) {
          var cid = String(cidCol[i][0]||'').trim();
          if (!cid) continue;
          var wsd = _parseSummaryDate(wsdCol[i][0], isMonthly);
          Logger.log('[DEBUG i='+i+'] cid='+cid+' wsd='+wsd+' pKey='+pKey);
          if (wsd.slice(0,cmpLen) === pKey.slice(0,cmpLen)) {
            submittedSet[cid] = (submittedSet[cid]||0) + 1;
            matched++;
          }
          if (i >= 5) { Logger.log('[DEBUG] stopping debug at row 5'); break; }
        }
        // Reset and do full scan without debug logging
        submittedSet = {};
        matched = 0;
        for (var j = 0; j < numRows; j++) {
          var cid2 = String(cidCol[j][0]||'').trim();
          if (!cid2) continue;
          var wsd2 = _parseSummaryDate(wsdCol[j][0], isMonthly);
          if (wsd2.slice(0,cmpLen) === pKey.slice(0,cmpLen)) {
            submittedSet[cid2] = (submittedSet[cid2]||0) + 1;
            matched++;
          }
        }
        Logger.log('[getSubmissionsData] scanned='+numRows+' matched='+matched
                   +' unique='+Object.keys(submittedSet).length
                   +' sampleIds='+JSON.stringify(Object.keys(submittedSet).slice(0,3)));
      }
    }

    Logger.log('[getSubmissionsData] activeConns='+allConns.length
               +' sampleActive='+JSON.stringify(allConns.slice(0,3).map(function(c){return c.ConnectionID;})));

    // Build dept-aware teamMap keyed by VAUserID_DeptID
    var vaTeamByDept = {};
    users.forEach(function(u) {
      var uid = String(u.UserID||'');
      var tid = String(u.TeamID||'');
      if (!uid || !tid || !teamMap[tid]) return;
      var tDeptId = String(teamMap[tid].deptId||'');
      if (tDeptId) vaTeamByDept[uid+'_'+tDeptId] = teamMap[tid];
      if (!vaTeamByDept[uid]) vaTeamByDept[uid] = teamMap[tid];
    });

    // 4. Build per-VA rows keyed by vaId+deptId (a VA in 2 depts = 2 rows)
    var vaMap = {};
    allConns.forEach(function(conn) {
      var vaId    = String(conn.VAUserID||'');
      var connDId = String(conn.DeptID||'');
      if (!vaId) return;
      var u = userMap[vaId] || {};
      var vaKey = vaId + '_' + connDId;
      if (!vaMap[vaKey]) {
        var tInf4   = vaTeamByDept[vaId+'_'+connDId] || vaTeamByDept[vaId] || {};
        var tLeader = tInf4.leaderId ? (function(){
          var lu = userMap[tInf4.leaderId]||{};
          return ((lu.FirstName||'')+' '+(lu.LastName||'')).trim() || '—';
        })() : '—';
        vaMap[vaKey] = {
          vaId:vaId, vaName:((u.FirstName||'')+' '+(u.LastName||'')).trim()||vaId,
          deptId:connDId, deptName:deptMap[connDId]||'—',
          teamId:tInf4.leaderId||'', teamName:tInf4.name||'—', teamLeader:tLeader,
          submitted:0, pending:0, total:0, conns:[]
        };
      }
      var cid      = String(conn.ConnectionID).trim();
      var subCount = submittedSet[cid] || submittedSet[_normConnId(cid)] || 0;
      var submitted = subCount > 0;
      var isNA = !!naSet[cid];
      var isPaused = !!pausedSet[cid];
      vaMap[vaKey].conns.push({
        connId:conn.ConnectionID, clientName:conn.ClientName||'—',
        secondary:conn.SecondaryName||'',
        deptId:connDId, deptName:deptMap[connDId]||'—',
        svcId:String(conn.ServiceID||''), svcName:svcMap[String(conn.ServiceID||'')]||'—',
        submitted:submitted, subCount:subCount, isNA:isNA, isPaused:isPaused
      });
      if (!isNA && !isPaused) {
        vaMap[vaKey].total++;
        if (submitted) vaMap[vaKey].submitted++; else vaMap[vaKey].pending++;
      }
    });

    // vaMap may have multiple entries per VA (one per dept) — all are distinct rows
    var vaRows = Object.values(vaMap).sort(function(a,b){
      var n = a.vaName.localeCompare(b.vaName);
      return n !== 0 ? n : a.deptName.localeCompare(b.deptName);
    });

    // 5. Dept + Team summaries
    var deptSummary = {}, teamSummary = {};
    countableConns.forEach(function(conn) {
      var cid  = String(conn.ConnectionID).trim();
      var sub  = !!(submittedSet[cid]||submittedSet[_normConnId(cid)]);
      var dId  = String(conn.DeptID||'__none__');
      if (!deptSummary[dId]) deptSummary[dId]={id:dId,name:deptMap[dId]||dId,submitted:0,total:0};
      deptSummary[dId].total++; if (sub) deptSummary[dId].submitted++;
      var uT    = userMap[String(conn.VAUserID||'')] || {};
      var dIdT  = String(conn.DeptID||'');
      // Use dept-aware team lookup
      var tInfT = vaTeamByDept[String(conn.VAUserID||'')+'_'+dIdT] || vaTeamByDept[String(conn.VAUserID||'')] || {};
      // Find the teamId for this tInf
      var tIdT  = Object.keys(teamMap).find(function(k){ return teamMap[k]===tInfT; }) || '__none__';
      var tId   = tIdT;
      var tInf  = tInfT;
      var tLdr = tInf.leaderId?(function(){var lu=userMap[tInf.leaderId]||{};return((lu.FirstName||'')+' '+(lu.LastName||'')).trim()||'—';})():'—';
      if (!teamSummary[tId]) teamSummary[tId]={id:tId,name:tInf.name||(tId==='__none__'?'No Team':tId),number:tInf.number||'',deptId:tInf.deptId||'',leader:tLdr,submitted:0,total:0};
      teamSummary[tId].total++; if (sub) teamSummary[tId].submitted++;
    });

    var totSub = countableConns.filter(function(c){
      var cid=String(c.ConnectionID).trim();
      return !!(submittedSet[cid]||submittedSet[_normConnId(cid)]);
    }).length;

    return {
      success:true, periodKey:pKey, isMonthly:isMonthly,
      totSubmitted:totSub, totPending:countableConns.length-totSub, totConns:countableConns.length,
      vasDone:vaRows.filter(function(v){return v.total>0&&v.pending===0;}).length,
      vasTotal:vaRows.length, vaRows:vaRows,
      deptSummary:Object.values(deptSummary).sort(function(a,b){return a.name.localeCompare(b.name);}),
      teamSummary:Object.values(teamSummary).sort(function(a,b){return a.name.localeCompare(b.name);})
    };
  } catch(e) {
    Logger.log('[getSubmissionsData] ERROR: '+e.message+'\n'+e.stack);
    return {success:false,message:e.message};
  }
}

// ── Available periods — reads ONLY the date column ─────────────────────────
function getAvailableSubmissionPeriods(isMonthly) {
  try {
    var sheetName = isMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
    var dateField = isMonthly ? 'MonthStartDate' : 'WeekStartDate';
    var cmpLen    = isMonthly ? 7 : 10;
    var sheet     = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    var cur = isMonthly
      ? (function(){ var n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); })()
      : getMondayStr(new Date());
    var seen = {};
    seen[cur] = true;

    if (sheet && sheet.getLastRow() > 1) {
      var hdrs   = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
      var wsdIdx = hdrs.indexOf(dateField);
      if (wsdIdx >= 0) {
        var wsdVals = sheet.getRange(2, wsdIdx+1, sheet.getLastRow()-1, 1).getValues();
        wsdVals.forEach(function(row) {
          var wsd = _parseSummaryDate(row[0], isMonthly);
          if (!wsd || wsd.length < cmpLen) return;
          if (!isMonthly) {
            // Snap to Monday — but guard against Invalid Date
            var d = new Date(wsd.slice(0,10)+'T00:00:00');
            if (isNaN(d.getTime())) return;
            var monday = getMondayStr(d);
            if (monday && /^\d{4}-\d{2}-\d{2}$/.test(monday)) seen[monday] = true;
          } else {
            if (/^\d{4}-\d{2}/.test(wsd)) seen[wsd.slice(0,7)] = true;
          }
        });
      }
    }

    var periods = Object.keys(seen)
      .filter(function(k){ return k && /^\d{4}-\d{2}/.test(k); })
      .sort().reverse();
    Logger.log('[getAvailableSubmissionPeriods] periods='+JSON.stringify(periods.slice(0,5)));
    return {success:true, data:periods};
  } catch(e) {
    Logger.log('[getAvailableSubmissionPeriods] ERROR: '+e.message);
    return {success:false, message:e.message, data:[getMondayStr(new Date())]};
  }
}

// ── Detail list for modal ──────────────────────────────────────────────────
function getSubmissionDetail(requesterId, userRole, periodKey, isMonthly, statusFilter) {
  try {
    var res = getSubmissionsData(requesterId, userRole, periodKey, isMonthly);
    if (!res.success) return res;
    var rows = [];
    res.vaRows.forEach(function(va) {
      va.conns.forEach(function(conn) {
        var include = !statusFilter || statusFilter==='all'
          || (statusFilter==='submitted'     &&  conn.submitted)
          || (statusFilter==='not_submitted' && !conn.submitted);
        if (!include) return;
        rows.push({ vaName:va.vaName, teamName:va.teamName, deptName:conn.deptName,
          svcName:conn.svcName, clientName:conn.clientName, secondary:conn.secondary,
          connId:conn.connId, submitted:conn.submitted, subCount:conn.subCount });
      });
    });
    return {success:true, data:rows, periodKey:res.periodKey};
  } catch(e) { return {success:false,message:e.message}; }
}

// ── Sheet inspector — reads only 2 columns, no KPIs blob ──────────────────
function inspectSummarySheet() {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('KPI_Weekly_Summary');
    if (!sheet) return {success:false,message:'KPI_Weekly_Summary not found'};

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var hdrs    = sheet.getRange(1,1,1,lastCol).getValues()[0];
    var cidIdx  = hdrs.indexOf('ConnectionID');
    var wsdIdx  = hdrs.indexOf('WeekStartDate');
    var statIdx = hdrs.indexOf('Status');
    var thisWeek = getMondayStr(new Date());

    if (lastRow < 2) return {success:false,message:'Sheet empty'};
    var numRows = lastRow - 1;

    // Read ONLY the needed columns — never all columns
    var cidVals  = sheet.getRange(2, cidIdx+1,  numRows, 1).getValues();
    var wsdVals  = sheet.getRange(2, wsdIdx+1,  numRows, 1).getValues();
    var statVals = statIdx>=0 ? sheet.getRange(2, statIdx+1, numRows, 1).getValues() : null;

    // First 5 rows detailed
    var sampleRows = [];
    for (var i=0; i<Math.min(5,numRows); i++) {
      var rawCid = cidVals[i][0];
      var rawWsd = wsdVals[i][0];
      var parsed = _parseSummaryDate(rawWsd, false);
      sampleRows.push({
        row:     i+2,
        cid_raw: String(rawCid||'').trim(),
        wsd_raw: rawWsd instanceof Date ? 'DATE:'+rawWsd.toISOString() : String(rawWsd||''),
        wsd_type: rawWsd instanceof Date ? 'Date' : typeof rawWsd,
        wsd_parsed: parsed,
        status:  statVals ? String(statVals[i][0]||'') : ''
      });
    }

    // Count this week
    var summaryIds = {};
    var thisWeekCount = 0;
    var uniqueWeeks = {};
    for (var j=0; j<numRows; j++) {
      var cid = String(cidVals[j][0]||'').trim();
      if (!cid) continue;
      var wsd = _parseSummaryDate(wsdVals[j][0], false);
      if (!wsd) continue;
      var monday = '';
      try {
        var dv = new Date(wsd.slice(0,10)+'T00:00:00');
        if (!isNaN(dv.getTime())) monday = getMondayStr(dv);
      } catch(e){}
      uniqueWeeks[monday||wsd] = (uniqueWeeks[monday||wsd]||0)+1;
      if ((monday||wsd) === thisWeek) {
        thisWeekCount++;
        summaryIds[cid] = true;
      }
    }

    // Active connections
    var connSheet  = ss.getSheetByName('Connections');
    var connHdrs   = connSheet.getRange(1,1,1,connSheet.getLastColumn()).getValues()[0];
    var cCidIdx    = connHdrs.indexOf('ConnectionID');
    var cStIdx     = connHdrs.indexOf('Status');
    var connVals   = connSheet.getRange(2,1,connSheet.getLastRow()-1,connSheet.getLastColumn()).getDisplayValues();
    var activeIds  = connVals
      .filter(function(r){ return String(r[cStIdx]||'').toLowerCase()==='active'; })
      .map(function(r){ return String(r[cCidIdx]||'').trim(); })
      .filter(Boolean);

    var matched = activeIds.filter(function(id){ return summaryIds[id]; });
    var allWeeks = Object.keys(uniqueWeeks).sort().reverse().slice(0,10);

    return {
      success:true, thisWeek:thisWeek,
      headers:hdrs.filter(function(h){return h!=='KPIs';}),
      sampleRows:sampleRows,
      thisWeekCount:thisWeekCount,
      activeConnCount:activeIds.length,
      activeConnSample:activeIds.slice(0,5),
      summaryConnSample:Object.keys(summaryIds).slice(0,5),
      matchedCount:matched.length,
      matchedSample:matched.slice(0,5),
      allWeeks:allWeeks, weekCounts:uniqueWeeks
    };
  } catch(e) { return {success:false,message:e.message+'\n'+e.stack}; }
}


// ── Team Submission Report: 6-week trend per team ─────────────────────────
function getTeamSubmissionReport(requesterId, userRole, deptId, period, anchorDate) {
  try {
    clearSheetCache();
    var isMonthly = (period === 'monthly');
    var cmpLen    = isMonthly ? 7 : 10;
    var sheetName = isMonthly ? SHEET_NAMES.KPI_MONTHLY_SUMMARY : SHEET_NAMES.KPI_WEEKLY_SUMMARY;
    var dateField = isMonthly ? 'MonthStartDate' : 'WeekStartDate';

    // Build 6 periods ending at anchorDate (from top nav), not necessarily today
    var periods = [];
    if (isMonthly) {
      // Anchor: YYYY-MM or YYYY-MM-DD → use its year-month
      var anchorYM = anchorDate ? String(anchorDate).slice(0,7)
                   : (function(){ var n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); })();
      var ap2 = anchorYM.split('-');
      var anchorYear = parseInt(ap2[0]), anchorMonth = parseInt(ap2[1])-1; // 0-based
      for (var mi = 5; mi >= 0; mi--) {
        var dm = new Date(anchorYear, anchorMonth - mi, 1);
        periods.push(dm.getFullYear()+'-'+String(dm.getMonth()+1).padStart(2,'0'));
      }
    } else {
      // Anchor: YYYY-MM-DD → snap to Monday of that week
      var anchorMon = anchorDate ? getMondayStr(anchorDate) : getMondayStr(new Date());
      var cp = anchorMon.split('-');
      for (var wi = 5; wi >= 0; wi--) {
        var dd = new Date(parseInt(cp[0]), parseInt(cp[1])-1, parseInt(cp[2]) - wi*7);
        periods.push(getMondayStr(dd));
      }
    }

    // Get scoped connections
    var scopedConns = (getVAConnections(requesterId, userRole).data || [])
      .filter(function(c){ return String(c.Status||'').toLowerCase()==='active'; });

    var _deptNameMap = {};
    sheetData(SHEET_NAMES.DEPARTMENTS).forEach(function(d){ _deptNameMap[String(d.DeptID||'')] = d.DeptName || d.DeptID; });

    // Department dropdown options — derived from what THIS user can actually see
    // (before the deptId narrowing filter below), so the modal's own department
    // picker can never expose departments outside their role scope.
    var deptOptSet = {};
    scopedConns.forEach(function(c){
      var did = String(c.DeptID||'');
      if (did) deptOptSet[did] = _deptNameMap[did] || did;
    });
    var deptOptions = Object.keys(deptOptSet).map(function(id){ return { deptId:id, deptName:deptOptSet[id] }; })
      .sort(function(a,b){ return a.deptName.localeCompare(b.deptName); });

    var conns = scopedConns;
    if (deptId) {
      conns = conns.filter(function(c){
        var cDeptId = String(c.DeptID||'');
        return cDeptId === String(deptId) || (_deptNameMap[cDeptId]||'') === String(deptId);
      });
    }

    // Load summary sheet: CID + date columns only
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sh    = ss.getSheetByName(sheetName);
    var submittedByPeriod = {};
    periods.forEach(function(p){ submittedByPeriod[p] = {}; });

    if (sh && sh.getLastRow() > 1) {
      var hdrs   = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
      var cidIdx = hdrs.indexOf('ConnectionID');
      var wsdIdx = hdrs.indexOf(dateField);
      var nr     = sh.getLastRow()-1;
      var cidV   = sh.getRange(2, cidIdx+1, nr, 1).getValues();
      var wsdV   = sh.getRange(2, wsdIdx+1, nr, 1).getValues();
      for (var j=0; j<nr; j++) {
        var cid3 = String(cidV[j][0]||'').trim();
        if (!cid3) continue;
        var wk3  = _normDateStr(wsdV[j][0]).slice(0, cmpLen);
        if (submittedByPeriod[wk3]) submittedByPeriod[wk3][cid3] = true;
      }
    }

    // Build per-connection submitted set index (cid→set for normConnId matching)
    var connIds = {};
    conns.forEach(function(c){
      var cid = String(c.ConnectionID).trim();
      connIds[cid] = true;
      var parts = cid.split('_');
      if (parts.length>1) connIds[parts[parts.length-1]] = true;
    });

    // Team references
    var users = sheetData(SHEET_NAMES.USERS);
    var teams = sheetData(SHEET_NAMES.TEAMS);
    var userMap = {};
    users.forEach(function(u){ userMap[String(u.UserID||'')] = u; });
    var teamInfoMap = {};
    teams.forEach(function(t){
      teamInfoMap[String(t.TeamID||'')] = {
        name:     String(t.TeamName||''),
        number:   String(t.TeamNumber||''),
        leaderId: String(t.TeamLeaderUserID||'')
      };
    });

    // Build dept-aware va→team mapping
    var vaTeam = {};
    users.forEach(function(u){
      var uid = String(u.UserID||'');
      var tid = String(u.TeamID||'');
      if (!uid || !tid) return;
      var ti = teamInfoMap[tid];
      if (!ti) return;
      if (!vaTeam[uid]) vaTeam[uid] = [];
      vaTeam[uid].push(tid);
    });

    // Aggregate per team per period
    var teamPeriodMap = {}; // {teamId: {periodKey: {submitted, total}}}

    periods.forEach(function(pKey) {
      var submittedInPeriod = submittedByPeriod[pKey] || {};
      var pKeyEnd = _periodEndDateOf(pKey, isMonthly);
      conns.forEach(function(conn) {
        // Paused as of this period — don't count it toward this week/month's total
        if (_statusAsOfDate(conn.StatusHistory, conn.Status, pKeyEnd) === 'Paused') return;
        var uid    = String(conn.VAUserID||'');
        var dId    = String(conn.DeptID||'');
        // Find team for this VA matching this connection's dept
        var tids   = vaTeam[uid] || [];
        var matchedTid = '__none__';
        tids.forEach(function(tid){
          var ti = teamInfoMap[tid];
          // Prefer team whose dept matches connection dept
          if (ti && (deptId ? true : true)) matchedTid = tid;
        });
        if (!teamPeriodMap[matchedTid]) teamPeriodMap[matchedTid] = {};
        if (!teamPeriodMap[matchedTid][pKey]) teamPeriodMap[matchedTid][pKey] = {submitted:0, total:0};
        teamPeriodMap[matchedTid][pKey].total++;
        var cid2 = String(conn.ConnectionID).trim();
        if (submittedInPeriod[cid2] || submittedInPeriod[_normConnId(cid2)]) {
          teamPeriodMap[matchedTid][pKey].submitted++;
        }
      });
    });

    // Build result rows
    var result = Object.keys(teamPeriodMap).map(function(tid) {
      var ti      = teamInfoMap[tid] || {};
      var ldrUser = userMap[ti.leaderId] || {};
      var ldrName = ((ldrUser.FirstName||'')+' '+(ldrUser.LastName||'')).trim() || 'No Leader';
      var weeks   = periods.map(function(p) {
        var pg = teamPeriodMap[tid][p] || {submitted:0, total:0};
        return { week:p, submitted:pg.submitted, total:pg.total };
      });
      var totSub = weeks.reduce(function(s,w){ return s+w.submitted; }, 0);
      var totTot = weeks.reduce(function(s,w){ return s+w.total; }, 0);
      var avgRate = totTot > 0 ? totSub/totTot : 0;
      return {
        teamId:     tid,
        teamName:   ti.name  || (tid==='__none__'?'Unassigned':'Unknown'),
        teamNumber: ti.number || '',
        teamLeader: ldrName,
        weeks:      weeks,
        submitted:  totSub,
        total:      totTot,
        avgRate:    avgRate
      };
    });

    return { success: true, data: result, deptOptions: deptOptions, activeDeptId: deptId||'' };
  } catch(e) {
    Logger.log('[getTeamSubmissionReport] ERROR: '+e.message+' '+e.stack);
    return { success: false, message: e.message, data: [] };
  }
}