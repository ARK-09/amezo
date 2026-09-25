import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Off in production (.env.production) now that the backend implements the whole
// read surface the app calls - search filters and sort, product detail, and the
// cart's GET /variants batch. Still available for local work against the fixture
// dataset without running Postgres: set VITE_USE_MSW=true in .env.local.
async function enableMocking() {
  if (import.meta.env.VITE_USE_MSW !== 'true') return
  const { worker } = await import('./test/msw/browser')
  // Never let a failed registration (Service Worker disabled, blocked, or
  // unsupported in this browser/context) block rendering entirely - fall
  // through to hitting the real API rather than a blank page.
  return worker.start({ onUnhandledRequest: 'bypass' }).catch((error) => {
    console.error('[MSW] Failed to start, falling back to the real API:', error)
  })
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
