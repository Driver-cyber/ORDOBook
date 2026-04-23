export async function downloadJson(clientId, year) {
  const res = await fetch(`/api/clients/${clientId}/export/json/${year}`)
  if (!res.ok) throw new Error('Export failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${clientId}_${year}_export.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadPdf(clientId, exportType, year) {
  const res = await fetch(`/api/clients/${clientId}/export/pdf/${exportType}/${year}`)
  if (res.status === 503) {
    const data = await res.json()
    throw new Error(data.detail)
  }
  if (!res.ok) throw new Error('PDF export failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${clientId}_${year}_${exportType}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
