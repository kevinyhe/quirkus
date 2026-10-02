<script lang="ts">
  // First-run tour: connect your accounts, then set the app up one choice per screen. Every step after
  // sign-in can be skipped, and everything here is also in Settings.
  import { tick } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { app, query } from "../lib/api.svelte";
  import { SELF } from "../lib/paths";
  import { prefs, savePrefs, loadNotify, isDark, type Accent } from "../lib/prefs.svelte";
  import { acorn, loadAcorn, syncAcorn, courses as acornCourses } from "../lib/acorn.svelte";
  import { openExternal } from "../lib/links";
  import { go } from "../lib/router.svelte";
  import Look from "../components/setup/Look.svelte";
  import Courses from "../components/setup/Courses.svelte";
  import Notify from "../components/setup/Notify.svelte";
  import Calendar from "../components/setup/Calendar.svelte";
  import Icon from "../components/Icon.svelte";
  import type { User } from "../lib/types";

  type Step = "hello" | "signin" | "look" | "courses" | "notify" | "calendar" | "done";
  const ORDER: Step[] = ["hello", "signin", "look", "courses", "notify", "calendar", "done"];

  let step = $state<Step>("hello");
  let dir = $state(1);
  const me = query<User>(() => (app.signedIn ? SELF : null), 3600);
  const first = $derived((me.data?.short_name ?? me.data?.name ?? "").split(/\s+/)[0]);

  function show(next: Step, d = 1) {
    dir = d;
    step = next;
    if (next === "notify") loadNotify();
  }
  function move(d: number) {
    const i = ORDER.indexOf(step) + d;
    if (i >= 0 && i < ORDER.length) show(ORDER[i], d);
  }
  const next = () => move(1);
  const back = () => move(-1);

  // The window's colours: a bright three-colour wash that follows the accent you pick.
  const WASH: Record<Accent, [string, string, string]> = {
    navy: ["#2f43ff", "#8a3dff", "#ff5d9e"],
    forest: ["#0a8f5c", "#22c3a1", "#c9e24a"],
    teal: ["#0b8fb0", "#2f6bff", "#6fe9cf"],
    plum: ["#6d28ff", "#d53cff", "#ff7b54"],
    rose: ["#ff2f72", "#ff7a3d", "#a63cff"],
    amber: ["#ff8a1f", "#ff4f47", "#ffd24a"],
    graphite: ["#30303c", "#5d5d74", "#9486ff"],
  };
  const wash = $derived(WASH[prefs.accent]);
  // Read here so the wash re-dims when the theme changes.
  const dim = $derived((prefs.theme, isDark() ? "42%" : "0%"));

  // ---- accounts ----
  // ACORN signs in through the same U of T login, a few seconds after Quercus. It only needs you if
  // U of T asks for a password or Duo again, or if you used an access token (which ACORN can't use).
  $effect(() => {
    if (app.signedIn) loadAcorn();
  });
  const acornState = $derived.by(() => {
    const d = acorn.data;
    if (!app.signedIn) return "waiting";
    if (d?.state === "syncing") return "syncing";
    if (d?.syncedAt) return "connected";
    return "needed";
  });
  const classes = $derived(acornCourses(acorn.data).length);

  function finish() {
    prefs.onboarded = true;
    savePrefs();
    if (prefs.startPage !== "/") go(prefs.startPage);
  }

  // ---- sign-in ----
  let token = $state("");
  let busy = $state(false);
  let waiting = $state(false);
  let error = $state("");
  let showToken = $state(false);

  async function sso() {
    error = "";
    waiting = true;
    await invoke("login_sso", { silent: false }).catch((e) => {
      error = String(e);
      waiting = false;
    });
  }
  async function useToken(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = "";
    try {
      await invoke("set_token", { token });
      app.signedIn = true;
      showToken = false;
    } catch (err) {
      error = String(err);
    } finally {
      busy = false;
    }
  }

  const dots = $derived(ORDER.filter((s) => s !== "hello" && s !== "done"));

  // Each step's main button takes focus, so Enter moves through the tour.
  let root: HTMLElement;
  $effect(() => {
    void step;
    tick().then(() => root?.querySelector<HTMLButtonElement>(".w-step button.w-go")?.focus({ preventScroll: true }));
  });
</script>

