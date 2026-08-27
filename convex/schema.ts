import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Esquema de la base de datos Convex para la verificación de informes UA.
export default defineSchema({
  informes: defineTable({
    numero: v.string(), // Ej: "INF-2024-001" (se almacena en mayúsculas)
    // Mismo número sin guiones/espacios/puntos: es la clave con la que se
    // busca, para que "77689-2" y "776892" encuentren el mismo certificado.
    // Opcional porque los registros antiguos aún no lo tienen (ver
    // informes:backfillNumeroNorm).
    numeroNorm: v.optional(v.string()),
    // El PDF puede venir de un archivo subido (storageId) o de una URL externa.
    storageId: v.optional(v.id('_storage')),
    urlPdf: v.optional(v.string()),
    titulo: v.optional(v.string()), // Título descriptivo opcional
  })
    // Índice para buscar un informe por su número de forma eficiente.
    .index('by_numero', ['numero'])
    .index('by_numeroNorm', ['numeroNorm']),

  // Sesiones del panel admin (login con contraseña única compartida).
  sessions: defineTable({
    token: v.string(),
    expiraEn: v.number(), // timestamp ms de expiración
  }).index('by_token', ['token']),

  // Intentos fallidos de login, para frenar la fuerza bruta contra la
  // contraseña del panel (que es única y compartida).
  intentosLogin: defineTable({
    clave: v.string(), // usuario contra el que se intenta entrar
    fallos: v.number(),
    bloqueadoHasta: v.number(), // timestamp ms; 0 = sin bloqueo
  }).index('by_clave', ['clave']),

  // Configuración del panel (singleton por clave). Ej: formato por defecto.
  config: defineTable({
    clave: v.string(), // 'formatoDefault'
    valor: v.string(), // 'alfanumerico' | 'numerico'
  }).index('by_clave', ['clave']),
})
