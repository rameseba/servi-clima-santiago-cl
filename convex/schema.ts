import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Esquema de la base de datos Convex para la verificación de informes UA.
export default defineSchema({
  informes: defineTable({
    numero: v.string(), // Ej: "INF-2024-001" (se almacena en mayúsculas)
    // El PDF puede venir de un archivo subido (storageId) o de una URL externa.
    storageId: v.optional(v.id('_storage')),
    urlPdf: v.optional(v.string()),
    titulo: v.optional(v.string()), // Título descriptivo opcional
  })
    // Índice para buscar un informe por su número de forma eficiente.
    .index('by_numero', ['numero']),

  // Sesiones del panel admin (login con contraseña única compartida).
  sessions: defineTable({
    token: v.string(),
    expiraEn: v.number(), // timestamp ms de expiración
  }).index('by_token', ['token']),

  // Configuración del panel (singleton por clave). Ej: formato por defecto.
  config: defineTable({
    clave: v.string(), // 'formatoDefault'
    valor: v.string(), // 'alfanumerico' | 'numerico'
  }).index('by_clave', ['clave']),
})
