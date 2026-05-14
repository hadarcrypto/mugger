/**
 * RSI Engine — exact same formula used by MEXC and TradingView
 * Wilder's Smoothed Moving Average (SMMA)
 */

import type { Candle, RSIData } from '../types'

/**
 * Calculate RSI using Wilder's SMMA method
 * This matches exactly what MEXC shows on their charts
 */
export function calculateRSI(candles: Candle[], period = 14): RSIData[] {
  if (candles.length < period + 1) return []

  const closes = candles.map(c => c.close)
  const result: RSIData[] = []

  // Step 1: Calculate price changes
  const changes = closes.slice(1).map((c, i) => c - closes[i])

  // Step 2: First average gain/loss (simple average for seed)
  let avgGain = 0
  let avgLoss = 0

  for (let i = 0; i < period; i++) {
    if (changes[i] >= 0) avgGain += changes[i]
    else avgLoss += Math.abs(changes[i])
  }

  avgGain /= period
  avgLoss /= period

  // First RSI value
  const firstRSI = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  result.push({
    time: candles[period].time,
    value: Math.round(firstRSI * 100) / 100,
  })

  // Step 3: Wilder's SMMA for remaining values
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] >= 0 ? changes[i] : 0
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0

    // Wilder's smoothing: (prevAvg * (period-1) + current) / period
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period

    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    result.push({
      time: candles[i + 1].time,
      value: Math.round(rsi * 100) / 100,
    })
  }

  return result
}

/**
 * Get current RSI value (last calculated)
 */
export function getCurrentRSI(candles: Candle[], period = 14): number {
  const rsiData = calculateRSI(candles, period)
  if (rsiData.length === 0) return 50
  return rsiData[rsiData.length - 1].value
}

/**
 * RSI state classification
 */
export function getRSIState(rsi: number): {
  label: string
  color: string
  zone: 'oversold' | 'depressed' | 'neutral' | 'elevated' | 'overbought'
} {
  if (rsi >= 80) return { label: 'Overbought', color: '#ff6666', zone: 'overbought' }
  if (rsi >= 70) return { label: 'Elevated',   color: '#d8d8d8', zone: 'elevated' }
  if (rsi <= 20) return { label: 'Oversold',   color: '#88aaff', zone: 'oversold' }
  if (rsi <= 30) return { label: 'Depressed',  color: '#b8b8ff', zone: 'depressed' }
  return { label: 'Neutral', color: '#888888', zone: 'neutral' }
}

/**
 * Double signal: RSI + Funding alignment
 */
export function getDoubleSignal(rsi: number, fundingRate: number): string | null {
  if (rsi >= 70 && fundingRate > 0.0001) return '⚠ Exhaustion — RSI overbought + positive funding'
  if (rsi <= 30 && fundingRate < -0.0001) return '⚡ Squeeze — RSI oversold + negative funding'
  if (rsi >= 70) return 'RSI overbought only'
  if (rsi <= 30) return 'RSI oversold only'
  return null
}
