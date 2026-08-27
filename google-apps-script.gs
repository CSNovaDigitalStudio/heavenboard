/**
 * Heavenly School Performance Dashboard — secure Google Sheets backend
 *
 * Setup:
 * 1) Open the Google Sheet > Extensions > Apps Script.
 * 2) Replace the old script with this file.
 * 3) Deploy > Manage deployments > Edit the EXISTING web app > New version > Deploy.
 *    Keeping the existing deployment preserves the same /exec URL already built into app.js.
 *
 * One administrator account is created automatically the first time the backend runs.
 * Change its password after the first successful login.
 */
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'Heavenly@2026';
const SESSION_TTL_SECONDS = 21600; // 6 hours

const SCHEMA = {
  People: ['id','name','cell','active','createdAt','updatedAt'],
  Education: ['id','personId','date','session','status','note','updatedAt'],
  Service: ['id','personId','date','session','status','note','updatedAt'],
  Cleaning: ['id','personId','date','session','status','note','updatedAt'],
  Finance: ['id','personId','month','status','amount','note','updatedAt'],
  Users: ['id','username','passwordHash','salt','displayName','role','cell','personId','active','createdAt','updatedAt']
};

const DEFAULT_STRUCTURE = [
  ['Cell 1', ['Ngombongangani Ngubane','Patrick Zuma','Mbali Ngema','Mfundo Mchunu']],
  ['Cell 2', ['Ernest Mbedzi','Ntobeko Mzobe','Nonkululeko Madlala']],
  ['Cell 3', ['Nkanyiso Qwabe','Enhle Ngcobo','Khwezi Khanyeza','Bongiwe Dlamini','Sharon Ngcobo']],
  ['Cell 04', ['Simamkele Mfingwana','Alungile Gqola','Phumelele Lembethe','Brian Zuma','Zintle Dwabayo']],
  ['Cell 05', ['Sicelo Malinga','Thuthukile Buthelezi','Sinegugu Ngxongxela','Sinethemba Ngcobo']],
  ['Cell 06', ['Mholi Makhanya','Arinao Nelwamondo','Kyle Hendricks','Lindiwe Jack']],
  ['Cell 7', ['Lindiwe Msimanga','Lungile Ngobese','Thandokuhle Makhathini','Nompumelelo Mkhize','Mbali Dlamini']]
];

function doGet() {
  ensureSheets_();
  return json_({ ok:true, service:'Heavenly School Performance Dashboard API', version:4 });
}

function doPost(e) {
  try {
    ensureSheets_();
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');

    if (action === 'status') return json_({ ok:true, version:4 });
    if (action === 'login') return login_(body);

    const user = requireSession_(body.sessionToken);
    switch (action) {
      case 'whoAmI': return json_({ ok:true, user:safeUser_(user) });
      case 'logout': return logout_(body.sessionToken);
      case 'getAll': return json_({ ok:true, data:getAllForUser_(user) });
      case 'saveBatch': return saveBatchForUser_(user, body);
      case 'savePeople': return savePeopleForUser_(user, body);
      case 'replaceMetric': return replaceMetricForUser_(user, body);
      case 'deleteRecord': return deleteRecordForUser_(user, body);
      case 'changePassword': return changePassword_(user, body.password);
      case 'listUsers': return listUsers_(user);
      case 'saveUser': return saveUser_(user, body);
      default: return json_({ ok:false, error:'Unknown action.' });
    }
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    const code = /^AUTH_REQUIRED/.test(message) ? 'AUTH_REQUIRED' : /^SESSION_EXPIRED/.test(message) ? 'SESSION_EXPIRED' : undefined;
    return json_({ ok:false, error:message.replace(/^(AUTH_REQUIRED|SESSION_EXPIRED):\s*/, ''), code:code });
  }
}

