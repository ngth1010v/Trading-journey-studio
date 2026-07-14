import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeDataProvider } from './modules/theme/ThemeDataProvider.tsx'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeDataProvider>
      <App/>
    </ThemeDataProvider>
  </StrictMode>,
)
