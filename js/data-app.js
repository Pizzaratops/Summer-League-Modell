// ============================================================================
// data-app.js — Seiten-Logik für daten.html (CSV-Import). Schreibt in denselben
// localStorage-Pool, den js/app.js (index.html) beim Laden liest — dadurch
// bleiben "Daten laden" und "Ranking" trotz getrennter Seiten synchron.
// ============================================================================

const DATA_STORAGE_KEY = "mfhfb_sticky_score_players"; // gleicher Key wie js/app.js

function dataLoadFromStorage(){
  try{
    const raw = localStorage.getItem(DATA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){
    return {};
  }
}

function dataSaveToStorage(players){
  try{
    localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(players));
  }catch(e){
    console.warn("localStorage speichern fehlgeschlagen:", e);
  }
}

function runCalculation(raw, sourceLabel){
  const statusEl = document.getElementById("status");

  if(!raw || !raw.trim()){
    statusEl.className = "error";
    statusEl.textContent = "Keine Daten gefunden — Datei/Text leer?";
    return;
  }

  const {rows, added, skipped, headerError} = parseCSVRows(raw);

  if(headerError){
    statusEl.className = "error";
    statusEl.textContent = "Keine 'Player'-Spalte im Header erkannt. Ist das die richtige CSV (Explorer → Download CSV)?";
    return;
  }

  if(added === 0){
    statusEl.className = "error";
    statusEl.textContent = `Keine gültigen Zeilen erkannt (${skipped} übersprungen). CSV-Format prüfen.`;
    return;
  }

  const seasonTag = document.getElementById("seasonTagSelect").value;
  const players = dataLoadFromStorage();
  // Für die aktuelle Saison (2026) gibt's pro Spieler genau EINE aktuelle
  // Zeile — egal ob sie vom nächtlichen GitHub-Action-Sync oder von einem
  // manuellen Re-Upload hier kommt. Fixer Key statt Dateiname/Zeitstempel,
  // damit ein erneutes Hochladen (z.B. frischere Stats am selben Abend)
  // die alte Zeile ÜBERSCHREIBT statt eine Dublette anzulegen. "auto-2026"
  // ist bewusst derselbe Key wie beim Auto-Sync in js/app.js — so überschreibt
  // ein manueller Refresh sauber die letzte Action-Zeile (und umgekehrt).
  // Für "historisch" bleibt das alte Verhalten (Dateiname/Zeitstempel), weil
  // dort mehrere unterschiedliche Jahrgänge desselben Spielers nebeneinander
  // existieren dürfen und nicht kollidieren sollen.
  const effectiveSourceLabel = seasonTag === "2026" ? "auto-2026" : (sourceLabel || "current");
  rows.forEach(row=>{
    row._seasonTag = seasonTag || "2026";
    const key = row.player_name + "|" + effectiveSourceLabel;
    players[key] = row;

  });
  dataSaveToStorage(players);

  statusEl.className = "ok";
  statusEl.textContent = `${added} Zeilen verarbeitet, ${skipped} übersprungen. Insgesamt ${Object.keys(players).length} Spieler im Pool. Gespeichert im Browser — zurück zum Ranking, um es zu sehen.`;
}

document.getElementById("calcBtn").addEventListener("click", ()=>{
  const fileInput = document.getElementById("csvFile");
  const file = fileInput.files[0];

  if(file){
    const reader = new FileReader();
    reader.onload = (evt)=>{
      runCalculation(evt.target.result, file.name);
      fileInput.value = "";
    };
    reader.onerror = ()=>{
      document.getElementById("status").className = "error";
      document.getElementById("status").textContent = "Datei konnte nicht gelesen werden.";
    };
    reader.readAsText(file);
    return;
  }

  const raw = document.getElementById("pasteInput").value;
  runCalculation(raw, "paste-" + Date.now());
  document.getElementById("pasteInput").value = "";
});

document.getElementById("resetBtn").addEventListener("click", ()=>{
  if(!confirm("Wirklich alle gespeicherten Spielerdaten löschen?")) return;
  localStorage.removeItem(DATA_STORAGE_KEY);
  document.getElementById("status").className = "";
  document.getElementById("status").textContent = "Gespeicherte Daten gelöscht.";
});

(function initStatus(){
  const players = dataLoadFromStorage();
  const n = Object.keys(players).length;
  if(n > 0){
    const statusEl = document.getElementById("status");
    statusEl.className = "ok";
    statusEl.textContent = `${n} Spieler aktuell im Pool gespeichert.`;
  }
})();
