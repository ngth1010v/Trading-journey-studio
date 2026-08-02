import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

//====================================================================================================
// Global data
//====================================================================================================
import { initTheme, destroyTheme } from './modules/data/theme/ThemeData.ts';
import { initPage, destroyPage } from './modules/data/page/PageData.ts';
import { initSymbol, destroySymbol } from './modules/data/chartData/symbol/SymbolData.ts';

let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;

  initTheme()
  initPage()
  initSymbol()
}
function destroy() {
  destroyTheme()
  destroyPage()
  destroySymbol()
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
  // <App />
  <StrictMode>
    <App />
  </StrictMode>,
)