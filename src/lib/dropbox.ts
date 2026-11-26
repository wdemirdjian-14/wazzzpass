// Accès Dropbox directement depuis le navigateur (OAuth 2 PKCE, aucun secret, aucun serveur).
// L'app Dropbox est en mode « App folder » : elle ne voit que Apps/wazzzpass/, jamais le reste.
// Le fichier transféré est toujours chiffré : Dropbox ne voit qu'un bloc illisible.

const APP_KEY = (import.meta.env.VITE_DROPBOX_APP_KEY as string | undefined)?.trim() ?? '';
const FILE_PATH = '/wazzzpass.kdbx';
const TOKEN_KEY = 'wz.dropbox.refresh';
const VERIFIER_KEY = 'wz.dropbox.verifier';
const STATE_KEY = 'wz.dropbox.state';

let accessToken: string | null = null;
let accessExpires = 0;

export const isConfigured = () => APP_KEY.length > 0;
export const isConnected = () => !!localStorage.getItem(TOKEN_KEY);
export const redirectUri = () => location.origin + '/';

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(len = 64): string {
  return b64url(crypto.getRandomValues(new Uint8Array(len))).slice(0, len);
}

async function challengeFor(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(hash));
}

async function authorizeUrl(withRedirect: boolean): Promise<string> {
  const verifier = randomString(64);
  const state = randomString(24);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  // conservé aussi en localStorage pour le code saisi à la main (iPhone, app sur l'écran d'accueil)
  localStorage.setItem(VERIFIER_KEY, verifier);
  const p = new URLSearchParams({
    client_id: APP_KEY,
    response_type: 'code',
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
    token_access_type: 'offline',
  });
  if (withRedirect) {
    p.set('redirect_uri', redirectUri());
    p.set('state', state);
  }
  return 'https://www.dropbox.com/oauth2/authorize?' + p.toString();
}

/** Connexion classique : Dropbox renvoie vers l'app avec ?code=… */
export async function connect(): Promise<void> {
  location.assign(await authorizeUrl(true));
}

/** Variante sans redirection : Dropbox affiche un code à recopier dans l'app. */
export async function manualConnectUrl(): Promise<string> {
  return authorizeUrl(false);
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: APP_KEY, ...body }),
  });
  if (!res.ok) throw new Error('Dropbox a refusé la connexion (' + res.status + ').');
  return (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
}

function keepTokens(t: { access_token: string; expires_in: number; refresh_token?: string }) {
  accessToken = t.access_token;
  accessExpires = Date.now() + (t.expires_in - 60) * 1000;
  if (t.refresh_token) localStorage.setItem(TOKEN_KEY, t.refresh_token);
}

/** À appeler au démarrage : termine la connexion si l'URL contient ?code=… */
export async function handleRedirect(): Promise<boolean> {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (!code && !error) return false;
  history.replaceState(null, '', url.pathname); // retire le code de l'URL et de l'historique
  if (error) throw new Error('Connexion Dropbox annulée.');
  const verifier = sessionStorage.getItem(VERIFIER_KEY) ?? localStorage.getItem(VERIFIER_KEY);
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  localStorage.removeItem(VERIFIER_KEY);
  if (!verifier || (expected && state !== expected)) throw new Error('Réponse Dropbox invalide, recommencez.');
  keepTokens(await tokenRequest({ grant_type: 'authorization_code', code: code!, code_verifier: verifier, redirect_uri: redirectUri() }));
  return true;
}

export async function connectWithCode(code: string): Promise<void> {
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error('Demandez d’abord un nouveau code.');
  keepTokens(await tokenRequest({ grant_type: 'authorization_code', code: code.trim(), code_verifier: verifier }));
  localStorage.removeItem(VERIFIER_KEY);
}

export async function disconnect(): Promise<void> {
  try {
    if (accessToken || isConnected()) {
      await fetch('https://api.dropboxapi.com/2/auth/token/revoke', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + (await token()) },
      });
    }
  } catch {
    /* hors ligne : on oublie quand même le jeton */
  }
  localStorage.removeItem(TOKEN_KEY);
  accessToken = null;
}

async function token(): Promise<string> {
  if (accessToken && Date.now() < accessExpires) return accessToken;
  const refresh = localStorage.getItem(TOKEN_KEY);
  if (!refresh) throw new NotConnectedError();
  try {
    keepTokens(await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh }));
  } catch (e) {
    if (e instanceof TypeError) throw new Error('Pas de connexion internet.');
    localStorage.removeItem(TOKEN_KEY);
    throw new NotConnectedError();
  }
  return accessToken!;
}

export class NotConnectedError extends Error {
  constructor() {
    super('Dropbox n’est plus connecté.');
  }
}
export class ConflictError extends Error {
  constructor() {
    super('Le coffre a été modifié sur un autre appareil entre-temps.');
  }
}

// Les en-têtes HTTP doivent rester en ASCII : on échappe le reste (règle de l'API Dropbox).
const apiArg = (o: unknown) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

export interface RemoteFile {
  data: ArrayBuffer;
  rev: string;
  modified: Date;
}

/** Télécharge le coffre. Renvoie null s'il n'existe pas encore. */
export async function download(): Promise<RemoteFile | null> {
  const res = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (await token()), 'Dropbox-API-Arg': apiArg({ path: FILE_PATH }) },
  });
  if (res.status === 409) {
    const err = await res.json().catch(() => ({}));
    if (JSON.stringify(err).includes('not_found')) return null;
    throw new Error('Lecture du coffre impossible.');
  }
  if (res.status === 401) throw new NotConnectedError();
  if (!res.ok) throw new Error('Lecture du coffre impossible (' + res.status + ').');
  const data = await res.arrayBuffer();
  let meta = parseMeta(res.headers.get('Dropbox-API-Result'));
  if (!meta) meta = await metadata();
  return { data, rev: meta.rev, modified: new Date(meta.server_modified) };
}

function parseMeta(h: string | null): { rev: string; server_modified: string } | null {
  if (!h) return null;
  try {
    return JSON.parse(h);
  } catch {
    return null;
  }
}

async function metadata(): Promise<{ rev: string; server_modified: string }> {
  const res = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: FILE_PATH }),
  });
  if (!res.ok) throw new Error('Lecture des informations du coffre impossible.');
  return res.json();
}

/**
 * Enregistre le coffre. Avec `rev`, Dropbox refuse l'écriture si le fichier a changé depuis
 * (modification depuis un autre appareil) : rien n'est jamais écrasé par erreur.
 */
export async function upload(data: ArrayBuffer, rev: string | null): Promise<RemoteFile> {
  const mode = rev ? { '.tag': 'update', update: rev } : { '.tag': 'add' };
  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + (await token()),
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': apiArg({ path: FILE_PATH, mode, autorename: false, mute: true, strict_conflict: true }),
    },
    body: data,
  });
  if (res.status === 409) throw new ConflictError();
  if (res.status === 401) throw new NotConnectedError();
  if (!res.ok) throw new Error('Enregistrement impossible (' + res.status + ').');
  const meta = await res.json();
  return { data, rev: meta.rev, modified: new Date(meta.server_modified) };
}
