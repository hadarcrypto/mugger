/**
 * Asset Scanner v0.020
 * - 50+ assets, anomaly-first sorting
 * - Separate DT / ST edge scoring with correlation penalty
 * - Tier system: alert / watch / neutral
 */

import { fetchTicker, fetchFundingRate, fetchLongShortRatio } from './api'

export type AnomalyTier = 'alert' | 'watch' | 'neutral'

export interface ScannedAsset {
  symbol: string
  name: string
  price: number
  change24h: number
  fundingRate: number
  longRatio: number
  dtEdge: number
  stEdge: number
  direction: 'long' | 'short' | 'neutral'
  tier: AnomalyTier
  reason: string
  type: 'DT' | 'ST' | 'both'
}

const CORE_LIST = [
  { symbol: 'BTCUSDT',    name: 'BTC' },
  { symbol: 'ETHUSDT',    name: 'ETH' },
  { symbol: 'SOLUSDT',    name: 'SOL' },
  { symbol: 'BNBUSDT',    name: 'BNB' },
  { symbol: 'XRPUSDT',    name: 'XRP' },
  { symbol: 'ADAUSDT',    name: 'ADA' },
  { symbol: 'DOGEUSDT',   name: 'DOGE' },
  { symbol: 'AVAXUSDT',   name: 'AVAX' },
  { symbol: 'LINKUSDT',   name: 'LINK' },
  { symbol: 'DOTUSDT',    name: 'DOT' },
  { symbol: 'ATOMUSDT',   name: 'ATOM' },
  { symbol: 'NEARUSDT',   name: 'NEAR' },
  { symbol: 'APTUSDT',    name: 'APT' },
  { symbol: 'LTCUSDT',    name: 'LTC' },
  { symbol: 'UNIUSDT',    name: 'UNI' },
  { symbol: 'AAVEUSDT',   name: 'AAVE' },
  { symbol: 'INJUSDT',    name: 'INJ' },
  { symbol: 'OPUSDT',     name: 'OP' },
  { symbol: 'ARBUSDT',    name: 'ARB' },
  { symbol: 'SUIUSDT',    name: 'SUI' },
  { symbol: 'SEIUSDT',    name: 'SEI' },
  { symbol: 'TIAUSDT',    name: 'TIA' },
  { symbol: 'WIFUSDT',    name: 'WIF' },
  { symbol: 'PEPEUSDT',   name: 'PEPE' },
  { symbol: 'JUPUSDT',    name: 'JUP' },
  { symbol: 'ENAUSDT',    name: 'ENA' },
  { symbol: 'RENDERUSDT', name: 'RNDR' },
  { symbol: 'FETUSDT',    name: 'FET' },
  { symbol: 'WLDUSDT',    name: 'WLD' },
  { symbol: 'PYTHUSDT',   name: 'PYTH' },
  { symbol: 'TAOUSDT',    name: 'TAO' },
  { symbol: 'FILUSDT',    name: 'FIL' },
  { symbol: 'ICPUSDT',    name: 'ICP' },
  { symbol: 'HBARUSDT',   name: 'HBAR' },
  { symbol: 'CRVUSDT',    name: 'CRV' },
  { symbol: 'MKRUSDT',    name: 'MKR' },
  { symbol: 'LDOUSDT',    name: 'LDO' },
  { symbol: 'GRTUSDT',    name: 'GRT' },
  { symbol: 'RUNEUSDT',   name: 'RUNE' },
  { symbol: 'AXSUSDT',    name: 'AXS' },
  { symbol: 'SANDUSDT',   name: 'SAND' },
  { symbol: 'MANAUSDT',   name: 'MANA' },
  { symbol: 'GALAUSDT',   name: 'GALA' },
]

function calcDTEdge(funding: number, longRatio: number, change24h: number): number {
  let s = 0
  const fundAbs = Math.abs(funding)
  s += Math.min(30, fundAbs / 0.0003 * 30)
  if (fundAbs > 0.0005) s += 15
  s += Math.min(20, Math.abs(longRatio - 50) / 20 * 20)
  if (Math.abs(change24h) > 5) s += 10
  else if (Math.abs(change24h) > 3) s += 5
  // Correlation penalty
  const fd = funding < -0.0001 ? 'long' : funding > 0.0001 ? 'short' : 'neutral'
  const ld = longRatio < 45 ? 'long' : longRatio > 55 ? 'short' : 'neutral'
  if (fd !== 'neutral' && ld !== 'neutral' && fd === ld) s *= 0.75
  return Math.min(100, Math.round(s))
}

