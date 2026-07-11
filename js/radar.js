// ============================================================================
// radar.js — generischer SVG-Spinnendiagramm-Renderer (keine Abhängigkeiten).
// Erwartet normalisierte Werte 0..1 pro Achse (0 = Rand, 1 = Zentrum-fern/bester Wert).
// ============================================================================

function renderRadarSVG(opts){
  const {
    labels,        // Array<string> Achsen-Beschriftungen
    seriesA,        // Array<number 0..1> Zielspieler
    seriesB,        // Array<number 0..1> Comp-Spieler (optional)
    labelANameText, // Anzeigename Zielspieler
    labelBNameText, // Anzeigename Comp-Spieler (optional)
    size = 400,
  } = opts;

  const cx = size/2, cy = size/2;
  const radius = size*0.36;
  const n = labels.length;
  const angleFor = (i) => (Math.PI*2*i/n) - Math.PI/2;

  function pointFor(i, value){
    const a = angleFor(i);
    const r = radius * Math.max(0, Math.min(1, value));
    return [cx + r*Math.cos(a), cy + r*Math.sin(a)];
  }

  // Gitter-Ringe (25/50/75/100%)
  let gridRings = "";
  [0.25,0.5,0.75,1].forEach(t=>{
    const pts = labels.map((_,i)=>{
      const [x,y] = pointFor(i, t);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    gridRings += `<polygon points="${pts}" fill="none" stroke="var(--border,#dfe3e8)" stroke-width="1"/>`;
  });

  // Speichen
  let spokes = "";
  labels.forEach((_,i)=>{
    const [x,y] = pointFor(i, 1);
    spokes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border,#dfe3e8)" stroke-width="1"/>`;
  });

  // Achsen-Labels
  let labelEls = "";
  labels.forEach((lab,i)=>{
    const [x,y] = pointFor(i, 1.16);
    const anchor = Math.abs(x-cx) < 4 ? "middle" : (x > cx ? "start" : "end");
    labelEls += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="11" fill="var(--muted,#6b7280)" text-anchor="${anchor}" dominant-baseline="middle">${lab}</text>`;
  });

  function seriesPolygon(series, color, opacity, name){
    if(!series) return "";
    const pts = series.map((v,i)=>{
      const [x,y] = pointFor(i, v);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const dots = series.map((v,i)=>{
      const [x,y] = pointFor(i, v);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}"><title>${name||""}</title></circle>`;
    }).join("");
    return `<polygon points="${pts}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="2"/>${dots}`;
  }

  const bPoly = seriesB ? seriesPolygon(seriesB, "var(--navy,#13294B)", 0.12, labelBNameText) : "";
  const aPoly = seriesPolygon(seriesA, "var(--orange,#E84A0C)", 0.20, labelANameText);

  return `
  <svg viewBox="0 0 ${size} ${size}" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg">
    ${gridRings}
    ${spokes}
    ${bPoly}
    ${aPoly}
    ${labelEls}
  </svg>`;
}
