<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { toast } from "../../lib/api.svelte";
  import { notify, loadNotify, saveNotify, DUE_HOURS, type NotifyPrefs } from "../../lib/prefs.svelte";

  if (!notify.prefs) loadNotify();

  const KINDS: [keyof NotifyPrefs & ("announcements" | "grades" | "messages" | "due"), string, string][] = [
    ["announcements", "Announcements", "When an instructor posts one"],
    ["grades", "Grades", "When a mark is released"],
    ["messages", "Inbox messages", "When someone writes to you in Quercus"],
    ["due", "Deadlines", "A reminder before unfinished work is due"],
  ];

  async function test() {
    try {
      await invoke("notify_test");
      toast("Sent. If nothing appeared, allow Quirkus in your system's notification settings.");
    } catch (e) {
      toast(`Couldn't send a notification: ${e}`);
    }
  }
</script>

{#if notify.prefs}
  {@const p = notify.prefs}
  <label class="opt">
    <div class="opt-text"><div class="opt-t">Desktop notifications</div><div class="opt-d">Quirkus checks Quercus every 10 minutes while it's open.</div></div>
    <input type="checkbox" class="switch" bind:checked={p.enabled} onchange={saveNotify} />
  </label>
  <div class="list boxed" class:off={!p.enabled}>
    {#each KINDS as [key, label, about]}
      <!-- A div, not a label: a label would hand clicks on the row to the first button inside it. -->
      <div class="item pick">
        <label class="main" for="notify-{key}"><span class="t">{label}</span><span class="meta">{about}</span></label>
        {#if key === "due" && p.due && p.enabled}
          <span class="seg small-seg" role="radiogroup" aria-label="How long before">
            {#each DUE_HOURS as [h, text]}
              <button role="radio" aria-checked={p.due_hours === h} class:on={p.due_hours === h} onclick={() => { p.due_hours = h; saveNotify(); }}>{text}</button>
            {/each}
          </span>
        {/if}
        <input id="notify-{key}" type="checkbox" class="switch" bind:checked={p[key]} disabled={!p.enabled} onchange={saveNotify} />
      </div>
    {/each}
  </div>
  <div style="margin-top:10px"><button class="ghost" onclick={test} disabled={!p.enabled}>Send a test notification</button></div>
{/if}
