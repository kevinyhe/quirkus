<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { query, refreshAll, toast } from "../lib/api.svelte";
  import { SELF } from "../lib/paths";
  import Top from "../components/Top.svelte";
  import Icon from "../components/Icon.svelte";
  import UseWithClaude from "../components/UseWithClaude.svelte";
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
</script>

<Top crumbs={[{ icon: "settings", label: "Settings" }]} />

<div class="page">
  <h1 class="title">Settings</h1>

  <h2 class="big">Account</h2>
  <div class="facts">
    <div class="fact"><div class="k">Name</div><div class="v">{me.data?.name ?? "…"}</div></div>
    {#if me.data?.primary_email}<div class="fact"><div class="k">Email</div><div class="v">{me.data.primary_email}</div></div>{/if}
  </div>
  <div style="margin-top:12px"><button class="ghost danger" onclick={signOut}><Icon name="signout" size={15} />Sign out</button></div>

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

  <p class="faint small" style="margin-top:48px">Unofficial client. Not affiliated with the University of Toronto or Instructure.</p>
</div>
