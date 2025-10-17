import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

console.log('[main] Bootstrapping React app')
const container = document.getElementById('root')!
console.log('[main] Found root container:', !!container)
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
