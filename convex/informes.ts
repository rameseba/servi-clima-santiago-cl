import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { normalizarNumero } from './lib.js'

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
 * Busca un informe aceptando el número tal como está impreso en el documento.
 *
 * Primero intenta la coincidencia exacta (mayúsculas) y, si no la hay, busca
 * por el número normalizado (sin guiones, espacios ni puntos). Así "77689-2"
 * encuentra el certificado guardado como "776892" y viceversa.
 *
 * El recorrido final sólo se usa para los registros antiguos que todavía no
 * tienen `numeroNorm`; una vez ejecutado informes:backfillNumeroNorm deja de
 * hacer falta.
 */
async function buscarPorNumero(ctx, numero) {
  const exacto = String(numero ?? '').trim().toUpperCase()
  if (exacto) {
    const porNumero = await ctx.db
      .query('informes')
      .withIndex('by_numero', (q) => q.eq('numero', exacto))
      .unique()
    if (porNumero) return porNumero
  }

  const norm = normalizarNumero(numero)
  if (!norm) return null

  const porNorm = await ctx.db
    .query('informes')
    .withIndex('by_numeroNorm', (q) => q.eq('numeroNorm', norm))
    .unique()
  if (porNorm) return porNorm

  const antiguos = await ctx.db
    .query('informes')
    .withIndex('by_numeroNorm', (q) => q.eq('numeroNorm', undefined))
    .collect()
  return antiguos.find((i) => normalizarNumero(i.numero) === norm) ?? null
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
    const informe = await buscarPorNumero(ctx, numero)

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
    const existente = await buscarPorNumero(ctx, norm)

    if (existente) {
      await ctx.db.patch(existente._id, { urlPdf, titulo, storageId: undefined })
      return existente._id
    }
    return await ctx.db.insert('informes', {
      numero: norm,
      numeroNorm: normalizarNumero(norm),
      urlPdf,
      titulo,
    })
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

/**
 * Rellena `numeroNorm` en los certificados creados antes de que existiera el
 * campo. Es idempotente: ejecutar de nuevo no cambia nada.
 *
 *   npx convex run informes:backfillNumeroNorm
 */
export const backfillNumeroNorm = mutation({
  args: {},
  handler: async (ctx) => {
    const todos = await ctx.db.query('informes').collect()
    let actualizados = 0
    for (const i of todos) {
      const norm = normalizarNumero(i.numero)
      if (i.numeroNorm !== norm) {
        await ctx.db.patch(i._id, { numeroNorm: norm })
        actualizados++
      }
    }
    return { total: todos.length, actualizados }
  },
})
