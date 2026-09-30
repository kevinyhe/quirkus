<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { openExternal } from "../lib/links";

  let token = $state("");
  let busy = $state(false);
  let error = $state("");
  let showToken = $state(false);

  async function sso() {
    error = "";
    await invoke("login_sso", { silent: false }).catch((e) => (error = String(e)));
  }

  async function useToken(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = "";
    try {
      await invoke("set_token", { token });
      location.reload();
    } catch (err) {
      error = String(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="signin">
  <div class="box">
    <div class="logo">Q</div>
    <h1>Quirkus</h1>
    <p class="muted" style="margin:0">Your U of T Quercus courses, deadlines, and files, plus your ACORN timetable, in one fast window. Sign in with your UTORid to start.</p>

    <button class="solid" onclick={sso}>Continue with UTORid</button>
    <p class="small faint" style="margin:0">Opens the regular U of T sign-in page. Your password goes only to U of T.</p>

    {#if !showToken}
      <button class="text small" style="align-self:flex-start" onclick={() => (showToken = true)}>Use an access token instead</button>
    {:else}
      <form onsubmit={useToken}>
        <p class="small muted" style="margin:0">
          In Quercus, open <button type="button" class="text small" onclick={() => openExternal("https://q.utoronto.ca/profile/settings")}>Account → Settings</button>
          and choose “New Access Token”.
        </p>
        <input type="password" bind:value={token} placeholder="Paste token" autocomplete="off" />
        <button class="solid" disabled={!token.trim() || busy}>{busy ? "Checking…" : "Continue"}</button>
      </form>
    {/if}

    {#if error}<div class="note bad">{error}</div>{/if}
  </div>
</div>
