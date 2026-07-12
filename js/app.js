// ============================================================================
// app.js — Seiten-Logik für index.html (Speicherung, Tabellen-Rendering,
// Event-Handler). Nutzt die reine Rechenlogik aus js/stats.js.
// ============================================================================

let players = {}; // keyed by "playername|jahrgang", values = raw stat row
const STORAGE_KEY = "mfhfb_sticky_score_players";

let playerMeta = {}; // keyed by Spielername: {position, age, tag, team}
const META_KEY = "mfhfb_sticky_score_meta";

function saveMeta(){
  try{ localStorage.setItem(META_KEY, JSON.stringify(playerMeta)); }
  catch(e){ console.warn("Meta speichern fehlgeschlagen:", e); }
}
function loadMeta(){
  try{
    const raw = localStorage.getItem(META_KEY);
    if(raw) playerMeta = JSON.parse(raw);
  }catch(e){ playerMeta = {}; }
}

// Laedt data/player-meta-overrides.json (im Repo committet, siehe daten.html
// "Position/Alter sichern") als Basiswert fuer Position/Alter/Team — fuellt
// NUR Felder auf, die lokal (localStorage) noch nicht gesetzt sind. So bleibt
// die Zuordnung erhalten, selbst wenn jemand den kompletten Browser-Speicher
// loescht (nicht nur den "Gespeicherte Daten loeschen"-Knopf hier auf der
// Seite, der META_KEY ohnehin nicht anfasst).
async function loadMetaOverridesFromFile(){
  try{
    const resp = await fetch("data/player-meta-overrides.json?_=" + Date.now());
    if(!resp.ok) return;
    const fileMeta = await resp.json();
    Object.keys(fileMeta).forEach(name=>{
      if(name.startsWith("_")) return;
      playerMeta[name] = playerMeta[name] || {};
      Object.keys(fileMeta[name]).forEach(field=>{
        const cur = playerMeta[name][field];
        if(cur === undefined || cur === null || cur === ""){
          playerMeta[name][field] = fileMeta[name][field];
        }
      });
    });
  }catch(e){
    // Datei fehlt (z.B. lokal ohne Server) oder kein Netzwerk — kein Fehlerzustand.
  }
}

function downloadMetaOverridesFile(){
  const out = {};
  Object.keys(playerMeta).forEach(name=>{
    const m = playerMeta[name];
    if(!m) return;
    const clean = {};
    if(m.position) clean.position = m.position;
    if(m.age) clean.age = m.age;
    if(Object.keys(clean).length) out[name] = clean;
  });
  const blob = new Blob([JSON.stringify(out, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "player-meta-overrides.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function saveToStorage(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
  }catch(e){
    console.warn("localStorage speichern fehlgeschlagen:", e);
  }
}

function loadFromStorage(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) players = JSON.parse(raw);
  }catch(e){
    console.warn("localStorage laden fehlgeschlagen:", e);
    players = {};
  }
}

function parsePaste(raw, sourceLabel, seasonTag){
  const {rows, added, skipped, headerError} = parseCSVRows(raw);
  if(headerError) return {added:0, skipped, total:Object.keys(players).length, headerError:true};
  rows.forEach(row=>{
    row._seasonTag = seasonTag || "2026";
    const key = row.player_name + "|" + (sourceLabel || "current");
    players[key] = row;
  });
  return {added, skipped, total: Object.keys(players).length};
}

function currentWeights(){
  return {
    sticky: parseFloat(document.getElementById("wSticky").value) || 0,
    other:  parseFloat(document.getElementById("wOther").value)  || 0,
    icky:   parseFloat(document.getElementById("wIcky").value)   || 0,
  };
}

let currentMode = "sticky"; // "sticky" | "rotation"

function recomputeAndRender(){
  if(currentMode === "rotation"){
    render(computeRotationScores(players, playerMeta));
  }else{
    render(computeScores(players, playerMeta, currentWeights()));
  }
}

function updateMeta(playerName, field, value){
  playerMeta[playerName] = playerMeta[playerName] || {};
  playerMeta[playerName][field] = value;
  saveMeta();
  recomputeAndRender();
}

let lastRows = [];
let lastFullRows = [];
let currentPositionFilter = "ALL";
let currentSeasonFilter = "ALL";

function playerHref(name){
  return "player.html?name=" + encodeURIComponent(name);
}

