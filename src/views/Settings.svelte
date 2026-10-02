<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { query, refreshAll, toast } from "../lib/api.svelte";
  import { SELF } from "../lib/paths";
  import Top from "../components/Top.svelte";
  import Icon from "../components/Icon.svelte";
  import UseWithClaude from "../components/UseWithClaude.svelte";
  import Look from "../components/setup/Look.svelte";
  import Courses from "../components/setup/Courses.svelte";
  import Notify from "../components/setup/Notify.svelte";
  import Calendar from "../components/setup/Calendar.svelte";
  import { prefs, savePrefs, ZOOMS, START_PAGES, HOME_DAYS } from "../lib/prefs.svelte";
  import type { User } from "../lib/types";

  const me = query<User>(() => SELF, 3600);

  async function clearCache() {
    await invoke("clear_cache");
    refreshAll();
    toast("Local copy cleared. Reloading from Quercus.");
  }

  async function signOut() {
    await invoke("logout");
    location.hash = "/";
    location.reload();
  }

  function replayTour() {
    prefs.onboarded = false;
    savePrefs();
  }
</script>

{#snippet choice<T>(label: string, options: [T, string][], value: T, set: (v: T) => void, about = "")}
  <div class="opt">
    <div class="opt-text"><div class="opt-t">{label}</div>{#if about}<div class="opt-d">{about}</div>{/if}</div>
    <div class="seg" role="radiogroup" aria-label={label}>
      {#each options as [v, text]}
        <button role="radio" aria-checked={value === v} class:on={value === v} onclick={() => { set(v); savePrefs(); }}>{text}</button>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet toggle(label: string, key: "hour24" | "homeClasses" | "homeCourses" | "homeAnnouncements" | "showAcorn", about = "")}
  <label class="opt">
    <div class="opt-text"><div class="opt-t">{label}</div>{#if about}<div class="opt-d">{about}</div>{/if}</div>
    <input type="checkbox" class="switch" bind:checked={prefs[key]} onchange={savePrefs} />
  </label>
{/snippet}

<Top crumbs={[{ icon: "settings", label: "Settings" }]} />

<div class="page">
  <h1 class="title">Settings</h1>

  <h2 class="big">Account</h2>
  <div class="facts">
    <div class="fact"><div class="k">Name</div><div class="v">{me.data?.name ?? "…"}</div></div>
    {#if me.data?.primary_email}<div class="fact"><div class="k">Email</div><div class="v">{me.data.primary_email}</div></div>{/if}
  </div>
  <div style="margin-top:12px"><button class="ghost danger" onclick={signOut}><Icon name="signout" size={15} />Sign out</button></div>

  <h2 class="big">Appearance</h2>
  <Look />
  {@render choice("Size", ZOOMS.map((z): [number, string] => [z, `${z}%`]), prefs.zoom, (v) => (prefs.zoom = v), "Makes everything in the window larger or smaller.")}
  {@render toggle("24-hour clock", "hour24", "Show times as 23:59 instead of 11:59 PM.")}

  <h2 class="big">Home and sidebar</h2>
  {@render choice("Open on", START_PAGES, prefs.startPage, (v) => (prefs.startPage = v), "The first screen when Quirkus starts.")}
  {@render choice("Home looks ahead", HOME_DAYS, prefs.homeDays, (v) => (prefs.homeDays = v), "How far ahead the due list on Home reaches.")}
  {@render toggle("Classes today on Home", "homeClasses")}
  {@render toggle("Courses on Home", "homeCourses")}
  {@render toggle("Announcements on Home", "homeAnnouncements")}
  {@render toggle("ACORN in the sidebar", "showAcorn", "Timetable, academic history, and account notices.")}

  <h2 class="big">Courses</h2>
  <p class="muted">Courses you turn off disappear from the sidebar, Home, and search. They're still in Quercus.</p>
  <Courses />

  <h2 class="big">Notifications</h2>
  <Notify />

  <h2 class="big">Calendar</h2>
  <p class="muted">Add your deadlines and classes to the calendar you already use.</p>
  <Calendar />

  <h2 class="big">Data</h2>
  <p class="muted">Screens open from a local copy and update in the background. Files you view are kept in a 1 GB cache. "Open in app" copies a file to <code>~/Downloads/Quercus/&lt;course&gt;/</code>.</p>
  <div style="display:flex;gap:8px;margin-top:12px">
    <button class="ghost" onclick={refreshAll}><Icon name="refresh" size={15} />Refresh everything</button>
    <button class="ghost" onclick={clearCache}>Clear local copy</button>
  </div>

  <UseWithClaude />

  <h2 class="big">Keyboard</h2>
  <div class="table">
    <table class="grid">
      <tbody>
        <tr><td class="nowrap"><kbd>Ctrl K</kbd></td><td>Search courses, assignments, pages, and files</td></tr>
        <tr><td class="nowrap"><kbd>Ctrl R</kbd></td><td>Refresh from Quercus</td></tr>
        <tr><td class="nowrap"><kbd>Alt ←</kbd> <kbd>Alt →</kbd></td><td>Back and forward</td></tr>
        <tr><td class="nowrap"><kbd>Ctrl +</kbd> <kbd>Ctrl −</kbd> <kbd>Ctrl 0</kbd></td><td>Zoom a PDF</td></tr>
      </tbody>
    </table>
  </div>

  <div style="margin-top:36px"><button class="ghost" onclick={replayTour}>Show the welcome tour again</button></div>

  <p class="faint small" style="margin-top:48px">Unofficial client. Not affiliated with the University of Toronto or Instructure.</p>
</div>
