// GitHub Actions genera firebase-config.runtime.js durante la publicación.
// Así, la configuración concreta no forma parte del árbol fuente del repositorio.
export const firebaseConfig = window.__FIREBASE_CONFIG__ ?? null;
