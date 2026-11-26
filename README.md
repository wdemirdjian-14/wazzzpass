# wazzzpass

Gestionnaire de mots de passe personnel, sur Mac et iPhone, sans base de données ni serveur applicatif.

- **Un seul fichier chiffré** `wazzzpass.kdbx` (format KeePass 4) dans votre Dropbox (`Apps/wazzzpass/`).
- **Chiffrement dans le navigateur** : AES-256, clé dérivée du mot de passe maître par Argon2id (64 Mio, 3 passes).
  Le VPS ne sert que des fichiers statiques ; Dropbox ne voit qu'un bloc illisible.
- **Familles** (catégories), recherche instantanée, identifiant / mot de passe / URL / notes,
  date de dernière modification, **historique des anciens mots de passe**, générateur.
- **Second facteur facultatif** : un fichier clé gardé sur vos appareils (jamais dans Dropbox).
- Verrouillage automatique (5 min d'inactivité, 1 min hors de l'app), presse-papiers vidé après 30 s.
- **Plan de secours** : le fichier s'ouvre aussi avec KeePassXC (Mac) ou Strongbox / KeePassium (iPhone).

## Architecture

```
iPhone / Mac (Safari, app sur l'écran d'accueil)
  └─ wazzzpass (Svelte + kdbxweb + Argon2 WebAssembly)
       ├─ code chargé depuis https://wazzzpass.walautao.fr  (Nginx, fichiers statiques, CSP stricte)
       └─ fichier chiffré lu/écrit directement via l'API Dropbox (OAuth PKCE, dossier d'app uniquement)
```

Seul jeton conservé sur l'appareil : l'autorisation Dropbox (limitée au dossier `Apps/wazzzpass`), et le
fichier clé si vous cochez « Mémoriser ». Le mot de passe maître et le contenu déchiffré restent en mémoire.

## Mise en place (une seule fois)

### 1. Application Dropbox
1. https://www.dropbox.com/developers/apps → **Create app** → *Scoped access* → **App folder** → nom `wazzzpass`.
2. Onglet **Permissions** : cocher `files.content.read` et `files.content.write` → *Submit*.
3. Onglet **Settings** → *OAuth 2 / Redirect URIs* : ajouter
   `https://wazzzpass.walautao.fr/` et `http://localhost:5173/` (développement).
4. Copier l'**App key** (publique, ce n'est pas un secret) dans `.env.production` :
   ```
   VITE_DROPBOX_APP_KEY=votre_app_key
   ```
   puis commit + push. Ne jamais utiliser l'*App secret* : il n'est pas nécessaire.

### 2. DNS (IONOS)
Enregistrement **A** `wazzzpass` → `93.93.117.124` (inutile si un joker `*.walautao.fr` existe déjà).

### 3. Serveur (root, une fois)
```bash
curl -fsSL https://raw.githubusercontent.com/wdemirdjian-14/wazzzpass/main/deploy/installer-serveur.sh -o /root/installer-wazzzpass.sh
sudo bash /root/installer-wazzzpass.sh
```
(Si le dépôt est privé, copier le script par `scp` à la place de `curl`.)
Le script est additif : utilisateur `wazzzpass`, dossiers `/var/www/wazzzpass*`, un site Nginx, Certbot.
Aucun port, aucun PM2, aucune base de données. À la fin : copier les 4 secrets GitHub
(`VPS_HOST`, `VPS_PORT`, `VPS_KNOWN_HOSTS`, `VPS_SSH_KEY`) puis supprimer le fichier qui les contient.

### 4. Mises en ligne suivantes
```bash
git tag v1.0.1 && git push origin v1.0.1
```
ou GitHub → Actions → « Déploiement production » → *Run workflow* (`release`, `rollback`, `status`).
Le serveur construit la version à côté de celle en ligne, bascule d'un coup, et revient en arrière seul
si Nginx ne sert pas la nouvelle version.

## Sur l'iPhone
Safari → https://wazzzpass.walautao.fr → Partager → **Sur l'écran d'accueil**.
Si la connexion Dropbox ne revient pas dans l'app, utiliser « Utiliser un code » sur l'écran de connexion.

## Développement
```bash
npm install
npm run dev            # http://localhost:5173/?demo  → mode démo local, sans Dropbox
npm run check          # vérification TypeScript / Svelte
npm run build && npm run preview   # build de production servi avec la même CSP que Nginx
```

## Sécurité : à savoir
- **Mot de passe maître perdu = coffre perdu** (aucune porte dérobée). Idem pour le fichier clé s'il est utilisé :
  gardez-en une copie de secours hors ligne.
- Le point sensible d'une app web est le serveur qui livre le code : gardez le VPS à jour, SSH par clé uniquement.
  La CSP interdit tout script externe et toute connexion autre que Dropbox.
- Dropbox conserve l'historique des versions du fichier (restauration possible en cas de fausse manipulation).
- Les suppressions vont dans la corbeille du fichier KeePass (récupérables avec KeePassXC).
