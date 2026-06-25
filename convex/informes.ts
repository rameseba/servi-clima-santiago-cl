import { query, mutation } from './_generated/server'
import { v } from 'convex/values'

/**
 * Resuelve la URL pública del PDF de un informe, ya sea un archivo subido
 * (Convex File Storage) o una URL externa.
 */
async function resolverUrl(ctx, informe) {
  if (informe.urlPdf) return informe.urlPdf
  if (informe.storageId) return await ctx.storage.getUrl(informe.storageId)
  return null
}

/**
 * Busca un informe por su número (consulta PÚBLICA).
 * Devuelve la URL del PDF si existe, o null si no se encuentra.
 *
 * Se llama desde el frontend de forma imperativa:
 *   const r = await convex.query('informes:getByNumero', { numero })
 */
export const getByNumero = query({
  args: { numero: v.string() },
  handler: async (ctx, { numero }) => {
    const informe = await ctx.db
      .query('informes')
      .withIndex('by_numero', (q) => q.eq('numero', numero.trim().toUpperCase()))
      .unique()

    if (!informe) return null

    const urlPdf = await resolverUrl(ctx, informe)
    if (!urlPdf) return null

    return { urlPdf, titulo: informe.titulo ?? null }
  },
})

/**
 * Inserta o actualiza un informe por URL externa (idempotente por número).
 * Útil para alta por CLI: npx convex run informes:upsert '{...}'
 */
export const upsert = mutation({
  args: {
    numero: v.string(),
    urlPdf: v.string(),
    titulo: v.optional(v.string()),
  },
  handler: async (ctx, { numero, urlPdf, titulo }) => {
    const norm = numero.trim().toUpperCase()
    const existente = await ctx.db
      .query('informes')
      .withIndex('by_numero', (q) => q.eq('numero', norm))
      .unique()

    if (existente) {
      await ctx.db.patch(existente._id, { urlPdf, titulo, storageId: undefined })
      return existente._id
    }
    return await ctx.db.insert('informes', { numero: norm, urlPdf, titulo })
  },
})

/**
 * Siembra datos de prueba. Ejecutar una vez con:
 *   npx convex run informes:seed
 */
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const demo = [
      {
        numero: 'INF-2024-001',
        urlPdf:
          'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        titulo: 'Informe de prueba 2024-001',
      },
    ]

    for (const d of demo) {
      const existente = await ctx.db
        .query('informes')
        .withIndex('by_numero', (q) => q.eq('numero', d.numero))
        .unique()
      if (!existente) await ctx.db.insert('informes', d)
    }
    return { ok: true, insertados: demo.length }
  },
})
