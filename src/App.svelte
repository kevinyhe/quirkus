<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { app, refreshAll } from "./lib/api.svelte";
  import { route } from "./lib/router.svelte";
  import { loadColors } from "./lib/colors.svelte";
  import { ui, toggleSidebar } from "./lib/ui.svelte";
  import { onHover } from "./lib/prefetch";
  import AcornOverview from "./views/acorn/Overview.svelte";
  import Timetable from "./views/acorn/Timetable.svelte";
  import History from "./views/acorn/History.svelte";
  import { syncIfStale, syncAcorn } from "./lib/acorn.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import Palette from "./components/Palette.svelte";
  import Toasts from "./components/Toasts.svelte";
  import Login from "./views/Login.svelte";
  import Home from "./views/Home.svelte";
  import Due from "./views/Due.svelte";
  import Inbox from "./views/Inbox.svelte";
  import Conversation from "./views/Conversation.svelte";
  import Settings from "./views/Settings.svelte";
  import Course from "./views/course/Course.svelte";
  import Doc from "./views/course/Doc.svelte";

  invoke<boolean>("session").then((s) => (app.signedIn = s));

  listen("signed-in", () => {
    app.signedIn = true;
    app.reconnecting = false;
    refreshAll();
    // The UofT SSO session was just established, so ACORN can sync without asking for anything.
    syncAcorn(false);
  });

  // Session expired mid-use: try UofT SSO in a hidden window. It only appears if you need to type something.
  listen("signed-out", () => {
    if (!app.signedIn || app.reconnecting) return;
    app.reconnecting = true;
    invoke("login_sso", { silent: true });
  });

  function onkeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if ((mod && e.key.toLowerCase() === "r") || e.key === "F5") {
      e.preventDefault();
      refreshAll();
    } else if (mod && e.key === "\\") {
      e.preventDefault();
      toggleSidebar();
    } else if (e.key === "Escape" && ui.drawer) {
      ui.drawer = false;
    } else if (e.altKey && e.key === "ArrowLeft") {
      history.back();
    } else if (e.altKey && e.key === "ArrowRight") {
      history.forward();
    }
  }

  const p = $derived(route.path.split("/").filter(Boolean));

  $effect(() => {
    if (app.signedIn) {
      loadColors();
      syncIfStale();
    }
  });

  let scrolled = $state(false);
</script>

<svelte:window {onkeydown} onmouseover={onHover} />

{#if app.signedIn === false}
  <Login />
{:else if app.signedIn}
  <div class="shell" class:collapsed={ui.collapsed} class:drawer={ui.drawer}>
    <Sidebar />
    {#if ui.drawer}<button class="drawer-scrim" aria-label="Close menu" onclick={() => (ui.drawer = false)}></button>{/if}
    <main id="main" class:scrolled onscroll={(e) => (scrolled = e.currentTarget.scrollTop > 4)}>
      {#if app.reconnecting}
        <div class="note" style="margin:8px 16px">Reconnecting to Quercus. A sign-in window opens if U of T needs your password.</div>
      {/if}
      {#key p[0] === "c" ? p[1] : p.slice(0, 2).join("/")}
        {#if p.length === 0}
          <Home />
        {:else if p[0] === "due"}
          <Due />
        {:else if p[0] === "inbox" && p[1]}
          <Conversation id={p[1]} />
        {:else if p[0] === "inbox"}
          <Inbox />
        {:else if p[0] === "acorn" && p[1] === "timetable"}
          <Timetable />
        {:else if p[0] === "acorn" && p[1] === "history"}
          <History />
        {:else if p[0] === "acorn"}
          <AcornOverview />
        {:else if p[0] === "settings"}
          <Settings />
        {:else if p[0] === "f" && p[1]}
          <Doc id={p[1]} />
        {:else if p[0] === "c" && p[1]}
          <Course cid={p[1]} rest={p.slice(2)} />
        {:else}
          <div class="page"><div class="note">This page doesn't exist. <a href="#/">Go home</a></div></div>
        {/if}
      {/key}
    </main>
  </div>
  <Palette />
{/if}
<Toasts />
