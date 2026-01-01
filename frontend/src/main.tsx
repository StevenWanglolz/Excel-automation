import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Entry point of the React application
// Creates root and renders App component into the DOM element with id="root"
ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode enables additional React checks and warnings in development
  // Helps catch potential problems (e.g., side effects, deprecated APIs)
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)



