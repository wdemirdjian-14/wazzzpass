<script lang="ts">
  // Écrans avant déverrouillage : chargement, configuration manquante, connexion Dropbox.
  import { app, start } from '../lib/store.svelte';
  import { connect, manualConnectUrl, connectWithCode, redirectUri } from '../lib/dropbox';
  import Logo from './Logo.svelte';

  let manual = $state(false);
  let manualUrl = $state('');
  let code = $state('');
  let busy = $state(false);

  // Sur iPhone, une app ajoutée à l'écran d'accueil ne revient pas toujours d'une redirection :
  // on propose alors de recopier le code affiché par Dropbox.
  const standalone =
    matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

  async function openManual() {
    manual = true;
    manualUrl = await manualConnectUrl();
  }

  async function submitCode(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    app.error = '';
    try {
      await connectWithCode(code);
      code = '';
      await start();
    } catch (err) {
      app.error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<main class="wrap">
  <div class="card panel">
    <Logo />

    {#if app.screen === 'loading'}
      <p class="muted center">Chargement…</p>
    {:else if app.screen === 'config'}
      <h2>Configuration requise</h2>
      <p class="muted">
        La clé d’application Dropbox n’est pas définie. Créez une app sur dropbox.com/developers (accès « App folder »)
        puis renseignez <code>VITE_DROPBOX_APP_KEY</code> dans <code>.env.production</code>.
      </p>
      <p class="muted small">URL de redirection à déclarer : <code>{redirectUri()}</code></p>
    {:else}
      <p class="muted center">
        Vos mots de passe restent dans un fichier chiffré sur votre Dropbox. Connectez Dropbox pour y accéder.
      </p>
      {#if app.error}<p class="error">{app.error}</p>{/if}

      {#if !manual}
        <button class="btn primary block" onclick={connect}>Connecter Dropbox</button>
        <button class="btn ghost block small" onclick={openManual}>
          {standalone ? 'La connexion ne revient pas dans l’app ? Utiliser un code' : 'Se connecter avec un code'}
        </button>
      {:else}
        <ol class="steps">
          <li><a href={manualUrl} target="_blank" rel="noopener noreferrer">Ouvrir Dropbox</a> et autoriser wazzzpass.</li>
          <li>Copier le code affiché par Dropbox, revenir ici et le coller.</li>
        </ol>
        <form onsubmit={submitCode}>
          <div class="field">
            <label for="code">Code Dropbox</label>
            <input id="code" bind:value={code} autocomplete="off" autocapitalize="off" spellcheck="false" required />
          </div>
          <button class="btn primary block" disabled={busy || !code}>Valider</button>
        </form>
        <button class="btn ghost block small" onclick={() => (manual = false)}>Retour</button>
      {/if}

      <p class="muted small center">
        wazzzpass n’accède qu’à son propre dossier <code>Apps/wazzzpass</code>, jamais au reste de votre Dropbox.
      </p>
    {/if}
  </div>
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
    padding: 2rem 1.5rem;
    display: grid;
    gap: 1rem;
  }
  .center {
    text-align: center;
  }
  .small {
    font-size: 0.82rem;
  }
  .steps {
    margin: 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.4rem;
  }
  code {
    font-family: var(--mono);
    font-size: 0.85em;
    background: var(--surface-2);
    padding: 0.05rem 0.3rem;
    border-radius: 4px;
    word-break: break-all;
  }
  p {
    margin: 0;
  }
</style>
