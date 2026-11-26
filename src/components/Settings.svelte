<script lang="ts">
  import { app, vault, commit, changePassword, disconnectStorage, rememberedKeyFile, rememberKeyFile } from '../lib/store.svelte';
  import * as V from '../lib/vault';
  import { notify } from '../lib/clipboard.svelte';
  import Icon from './Icon.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const families = $derived.by(() => {
    app.version;
    return V.families(vault());
  });

  let editingId = $state<string | null>(null);
  let editName = $state('');
  let newName = $state('');
  let hasKeyFile = $state(!!rememberedKeyFile());

  let pwd1 = $state('');
  let pwd2 = $state('');
  let changing = $state(false);
  let showChange = $state(false);

  function startEdit(f: V.Group) {
    editingId = f.uuid.id;
    editName = f.name ?? '';
  }

  async function saveName(f: V.Group) {
    const name = editName.trim();
    if (name && name !== f.name) await commit(() => V.renameFamily(f, name));
    editingId = null;
  }

  async function remove(f: V.Group) {
    if (f.entries.length || f.groups.length) return notify('Videz d’abord cette famille');
    if (!confirm(`Supprimer la famille « ${f.name} » ?`)) return;
    await commit((db) => V.deleteFamily(db, f));
  }

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    if (await commit((db) => V.addFamily(db, newName))) newName = '';
  }

  async function submitPassword(e: SubmitEvent) {
    e.preventDefault();
    if (pwd1.length < 12 || pwd1 !== pwd2) return;
    changing = true;
    const ok = await changePassword(pwd1, rememberedKeyFile());
    changing = false;
    if (ok) {
      pwd1 = pwd2 = '';
      showChange = false;
      notify('Mot de passe maître changé');
    }
  }

  function forgetKeyFile() {
    rememberKeyFile(null);
    hasKeyFile = false;
    notify('Fichier clé oublié sur cet appareil');
  }

  async function disconnect() {
    if (!confirm('Déconnecter Dropbox sur cet appareil ? Le coffre reste intact dans votre Dropbox.')) return;
    onclose();
    await disconnectStorage();
  }

  const kdf = $derived.by(() => {
    app.version;
    const p = vault().header.kdfParameters;
    const m = p?.get('M') as { value?: number } | undefined;
    const i = p?.get('I') as { value?: number } | undefined;
    return { mem: m?.value ? Math.round(m.value / 1048576) : '?', it: i?.value ?? '?' };
  });
</script>

<div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="sheet card" role="dialog" aria-modal="true" aria-label="Réglages">
    <header class="bar">
      <h2>Réglages</h2>
      <button class="icon-btn" onclick={onclose} aria-label="Fermer"><Icon name="x" /></button>
    </header>

    {#if app.error}<p class="error">{app.error}</p>{/if}

    <section>
      <h3>Familles</h3>
      <ul class="fams">
        {#each families as f (f.uuid.id)}
          <li>
            {#if editingId === f.uuid.id}
              <input
                bind:value={editName}
                onkeydown={(e) => {
                  if (e.key === 'Enter') saveName(f);
                  if (e.key === 'Escape') editingId = null;
                }}
              />
              <button class="icon-btn" onclick={() => saveName(f)} aria-label="Valider"><Icon name="check" /></button>
            {:else}
              <span class="name">{f.name}</span>
              <span class="muted count">{f.entries.length}</span>
              <button class="icon-btn" onclick={() => startEdit(f)} aria-label="Renommer"><Icon name="edit" /></button>
              <button class="icon-btn" onclick={() => remove(f)} aria-label="Supprimer"><Icon name="trash" /></button>
            {/if}
          </li>
        {/each}
      </ul>
      <form class="row" onsubmit={add}>
        <input bind:value={newName} placeholder="Nouvelle famille" />
        <button class="btn" disabled={!newName.trim()}><Icon name="plus" /> Ajouter</button>
      </form>
    </section>

    <section>
      <h3>Sécurité</h3>
      {#if !showChange}
        <button class="btn block" onclick={() => (showChange = true)}><Icon name="key" /> Changer le mot de passe maître</button>
      {:else}
        <form class="grid" onsubmit={submitPassword}>
          <input type="password" bind:value={pwd1} placeholder="Nouveau mot de passe maître (12+ caractères)" autocomplete="new-password" />
          <input type="password" bind:value={pwd2} placeholder="Confirmer" autocomplete="new-password" />
          <p class="muted small">
            {#if hasKeyFile}Le fichier clé mémorisé sur cet appareil reste nécessaire.{:else}Aucun fichier clé ne sera utilisé.{/if}
          </p>
          <div class="row">
            <button type="button" class="btn ghost" onclick={() => (showChange = false)}>Annuler</button>
            <button class="btn primary" disabled={changing || pwd1.length < 12 || pwd1 !== pwd2}>{changing ? 'Chiffrement…' : 'Changer'}</button>
          </div>
        </form>
      {/if}
      {#if hasKeyFile}
        <button class="btn block ghost" onclick={forgetKeyFile}>Oublier le fichier clé sur cet appareil</button>
      {/if}
      <ul class="facts muted small">
        <li>Format KeePass KDBX 4 · AES-256 · Argon2id ({kdf.mem} Mio, {kdf.it} passes)</li>
        <li>Déchiffrement uniquement sur cet appareil ; rien n’est envoyé au serveur wazzzpass.</li>
        <li>Verrouillage automatique après 5 min d’inactivité ou 1 min hors de l’app.</li>
        <li>Fichier compatible KeePassXC (Mac) et Strongbox / KeePassium (iPhone) en secours.</li>
      </ul>
    </section>

    <section>
      <h3>Dropbox</h3>
      <p class="muted small">
        Fichier : <code>Apps/wazzzpass/wazzzpass.kdbx</code>
        {#if app.lastSync}· dernière synchro {app.lastSync.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}{/if}
      </p>
      <button class="btn block danger" onclick={disconnect}>Déconnecter Dropbox sur cet appareil</button>
    </section>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.4);
    display: grid;
    place-items: end center;
    z-index: 40;
  }
  @media (min-width: 640px) {
    .overlay {
      place-items: center;
    }
  }
  .sheet {
    width: 100%;
    max-width: 520px;
    max-height: 92dvh;
    overflow-y: auto;
    padding: 1rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom));
    border-radius: 18px 18px 0 0;
    display: grid;
    gap: 1.25rem;
  }
  @media (min-width: 640px) {
    .sheet {
      border-radius: 18px;
    }
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h3 {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin-bottom: 0.6rem;
  }
  section {
    display: grid;
    gap: 0.6rem;
  }
  .fams {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .fams li {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.4rem 0.3rem 0.8rem;
    border-bottom: 1px solid var(--border);
  }
  .fams li:last-child {
    border-bottom: none;
  }
  .fams input {
    flex: 1;
    padding: 0.4rem 0.6rem;
  }
  .name {
    flex: 1;
  }
  .count {
    font-size: 0.85rem;
    margin-right: 0.3rem;
  }
  .row input {
    flex: 1;
  }
  .grid {
    display: grid;
    gap: 0.5rem;
  }
  .grid .row {
    justify-content: flex-end;
  }
  .small {
    font-size: 0.82rem;
    margin: 0;
  }
  .facts {
    margin: 0.3rem 0 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.25rem;
  }
  code {
    font-family: var(--mono);
    font-size: 0.9em;
  }
</style>
