import { useEffect, useRef, useState } from 'react'
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
  const fileInputRef = useRef(null)

  // Formato del código del certificado
  const [formato, setFormato] = useState('alfanumerico') // selección actual
  const [guardarComoDefault, setGuardarComoDefault] = useState(false)

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
            await cargarConfig(token)
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

  async function cargarConfig(tk) {
    try {
      const cfg = await convex.query('admin:getConfig', { token: tk })
      if (cfg?.formatoDefault) setFormato(cfg.formatoDefault)
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
        await cargarConfig(r.token)
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

  // Selecciona un archivo (NO lo sube todavía: solo lo deja pendiente).
  function seleccionarArchivo(e) {
    setErrorSubida('')
    const f = e.target.files?.[0] ?? null
    if (f && f.type !== 'application/pdf') {
      setErrorSubida('El archivo debe ser un PDF.')
      descartarArchivo()
      return
    }
    setArchivo(f)
  }

  // Descarta el archivo pendiente. Nada se sube ni se guarda en la base de datos.
  function descartarArchivo() {
    setArchivo(null)
    setErrorSubida('')
    if (fileInputRef.current) fileInputRef.current.value = ''
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

      // 3) Crear el certificado; el servidor genera el código seguro
      //    según el formato elegido.
      const r = await convex.mutation('admin:crearInforme', {
        token,
        storageId,
        titulo: titulo.trim() || undefined,
        formato,
      })

      // Si se marcó, deja este formato como predeterminado para los próximos.
      if (guardarComoDefault) {
        await convex.mutation('admin:setFormatoDefault', { token, formato })
        setGuardarComoDefault(false)
      }

      setUltimoCreado({ numero: r.numero, url: enlaceVerificacion(r.numero) })
      setTitulo('')
      descartarArchivo()
      await cargarInformes(token)
    } catch (err) {
      console.error(err)
      setErrorSubida(err.message || 'Ocurrió un error al subir el certificado.')
    } finally {
      setSubiendo(false)
    }
  }

  async function handleEliminar(id) {
    if (!confirm('¿Eliminar este certificado? Esta acción no se puede deshacer.')) return
    try {
      await convex.mutation('admin:eliminarInforme', { token, id })
      await cargarInformes(token)
    } catch (err) {
      console.error(err)
      alert('No se pudo eliminar el certificado.')
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
        <a
          href="/"
          className="mt-5 text-sm font-medium text-white/80 underline-offset-2 transition hover:text-white hover:underline"
        >
          ← Volver al inicio
        </a>
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
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/25"
            >
              ← Inicio
            </a>
            <button
              onClick={handleLogout}
              className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/25"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        {/* Subir certificado */}
        <section className="mb-6 overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="bg-ua-cyan px-6 py-4">
            <h2 className="text-lg font-bold uppercase tracking-wide text-white">
              Subir nuevo certificado
            </h2>
          </div>
          <form onSubmit={handleSubida} className="px-6 py-6">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Archivo PDF
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={seleccionarArchivo}
              className="mb-3 block w-full text-sm text-gray-600 file:mr-4 file:rounded-full file:border-0 file:bg-ua-cyan file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-ua-cyan-dark"
            />

            {/* Archivo pendiente: aún NO se ha subido ni guardado. */}
            {archivo && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-ua-cyan/40 bg-ua-cyan/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">
                    📄 {archivo.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(archivo.size / 1024).toFixed(0)} KB · pendiente, sin guardar
                  </p>
                </div>
                <button
                  type="button"
                  onClick={descartarArchivo}
                  title="Descartar archivo"
                  aria-label="Descartar archivo"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-lg font-bold leading-none text-red-600 transition hover:bg-red-200"
                >
                  ✕
                </button>
              </div>
            )}
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Título (opcional)
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Certificado de ensayo de hormigón"
              className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-800 outline-none focus:border-ua-cyan focus:ring-2 focus:ring-ua-cyan/40"
            />

            {/* Formato del código del certificado (sin puntos ni guión) */}
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Formato del N° de certificado
            </label>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormato('alfanumerico')}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  formato === 'alfanumerico'
                    ? 'border-ua-cyan bg-ua-cyan/10 text-ua-blue'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Alfanumérico
                <span className="block text-[11px] font-normal text-gray-400">
                  Ej: K7M2QX8ZP4T9
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFormato('numerico')}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  formato === 'numerico'
                    ? 'border-ua-cyan bg-ua-cyan/10 text-ua-blue'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Solo números
                <span className="block text-[11px] font-normal text-gray-400">
                  Ej: 482913756204831
                </span>
              </button>
            </div>
            <label className="mb-4 flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={guardarComoDefault}
                onChange={(e) => setGuardarComoDefault(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-ua-cyan focus:ring-ua-cyan"
              />
              Usar este formato como predeterminado de ahora en adelante
            </label>

            <button
              type="submit"
              disabled={subiendo || !archivo}
              className="w-full rounded-full bg-ua-cyan px-6 py-3 font-semibold text-white shadow-md transition hover:bg-ua-cyan-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {subiendo ? 'Guardando…' : 'Guardar certificado'}
            </button>
            <p className="mt-2 text-center text-xs text-gray-400">
              Nada se guarda en la base de datos hasta pulsar “Guardar certificado”.
            </p>
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
                ✅ Certificado subido. N° de verificación generado:
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
              Certificados ({informes.length})
            </h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {informes.length === 0 && (
              <li className="px-6 py-6 text-center text-sm text-gray-500">
                Aún no hay certificados.
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
