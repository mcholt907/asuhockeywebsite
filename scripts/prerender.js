const { spawn } = require('child_process');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// We use an arbitrary port so we don't conflict with a running dev server
const PORT = 5055; 
process.env.PORT = PORT.toString();
// Prevent server from starting background schedulers or scraping during prerender
process.env.NODE_ENV = 'production'; 
process.env.IS_PRERENDER = 'true';

const baseUrl = `http://localhost:${PORT}`;
const routes = ['/', '/news', '/schedule', '/roster', '/stats', '/recruiting', '/alumni'];
const buildDir = path.join(__dirname, '..', 'build');

async function prerender() {
  console.log(`[Prerender] Starting express server on port ${PORT}...`);
  const server = spawn(process.execPath, ['server.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: PORT.toString(),
      NODE_ENV: 'production',
      IS_PRERENDER: 'true',
    },
  });
  
  let started = false;
  let serverOutput = '';

  const captureServerOutput = (chunk, stream) => {
    const text = chunk.toString();
    serverOutput += text;
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach(line => console.log(`[Prerender server:${stream}] ${line}`));
  };

  server.stdout.on('data', chunk => captureServerOutput(chunk, 'stdout'));
  server.stderr.on('data', chunk => captureServerOutput(chunk, 'stderr'));
  
  // Basic check to see if server threw an error or exited immediately
  server.on('exit', (code) => {
    if (!started) {
      console.error(`[Prerender] Server exited prematurely with code ${code}`);
      if (serverOutput.trim()) {
        console.error('[Prerender] Server output before exit:');
        console.error(serverOutput.trim());
      }
      process.exit(1);
    }
  });

  // Wait for the backend to start up
  await new Promise(resolve => setTimeout(resolve, 5000));
  started = true;
  
  console.log('[Prerender] Server started. Launching Puppeteer...');
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  for (const route of routes) {
    const page = await browser.newPage();
    console.log(`[Prerender] Rendering ${route}...`);
    
    try {
      // Intercept network requests if needed to block analytics, but keeping it simple for now.
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle0', timeout: 30000 });
      
      // Wait extra 2000ms to ensure all React effect data parsing and rendering finishes
      // Specifically looking for the .home-loading or .loading-message elements to disappear
      await page.evaluate(() => {
        return new Promise(resolve => {
          let attempts = 0;
          const checkReady = setInterval(() => {
            attempts++;
            const isLoading = document.querySelector('.home-loading, .loading-message, .page-container > p');
            // Give up waiting after 2.5 seconds (10 * 250ms)
            if (!isLoading || attempts > 10) {
              clearInterval(checkReady);
              // Small extra buffer
              setTimeout(resolve, 500);
            }
          }, 250);
        });
      });

      let html = await page.content();
      
      // Remove any injected scripts by Puppeteer if necessary
      // And importantly, remove the data-react-helmet tags if they cause duplicate attributes?
      // helmet handles this fine in hydrate mode.
      
      // Clean up the prerendering URL base and replace it with relative or absolute production domains if needed.
      // E.g., replace `http://localhost:5055` with `https://forksuppucks.com`
      html = html.replace(new RegExp(baseUrl, 'g'), 'https://forksuppucks.com');

      const filePath = route === '/' ? path.join(buildDir, 'index.html') : path.join(buildDir, route, 'index.html');
      const dirPath = path.dirname(filePath);
      
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      fs.writeFileSync(filePath, html);
      console.log(`[Prerender] ✅ Saved ${route} to ${filePath}`);
    } catch (e) {
      console.error(`[Prerender] ❌ Error rendering ${route}:`, e.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log('[Prerender] Done prerendering. Shutting down server...');
  server.kill();
  process.exit(0);
}

// Make sure server process is killed if script fails abruptly
process.on('SIGINT', () => process.exit(1));
process.on('SIGTERM', () => process.exit(1));

prerender().catch(err => {
  console.error('[Prerender] Fatal error:', err);
  process.exit(1);
});
