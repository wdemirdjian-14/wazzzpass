// État de l'application. Le coffre déchiffré n'existe qu'en mémoire, le temps de la session.
import * as V from './vault';
import { storage, ConflictError, NotConnectedError } from './storage';

export type Screen = 'loading' | 'config' | 'connect' | 'unlock' | 'create' | 'main';

export const app = $state({
  screen: 'loading' as Screen,
  error: '',
  notice: '',
  busy: false,
  saving: false,
  /** incrémenté à chaque modification du coffre pour rafraîchir l'affichage */
  version: 0,
  lastSync: null as Date | null,
});

let db: V.Vault | null = null;
let rev: string | null = null;

export function vault(): V.Vault {
  if (!db) throw new Error('Coffre verrouillé');
  return db;
}

export const isUnlocked = () => db !== null;

// --- Fichier clé (facultatif) mémorisé sur cet appareil -----------------------------------------
const KEYFILE_KEY = 'wz.keyfile';
export function rememberedKeyFile(): Uint8Array | null {
  const s = localStorage.getItem(KEYFILE_KEY);
  return s ? Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) : null;
}
export function rememberKeyFile(k: Uint8Array | null) {
  if (k) localStorage.setItem(KEYFILE_KEY, btoa(String.fromCharCode(...k)));
  else localStorage.removeItem(KEYFILE_KEY);
}

function fail(e: unknown) {
  if (e instanceof NotConnectedError) {
    db = null;
    app.screen = 'connect';
  }
  app.error = e instanceof Error ? e.message : String(e);
}

// --- Démarrage ----------------------------------------------------------------------------------
export async function start() {
  app.error = '';
  if (!storage.isConfigured()) return void (app.screen = 'config');
  if (!storage.isConnected()) return void (app.screen = 'connect');
  app.screen = 'loading';
  try {
    const file = await storage.download();
    app.screen = file ? 'unlock' : 'create';
  } catch (e) {
    app.screen = 'unlock';
    fail(e);
  }
}

export async function unlock(password: string, keyFile: Uint8Array | null) {
  app.busy = true;
  app.error = '';
  try {
    const file = await storage.download(); // toujours la dernière version
    if (!file) return void (app.screen = 'create');
    db = await V.openVault(file.data, password, keyFile);
    rev = file.rev;
    app.lastSync = file.modified;
    app.version++;
    app.screen = 'main';
  } catch (e) {
    fail(e);
  } finally {
    app.busy = false;
  }
}

export async function create(password: string, keyFile: Uint8Array | null) {
  app.busy = true;
  app.error = '';
  try {
    if (await storage.download()) throw new Error('Un coffre existe déjà dans Dropbox : déverrouillez-le.');
    const fresh = await V.createVault(password, keyFile);
    const saved = await storage.upload(await V.serializeVault(fresh), null);
    db = fresh;
    rev = saved.rev;
    app.lastSync = saved.modified;
    app.version++;
    app.screen = 'main';
  } catch (e) {
    fail(e);
  } finally {
    app.busy = false;
  }
}

export function lock() {
  db = null;
  app.version++;
  app.error = '';
  app.notice = '';
  if (app.screen === 'main') app.screen = 'unlock';
}

/** Applique une modification puis chiffre et envoie le coffre sur Dropbox. */
export async function commit(mutate: (db: V.Vault) => void): Promise<boolean> {
  const current = vault();
  app.error = '';
  try {
    mutate(current);
  } catch (e) {
    fail(e);
    return false;
  }
  app.version++;
  app.saving = true;
  try {
    const saved = await storage.upload(await V.serializeVault(current), rev);
    rev = saved.rev;
    app.lastSync = saved.modified;
    return true;
  } catch (e) {
    if (e instanceof ConflictError) {
      await reloadFromRemote(current);
      app.error =
        'Le coffre avait été modifié sur un autre appareil : la dernière version vient d’être rechargée. Refaites votre modification.';
    } else {
      fail(e);
      app.error += ' La modification n’a pas été enregistrée : verrouillez puis rouvrez le coffre.';
    }
    return false;
  } finally {
    app.saving = false;
  }
}

async function reloadFromRemote(current: V.Vault) {
  const file = await storage.download();
  if (!file || db !== current) return;
  db = await V.reopenVault(file.data, current);
  rev = file.rev;
  app.lastSync = file.modified;
  app.version++;
}

/** Au retour sur l'app : recharge silencieusement si le fichier a changé ailleurs. */
export async function refreshIfChanged() {
  if (!db || app.saving) return;
  try {
    const file = await storage.download();
    if (file && file.rev !== rev && db) await reloadFromRemote(db);
  } catch {
    /* hors ligne : on garde la version en mémoire */
  }
}

export async function changePassword(password: string, keyFile: Uint8Array | null) {
  const current = vault();
  const previous = current.credentials;
  await V.changeMasterPassword(current, password, keyFile);
  const ok = await commit(() => {});
  if (!ok && db === current) current.credentials = previous;
  return ok;
}

export async function disconnectStorage() {
  lock();
  await storage.disconnect();
  app.screen = 'connect';
}
