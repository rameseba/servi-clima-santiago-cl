import { query, mutation } from './_generated/server'
import { v } from 'convex/values'

/**
 * Busca un informe por su número.
 * Devuelve la URL del PDF si existe, o null si no se encuentra.
 *
 * Se llama desde el frontend de forma imperativa:
 *   const r = await convex.query(api.informes.getByNumero, { numero })
 */
export const getByNumero = query({
  args: { numero: v.string() },
  handler: async (ctx, { numero }) => {
    const informe = await ctx.db
      .query('informes')
      .withIndex('by_numero', (q) => q.eq('numero', numero.trim().toUpperCase()))
      .unique()

    if (!informe) return null

    return { urlPdf: informe.urlPdf, titulo: informe.titulo ?? null }
  },
})

/**
 * Inserta o actualiza un informe (idempotente por número).
 * Útil para sembrar datos de prueba y para alta de informes desde el panel.
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
      await ctx.db.patch(existente._id, { urlPdf, titulo })
      return existente._id
    }
    return await ctx.db.insert('informes', { numero: norm, urlPdf, titulo })
  },
})

/**
 * Siembra datos de prueba. Ejecutar una vez tras el primer deploy con:
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
