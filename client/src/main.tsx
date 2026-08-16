import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

//====================================================================================================
// Global data
//====================================================================================================
import { initTheme, destroyTheme } from './modules/data/theme/ThemeData.ts';
import { initPageElement, destroyPageElement } from './modules/data/pageElement/PageElementData.ts';
import { initSymbol, destroySymbol } from './modules/data/chartData/symbol/SymbolData.ts';
import { initStrategy, destroyStrategy } from './modules/data/chartData/strategy/StrategyData.ts';
import { initLinkData, destroyLinkData } from './modules/pageElements/charts/candleChart/state/sync/link/LinkData.ts';


let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;

  initTheme()
  initPageElement()
  initSymbol()
  initLinkData()
  initStrategy()
}
function destroy() {
  destroyTheme()
  destroyPageElement()
  destroySymbol()
  destroyLinkData()
  destroyStrategy()
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