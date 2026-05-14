// ─── Timeframe ────────────────────────────────────────────────────────────────
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d'

export interface TimeframeConfig {
  label: string
  binanceInterval: string
  seconds: number
}

export const TIMEFRAME_CONFIG: Record<Timeframe, TimeframeConfig> = {
  '1m':  { label: '1M',  binanceInterval: '1m',  seconds: 60 },
  '5m':  { label: '5M',  binanceInterval: '5m',  seconds: 300 },
  '15m': { label: '15M', binanceInterval: '15m', seconds: 900 },
  '30m': { label: '30M', binanceInterval: '30m', seconds: 1800 },
  '1h':  { label: '1H',  binanceInterval: '1h',  seconds: 3600 },
  '4h':  { label: '4H',  binanceInterval: '4h',  seconds: 14400 },
  '1d':  { label: '1D',  binanceInterval: '1d',  seconds: 86400 },
}

// ─── Candle ───────────────────────────────────────────────────────────────────
export interface Candle {
  time: number      // Unix timestamp in seconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ─── Market Ticker ────────────────────────────────────────────────────────────
export interface Ticker {
  symbol: string
  price: number
  change24h: number
  changePct24h: number
  high24h: number
  low24h: number
  volume24h: number
  fundingRate: number
  openInterest: number
  timestamp: number
}

// ─── Condition / Signal ───────────────────────────────────────────────────────
export type ConditionState = 'inactive' | 'watching' | 'active' | 'alert'

export interface Condition {
  id: string
  label: string
  description: string
  state: ConditionState
  value?: string | number
}

// ─── Fear & Greed ─────────────────────────────────────────────────────────────
export interface FearGreedData {
  value: number
  classification: string
  timestamp: string
}

// ─── Long/Short ───────────────────────────────────────────────────────────────
export interface LongShortData {
  longAccount: number
  shortAccount: number
  longShortRatio: number
  timestamp: number
}

// ─── Funding ─────────────────────────────────────────────────────────────────
export interface FundingData {
  symbol: string
  fundingRate: number
  fundingTime: number
  nextFundingTime: number
}

// ─── App State ────────────────────────────────────────────────────────────────
export interface AppState {
  timeframe: Timeframe
  isConnected: boolean
  lastUpdate: number | null
}

// ─── RSI ─────────────────────────────────────────────────────────────────────
export interface RSIData {
  time: number
  value: number
}

// ─── Liquidity Magnet ────────────────────────────────────────────────────────
export type MagnetStrength = 'weak' | 'medium' | 'strong' | 'extreme'
export type MagnetSide = 'upper' | 'lower'

export interface LiquidityMagnet {
  priceHigh: number      // top of cluster zone
  priceLow: number       // bottom of cluster zone
  price: number          // midpoint (for compat)
  side: MagnetSide
  strength: MagnetStrength
  liquidityUSD: number   // estimated USD across exchanges
  distancePct: number    // % from current price to midpoint
  label: string
  finished: boolean      // already swept
  tfScope: number        // min candle count needed — filters by timeframe
}

// ─── Mugger Score ─────────────────────────────────────────────────────────────
export interface MuggerScore {
  total: number                        // 0–100
  components: {
    structure: number
    derivatives: number
    liquidity: number
    participation: number
    rarity: number
    execution: number
    asymmetry: number
    regime: number
  }
  direction: 'long' | 'short' | 'neutral'
  label: string
}

// ─── CVD ─────────────────────────────────────────────────────────────────────
export interface CVDPoint {
  time: number
  value: number
  delta: number
}

// ─── Alert ───────────────────────────────────────────────────────────────────
export interface AlertItem {
  id: string
  symbol: string
  score: number
  direction: 'long' | 'short' | 'neutral'
  message: string
  timestamp: number
  acknowledged: boolean
}

// ─── Liquidation Zone ────────────────────────────────────────────────────────
export interface LiquidationZone {
  price: number
  side: 'long_liq' | 'short_liq'
  estimatedUSD: number
  leverage: number
  distancePct: number
  label: string
  intensity: 'light' | 'medium' | 'heavy' | 'extreme'
}

// ─── Multi-asset ─────────────────────────────────────────────────────────────
export type WatchedSymbol = 'BTCUSDT' | 'ETHUSDT'
