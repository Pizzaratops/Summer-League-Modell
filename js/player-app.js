// ============================================================================
// player-app.js — Seiten-Logik für player.html (Spieler-Vergleichsseite).
// ============================================================================

const CURRENT_STORAGE_KEY = "mfhfb_sticky_score_players"; // gleicher Key wie in js/app.js

function normalizeKeyName(name){
  return (name||"").trim().toLowerCase().replace(/\s+/g," ");
}

// Lädt die aktuell im Browser gespeicherten (index.html-)Spieler als flache Liste
// roher Zeilen (letzter Import gewinnt bei Mehrfach-Import desselben Spielers).
function loadCurrentSessionRows(){
  try{
    const raw = localStorage.getItem(CURRENT_STORAGE_KEY);
    if(!raw) return [];
    const obj = JSON.parse(raw);
    const byName = {};
    Object.values(obj).forEach(row => { byName[row.player_name] = row; });
    return Object.values(byName);
  }catch(e){
    return [];
  }
}

function mergeRawPools(historical, current){
  const byName = {};
  historical.forEach(r => { byName[normalizeKeyName(r.player_name)] = r; });
  // Aktuelle Session-Daten überschreiben historische Einträge desselben Namens
  // (z.B. wenn der aktuelle Jahrgang noch nicht im historischen Katalog steckt,
  // oder ein neuerer Stand vorliegt).
  current.forEach(r => { byName[normalizeKeyName(r.player_name)] = r; });
  return Object.values(byName);
}

function clampZTo01(z){
  const clamped = Math.max(-2.5, Math.min(2.5, z || 0));
  return (clamped + 2.5) / 5;
}

function findRawRowByName(rows, name){
  const key = normalizeKeyName(name);
  return rows.find(r => normalizeKeyName(r.player_name) === key) || null;
}

function draftContextFor(name, draftContext){
  const key = normalizeKeyName(name);
  return draftContext[key] || draftContext[normalizeKeyName(name).replace(/[^a-z ]/g,"")] || null;
}

function statBox(value, label, digits=1){
  return `<div class="stat-box"><div class="v">${fmt(value,digits)}</div><div class="k">${label}</div></div>`;
}

function renderEmptyState(allNames){
  document.getElementById("playerHero").innerHTML = `<div class="empty-state">Noch kein Spieler ausgewählt — oben suchen oder von der <a class="player-link" href="index.html">Ranking-Tabelle</a> aus verlinken.</div>`;
  document.getElementById("compCard").style.display = "none";
}

function setupPicker(allNames){
  const input = document.getElementById("playerSearch");
  const results = document.getElementById("pickerResults");

  input.addEventListener("input", ()=>{
    const q = input.value.trim().toLowerCase();
    if(q.length < 2){ results.style.display = "none"; results.innerHTML=""; return; }
    const matches = allNames.filter(n => n.toLowerCase().includes(q)).slice(0, 30);
    if(!matches.length){ results.style.display = "none"; results.innerHTML=""; return; }
    results.innerHTML = matches.map(n => `<div data-name="${n.replace(/"/g,'&quot;')}">${n}</div>`).join("");
    results.style.display = "block";
    results.querySelectorAll("div[data-name]").forEach(el=>{
      el.addEventListener("click", ()=>{
        window.location.href = "player.html?name=" + encodeURIComponent(el.dataset.name);
      });
    });
  });

  document.addEventListener("click", (e)=>{
    if(!results.contains(e.target) && e.target !== input) results.style.display = "none";
  });
}

async function initPlayerPage(){
  const statusEl = document.getElementById("pageStatus");
  let historicalRaw = [];
  let draftContext = {};

  try{
    const resp = await fetch("data/historical-pool.json");
    historicalRaw = await resp.json();
  }catch(e){
    statusEl.className = "error";
    statusEl.textContent = "Konnte data/historical-pool.json nicht laden. Läuft die Seite über einen lokalen Server oder GitHub Pages (nicht direkt als file://)?";
  }

  try{
    const resp2 = await fetch("data/draft-context.json");
    draftContext = await resp2.json();
  }catch(e){ draftContext = {}; }

  const currentRaw = loadCurrentSessionRows();
  const allRaw = mergeRawPools(historicalRaw, currentRaw);
  const allNames = allRaw.map(r=>r.player_name).sort((a,b)=>a.localeCompare(b));

  setupPicker(allNames);

  const params = new URLSearchParams(window.location.search);
  const targetName = params.get("name");

  if(!targetName){
    renderEmptyState(allNames);
    return;
  }

  const targetRaw = findRawRowByName(allRaw, targetName);
  if(!targetRaw){
    document.getElementById("playerHero").innerHTML = `<div class="empty-state">Kein Spieler namens "${targetName}" im Datenbestand gefunden. Über die Suche oben nach dem richtigen Namen suchen.</div>`;
    document.getElementById("compCard").style.display = "none";
    return;
  }

  const pool = prepareSimilarityPool(allRaw);
  const targetDerived = computeDerived(targetRaw, {});
  targetDerived._shapeVector = shapeVectorFor(targetDerived, pool.statRefs);

  const comps = findComps(targetDerived, pool, {n:5});

  renderHero(targetDerived, comps[0] ? comps[0].row : null);
  renderCompTable(targetDerived, comps, draftContext);

  if(targetDerived._totalMin < SIMILARITY_MIN_MINUTES){
    statusEl.className = "error";
    statusEl.textContent = `Achtung: ${targetDerived.player_name} hat nur ${fmt(targetDerived._totalMin,0)} Gesamtminuten — Vergleich basiert auf einer sehr kleinen Stichprobe und ist entsprechend unsicher.`;
  }
}

