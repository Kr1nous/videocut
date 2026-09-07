import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installCutApi } from './lib/cut'
import './styles.css'

void installCutApi()
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  })
  .catch((e) => {
    const msg = e instanceof Error ? e.message : String(e)
    document.body.innerHTML = `<div style="font-family:-apple-system,sans-serif;padding:48px;max-width:520px">
      <h1 style="font-size:18px">剪辑台启动失败</h1>
      <p style="color:#6e6e73">${msg}</p>
      <p style="color:#6e6e73">请确认本机有 Node，并重新打开应用。</p>
    </div>`
  })
