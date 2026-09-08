import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installCutApi } from './lib/cut'
import './styles.css'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="welcome">
          <h1>界面出错</h1>
          <p>{this.state.error}</p>
          <button className="btn primary" onClick={() => this.setState({ error: null })}>
            继续
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

void installCutApi()
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
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