function login_(body) {
  const username = normalizeUsername_(body.username);
  const password = String(body.password || '');
  const user = readSheet_('Users').find(u => normalizeUsername_(u.username) === username);
  if (!user || user.active === false || String(user.active).toLowerCase() === 'false') return json_({ ok:false, error:'Incorrect username or password.' });
  if (hashPassword_(password, String(user.salt || '')) !== String(user.passwordHash || '')) return json_({ ok:false, error:'Incorrect username or password.' });
  const sessionToken = createSession_(user);
  return json_({ ok:true, sessionToken:sessionToken, user:safeUser_(user) });
}

function logout_(token) {
  if (token) CacheService.getScriptCache().remove('session_' + token);
  return json_({ ok:true });
}

function requireSession_(token) {
  if (!token) throw new Error('AUTH_REQUIRED: Please sign in.');
  const cache = CacheService.getScriptCache();
  const raw = cache.get('session_' + token);
  if (!raw) throw new Error('SESSION_EXPIRED: Your session expired. Please sign in again.');
  const session = JSON.parse(raw);
  const user = readSheet_('Users').find(u => String(u.id) === String(session.userId));
  if (!user || user.active === false || String(user.active).toLowerCase() === 'false') throw new Error('AUTH_REQUIRED: This account is disabled.');
  cache.put('session_' + token, JSON.stringify({userId:user.id}), SESSION_TTL_SECONDS);
  return user;
}

function createSession_(user) {
  const token = digestHex_(Utilities.getUuid() + '|' + Utilities.getUuid() + '|' + Date.now() + '|' + Math.random());
  CacheService.getScriptCache().put('session_' + token, JSON.stringify({userId:user.id}), SESSION_TTL_SECONDS);
  return token;
}

function safeUser_(u) {
  return { id:String(u.id||''), username:String(u.username||''), displayName:String(u.displayName||u.username||''), role:String(u.role||'worker'), cell:String(u.cell||''), personId:String(u.personId||''), active:!(u.active===false || String(u.active).toLowerCase()==='false') };
}

function getAllForUser_(user) {
  const allPeople = readSheet_('People');
  let people = allPeople;
  if (user.role === 'cell_leader') people = allPeople.filter(p => String(p.cell) === String(user.cell));
  if (user.role === 'worker') people = allPeople.filter(p => String(p.id) === String(user.personId));
  const ids = {};
  people.forEach(p => ids[String(p.id)] = true);
  return {
    people:people,
    education:readSheet_('Education').filter(r => ids[String(r.personId)]),
    service:readSheet_('Service').filter(r => ids[String(r.personId)]),
    cleaning:readSheet_('Cleaning').filter(r => ids[String(r.personId)]),
    finance:readSheet_('Finance').filter(r => ids[String(r.personId)])
  };
}

function saveBatchForUser_(user, body) {
  validateMetric_(body.metric);
  if (user.role === 'worker') return json_({ ok:false, error:'Workers have view-only access.' });
  const records = body.records || [];
  const people = readSheet_('People');
  records.forEach(r => assertPersonWriteAccess_(user, r.personId, people));
  upsertRows_(sheetName_(body.metric), records);
  return json_({ ok:true, saved:records.length });
}

function savePeopleForUser_(user, body) {
  assertAdmin_(user);
  replacePeople_(body.people || []);
  return json_({ ok:true, saved:(body.people || []).length });
}


function replaceMetricForUser_(user, body) {
  assertAdmin_(user);
  validateMetric_(body.metric);
  replaceRows_(sheetName_(body.metric), body.records || []);
  return json_({ ok:true, saved:(body.records || []).length });
}

function deleteRecordForUser_(user, body) {
  validateMetric_(body.metric);
  if (user.role === 'worker') return json_({ ok:false, error:'Workers cannot delete records.' });
  const sheet = sheetName_(body.metric);
  const record = readSheet_(sheet).find(r => String(r.id) === String(body.id));
  if (record) assertPersonWriteAccess_(user, record.personId, readSheet_('People'));
  deleteById_(sheet, body.id);
  return json_({ ok:true });
}

