// ============================================================
// KPI MANAGEMENT PLATFORM - Teams.gs
// Split out of Code.gs for maintainability. Google Apps Script merges all
// .gs files into one shared global scope, so these functions call (and are
// called by) functions in Code.gs and other files exactly as before.
// ============================================================


// ─── TEAMS ────────────────────────────────────────────────────
function ensureTeamsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.TEAMS);
  var headers = ['TeamID','TeamName','TeamNumber','DeptID','TeamLeaderUserID','TempLeader1UserID','TempLeader2UserID','Description','IsActive','CreatedAt'];
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.TEAMS);
    sheet.appendRow(headers);
    sheet.getRange(1,1,1,headers.length).setBackground('#1f1f2e').setFontColor('#ff6b35').setFontWeight('bold');
  } else {
    // Migrate existing sheet — add missing columns
    migrateSheetColumns(sheet, headers);
  }
  return sheet;
}
function getNextTeamNumber(deptId) {
  var teams = sheetData(SHEET_NAMES.TEAMS).filter(function(t){
    return (t.IsActive===true||t.IsActive==='TRUE') && t.DeptID === deptId;
  });
  var nums = teams.map(function(t){
    var n = parseInt(String(t.TeamNumber||'0').replace(/\D/g,''), 10);
    return isNaN(n) ? 0 : n;
  });
  var max = nums.length ? Math.max.apply(null, nums) : 0;
  return max + 1;
}
function getTeams() {
  ensureTeamsSheet();
  const teams = sheetData(SHEET_NAMES.TEAMS).filter(t => t.IsActive === true || t.IsActive === 'TRUE');
  return { success: true, data: teams };
}
function createTeam(data, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) return { success: false, message: 'Unauthorized.' };
  var sheet = ensureTeamsSheet();
  // Auto-generate team number and name
  var num = getNextTeamNumber(data.deptId||'');
  var numStr = num < 10 ? '0' + num : String(num);
  var teamName = 'Team ' + numStr;
  // Check for name collision within dept
  var existing = sheetData(SHEET_NAMES.TEAMS).find(function(t){
    return (t.IsActive===true||t.IsActive==='TRUE') && t.DeptID === (data.deptId||'') && t.TeamNumber === num;
  });
  if (existing) return { success: false, message: 'Team ' + numStr + ' already exists in this department.' };
  var newTeamId = genId('TEAM');
  appendRowByHeaders(sheet, {
    TeamID: newTeamId, TeamName: teamName, TeamNumber: num,
    DeptID: data.deptId||'',
    TeamLeaderUserID: data.teamLeaderUserId||'',
    TempLeader1UserID: data.tempLeader1UserId||'',
    TempLeader2UserID: data.tempLeader2UserId||'',
    Description: data.description||'',
    IsActive: true, CreatedAt: new Date().toISOString()
  });
  // Auto-assign TeamID on the leader user so they appear in team member lists
  if (data.teamLeaderUserId) {
    clearSheetCache(SHEET_NAMES.USERS);
    updateRow(SHEET_NAMES.USERS, 'UserID', data.teamLeaderUserId, { TeamID: newTeamId });
    clearSheetCache(SHEET_NAMES.USERS);
  }
  return { success: true, message: 'Team ' + numStr + ' created.' };
}
function updateTeam(id, data, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) return { success: false, message: 'Unauthorized.' };
  // Find old team to check if leader changed
  clearSheetCache(SHEET_NAMES.TEAMS);
  var oldTeam = sheetData(SHEET_NAMES.TEAMS).find(function(t){ return String(t.TeamID||'')===String(id); }) || {};
  var oldLeader = String(oldTeam.TeamLeaderUserID||'');
  var newLeader = String(data.teamLeaderUserId||'');
  var result = updateRow(SHEET_NAMES.TEAMS, 'TeamID', id, {
    DeptID: data.deptId||'',
    TeamLeaderUserID: newLeader,
    TempLeader1UserID: data.tempLeader1UserId||'',
    TempLeader2UserID: data.tempLeader2UserId||'',
    Description: data.description||''
  });
  // Sync TeamID on user records when leader changes
  clearSheetCache(SHEET_NAMES.USERS);
  if (oldLeader && oldLeader !== newLeader) {
    updateRow(SHEET_NAMES.USERS, 'UserID', oldLeader, { TeamID: '' });
  }
  if (newLeader && newLeader !== oldLeader) {
    updateRow(SHEET_NAMES.USERS, 'UserID', newLeader, { TeamID: id });
  }
  clearSheetCache(SHEET_NAMES.USERS);
  return result;
}
function deleteTeam(id, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) return { success: false, message: 'Unauthorized.' };
  return updateRow(SHEET_NAMES.TEAMS, 'TeamID', id, { IsActive: false });
}
function getTeamMembers(teamId) {
  const members = sheetData(SHEET_NAMES.USERS).filter(u => String(u.TeamID||'').trim() === String(teamId).trim() && (u.IsActive===true||u.IsActive==='TRUE'));
  return { success: true, data: members.map(u => ({ UserID:u.UserID, Name:(u.FirstName||'')+' '+(u.LastName||''), Role:u.Role, Email:u.Email })) };
}
function assignUserToTeam(userId, teamId, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) return { success: false, message: 'Unauthorized.' };
  // Ensure TeamID column exists in Users sheet before writing
  var usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
  if (usersSheet) migrateSheetColumns(usersSheet, ['UserID','Email','PasswordHash','Role','Department','ServiceID','TeamID','FirstName','LastName','IsActive','MustChangePassword','CreatedAt','LastLogin','LoginCount']);
  var result = updateRow(SHEET_NAMES.USERS, 'UserID', userId, { TeamID: teamId });
  if (!result || !result.success) return { success: false, message: 'Could not update user — check that the TeamID column exists in the Users sheet.' };
  return { success: true };
}
function getUnassignedVAs(requesterId, userRole, deptId) {
  try {
    var users = sheetData(SHEET_NAMES.USERS);
    var teams = sheetData(SHEET_NAMES.TEAMS);
    var deptMap = {}; sheetData(SHEET_NAMES.DEPARTMENTS).forEach(function(d){ deptMap[d.DeptID]=d.DeptName; });
    var teamMap = {}; teams.forEach(function(t){ teamMap[t.TeamID]=t.TeamName; });
    var vas = users.filter(function(u){
      if (u.Role !== ROLES.VA) return false;
      if (!(u.IsActive===true||u.IsActive==='TRUE')) return false;
      if (u.TeamID && String(u.TeamID).trim() && String(u.TeamID)!=='undefined') return false;
      if (deptId && String(u.Department) !== String(deptId)) return false;
      // Manager scoping
      if (userRole === ROLES.MANAGER) {
        var mgr = getUserById(requesterId);
        if (mgr && mgr.Department && String(u.Department) !== String(mgr.Department)) return false;
      }
      return true;
    });
    // Get all active teams (for the assign dropdown)
    var activeTeams = teams.filter(function(t){
      if (!(t.IsActive===true||t.IsActive==='TRUE')) return false;
      if (deptId && String(t.DeptID) !== String(deptId)) return false;
      if (userRole === ROLES.MANAGER) {
        var mgr = getUserById(requesterId);
        if (mgr && mgr.Department && String(t.DeptID) !== String(mgr.Department)) return false;
      }
      return true;
    }).map(function(t){ return { TeamID:t.TeamID, TeamName:t.TeamName, DeptID:t.DeptID }; });
    return {
      success: true,
      data: vas.map(function(u){
        return { UserID:u.UserID, Name:(u.FirstName||'')+' '+(u.LastName||''), Department:deptMap[u.Department]||u.Department||'—' };
      }),
      teams: activeTeams
    };
  } catch(e) { return { success:false, message:e.message }; }
}

