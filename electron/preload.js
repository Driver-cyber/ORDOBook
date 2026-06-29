// ORDOBOOK — Electron preload
//
// Intentionally minimal. The app talks to the backend over HTTP (relative /api
// paths), so no privileged bridge is required today. contextIsolation stays on;
// add narrowly-scoped APIs here via contextBridge only if a real native need
// appears (e.g. a native file-save dialog for PDF/JSON exports).

const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('ordobook', {
  platform: process.platform,
  // Marker so the frontend can detect it's running inside the desktop shell.
  isDesktop: true,
})