function renderHero(target, topComp){
  const el = document.getElementById("playerHero");
  const axes = SHAPE_STATS.map(s=>s.label);
  const seriesA = target._shapeVector.map(clampZTo01);
  const seriesB = topComp ? topComp._shapeVector.map(clampZTo01) : null;

  const radarSVG = renderRadarSVG({
    labels: axes,
    seriesA, seriesB,
    labelANameText: target.player_name,
    labelBNameText: topComp ? topComp.player_name : null,
    size: 380,
  });

  el.innerHTML = `
    <div class="radar-col">
      ${radarSVG}
      <div class="legend" style="margin-top:8px;">
        <span><span class="dot" style="background:var(--orange)"></span>${target.player_name}</span>
        ${topComp ? `<span><span class="dot" style="background:var(--navy)"></span>Top-Comp: ${topComp.player_name}</span>` : ""}
      </div>
    </div>
    <div class="info-col">
      <h2 class="player-title">${target.player_name}</h2>
      <p class="player-subtitle">${fmt(target.gp,0)} Spiele · ${fmt(target.mpg,1)} MPG · ${fmt(target._totalMin,0)} Gesamtminuten${target._lowSample ? " ⚠️ kleine Stichprobe" : ""}</p>
      <div class="statline-grid">
        ${statBox(target.pts,"PTS/36")}
        ${statBox(target.reb,"TRB/36")}
        ${statBox(target.ast,"AST/36")}
        ${statBox(target.stl,"STL/36")}
        ${statBox(target.blk,"BLK/36")}
        ${statBox(target.tov,"TOV/36")}
        ${statBox(target.ts_pct,"TS%",1)}
        ${statBox(target.fg3_attempt_rate!=null ? target.fg3_attempt_rate*100 : null,"3PAr")}
        ${statBox(target.ft_attempt_rate!=null ? target.ft_attempt_rate*100 : null,"FTr")}
      </div>
    </div>
  `;
}

function renderCompTable(target, comps, draftContext){
  const card = document.getElementById("compCard");
  card.style.display = "block";
  const body = document.getElementById("compBody");

  if(!comps.length){
    body.innerHTML = `<tr><td colspan="6">Keine Vergleichsspieler mit ausreichend Minuten (≥${SIMILARITY_MIN_MINUTES}) im aktuellen Datenbestand gefunden.</td></tr>`;
    return;
  }

  body.innerHTML = comps.map((c, i)=>{
    const r = c.row;
    const ctx = draftContextFor(r.player_name, draftContext);
    const teamCell = ctx ? `${ctx.team || "—"}${ctx.draftYear ? " (" + ctx.draftYear + ")" : ""}` : (typeof lookupDraftTeam === "function" && lookupDraftTeam(r.player_name) ? lookupDraftTeam(r.player_name) + " (2026)" : "—");
    const draftCell = ctx && ctx.draftPick ? `#${ctx.draftPick}` : (ctx && ctx.draftPick === null ? "Undrafted" : "—");
    const careerCell = ctx && (ctx.careerGames !== undefined && ctx.careerGames !== null) ? fmt(ctx.careerGames,0) : "—";
    return `
    <tr>
      <td>${i+1}.</td>
      <td><a class="player-link" href="player.html?name=${encodeURIComponent(r.player_name)}">${r.player_name}</a></td>
      <td>
        <span class="comp-match-track"><span class="comp-match-bar" style="width:${c.matchPct}%"></span></span>
        <span style="margin-left:6px;font-size:12px;color:var(--muted)">${c.matchPct}%</span>
      </td>
      <td>${teamCell}</td>
      <td>${draftCell}</td>
      <td>${careerCell}</td>
    </tr>`;
  }).join("");
}

initPlayerPage();
