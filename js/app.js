
// ══════════════════════════════════════════════════════════════════
// DATA
// ══════════════════════════════════════════════════════════════════
let DIRECTIONS = {};
let OWNER_CAPS = {};
let TEAMS = {};
let FAS = [];
let MY_TEAMS = [];
let CBA = { cap:165000000, tax:201000000, apron1:209000000, apron2:222000000, avgSal:10000000 };

let currentTeam = 'PHI';
let currentFilter = 'all';
let currentSort = {col:'sal_26', dir:-1};
let faSort = {col:'fpg', dir:-1};
let selectedPlayer = null;
let tradePlayers = {a:[], b:[]};
let tradeTeam = {a:'', b:''};
let currentTool = 'finder';

// ══ MOBILE ═══════════════════════
function openSidebar(){document.getElementById('sidebar').classList.add('open');document.getElementById('sidebar-overlay').classList.add('visible');}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-overlay').classList.remove('visible');}

// ══ THEME ════════════════════════
function toggleTheme(){
  const light=document.body.classList.toggle('light');
  document.getElementById('theme-label').textContent=light?'LIGHT':'DARK';
  localStorage.setItem('nba_fo_theme',light?'light':'dark');
}
(function(){
  if(localStorage.getItem('nba_fo_theme')==='light'){document.body.classList.add('light');document.getElementById('theme-label').textContent='LIGHT';}
})();

// ══ UTILS ════════════════════════
const fmt = v => v ? '$'+Math.round(v).toLocaleString() : '—';
const fmtM = v => v ? '$'+(v/1000000).toFixed(1)+'M' : '—';
function apronStatus(sal){
  if(sal>=CBA.apron2) return {label:'2nd Apron',cls:'over2'};
  if(sal>=CBA.apron1) return {label:'1st Apron',cls:'over1'};
  if(sal>=CBA.tax)    return {label:'Luxury Tax',cls:'overtax'};
  if(sal>=CBA.cap)    return {label:'Over Cap',cls:'overtax'};
  return {label:'Under Cap',cls:'undercap'};
}
function setTeamColors(abbr){
  const t=TEAMS[abbr]; if(!t) return;
  document.documentElement.style.setProperty('--team-c1',t.c1);
  document.documentElement.style.setProperty('--team-c2',t.c2);
}
function updateMobileStrip(abbr){
  const t=TEAMS[abbr]; if(!t) return;
  const dot=document.getElementById('strip-dot');
  const name=document.getElementById('strip-name');
  if(dot) dot.style.background=t.c1;
  if(name) name.textContent=t.name;
}
function setMobileNav(pg){
  document.querySelectorAll('.mnav-btn').forEach(b=>b.classList.remove('active'));
  const btn=document.getElementById('mnav-'+pg);
  if(btn) btn.classList.add('active');
}
function directionBadge(abbr){
  const d = DIRECTIONS[abbr] || '';
  if(!d) return '';
  const dl = d.toLowerCase();
  let cls = 'other';
  if(dl.includes('contend')||dl.includes('dynasty')||dl.includes('magic')||dl.includes('ubuntu')||dl.includes('culture')||dl.includes('autopilot')) cls='contend';
  else if(dl.includes('rebuild')||dl.includes('tank')||dl.includes('trust')||dl.includes('process')||dl.includes('old & young')) cls='rebuild';
  else if(dl.includes('mixed')||dl.includes('?')) cls='mixed';
  return `<span class="direction-badge ${cls}">${d}</span>`;
}

// ══ SIDEBAR ══════════════════════
function buildSidebar(){
  const myEl=document.getElementById('sidebar-my-teams');
  const allEl=document.getElementById('sidebar-all-teams');
  myEl.innerHTML=''; allEl.innerHTML='';
  const sorted=Object.keys(TEAMS).sort((a,b)=>TEAMS[a].name.localeCompare(TEAMS[b].name));
  MY_TEAMS.forEach(abbr=>myEl.appendChild(makeSidebarBtn(abbr,true)));
  sorted.forEach(abbr=>allEl.appendChild(makeSidebarBtn(abbr,false)));
}
function makeSidebarBtn(abbr,isMine){
  const t=TEAMS[abbr];
  const btn=document.createElement('button');
  btn.className='sidebar-team-btn'+(isMine?' my-team':'')+(abbr===currentTeam?' active':'');
  btn.id='sidebar-btn-'+abbr;
  btn.innerHTML=`<div class="team-dot" style="background:${t.c1}"></div><span>${t.name}</span><span class="team-abbr">${abbr}</span>`;
  btn.onclick=()=>{selectTeam(abbr);closeSidebar();};
  return btn;
}
function selectTeam(abbr){
  document.querySelectorAll('.sidebar-team-btn').forEach(b=>b.classList.remove('active'));
  const btn=document.getElementById('sidebar-btn-'+abbr);
  if(btn) btn.classList.add('active');
  currentTeam=abbr;
  setTeamColors(abbr);
  updateMobileStrip(abbr);
  currentFilter='all';
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('.filter-btn[onclick*="all"]')?.classList.add('active');
  document.getElementById('roster-search').value='';
  closeDetail();
  renderTeam();
  showPage('roster');
  setMobileNav('roster');
  populateFinderPlayers();
}