<div class="welcome" bind:this={root} style:--g1={wash[0]} style:--g2={wash[1]} style:--g3={wash[2]} style:--dim={dim}>
  <div class="glow" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="grain" aria-hidden="true"></div>

  <header class="w-top">
    {#if step !== "hello" && step !== "done"}
      <button class="icon" onclick={back} aria-label="Back"><Icon name="back" /></button>
      <div class="w-dots" aria-label="Step {dots.indexOf(step) + 1} of {dots.length}">
        {#each dots as s}<span class:on={s === step} class:past={ORDER.indexOf(s) < ORDER.indexOf(step)}></span>{/each}
      </div>
      {#if app.signedIn}<button class="w-skip" onclick={finish}>Skip setup</button>{:else}<span class="w-skip"></span>{/if}
    {/if}
  </header>

  {#key step}
    <section class="w-step" class:back={dir < 0}>
      {#if step === "hello"}
        <div class="w-logo"><span>Q</span></div>
        <h1 class="w-big">Meet Quirkus</h1>
        <p class="w-lead">Quercus and ACORN in one fast window. Your courses, deadlines, files, and timetable, without the waiting.</p>
        <button class="w-go" onclick={next}>Get started</button>
        <p class="w-fine">Unofficial. Not affiliated with the University of Toronto.</p>
      {:else if step === "signin"}
        <h1>Connect your accounts</h1>
        <p class="w-lead">One U of T sign-in covers both. Your password goes only to U of T, and what Quirkus loads stays on this computer.</p>
        <div class="w-card">
          <div class="acct">
            <span class="acct-mark q">Q</span>
            <div class="opt-text"><div class="opt-t">Quercus</div><div class="opt-d">Courses, deadlines, files, grades, inbox</div></div>
            {#if app.signedIn}
              <span class="tag ok"><Icon name="check" size={12} />{first ? `Signed in as ${first}` : "Signed in"}</span>
            {:else}
              <button class="solid" onclick={sso}>{waiting ? "Waiting for U of T…" : "Continue with UTORid"}</button>
            {/if}
          </div>
          {#if !app.signedIn}
            <div class="acct-more">
              {#if waiting}<p class="small muted" style="margin:0 0 6px">Finish signing in in the window that opened. This page updates by itself.</p>{/if}
              {#if !showToken}
                <button class="text small" onclick={() => (showToken = true)}>Use an access token instead</button>
              {:else}
                <form onsubmit={useToken}>
                  <p class="small muted" style="margin:0">
                    In Quercus, open <button type="button" class="text small" onclick={() => openExternal("https://q.utoronto.ca/profile/settings")}>Account → Settings</button>
                    and choose “New Access Token”. A token signs in to Quercus only, so ACORN will ask for your UTORid.
                  </p>
                  <div class="token-row">
                    <input type="password" bind:value={token} placeholder="Paste token" autocomplete="off" />
                    <button class="ghost" disabled={!token.trim() || busy}>{busy ? "Checking…" : "Use token"}</button>
                  </div>
                </form>
              {/if}
              {#if error}<div class="note bad" style="margin:8px 0 0">{error}</div>{/if}
            </div>
          {/if}

          <div class="acct">
            <span class="acct-mark a"><Icon name="acorn" size={17} /></span>
            <div class="opt-text"><div class="opt-t">ACORN</div><div class="opt-d">Timetable, academic history, account notices</div></div>
            {#if acornState === "waiting"}
              <span class="small faint">After Quercus</span>
            {:else if acornState === "syncing"}
              <span class="small muted" style="display:flex;gap:6px;align-items:center"><span class="spin"><Icon name="refresh" size={14} /></span>Connecting…</span>
            {:else if acornState === "connected"}
              <span class="tag ok"><Icon name="check" size={12} />{classes ? `Connected · ${classes} courses` : "Connected"}</span>
            {:else}
              <button class="solid" onclick={() => syncAcorn(true)}>Sign in to ACORN</button>
            {/if}
          </div>
          {#if acornState === "needed"}
            <div class="acct-more"><p class="small muted" style="margin:0">{acorn.data?.state === "error" ? "ACORN didn't answer. Try again, or connect it later from the Timetable screen." : "U of T wants your UTORid again for ACORN. You can also do this later from the Timetable screen."}</p></div>
          {/if}
        </div>
        <div class="w-nav"><button class="w-go" onclick={next} disabled={!app.signedIn}>Continue</button></div>
      {:else if step === "look"}
        <h1>{first ? `Hi ${first}. Make it yours.` : "Make it yours."}</h1>
        <p class="w-lead">Pick a theme and a colour. The window changes as you choose.</p>
        <div class="w-card"><Look /></div>
      {:else if step === "courses"}
        <h1>Your courses</h1>
        <p class="w-lead">These are the courses Quercus lists as current. Turn off any you don't want in the sidebar.</p>
        <div class="w-card flush"><Courses /></div>
      {:else if step === "notify"}
        <h1>Stay in the loop</h1>
        <p class="w-lead">Choose what Quirkus tells you about. It checks Quercus and shows a desktop notification. Nothing leaves your computer.</p>
        <div class="w-card"><Notify /></div>
      {:else if step === "calendar"}
        <h1>Put it on your calendar</h1>
        <p class="w-lead">Add your deadlines and classes to the calendar you already use. You can do this later in Settings.</p>
        <div class="w-card flush"><Calendar /></div>
      {:else}
        <div class="w-logo"><span><Icon name="check" size={38} /></span></div>
        <h1 class="w-big">You're set</h1>
        <p class="w-lead">Press <kbd>Ctrl K</kbd> anywhere to search every course, assignment, and file. Everything you just chose is in Settings.</p>
        <button class="w-go" onclick={finish}>Open Quirkus</button>
      {/if}

      {#if step !== "hello" && step !== "done" && step !== "signin"}
        <div class="w-nav"><button class="w-go" onclick={next}>Continue</button></div>
      {/if}
    </section>
  {/key}
</div>
