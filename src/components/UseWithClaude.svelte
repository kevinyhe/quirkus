<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { toast } from "../lib/api.svelte";

  let info = $state<{ exe: string; os: string } | null>(null);
  invoke<{ exe: string; os: string }>("mcp_info").then((i) => (info = i)).catch(() => {});

  const desktopJson = $derived(
    info ? JSON.stringify({ mcpServers: { quirkus: { command: info.exe, args: ["mcp"] } } }, null, 2) : "",
  );
  const codeCmd = $derived(info ? `claude mcp add --scope user quirkus -- "${info.exe}" mcp` : "");
  const desktopFile = $derived(
    info?.os === "windows"
      ? "%APPDATA%\\Claude\\claude_desktop_config.json"
      : info?.os === "macos"
        ? "~/Library/Application Support/Claude/claude_desktop_config.json"
        : null,
  );

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch {
      toast("Couldn't copy. Select the text and copy it instead.");
    }
  }
</script>

<h2 class="big">Use with Claude</h2>
<p class="muted">
  Let Claude answer questions like “what's due this week?”, “summarize the PS3 instructions”, or “when's my next class?”
  from your Quercus and ACORN data. It's read-only: Claude can't submit or change anything. It uses this app's sign-in,
  and only runs if you add it to Claude below.
</p>

{#if info}
  <h2 class="section">Claude Code</h2>
  <div class="snippet">
    <pre>{codeCmd}</pre>
    <button class="ghost" onclick={() => copy(codeCmd)}>Copy</button>
  </div>

  {#if desktopFile}
    <h2 class="section">Claude Desktop</h2>
    <p class="small muted">Add this to <code>{desktopFile}</code> (merge it into <code>mcpServers</code> if the file already has some), then restart Claude.</p>
    <div class="snippet">
      <pre>{desktopJson}</pre>
      <button class="ghost" onclick={() => copy(desktopJson)}>Copy</button>
    </div>
  {/if}

  <p class="small faint">Tools: courses, upcoming deadlines, assignments and instructions, grades, announcements, modules, pages, file text (including PDFs), search, inbox, timetable, academic history.</p>
{/if}
