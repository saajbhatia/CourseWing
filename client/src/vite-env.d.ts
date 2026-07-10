/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_LOGGER: string;
  readonly VITE_LOGGER_FILTER: string;
  readonly VITE_LEARNLIGHT_CANVAS_SERVICE_URL: string;
  // Add other env variables here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
