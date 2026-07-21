# Deploying `lab-eval-cn` on a Linux Server (AlmaLinux / Ubuntu Server / CentOS)

## 0. Architecture, so the steps make sense

The project has three moving parts that all live on (or are reachable from) the same server:

1. **`server/`** — Node.js/Express + Socket.IO + a raw WebSocket (`/ws/ssh`) backend. It talks to **MongoDB**, and it talks to the **Docker daemon** on the host (via `dockerode`, using `/var/run/docker.sock`) to spin up one container per student for the lab environment.
2. **`client/`** — a Vite/React single-page app. It is **not** served by the Node server — you build it to static files and serve those separately (e.g. with Nginx).
3. **The `lab-cn-image` Docker image** — built from `server/Dockerfile`. Every time a student starts a session, the backend launches a fresh container from this image and exposes an SSH port on the host (from a configurable range) so the browser terminal (via the backend) can SSH into it.

So a production box needs: Node.js, Docker, MongoDB (or a MongoDB Atlas URI), and a web server/reverse proxy (Nginx) — plus a wide range of open ports for the per-student SSH containers.

**Important architectural gotcha before you deploy:** `client/src/config.js` currently builds the API URL as:

```js
export const API_BASE = `http://${window.location.hostname}:5001`;
export const WS_BASE = `ws://${window.location.hostname}:5001`;
```

This assumes the browser can reach the backend directly on port 5001 over **plain HTTP/WS** using whatever hostname the frontend was loaded from. That's fine for an internal LAN deployment (e.g. a lab room, `http://10.x.x.x`). It will **break** if you put the frontend behind HTTPS on a real domain, because browsers block HTTP/WS calls from an HTTPS page (mixed content). If you want a proper `https://yourdomain.com` deployment, you'll need to either proxy `/api` and `/ws` through the same Nginx host/port as the frontend and change `config.js` to use relative paths (`""` for API_BASE, `wss://hostname` for WS_BASE), or terminate TLS in front of port 5001 too. I haven't changed the code — flagging it so you decide before you commit to a domain-based deployment. Happy to make that edit if you want.

---

## 1. Prerequisites on the server

### 1a. Base packages

**Ubuntu Server:**

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential
```

**AlmaLinux / CentOS:**

```bash
sudo dnf update -y
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y curl git
```

### 1b. Node.js (v20 LTS recommended; repo was tested against Node 22)

Use NodeSource so you get a recent version (distro repos are usually too old):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -   # Ubuntu
sudo apt install -y nodejs

# AlmaLinux/CentOS:
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
```

Verify: `node -v` and `npm -v`.

### 1c. Docker Engine

```bash
# Ubuntu
curl -fsSL https://get.docker.com | sudo sh

# AlmaLinux/CentOS
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo systemctl enable --now docker
```

Add the user that will run the Node backend to the `docker` group (so it can talk to `/var/run/docker.sock` without root):

```bash
sudo usermod -aG docker $USER
# log out/in (or `newgrp docker`) for it to take effect
```

### 1d. MongoDB

Either run MongoDB locally, or use a hosted service like MongoDB Atlas and skip straight to getting a connection string. For a local instance:

**Ubuntu:**

```bash
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

**AlmaLinux/CentOS:** add the MongoDB yum repo (see MongoDB's official install docs for RHEL-based distros — the steps differ slightly by MongoDB version) then `sudo dnf install -y mongodb-org && sudo systemctl enable --now mongod`.

### 1e. Nginx (to serve the built frontend and reverse-proxy the API)

```bash
sudo apt install -y nginx        # Ubuntu
sudo dnf install -y nginx        # AlmaLinux/CentOS
sudo systemctl enable --now nginx
```

---

## 2. Get the code onto the server

```bash
git clone <your-repo-url> lab-eval-cn
cd lab-eval-cn
```

(Or `scp`/upload the zip and unzip it — either way, exclude `node_modules` from the transfer and reinstall fresh on the server rather than copying it over, since native modules can be architecture-specific.)

---

## 3. Build the `lab-cn-image` Docker image (per-student containers)

This is the image every student's session runs in. Do this **before** starting the backend.

```bash
cd lab-eval-cn/server
```

⚠️ **Security note first:** the export you gave me includes `labuser_key`, `labuser_key.pub`, `networklab_key`, and `networklab_key.pub` — actual OpenSSH keypairs, not placeholders. Only `labuser_key.pub` is tracked in git, but since these private keys sat in the working directory (and therefore in this zip), treat them as compromised and **regenerate fresh keypairs on the server** rather than reusing the ones in the archive:

```bash
rm -f labuser_key labuser_key.pub networklab_key networklab_key.pub
ssh-keygen -t rsa -b 2048 -f ./labuser_key -N ""
ssh-keygen -t rsa -b 2048 -f ./networklab_key -N ""
chmod 600 labuser_key networklab_key
```

Now build the image (the Dockerfile `COPY`s `labuser_key.pub` and `networklab_key.pub` into it):

```bash
docker build -t lab-cn-image .
```

Confirm it built: `docker images | grep lab-cn-image`.

---

## 4. Configure and run the backend (`server/`)

### 4a. Install dependencies

```bash
cd lab-eval-cn/server
npm install --omit=dev   # or plain `npm install`
```

### 4b. Create `.env`

The code reads these variables (via `dotenv`). Create `server/.env`:

```ini
# Core
PORT=5001
NODE_ENV=production
MONGO_URI=mongodb://127.0.0.1:27017/lab_eval_cn
JWT_SECRET=<generate a long random string, e.g. `openssl rand -hex 32`>

