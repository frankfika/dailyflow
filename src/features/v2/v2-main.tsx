/**
 * v2 standalone entry — mount V2Shell as a separate page.
 *
 * This is the "AI-Native" mode of DailyFlow. The user can access it via
 * the existing app (Settings → Switch to AI-Native) or as a separate URL
 * during the transition period.
 *
 * For local dev: the existing vite.config.ts can be extended to serve
 * this page at /v2.html. For now it lives as a buildable artifact.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { V2Shell } from './V2Shell';
import '../index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <V2Shell />
    </QueryClientProvider>
  </React.StrictMode>
);
