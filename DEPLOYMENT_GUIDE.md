# Article Extractor — Production Deployment Guide

> **Last updated:** 2026-09-10  
> **Project:** `article-extractor`  
> **Server OS:** Ubuntu 24.04  
> **Production project:** `/home/ubuntu/article-extractor`  
> **Frontend deployment:** `/var/www/article-extractor`  
> **PM2 service:** `article-extractor`  
> **Backend port:** `4001`  
> **Public path:** `/article-extractor/`  
> **Reverse proxy:** Nginx  
> **Existing service:** DeepRead on port `3000`

---

## 1. Current Production Architecture

```text
                         Nginx :80
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
    /article-extractor/               /api/, /
              │                             │
              ▼                             ▼
/var/www/article-extractor/         DeepRead :3000
              │
              │
    /article-extractor/api/
              │
              ▼
        Article Extractor
        Node / Express :4001
```

Article Extractor and DeepRead are separate services.

### Article Extractor

```text
Source:
  /home/ubuntu/article-extractor

Frontend:
  /var/www/article-extractor

Backend:
  /home/ubuntu/article-extractor/backend/server.js

PM2:
  article-extractor

Port:
  4001
```

### DeepRead

```text
Project:
  /opt/deepread

Port:
  3000
```

**Do not modify DeepRead during an Article Extractor deployment unless explicitly required.**

---

# 2. Project Structure

```text
/home/ubuntu/article-extractor/
├── backend/
│   ├── server.js
│   ├── extractor.js
│   └── downloader.js
├── src/
│   ├── App.jsx
│   ├── ArticleReader.jsx
│   ├── main.jsx
│   ├── styles.css
│   └── index.html
├── public/
│   ├── favicon.ico
│   ├── index.html
│   └── assets/
├── articles/
├── deploy/
│   └── ecosystem.config.cjs
├── package.json
├── package-lock.json
├── vite.config.js
├── install.sh
├── .env
└── README.md
```

---

# 3. Important Configuration

## 3.1 package.json

Production start command:

```bash
npm start
```

which executes:

```text
node backend/server.js
```

Build:

```bash
npm run build
```

Development:

```bash
npm run dev
```

---

## 3.2 Vite

Current Vite configuration uses:

```text
base: /article-extractor/
root: src
outDir: ../public
```

Therefore:

```text
src/index.html
```

is the frontend source entry.

The production build is generated into:

```text
public/
```

including:

```text
public/index.html
public/assets/
```

The favicon source file is:

```text
public/favicon.ico
```

It must remain present because it is a static asset required by the production deployment.

---

# 4. Environment Variables

Production environment:

```text
/home/ubuntu/article-extractor/.env
```

Current PM2 environment:

```text
NODE_ENV=production
PORT=4001
PROXY_URL=http://127.0.0.1:7890
```

Do not commit the real `.env`.

Check the PM2 environment:

```bash
pm2 env article-extractor | grep -E 'NODE_ENV|PORT|PROXY_URL'
```

---

# 5. PM2 Configuration

Configuration file:

```text
/home/ubuntu/article-extractor/deploy/ecosystem.config.cjs
```

Current production settings:

```text
name: article-extractor
cwd: /home/ubuntu/article-extractor
script: backend/server.js
interpreter: node

NODE_ENV=production
PORT=4001
PROXY_URL=http://127.0.0.1:7890
```

Logs:

```text
/home/ubuntu/.pm2/logs/article-extractor-out.log
/home/ubuntu/.pm2/logs/article-extractor-error.log
```

PID:

```text
/home/ubuntu/.pm2/pids/article-extractor.pid
```

---

# 6. Initial Deployment

## 6.1 Clone/copy source

The production source directory is:

```bash
/home/ubuntu/article-extractor
```

After obtaining the source:

```bash
cd /home/ubuntu/article-extractor
```

Verify:

```bash
ls -la
```

---

## 6.2 Install dependencies

Use the lockfile:

```bash
npm ci
```

Do not use `npm install` for routine production deployment unless dependencies intentionally need to be changed.

---

# 7. Build Frontend

Run:

```bash
npm run build
```

Verify:

```bash
ls -lah public/
ls -lah public/assets/
```

The build should contain at least:

```text
public/index.html
public/assets/
public/favicon.ico
```

### Important

Do not delete `public/favicon.ico`.

Vite copies static files from the configured public directory into the build output. If the favicon is missing from the source public directory, it will not appear in the production frontend.

---

# 8. Deploy Frontend Files

Current production static directory:

```text
/var/www/article-extractor
```

After a successful build, deploy the generated frontend files there.

Verify:

```bash
ls -lah /var/www/article-extractor/
ls -lah /var/www/article-extractor/assets/
ls -lh /var/www/article-extractor/favicon.ico
```

