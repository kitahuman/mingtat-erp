// In-memory error collector. Keeps entries from the last 5 minutes only.
// Used by axios interceptors (api.ts) and global window error handlers (layout or provider).

export type ErrorType = 'js_error' | 'api_error' | 'unhandled_rejection';

export interface CollectedError {
  type: ErrorType;
  timestamp: string;
  message: string;
  url?: string;
  method?: string;
  status?: number;
  stack?: string;
  response?: any;
  request_body?: any;
}

const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ITEMS = 50;

let store: CollectedError[] = [];

function prune() {
  const cutoff = Date.now() - MAX_AGE_MS;
  store = store.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
  if (store.length > MAX_ITEMS) {
    store = store.slice(-MAX_ITEMS);
  }
}

export function recordError(entry: Omit<CollectedError, 'timestamp'> & { timestamp?: string }) {
  try {
    const withTs: CollectedError = { ...entry, timestamp: entry.timestamp || new Date().toISOString() };
    store.push(withTs);
    prune();
  } catch {
    // never let error collector throw
  }
}

export function getRecentErrors(): CollectedError[] {
  prune();
  return [...store];
}

export function clearRecentErrors() {
  store = [];
}

// Install global browser handlers (idempotent)
let installed = false;
export function installGlobalErrorHandlers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    recordError({
      type: 'js_error',
      message: String(event.message || event.error?.message || 'Uncaught error'),
      url: typeof window !== 'undefined' ? window.location.pathname : undefined,
      stack: event.error?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason: any = event.reason;
    recordError({
      type: 'unhandled_rejection',
      message: String(reason?.message || reason || 'Unhandled Promise rejection'),
      url: typeof window !== 'undefined' ? window.location.pathname : undefined,
      stack: reason?.stack,
    });
  });
}
