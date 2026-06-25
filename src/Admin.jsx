import { useEffect, useState } from 'react'
import { convex, convexHabilitado } from './convexClient'
import Footer from './Footer.jsx'

const LOGO_UA = '/logo-ua.png'
const TOKEN_KEY = 'ua_admin_token'

export default function Admin() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [autenticado, setAutenticado] = useState(false)
  const [verificandoSesion, setVerificandoSesion] = useState(true)

  // Login
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [errorLogin, setErrorLogin] = useState('')

  // Subida
  const [archivo, setArchivo] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [errorSubida, setErrorSubida] = useState('')
  const [ultimoCreado, setUltimoCreado] = useState(null) // { numero, url }

  // Listado
  const [informes, setInformes] = useState([])

  // Al montar: validar el token guardado y cargar el listado.
  useEffect(() => {
    async function init() {
      if (token && convexHabilitado) {
        try {
          const ok = await convex.query('admin:sesionValida', { token })
          if (ok) {
            setAutenticado(true)
            await cargarInformes(token)
          } else {
            localStorage.removeItem(TOKEN_KEY)
          }
        } catch {
          localStorage.removeItem(TOKEN_KEY)
        }
      }
      setVerificandoSesion(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargarInformes(tk) {
    try {
      const lista = await convex.query('admin:listInformes', { token: tk })
      setInformes(lista)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setErrorLogin('')
    try {
      const r = await convex.mutation('admin:login', { usuario, password })
      if (r.ok) {
        localStorage.setItem(TOKEN_KEY, r.token)
        setToken(r.token)
        setAutenticado(true)
        setPassword('')
        await cargarInformes(r.token)
      } else {
        setErrorLogin('Usuario o contraseña incorrectos.')
      }
    } catch (err) {
      console.error(err)
      setErrorLogin('No se pudo iniciar sesión. Inténtalo nuevamente.')
    }
  }

  async function handleLogout() {
    try {
      await convex.mutation('admin:logout', { token })
    } catch {
      /* ignore */
    }
    localStorage.removeItem(TOKEN_KEY)
    setToken('')
    setAutenticado(false)
    setInformes([])
    setUltimoCreado(null)
  }

  async function handleSubida(e) {
    e.preventDefault()
    setErrorSubida('')
    setUltimoCreado(null)

    if (!archivo) {
      setErrorSubida('Selecciona un archivo PDF.')
      return
    }
    if (archivo.type !== 'application/pdf') {
      setErrorSubida('El archivo debe ser un PDF.')
      return
    }

    setSubiendo(true)
    try {
      // 1) Pedir una URL de subida a Convex File Storage.
      const uploadUrl = await convex.mutation('admin:generateUploadUrl', { token })

      // 2) Subir el archivo directamente a esa URL.
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': archivo.type },
        body: archivo,
      })
      if (!res.ok) throw new Error('Falló la subida del archivo.')
      const { storageId } = await res.json()

      // 3) Crear el informe; el servidor genera el número seguro.
      const r = await convex.mutation('admin:crearInforme', {
        token,
        storageId,
        titulo: titulo.trim() || undefined,
      })

      setUltimoCreado({ numero: r.numero, url: enlaceVerificacion(r.numero) })
      setArchivo(null)
      setTitulo('')
      e.target.reset?.()
      await cargarInformes(token)
    } catch (err) {
      console.error(err)
      setErrorSubida(err.message || 'Ocurrió un error al subir el informe.')
    } finally {
      setSubiendo(false)
    }
  }

  async function handleEliminar(id) {
    if (!confirm('¿Eliminar este informe? Esta acción no se puede deshacer.')) return
    try {
      await convex.mutation('admin:eliminarInforme', { token, id })
      await cargarInformes(token)
    } catch (err) {
      console.error(err)
      alert('No se pudo eliminar el informe.')
    }
  }

  function enlaceVerificacion(numero) {
    return `${window.location.origin}/?n=${encodeURIComponent(numero)}`
  }

  // --- Render ---

  if (!convexHabilitado) {
    return (
      <Centrado>
        <p className="text-white">
          Backend no configurado (falta VITE_CONVEX_URL).
        </p>
      </Centrado>
    )
  }

  if (verificandoSesion) {
    return (
      <Centrado>
        <p className="text-white/80">Cargando…</p>
      </Centrado>
    )
  }

  // Pantalla de login
  if (!autenticado) {
    return (
      <Centrado>
        <img
          src={LOGO_UA}
          alt="Universidad de Antofagasta"
          className="mb-8 w-56 max-w-[80%] [filter:brightness(0)_invert(1)]"
        />
        <section className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
          <header className="bg-ua-cyan px-6 py-4">
            <h1 className="text-lg font-bold uppercase tracking-wide text-white">
              Panel de Administración
            </h1>
          </header>
          <form onSubmit={handleLogin} className="px-6 py-8">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Usuario
            </label>
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-800 outline-none focus:border-ua-cyan focus:ring-2 focus:ring-ua-cyan/40"
            />
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-800 outline-none focus:border-ua-cyan focus:ring-2 focus:ring-ua-cyan/40"
            />
            <button
              type="submit"
              className="mt-5 w-full rounded-full bg-ua-cyan px-6 py-3 text-lg font-semibold text-white shadow-md transition hover:bg-ua-cyan-dark"
            >
              Ingresar
            </button>
            {errorLogin && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-600">
                {errorLogin}
              </p>
            )}
          </form>
        </section>
      </Centrado>
    )
  }

  // Panel autenticado
  return (
    <div className="min-h-screen bg-ua-blue px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <img
            src={LOGO_UA}
            alt="Universidad de Antofagasta"
            className="w-40 [filter:brightness(0)_invert(1)]"
          />
          <button
            onClick={handleLogout}
            className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/25"
          >
            Cerrar sesión
          </button>
        </header>

        {/* Subir informe */}
        <section className="mb-6 overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="bg-ua-cyan px-6 py-4">
            <h2 className="text-lg font-bold uppercase tracking-wide text-white">
              Subir nuevo informe
            </h2>
          </div>
          <form onSubmit={handleSubida} className="px-6 py-6">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Archivo PDF
            </label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              className="mb-4 block w-full text-sm text-gray-600 file:mr-4 file:rounded-full file:border-0 file:bg-ua-cyan file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-ua-cyan-dark"
            />
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Título (opcional)
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Informe de ensayo de hormigón"
              className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-800 outline-none focus:border-ua-cyan focus:ring-2 focus:ring-ua-cyan/40"
            />
            <button
              type="submit"
              disabled={subiendo}
              className="w-full rounded-full bg-ua-cyan px-6 py-3 font-semibold text-white shadow-md transition hover:bg-ua-cyan-dark disabled:opacity-70"
            >
              {subiendo ? 'Subiendo…' : 'Subir y generar número'}
            </button>
            {errorSubida && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-600">
                {errorSubida}
              </p>
            )}
          </form>

          {/* Resultado: número generado */}
          {ultimoCreado && (
            <div className="mx-6 mb-6 rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="text-sm text-green-800">
                ✅ Informe subido. Número de verificación generado:
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="rounded bg-white px-3 py-1 font-mono text-base font-bold text-ua-blue">
                  {ultimoCreado.numero}
                </code>
                <button
                  onClick={() => navigator.clipboard?.writeText(ultimoCreado.numero)}
                  className="rounded-full bg-ua-blue px-3 py-1 text-xs font-medium text-white"
                >
                  Copiar número
                </button>
                <button
                  onClick={() => navigator.clipboard?.writeText(ultimoCreado.url)}
                  className="rounded-full bg-ua-blue/80 px-3 py-1 text-xs font-medium text-white"
                >
                  Copiar enlace
                </button>
              </div>
              <p className="mt-2 break-all text-xs text-green-700">{ultimoCreado.url}</p>
            </div>
          )}
        </section>

        {/* Listado */}
        <section className="overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="bg-ua-blue px-6 py-4">
            <h2 className="text-lg font-bold uppercase tracking-wide text-white">
              Informes ({informes.length})
            </h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {informes.length === 0 && (
              <li className="px-6 py-6 text-center text-sm text-gray-500">
                Aún no hay informes.
              </li>
            )}
            {informes.map((inf) => (
              <li key={inf._id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div className="min-w-0">
                  <code className="font-mono text-sm font-bold text-ua-blue">{inf.numero}</code>
                  {inf.titulo && (
                    <p className="truncate text-sm text-gray-600">{inf.titulo}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {inf.url && (
                    <>
                      <a
                        href={inf.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-ua-cyan px-3 py-1.5 text-xs font-semibold text-white hover:bg-ua-cyan-dark"
                      >
                        Ver
                      </a>
                      <a
                        href={inf.url}
                        download
                        className="rounded-full bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-300"
                      >
                        Descargar
                      </a>
                    </>
                  )}
                  <button
                    onClick={() => handleEliminar(inf._id)}
                    className="rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-200"
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <Footer />
      </div>
    </div>
  )
}

function Centrado({ children }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-ua-blue px-4">
      {children}
      <div className="absolute inset-x-0 bottom-0">
        <Footer />
      </div>
    </div>
  )
}
