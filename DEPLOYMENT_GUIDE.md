# 🚀 Deployment Guide - ASU Hockey Website

Complete guide to deploying your site to production using Render.

## Prerequisites

- [x] GitHub account with your repo pushed
- [x] [Render account](https://render.com) (free tier works)
- [ ] (Optional) Custom domain purchased

---

## Step 1: Push Latest Changes to GitHub

```bash
# Stage all files
git add .

# Commit with descriptive message
git commit -m "Add Alumni page, mobile optimizations, and production config"

# Push to GitHub
git push origin main
```

---

## Step 2: Deploy to Render

### Option A: Blueprint Deployment (Recommended)

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New"** → **"Blueprint"**
3. Connect your GitHub repo
4. Render will detect `render.yaml` and auto-configure
5. Click **"Apply"**

### Option B: Manual Setup

1. Click **"New"** → **"Web Service"**
2. Connect your GitHub repo
3. Configure:
   - **Name:** `asuhockey`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node server.js`
4. Add environment variables (see below)
5. Click **"Create Web Service"**

---

## Step 3: Set Environment Variables

In Render dashboard → Your service → **Environment**:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `5000` |
| `CORS_ORIGINS` | `https://asuhockey.onrender.com` (use your actual URL) |

---

## Step 4: Verify Deployment

1. Wait for build to complete (5-10 minutes first time)
2. Visit your URL: `https://asuhockey.onrender.com`
3. Test all pages load correctly
4. Check API: `https://asuhockey.onrender.com/api/news`

---

## Step 5: Configure Custom Domain (forksuppucks.com)

### In Render Dashboard

1. Go to your service → **Settings** → **Custom Domains**
2. Click **"Add Custom Domain"**
3. Enter: `forksuppucks.com` and `www.forksuppucks.com`
4. Render will show you a target hostname (like `asuhockey.onrender.com`)

### In Squarespace DNS

1. Log into [Squarespace Domains](https://account.squarespace.com/domains)
2. Click **forksuppucks.com** → **DNS Settings**
3. Add these records:

**For root domain (forksuppucks.com):**

```
Type: A
Host: @
Data: 216.24.57.1  (Render's IP - they may provide a different one)
```

**For www subdomain:**

```
Type: CNAME
Host: www
Data: asuhockey.onrender.com  (your Render URL)
```

1. **Update `CORS_ORIGINS`** in Render environment variables:

   ```
   CORS_ORIGINS=https://forksuppucks.com,https://www.forksuppucks.com
   ```

2. Wait 10-60 minutes for DNS propagation

### Verify SSL

Render automatically provisions HTTPS certificates. After DNS propagates, visit:

- <https://forksuppucks.com>
- <https://www.forksuppucks.com>

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check build logs, ensure `npm run build` works locally |
| API returns 404 | Check server.js is serving the build folder |
| CORS errors | Update `CORS_ORIGINS` env var with your domain |
| Blank page | Check browser console, may need to clear cache |

---

## Free Tier Limitations

Render free tier:

- Service spins down after 15 mins of inactivity
- First request after sleep takes ~30 seconds
- Upgrade to paid ($7/mo) for always-on

---

## Post-Deployment Checklist

- [ ] Site loads at production URL
- [ ] All pages render correctly
- [ ] Schedule, Roster, Stats data loads
- [ ] News articles appear
- [ ] Alumni page works
- [ ] Mobile responsiveness verified
- [ ] Custom domain configured (if applicable)
