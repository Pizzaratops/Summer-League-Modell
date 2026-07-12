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

// Best-effort Slug für den nbadraft.app-Profillink (nicht garantiert korrekt für
// jeden Namen — Suffixe wie "Jr."/Akzente können abweichen, deshalb klar als
// "suchen"-Link beschriftet statt als garantierter Deep-Link).
function nbaDraftAppSlug(name){
  return (name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Akzente entfernen
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ----------------------------------------------------------------------------
// Stat-basierte Ähnlichkeits-Aufschlüsselung: statt Team/Draft/Karriere zeigen
// wir pro Comp, in welchen der 11 Shape-Stats sich Ziel- und Vergleichsspieler
// am ähnlichsten sind (kleinste z-Differenz) und am stärksten unterscheiden
// (größte z-Differenz). Rein deskriptiv, keine neue Kennzahl.
// ----------------------------------------------------------------------------
function describeCompDiffs(targetVec, compVec){
  const diffs = SHAPE_STATS.map((s, i) => ({
    label: s.label,
    diff: Math.abs(targetVec[i] - compVec[i]),
  }));
  const sorted = [...diffs].sort((a, b) => a.diff - b.diff);
  const closest = sorted.slice(0, 2).map(d => d.label);
  const furthest = sorted.slice(-2).reverse().map(d => d.label);
  return { closest, furthest };
}

// ----------------------------------------------------------------------------
// Regelbasierte Rollen-Annahme: liest die z-normalisierten Shape-Stats des
// Zielspielers und ordnet ihn — rein heuristisch, transparent nachvollziehbar,
// KEIN Scouting-Urteil — einem groben NBA-Rollenprofil zu. Mehrere Regeln
// können gleichzeitig zutreffen (z.B. "Stretch Big").
// ----------------------------------------------------------------------------
const ROLE_RULES = [
  {
    label: "Rim-Runner / Interior Big",
    test: v => v.blk > 0.8 && v.reb > 0.8 && v.fg3_attempt_rate < -0.2,
    text: "Starke Rebound- und Blockwerte bei kaum Distanzwürfen — passt am ehesten zu einer Rolle nahe am Korb (Pick-and-Roll-Finisher, Lob-Ziel, Help-Defense-Anker), weniger zu einer Rolle mit viel Ballbesitz am Perimeter.",
  },
  {
    label: "Stretch Big",
    test: v => v.reb > 0.5 && v.fg3_attempt_rate > 0.3 && v.ts_pct > 0.3,
    text: "Rebounding-Profil eines Bigs, aber überdurchschnittliche 3-Punkt-Wurfrate und Effizienz — deutet auf Spacing-Fähigkeit über die reine Rim-Runner-Rolle hinaus hin.",
  },
  {
    label: "Lead Guard / Playmaker",
    test: v => v.ast > 1.0 && v.reb < 0.3,
    text: "Assist-Rate klar über dem Feld bei unterdurchschnittlichem Rebounding — typisches Profil eines ballführenden Spielers, der primär über Kreativität und Tempo Wert schafft statt über Größe.",
  },
  {
    label: "3&D-Rollenspieler",
    test: v => v.stl > 0.6 && v.fg3_attempt_rate > 0.4 && v.ast < 0.5,
    text: "Hohe Steal-Rate kombiniert mit hoher 3-Punkt-Wurfrate bei moderater Playmaking-Last — Profil eines Spielers, der eher über Defense und Spacing als über Ballbesitz-Usage Wert schafft.",
  },
  {
    label: "Slasher / Scorer im Drive",
    test: v => v.pts > 0.8 && v.ft_attempt_rate > 0.4 && v.fg3_attempt_rate < 0.2,
    text: "Hohe Scoring-Rate mit vielen Freiwurfversuchen relativ zu wenigen Distanzwürfen — deutet auf einen Spieler hin, der primär über Drives und Kontakt zum Korb scort statt über den Distanzwurf.",
  },
  {
    label: "Zwei-Wege-Flügel",
    test: v => v.stl > 0.5 && v.blk > 0.3 && v.ast > 0.3,
    text: "Solide Werte über Steal, Block UND Assist gleichzeitig — kein enges Statprofil, sondern eher ein vielseitiger Flügelspieler ohne klare Ein-Skill-Spezialisierung.",
  },
];

function inferRoleProfile(target){
  const v = {};
  SHAPE_STATS.forEach((s, i) => { v[s.key] = target._shapeVector[i]; });

  const matched = ROLE_RULES.filter(r => r.test(v));

  const ranked = SHAPE_STATS.map((s, i) => ({ label: s.label, z: target._shapeVector[i] }))
    .sort((a, b) => b.z - a.z);
  const strengths = ranked.slice(0, 3).filter(r => r.z > 0.3);
  const weaknesses = ranked.slice(-3).reverse().filter(r => r.z < -0.3);

  return { matched, strengths, weaknesses };
}

function renderRoleProfile(target){
  const el = document.getElementById("roleProfile");
  if(!el) return;

  if(target._totalMin < SIMILARITY_MIN_MINUTES){
    el.innerHTML = `<p class="hint">Zu wenig Gesamtminuten (${fmt(target._totalMin,0)}) für eine belastbare Rollen-Annahme.</p>`;
    return;
  }

  const { matched, strengths, weaknesses } = inferRoleProfile(target);

  const strengthsHtml = strengths.length
    ? strengths.map(s => `<li><strong>${s.label}</strong> deutlich über dem Feld (z=${s.z.toFixed(1)})</li>`).join("")
    : "<li>Keine Ausreißer-Stärke — eher ausgeglichenes Profil.</li>";
  const weaknessesHtml = weaknesses.length
    ? weaknesses.map(s => `<li><strong>${s.label}</strong> deutlich unter dem Feld (z=${s.z.toFixed(1)})</li>`).join("")
    : "<li>Keine Ausreißer-Schwäche erkennbar.</li>";

  const roleHtml = matched.length
    ? matched.map(m => `<div class="role-tag"><strong>${m.label}:</strong> ${m.text}</div>`).join("")
    : `<div class="role-tag">Kein eindeutiges Rollenmuster aus den hinterlegten Regeln — gemischtes Statprofil ohne klaren Ein-Skill-Ausreißer.</div>`;

  el.innerHTML = `
    <div class="role-grid">
      <div>
        <h3>Stärkste Stats relativ zum Feld</h3>
        <ul>${strengthsHtml}</ul>
      </div>
      <div>
        <h3>Schwächste Stats relativ zum Feld</h3>
        <ul>${weaknessesHtml}</ul>
      </div>
    </div>
    <div class="role-assumption">
      <h3>Regelbasierte Rollen-Annahme</h3>
      ${roleHtml}
      <p class="hint">Rein statistisch aus den 11 Shape-Stats abgeleitet — keine Scouting-Bewertung, kein Ersatz für Film/Athletik-Einschätzung.</p>
    </div>
  `;
}

function statBox(value, label, digits=1){
  return `<div class="stat-box"><div class="v">${fmt(value,digits)}</div><div class="k">${label}</div></div>`;
}

function renderEmptyState(allNames){
  document.getElementById("playerHero").innerHTML = `<div class="empty-state">Noch kein Spieler ausgewählt — oben suchen oder von der <a class="player-link" href="index.html">Ranking-Tabelle</a> aus verlinken.</div>`;
  document.getElementById("compCard").style.display = "none";
  document.getElementById("successCard").style.display = "none";
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
    document.getElementById("successCard").style.display = "none";
    return;
  }

  const pool = prepareSimilarityPool(allRaw);
  const targetDerived = computeDerived(targetRaw, {});
  targetDerived._shapeVector = shapeVectorFor(targetDerived, pool.statRefs);

  const comps = findComps(targetDerived, pool, {n:5});

  renderHero(targetDerived, comps[0] ? comps[0].row : null);
  renderRoleProfile(targetDerived);
  renderCompTable(targetDerived, comps, draftContext);
  renderSuccessBadge(comps, draftContext);

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
      <a class="external-link" href="https://nbadraft.app/players/${nbaDraftAppSlug(target.player_name)}" target="_blank" rel="noopener">🔗 Scouting-Profil bei DraftGuru suchen ↗</a>
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
    body.innerHTML = `<tr><td colspan="8">Keine Vergleichsspieler mit ausreichend Minuten (≥${SIMILARITY_MIN_MINUTES}) im aktuellen Datenbestand gefunden.</td></tr>`;
    return;
  }

  body.innerHTML = comps.map((c, i)=>{
    const r = c.row;
    const { closest, furthest } = describeCompDiffs(target._shapeVector, r._shapeVector);
    const ctx = draftContextFor(r.player_name, draftContext);
    const teamCol = ctx ? `${ctx.team || "—"}${ctx.draftYear ? " ('" + String(ctx.draftYear).slice(2) + ")" : ""}` : "—";
    const pickCol = ctx ? (ctx.draftPick === null || ctx.draftPick === undefined ? "UDFA" : `#${ctx.draftPick}`) : "—";
    const gamesCol = ctx && ctx.careerGames !== undefined && ctx.careerGames !== null ? ctx.careerGames : "—";
    return `
    <tr>
      <td>${i+1}.</td>
      <td><a class="player-link" href="player.html?name=${encodeURIComponent(r.player_name)}">${r.player_name}</a></td>
      <td>
        <span class="comp-match-track"><span class="comp-match-bar" style="width:${c.matchPct}%"></span></span>
        <span style="margin-left:6px;font-size:12px;color:var(--muted)">${c.matchPct}%</span>
      </td>
      <td>${closest.join(", ")}</td>
      <td>${furthest.join(", ")}</td>
      <td>${teamCol}</td>
      <td>${pickCol}</td>
      <td>${gamesCol}</td>
    </tr>`;
  }).join("");
}

