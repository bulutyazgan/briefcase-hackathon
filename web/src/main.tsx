import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { Landing } from './features/landing/view'
import './base.css'

const root = document.getElementById('root')
if (!root) throw new Error('The app root element is missing.')

const isApp = window.location.pathname.startsWith('/app')

createRoot(root).render(
  <StrictMode>
    {isApp ? <App /> : <Landing />}
  </StrictMode>,
)
