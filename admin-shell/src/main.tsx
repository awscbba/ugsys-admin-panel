/**
 * main.tsx — Admin Shell entry point.
 *
 * 1. Calls enableSecureLogging() to override console methods in dev mode so
 *    that sensitive fields are automatically redacted before output (Req 13.7).
 * 2. Renders the App component into the #root DOM element.
 *
 * Requirements: 13.7
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { enableSecureLogging } from './utils/secureLogging';
import { App } from './App';

// Enable secure console logging before anything else runs.
enableSecureLogging();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    'Root element #root not found. Ensure index.html contains <div id="root"></div>.',
  );
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
