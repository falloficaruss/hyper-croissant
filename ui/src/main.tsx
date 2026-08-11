import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { setupGlobalErrorCapture } from './lib/globalError'
import { useAppStore } from './stores/appStore'

setupGlobalErrorCapture();
useAppStore.getState().checkBackend();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
