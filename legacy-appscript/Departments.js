// ============================================================
// KPI MANAGEMENT PLATFORM - Departments.gs
// Split out of Code.gs for maintainability. Google Apps Script merges all
// .gs files into one shared global scope, so these functions call (and are
// called by) functions in Code.gs and other files exactly as before.
// ============================================================



// ─── DEPARTMENTS ──────────────────────────────────────────────
function getDepartments() {
  return { success: true, data: sheetData(SHEET_NAMES.DEPARTMENTS).filter(d => d.IsActive === true || d.IsActive === 'TRUE') };
}
function createDepartment(data, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN])) return { success: false, message: 'Unauthorized.' };
  const existing = sheetData(SHEET_NAMES.DEPARTMENTS).find(d => (d.IsActive === true || d.IsActive === 'TRUE') && d.DeptName.toLowerCase().trim() === data.name.toLowerCase().trim());
  if (existing) return { success: false, message: 'A department with this name already exists.' };
  appendRowByHeaders(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DEPARTMENTS), {
    DeptID:genId('DEPT'), DeptName:data.name, Description:data.description||'', IsActive:true, CreatedAt:new Date().toISOString()
  });
  return { success: true, message: 'Department created.' };
}
function updateDepartment(id, data, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN])) return { success: false, message: 'Unauthorized.' };
  return updateRow(SHEET_NAMES.DEPARTMENTS, 'DeptID', id, { DeptName: data.name, Description: data.description });
}
function deleteDepartment(id, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN])) return { success: false, message: 'Unauthorized.' };
  return updateRow(SHEET_NAMES.DEPARTMENTS, 'DeptID', id, { IsActive: false });
}

// ─── SERVICES ────────────────────────────────────────────────
function getServices(deptId) {
  const all = sheetData(SHEET_NAMES.SERVICES).filter(s => s.IsActive === true || s.IsActive === 'TRUE');
  return { success: true, data: deptId ? all.filter(s => s.DeptID === deptId) : all };
}
function createService(data, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN])) return { success: false, message: 'Unauthorized.' };
  appendRowByHeaders(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SERVICES), {
    ServiceID:genId('SVC'), DeptID:data.deptId, ServiceName:data.name, Description:data.description||'', IsActive:true, CreatedAt:new Date().toISOString()
  });
  return { success: true, message: 'Service created.' };
}
function updateService(id, data, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN])) return { success: false, message: 'Unauthorized.' };
  return updateRow(SHEET_NAMES.SERVICES, 'ServiceID', id, { ServiceName:data.name, Description:data.description, DeptID:data.deptId });
}
function deleteService(id, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN])) return { success: false, message: 'Unauthorized.' };
  return updateRow(SHEET_NAMES.SERVICES, 'ServiceID', id, { IsActive: false });
}