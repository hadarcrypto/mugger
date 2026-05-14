/**
 * Mugger Data Layer — Binance + Public APIs
 * All free public endpoints, no auth required
 */

import type { Candle, Ticker, FearGreedData, LongShortData, FundingData } from '../types'

const BINANCE_REST = 'https://api.binance.com/api/v3'
const BINANCE_FUTURES = 'https://fapi.binance.com/fapi/v1'
const BINANCE_FDATA = 'https://fapi.binance.com/futures/data'
const FEAR_GREED_API = 'https://api.alternative.me/fng/?limit=1'

// ─── Fetch helper ─────────────────────────────────────────────────────────────
async function apiFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}

// ─── Candles (Binance Spot) ───────────────────────────────────────────────────
export async function fetchCandles(
  symbol: string,
  interval: string,
  limit = 500
): Promise<Candle[]> {
  const url = `${BINANCE_REST}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  const raw = await apiFetch<number[][]>(url)
  if (!raw || !Array.isArray(raw)) return []
  return raw.map(k => ({
    time:   Math.floor(Number(k[0]) / 1000),
    open:   parseFloat(String(k[1])),
    high:   parseFloat(String(k[2])),
    low:    parseFloat(String(k[3])),
    close:  parseFloat(String(k[4])),
    volume: parseFloat(String(k[5])),
  }))
}

// ─── 24H Ticker ───────────────────────────────────────────────────────────────
export async function fetchTicker(symbol: string): Promise<Ticker | null> {
  const url = `${BINANCE_REST}/ticker/24hr?symbol=${symbol}`
  const raw = await apiFetch<Record<string, string>>(url)
  if (!raw) return null
  return {
    symbol,
    price:       parseFloat(raw.lastPrice),
    change24h:   parseFloat(raw.priceChange),
    changePct24h:parseFloat(raw.priceChangePercent),
    high24h:     parseFloat(raw.highPrice),
    low24h:      parseFloat(raw.lowPrice),
    volume24h:   parseFloat(raw.quoteVolume),
    fundingRate: 0,
    openInterest:0,
    timestamp:   Date.now(),
  }
}

// ─── Funding Rate (Binance Futures) ──────────────────────────────────────────
export async function fetchFundingRate(symbol: string): Promise<FundingData | null> {
  const url = `${BINANCE_FUTURES}/premiumIndex?symbol=${symbol}`
  const raw = await apiFetch<Record<string, string>>(url)
  if (!raw) return null
  return {
    symbol,
    fundingRate:     parseFloat(raw.lastFundingRate || '0'),
    fundingTime:     Number(raw.time || 0),
    nextFundingTime: Number(raw.nextFundingTime || 0),
  }
}

// ─── Open Interest (Binance Futures) ─────────────────────────────────────────
export async function fetchOpenInterest(symbol: string): Promise<number> {
  const url = `${BINANCE_FUTURES}/openInterest?symbol=${symbol}`
  const raw = await apiFetch<Record<string, string>>(url)
  if (!raw) return 0
  return parseFloat(raw.openInterest || '0')
}

// ─── Long/Short Ratio (Binance Futures) ──────────────────────────────────────
export async function fetchLongShortRatio(
  symbol: string,
  period = '1h'
): Promise<LongShortData | null> {
  const url = `${BINANCE_FDATA}/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=1`
  const raw = await apiFetch<Record<string, string>[]>(url)
  if (!raw || !Array.isArray(raw) || raw.length === 0) return null
  const d = raw[0]
  return {
    longAccount:    parseFloat(d.longAccount) * 100,
    shortAccount:   parseFloat(d.shortAccount) * 100,
    longShortRatio: parseFloat(d.longShortRatio),
    timestamp:      Number(d.timestamp),
  }
}

// ─── Fear & Greed Index (alternative.me) ─────────────────────────────────────
export async function fetchFearGreed(): Promise<FearGreedData | null> {
  const raw = await apiFetch<{ data: Array<Record<string, string>> }>(FEAR_GREED_API)
  if (!raw || !raw.data?.[0]) return null
  const d = raw.data[0]
  return {
    value:          parseInt(d.value),
    classification: d.value_classification,
    timestamp:      d.timestamp,
  }
}

// ─── All market data in parallel ─────────────────────────────────────────────
export async function fetchAllMarketData(symbol: string) {
  const [ticker, funding, oi, ls, fearGreed] = await Promise.allSettled([
    fetchTicker(symbol),
    fetchFundingRate(symbol.replace('USDT', '') + 'USDT'),
    fetchOpenInterest(symbol.replace('USDT', '') + 'USDT'),
    fetchLongShortRatio(symbol.replace('USDT', '') + 'USDT'),
    fetchFearGreed(),
  ])

  return {
    ticker:    ticker.status    === 'fulfilled' ? ticker.value    : null,
    funding:   funding.status   === 'fulfilled' ? funding.value   : null,
    oi:        oi.status        === 'fulfilled' ? oi.value        : 0,
    longShort: ls.status        === 'fulfilled' ? ls.value        : null,
    fearGreed: fearGreed.status === 'fulfilled' ? fearGreed.value : null,
  }
}

// ─── WebSocket for real-time price ───────────────────────────────────────────
export function createPriceWS(
  symbol: string,
  interval: string,
  onCandle: (candle: Candle, isClosed: boolean) => void,
  onPrice: (price: number) => void
): () => void {
  const stream = `${symbol.toLowerCase()}@kline_${interval}`
  const url = `wss://stream.binance.com:9443/ws/${stream}`

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let alive = true

  const connect = () => {
    if (!alive) return
    ws = new WebSocket(url)

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        const k = msg.k
        if (!k) return
        const candle: Candle = {
          time:   Math.floor(Number(k.t) / 1000),
          open:   parseFloat(k.o),
          high:   parseFloat(k.h),
          low:    parseFloat(k.l),
          close:  parseFloat(k.c),
          volume: parseFloat(k.v),
        }
        onCandle(candle, k.x === true)
        onPrice(parseFloat(k.c))
      } catch {}
    }

    ws.onclose = () => {
      if (!alive) return
      reconnectTimer = setTimeout(connect, 3000)
    }

    ws.onerror = () => { ws?.close() }
  }

  connect()

  return () => {
    alive = false
    if (reconnectTimer) clearTimeout(reconnectTimer)
    ws?.close()
  }
}
