import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './i18n';
import { NavigationProvider } from './app/useSceneNavigation';
import { ContentProvider } from './app/ContentProvider';
import { createBrowserRouter, replace, RouterProvider } from 'react-router';
import { pageRoutes } from './app/routes';
import { languagePath, pathLanguage, preferredLanguage } from './locale';
import './styles.css';
try { document.documentElement.classList.toggle('dark', localStorage.getItem('parrotbook-theme') === 'dark'); } catch { /* Light is the default when storage is unavailable. */ }
const router = createBrowserRouter([{
  loader: ({ request }) => {
    const url = new URL(request.url);
    return pathLanguage(url.pathname) ? null : replace(languagePath(url.pathname, preferredLanguage()) + url.search + url.hash);
  },
  hydrateFallbackElement: <p role="status">Parrotbook…</p>,
  element: <ContentProvider><NavigationProvider><LanguageProvider><App /></LanguageProvider></NavigationProvider></ContentProvider>,
  children: pageRoutes.map(route => ({ ...route, element: <></> })),
}]);
createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>);
