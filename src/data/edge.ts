/**
 * Mugger Edge Engine v0.020
 * Separate edge formulas for Day Trading (1m–15m) and Swing (1h–1d)
 * Fixes correlation penalty: funding + L/S are not independent signals
 */

import type { Candle, LongShortData, Timeframe } from '../types'
import type { LiqCluster } from './liqstream'
import type { CVDPoint } from '../types'

export type TradeMode = 'DT' | 'ST'

export function getModeForTimeframe(tf: Timeframe): TradeMode {
  return tf === '1m' || tf === '5m' || tf === '15m' ? 'DT' : 'ST'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function clamp(v: number, max: number): number {
  return Math.min(max, Math.max(0, v))
}

// ─── Shared signals ───────────────────────────────────────────────────────────

/** Volume spike: current vs 20-candle rolling avg. Returns 0–30 */
function scoreVolumeSpike(candles: Candle[]): number {
  if (candles.length < 21) return 0
  const vols = candles.slice(-21, -1).map(c => c.volume)
  const avg = mean(vols)
  if (avg === 0) return 0
  const ratio = candles[candles.length - 1].volume / avg
  if (ratio >= 5) return 30
  if (ratio >= 3) return 22
  if (ratio >= 2) return 14
  if (ratio >= 1.5) return 6
  return 0
}

/**
 * Funding + L/S with correlation penalty.
 * If both signals point the same direction they are NOT independent —
 * cap their combined contribution to avoid double-counting.
 * Returns 0–35 for Swing, 0–20 for DT.
 */
function scoreDerivatives(
  funding: number,
  ls: LongShortData | null,
  mode: TradeMode
): { score: number; direction: 'long' | 'short' | 'neutral' } {
  const maxScore = mode === 'ST' ? 35 : 20

  const fundingAbs = Math.abs(funding)
  let fundingScore = clamp(fundingAbs / 0.0004 * (maxScore * 0.6), maxScore * 0.6)
  if (fundingAbs > 0.0005) fundingScore = maxScore * 0.6  // extreme cap

  const lsDelta = ls ? Math.abs(ls.longAccount - 50) : 0
  let lsScore = clamp(lsDelta / 20 * (maxScore * 0.5), maxScore * 0.5)

  // Determine direction from funding first, then L/S
  let fundDir: 'long' | 'short' | 'neutral' = 'neutral'
  if (funding < -0.0001) fundDir = 'long'
  else if (funding > 0.0001) fundDir = 'short'

  let lsDir: 'long' | 'short' | 'neutral' = 'neutral'
  if (ls) {
    if (ls.longAccount < 45) lsDir = 'long'
    else if (ls.longAccount > 55) lsDir = 'short'
  }

  // Correlation penalty: if both signals agree, they are correlated
  // cap total at 55% of max (not 100%) since the signals share information
  const correlated = fundDir !== 'neutral' && lsDir !== 'neutral' && fundDir === lsDir
  const rawScore = fundingScore + lsScore
  const finalScore = correlated
    ? clamp(rawScore * 0.65, maxScore)  // penalty: not independent
    : clamp(rawScore, maxScore)

  // Consensus direction
  let direction: 'long' | 'short' | 'neutral' = 'neutral'
  if (fundDir === lsDir && fundDir !== 'neutral') direction = fundDir
  else if (fundDir !== 'neutral') direction = fundDir
  else direction = lsDir

  return { score: Math.round(finalScore), direction }
}

// ─── DAY TRADING edge (1m / 5m / 15m) ────────────────────────────────────────
// Formula: Volume(30) + CVD divergence(25) + Liq cluster proximity(25) + Derivatives(20)
// 24h price change is NOT used — irrelevant for intraday setups

export interface DTEdgeInput {
  candles: Candle[]
  cvd: CVDPoint[]
  funding: number
  ls: LongShortData | null
  currentPrice: number
  liqClusters: LiqCluster[]
}

export interface EdgeResult {
  score: number
  direction: 'long' | 'short' | 'neutral'
  breakdown: {
    volume: number
    cvdDivergence: number
    liqProximity: number
    derivatives: number
    correlationPenalty: boolean
  }
  mode: TradeMode
}

/** CVD divergence: price moving one way, cumulative volume delta moving opposite. Returns 0–25 */
function scoreCVDDivergence(candles: Candle[], cvd: CVDPoint[]): number {
  if (candles.length < 10 || cvd.length < 10) return 0
  const recentCandles = candles.slice(-10)
  const recentCVD = cvd.slice(-10)

  const priceChange = recentCandles[recentCandles.length - 1].close - recentCandles[0].close
  const cvdChange = recentCVD[recentCVD.length - 1].value - recentCVD[0].value

  // Divergence: price and CVD moving in opposite directions
  if (priceChange === 0 || cvdChange === 0) return 0
  const diverging = (priceChange > 0 && cvdChange < 0) || (priceChange < 0 && cvdChange > 0)
  if (!diverging) return 0

  // Score by magnitude of divergence
  const pricePct = Math.abs(priceChange / recentCandles[0].close) * 100
  const cvdMagnitude = Math.abs(cvdChange)

  if (pricePct > 1.0 && cvdMagnitude > 1000000) return 25
  if (pricePct > 0.5 && cvdMagnitude > 500000) return 18
  if (pricePct > 0.2) return 10
  return 5
}

/** Liquidity cluster proximity: cluster within 0.5% of current price. Returns 0–25 */
function scoreLiqProximity(currentPrice: number, clusters: LiqCluster[]): number {
  if (!clusters.length || currentPrice === 0) return 0
  const nearby = clusters.filter(c => {
    const dist = Math.abs(c.midPrice - currentPrice) / currentPrice * 100
    return dist <= 0.5
  })
  if (nearby.length === 0) {
    // Check within 1% for partial score
    const close = clusters.filter(c => {
      const dist = Math.abs(c.midPrice - currentPrice) / currentPrice * 100
      return dist <= 1.0
    })
    return close.length > 0 ? 10 : 0
  }
  // Multiple clusters nearby = higher score
  if (nearby.length >= 3) return 25
  if (nearby.length === 2) return 20
  return 15
}

export function calcDTEdge(input: DTEdgeInput): EdgeResult {
  const volumeScore = scoreVolumeSpike(input.candles)
  const cvdScore = scoreCVDDivergence(input.candles, input.cvd)
  const liqScore = scoreLiqProximity(input.currentPrice, input.liqClusters)
  const { score: derivScore, direction } = scoreDerivatives(input.funding, input.ls, 'DT')

  // Check correlation for reporting
  const fundDir = input.funding < -0.0001 ? 'long' : input.funding > 0.0001 ? 'short' : 'neutral'
  const lsDir = input.ls
    ? (input.ls.longAccount < 45 ? 'long' : input.ls.longAccount > 55 ? 'short' : 'neutral')
    : 'neutral'
  const correlationPenalty = fundDir !== 'neutral' && lsDir !== 'neutral' && fundDir === lsDir

  const total = Math.min(100, volumeScore + cvdScore + liqScore + derivScore)

  return {
    score: total,
    direction,
    breakdown: {
      volume: volumeScore,
      cvdDivergence: cvdScore,
      liqProximity: liqScore,
      derivatives: derivScore,
      correlationPenalty,
    },
    mode: 'DT',
  }
}

// ─── SWING TRADING edge (30m / 1h / 4h / 1d) ─────────────────────────────────
// Formula: Derivatives(35) + RSI extreme(20) + Volatility regime(15) + Volume(20) + Change24h(10)

export interface STEdgeInput {
  candles: Candle[]
  funding: number
  ls: LongShortData | null
  rsi: number
  change24h: number
  weights: {
    funding: number
    crowdSkew: number
    rsiExtreme: number
    volumeSpike: number
    volatility: number
  }
}

/** RSI extreme: oversold/overbought. Returns 0–20 */
function scoreRSI(rsi: number): number {
  if (rsi <= 20 || rsi >= 80) return 20
  if (rsi <= 25 || rsi >= 75) return 15
  if (rsi <= 30 || rsi >= 70) return 10
  if (rsi <= 35 || rsi >= 65) return 5
  return 0
}

/** Volatility regime: compressed ATR = potential expansion. Returns 0–15 */
function scoreVolatility(candles: Candle[]): number {
  if (candles.length < 30) return 0
  const atrs = candles.slice(-30).map(c => c.high - c.low)
  const first = mean(atrs.slice(0, 15))
  const second = mean(atrs.slice(15))
  if (first === 0) return 0
  const ratio = second / first
  if (ratio < 0.4) return 15
  if (ratio < 0.6) return 10
  if (ratio < 0.75) return 5
  return 0
}

/** 24h change contribution for swing. Returns 0–10 */
function scoreChange24h(change24h: number): number {
  const abs = Math.abs(change24h)
  if (abs >= 10) return 10
  if (abs >= 5) return 7
  if (abs >= 3) return 4
  return 0
}

export function calcSTEdge(input: STEdgeInput): EdgeResult {
  const { score: derivScore, direction } = scoreDerivatives(input.funding, input.ls, 'ST')
  const rsiScore = scoreRSI(input.rsi) * (input.weights.rsiExtreme ?? 1)
  const volScore = scoreVolatility(input.candles) * (input.weights.volatility ?? 1)
  const volumeScore = scoreVolumeSpike(input.candles) * (input.weights.volumeSpike ?? 1)
  const changeScore = scoreChange24h(input.change24h)

  const fundDir = input.funding < -0.0001 ? 'long' : input.funding > 0.0001 ? 'short' : 'neutral'
  const lsDir = input.ls
    ? (input.ls.longAccount < 45 ? 'long' : input.ls.longAccount > 55 ? 'short' : 'neutral')
    : 'neutral'
  const correlationPenalty = fundDir !== 'neutral' && lsDir !== 'neutral' && fundDir === lsDir

  const total = Math.min(100, Math.round(derivScore + rsiScore + volScore + volumeScore + changeScore))

  return {
    score: total,
    direction,
    breakdown: {
      volume: Math.round(volumeScore),
      cvdDivergence: 0,
      liqProximity: 0,
      derivatives: derivScore,
      correlationPenalty,
    },
    mode: 'ST',
  }
}

// ─── Direction from RSI fallback ──────────────────────────────────────────────
export function getDirectionWithRSI(
  funding: number,
  ls: LongShortData | null,
  rsi: number
): 'long' | 'short' | 'neutral' {
  if (funding < -0.0001 && (ls?.longAccount ?? 50) < 50) return 'long'
  if (funding > 0.0001 && (ls?.longAccount ?? 50) > 55) return 'short'
  if (rsi <= 30) return 'long'
  if (rsi >= 70) return 'short'
  return 'neutral'
}