// ----------------------------------------------------------------------------
// NBA-Erfolgs-Anhaltspunkt: gewichteter Schnitt der Karriere-Spiele der
// Top-Comps (nur die, für die draft-context.json Daten hat), gewichtet mit
// dem Match-%. Bewusst kein "Prognose"-Wording — draft-context.json deckt
// aktuell nur einen kleinen Teil des historischen Pools ab (siehe Methodik-
// Seite), das Ergebnis ist also nur ein grober, oft unvollständiger Anhaltspunkt.
// ----------------------------------------------------------------------------
function renderSuccessBadge(comps, draftContext){
  const card = document.getElementById("successCard");
  const el = document.getElementById("successBadge");
  card.style.display = "block";

  const withCtx = comps
    .map(c => ({ c, ctx: draftContextFor(c.row.player_name, draftContext) }))
    .filter(x => x.ctx && x.ctx.careerGames !== undefined && x.ctx.careerGames !== null);

  if(!withCtx.length){
    el.innerHTML = `
      <div class="success-badge empty">
        <div class="num">—</div>
        <div class="lbl">Für die aktuellen Top-Comps sind noch keine Karriere-Kontextdaten hinterlegt
        (<code>data/draft-context.json</code>, absichtlich nur teilweise gepflegt). Sobald Team/Pick/
        Karriere-Spiele für mehr historische Spieler ergänzt werden, erscheint hier automatisch ein
        Anhaltspunkt.</div>
      </div>`;
    return;
  }

  const totalWeight = withCtx.reduce((s,x)=> s + x.c.matchPct, 0);
  const weightedGames = withCtx.reduce((s,x)=> s + x.ctx.careerGames * x.c.matchPct, 0) / totalWeight;

  el.innerHTML = `
    <div class="success-badge">
      <div class="num">${Math.round(weightedGames)}</div>
      <div class="lbl">Match-gewichteter Schnitt der NBA-Karriere-Spiele unter den Top-Comps mit
      hinterlegten Karrieredaten (${withCtx.length} von ${comps.length}) — kein Modell-Output,
      sondern nur ein grober Anhaltspunkt basierend auf einem noch dünn gepflegten Zusatz-Datensatz.
      Team/Pick/Karriere-Spiele je Comp stehen unten in der Tabelle.</div>
    </div>`;
}

initPlayerPage();
