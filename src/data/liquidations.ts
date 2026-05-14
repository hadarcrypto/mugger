/**
 * Forward Liquidation Engine — Mugger v0.003
 *
 * Estimates WHERE liquidations are concentrated AHEAD of current price.
 * These are positions that haven't been hit yet — where the market will go
 * to collect them.
 *
 * Algorithm:
 * 1. Estimate typical leverage used (from funding rate extremes)
 * 2. Calculate liquidation distances from current price
 * 3. Find price levels where clustered positions will be force-closed
 * 4. Weight by open interest and historical volume at those levels
 *
 * Sources:
 * - Binance OI distribution (public)
 * - Funding rate to estimate leverage sentiment
 * - Price structure to find accumulation zones
 */

import type { Candle } from '../types'

export interface LiquidationZone {
  price: number
  side: 'long_liq' | 'short_liq'   // long_liq = where longs get liquidated (below), short_liq = where shorts get liquidated (above)
  estimatedUSD: number
  leverage: number                   // estimated leverage that gets liquidated here
  distancePct: number
  label: string
  intensity: 'light' | 'medium' | 'heavy' | 'extreme'
}

const LEVERAGE_LEVELS = [5, 10, 15, 20, 25, 50, 100]

function intensityFromUSD(usd: number): LiquidationZone['intensity'] {
  if (usd > 500e6)  return 'extreme'
  if (usd > 100e6)  return 'heavy'
  if (usd > 20e6)   return 'medium'
  return 'light'
}

function fmtUSD(usd: number): string {
  if (usd >= 1e9) return `$${(usd/1e9).toFixed(1)}B`
  if (usd >= 1e6) return `$${(usd/1e6).toFixed(0)}M`
  return `$${(usd/1e3).toFixed(0)}K`
}

/**
 * Estimate open interest distribution across leverage levels
 * Based on typical market structure: most traders use 10-25x
 */
function estimateOIByLeverage(totalOI: number, fundingRate: number): Map<number, number> {
  const dist = new Map<number, number>()

  // When funding is extreme positive — more longs, higher leverage sentiment
  // When extreme negative — more shorts at high leverage
  const leverageBias = Math.abs(fundingRate) > 0.0002 ? 1.4 : 1.0

  // Distribution weights by leverage (most common in crypto perps)
  const weights: Record<number, number> = {
    5:   0.08,
    10:  0.25,
    15:  0.18,
    20:  0.22 * leverageBias,
    25:  0.14 * leverageBias,
    50:  0.09,
    100: 0.04,
  }

  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  LEVERAGE_LEVELS.forEach(lev => {
    dist.set(lev, totalOI * (weights[lev] / total))
  })

  return dist
}

/**
 * Generate forward liquidation zones
 */
