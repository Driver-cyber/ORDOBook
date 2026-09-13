import { useEffect, useRef, useState } from 'react'

/**
 * An always-visible horizontal scrollbar for a wide grid.
 *
 * macOS hides native scrollbars until you scroll ("Show scroll bars: when
 * scrolling"), and Chrome's app window follows that — so a 13-column grid gives
 * no hint that more columns sit to the right. This draws its own track + thumb
 * OUTSIDE the scroll box (place it right after it in the same flex column) and
 * keeps the two in sync both ways. It renders nothing when the grid fits.
 *
 *   const ref = useRef(null)
 *   <div ref={ref} className="flex-1 overflow-auto">…</div>
 *   <HScrollbar scrollRef={ref} />
 */
export default function HScrollbar({ scrollRef, inset = 32 }) {
  const trackRef = useRef(null)
  const [geom, setGeom] = useState({ ratio: 1, pos: 0 })   // thumb size / offset as fractions
  const drag = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const sync = () => {
      const { scrollWidth, clientWidth, scrollLeft } = el
      if (scrollWidth <= clientWidth + 1) { setGeom({ ratio: 1, pos: 0 }); return }
      setGeom({ ratio: clientWidth / scrollWidth, pos: scrollLeft / scrollWidth })
    }
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    // The table inside can change width after data loads.
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => { el.removeEventListener('scroll', sync); ro.disconnect() }
  }, [scrollRef])

  const onPointerDown = (e) => {
    const el = scrollRef.current, track = trackRef.current
    if (!el || !track) return
    const rect = track.getBoundingClientRect()
    const thumbLeft = rect.left + geom.pos * rect.width
    const thumbW = geom.ratio * rect.width
    if (e.clientX < thumbLeft || e.clientX > thumbLeft + thumbW) {
      // Click on the track: jump so the thumb centres under the pointer.
      el.scrollLeft = ((e.clientX - rect.left) / rect.width - geom.ratio / 2) * el.scrollWidth
    }
    drag.current = { startX: e.clientX, startLeft: el.scrollLeft, trackW: rect.width }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const el = scrollRef.current
    if (!drag.current || !el) return
    const dx = e.clientX - drag.current.startX
    el.scrollLeft = drag.current.startLeft + dx / drag.current.trackW * el.scrollWidth
  }
  const onPointerUp = () => { drag.current = null }

  if (geom.ratio >= 1) return null
  return (
    <div className="shrink-0 py-1.5" style={{ paddingLeft: inset, paddingRight: inset, background: 'inherit' }}>
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative h-2.5 rounded-full cursor-pointer select-none"
        style={{ background: 'rgba(0,0,0,0.06)', touchAction: 'none' }}
        title="Scroll the grid sideways"
      >
        <div
          className="absolute top-0 h-full rounded-full"
          style={{ left: `${geom.pos * 100}%`, width: `${Math.max(geom.ratio * 100, 4)}%`, background: '#b5afa7' }}
        />
      </div>
    </div>
  )
}
