/**
 * Setup Generator — Mugger v0.020
 * When EDGE >= threshold, automatically calculates and draws:
 * Now returns rejection reason when setup cannot be generated.
 * - Entry level
 * - Stop loss
 * - TP1, TP2, TP3
 * Based on: cluster positions, ATR, RSI, CVD, funding direction
 */

import type { Candle, LiquidityMagnet, Timeframe } from '../types'

export interface SetupLevel {
  price: number
  type: 'entry' | 'stop' | 'tp1' | 'tp2' | 'tp3' | 'invalidation'
  label: string
  color: string
  lineStyle: 'solid' | 'dashed' | 'dotted'
}

export interface ActiveSetup {
  id: string
  direction: 'long' | 'short'
  timeframe: Timeframe
  edge: number
  entry: number
  stop: number
  tp1: number
  tp2: number
  tp3: number
  rr1: number
  rr2: number
  rr3: number
  leverage: string
  invalidation: number
  levels: SetupLevel[]
  createdAt: number
  status: 'active' | 'tp1_hit' | 'tp2_hit' | 'tp3_hit' | 'stopped' | 'invalidated'
  trigger: string   // what triggered this setup
}

// ATR calculation
function calcATR(candles: Candle[], period = 14): number {
  if (candles.length < period) return candles[candles.length-1]?.close * 0.015 || 100
  const trs = candles.slice(-period).map((c, i) => {
    if (i === 0) return c.high - c.low
    const prev = candles[candles.length - period + i - 1]
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close))
  })
  return trs.reduce((a, b) => a + b, 0) / period
}

function getLeverage(edge: number): string {
  if (edge >= 90) return 'x15–x20'
  if (edge >= 80) return 'x10–x15'
  if (edge >= 70) return 'x7–x10'
  return 'x5–x7'
}

function fmt(v: number): string {
  return v > 1000
    ? `$${v.toLocaleString('en', { maximumFractionDigits: 0 })}`
    : `$${v.toFixed(2)}`
}

let lastRejectionReason = ''
export function getLastRejectionReason(): string { return lastRejectionReason }

