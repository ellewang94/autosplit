# AutoSplit — Cloud Deployment Guide

This guide takes you from "runs on my laptop" to "runs in the cloud, shareable with anyone" in about 30-45 minutes. You'll create 3 free accounts, paste a few credentials, and push to GitHub. That's it.

---

## What We're Deploying

| Part | Service | What it does | Cost |
|------|---------|--------------|------|
| Database | **Supabase** | Stores all your groups, transactions, and settlements | Free tier |
| Backend (Python API) | **Railway** | Runs the FastAPI server 24/7 | Free tier ($5/mo credit) |
| Frontend (React app) | **Vercel** | Serves the website to users | Free forever |

---

## Step 0 — Make sure your code is saved to GitHub

First, let's commit all the recent changes and push them up.

Open a terminal in the `autosplit/` folder and run:

```bash
git add -A
git commit -m "Add cloud deployment config, tests, and edit functionality"
git push
```

If it asks for your GitHub password, use a Personal Access Token (GitHub → Settings → Developer Settings → Personal access tokens → Generate new token).

---

## Step 1 — Set Up Supabase (the database)

Supabase is like Google Sheets but for databases — it gives you a real PostgreSQL database with a nice dashboard to see your data.

### 1a. Create your account

1. Go to **supabase.com**
2. Click "Start your project" → Sign up with GitHub (easiest)
3. Verify your email if prompted

### 1b. Create a new project

1. Click **"New project"**
2. Fill in:
   - **Name**: `autosplit`
   - **Database Password**: Create a strong password and **save it somewhere** (you'll need it in a moment)
   - **Region**: Choose the one closest to you (e.g., "East US" if you're in NYC)
3. Click **"Create new project"**
4. Wait ~2 minutes for it to set up (it shows a loading spinner)

### 1c. Get your connection string

1. Once the project is ready, click **"Project Settings"** (gear icon in left sidebar)
2. Click **"Database"**
3. Scroll down to **"Connection string"**
4. Click the **"URI"** tab
5. Click **"Transaction"** pooler (NOT direct connection — this handles traffic spikes better)
6. Copy the connection string. It looks like:
   ```
   postgresql://postgres.[something]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
7. Replace `[YOUR-PASSWORD]` with the password you created in step 1b

**Save this connection string** — you'll paste it into Railway in the next step.

### 1d. Create the tables

Your backend auto-creates tables on startup, so you don't need to run any SQL yourself. But we DO need to tell it which database to use — that's the connection string from above.

---

## Step 2 — Deploy the Backend on Railway

Railway is like Heroku but modern and generous with its free tier. It reads your Dockerfile and runs your Python server in the cloud.

### 2a. Create your account

1. Go to **railway.app**
2. Click "Start a New Project" → "Login with GitHub"
3. Authorize Railway to access your GitHub repos

### 2b. Create a new project from GitHub

1. Click **"New Project"**
2. Click **"Deploy from GitHub repo"**
3. Select your `autosplit` repository
4. Railway will detect the Dockerfile automatically — click **"Deploy Now"**

> Note: Railway deploys from the **root** of your repo. It will find `backend/Dockerfile`. If it doesn't find it automatically, you can set the root directory to `backend/` in the settings.

### 2c. Set the root directory

If Railway doesn't automatically find the Dockerfile:
1. Click on your service → **"Settings"**
2. Under **"Source"**, set **"Root Directory"** to `backend`
3. Click **"Redeploy"**

### 2d. Add environment variables

This is the critical step — it connects your backend to the Supabase database.

1. In your Railway project, click on your service
2. Click the **"Variables"** tab
3. Click **"Raw Editor"** and paste:

```
DATABASE_URL=postgresql://postgres.[something]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
FRONTEND_URL=https://YOUR_VERCEL_URL.vercel.app
```

(Replace the DATABASE_URL with your actual Supabase connection string from Step 1c. You'll fill in FRONTEND_URL after Step 3.)

4. Click **"Save"** — Railway will automatically redeploy

### 2e. Get your backend URL

1. Once deployed, click on your service
2. Click **"Settings"** → **"Networking"** → **"Generate Domain"**
3. You'll get a URL like `autosplit-backend.up.railway.app`
4. **Save this URL** — you'll need it in Step 3

### 2f. Verify it works

Visit `https://your-railway-url.up.railway.app/api/groups` in your browser. You should see `[]` (an empty list) — that's the database working correctly.

---

## Step 3 — Deploy the Frontend on Vercel

Vercel is the best place to host React apps. It deploys from GitHub automatically every time you push.

### 3a. Create your account

1. Go to **vercel.com**
2. Click "Start Deploying" → "Continue with GitHub"
3. Authorize Vercel

### 3b. Import your project

1. Click **"Add New Project"**
2. Find your `autosplit` repository and click **"Import"**
3. Set **"Root Directory"** to `frontend`
4. Framework preset should auto-detect as **"Vite"** — leave it

### 3c. Configure the API proxy

Before deploying, we need to tell Vercel where your backend is. Open `frontend/vercel.json` and replace `YOUR_RAILWAY_BACKEND_URL` with your actual Railway URL:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://autosplit-backend.up.railway.app/api/$1"
    },
    {
      "source": "/((?!api).*)",
      "destination": "/index.html"
    }
  ]
}
```

Save the file, commit and push to GitHub:
```bash
git add frontend/vercel.json
git commit -m "Configure Vercel proxy to point at Railway backend"
git push
```

### 3d. Deploy

1. Back in Vercel, click **"Deploy"**
2. Wait ~2 minutes for it to build and deploy
3. You'll get a URL like `autosplit.vercel.app`

### 3e. Update Railway with your Vercel URL

Now go back to Railway and update the `FRONTEND_URL` variable:

1. Railway → your service → Variables
2. Change `FRONTEND_URL` to `https://your-actual-url.vercel.app`
3. Save → Railway will redeploy (takes ~1 minute)

