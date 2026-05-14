/**
 * Multi-Exchange Real Liquidation Heatmap — Mugger v0.005
 *
 * Connects to 5 major exchanges simultaneously:
 * - Binance Futures  (~20% market share)
 * - Bybit Linear     (~20% market share)
 * - OKX Swap         (~15% market share)
 * - Hyperliquid      (~8% market share)
 * - Bitget Futures   (~7% market share)
 *
 * Total coverage: ~70% of crypto derivatives market
 * All streams are PUBLIC — no API keys required
 */

export interface LiqEvent {
  symbol:   string
  exchange: string
  side:     'BUY' | 'SELL'  // BUY = short liquidated, SELL = long liquidated
  price:    number
  qty:      number
  usdValue: number
  time:     number
}

export interface LiqCluster {
  priceHigh:   number
  priceLow:    number
  midPrice:    number
  totalUSD:    number
  buyUSD:      number
  sellUSD:     number
  count:       number
  lastTime:    number
  side:        'upper' | 'lower' | 'both'
  intensity:   'light' | 'medium' | 'heavy' | 'extreme'
  exchanges:   string[]
}

// ─── Store ────────────────────────────────────────────────────────────────────
const liqStore = new Map<string, LiqCluster>()
const listeners = new Set<(clusters: LiqCluster[]) => void>()
const activeWS: WebSocket[] = []
let isRunning = false

const BUCKET_PCT = 0.0025  // 0.25% price buckets

function getBucketKey(price: number): string {
  const bucketSize = price * BUCKET_PCT
  return (Math.round(price / bucketSize) * bucketSize).toFixed(0)
}

function getIntensity(usd: number): LiqCluster['intensity'] {
  if (usd >= 20e6) return 'extreme'
  if (usd >= 5e6)  return 'heavy'
  if (usd >= 1e6)  return 'medium'
  return 'light'
}

function addLiqEvent(event: LiqEvent): void {
  if (event.usdValue < 500) return  // ignore tiny liquidations

  const key = getBucketKey(event.price)
  const existing = liqStore.get(key)
  const half = event.price * BUCKET_PCT / 2

  if (existing) {
    existing.totalUSD += event.usdValue
    existing.count++
    existing.lastTime = event.time
    if (event.side === 'BUY') existing.buyUSD += event.usdValue
    else existing.sellUSD += event.usdValue
    existing.intensity = getIntensity(existing.totalUSD)
    if (!existing.exchanges.includes(event.exchange)) {
      existing.exchanges.push(event.exchange)
    }
  } else {
    liqStore.set(key, {
      priceHigh:  event.price + half,
      priceLow:   event.price - half,
      midPrice:   event.price,
      totalUSD:   event.usdValue,
      buyUSD:     event.side === 'BUY'  ? event.usdValue : 0,
      sellUSD:    event.side === 'SELL' ? event.usdValue : 0,
      count:      1,
      lastTime:   event.time,
      side:       'both',
      intensity:  getIntensity(event.usdValue),
      exchanges:  [event.exchange],
    })
  }

  notifyListeners()
}

function notifyListeners(): void {
  const clusters = getAllClusters()
  listeners.forEach(fn => fn(clusters))
}

// ─── Normalize symbol ─────────────────────────────────────────────────────────
function normalizeSymbol(raw: string): string {
  return raw.replace(/[-_]/g, '').replace('PERP', '').toUpperCase()
}

function matchesTarget(raw: string, target: string): boolean {
  const n = normalizeSymbol(raw)
  const t = normalizeSymbol(target)
  return n === t || n === t + 'USDT' || n.startsWith(t)
}

// ─── Binance Futures ──────────────────────────────────────────────────────────
function connectBinance(symbol: string): WebSocket {
  const ws = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr')
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      const o = msg.o
      if (!o || !matchesTarget(o.s, symbol)) return
      addLiqEvent({
        symbol: o.s, exchange: 'Binance',
        side: o.S as 'BUY'|'SELL',
        price: parseFloat(o.p), qty: parseFloat(o.q),
        usdValue: parseFloat(o.p) * parseFloat(o.q),
        time: o.T,
      })
    } catch {}
  }
  ws.onerror = () => {}
  return ws
}

