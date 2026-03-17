# Deployment Guide

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/): `npm install -g wrangler`
- A Cloudflare account: `wrangler login`
- A [Resend](https://resend.com) account (free tier: 100 emails/day) for password reset emails

---

## 1. Deploy the Worker (API)

```bash
cd writing-tracker/worker
npm install
```

### Create the D1 database

```bash
wrangler d1 create writing-tracker
```

Copy the `database_id` from the output and paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "writing-tracker"
database_id = "YOUR_DATABASE_ID_HERE"
```

### Update wrangler.toml variables

Edit `wrangler.toml` and set:
- `APP_URL` — your Pages URL (you'll get this after step 2, or use a custom domain)
- `FROM_EMAIL` — the email address you want to send from (must be a verified domain in Resend)

### Set secrets

```bash
wrangler secret put RESEND_API_KEY
# Paste your Resend API key when prompted
```

### Initialize the database schema

```bash
npm run db:init          # local dev
npm run db:init:remote   # production
```

### Deploy the worker

```bash
npm run deploy
```

Note the worker URL (e.g. `https://writing-tracker-api.YOUR-ACCOUNT.workers.dev`).

---

## 2. Deploy the Frontend (Pages)

```bash
cd writing-tracker/frontend
npm install
```

Create a `.env.production` file:

```
VITE_API_URL=https://writing-tracker-api.YOUR-ACCOUNT.workers.dev
```

Build and deploy:

```bash
npm run deploy
```

Or deploy manually via the Cloudflare dashboard by connecting your GitHub repo.

Note your Pages URL (e.g. `https://writing-tracker.pages.dev`).

Go back and update the worker's `APP_URL` in `wrangler.toml` to this URL, then redeploy the worker.

---

## 3. Configure the Obsidian Plugin

Build the plugin from the repo root:

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault's `.obsidian/plugins/writing-tracker/` folder, then enable it in Obsidian settings.

In the plugin settings:
- **Server URL**: your worker URL (e.g. `https://writing-tracker-api.YOUR-ACCOUNT.workers.dev`)
- **API Key**: create one in the web app under Settings → API Keys
- **Projects**: map folder names to project names, one per line:
  ```
  Novel: My Novel
  Blog Posts: Blog
  ```
- **Ignored Paths**: paths to exclude (prefix-matched):
  ```
  Templates
  Daily Notes/private
  ```

---

## Local Development

### Worker

```bash
cd writing-tracker/worker
wrangler dev
```

### Frontend

```bash
cd writing-tracker/frontend
echo "VITE_API_URL=http://localhost:8787" > .env.local
npm run dev
```

---

## Email (Resend) Setup

1. Sign up at [resend.com](https://resend.com)
2. Add and verify your domain (or use the sandbox for testing)
3. Create an API key
4. Set it as a Wrangler secret: `wrangler secret put RESEND_API_KEY`
5. Set `FROM_EMAIL` in `wrangler.toml` to an address on your verified domain

> For testing without a domain, Resend lets you send from `onboarding@resend.dev` to your own email only.
