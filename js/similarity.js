// ============================================================================
// similarity.js — Vergleichs-Engine: findet die statistisch ähnlichsten
// historischen Summer-League-Spieler zu einem gegebenen Spieler.
//
// Methode: Euklidische Distanz über z-normalisierte "Shape-Stats"
// (PTS/REB/AST/STL/BLK/TOV/OREB/3PAr/FTr/TS%/eFG%, jeweils Per-36 bzw. Rate),
// z-normalisiert gegen den Gesamt-Pool (nicht positionsgefiltert — das Statprofil
// selbst impliziert die Rolle, siehe Sticky-Score-Erklärung). Gefiltert auf
// Spieler mit ≥40 Gesamtminuten (GP × MPG), damit Ein-Spiel-Ausreißer nicht als
// "Comp" auftauchen.
// ============================================================================

const SHAPE_STATS = [
  {key:"pts",               label:"PTS/36"},
  {key:"reb",               label:"TRB/36"},
  {key:"oreb",              label:"ORB/36"},
  {key:"ast",               label:"AST/36"},
  {key:"stl",               label:"STL/36"},
  {key:"blk",               label:"BLK/36"},
  {key:"tov",               label:"TOV/36", invert:true},
  {key:"fg3_attempt_rate",  label:"3PAr"},
  {key:"ft_attempt_rate",   label:"FTr"},
  {key:"ts_pct",            label:"TS%"},
  {key:"efg_pct",           label:"eFG%"},
];

const SIMILARITY_MIN_MINUTES = 40;

// Reichert rohe CSV-Zeilen (player_name, gp, min, pts, ... roh) um die abgeleiteten
// Shape-Stats an (nutzt computeDerived aus stats.js mit leerem Meta-Objekt, da
// Position/Team/Alter für die Ähnlichkeitssuche keine Rolle spielen).
function buildComparablePool(rawRows){
  return rawRows.map(r => computeDerived(r, {}));
}

function poolStats(rows, key){
  const valid = rows.map(r=>r[key]).filter(v=>v!==null && v!==undefined && !isNaN(v));
  if(!valid.length) return {m:0, s:0};
  const m = valid.reduce((a,b)=>a+b,0)/valid.length;
  const v = valid.reduce((a,b)=>a+(b-m)*(b-m),0)/valid.length;
  return {m, s:Math.sqrt(v)};
}

// Baut für jeden Spieler im Pool einen Shape-Vektor (z-normalisiert) + behält die
// rohen Werte für die Anzeige. Gibt {rows, statRefs} zurück (statRefs = mean/std je Stat,
// wird auch für den Zielspieler wiederverwendet, damit beide Seiten dieselbe Skala nutzen).
function prepareSimilarityPool(rawRows){
  const derived = buildComparablePool(rawRows);
  const eligible = derived.filter(r => (r._totalMin ?? 0) >= SIMILARITY_MIN_MINUTES);
  const statRefs = {};
  SHAPE_STATS.forEach(({key}) => { statRefs[key] = poolStats(eligible, key); });

  eligible.forEach(r=>{
    r._shapeVector = SHAPE_STATS.map(({key, invert})=>{
      const ref = statRefs[key];
      const v = r[key];
      if(v===null || v===undefined || isNaN(v) || !ref.s) return 0;
      let z = (v - ref.m) / ref.s;
      if(invert) z = -z;
      return z;
    });
  });
  return {rows: eligible, statRefs};
}

function shapeVectorFor(row, statRefs){
  return SHAPE_STATS.map(({key, invert})=>{
    const ref = statRefs[key];
    const v = row[key];
    if(v===null || v===undefined || isNaN(v) || !ref.s) return 0;
    let z = (v - ref.m) / ref.s;
    if(invert) z = -z;
    return z;
  });
}

function euclideanDistance(a, b){
  let sum = 0;
  for(let i=0;i<a.length;i++){ const d = a[i]-b[i]; sum += d*d; }
  return Math.sqrt(sum);
}

// Findet die N ähnlichsten Spieler aus `pool` (Ergebnis von prepareSimilarityPool) zu
// `targetRow` (muss bereits computeDerived durchlaufen haben). Schließt den Zielspieler
// selbst per Name aus. Gibt Array {row, distance, matchPct} sortiert nach Ähnlichkeit.
function findComps(targetRow, pool, opts){
  opts = opts || {};
  const n = opts.n || 5;
  const excludeName = (targetRow.player_name || "").trim().toLowerCase();

  const targetVector = targetRow._shapeVector || shapeVectorFor(targetRow, pool.statRefs);

  const candidates = pool.rows
    .filter(r => (r.player_name||"").trim().toLowerCase() !== excludeName)
    .map(r => ({row:r, distance: euclideanDistance(targetVector, r._shapeVector)}));

  candidates.sort((a,b)=> a.distance - b.distance);
  const top = candidates.slice(0, n);

  // Distanz -> grobe "Match"-Prozentanzeige (rein visuell, keine statistische Signifikanz):
  // 0 Distanz = 100%, fällt danach mit einer weichen Kurve. Nur zur Einordnung im UI.
  top.forEach(c => { c.matchPct = Math.max(5, Math.round(100 / (1 + c.distance/2))); });

  return top;
}
