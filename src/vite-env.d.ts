/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the toolboy backend Worker (backend/). Enables two things when set:
      - the net-relay CORS fallback for ctx.net (`<backend>/relay`), and
      - tool discovery across repos in the ⌘K palette (`<backend>/discover`).
      Unset → direct fetch only and no discovery; the app works fully otherwise. */
  readonly VITE_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
