// Choix du stockage du fichier chiffré : Dropbox en production.
// En développement uniquement (`npm run dev` avec ?demo), un faux stockage local permet de tester
// l'interface sans compte Dropbox ; ce code est retiré du build de production.
import * as dropbox from './dropbox';
import type { RemoteFile } from './dropbox';

export { ConflictError, NotConnectedError } from './dropbox';
export type { RemoteFile };

interface Backend {
  isConfigured(): boolean;
  isConnected(): boolean;
  download(): Promise<RemoteFile | null>;
  upload(data: ArrayBuffer, rev: string | null): Promise<RemoteFile>;
  disconnect(): Promise<void>;
}

function demoBackend(): Backend {
  const KEY = 'wz.demo.file';
  const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
  const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
  return {
    isConfigured: () => true,
    isConnected: () => true,
    async download() {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const { data, rev, modified } = JSON.parse(raw);
      return { data: fromB64(data), rev, modified: new Date(modified) };
    },
    async upload(data, rev) {
      const raw = localStorage.getItem(KEY);
      if (raw && JSON.parse(raw).rev !== rev) throw new dropbox.ConflictError();
      const file = { data: toB64(data), rev: crypto.randomUUID(), modified: new Date().toISOString() };
      localStorage.setItem(KEY, JSON.stringify(file));
      return { data, rev: file.rev, modified: new Date(file.modified) };
    },
    async disconnect() {
      localStorage.removeItem(KEY);
    },
  };
}

export const demo = (import.meta.env.DEV || import.meta.env.MODE === 'demo') && new URLSearchParams(location.search).has('demo');
export const storage: Backend = demo ? demoBackend() : dropbox;
