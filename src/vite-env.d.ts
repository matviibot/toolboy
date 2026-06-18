/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend net-relay Worker URL (backend/). Unset → direct fetch only; a CORS
      failure surfaces to the tool instead of falling back to the relay. */
  readonly VITE_NET_RELAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
