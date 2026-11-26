#!/usr/bin/env bash
# =====================================================================
# wazzzpass — déploiement d'une version (tag) sans coupure, avec retour arrière automatique.
# Site statique : on construit dist/ dans un dossier de version, puis on bascule le lien « current ».
# Pas de base de données, pas de processus à relancer : Nginx sert directement les fichiers.
#
# Appelé par GitHub Actions via SSH (clé restreinte à ce seul script, voir activer-deploiement-auto.sh)
# ou à la main :   sudo -u wazzzpass /usr/local/bin/wazzzpass-deployer deploy v1.0.0
#
# Commandes :  deploy <vX.Y.Z | main>   construit et met en ligne cette version
#              rollback                 revient à la version précédente
#              status                   version en ligne + santé
# =====================================================================
set -euo pipefail

APP="${APP:-wazzzpass}"
DOMAIN="${DOMAIN:-wazzzpass.walautao.fr}"
REPO_DIR="${REPO_DIR:-/var/www/wazzzpass}"                  # clone Git (source)
RELEASES="${RELEASES:-/var/www/wazzzpass-deploy/releases}"  # une version par dossier
CURRENT="${CURRENT:-/var/www/wazzzpass-deploy/current}"     # lien vers la version en ligne (racine Nginx : current/dist)
NODE_DIR="${NODE_DIR:-/opt/wazzzpass-node}"                 # facultatif : Node isolé, sinon Node système (>= 20.19)
KEEP="${KEEP:-3}"
export PATH="$NODE_DIR/bin:/usr/local/bin:/usr/bin:/bin"
umask 022   # Nginx (www-data) doit pouvoir lire les fichiers

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { printf '[%s] ERREUR : %s\n' "$(date '+%H:%M:%S')" "$*" >&2; exit 1; }
trap 'printf "[%s] ERREUR inattendue (ligne %s) : déploiement interrompu\n" "$(date +%H:%M:%S)" "$LINENO" >&2' ERR

for cmd in git node npm curl flock tar; do
  command -v "$cmd" >/dev/null || die "commande « $cmd » introuvable (PATH=$PATH)"
done

# Commande reçue : SSH forcé ($SSH_ORIGINAL_COMMAND) ou arguments
read -r ACTION REF EXTRA <<<"${SSH_ORIGINAL_COMMAND:-$*}" || true
[ -z "${EXTRA:-}" ] || die "argument inattendu"

current_release() { readlink "$CURRENT" 2>/dev/null || echo ""; }

healthy() {   # $1 = dossier de version attendu en ligne (facultatif)
  local dir="${1:-$(current_release)}" i
  [ -n "$dir" ] && [ -s "$dir/dist/index.html" ] || return 1
  local marker
  marker="$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' "$dir/dist/index.html" | head -1)"
  for i in 1 2 3 4 5; do
    # HTTPS si le certificat est en place, sinon HTTP ; on vérifie que Nginx sert bien CETTE version
    if curl -fsS --max-time 5 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" 2>/dev/null | grep -qF "$marker" ||
       curl -fsS --max-time 5 -H "Host: $DOMAIN" "http://127.0.0.1/" 2>/dev/null | grep -qF "$marker"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

point_current_to() { ln -sfn "$1" "$CURRENT.tmp" && mv -Tf "$CURRENT.tmp" "$CURRENT"; }

exec 9>"/tmp/$APP-deploy.lock"
flock -n 9 || die "un déploiement est déjà en cours"

case "${ACTION:-}" in
  status)
    NOW="$(current_release)"
    [ -n "$NOW" ] || die "aucune version en ligne"
    log "En ligne : $NOW"
    [ -f "$NOW/.release" ] && cat "$NOW/.release"
    healthy "$NOW" && log "Santé : OK" || die "Santé : Nginx ne sert pas cette version"
    ;;

  rollback)
    NOW="$(current_release)"
    PREV="$(ls -1dt "$RELEASES"/*/ 2>/dev/null | sed 's#/$##' | grep -vxF "$NOW" | head -1 || true)"
    [ -n "$PREV" ] || die "aucune version précédente disponible"
    log "Retour arrière : $NOW -> $PREV"
    point_current_to "$PREV"
    healthy "$PREV" && log "Retour arrière réussi ✔" || die "le site ne répond pas après le retour arrière"
    ;;

  deploy)
    [[ "${REF:-}" =~ ^(v[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.]+)?|main)$ ]] \
      || die "version invalide « ${REF:-} » (attendu : vX.Y.Z ou main)"
    log "Récupération du code ($REF)"
    git -C "$REPO_DIR" fetch --quiet --tags --force origin '+refs/heads/main:refs/remotes/origin/main'
    if [ "$REF" = main ]; then
      SHA="$(git -C "$REPO_DIR" rev-parse origin/main)"; NAME="main-${SHA:0:7}"
    else
      SHA="$(git -C "$REPO_DIR" rev-parse --verify --quiet "refs/tags/$REF^{commit}")" || die "tag $REF introuvable sur GitHub"
      NAME="$REF"
    fi
    DIR="$RELEASES/$NAME"
    if [ "$(current_release)" = "$DIR" ] && healthy "$DIR"; then log "$NAME est déjà en ligne, rien à faire ✔"; exit 0; fi

    log "Construction de $NAME (${SHA:0:7}) dans $DIR — le site en ligne n'est pas touché"
    mkdir -p "$RELEASES"
    rm -rf "$DIR"; mkdir -p "$DIR"
    trap 'rm -rf "$DIR"; printf "[%s] ERREUR (ligne %s) : le site en ligne n a pas changé\n" "$(date +%H:%M:%S)" "$LINENO" >&2' ERR
    git -C "$REPO_DIR" archive "$SHA" | tar -x -C "$DIR"
    printf 'version=%s\ncommit=%s\ndate=%s\n' "$NAME" "$SHA" "$(date -Iseconds)" > "$DIR/.release"
    ( cd "$DIR" && npm ci --no-audit --no-fund --loglevel=error && npm run build ) \
      || die "le build a échoué : le site en ligne n'a pas changé"
    [ -s "$DIR/dist/index.html" ] || die "build incomplet (dist/index.html absent)"
    rm -rf "$DIR/node_modules"   # seul dist/ est servi ; inutile de garder les dépendances
    trap 'printf "[%s] ERREUR inattendue (ligne %s)\n" "$(date +%H:%M:%S)" "$LINENO" >&2' ERR

    PREV="$(current_release)"
    log "Bascule : ${PREV:-(aucune)} -> $DIR"
    point_current_to "$DIR"

    if ! healthy "$DIR"; then
      if [ -n "$PREV" ] && [ -d "$PREV" ]; then
        log "Nginx ne sert pas la nouvelle version : retour automatique à $PREV"
        point_current_to "$PREV"
        rm -rf "$DIR"
        die "$NAME en échec, version précédente remise en ligne"
      fi
      log "[!] Première installation : Nginx ne répond pas encore pour $DOMAIN (site Nginx ou DNS à finaliser)."
    fi

    { ls -1dt "$RELEASES"/*/ | sed 's#/$##' | grep -vxF "$DIR" || true; } | tail -n +"$KEEP" | xargs -r rm -rf
    log "$NAME est en ligne ✔"
    ;;

  *)
    echo "Usage : deploy <vX.Y.Z|main> | rollback | status" >&2; exit 2 ;;
esac
