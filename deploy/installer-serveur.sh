#!/usr/bin/env bash
# =====================================================================
# wazzzpass — installation initiale sur le VPS IONOS (à lancer UNE fois, en root).
#
#   curl -fsSL https://raw.githubusercontent.com/wdemirdjian-14/wazzzpass/main/deploy/installer-serveur.sh -o /root/installer-wazzzpass.sh
#   (ou copier le fichier par scp)   puis :   sudo bash /root/installer-wazzzpass.sh
#
# Tout est ADDITIF : un utilisateur système, un dossier /var/www/wazzzpass*, un fichier Nginx.
# Aucun autre site, aucun port, aucune base de données n'est touché.
# Site 100 % statique : pas de PM2, pas de port applicatif, pas de .env.
# =====================================================================
set -euo pipefail

APP=wazzzpass
DOMAIN=wazzzpass.walautao.fr
REPO_SSH=git@github.com:wdemirdjian-14/wazzzpass.git
APP_DIR=/var/www/$APP
SITE=/etc/nginx/sites-available/$APP
EXPECTED_IP=93.93.117.124

[ "$(id -u)" -eq 0 ] || { echo "Lancez ce script avec sudo."; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

step "Vérifications (lecture seule)"
if grep -rqs "server_name.*$DOMAIN" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ && [ ! -e "$SITE" ]; then
  echo "[x] $DOMAIN est déjà déclaré dans un autre site Nginx : arrêt."; exit 1
fi
NODE_V="$(node -v 2>/dev/null || echo absent)"
echo "Node système : $NODE_V (utilisé tel quel, non modifié ; Vite demande >= 20.19)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
if [ "$DNS_IP" = "$EXPECTED_IP" ]; then echo "DNS : $DOMAIN -> $DNS_IP ✔"
else echo "[!] DNS : $DOMAIN -> ${DNS_IP:-introuvable} (attendu $EXPECTED_IP). Certbot sera à relancer plus tard."; fi

step "Utilisateur système $APP"
if ! id "$APP" >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash "$APP"
fi
install -d -m 700 -o "$APP" -g "$APP" "/home/$APP/.ssh"

step "Clé de déploiement GitHub (lecture seule)"
if [ ! -f "/home/$APP/.ssh/id_ed25519" ]; then
  sudo -u "$APP" ssh-keygen -q -t ed25519 -N "" -C "$APP@vps" -f "/home/$APP/.ssh/id_ed25519"
fi
sudo -u "$APP" sh -c 'ssh-keyscan -t ed25519 github.com 2>/dev/null >> ~/.ssh/known_hosts; sort -u -o ~/.ssh/known_hosts ~/.ssh/known_hosts'
if ! sudo -u "$APP" git ls-remote "$REPO_SSH" >/dev/null 2>&1; then
  echo
  echo "Ajoutez cette clé dans GitHub : wdemirdjian-14/wazzzpass → Settings → Deploy keys → Add deploy key"
  echo "(titre : vps-ionos, NE PAS cocher « Allow write access »)"
  echo
  cat "/home/$APP/.ssh/id_ed25519.pub"
  echo
  read -r -p "Appuyez sur Entrée une fois la clé ajoutée… " _
  sudo -u "$APP" git ls-remote "$REPO_SSH" >/dev/null || { echo "[x] Accès au dépôt refusé."; exit 1; }
fi

step "Code source dans $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  install -d -o "$APP" -g "$APP" "$APP_DIR"
  sudo -u "$APP" git clone --quiet "$REPO_SSH" "$APP_DIR"
else
  sudo -u "$APP" git -C "$APP_DIR" pull --quiet --ff-only
fi

step "Déployeur + clé GitHub Actions"
bash "$APP_DIR/deploy/activer-deploiement-auto.sh" > /root/wazzzpass-secrets-github.txt
chmod 600 /root/wazzzpass-secrets-github.txt

step "Première construction (branche main)"
sudo -iu "$APP" /usr/local/bin/wazzzpass-deployer deploy main

step "Site Nginx"
install -m 644 "$APP_DIR/deploy/nginx-wazzzpass.conf" "$SITE"
ln -sfn "$SITE" "/etc/nginx/sites-enabled/$APP"
if nginx -t; then
  systemctl reload nginx
else
  rm -f "/etc/nginx/sites-enabled/$APP"
  echo "[x] Configuration Nginx refusée : site retiré, aucun autre site touché."; exit 1
fi

step "HTTPS (Certbot)"
if [ "$DNS_IP" = "$EXPECTED_IP" ]; then
  certbot --nginx -d "$DOMAIN" --redirect --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring \
    || echo "[!] Certbot a échoué : relancez « certbot --nginx -d $DOMAIN --redirect » une fois le DNS propagé."
else
  echo "[!] DNS pas prêt : lancez plus tard « certbot --nginx -d $DOMAIN --redirect »"
fi

step "Vérification"
sudo -iu "$APP" /usr/local/bin/wazzzpass-deployer status || true

cat <<EOT

=====================================================================
 Installation terminée.
 Dernière étape : copier les 4 secrets GitHub affichés dans
     /root/wazzzpass-secrets-github.txt
 (cat /root/wazzzpass-secrets-github.txt), puis SUPPRIMER ce fichier :
     shred -u /root/wazzzpass-secrets-github.txt
=====================================================================
EOT
