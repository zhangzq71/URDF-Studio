/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_TOKEN: string
  // k: string | boolean | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
