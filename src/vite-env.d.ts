/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the toolboy backend Worker (backend/). Enables two things when set:
      - the net-relay CORS fallback for ctx.net (`<backend>/relay`), and
      - tool discovery across repos in the ⌘K palette (`<backend>/discover`).
      Unset → direct fetch only and no discovery; the app works fully otherwise. */
  readonly VITE_BACKEND_URL?: string;

  /** Optional bearer token sent with /publish when the backend's PUBLISH_TOKEN is set.
      Inlined into the bundle (readable by anyone who loads the app), so prefer
      operator-driven publishing over shipping this for a public deployment. */
  readonly VITE_PUBLISH_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
