import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './i18n';
import './styles.css';
try { document.documentElement.classList.toggle('dark', localStorage.getItem('parrotbook-theme') === 'dark'); } catch { /* Light is the default when storage is unavailable. */ }
createRoot(document.getElementById('root')!).render(<React.StrictMode><LanguageProvider><App /></LanguageProvider></React.StrictMode>);
