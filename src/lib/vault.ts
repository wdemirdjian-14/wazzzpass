// Couche coffre : lecture / écriture du fichier KeePass (KDBX 4) entièrement dans le navigateur.
// Le mot de passe maître et la clé dérivée ne quittent jamais l'appareil.
import * as K from 'kdbxweb';
// kdbxweb est publié en CommonJS : selon l'outil, le module arrive tel quel ou sous « default ».
const kdbxweb: typeof K = (K as unknown as { default?: typeof K }).default ?? K;
import { argon2d, argon2id } from 'hash-wasm';

// --- Argon2 (dérivation de la clé à partir du mot de passe maître) -----------------------------
kdbxweb.CryptoEngine.setArgon2Impl(
  async (password, salt, memory, iterations, length, parallelism, type, version) => {
    const opts = {
      password: new Uint8Array(password),
      salt: new Uint8Array(salt),
      memorySize: memory, // en Kio
      iterations,
      hashLength: length,
      parallelism,
      outputType: 'binary' as const,
    };
    if (version !== 0x13) throw new Error('Version Argon2 non prise en charge');
    const out = type === kdbxweb.CryptoEngine.Argon2TypeArgon2id ? await argon2id(opts) : await argon2d(opts);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  },
);

// Réglages appliqués à la création et à chaque enregistrement :
// Argon2id, 64 Mio de mémoire, 3 passes, 2 fils. Coûteux pour un attaquant, ~1 s sur iPhone.
const KDF_MEMORY = 64 * 1024 * 1024;
const KDF_ITERATIONS = 3;
const KDF_PARALLELISM = 2;
const HISTORY_MAX = 30;

export const DEFAULT_FAMILIES = ['Perso', 'Pro', 'Banque & finances', 'E-mails', 'Achats en ligne', 'Réseaux sociaux'];

export type Vault = K.Kdbx;
export type Entry = K.KdbxEntry;
export type Group = K.KdbxGroup;

export interface EntryInput {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
}

async function makeCredentials(password: string, keyFile?: Uint8Array | null) {
  const creds = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password), keyFile ?? null);
  await creds.ready;
  return creds;
}

function hardenKdf(db: Vault) {
  db.setVersion(4);
  const kdf = db.header.kdfParameters;
  const uuid = kdf?.get('$UUID');
  const isArgon2id =
    uuid instanceof ArrayBuffer && kdbxweb.ByteUtils.bytesToBase64(uuid) === kdbxweb.Consts.KdfId.Argon2id;
  if (!isArgon2id) db.header.setKdf(kdbxweb.Consts.KdfId.Argon2id);
  const p = db.header.kdfParameters!;
  const T = kdbxweb.VarDictionary.ValueType;
  p.set('M', T.UInt64, new kdbxweb.Int64(KDF_MEMORY));
  p.set('I', T.UInt64, new kdbxweb.Int64(KDF_ITERATIONS));
  p.set('P', T.UInt32, KDF_PARALLELISM);
  db.meta.historyMaxItems = HISTORY_MAX;
}

export async function createVault(password: string, keyFile?: Uint8Array | null): Promise<Vault> {
  const db = kdbxweb.Kdbx.create(await makeCredentials(password, keyFile), 'wazzzpass');
  hardenKdf(db);
  const root = db.getDefaultGroup();
  root.name = 'wazzzpass';
  for (const name of DEFAULT_FAMILIES) db.createGroup(root, name);
  return db;
}

export async function openVault(data: ArrayBuffer, password: string, keyFile?: Uint8Array | null): Promise<Vault> {
  try {
    return await kdbxweb.Kdbx.load(data, await makeCredentials(password, keyFile));
  } catch (e) {
    if (e instanceof kdbxweb.KdbxError && e.code === kdbxweb.Consts.ErrorCodes.InvalidKey) {
      throw new Error('Mot de passe ou fichier clé incorrect.');
    }
    throw e;
  }
}

/** Relit le fichier avec les identifiants déjà validés (rechargement après un conflit). */
export function reopenVault(data: ArrayBuffer, db: Vault): Promise<Vault> {
  return kdbxweb.Kdbx.load(data, db.credentials);
}

export async function serializeVault(db: Vault): Promise<ArrayBuffer> {
  hardenKdf(db); // nouveau sel et nouveaux IV à chaque enregistrement (fait par kdbxweb), réglages vérifiés
  db.cleanup({ historyRules: true, customIcons: false, binaries: true });
  return db.save();
}

export async function changeMasterPassword(db: Vault, password: string, keyFile?: Uint8Array | null) {
  db.credentials = await makeCredentials(password, keyFile);
  db.meta.keyChanged = new Date();
}

export function generateKeyFile(): Promise<Uint8Array> {
  return kdbxweb.Credentials.createRandomKeyFile(2);
}

