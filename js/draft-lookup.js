// ============================================================================
// draft-lookup.js — Team-Zuordnung für gedraftete Spieler des 2026 NBA Draft
// (23./24. Juni 2026), inkl. Trades bis Stand 10. Juli 2026.
// Quelle: nba.com/news/2026-nba-draft-order. Nur informativ, fließt NICHT in
// den Score ein. Spieler, die hier NICHT auftauchen, waren Undrafted Free
// Agents (UDFA) — Team manuell eintragen.
//
// HINWEIS: Dieser Lookup deckt nur den AKTUELLEN Draft-Jahrgang ab. Für
// historische Draft-Picks/Karriere-Kontext bei Vergleichsspielern (player.html)
// siehe stattdessen data/draft-context.json (separat, best-effort, siehe README).
// ============================================================================
const DRAFT_TEAM_LOOKUP = {
  "AJ Dybantsa": "Washington", "Darryn Peterson": "Utah", "Cameron Boozer": "Memphis",
  "Caleb Wilson": "Chicago", "Keaton Wagler": "LA Clippers", "Mikel Brown Jr.": "Brooklyn",
  "Darius Acuff Jr.": "Sacramento", "Kingston Flemings": "Atlanta", "Morez Johnson Jr.": "Dallas",
  "Brayden Burries": "Milwaukee", "Yaxel Lendeborg": "Golden State", "Aday Mara": "Oklahoma City",
  "Nate Ament": "Milwaukee", "Hannes Steinbach": "Charlotte", "Dailyn Swain": "Chicago",
  "Bennett Stirtz": "Oklahoma City", "Ebuka Okorie": "Detroit", "Christian Anderson": "Charlotte",
  "Allen Graves": "Toronto", "Jayden Quaintance": "San Antonio", "Karim López": "Memphis",
  "Labaron Philon Jr.": "Philadelphia", "Zuby Ejiofor": "Atlanta", "Cameron Carr": "LA Lakers",
  "Sergio de Larrea": "Dallas", "Tarris Reed Jr.": "San Antonio", "Chris Cenac Jr.": "Boston",
  "Joshua Jefferson": "Brooklyn", "Alex Karaban": "Sacramento", "Koa Peat": "Phoenix",
  "Bruce Thornton": "Houston", "Richie Saunders": "Memphis", "Isaiah Evans": "Minnesota",
  "Meleek Thomas": "Cleveland", "Trevon Brazile": "Denver", "Baba Miller": "LA Clippers",
  "Ryan Conwell": "Miami", "Braden Smith": "Indiana", "Jack Kayil": "New York",
  "Dillon Mitchell": "Boston", "Otega Oweh": "Oklahoma City", "Ja'Kobi Gillespie": "San Antonio",
  "Tyler Bilodeau": "Brooklyn", "Maliq Brown": "San Antonio", "Emanuel Sharp": "Sacramento",
  "Felix Okpara": "Washington", "Tyler Nickel": "New York", "Tobi Lawal": "Dallas",
  "Bryce Hopkins": "Denver", "Jaden Bradley": "Toronto", "Izaiyah Nelson": "Orlando",
  "Henri Veesaar": "Atlanta", "Ugonna Onyenso": "Detroit", "Lajae Jones": "Golden State",
  "Nick Martinelli": "LA Clippers", "Vsevolod Ishchenko": "Dallas", "Narcisse Ngoy": "LA Clippers",
  "Jaron Pierre Jr.": "New Orleans", "Trey Kaufman-Renn": "Minnesota", "Malique Lewis": "Milwaukee",
};

function normalizeName(name){
  return (name || "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\.?\b/g, "").replace(/[^a-z]/g, "");
}
const DRAFT_TEAM_LOOKUP_NORMALIZED = {};
Object.keys(DRAFT_TEAM_LOOKUP).forEach(name => {
  DRAFT_TEAM_LOOKUP_NORMALIZED[normalizeName(name)] = DRAFT_TEAM_LOOKUP[name];
});
function lookupDraftTeam(playerName){
  return DRAFT_TEAM_LOOKUP[playerName] || DRAFT_TEAM_LOOKUP_NORMALIZED[normalizeName(playerName)] || "";
}
