import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

//====================================================================================================
// Global data
//====================================================================================================
import { initTheme, destroyTheme } from './modules/data/theme/ThemeData.ts';

let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;

  initTheme()
}

function destroy() {
  destroyTheme()
}

init()

// Cleanup when page is closed/reloaded
window.addEventListener('beforeunload', destroy)
window.addEventListener('pagehide', destroy)

const root = createRoot(document.getElementById('root')!)


//====================================================================================================
// RENDER
//====================================================================================================
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)