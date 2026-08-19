(() => {
  'use strict';

  const STORAGE_KEY = 'heavenlyParticipationDB_v1';
  const SETTINGS_KEY = 'heavenlyParticipationSettings_v1';
  const METRICS = ['education', 'cleaning', 'evangelism', 'finance'];
  const TITLES = {
    dashboard: ['OVERVIEW', 'Dashboard'], education: ['WEEKLY INPUT', 'Education'], cleaning: ['WEEKLY INPUT', 'Cleaning Meeting'],
    evangelism: ['WEEKLY INPUT', 'Evangelism'], finance: ['MONTHLY INPUT', 'Tithe & Group Fees'], people: ['ROSTER', 'Workers'], records: ['HISTORY', 'All Records'], settings: ['SYSTEM', 'Settings']
  };
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const today = () => new Date().toISOString().slice(0, 10);
  const monthNow = () => new Date().toISOString().slice(0, 7);
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const pct = (num, den) => den ? Math.round((num / den) * 100) : 0;
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

  let db = loadLocal();
  let settings = loadSettings();
  let charts = {};
  let currentView = 'dashboard';
  let visibleRecordsCache = [];

  function createPeople() {
    return Array.from({ length: 30 }, (_, i) => ({
      id: `P${String(i + 1).padStart(2, '0')}`,
      name: `Worker ${String(i + 1).padStart(2, '0')}`,
      group: `Group ${Math.floor(i / 10) + 1}`,
      active: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }));
  }

  function emptyDB() { return { people: createPeople(), education: [], cleaning: [], evangelism: [], finance: [] }; }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Array.isArray(parsed.people)) return emptyDB();
      METRICS.forEach(k => { if (!Array.isArray(parsed[k])) parsed[k] = []; });
      return parsed;
    } catch { return emptyDB(); }
  }
  function loadSettings() {
    try { return { apiUrl: '', apiKey: '', autoSync: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
    catch { return { apiUrl: '', apiKey: '', autoSync: true }; }
  }
  function saveLocal() { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
  function saveSettingsLocal() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
  function activePeople() { return db.people.filter(p => p.active !== false); }
  function personById(id) { return db.people.find(p => p.id === id) || { name: id, group: '' }; }
  function dateWithin(date, from, to) {
    if (!date) return true;
    const d = date.slice(0,10); return (!from || d >= from) && (!to || d <= to);
  }
  function recordDate(metric, r) { return metric === 'finance' ? `${r.month || ''}-01` : (r.date || r.weekDate || ''); }

  function init() {
    setDefaultDates(); bindNavigation(); bindGeneral(); bindEntryActions(); bindSettings(); updateConnectionUI();
    renderAll();
    if (settings.apiUrl && settings.apiKey) syncFromRemote(false);
  }

  function setDefaultDates() {
    ['educationDate','cleaningDate','evangelismDate'].forEach(id => { const el = $(`#${id}`); if (el) el.value = today(); });
    $('#financeMonth').value = monthNow();
    const d = new Date(); d.setDate(d.getDate() - 28); $('#filterFrom').value = d.toISOString().slice(0,10); $('#filterTo').value = today();
  }

  function bindNavigation() {
    $$('.nav-item').forEach(btn => btn.addEventListener('click', () => goTo(btn.dataset.view)));
    $$('[data-jump]').forEach(btn => btn.addEventListener('click', () => goTo(btn.dataset.jump)));
    $('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    document.addEventListener('click', e => { if (innerWidth <= 900 && !e.target.closest('.sidebar') && !e.target.closest('#menuButton')) $('#sidebar').classList.remove('open'); });
  }

  function goTo(view) {
    currentView = view;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('#pageEyebrow').textContent = TITLES[view][0]; $('#pageTitle').textContent = TITLES[view][1];
    $('#sidebar').classList.remove('open');
    if (view === 'dashboard') renderDashboard();
    if (view === 'records') renderRecords();
  }

  function bindGeneral() {
    $('#refreshButton').addEventListener('click', () => settings.apiUrl && settings.apiKey ? syncFromRemote(true) : (renderAll(), toast('Dashboard refreshed.')));
    $('#globalSearch').addEventListener('input', e => { $('#dashboardSearch').value = e.target.value; if (currentView !== 'dashboard') goTo('dashboard'); renderDashboard(); });
    ['filterFrom','filterTo','filterGroup','dashboardSearch'].forEach(id => $(`#${id}`).addEventListener('input', renderDashboard));
    $('#clearFiltersButton').addEventListener('click', () => { $('#filterFrom').value=''; $('#filterTo').value=''; $('#filterGroup').value='all'; $('#dashboardSearch').value=''; $('#globalSearch').value=''; renderDashboard(); });
    ['educationSearch','cleaningSearch','evangelismSearch','financeSearch'].forEach(id => $(`#${id}`).addEventListener('input', () => renderEntry(id.replace('Search',''))));
    ['educationDate','educationSession','cleaningDate','cleaningSession','evangelismDate','financeMonth'].forEach(id => $(`#${id}`).addEventListener('change', () => renderEntry(id.replace(/Date|Session|Month/,'').toLowerCase())));
    $('#peopleSearch').addEventListener('input', renderPeople);
    ['recordsMetric','recordsFrom','recordsTo','recordsSearch'].forEach(id => $(`#${id}`).addEventListener('input', renderRecords));
    $('#exportBackupButton').addEventListener('click', exportBackup); $('#settingsExport').addEventListener('click', exportBackup); $('#exportCsvButton').addEventListener('click', exportVisibleCSV);
  }

  function bindEntryActions() {
    $('#educationMarkAll').addEventListener('click', () => markAll('#educationBody', '.status-select', 'Present'));
    $('#cleaningMarkAll').addEventListener('click', () => markAll('#cleaningBody', '.status-select', 'Present'));
    $('#evangelismMarkAll').addEventListener('click', () => markAll('#evangelismBody', '.status-select', 'Participated'));
    $('#saveEducation').addEventListener('click', () => saveAttendanceBatch('education'));
    $('#saveCleaning').addEventListener('click', () => saveAttendanceBatch('cleaning'));
    $('#saveEvangelism').addEventListener('click', saveEvangelismBatch);
    $('#saveFinance').addEventListener('click', saveFinanceBatch);
    $('#savePeople').addEventListener('click', savePeopleRoster);
    $('#resetPeople').addEventListener('click', () => { if (confirm('Reset the roster to 30 placeholder workers? Existing participation records will remain linked to the same worker IDs.')) { db.people=createPeople(); saveLocal(); renderAll(); toast('Roster reset.', 'success'); } });
    $('#recordsBody').addEventListener('click', e => { const btn = e.target.closest('[data-delete]'); if (btn) deleteRecord(btn.dataset.metric, btn.dataset.delete); });
  }

  function markAll(bodySelector, inputSelector, value) {
    $$(bodySelector + ' ' + inputSelector).forEach(el => { el.value = value; el.dispatchEvent(new Event('change')); });
  }

  function renderAll() {
    renderGroups(); renderPeople(); ['education','cleaning','evangelism','finance'].forEach(renderEntry); renderDashboard(); renderRecords();
  }

  function renderGroups() {
    const groups = [...new Set(activePeople().map(p => p.group).filter(Boolean))].sort();
    const current = $('#filterGroup').value;
    $('#filterGroup').innerHTML = '<option value="all">All groups</option>' + groups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    if ([...$('#filterGroup').options].some(o => o.value === current)) $('#filterGroup').value = current;
  }

  function getRosterFiltered(search) {
    const q = (search || '').trim().toLowerCase();
    return activePeople().filter(p => !q || `${p.name} ${p.group}`.toLowerCase().includes(q));
  }

  function renderEntry(metric) {
    if (!METRICS.includes(metric)) return;
    if (metric === 'education' || metric === 'cleaning') renderAttendanceEntry(metric);
    if (metric === 'evangelism') renderEvangelismEntry();
    if (metric === 'finance') renderFinanceEntry();
  }

  function statusOptions(value, evangelism=false) {
    const opts = evangelism ? ['', 'Participated', 'Did not participate', 'Excused'] : ['', 'Present', 'Absent', 'Excused'];
    return opts.map(o => `<option value="${esc(o)}" ${o===value?'selected':''}>${o || 'Not recorded'}</option>`).join('');
  }

  function renderAttendanceEntry(metric) {
    const date = $(`#${metric}Date`).value, session = $(`#${metric}Session`).value, search = $(`#${metric}Search`).value;
    const rows = getRosterFiltered(search); const body = $(`#${metric}Body`);
    body.innerHTML = rows.map((p,i) => {
      const existing = db[metric].find(r => r.personId===p.id && r.date===date && r.session===session) || {};
      const cls = (existing.status || '').toLowerCase();
      return `<tr data-person-id="${p.id}"><td>${i+1}</td><td><div class="worker-cell"><div class="avatar">${initials(p.name)}</div><div><strong>${esc(p.name)}</strong><small>${esc(p.id)}</small></div></div></td><td>${esc(p.group||'—')}</td><td><select class="status-select ${cls}">${statusOptions(existing.status)}</select></td><td><input class="note-input" value="${esc(existing.note||'')}" placeholder="Optional note"></td></tr>`;
    }).join('') || emptyRow(5);
    bindStatusColors(body);
    const saved = db[metric].filter(r=>r.date===date&&r.session===session&&r.status).length;
    $(`#${metric}Summary`).innerHTML = `<span class="summary-chip"><span class="summary-dot good"></span>${saved} saved for ${esc(session)}</span><span>${rows.length} workers shown</span><span>${esc(date || 'Choose a date')}</span>`;
  }

  function renderEvangelismEntry() {
    const date=$('#evangelismDate').value, rows=getRosterFiltered($('#evangelismSearch').value);
    $('#evangelismBody').innerHTML = rows.map((p,i)=>{ const r=db.evangelism.find(x=>x.personId===p.id&&x.weekDate===date)||{}; return `<tr data-person-id="${p.id}"><td>${i+1}</td><td><div class="worker-cell"><div class="avatar">${initials(p.name)}</div><div><strong>${esc(p.name)}</strong><small>${esc(p.id)}</small></div></div></td><td>${esc(p.group||'—')}</td><td><select class="status-select ${(r.status||'').toLowerCase().replaceAll(' ','-')}">${statusOptions(r.status,true)}</select></td><td><input class="hours-input" type="number" min="0" step="0.5" value="${esc(r.hours??'')}" placeholder="0"></td><td><input class="contacts-input" type="number" min="0" step="1" value="${esc(r.contacts??'')}" placeholder="0"></td><td><input class="note-input" value="${esc(r.note||'')}" placeholder="Optional note"></td></tr>`; }).join('') || emptyRow(7);
    bindStatusColors($('#evangelismBody'));
    const saved=db.evangelism.filter(r=>r.weekDate===date&&r.status).length; $('#evangelismSummary').innerHTML=`<span class="summary-chip"><span class="summary-dot good"></span>${saved} saved for this week</span><span>${rows.length} workers shown</span><span>${esc(date||'Choose a date')}</span>`;
  }

  function renderFinanceEntry() {
    const month=$('#financeMonth').value, rows=getRosterFiltered($('#financeSearch').value);
    $('#financeBody').innerHTML = rows.map((p,i)=>{ const r=db.finance.find(x=>x.personId===p.id&&x.month===month)||{}; return `<tr data-person-id="${p.id}"><td>${i+1}</td><td><div class="worker-cell"><div class="avatar">${initials(p.name)}</div><div><strong>${esc(p.name)}</strong><small>${esc(p.id)}</small></div></div></td><td>${esc(p.group||'—')}</td><td><label class="check-label"><input class="tithe-paid" type="checkbox" ${r.tithePaid?'checked':''}> Paid</label></td><td><input class="tithe-amount" type="number" min="0" step="0.01" value="${esc(r.titheAmount??'')}" placeholder="R 0"></td><td><label class="check-label"><input class="fee-paid" type="checkbox" ${r.groupFeePaid?'checked':''}> Paid</label></td><td><input class="fee-amount" type="number" min="0" step="0.01" value="${esc(r.groupFeeAmount??'')}" placeholder="R 0"></td><td><input class="note-input" value="${esc(r.note||'')}" placeholder="Optional note"></td></tr>`; }).join('') || emptyRow(8);
    const saved=db.finance.filter(r=>r.month===month).length; $('#financeSummary').innerHTML=`<span class="summary-chip"><span class="summary-dot good"></span>${saved} workers saved for ${esc(month||'month')}</span><span>${rows.length} workers shown</span>`;
  }

  function bindStatusColors(root) {
    root.querySelectorAll('.status-select').forEach(sel => { colorStatus(sel); sel.addEventListener('change',()=>colorStatus(sel)); });
  }
  function colorStatus(sel){ sel.className='status-select '+sel.value.toLowerCase().replaceAll(' ','-'); }
  function initials(name){ return String(name||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(); }
  function emptyRow(cols){ return `<tr><td colspan="${cols}" class="empty-state">No workers match this search.</td></tr>`; }

  async function saveAttendanceBatch(metric) {
    const date=$(`#${metric}Date`).value, session=$(`#${metric}Session`).value; if(!date) return toast('Please choose a date.','error');
    const records=[];
    $$(`#${metric}Body tr[data-person-id]`).forEach(tr=>{ const status=tr.querySelector('.status-select').value; if(!status) return; const personId=tr.dataset.personId; const old=db[metric].find(r=>r.personId===personId&&r.date===date&&r.session===session); records.push({ id:old?.id||uid(metric.slice(0,3)), personId,date,session,status,note:tr.querySelector('.note-input').value.trim(),updatedAt:new Date().toISOString() }); });
    upsertMany(metric,records,r=>`${r.personId}|${r.date}|${r.session}`); await afterSave(metric,records); renderEntry(metric); renderDashboard(); renderRecords(); toast(`${cap(metric)} saved for ${records.length} workers.`,'success');
  }
  async function saveEvangelismBatch() {
    const weekDate=$('#evangelismDate').value;if(!weekDate)return toast('Please choose the week date.','error');const records=[];
    $$('#evangelismBody tr[data-person-id]').forEach(tr=>{const status=tr.querySelector('.status-select').value;if(!status)return;const personId=tr.dataset.personId;const old=db.evangelism.find(r=>r.personId===personId&&r.weekDate===weekDate);records.push({id:old?.id||uid('eva'),personId,weekDate,status,hours:numOrBlank(tr.querySelector('.hours-input').value),contacts:numOrBlank(tr.querySelector('.contacts-input').value),note:tr.querySelector('.note-input').value.trim(),updatedAt:new Date().toISOString()});});
    upsertMany('evangelism',records,r=>`${r.personId}|${r.weekDate}`);await afterSave('evangelism',records);renderEntry('evangelism');renderDashboard();renderRecords();toast(`Evangelism saved for ${records.length} workers.`,'success');
  }
  async function saveFinanceBatch() {
    const month=$('#financeMonth').value;if(!month)return toast('Please choose a month.','error');const records=[];
    $$('#financeBody tr[data-person-id]').forEach(tr=>{const personId=tr.dataset.personId;const old=db.finance.find(r=>r.personId===personId&&r.month===month);records.push({id:old?.id||uid('fin'),personId,month,tithePaid:tr.querySelector('.tithe-paid').checked,titheAmount:numOrBlank(tr.querySelector('.tithe-amount').value),groupFeePaid:tr.querySelector('.fee-paid').checked,groupFeeAmount:numOrBlank(tr.querySelector('.fee-amount').value),note:tr.querySelector('.note-input').value.trim(),updatedAt:new Date().toISOString()});});
    upsertMany('finance',records,r=>`${r.personId}|${r.month}`);await afterSave('finance',records);renderEntry('finance');renderDashboard();renderRecords();toast(`Finance saved for ${records.length} workers.`,'success');
  }
  function numOrBlank(v){ return v===''?'':Number(v); }
  function upsertMany(metric,records,keyFn){const map=new Map(db[metric].map(r=>[keyFn(r),r]));records.forEach(r=>map.set(keyFn(r),r));db[metric]=[...map.values()];saveLocal();}
  async function afterSave(metric,records){ if(settings.apiUrl&&settings.apiKey&&settings.autoSync){ try{ await remoteCall({action:'saveBatch',metric,records}); }catch(e){toast('Saved locally. Google Sheets sync failed: '+e.message,'error');} } }

  function renderPeople() {
    const q=($('#peopleSearch')?.value||'').toLowerCase(); const rows=db.people.filter(p=>!q||`${p.name} ${p.group} ${p.id}`.toLowerCase().includes(q));
    $('#peopleBody').innerHTML=rows.map((p,i)=>`<tr data-person-id="${p.id}"><td>${i+1}</td><td><input class="person-name" value="${esc(p.name)}"></td><td><input class="person-group" value="${esc(p.group||'')}" placeholder="Group"></td><td><label class="check-label"><input class="person-active" type="checkbox" ${p.active!==false?'checked':''}> Active</label></td></tr>`).join('')||emptyRow(4);
  }
  async function savePeopleRoster(){ const updates=new Map(); $$('#peopleBody tr[data-person-id]').forEach(tr=>updates.set(tr.dataset.personId,{name:tr.querySelector('.person-name').value.trim()||tr.dataset.personId,group:tr.querySelector('.person-group').value.trim(),active:tr.querySelector('.person-active').checked})); db.people=db.people.map(p=>updates.has(p.id)?{...p,...updates.get(p.id),updatedAt:new Date().toISOString()}:p);saveLocal();renderAll(); if(settings.apiUrl&&settings.apiKey&&settings.autoSync){try{await remoteCall({action:'savePeople',people:db.people});}catch(e){toast('Roster saved locally; cloud sync failed.','error');return;}} toast('Worker roster saved.','success'); }

  function dashboardFilters(){return{from:$('#filterFrom').value,to:$('#filterTo').value,group:$('#filterGroup').value,search:$('#dashboardSearch').value.trim().toLowerCase()};}
  function dashboardPeople(){const f=dashboardFilters();return activePeople().filter(p=>(f.group==='all'||p.group===f.group)&&(!f.search||`${p.name} ${p.group}`.toLowerCase().includes(f.search)));}
  function filteredRecords(metric,people=dashboardPeople()){const f=dashboardFilters(),ids=new Set(people.map(p=>p.id));return db[metric].filter(r=>ids.has(r.personId)&&dateWithin(recordDate(metric,r),f.from,f.to));}
  function positive(metric,r){if(metric==='education'||metric==='cleaning')return r.status==='Present';if(metric==='evangelism')return r.status==='Participated';return false;}
  function participationForPerson(personId,metric,from='',to=''){const rs=db[metric].filter(r=>r.personId===personId&&dateWithin(recordDate(metric,r),from,to));if(metric==='finance')return{score:0,total:0};const valid=rs.filter(r=>r.status&&r.status!=='Excused');return{score:pct(valid.filter(r=>positive(metric,r)).length,valid.length),total:valid.length};}

  function renderDashboard() {
    const people=dashboardPeople(), f=dashboardFilters(); const edu=filteredRecords('education',people), clean=filteredRecords('cleaning',people), ev=filteredRecords('evangelism',people), fin=filteredRecords('finance',people);
    const metricRate=(metric,arr)=>{const valid=arr.filter(r=>r.status&&r.status!=='Excused');return pct(valid.filter(r=>positive(metric,r)).length,valid.length)};
    const eduRate=metricRate('education',edu),cleanRate=metricRate('cleaning',clean),evRate=metricRate('evangelism',ev);
    const finRelevant=fin; const tithe=pct(finRelevant.filter(r=>r.tithePaid).length,finRelevant.length); const fee=pct(finRelevant.filter(r=>r.groupFeePaid).length,finRelevant.length);
    const combinedDen=[eduRate,cleanRate,evRate].filter((_,i)=>[edu,clean,ev][i].length).length; const overall=combinedDen?Math.round(([edu.length?eduRate:null,clean.length?cleanRate:null,ev.length?evRate:null].filter(x=>x!==null).reduce((a,b)=>a+b,0))/combinedDen):0;
    const kpis=[
      ['Overall participation',`${overall}%`,`${people.length} workers in filter`,'#a7558d','#f9e8f2'],['Education',`${eduRate}%`,`${edu.length} saved entries`,'#7b65cf','#eeeaff'],['Cleaning',`${cleanRate}%`,`${clean.length} saved entries`,'#d05f79','#ffecef'],['Evangelism',`${evRate}%`,`${ev.length} saved entries`,'#d19232','#fff4dc'],['Tithe / Fees',`${tithe}% / ${fee}%`,`${fin.length} monthly records`,'#438f7d','#e7faf4']
    ];
    $('#kpiGrid').innerHTML=kpis.map(k=>`<div class="kpi-card" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kpi-label">${k[0]}</div><div class="kpi-value">${k[1]}</div><div class="kpi-sub">${k[2]}</div></div>`).join('');
    renderFollowUp(people,f); renderCharts(people,edu,clean,ev,fin);
  }

  function renderFollowUp(people,f){
    const rows=people.map(p=>{const e=participationForPerson(p.id,'education',f.from,f.to),c=participationForPerson(p.id,'cleaning',f.from,f.to),v=participationForPerson(p.id,'evangelism',f.from,f.to);const values=[e,c,v].filter(x=>x.total>0);const overall=values.length?Math.round(values.reduce((a,b)=>a+b.score,0)/values.length):0;return{p,e:e.score,c:c.score,v:v.score,overall,total:values.reduce((a,b)=>a+b.total,0)}}).filter(x=>x.total>0).sort((a,b)=>a.overall-b.overall).slice(0,8);
    $('#followUpBody').innerHTML=rows.length?rows.map(r=>`<tr><td><div class="worker-cell"><div class="avatar">${initials(r.p.name)}</div><strong>${esc(r.p.name)}</strong></div></td><td>${esc(r.p.group||'—')}</td><td>${score(r.e)}</td><td>${score(r.c)}</td><td>${score(r.v)}</td><td>${score(r.overall)}</td></tr>`).join(''):`<tr><td colspan="6" class="empty-state">Add participation records to see follow-up insights.</td></tr>`;
  }
  function score(n){const cls=n>=80?'score-good':n>=60?'score-mid':'score-low';return`<span class="metric-score ${cls}">${n}%</span>`;}

  function renderCharts(people,edu,clean,ev,fin){ if(typeof Chart==='undefined')return;
    const weeks=lastWeeks(8); const eduSeries=['Wednesday','Saturday','Sunday'].map(session=>({label:session,data:weeks.map(w=>{const rs=edu.filter(r=>r.session===session&&r.date>=w.start&&r.date<=w.end&&r.status!=='Excused');return pct(rs.filter(r=>r.status==='Present').length,rs.length)}),tension:.35,borderWidth:2,pointRadius:3}));
    makeChart('educationTrendChart','line',{labels:weeks.map(w=>w.label),datasets:eduSeries},{scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}});
    const all=[...edu.filter(r=>r.status!=='Excused').map(r=>['Education',r.status==='Present']),...clean.filter(r=>r.status!=='Excused').map(r=>['Cleaning',r.status==='Present']),...ev.filter(r=>r.status!=='Excused').map(r=>['Evangelism',r.status==='Participated'])];
    const present=all.filter(x=>x[1]).length,missed=all.filter(x=>!x[1]).length;
    makeChart('participationMixChart','doughnut',{labels:['Participated','Missed'],datasets:[{data:[present,missed],backgroundColor:['#df79a6','#ead6e1'],borderWidth:0}]},{cutout:'70%',plugins:{legend:{position:'bottom'}}});
    const f=dashboardFilters(); const top=people.map(p=>{const e=participationForPerson(p.id,'education',f.from,f.to),c=participationForPerson(p.id,'cleaning',f.from,f.to),v=participationForPerson(p.id,'evangelism',f.from,f.to);const arr=[e,c,v].filter(x=>x.total);return{name:p.name,score:arr.length?Math.round(arr.reduce((a,b)=>a+b.score,0)/arr.length):0,total:arr.reduce((a,b)=>a+b.total,0)}}).filter(x=>x.total).sort((a,b)=>b.score-a.score).slice(0,7).reverse();
    makeChart('topWorkersChart','bar',{labels:top.map(x=>shortName(x.name)),datasets:[{label:'Participation %',data:top.map(x=>x.score),backgroundColor:'#9b7be8',borderRadius:8}]},{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}});
    const months=[...new Set(fin.map(r=>r.month))].sort().slice(-6);makeChart('financeChart','bar',{labels:months.map(monthLabel),datasets:[{label:'Tithe',data:months.map(m=>{const rs=fin.filter(r=>r.month===m);return pct(rs.filter(r=>r.tithePaid).length,rs.length)}),backgroundColor:'#65b9a0',borderRadius:7},{label:'Group fee',data:months.map(m=>{const rs=fin.filter(r=>r.month===m);return pct(rs.filter(r=>r.groupFeePaid).length,rs.length)}),backgroundColor:'#e6ad4b',borderRadius:7}]},{plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}});
  }
  function makeChart(id,type,data,options={}){if(charts[id])charts[id].destroy();const ctx=$(`#${id}`);charts[id]=new Chart(ctx,{type,data,options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{usePointStyle:true,boxWidth:8,font:{size:10}}},tooltip:{backgroundColor:'#4f3d55',padding:10,cornerRadius:10},...(options.plugins||{})},scales:type==='doughnut'?undefined:{x:{grid:{display:false},ticks:{font:{size:10},color:'#88758c'},...(options.scales?.x||{})},y:{grid:{color:'rgba(117,88,128,.08)'},ticks:{font:{size:10},color:'#88758c'},...(options.scales?.y||{})}},...options}})}
  function lastWeeks(n){const out=[];const end=new Date();for(let i=n-1;i>=0;i--){const d=new Date(end);d.setDate(d.getDate()-i*7);const day=d.getDay();const start=new Date(d);start.setDate(d.getDate()-((day+6)%7));const e=new Date(start);e.setDate(start.getDate()+6);out.push({start:start.toISOString().slice(0,10),end:e.toISOString().slice(0,10),label:`${start.getDate()} ${start.toLocaleString('en',{month:'short'})}`});}return out;}
  function shortName(n){const s=n.split(/\s+/);return s.length>2?s.slice(0,2).join(' '):n;}
  function monthLabel(m){if(!m)return'';const [y,mo]=m.split('-');return new Date(Number(y),Number(mo)-1,1).toLocaleString('en',{month:'short',year:'2-digit'});}

  function allFlatRecords(){const rows=[];db.education.forEach(r=>rows.push(flat('education',r)));db.cleaning.forEach(r=>rows.push(flat('cleaning',r)));db.evangelism.forEach(r=>rows.push(flat('evangelism',r)));db.finance.forEach(r=>rows.push(flat('finance',r)));return rows.sort((a,b)=>b.sortDate.localeCompare(a.sortDate));}
  function flat(metric,r){const p=personById(r.personId);if(metric==='finance')return{metric,id:r.id,sortDate:`${r.month}-01`,date:r.month,person:p.name,group:p.group,detail:`Tithe: ${r.tithePaid?'Paid':'Not paid'} • Fee: ${r.groupFeePaid?'Paid':'Not paid'}`,status:`${r.tithePaid?'Tithe ✓':'Tithe —'} / ${r.groupFeePaid?'Fee ✓':'Fee —'}`,note:r.note||'',raw:r};return{metric,id:r.id,sortDate:r.date||r.weekDate||'',date:r.date||r.weekDate||'',person:p.name,group:p.group,detail:r.session||`${r.hours||0}h • ${r.contacts||0} contacts`,status:r.status||'',note:r.note||'',raw:r};}
  function renderRecords(){const metric=$('#recordsMetric').value,from=$('#recordsFrom').value,to=$('#recordsTo').value,q=$('#recordsSearch').value.toLowerCase();visibleRecordsCache=allFlatRecords().filter(x=>(metric==='all'||x.metric===metric)&&dateWithin(x.sortDate,from,to)&&(!q||`${x.person} ${x.group} ${x.metric} ${x.status} ${x.detail} ${x.note}`.toLowerCase().includes(q)));$('#recordsBody').innerHTML=visibleRecordsCache.length?visibleRecordsCache.slice(0,1000).map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.person)}</td><td>${esc(x.group||'—')}</td><td><span class="pill ${x.metric==='finance'?'mint':x.metric==='evangelism'?'gold':x.metric==='cleaning'?'rose':'lavender'}">${esc(cap(x.metric))}</span></td><td>${esc(x.detail)}</td><td>${esc(x.status)}</td><td>${esc(x.note||'—')}</td><td><button class="delete-btn" data-delete="${x.id}" data-metric="${x.metric}" title="Delete">×</button></td></tr>`).join(''):`<tr><td colspan="8" class="empty-state">No records match these filters.</td></tr>`;}
  async function deleteRecord(metric,id){if(!confirm('Delete this record?'))return;db[metric]=db[metric].filter(r=>r.id!==id);saveLocal();renderAll();if(settings.apiUrl&&settings.apiKey&&settings.autoSync){try{await remoteCall({action:'deleteRecord',metric,id});}catch(e){toast('Deleted locally, but cloud delete failed.','error');return;}}toast('Record deleted.','success');}

  function bindSettings(){
    $('#apiUrl').value=settings.apiUrl;$('#apiKey').value=settings.apiKey;$('#autoSync').checked=settings.autoSync;
    $('#saveConnection').addEventListener('click',async()=>{settings.apiUrl=$('#apiUrl').value.trim();settings.apiKey=$('#apiKey').value.trim();settings.autoSync=$('#autoSync').checked;saveSettingsLocal();if(!settings.apiUrl||!settings.apiKey){updateConnectionUI();return toast('Enter both the Web App URL and API key.','error');}await syncFromRemote(true);});
    $('#disconnectButton').addEventListener('click',()=>{settings.apiUrl='';settings.apiKey='';saveSettingsLocal();$('#apiUrl').value='';$('#apiKey').value='';updateConnectionUI();$('#settingsStatus').textContent='Local browser mode enabled.';toast('Disconnected from Google Sheets.','success');});
    $('#autoSync').addEventListener('change',e=>{settings.autoSync=e.target.checked;saveSettingsLocal();});
    $('#importBackupInput').addEventListener('change',importBackup);
  }
  function updateConnectionUI(connected=!!(settings.apiUrl&&settings.apiKey)){const dot=$('#connectionDot');dot.classList.toggle('connected',connected);$('#connectionLabel').textContent=connected?'Google Sheets':'Local mode';$('#connectionDetail').textContent=connected?'Cloud connection configured':'Saved in this browser';}
  async function remoteCall(payload){const res=await fetch(settings.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,apiKey:settings.apiKey})});if(!res.ok)throw new Error(`HTTP ${res.status}`);const data=await res.json();if(!data.ok)throw new Error(data.error||'Unknown server error');return data;}
  async function syncFromRemote(showMessage=true){if(!settings.apiUrl||!settings.apiKey)return;showLoading(true,'Syncing with Google Sheets...');try{const data=await remoteCall({action:'getAll'});if(data.data){db={...emptyDB(),...data.data};saveLocal();renderAll();updateConnectionUI(true);$('#settingsStatus').textContent=`Connected. Last synced ${new Date().toLocaleString()}.`;if(showMessage)toast('Synced with Google Sheets.','success');}}catch(e){updateConnectionUI(false);$('#settingsStatus').textContent='Connection failed: '+e.message;if(showMessage)toast('Could not connect: '+e.message,'error');}finally{showLoading(false)}}

  function exportBackup(){const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),data:db},null,2)],{type:'application/json'});downloadBlob(blob,`heavenly-dashboard-backup-${today()}.json`);toast('Backup exported.','success');}
  function importBackup(e){const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(reader.result);const incoming=parsed.data||parsed;if(!incoming.people||!Array.isArray(incoming.people))throw new Error('Invalid backup');db={...emptyDB(),...incoming};saveLocal();renderAll();toast('Backup imported.','success');}catch(err){toast('Could not import this backup.','error');}};reader.readAsText(file);e.target.value='';}
  function exportVisibleCSV(){renderRecords();const headers=['Date','Worker','Group','Metric','Detail','Status','Notes'];const lines=[headers,...visibleRecordsCache.map(r=>[r.date,r.person,r.group,cap(r.metric),r.detail,r.status,r.note])].map(row=>row.map(csvCell).join(','));downloadBlob(new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'}),`participation-records-${today()}.csv`);toast('CSV exported for Excel.','success');}
  function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}
  function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),500);}
  function showLoading(show,text='Loading...'){$('#loadingText').textContent=text;$('#loadingOverlay').classList.toggle('show',show);}
  function toast(message,type=''){const el=$('#toast');el.textContent=message;el.className=`toast show ${type}`;clearTimeout(toast.t);toast.t=setTimeout(()=>el.className='toast',3200);}

  init();
})();
