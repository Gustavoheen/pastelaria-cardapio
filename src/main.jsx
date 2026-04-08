import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import './index.css'
import App from './App.jsx'
import Admin from './pages/Admin.jsx'
import AcompanharPedido from './pages/AcompanharPedido.jsx'
import Caixa from './pages/Caixa.jsx'

inject()

const path = window.location.pathname.replace(/\/$/, '')

let PageComponent = App
if (path === '/admin') PageComponent = Admin
else if (path === '/acompanhar') PageComponent = AcompanharPedido
else if (path === '/caixa') PageComponent = Caixa

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PageComponent />
  </StrictMode>
)
