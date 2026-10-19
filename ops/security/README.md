# Accès système du futur VPS

Ne pas installer ces réglages sur le poste de développement. Aucun bannissement
ni changement SSH/pare-feu n’est exécuté automatiquement par Poduna.

## Observer avant d’intervenir

Depuis le terminal privé du VPS (Debian/Ubuntu), vérifier les unités réellement
présentes (`ssh.service` ou `sshd.service`) puis :

```bash
sudo journalctl -u ssh -u sshd --since '1 hour ago' --no-pager
sudo ss -lntup
sudo ss -ntp state established
who
```

Le journal SSH indique les réussites/échecs d’authentification ; `ss` indique les
ports et processus en écoute et les connexions TCP actuelles. Ce n’est pas un
historique complet ni un inventaire des fichiers consultés. Un tunnel Cloudflare
apparaît comme une connexion sortante ; ses sockets ne donnent pas l’identité
des visiteurs. Ne pas publier ces sorties : elles peuvent contenir IP et comptes.

Pour le backend conteneurisé : `docker compose -f observability/docker-compose.yml
logs --since 1h --tail 200 backend`. Le nouvel onglet Sécurité apporte les routes
applicatives normalisées ; les sorties du processus ne le remplacent pas.

## Bloquer des tentatives SSH

1. Garder une session SSH ouverte et tester la console de secours de l’hébergeur.
   Confirmer le port réellement utilisé et tester une seconde connexion avec clé.
2. Installer Fail2ban depuis les paquets de la distribution. Vérifier que le filtre
   `sshd` lit effectivement les échecs dans journald et que nftables est disponible.
3. Revoir `sshd.local.example`, notamment le port ; copier uniquement ce fichier
   dans `/etc/fail2ban/jail.d/poduna-sshd.local`. Il reste désactivé initialement.
   Si une IP d’administration fixe existe, envisager une exception ciblée, pas
   une plage entière de fournisseur mobile. Une exception réduit la protection.
4. Passer `enabled` à `true` après validation ; `sudo fail2ban-client -t`, puis
   recharger Fail2ban. Tester depuis une seconde origine contrôlée, jamais en
   risquant l’unique accès d’administration. Contrôler :

```bash
sudo fail2ban-client status sshd
sudo journalctl -u fail2ban --since '1 hour ago' --no-pager
```

Intervention manuelle, **remplacer l’adresse de documentation ci-dessous par une
IP constatée et vérifiée, différente de sa propre IP et de tout relais** :

```bash
sudo fail2ban-client set sshd banip 192.0.2.123
sudo fail2ban-client set sshd unbanip 192.0.2.123
```

Le modèle prévoit 5 échecs en 10 minutes, bannissement 15 minutes, sur le port SSH
uniquement. Cela ne révoque pas forcément une session déjà authentifiée ; en cas
de compromission confirmée, isoler la machine et révoquer les clés/sessions via
la console, après avoir identifié les cibles. Ne pas exécuter des `kill` globaux.

## Avant ouverture publique

- SSH par clés, connexion root distante désactivée ; désactiver les mots de passe
  seulement après test de la clé et de l’accès de secours (`sshd -t` puis `sshd -T`
  pour examiner la configuration effective). Le 2FA de Poduna ne protège pas SSH.
- Pare-feu hébergeur + hôte, IPv4 **et** IPv6 ; n’exposer que les ports nécessaires.
  Contrôler les règles Docker : une publication Docker ne se sécurise pas en
  supposant qu’une règle UFW suffit.
- Journal système persistant, taille et rétention limitées, copie externe protégée
  des événements importants, alerte sur connexion SSH réussie inattendue,
  répétition des échecs, disque plein et service arrêté. Canal d’alerte à choisir.
- Anti-abus IP web au niveau du relais de confiance / Cloudflare, après
  configuration explicite de la provenance des IP. Jamais à partir d’un simple
  `X-Forwarded-For` fourni par un visiteur. Le tunnel temporaire ne constitue pas
  à lui seul une politique d’accès.

Pas de montage du socket Docker, du journal hôte ou de `/etc`, pas de `sudo` ni de
commande arbitraire depuis le backend web. Pour afficher les événements système
dans l’admin ultérieurement : collecteur séparé en lecture seule et protocole de
contrôle limité, à concevoir avec le VPS réellement choisi.

Références : [configuration officielle Fail2ban](https://github.com/fail2ban/fail2ban/blob/master/config/jail.conf),
[OpenSSH — sshd_config](https://man.openbsd.org/sshd_config).
