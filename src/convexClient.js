import { ConvexHttpClient } from 'convex/browser'

// URL del deployment de Convex (https://<deployment>.convex.cloud).
// Se inyecta en build vía variable de entorno VITE_CONVEX_URL (.env.local).
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL

// Cliente HTTP para consultas puntuales (no reactivas), ideal para una
// búsqueda disparada al enviar el formulario.
// Si aún no hay URL configurada, exportamos null y el frontend usa el
// fallback de simulación (ver src/App.jsx).
export const convex = CONVEX_URL ? new ConvexHttpClient(CONVEX_URL) : null
export const convexHabilitado = Boolean(CONVEX_URL)