export function generateLiquidationZones(
  currentPrice: number,
  openInterest: number,
  fundingRate: number,
  candles: Candle[],
  longRatio: number   // 0-100
): LiquidationZone[] {
  if (currentPrice === 0 || openInterest === 0) return []

  const zones: LiquidationZone[] = []
  const oiByLev = estimateOIByLeverage(openInterest, fundingRate)

  // Long positions get liquidated BELOW current price
  // At leverage X, liquidation is approximately at: price * (1 - 1/leverage * 0.9)
  const longFraction = longRatio / 100
  const shortFraction = 1 - longFraction

  LEVERAGE_LEVELS.forEach(lev => {
    const oiAtLev = oiByLev.get(lev) ?? 0

    // Long liquidation level (below current price)
    const longLiqPct = (1 / lev) * 0.92  // 0.92 = maintenance margin buffer
    const longLiqPrice = currentPrice * (1 - longLiqPct)
    const longLiqUSD = oiAtLev * longFraction

    if (longLiqUSD > 5e6) {  // Only show zones > $5M
      zones.push({
        price:        longLiqPrice,
        side:         'long_liq',
        estimatedUSD: longLiqUSD,
        leverage:     lev,
        distancePct:  ((longLiqPrice - currentPrice) / currentPrice) * 100,
        label:        `${fmtUSD(longLiqUSD)} x${lev}`,
        intensity:    intensityFromUSD(longLiqUSD),
      })
    }

    // Short liquidation level (above current price)
    const shortLiqPct = (1 / lev) * 0.92
    const shortLiqPrice = currentPrice * (1 + shortLiqPct)
    const shortLiqUSD = oiAtLev * shortFraction

    if (shortLiqUSD > 5e6) {
      zones.push({
        price:        shortLiqPrice,
        side:         'short_liq',
        estimatedUSD: shortLiqUSD,
        leverage:     lev,
        distancePct:  ((shortLiqPrice - currentPrice) / currentPrice) * 100,
        label:        `${fmtUSD(shortLiqUSD)} x${lev}`,
        intensity:    intensityFromUSD(shortLiqUSD),
      })
    }
  })

  // Also check candle structure for historical accumulation zones ahead
  if (candles.length >= 50) {
    const recent = candles.slice(-50)
    const priceHigh = Math.max(...recent.map(c => c.high))
    const priceLow  = Math.min(...recent.map(c => c.low))

    // High volume zones above current price = short squeeze targets
    const aboveCandles = recent.filter(c => c.low > currentPrice * 1.005)
    aboveCandles.forEach(c => {
      const avgVol = recent.reduce((s, x) => s + x.volume, 0) / recent.length
      if (c.volume > avgVol * 1.8) {
        zones.push({
          price:        (c.high + c.low) / 2,
          side:         'short_liq',
          estimatedUSD: openInterest * 0.03 * (c.volume / avgVol),
          leverage:     20,
          distancePct:  (((c.high + c.low) / 2 - currentPrice) / currentPrice) * 100,
          label:        `${fmtUSD(openInterest * 0.03)} vol cluster`,
          intensity:    'medium',
        })
      }
    })

    // High volume zones below = long liquidation targets
    const belowCandles = recent.filter(c => c.high < currentPrice * 0.995)
    belowCandles.forEach(c => {
      const avgVol = recent.reduce((s, x) => s + x.volume, 0) / recent.length
      if (c.volume > avgVol * 1.8) {
        zones.push({
          price:        (c.high + c.low) / 2,
          side:         'long_liq',
          estimatedUSD: openInterest * 0.03 * (c.volume / avgVol),
          leverage:     20,
          distancePct:  (((c.high + c.low) / 2 - currentPrice) / currentPrice) * 100,
          label:        `${fmtUSD(openInterest * 0.03)} vol cluster`,
          intensity:    'medium',
        })
      }
    })
  }

  // Sort by distance from price, deduplicate close zones
  const sorted = zones.sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))

  // Merge zones within 0.3% of each other
  const merged: LiquidationZone[] = []
  sorted.forEach(z => {
    const existing = merged.find(m => m.side === z.side && Math.abs(m.price - z.price) / z.price < 0.003)
    if (existing) {
      existing.estimatedUSD += z.estimatedUSD
      existing.intensity = intensityFromUSD(existing.estimatedUSD)
      existing.label = fmtUSD(existing.estimatedUSD) + ` x${existing.leverage}`
    } else {
      merged.push({ ...z })
    }
  })

  return merged.slice(0, 16)  // Max 16 zones
}

export function getLiqZoneColor(zone: LiquidationZone): string {
  const isLong = zone.side === 'long_liq'
  const alpha = zone.intensity === 'extreme' ? 0.55
    : zone.intensity === 'heavy'   ? 0.42
    : zone.intensity === 'medium'  ? 0.28
    : 0.16

  return isLong
    ? `rgba(20, 80, 40, ${alpha})`   // green — long liq below
    : `rgba(110, 25, 25, ${alpha})`  // red — short liq above
}

export function getLiqZoneBorder(zone: LiquidationZone): string {
  const isLong = zone.side === 'long_liq'
  const alpha = zone.intensity === 'extreme' ? 0.8
    : zone.intensity === 'heavy'   ? 0.6
    : zone.intensity === 'medium'  ? 0.4
    : 0.25

  return isLong
    ? `rgba(40, 140, 65, ${alpha})`
    : `rgba(180, 45, 45, ${alpha})`
}
