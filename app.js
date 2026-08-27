(() => {
  'use strict';

  const STORAGE_KEY = 'heavenlySchoolPerformanceDB_v3';
  const AUTH_STORAGE_KEY = 'heavenlySchoolAuth_v3';
  const API_URL = 'https://script.google.com/macros/s/AKfycby5p_eTx-p2P_c8Ah44bYvYeWn07palDn1Nj7Cf2jUKbK_tCDeQ8x0CDTBwIlyfTLtS8w/exec';
  const METRICS = ['education', 'service', 'cleaning', 'finance'];
  const TITLES = {
    dashboard: ['OVERVIEW', 'Dashboard'], education: ['WEEKLY INPUT', 'Weekly Education'], service: ['ATTENDANCE', 'Service Attendance'],
    cleaning: ['WEEKLY INPUT', 'Cleaning Meeting'], finance: ['MONTHLY INPUT', 'Tithe & Offering'], people: ['STRUCTURE', 'Workers & Cells'],
    reports: ['ANALYSIS', 'Reports'], records: ['HISTORY', 'All Records'], settings: ['SYSTEM', 'Settings']
  };

  const DEFAULT_STRUCTURE = [
    ['Cell 1', ['Ngombongangani Ngubane', 'Patrick Zuma', 'Mbali Ngema', 'Mfundo Mchunu']],
    ['Cell 2', ['Ernest Mbedzi', 'Ntobeko Mzobe', 'Nonkululeko Madlala']],
    ['Cell 3', ['Nkanyiso Qwabe', 'Enhle Ngcobo', 'Khwezi Khanyeza', 'Bongiwe Dlamini', 'Sharon Ngcobo']],
    ['Cell 04', ['Simamkele Mfingwana', 'Alungile Gqola', 'Phumelele Lembethe', 'Brian Zuma', 'Zintle Dwabayo']],
    ['Cell 05', ['Sicelo Malinga', 'Thuthukile Buthelezi', 'Sinegugu Ngxongxela', 'Sinethemba Ngcobo']],
    ['Cell 06', ['Mholi Makhanya', 'Arinao Nelwamondo', 'Kyle Hendricks', 'Lindiwe Jack']],
    ['Cell 7', ['Lindiwe Msimanga', 'Lungile Ngobese', 'Thandokuhle Makhathini', 'Nompumelelo Mkhize', 'Mbali Dlamini']]
  ];

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const pct = (num, den) => den ? Math.round((num / den) * 100) : 0;
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today = () => localISO(new Date());
  const monthNow = () => today().slice(0,7);

  let db = loadLocal();
  let session = loadSession();
  let accessUsers = [];
  let appStarted = false;
  let charts = {};
  let currentView = 'dashboard';
  let visibleRecordsCache = [];
  let reportRowsCache = [];

  function createPeople() {
    const now = new Date().toISOString();
    const rows = [];
    DEFAULT_STRUCTURE.forEach(([cell, names], cellIndex) => names.forEach((name, personIndex) => rows.push({
      id: `C${String(cellIndex + 1).padStart(2,'0')}-${String(personIndex + 1).padStart(2,'0')}`,
      name, cell, active: true, createdAt: now, updatedAt: now
    })));
    return rows;
  }

  function emptyDB() { return { people: createPeople(), education: [], service: [], cleaning: [], finance: [] }; }

  function loadLocal() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || !Array.isArray(parsed.people)) return emptyDB();
      METRICS.forEach(k => { if (!Array.isArray(parsed[k])) parsed[k] = []; });
      return parsed;
    } catch { return emptyDB(); }
  }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null'); } catch { return null; }
  }

  function saveSession() {
    if (session) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  function saveLocal() { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
  function activePeople() { return db.people.filter(p => p.active !== false); }
  function personById(id) { return db.people.find(p => p.id === id) || { id, name: id, cell: '' }; }
  function cellNames() { return [...new Set(activePeople().map(p => p.cell).filter(Boolean))].sort(cellSort); }
  function cellSort(a,b) { return Number((a.match(/\d+/)||[999])[0]) - Number((b.match(/\d+/)||[999])[0]) || a.localeCompare(b); }
  function dateWithin(date, from, to) { if (!date) return false; const d = String(date).slice(0,10); return (!from || d >= from) && (!to || d <= to); }
  function recordDate(metric, r) { return metric === 'finance' ? `${r.month || ''}-01` : (r.date || ''); }
  function metricLabel(metric) { return ({education:'Education',service:'Service',cleaning:'Cleaning',finance:'Tithe & Offering'})[metric] || cap(metric); }
  function positive(metric, status) { return metric === 'finance' ? status === 'Submitted' : status === 'Present'; }
  function validStatus(status) { return !!status && status !== 'Excused' && status !== 'Not recorded'; }
  function initials(name) { return String(name || '').split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase(); }
  function shortName(name) { const p=String(name||'').split(/\s+/); return p.length > 2 ? p.slice(0,2).join(' ') : name; }
  function monthLabel(m) { if(!m) return ''; const [y,mo]=m.split('-'); return new Date(Number(y), Number(mo)-1, 1).toLocaleString('en-ZA',{month:'short',year:'2-digit'}); }
  function scoreClass(score) { return score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad'; }
  function emptyRow(cols, text='No workers match this filter.') { return `<tr><td colspan="${cols}" class="empty-state">${esc(text)}</td></tr>`; }

  function initApp() {
    if (!appStarted) {
      setDefaultDates();
      bindNavigation();
      bindGeneral();
      bindEntryActions();
      bindReports();
      bindSettings();
      appStarted = true;
    }
    applyRoleUI();
    renderAll();
    updateConnectionUI(true);
  }

  function setDefaultDates() {
    ['educationDate','serviceDate','cleaningDate'].forEach(id => $(`#${id}`).value = today());
    $('#financeMonth').value = monthNow();
    const d = new Date(); d.setDate(d.getDate() - 28);
    ['filterFrom','reportFrom'].forEach(id => $(`#${id}`).value = localISO(d));
    ['filterTo','reportTo'].forEach(id => $(`#${id}`).value = today());
  }

  function bindNavigation() {
    $$('.nav-item').forEach(btn => btn.addEventListener('click', () => goTo(btn.dataset.view)));
    $$('[data-jump]').forEach(btn => btn.addEventListener('click', () => goTo(btn.dataset.jump)));
    $('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    document.addEventListener('click', e => { if (innerWidth <= 1000 && !e.target.closest('.sidebar') && !e.target.closest('#menuButton')) $('#sidebar').classList.remove('open'); });
  }

  function goTo(view) {
    currentView = view;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('#pageEyebrow').textContent = TITLES[view][0];
    $('#pageTitle').textContent = TITLES[view][1];
    $('#sidebar').classList.remove('open');
    if (view === 'dashboard') renderDashboard();
    if (view === 'reports') renderReports();
    if (view === 'records') renderRecords();
    if (view === 'settings' && session?.user?.role === 'admin') loadAccessUsers();
  }

  function bindGeneral() {
    $('#refreshButton').addEventListener('click', () => syncFromRemote(true));
    $('#globalSearch').addEventListener('input', () => { if (currentView !== 'dashboard') goTo('dashboard'); else renderDashboard(); });
    ['filterFrom','filterTo','filterWorker'].forEach(id => $(`#${id}`).addEventListener('input', renderDashboard));
    $('#filterCell').addEventListener('change', () => { fillWorkerSelect('#filterWorker', $('#filterCell').value); $('#filterWorker').value='all'; renderDashboard(); });
    $('#clearFiltersButton').addEventListener('click', () => { $('#filterFrom').value=''; $('#filterTo').value=''; $('#filterCell').value='all'; fillWorkerSelect('#filterWorker','all'); $('#filterWorker').value='all'; $('#globalSearch').value=''; renderDashboard(); });

    ['education','service','cleaning','finance'].forEach(metric => {
      $(`#${metric}Search`).addEventListener('input', () => renderEntry(metric));
      $(`#${metric}Cell`).addEventListener('change', () => renderEntry(metric));
    });
    ['educationDate','educationSession','serviceDate','serviceSession','cleaningDate','cleaningSession','financeMonth'].forEach(id => {
      const metric = id.startsWith('education') ? 'education' : id.startsWith('service') ? 'service' : id.startsWith('cleaning') ? 'cleaning' : 'finance';
      $(`#${id}`).addEventListener('change', () => renderEntry(metric));
    });
    $('#peopleSearch').addEventListener('input', renderPeople);

    ['recordsMetric','recordsFrom','recordsTo','recordsCell','recordsSearch'].forEach(id => $(`#${id}`).addEventListener('input', renderRecords));
    $('#exportVisibleCsv').addEventListener('click', exportVisibleRecordsCSV);
    $('#exportRecordsExcel').addEventListener('click', exportVisibleRecordsExcel);
    $$('.chart-export').forEach(btn => btn.addEventListener('click', () => exportChartPNG(btn.dataset.chart)));
  }

  function bindEntryActions() {
    $('#educationMarkAll').addEventListener('click', () => markAll('#educationBody', 'Present'));
    $('#serviceMarkAll').addEventListener('click', () => markAll('#serviceBody', 'Present'));
    $('#cleaningMarkAll').addEventListener('click', () => markAll('#cleaningBody', 'Present'));
    $('#financeMarkAll').addEventListener('click', () => markAll('#financeBody', 'Submitted'));
    $('#saveEducation').addEventListener('click', () => saveAttendanceBatch('education'));
    $('#saveService').addEventListener('click', () => saveAttendanceBatch('service'));
    $('#saveCleaning').addEventListener('click', () => saveAttendanceBatch('cleaning'));
    $('#saveFinance').addEventListener('click', saveFinanceBatch);
    $('#savePeople').addEventListener('click', savePeopleRoster);
    $('#restoreStructure').addEventListener('click', restoreStructure);
    $('#recordsBody').addEventListener('click', e => { const btn = e.target.closest('[data-delete]'); if (btn) deleteRecord(btn.dataset.metric, btn.dataset.delete); });
  }

  function bindReports() {
    ['reportView','reportFrom','reportTo','reportWorker'].forEach(id => $(`#${id}`).addEventListener('input', renderReports));
    $('#reportCell').addEventListener('change', () => { fillWorkerSelect('#reportWorker', $('#reportCell').value); $('#reportWorker').value='all'; renderReports(); });
    $('#exportReportCsv').addEventListener('click', exportReportCSV);
    $('#exportExcelButton').addEventListener('click', () => exportExcelWorkbook(true));
    $('#exportReportChart').addEventListener('click', () => exportChartPNG('reportChart'));
  }

  function bindSettings() {
    $('#changePassword').addEventListener('click', changeOwnPassword);
    $('#settingsLogout').addEventListener('click', logout);
    $('#sidebarLogout').addEventListener('click', logout);
    $('#settingsExportJson').addEventListener('click', exportBackup);
    $('#settingsExportExcel').addEventListener('click', () => exportExcelWorkbook(false));
    $('#importBackupInput').addEventListener('change', importBackup);
    $('#importExcelInput').addEventListener('change', importExcelWorkbook);
    $('#saveAccessUser').addEventListener('click', saveAccessUser);
    $('#clearAccessUser').addEventListener('click', clearAccessForm);
    $('#accessUsersBody').addEventListener('click', e => { const btn=e.target.closest('[data-edit-user]'); if(btn) editAccessUser(btn.dataset.editUser); });
    $('#accessRole').addEventListener('change', updateAccessFormRequirements);
  }

  function renderAll() {
    renderSelects();
    renderPeople();
    METRICS.forEach(renderEntry);
    renderDashboard();
    renderReports();
    renderRecords();
    $('#heroWorkerCount').textContent = `${activePeople().length} workers`;
  }

  function renderSelects() {
    const cells = cellNames();
    const targets = ['#filterCell','#educationCell','#serviceCell','#cleaningCell','#financeCell','#reportCell','#recordsCell'];
    targets.forEach(sel => {
      const el=$(sel); const current=el.value;
      el.innerHTML = `<option value="all">${sel==='#filterCell'?'Whole school':'All cells'}</option>` + cells.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
      if ([...el.options].some(o=>o.value===current)) el.value=current;
    });
    fillWorkerSelect('#filterWorker', $('#filterCell').value || 'all');
    fillWorkerSelect('#reportWorker', $('#reportCell').value || 'all');
  }

  function fillWorkerSelect(selector, cell='all') {
    const el=$(selector); const current=el.value;
    const people=activePeople().filter(p=>cell==='all'||p.cell===cell).sort((a,b)=>a.name.localeCompare(b.name));
    el.innerHTML='<option value="all">All workers</option>'+people.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — ${esc(p.cell)}</option>`).join('');
    if ([...el.options].some(o=>o.value===current)) el.value=current;
  }

  function filteredRoster(cell, search='') {
    const q=String(search||'').trim().toLowerCase();
    return activePeople().filter(p => (cell==='all'||p.cell===cell) && (!q || `${p.name} ${p.cell}`.toLowerCase().includes(q)));
  }

  function renderEntry(metric) {
    if (metric === 'finance') return renderFinanceEntry();
    renderAttendanceEntry(metric);
  }

  function statusOptions(value, metric='attendance') {
    const opts = metric==='finance' ? ['', 'Submitted', 'Not submitted', 'Excused'] : ['', 'Present', 'Absent', 'Excused'];
    return opts.map(o=>`<option value="${esc(o)}" ${o===value?'selected':''}>${o || 'Not recorded'}</option>`).join('');
  }

  function renderAttendanceEntry(metric) {
    const date=$(`#${metric}Date`).value, session=$(`#${metric}Session`).value, cell=$(`#${metric}Cell`).value, search=$(`#${metric}Search`).value;
    const rows=filteredRoster(cell,search), body=$(`#${metric}Body`);
    body.innerHTML = rows.map((p,i)=>{
      const r=db[metric].find(x=>x.personId===p.id&&x.date===date&&x.session===session)||{};
      return `<tr data-person-id="${esc(p.id)}"><td>${i+1}</td><td><div class="worker-cell"><div class="avatar">${initials(p.name)}</div><div><strong>${esc(p.name)}</strong><small>${esc(p.id)}</small></div></div></td><td>${esc(p.cell)}</td><td><select class="status-select ${statusClass(r.status)}">${statusOptions(r.status)}</select></td><td><input class="note-input" type="text" value="${esc(r.note||'')}" placeholder="Optional note"></td></tr>`;
    }).join('') || emptyRow(5);
    bindStatusColors(body);
    const ids=new Set(rows.map(p=>p.id));
    const saved=db[metric].filter(r=>ids.has(r.personId)&&r.date===date&&r.session===session&&r.status).length;
    $(`#${metric}Summary`).innerHTML=`<span class="summary-chip"><span class="summary-dot good"></span>${saved} saved</span><span>${rows.length} workers shown</span><span>${esc(date||'Choose a date')} • ${esc(session||'')}</span>`;
  }

  function renderFinanceEntry() {
    const month=$('#financeMonth').value, cell=$('#financeCell').value, search=$('#financeSearch').value;
    const rows=filteredRoster(cell,search), body=$('#financeBody');
    body.innerHTML = rows.map((p,i)=>{
      const r=db.finance.find(x=>x.personId===p.id&&x.month===month)||{};
      return `<tr data-person-id="${esc(p.id)}"><td>${i+1}</td><td><div class="worker-cell"><div class="avatar">${initials(p.name)}</div><div><strong>${esc(p.name)}</strong><small>${esc(p.id)}</small></div></div></td><td>${esc(p.cell)}</td><td><select class="status-select ${statusClass(r.status)}">${statusOptions(r.status,'finance')}</select></td><td><input class="amount-input" type="number" min="0" step="0.01" value="${esc(r.amount??'')}" placeholder="Optional"></td><td><input class="note-input" type="text" value="${esc(r.note||'')}" placeholder="Optional note"></td></tr>`;
    }).join('') || emptyRow(6);
    bindStatusColors(body);
    const ids=new Set(rows.map(p=>p.id)); const saved=db.finance.filter(r=>ids.has(r.personId)&&r.month===month&&r.status).length;
    $('#financeSummary').innerHTML=`<span class="summary-chip"><span class="summary-dot good"></span>${saved} saved</span><span>${rows.length} workers shown</span><span>${esc(monthLabel(month)||'Choose a month')}</span>`;
  }

  function statusClass(status='') { return status.toLowerCase().replaceAll(' ','-'); }
  function bindStatusColors(body) { body.querySelectorAll('.status-select').forEach(el => el.addEventListener('change', () => { el.className=`status-select ${statusClass(el.value)}`; })); }
  function markAll(bodySelector, value) { $$(bodySelector+' .status-select').forEach(el=>{el.value=value;el.dispatchEvent(new Event('change'));}); }

  async function saveAttendanceBatch(metric) {
    const date=$(`#${metric}Date`).value, session=$(`#${metric}Session`).value;
    if(!date) return toast('Please choose a date.','error');
    const records=[];
    $$( `#${metric}Body tr[data-person-id]`).forEach(tr=>{
      const personId=tr.dataset.personId, status=tr.querySelector('.status-select').value, note=tr.querySelector('.note-input').value.trim();
      const old=db[metric].find(r=>r.personId===personId&&r.date===date&&r.session===session);
      if(!status && !old) return;
      records.push({id:old?.id||uid(metric.slice(0,3)),personId,date,session,status,note,updatedAt:new Date().toISOString()});
    });
    if(!records.length) return toast('No statuses were selected.','error');
    upsertMany(metric,records,r=>`${r.personId}|${r.date}|${r.session}`); saveLocal(); await syncSaved(metric,records); renderEntry(metric); renderDashboard(); renderReports(); renderRecords(); toast(`${metricLabel(metric)} saved for ${records.length} workers.`,'success');
  }

  async function saveFinanceBatch() {
    const month=$('#financeMonth').value; if(!month) return toast('Please choose a month.','error');
    const records=[];
    $$('#financeBody tr[data-person-id]').forEach(tr=>{
      const personId=tr.dataset.personId, status=tr.querySelector('.status-select').value, amount=numOrBlank(tr.querySelector('.amount-input').value), note=tr.querySelector('.note-input').value.trim();
      const old=db.finance.find(r=>r.personId===personId&&r.month===month);
      if(!status && amount==='' && !note && !old) return;
      records.push({id:old?.id||uid('fin'),personId,month,status,amount,note,updatedAt:new Date().toISOString()});
    });
    if(!records.length) return toast('No monthly records were entered.','error');
    upsertMany('finance',records,r=>`${r.personId}|${r.month}`); saveLocal(); await syncSaved('finance',records); renderEntry('finance'); renderDashboard(); renderReports(); renderRecords(); toast(`Tithe & Offering saved for ${records.length} workers.`,'success');
  }

  function numOrBlank(v) { return v==='' ? '' : Number(v); }
  function upsertMany(metric,records,keyFn) { const map=new Map(db[metric].map(r=>[keyFn(r),r])); records.forEach(r=>map.set(keyFn(r),r)); db[metric]=[...map.values()]; }
  async function syncSaved(metric, records) { try{await remoteCall({action:'saveBatch',metric,records});}catch(e){toast(`Cloud save failed: ${e.message}. Refresh before continuing.`,'error');} }

  function renderPeople() {
    const q=($('#peopleSearch')?.value||'').toLowerCase();
    const rows=db.people.filter(p=>!q||`${p.name} ${p.cell} ${p.id}`.toLowerCase().includes(q));
    const defaultFrom=$('#filterFrom')?.value||'', defaultTo=$('#filterTo')?.value||today();
    $('#peopleBody').innerHTML=rows.map((p,i)=>{
      const perf=personPerformance(p.id,defaultFrom,defaultTo);
      return `<tr data-person-id="${esc(p.id)}"><td>${i+1}</td><td><input class="person-name" type="text" value="${esc(p.name)}"></td><td><select class="person-cell">${cellOptions(p.cell)}</select></td><td><label class="check-label"><input class="person-active" type="checkbox" ${p.active!==false?'checked':''}> Active</label></td><td><span class="performance-chip ${scoreClass(perf.overall)}">${perf.hasData?perf.overall+'%':'—'}</span></td></tr>`;
    }).join('')||emptyRow(5,'No workers match this search.');
    renderCellSummary();
  }

  function cellOptions(current) { const known=[...new Set([...cellNames(),current].filter(Boolean))].sort(cellSort); return known.map(c=>`<option value="${esc(c)}" ${c===current?'selected':''}>${esc(c)}</option>`).join(''); }

  function renderCellSummary() {
    const from=$('#filterFrom')?.value||'', to=$('#filterTo')?.value||today();
    $('#cellSummaryGrid').innerHTML=cellNames().map(cell=>{
      const people=activePeople().filter(p=>p.cell===cell), perf=aggregatePerformance(people.map(p=>p.id),from,to);
      return `<div class="cell-card"><strong>${esc(cell)}</strong><span>${people.length} workers</span><b>${perf.hasData?perf.overall+'%':'—'}</b><span>overall performance</span></div>`;
    }).join('');
  }

  async function savePeopleRoster() {
    const updates=new Map();
    $$('#peopleBody tr[data-person-id]').forEach(tr=>updates.set(tr.dataset.personId,{name:tr.querySelector('.person-name').value.trim()||tr.dataset.personId,cell:tr.querySelector('.person-cell').value,active:tr.querySelector('.person-active').checked}));
    db.people=db.people.map(p=>updates.has(p.id)?{...p,...updates.get(p.id),updatedAt:new Date().toISOString()}:p); saveLocal(); renderAll();
    try{await remoteCall({action:'savePeople',people:db.people});}catch(e){return toast('Roster saved locally; cloud sync failed: '+e.message,'error');}
    toast('Worker structure saved.','success');
  }

  async function restoreStructure() {
    if(!confirm('Restore the supplied 7-cell worker structure? Existing records stay linked to worker IDs, so only do this if the IDs still represent these workers.')) return;
    db.people=createPeople(); saveLocal(); renderAll();
    try{ await remoteCall({action:'savePeople',people:db.people}); toast('Supplied structure restored in Google Sheets.','success'); }
    catch(e){ toast('Structure changed locally, but cloud save failed: '+e.message,'error'); }
  }

  function dashboardFilters() { return {from:$('#filterFrom').value,to:$('#filterTo').value,cell:$('#filterCell').value,worker:$('#filterWorker').value,q:$('#globalSearch').value.trim().toLowerCase()}; }
  function dashboardPeople() {
    const f=dashboardFilters();
    return activePeople().filter(p=>(f.cell==='all'||p.cell===f.cell)&&(f.worker==='all'||p.id===f.worker)&&(!f.q||`${p.name} ${p.cell}`.toLowerCase().includes(f.q)));
  }

  function filteredRecords(metric, people, from, to) { const ids=new Set(people.map(p=>p.id)); return db[metric].filter(r=>ids.has(r.personId)&&dateWithin(recordDate(metric,r),from,to)); }
  function metricPerformanceFromRecords(metric, records) { const valid=records.filter(r=>validStatus(r.status)); return {score:pct(valid.filter(r=>positive(metric,r.status)).length,valid.length),total:valid.length,positive:valid.filter(r=>positive(metric,r.status)).length}; }
  function metricPerformance(personId,metric,from='',to='') { return metricPerformanceFromRecords(metric,db[metric].filter(r=>r.personId===personId&&dateWithin(recordDate(metric,r),from,to))); }

  function aggregatePerformance(personIds,from='',to='') {
    const ids=new Set(personIds), metrics={};
    METRICS.forEach(metric=>metrics[metric]=metricPerformanceFromRecords(metric,db[metric].filter(r=>ids.has(r.personId)&&dateWithin(recordDate(metric,r),from,to))));
    const scored=METRICS.map(m=>metrics[m]).filter(x=>x.total>0); const overall=scored.length?Math.round(scored.reduce((s,x)=>s+x.score,0)/scored.length):0;
    return {...metrics,overall,hasData:scored.length>0,totalRecords:scored.reduce((s,x)=>s+x.total,0)};
  }

  function personPerformance(id,from='',to='') { return aggregatePerformance([id],from,to); }

  function renderDashboard() {
    if(!$('#filterCell')) return;
    const f=dashboardFilters(), people=dashboardPeople(), perf=aggregatePerformance(people.map(p=>p.id),f.from,f.to);
    const scopePerson=f.worker!=='all'?personById(f.worker):null;
    const scope = scopePerson ? `${scopePerson.name} • ${scopePerson.cell}` : f.cell!=='all' ? `${f.cell} • ${people.length} workers` : f.q ? `Search: “${f.q}” • ${people.length} workers` : `Whole school • ${people.length} workers`;
    $('#scopeBanner').innerHTML=`<span>✦</span><strong>${esc(scope)}</strong><span>${f.from||'All dates'} → ${f.to||'Latest'}</span>`;
    const cards=[
      ['Overall',perf.overall,perf.totalRecords?`${perf.totalRecords} measured records`:'No recorded activity'],
      ['Education',perf.education.score,`${perf.education.total} records`],
      ['Service',perf.service.score,`${perf.service.total} records`],
      ['Cleaning',perf.cleaning.score,`${perf.cleaning.total} records`],
      ['Tithe & Offering',perf.finance.score,`${perf.finance.total} monthly records`],
      ['Workers',people.length, f.cell==='all'?'School view':f.cell]
    ];
    $('#kpiGrid').innerHTML=cards.map((c,i)=>{const metricTotal=i===0?perf.totalRecords:i===1?perf.education.total:i===2?perf.service.total:i===3?perf.cleaning.total:i===4?perf.finance.total:1;const shown=i===5?c[1]:(metricTotal?c[1]+'%':'—');return `<div class="kpi-card"><div class="kpi-label">${esc(c[0])}</div><div class="kpi-value">${shown}</div><div class="kpi-sub">${esc(c[2])}</div>${i<5?`<div class="progress-mini"><span style="width:${metricTotal?c[1]:0}%"></span></div>`:''}</div>`;}).join('');
    renderFollowUp(people,f.from,f.to);
    renderDashboardCharts(people,f.from,f.to);
  }

  function renderFollowUp(people,from,to) {
    const rows=people.map(p=>({p,perf:personPerformance(p.id,from,to)})).filter(x=>x.perf.hasData).sort((a,b)=>a.perf.overall-b.perf.overall).slice(0,10);
    $('#followUpBody').innerHTML=rows.length?rows.map(x=>`<tr><td><div class="worker-cell"><div class="avatar">${initials(x.p.name)}</div><strong>${esc(x.p.name)}</strong></div></td><td>${esc(x.p.cell)}</td>${METRICS.map(m=>`<td>${x.perf[m].total?x.perf[m].score+'%':'—'}</td>`).join('')}<td><span class="performance-chip ${scoreClass(x.perf.overall)}">${x.perf.overall}%</span></td></tr>`).join(''):emptyRow(7,'No performance data in this period.');
  }

  function renderDashboardCharts(people,from,to) {
    if(typeof Chart==='undefined') return;
    const perf=aggregatePerformance(people.map(p=>p.id),from,to);
    makeChart('categoryChart','bar',{labels:['Education','Service','Cleaning','Tithe & Offering'],datasets:[{label:'Performance %',data:METRICS.map(m=>perf[m].score),backgroundColor:['#8e72d8','#5d8fc7','#d86179','#4b9c87'],borderRadius:8}]},{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}});

    const weeks=lastWeeks(8,to||today());
    const weekly=weeks.map(w=>aggregatePerformance(people.map(p=>p.id),w.start,w.end));
    makeChart('weeklyTrendChart','line',{labels:weeks.map(w=>w.label),datasets:[{label:'Overall',data:weekly.map(x=>x.hasData?x.overall:null),borderColor:'#9a6fc5',backgroundColor:'rgba(154,111,197,.12)',fill:true,tension:.35,pointRadius:3},{label:'Education',data:weekly.map(x=>x.education.total?x.education.score:null),borderColor:'#d06e9f',tension:.35,pointRadius:2}]},{scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}});

    const f=dashboardFilters(); const compareCells=(f.cell==='all'?cellNames():[f.cell]).map(cell=>{const ids=people.filter(p=>p.cell===cell).map(p=>p.id);const p=aggregatePerformance(ids,from,to);return{cell,score:p.hasData?p.overall:0,hasData:p.hasData};});
    makeChart('cellChart','bar',{labels:compareCells.map(x=>x.cell),datasets:[{label:'Overall %',data:compareCells.map(x=>x.score),backgroundColor:'#7e9bd2',borderRadius:8}]},{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}});

    const ids=new Set(people.map(p=>p.id)); const finance=db.finance.filter(r=>ids.has(r.personId)&&dateWithin(recordDate('finance',r),from,to));
    const months=[...new Set(finance.map(r=>r.month).filter(Boolean))].sort().slice(-8);
    makeChart('financeChart','bar',{labels:months.map(monthLabel),datasets:[{label:'Submitted %',data:months.map(m=>metricPerformanceFromRecords('finance',finance.filter(r=>r.month===m)).score),backgroundColor:'#5eae97',borderRadius:7}]},{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}});
  }

  function makeChart(id,type,data,options={}) {
    if(typeof Chart==='undefined' || !$('#'+id)) return; if(charts[id]) charts[id].destroy();
    const ctx=$('#'+id);
    const defaultScales=type==='doughnut'?undefined:{x:{grid:{display:false},ticks:{font:{size:10},color:'#88758c'}},y:{grid:{color:'rgba(117,88,128,.08)'},ticks:{font:{size:10},color:'#88758c'}}};
    const mergedPlugins={legend:{labels:{usePointStyle:true,boxWidth:8,font:{size:10}}},tooltip:{backgroundColor:'#4f3d55',padding:10,cornerRadius:10},...(options.plugins||{})};
    const mergedScales=defaultScales?{x:{...defaultScales.x,...(options.scales?.x||{})},y:{...defaultScales.y,...(options.scales?.y||{})}}:undefined;
    const finalOptions={...options,responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false,...(options.interaction||{})},plugins:mergedPlugins,scales:mergedScales};
    charts[id]=new Chart(ctx,{type,data,options:finalOptions});
  }

  function lastWeeks(n,endDate) {
    const out=[], end=new Date(`${endDate}T12:00:00`);
    for(let i=n-1;i>=0;i--){const d=new Date(end);d.setDate(d.getDate()-i*7);const day=d.getDay();const start=new Date(d);start.setDate(d.getDate()-((day+6)%7));const e=new Date(start);e.setDate(start.getDate()+6);out.push({start:localISO(start),end:localISO(e),label:`${start.getDate()} ${start.toLocaleString('en-ZA',{month:'short'})}`});}
    return out;
  }

  function renderReports() {
    if(!$('#reportView')) return;
    const view=$('#reportView').value, from=$('#reportFrom').value, to=$('#reportTo').value, cell=$('#reportCell').value, worker=$('#reportWorker').value;
    let people=activePeople().filter(p=>(cell==='all'||p.cell===cell)&&(worker==='all'||p.id===worker));
    if(view==='workers') {
      reportRowsCache=people.map(p=>{const perf=personPerformance(p.id,from,to);return{Worker:p.name,Cell:p.cell,Education:perf.education.total?perf.education.score:'',Service:perf.service.total?perf.service.score:'',Cleaning:perf.cleaning.total?perf.cleaning.score:'','Tithe & Offering':perf.finance.total?perf.finance.score:'',Overall:perf.hasData?perf.overall:'',Records:perf.totalRecords};}).sort((a,b)=>(b.Overall||-1)-(a.Overall||-1));
      $('#reportHead').innerHTML='<tr><th>Worker</th><th>Cell</th><th>Education</th><th>Service</th><th>Cleaning</th><th>Tithe & Offering</th><th>Overall</th><th>Records</th></tr>';
      $('#reportBody').innerHTML=reportRowsCache.length?reportRowsCache.map(r=>`<tr><td>${esc(r.Worker)}</td><td>${esc(r.Cell)}</td><td>${fmtScore(r.Education)}</td><td>${fmtScore(r.Service)}</td><td>${fmtScore(r.Cleaning)}</td><td>${fmtScore(r['Tithe & Offering'])}</td><td>${r.Overall===''?'—':`<span class="performance-chip ${scoreClass(r.Overall)}">${r.Overall}%</span>`}</td><td>${r.Records}</td></tr>`).join(''):emptyRow(8,'No workers match this filter.');
      const top=reportRowsCache.filter(r=>r.Overall!=='').slice(0,20).reverse(); makeChart('reportChart','bar',{labels:top.map(r=>shortName(r.Worker)),datasets:[{label:'Overall %',data:top.map(r=>r.Overall),backgroundColor:'#9a77d5',borderRadius:7}]},{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}});
    } else if(view==='cells') {
      const cells=(cell==='all'?cellNames():[cell]);
      reportRowsCache=cells.map(c=>{const ids=people.filter(p=>p.cell===c).map(p=>p.id),perf=aggregatePerformance(ids,from,to);return{Cell:c,Workers:ids.length,Education:perf.education.total?perf.education.score:'',Service:perf.service.total?perf.service.score:'',Cleaning:perf.cleaning.total?perf.cleaning.score:'','Tithe & Offering':perf.finance.total?perf.finance.score:'',Overall:perf.hasData?perf.overall:'',Records:perf.totalRecords};});
      $('#reportHead').innerHTML='<tr><th>Cell</th><th>Workers</th><th>Education</th><th>Service</th><th>Cleaning</th><th>Tithe & Offering</th><th>Overall</th><th>Records</th></tr>';
      $('#reportBody').innerHTML=reportRowsCache.length?reportRowsCache.map(r=>`<tr><td><strong>${esc(r.Cell)}</strong></td><td>${r.Workers}</td><td>${fmtScore(r.Education)}</td><td>${fmtScore(r.Service)}</td><td>${fmtScore(r.Cleaning)}</td><td>${fmtScore(r['Tithe & Offering'])}</td><td>${r.Overall===''?'—':`<span class="performance-chip ${scoreClass(r.Overall)}">${r.Overall}%</span>`}</td><td>${r.Records}</td></tr>`).join(''):emptyRow(8);
      makeChart('reportChart','bar',{labels:reportRowsCache.map(r=>r.Cell),datasets:[{label:'Overall %',data:reportRowsCache.map(r=>r.Overall||0),backgroundColor:'#6c99c7',borderRadius:8}]},{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}});
    } else {
      const ids=new Set(people.map(p=>p.id));
      reportRowsCache=allFlatRecords().filter(r=>ids.has(r.personId)&&dateWithin(r.sortDate,from,to));
      $('#reportHead').innerHTML='<tr><th>Date</th><th>Worker</th><th>Cell</th><th>Metric</th><th>Detail</th><th>Status</th><th>Notes</th></tr>';
      $('#reportBody').innerHTML=reportRowsCache.length?reportRowsCache.slice(0,1500).map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.person)}</td><td>${esc(r.cell)}</td><td>${esc(r.metricLabel)}</td><td>${esc(r.detail)}</td><td>${esc(r.status||'—')}</td><td>${esc(r.note||'—')}</td></tr>`).join(''):emptyRow(7,'No records match this period.');
      const counts=METRICS.map(m=>reportRowsCache.filter(r=>r.metric===m).length); makeChart('reportChart','bar',{labels:METRICS.map(metricLabel),datasets:[{label:'Records',data:counts,backgroundColor:['#8e72d8','#5d8fc7','#d86179','#4b9c87'],borderRadius:8}]},{plugins:{legend:{display:false}}});
    }
    $('#reportCount').textContent=`${reportRowsCache.length} ${view==='records'?'records':'rows'} • ${from||'All dates'} to ${to||'latest'}`;
  }

  function fmtScore(v) { return v===''?'—':`${v}%`; }

  function allFlatRecords() {
    const rows=[];
    ['education','service','cleaning'].forEach(metric=>db[metric].forEach(r=>{const p=personById(r.personId);rows.push({metric,metricLabel:metricLabel(metric),id:r.id,personId:r.personId,sortDate:r.date||'',date:r.date||'',person:p.name,cell:p.cell,detail:r.session||'',status:r.status||'',note:r.note||'',raw:r});}));
    db.finance.forEach(r=>{const p=personById(r.personId);rows.push({metric:'finance',metricLabel:'Tithe & Offering',id:r.id,personId:r.personId,sortDate:`${r.month}-01`,date:r.month,person:p.name,cell:p.cell,detail:r.amount!==''&&r.amount!=null?`Amount: R${r.amount}`:'Monthly record',status:r.status||'',note:r.note||'',raw:r});});
    return rows.sort((a,b)=>b.sortDate.localeCompare(a.sortDate)||a.person.localeCompare(b.person));
  }

  function renderRecords() {
    if(!$('#recordsBody')) return;
    const metric=$('#recordsMetric').value, from=$('#recordsFrom').value, to=$('#recordsTo').value, cell=$('#recordsCell').value, q=$('#recordsSearch').value.toLowerCase();
    visibleRecordsCache=allFlatRecords().filter(x=>(metric==='all'||x.metric===metric)&&(cell==='all'||x.cell===cell)&&dateWithin(x.sortDate,from,to)&&(!q||`${x.person} ${x.cell} ${x.metricLabel} ${x.status} ${x.detail} ${x.note}`.toLowerCase().includes(q)));
    $('#recordsCount').textContent=`${visibleRecordsCache.length} filtered record${visibleRecordsCache.length===1?'':'s'}`;
    $('#recordsBody').innerHTML=visibleRecordsCache.length?visibleRecordsCache.slice(0,1500).map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.person)}</td><td>${esc(x.cell)}</td><td><span class="pill ${x.metric==='finance'?'mint':x.metric==='service'?'blue':x.metric==='cleaning'?'rose':'lavender'}">${esc(x.metricLabel)}</span></td><td>${esc(x.detail)}</td><td>${esc(x.status||'—')}</td><td>${esc(x.note||'—')}</td><td>${canDeleteRecords()?`<button class="delete-btn" data-delete="${esc(x.id)}" data-metric="${esc(x.metric)}" title="Delete">×</button>`:''}</td></tr>`).join(''):emptyRow(8,'No records match these filters.');
  }

  async function deleteRecord(metric,id) {
    if(!confirm('Delete this record?')) return;
    db[metric]=db[metric].filter(r=>r.id!==id); saveLocal(); renderAll();
    try{await remoteCall({action:'deleteRecord',metric,id});}catch(e){return toast('Deleted locally, but cloud delete failed: '+e.message,'error');}
    toast('Record deleted.','success');
  }

  function exportBackup() {
    const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),data:db},null,2)],{type:'application/json'});
    downloadBlob(blob,`heavenly-school-backup-${today()}.json`); toast('JSON backup exported.','success');
  }

  function importBackup(e) {
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=async()=>{try{const parsed=JSON.parse(reader.result);const incoming=parsed.data||parsed;if(!incoming.people||!Array.isArray(incoming.people))throw new Error('Invalid backup');db={...emptyDB(),...incoming};METRICS.forEach(m=>{if(!Array.isArray(db[m]))db[m]=[]});saveLocal();renderAll();await pushFullDatabase();toast('Backup imported to the shared database.','success');}catch(err){toast('Could not import this backup: '+err.message,'error');}};
    reader.readAsText(file); e.target.value='';
  }


  async function pushFullDatabase() {
    if(session?.user?.role!=='admin') throw new Error('Administrator access required.');
    await remoteCall({action:'savePeople',people:db.people});
    for (const metric of METRICS) await remoteCall({action:'replaceMetric',metric,records:db[metric]});
  }

  function exportVisibleRecordsCSV() { renderRecords(); const rows=visibleRecordsCache.map(flatExportRow); exportCSVRows(rows,`filtered-records-${today()}.csv`); }
  function exportReportCSV() { renderReports(); exportCSVRows(reportRowsCache,`performance-report-${today()}.csv`); }
  function exportCSVRows(rows,name) {
    if(!rows.length) return toast('There is no data to export.','error');
    const normalized=rows.map(r=>{ if(r.metric) return flatExportRow(r); return r; }); const headers=Object.keys(normalized[0]); const lines=[headers,...normalized.map(r=>headers.map(h=>r[h]??''))].map(row=>row.map(csvCell).join(',')); downloadBlob(new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'}),name); toast('CSV exported.','success');
  }
  function flatExportRow(r) { return {Date:r.date,Worker:r.person,Cell:r.cell,Metric:r.metricLabel,Detail:r.detail,Status:r.status,Notes:r.note}; }
  function csvCell(v) { const s=String(v??''); return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s; }

  function exportExcelWorkbook(filteredReport=false) {
    if(typeof XLSX==='undefined') return toast('Excel library did not load. Check your internet connection and refresh.','error');
    const wb=XLSX.utils.book_new();
    const peopleRows=(filteredReport?reportFilteredPeople():db.people).map(p=>({ID:p.id,Name:p.name,Cell:p.cell,Active:p.active!==false?'Yes':'No'}));
    appendSheet(wb,'Workers',peopleRows);
    const ids=new Set(peopleRows.map(r=>r.ID));
    const from=filteredReport?$('#reportFrom').value:'', to=filteredReport?$('#reportTo').value:'';
    const recordFilter=(metric,r)=>ids.has(r.personId)&&(!filteredReport||dateWithin(recordDate(metric,r),from,to));
    appendSheet(wb,'Education',db.education.filter(r=>recordFilter('education',r)).map(r=>attendanceExcelRow('education',r)));
    appendSheet(wb,'Service Attendance',db.service.filter(r=>recordFilter('service',r)).map(r=>attendanceExcelRow('service',r)));
    appendSheet(wb,'Cleaning',db.cleaning.filter(r=>recordFilter('cleaning',r)).map(r=>attendanceExcelRow('cleaning',r)));
    appendSheet(wb,'Tithe Offering',db.finance.filter(r=>recordFilter('finance',r)).map(financeExcelRow));
    const summary=peopleRows.map(pr=>{const perf=personPerformance(pr.ID,from,to);return{Worker:pr.Name,Cell:pr.Cell,'Education %':perf.education.total?perf.education.score:'','Service %':perf.service.total?perf.service.score:'','Cleaning %':perf.cleaning.total?perf.cleaning.score:'','Tithe & Offering %':perf.finance.total?perf.finance.score:'','Overall %':perf.hasData?perf.overall:'','Measured Records':perf.totalRecords};});
    appendSheet(wb,'Performance Summary',summary);
    XLSX.writeFile(wb,`heavenly-school-${filteredReport?'filtered-report':'full-data'}-${today()}.xlsx`); toast('Excel workbook exported.','success');
  }

  function exportVisibleRecordsExcel() {
    if(typeof XLSX==='undefined') return toast('Excel library did not load.','error'); renderRecords();
    const wb=XLSX.utils.book_new(); appendSheet(wb,'Filtered Records',visibleRecordsCache.map(flatExportRow)); XLSX.writeFile(wb,`filtered-records-${today()}.xlsx`); toast('Filtered Excel file exported.','success');
  }

  function reportFilteredPeople() { const cell=$('#reportCell').value,worker=$('#reportWorker').value; return activePeople().filter(p=>(cell==='all'||p.cell===cell)&&(worker==='all'||p.id===worker)); }
  function attendanceExcelRow(metric,r) { const p=personById(r.personId); return {'Record ID':r.id,'Worker ID':r.personId,Worker:p.name,Cell:p.cell,Date:r.date,Session:r.session,Status:r.status,Notes:r.note||'','Updated At':r.updatedAt||''}; }
  function financeExcelRow(r) { const p=personById(r.personId); return {'Record ID':r.id,'Worker ID':r.personId,Worker:p.name,Cell:p.cell,Month:r.month,Status:r.status,Amount:r.amount??'',Notes:r.note||'','Updated At':r.updatedAt||''}; }
  function appendSheet(wb,name,rows) { const safeRows=rows.length?rows:[{Message:'No data'}]; const ws=XLSX.utils.json_to_sheet(safeRows); ws['!cols']=Object.keys(safeRows[0]).map(k=>({wch:Math.min(32,Math.max(12,k.length+2))})); XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31)); }

  function importExcelWorkbook(e) {
    const file=e.target.files?.[0]; if(!file) return; if(typeof XLSX==='undefined') return toast('Excel library did not load.','error');
    const reader=new FileReader();
    reader.onload=async()=>{try{
      const wb=XLSX.read(reader.result,{type:'array'}); const incoming=emptyDB();
      const workers=sheetRows(wb,'Workers'); if(workers.length&&workers[0].Message!=='No data') incoming.people=workers.map((r,i)=>({id:String(r.ID||r['Worker ID']||`P${i+1}`),name:String(r.Name||r.Worker||`Worker ${i+1}`),cell:String(r.Cell||'Cell 1'),active:String(r.Active||'Yes').toLowerCase()!=='no',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
      const knownIds=new Set(incoming.people.map(p=>p.id));
      incoming.education=parseAttendanceSheet(sheetRows(wb,'Education'),knownIds,'edu');
      incoming.service=parseAttendanceSheet(sheetRows(wb,'Service Attendance'),knownIds,'svc');
      incoming.cleaning=parseAttendanceSheet(sheetRows(wb,'Cleaning'),knownIds,'cln');
      incoming.finance=parseFinanceSheet(sheetRows(wb,'Tithe Offering'),knownIds);
      db=incoming; saveLocal(); renderAll(); await pushFullDatabase(); toast('Excel workbook imported to the shared database.','success');
    }catch(err){console.error(err);toast('Could not import this Excel workbook: '+err.message,'error');}}
    reader.readAsArrayBuffer(file); e.target.value='';
  }
  function sheetRows(wb,name) { const ws=wb.Sheets[name]; return ws?XLSX.utils.sheet_to_json(ws,{defval:''}):[]; }
  function parseAttendanceSheet(rows,knownIds,prefix) { return rows.filter(r=>r['Worker ID']&&knownIds.has(String(r['Worker ID']))&&r.Date).map(r=>({id:String(r['Record ID']||uid(prefix)),personId:String(r['Worker ID']),date:excelDateString(r.Date),session:String(r.Session||''),status:String(r.Status||''),note:String(r.Notes||''),updatedAt:String(r['Updated At']||new Date().toISOString())})); }
  function parseFinanceSheet(rows,knownIds) { return rows.filter(r=>r['Worker ID']&&knownIds.has(String(r['Worker ID']))&&r.Month).map(r=>({id:String(r['Record ID']||uid('fin')),personId:String(r['Worker ID']),month:String(r.Month).slice(0,7),status:String(r.Status||''),amount:r.Amount===''?'':Number(r.Amount),note:String(r.Notes||''),updatedAt:String(r['Updated At']||new Date().toISOString())})); }
  function excelDateString(v) { if(typeof v==='number'){const d=XLSX.SSF.parse_date_code(v);return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;} return String(v).slice(0,10); }

  function exportChartPNG(chartId) {
    const chart=charts[chartId]; if(!chart) return toast('No chart data is available to export.','error');
    const source=chart.canvas, out=document.createElement('canvas'); out.width=source.width; out.height=source.height; const ctx=out.getContext('2d'); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,out.width,out.height); ctx.drawImage(source,0,0); const a=document.createElement('a'); a.href=out.toDataURL('image/png',1); a.download=`${chartId}-${today()}.png`; a.click(); toast('Chart PNG exported.','success');
  }

  function downloadBlob(blob,name) { const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),500); }

  function updateConnectionUI(connected=true) {
    $('#connectionDot').classList.toggle('connected',connected);
    $('#connectionLabel').textContent=connected?'Google Sheets':'Offline';
    $('#connectionDetail').textContent=connected?'Shared cloud database':'Connection unavailable';
  }

  async function apiFetch(payload, authenticated=true) {
    const body = authenticated ? {...payload, sessionToken:session?.token||''} : payload;
    const res=await fetch(API_URL,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    if(!data.ok) {
      if (data.code==='AUTH_REQUIRED' || data.code==='SESSION_EXPIRED') forceSignedOut();
      throw new Error(data.error||'Unknown server error');
    }
    return data;
  }

  const remoteCall = payload => apiFetch(payload,true);

  async function syncFromRemote(showMessage=true) {
    if(!session?.token) return false;
    showLoading(true,'Syncing with Google Sheets...');
    try{
      const data=await remoteCall({action:'getAll'});
      if(data.data){
        db={...emptyDB(),...data.data}; METRICS.forEach(m=>{if(!Array.isArray(db[m]))db[m]=[]}); saveLocal(); renderAll(); updateConnectionUI(true);
        if($('#settingsStatus')) $('#settingsStatus').textContent=`Connected. Last synced ${new Date().toLocaleString('en-ZA')}.`;
        if(showMessage) toast('Synced with Google Sheets.','success');
        return true;
      }
      return false;
    }catch(e){ updateConnectionUI(false); if($('#settingsStatus')) $('#settingsStatus').textContent='Connection failed: '+e.message; if(showMessage) toast('Could not connect: '+e.message,'error'); return false; }
    finally{showLoading(false);}
  }

  function roleLabel(role) { return ({admin:'Administrator',cell_leader:'Cell leader',worker:'Worker'})[role]||role; }
  function canDeleteRecords() { return ['admin','cell_leader'].includes(session?.user?.role); }

  function applyRoleUI() {
    const u=session?.user; if(!u) return;
    const role=u.role;
    $$('.admin-only').forEach(el=>el.classList.toggle('hidden',role!=='admin'));
    $$('.nav-item').forEach(el=>{
      const v=el.dataset.view;
      const hide = role==='worker' && ['education','service','cleaning','finance','people'].includes(v) || role==='cell_leader' && v==='people';
      el.classList.toggle('hidden',hide);
    });
    const display=u.displayName||u.username;
    $('#currentUserName').textContent=display; $('#currentUserRole').textContent=roleLabel(role); $('#currentUserAvatar').textContent=initials(display)||'HS';
    $('#settingsUserName').textContent=display; $('#settingsUserAvatar').textContent=initials(display)||'HS';
    $('#settingsUserScope').textContent = role==='admin'?'Whole school access':role==='cell_leader'?`${u.cell} access`:'Own performance only';
    $('#settingsStatus').textContent='Connected to the shared Google Sheets database.';
    if(role==='admin') populateAccessSelectors();
  }

  function populateAccessSelectors() {
    const cells=cellNames();
    const cell=$('#accessCell'), person=$('#accessPerson');
    const cv=cell.value, pv=person.value;
    cell.innerHTML='<option value="">Not restricted to a cell</option>'+cells.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    person.innerHTML='<option value="">No linked worker</option>'+activePeople().slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — ${esc(p.cell)}</option>`).join('');
    if([...cell.options].some(o=>o.value===cv)) cell.value=cv; if([...person.options].some(o=>o.value===pv)) person.value=pv;
  }

  function updateAccessFormRequirements() {
    const role=$('#accessRole').value;
    $('#accessCell').disabled=role==='admin'; $('#accessPerson').disabled=role!=='worker';
    if(role==='admin') { $('#accessCell').value=''; $('#accessPerson').value=''; }
    if(role==='cell_leader') $('#accessPerson').value='';
  }

  async function loadAccessUsers() {
    if(session?.user?.role!=='admin') return;
    try{ const data=await remoteCall({action:'listUsers'}); accessUsers=data.users||[]; renderAccessUsers(); }
    catch(e){ toast('Could not load user accounts: '+e.message,'error'); }
  }

  function renderAccessUsers() {
    $('#accessUsersBody').innerHTML=accessUsers.length?accessUsers.map(u=>`<tr><td><strong>${esc(u.username)}</strong><br><small>${esc(u.displayName||'')}</small></td><td><span class="role-badge ${esc(u.role)}">${esc(roleLabel(u.role))}</span></td><td>${esc(u.role==='admin'?'Whole school':u.role==='cell_leader'?(u.cell||'No cell'):(u.personName||u.personId||'Unlinked'))}</td><td>${u.active!==false?'Active':'Disabled'}</td><td><button class="text-button" data-edit-user="${esc(u.id)}">Edit</button></td></tr>`).join(''):emptyRow(5,'No login accounts found.');
  }

  function clearAccessForm() {
    $('#accessUserId').value=''; $('#accessUsername').value=''; $('#accessPassword').value=''; $('#accessRole').value='worker'; $('#accessCell').value=''; $('#accessPerson').value=''; $('#accessActive').checked=true; updateAccessFormRequirements();
  }

  function editAccessUser(id) {
    const u=accessUsers.find(x=>x.id===id); if(!u) return;
    $('#accessUserId').value=u.id; $('#accessUsername').value=u.username; $('#accessPassword').value=''; $('#accessRole').value=u.role; $('#accessCell').value=u.cell||''; $('#accessPerson').value=u.personId||''; $('#accessActive').checked=u.active!==false; updateAccessFormRequirements(); window.scrollTo({top:document.getElementById('userAccessPanel').offsetTop-90,behavior:'smooth'});
  }

  async function saveAccessUser() {
    if(session?.user?.role!=='admin') return;
    const payload={action:'saveUser',id:$('#accessUserId').value.trim(),username:$('#accessUsername').value.trim(),password:$('#accessPassword').value,role:$('#accessRole').value,cell:$('#accessCell').value,personId:$('#accessPerson').value,active:$('#accessActive').checked};
    if(!payload.username) return toast('Enter a username.','error');
    if(!payload.id && payload.password.length<8) return toast('New accounts need a password of at least 8 characters.','error');
    try{ await remoteCall(payload); clearAccessForm(); await loadAccessUsers(); toast('Login account saved.','success'); }catch(e){ toast('Could not save account: '+e.message,'error'); }
  }

  async function changeOwnPassword() {
    const a=$('#newPassword').value, b=$('#confirmPassword').value;
    if(a.length<8) return toast('Password must be at least 8 characters.','error'); if(a!==b) return toast('Passwords do not match.','error');
    try{ await remoteCall({action:'changePassword',password:a}); $('#newPassword').value=''; $('#confirmPassword').value=''; toast('Password changed.','success'); }catch(e){ toast('Could not change password: '+e.message,'error'); }
  }

  async function logout() {
    try{ if(session?.token) await remoteCall({action:'logout'}); }catch{}
    forceSignedOut();
  }

  function forceSignedOut() {
    session=null; saveSession(); localStorage.removeItem(STORAGE_KEY); db=emptyDB();
    document.body.classList.add('auth-locked'); $('#authScreen').classList.remove('hidden'); $('#loginPassword').value=''; $('#authHelp').textContent='Please sign in.';
  }

  async function enterApp(newSession) {
    if(newSession){session=newSession;saveSession();}
    document.body.classList.add('auth-locked'); $('#authScreen').classList.remove('hidden');
    db=emptyDB(); initApp();
    $('#authHelp').textContent='Loading your permitted school data…';
    const ok=await syncFromRemote(false);
    if(!ok){ $('#authHelp').textContent='Could not load your school data. Check the Apps Script deployment and try signing in again.'; $('#authHelp').classList.add('error'); return; }
    applyRoleUI(); document.body.classList.remove('auth-locked'); $('#authScreen').classList.add('hidden');
    if(session?.user?.role==='admin') loadAccessUsers();
  }

  async function bootAuth() {
    $('#authForm').addEventListener('submit', handleAuthSubmit);
    $('#authForm').dataset.mode='login';
    $('#authHelp').textContent='Connecting to the shared school database…';
    try{
      await apiFetch({action:'status'},false);
      if(session?.token){
        try{ const who=await remoteCall({action:'whoAmI'}); session.user=who.user; saveSession(); return enterApp(); }catch{}
      }
      $('#authHelp').textContent='Enter your assigned username and password.';
    }catch(e){ $('#authHelp').textContent='Could not reach the shared database. '+e.message; $('#authHelp').classList.add('error'); }
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const username=$('#loginUsername').value.trim(), password=$('#loginPassword').value;
    if(!username||!password) return;
    $('#loginButton').disabled=true; $('#authHelp').classList.remove('error','success'); $('#authHelp').textContent='Signing in…';
    try{
      const data=await apiFetch({action:'login',username,password},false);
      $('#authHelp').classList.add('success'); $('#authHelp').textContent='Access granted.'; await enterApp({token:data.sessionToken,user:data.user});
    }catch(err){ $('#authHelp').classList.add('error'); $('#authHelp').textContent=err.message; } finally { $('#loginButton').disabled=false; }
  }

  function showLoading(show,text='Loading...') { $('#loadingText').textContent=text; $('#loadingOverlay').classList.toggle('show',show); }
  function toast(message,type='') { const el=$('#toast');el.textContent=message;el.className=`toast show ${type}`;clearTimeout(toast.t);toast.t=setTimeout(()=>el.className='toast',3200); }

  bootAuth();
})();
