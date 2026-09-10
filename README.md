# Article Extractor

A web-based article extraction and reading tool built with React, Vite, and Node.js.

Article Extractor extracts the main content from web pages and presents it in a clean, readable format. It is designed as a lightweight backend service and frontend interface that can be deployed independently or used as part of a larger application such as [DeepRead](https://github.com/After2thougt/deep-read).

---

## Features

- Extract the main content from web pages
- Remove unnecessary navigation, advertisements, and page clutter
- Support modern JavaScript-based websites
- React-based frontend interface
- Node.js / Express backend API
- CORS support
- Optional proxy support for websites that require network routing
- Production-ready PM2 deployment
- Nginx reverse-proxy support
- SPA deployment under a subpath

---

## Tech Stack

### Frontend

- React
- Vite
- JavaScript
- HTML / CSS

### Backend

- Node.js
- Express
- `@extractus/article-extractor`
- Mozilla Readability
- JSDOM
- `node-fetch`
- Undici

### Production

- PM2
- Nginx
- Ubuntu
- Node.js 22+

---

## Project Structure

```text
article-extractor/
├── backend/
│   └── server.js
├── deploy/
│   └── ecosystem.config.cjs
├── src/
│   ├── index.html
│   └── ...
├── public/
│   └── favicon.ico
├── package.json
├── package-lock.json
├── vite.config.js
├── install.sh
├── DEPLOYMENT_GUIDE.md
└── README.md
```

---

## Requirements

- Node.js 22+
- npm
- Linux / macOS / Windows

For production deployment:

- Ubuntu
- Nginx
- PM2

---

## Installation

Clone the repository:

```bash
git clone <repository-url>
cd article-extractor
```

Install dependencies:

```bash
npm install
```

---

## Development

Start the frontend development server:

```bash
npm run dev
```

The Vite development server runs on port `3000` by default.

The backend can be started separately:

```bash
npm start
```

The production backend is configured to use port `4001`.

> **Note:** The current Vite development proxy points to port `4000`, while the production backend uses port `4001`. If you run the frontend and backend together locally, make sure the development configuration matches the backend port you are actually using.

---

## Build

Build the frontend:

```bash
npm run build
```

The Vite build output is generated in:

```text
public/
```

The production frontend can then be served as static files by Nginx.

---

## Backend API

The backend is an Express application located at:

```text
backend/server.js
```

Production configuration:

```text
Port: 4001
```

The API is exposed through Nginx under:

```text
/article-extractor/api/
```

For example:

```text
/article-extractor/api/...
```

Nginx rewrites this path to the backend's `/api/...` route.

---

## Proxy Configuration

Some websites may require a proxy to be accessed from the server.

The production PM2 configuration supports:

```text
PROXY_URL=http://127.0.0.1:7890
```

The proxy is configured through:

```text
deploy/ecosystem.config.cjs
```

Do not hard-code proxy settings directly into application logic. Production proxy configuration should be managed through the deployment environment.

---

## Production Deployment

The production deployment consists of three main components:

```text
Browser
   │
   ▼
Nginx :80
   │
   ├── /article-extractor/
   │       │
   │       ▼
   │   Static frontend
   │   /var/www/article-extractor
   │
   └── /article-extractor/api/
           │
           ▼
       Node.js / Express
       127.0.0.1:4001
```

The existing DeepRead application runs separately on port `3000`.

### Production paths

| Component             | Location                                           |
| --------------------- | -------------------------------------------------- |
| Source code           | `/home/ubuntu/article-extractor`                   |
| Frontend static files | `/var/www/article-extractor`                       |
| Backend               | `/home/ubuntu/article-extractor/backend/server.js` |
| PM2 application       | `article-extractor`                                |
| Backend port          | `4001`                                             |
| Public frontend       | `/article-extractor/`                              |
| Public API            | `/article-extractor/api/`                          |
| Nginx configuration   | `/etc/nginx/sites-available/deepread`              |

For complete deployment instructions, see:

**[DEPLOYMENT\_GUIDE.md](DEPLOYMENT_GUIDE.md)**

---

## PM2

The production backend is managed by PM2.

PM2 configuration:

```text
deploy/ecosystem.config.cjs
```

Start the application:

```bash
pm2 start deploy/ecosystem.config.cjs
```

Restart:

```bash
pm2 restart article-extractor
```

Check status:

```bash
pm2 status
```

View logs:

```bash
pm2 logs article-extractor
```

---

## Nginx

The production frontend and API are exposed through Nginx.

Main configuration:

```text
/etc/nginx/sites-available/deepread
```

The relevant routes are:

```text
/article-extractor/
```

for the frontend, and:

```text
/article-extractor/api/
```

for the backend API.

After changing the Nginx configuration:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

The favicon is served separately at:

```text
/article-extractor/favicon.ico
```

---

## Environment Variables

Local or production environment variables can be configured using `.env`.

Do not commit secrets or private credentials to Git.

A template can be maintained as:

```text
.env.example
```

Typical production configuration may include:

```env
NODE_ENV=production
PORT=4001
PROXY_URL=http://127.0.0.1:7890
```

The exact variables supported by the backend should be checked against `backend/server.js`.

---

## Troubleshooting

### Frontend does not load

Check the generated files:

```bash
ls -la /var/www/article-extractor/
```

Rebuild if necessary:

```bash
npm run build
```

Then copy the generated frontend files to the production static directory.

---

### API is unavailable

Check whether the PM2 process is running:

```bash
pm2 status
```

Check the logs:

```bash
pm2 logs article-extractor
```

Check whether port `4001` is listening:

```bash
ss -lntp | grep 4001
```

---

### Nginx configuration error

Run:

```bash
sudo nginx -t
```

Only reload Nginx after the configuration test succeeds:

```bash
sudo systemctl reload nginx
```

---

### Websites cannot be extracted

The target website may:

- block automated requests
- require JavaScript rendering
- require a proxy
- use anti-bot protection
- have an unsupported page structure

Check the backend logs first:

```bash
pm2 logs article-extractor
```

If a proxy is required, verify the configured `PROXY_URL`.

---

## Security

Do not expose the Node.js backend directly to the public internet unless necessary.

The recommended production architecture is:

```text
Internet
   │
   ▼
 Nginx
   │
   ▼
127.0.0.1:4001
```

Keep the following out of version control:

- `.env`
- API keys
- passwords
- private certificates
- SSH keys
- runtime data
- temporary debugging files

---

## Related Project

Article Extractor is used as an independent article extraction service and can also be integrated with **DeepRead**, an AI-assisted English reading application.

DeepRead:

[https://github.com/After2thougt/deep-read](https://github.com/After2thougt/deep-read)

---

## License

This project is currently maintained as a private/personal project.

License information will be added when the project is publicly licensed.

