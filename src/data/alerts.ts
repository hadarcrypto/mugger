/**
 * Alert Engine — Mugger v0.003
 * Sound + visual alerts when anomaly score exceeds threshold
 */

export interface Alert {
  id: string
  symbol: string
  score: number
  direction: 'long' | 'short' | 'neutral'
  message: string
  timestamp: number
  acknowledged: boolean
}

// Threshold for triggering alert
export const ALERT_THRESHOLD = 75

/**
 * Play alert sound — 3-tone ascending sequence
 * Mimics a cold terminal notification
 */
export function playAlertSound(intensity: 'low' | 'medium' | 'high' = 'medium'): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()

    const configs = {
      low:    [{ f: 660, t: 0, d: 0.12, v: 0.2 }, { f: 880, t: 0.15, d: 0.15, v: 0.18 }],
      medium: [{ f: 880, t: 0, d: 0.12, v: 0.3 }, { f: 1100, t: 0.15, d: 0.12, v: 0.28 }, { f: 1320, t: 0.30, d: 0.2, v: 0.35 }],
      high:   [{ f: 880, t: 0, d: 0.1, v: 0.4 }, { f: 1100, t: 0.12, d: 0.1, v: 0.38 }, { f: 1320, t: 0.25, d: 0.1, v: 0.45 }, { f: 1760, t: 0.38, d: 0.3, v: 0.5 }],
    }

    configs[intensity].forEach(({ f, t, d, v }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = f
      osc.type = 'sine'
      gain.gain.setValueAtTime(0, ctx.currentTime + t)
      gain.gain.linearRampToValueAtTime(v, ctx.currentTime + t + 0.02)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + t + d)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + d + 0.05)
    })
  } catch (e) {
    // AudioContext not available
  }
}

export function getAlertIntensity(score: number): 'low' | 'medium' | 'high' {
  if (score >= 90) return 'high'
  if (score >= 80) return 'medium'
  return 'low'
}

export function createAlert(symbol: string, score: number, direction: 'long' | 'short' | 'neutral'): Alert {
  const dirLabel = direction === 'long' ? '↑ Long' : direction === 'short' ? '↓ Short' : '→ Neutral'
  return {
    id: `${symbol}-${Date.now()}`,
    symbol,
    score,
    direction,
    message: `${symbol} — Score ${score} — ${dirLabel} anomaly detected`,
    timestamp: Date.now(),
    acknowledged: false,
  }
}