function assertPersonWriteAccess_(user, personId, people) {
  if (user.role === 'admin') return;
  if (user.role !== 'cell_leader') throw new Error('You do not have permission to update this record.');
  const person = people.find(p => String(p.id) === String(personId));
  if (!person || String(person.cell) !== String(user.cell)) throw new Error('You can only update workers in your assigned cell.');
}

function listUsers_(user) {
  assertAdmin_(user);
  const people = readSheet_('People');
  const peopleMap = {};
  people.forEach(p => peopleMap[String(p.id)] = p);
  const users = readSheet_('Users').map(u => {
    const safe = safeUser_(u);
    safe.personName = peopleMap[safe.personId] ? peopleMap[safe.personId].name : '';
    return safe;
  }).sort((a,b) => a.username.localeCompare(b.username));
  return json_({ ok:true, users:users });
}

function saveUser_(admin, body) {
  assertAdmin_(admin);
  const users = readSheet_('Users');
  const people = readSheet_('People');
  const id = String(body.id || '');
  const username = normalizeUsername_(body.username);
  const password = String(body.password || '');
  const role = String(body.role || 'worker');
  const cell = String(body.cell || '');
  const personId = String(body.personId || '');
  const active = body.active !== false;
  if (!['admin','cell_leader','worker'].includes(role)) return json_({ ok:false, error:'Invalid role.' });
  if (username.length < 3) return json_({ ok:false, error:'Username must be at least 3 characters.' });
  if (users.some(u => normalizeUsername_(u.username) === username && String(u.id) !== id)) return json_({ ok:false, error:'That username is already in use.' });
  if (role === 'cell_leader' && !cell) return json_({ ok:false, error:'Choose a cell for a cell leader.' });
  if (role === 'worker' && !people.some(p => String(p.id) === personId)) return json_({ ok:false, error:'Choose the worker linked to this login.' });

  const now = new Date().toISOString();
  let record = users.find(u => String(u.id) === id);
  if (!record) {
    validatePassword_(password);
    const salt = newSalt_();
    record = { id:'USR-' + Utilities.getUuid(), username:username, passwordHash:hashPassword_(password,salt), salt:salt, displayName:'', role:role, cell:role === 'cell_leader' ? cell : '', personId:role === 'worker' ? personId : '', active:active, createdAt:now, updatedAt:now };
    users.push(record);
  } else {
    record.username = username; record.role = role; record.cell = role === 'cell_leader' ? cell : ''; record.personId = role === 'worker' ? personId : ''; record.active = active; record.updatedAt = now;
    if (password) { validatePassword_(password); record.salt = newSalt_(); record.passwordHash = hashPassword_(password, record.salt); }
  }
  if (role === 'worker') {
    const person = people.find(p => String(p.id) === personId);
    record.displayName = person ? String(person.name) : username;
    record.cell = person ? String(person.cell) : '';
  } else if (role === 'cell_leader') {
    record.displayName = username;
  } else {
    record.displayName = username;
  }
  writeUsers_(users);
  return json_({ ok:true, user:safeUser_(record) });
}

function changePassword_(user, password) {
  validatePassword_(String(password || ''));
  const users = readSheet_('Users');
  const record = users.find(u => String(u.id) === String(user.id));
  if (!record) return json_({ ok:false, error:'Account not found.' });
  record.salt = newSalt_();
  record.passwordHash = hashPassword_(String(password), record.salt);
  record.updatedAt = new Date().toISOString();
  writeUsers_(users);
  return json_({ ok:true });
}

function assertAdmin_(user) { if (String(user.role) !== 'admin') throw new Error('Administrator access required.'); }
function validatePassword_(password) { if (String(password).length < 8) throw new Error('Password must be at least 8 characters.'); }
function normalizeUsername_(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g,'.'); }
function newSalt_() { return Utilities.getUuid() + '-' + Date.now(); }
function hashPassword_(password, salt) { return digestHex_(String(salt) + '|' + String(password)); }
function digestHex_(text) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join(''); }

