<script lang="ts">
  import { app, unlock, create, rememberedKeyFile, rememberKeyFile, disconnectStorage } from '../lib/store.svelte';
  import { generateKeyFile } from '../lib/vault';
  import Logo from './Logo.svelte';
  import Icon from './Icon.svelte';

  const creating = $derived(app.screen === 'create');

  let password = $state('');
  let confirm = $state('');
  let show = $state(false);
  let keyFile = $state<Uint8Array | null>(rememberedKeyFile());
  let keyFileName = $state(rememberedKeyFile() ? 'mémorisé sur cet appareil' : '');
  let remember = $state(!!rememberedKeyFile());
  let input: HTMLInputElement | undefined = $state();

  $effect(() => {
    input?.focus();
  });

  // Estimation simple de la robustesse (en bits) pour guider la création
  const strength = $derived.by(() => {
    let pool = 0;
    if (/[a-z]/.test(password)) pool += 26;
    if (/[A-Z]/.test(password)) pool += 26;
    if (/[0-9]/.test(password)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(password)) pool += 30;
    const bits = Math.round(password.length * Math.log2(pool || 1));
    if (bits >= 90) return { bits, label: 'Excellent', level: 4 };
    if (bits >= 70) return { bits, label: 'Bon', level: 3 };
    if (bits >= 50) return { bits, label: 'Moyen', level: 2 };
    return { bits, label: 'Faible', level: 1 };
  });

  const canCreate = $derived(password.length >= 12 && password === confirm && strength.level >= 2);

  async function pickKeyFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    keyFile = new Uint8Array(await file.arrayBuffer());
    keyFileName = file.name;
  }

  function clearKeyFile() {
    keyFile = null;
    keyFileName = '';
    remember = false;
    rememberKeyFile(null);
  }

  async function newKeyFile() {
    keyFile = await generateKeyFile();
    keyFileName = 'wazzzpass.keyx (nouveau)';
    const url = URL.createObjectURL(new Blob([keyFile as BlobPart], { type: 'application/octet-stream' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'wazzzpass.keyx' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    remember = true;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (creating && !canCreate) return;
    rememberKeyFile(remember ? keyFile : null);
    const pwd = password;
    if (creating) await create(pwd, keyFile);
    else await unlock(pwd, keyFile);
    if (app.screen === 'main') {
      password = '';
      confirm = '';
    }
  }
</script>

<main class="wrap">
  <form class="card panel" onsubmit={submit} autocomplete="off">
    <Logo />

    {#if creating}
      <div class="intro">
        <h2>Créer votre coffre</h2>
        <p class="muted">
          Choisissez un mot de passe maître long et unique (une phrase de 4-5 mots fonctionne très bien). Il ne peut pas
          être récupéré : notez-le en lieu sûr.
        </p>
      </div>
    {/if}

    {#if app.error}<p class="error">{app.error}</p>{/if}

    <div class="field">
      <label for="pwd">Mot de passe maître</label>
      <div class="pwd">
        <input
          id="pwd"
          bind:this={input}
          bind:value={password}
          type={show ? 'text' : 'password'}
          autocomplete={creating ? 'new-password' : 'current-password'}
          autocapitalize="off"
          spellcheck="false"
          required
        />
        <button type="button" class="icon-btn" onclick={() => (show = !show)} aria-label={show ? 'Masquer' : 'Afficher'}>
          <Icon name={show ? 'eyeoff' : 'eye'} />
        </button>
      </div>
      {#if creating && password}
        <div class="meter" data-level={strength.level}><span></span><span></span><span></span><span></span></div>
        <p class="hint">{strength.label} · ~{strength.bits} bits{password.length < 12 ? ' · 12 caractères minimum' : ''}</p>
      {/if}
    </div>

    {#if creating}
      <div class="field">
        <label for="confirm">Confirmer</label>
        <input id="confirm" bind:value={confirm} type={show ? 'text' : 'password'} autocomplete="new-password" required />
        {#if confirm && confirm !== password}<p class="hint bad">Les deux mots de passe sont différents.</p>{/if}
      </div>
    {/if}

    <details class="keyfile" open={!!keyFile}>
      <summary><Icon name="key" /> Fichier clé {keyFile ? '· ' + keyFileName : '(facultatif, recommandé)'}</summary>
      <p class="muted small">
        Second facteur : sans ce fichier, le coffre reste illisible même avec le mot de passe. Ne le mettez pas dans
        Dropbox ; gardez-en une copie de secours (clé USB, coffre papier…).
      </p>
      <div class="row wrap-row">
        {#if creating}
          <button type="button" class="btn small" onclick={newKeyFile}>Générer et télécharger</button>
        {/if}
        <label class="btn small file">
          Choisir un fichier
          <input type="file" class="sr-only" onchange={pickKeyFile} />
        </label>
        {#if keyFile}<button type="button" class="btn small ghost" onclick={clearKeyFile}>Retirer</button>{/if}
      </div>
      {#if keyFile}
        <label class="check"><input type="checkbox" bind:checked={remember} /> Mémoriser le fichier clé sur cet appareil</label>
      {/if}
    </details>

    <button class="btn primary block" disabled={app.busy || (creating && !canCreate)}>
      {#if app.busy}{creating ? 'Chiffrement…' : 'Déchiffrement…'}{:else}{creating ? 'Créer le coffre' : 'Déverrouiller'}{/if}
    </button>

    <button type="button" class="btn ghost small block" onclick={disconnectStorage}>Déconnecter Dropbox</button>
  </form>
</main>

<style>
  .wrap {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 1.25rem;
  }
  .panel {
    width: 100%;
    max-width: 400px;
    padding: 2rem 1.5rem 1.25rem;
    display: grid;
    gap: 1rem;
  }
  .intro {
    display: grid;
    gap: 0.4rem;
    text-align: center;
  }
  .intro p {
    margin: 0;
    font-size: 0.9rem;
  }
  .field {
    margin: 0;
  }
  .pwd {
    position: relative;
  }
  .pwd input {
    padding-right: 2.8rem;
  }
  .pwd .icon-btn {
    position: absolute;
    right: 0.2rem;
    top: 50%;
    transform: translateY(-50%);
  }
  .meter {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    margin-top: 0.5rem;
  }
  .meter span {
    height: 4px;
    border-radius: 2px;
    background: var(--border);
  }
  .meter[data-level='1'] span:nth-child(-n + 1) {
    background: var(--danger);
  }
  .meter[data-level='2'] span:nth-child(-n + 2) {
    background: #f59e0b;
  }
  .meter[data-level='3'] span:nth-child(-n + 3) {
    background: var(--ok);
  }
  .meter[data-level='4'] span {
    background: var(--ok);
  }
  .hint {
    margin: 0.35rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .hint.bad {
    color: var(--danger);
  }
  .keyfile {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.6rem 0.8rem;
  }
  .keyfile summary {
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    list-style: none;
  }
  .keyfile summary :global(svg) {
    width: 1rem;
    height: 1rem;
    color: var(--muted);
  }
  .keyfile p {
    margin: 0.6rem 0;
  }
  .small {
    font-size: 0.82rem;
  }
  .wrap-row {
    flex-wrap: wrap;
  }
  .file {
    margin: 0;
    color: var(--text);
    font-size: 0.85rem;
  }
  .check {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin: 0.7rem 0 0;
    font-weight: 500;
    color: var(--text);
  }
  .check input {
    width: auto;
  }
</style>
