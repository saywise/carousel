# Deploy to Amazon Lightsail (Docker + Caddy)

One Ubuntu instance runs two containers: the studio app and Caddy, which gets and renews the HTTPS certificate automatically. Example domain: `studio.saywise.com`. Run the `docker compose` commands from the repo root (the folder that contains `deploy/`).

## 1. Create the instance

1. In the Lightsail console (region **us-east-1**), create an instance: Linux/Unix, **Ubuntu 24.04 LTS**, dual-stack (IPv4 and IPv6) networking, the **$12/month 2 GB** plan.
2. Networking tab: create a **static IP** and attach it to the instance. It is free while attached and billed if left unattached, so release it at teardown.
3. Instance firewall (IPv4 rules): allow **HTTP 80** (TCP) and **HTTPS 443** (TCP). Add a custom rule for **UDP 443** (HTTP/3). Change the SSH rule (TCP 22) to allow only your own IP.

## 2. Point DNS at it

In Route 53, open the existing `saywise.com` hosted zone and add an **A** record `studio.saywise.com` pointing to the static IP. Wait until this prints the static IP before starting the stack, otherwise Caddy's certificate request fails:

```sh
dig +short studio.saywise.com
```

## 3. Install Docker on the instance

SSH in as `ubuntu` (download the SSH key from the Lightsail console, `chmod 400` it), then:

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit    # log out and back in so the group change applies
```

This installs Docker Engine and the `docker compose` plugin. Check with `docker compose version`.

## 4. Copy the code to the server

From a local checkout of this repo (replace the key file and IP):

```sh
rsync -az --delete \
  --include '.env.example' \
  --exclude node_modules --exclude dist --exclude data --exclude .git \
  --exclude '.env' --exclude '.env.*' \
  -e "ssh -i /path/to/lightsail-key.pem" \
  ./ ubuntu@STATIC_IP:~/studio/
```

The excludes keep local secrets and databases off the server. `--delete` removes files on the server that no longer exist locally, but it never touches the server's `.env` (excluded files are protected from deletion).

## 5. Configure and start

On the server:

```sh
cd ~/studio
cp deploy/lightsail/.env.example deploy/lightsail/.env
nano deploy/lightsail/.env       # fill in STUDIO_PASSWORD, OPENAI_API_KEY, etc.
chmod 600 deploy/lightsail/.env
docker compose -f deploy/lightsail/docker-compose.yml up -d --build
docker compose -f deploy/lightsail/docker-compose.yml logs -f
```

Generate the password with `openssl rand -base64 24` and save it in a password manager. Press Ctrl+C to leave the logs (the stack keeps running). The first start takes a few minutes to build.

Open <https://studio.saywise.com>. The browser asks for the studio login (`STUDIO_USER` and `STUDIO_PASSWORD`).

## 6. Update

Run the same `rsync` command from step 4, then on the server:

```sh
cd ~/studio
docker compose -f deploy/lightsail/docker-compose.yml up -d --build
```

Saved projects and images live in the `studio-data` volume and survive updates.

## 7. Back up

Easiest: take a **Lightsail snapshot** of the instance (Snapshots tab). It captures the Docker volumes.

Or copy just the data volume to a tarball on the server, then download it with `scp`:

```sh
docker run --rm -v lightsail_studio-data:/data:ro -v "$PWD":/backup alpine tar czf /backup/studio-data-$(date +%F).tar.gz -C /data .
```

Compose prefixes volume names with the project name, which is `lightsail` (the compose file's folder), so the real volume is `lightsail_studio-data`. Confirm with `docker volume ls` and use that name in the command above.

## 8. Teardown checklist

1. `docker compose -f deploy/lightsail/docker-compose.yml down` (add `-v` only if you also want to delete the data and certificates).
2. Delete the Lightsail instance.
3. Release the static IP (it is billed while unattached).
4. Delete the `studio.saywise.com` A record in Route 53.
5. Revoke the OpenAI API key.

## Notes

- Do not configure an HTTP health check on the instance or any load balancer. The app answers 401 to unauthenticated requests and 403 to requests with the wrong Host header.
- Exactly one proxy (Caddy) sits in front of the app. This matches the app's `trust proxy` setting of 1, which it uses to rate-limit per client from `X-Forwarded-For`. If CloudFront or a load balancer is ever put in front of Caddy, that number in `server/app.ts` must change.
- Caddy needs ports 80 and 443 reachable from the internet, both to issue the certificate and to serve traffic.
