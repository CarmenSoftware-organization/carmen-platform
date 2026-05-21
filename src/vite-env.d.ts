/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly REACT_APP_API_BASE_URL?: string;
  readonly REACT_APP_API_APP_ID?: string;
  readonly REACT_APP_ENV?: string;
  readonly REACT_APP_BUILD_DATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
