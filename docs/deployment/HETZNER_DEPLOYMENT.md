# Deploy Compass na Hetzner

## Rekomendacja: Hetzner Cloud + Coolify

**VPS**: CPX21 (3 vCPU, 4 GB RAM, 80 GB SSD, ~9 EUR/mies) — dla dev/staging; CCX13 (2 vCPU dedicated, 8 GB RAM) — dla prod.
**System**: Ubuntu 22.04 LTS.

Coolify obsługuje out-of-the-box: Docker Compose, reverse proxy (Traefik), Let's Encrypt SSL, health checks, auto-deploy z Git webhook, rollback.

---

## Wariant A — Coolify (rekomendowany)

### 1. Stworzenie VM
```bash
# Hetzner Cloud Console → New Server
# Image: Ubuntu 22.04
# Type: CPX21 (Intel/AMD)
# SSH key: dodaj swój publiczny klucz
# Firewall: otwórz 22, 80, 443, 8000 (Coolify UI)
```

### 2. Instalacja Coolify
```bash
ssh root@<VM_IP>
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
# UI dostępny pod http://<VM_IP>:8000 — kreator ustawi admina
```

### 3. Konfiguracja projektu w Coolify UI
1. **Resources → New** → Docker Compose (public) / GitHub repo
2. Repo URL: `https://github.com/artur-t-96/compass`, branch `main`
3. Build Pack: Docker Compose, plik: `docker-compose.yml`
4. Environment variables: wklej wartości z `.env.hetzner.example` (rotowane klucze Supabase!)
5. Domain: `compass.example.com` (Coolify poprosi o DNS A record → IP VM, SSL przez Let's Encrypt auto)
6. Deploy → poczekaj aż healthcheck zielony

### 4. Auto-deploy
- Settings → GitHub App / Webhook → `/deploy` po push na `main`

---

## Wariant B — plain Docker Compose + Caddy

### 1. Przygotowanie VM
```bash
ssh root@<VM_IP>
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin caddy git
systemctl enable --now docker
adduser deploy --disabled-password --gecos ""
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
# dodaj swój public key do /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

### 2. Sklonowanie repo + env
```bash
su - deploy
cd /home/deploy
git clone https://github.com/artur-t-96/compass.git app
cd app
cp .env.hetzner.example .env
nano .env   # wypełnij wartościami
```

### 3. Uruchomienie
```bash
docker compose up -d --build
docker compose ps                 # app: healthy
docker compose logs app -f        # weryfikacja
```

### 4. Caddy jako reverse proxy (SSL + Let's Encrypt)
`/etc/caddy/Caddyfile`:
```caddy
compass.example.com {
    reverse_proxy localhost:10000
    encode gzip zstd
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    }
}
```
```bash
systemctl reload caddy
```

### 5. Auto-deploy przez GitHub Actions (SSH)
Dodaj w `.github/workflows/deploy-hetzner.yml` step:
```yaml
- name: Deploy via SSH
  uses: appleboy/ssh-action@v1.0.3
  with:
    host: ${{ secrets.HETZNER_HOST }}
    username: deploy
    key: ${{ secrets.HETZNER_SSH_KEY }}
    script: |
      cd /home/deploy/app
      git pull origin main
      docker compose up -d --build
```

---

## Checklist przed pierwszym deployem

- [ ] Rotowane klucze Supabase (anon + service_role)
- [ ] Wypełniony `.env` na VM (nie `.env.example`)
- [ ] DNS A record wskazuje na IP VM
- [ ] Firewall UFW/Hetzner Cloud: 22, 80, 443 open
- [ ] RLS enabled na WSZYSTKICH tabelach Supabase (Dashboard → Authentication → Policies)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` w runtime env, NIE w kliencie (sprawdź logi browsera)
- [ ] Test `/api/health` zwraca 200 po `docker compose up -d`
- [ ] Login działa, redirect działa, dashboard się ładuje (Chrome MCP test)

## Backup i rollback

- **DB**: Supabase managed ma PITR (Point-in-time recovery) dla Pro planu
- **App rollback**: `git checkout <previous-sha> && docker compose up -d --build`
- **Config backup**: `.env` kopiowany przy każdej zmianie (`cp .env .env.bak.$(date +%s)`)

## Monitoring

- **Logi**: `docker compose logs -f app`
- **Status**: `docker compose ps`, `curl -f http://localhost:10000/api/health`
- **Metrics** (nice-to-have): Uptime Kuma / Hetzner Cloud metrics
