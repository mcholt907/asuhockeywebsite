import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import * as Sentry from "@sentry/react";
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { NotificationProvider } from './context/NotificationContext';

const isProd = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  // Sample 10% of traces in production, 100% in dev
  tracesSampleRate: isProd ? 0.1 : 1.0,
  // Trace requests to localhost and relative /api paths
  tracePropagationTargets: ["localhost", /^\/api/],

  // Session Replay — error replays stay at 100% (highest signal/cost ratio)
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Environment (Development vs Production)
  environment: process.env.NODE_ENV,
});

const container = document.getElementById('root');
const app = (
  <React.StrictMode>
    <HelmetProvider>
      <NotificationProvider>
        <App />
      </NotificationProvider>
    </HelmetProvider>
  </React.StrictMode>
);

if (container.hasChildNodes()) {
  hydrateRoot(container, app);
} else {
  createRoot(container).render(app);
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals(console.log);
