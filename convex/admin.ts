import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

const SESION_MS = 1000 * 60 * 60 * 8 // 8 horas

// Bytes aleatorios criptográficamente seguros -> string hex.
function randHex(nBytes) {
  const b = new Uint8Array(nBytes)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

// Genera un token de sesión aleatorio (256 bits).
function nuevoToken() {
  return randHex(32)
}

/**
 * Genera un número de informe SEGURO y NO ADIVINABLE.
 * Formato: INF-<año>-<12 chars base32>.
 * Se usa aleatoriedad criptográfica (crypto.getRandomValues), por lo que el
 * espacio de búsqueda es ~32^12 (≈60 bits). El número actúa como clave de
 * acceso secreta al informe; la seguridad depende de la entropía, no de
 * ocultar este algoritmo. SE EJECUTA SOLO EN EL SERVIDOR.
 */
function generarNumeroSeguro() {
  // Alfabeto Crockford base32: sin I, L, O, U para evitar ambigüedad visual.
  const alfabeto = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const byte of bytes) s += alfabeto[byte % 32]
  const anio = new Date().getFullYear()
  return `INF-${anio}-${s}`
}

// Valida un token de sesión; lanza si no es válido o expiró.
async function requireSesion(ctx, token) {
  const s = await ctx.db
    .query('sessions')
    .withIndex('by_token', (q) => q.eq('token', token))
    .unique()
  if (!s || s.expiraEn < Date.now()) {
    throw new Error('No autorizado. Inicia sesión nuevamente.')
  }
}

/**
 * Login con contraseña única compartida.
 * Las credenciales se leen de variables de entorno de Convex (secretos):
 *   ADMIN_USER, ADMIN_PASSWORD
 * Devuelve un token de sesión que el frontend guarda en localStorage.
 */
export const login = mutation({
  args: { usuario: v.string(), password: v.string() },
  handler: async (ctx, { usuario, password }) => {
    const U = process.env.ADMIN_USER
    const P = process.env.ADMIN_PASSWORD
    if (!U || !P) {
      throw new Error('Panel admin no configurado (faltan ADMIN_USER/ADMIN_PASSWORD).')
    }
    if (usuario !== U || password !== P) {
      return { ok: false }
    }
    const token = nuevoToken()
    await ctx.db.insert('sessions', { token, expiraEn: Date.now() + SESION_MS })
    return { ok: true, token }
  },
})

/** Cierra la sesión actual. */
export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const s = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', token))
      .unique()
    if (s) await ctx.db.delete(s._id)
  },
})

/** Verifica si un token de sesión sigue siendo válido (para restaurar UI). */
export const sesionValida = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const s = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', token))
      .unique()
    return Boolean(s && s.expiraEn >= Date.now())
  },
})

/** Genera una URL temporal para subir un archivo a Convex File Storage. */
export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireSesion(ctx, token)
    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * Crea un informe asociándole un PDF subido (storageId).
 * El número de informe se GENERA AUTOMÁTICAMENTE en el servidor de forma
 * segura (ver generarNumeroSeguro). El cliente NO lo elige ni lo conoce de
 * antemano. Se devuelve el número generado para que el admin lo comparta.
 */
export const crearInforme = mutation({
  args: {
    token: v.string(),
    storageId: v.id('_storage'),
    titulo: v.optional(v.string()),
  },
  handler: async (ctx, { token, storageId, titulo }) => {
    await requireSesion(ctx, token)

    // Genera un número único (reintenta ante una colisión, muy improbable).
    let numero = null
    for (let i = 0; i < 6; i++) {
      const candidato = generarNumeroSeguro()
      const choque = await ctx.db
        .query('informes')
        .withIndex('by_numero', (q) => q.eq('numero', candidato))
        .unique()
      if (!choque) {
        numero = candidato
        break
      }
    }
    if (!numero) {
      throw new Error('No se pudo generar un número único. Inténtalo de nuevo.')
    }

    const id = await ctx.db.insert('informes', { numero, storageId, titulo })
    return { id, numero }
  },
})

/** Lista todos los informes (para el panel), con su URL para ver/descargar. */
export const listInformes = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireSesion(ctx, token)
    const items = await ctx.db.query('informes').order('desc').collect()
    return Promise.all(
      items.map(async (i) => ({
        _id: i._id,
        numero: i.numero,
        titulo: i.titulo ?? null,
        url: i.urlPdf ?? (i.storageId ? await ctx.storage.getUrl(i.storageId) : null),
      })),
    )
  },
})

/** Elimina un informe (y su archivo en storage, si lo tiene). */
export const eliminarInforme = mutation({
  args: { token: v.string(), id: v.id('informes') },
  handler: async (ctx, { token, id }) => {
    await requireSesion(ctx, token)
    const inf = await ctx.db.get(id)
    if (inf?.storageId) await ctx.storage.delete(inf.storageId)
    await ctx.db.delete(id)
  },
})
