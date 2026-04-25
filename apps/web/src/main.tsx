import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './i18n';
import './index.css';
import { initFingerprint } from './lib/fingerprint';
import { initSentry } from './lib/sentry';
import { initCsrf } from './lib/csrf';

// 异步初始化，不阻塞首屏
void initSentry();
void initFingerprint().then((fp) => {
  if (fp) (window as any).__appFingerprint = fp;
});
void initCsrf();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