function calcSTEdge(funding: number, longRatio: number, change24h: number): number {
  let s = 0
  const fundAbs = Math.abs(funding)
  s += Math.min(35, fundAbs / 0.0004 * 35)
  if (fundAbs > 0.0005) s += 15
  s += Math.min(25, Math.abs(longRatio - 50) / 20 * 25)
  s += Math.min(25, Math.abs(change24h) / 5 * 25)
  const fd = funding < -0.0001 ? 'long' : funding > 0.0001 ? 'short' : 'neutral'
  const ld = longRatio < 45 ? 'long' : longRatio > 55 ? 'short' : 'neutral'
  if (fd !== 'neutral' && ld !== 'neutral' && fd === ld) s *= 0.75
  return Math.min(100, Math.round(s))
}

function getDirection(f: number, lr: number, c: number): 'long' | 'short' | 'neutral' {
  if (f < -0.0002 && lr < 48) return 'long'
  if (f > 0.0002  && lr > 55) return 'short'
  if (c < -3 && f > 0) return 'short'
  if (c > 3  && f < 0) return 'long'
  return 'neutral'
}

function getTier(dt: number, st: number): AnomalyTier {
  const best = Math.max(dt, st)
  if (best >= 70) return 'alert'
  if (best >= 50) return 'watch'
  return 'neutral'
}

function getReason(f: number, lr: number, c: number): string {
  const parts: string[] = []
  if (Math.abs(f) > 0.0003) parts.push(`Fund ${f > 0 ? '+' : ''}${(f * 100).toFixed(4)}%`)
  if (Math.abs(lr - 50) > 8) parts.push(`L/S ${lr.toFixed(0)}/${(100 - lr).toFixed(0)}`)
  if (Math.abs(c) > 2) parts.push(`${c > 0 ? '+' : ''}${c.toFixed(1)}% 24h`)
  return parts.slice(0, 2).join(' · ') || 'Low anomaly'
}

let cachedResults: ScannedAsset[] = []
let lastScanTime = 0
const CACHE_TTL = 5 * 60 * 1000

export async function scanAssets(): Promise<ScannedAsset[]> {
  const now = Date.now()
  if (now - lastScanTime < CACHE_TTL && cachedResults.length > 0) return cachedResults

  const results: ScannedAsset[] = []
  const batches: typeof CORE_LIST[] = []
  for (let i = 0; i < CORE_LIST.length; i += 8) batches.push(CORE_LIST.slice(i, i + 8))

  for (const batch of batches) {
    const settled = await Promise.allSettled(
      batch.map(async ({ symbol, name }) => {
        const [ticker, funding, ls] = await Promise.allSettled([
          fetchTicker(symbol),
          fetchFundingRate(symbol),
          fetchLongShortRatio(symbol, '1h'),
        ])
        const t = ticker.status  === 'fulfilled' ? ticker.value  : null
        const f = funding.status === 'fulfilled' ? funding.value : null
        const l = ls.status      === 'fulfilled' ? ls.value      : null
        if (!t) return null
        const fr  = f?.fundingRate ?? 0
        const lr  = l?.longAccount ?? 50
        const c   = t.changePct24h
        const dte = calcDTEdge(fr, lr, c)
        const ste = calcSTEdge(fr, lr, c)
        return {
          symbol, name,
          price: t.price,
          change24h: c,
          fundingRate: fr,
          longRatio: lr,
          dtEdge: dte,
          stEdge: ste,
          direction: getDirection(fr, lr, c),
          tier: getTier(dte, ste),
          reason: getReason(fr, lr, c),
          type: dte >= 60 && ste >= 55 ? 'both' : dte >= 55 ? 'DT' : 'ST',
        } as ScannedAsset
      })
    )
    settled.forEach(r => { if (r.status === 'fulfilled' && r.value) results.push(r.value) })
  }

  const tierOrder: Record<AnomalyTier, number> = { alert: 0, watch: 1, neutral: 2 }
  results.sort((a, b) => {
    if (tierOrder[a.tier] !== tierOrder[b.tier]) return tierOrder[a.tier] - tierOrder[b.tier]
    return Math.max(b.dtEdge, b.stEdge) - Math.max(a.dtEdge, a.stEdge)
  })

  cachedResults = results
  lastScanTime = now
  return results
}

export function getTopAnomalies(assets: ScannedAsset[], limit = 8): ScannedAsset[] {
  return assets.filter(a => a.tier !== 'neutral').slice(0, limit)
}

export function getDTCandidates(assets: ScannedAsset[]): ScannedAsset[] {
  return assets.filter(a => (a.type === 'DT' || a.type === 'both') && a.dtEdge >= 40).slice(0, 5)
}

export function getSTCandidates(assets: ScannedAsset[]): ScannedAsset[] {
  return assets.filter(a => a.stEdge >= 30).slice(0, 5)
}

export function invalidateCache(): void {
  lastScanTime = 0
}
