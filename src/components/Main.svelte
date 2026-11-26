<script lang="ts">
  import { app, vault, commit } from '../lib/store.svelte';
  import * as V from '../lib/vault';
  import Icon from './Icon.svelte';
  import EntryDetail from './EntryDetail.svelte';
  import EntryForm from './EntryForm.svelte';
  import Settings from './Settings.svelte';

  let { onlock }: { onlock: () => void } = $props();

  let query = $state('');
  let familyId = $state<string>('all');
  let selectedId = $state<string | null>(null);
  let mode = $state<'view' | 'edit' | 'new' | null>(null);
  let settingsOpen = $state(false);
  let searchInput: HTMLInputElement | undefined = $state();

  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();

  const families = $derived.by(() => {
    app.version;
    return V.families(vault());
  });

  const all = $derived.by(() => {
    app.version;
    const db = vault();
    return V.allEntries(db).map((e) => {
      const fam = V.familyOf(db, e);
      return {
        entry: e,
        id: e.uuid.id,
        title: V.text(e, 'Title') || '(sans titre)',
        username: V.text(e, 'UserName'),
        url: V.text(e, 'URL'),
        familyId: fam?.uuid.id ?? '',
        familyName: fam?.name ?? '',
        haystack: norm([V.text(e, 'Title'), V.text(e, 'UserName'), V.text(e, 'URL'), V.text(e, 'Notes'), fam?.name ?? ''].join(' ')),
      };
    });
  });

  const counts = $derived.by(() => {
    const c = new Map<string, number>();
    for (const r of all) c.set(r.familyId, (c.get(r.familyId) ?? 0) + 1);
    return c;
  });

  const visible = $derived.by(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    return all.filter(
      (r) => (familyId === 'all' || r.familyId === familyId) && words.every((w) => r.haystack.includes(w)),
    );
  });

  const selected = $derived(all.find((r) => r.id === selectedId)?.entry ?? null);

  // Si l'entrée affichée disparaît (suppression, rechargement), on referme le panneau
  $effect(() => {
    if (selectedId && !selected && mode !== 'new') {
      selectedId = null;
      mode = null;
    }
  });

  function open(id: string) {
    selectedId = id;
    mode = 'view';
  }

  function close() {
    mode = null;
    selectedId = null;
  }

  function newEntry() {
    selectedId = null;
    mode = 'new';
  }

  async function save(input: V.EntryInput, family: V.Group) {
    let created: V.Entry | null = null;
    const target = selected;
    const ok = await commit((db) => {
      if (target) V.updateEntry(db, target, input, family);
      else created = V.createEntry(db, family, input);
    });
    if (ok) {
      if (created) selectedId = (created as V.Entry).uuid.id;
      mode = 'view';
    }
  }

  async function remove(entry: V.Entry) {
    if (!confirm(`Supprimer « ${V.text(entry, 'Title')} » ?`)) return;
    if (await commit((db) => V.deleteEntry(db, entry))) close();
  }

  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      searchInput?.focus();
      searchInput?.select();
    } else if (e.key === 'Escape' && mode === 'view') close();
  }

  const avatarHue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
</script>

<svelte:window onkeydown={onKey} />