Expected:

```text
/var/www/article-extractor/index.html
/var/www/article-extractor/assets/
/var/www/article-extractor/favicon.ico
```

---

# 9. Start / Update PM2

Check whether the service already exists:

```bash
pm2 list
```

If it does not exist:

```bash
cd /home/ubuntu/article-extractor
pm2 start deploy/ecosystem.config.cjs
```

Then:

```bash
pm2 save
```

For an existing service after source changes:

```bash
cd /home/ubuntu/article-extractor
npm ci
npm run build
pm2 restart article-extractor
```

If the frontend is deployed separately to `/var/www/article-extractor`, ensure the newly generated frontend files have also been copied there before restarting/validating the service.

---

# 10. Nginx Configuration

Current configuration:

```text
/etc/nginx/sites-available/deepread
```

The configuration also contains the DeepRead routes.

## 10.1 Article Extractor API

```nginx
location ^~ /article-extractor/api/ {
    rewrite ^/article-extractor/api/(.*) /api/$1 break;
    proxy_pass http://127.0.0.1:4001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
    proxy_connect_timeout 10s;
}
```

Therefore:

```text
/article-extractor/api/*
```

is forwarded to:

```text
127.0.0.1:4001
```

---

# 11. Favicon Configuration

The favicon requires special handling.

Current source:

```text
/home/ubuntu/article-extractor/public/favicon.ico
```

Production copy:

```text
/var/www/article-extractor/favicon.ico
```

Nginx uses:

```nginx
location = /article-extractor/favicon.ico {
    alias /var/www/article-extractor/favicon.ico;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

### Why this exact location exists

The generic Article Extractor location uses SPA fallback:

```nginx
try_files $uri $uri/ /article-extractor/index.html;
```

If `favicon.ico` is missing, this can cause the favicon request to receive `index.html` instead of an icon.

The exact favicon location prevents that.

### Verify

```bash
curl -sI http://127.0.0.1/article-extractor/favicon.ico
```

Expected:

```text
HTTP/1.1 200 OK
Content-Type: image/x-icon
```

The response must not be:

```text
Content-Type: text/html
```

---

# 12. Nginx Validation

After any Nginx change:

```bash
sudo nginx -t
```

Only if the test succeeds:

```bash
sudo systemctl reload nginx
```

Check status:

```bash
sudo systemctl status nginx --no-pager
```

---

# 13. Production Verification

## 13.1 PM2

```bash
pm2 list
```

Expected:

```text
article-extractor    online
```

DeepRead should remain online as well.

---

## 13.2 Port

```bash
ss -tlnp | grep 4001
```

Expected Article Extractor backend:

```text
127.0.0.1:4001
```

The backend does not need to be publicly exposed because Nginx proxies requests to it.

---

## 13.3 Backend directly

```bash
curl -I http://127.0.0.1:4001
```

---

## 13.4 Frontend through Nginx

```bash
curl -I http://127.0.0.1/article-extractor/
```

---

## 13.5 Favicon

```bash
curl -sI http://127.0.0.1/article-extractor/favicon.ico
```

Expected:

```text
200 OK
Content-Type: image/x-icon
```

---

## 13.6 Check frontend HTML

```bash
curl -s http://127.0.0.1/article-extractor/ | grep -i favicon
```

Expected to find a reference similar to:

```html
<link rel="icon" href="/article-extractor/favicon.ico">
```

---

## 13.7 PM2 logs

```bash
pm2 logs article-extractor --lines 100
```

Look for:

```text
MODULE_NOT_FOUND
EADDRINUSE
uncaughtException
unhandledRejection
```

---

# 14. Common Problems

## Frontend shows 404

Check:

```bash
ls -lah /var/www/article-extractor/
ls -lah /var/www/article-extractor/assets/
```

Rebuild if necessary:

```bash
cd /home/ubuntu/article-extractor
npm run build
```

Then redeploy the contents to:

```text
/var/www/article-extractor/
```

---

## API returns 502

Check:

```bash
pm2 list
ss -tlnp | grep 4001
pm2 logs article-extractor --lines 100
```

Then test directly:

```bash
curl -I http://127.0.0.1:4001
```

If direct access works but Nginx returns 502, inspect Nginx configuration and logs.

---

## API extraction fails

Check:

```bash
pm2 logs article-extractor --lines 100
```

Check proxy configuration:

```bash
pm2 env article-extractor | grep -i PROXY
```

The current production configuration uses:

```text
http://127.0.0.1:7890
```

If that proxy is unavailable, external article extraction may fail.

---

## Favicon does not appear

Check all three layers:

### Source

```bash
ls -lh /home/ubuntu/article-extractor/public/favicon.ico
```

### Production file

```bash
ls -lh /var/www/article-extractor/favicon.ico
```

### HTTP response

```bash
curl -sI http://127.0.0.1/article-extractor/favicon.ico
```

The final response should be:

```text
200 OK
Content-Type: image/x-icon
```

Do not remove the exact Nginx favicon location.

---

# 15. Routine Update Procedure

For normal code updates:

```bash
cd /home/ubuntu/article-extractor
```

Update source using the project's configured source-control workflow.

Then:

```bash
npm ci
npm run build
```

Deploy the frontend build to:

```text
/var/www/article-extractor/
```

Restart:

```bash
pm2 restart article-extractor
```

Validate:

```bash
pm2 list
curl -I http://127.0.0.1/article-extractor/
curl -sI http://127.0.0.1/article-extractor/favicon.ico
```

Check logs:

```bash
pm2 logs article-extractor --lines 50
```

---

# 16. Rollback Principles

Before deleting or replacing production files:

- keep a known-good build when a risky deployment is being performed
- do not overwrite `.env`
- do not modify DeepRead configuration
- validate Nginx before reload
- check PM2 after restart

For a failed application update:

```bash
pm2 logs article-extractor --lines 100
pm2 show article-extractor
```

Restore the known-good source/build and then:

```bash
npm ci
npm run build
pm2 restart article-extractor
```

---

# 17. Files That Must Not Be Accidentally Deleted

Keep:

```text
/home/ubuntu/article-extractor/backend/
/home/ubuntu/article-extractor/src/
/home/ubuntu/article-extractor/public/favicon.ico
/home/ubuntu/article-extractor/package.json
/home/ubuntu/article-extractor/package-lock.json
/home/ubuntu/article-extractor/vite.config.js
/home/ubuntu/article-extractor/.env
/home/ubuntu/article-extractor/deploy/ecosystem.config.cjs
/home/ubuntu/article-extractor/node_modules/
/var/www/article-extractor/
/etc/nginx/sites-available/deepread
```

The following production favicon is also required:

```text
/var/www/article-extractor/favicon.ico
```

---

# 18. DeepRead Isolation

Article Extractor shares the Nginx server with DeepRead.

Current separation:

| Service | Backend | Public path |
|---|---|---|
| DeepRead | `127.0.0.1:3000` | `/` and `/api/` |
| Article Extractor | `127.0.0.1:4001` | `/article-extractor/` and `/article-extractor/api/` |

**Do not change DeepRead's port, PM2 configuration, database, or deployment directory during an Article Extractor deployment.**

---

# 19. Current Deployment Facts

```text
Project:
  article-extractor

