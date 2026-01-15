import { useEffect, useRef } from 'react'

interface WaveAnimationProps {
  className?: string
}

interface OrbitingLine {
  latitude: number
  longitude: number
  speed: number
  arcLength: number
  intensity: number
  direction: number
  phase: number
}

export function WaveAnimation({ className = '' }: WaveAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    let animationId: number
    let width = 0
    let height = 0
    let globeRotation = 0

    // Initialize 10 orbiting neon lines
    const lines: OrbitingLine[] = Array.from({ length: 10 }, () => ({
      latitude: Math.PI * 0.12 + Math.random() * Math.PI * 0.76,
      longitude: Math.random() * Math.PI * 2,
      speed: 0.008 + Math.random() * 0.018,
      arcLength: 0.4 + Math.random() * 0.6,
      intensity: 0.75 + Math.random() * 0.25,
      direction: Math.random() > 0.5 ? 1 : -1,
      phase: Math.random() * Math.PI * 2,
    }))

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)
    }

    resize()

    // Project spherical coordinates to 2D with rotation
    const project = (
      lat: number,
      lon: number,
      radius: number,
      cx: number,
      cy: number,
      rotation: number
    ): { x: number; y: number; z: number } => {
      const adjustedLon = lon + rotation
      const x = radius * Math.sin(lat) * Math.cos(adjustedLon)
      const y = radius * Math.cos(lat)
      const z = radius * Math.sin(lat) * Math.sin(adjustedLon)
      return { x: cx + x, y: cy + y, z }
    }

    // Draw a smooth arc with glow and depth fading
    const drawNeonArc = (
      line: OrbitingLine,
      radius: number,
      cx: number,
      cy: number,
      rotation: number
    ) => {
      const segments = 40
      const points: { x: number; y: number; z: number; t: number }[] = []

      // Collect visible points
      for (let i = 0; i <= segments; i++) {
        const t = i / segments
        const lon = line.longitude + t * line.arcLength * line.direction
        const point = project(line.latitude, lon, radius, cx, cy, rotation)
        points.push({ ...point, t })
      }

      // Draw glow layer (outer)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // Multi-pass glow for neon effect
      const glowLayers = [
        { blur: 12, alpha: 0.08, width: 8 },
        { blur: 6, alpha: 0.15, width: 5 },
        { blur: 2, alpha: 0.25, width: 3 },
      ]

      for (const glow of glowLayers) {
        ctx.save()
        ctx.shadowBlur = glow.blur
        ctx.shadowColor = `rgba(220, 220, 235, ${line.intensity * 0.6})`
        ctx.lineWidth = glow.width

        ctx.beginPath()
        let drawing = false
        let prevPoint: (typeof points)[0] | null = null

        for (const point of points) {
          // Occlusion: hide when behind globe
          const visibility = (point.z + radius) / (2 * radius)
          if (visibility < 0.35) {
            drawing = false
            prevPoint = null
            continue
          }

          const depthFade = Math.pow(visibility, 1.5)
          const endFade = Math.sin(point.t * Math.PI)
          const alpha = line.intensity * depthFade * endFade * glow.alpha

          if (alpha < 0.02) {
            drawing = false
            prevPoint = null
            continue
          }

          const gray = Math.floor(200 + line.intensity * 55 * depthFade)
          ctx.strokeStyle = `rgba(${gray}, ${gray}, ${Math.min(255, gray + 15)}, ${alpha})`

          if (!drawing) {
            ctx.moveTo(point.x, point.y)
            drawing = true
          } else if (prevPoint) {
            ctx.lineTo(point.x, point.y)
          }
          prevPoint = point
        }
        ctx.stroke()
        ctx.restore()
      }

      // Core bright line
      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineWidth = 1.5

      ctx.beginPath()
      let drawing = false
      let prevVisible = false

      for (let i = 0; i < points.length; i++) {
        const point = points[i]
        const visibility = (point.z + radius) / (2 * radius)

        if (visibility < 0.35) {
          if (prevVisible) {
            ctx.stroke()
            ctx.beginPath()
          }
          drawing = false
          prevVisible = false
          continue
        }

        const depthFade = Math.pow(visibility, 1.3)
        const endFade = Math.sin(point.t * Math.PI)
        const alpha = line.intensity * depthFade * endFade * 0.95

        if (alpha < 0.05) {
          if (prevVisible) {
            ctx.stroke()
            ctx.beginPath()
          }
          drawing = false
          prevVisible = false
          continue
        }

        const brightness = Math.floor(230 + depthFade * 25)
        ctx.strokeStyle = `rgba(${brightness}, ${brightness}, 255, ${alpha})`
        ctx.shadowBlur = 3
        ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.5})`

        if (!drawing) {
          ctx.moveTo(point.x, point.y)
          drawing = true
        } else {
          ctx.lineTo(point.x, point.y)
        }
        prevVisible = true
      }
      ctx.stroke()
      ctx.restore()
    }

    // Draw wireframe globe
    const drawWireframe = (radius: number, cx: number, cy: number, rotation: number) => {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)'
      ctx.lineWidth = 0.5

      // Latitude circles
      const latCount = 7
      for (let i = 1; i < latCount; i++) {
        const lat = (Math.PI * i) / latCount
        ctx.beginPath()
        let started = false

        for (let lon = 0; lon <= Math.PI * 2 + 0.1; lon += 0.08) {
          const point = project(lat, lon, radius, cx, cy, rotation)
          const visibility = (point.z + radius) / (2 * radius)

          if (visibility > 0.3) {
            const fade = Math.pow(visibility, 0.8)
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.025 * fade})`

            if (!started) {
              ctx.moveTo(point.x, point.y)
              started = true
            } else {
              ctx.lineTo(point.x, point.y)
            }
          } else {
            if (started) {
              ctx.stroke()
              ctx.beginPath()
              started = false
            }
          }
        }
        ctx.stroke()
      }

      // Longitude meridians
      const lonCount = 12
      for (let i = 0; i < lonCount; i++) {
        const lon = (Math.PI * 2 * i) / lonCount
        ctx.beginPath()
        let started = false

        for (let lat = 0.15; lat <= Math.PI - 0.15; lat += 0.08) {
          const point = project(lat, lon, radius, cx, cy, rotation)
          const visibility = (point.z + radius) / (2 * radius)

          if (visibility > 0.3) {
            const fade = Math.pow(visibility, 0.8)
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.025 * fade})`

            if (!started) {
              ctx.moveTo(point.x, point.y)
              started = true
            } else {
              ctx.lineTo(point.x, point.y)
            }
          } else {
            if (started) {
              ctx.stroke()
              ctx.beginPath()
              started = false
            }
          }
        }
        ctx.stroke()
      }
    }

    // Draw atmosphere glow
    const drawAtmosphere = (radius: number, cx: number, cy: number) => {
      const gradient = ctx.createRadialGradient(cx, cy, radius * 0.85, cx, cy, radius * 1.25)
      gradient.addColorStop(0, 'rgba(180, 180, 200, 0)')
      gradient.addColorStop(0.4, 'rgba(200, 200, 220, 0.012)')
      gradient.addColorStop(0.7, 'rgba(220, 220, 240, 0.008)')
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 1.25, 0, Math.PI * 2)
      ctx.fill()
    }

    const draw = () => {
      // Deep black background
      ctx.fillStyle = '#050507'
      ctx.fillRect(0, 0, width, height)

      const cx = width / 2
      const cy = height / 2
      const radius = Math.min(width, height) * 0.36

      // Slow globe rotation for subtle movement
      globeRotation += 0.002

      // Draw atmosphere first (behind everything)
      drawAtmosphere(radius, cx, cy)

      // Draw wireframe grid
      drawWireframe(radius, cx, cy, globeRotation)

      // Update and draw orbiting lines
      for (const line of lines) {
        line.longitude += line.speed * line.direction
        if (line.longitude > Math.PI * 2) line.longitude -= Math.PI * 2
        if (line.longitude < 0) line.longitude += Math.PI * 2

        drawNeonArc(line, radius, cx, cy, globeRotation)
      }

      // Center highlight spot
      const spotGradient = ctx.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.3,
        0,
        cx,
        cy,
        radius
      )
      spotGradient.addColorStop(0, 'rgba(255, 255, 255, 0.015)')
      spotGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = spotGradient
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()

      animationId = requestAnimationFrame(draw)
    }

    draw()

    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  )
}

export { WaveAnimation as default }
