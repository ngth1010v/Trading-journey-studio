import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

//====================================================================================================
// Global data
//====================================================================================================
import { initTheme, destroyTheme } from './modules/data/theme/ThemeData.ts';
import { initPage, destroyPage } from './modules/data/page/PageData.ts';

let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;

  initTheme()
  initPage()
}
function destroy() {
  destroyTheme()
  destroyPage()
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