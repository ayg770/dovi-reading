import { useEffect, useRef } from 'react'

const COLORS = ['#ff8a3d', '#5b8cff', '#2fbf71', '#ffd23f', '#ff5a8a', '#a66bff']

type Piece = { x: number; y: number; vx: number; vy: number; r: number; spin: number; color: string; size: number }

/** A burst of confetti each time `fire` changes (and is truthy). */
export function Confetti({ fire, big = false }: { fire: number; big?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    if (!fire || !el) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    el.width = window.innerWidth * dpr
    el.height = window.innerHeight * dpr
    ctx.scale(dpr, dpr)

    const count = big ? 160 : 60
    const pieces: Piece[] = Array.from({ length: count }, () => ({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * (big ? window.innerWidth : 120),
      y: big ? -20 - Math.random() * 200 : window.innerHeight * 0.45,
      vx: (Math.random() - 0.5) * (big ? 4 : 12),
      vy: big ? 2 + Math.random() * 3 : -8 - Math.random() * 8,
      r: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 6,
    }))

    let frame = 0
    let raf = 0
    const tick = () => {
      frame++
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      for (const p of pieces) {
        p.vy += 0.25
        p.vx *= 0.99
        p.x += p.vx
        p.y += p.vy
        p.r += p.spin
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.r)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (frame < (big ? 240 : 110)) raf = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [fire, big])

  return <canvas ref={canvas} className="confetti" aria-hidden />
}
