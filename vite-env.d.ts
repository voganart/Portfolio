/// <reference types="vite/client" />

interface ImportMetaEnv {
  BASE_URL: string;
  readonly GEMINI_API_KEY?: string;
  // добавь здесь свои env-переменные, если есть
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