# Docker / per-student containers
SSH_IMAGE=lab-cn-image
SSH_PORT_RANGE_START=2200
SSH_PORT_RANGE_SIZE=500

# Optional container resource caps (defaults shown are what the code falls back to)
CONTAINER_MEMORY_BYTES=335544320
CONTAINER_NANO_CPUS=500000000
CONTAINER_PIDS_LIMIT=150
```

Never commit `.env` (it's already gitignored) and never reuse a `JWT_SECRET` from a dev/test environment.

### 4c. Fix the CORS allow-list for your real domain/IP

In `server/index.js`, `allowedOrigins` currently only lists a couple of hardcoded dev URLs, plus a regex that auto-allows any `localhost`/`127.0.0.1`/`10.x.x.x` origin (fine for a private LAN classroom deployment). If the server will be reached from outside that private range, add your actual frontend origin(s) to `allowedOrigins` before deploying, e.g. `http://your-server-ip` or `https://yourdomain.com`.

### 4d. Sanity-check it runs

```bash
node index.js
# should print: Server running at http://0.0.0.0:5001
```

Ctrl+C once you've confirmed it starts and connects to MongoDB without errors, then set it up to run persistently (next step).

### 4e. Run it persistently with `pm2` (simplest option)

```bash
sudo npm install -g pm2
cd lab-eval-cn/server
pm2 start index.js --name lab-eval-cn-server
pm2 save
pm2 startup   # follow the printed instructions to enable boot-start
```

Alternative: a `systemd` unit (`/etc/systemd/system/lab-eval-cn.service`) running `ExecStart=/usr/bin/node /path/to/server/index.js` as the docker-group user, with `Restart=on-failure` — use this if you prefer systemd over pm2.

---

## 5. Build and serve the frontend (`client/`)

### 5a. Build

```bash
cd lab-eval-cn/client
npm install
npm run build
```

This produces static files in `client/dist/`.

### 5b. Serve with Nginx

Example `/etc/nginx/conf.d/lab-eval-cn.conf` (adjust `server_name` / paths):

```nginx
server {
    listen 80;
    server_name your-server-ip-or-domain;

    root /path/to/lab-eval-cn/client/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri /index.html;
    }
}
```

Reload Nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

At this point the frontend is served on port 80, and it will call the backend directly on port `5001` on the same hostname (per `config.js`, see the note in section 0). That means port 5001 also needs to be reachable from student browsers — see firewall rules below. If you'd rather not expose 5001 publicly, add an Nginx `location /api { proxy_pass http://127.0.0.1:5001; }` and `location /ws/ { proxy_pass http://127.0.0.1:5001; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }` block and update `client/src/config.js` accordingly (I can help with this if you want to go that route).

---

## 6. Firewall rules

Open:

- **80/443** (or whatever port Nginx serves the frontend on)
- **5001** (backend, if student browsers hit it directly rather than through an Nginx proxy)
- **The SSH container port range** — `SSH_PORT_RANGE_START` to `SSH_PORT_RANGE_START + SSH_PORT_RANGE_SIZE` (defaults **2200–2700**), since each student's Docker container publishes its SSH port somewhere in that range and the backend connects the browser terminal through it.

**Ubuntu (ufw):**

```bash
sudo ufw allow 80/tcp
sudo ufw allow 5001/tcp
sudo ufw allow 2200:2700/tcp
sudo ufw enable
```

**AlmaLinux/CentOS (firewalld):**

```bash
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=5001/tcp
sudo firewall-cmd --permanent --add-port=2200-2700/tcp
sudo firewall-cmd --reload
```

---

## 7. SELinux note (AlmaLinux/CentOS only)

If SELinux is enforcing (`getenforce`), Docker and Node generally work out of the box, but if you hit permission-denied errors around the Docker socket or Nginx proxying, check `sudo ausearch -m avc -ts recent` for denials rather than disabling SELinux outright. Common fix for Nginx-to-backend proxying under SELinux:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

---

## 8. Post-deploy checklist

- [ ] Regenerated `labuser_key`/`networklab_key` on the server (not reused from the zip/repo)
- [ ] `.env` has a fresh, random `JWT_SECRET` and correct `MONGO_URI`
- [ ] `allowedOrigins` in `server/index.js` includes your real frontend origin if outside the private-IP regex
- [ ] `lab-cn-image` built successfully (`docker images`)
- [ ] Backend running under pm2/systemd and restarts on crash/reboot
- [ ] Frontend built and served by Nginx
- [ ] Firewall open on frontend port, backend port, and the SSH container port range
- [ ] Confirmed a full student flow works end-to-end (login → container spins up → terminal connects) from a machine outside the server itself, not just `localhost`

---

## 9. Ongoing operations

- **Logs:** `pm2 logs lab-eval-cn-server` (or `journalctl -u lab-eval-cn` if using systemd)
- **Stray containers:** since each session spins up a Docker container, periodically check `docker ps -a` for orphaned containers if sessions aren't being cleaned up reliably, and consider a cron job / the reaper already in `utils/sshConnectionPool.js` (`startSSHPoolReaper`) — that's already wired in on server start.
- **Updating the app:** `git pull`, `npm install` in whichever of `server`/`client` changed, `npm run build` for the client, `pm2 restart lab-eval-cn-server` for the server, `sudo systemctl reload nginx` if Nginx config changed.

If you want, I can also draft the Nginx config with the API/WebSocket proxy baked in (so you don't need to expose port 5001 publicly and can move to HTTPS cleanly), or a `systemd` unit file instead of pm2 — just say the word.