// --- Familles (= groupes de premier niveau) -----------------------------------------------------
function recycleBin(db: Vault): Group | undefined {
  return db.meta.recycleBinUuid ? db.getGroup(db.meta.recycleBinUuid) : undefined;
}

export function families(db: Vault): Group[] {
  const bin = recycleBin(db);
  return db
    .getDefaultGroup()
    .groups.filter((g) => g !== bin)
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'fr'));
}

export function addFamily(db: Vault, name: string): Group {
  return db.createGroup(db.getDefaultGroup(), name.trim());
}

export function renameFamily(group: Group, name: string) {
  group.name = name.trim();
  group.times.update();
}

export function deleteFamily(db: Vault, group: Group) {
  if (group.entries.length || group.groups.length) throw new Error('Cette famille contient encore des mots de passe.');
  db.remove(group);
}

export function familyOf(db: Vault, entry: Entry): Group | undefined {
  let g = entry.parentGroup;
  const root = db.getDefaultGroup();
  while (g && g.parentGroup && g.parentGroup !== root) g = g.parentGroup;
  return g && g !== root ? g : undefined;
}

// --- Entrées ------------------------------------------------------------------------------------
export function allEntries(db: Vault): Entry[] {
  const bin = recycleBin(db);
  const out: Entry[] = [];
  for (const e of db.getDefaultGroup().allEntries()) {
    let g = e.parentGroup;
    let inBin = false;
    while (g) {
      if (g === bin) inBin = true;
      g = g.parentGroup;
    }
    if (!inBin) out.push(e);
  }
  return out.sort((a, b) => text(a, 'Title').localeCompare(text(b, 'Title'), 'fr'));
}

export function text(entry: Entry, field: string): string {
  const v = entry.fields.get(field);
  if (v === undefined) return '';
  return v instanceof kdbxweb.ProtectedValue ? v.getText() : v;
}

function setField(entry: Entry, field: string, value: string, protect = false) {
  entry.fields.set(field, protect ? kdbxweb.ProtectedValue.fromString(value) : value);
}

export function createEntry(db: Vault, family: Group, input: EntryInput): Entry {
  const entry = db.createEntry(family);
  writeFields(entry, input);
  return entry;
}

/** Modifie une entrée : l'état précédent part dans l'historique (anciens mots de passe consultables). */
export function updateEntry(db: Vault, entry: Entry, input: EntryInput, family: Group) {
  const changed =
    text(entry, 'Title') !== input.title ||
    text(entry, 'UserName') !== input.username ||
    text(entry, 'Password') !== input.password ||
    text(entry, 'URL') !== input.url ||
    text(entry, 'Notes') !== input.notes;
  if (changed) {
    entry.pushHistory();
    writeFields(entry, input);
  }
  if (entry.parentGroup !== family) db.move(entry, family);
}

function writeFields(entry: Entry, input: EntryInput) {
  setField(entry, 'Title', input.title.trim());
  setField(entry, 'UserName', input.username);
  setField(entry, 'Password', input.password, true);
  setField(entry, 'URL', input.url.trim());
  setField(entry, 'Notes', input.notes);
  entry.times.update();
}

export function deleteEntry(db: Vault, entry: Entry) {
  db.remove(entry); // part dans la corbeille du fichier (récupérable avec KeePassXC)
}

export interface PasswordVersion {
  password: string;
  username: string;
  until: Date | undefined; // remplacé à cette date
  since: Date | undefined;
}

/** Anciens mots de passe (distincts), du plus récent au plus ancien. */
export function passwordHistory(entry: Entry): PasswordVersion[] {
  const list: PasswordVersion[] = [];
  const versions = [...entry.history, entry];
  for (let i = versions.length - 2; i >= 0; i--) {
    const v = versions[i];
    const next = versions[i + 1];
    const pwd = text(v, 'Password');
    if (pwd === text(next, 'Password') && text(v, 'UserName') === text(next, 'UserName')) continue;
    list.push({
      password: pwd,
      username: text(v, 'UserName'),
      since: v.times.lastModTime,
      until: next.times.lastModTime,
    });
  }
  return list;
}

// --- Générateur de mots de passe ----------------------------------------------------------------
export function generatePassword(length = 20, symbols = true): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789'];
  if (symbols) sets.push('!@#$%&*-_=+?.:;');
  const all = sets.join('');
  const pick = (chars: string) => {
    // tirage sans biais
    const limit = 256 - (256 % chars.length);
    const buf = new Uint8Array(1);
    do crypto.getRandomValues(buf);
    while (buf[0] >= limit);
    return chars[buf[0] % chars.length];
  };
  for (;;) {
    const out = Array.from({ length }, () => pick(all)).join('');
    if (sets.every((s) => [...out].some((c) => s.includes(c)))) return out;
  }
}
