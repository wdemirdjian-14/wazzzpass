<script lang="ts">
  import { untrack } from 'svelte';
  import { app, commit } from '../lib/store.svelte';
  import * as V from '../lib/vault';
  import Icon from './Icon.svelte';

  let {
    entry,
    families,
    defaultFamily,
    onsave,
    oncancel,
  }: {
    entry: V.Entry | null;
    families: V.Group[];
    defaultFamily: V.Group | undefined;
    onsave: (input: V.EntryInput, family: V.Group) => Promise<void>;
    oncancel: () => void;
  } = $props();

  // Valeurs initiales du formulaire (copie : l'entrée n'est modifiée qu'à l'enregistrement)
  const initial = untrack(() => ({
    title: entry ? V.text(entry, 'Title') : '',
    username: entry ? V.text(entry, 'UserName') : '',
    password: entry ? V.text(entry, 'Password') : V.generatePassword(),
    url: entry ? V.text(entry, 'URL') : '',
    notes: entry ? V.text(entry, 'Notes') : '',
  }));
  let form = $state({ ...initial });
  let familyId = $state(untrack(() => defaultFamily?.uuid.id ?? families[0]?.uuid.id ?? ''));
  let showPwd = $state(untrack(() => !entry));
  let length = $state(20);
  let symbols = $state(true);
  let newFamily = $state('');
  let addingFamily = $state(false);
  let saving = $state(false);
  let titleInput: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (!entry) titleInput?.focus();
  });

  const pwdChanged = $derived(!!entry && form.password !== initial.password);

  function regenerate() {
    form.password = V.generatePassword(length, symbols);
    showPwd = true;
  }

  async function createFamily() {
    const name = newFamily.trim();
    if (!name) return;
    let created: V.Group | null = null;
    if (await commit((db) => (created = V.addFamily(db, name)))) {
      familyId = (created as unknown as V.Group).uuid.id;
      newFamily = '';
      addingFamily = false;
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const fam = families.find((f) => f.uuid.id === familyId);
    if (!fam || !form.title.trim()) return;
    saving = true;
    await onsave({ ...form }, fam);
    saving = false;
  }
</script>

<form class="form" onsubmit={submit} autocomplete="off">
  <header class="bar">
    <button type="button" class="btn ghost small" onclick={oncancel}>Annuler</button>
    <h2>{entry ? 'Modifier' : 'Nouveau mot de passe'}</h2>
    <button class="btn primary small" disabled={saving || app.saving || !form.title.trim() || !familyId}>
      {saving ? 'Chiffrement…' : 'Enregistrer'}
    </button>
  </header>

  {#if app.error}<p class="error">{app.error}</p>{/if}

  <div class="card body">
    <div class="field">
      <label for="title">Nom</label>
      <input id="title" bind:this={titleInput} bind:value={form.title} placeholder="ex. Gmail, Banque, Netflix…" required />
    </div>

    <div class="field">
      <label for="family">Famille</label>
      {#if !addingFamily}
        <div class="row">
          <select id="family" bind:value={familyId}>
            {#each families as f (f.uuid.id)}<option value={f.uuid.id}>{f.name}</option>{/each}
          </select>
          <button type="button" class="btn small" onclick={() => (addingFamily = true)}><Icon name="plus" /> Nouvelle</button>
        </div>
      {:else}
        <div class="row">
          <input bind:value={newFamily} placeholder="Nom de la famille" onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), createFamily())} />
          <button type="button" class="btn small primary" onclick={createFamily} disabled={!newFamily.trim()}>Créer</button>
          <button type="button" class="icon-btn" onclick={() => (addingFamily = false)} aria-label="Annuler"><Icon name="x" /></button>
        </div>
      {/if}
    </div>

    <div class="field">
      <label for="user">Identifiant</label>
      <input id="user" bind:value={form.username} autocapitalize="off" spellcheck="false" placeholder="e-mail ou nom d’utilisateur" />
    </div>

    <div class="field">
      <label for="pass">Mot de passe</label>
      <div class="row">
        <input id="pass" class="mono" bind:value={form.password} type={showPwd ? 'text' : 'password'} autocapitalize="off" spellcheck="false" autocomplete="off" />
        <button type="button" class="icon-btn" onclick={() => (showPwd = !showPwd)} aria-label={showPwd ? 'Masquer' : 'Afficher'}>
          <Icon name={showPwd ? 'eyeoff' : 'eye'} />
        </button>
        <button type="button" class="icon-btn" onclick={regenerate} aria-label="Générer" title="Générer"><Icon name="dice" /></button>
      </div>
      <div class="gen">
        <label class="inline">Longueur <input type="range" min="12" max="40" bind:value={length} oninput={regenerate} /> <b>{length}</b></label>
        <label class="inline check"><input type="checkbox" bind:checked={symbols} onchange={regenerate} /> Symboles</label>
      </div>
      {#if pwdChanged}<p class="hint">L’ancien mot de passe sera conservé dans l’historique.</p>{/if}
    </div>

    <div class="field">
      <label for="url">URL</label>
      <input id="url" bind:value={form.url} type="text" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://…" />
    </div>

    <div class="field last">
      <label for="notes">Notes</label>
      <textarea id="notes" bind:value={form.notes} rows="3"></textarea>
    </div>
  </div>
</form>

<style>
  .form {
    max-width: 640px;
    margin: 0 auto;
    padding: 0.75rem 1rem 2rem;
    display: grid;
    gap: 1rem;
  }
  @media (min-width: 900px) {
    .form {
      padding-top: 1.25rem;
    }
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .bar h2 {
    flex: 1;
    text-align: center;
    font-size: 1.05rem;
  }
  .body {
    padding: 1rem;
  }
  .last {
    margin-bottom: 0;
  }
  .row select,
  .row input {
    flex: 1;
    min-width: 0;
  }
  .gen {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }
  .inline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-weight: 500;
  }
  .inline input[type='range'] {
    width: 8rem;
    padding: 0;
    border: none;
    box-shadow: none;
  }
  .inline b {
    min-width: 1.5rem;
    color: var(--text);
  }
  .check input {
    width: auto;
  }
  .hint {
    margin: 0.4rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
</style>
