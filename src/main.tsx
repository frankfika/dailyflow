import {
  StrictMode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import App from './App.tsx';
import './index.css';
import { createDailyFlowQueryClient, QUERY_CACHE_BUSTER } from './queryClient';

const queryClient = createDailyFlowQueryClient();

// Persist the whole query cache to localStorage so cold starts render from
// local state instead of showing spinners. The sidecar is local SQLite, so
// treating it like a slow remote (spinner on every load) is the wrong model.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'dailyflow-query-cache',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      // maxAge: a week-old snapshot is still better than a spinner; anything
      // older is dropped and refetched.
      persistOptions={{ persister, buster: QUERY_CACHE_BUSTER, maxAge: 7 * 24 * 60 * 60 * 1000 }}
    >
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
);
