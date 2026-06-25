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
 * Genera un código de certificado SEGURO y NO ADIVINABLE, SIN puntos ni guión.
 * Dos formatos:
 *   - 'alfanumerico': 12 chars base32 Crockford (≈60 bits). Ej: K7M2QX8ZP4T9
 *   - 'numerico': 15 dígitos. Ej: 482913756204831
 * Usa aleatoriedad criptográfica (crypto.getRandomValues). El código actúa como
 * clave de acceso secreta; la seguridad depende de la entropía, no de ocultar
 * este algoritmo. SE EJECUTA SOLO EN EL SERVIDOR.
 */
function generarCodigoSeguro(formato) {
  if (formato === 'numerico') {
    const bytes = new Uint8Array(15)
    crypto.getRandomValues(bytes)
    let s = ''
    for (const b of bytes) s += (b % 10).toString()
    // Evita el 0 inicial para que se lea como un número de 15 dígitos.
    if (s[0] === '0') s = (1 + (bytes[0] % 9)).toString() + s.slice(1)
    return s
  }
  // Alfanumérico base32 Crockford: sin I, L, O, U (sin ambigüedad visual).
  const alfabeto = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += alfabeto[b % 32]
  return s
}

const FORMATO_DEFECTO = 'alfanumerico'

// Lee el formato por defecto configurado en el panel.
async function leerFormatoDefault(ctx) {
  const c = await ctx.db
    .query('config')
    .withIndex('by_clave', (q) => q.eq('clave', 'formatoDefault'))
    .unique()
  return c?.valor === 'numerico' ? 'numerico' : FORMATO_DEFECTO
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
    formato: v.optional(
      v.union(v.literal('alfanumerico'), v.literal('numerico')),
    ),
  },
  handler: async (ctx, { token, storageId, titulo, formato }) => {
    await requireSesion(ctx, token)

    const fmt = formato ?? (await leerFormatoDefault(ctx))

    // Genera un código único (reintenta ante una colisión, muy improbable).
    let numero = null
    for (let i = 0; i < 6; i++) {
      const candidato = generarCodigoSeguro(fmt)
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
      throw new Error('No se pudo generar un código único. Inténtalo de nuevo.')
    }

    const id = await ctx.db.insert('informes', { numero, storageId, titulo })
    return { id, numero }
  },
})

// Devuelve la configuración del panel (formato por defecto).
export const getConfig = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireSesion(ctx, token)
    return { formatoDefault: await leerFormatoDefault(ctx) }
  },
})

// Establece el formato por defecto para los nuevos certificados.
export const setFormatoDefault = mutation({
  args: {
    token: v.string(),
    formato: v.union(v.literal('alfanumerico'), v.literal('numerico')),
  },
  handler: async (ctx, { token, formato }) => {
    await requireSesion(ctx, token)
    const existente = await ctx.db
      .query('config')
      .withIndex('by_clave', (q) => q.eq('clave', 'formatoDefault'))
      .unique()
    if (existente) {
      await ctx.db.patch(existente._id, { valor: formato })
    } else {
      await ctx.db.insert('config', { clave: 'formatoDefault', valor: formato })
    }
    return { ok: true }
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
