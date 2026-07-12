// ============================================================================
// theme.js — Dark-/Light-Mode-Umschalter. Das eigentliche Setzen des Attributs
// passiert bereits per Inline-Script im <head> (siehe HTML-Dateien), damit es
// keinen hellen Flash beim Laden gibt. Dieses Modul kümmert sich nur noch um
// den Klick-Handler und das Icon des Buttons.
// ============================================================================

const THEME_KEY = "mfhfb_theme";

function applyThemeIcon(){
  const btn = document.getElementById("themeToggle");
  if(!btn) return;
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  btn.textContent = isDark ? "☀️" : "🌙";
  btn.title = isDark ? "Zu Light Mode wechseln" : "Zu Dark Mode wechseln";
}

function toggleTheme(){
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if(isDark){
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem(THEME_KEY, "light");
  }else{
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem(THEME_KEY, "dark");
  }
  applyThemeIcon();
}

document.addEventListener("DOMContentLoaded", ()=>{
  applyThemeIcon();
  const btn = document.getElementById("themeToggle");
  if(btn) btn.addEventListener("click", toggleTheme);
});
