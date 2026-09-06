/// <reference types="vite/client" />
import type { CutApi } from '../../preload/index'

declare global {
  interface Window {
    cut: CutApi
  }
}

export {}
