import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { Landing } from './features/landing/view'
import { usePath } from './router'
import './base.css'

const root = document.getElementById('root')
if (!root) throw new Error('The app root element is missing.')

function Root() {
  const path = usePath()
  return path.startsWith('/app') ? <App /> : <Landing />
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
