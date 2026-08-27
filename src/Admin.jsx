import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
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

  // Número del certificado:
  //   'alfanumerico' | 'numerico'  -> generado automáticamente (seguro)
  //   'personalizado'              -> el admin escribe el número (numeroManual)
  const [formato, setFormato] = useState('alfanumerico') // selección actual
  const [numeroManual, setNumeroManual] = useState('')
  // Número detectado en el nombre del archivo (sugerencia para el admin).
  const [sugerenciaNumero, setSugerenciaNumero] = useState('')
  const [guardarComoDefault, setGuardarComoDefault] = useState(false)

  // Listado
  const [informes, setInformes] = useState([])
  // Id del certificado cuyo QR está desplegado en el listado.
  const [qrVisibleId, setQrVisibleId] = useState(null)

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
  // Se aceptan PDF, imágenes y otros documentos. Al elegirlo, si el nombre del
  // archivo contiene un número, se ofrece como sugerencia para el N° del
  // certificado (ej. "Certificado 776892.pdf" -> 776892).
  function seleccionarArchivo(e) {
    setErrorSubida('')
    const f = e.target.files?.[0] ?? null
    setArchivo(f)
    const sug = f ? numeroDesdeNombre(f.name) : ''
    // Si ya está en modo personalizado y aún no hay número, lo autocompleta.
    if (sug && formato === 'personalizado' && !numeroManual.trim()) {
      setNumeroManual(sug)
      setSugerenciaNumero('')
    } else {
      setSugerenciaNumero(sug)
    }
  }

  // Aplica la sugerencia: pasa a modo personalizado con el número detectado.
  function usarSugerencia() {
    if (!sugerenciaNumero) return
    setFormato('personalizado')
    setNumeroManual(sugerenciaNumero)
    setSugerenciaNumero('')
  }

  // Descarta el archivo pendiente. Nada se sube ni se guarda en la base de datos.
  function descartarArchivo() {
    setArchivo(null)
    setErrorSubida('')
    setSugerenciaNumero('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubida(e) {
    e.preventDefault()
    setErrorSubida('')
    setUltimoCreado(null)

    if (!archivo) {
      setErrorSubida('Selecciona un archivo.')
      return
    }

    const esPersonalizado = formato === 'personalizado'
    const numeroLimpio = numeroManual.trim()
    if (esPersonalizado && !numeroLimpio) {
      setErrorSubida('Escribe el número del certificado o elige otra opción.')
      return
    }

    setSubiendo(true)
    try {
      // 1) Pedir una URL de subida a Convex File Storage.
      const uploadUrl = await convex.mutation('admin:generateUploadUrl', { token })

      // 2) Subir el archivo directamente a esa URL. Usamos un content-type
      //    fiable (algunos sistemas no reportan archivo.type) para que luego
      //    el PDF/imagen se vea en línea correctamente.
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': tipoContenido(archivo) },
        body: archivo,
      })
      if (!res.ok) throw new Error('Falló la subida del archivo.')
      const { storageId } = await res.json()

      // 3) Crear el certificado. Si es personalizado se usa el número escrito;
      //    si no, el servidor genera un código seguro según el formato.
      const r = await convex.mutation('admin:crearInforme', {
        token,
        storageId,
        titulo: titulo.trim() || undefined,
        ...(esPersonalizado
          ? { numero: numeroLimpio }
          : { formato }),
      })

      // Si se marcó, deja este formato como predeterminado para los próximos.
      // (Solo aplica a los formatos generados automáticamente.)
      if (guardarComoDefault && !esPersonalizado) {
        await convex.mutation('admin:setFormatoDefault', { token, formato })
        setGuardarComoDefault(false)
      }

      setUltimoCreado({
        numero: r.numero,
        titulo: titulo.trim(),
        url: enlaceVerificacion(r.numero),
      })
      setTitulo('')
      setNumeroManual('')
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
          className="mt-6 inline-block rounded-full bg-white/15 px-6 py-2.5 text-sm font-semibold text-white shadow-md ring-1 ring-white/30 transition hover:bg-white/25"
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
              Archivo (PDF, imagen u otro documento)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              onChange={seleccionarArchivo}
              className="mb-1 block w-full text-sm text-gray-600 file:mr-4 file:rounded-full file:border-0 file:bg-ua-cyan file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-ua-cyan-dark"
            />
            <p className="mb-3 text-xs text-gray-400">
              PDF e imágenes (JPG, PNG) se ven en línea. Otros formatos (Word,
              etc.) se podrán descargar.
            </p>

            {/* Archivo pendiente: aún NO se ha subido ni guardado. */}
            {archivo && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-ua-cyan/40 bg-ua-cyan/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">
                    {iconoArchivo(archivo)} {archivo.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(archivo.size / 1024).toFixed(0)} KB ·{' '}
                    {esVisualizable(archivo) ? 'se verá en línea' : 'solo descarga'}{' '}
                    · pendiente, sin guardar
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

            {/* Sugerencia: número detectado en el nombre del archivo. */}
            {sugerenciaNumero && formato !== 'personalizado' && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-800">
                  📌 Detectamos el número{' '}
                  <code className="rounded bg-white px-2 py-0.5 font-mono font-bold text-ua-blue">
                    {sugerenciaNumero}
                  </code>{' '}
                  en el nombre del archivo.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={usarSugerencia}
                    className="rounded-full bg-ua-cyan px-3 py-1.5 text-xs font-semibold text-white hover:bg-ua-cyan-dark"
                  >
                    Usar este número
                  </button>
                  <button
                    type="button"
                    onClick={() => setSugerenciaNumero('')}
                    className="rounded-full bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-300"
                  >
                    Ignorar
                  </button>
                </div>
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

            {/* N° de certificado: generado (alfanumérico/numérico) o personalizado */}
            <label className="mb-2 block text-sm font-medium text-gray-700">
              N° de certificado
            </label>
            <div className="mb-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormato('alfanumerico')}
                className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                  formato === 'alfanumerico'
                    ? 'border-ua-cyan bg-ua-cyan/10 text-ua-blue'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Alfanumérico
                <span className="block text-[11px] font-normal text-gray-400">
                  K7M2QX8ZP4T9
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFormato('numerico')}
                className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                  formato === 'numerico'
                    ? 'border-ua-cyan bg-ua-cyan/10 text-ua-blue'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Numérico
                <span className="block text-[11px] font-normal text-gray-400">
                  482913756204831
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFormato('personalizado')}
                className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                  formato === 'personalizado'
                    ? 'border-ua-cyan bg-ua-cyan/10 text-ua-blue'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Personalizado
                <span className="block text-[11px] font-normal text-gray-400">
                  Tú lo eliges
                </span>
              </button>
            </div>

            {formato === 'personalizado' ? (
              <div className="mb-4">
                <input
                  type="text"
                  value={numeroManual}
                  onChange={(e) => setNumeroManual(e.target.value)}
                  placeholder="Ej: 776892"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 font-mono text-gray-800 outline-none focus:border-ua-cyan focus:ring-2 focus:ring-ua-cyan/40"
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  Letras, números y guiones (sin espacios). Debe ser único. Un
                  número corto es más fácil de adivinar que un código generado.
                </p>
              </div>
            ) : (
              <label className="mb-4 flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={guardarComoDefault}
                  onChange={(e) => setGuardarComoDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-ua-cyan focus:ring-ua-cyan"
                />
                Usar este formato como predeterminado de ahora en adelante
              </label>
            )}

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

              {/* Código QR del enlace directo: al escanearlo se abre y verifica
                  el certificado desde el teléfono, sin escribir nada. */}
              <div className="mt-4 flex flex-col items-center gap-2 border-t border-green-200 pt-4">
                <p className="text-xs font-medium text-green-800">
                  Código QR para verificar desde el teléfono
                </p>
                <QrBloque
                  url={ultimoCreado.url}
                  numero={ultimoCreado.numero}
                  titulo={ultimoCreado.titulo}
                />
              </div>
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
              <li key={inf._id} className="px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
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
                      onClick={() =>
                        setQrVisibleId((id) => (id === inf._id ? null : inf._id))
                      }
                      className="rounded-full bg-ua-blue/10 px-3 py-1.5 text-xs font-semibold text-ua-blue hover:bg-ua-blue/20"
                    >
                      {qrVisibleId === inf._id ? 'Ocultar QR' : 'QR'}
                    </button>
                    <button
                      onClick={() => handleEliminar(inf._id)}
                      className="rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-200"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                {/* QR del enlace directo de verificación de este certificado. */}
                {qrVisibleId === inf._id && (
                  <div className="mt-4 flex flex-col items-center gap-2 rounded-xl bg-gray-50 py-4">
                    <QrBloque
                      url={enlaceVerificacion(inf.numero)}
                      numero={inf.numero}
                      titulo={inf.titulo}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <Footer />
      </div>
    </div>
  )
}

// Extrae un posible número de certificado del nombre de un archivo.
// Conserva los guiones interiores, porque forman parte del número impreso en
// el documento ("Certificado 77689-2.pdf" -> "77689-2"). Se elige la secuencia
// con más dígitos (>= 5) para evitar falsos positivos como años o fechas.
// La búsqueda ignora los guiones de todos modos (ver convex/lib.js), así que
// conservarlos sólo mejora lo que se muestra e imprime.
function numeroDesdeNombre(nombre) {
  const base = String(nombre).replace(/\.[^.]+$/, '') // sin extensión
  const runs = base.match(/\d+(?:-\d+)*/g) || []
  const digitos = (r) => r.replace(/-/g, '').length
  let mejor = ''
  for (const r of runs) if (digitos(r) > digitos(mejor)) mejor = r
  return digitos(mejor) >= 5 ? mejor : ''
}

// Devuelve un content-type fiable para subir el archivo. Algunos sistemas no
// reportan archivo.type (queda ""), así que se deduce por la extensión. Esto
// asegura que el PDF/imagen se sirva con el tipo correcto y se vea en línea.
function tipoContenido(f) {
  if (f.type) return f.type
  const n = f.name.toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.webp')) return 'image/webp'
  if (n.endsWith('.gif')) return 'image/gif'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  return 'application/octet-stream'
}

// ¿El archivo se puede ver en línea (PDF o imagen) o solo descargar?
function esVisualizable(f) {
  const t = tipoContenido(f)
  return t === 'application/pdf' || t.startsWith('image/')
}

// Ícono según el tipo de archivo.
function iconoArchivo(f) {
  const t = tipoContenido(f)
  if (t.startsWith('image/')) return '🖼️'
  if (t === 'application/pdf') return '📄'
  return '📎'
}

function Centrado({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-ua-blue px-4">
      <div className="flex flex-1 flex-col items-center justify-center py-10">
        {children}
      </div>
      <Footer />
    </div>
  )
}

// Carga una imagen y resuelve cuando está lista (para dibujar en canvas).
function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Parte un texto en líneas que quepan en maxWidth (máximo 3 líneas).
function envolverTexto(ctx, texto, maxWidth) {
  const palabras = String(texto).split(/\s+/)
  const lineas = []
  let linea = ''
  for (const p of palabras) {
    const test = linea ? linea + ' ' + p : p
    if (ctx.measureText(test).width > maxWidth && linea) {
      lineas.push(linea)
      linea = p
    } else {
      linea = test
    }
  }
  if (linea) lineas.push(linea)
  return lineas.slice(0, 3)
}

/**
 * Compone una tarjeta PNG "profesional" para el certificado: logo UA,
 * el código QR del enlace de verificación, el N° del certificado y el
 * nombre del archivo. Devuelve un Blob (image/png).
 */
async function crearTarjetaQr({ numero, titulo, url }) {
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 600,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#13509e', light: '#ffffff' },
  })
  const [qrImg, logoImg] = await Promise.all([
    cargarImagen(qrDataUrl),
    cargarImagen(LOGO_UA).catch(() => null),
  ])

  let dominio = ''
  try {
    dominio = new URL(url).host
  } catch {
    /* sin dominio */
  }

  const W = 800
  const pad = 56
  const qr = 440
  const lw = 190

  const canvas = document.createElement('canvas')
  const c0 = canvas.getContext('2d')
  canvas.width = W
  c0.font = '24px Arial, sans-serif'
  const tituloLines = titulo ? envolverTexto(c0, titulo, W - 2 * pad) : []
  const lh = logoImg ? Math.round((lw * logoImg.height) / logoImg.width) : 0

  // Layout vertical (se calcula el alto según haya o no título).
  let y = 38
  const logoY = y
  if (logoImg) y += lh + 24
  const bannerY = y
  y += 46
  const qrY = y
  y += qr + 30
  const labelY = y
  y += 32
  const codigoY = y
  y += 56
  let tituloY = 0
  if (tituloLines.length) {
    tituloY = y
    y += tituloLines.length * 34 + 10
  }
  const capY = y
  y += 30
  const domY = y
  y += 28
  const H = y + 34

  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#13509e'
  ctx.fillRect(0, 0, W, 12)
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, W - 2, H - 2)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  if (logoImg) ctx.drawImage(logoImg, (W - lw) / 2, logoY, lw, lh)
  ctx.fillStyle = '#13509e'
  ctx.font = 'bold 30px Arial, sans-serif'
  ctx.fillText('VERIFICACIÓN DE CERTIFICADO', W / 2, bannerY)
  ctx.drawImage(qrImg, (W - qr) / 2, qrY, qr, qr)
  ctx.fillStyle = '#6b7280'
  ctx.font = '600 22px Arial, sans-serif'
  ctx.fillText('Certificado N°', W / 2, labelY)
  ctx.fillStyle = '#13509e'
  ctx.font = 'bold 38px "Courier New", monospace'
  ctx.fillText(numero, W / 2, codigoY)
  if (tituloLines.length) {
    ctx.fillStyle = '#374151'
    ctx.font = '24px Arial, sans-serif'
    let ty = tituloY
    for (const ln of tituloLines) {
      ctx.fillText(ln, W / 2, ty)
      ty += 34
    }
  }
  ctx.fillStyle = '#6b7280'
  ctx.font = '20px Arial, sans-serif'
  ctx.fillText('Escanea el código para ver y verificar el certificado', W / 2, capY)
  ctx.fillStyle = '#13509e'
  ctx.font = '600 20px Arial, sans-serif'
  ctx.fillText(dominio, W / 2, domY)

  return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

