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

const BACKEND_PORT = 8000
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`
const VITE_URL = 'http://localhost:5173'
const isDev = process.env.ELECTRON_DEV === '1' || !app.isPackaged

let backendProcess = null
let mainWindow = null

function startBackend() {
  // In dev we assume the backend is already running in a terminal.
  if (isDev) {
    console.log('[electron] dev mode — assuming backend already running on', BACKEND_URL)
    return
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
    CORS_ORIGINS: BACKEND_URL,
    // Bring the user's persistent DB up to head on every launch so new versions'
    // schema changes apply without wiping data (see backend/app/db_migrate.py).
    ORDOBOOK_AUTO_MIGRATE: '1',
  }

  console.log('[electron] starting backend:', pythonBin)
  backendProcess = spawn(
    pythonBin,
    ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)],
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
        .get(`${BACKEND_URL}/api/health`, (res) => resolve(res.statusCode === 200))
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

  const targetUrl = isDev ? VITE_URL : BACKEND_URL
  mainWindow.loadURL(targetUrl)

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  startBackend()
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
