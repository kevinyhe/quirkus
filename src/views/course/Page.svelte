<script lang="ts">
  import { query } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { ago } from "../../lib/format";
  import { openExternal } from "../../lib/links";
  import Top from "../../components/Top.svelte";
  import Eyebrow from "../../components/Eyebrow.svelte";
  import State from "../../components/State.svelte";
  import Html from "../../components/Html.svelte";
  import Icon from "../../components/Icon.svelte";
  import Modules from "./Modules.svelte";
  import type { Crumb, Page } from "../../lib/types";

  let { cid, slug, base = [], front = false }: { cid: string; slug?: string; base?: Crumb[]; front?: boolean } = $props();
  const page = query<Page>(() => (front ? P.frontPage(cid) : P.page(cid, slug!)), 300);
  const section = $derived<Crumb>({ icon: "page", label: "Pages", href: `/c/${cid}/pages` });
</script>

{#if front}
  <!-- Course home set to a page. With no front page, Quercus falls back to modules; so do we. -->
  {#if page.error === "http-404"}
    <Modules {cid} />
  {:else}
    <State q={page} rows={8}><Html html={page.data?.body} /></State>
  {/if}
{:else}
  <Top crumbs={[...base, section, { label: page.data?.title ?? "…" }]}>
    {#if page.data}<button onclick={() => openExternal(page.data!.html_url)}>Open in Quercus<Icon name="external" size={13} /></button>{/if}
  </Top>
  <div class="page">
    <State q={page} rows={10}>
      {@const p = page.data!}
      <Eyebrow {base} {section} />
      <h1 class="title">{p.title}</h1>
      <p class="subtitle">Updated {ago(p.updated_at)}</p>
      <hr class="rule" />
      <Html html={p.body} />
    </State>
  </div>
{/if}
