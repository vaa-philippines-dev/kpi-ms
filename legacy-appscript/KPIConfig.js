// ============================================================
// KPI MANAGEMENT PLATFORM - KPIConfig.gs
// Split out of Code.gs for maintainability. Google Apps Script merges all
// .gs files into one shared global scope, so these functions call (and are
// called by) functions in Code.gs and other files exactly as before.
// ============================================================



// ─── KPI CONFIG ───────────────────────────────────────────────
function generateKPIConfig(connId, requesterId) {
  var conn = sheetData(SHEET_NAMES.CONNECTIONS).find(function(c){ return c.ConnectionID === connId; });
  var serviceId = conn ? conn.ServiceID : null;
  var kpis = sheetData(SHEET_NAMES.KPI_MASTER).filter(function(k){
    return (k.IsActive === true || k.IsActive === 'TRUE') &&
      (!serviceId || !k.ServiceID || k.ServiceID === serviceId);
  });
  if (!kpis.length) return { success: true, count: 0, message: 'No KPIs defined for this service.' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.KPI_CONFIG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.KPI_CONFIG);
    var cfgHdrs = ['ConfigID','ConnectionID','KPIID','WeeklyTarget','MonthlyTarget',
      'DeviationThreshold','AtRiskThreshold','IsApplicable','Notes','UpdatedBy','UpdatedAt','Version'];
    sheet.appendRow(cfgHdrs);
    sheet.getRange(1,1,1,cfgHdrs.length).setBackground('#1f1f2e').setFontColor('#ff6b35').setFontWeight('bold');
  }
  var now = new Date().toISOString();
  kpis.forEach(function(k) {
    appendRowByHeaders(sheet, {
      ConfigID: genId('CFG'), ConnectionID: connId, KPIID: k.KPIID,
      WeeklyTarget: k.WeeklyTarget, MonthlyTarget: k.MonthlyTarget,
      DeviationThreshold: k.DeviationThreshold, AtRiskThreshold: k.AtRiskThreshold,
      IsApplicable: true, Notes: '', UpdatedBy: requesterId, UpdatedAt: now, Version: 1
    });
  });
  updateRow(SHEET_NAMES.CONNECTIONS, 'ConnectionID', connId, { HasKPIConfig: true });
  return { success: true, count: kpis.length };
}

// Returns config for a connection — if none exists, returns KPI master defaults
function getKPIConfigForConn(connId) {
  const configs = sheetData(SHEET_NAMES.KPI_CONFIG).filter(c => c.ConnectionID === connId);
  const kpis    = sheetData(SHEET_NAMES.KPI_MASTER).filter(k => k.IsActive === true || k.IsActive === 'TRUE');
  const conn    = sheetData(SHEET_NAMES.CONNECTIONS).find(c => c.ConnectionID === connId);
  const hasConfig = configs.length > 0;
  if (hasConfig) {
    // Merge config with KPI master data
    return {
      success: true, hasConfig: true,
      data: configs.map(cfg => {
        const kpi = kpis.find(k => k.KPIID === cfg.KPIID) || {};
        return { ...cfg, KPIName:kpi.KPIName, Unit:kpi.Unit, Description:kpi.Description,
          PerformanceDirection:kpi.PerformanceDirection, DefaultWeeklyTarget:kpi.WeeklyTarget,
          DefaultMonthlyTarget:kpi.MonthlyTarget, DefaultDeviationThreshold:kpi.DeviationThreshold,
          DefaultAtRiskThreshold:kpi.AtRiskThreshold };
      })
    };
  }
  // No config — return KPI master defaults filtered by connection's service
  const serviceId = conn ? conn.ServiceID : null;
  const relevant = kpis.filter(k => !serviceId || !k.ServiceID || k.ServiceID === serviceId);
  return {
    success: true, hasConfig: false,
    data: relevant.map(kpi => ({
      ConfigID: null, ConnectionID: connId, KPIID: kpi.KPIID,
      KPIName: kpi.KPIName, Unit: kpi.Unit, Description: kpi.Description,
      PerformanceDirection: kpi.PerformanceDirection,
      WeeklyTarget: kpi.WeeklyTarget, MonthlyTarget: kpi.MonthlyTarget,
      DeviationThreshold: kpi.DeviationThreshold, AtRiskThreshold: kpi.AtRiskThreshold,
      IsApplicable: true, Notes: '', Version: 0,
      DefaultWeeklyTarget: kpi.WeeklyTarget, DefaultMonthlyTarget: kpi.MonthlyTarget,
      DefaultDeviationThreshold: kpi.DeviationThreshold, DefaultAtRiskThreshold: kpi.AtRiskThreshold
    }))
  };
}

