// ============================================================================
// stats.js — geteilte Parsing- und Score-Logik (Sticky Score / Rotation Score)
// Unverändert aus der ursprünglichen Single-File-Version übernommen, nur in ein
// eigenes Modul ausgelagert, damit index.html und player.html dieselbe Logik
// nutzen (keine Duplikate, keine Drift zwischen den Seiten).
// ============================================================================

// CSV-Header (aus nbadraft.app Explorer-Export) -> interner Feldname
const HEADER_MAP = {
  "player":"player_name", "gp":"gp", "min":"min", "pts":"pts", "reb":"reb",
  "ast":"ast", "stl":"stl", "blk":"blk", "tov":"tov", "oreb":"oreb", "dreb":"dreb",
  "pf":"pf", "+/-":"plus_minus", "efg%":"efg_pct", "fgm":"fgm", "fga":"fga",
  "3pm":"fg3m", "3pa":"fg3a", "ftm":"ftm", "fta":"fta", "fg%":"fg_pct",
  "3p%":"fg3_pct", "ft%":"ft_pct", "gmsc":"game_score", "ts%":"ts_pct",
};

function parseNum(txt){
  if(txt === undefined || txt === null) return null;
  txt = String(txt).trim();
  if(txt === "" || txt === "—" || txt === "-") return null;
  const n = parseFloat(txt.replace(/,/g,""));
  return isNaN(n) ? null : n;
}

function splitCSVLine(line){
  // Einfacher CSV-Split (reicht hier, da keine Felder mit eingebetteten Kommas vorkommen)
  return line.split(",").map(s=>s.trim());
}

// Parst rohen CSV-Text in ein Array von Row-Objekten (interne Feldnamen).
// Gibt {rows, added, skipped, headerError} zurück. Schreibt NICHT in einen globalen Store —
// das macht der Aufrufer (siehe js/app.js), damit dieses Modul auch für den historischen
// Katalog (player.html) ohne Seiteneffekte nutzbar ist.
function parseCSVRows(raw){
  const lines = raw.split(/\r?\n/).map(l=>l).filter(l=>l.trim().length>0);
  if(lines.length < 2) return {rows:[], added:0, skipped:0};

  const headerCells = splitCSVLine(lines[0]).map(h=>h.trim().toLowerCase());
  const fieldForCol = headerCells.map(h => HEADER_MAP[h] || null);

  if(!fieldForCol.includes("player_name")){
    return {rows:[], added:0, skipped:lines.length-1, headerError:true};
  }

  const rows = [];
  let added = 0, skipped = 0;

  for(let i=1;i<lines.length;i++){
    const cells = splitCSVLine(lines[i]);
    if(cells.length < 5){ skipped++; continue; }

    const row = {};
    fieldForCol.forEach((field, idx)=>{
      if(!field) return;
      if(field === "player_name") row.player_name = cells[idx];
      else row[field] = parseNum(cells[idx]);
    });

    if(!row.player_name || row.gp === null || row.gp === undefined){ skipped++; continue; }

    rows.push(row);
    added++;
  }
  return {rows, added, skipped};
}

function safeDiv(a,b){
  if(a===null||b===null||b===0) return null;
  return a/b;
}

// Best-effort Fallback-Datenquelle für Position/Alter/Team, wenn weder lokal
// (localStorage) noch in player-meta-overrides.json noch im aktuellen
// 2026er-Draft-Lookup (js/draft-lookup.js) etwas hinterlegt ist. Wird von der
// aufrufenden Seite (js/app.js) per fetch aus data/draft-context.json befüllt
// — hier nur gelesen, damit dieses Modul seiteneffektfrei bleibt.
let DRAFT_CONTEXT_DATA = {};
const CURRENT_SL_SEASON_YEAR = 2026;

