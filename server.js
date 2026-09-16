/**
 * Production server for the IPMS app with SPA fallback.
 * 
 * Usage:
 *   npm run build
 *   node server.js
 * 
 * The server serves the built dist folder and falls back to index.html
 * for any route that isn't a static file, enabling client-side routing.
 */

import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 8080

// Serve static files from dist with caching
app.use(
  express.static(path.join(__dirname, 'dist'), {
    maxAge: '1h',
    etag: false,
  })
)

// SPA fallback: serve index.html for any route that isn't a static file
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html')
  
  // Verify index.html exists
  if (!fs.existsSync(indexPath)) {
    return res.status(500).send('Build files not found. Run "npm run build" first.')
  }
  
  res.sendFile(indexPath)
})

app.listen(PORT, () => {
  console.log(`✓ Server running at http://localhost:${PORT}`)
  console.log(`  Routes are handled by React Router for SPA navigation`)
})