function render(rows){
  lastFullRows = rows;
  let filtered = currentPositionFilter === "ALL" ? rows : rows.filter(r => r._position === currentPositionFilter);
  if(currentSeasonFilter === "2026") filtered = filtered.filter(r => (r._seasonTag || "2026") === "2026");
  if(currentMode === "rotation") renderRotation(filtered);
  else renderSticky(filtered);
}

function renderSticky(rows){
  lastRows = rows;
  const head = document.getElementById("headRow");
  const body = document.getElementById("bodyRows");
  const cols = [
    ["player_name","Spieler","left"],
    ["_tag_col","Tag",""],
    ["_total","Sticky Score",""],
    ["_stickySub","Sticky-Sub",""],
    ["_otherSub","Other-Sub",""],
    ["_ickySub","Icky-Sub",""],
    ["_bestCatSort","Beste Kat.",""],
    ["_worstCatSort","Schwächste Kat.",""],
    ["_scoreMinusBest","Score o. beste",""],
    ["_scoreMinusWorst","Score o. schwächste",""],
    ["_position_col","Pos.",""],
    ["_team_col","Team",""],
    ["_age_col","Alter",""],
    ["gp","GP",""],
    ["mpg","MPG",""],
    ["pts","PTS/36",""],
    ["_effFlag_col","Vol/Eff",""],
    ["_z_rebound_combined","TRB+ORB (z)",""],
    ["ast","AST/36",""],
    ["stl","STL/36",""],
    ["blk","BLK/36",""],
    ["tov","TOV/36",""],
    ["ts_pct","TS%",""],
    ["dre36","DRE/36",""],
  ];

  head.innerHTML = cols.map(([key,label])=>`<th data-key="${key}">${label}</th>`).join("");

  const mm = {};
  Object.keys(COLOR_COLS).forEach(k => mm[k] = minMax(rows, k));

  body.innerHTML = rows.map((r)=>{
    const safeName = r.player_name.replace(/'/g,"\\'");
    const posOptions = ["","G","W","B"].map(p=>{
      const label = p==="" ? "—" : (p==="G"?"Guard":p==="W"?"Wing":"Big");
      const sel = (r._position||"")===p ? "selected" : "";
      return `<option value="${p}" ${sel}>${label}</option>`;
    }).join("");

    const bestLabel = r._bestCat ? `${r._bestCat.label}<br><span class="cat-note">z=${fmt(r._bestCat.z,1)}${r._outlierNote===r._bestCat?" ⚠️":""}</span>` : "—";
    const worstLabel = r._worstCat ? `${r._worstCat.label}<br><span class="cat-note">z=${fmt(r._worstCat.z,1)}${r._outlierNote===r._worstCat?" ⚠️":""}</span>` : "—";

    const tagClass = r._tag === "My Guys" ? "tag-myguys" : r._tag === "Targets" ? "tag-targets" : "";

    const sampleBadge = r._lowSample
      ? `<span title="Nur ${fmt(r._totalMin,0)} Gesamtminuten (GP × MPG) — Score läuft bei ${fmt(r._confShrink*100,0)}% Konfidenz (Shrinkage Richtung 0 bei wenig Sample)">⚠️</span>`
      : "";

    return `
    <tr>
      <td style="text-align:left"><a class="player-link" href="${playerHref(r.player_name)}">${r.player_name}</a> ${sampleBadge}</td>
      <td style="text-align:left">
        <input type="text" list="tagOptions" class="tagInput metaInput ${tagClass}"
               value="${(r._tag||"").replace(/"/g,'&quot;')}" placeholder="—"
               data-player="${safeName}" data-field="tag">
      </td>
      <td class="total-col" ${gradientStyle('_total', r._total, mm._total)}>${fmt(r._total,2)}</td>
      <td>${fmt(r._stickySub,2)}</td>
      <td>${fmt(r._otherSub,2)}</td>
      <td>${fmt(r._ickySub,2)}</td>
      <td style="text-align:left" title="${r._outlierNote ? 'Möglicher Small-Sample-Ausreißer — treibt den Score stark' : ''}">${bestLabel}</td>
      <td style="text-align:left">${worstLabel}</td>
      <td>${fmt(r._scoreMinusBest,2)}</td>
      <td>${fmt(r._scoreMinusWorst,2)}</td>
      <td><select data-player="${safeName}" data-field="position" class="metaInput">${posOptions}</select></td>
      <td><input type="text" style="width:90px" value="${(r._team||"").replace(/"/g,'&quot;')}" placeholder="${r._team ? '' : 'UDFA?'}"
             title="${r._teamAuto ? 'Automatisch aus offiziellen 2026-Draft-Ergebnissen übernommen — bei Trades manuell korrigieren' : (r._team ? 'Manuell eingetragen' : 'Kein Draft-Match gefunden — vermutlich Undrafted Free Agent, Team manuell eintragen')}"
             data-player="${safeName}" data-field="team" class="metaInput"></td>
      <td><input type="number" min="17" max="45" style="width:52px" value="${r._age ?? ""}" data-player="${safeName}" data-field="age" class="metaInput"></td>
      <td>${fmt(r.gp,0)}</td>
      <td>${fmt(r.mpg,1)}</td>
      <td ${gradientStyle('pts', r.pts, mm.pts)}>${fmt(r.pts,1)}</td>
      <td title="Hohes Scoring-Volumen bei unterdurchschnittlicher TS% — Effizienz-Warnsignal">${r._effFlag ? "⚠️" : ""}</td>
      <td ${gradientStyle('_z_rebound_combined', r._z_rebound_combined, mm._z_rebound_combined)}>${fmt(r._z_rebound_combined,2)}</td>
      <td ${gradientStyle('ast', r.ast, mm.ast)}>${fmt(r.ast,1)}</td>
      <td ${gradientStyle('stl', r.stl, mm.stl)}>${fmt(r.stl,1)}</td>
      <td ${gradientStyle('blk', r.blk, mm.blk)}>${fmt(r.blk,1)}</td>
      <td ${gradientStyle('tov', r.tov, mm.tov)}>${fmt(r.tov,1)}</td>
      <td ${gradientStyle('ts_pct', r.ts_pct, mm.ts_pct)}>${fmt(r.ts_pct,3)}</td>
      <td ${gradientStyle('dre36', r.dre36, mm.dre36)} title="${dreTier(r.dre36).label} (David-Lee-Threshold, Näherungswert)">${fmt(r.dre36,1)} ${dreTier(r.dre36).emoji}</td>
    </tr>
  `;}).join("");

  document.getElementById("resultsCard").style.display = "block";

  body.querySelectorAll(".metaInput").forEach(el=>{
    el.addEventListener("change", (e)=>{
      const name = e.target.dataset.player;
      const field = e.target.dataset.field;
      let value = e.target.value;
      if(field === "age") value = value === "" ? "" : parseFloat(value);
      updateMeta(name, field, value);
    });
  });

  head.querySelectorAll("th").forEach(th=>{
    th.onclick = ()=>{
      const key = th.dataset.key;
      if(key.endsWith("_col")) return;
      const dir = th.dataset.dir === "desc" ? "asc" : "desc";
      head.querySelectorAll("th").forEach(t=>t.removeAttribute("data-dir"));
      th.dataset.dir = dir;
      rows.sort((a,b)=>{
        const av = a[key], bv = b[key];
        if(typeof av === "string") return dir==="asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        return dir==="asc" ? (av-bv) : (bv-av);
      });
      render(rows);
    };
  });
}

function renderRotation(rows){
  lastRows = rows;
  const head = document.getElementById("headRow");
  const body = document.getElementById("bodyRows");
  const cols = [
    ["player_name","Spieler","left"],
    ["_tag_col","Tag",""],
    ["_rotationScore","Rotation Score",""],
    ["_z_astto","AST/TOV (z)",""],
    ["_z_stl","STL/36 (z)",""],
    ["_z_ft","FT% (z)",""],
    ["_z_3p","3P% (z)",""],
    ["_z_effLowUsage","Eff. b. wenig Vol. (z)",""],
    ["_rotAgeBonus","Alter-Bonus (deaktiviert)",""],
    ["_singleSkill_col","Ein-Skill-Signal",""],
    ["_position_col","Pos.",""],
    ["_team_col","Team",""],
    ["_age_col","Alter",""],
    ["gp","GP",""],
    ["mpg","MPG",""],
    ["ast_to","AST/TOV (roh)",""],
    ["stl","STL/36",""],
    ["ft_pct","FT%",""],
    ["fg3_pct","3P%",""],
    ["ts_pct","TS%",""],
    ["dre36","DRE/36 (Info)",""],
  ];

  head.innerHTML = cols.map(([key,label])=>`<th data-key="${key}">${label}</th>`).join("");

  const rotColorCols = ["_rotationScore","_z_astto","_z_stl","_z_ft","_z_3p","_z_effLowUsage","_rotAgeBonus"];
  const mm = {};
  rotColorCols.forEach(k => mm[k] = minMax(rows, k));
  mm.dre36 = minMax(rows, "dre36");
  const gradHigh = (key, value) => {
    if(mm[key].min===null || mm[key].max===null || mm[key].min===mm[key].max) return "";
    const t = (value - mm[key].min) / (mm[key].max - mm[key].min);
    const hue = Math.max(0, Math.min(1, t)) * 120;
    return `style="background:hsla(${hue.toFixed(0)},70%,55%,0.28);"`;
  };

  body.innerHTML = rows.map(r=>{
    const safeName = r.player_name.replace(/'/g,"\\'");
    const posOptions = ["","G","W","B"].map(p=>{
      const label = p==="" ? "—" : (p==="G"?"Guard":p==="W"?"Wing":"Big");
      const sel = (r._position||"")===p ? "selected" : "";
      return `<option value="${p}" ${sel}>${label}</option>`;
    }).join("");
    const tagClass = r._tag === "My Guys" ? "tag-myguys" : r._tag === "Targets" ? "tag-targets" : "";
    const skillNote = r._rotSingleSkillLabel
      ? `<span title="Genau eine Kategorie sticht stark heraus, Rest unauffällig — das VanVleet/Hauser-Muster">🎯 ${r._rotSingleSkillLabel}</span>`
      : "";

    const sampleBadge = r._lowSample
      ? `<span title="Nur ${fmt(r._totalMin,0)} Gesamtminuten (GP × MPG) — Score läuft bei ${fmt(r._confShrink*100,0)}% Konfidenz (Shrinkage Richtung 0 bei wenig Sample)">⚠️</span>`
      : "";

    return `
    <tr>
      <td style="text-align:left"><a class="player-link" href="${playerHref(r.player_name)}">${r.player_name}</a> ${sampleBadge}</td>
      <td style="text-align:left">
        <input type="text" list="tagOptions" class="tagInput metaInput ${tagClass}"
               value="${(r._tag||"").replace(/"/g,'&quot;')}" placeholder="—"
               data-player="${safeName}" data-field="tag">
      </td>
      <td class="total-col" ${gradHigh('_rotationScore', r._rotationScore)}>${fmt(r._rotationScore,2)}</td>
      <td ${gradHigh('_z_astto', r._z_astto)}>${fmt(r._z_astto,2)}</td>
      <td ${gradHigh('_z_stl', r._z_stl)}>${fmt(r._z_stl,2)}</td>
      <td ${gradHigh('_z_ft', r._z_ft)}>${fmt(r._z_ft,2)}</td>
      <td ${gradHigh('_z_3p', r._z_3p)}>${fmt(r._z_3p,2)}</td>
      <td ${gradHigh('_z_effLowUsage', r._z_effLowUsage)}>${fmt(r._z_effLowUsage,2)}</td>
      <td ${gradHigh('_rotAgeBonus', r._rotAgeBonus)}>${fmt(r._rotAgeBonus,2)}</td>
      <td>${skillNote}</td>
      <td><select data-player="${safeName}" data-field="position" class="metaInput">${posOptions}</select></td>
      <td><input type="text" style="width:90px" value="${(r._team||"").replace(/"/g,'&quot;')}" placeholder="${r._team ? '' : 'UDFA?'}"
             title="${r._teamAuto ? 'Automatisch aus offiziellen 2026-Draft-Ergebnissen übernommen — bei Trades manuell korrigieren' : (r._team ? 'Manuell eingetragen' : 'Kein Draft-Match gefunden — vermutlich Undrafted Free Agent, Team manuell eintragen')}"
             data-player="${safeName}" data-field="team" class="metaInput"></td>
      <td><input type="number" min="17" max="45" style="width:52px" value="${r._age ?? ""}" data-player="${safeName}" data-field="age" class="metaInput"></td>
      <td>${fmt(r.gp,0)}</td>
      <td>${fmt(r.mpg,1)}</td>
      <td>${fmt(r.ast_to,2)}</td>
      <td>${fmt(r.stl,1)}</td>
      <td>${fmt(r.ft_pct,1)}</td>
      <td>${fmt(r.fg3_pct,1)}</td>
      <td>${fmt(r.ts_pct,1)}</td>
      <td ${gradientStyle('dre36', r.dre36, mm.dre36)} title="${dreTier(r.dre36).label} (David-Lee-Threshold, Näherungswert) — informativ, fließt NICHT in den Rotation Score ein">${fmt(r.dre36,1)} ${dreTier(r.dre36).emoji}</td>
    </tr>
  `;}).join("");

  document.getElementById("resultsCard").style.display = "block";

  body.querySelectorAll(".metaInput").forEach(el=>{
    el.addEventListener("change", (e)=>{
      const name = e.target.dataset.player;
      const field = e.target.dataset.field;
      let value = e.target.value;
      if(field === "age") value = value === "" ? "" : parseFloat(value);
      updateMeta(name, field, value);
    });
  });

  head.querySelectorAll("th").forEach(th=>{
    th.onclick = ()=>{
      const key = th.dataset.key;
      if(key.endsWith("_col")) return;
      const dir = th.dataset.dir === "desc" ? "asc" : "desc";
      head.querySelectorAll("th").forEach(t=>t.removeAttribute("data-dir"));
      th.dataset.dir = dir;
      rows.sort((a,b)=>{
        const av = a[key], bv = b[key];
        if(typeof av === "string") return dir==="asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        return dir==="asc" ? (av-bv) : (bv-av);
      });
      render(rows);
    };
  });
}

// Das eigentliche Einspielen von CSV-Daten passiert jetzt auf daten.html
// (js/data-app.js) — dort landen neue Zeilen im selben localStorage-Pool.
// "Score neu berechnen" auf dieser Seite berechnet nur noch mit den aktuell
// gewählten Gewichtungen neu (z.B. nach Ändern der Sticky/Other/Icky-Werte).
document.getElementById("calcBtn").addEventListener("click", ()=>{
  const statusEl = document.getElementById("status");
  if(Object.keys(players).length === 0){
    statusEl.className = "error";
    statusEl.textContent = "Noch keine Daten geladen — unter \"Daten & Methodik\" CSV hochladen oder auf die automatische 2026er-Aktualisierung warten.";
    return;
  }
  recomputeAndRender();
  statusEl.className = "ok";
  statusEl.textContent = `Score neu berechnet für ${Object.keys(players).length} Spieler.`;
});

document.getElementById("exportBtn").addEventListener("click", ()=>{
  if(!lastRows.length){ return; }
  const rowsForExport = lastRows.map(r=>({
    ...r,
    _bestCatLabel: r._bestCat ? r._bestCat.label : "",
    _bestCatZ: r._bestCat ? r._bestCat.z : "",
    _worstCatLabel: r._worstCat ? r._worstCat.label : "",
    _worstCatZ: r._worstCat ? r._worstCat.z : "",
    _outlier: r._outlierNote ? r._outlierNote.label : "",
  }));
  const cols = ["player_name","_position","_team","_age","_total","_stickySub","_otherSub","_ickySub",
                "_bestCatLabel","_bestCatZ","_worstCatLabel","_worstCatZ","_scoreMinusBest","_scoreMinusWorst","_outlier",
                "gp","mpg","_totalMin","_lowSample","_confShrink","pts","pts_adj","_effFlag","_z_rebound_combined","reb","oreb","dreb",
                "ast","stl","blk","tov","pf","fg3_attempt_rate","ft_attempt_rate","ast_to","two_pct",
                "fg_pct","fg3_pct","ft_pct","efg_pct","ts_pct","game_score","fantasy_pts","plus_minus","dre36"];
  const header = ["Spieler","Position","Team","Alter","StickyScore","StickySub","OtherSub","IckySub",
                   "BesteKategorie","BesteKategorie_z","SchwaechsteKategorie","SchwaechsteKategorie_z","ScoreOhneBeste","ScoreOhneSchwaechste","OutlierWarnung",
                   "GP","MPG","GesamtMinuten","NiedrigeSampleWarnung","Konfidenz_Shrink","PTS36","PTS36_eff_adj","VolEffFlag","ReboundCombined_z","TRB36","ORB36","DRB36",
                   "AST36","STL36","BLK36","TOV36","PF36","3PAr","FTr","ASTTO","2P%",
                   "FG%","3P%","FT%","eFG%","TS%","GameScore","FantPts36","PlusMinus","DRE36"];
  const lines = [header.join(",")];
  rowsForExport.forEach(r=>{
    lines.push(cols.map(c=>{
      const v = r[c];
      if(typeof v === "boolean") return v ? "1" : "0";
      if(typeof v === "string") return `"${v.replace(/"/g,'""')}"`;
      return (v===null||v===undefined||isNaN(v)) ? "" : v;
    }).join(","));
  });
  const blob = new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const modeLabel = currentMode === "rotation" ? "rotation_score" : "sticky_score";
  const posLabel = currentPositionFilter === "ALL" ? "alle" : currentPositionFilter;
  a.download = `${modeLabel}_${posLabel}_` + new Date().toISOString().slice(0,10) + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById("positionFilter").addEventListener("change", (e)=>{
  currentPositionFilter = e.target.value;
  if(lastFullRows.length > 0) render(lastFullRows);
});

document.getElementById("seasonFilter").addEventListener("change", (e)=>{
  currentSeasonFilter = e.target.value;
  if(lastFullRows.length > 0) render(lastFullRows);
});

document.getElementById("modeStickyBtn").addEventListener("click", ()=>{
  currentMode = "sticky";
  document.getElementById("modeStickyBtn").classList.add("modeActive");
  document.getElementById("modeRotationBtn").classList.remove("modeActive");
  document.getElementById("stickyModePanel").style.display = "block";
  document.getElementById("rotationModePanel").style.display = "none";
  document.getElementById("stickyLegend").style.display = "flex";
  document.getElementById("calcBtn").textContent = "Score berechnen";
  if(Object.keys(players).length > 0) recomputeAndRender();
});

document.getElementById("modeRotationBtn").addEventListener("click", ()=>{
  currentMode = "rotation";
  document.getElementById("modeRotationBtn").classList.add("modeActive");
  document.getElementById("modeStickyBtn").classList.remove("modeActive");
  document.getElementById("stickyModePanel").style.display = "none";
  document.getElementById("rotationModePanel").style.display = "block";
  document.getElementById("stickyLegend").style.display = "none";
  document.getElementById("calcBtn").textContent = "Score berechnen";
  if(Object.keys(players).length > 0) recomputeAndRender();
});

document.getElementById("resetBtn").addEventListener("click", ()=>{
  if(!confirm("Wirklich alle gespeicherten Spielerdaten löschen?")) return;
  players = {};
  localStorage.removeItem(STORAGE_KEY);
  document.getElementById("resultsCard").style.display = "none";
  document.getElementById("status").className = "";
  document.getElementById("status").textContent = "Gespeicherte Daten gelöscht.";
});

const metaExportBtn = document.getElementById("metaExportBtn");
if(metaExportBtn) metaExportBtn.addEventListener("click", downloadMetaOverridesFile);

async function autoLoadCurrentSeason(){
  try{
    const resp = await fetch("data/current-season-2026.csv?_=" + Date.now());
    if(!resp.ok) return { loaded: false };
    const text = await resp.text();
    if(!text || !text.trim()) return { loaded: false };
    const { added, headerError } = parsePaste(text, "auto-2026", "2026");
    if(headerError) return { loaded: false };
    return { loaded: true, added };
  }catch(e){
    // Kein Netzwerk / Datei fehlt (z.B. lokal ohne Server, oder Action lief
    // noch nicht) — kein Fehler, Seite funktioniert dann einfach nur mit
    // manuell eingespielten Daten weiter.
    return { loaded: false };
  }
}

(async function init(){
  loadFromStorage();
  loadMeta();
  await loadMetaOverridesFromFile();

  const auto = await autoLoadCurrentSeason();

  if(Object.keys(players).length > 0){
    recomputeAndRender();
    document.getElementById("status").className = "ok";
    const autoNote = auto.loaded
      ? ` (davon automatisch von nbadraft.app aktualisiert: ${auto.added} Spieler der 2026er Draft-Klasse)`
      : "";
    document.getElementById("status").textContent = `${Object.keys(players).length} Spieler geladen.${autoNote}`;
  }else if(auto.loaded){
    recomputeAndRender();
    document.getElementById("status").className = "ok";
    document.getElementById("status").textContent = `${Object.keys(players).length} Spieler automatisch von nbadraft.app geladen (2026er Draft-Klasse).`;
  }
})();
