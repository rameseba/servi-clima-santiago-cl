import { internalMutation } from './_generated/server'
import { v } from 'convex/values'
import { normalizarNumero } from './lib.js'

/**
 * Corrige el número de un certificado desde la línea de comandos, sin sesión
 * del panel:
 *
 *   npx convex run mantenimiento:renumerar '{"de":"776892","a":"77698-2"}'
 *
 * Es una internalMutation: NO es invocable desde el navegador, sólo por quien
 * tenga la deploy key. Conserva el archivo ya subido (mismo storageId), así
 * que no genera copias huérfanas en el storage.
 */
export const renumerar = internalMutation({
  args: { de: v.string(), a: v.string() },
  handler: async (ctx, { de, a }) => {
    const nuevo = a.trim().toUpperCase()
    if (!/^[A-Z0-9-]{3,40}$/.test(nuevo)) {
      throw new Error('Número inválido: sólo letras, números y guiones (3 a 40).')
    }

    const normDe = normalizarNumero(de)
    const todos = await ctx.db.query('informes').collect()
    const origen = todos.find((i) => normalizarNumero(i.numero) === normDe)
    if (!origen) throw new Error(`No existe ningún certificado ${de}.`)

    const normA = normalizarNumero(nuevo)
    const choque = todos.find(
      (i) => i._id !== origen._id && normalizarNumero(i.numero) === normA,
    )
    if (choque) throw new Error(`Ya existe otro certificado con el número ${nuevo}.`)

    await ctx.db.patch(origen._id, { numero: nuevo, numeroNorm: normA })
    return { antes: origen.numero, ahora: nuevo, storageId: origen.storageId ?? null }
  },
})

/**
 * Borra un certificado por su número, desde la línea de comandos:
 *
 *   npx convex run mantenimiento:borrarPorNumero '{"numero":"XXXX"}'
 *
 * internalMutation: no invocable desde el navegador. Borra también el archivo
 * en storage, si lo tiene, para no dejar huérfanos.
 */
export const borrarPorNumero = internalMutation({
  args: { numero: v.string() },
  handler: async (ctx, { numero }) => {
    const norm = normalizarNumero(numero)
    const todos = await ctx.db.query('informes').collect()
    const inf = todos.find((i) => normalizarNumero(i.numero) === norm)
    if (!inf) return { borrado: false, motivo: 'no existe' }

    if (inf.storageId) await ctx.storage.delete(inf.storageId)
    await ctx.db.delete(inf._id)
    return { borrado: true, numero: inf.numero }
  },
})