// Creates KPI config entries from current KPI master defaults for a connection
function initKPIConfig(connId, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER, ROLES.TEAM_LEADER])) return { success: false, message: 'Unauthorized.' };
  const existing = sheetData(SHEET_NAMES.KPI_CONFIG).filter(c => c.ConnectionID === connId);
  if (existing.length > 0) return { success: false, message: 'Configuration already exists for this connection.' };
  try {
    generateKPIConfig(connId, requesterId);
    return { success: true, message: 'KPI configuration created from defaults.' };
  } catch(e) {
    return { success: false, message: e.message };
  }
}
function getKPIConfig(connId) {
  const configs = sheetData(SHEET_NAMES.KPI_CONFIG).filter(c => c.ConnectionID === connId);
  const kpis = sheetData(SHEET_NAMES.KPI_MASTER);
  return {
    success: true,
    data: configs.map(cfg => {
      const kpi = kpis.find(k => k.KPIID === cfg.KPIID) || {};
      return { ...cfg, KPIName:kpi.KPIName, Unit:kpi.Unit, Description:kpi.Description, PerformanceDirection:kpi.PerformanceDirection };
    })
  };
}
function deleteKPIConfig(connId, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER, ROLES.TEAM_LEADER])) return { success: false, message: 'Unauthorized.' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.KPI_CONFIG);
  if (!sheet) return { success: true };
  const vals = sheet.getDataRange().getValues();
  const headers = vals[0];
  const connIdx = headers.indexOf('ConnectionID');
  // Delete rows in reverse to preserve row numbers
  for (var i = vals.length - 1; i >= 1; i--) {
    if (vals[i][connIdx] === connId) sheet.deleteRow(i + 1);
  }
  updateRow(SHEET_NAMES.CONNECTIONS, 'ConnectionID', connId, { HasKPIConfig: false });
  return { success: true };
}
function updateKPIConfig(configId, data, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.TEAM_LEADER])) return { success: false, message: 'Unauthorized.' };
  const existing = sheetData(SHEET_NAMES.KPI_CONFIG).find(c => c.ConfigID === configId);
  if (existing) {
    const histSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.KPI_CONFIG_HISTORY);
    const now = new Date().toISOString();
    const fieldMap = { WeeklyTarget:'weeklyTarget', MonthlyTarget:'monthlyTarget', DeviationThreshold:'deviationThreshold', AtRiskThreshold:'atRiskThreshold', IsApplicable:'isApplicable' };
    Object.entries(fieldMap).forEach(([sheetField, dataField]) => {
      if (String(existing[sheetField]) !== String(data[dataField])) {
        appendRowByHeaders(histSheet, {
          HistoryID:genId('HIST'), ConfigID:configId, ConnectionID:existing.ConnectionID, KPIID:existing.KPIID,
          FieldChanged:sheetField, OldValue:existing[sheetField], NewValue:data[dataField], ChangedBy:requesterId, ChangedAt:now
        });
      }
    });
  }
  return updateRow(SHEET_NAMES.KPI_CONFIG, 'ConfigID', configId, {
    WeeklyTarget:data.weeklyTarget, MonthlyTarget:data.monthlyTarget,
    DeviationThreshold:data.deviationThreshold, AtRiskThreshold:data.atRiskThreshold,
    IsApplicable:data.isApplicable, Notes:data.notes,
    UpdatedBy:requesterId, UpdatedAt:new Date().toISOString(),
    Version:(parseInt(existing ? existing.Version : 1) + 1)
  });
}
function getKPIConfigHistory(connId, kpiId) {
  return { success: true, data: sheetData(SHEET_NAMES.KPI_CONFIG_HISTORY).filter(h => h.ConnectionID === connId && (!kpiId || h.KPIID === kpiId)) };
}