function addUserToTeam(userId, teamId, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) return { success: false, message: 'Unauthorized.' };
  try {
    var user = getUserById(userId);
    if (!user) return { success: false, message: 'User not found.' };
    // Check team exists and get dept
    var teams = sheetData(SHEET_NAMES.TEAMS);
    var team  = teams.find(function(t){ return String(t.TeamID)===String(teamId); });
    if (!team) return { success: false, message: 'Team not found.' };
    // Manager can only assign to teams in their department
    if (hasRole(requesterId, [ROLES.MANAGER]) && !hasRole(requesterId, [ROLES.ADMIN])) {
      var mgr = getUserById(requesterId);
      if (mgr && String(team.DeptID) !== String(mgr.Department))
        return { success: false, message: 'Cannot assign to a team outside your department.' };
    }
    return updateRow(SHEET_NAMES.USERS, 'UserID', userId, { TeamID: teamId });
  } catch(e) { return { success: false, message: e.message }; }
}

function removeUserFromTeam(userId, requesterId) {
  if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) return { success: false, message: 'Unauthorized.' };
  return updateRow(SHEET_NAMES.USERS, 'UserID', userId, { TeamID: '' });
}


// ── Auto-remove inactive users from teams ──────────────────────────────────
// Called when a user is deactivated, or run as a scheduled trigger
function autoCleanInactiveTeamMembers(requesterId) {
  try {
    clearSheetCache();
    var users = sheetData(SHEET_NAMES.USERS);
    var updated = 0;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAMES.USERS);
    var hdrs  = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    var tidCol = hdrs.indexOf('TeamID');  // 0-based
    var actCol = hdrs.indexOf('IsActive');
    if (tidCol < 0 || actCol < 0) return { success:false, message:'Column not found' };
    var vals = sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues();
    vals.forEach(function(row, i) {
      var isActive = row[actCol];
      var hasTeam  = String(row[tidCol]||'').trim();
      var inactive = (isActive===false||isActive==='FALSE'||isActive===''||String(isActive).toUpperCase()==='FALSE');
      if (inactive && hasTeam) {
        sheet.getRange(i+2, tidCol+1).setValue('');
        updated++;
      }
    });
    clearSheetCache(SHEET_NAMES.USERS);
    Logger.log('[autoCleanInactiveTeamMembers] Removed team assignment from '+updated+' inactive users');
    return { success:true, removed: updated };
  } catch(e) {
    return { success:false, message:e.message };
  }
}