// ─── Bybit Linear ─────────────────────────────────────────────────────────────
function connectBybit(symbol: string): WebSocket {
  const sym = symbol.replace('USDT', '') + 'USDT'
  const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear')
  ws.onopen = () => {
    ws.send(JSON.stringify({
      op: 'subscribe',
      args: [`liquidation.${sym}`]
    }))
  }
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.topic && msg.topic.startsWith('liquidation') && msg.data) {
        const d = msg.data
        const price = parseFloat(d.price)
        const qty   = parseFloat(d.size)
        addLiqEvent({
          symbol: d.symbol, exchange: 'Bybit',
          side: d.side === 'Buy' ? 'SELL' : 'BUY',  // Bybit side is opposite
          price, qty,
          usdValue: price * qty,
          time: msg.ts || Date.now(),
        })
      }
    } catch {}
  }
  ws.onerror = () => {}
  return ws
}

// ─── OKX Swap ────────────────────────────────────────────────────────────────
function connectOKX(symbol: string): WebSocket {
  const base = symbol.replace('USDT', '')
  const instId = `${base}-USDT-SWAP`
  const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public')
  ws.onopen = () => {
    ws.send(JSON.stringify({
      op: 'subscribe',
      args: [{ channel: 'liquidation-orders', instType: 'SWAP' }]
    }))
  }
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.arg?.channel === 'liquidation-orders' && msg.data) {
        msg.data.forEach((item: any) => {
          if (!item.details) return
          item.details.forEach((d: any) => {
            if (!matchesTarget(item.instId || instId, symbol)) return
            const price = parseFloat(d.bkPx || d.px)
            const qty   = parseFloat(d.sz)
            addLiqEvent({
              symbol: item.instId, exchange: 'OKX',
              side: d.side === 'buy' ? 'BUY' : 'SELL',
              price, qty,
              usdValue: price * qty,
              time: parseInt(d.ts || Date.now()),
            })
          })
        })
      }
    } catch {}
  }
  ws.onerror = () => {}
  return ws
}

// ─── Hyperliquid ──────────────────────────────────────────────────────────────
function connectHyperliquid(symbol: string): WebSocket {
  const coin = symbol.replace('USDT', '')
  const ws = new WebSocket('wss://api.hyperliquid.xyz/ws')
  ws.onopen = () => {
    ws.send(JSON.stringify({
      method: 'subscribe',
      subscription: { type: 'liquidations' }
    }))
  }
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.channel === 'liquidations' && msg.data) {
        const d = msg.data
        if (!matchesTarget(d.coin || '', coin)) return
        const price = parseFloat(d.px)
        const qty   = parseFloat(d.sz)
        addLiqEvent({
          symbol: d.coin, exchange: 'Hyperliquid',
          side: d.side === 'B' ? 'BUY' : 'SELL',
          price, qty,
          usdValue: price * qty,
          time: d.time || Date.now(),
        })
      }
    } catch {}
  }
  ws.onerror = () => {}
  return ws
}

