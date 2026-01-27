# Development Setup Guide

## Starting the Application

This application requires **two servers** to run:

1. **Backend Server (Express)** - Port 5000
2. **Frontend Server (React)** - Port 3000

## Quick Start

### Option 1: Two Terminal Windows (Recommended)

**Terminal 1 - Backend:**
```bash
node server.js
```

**Terminal 2 - Frontend:**
```bash
npm start
```

### Option 2: Using npm-run-all (if installed)

You can run both servers simultaneously with a package like `npm-run-all`:

```bash
npm install --save-dev npm-run-all
```

Then add to `package.json`:
```json
"scripts": {
  "dev": "npm-run-all --parallel start:server start:client",
  "start:server": "node server.js",
  "start:client": "react-scripts start"
}
```

Run with:
```bash
npm run dev
```

## Troubleshooting

### Proxy Errors (ECONNREFUSED)

If you see errors like:
```
Proxy error: Could not proxy request /api/news from localhost:3000 to http://localhost:5000/
```

**Solution:** Make sure the backend server is running on port 5000:
```bash
node server.js
```

You should see:
```
Server running on http://localhost:5000
News API will be available at http://localhost:5000/api/news
...
```

### Port Already in Use

If port 5000 is already in use:
1. Change the port in `.env.development.local`:
   ```
   PORT=5001
   ```
2. Update `package.json` proxy:
   ```json
   "proxy": "http://localhost:5001"
   ```
3. Update `REACT_APP_API_URL` in `.env.development.local`:
   ```
   REACT_APP_API_URL=http://localhost:5001/api
   ```

### CORS Errors

If you see CORS errors, make sure:
1. Backend server is running
2. `ALLOWED_ORIGINS` in your environment includes `http://localhost:3000`
3. Default configuration already includes localhost:3000

## Environment Variables

Make sure you have a `.env.development.local` file (or copy from `.env.example`):

```env
REACT_APP_API_URL=http://localhost:5000/api
PORT=5000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
NODE_ENV=development
```

## Verification

Once both servers are running:

1. **Backend:** Visit http://localhost:5000 - Should see "ASU Hockey Fan Site Backend"
2. **Frontend:** Visit http://localhost:3000 - Should see the React app
3. **API Test:** Visit http://localhost:5000/api/news - Should return JSON data

## Common Issues

### Backend won't start
- Check if port 5000 is available
- Verify Node.js version (should be 14+)
- Check for syntax errors in `server.js`

### Frontend won't connect to backend
- Verify backend is running
- Check `REACT_APP_API_URL` in environment variables
- Verify proxy settings in `package.json`

### API requests return 429 (Too Many Requests)
- This is rate limiting working correctly
- Adjust `RATE_LIMIT_MAX` in environment variables if needed for development

