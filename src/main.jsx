import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Admin from './Admin.jsx'
import './index.css'

// Router mínimo por pathname: /admin -> panel; cualquier otra -> consulta.
const esAdmin = window.location.pathname.replace(/\/+$/, '') === '/admin'

createRoot(document.getElementById('root')).render(
  <StrictMode>{esAdmin ? <Admin /> : <App />}</StrictMode>,
)
