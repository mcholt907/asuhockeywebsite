# Environment Variables Setup Guide

This guide explains how to configure environment variables for the ASU Hockey Website.

## Quick Start

1. **Copy the example file:**
   ```bash
   cp .env.example .env.development.local
   ```

2. **Edit `.env.development.local`** with your local settings (if needed)

3. **For production**, create `.env.production.local` with production values:
   ```bash
   REACT_APP_API_URL=/api
   PORT=5000
   ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
   NODE_ENV=production
   ```

## Environment Variables Reference

### Frontend Variables (React)

#### `REACT_APP_API_URL`
- **Description:** Base URL for API requests
- **Development:** `http://localhost:5000/api`
- **Production:** `/api` (relative path when served from same domain)
- **Required:** Yes

### Backend Variables (Express)

#### `PORT`
- **Description:** Port number for the Express server
- **Default:** `5000`
- **Example:** `5000`

#### `ALLOWED_ORIGINS`
- **Description:** Comma-separated list of allowed CORS origins
- **Development:** `http://localhost:3000,http://localhost:3001`
- **Production:** Your actual domain(s), e.g., `https://asuhockey.com`
- **Security:** ⚠️ Never use `*` in production!

#### `RATE_LIMIT_WINDOW_MS`
- **Description:** Time window for rate limiting in milliseconds
- **Default:** `900000` (15 minutes)
- **Example:** `900000`

#### `RATE_LIMIT_MAX`
- **Description:** Maximum number of requests per IP per window
- **Default:** `100`
- **Example:** `100`

#### `CACHE_DURATION_MS`
- **Description:** Cache duration for scraped data in milliseconds
- **Default:** `180000` (3 minutes)
- **Example:** `180000`

#### `NODE_ENV`
- **Description:** Node.js environment
- **Options:** `development`, `production`, `test`
- **Default:** `development`

## File Locations

- `.env.development.local` - Local development (gitignored)
- `.env.production.local` - Production build (gitignored)
- `.env.example` - Template file (committed to git)

## Important Notes

1. **Never commit `.env.local` files** - They contain sensitive configuration
2. **Always use `.env.example`** as a template
3. **In production**, ensure `ALLOWED_ORIGINS` only includes your actual domains
4. **React environment variables** must start with `REACT_APP_` to be accessible in the browser

## Troubleshooting

### API requests failing in production
- Check that `REACT_APP_API_URL` is set correctly
- Ensure the backend server is running and accessible
- Verify CORS settings match your frontend domain

### CORS errors
- Verify `ALLOWED_ORIGINS` includes your frontend URL
- Check that the origin header is being sent correctly
- Ensure no trailing slashes in the origin URLs

### Rate limiting too strict
- Adjust `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` as needed
- Monitor your server logs for rate limit messages