// ─── Bitget ───────────────────────────────────────────────────────────────────
function connectBitget(symbol: string): WebSocket {
  const sym = symbol.replace('USDT', '') + 'USDT'
  const ws = new WebSocket('wss://ws.bitget.com/mix/v1/stream')
  ws.onopen = () => {
    ws.send(JSON.stringify({
      op: 'subscribe',
      args: [{ instType: 'mc', channel: 'liquidation', instId: sym }]
    }))
  }
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.action && msg.data) {
        msg.data.forEach((d: any) => {
          if (!matchesTarget(d.symbol || sym, symbol)) return
          const price = parseFloat(d.fillPrice || d.price)
          const qty   = parseFloat(d.fillAmount || d.size)
          addLiqEvent({
            symbol: d.symbol || sym, exchange: 'Bitget',
            side: d.side === 'buy' ? 'BUY' : 'SELL',
            price, qty,
            usdValue: price * qty,
            time: parseInt(d.cTime || Date.now()),
          })
        })
      }
    } catch {}
  }
  ws.onerror = () => {}
  return ws
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function startLiqStream(symbol: string): () => void {
  if (isRunning) stopLiqStream()
  isRunning = true
  clearClusters()

  const sym = symbol.toUpperCase().replace('USDT', '') + 'USDT'

  // Connect all exchanges
  const connections = [
    connectBinance(sym),
    connectBybit(sym),
    connectOKX(sym),
    connectHyperliquid(sym),
    connectBitget(sym),
  ]

  connections.forEach(ws => activeWS.push(ws))

  // Auto-reconnect on close
  connections.forEach((ws, i) => {
    ws.onclose = () => {
      if (!isRunning) return
      // Reconnect after 3s
      setTimeout(() => {
        if (!isRunning) return
        const reconnectors = [connectBinance, connectBybit, connectOKX, connectHyperliquid, connectBitget]
        const newWs = reconnectors[i](sym)
        activeWS[i] = newWs
      }, 3000)
    }
  })

  return stopLiqStream
}

export function stopLiqStream(): void {
  isRunning = false
  activeWS.forEach(ws => { try { ws.close() } catch {} })
  activeWS.length = 0
}

export function clearClusters(): void {
  liqStore.clear()
}

export function subscribe(fn: (clusters: LiqCluster[]) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getAllClusters(): LiqCluster[] {
  return Array.from(liqStore.values()).sort((a, b) => b.totalUSD - a.totalUSD)
}

export function getTopClusters(currentPrice: number, count = 8): LiqCluster[] {
  const all = getAllClusters().map(c => ({
    ...c,
    side: c.midPrice > currentPrice * 1.002 ? 'upper' as const
        : c.midPrice < currentPrice * 0.998 ? 'lower' as const
        : 'both' as const
  }))

  const upper = all.filter(c => c.side === 'upper')
    .sort((a, b) => a.midPrice - b.midPrice)
    .slice(0, Math.ceil(count / 2))

  const lower = all.filter(c => c.side === 'lower')
    .sort((a, b) => b.midPrice - a.midPrice)
    .slice(0, Math.floor(count / 2))

  return [...upper, ...lower]
}

export function getTotalStats(): {
  totalUSD: number
  buyUSD: number
  sellUSD: number
  exchanges: string[]
  count: number
} {
  let totalUSD = 0, buyUSD = 0, sellUSD = 0, count = 0
  const exchanges = new Set<string>()
  liqStore.forEach(c => {
    totalUSD += c.totalUSD
    buyUSD   += c.buyUSD
    sellUSD  += c.sellUSD
    count    += c.count
    c.exchanges.forEach(e => exchanges.add(e))
  })
  return { totalUSD, buyUSD, sellUSD, exchanges: Array.from(exchanges), count }
}

export function formatUSD(usd: number): string {
  if (usd >= 1e9) return `$${(usd/1e9).toFixed(1)}B`
  if (usd >= 1e6) return `$${(usd/1e6).toFixed(1)}M`
  if (usd >= 1e3) return `$${(usd/1e3).toFixed(0)}K`
  return `$${usd.toFixed(0)}`
}

export function getClusterColor(cluster: LiqCluster): string {
  const isShortLiq = cluster.buyUSD >= cluster.sellUSD
  const a = cluster.intensity === 'extreme' ? 0.60
    : cluster.intensity === 'heavy'   ? 0.45
    : cluster.intensity === 'medium'  ? 0.30
    : 0.16
  return isShortLiq
    ? `rgba(160, 40, 40, ${a})`
    : `rgba(30, 120, 55, ${a})`
}

export function getClusterBorder(cluster: LiqCluster): string {
  const isShortLiq = cluster.buyUSD >= cluster.sellUSD
  const a = cluster.intensity === 'extreme' ? 0.90
    : cluster.intensity === 'heavy'   ? 0.70
    : cluster.intensity === 'medium'  ? 0.50
    : 0.30
  return isShortLiq
    ? `rgba(200, 50, 50, ${a})`
    : `rgba(40, 160, 70, ${a})`
}
