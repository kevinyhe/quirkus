<script lang="ts">
  import { get, peek } from "../lib/api.svelte";
  import { go } from "../lib/router.svelte";
  import { COURSES, groups, pages, modules, visible, shortCode } from "../lib/paths";
  import { SECTION_ICON, ITEM_ICON } from "../lib/icons";
  import Icon from "./Icon.svelte";
  import Mark from "./Mark.svelte";
  import { itemRoute } from "../lib/links";
  import { day } from "../lib/format";
  import type { AssignmentGroup, Course, Module, Page } from "../lib/types";

  interface Item {
    icon: string;
    course?: { id: number; code: string };
    label: string;
    sub: string;
    hash: string;
    hay: string;
  }

  let open = $state(false);
  let text = $state("");
  let sel = $state(0);
  let items = $state<Item[]>([]);
  let input: HTMLInputElement | undefined = $state();

  const NAV: Item[] = [
    ["home", "Home", "/"],
    ["calendar", "Due", "/due"],
    ["inbox", "Inbox", "/inbox"],
    ["clock", "Timetable", "/acorn/timetable"],
    ["history", "Academic history", "/acorn/history"],
    ["acorn", "ACORN", "/acorn"],
    ["settings", "Settings", "/settings"],
  ].map(([icon, label, hash]) => ({ icon, label, sub: "", hash, hay: label.toLowerCase() }));

  const SECTIONS = ["assignments", "modules", "grades", "files", "announcements", "syllabus"];

  async function load() {
    const courses = visible(peek<Course[]>(COURSES) ?? (await get<Course[]>(COURSES).catch(() => [])));
    const base: Item[] = [...NAV];
    for (const c of courses) {
      const code = shortCode(c);
      base.push({ icon: "", course: { id: c.id, code: c.course_code }, label: c.name, sub: code, hash: `/c/${c.id}`, hay: `${c.name} ${c.course_code}`.toLowerCase() });
      for (const s of SECTIONS) {
        const label = s[0].toUpperCase() + s.slice(1);
        base.push({ icon: SECTION_ICON[s], label: `${code} ${label}`, sub: "", hash: `/c/${c.id}/${s}`, hay: `${code} ${s}`.toLowerCase() });
      }
    }
    items = base;
    // Assignments, pages and module items come from the local cache, so this is quick after the first run.
    await Promise.all(
      courses.map(async (c) => {
        const code = shortCode(c);
        const [gs, ps, ms] = await Promise.all([
          get<AssignmentGroup[]>(groups(c.id), 3600).catch(() => []),
          get<Page[]>(pages(c.id), 3600).catch(() => []),
          get<Module[]>(modules(c.id), 3600).catch(() => []),
        ]);
        const more: Item[] = [];
        const seen = new Set<string>();
        const add = (it: Item) => {
          if (seen.has(it.hash)) return;
          seen.add(it.hash);
          more.push(it);
        };
        for (const g of gs) for (const a of g.assignments) {
          add({ icon: "assignment", label: a.name, sub: `${code} · ${a.due_at ? "Due " + day(a.due_at) : g.name}`, hash: `/c/${c.id}/a/${a.id}`, hay: `${a.name} ${code}`.toLowerCase() });
        }
        for (const p of ps) {
          add({ icon: "page", label: p.title, sub: code, hash: `/c/${c.id}/p/${p.url}`, hay: `${p.title} ${code}`.toLowerCase() });
        }
        for (const m of ms) for (const it of m.items ?? []) {
          const hash = itemRoute(c.id, it);
          if (!hash) continue;
          add({ icon: ITEM_ICON[it.type] || "file", label: it.title, sub: `${code} · ${m.name}`, hash, hay: `${it.title} ${code} ${m.name}`.toLowerCase() });
        }
        items = items.concat(more);
      }),
    );
  }

  const results = $derived.by(() => {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return items.slice(0, 10);
    const hits: [number, Item][] = [];
    for (const it of items) {
      if (!words.every((w) => it.hay.includes(w))) continue;
      // Words found in the title beat words found only in the course code ("3" in CSC263).
      const label = it.label.toLowerCase();
      const missing = words.filter((w) => !label.includes(w)).length;
      const score = missing * 10 + (label.startsWith(words[0]) ? 0 : 1) + it.label.length / 200;
      hits.push([score, it]);
    }
    return hits.sort((a, b) => a[0] - b[0]).slice(0, 40).map((h) => h[1]);
  });

  $effect(() => {
    void text;
    sel = 0;
  });

  $effect(() => {
    addEventListener("palette", show);
    return () => removeEventListener("palette", show);
  });

  function show() {
    open = true;
    text = "";
    load();
    queueMicrotask(() => input?.focus());
  }

  function pick(it: Item | undefined) {
    if (!it) return;
    open = false;
    go(it.hash);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") sel = Math.min(sel + 1, results.length - 1);
    else if (e.key === "ArrowUp") sel = Math.max(sel - 1, 0);
    else if (e.key === "Enter") pick(results[sel]);
    else if (e.key === "Escape") open = false;
    else return;
    e.preventDefault();
    queueMicrotask(() => document.querySelector(".palette li.on")?.scrollIntoView({ block: "nearest" }));
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "k" || e.key.toLowerCase() === "p")) {
      e.preventDefault();
      open ? (open = false) : show();
    }
  }}
/>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={() => (open = false)}>
    <div class="palette" onclick={(e) => e.stopPropagation()}>
      <div class="q">
        <Icon name="search" />
        <input bind:this={input} bind:value={text} {onkeydown} placeholder="Search courses, assignments, pages, files…" />
      </div>
      <ul>
        {#each results as it, i (it.hash + i)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
          <li class:on={i === sel} onclick={() => pick(it)} onmousemove={() => (sel = i)}>
            {#if it.course}<Mark id={it.course.id} code={it.course.code} size={18} />{:else}<Icon name={it.icon} />{/if}
            <span class="ellipsis">{it.label}</span>{#if it.sub}<small class="ellipsis">{it.sub}</small>{/if}
          </li>
        {:else}
          <li class="faint">No matches</li>
        {/each}
      </ul>
      <div class="foot"><span><kbd>↑</kbd> <kbd>↓</kbd> select</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
    </div>
  </div>
{/if}
