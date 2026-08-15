// ============================================================
// KPI MANAGEMENT PLATFORM - Users.gs
// Split out of Code.gs for maintainability. Google Apps Script merges all
// .gs files into one shared global scope, so these functions call (and are
// called by) functions in Code.gs and other files exactly as before.
// ============================================================



// ─── USERS ───────────────────────────────────────────────────
function getUsers(requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) return { success: false, message: 'Unauthorized.' };
  return { success: true, data: sheetData(SHEET_NAMES.USERS).map(u => ({ ...u, PasswordHash: '***' })) };
}
function createUser(data, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) return { success: false, message: 'Unauthorized.' };
  if (sheetData(SHEET_NAMES.USERS).find(u => u.Email === data.email)) return { success: false, message: 'Email already exists.' };
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
  appendRowByHeaders(sheet, {
    UserID:genId('USR'), Email:data.email, PasswordHash:hashPwd('1234'), Role:data.role,
    Department:data.department||'', ServiceID:data.serviceId||'', FirstName:data.firstName, LastName:data.lastName,
    IsActive:true, MustChangePassword:true, CreatedAt:new Date().toISOString(), LastLogin:''
  });
  return { success: true, message: 'User created. Default password: 1234' };
}
function updateUser(userId, data, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) return { success: false, message: 'Unauthorized.' };
  return updateRow(SHEET_NAMES.USERS, 'UserID', userId, { Role:data.role, Department:data.department||'', ServiceID:data.serviceId||'', FirstName:data.firstName, LastName:data.lastName, IsActive:data.isActive });
}
function toggleUserActive(userId, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) return { success: false, message: 'Unauthorized.' };
  const user = getUserById(userId);
  if (!user) return { success: false, message: 'Not found.' };
  return updateRow(SHEET_NAMES.USERS, 'UserID', userId, { IsActive: !(user.IsActive === true || user.IsActive === 'TRUE') });
}

// ── Login Activity — how many times each user has logged in, and when last ──
// Admin: sees everyone. Manager: sees only their own department. Everyone else
// (Team Leaders included) is not authorized to view this at all.
function getLoginActivity(requesterId, requesterRole, deptId) {
  if (requesterRole !== 'Administrator' && requesterRole !== 'Manager') {
    return { success: false, message: 'Unauthorized.' };
  }
  try {
    var users = sheetData(SHEET_NAMES.USERS);
    var deptMap = {}; sheetData(SHEET_NAMES.DEPARTMENTS).forEach(function(d){ deptMap[String(d.DeptID||'')] = d.DeptName || d.DeptID; });

    if (requesterRole === 'Manager') {
      var mgr = getUserById(requesterId);
      var myDept = mgr ? String(mgr.Department||'') : '';
      users = users.filter(function(u){ return String(u.Department||'') === myDept; });
    } else if (deptId) {
      users = users.filter(function(u){ return String(u.Department||'') === String(deptId); });
    }

    var rows = users.map(function(u){
      return {
        UserID: u.UserID, Name: ((u.FirstName||'')+' '+(u.LastName||'')).trim() || u.UserID,
        Email: u.Email, Role: u.Role, Department: deptMap[String(u.Department||'')] || u.Department || '\u2014',
        IsActive: (u.IsActive===true || u.IsActive==='TRUE'),
        LoginCount: parseInt(u.LoginCount,10) || 0,
        LastLogin: u.LastLogin || ''
      };
    });
    rows.sort(function(a,b){
      // Most recently active first; users who've never logged in sort to the bottom
      if (!a.LastLogin && !b.LastLogin) return a.Name.localeCompare(b.Name);
      if (!a.LastLogin) return 1;
      if (!b.LastLogin) return -1;
      return b.LastLogin.localeCompare(a.LastLogin);
    });
    return { success: true, data: rows };
  } catch(e) {
    return { success: false, message: e.message, data: [] };
  }
}

