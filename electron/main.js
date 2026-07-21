// ORDOBOOK — Electron main process
//
// Responsibilities:
//   1. Start the embedded FastAPI backend (uvicorn) on launch.
//   2. Wait for /api/health to respond.
//   3. Open a window pointed at the backend, which also serves the built frontend
//      (single origin → relative /api paths work with no proxy).
//   4. Shut the backend down cleanly when the app quits.
//
// Dev vs production:
//   - Production (app.isPackaged): spawn the BUNDLED python + backend from
//     resources, FastAPI serves the built SPA, window loads http://localhost:8000.
//   - Dev (ELECTRON_DEV=1): assumes you already have uvicorn + vite running in
//     terminals; window loads the Vite server at http://localhost:5173.
//
// NOTE: The production python-bundling paths below are marked TODO — they must be
// finalized on the Mac during packaging (Phase 6b execution), where the real venv
// and electron-builder resource layout exist.

const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const net = require('net')

// The backend port is resolved at launch (production probes for a free one, so a
// stray process on the default can't block startup). Dev assumes the conventional
// 8000 that the manually-started uvicorn uses.
let backendPort = 8000
const backendUrl = () => `http://localhost:${backendPort}`
const VITE_URL = 'http://localhost:5173'
const isDev = process.env.ELECTRON_DEV === '1' || !app.isPackaged

let backendProcess = null
let mainWindow = null

// Ask the OS for a free TCP port by binding to 0 and reading back the assignment.
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

async function startBackend() {
  // In dev we assume the backend is already running in a terminal (on 8000).
  if (isDev) {
    console.log('[electron] dev mode — assuming backend already running on', backendUrl())
    return
  }

  // Probe a free port so a leftover uvicorn / another app on 8000 can't block
  // launch. The backend serves the frontend same-origin, so pointing the window
  // at this port is all that's needed — the relative /api paths follow.
  try {
    backendPort = await findFreePort()
  } catch (err) {
    console.warn('[electron] port probe failed, falling back to 8000:', err.message)
  }

  // ── Production: spawn the bundled backend ────────────────────────────────
  // electron-builder copies the backend (incl. its venv) into the app's
  // resources via extraResources (see electron-builder.yml).
  const resources = process.resourcesPath
  const backendDir = path.join(resources, 'backend')

  // TODO(6b, on Mac): confirm the bundled interpreter path. A venv built on the
  // target Mac lives at backend/venv/bin/python. Cross-platform packaging may
  // need a per-OS path or a PyInstaller one-file binary instead.
  const pythonBin = path.join(backendDir, 'venv', 'bin', 'python')

  // SQLite DB + imports/exports live in the OS app-data dir, never inside the
  // (read-only) app bundle.
  const userData = app.getPath('userData')
  const env = {
    ...process.env,
    DATABASE_URL: `sqlite:///${path.join(userData, 'ordobook.db')}`,
    ORDOBOOK_FRONTEND_DIST: path.join(resources, 'frontend', 'dist'),
    CORS_ORIGINS: backendUrl(),
    // Bring the user's persistent DB up to head on every launch so new versions'
    // schema changes apply without wiping data (see backend/app/db_migrate.py).
    ORDOBOOK_AUTO_MIGRATE: '1',
  }

  console.log(`[electron] starting backend on ${backendPort}:`, pythonBin)
  backendProcess = spawn(
    pythonBin,
    ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(backendPort)],
    { cwd: backendDir, env, stdio: 'inherit' }
  )

  backendProcess.on('error', (err) => {
    console.error('[electron] backend failed to start:', err)
  })
}

async function waitForBackend(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      http
        .get(`${backendUrl()}/api/health`, (res) => resolve(res.statusCode === 200))
        .on('error', () => resolve(false))
    })
    if (ok) return
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  throw new Error('backend did not become healthy in time')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#ffffff',
    title: 'ORDOBOOK',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const targetUrl = isDev ? VITE_URL : backendUrl()
  mainWindow.loadURL(targetUrl)

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  await startBackend() // resolves the free port before we health-check / load it
  try {
    await waitForBackend()
  } catch (err) {
    console.error('[electron]', err.message)
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    console.log('[electron] stopping backend')
    backendProcess.kill()
    backendProcess = null
  }
}

app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', stopBackend)
process.on('exit', stopBackend)
