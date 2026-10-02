<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { query, toast } from "../../lib/api.svelte";
  import { PROFILE } from "../../lib/paths";
  import { acorn } from "../../lib/acorn.svelte";
  import { timetableIcs } from "../../lib/ics";
  import { openExternal } from "../../lib/links";
  import Icon from "../Icon.svelte";

  // Quercus gives every student a private calendar feed of their due dates and course events.
  const profile = query<{ calendar?: { ics?: string } }>(() => PROFILE, 3600);
  const feed = $derived(profile.data?.calendar?.ics ?? "");
  const webcal = $derived(feed.replace(/^https?:/, "webcal:"));

  const google = () => openExternal(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`);
  const outlook = () => openExternal(`https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}&name=${encodeURIComponent("Quercus")}`);
  const system = () => openExternal(webcal);
  async function copy() {
    try {
      await navigator.clipboard.writeText(feed);
      toast("Link copied");
    } catch {
      toast("Couldn't copy the link.");
    }
  }

  const classes = $derived(timetableIcs(acorn.data).events);
  async function exportTimetable() {
    try {
      const path = await invoke<string>("save_calendar", { ics: timetableIcs(acorn.data).ics });
      await invoke("open_path", { path }).catch(() => {});
      toast(`Saved to ${path}`, { label: "Show in folder", run: () => invoke("reveal_path", { path }) });
    } catch (e) {
      toast(`Couldn't save the timetable: ${e}`);
    }
  }
</script>

<div class="connect">
  <div class="connect-head">
    <Icon name="calendar" />
    <div><div class="opt-t">Deadlines</div><div class="opt-d">Due dates and course events from Quercus. Your calendar keeps them up to date on its own.</div></div>
  </div>
  {#if feed}
    <div class="connect-actions">
      <button class="ghost" onclick={google}>Google Calendar<Icon name="external" size={13} /></button>
      <button class="ghost" onclick={outlook}>Outlook<Icon name="external" size={13} /></button>
      <button class="ghost" onclick={system}>Apple or default calendar</button>
      <button onclick={copy}>Copy link</button>
    </div>
    <p class="small faint" style="margin:8px 0 0">This is your private Quercus calendar link. Anyone with it can see your due dates, so only add it to calendars you own.</p>
  {:else}
    <p class="small faint" style="margin:8px 0 0">{profile.loading ? "Getting your calendar link…" : "Quercus didn't give a calendar link. Find it in Quercus under Calendar → Calendar Feed."}</p>
  {/if}
</div>

<div class="connect">
  <div class="connect-head">
    <Icon name="clock" />
    <div><div class="opt-t">Class timetable</div><div class="opt-d">Your lectures and tutorials from ACORN as weekly events, with rooms. Saved as a calendar file that opens in your calendar app.</div></div>
  </div>
  <div class="connect-actions">
    <button class="ghost" onclick={exportTimetable} disabled={!classes}><Icon name="download" size={15} />Export timetable</button>
    <span class="small faint">{classes ? `${classes} weekly classes` : "Appears once ACORN has synced."}</span>
  </div>
  <p class="small faint" style="margin:8px 0 0">Term start and end dates are estimated, and reading weeks and holidays aren't removed. Export again if your timetable changes.</p>
</div>
