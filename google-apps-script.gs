/**
 * Heavenly School Performance Dashboard — Google Sheets backend
 * Paste this file into Extensions > Apps Script in a Google Sheet.
 * Replace API_KEY with a long private key and use the same key in Settings.
 */
const API_KEY = 'CHANGE-THIS-TO-A-LONG-PRIVATE-KEY';

const SCHEMA = {
  People: ['id','name','cell','active','createdAt','updatedAt'],
  Education: ['id','personId','date','session','status','note','updatedAt'],
  Service: ['id','personId','date','session','status','note','updatedAt'],
  Cleaning: ['id','personId','date','session','status','note','updatedAt'],
  Finance: ['id','personId','month','status','amount','note','updatedAt']
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
  return json_({ ok:true, service:'Heavenly School Performance Dashboard API', version:2 });
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (!body.apiKey || body.apiKey !== API_KEY) return json_({ ok:false, error:'Invalid API key.' });
    ensureSheets_();
    switch (body.action) {
      case 'getAll': return json_({ ok:true, data:getAll_() });
      case 'saveBatch':
        validateMetric_(body.metric);
        upsertRows_(sheetName_(body.metric), body.records || []);
        return json_({ ok:true, saved:(body.records || []).length });
      case 'savePeople':
        replacePeople_(body.people || []);
        return json_({ ok:true, saved:(body.people || []).length });
      case 'deleteRecord':
        validateMetric_(body.metric);
        deleteById_(sheetName_(body.metric), body.id);
        return json_({ ok:true });
      default: return json_({ ok:false, error:'Unknown action.' });
    }
  } catch (err) {
    return json_({ ok:false, error:String(err && err.message ? err.message : err) });
  }
}

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
}

function seedPeople_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('People');
  if (sh.getLastRow() > 1) return;
  const now = new Date().toISOString();
  const rows = [];
  DEFAULT_STRUCTURE.forEach((entry, ci) => entry[1].forEach((name, pi) => rows.push([
    'C' + String(ci+1).padStart(2,'0') + '-' + String(pi+1).padStart(2,'0'),
    name, entry[0], true, now, now
  ])));
  sh.getRange(2,1,rows.length,SCHEMA.People.length).setValues(rows);
}

function getAll_() {
  return {
    people: readSheet_('People'),
    education: readSheet_('Education'),
    service: readSheet_('Service'),
    cleaning: readSheet_('Cleaning'),
    finance: readSheet_('Finance')
  };
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
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
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

function replacePeople_(people) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('People');
  const headers = SCHEMA.People;
  if (sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,headers.length).clearContent();
  if (people.length) sh.getRange(2,1,people.length,headers.length).setValues(people.map(r => headers.map(h => normalizeForSheet_(r[h]))));
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
