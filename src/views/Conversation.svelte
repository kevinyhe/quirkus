<script lang="ts">
  import { query } from "../lib/api.svelte";
  import { when } from "../lib/format";
  import { initials } from "../lib/icons";
  import { openExternal, openLink } from "../lib/links";
  import Top from "../components/Top.svelte";
  import State from "../components/State.svelte";
  import Icon from "../components/Icon.svelte";
  import type { Conversation } from "../lib/types";

  let { id }: { id: string } = $props();
  const c = query<Conversation>(() => `/api/v1/conversations/${id}`, 30);
  const names = $derived(new Map((c.data?.participants ?? []).map((p) => [p.id, p.name])));
  const subject = $derived(c.data?.subject || "(no subject)");
</script>

<Top crumbs={[{ icon: "inbox", label: "Inbox", href: "/inbox" }, { label: subject }]}>
  <button onclick={() => openExternal(`https://q.utoronto.ca/conversations#filter=type=inbox&id=${id}`)}><Icon name="reply" size={15} />Reply in Quercus</button>
</Top>

<div class="page">
  <State q={c}>
    {@const conv = c.data!}
    <h1 class="title">{subject}</h1>
    <p class="subtitle">{conv.participants.map((p) => p.name).join(", ")}{conv.context_name ? ` · ${conv.context_name}` : ""}</p>
    <div style="margin-top:20px">
      {#each conv.messages ?? [] as m (m.id)}
        {@const who = names.get(m.author_id) ?? "Unknown"}
        <div class="post">
          <span class="avatar">{initials(who)}</span>
          <div class="body">
            <div><span class="who">{who}</span><time>{when(m.created_at)}</time></div>
            <p class="pre" style="margin:6px 0 0">{m.body}</p>
            {#each m.attachments ?? [] as f (f.id)}
              <button class="ghost" style="margin-top:8px" onclick={() => openLink(f.url)}><Icon name="file" size={15} />{f.display_name}</button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </State>
</div>
