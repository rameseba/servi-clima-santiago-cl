import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { normalizarNumero } from './lib.js'

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
 * Indica si ya existe un certificado cuyo número, normalizado, es el mismo.
 * Cubre también los registros antiguos que aún no tienen `numeroNorm`
 * (ver informes:backfillNumeroNorm).
 */
async function existePorNorm(ctx, norm) {
  const directo = await ctx.db
    .query('informes')
    .withIndex('by_numeroNorm', (q) => q.eq('numeroNorm', norm))
    .unique()
  if (directo) return true

  const antiguos = await ctx.db
    .query('informes')
    .withIndex('by_numeroNorm', (q) => q.eq('numeroNorm', undefined))
    .collect()
  return antiguos.some((i) => normalizarNumero(i.numero) === norm)
}

/**
 * Crea un informe asociándole un archivo subido (storageId).
 *
 * El número del certificado puede:
 *   - VENIR DADO por el admin ('personalizado'): se usa tal cual (normalizado
 *     a mayúsculas). Útil para conservar el número impreso en el documento
 *     (ej. 776892). Atención: un número corto y predecible es más fácil de
 *     adivinar que un código generado; queda a criterio del admin.
 *   - GENERARSE AUTOMÁTICAMENTE de forma segura ('alfanumerico'/'numerico'),
 *     como código no adivinable que actúa como clave de acceso.
 *
 * Se devuelve el número resultante para que el admin lo comparta.
 */
export const crearInforme = mutation({
  args: {
    token: v.string(),
    storageId: v.id('_storage'),
    titulo: v.optional(v.string()),
    // Número personalizado elegido por el admin. Si se indica, tiene prioridad
    // sobre la generación automática.
    numero: v.optional(v.string()),
    formato: v.optional(
      v.union(v.literal('alfanumerico'), v.literal('numerico')),
    ),
  },
  handler: async (ctx, { token, storageId, titulo, numero, formato }) => {
    await requireSesion(ctx, token)

    // --- Número personalizado (tiene prioridad) ---
    const personalizado = numero?.trim().toUpperCase()
    if (personalizado) {
      // Permite letras, números y guiones (sin espacios ni puntos), 3 a 40.
      if (!/^[A-Z0-9-]{3,40}$/.test(personalizado)) {
        throw new Error(
          'El número solo puede tener letras, números y guiones (3 a 40 caracteres, sin espacios).',
        )
      }
      // El choque se comprueba sobre el número normalizado: "77689-2" y
      // "776892" son el mismo certificado para quien lo busca, así que no se
      // permite crear ambos.
      const normPersonalizado = normalizarNumero(personalizado)
      const choque = await existePorNorm(ctx, normPersonalizado)
      if (choque) {
        throw new Error('Ya existe un certificado con ese número. Elige otro.')
      }
      const id = await ctx.db.insert('informes', {
        numero: personalizado,
        numeroNorm: normPersonalizado,
        storageId,
        titulo,
      })
      return { id, numero: personalizado }
    }

    // --- Número generado automáticamente (seguro) ---
    const fmt = formato ?? (await leerFormatoDefault(ctx))

    // Genera un código único (reintenta ante una colisión, muy improbable).
    let generado = null
    for (let i = 0; i < 6; i++) {
      const candidato = generarCodigoSeguro(fmt)
      const choque = await existePorNorm(ctx, normalizarNumero(candidato))
      if (!choque) {
        generado = candidato
        break
      }
    }
    if (!generado) {
      throw new Error('No se pudo generar un código único. Inténtalo de nuevo.')
    }

    const id = await ctx.db.insert('informes', {
      numero: generado,
      numeroNorm: normalizarNumero(generado),
      storageId,
      titulo,
    })
    return { id, numero: generado }
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
