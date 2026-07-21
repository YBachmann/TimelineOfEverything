import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

// Two boundaries, deliberately: the inner one (around the chart, in App) keeps
// the page usable when only the timeline fails; this outer one is the
// last-resort net so an error anywhere else still leaves a message on screen
// rather than a blank document.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary title="The app failed to start">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
