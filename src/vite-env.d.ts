/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly REACT_APP_API_BASE_URL?: string;
  readonly REACT_APP_API_APP_ID?: string;
  /** Optional. Sent as `x-app-secret` when set — required only once this app's `require_secret` is on. */
  readonly REACT_APP_API_APP_SECRET?: string;
  readonly REACT_APP_ENV?: string;
  readonly REACT_APP_BUILD_DATE?: string;
  readonly REACT_APP_BUILD_SHA?: string;
  readonly REACT_APP_OTEL_ENVIRONMENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