// ══ PAGE SWITCHING ═══════════════
function showPage(pg){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+pg).classList.add('active');
  const tab=document.getElementById('tab-'+pg);
  if(tab) tab.classList.add('active');
  const mnavMap={roster:'roster',fa:'fa',trade:'trade',tools:'tools',teams:'teams'};
  setMobileNav(mnavMap[pg]||'roster');
  if(pg==='fa') renderFA();
  if(pg==='trade') renderTradeVerdict();
  if(pg==='teams') renderTeamsTable();
  if(pg==='tools') renderFairValueTable();
}
function showTool(t){
  currentTool=t;
  document.querySelectorAll('.tool-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tool-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('tool-'+t).classList.add('active');
  event.target.classList.add('active');
  if(t==='fairval') renderFairValueTable();
  if(t==='ownercap') renderOwnerCapDashboard();
}

// ══ RENDER TEAM ══════════════════
function renderTeam(){
  const t=TEAMS[currentTeam]; if(!t) return;
  const status=apronStatus(t.total_salary);
  const isMine=MY_TEAMS.includes(currentTeam);
  const space = Math.max(0, CBA.cap - t.total_salary);
  document.getElementById('roster-team-header').innerHTML=`
    <div class="team-header">
      <div class="team-color-bar" style="background:linear-gradient(to bottom,${t.c1},${t.c2})"></div>
      <div>
        <div class="team-header-name">${t.name}</div>
        <div class="team-header-meta">GM: ${t.gm||'—'} · Coach: ${t.coach||'—'} · ${t.players.length} Spieler${isMine?' ⭐':''}</div>
      </div>
      <div class="team-header-caps">
        ${directionBadge(currentTeam)}
        <div class="cap-pill ${status.cls}"><span class="pill-label">Total</span><span>${fmtM(t.total_salary)}</span></div>
        <div class="cap-pill ${status.cls}"><span>${status.label}</span></div>
        <div class="cap-pill" style="background:var(--surface2);color:var(--dim)">
          <span class="pill-label">vs Tax</span>
          <span style="color:${t.total_salary>CBA.tax?'var(--red)':'var(--green)'}">
            ${t.total_salary>CBA.tax?'+':'-'}${fmtM(Math.abs(t.total_salary-CBA.tax))}
          </span>
        </div>
        ${space>0?`<div class="cap-pill" style="background:var(--green-dim);color:var(--green)"><span class="pill-label">Space</span><span>${fmtM(space)}</span></div>`:''}
      </div>
    </div>`;
  const pct=v=>Math.min(v/(CBA.apron2*1.1)*100,100);
  let barColor=t.total_salary>=CBA.apron2?'var(--red)':t.total_salary>=CBA.apron1?'var(--orange)':t.total_salary>=CBA.tax?'var(--yellow)':'var(--green)';
  document.getElementById('cap-bar-section').innerHTML=`
    <div class="cap-bar-section">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);font-family:var(--font-mono);margin-bottom:2px">
        <span>SALARY</span><span>${fmtM(t.total_salary)}</span>
      </div>
      <div class="cap-bar-track">
        <div class="cap-bar-fill" style="width:${pct(t.total_salary)}%;background:${barColor}"></div>
        <div class="cap-marker" style="left:${pct(CBA.cap)}%;background:var(--green)" data-label="CAP"></div>
        <div class="cap-marker" style="left:${pct(CBA.tax)}%;background:var(--yellow)" data-label="TAX"></div>
        <div class="cap-marker" style="left:${pct(CBA.apron1)}%;background:var(--orange)" data-label="APR1"></div>
        <div class="cap-marker" style="left:${pct(CBA.apron2)}%;background:var(--red)" data-label="APR2"></div>
      </div>
      <div class="cap-bar-labels"><span>$0</span><span style="color:var(--green)">Cap $165M</span><span style="color:var(--yellow)">Tax $201M</span><span style="color:var(--orange)">Ap1</span><span style="color:var(--red)">Ap2</span></div>
    </div>`;
  renderRoster();
}

// ══ ROSTER ═══════════════════════
function setFilter(f,btn){
  currentFilter=f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderRoster();
}
function renderRoster(){
  const t=TEAMS[currentTeam]; if(!t) return;
  const search=(document.getElementById('roster-search').value||'').toLowerCase();
  let players=t.players.filter(p=>{
    if(search&&!p.name.toLowerCase().includes(search)) return false;
    if(currentFilter==='expiring') return p.sal_27===null;
    if(currentFilter==='caps') return p.sal_27&&p.sal_26&&(p.sal_27-p.sal_26)/p.sal_26>0.15;
    if(currentFilter==='tradable') return p.tradable_alone||p.tradable_agg;
    if(currentFilter==='bird') return p.bird==='Full';
    if(currentFilter==='options') return p.opt==='PO'||p.opt==='TO';
    return true;
  });
  players.sort((a,b)=>{
    let va=a[currentSort.col]??0,vb=b[currentSort.col]??0;
    if(typeof va==='string') va=va.toLowerCase();
    if(typeof vb==='string') vb=vb.toLowerCase();
    return va<vb?currentSort.dir:-currentSort.dir;
  });
  const wrap=document.getElementById('roster-table-wrap');
  if(!players.length){wrap.innerHTML='<div class="no-results">Keine Spieler gefunden.</div>';return;}
  const YEARS=['sal_26','sal_27','sal_28','sal_29','sal_30'];
  const LABELS=["'26-27","'27-28","'28-29","'29-30","'30-31"];
  const thSort=(col,label)=>{const s=currentSort.col===col;return `<th class="${s?'sorted':''}" onclick="sortRoster('${col}')">${label}${s?(currentSort.dir===-1?' ↓':' ↑'):''}</th>`;};
  const isMine=MY_TEAMS.includes(currentTeam);
  let html=`<table class="roster-table"><thead><tr>
    <th onclick="sortRoster('name')">Spieler</th><th>Pos</th>
    ${LABELS.map((l,i)=>thSort(YEARS[i],l)).join('')}
    <th>OPT</th><th>Bird</th><th>Trade</th>
  </tr></thead><tbody>`;
  players.forEach(p=>{
    const sel=selectedPlayer&&selectedPlayer.name===p.name&&selectedPlayer.team===currentTeam;
    const birdHtml=p.bird?`<span class="bird-badge ${p.bird.toLowerCase()}">${p.bird}</span>`:'—';
    const optHtml=p.opt?`<span class="opt-badge ${p.opt}">${p.opt}</span>`:'—';
    const trade=p.tradable_alone?'<span class="tradable-yes">✓</span>':p.tradable_agg?'<span style="color:var(--orange);font-size:11px">Agg</span>':'<span class="tradable-no">—</span>';
    const salCells=YEARS.map((yr,i)=>{
      const v=p[yr];const prev=i>0?p[YEARS[i-1]]:null;
      if(!v) return `<td class="sal-cell null">—</td>`;
      let cls='sal-cell';
      if(i===0&&!p.sal_27) cls+=' expiring';
      if(prev&&v&&(v-prev)/prev>0.15) cls+=' jump';
      return `<td class="${cls}">${fmtM(v)}</td>`;
    }).join('');
    const safeName=p.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    html+=`<tr class="player-row${sel?' selected':''}" onclick="selectPlayer('${safeName}','${currentTeam}')">
      <td><div class="player-name-cell">${isMine?'<span class="my-team-star">⭐</span>':''}<span>${p.name}</span></div></td>
      <td><span class="pos-badge">${p.pos}</span></td>
      ${salCells}<td>${optHtml}</td><td>${birdHtml}</td><td>${trade}</td>
    </tr>`;
  });
  wrap.innerHTML=html+'</tbody></table>';
}
function sortRoster(col){
  if(currentSort.col===col) currentSort.dir*=-1;
  else{currentSort.col=col;currentSort.dir=-1;}
  renderRoster();
}

// ══ PLAYER DETAIL ════════════════
function selectPlayer(name,teamAbbr){
  const t=TEAMS[teamAbbr]; if(!t) return;
  const p=t.players.find(x=>x.name===name); if(!p) return;
  selectedPlayer={name,team:teamAbbr};
  renderRoster();
  const panel=document.getElementById('detail-panel');
  const inner=document.getElementById('detail-panel-inner');
  panel.classList.add('open');
  const isMine=MY_TEAMS.includes(teamAbbr);
  const YEARS=[{yr:'sal_26',label:'2026-27'},{yr:'sal_27',label:'2027-28'},{yr:'sal_28',label:'2028-29'},{yr:'sal_29',label:'2029-30'},{yr:'sal_30',label:'2030-31'}];
  const maxSal=Math.max(...YEARS.map(y=>p[y.yr]||0));
  const salRows=YEARS.filter(y=>p[y.yr]).map((y,i,arr)=>{
    const prev=i>0?p[arr[i-1].yr]:null;
    const jump=prev&&(p[y.yr]-prev)/prev>0.15;
    const pct=maxSal?Math.round(p[y.yr]/maxSal*100):0;
    return `<div class="sal-row"><span class="sal-row-year">${y.label}</span><span class="sal-row-val${jump?' jump':''}">${fmt(p[y.yr])}${jump?' ⚠️':''}</span></div><div class="sal-bar" style="width:${pct}%"></div>`;
  }).join('');
  const tradeColor=p.tradable_alone?'green':p.tradable_agg?'orange':'red';
  const birdColor=p.bird==='Full'?'green':p.bird==='Early'?'orange':'red';
  const optHtml=p.opt?`<div class="detail-stat"><div class="detail-stat-label">Option</div><div class="detail-stat-val ${p.opt==='PO'?'orange':'blue'}">${p.opt==='PO'?'🟡 Player Option':'🔵 Team Option'}</div></div>`:'';
  // Max offer calc
  const maxOffer=calcMaxOffer(p.sal_26,p.bird,null);
  const maxOfferHtml=maxOffer?`<div class="max-result" style="margin-top:8px">
    <div class="max-result-row"><span class="max-result-label">CBA Max (Est.)</span><span class="max-result-val" style="color:var(--green)">${fmt(maxOffer.max)}</span></div>
    <div class="max-result-row"><span class="max-result-label">Steigerung/Jahr</span><span class="max-result-val">${maxOffer.raise}%</span></div>
  </div>`:'';
  inner.innerHTML=`
    <div class="detail-top">
      <div class="detail-close" onclick="closeDetail()">✕</div>
      <div class="detail-name">${p.name}</div>
      <div class="detail-team">${t.name}${isMine?' ⭐':''}</div>
      <div class="detail-badges"><span class="pos-badge">${p.pos}</span>${p.bird?`<span class="bird-badge ${p.bird.toLowerCase()}">${p.bird} Bird</span>`:''} ${p.opt?`<span class="opt-badge ${p.opt}">${p.opt}</span>`:''}</div>
    </div>
    ${isMine?`<button class="add-to-trade-btn" onclick="addToTradeFromDetail()">➕ Zum Trade hinzufügen</button>`:''}
    <div class="detail-section">
      <div class="detail-section-label">Vertrag</div>
      ${salRows}
      ${p.signed_via?`<div style="margin-top:8px;font-size:11px;color:var(--dim)">Signed via: ${p.signed_via}</div>`:''}
    </div>
    <div class="detail-section">
      <div class="detail-section-label">Status</div>
      <div class="detail-stat-grid">
        <div class="detail-stat"><div class="detail-stat-label">Trade Status</div><div class="detail-stat-val ${tradeColor}">${p.tradable_alone?'✓ Solo':p.tradable_agg?'Aggregiert':'✗ Nein'}</div></div>
        <div class="detail-stat"><div class="detail-stat-label">Bird Rights</div><div class="detail-stat-val ${birdColor}">${p.bird||'—'}</div></div>
        <div class="detail-stat"><div class="detail-stat-label">2026-27 Gehalt</div><div class="detail-stat-val">${fmt(p.sal_26)}</div></div>
        <div class="detail-stat"><div class="detail-stat-label">Läuft aus</div><div class="detail-stat-val ${!p.sal_27?'orange':''}">${!p.sal_27?'EXPIRING':'Laufend'}</div></div>
        ${optHtml}
      </div>
    </div>
    ${p.sal_26?`<div class="detail-section">
      <div class="detail-section-label">Max Re-Sign Schätzung</div>
      ${maxOfferHtml}
      <div style="font-size:10px;color:var(--muted);margin-top:6px">Für genaue Berechnung → Tools → Max Angebot</div>
    </div>`:''}
    ${!isMine?`<div style="padding:12px 16px"><button class="add-to-trade-btn" onclick="addToTradeFromDetail()" style="background:var(--surface2);color:var(--dim);border:1px solid var(--border);width:100%">➕ Trade hinzufügen</button></div>`:''}`;
}
function closeDetail(){
  selectedPlayer=null;
  document.getElementById('detail-panel').classList.remove('open');
  if(currentTeam) renderRoster();
}
function addToTradeFromDetail(){
  if(!selectedPlayer) return;
  const t=TEAMS[selectedPlayer.team];
  const p=t.players.find(x=>x.name===selectedPlayer.name);
  if(!p) return;
  const side=MY_TEAMS.includes(selectedPlayer.team)?'a':'b';
  if(!tradeTeam[side]){tradeTeam[side]=selectedPlayer.team;document.getElementById('trade-team-'+side).value=selectedPlayer.team;}
  addTradePlayer(side,{name:p.name,sal:p.sal_26,team:selectedPlayer.team});
  showPage('trade');setMobileNav('trade');
}

// ══ MAX OFFER CALC ════════════════
function calcMaxOffer(lastSal, bird, exp) {
  if(!lastSal) return null;
  const cap = CBA.cap;
  // Max by years
  let maxPct = 0.25; // default 0-6 years
  if(exp==='7') maxPct=0.30;
  if(exp==='10') maxPct=0.35;
  const maxContract = cap * maxPct;
  // Bird rights offer
  let birdOffer = 0, raise = 5;
  if(bird==='Full'||bird==='full') { birdOffer = lastSal * 1.05; raise = 8; }
  else if(bird==='Early'||bird==='early') { birdOffer = Math.max(lastSal * 1.75, CBA.avgSal * 1.05); raise = 8; }
  else { birdOffer = CBA.avgSal * 1.20; raise = 5; }
  const max = Math.min(maxContract, Math.max(birdOffer, cap * maxPct));
  return {max: Math.round(max), raise};
}

// ══ FA PAGE ══════════════════════
function setFASort(){
  const v=document.getElementById('fa-sort-select').value;
  const parts=v.match(/([a-z]+)(-?\d)/);
  if(parts){faSort.col=parts[1];faSort.dir=parseInt(parts[2]);}
  renderFA();
}
function renderFA(){
  const search=(document.getElementById('fa-search').value||'').toLowerCase();
  // Fair-Value-Verteilung nur unter den WIRKLICH verfügbaren Free Agents.
  const availableFAS=FAS.filter(f=>!f.signed_team);
  const totalFPG=availableFAS.reduce((s,f)=>s+(f.fpg||0),0);
  const ligaPot=12*CBA.cap;
  let fas=[...FAS].map(f=>({
    ...f,
    fairVal: (!f.signed_team && totalFPG>0) ? Math.round((f.fpg/totalFPG)*ligaPot) : null
  }));
  if(search) fas=fas.filter(f=>f.name.toLowerCase().includes(search));
  fas.sort((a,b)=>{
    let va=a[faSort.col]??0,vb=b[faSort.col]??0;
    if(typeof va==='string'){va=va.toLowerCase();vb=vb.toLowerCase();}
    return va<vb?faSort.dir:-faSort.dir;
  });
  const maxFpg=Math.max(...FAS.map(f=>f.fpg||0));
  function recBadge(rank,fpg,fairVal,signedTeam){
    if(signedTeam) return `<span class="rec-badge" style="opacity:.6">vergeben</span>`;
    if(rank<=10||fpg>=90) return `<span class="rec-badge max">Max oder nichts</span>`;
    if(rank<=30||fpg>=65) return `<span class="rec-badge high">25–30M/J</span>`;
    if(rank<=60||fpg>=45) return `<span class="rec-badge mid">15–20M/J</span>`;
    return `<span class="rec-badge min">MLE / Min</span>`;
  }
  let html=`<table class="fa-table"><thead><tr>
    <th>Spieler</th>
    <th class="right sorted">FPG</th>
    <th>Rang</th>
    <th class="right">💰 Fair Value</th>
    <th>Empfehlung</th>
  </tr></thead><tbody>`;
  fas.forEach((f,i)=>{
    const fpgPct=f.fpg&&maxFpg?Math.round(f.fpg/maxFpg*100):0;
    const origRank=FAS.findIndex(x=>x.name===f.name)+1;
    const safeName=f.name.replace(/'/g,"\\'");
    const signedTeamName=f.signed_team ? (TEAMS[f.signed_team]?.name || f.signed_team) : null;
    const rowStyle=f.signed_team ? ' style="opacity:.5"' : '';
    const nameCell=f.signed_team
      ? `${f.name} <span title="Bereits vergeben an: ${signedTeamName}" style="color:var(--dim);cursor:help">*</span>`
      : f.name;
    html+=`<tr class="fa-row"${rowStyle} onclick="selectFAForTools('${safeName}',${f.fpg||0},${f.fairVal||0})">
      <td><span style="font-weight:600">${nameCell}</span></td>
      <td class="right"><div class="fpg-bar-wrap"><div class="fpg-bar-track"><div class="fpg-bar-fill" style="width:${fpgPct}%"></div></div><span class="fpg-val">${f.fpg?.toFixed(1)||'—'}</span></div></td>
      <td style="color:var(--muted);font-family:var(--font-mono);font-size:11px">#${origRank}</td>
      <td class="right"><span class="fair-val">${f.fairVal!=null?fmtM(f.fairVal):'—'}</span></td>
      <td>${recBadge(origRank,f.fpg,f.fairVal,f.signed_team)}</td>
    </tr>`;
  });
  document.getElementById('fa-table-wrap').innerHTML=html+'</tbody></table>'
    +'<div style="font-size:11px;color:var(--dim);margin-top:8px">* bereits einem Team zugeordnet (im Sheet als Referenzwert gelistet, aber kein echter Free Agent mehr)</div>';
}
function selectFAForTools(name,fpg,fairVal){
  // Pre-fill max calc
  document.getElementById('maxcalc-player').value='';
  document.getElementById('maxcalc-last-sal').value='';
  // Send to trade manual
  document.getElementById('manual-name-a').value=name;
  showPage('trade');setMobileNav('trade');
}

// ══ TEAMS TABLE ══════════════════
function renderTeamsTable(){
  const sortBy=document.getElementById('teams-sort-select').value;
  let teams=Object.entries(TEAMS).map(([abbr,t])=>({
    abbr, ...t,
    space: Math.max(0, CBA.cap - t.total_salary),
    status: apronStatus(t.total_salary)
  }));
  if(sortBy==='salary') teams.sort((a,b)=>b.total_salary-a.total_salary);
  else if(sortBy==='space') teams.sort((a,b)=>b.space-a.space);
  else if(sortBy==='gm') teams.sort((a,b)=>(a.gm||'').localeCompare(b.gm||''));
  else teams.sort((a,b)=>a.name.localeCompare(b.name));

  let html=`<table class="teams-table"><thead><tr>
    <th>Team</th><th>GM</th><th class="right">Salary</th><th class="right">vs Cap</th><th class="right">Cap Space</th><th>Status</th><th>Richtung</th><th>Spieler</th>
  </tr></thead><tbody>`;
  teams.forEach(t=>{
    const isMine=MY_TEAMS.includes(t.abbr);
    const vsCap=t.total_salary-CBA.cap;
    const vsCapStr=vsCap>0?`<span style="color:var(--red)">+${fmtM(vsCap)}</span>`:`<span style="color:var(--green)">${fmtM(-vsCap)}</span>`;
    html+=`<tr class="team-row" onclick="selectTeam('${t.abbr}')">
      <td><div style="display:flex;align-items:center;gap:8px">
        <div class="team-dot" style="background:${t.c1};width:10px;height:10px;border-radius:50%"></div>
        <span style="font-weight:${isMine?'700':'400'}">${t.name}${isMine?' ⭐':''}</span>
      </div></td>
      <td style="color:var(--dim);font-size:11px">${t.gm||'—'}</td>
      <td class="right">${fmtM(t.total_salary)}</td>
      <td class="right">${vsCapStr}</td>
      <td class="right">${t.space>0?`<span style="color:var(--green)">${fmtM(t.space)}</span>`:'—'}</td>
      <td><span class="cap-pill ${t.status.cls}" style="display:inline-flex;font-size:10px;padding:2px 8px">${t.status.label}</span></td>
      <td>${directionBadge(t.abbr)}</td>
      <td style="color:var(--muted);font-family:var(--font-mono);font-size:11px">${t.players.length}</td>
    </tr>`;
  });
  document.getElementById('teams-table-wrap').innerHTML=html+'</tbody></table>';
}

// ══ TRADE CALCULATOR ═════════════
function populateTradeTeamSelects(){
  const sorted=Object.keys(TEAMS).sort((a,b)=>TEAMS[a].name.localeCompare(TEAMS[b].name));
  ['a','b'].forEach(side=>{
    const sel=document.getElementById('trade-team-'+side);
    sorted.forEach(abbr=>{
      const opt=document.createElement('option');
      opt.value=abbr;opt.textContent=TEAMS[abbr].name+' ('+abbr+')';
      sel.appendChild(opt);
    });
  });
  document.getElementById('trade-team-a').value='PHI';
  document.getElementById('trade-team-b').value='UT';
  tradeTeam.a='PHI';tradeTeam.b='UT';
}
function updateTradeSide(side){
  tradeTeam[side]=document.getElementById('trade-team-'+side).value;
  tradePlayers[side]=[];
  renderTradeList(side);
  renderTradeVerdict();
}
function showDropdown(side){
  const q=(document.getElementById('trade-search-'+side).value||'').toLowerCase().trim();
  const teamAbbr=tradeTeam[side];
  const dd=document.getElementById('dropdown-'+side);
  let candidates=[];
  if(teamAbbr&&TEAMS[teamAbbr]){
    candidates=TEAMS[teamAbbr].players.filter(p=>!q||p.name.toLowerCase().includes(q));
  } else {
    Object.entries(TEAMS).forEach(([abbr,t])=>t.players.forEach(p=>{
      if(!q||p.name.toLowerCase().includes(q)) candidates.push({...p,_team:abbr,_teamName:t.name});
    }));
  }
  candidates=candidates.slice(0,12);
  if(!candidates.length){dd.style.display='none';return;}
  dd.innerHTML=candidates.map(p=>{
    const teamLabel=p._teamName?` <span style="color:var(--muted);font-size:10px">${p._teamName}</span>`:'';
    const sn=p.name.replace(/'/g,"\\'");
    return `<div class="trade-dropdown-item" onclick="pickTradePlayer('${side}','${sn}',${p.sal_26||0})"><span>${p.name}</span>${teamLabel}<span class="item-sal">${fmtM(p.sal_26)}</span></div>`;
  }).join('');
  dd.style.display='block';
}
document.addEventListener('click',e=>{
  ['a','b'].forEach(side=>{
    const wrap=document.getElementById('picker-wrap-'+side);
    if(wrap&&!wrap.contains(e.target)) document.getElementById('dropdown-'+side).style.display='none';
  });
});
function pickTradePlayer(side,name,sal){
  document.getElementById('trade-search-'+side).value='';
  document.getElementById('dropdown-'+side).style.display='none';
  addTradePlayer(side,{name,sal,manual:false});
}
function addTradePlayer(side,player){
  if(tradePlayers[side].find(p=>p.name===player.name)) return;
  tradePlayers[side].push(player);
  renderTradeList(side);
  renderTradeVerdict();
}
function removeTradePlayer(side,idx){
  tradePlayers[side].splice(idx,1);
  renderTradeList(side);
  renderTradeVerdict();
}
function manualAdd(side){
  const name=document.getElementById('manual-name-'+side).value.trim();
  const sal=parseFloat(document.getElementById('manual-sal-'+side).value)||0;
  if(!name) return;
  addTradePlayer(side,{name,sal,manual:true});
  document.getElementById('manual-name-'+side).value='';
  document.getElementById('manual-sal-'+side).value='';
}
function renderTradeList(side){
  const list=document.getElementById('trade-players-'+side);
  const players=tradePlayers[side];
  if(!players.length){
    list.innerHTML='<div style="color:var(--muted);font-size:12px;padding:8px 0">Keine Spieler ausgewählt</div>';
  } else {
    list.innerHTML=players.map((p,i)=>`
      <div class="trade-player-chip">
        <div class="chip-name">${p.name}${p.manual?' <span style="font-size:10px;color:var(--muted)">(manuell)</span>':''}</div>
        <div class="chip-sal">${fmtM(p.sal)}</div>
        <button class="chip-remove" onclick="removeTradePlayer('${side}',${i})">✕</button>
      </div>`).join('');
  }
  const total=players.reduce((s,p)=>s+(p.sal||0),0);
  document.getElementById('total-'+side).textContent=fmtM(total);
}
function resetTrade(){
  tradePlayers={a:[],b:[]};
  tradeTeam.a=document.getElementById('trade-team-a').value;
  tradeTeam.b=document.getElementById('trade-team-b').value;
  ['a','b'].forEach(side=>{
    renderTradeList(side);
    ['trade-search-','manual-name-','manual-sal-'].forEach(id=>{const el=document.getElementById(id+side);if(el) el.value='';});
  });
  renderTradeVerdict();
}
function renderTradeVerdict(){
  const verdict=document.getElementById('trade-verdict');
  const totA=tradePlayers.a.reduce((s,p)=>s+(p.sal||0),0);
  const totB=tradePlayers.b.reduce((s,p)=>s+(p.sal||0),0);
  if(!totA&&!totB){
    verdict.innerHTML=`<div class="verdict-big empty">Spieler zu beiden Seiten hinzufügen, um den Trade zu analysieren.</div>`;
    renderTPE(0,0,'','');
    return;
  }
  const larger=Math.max(totA,totB),smaller=Math.min(totA,totB);
  let matching=false,matchingNote='';
  if(larger===0){matching=true;matchingNote='Kein Salary-Match nötig';}
  else if(larger<=7500000){matching=true;matchingNote='Unter $7.5M — vereinfachte Regeln';}
  else{const ratio=smaller/larger;matching=ratio>=0.85;matchingNote=`Match ${matching?'OK':'FAIL'}: ${(ratio*100).toFixed(1)}% (min 85%)`;}
  const teamA=tradeTeam.a?TEAMS[tradeTeam.a]:null;
  const teamB=tradeTeam.b?TEAMS[tradeTeam.b]:null;
  function apronCheck(team,out,inp){
    if(!team) return {ok:true,note:'Kein Team',newSal:0,status:{cls:''}};
    const newSal=team.total_salary-out+inp;
    const status=apronStatus(newSal);
    const ok=!(team.total_salary>=CBA.apron2&&inp>out);
    return {ok,note:`${fmtM(team.total_salary)} → ${fmtM(newSal)} (${status.label})`,newSal,status};
  }
  const checkA=apronCheck(teamA,totA,totB);
  const checkB=apronCheck(teamB,totB,totA);
  let apronOk=true,apronNote='';
  if(teamA&&teamA.total_salary>=CBA.apron2&&totB>totA){apronOk=false;apronNote+=`${teamA.name} über 2nd Apron — kann kein Gehalt absorbieren! `;}
  if(teamB&&teamB.total_salary>=CBA.apron2&&totA>totB){apronOk=false;apronNote+=`${teamB.name} über 2nd Apron — kann kein Gehalt absorbieren!`;}
  const isLegal=matching&&apronOk;
  verdict.innerHTML=`
    <div class="verdict-big ${isLegal?'legal':'illegal'}">${isLegal?'✅ TRADE LEGAL':'❌ TRADE ILLEGAL'} — CBA-Regeln ${isLegal?'erfüllt':'verletzt'}</div>
    <div class="verdict-item"><div class="verdict-item-label">SALARY MATCHING</div><div class="verdict-item-val ${matching?'ok':'bad'}">${matching?'✓ OK':'✗ FAIL'}</div><div style="font-size:11px;color:var(--dim);margin-top:3px">${matchingNote}</div></div>
    <div class="verdict-item"><div class="verdict-item-label">APRON-REGELUNG</div><div class="verdict-item-val ${apronOk?'ok':'bad'}">${apronOk?'✓ OK':'✗ VIOLATION'}</div>${apronNote?`<div style="font-size:11px;color:var(--red);margin-top:3px">${apronNote}</div>`:''}</div>
    <div class="verdict-item"><div class="verdict-item-label">DIFFERENZ</div><div class="verdict-item-val">${fmtM(Math.abs(totA-totB))}</div><div style="font-size:11px;color:var(--dim);margin-top:3px">${fmtM(totA)} ↔ ${fmtM(totB)}</div></div>
    <div class="verdict-item"><div class="verdict-item-label">MATCHING RATIO</div><div class="verdict-item-val ${larger>0&&smaller/larger>=0.85?'ok':'bad'}">${larger>0?(smaller/larger*100).toFixed(1)+'%':'—'}</div><div style="font-size:11px;color:var(--dim);margin-top:3px">Minimum: 85%</div></div>
    ${teamA?`<div class="verdict-item"><div class="verdict-item-label">${teamA.name}</div><div class="verdict-item-val ${checkA.status?.cls||''}">${fmtM(checkA.newSal)}</div><div style="font-size:11px;color:var(--dim);margin-top:3px">${checkA.note}</div></div>`:''}
    ${teamB?`<div class="verdict-item"><div class="verdict-item-label">${teamB.name}</div><div class="verdict-item-val ${checkB.status?.cls||''}">${fmtM(checkB.newSal)}</div><div style="font-size:11px;color:var(--dim);margin-top:3px">${checkB.note}</div></div>`:''}`;
  renderTPE(totA,totB,tradeTeam.a,tradeTeam.b);
}

// ══ TPE RECHNER ══════════════════
function renderTPE(totA,totB,teamAAbbr,teamBAbbr){
  const el=document.getElementById('tpe-results');
  if(!totA&&!totB){el.innerHTML='<div style="color:var(--muted);font-size:12px">Füge Spieler hinzu um TPEs zu berechnen.</div>';return;}
  let html='';
  function tpeFor(salOut,salIn,abbr){
    if(salOut<=salIn) return null; // No TPE - received more than sent
    const tpeSize=salOut-salIn;
    const teamName=abbr&&TEAMS[abbr]?TEAMS[abbr].name:abbr||'Team';
    const isApron2=(abbr&&TEAMS[abbr]&&TEAMS[abbr].total_salary>=CBA.apron2);
    const expire=new Date();expire.setFullYear(expire.getFullYear()+1);
    const expireStr=expire.toLocaleDateString('de-DE',{month:'short',year:'numeric'});
    return {tpeSize,teamName,expireStr,isApron2,abbr};
  }
  const tpeA=tpeFor(totA,totB,teamAAbbr);
  const tpeB=tpeFor(totB,totA,teamBAbbr);
  [tpeA,tpeB].forEach(tpe=>{
    if(!tpe) return;
    const warn=tpe.isApron2?'⚠️ 2nd Apron: TPE stark eingeschränkt':'';
    html+=`<div class="tpe-card">
      <div class="tpe-card-name">💜 ${tpe.teamName} erhält TPE: ${fmtM(tpe.tpeSize)}</div>
      <div class="tpe-card-details">
        Läuft ab: ~${tpe.expireStr} · Nicht kombinierbar mit anderen TPEs<br>
        Nutzbar für: FA signen bis ${fmtM(tpe.tpeSize)} (Non-Bird) · Trade absorbieren bis ${fmtM(tpe.tpeSize)}<br>
        ${warn}
      </div>
    </div>`;
  });
  if(!tpeA&&!tpeB) html='<div style="color:var(--muted);font-size:12px">Kein Team erhält eine TPE — Salary ausgeglichen.</div>';
  el.innerHTML=html;
}

// ══ TRADE FINDER ═════════════════
function populateFinderPlayers(){
  const sel=document.getElementById('finder-player');
  sel.innerHTML='<option value="">— Spieler wählen —</option>';
  MY_TEAMS.forEach(abbr=>{
    const t=TEAMS[abbr];
    const og=document.createElement('optgroup');
    og.label=t.name;
    t.players.filter(p=>p.sal_26>1000).forEach(p=>{
      const opt=document.createElement('option');
      opt.value=JSON.stringify({name:p.name,sal:p.sal_26,team:abbr});
      opt.textContent=`${p.name} (${fmtM(p.sal_26)})`;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });
  // Also populate finder-target
  const tSel=document.getElementById('finder-target');
  tSel.innerHTML='<option value="all">🌍 Gesamter Markt</option>';
  Object.keys(TEAMS).sort((a,b)=>TEAMS[a].name.localeCompare(TEAMS[b].name)).forEach(abbr=>{
    if(MY_TEAMS.includes(abbr)) return;
    const opt=document.createElement('option');
    opt.value=abbr;opt.textContent=TEAMS[abbr].name;
    tSel.appendChild(opt);
  });
}
function runTradeFinder(){
  const playerVal=document.getElementById('finder-player').value;
  const manualSal=parseFloat(document.getElementById('finder-sal').value)||0;
  const target=document.getElementById('finder-target').value;
  const dirFilter=document.getElementById('finder-direction').value;
  let salOut=0,playerName='Manuell';
  if(playerVal){try{const p=JSON.parse(playerVal);salOut=p.sal;playerName=p.name;}catch(e){}}
  if(manualSal>0){salOut=manualSal;}
  if(!salOut){document.getElementById('finder-results').innerHTML='<div style="color:var(--red);font-size:12px;padding:8px">Bitte Spieler oder Gehalt eingeben.</div>';return;}
  const minMatch=salOut>7500000?salOut*0.85:0;
  const maxMatch=salOut<=7500000?salOut*2:salOut+5000000;
  // Search teams
  let searchTeams=Object.keys(TEAMS).filter(abbr=>!MY_TEAMS.includes(abbr));
  if(target!=='all') searchTeams=searchTeams.filter(a=>a===target);
  if(dirFilter==='rebuild') searchTeams.sort((a,b)=>{
    const da=(DIRECTIONS[a]||'').toLowerCase(),db=(DIRECTIONS[b]||'').toLowerCase();
    return (db.includes('rebuild')||db.includes('tank'))-(da.includes('rebuild')||da.includes('tank'));
  });
  if(dirFilter==='contend') searchTeams.sort((a,b)=>{
    const da=(DIRECTIONS[a]||'').toLowerCase(),db=(DIRECTIONS[b]||'').toLowerCase();
    return (db.includes('contend')||db.includes('dynasty'))-(da.includes('contend')||da.includes('dynasty'));
  });
  let results=[];
  searchTeams.forEach(abbr=>{
    const t=TEAMS[abbr];
    // Find single player matches
    t.players.filter(p=>p.sal_26>1000).forEach(p=>{
      if(p.sal_26>=minMatch&&p.sal_26<=maxMatch){
        results.push({team:abbr,players:[p],total:p.sal_26,type:'1-for-1'});
      }
    });
    // Find 2-player combos
    const players=t.players.filter(p=>p.sal_26>1000&&p.sal_26<maxMatch);
    for(let i=0;i<players.length&&i<15;i++){
      for(let j=i+1;j<players.length&&j<15;j++){
        const combo=players[i].sal_26+players[j].sal_26;
        if(combo>=minMatch&&combo<=maxMatch){
          results.push({team:abbr,players:[players[i],players[j]],total:combo,type:'2-for-1'});
        }
      }
    }
  });
  // Sort by closeness to salOut
  results.sort((a,b)=>Math.abs(a.total-salOut)-Math.abs(b.total-salOut));
  results=results.slice(0,15);
  if(!results.length){
    document.getElementById('finder-results').innerHTML=`<div style="color:var(--muted);font-size:12px;padding:12px 0">Keine passenden Matches gefunden für ${fmtM(salOut)} (Fenster: ${fmtM(minMatch)} – ${fmtM(maxMatch)}).</div>`;
    return;
  }
  let html=`<div style="font-size:12px;color:var(--dim);margin-bottom:10px;margin-top:8px">
    ${playerName}: ${fmtM(salOut)} · Matching-Fenster: ${fmtM(Math.round(minMatch))} – ${fmtM(Math.round(maxMatch))} · ${results.length} Ergebnisse
  </div>`;
  results.forEach(r=>{
    const t=TEAMS[r.team];
    const diff=r.total-salOut;
    const diffStr=diff===0?'±0':diff>0?`+${fmtM(diff)}`:`-${fmtM(-diff)}`;
    const ratio=Math.min(r.total,salOut)/Math.max(r.total,salOut)*100;
    const isLegal=ratio>=85||salOut<=7500000;
    const dir=DIRECTIONS[r.team]||'';
    html+=`<div class="trade-match-card">
      <div class="trade-match-header">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="team-dot" style="background:${t.c1};width:10px;height:10px;border-radius:50%"></div>
          <span class="trade-match-team">${t.name}</span>
          ${dir?`<span style="font-size:10px;color:var(--dim)">${dir}</span>`:''}
        </div>
        <span class="trade-match-status ${isLegal?'legal':'illegal'}">${isLegal?'✓ Legal':'✗ Illegal'}</span>
      </div>
      <div class="trade-match-players">
        ${r.players.map(p=>`<span class="match-player">${p.name} <span style="color:var(--dim)">${fmtM(p.sal_26)}</span></span>`).join(' + ')}
      </div>
      <div class="match-salary-info">Match: ${fmtM(r.total)} (${ratio.toFixed(1)}%) · Differenz: ${diffStr} · ${r.type}</div>
    </div>`;
  });
  document.getElementById('finder-results').innerHTML=html;
}

// ══ MAX CALC (Tools) ══════════════
function populateMaxCalcFA(){
  const sel=document.getElementById('maxcalc-player');
  sel.innerHTML='<option value="">— oder manuell eingeben —</option>';
  FAS.filter(f=>!f.signed_team).forEach(f=>{
    const opt=document.createElement('option');
    opt.value=JSON.stringify({name:f.name,fpg:f.fpg});
    opt.textContent=f.name+` (${f.fpg?.toFixed(1)||'?'} FPG)`;
    sel.appendChild(opt);
  });
}
function prefillMaxCalc(){
  const val=document.getElementById('maxcalc-player').value;
  if(!val) return;
  // We can't know last salary from FA list alone, but user can fill it
}
function calcMax(){
  const lastSal=parseFloat(document.getElementById('maxcalc-last-sal').value)||0;
  const exp=document.getElementById('maxcalc-exp').value;
  const bird=document.getElementById('maxcalc-bird').value;
  if(!lastSal){document.getElementById('maxcalc-results').innerHTML='<div style="color:var(--red);font-size:12px">Bitte letztes Gehalt eingeben.</div>';return;}
  const cap=CBA.cap;
  let maxPct=0.25;
  if(exp==='7') maxPct=0.30;
  if(exp==='10') maxPct=0.35;
  const maxByYears=cap*maxPct;
  let birdStart=0,raise=5,method='';
  if(bird==='full'){birdStart=lastSal*1.05;raise=8;method='Full Bird: 105% letztes Gehalt';}
  else if(bird==='early'){birdStart=Math.max(lastSal*1.75,CBA.avgSal*1.05);raise=8;method='Early Bird: 175% letztes Gehalt (min 105% Avg Salary)';}
  else{birdStart=CBA.avgSal*1.20;raise=5;method='Non-Bird: 120% Avg Salary';}
  const startSal=Math.min(maxByYears,Math.max(birdStart,maxByYears));
  const yr1=Math.round(startSal);
  const yr2=Math.round(yr1*(1+raise/100));
  const yr3=Math.round(yr2*(1+raise/100));
  const yr4=Math.round(yr3*(1+raise/100));
  const yr5=Math.round(yr4*(1+raise/100));
  const totalContract4=yr1+yr2+yr3+yr4;
  document.getElementById('maxcalc-results').innerHTML=`
    <div class="result-card">
      <div class="result-card-title">💰 Max-Angebot: ${(maxPct*100).toFixed(0)}% des Caps</div>
      <div class="result-row"><span class="result-label">Methode</span><span class="result-val">${method}</span></div>
      <div class="result-row"><span class="result-label">Jahr 1 (2026-27)</span><span class="result-val good">${fmt(yr1)}</span></div>
      <div class="result-row"><span class="result-label">Jahr 2 (2027-28)</span><span class="result-val">${fmt(yr2)}</span></div>
      <div class="result-row"><span class="result-label">Jahr 3 (2028-29)</span><span class="result-val">${fmt(yr3)}</span></div>
      <div class="result-row"><span class="result-label">Jahr 4 (2029-30)</span><span class="result-val">${fmt(yr4)}</span></div>
      <div class="result-row"><span class="result-label">Steigerung/Jahr</span><span class="result-val">${raise}%</span></div>
      <div class="result-row"><span class="result-label">Gesamt (4 Jahre)</span><span class="result-val purple">${fmt(totalContract4)}</span></div>
    </div>`;
}

// ══ FAIR VALUE TABLE ══════════════
function renderFairValueTable(){
  const nTeams=parseInt(document.getElementById('fv-teams').value)||12;
  const nSpots=parseInt(document.getElementById('fv-spots').value)||13;
  const factor=parseFloat(document.getElementById('fv-factor').value)||1.0;
  // Use top N players by FPG as the league pool
  const topN=nTeams*nSpots;
  const pool=FAS.filter(f=>f.fpg>0&&!f.signed_team).sort((a,b)=>b.fpg-a.fpg).slice(0,topN);
  const totalFPG=pool.reduce((s,f)=>s+f.fpg,0);
  const ligaPot=nTeams*CBA.cap*factor;
  const maxFpg=pool[0]?.fpg||1;
  let html=`<div style="font-size:11px;color:var(--dim);margin-bottom:12px">
    Liga-Pool: ${nTeams} Teams × ${nSpots} Plätze = ${topN} Spieler · Gesamtgehälter: ${fmtM(ligaPot)} · Faktor: ${factor}×
  </div>
  <table class="fa-table"><thead><tr>
    <th>Spieler</th><th class="right">FPG</th><th class="right">FPG-Anteil</th><th class="right">💰 Fair Value</th><th class="right">CBA Max (Est)</th><th>Bewertung</th>
  </tr></thead><tbody>`;
  pool.forEach((f,i)=>{
    const share=f.fpg/totalFPG;
    const fairVal=Math.round(share*ligaPot);
    const maxEst=Math.round(CBA.cap*(f.fpg>=90?0.35:f.fpg>=60?0.30:0.25));
    const ratio=fairVal/maxEst;
    let rating='',ratingCls='';
    if(ratio>=0.9){rating='🟢 Schnäppchen';ratingCls='good';}
    else if(ratio>=0.6){rating='🟡 Fair';ratingCls='warn';}
    else{rating='🔴 Überzahlen';ratingCls='bad';}
    html+=`<tr class="fa-row">
      <td><span style="font-weight:600">#${i+1} ${f.name}</span></td>
      <td class="right" style="font-family:var(--font-mono)">${f.fpg.toFixed(1)}</td>
      <td class="right" style="font-family:var(--font-mono);color:var(--dim)">${(share*100).toFixed(2)}%</td>
      <td class="right"><span class="fair-val" style="font-size:12px">${fmtM(fairVal)}</span></td>
      <td class="right" style="font-family:var(--font-mono);font-size:11px;color:var(--muted)">${fmtM(maxEst)}</td>
      <td><span class="result-val ${ratingCls}" style="font-size:11px">${rating}</span></td>
    </tr>`;
  });
  document.getElementById('fv-table-wrap').innerHTML=html+'</tbody></table>';
}


// ══ OFF SEASON PLANER ════════════════════════════════════════════
let osDecisions = {}; // { playerName: { action:'keep'|'cut'|'trade', method:'bird'|'early'|'non'|'room'|'mle'|'min', salary:number } }

function populateOSTeamSelect(){
  const sel = document.getElementById('os-team');
  sel.innerHTML = '';
  MY_TEAMS.forEach(abbr => {
    const opt = document.createElement('option');
    opt.value = abbr;
    opt.textContent = TEAMS[abbr].name;
    sel.appendChild(opt);
  });
  renderOffSeason();
  // Ensure summary renders after DOM is ready
  setTimeout(() => updateOSSummary(sel.value || MY_TEAMS[0]), 50);
}

function renderOffSeason(){
  const abbr = document.getElementById('os-team').value;
  if(!abbr || !TEAMS[abbr]) return;
  const t = TEAMS[abbr];
  const players = t.players.filter(p => p.sal_26 > 100);
  const wrap = document.getElementById('os-roster-cards');
  wrap.innerHTML = '';
  players.forEach(p => {
    if(!osDecisions[abbr+p.name]) {
      osDecisions[abbr+p.name] = { action: 'keep', method: p.bird==='Full'?'bird':p.bird==='Early'?'early':'non', salary: p.sal_26 };
    }
    const d = osDecisions[abbr+p.name];
    const card = document.createElement('div');
    card.className = 'os-player-card';
    card.id = 'os-card-'+abbr+p.name.replace(/[^a-z0-9]/gi,'_');
    const birdOpts = [
      p.bird==='Full' ? `<button class="os-btn ${d.method==='bird'?'active-method':''}" onclick="osSetMethod('${abbr}','${p.name}','bird')">🟢 Full Bird</button>` : '',
      p.bird==='Early' ? `<button class="os-btn ${d.method==='early'?'active-method':''}" onclick="osSetMethod('${abbr}','${p.name}','early')">🟡 Early Bird</button>` : '',
      p.bird==='Non' ? `<button class="os-btn ${d.method==='non'?'active-method':''}" onclick="osSetMethod('${abbr}','${p.name}','non')">🔴 Non-Bird</button>` : '',
      `<button class="os-btn ${d.method==='mle'?'active-method':''}" onclick="osSetMethod('${abbr}','${p.name}','mle')">MLE</button>`,
      `<button class="os-btn ${d.method==='room'?'active-method':''}" onclick="osSetMethod('${abbr}','${p.name}','room')">Room</button>`,
      `<button class="os-btn ${d.method==='min'?'active-method':''}" onclick="osSetMethod('${abbr}','${p.name}','min')">Min</button>`,
    ].filter(Boolean).join('');
    const expiring = !p.sal_27;
    card.innerHTML = `
      <div class="os-player-header" onclick="osToggleCard('${abbr}','${p.name}')">
        <div class="os-player-name">${p.name} ${expiring?'<span style="color:var(--yellow);font-size:10px">EXPIRING</span>':''} ${p.opt?'<span class="opt-badge '+p.opt+'" style="font-size:9px">'+p.opt+'</span>':''}</div>
        <div class="os-player-meta">${p.pos} · ${fmtM(p.sal_26)}</div>
        <span id="os-action-badge-${abbr}_${p.name.replace(/[^a-z0-9]/gi,'_')}" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;${d.action==='keep'?'background:var(--green-dim);color:var(--green)':d.action==='cut'?'background:var(--red-dim);color:var(--red)':'background:var(--orange-dim);color:var(--orange)'}">${d.action==='keep'?'✓ KEEP':d.action==='cut'?'✗ CUT':'→ TRADE'}</span>
      </div>
      <div class="os-player-body" id="os-body-${abbr}_${p.name.replace(/[^a-z0-9]/gi,'_')}" style="display:none">
        <div class="os-decision-row">
          <span class="os-decision-label">Entscheidung</span>
          <div class="os-btn-group">
            <button class="os-btn ${d.action==='keep'?'active-keep':''}" onclick="osSetAction('${abbr}','${p.name}','keep')">✓ Behalten</button>
            <button class="os-btn ${d.action==='cut'?'active-cut':''}" onclick="osSetAction('${abbr}','${p.name}','cut')">✗ Entlassen</button>
            <button class="os-btn ${d.action==='trade'?'active-trade':''}" onclick="osSetAction('${abbr}','${p.name}','trade')">→ Traden</button>
          </div>
        </div>
        <div class="os-decision-row" id="os-method-row-${abbr}_${p.name.replace(/[^a-z0-9]/gi,'_')}" style="${d.action!=='keep'?'opacity:.4;pointer-events:none':''}">
          <span class="os-decision-label">Methode</span>
          <div class="os-btn-group">${birdOpts}</div>
        </div>
        <div class="os-decision-row" id="os-sal-row-${abbr}_${p.name.replace(/[^a-z0-9]/gi,'_')}" style="${d.action!=='keep'?'opacity:.4;pointer-events:none':''}">
          <span class="os-decision-label">Gehalt</span>
          <input class="os-salary-input" type="number" value="${Math.round(d.salary)}"
            onchange="osSetSalary('${abbr}','${p.name}',this.value)"
            placeholder="Gehalt $">
          <span style="font-size:11px;color:var(--dim);font-family:var(--font-mono)">${fmtM(p.sal_26)} aktuell</span>
        </div>
      </div>`;
    wrap.appendChild(card);
  });
  updateOSSummary(abbr);
}

function osToggleCard(abbr, name){
  const id = abbr+'_'+name.replace(/[^a-z0-9]/gi,'_');
  const body = document.getElementById('os-body-'+id);
  if(body) body.style.display = body.style.display==='none' ? 'flex' : 'none';
}

function osSetAction(abbr, name, action){
  const key = abbr+name;
  if(!osDecisions[key]) osDecisions[key] = {};
  osDecisions[key].action = action;
  renderOffSeason();
  updateOSSummary(abbr);
}
function osSetMethod(abbr, name, method){
  const key = abbr+name;
  if(!osDecisions[key]) osDecisions[key] = {};
  osDecisions[key].method = method;
  // Auto-fill salary based on method
  const t = TEAMS[abbr];
  const p = t.players.find(x=>x.name===name);
  if(p){
    if(method==='bird') osDecisions[key].salary = Math.round(p.sal_26*1.05);
    else if(method==='early') osDecisions[key].salary = Math.round(Math.max(p.sal_26*1.75, 10000000));
    else if(method==='mle') osDecisions[key].salary = 15048000;
    else if(method==='room') osDecisions[key].salary = 9369000;
    else if(method==='min') osDecisions[key].salary = 2296272;
    else if(method==='non') osDecisions[key].salary = 10000000;
  }
  renderOffSeason();  updateOSSummary(abbr);
}
function osSetSalary(abbr, name, val){
  const key = abbr+name;
  if(!osDecisions[key]) osDecisions[key] = {};
  osDecisions[key].salary = parseFloat(val)||0;
  updateOSSummary(abbr);
}

function updateOSSummary(abbr){
  const t = TEAMS[abbr];
  if(!t) return;
  const oc = OWNER_CAPS[abbr] || {};
  const players = t.players.filter(p => p.sal_26 > 100);

  let keepTotal = 0, keepCount = 0, cutCount = 0, tradeCount = 0;
  let lockedSal = 0; // players with multi-year deals we can't easily cut

  players.forEach(p => {
    const key = abbr+p.name;
    const d = osDecisions[key] || {action:'keep', salary: p.sal_26};
    if(d.action === 'keep'){
      keepTotal += (d.salary||p.sal_26);
      keepCount++;
    } else if(d.action === 'cut') cutCount++;
    else tradeCount++;
    // Locked salary = players with guaranteed future years regardless of decision
    if(p.sal_27 && d.action !== 'trade') lockedSal += p.sal_27;
  });

  const ownerCap = oc.owner_cap || 0;
  const ownerLeft = ownerCap - keepTotal;
  const vsApron1 = keepTotal - CBA.apron1;
  const vsApron2 = keepTotal - CBA.apron2;
  const vsTax = keepTotal - CBA.tax;
  const vsCap = keepTotal - CBA.cap;

  // Determine apron status and restrictions
  const restrictions = [];
  if(keepTotal >= CBA.apron2){
    restrictions.push('❌ 2nd Apron: Kein Salary in Trades absorbieren');
    restrictions.push('❌ 2nd Apron: Kein MLE nutzbar (nur Bi-Annual Exception)');
    restrictions.push('❌ 2nd Apron: Picks können nicht getradet werden (future 1sts)');
    restrictions.push('❌ 2nd Apron: Keine simultanen Sign & Trades');
    restrictions.push('⚠️ Luxury Tax Repeater-Strafe möglich');
  } else if(keepTotal >= CBA.apron1){
    restrictions.push('⚠️ 1st Apron: Nur Tax MLE ($6.07M) nutzbar, kein Non-Tax MLE');
    restrictions.push('⚠️ 1st Apron: Eingeschränkter Zugang zu Sign & Trades');
    restrictions.push('⚠️ 1st Apron: Keine aggregierten Trades die Salary erhöhen');
  } else if(keepTotal >= CBA.tax){
    restrictions.push('ℹ️ Luxury Tax: MLE verfügbar ($6.07M Tax MLE oder $15M Non-Tax)');
    restrictions.push('ℹ️ Luxury Tax Zahlung fällig — abhängig von Repeater-Status');
  }
  if(ownerLeft < 0){
    restrictions.push(`🚨 OWNER CAP ÜBERSCHRITTEN um ${fmtM(-ownerLeft)} — Transaktionen blockiert!`);
  }

  const summaryEl = document.getElementById('os-summary');
  const statusColor = keepTotal>=CBA.apron2?'var(--red)':keepTotal>=CBA.apron1?'var(--orange)':keepTotal>=CBA.tax?'var(--yellow)':'var(--green)';
  const statusLabel = keepTotal>=CBA.apron2?'2nd Apron':keepTotal>=CBA.apron1?'1st Apron':keepTotal>=CBA.tax?'Luxury Tax':keepTotal>=CBA.cap?'Over Cap':'Under Cap';

  summaryEl.innerHTML = `
    <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-family:var(--font-display);font-size:16px;letter-spacing:.5px">📊 Off Season Zusammenfassung</span>
      <span class="cap-pill" style="background:var(--surface2);color:${statusColor};border:1px solid ${statusColor};font-size:11px">${statusLabel}: ${fmtM(keepTotal)}</span>
    </div>
    <div class="os-summary-grid">
      <div class="os-summary-item">
        <div class="os-summary-label">Projektiertes Gehalt</div>
        <div class="os-summary-val" style="color:${statusColor}">${fmtM(keepTotal)}</div>
      </div>
      <div class="os-summary-item">
        <div class="os-summary-label">vs Salary Cap ($165M)</div>
        <div class="os-summary-val" style="color:${vsCap>0?'var(--red)':'var(--green)'}">${vsCap>0?'+':'-'}${fmtM(Math.abs(vsCap))}</div>
      </div>
      <div class="os-summary-item">
        <div class="os-summary-label">vs Luxury Tax ($201M)</div>
        <div class="os-summary-val" style="color:${vsTax>0?'var(--red)':'var(--green)'}">${vsTax>0?'+':'-'}${fmtM(Math.abs(vsTax))}</div>
      </div>
      <div class="os-summary-item">
        <div class="os-summary-label">vs 1st Apron ($209M)</div>
        <div class="os-summary-val" style="color:${vsApron1>0?'var(--red)':'var(--green)'}">${vsApron1>0?'+':'-'}${fmtM(Math.abs(vsApron1))}</div>
      </div>
      <div class="os-summary-item">
        <div class="os-summary-label">vs 2nd Apron ($222M)</div>
        <div class="os-summary-val" style="color:${vsApron2>0?'var(--red)':'var(--green)'}">${vsApron2>0?'+':'-'}${fmtM(Math.abs(vsApron2))}</div>
      </div>
      <div class="os-summary-item">
        <div class="os-summary-label">Owner Cap (${fmtM(ownerCap)})</div>
        <div class="os-summary-val" style="color:${ownerLeft<0?'var(--red)':'var(--green)'}">Noch: ${fmtM(Math.abs(ownerLeft))} ${ownerLeft<0?'ÜBER':'frei'}</div>
      </div>
      <div class="os-summary-item">
        <div class="os-summary-label">Entscheidungen</div>
        <div class="os-summary-val" style="font-size:12px">✓${keepCount} ✗${cutCount} →${tradeCount}</div>
      </div>
    </div>
    ${restrictions.length > 0
      ? `<div class="os-restrictions"><div style="font-weight:700;margin-bottom:6px">⚠️ Apron-Restriktionen bei ${fmtM(keepTotal)}:</div>${restrictions.map(r=>`<div class="os-restriction-item">${r}</div>`).join('')}</div>`
      : `<div class="os-ok">✅ Kein Apron-Problem — alle CBA-Tools verfügbar</div>`
    }`;
}

// ══ INIT ══════════════════════════
async function loadDataAndInit(){
  const wrap = document.getElementById('app');
  try {
    const res = await fetch('data/data.json', {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    DIRECTIONS = data.directions || {};
    OWNER_CAPS = data.owner_caps || {};
    TEAMS = data.teams || {};
    FAS = data.fas || [];
    MY_TEAMS = data.my_teams || [];
    CBA = data.cba || CBA;
    currentTeam = MY_TEAMS[0] || Object.keys(TEAMS)[0];
  } catch(err) {
    console.error('Failed to load data/data.json', err);
    if(wrap) wrap.innerHTML = '<div style="padding:40px;text-align:center;color:#ff4560;font-family:sans-serif">⚠️ Konnte data/data.json nicht laden.<br><small>'+err+'</small></div>';
    return;
  }
  buildSidebar();
  setTeamColors(currentTeam);
  updateMobileStrip(currentTeam);
  populateTradeTeamSelects();
  populateFinderPlayers();
  populateMaxCalcFA();
  renderTeam();
  renderFA();
  renderTradeVerdict();
  renderTeamsTable();
  renderFairValueTable();
  populateOSTeamSelect();
}
loadDataAndInit();

// ══ FEATURES v5: Sparklines, Compat, Owner Cap, Export, Shortcuts ══
function makeSparkline(player) {
  const Y=['sal_26','sal_27','sal_28','sal_29','sal_30'];
  const vals=Y.map(y=>player[y]||0);
  const nz=vals.filter(v=>v>0);
  if(nz.length<2) return '';
  const max=Math.max(...nz);
  return '<div class="sparkline-wrap">'+vals.map((v,i)=>{
    if(!v) return '';
    const h=Math.max(2,Math.round((v/max)*16));
    const prev=i>0?vals[i-1]:null;
    let cls=!vals[i+1]&&v?'expiring':prev&&prev>0&&(v-prev)/prev>0.15?'jump':'';
    return `<div class="sparkline-bar ${cls}" style="height:${h}px" title="$${(v/1e6).toFixed(1)}M"></div>`;
  }).join('')+'</div>';
}
function calcCompatScore(abbr,inSal,outSal){
  if(!abbr||!TEAMS[abbr]) return null;
  const t=TEAMS[abbr],oc=OWNER_CAPS[abbr]||{};
  const newT=t.total_salary-outSal+inSal,cap=oc.owner_cap||0;
  let s=100,notes=[];
  if(newT>=CBA.apron2){s-=40;notes.push('2nd Apron');}
  else if(newT>=CBA.apron1){s-=20;notes.push('1st Apron');}
  else if(newT>=CBA.tax){s-=8;notes.push('Luxury Tax');}
  else if(newT<CBA.cap){s+=5;notes.push('Under Cap ✓');}
  if(cap>0){const p=newT/cap;if(p>1){s-=30;notes.push('Owner Cap ÜBER');}else if(p>0.92){s-=10;notes.push('Owner Cap knapp');}}
  s=Math.max(0,Math.min(100,s));
  const cls=s>=80?'great':s>=60?'cok':s>=40?'cwarn':'bad';
  const label=s>=80?'✓ Solid':s>=60?'~ OK':s>=40?'⚠ Risky':'✗ Problem';
  return{score:s,cls,label,notes,newTotal:newT};
}
// Wrap renderTradeVerdict to inject compat scores
(function(){
  const orig=renderTradeVerdict;
  renderTradeVerdict=function(){
    orig();
    const totA=tradePlayers.a.reduce((s,p)=>s+(p.sal||0),0);
    const totB=tradePlayers.b.reduce((s,p)=>s+(p.sal||0),0);
    if(!totA&&!totB) return;
    const cA=calcCompatScore(tradeTeam.a,totB,totA);
    const cB=calcCompatScore(tradeTeam.b,totA,totB);
    const verdict=document.getElementById('trade-verdict');
    if(!verdict) return;
    const items=[...verdict.querySelectorAll('.verdict-item')];
    [cA,cB].forEach((c,i)=>{
      const el=items[items.length-2+i];
      if(!c||!el||el.querySelector('.compat-badge')) return;
      const d=document.createElement('div');
      d.style.marginTop='6px';
      d.innerHTML=`<span class="compat-badge ${c.cls}">${c.label} ${c.score}/100</span><div style="font-size:10px;color:var(--dim);margin-top:2px">${c.notes.join(' · ')}</div>`;
      el.appendChild(d);
    });
  };
})();
// Wrap renderRoster to inject sparklines
(function(){
  const orig=renderRoster;
  renderRoster=function(){
    orig();
    const t=TEAMS[currentTeam];if(!t) return;
    const wrap=document.getElementById('roster-table-wrap');if(!wrap) return;
    const thead=wrap.querySelector('thead tr');
    if(thead&&!thead.querySelector('[data-spark]')){
      const th=document.createElement('th');
      th.setAttribute('data-spark','1');
      th.style.cssText='text-align:center;font-size:9px;letter-spacing:.5px;color:var(--muted)';
      th.textContent='TREND';
      const ths=thead.querySelectorAll('th');
      if(ths.length>=7) thead.insertBefore(th,ths[7]);
    }
    wrap.querySelectorAll('tr.player-row').forEach(row=>{
      if(row.querySelector('.sparkline-wrap')) return;
      const nameEl=row.querySelector('.player-name-cell span:last-child');
      if(!nameEl) return;
      const p=t.players.find(x=>x.name===nameEl.textContent);
      if(!p) return;
      const td=document.createElement('td');
      td.style.textAlign='center';
      td.innerHTML=makeSparkline(p);
      const cells=row.querySelectorAll('td');
      if(cells[7]) row.insertBefore(td,cells[7]);
    });
  };
})();
// Owner Cap Dashboard
function renderOwnerCapDashboard(){
  const sortBy=(document.getElementById('oc-sort-select')||{}).value||'pct';
  let teams=Object.entries(TEAMS).map(([abbr,t])=>{
    const oc=OWNER_CAPS[abbr]||{},cap=oc.owner_cap||0,used=t.total_salary;
    return{abbr,name:t.name,gm:t.gm||'—',c1:t.c1,cap,used,left:cap-used,pct:cap>0?used/cap*100:0,isMine:MY_TEAMS.includes(abbr)};
  });
  if(sortBy==='pct') teams.sort((a,b)=>b.pct-a.pct);
  else if(sortBy==='left') teams.sort((a,b)=>b.left-a.left);
  else if(sortBy==='cap') teams.sort((a,b)=>b.cap-a.cap);
  else teams.sort((a,b)=>a.name.localeCompare(b.name));
  let html=`<table class="oc-table"><thead><tr><th>Team</th><th>GM</th><th class="right">Owner Cap</th><th class="right">Salary</th><th class="right">Verbleibend</th><th>Auslastung</th></tr></thead><tbody>`;
  teams.forEach(t=>{
    const over=t.left<0,pb=Math.min(t.pct,100);
    const bc=t.pct>=100?'var(--red)':t.pct>=92?'var(--orange)':t.pct>=80?'var(--yellow)':'var(--green)';
    const lc=over?'var(--red)':t.left<8e6?'var(--orange)':'var(--green)';
    html+=`<tr class="oc-row"><td><div style="display:flex;align-items:center;gap:8px"><div class="team-dot" style="background:${t.c1}"></div><span style="font-weight:${t.isMine?700:400}">${t.name}${t.isMine?' ⭐':''}</span></div></td><td style="color:var(--dim);font-size:11px">${t.gm}</td><td class="right">$${(t.cap/1e6).toFixed(1)}M</td><td class="right">$${(t.used/1e6).toFixed(1)}M</td><td class="right" style="color:${lc};font-family:var(--font-mono);font-weight:600">${over?'–':'+'}$${(Math.abs(t.left)/1e6).toFixed(1)}M</td><td><div class="oc-bar-wrap"><div class="oc-bar-track"><div class="oc-bar-fill" style="width:${pb}%;background:${bc}"></div></div><span class="oc-pct" style="color:${bc}">${t.pct.toFixed(0)}%</span></div></td></tr>`;
  });
  const el=document.getElementById('oc-table-wrap');
  if(el) el.innerHTML=html+'</tbody></table>';
}
// Export functions
function exportRosterCSV(){
  const t=TEAMS[currentTeam];if(!t) return;
  const Y=['sal_26','sal_27','sal_28','sal_29','sal_30'],L=['2026-27','2027-28','2028-29','2029-30','2030-31'];
  const csv=['Name,Pos,Bird,Trade,'+L.join(','),...t.players.filter(p=>p.sal_26>1).map(p=>[`"${p.name}"`,p.pos,p.bird||'',p.tradable_alone?'Y':p.tradable_agg?'Agg':'',...Y.map(y=>p[y]?Math.round(p[y]):'')].join(','))].join('\n');
  navigator.clipboard.writeText(csv).then(()=>{const b=document.getElementById('export-csv-btn');if(b){b.textContent='✓ Kopiert!';b.classList.add('copied');setTimeout(()=>{b.textContent='⬇ CSV';b.classList.remove('copied');},2000);}});
}
function exportRosterMarkdown(){
  const t=TEAMS[currentTeam];if(!t) return;
  let md=`**${t.name}** — $${(t.total_salary/1e6).toFixed(1)}M\n\n| Spieler | Pos | '26-27 | '27-28 | Bird | Trade |\n|---------|-----|--------|--------|------|-------|\n`;
  t.players.filter(p=>p.sal_26>100).forEach(p=>{md+=`| ${p.name} | ${p.pos} | $${(p.sal_26/1e6).toFixed(1)}M | ${p.sal_27?'$'+(p.sal_27/1e6).toFixed(1)+'M':'—'} | ${p.bird||'—'} | ${p.tradable_alone?'✓':'—'} |\n`;});
  navigator.clipboard.writeText(md).then(()=>{const b=document.getElementById('export-md-btn');if(b){b.textContent='✓ Kopiert!';b.classList.add('copied');setTimeout(()=>{b.textContent='📋 MD';b.classList.remove('copied');},2000);}});
}
// Keyboard shortcuts
(function(){
  const PAGES={r:'roster',f:'fa',t:'trade',k:'tools',l:'teams'};
  const TOOLS={'1':'finder','2':'maxcalc','3':'fairval','4':'offseason','5':'ownercap'};
  document.addEventListener('keydown',e=>{
    if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.metaKey||e.ctrlKey||e.altKey) return;
    const k=e.key.toLowerCase();
    if(PAGES[k]){showPage(PAGES[k]);setMobileNav(PAGES[k]);return;}
    if(k==='escape'){closeDetail();return;}
    if(document.getElementById('page-tools').classList.contains('active')&&TOOLS[k]){
      showTool(TOOLS[k]);
      document.querySelectorAll('.tool-tab').forEach((b,i)=>{if(String(i+1)===k)b.classList.add('active');else b.classList.remove('active');});
      if(k==='5') renderOwnerCapDashboard();
    }
  });
})();
// Wrap showTool to init Owner Cap
(function(){
  const orig=showTool;
  showTool=function(t){orig(t);if(t==='ownercap')renderOwnerCapDashboard();};
})();
  