function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = SCHEMA[name];
    const current = sh.getLastColumn() ? sh.getRange(1,1,1,Math.max(headers.length, sh.getLastColumn())).getValues()[0].slice(0, headers.length) : [];
    if (current.join('|') !== headers.join('|')) {
      sh.clear();
      sh.getRange(1,1,1,headers.length).setValues([headers]);
      sh.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#f2e9ff');
      sh.setFrozenRows(1);
    }
  });
  seedPeople_();
  seedDefaultAdmin_();
}

function seedDefaultAdmin_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sh || sh.getLastRow() > 1) return;
  const now = new Date().toISOString();
  const salt = newSalt_();
  const user = {
    id:'USR-' + Utilities.getUuid(),
    username:normalizeUsername_(DEFAULT_ADMIN_USERNAME),
    passwordHash:hashPassword_(DEFAULT_ADMIN_PASSWORD, salt),
    salt:salt,
    displayName:'Administrator',
    role:'admin',
    cell:'',
    personId:'',
    active:true,
    createdAt:now,
    updatedAt:now
  };
  writeUsers_([user]);
}

function seedPeople_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('People');
  if (sh.getLastRow() > 1) return;
  const now = new Date().toISOString();
  const rows = [];
  DEFAULT_STRUCTURE.forEach((entry, ci) => entry[1].forEach((name, pi) => rows.push([
    'C' + String(ci+1).padStart(2,'0') + '-' + String(pi+1).padStart(2,'0'), name, entry[0], true, now, now
  ])));
  sh.getRange(2,1,rows.length,SCHEMA.People.length).setValues(rows);
}

function readSheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  const headers = SCHEMA[name];
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getRange(2,1,sh.getLastRow()-1,headers.length).getValues();
  return values.filter(row => row.some(v => v !== '')).map(row => {
    const o = {};
    headers.forEach((h,i) => {
      let v = row[i];
      if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), h === 'month' ? 'yyyy-MM' : 'yyyy-MM-dd');
      o[h] = v;
    });
    return o;
  });
}

function upsertRows_(sheetName, records) {
  if (!records.length) return;
  const lock = LockService.getDocumentLock(); lock.waitLock(20000);
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    const headers = SCHEMA[sheetName];
    const existing = readSheet_(sheetName);
    const map = new Map(existing.map(r => [String(r.id), r]));
    records.forEach(r => map.set(String(r.id), r));
    const all = Array.from(map.values());
    if (sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,headers.length).clearContent();
    if (all.length) sh.getRange(2,1,all.length,headers.length).setValues(all.map(r => headers.map(h => normalizeForSheet_(r[h]))));
  } finally { lock.releaseLock(); }
}


function replaceRows_(sheetName, records) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const headers = SCHEMA[sheetName];
  if (sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,headers.length).clearContent();
  if (records.length) sh.getRange(2,1,records.length,headers.length).setValues(records.map(r => headers.map(h => normalizeForSheet_(r[h]))));
}

function replacePeople_(people) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('People');
  const headers = SCHEMA.People;
  if (sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,headers.length).clearContent();
  if (people.length) sh.getRange(2,1,people.length,headers.length).setValues(people.map(r => headers.map(h => normalizeForSheet_(r[h]))));
}

function writeUsers_(users) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  const headers = SCHEMA.Users;
  if (sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,headers.length).clearContent();
  if (users.length) sh.getRange(2,1,users.length,headers.length).setValues(users.map(r => headers.map(h => normalizeForSheet_(r[h]))));
}

function deleteById_(sheetName, id) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return;
  const ids = sh.getRange(2,1,sh.getLastRow()-1,1).getValues().flat().map(String);
  for (let i=ids.length-1;i>=0;i--) if (ids[i] === String(id)) sh.deleteRow(i+2);
}

function normalizeForSheet_(v) { return (v === undefined || v === null) ? '' : v; }
function validateMetric_(metric) { if (!['education','service','cleaning','finance'].includes(metric)) throw new Error('Invalid metric.'); }
function sheetName_(metric) { return metric.charAt(0).toUpperCase() + metric.slice(1); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