// ── Transfer member to another team within same department ─────────────────
function transferTeamMember(userId, fromTeamId, toTeamId, requesterId) {
  try {
    if (!hasRole(requesterId, [ROLES.ADMIN, ROLES.MANAGER])) {
      return { success:false, message:'Unauthorized.' };
    }
    clearSheetCache();
    var teams = sheetData(SHEET_NAMES.TEAMS);
    var fromTeam = teams.find(function(t){ return String(t.TeamID)===String(fromTeamId); });
    var toTeam   = teams.find(function(t){ return String(t.TeamID)===String(toTeamId); });
    if (!fromTeam) return { success:false, message:'Source team not found.' };
    if (!toTeam)   return { success:false, message:'Target team not found.' };
    // Enforce same department
    if (String(fromTeam.DeptID) !== String(toTeam.DeptID)) {
      return { success:false, message:'Cannot transfer to a team in a different department.' };
    }
    // Remove from current team then add to target
    var r1 = updateRow(SHEET_NAMES.USERS, 'UserID', userId, { TeamID: '' });
    if (!r1 || !r1.success) return { success:false, message:'Failed to remove from team: '+(r1&&r1.message||'') };
    clearSheetCache(SHEET_NAMES.USERS);
    var r2 = updateRow(SHEET_NAMES.USERS, 'UserID', userId, { TeamID: toTeamId });
    clearSheetCache(SHEET_NAMES.USERS);
    return { success: !!(r2&&r2.success), message: r2&&r2.success ? 'Member transferred successfully.' : (r2&&r2.message||'Transfer failed.') };
  } catch(e) {
    return { success:false, message:e.message };
  }
}