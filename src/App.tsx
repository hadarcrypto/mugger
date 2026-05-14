import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { Candle, Timeframe, Ticker, FundingData, LongShortData, FearGreedData, AlertItem } from './types'
import { TIMEFRAME_CONFIG } from './types'
import { fetchCandles, fetchAllMarketData, createPriceWS } from './data/api'
import { evaluateConditions, countActiveConditions } from './data/conditions'
import { generateMagnets } from './data/magnets'
import { getCurrentRSI } from './data/rsi'
import { ALERT_THRESHOLD, createAlert } from './data/alerts'
import { generateSetup, updateSetupStatus } from './data/setup'
import { startLiqStream, getTopClusters, subscribe, clearClusters } from './data/liqstream'
import { predictForwardZones, getTopForwardZones } from './data/forwardliq'
import type { ForwardZone } from './data/forwardliq'
import type { LiqCluster } from './data/liqstream'
import type { ActiveSetup } from './data/setup'
import { recordSetup, getAdjustedWeights } from './data/accumulator'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { ChartWorkspace } from './components/chart/ChartWorkspace'
import { SignalsPanel } from './components/signals/SignalsPanel'
import { Footer } from './components/layout/Footer'
import { AlertBanner } from './components/ui/AlertBanner'
import { SetupCard } from './components/ui/SetupCard'
import './styles/global.css'

const DEFAULT_SYMBOL = 'BTCUSDT'
const MARKET_MS = 30_000
const SETUP_EDGE_THRESHOLD = 70

const DEFAULT_WEIGHTS = { funding: 1, crowdSkew: 1, rsiExtreme: 1, volumeSpike: 1, volatility: 1 }

function calcScore(
  candles: Candle[], funding: number, ls: LongShortData|null,
  rsi: number, weights: typeof DEFAULT_WEIGHTS
): number {
  if (candles.length < 20) return 0
  let s = 0
  s += Math.min(25, Math.abs(funding) / 0.0004 * 25) * weights.funding
  if (ls) s += Math.min(20, Math.abs(ls.longAccount - 50) / 20 * 20) * weights.crowdSkew
  const rsiScore = rsi >= 75 || rsi <= 25 ? 20 : rsi >= 65 || rsi <= 35 ? 12 : rsi >= 55 || rsi <= 45 ? 5 : 0
  s += rsiScore * weights.rsiExtreme
  const cls = candles.slice(-20).map(c => c.close)
  const m = cls.reduce((a,b)=>a+b,0)/cls.length
  const sd = Math.sqrt(cls.reduce((a,b)=>a+(b-m)**2,0)/cls.length)
  s += Math.min(15, (sd/m)*100*5) * weights.volatility
  if (candles.length >= 20) {
    const vols = candles.slice(-20,-1).map(c=>c.volume)
    const avg = vols.reduce((a,b)=>a+b,0)/vols.length
    s += Math.min(20, (candles[candles.length-1].volume/avg-1)*10) * weights.volumeSpike
  }
  return Math.min(100, Math.round(s))
}

function getDirection(funding: number, ls: LongShortData|null, rsi: number): 'long'|'short'|'neutral' {
  if (funding < -0.0001 && (ls?.longAccount??50) < 50) return 'long'
  if (funding > 0.0001  && (ls?.longAccount??50) > 55) return 'short'
  if (rsi <= 30) return 'long'
  if (rsi >= 70) return 'short'
  return 'neutral'
}

