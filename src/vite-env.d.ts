/// <reference types="vite/client" />

declare module '*.mp3' {
  const src: string
  export default src
}

declare interface ImportMetaEnv {
  readonly VITE_PAIZA_BASE_URL?: string
  readonly VITE_JUDGE0_BASE_URL?: string
  readonly VITE_JUDGE0_C_ID?: string
  readonly VITE_JUDGE0_CSHARP_ID?: string
  readonly VITE_USE_JUDGE0_IN_DEV?: string
  readonly VITE_RUNNER_BACKEND_DEV?: 'paiza' | 'judge0'
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv
}