export function generateSetup(
  candles: Candle[],
  direction: 'long' | 'short',
  edge: number,
  timeframe: Timeframe,
  magnets: LiquidityMagnet[],
  fundingRate: number,
  longRatio: number
): ActiveSetup | null {
  if (candles.length < 20) return null

  const currentPrice = candles[candles.length - 1].close
  const atr = calcATR(candles, 14)

  // Find nearest upper and lower magnets
  const upperMagnets = magnets.filter(m => m.side === 'upper' && !m.finished)
    .sort((a, b) => a.price - b.price)
  const lowerMagnets = magnets.filter(m => m.side === 'lower' && !m.finished)
    .sort((a, b) => b.price - a.price)

  let entry: number, stop: number, tp1: number, tp2: number, tp3: number, invalidation: number

  if (direction === 'long') {
    // Entry: current price or just above lower magnet if swept
    const nearestLower = lowerMagnets[0]
    entry = nearestLower
      ? Math.max(currentPrice, nearestLower.priceLow + atr * 0.1)
      : currentPrice

    // Stop: below sweep low with buffer
    stop = nearestLower
      ? nearestLower.priceLow - atr * 0.3
      : currentPrice - atr * 0.8

    const risk = entry - stop

    // TP levels: next upper magnets or ATR multiples
    tp1 = upperMagnets[0]?.price ?? entry + risk * 1.5
    tp2 = upperMagnets[1]?.price ?? entry + risk * 2.5
    tp3 = upperMagnets[2]?.price ?? entry + risk * 3.5

    // Invalidation: if closes below stop on 15M
    invalidation = stop - atr * 0.1

  } else {
    // Short
    const nearestUpper = upperMagnets[0]
    entry = nearestUpper
      ? Math.min(currentPrice, nearestUpper.priceHigh - atr * 0.1)
      : currentPrice

    stop = nearestUpper
      ? nearestUpper.priceHigh + atr * 0.3
      : currentPrice + atr * 0.8

    const risk = stop - entry

    tp1 = lowerMagnets[0]?.price ?? entry - risk * 1.5
    tp2 = lowerMagnets[1]?.price ?? entry - risk * 2.5
    tp3 = lowerMagnets[2]?.price ?? entry - risk * 3.5

    invalidation = stop + atr * 0.1
  }

  const risk = Math.abs(entry - stop)
  const rr1 = Math.abs(tp1 - entry) / risk
  const rr2 = Math.abs(tp2 - entry) / risk
  const rr3 = Math.abs(tp3 - entry) / risk

  // Only accept if RR1 >= 1.5
  if (rr1 < 1.5) {
    lastRejectionReason = `RR1 ${rr1.toFixed(2)} < 1.5 (entry=${entry.toFixed(0)}, stop=${stop.toFixed(0)}, tp1=${tp1.toFixed(0)})`
    return null
  }

  const isLong = direction === 'long'
  const entryColor  = '#c8c8c8'
  const stopColor   = '#884040'
  const tp1Color    = '#508060'
  const tp2Color    = '#408858'
  const tp3Color    = '#309050'

  const levels: SetupLevel[] = [
    {
      price: entry, type: 'entry', lineStyle: 'solid', color: entryColor,
      label: `Entry ${fmt(entry)}`,
    },
    {
      price: stop, type: 'stop', lineStyle: 'dashed', color: stopColor,
      label: `SL ${fmt(stop)} · Risk ${fmt(risk)}`,
    },
    {
      price: tp1, type: 'tp1', lineStyle: 'dashed', color: tp1Color,
      label: `TP1 ${fmt(tp1)} · RR 1:${rr1.toFixed(1)} · 40%`,
    },
    {
      price: tp2, type: 'tp2', lineStyle: 'dashed', color: tp2Color,
      label: `TP2 ${fmt(tp2)} · RR 1:${rr2.toFixed(1)} · 40%`,
    },
    {
      price: tp3, type: 'tp3', lineStyle: 'dashed', color: tp3Color,
      label: `TP3 ${fmt(tp3)} · RR 1:${rr3.toFixed(1)} · 20%`,
    },
  ]

  // Build trigger description
  const fundStr = fundingRate < -0.0001 ? 'Funding neg' : fundingRate > 0.0001 ? 'Funding pos' : 'Funding neutral'
  const lsStr   = longRatio < 45 ? 'Crowd short' : longRatio > 55 ? 'Crowd long' : 'Crowd neutral'
  const trigger = `EDGE ${edge} · ${fundStr} · ${lsStr} · ${isLong ? 'Lower cluster sweep' : 'Upper cluster sweep'}`

  return {
    id: `setup-${Date.now()}`,
    direction,
    timeframe,
    edge,
    entry,
    stop,
    tp1, tp2, tp3,
    rr1, rr2, rr3,
    leverage: getLeverage(edge),
    invalidation,
    levels,
    createdAt: Date.now(),
    status: 'active',
    trigger,
  }
}

/**
 * Check if active setup should be updated
 */
export function updateSetupStatus(setup: ActiveSetup, currentPrice: number): ActiveSetup {
  const s = { ...setup }
  const isLong = s.direction === 'long'

  if (s.status === 'active') {
    const hitTP1 = isLong ? currentPrice >= s.tp1 : currentPrice <= s.tp1
    const hitStop = isLong ? currentPrice <= s.stop : currentPrice >= s.stop
    if (hitStop) s.status = 'stopped'
    else if (hitTP1) s.status = 'tp1_hit'
  } else if (s.status === 'tp1_hit') {
    const hitTP2 = isLong ? currentPrice >= s.tp2 : currentPrice <= s.tp2
    if (hitTP2) s.status = 'tp2_hit'
  } else if (s.status === 'tp2_hit') {
    const hitTP3 = isLong ? currentPrice >= s.tp3 : currentPrice <= s.tp3
    if (hitTP3) s.status = 'tp3_hit'
  }

  return s
}