function normalizeDraftContextKey(name){
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function draftContextLookup(name){
  return DRAFT_CONTEXT_DATA[normalizeDraftContextKey(name)] || null;
}
// data/draft-context.json liefert Basketball-Reference-Positionen (G, F, C,
// G-F, F-C, ...) — auf das 3er-Schema der App (Guard/Wing/Big) gemappt.
function draftContextPositionGroup(pos){
  if(!pos) return null;
  if(pos === "G") return "G";
  if(pos === "F" || pos === "G-F" || pos === "F-G") return "W";
  if(pos === "C" || pos === "F-C" || pos === "C-F") return "B";
  return null;
}

// playerMeta: {position, age, tag, team} keyed by Spielername — wird von der aufrufenden
// Seite verwaltet und hier nur gelesen. lookupDraftTeam kommt aus js/draft-lookup.js.
function computeDerived(r, playerMeta){
  const d = {...r};
  d.fg3_attempt_rate = safeDiv(r.fg3a, r.fga);
  d.ft_attempt_rate  = safeDiv(r.fta, r.fga);
  d.ast_to           = safeDiv(r.ast, r.tov);
  d.two_pct          = safeDiv((r.fgm ?? 0) - (r.fg3m ?? 0), (r.fga ?? 0) - (r.fg3a ?? 0));
  // GmSc kommt direkt aus der CSV (nbadraft.app liefert es fertig, geprüft gegen Hollinger-Formel).
  // Fallback nur falls die Spalte im Import fehlt.
  if(r.game_score === null || r.game_score === undefined){
    d.game_score = (r.pts ?? 0) + 0.4*(r.fgm ?? 0) - 0.7*(r.fga ?? 0) - 0.4*((r.fta ?? 0)-(r.ftm ?? 0))
                        + 0.7*(r.oreb ?? 0) + 0.3*(r.dreb ?? 0) + (r.stl ?? 0) + 0.7*(r.ast ?? 0)
                        + 0.7*(r.blk ?? 0) - 0.4*(r.pf ?? 0) - (r.tov ?? 0);
  }
  d.fantasy_pts      = (r.pts ?? 0) + (r.fg3m ?? 0) + (r.fgm ?? 0)*2 - (r.fga ?? 0) + (r.ftm ?? 0) - (r.fta ?? 0)
                        + (r.reb ?? 0) + (r.ast ?? 0)*2 + (r.stl ?? 0)*4 + (r.blk ?? 0)*4 - (r.tov ?? 0)*2;
  d._totalMin = (r.gp ?? 0) * (r.min ?? 0);
  d._lowSample = d._totalMin < 30;
  // DRE/36 (Daily RAPM Estimate, Ferrigan/Nylon Calculus 2015, bulk-Variante).
  d.dre36 = (r.pts ?? 0) + 0.2*(r.reb ?? 0) + 1.7*(r.stl ?? 0) + 0.535*(r.blk ?? 0)
            + 0.5*(r.ast ?? 0) - 0.9*(r.fga ?? 0) - 0.35*(r.fta ?? 0) - 1.4*(r.tov ?? 0);
  d.mpg              = r.min;
  const meta = (playerMeta && playerMeta[r.player_name]) || {};
  const ctx = draftContextLookup(r.player_name); // Fallback: data/draft-context.json (auto-bbref)

  const posManual = !!meta.position;
  d._position = posManual ? meta.position : draftContextPositionGroup(ctx && ctx.position); // "G" | "W" | "B" | null
  d._positionAuto = !posManual && !!d._position;

  const ageManual = meta.age !== undefined && meta.age !== "";
  const ageFromCtx = (ctx && ctx.ageAtDraft != null && ctx.draftYear != null)
    ? (ctx.ageAtDraft + (CURRENT_SL_SEASON_YEAR - ctx.draftYear))
    : null;
  d._age = ageManual ? parseFloat(meta.age) : ageFromCtx;
  d._ageAuto = !ageManual && d._age !== null;

  d._tag = meta.tag || "";

  const teamManual = meta.team !== undefined && meta.team !== "";
  const team2026 = !teamManual && typeof lookupDraftTeam === "function" ? lookupDraftTeam(r.player_name) : "";
  const teamFromCtx = (!teamManual && !team2026 && ctx && ctx.team) ? ctx.team : "";

  d._team = teamManual ? meta.team : (team2026 || teamFromCtx || "");
  d._teamAuto = !teamManual && !!team2026;       // aus offiziellem 2026-Draft-Ergebnis (js/draft-lookup.js)
  d._teamAutoHist = !teamManual && !team2026 && !!teamFromCtx; // aus data/draft-context.json (Draft-Team, ggf. veraltet bei Trades)
  return d;
}

// stat key, invertiert? (niedriger=besser), Tier (null = wird berechnet, aber nicht direkt aufsummiert)
const STAT_DEFS = [
  ["ast",              false, "sticky", "AST/36"],
  ["blk",              false, "sticky", "BLK/36"],
  ["reb",              false, null,     "TRB/36"],   // fließt nur kombiniert (s.u.) in Sticky ein
  ["oreb",             false, null,     "ORB/36"],   // fließt nur kombiniert (s.u.) in Sticky ein

  ["fg3_attempt_rate", false, "other", "3PT Att. Rate"],
  ["fg3a",             false, "other", "3PA/36"],
  ["dreb",             false, "other", "DRB/36"],
  ["pf",               true,  "other", "PF/36"],
  ["fga",              false, "other", "FGA/36"],
  ["fantasy_pts",      false, "other", "FantPts/36"],
  ["tov",              true,  "other", "TOV/36"],
  ["ft_attempt_rate",  false, "other", "FT Att. Rate"],
  ["ast_to",           false, "other", "AST/TO"],
  ["fta",              false, "other", "FTA/36"],
  ["pts_adj",          false, "other", "PTS/36 (eff.-bereinigt)"],

  ["stl",              false, "icky", "STL/36"],
  ["ft_pct",           false, "icky", "FT%"],
  ["game_score",       false, "icky", "Game Score/36"],
  ["dre36",            false, "icky", "DRE/36 (Ferrigan-Proxy)"],
  ["efg_pct",          false, "icky", "eFG%"],
  ["two_pct",          false, "icky", "2P%"],
  ["ts_pct",           false, "icky", "TS%"],
  ["mpg",              false, "icky", "MPG"],
  ["fg3_pct",          false, "icky", "3P%"],
  ["plus_minus",       false, "icky", "+/-"],
];

function mean(arr){ return arr.reduce((a,b)=>a+b,0)/arr.length; }
function std(arr, m){
  if(arr.length < 2) return 0;
  const v = arr.reduce((a,b)=>a+(b-m)*(b-m),0)/arr.length;
  return Math.sqrt(v);
}

function groupStats(rows, key){
  const buckets = {ALL: rows};
  rows.forEach(r=>{
    if(r._position) (buckets[r._position] = buckets[r._position] || []).push(r);
  });
  const out = {};
  Object.entries(buckets).forEach(([g, arr])=>{
    const valid = arr.map(r=>r[key]).filter(v=>v!==null && v!==undefined && !isNaN(v));
    const m = valid.length ? mean(valid) : 0;
    const s = valid.length ? std(valid, m) : 0;
    out[g] = {m, s, n: valid.length};
  });
  return out;
}

const MIN_GROUP_N = 3;
const SHRINK_K = 40;

function zFor(row, key, inverted, stats){
  const v = row[key];
  if(v===null || v===undefined || isNaN(v)) return 0;
  const useGroup = row._position && stats[row._position] && stats[row._position].n >= MIN_GROUP_N;
  const ref = useGroup ? stats[row._position] : stats.ALL;
  if(!ref || ref.s === 0) return 0;
  let z = (v - ref.m) / ref.s;
  if(inverted) z = -z;
  return z;
}

function computeScores(playersObj, playerMeta, weights){
  const rows = Object.values(playersObj).map(r => computeDerived(r, playerMeta));

  const tsPool = rows.map(r=>r.ts_pct).filter(v=>v!==null && v!==undefined && !isNaN(v));
  const tsMean = tsPool.length ? mean(tsPool) : 0;
  const tsStd  = tsPool.length ? std(tsPool, tsMean) : 0;
  const ptsPool = rows.map(r=>r.pts).filter(v=>v!==null && v!==undefined && !isNaN(v));
  const ptsMean = ptsPool.length ? mean(ptsPool) : 0;
  const ptsStd  = ptsPool.length ? std(ptsPool, ptsMean) : 0;

  rows.forEach(r=>{
    const zTS  = (tsStd>0 && r.ts_pct!=null)  ? (r.ts_pct - tsMean)/tsStd : 0;
    const zPts = (ptsStd>0 && r.pts!=null)    ? (r.pts - ptsMean)/ptsStd : 0;
    const factor = Math.min(1.4, Math.max(0.6, 1 + 0.3*zTS));
    r.pts_adj = (r.pts ?? 0) * factor;
    r._effFlag = (zPts >= 0.75 && zTS <= -0.75);
    r._zPtsRaw = zPts;
    r._zTsRaw = zTS;
  });

  const zLookup = {};
  STAT_DEFS.forEach(([key, inverted])=>{
    const stats = groupStats(rows, key);
    zLookup[key] = rows.map(r => zFor(r, key, inverted, stats));
  });

  rows.forEach((r, idx)=>{
    let stickySum=0, otherSum=0, ickySum=0;
    const shrink = r._totalMin / (r._totalMin + SHRINK_K);
    r._confShrink = shrink;

    STAT_DEFS.forEach(([key,,tier])=>{
      const z = zLookup[key][idx];
      r["_z_"+key] = z;
      const zs = z * shrink;
      if(tier==="sticky") stickySum += zs;
      if(tier==="other")  otherSum += zs;
      if(tier==="icky")   ickySum += zs;
    });

    const reboundZ = 0.7*zLookup.reb[idx] + 0.3*zLookup.oreb[idx];
    r._z_rebound_combined = reboundZ;
    stickySum += reboundZ * shrink;

    r._stickySub = stickySum * weights.sticky;
    r._otherSub  = otherSum  * weights.other;
    r._ickySub   = ickySum   * weights.icky;
    r._total     = r._stickySub + r._otherSub + r._ickySub;

    const contributions = [];
    STAT_DEFS.forEach(([key,,tier,label])=>{
      if(!tier) return;
      const w = weights[tier];
      contributions.push({ label, tier, z: zLookup[key][idx], contribution: zLookup[key][idx]*shrink*w });
    });
    contributions.push({ label:"TRB+ORB (komb.)", tier:"sticky", z: reboundZ, contribution: reboundZ*shrink*weights.sticky });

    contributions.sort((a,b)=> b.contribution - a.contribution);
    const best = contributions[0];
    const worst = contributions[contributions.length-1];

    r._bestCat = best;
    r._worstCat = worst;
    r._bestCatSort  = best.contribution;
    r._worstCatSort = worst.contribution;
    r._scoreMinusBest  = r._total - best.contribution;
    r._scoreMinusWorst = r._total - worst.contribution;
    r._outlierNote = Math.abs(best.z) > 2 ? best : (Math.abs(worst.z) > 2 ? worst : null);
  });

  rows.sort((a,b)=> b._total - a._total);
  return rows;
}

const MIN_FTA36 = 3;
const MIN_3PA36 = 2;

function computeRotationScores(playersObj, playerMeta){
  const rows = Object.values(playersObj).map(r => computeDerived(r, playerMeta));

  const zLookup = {};
  ["ast_to","stl","ft_pct","fg3_pct","ts_pct","fga"].forEach(key=>{
    const stats = groupStats(rows, key);
    zLookup[key] = rows.map(r => zFor(r, key, false, stats));
  });

  rows.forEach((r, idx)=>{
    const zAstTo = zLookup.ast_to[idx];
    const zStl   = zLookup.stl[idx];
    let zFt = (r.fta ?? 0) >= MIN_FTA36 ? zLookup.ft_pct[idx] : 0;
    let z3p = (r.fg3a ?? 0) >= MIN_3PA36 ? zLookup.fg3_pct[idx] : 0;

    const effAtLowUsage = zLookup.ts_pct[idx] - 0.5*zLookup.fga[idx];
    const ageBonus = 0;

    const components = [
      {label:"AST/TOV",   z:zAstTo,          weight:1},
      {label:"STL/36",    z:zStl,            weight:1.5},
      {label:"FT%",       z:zFt,             weight:1},
      {label:"3P%",       z:z3p,             weight:1},
      {label:"Eff. bei wenig Volumen", z:effAtLowUsage, weight:1},
    ];
    const dominant = components.filter(c => c.z > 1.5);
    const singleSkillBonus = dominant.length === 1 ? 1 : 0;

    r._rotComponents = components;
    r._z_astto = zAstTo;
    r._z_stl   = zStl;
    r._z_ft    = zFt;
    r._z_3p    = z3p;
    r._z_effLowUsage = effAtLowUsage;
    r._rotAgeBonus = ageBonus;
    r._rotSingleSkillBonus = singleSkillBonus;
    r._rotSingleSkillLabel = dominant.length === 1 ? dominant[0].label : null;
    r._rotationScore = components.reduce((s,c)=> s + c.z*c.weight, 0) + ageBonus + singleSkillBonus;
  });

  rows.sort((a,b)=> b._rotationScore - a._rotationScore);
  return rows;
}

function fmt(n, digits=1){
  if(n===null || n===undefined || isNaN(n)) return "—";
  return n.toFixed(digits);
}

function dreTier(v){
  if(v===null || v===undefined || isNaN(v)) return {emoji:"", label:""};
  if(v < 5)  return {emoji:"🔴", label:"Kritisch prüfen"};
  if(v < 6)  return {emoji:"⚪", label:"Unterdurchschnittlich"};
  if(v < 10) return {emoji:"🟡", label:"Golden Threshold"};
  return {emoji:"🟢", label:"Star-Signal"};
}

function minMax(rows, key){
  const valid = rows.map(r=>r[key]).filter(v=>v!==null && v!==undefined && !isNaN(v));
  if(!valid.length) return {min:null, max:null};
  return {min:Math.min(...valid), max:Math.max(...valid)};
}

const COLOR_COLS = {
  _total:"high", pts:"high", ast:"high", stl:"high", blk:"high",
  tov:"low", ts_pct:"high", _z_rebound_combined:"high", dre36:"high",
};

function gradientStyle(key, value, mm){
  const dir = COLOR_COLS[key];
  if(!dir || value===null || value===undefined || isNaN(value) || mm.min===mm.max) return "";
  let t = (value - mm.min) / (mm.max - mm.min);
  if(dir === "low") t = 1 - t;
  const hue = t * 120;
  // Alpha-Blend statt fixem hellem Hintergrund, damit es auch im Dark Mode
  // über der Kartenfarbe funktioniert statt weiß/hell zu wirken.
  return `style="background:hsla(${hue.toFixed(0)},70%,55%,0.28);"`;
}
