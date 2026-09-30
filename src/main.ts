import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

const target = document.getElementById("app")!;

// The UI needs the Rust backend. Opened in a normal browser (e.g. localhost:1420) it can't reach Quercus.
if (!("__TAURI_INTERNALS__" in window)) {
  target.innerHTML =
    '<div class="signin"><div class="box"><div class="logo">Q</div><h1>Quirkus</h1><p class="muted">This page only works inside the Quirkus desktop app. Run <code>npm run tauri dev</code> and use the window it opens.</p></div></div>';
} else {
  mount(App, { target });
}
