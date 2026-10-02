<script lang="ts">
  import { prefs, savePrefs, ACCENTS, isDark, type Accent, type Theme } from "../../lib/prefs.svelte";

  const THEMES: [Theme, string][] = [["system", "Match system"], ["light", "Light"], ["dark", "Dark"]];
  const accents = Object.entries(ACCENTS) as [Accent, (typeof ACCENTS)[Accent]][];
</script>

<div class="opt">
  <div class="opt-text"><div class="opt-t">Theme</div></div>
  <div class="seg" role="radiogroup" aria-label="Theme">
    {#each THEMES as [value, label]}
      <button role="radio" aria-checked={prefs.theme === value} class:on={prefs.theme === value} onclick={() => { prefs.theme = value; savePrefs(); }}>{label}</button>
    {/each}
  </div>
</div>
<div class="opt">
  <div class="opt-text"><div class="opt-t">Accent colour</div><div class="opt-d">Buttons, links, and highlights. Course colours still come from Quercus.</div></div>
  <div class="swatches" role="radiogroup" aria-label="Accent colour">
    {#each accents as [value, a]}
      <button
        class="swatch" class:on={prefs.accent === value} role="radio" aria-checked={prefs.accent === value} title={a.label} aria-label={a.label}
        style:--sw={a[isDark() ? "dark" : "light"][0]}
        onclick={() => { prefs.accent = value; savePrefs(); }}
      ></button>
    {/each}
  </div>
</div>
