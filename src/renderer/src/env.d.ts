/// <reference types="vite/client" />
import type { CutApi } from './lib/cut'

declare global {
  interface Window {
    cut: CutApi
  }
}

export {}