---

## Step 4 — Test everything end-to-end

1. Open your Vercel URL in a browser
2. Create a new group
3. Add members
4. Add a manual expense
5. Check the settlement page

If it works → you're live! 🎉

If something's broken:
- **Backend errors**: Railway → your service → **"Deployments"** → click the latest → **"View Logs"**
- **Frontend errors**: Open browser DevTools → Console tab — look for red error messages
- **CORS errors** (most common): Make sure `FRONTEND_URL` in Railway exactly matches your Vercel URL (no trailing slash, https not http)

---

## Future Deployments (after first setup)

Every time you push to GitHub:
- **Vercel** automatically rebuilds and deploys the frontend (takes ~2 minutes)
- **Railway** automatically rebuilds and deploys the backend (takes ~3 minutes)

You don't need to do anything manually. Push, wait, it's live.

---

## After Cloud is Working — Add Authentication (Optional)

Right now anyone with your URL can see all groups. That's fine for private testing, but for sharing with friends you'll want to add login.

The simplest path: **Supabase Auth** (already included in your Supabase project).
- Supports email/password signup, Google login, Apple login
- We'll add this as a separate feature when you're ready

---

## Costs

| Service | Free Tier | When you'd pay |
|---------|-----------|----------------|
| Supabase | 500MB storage, 2 projects | When your DB exceeds 500MB |
| Railway | $5/month credit (covers low-traffic apps) | If you exceed the credit |
| Vercel | Unlimited personal projects | Never (for a side project) |

For AutoSplit at MVP scale, you'll likely stay on free tiers indefinitely.

---

## Troubleshooting Quick Reference

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| "CORS error" in browser console | FRONTEND_URL not set or wrong | Update FRONTEND_URL in Railway vars |
| Backend returns 500 error | DATABASE_URL wrong or DB not reachable | Check Railway logs, verify connection string |
| App loads but data doesn't save | Backend is connected to wrong DB | Check DATABASE_URL in Railway vars |
| Vercel deploy fails | Build error in frontend code | Check Vercel build logs for the specific error |
| "relation does not exist" in Railway logs | Tables not created | Backend should auto-create on startup; check logs |