Source:
  /home/ubuntu/article-extractor

Frontend:
  /var/www/article-extractor

PM2:
  article-extractor

Backend:
  /home/ubuntu/article-extractor/backend/server.js

Backend port:
  4001

Frontend URL path:
  /article-extractor/

API URL path:
  /article-extractor/api/

Nginx configuration:
  /etc/nginx/sites-available/deepread

Favicon source:
  /home/ubuntu/article-extractor/public/favicon.ico

Favicon production:
  /var/www/article-extractor/favicon.ico

PM2 logs:
  /home/ubuntu/.pm2/logs/article-extractor-out.log
  /home/ubuntu/.pm2/logs/article-extractor-error.log
```

---

# 20. Deployment Checklist

### Before deployment

- [ ] Confirm `pm2 list`
- [ ] Confirm DeepRead remains online
- [ ] Confirm port `4001`
- [ ] Confirm `.env` exists
- [ ] Confirm source is the intended version

### Build

- [ ] Run `npm ci`
- [ ] Run `npm run build`
- [ ] Confirm `public/index.html`
- [ ] Confirm `public/assets/`
- [ ] Confirm `public/favicon.ico`

### Frontend deployment

- [ ] Deploy build to `/var/www/article-extractor/`
- [ ] Confirm `/var/www/article-extractor/favicon.ico`

### Backend

- [ ] Confirm PM2 `article-extractor`
- [ ] Confirm port `4001`
- [ ] Restart PM2 if backend changed
- [ ] Check PM2 logs

### Nginx

- [ ] Run `sudo nginx -t`
- [ ] Reload only after successful test

### Final verification

- [ ] `/article-extractor/` returns HTTP 200
- [ ] `/article-extractor/favicon.ico` returns HTTP 200
- [ ] favicon Content-Type is `image/x-icon`
- [ ] Article Extractor API works
- [ ] DeepRead remains unaffected

---

## Document maintenance

This document describes the **current deployment architecture**.

Do not copy deployment paths or ports from older versions of this document.

In particular, the previous `website2` / `/opt/website2` / port `4000` deployment instructions are obsolete and should not be used for the current production installation.
