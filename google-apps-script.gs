/**
 * Heavenly Participation Dashboard — Google Sheets backend
 * Paste this entire file into Extensions > Apps Script in the Google Sheet.
 * IMPORTANT: Replace API_KEY below with a long private value, then enter the
 * same value in the website's Settings screen. Do not place it in app.js.
 */
const API_KEY = 'CHANGE-THIS-TO-A-LONG-PRIVATE-KEY';

const SCHEMA = {
  People: ['id','name','group','active','createdAt','updatedAt'],
  Education: ['id','personId','date','session','status','note','updatedAt'],
  Cleaning: ['id','personId','date','session','status','note','updatedAt'],
  Evangelism: ['id','personId','weekDate','status','hours','contacts','note','updatedAt'],
  Finance: ['id','personId','month','tithePaid','titheAmount','groupFeePaid','groupFeeAmount','note','updatedAt']
};

function doGet() {
  return json_({ ok: true, service: 'Heavenly Participation Dashboard API' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (!body.apiKey || body.apiKey !== API_KEY) return json_({ ok:false, error:'Invalid API key.' });
    ensureSheets_();

    switch (body.action) {
      case 'getAll':
        return json_({ ok:true, data:getAll_() });
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
      default:
        return json_({ ok:false, error:'Unknown action.' });
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
    const current = sh.getRange(1,1,1,headers.length).getValues()[0];
    if (current.join('|') !== headers.join('|')) {
      sh.getRange(1,1,1,headers.length).setValues([headers]);
      sh.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#f8e8f1');
      sh.setFrozenRows(1);
    }
  });
  seedPeople_();
}

function seedPeople_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('People');
  if (sh.getLastRow() > 1) return;
  const now = new Date().toISOString();
  const rows = Array.from({length:30}, (_,i) => [
    'P' + String(i+1).padStart(2,'0'),
    'Worker ' + String(i+1).padStart(2,'0'),
    'Group ' + (Math.floor(i/10)+1),
    true, now, now
  ]);
  sh.getRange(2,1,rows.length,SCHEMA.People.length).setValues(rows);
}

function getAll_() {
  return {
    people: readSheet_('People'),
    education: readSheet_('Education'),
    cleaning: readSheet_('Cleaning'),
    evangelism: readSheet_('Evangelism'),
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
    if (all.length) {
      const rows = all.map(r => headers.map(h => normalizeForSheet_(r[h])));
      sh.getRange(2,1,rows.length,headers.length).setValues(rows);
    }
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

function normalizeForSheet_(v) {
  if (v === undefined || v === null) return '';
  return v;
}
function validateMetric_(metric) {
  if (!['education','cleaning','evangelism','finance'].includes(metric)) throw new Error('Invalid metric.');
}
function sheetName_(metric) { return metric.charAt(0).toUpperCase() + metric.slice(1); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
