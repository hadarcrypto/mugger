/**
 * Mugger Conditions Engine v0.001
 * Lightweight anomaly signal detection
 * Future versions will expand this into full scoring engine
 */

import type { Candle, Condition, ConditionState } from '../types'

// ─── Rolling statistics helpers ──────────────────────────────────────────────
function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stdDev(arr: number[]): number {
  const m = mean(arr)
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length)
}

// ─── Condition Detectors ──────────────────────────────────────────────────────

/** Volume spike: current volume > 2x rolling average */
function detectVolumeSpike(candles: Candle[]): ConditionState {
  if (candles.length < 20) return 'inactive'
  const recent = candles.slice(-20)
  const vols = recent.slice(0, -1).map(c => c.volume)
  const avgVol = mean(vols)
  const lastVol = candles[candles.length - 1].volume
  const ratio = lastVol / avgVol
  if (ratio > 3.0) return 'alert'
  if (ratio > 2.0) return 'active'
  if (ratio > 1.5) return 'watching'
  return 'inactive'
}

/** Volatility compression: ATR shrinking over last N candles */
function detectVolatilityCompression(candles: Candle[]): ConditionState {
  if (candles.length < 30) return 'inactive'
  const recent = candles.slice(-30)
  const atrs = recent.map(c => c.high - c.low)
  const firstHalf = mean(atrs.slice(0, 15))
  const secondHalf = mean(atrs.slice(15))
  const compressionRatio = secondHalf / firstHalf
  if (compressionRatio < 0.4) return 'alert'
  if (compressionRatio < 0.6) return 'active'
  if (compressionRatio < 0.75) return 'watching'
  return 'inactive'
}

/** Momentum shift: RSI-like divergence detection */
function detectMomentumShift(candles: Candle[]): ConditionState {
  if (candles.length < 20) return 'inactive'
  const recent = candles.slice(-20)
  const closes = recent.map(c => c.close)

  // Simple momentum: compare last 5 vs previous 5 price direction
  const prev5 = mean(closes.slice(10, 15))
  const last5 = mean(closes.slice(15))
  const curr = closes[closes.length - 1]

  const prevMom = last5 - prev5
  const currMom = curr - last5

  // Divergence: price moving opposite to momentum
  if (prevMom > 0 && currMom < prevMom * 0.3) return 'active'
  if (prevMom < 0 && currMom > prevMom * 0.3) return 'active'
  if (Math.abs(currMom) > Math.abs(prevMom) * 1.5) return 'watching'
  return 'inactive'
}

/** Price expansion: price breaks out of recent range */
function detectPriceExpansion(candles: Candle[]): ConditionState {
  if (candles.length < 20) return 'inactive'
  const recent = candles.slice(-20)
  const highs = recent.slice(0, -1).map(c => c.high)
  const lows = recent.slice(0, -1).map(c => c.low)
  const rangeHigh = Math.max(...highs)
  const rangeLow = Math.min(...lows)
  const last = candles[candles.length - 1]
  const range = rangeHigh - rangeLow

  if (last.close > rangeHigh + range * 0.02) return 'alert'
  if (last.close < rangeLow - range * 0.02) return 'alert'
  if (last.high > rangeHigh) return 'active'
  if (last.low < rangeLow) return 'active'
  if (last.close > rangeHigh * 0.998 || last.close < rangeLow * 1.002) return 'watching'
  return 'inactive'
}

/** Structure break: significant candle pattern */
function detectStructureBreak(candles: Candle[]): ConditionState {
  if (candles.length < 10) return 'inactive'
  const recent = candles.slice(-10)
  const closes = recent.map(c => c.close)
  const avgMove = stdDev(closes)
  const last = candles[candles.length - 1]
  const prev = candles[candles.length - 2]
  const move = Math.abs(last.close - prev.close)

  if (move > avgMove * 3) return 'alert'
  if (move > avgMove * 2) return 'active'
  if (move > avgMove * 1.5) return 'watching'
  return 'inactive'
}

// ─── Main condition evaluator ─────────────────────────────────────────────────
export function evaluateConditions(candles: Candle[]): Condition[] {
  if (candles.length === 0) {
    return getDefaultConditions()
  }

  return [
    {
      id: 'price_expansion',
      label: 'Price Expansion',
      description: 'Price breaking out of recent range structure',
      state: detectPriceExpansion(candles),
      value: candles.length > 0
        ? `${((candles[candles.length-1].close / candles[candles.length-2]?.close - 1) * 100).toFixed(2)}%`
        : undefined,
    },
    {
      id: 'volume_spike',
      label: 'Volume Spike',
      description: 'Abnormal volume relative to rolling baseline',
      state: detectVolumeSpike(candles),
    },
    {
      id: 'momentum_shift',
      label: 'Momentum Shift',
      description: 'Directional momentum change detected',
      state: detectMomentumShift(candles),
    },
    {
      id: 'volatility_compression',
      label: 'Volatility Compression',
      description: 'ATR contracting — potential expansion setup',
      state: detectVolatilityCompression(candles),
    },
    {
      id: 'structure_break',
      label: 'Structure Break',
      description: 'Significant candle relative to recent range',
      state: detectStructureBreak(candles),
    },
  ]
}

function getDefaultConditions(): Condition[] {
  const ids = [
    { id: 'price_expansion',        label: 'Price Expansion',        description: 'Price breaking out of recent range structure' },
    { id: 'volume_spike',           label: 'Volume Spike',           description: 'Abnormal volume relative to rolling baseline' },
    { id: 'momentum_shift',         label: 'Momentum Shift',         description: 'Directional momentum change detected' },
    { id: 'volatility_compression', label: 'Volatility Compression', description: 'ATR contracting — potential expansion setup' },
    { id: 'structure_break',        label: 'Structure Break',        description: 'Significant candle relative to recent range' },
  ]
  return ids.map(i => ({ ...i, state: 'inactive' as ConditionState }))
}

export function countActiveConditions(conditions: Condition[]): number {
  return conditions.filter(c => c.state === 'active' || c.state === 'alert').length
}
