import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// The backend currently only implements GET /products?q= (no
// category/price/stock/sort, no seed data) - see openapi/fixture.yaml's own
// note on this. VITE_USE_MSW lets the dev server run against the full
// fixture dataset in the meantime; flip it off in .env once the backend
// catches up, same swap point fixture.yaml already anticipates for gen:api.
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