function bulkCreateUsers(rows, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) return { success: false, message: 'Unauthorized.' };
  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
  var depts  = sheetData(SHEET_NAMES.DEPARTMENTS);
  var users  = sheetData(SHEET_NAMES.USERS);
  var validRoles = ['Administrator','Manager','Team Leader','CS Specialist','Virtual Assistant'];
  var now    = new Date().toISOString();
  var results = [];
  rows.forEach(function(row, idx) {
    try {
      if (!row.email)     { results.push({ row:idx+1, success:false, message:'Email is required.' }); return; }
      if (!row.firstName) { results.push({ row:idx+1, success:false, message:'First Name is required.' }); return; }
      if (!row.lastName)  { results.push({ row:idx+1, success:false, message:'Last Name is required.' }); return; }
      if (!row.role || validRoles.indexOf(row.role) === -1) {
        results.push({ row:idx+1, success:false, message:'Role "'+row.role+'" is not valid. Must be one of: '+validRoles.join(', ')+'.' }); return;
      }
      if (users.find(function(u){ return u.Email === row.email; })) {
        results.push({ row:idx+1, success:false, message:'Email "'+row.email+'" already exists.' }); return;
      }
      var dept = row.deptName ? depts.find(function(d){ return d.DeptName.toLowerCase().trim() === row.deptName.toLowerCase().trim(); }) : null;
      var svcsSheet = sheetData(SHEET_NAMES.SERVICES);
      var svc  = row.serviceName ? svcsSheet.find(function(s){ return s.ServiceName.toLowerCase().trim() === row.serviceName.toLowerCase().trim(); }) : null;
      if (row.serviceName && !svc) { results.push({ row:idx+1, success:false, message:'Service "'+row.serviceName+'" not found.' }); return; }
      appendRowByHeaders(sheet, {
        UserID:genId('USR'), Email:row.email, PasswordHash:hashPwd('1234'),
        Role:row.role, Department:dept ? dept.DeptID : '', ServiceID:svc ? svc.ServiceID : '',
        FirstName:row.firstName, LastName:row.lastName,
        IsActive:true, MustChangePassword:true, CreatedAt:now, LastLogin:''
      });
      users.push({ Email: row.email }); // prevent duplicate within same batch
      results.push({ row:idx+1, success:true, email:row.email });
    } catch(e) {
      results.push({ row:idx+1, success:false, message:e.message });
    }
  });
  var ok = results.filter(function(r){ return r.success; }).length;
  return { success:true, results:results, imported:ok, failed:results.length - ok };
}

// ── Manager Notifications ────────────────────────────────────
function getManagerNotifications(requesterId, deptId) {
  try {
    clearSheetCache();
    var users = sheetData(SHEET_NAMES.USERS);
    var notifs = [];

    // 1. Unassigned VAs in this department
    var unassignedVAs = users.filter(function(u) {
      if (String(u.Role||'') !== 'Virtual Assistant') return false;
      if (!(u.IsActive===true||u.IsActive==='TRUE')) return false;
      if (deptId && String(u.Department||'') !== String(deptId)) return false;
      return !String(u.TeamID||'').trim();
    });
    if (unassignedVAs.length > 0) {
      notifs.push({
        type:    'unassigned_vas',
        title:   unassignedVAs.length + ' VA' + (unassignedVAs.length > 1 ? 's' : '') + ' not in a team',
        message: unassignedVAs.length + ' Virtual Assistant' + (unassignedVAs.length > 1 ? 's are' : ' is') + ' not yet assigned to a team.',
        count:   unassignedVAs.length,
        vas:     unassignedVAs.slice(0, 10).map(function(u) {
          return { userId: u.UserID, name: ((u.FirstName||'')+' '+(u.LastName||'')).trim(), email: u.Email||'' };
        })
      });
    }

    // 2. Connections with no KPI config
    var conns = sheetData(SHEET_NAMES.CONNECTIONS).filter(function(c) {
      if (String(c.Status||'').toLowerCase() !== 'active') return false;
      if (deptId && String(c.DeptID||'') !== String(deptId)) return false;
      return !(c.HasKPIConfig === true || c.HasKPIConfig === 'TRUE');
    });
    if (conns.length > 0) {
      notifs.push({
        type:    'no_kpi_config',
        title:   conns.length + ' connection' + (conns.length > 1 ? 's' : '') + ' missing KPI config',
        message: conns.length + ' active connection' + (conns.length > 1 ? 's have' : ' has') + ' no KPI configuration set.',
        count:   conns.length
      });
    }

    return { success: true, data: notifs };
  } catch(e) {
    Logger.log('[getManagerNotifications] ERROR: '+e.message);
    return { success: true, data: [] };
  }
}