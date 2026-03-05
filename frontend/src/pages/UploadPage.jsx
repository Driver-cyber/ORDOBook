import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { uploadFiles } from '../api/ingestion'

export default function UploadPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef()

  const addFiles = (newFiles) => {
    const xlsx = Array.from(newFiles).filter(f => f.name.endsWith('.xlsx'))
    if (xlsx.length === 0) {
      setError('Only .xlsx files are supported. Export your QuickBooks P&L and Balance Sheet as Excel.')
      return
    }
    setError(null)
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...xlsx.filter(f => !names.has(f.name))]
    })
  }

  const removeFile = (name) => setFiles(prev => prev.filter(f => f.name !== name))

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const handleSubmit = async () => {
    if (!files.length) return
    setUploading(true)
    setError(null)
    try {
      const preview = await uploadFiles(id, files)
      navigate(`/clients/${id}/mapping-review`, { state: { preview, sourceFiles: files.map(f => f.name) } })
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed. Check that these are QuickBooks Excel exports.')
      setUploading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted mb-1">
            <button onClick={() => navigate(`/clients/${id}`)} className="hover:text-text-secondary transition-colors">
              Workspace
            </button>
            <span>/</span>
            <span className="text-text-secondary">Import Data</span>
          </div>
          <h1 className="font-display font-bold text-xl text-text-primary">Import Data</h1>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!files.length || uploading}
          className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-[#d4b87a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? 'Parsing…' : 'Parse Files →'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl space-y-5">

          {error && (
            <div className="bg-[rgba(192,90,90,0.08)] border border-[rgba(192,90,90,0.2)] rounded-xl px-4 py-3 text-[12px] text-[#c05a5a]">
              {error}
            </div>
          )}

          {/* Instructions */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h2 className="font-display font-semibold text-sm text-text-primary mb-2">What to upload</h2>
            <ul className="text-[12px] text-text-muted space-y-1.5">
              <li>• <span className="text-text-secondary">Profit & Loss</span> — export from QuickBooks → Reports → Profit and Loss</li>
              <li>• <span className="text-text-secondary">Balance Sheet</span> — export from QuickBooks → Reports → Balance Sheet</li>
              <li>• Export as <span className="text-text-secondary">Excel (.xlsx)</span>, date range set to the full year-to-date period</li>
              <li>• Both files can be uploaded at once — all months detected automatically</li>
            </ul>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl px-8 py-12 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              dragging
                ? 'border-accent bg-[rgba(200,169,110,0.06)]'
                : 'border-border hover:border-accent/40 hover:bg-surface'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              multiple
              className="hidden"
              onChange={e => addFiles(e.target.files)}
            />
            <div className="text-text-muted text-3xl mb-3">↑</div>
            <p className="text-text-secondary text-sm font-medium mb-1">Drop .xlsx files here</p>
            <p className="text-text-muted text-[12px]">or click to browse</p>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map(f => (
                <div key={f.name} className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-text-primary font-medium">{f.name}</div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      {(f.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(f.name)}
                    className="text-text-muted hover:text-[#c05a5a] transition-colors text-sm px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
