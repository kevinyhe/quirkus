<script lang="ts">
  import { query } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { when } from "../../lib/format";
  import { initials } from "../../lib/icons";
  import { openExternal, openLink } from "../../lib/links";
  import Top from "../../components/Top.svelte";
  import Eyebrow from "../../components/Eyebrow.svelte";
  import State from "../../components/State.svelte";
  import Html from "../../components/Html.svelte";
  import Icon from "../../components/Icon.svelte";
  import type { Crumb, DiscussionEntry, DiscussionView, Topic } from "../../lib/types";

  let { cid, id, base }: { cid: string; id: string; base: Crumb[] } = $props();
  const topic = query<Topic>(() => P.topic(cid, id), 120);
  const thread = query<DiscussionView>(() => P.topicView(cid, id), 120);
  const names = $derived(new Map((thread.data?.participants ?? []).map((p) => [p.id, p.display_name])));
  const section = $derived<Crumb>(
    topic.data?.is_announcement
      ? { icon: "megaphone", label: "Announcements", href: `/c/${cid}/announcements` }
      : { icon: "discussion", label: "Discussions", href: `/c/${cid}/discussions` },
  );
</script>

{#snippet entry(e: DiscussionEntry)}
  {@const who = names.get(e.user_id ?? -1) ?? "Someone"}
  <div class="post">
    <span class="avatar">{e.deleted ? "" : initials(who)}</span>
    <div class="body">
      {#if e.deleted}
        <span class="faint">Deleted</span>
      {:else}
        <div><span class="who">{who}</span><time>{when(e.created_at)}</time></div>
        <Html html={e.message} />
      {/if}
      {#if e.replies?.length}
        <div class="replies">{#each e.replies as r (r.id)}{@render entry(r)}{/each}</div>
      {/if}
    </div>
  </div>
{/snippet}

<Top crumbs={[...base, section, { label: topic.data?.title ?? "…" }]}>
  {#if topic.data}<button onclick={() => openExternal(topic.data!.html_url)}><Icon name="reply" size={15} />Reply in Quercus</button>{/if}
</Top>

<div class="page">
  <State q={topic} rows={8}>
    {@const t = topic.data!}
    <Eyebrow {base} {section} />
    <h1 class="title">{t.title}</h1>
    <p class="subtitle"><span>{t.author?.display_name ?? t.user_name ?? ""}</span>{#if t.posted_at}<span class="dot-sep">{when(t.posted_at)}</span>{/if}</p>
    {#if t.attachments?.length}
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">
        {#each t.attachments as f (f.id)}<button class="ghost" onclick={() => openLink(f.url)}><Icon name="file" size={15} />{f.display_name}</button>{/each}
      </div>
    {/if}
    {#if t.locked_for_user && t.lock_explanation}<div class="note"><Icon name="lock" /><Html html={t.lock_explanation} /></div>{/if}
    <hr class="rule" />
    <Html html={t.message} />

    {#if thread.data?.view?.length}
      <h2 class="big">Replies <span class="faint" style="font-weight:500">{thread.data.view.length}</span></h2>
      {#each thread.data.view as e (e.id)}{@render entry(e)}{/each}
    {:else if thread.error === "http-403"}
      <div class="note"><Icon name="lock" /><span>Post a reply in Quercus to see other people's replies.</span></div>
    {/if}
  </State>
</div>