export default function App() {
  const [timeframe, setTimeframe]     = useState<Timeframe>('15m')
  const [candles, setCandles]         = useState<Candle[]>([])
  const [livePrice, setLivePrice]     = useState<number|null>(null)
  const [isLoading, setIsLoading]     = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate]   = useState<number|null>(null)
  const [ticker, setTicker]           = useState<Ticker|null>(null)
  const [funding, setFunding]         = useState<FundingData|null>(null)
  const [openInterest, setOI]         = useState(0)
  const [longShort, setLongShort]     = useState<LongShortData|null>(null)
  const [fearGreed, setFearGreed]     = useState<FearGreedData|null>(null)
  const [alerts, setAlerts]           = useState<AlertItem[]>([])
  const [symbol, setSymbol]           = useState(DEFAULT_SYMBOL)
  const [activeSetup, setActiveSetup] = useState<ActiveSetup|null>(null)
  const [liqClusters, setLiqClusters]   = useState<LiqCluster[]>([])
  const [forwardZones, setForwardZones] = useState<ForwardZone[]>([])
  const [showSetup, setShowSetup]     = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'chart'|'market'|'signals'>('chart')

  const wsRef      = useRef<(()=>void)|null>(null)
  const symbolRef    = useRef<string>('BTCUSDT')
  const timerRef   = useRef<ReturnType<typeof setInterval>|null>(null)
  const prevScore  = useRef(0)
  const liqStopRef   = useRef<(()=>void)|null>(null)
  const weights    = useRef<typeof DEFAULT_WEIGHTS>(DEFAULT_WEIGHTS)

  const loadCandles = useCallback(async (tf: Timeframe, sym?: string) => {
    setIsLoading(true); setCandles([])
    const data = await fetchCandles(sym ?? DEFAULT_SYMBOL, TIMEFRAME_CONFIG[tf].binanceInterval, 500)
    if (data.length > 0) { setCandles(data); setLivePrice(data[data.length-1].close) }
    setIsLoading(false)
  }, [])

  const livePriceRef = useRef<number>(0)

  const loadMarket = useCallback(async (sym?: string) => {
    const d = await fetchAllMarketData(sym ?? DEFAULT_SYMBOL)
    if (d.ticker)    setTicker(d.ticker)
    if (d.funding)   setFunding(d.funding)
    if (d.oi)        setOI(d.oi)
    if (d.longShort) setLongShort(d.longShort)
    if (d.fearGreed) setFearGreed(d.fearGreed)
    setLastUpdate(Date.now())
    // Use ref to avoid stale closure on currentPrice
    const price = livePriceRef.current
    if (price > 0 && d.oi) {
      const clusters = getTopClusters(price, 12)
      predictForwardZones(
        sym ?? DEFAULT_SYMBOL, price, d.oi * price,
        d.longShort?.longAccount ?? 50, clusters,
        { high: price * 1.1, low: price * 0.9 }
      ).then(zones => setForwardZones(getTopForwardZones(zones, price, 8)))
    }
  }, [])

  const startWS = useCallback((tf: Timeframe, sym?: string) => {
    wsRef.current?.()
    wsRef.current = createPriceWS(sym ?? DEFAULT_SYMBOL, TIMEFRAME_CONFIG[tf].binanceInterval,
      (candle, closed) => {
        setIsConnected(true); setLastUpdate(Date.now())
        setCandles(prev => {
          if (!prev.length) return prev
          const arr=[...prev]; const li=arr.length-1
          if (arr[li].time===candle.time) arr[li]=candle
          else if (closed){arr.push(candle);if(arr.length>600)arr.shift()}
          return arr
        })
      },
      price => { setLivePrice(price); setIsConnected(true); livePriceRef.current = price }
    )
  }, [])

  const handleTF = useCallback((tf: Timeframe) => {
    setTimeframe(tf)
    setActiveSetup(null); setShowSetup(false)
    prevScore.current = 0
    loadCandles(tf, symbol)
    startWS(tf, symbol)
  }, [loadCandles, startWS, symbol])

  const handleSymbol = useCallback((sym: string) => {
    symbolRef.current = sym
    setSymbol(sym)
    setActiveSetup(null); setShowSetup(false)
    prevScore.current = 0
    setTicker(null); setFunding(null); setOI(0); setLongShort(null)
    clearClusters(); setLiqClusters([])
    loadCandles(timeframe, sym)
    loadMarket(sym)
    startWS(timeframe, sym)
  }, [loadCandles, loadMarket, startWS, timeframe])

  useEffect(() => {
    loadCandles(timeframe); loadMarket(); startWS(timeframe)
    timerRef.current = setInterval(() => loadMarket(symbolRef.current), MARKET_MS)
    // Load adjusted weights async
    getAdjustedWeights().then(w => { weights.current = w })
    // Start real liquidation stream
    const stopLiq = startLiqStream(symbol)
    const unsub = subscribe(() => {
      const price = livePriceRef.current
      setLiqClusters(getTopClusters(price, 8))
    })
    return () => { wsRef.current?.(); if(timerRef.current) clearInterval(timerRef.current); stopLiq(); unsub() }

  }, []) // eslint-disable-line

  const currentPrice = livePrice ?? candles[candles.length-1]?.close ?? 0
  const rsi          = useMemo(() => getCurrentRSI(candles, 14), [candles])
  const muggerScore  = useMemo(() => calcScore(candles, funding?.fundingRate??0, longShort, rsi, weights.current), [candles, funding, longShort, rsi])
  const conditions   = useMemo(() => evaluateConditions(candles), [candles])
  const activeCount  = countActiveConditions(conditions)
  const magnets      = useMemo(() => generateMagnets(candles, currentPrice, timeframe, 6), [candles, currentPrice, timeframe])
  const direction    = useMemo(() => getDirection(funding?.fundingRate??0, longShort, rsi), [funding, longShort, rsi])

  // Alert + setup trigger
  useEffect(() => {
    if (muggerScore >= ALERT_THRESHOLD && prevScore.current < ALERT_THRESHOLD) {
      const alert = createAlert(symbol, muggerScore, direction)
      setAlerts(prev => [alert, ...prev].slice(0, 10))
    }

    // Generate setup when EDGE crosses threshold
    if (muggerScore >= SETUP_EDGE_THRESHOLD && prevScore.current < SETUP_EDGE_THRESHOLD && direction !== 'neutral') {
      const setup = generateSetup(
        candles, direction, muggerScore, timeframe, magnets,
        funding?.fundingRate??0, longShort?.longAccount??50
      )
      if (setup) {
        setActiveSetup(setup)
        setShowSetup(true)
        recordSetup(setup, funding?.fundingRate??0, longShort?.longAccount??50, rsi)
      }
    }

    prevScore.current = muggerScore
  }, [muggerScore])

  // Update setup status when price moves
  useEffect(() => {
    if (activeSetup && currentPrice > 0) {
      const updated = updateSetupStatus(activeSetup, currentPrice)
      if (updated.status !== activeSetup.status) setActiveSetup(updated)
    }
  }, [currentPrice])

  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.map(a => a.id===id?{...a,acknowledged:true}:a))
  }, [])

  return (
    <div className="app-shell">
      <AlertBanner alerts={alerts} onDismiss={dismissAlert} />
      <Header ticker={ticker} isConnected={isConnected} lastUpdate={lastUpdate} livePrice={livePrice} currentSymbol={symbol} onSymbolChange={handleSymbol} />
      <Sidebar ticker={ticker} funding={funding} longShort={longShort} fearGreed={fearGreed} openInterest={openInterest} symbol={symbol} />
      <ChartWorkspace
        candles={candles} timeframe={timeframe} livePrice={livePrice}
        isLoading={isLoading} magnets={magnets}
        muggerScore={muggerScore} activeSetup={activeSetup}
        liqClusters={liqClusters}
        forwardZones={forwardZones}
        onTimeframeChange={handleTF}
      />
      <SignalsPanel conditions={conditions} activeCount={activeCount} />
      <Footer />
      {showSetup && activeSetup && (
        <SetupCard setup={activeSetup} onDismiss={() => setShowSetup(false)} />
      )}

      {/* Mobile bottom nav — CSS shows only on small screens */}
      <MobileNav active={mobilePanel} onChange={setMobilePanel} />
    </div>
  )
}

// ─── Mobile Nav ───────────────────────────────────────────────────────────────
const PANELS = [
  { id: 'chart'   as const, icon: '▦', label: 'Chart' },
  { id: 'market'  as const, icon: '◈', label: 'Market' },
  { id: 'signals' as const, icon: '◉', label: 'Signals' },
]

function MobileNav({ active, onChange }: {
  active: 'chart'|'market'|'signals'
  onChange: (p: 'chart'|'market'|'signals') => void
}) {
  return (
    <nav className="mobile-nav">
      {PANELS.map(p => (
        <button
          key={p.id}
          className={`mobile-nav__btn${active === p.id ? ' mobile-nav__btn--active' : ''}`}
          onClick={() => onChange(p.id)}
        >
          <span className="mobile-nav__icon">{p.icon}</span>
          <span className="mobile-nav__label">{p.label}</span>
        </button>
      ))}
    </nav>
  )
}

