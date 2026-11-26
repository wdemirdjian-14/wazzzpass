<script lang="ts">
  import { vault } from '../lib/store.svelte';
  import * as V from '../lib/vault';
  import { copy } from '../lib/clipboard.svelte';
  import Icon from './Icon.svelte';

  let { entry, onedit, ondelete, onclose }: { entry: V.Entry; onedit: () => void; ondelete: () => void; onclose: () => void } =
    $props();

  let showPwd = $state(false);
  let showHistory = $state(false);
  let revealed = $state<Set<number>>(new Set());

  const title = $derived(V.text(entry, 'Title') || '(sans titre)');
  const username = $derived(V.text(entry, 'UserName'));
  const password = $derived(V.text(entry, 'Password'));
  const url = $derived(V.text(entry, 'URL'));
  const notes = $derived(V.text(entry, 'Notes'));
  const family = $derived(V.familyOf(vault(), entry)?.name ?? '');
  const history = $derived(V.passwordHistory(entry));
  const modified = $derived(entry.times.lastModTime);
  const ageDays = $derived(modified ? Math.floor((Date.now() - modified.getTime()) / 86_400_000) : 0);

  const href = $derived(url && !/^[a-z][a-z0-9+.-]*:/i.test(url) ? 'https://' + url : url);
  const safeHref = $derived(/^https?:\/\//i.test(href) ? href : '');

  const fmt = (d?: Date) => (d ? d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const mask = (s: string) => '•'.repeat(Math.min(Math.max(s.length, 8), 16));

  function toggleReveal(i: number) {
    const next = new Set(revealed);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    revealed = next;
  }
</script>

<article class="detail">
  <header class="bar">
    <button class="icon-btn back" onclick={onclose} aria-label="Retour"><Icon name="back" /></button>
    <div class="spacer"></div>
    <button class="btn small" onclick={onedit}><Icon name="edit" /> Modifier</button>
    <button class="icon-btn danger" onclick={ondelete} aria-label="Supprimer" title="Supprimer"><Icon name="trash" /></button>
  </header>

  <div class="head">
    <h2>{title}</h2>
    {#if family}<span class="tag">{family}</span>{/if}
  </div>

  <div class="card fields">
    <div class="f">
      <span class="lbl">Identifiant</span>
      <div class="val">
        <span class="text">{username || '—'}</span>
        {#if username}<button class="icon-btn" onclick={() => copy(username, 'Identifiant')} aria-label="Copier l’identifiant"><Icon name="copy" /></button>{/if}
      </div>
    </div>

    <div class="f">
      <span class="lbl">Mot de passe</span>
      <div class="val">
        <span class="text mono pwd">{password ? (showPwd ? password : mask(password)) : '—'}</span>
        {#if password}
          <button class="icon-btn" onclick={() => (showPwd = !showPwd)} aria-label={showPwd ? 'Masquer' : 'Afficher'}>
            <Icon name={showPwd ? 'eyeoff' : 'eye'} />
          </button>
          <button class="icon-btn" onclick={() => copy(password, 'Mot de passe', true)} aria-label="Copier le mot de passe"><Icon name="copy" /></button>
        {/if}
      </div>
    </div>

    {#if url}
      <div class="f">
        <span class="lbl">URL</span>
        <div class="val">
          {#if safeHref}
            <a class="text" href={safeHref} target="_blank" rel="noopener noreferrer">{url}</a>
          {:else}
            <span class="text">{url}</span>
          {/if}
          <button class="icon-btn" onclick={() => copy(url, 'URL')} aria-label="Copier l’URL"><Icon name="copy" /></button>
        </div>
      </div>
    {/if}

    {#if notes}
      <div class="f">
        <span class="lbl">Notes</span>
        <p class="notes">{notes}</p>
      </div>
    {/if}
  </div>

  <p class="meta muted">
    Modifié le {fmt(modified)}
    {#if ageDays > 365}<span class="old">· plus d’un an, pensez à le changer</span>{/if}
  </p>

  <div class="card history">
    <button class="hist-toggle" onclick={() => (showHistory = !showHistory)} disabled={history.length === 0}>
      <Icon name="history" />
      <span>Anciens mots de passe</span>
      <em>{history.length}</em>
    </button>
    {#if showHistory}
      <ul>
        {#each history as h, i}
          <li>
            <div class="h-main">
              <span class="mono">{revealed.has(i) ? h.password || '(vide)' : mask(h.password)}</span>
              <small class="muted">
                {#if h.username !== username}{h.username || '(sans identifiant)'} · {/if}utilisé jusqu’au {fmt(h.until)}
              </small>
            </div>
            <button class="icon-btn" onclick={() => toggleReveal(i)} aria-label="Afficher"><Icon name={revealed.has(i) ? 'eyeoff' : 'eye'} /></button>
            <button class="icon-btn" onclick={() => copy(h.password, 'Ancien mot de passe', true)} aria-label="Copier"><Icon name="copy" /></button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</article>

<style>
  .detail {
    max-width: 640px;
    margin: 0 auto;
    padding: 0.75rem 1rem 2rem;
    display: grid;
    gap: 1rem;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .spacer {
    flex: 1;
  }
  .icon-btn.danger:hover {
    color: var(--danger);
    background: var(--danger-soft);
  }
  @media (min-width: 900px) {
    .back {
      visibility: hidden;
    }
    .detail {
      padding-top: 1.25rem;
    }
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  h2 {
    font-size: 1.6rem;
    letter-spacing: -0.01em;
    word-break: break-word;
  }
  .tag {
    font-size: 0.78rem;
    color: var(--accent);
    background: var(--accent-soft);
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    font-weight: 600;
  }
  .fields {
    padding: 0 1rem;
  }
  .f {
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--border);
  }
  .f:last-child {
    border-bottom: none;
  }
  .lbl {
    display: block;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted);
    margin-bottom: 0.15rem;
  }
  .val {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    min-height: 2.4rem;
  }
  .text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    user-select: all;
  }
  .pwd {
    font-size: 1.05rem;
  }
  .notes {
    margin: 0.3rem 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .meta {
    margin: -0.25rem 0 0;
    font-size: 0.85rem;
  }
  .old {
    color: #d97706;
  }
  .history {
    overflow: hidden;
  }
  .hist-toggle {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.85rem 1rem;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--text);
    font-weight: 600;
    text-align: left;
  }
  .hist-toggle:disabled {
    cursor: default;
    color: var(--muted);
  }
  .hist-toggle :global(svg) {
    width: 1.1rem;
    height: 1.1rem;
    color: var(--muted);
  }
  .hist-toggle span {
    flex: 1;
  }
  .hist-toggle em {
    font-style: normal;
    color: var(--muted);
    font-weight: 500;
  }
  .history ul {
    list-style: none;
    margin: 0;
    padding: 0 1rem 0.5rem;
    border-top: 1px solid var(--border);
  }
  .history li {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--border);
  }
  .history li:last-child {
    border-bottom: none;
  }
  .h-main {
    flex: 1;
    min-width: 0;
    display: grid;
    overflow-wrap: anywhere;
  }
  .h-main small {
    font-size: 0.78rem;
  }
</style>
