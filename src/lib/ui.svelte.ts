// Sidebar state. Wide windows collapse it in place (remembered); narrow windows use a slide-out drawer.

const NARROW = "(max-width: 860px)";

function load(): boolean {
  try {
    return localStorage.getItem("sidebar") === "collapsed";
  } catch {
    return false;
  }
}

export const ui = $state({ collapsed: load(), drawer: false });

export function toggleSidebar() {
  if (matchMedia(NARROW).matches) {
    ui.drawer = !ui.drawer;
    return;
  }
  ui.collapsed = !ui.collapsed;
  try {
    localStorage.setItem("sidebar", ui.collapsed ? "collapsed" : "open");
  } catch {}
}
