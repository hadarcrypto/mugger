/**
 * CVD Engine — Cumulative Volume Delta
 * Same calculation as TradingView CVD indicator
 * Delta = Buy Volume - Sell Volume per candle
 * CVD = cumulative sum of deltas
 */

import type { Candle } from '../types'

export interface CVDPoint {
  time: number
  value: number
  delta: number    // single candle delta
  buyVol: number
  sellVol: number
}

/**
 * Estimate buy/sell volume split from OHLCV candle
 * Method: price position within candle range determines buy/sell ratio
 * Close near high = more buying, close near low = more selling
 */
function estimateBuySell(c: Candle): { buy: number; sell: number } {
  const range = c.high - c.low
  if (range === 0) return { buy: c.volume / 2, sell: c.volume / 2 }

  // Position of close within range (0 = at low, 1 = at high)
  const closePos = (c.close - c.low) / range

  // Bullish candle: more buy pressure
  const isBullish = c.close >= c.open
  const openPos = (c.open - c.low) / range

  let buyRatio: number
  if (isBullish) {
    // Close above open — bias toward buying
    buyRatio = 0.5 + (closePos - openPos) * 0.5 + closePos * 0.2
  } else {
    // Close below open — bias toward selling
    buyRatio = 0.5 + (closePos - openPos) * 0.5 + closePos * 0.1
  }

  buyRatio = Math.max(0.1, Math.min(0.9, buyRatio))

  return {
    buy:  c.volume * buyRatio,
    sell: c.volume * (1 - buyRatio),
  }
}

export function calculateCVD(candles: Candle[]): CVDPoint[] {
  if (candles.length === 0) return []

  let cumulative = 0
  return candles.map(c => {
    const { buy, sell } = estimateBuySell(c)
    const delta = buy - sell
    cumulative += delta
    return {
      time:    c.time,
      value:   cumulative,
      delta,
      buyVol:  buy,
      sellVol: sell,
    }
  })
}

export function getCurrentCVDDelta(candles: Candle[], lookback = 5): number {
  if (candles.length < lookback) return 0
  const recent = candles.slice(-lookback)
  const cvd = calculateCVD(recent)
  return cvd[cvd.length - 1]?.value ?? 0
}

export function getCVDTrend(candles: Candle[]): 'bullish' | 'bearish' | 'neutral' {
  if (candles.length < 10) return 'neutral'
  const cvd = calculateCVD(candles.slice(-20))
  if (cvd.length < 2) return 'neutral'
  const first = cvd[0].value
  const last  = cvd[cvd.length - 1].value
  const diff  = last - first
  const threshold = Math.abs(first) * 0.05
  if (diff > threshold) return 'bullish'
  if (diff < -threshold) return 'bearish'
  return 'neutral'
}