// Nombre de archivo seguro a partir del título y el código.
function nombreTarjeta(numero, titulo) {
  const base = (titulo || 'Certificado')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${base || 'Certificado'}-${numero}.png`
}

/**
 * Muestra la tarjeta QR del certificado y permite descargarla o
 * compartirla (Web Share API en celular; descarga como respaldo).
 */
function QrBloque({ url, numero, titulo }) {
  const [cardUrl, setCardUrl] = useState('')
  const [blob, setBlob] = useState(null)
  const [puedeCompartir, setPuedeCompartir] = useState(false)

  useEffect(() => {
    let activo = true
    let urlCreada = ''
    setCardUrl('')
    setBlob(null)
    if (!url) return
    crearTarjetaQr({ numero, titulo, url })
      .then((b) => {
        if (!activo || !b) return
        urlCreada = URL.createObjectURL(b)
        setBlob(b)
        setCardUrl(urlCreada)
        try {
          const f = new File([b], 'qr.png', { type: 'image/png' })
          setPuedeCompartir(!!navigator.canShare && navigator.canShare({ files: [f] }))
        } catch {
          setPuedeCompartir(false)
        }
      })
      .catch(() => {})
    return () => {
      activo = false
      if (urlCreada) URL.revokeObjectURL(urlCreada)
    }
  }, [url, numero, titulo])

  const nombre = nombreTarjeta(numero, titulo)

  function descargar() {
    if (!cardUrl) return
    const a = document.createElement('a')
    a.href = cardUrl
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function compartir() {
    if (!blob) return
    const file = new File([blob], nombre, { type: 'image/png' })
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Certificado ${numero}`,
          text: `Verifica el certificado ${numero}${titulo ? ' — ' + titulo : ''}`,
        })
      } else {
        descargar()
      }
    } catch {
      /* el usuario canceló el compartir */
    }
  }

  if (!cardUrl) {
    return <p className="text-xs text-gray-400">Generando QR…</p>
  }

  return (
    <>
      <img
        src={cardUrl}
        alt={`Tarjeta QR del certificado ${numero}`}
        className="w-full max-w-[240px] rounded-lg border border-gray-200 shadow-sm"
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        {puedeCompartir && (
          <button
            type="button"
            onClick={compartir}
            className="rounded-full bg-ua-cyan px-4 py-1.5 text-xs font-semibold text-white hover:bg-ua-cyan-dark"
          >
            Compartir QR
          </button>
        )}
        <button
          type="button"
          onClick={descargar}
          className="rounded-full bg-ua-blue px-4 py-1.5 text-xs font-semibold text-white hover:bg-ua-blue-dark"
        >
          Descargar QR (PNG)
        </button>
      </div>
    </>
  )
}
