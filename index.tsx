
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import '@mrburdeveloperteam/pet-function/styles.css';
import App from './App';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {captureWorkspaceFromUrl,} from './services/workspaceContext';



const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}
const queryClient = new QueryClient();

captureWorkspaceFromUrl();

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
    <App />
    </QueryClientProvider>
  </React.StrictMode>
);
