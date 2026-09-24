import { setupWorker } from 'msw/browser'

import { handlers } from './handlers'

// Same handlers as the Node server used by vitest (./server.ts) - one
// fixture dataset for both test and dev-server mocking, not two to drift
// apart.
export const worker = setupWorker(...handlers)
