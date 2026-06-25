import { useEffect, useRef, useState } from 'react'
import { convex, convexHabilitado } from './convexClient'

// Permite abrir un informe directamente vía enlace: /?n=INF-2026-XXXX
function numeroDesdeURL() {
  try {
    return new URLSearchParams(window.location.search).get('n') || ''
  } catch {
    return ''
  }
}

// Logo institucional de la Universidad de Antofagasta (servido desde /public).
// El archivo original es azul; en el diseño se muestra blanco sobre el fondo
// azul, por lo que se "blanquea" con un filtro CSS (brightness(0) invert(1)).
const LOGO_UA = '/logo-ua.png'

/**
 * URL de PDF de muestra que se abre cuando el informe existe.
 * En producción este valor vendría de la respuesta del backend (Supabase
 * Storage, una URL firmada, etc.). Ver comentario en buscarInforme().
 */
const PDF_DEMO_URL =
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'

export default function App() {
  // Estado del input "Número de Informe".
  const [numeroInforme, setNumeroInforme] = useState(numeroDesdeURL)
  // Mensaje de error mostrado debajo del formulario.
  const [error, setError] = useState('')
  // Estado de carga mientras se "consulta" el informe.
  const [cargando, setCargando] = useState(false)
  // Evita que la auto-búsqueda por enlace se dispare más de una vez.
  const autoBuscado = useRef(false)

  /**
   * Busca el informe contra el backend de Convex.
   *
   * ───────────────────────────────────────────────────────────────────────
   *  BACKEND: Convex
   * ───────────────────────────────────────────────────────────────────────
   *  La query vive en convex/informes.ts -> getByNumero. Se invoca con el
   *  ConvexHttpClient (consulta puntual). Cuando exista el código generado
   *  (`npx convex dev`/`codegen`), se puede usar la referencia tipada:
   *
   *    import { api } from '../convex/_generated/api'
   *    const r = await convex.query(api.informes.getByNumero, { numero })
   *
   *  Aquí usamos la referencia por string para que el build funcione aun
   *  sin _generated:
   *
   *    const r = await convex.query('informes:getByNumero', { numero })
   *
   *  Mientras no esté configurada VITE_CONVEX_URL, se usa una simulación
   *  local para que el sitio siga operativo.
   * ───────────────────────────────────────────────────────────────────────
   *
   * @param {string} numero Número de informe ingresado por el usuario.
   * @returns {Promise<string|null>} URL del PDF si existe, o null si no existe.
   */
  async function buscarInforme(numero) {
    if (convexHabilitado && convex) {
      const r = await convex.query('informes:getByNumero', { numero })
      return r?.urlPdf ?? null
    }

    // --- FALLBACK / SIMULACIÓN (activo hasta configurar VITE_CONVEX_URL) ---
    await new Promise((resolve) => setTimeout(resolve, 700)) // latencia simulada
    const informesDemo = {
      'INF-2024-001': PDF_DEMO_URL,
    }
    return informesDemo[numero.trim().toUpperCase()] ?? null
    // --- FIN FALLBACK ---
  }

  async function ejecutarBusqueda(numero, { nuevaPestana = true } = {}) {
    setError('')
    if (!numero) {
      setError('Por favor ingresa un número de informe.')
      return
    }

    setCargando(true)
    try {
      const urlPdf = await buscarInforme(numero)

      if (urlPdf) {
        if (nuevaPestana) {
          // Acción iniciada por el usuario: abrir el PDF en una pestaña nueva.
          window.open(urlPdf, '_blank', 'noopener,noreferrer')
        } else {
          // Auto-búsqueda por enlace: redirigir en la misma pestaña
          // (evita el bloqueo de pop-ups al cargar la página).
          window.location.assign(urlPdf)
        }
      } else {
        setError('El informe no existe o el número es incorrecto.')
      }
    } catch (err) {
      console.error('Error al buscar el informe:', err)
      setError('Ocurrió un error al buscar el informe. Inténtalo nuevamente.')
    } finally {
      setCargando(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    ejecutarBusqueda(numeroInforme.trim(), { nuevaPestana: true })
  }

  // Auto-búsqueda cuando se llega vía enlace directo /?n=INF-2026-XXXX
  useEffect(() => {
    const n = numeroDesdeURL().trim()
    if (n && !autoBuscado.current) {
      autoBuscado.current = true
      ejecutarBusqueda(n, { nuevaPestana: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-ua-blue">
      {/* Marca de agua: logo gigante difuminado al fondo, como en el diseño. */}
      <img
        src={LOGO_UA}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 w-[150%] max-w-none -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.06] [filter:brightness(0)_invert(1)]"
      />

      {/* Contenido */}
      <main className="relative z-10 flex min-h-screen flex-col items-center px-4 py-10 sm:py-14">
        {/* Logo institucional (blanco sobre el fondo azul) */}
        <img
          src={LOGO_UA}
          alt="Universidad de Antofagasta"
          className="mb-8 w-64 max-w-[80%] [filter:brightness(0)_invert(1)]"
        />

        {/* Tarjeta blanca */}
        <section className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
          {/* Banner superior celeste */}
          <header className="bg-ua-cyan px-6 py-4">
            <h1 className="text-lg font-bold uppercase tracking-wide text-white sm:text-xl">
              Verificación de Informes UA
            </h1>
          </header>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="px-6 py-8" noValidate>
            <label
              htmlFor="numeroInforme"
              className="mb-2 block text-base font-medium text-gray-700"
            >
              Número de Informe
            </label>

            <input
              id="numeroInforme"
              name="numeroInforme"
              type="text"
              value={numeroInforme}
              onChange={(e) => setNumeroInforme(e.target.value)}
              placeholder="INF-2026-XXXXXXXXXXXX"
              autoComplete="off"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-800 placeholder-gray-400 outline-none transition focus:border-ua-cyan focus:ring-2 focus:ring-ua-cyan/40"
            />

            <button
              type="submit"
              disabled={cargando}
              className="mt-5 w-full rounded-full bg-ua-cyan px-6 py-3 text-lg font-semibold text-white shadow-md transition hover:bg-ua-cyan-dark focus:outline-none focus:ring-2 focus:ring-ua-cyan/50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {cargando ? 'Buscando…' : 'Ver Informe'}
            </button>

            {/* Mensaje de error amigable */}
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-600"
              >
                {error}
              </p>
            )}
          </form>
        </section>
      </main>
    </div>
  )
}
