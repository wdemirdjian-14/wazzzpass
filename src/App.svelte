<script lang="ts">
  import { onMount } from 'svelte';
  import { app, start, lock, isUnlocked, refreshIfChanged } from './lib/store.svelte';
  import { handleRedirect } from './lib/dropbox';
  import { demo } from './lib/storage';
  import { toast, clearClipboardNow } from './lib/clipboard.svelte';
  import Welcome from './components/Welcome.svelte';
  import Unlock from './components/Unlock.svelte';
  import Main from './components/Main.svelte';

  // Verrouillage automatique : 5 min sans activité, ou plus d'1 min passée sur une autre app.
  const IDLE_LIMIT = 5 * 60_000;
  const HIDDEN_LIMIT = 60_000;
  let lastActivity = Date.now();
  let hiddenAt = 0;

  function lockNow() {
    clearClipboardNow();
    lock();
  }

  onMount(() => {
    (async () => {
      if (!demo) {
        try {
          await handleRedirect();
        } catch (e) {
          app.error = (e as Error).message;
        }
      }
      await start();
    })();

    const touch = () => (lastActivity = Date.now());
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((ev) => addEventListener(ev, touch, { passive: true }));

    const idle = setInterval(() => {
      if (isUnlocked() && Date.now() - lastActivity > IDLE_LIMIT) lockNow();
    }, 10_000);

    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (isUnlocked()) {
        if (hiddenAt && Date.now() - hiddenAt > HIDDEN_LIMIT) lockNow();
        else refreshIfChanged();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const onPageHide = () => lockNow();
    addEventListener('pagehide', onPageHide);

    return () => {
      events.forEach((ev) => removeEventListener(ev, touch));
      clearInterval(idle);
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('pagehide', onPageHide);
    };
  });
</script>

{#if app.screen === 'main'}
  <Main onlock={lockNow} />
{:else if app.screen === 'unlock' || app.screen === 'create'}
  <Unlock />
{:else}
  <Welcome />
{/if}

{#if toast.text}
  {#key toast.id}
    <div class="toast" role="status">{toast.text}</div>
  {/key}
{/if}

{#if demo}
  <div class="demo">Mode démo local (développement) — aucune donnée envoyée à Dropbox</div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(1.25rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    background: var(--text);
    color: var(--bg);
    padding: 0.6rem 1rem;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 600;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.2);
    animation: pop 0.18s ease-out;
    z-index: 50;
    white-space: nowrap;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
  }
  .demo {
    position: fixed;
    bottom: env(safe-area-inset-bottom);
    left: 0;
    background: #f59e0b;
    color: #111;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.15rem 0.5rem;
    border-top-right-radius: 6px;
    z-index: 60;
  }
</style>
