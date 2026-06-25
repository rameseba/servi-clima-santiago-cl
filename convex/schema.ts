import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Esquema de la base de datos Convex para la verificación de informes UA.
export default defineSchema({
  informes: defineTable({
    numero: v.string(), // Ej: "INF-2024-001" (se almacena en mayúsculas)
    urlPdf: v.string(), // URL del PDF del informe
    titulo: v.optional(v.string()), // Título descriptivo opcional
  })
    // Índice para buscar un informe por su número de forma eficiente.
    .index('by_numero', ['numero']),
})