<div class="layout" class:detail-open={mode !== null}>
  <!-- Colonne familles (ordinateur) -->
  <aside class="sidebar">
    <div class="brand">wazzz<span>pass</span></div>
    <nav>
      <button class="fam" class:active={familyId === 'all'} onclick={() => (familyId = 'all')}>
        <Icon name="folder" /> <span>Toutes</span> <em>{all.length}</em>
      </button>
      {#each families as f (f.uuid.id)}
        <button class="fam" class:active={familyId === f.uuid.id} onclick={() => (familyId = f.uuid.id)}>
          <Icon name="folder" /> <span>{f.name}</span> <em>{counts.get(f.uuid.id) ?? 0}</em>
        </button>
      {/each}
    </nav>
    <div class="side-foot">
      <button class="btn ghost small" onclick={() => (settingsOpen = true)}><Icon name="gear" /> Réglages</button>
    </div>
  </aside>

  <!-- Liste -->
  <section class="list-col">
    <header class="top">
      <div class="search">
        <Icon name="search" />
        <input
          bind:this={searchInput}
          bind:value={query}
          type="search"
          placeholder="Rechercher…"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="search"
        />
      </div>
      <button class="icon-btn mobile-only" onclick={() => (settingsOpen = true)} aria-label="Réglages"><Icon name="gear" /></button>
      <button class="icon-btn" onclick={onlock} aria-label="Verrouiller" title="Verrouiller"><Icon name="lock" /></button>
    </header>

    <div class="chips mobile-only">
      <button class="chip" class:active={familyId === 'all'} onclick={() => (familyId = 'all')}>Toutes · {all.length}</button>
      {#each families as f (f.uuid.id)}
        <button class="chip" class:active={familyId === f.uuid.id} onclick={() => (familyId = f.uuid.id)}>
          {f.name} · {counts.get(f.uuid.id) ?? 0}
        </button>
      {/each}
    </div>

    {#if app.error && mode === null}<p class="error banner">{app.error}</p>{/if}

    <ul class="list">
      {#each visible as r (r.id)}
        <li>
          <button class="item" class:active={r.id === selectedId} onclick={() => open(r.id)}>
            <span class="avatar" data-hue={avatarHue(r.familyName || r.title) % 8}>{r.title.slice(0, 1).toUpperCase()}</span>
            <span class="txt">
              <strong>{r.title}</strong>
              <small>{r.username || r.url || ' '}</small>
            </span>
            {#if familyId === 'all' && r.familyName}<span class="tag">{r.familyName}</span>{/if}
          </button>
        </li>
      {:else}
        <li class="empty">
          {#if all.length === 0}
            <p><strong>Votre coffre est vide.</strong></p>
            <p class="muted">Ajoutez votre premier mot de passe avec le bouton +.</p>
          {:else}
            <p class="muted">Aucun résultat{query ? ` pour « ${query} »` : ''}.</p>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="status muted">
      {#if app.saving}Enregistrement chiffré…{:else if app.lastSync}Synchronisé · {app.lastSync.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}{/if}
    </div>

    <button class="fab" onclick={newEntry} aria-label="Ajouter un mot de passe"><Icon name="plus" /></button>
  </section>

  <!-- Détail / édition -->
  <section class="detail-col">
    {#if mode === 'new'}
      <EntryForm
        entry={null}
        {families}
        defaultFamily={families.find((f) => f.uuid.id === familyId) ?? families[0]}
        onsave={save}
        oncancel={close}
      />
    {:else if mode === 'edit' && selected}
      <EntryForm entry={selected} {families} defaultFamily={V.familyOf(vault(), selected) ?? families[0]} onsave={save} oncancel={() => (mode = 'view')} />
    {:else if mode === 'view' && selected}
      {#key app.version}
        <EntryDetail entry={selected} onedit={() => (mode = 'edit')} ondelete={() => remove(selected!)} onclose={close} />
      {/key}
    {:else}
      <div class="placeholder muted">
        <Icon name="lock" />
        <p>Sélectionnez un mot de passe</p>
        <p class="small">⌘K pour rechercher</p>
      </div>
    {/if}
  </section>
</div>

{#if settingsOpen}
  <Settings onclose={() => (settingsOpen = false)} />
{/if}

<style>
  .layout {
    display: grid;
    grid-template-columns: 1fr;
    min-height: 100dvh;
  }
  .sidebar,
  .detail-col {
    display: none;
  }
  .list-col {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    min-width: 0;
  }

  /* Mobile : le détail s'ouvre en plein écran par-dessus la liste */
  .layout.detail-open .detail-col {
    display: block;
    position: fixed;
    inset: 0;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    background: var(--bg);
    overflow-y: auto;
    z-index: 20;
    animation: slide 0.18s ease-out;
  }
  @keyframes slide {
    from {
      transform: translateX(24px);
      opacity: 0;
    }
  }

  @media (min-width: 900px) {
    .layout {
      grid-template-columns: 230px minmax(300px, 380px) 1fr;
      height: 100dvh;
      overflow: hidden;
    }
    .sidebar {
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--border);
      background: var(--surface);
      padding: 1rem 0.6rem;
      overflow-y: auto;
    }
    .list-col {
      min-height: 0;
      border-right: 1px solid var(--border);
      overflow: hidden;
    }
    .detail-col,
    .layout.detail-open .detail-col {
      display: block;
      position: static;
      padding: 0;
      overflow-y: auto;
      animation: none;
      z-index: auto;
    }
    .mobile-only {
      display: none !important;
    }
  }

  .brand {
    font-weight: 800;
    font-size: 1.25rem;
    letter-spacing: -0.02em;
    padding: 0.2rem 0.6rem 1rem;
  }
  .brand span {
    color: var(--accent);
  }
  nav {
    display: grid;
    gap: 2px;
  }
  .fam {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    padding: 0.5rem 0.6rem;
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    text-align: left;
    color: var(--text);
  }
  .fam :global(svg) {
    width: 1rem;
    height: 1rem;
    color: var(--muted);
    flex: none;
  }
  .fam span {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fam em {
    font-style: normal;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .fam:hover {
    background: var(--surface-2);
  }
  .fam.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .fam.active :global(svg),
  .fam.active em {
    color: var(--accent);
  }
  .side-foot {
    margin-top: auto;
    padding-top: 1rem;
  }

  .top {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    padding: 0.75rem 0.75rem 0.5rem;
  }
  .search {
    flex: 1;
    position: relative;
  }
  .search :global(svg) {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1.1rem;
    height: 1.1rem;
    color: var(--muted);
  }
  .search input {
    padding-left: 2.4rem;
    background: var(--surface);
    border-radius: 12px;
  }

  .chips {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    padding: 0.25rem 0.75rem 0.6rem;
    scrollbar-width: none;
  }
  .chips::-webkit-scrollbar {
    display: none;
  }
  .chip {
    flex: none;
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 999px;
    padding: 0.35rem 0.8rem;
    font-size: 0.85rem;
    cursor: pointer;
    color: var(--text);
  }
  .chip.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
  }

  .banner {
    margin: 0 0.75rem 0.5rem;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0 0.5rem 6rem;
    overflow-y: auto;
    flex: 1;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.6rem 0.6rem;
    border: none;
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
    text-align: left;
    color: var(--text);
  }
  .item:hover {
    background: var(--surface);
  }
  .item.active {
    background: var(--accent-soft);
  }
  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 10px;
    font-weight: 700;
    color: #fff;
    background: #6366f1;
  }
  .avatar[data-hue='1'] {
    background: #0ea5e9;
  }
  .avatar[data-hue='2'] {
    background: #10b981;
  }
  .avatar[data-hue='3'] {
    background: #f59e0b;
  }
  .avatar[data-hue='4'] {
    background: #ef4444;
  }
  .avatar[data-hue='5'] {
    background: #8b5cf6;
  }
  .avatar[data-hue='6'] {
    background: #ec4899;
  }
  .avatar[data-hue='7'] {
    background: #14b8a6;
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .txt strong,
  .txt small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .txt small {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .tag {
    flex: none;
    font-size: 0.72rem;
    color: var(--muted);
    background: var(--surface-2);
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    max-width: 8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    text-align: center;
    padding: 3rem 1rem;
  }
  .empty p {
    margin: 0.3rem 0;
  }

  .status {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 0.5rem 1rem calc(0.5rem + env(safe-area-inset-bottom));
    font-size: 0.75rem;
    background: linear-gradient(transparent, var(--bg) 40%);
    pointer-events: none;
  }
  .fab {
    position: absolute;
    right: 1rem;
    bottom: calc(1rem + env(safe-area-inset-bottom));
    width: 3.4rem;
    height: 3.4rem;
    border-radius: 50%;
    border: none;
    background: var(--accent);
    color: var(--accent-text);
    display: grid;
    place-items: center;
    cursor: pointer;
    box-shadow: 0 6px 20px rgb(79 70 229 / 0.35);
  }
  .fab :global(svg) {
    width: 1.5rem;
    height: 1.5rem;
  }

  .placeholder {
    height: 100%;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.25rem;
  }
  .placeholder :global(svg) {
    width: 2.5rem;
    height: 2.5rem;
    opacity: 0.4;
  }
  .placeholder p {
    margin: 0;
  }
  .small {
    font-size: 0.8rem;
  }
</style>
