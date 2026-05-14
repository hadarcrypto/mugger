import React from 'react'
import type { Candle, Timeframe, LiquidityMagnet } from '../../types'
import type { ActiveSetup } from '../../data/setup'
import type { LiqCluster } from '../../data/liqstream'
import type { ForwardZone } from '../../data/forwardliq'
import { CandleChart } from './CandleChart'
import { TimeframeSelector } from './TimeframeSelector'
import { MagnetsPanel } from './MagnetsPanel'
import './ChartWorkspace.css'

interface ChartWorkspaceProps {
  candles: Candle[]
  symbol?: string
  timeframe: Timeframe
  livePrice: number | null
  isLoading: boolean
  magnets: LiquidityMagnet[]
  muggerScore: number
  activeSetup?: ActiveSetup | null
  liqClusters?: LiqCluster[]
  forwardZones?: ForwardZone[]
  onTimeframeChange: (tf: Timeframe) => void
}

const fmt = {
  price: (v: number) => v > 1000
    ? `$${v.toLocaleString('en', { maximumFractionDigits: 0 })}`
    : `$${v.toFixed(2)}`,
}

export const ChartWorkspace: React.FC<ChartWorkspaceProps> = ({
  candles, timeframe, livePrice, isLoading, magnets, muggerScore, symbol, activeSetup, liqClusters, forwardZones, onTimeframeChange
}) => {
  const last = candles[candles.length - 1]
  const displayPrice = livePrice ?? last?.close ?? 0
  const isUp = last ? displayPrice >= last.open : true

  return (
    <main className="chart-workspace">
      <div className="chart-workspace__top">
        <TimeframeSelector selected={timeframe} onChange={onTimeframeChange} isLoading={isLoading} />
        {last && (
          <div className="ohlc-bar">
            <span className="ohlc-bar__pair">{(symbol || 'BTCUSDT').replace('USDT', '')}/USDT</span>
            <div className="ohlc-bar__values">
              {([['O', last.open], ['H', last.high], ['L', last.low], ['C', displayPrice]] as [string, number][]).map(([l, v]) => (
                <div key={l} className="ohlc-bar__item">
                  <span className="ohlc-bar__label">{l}</span>
                  <span className={`ohlc-bar__value ${l === 'C' ? (isUp ? 'pos' : 'neg') : ''}`}>{fmt.price(v)}</span>
                </div>
              ))}
              <div className="ohlc-bar__item">
                <span className="ohlc-bar__label">Vol</span>
                <span className="ohlc-bar__value">{(last.volume / 1e6).toFixed(2)}M</span>
              </div>
            </div>
            <div className="mugger-score">
              <span className="mugger-score__label">Edge</span>
              <div className="mugger-score__bar">
                <div className="mugger-score__fill" style={{ width: `${muggerScore}%` }} />
              </div>
              <span className={`mugger-score__value ${muggerScore >= 75 ? 'mugger-score__value--hot' : ''}`}>
                {muggerScore}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="chart-workspace__chart">
        <CandleChart
          candles={candles}
          livePrice={livePrice}
          isLoading={isLoading}
          magnets={magnets}
          timeframe={timeframe}
          symbol={symbol}
          activeSetup={activeSetup}
          liqClusters={liqClusters ?? []}
          forwardZones={forwardZones ?? []}
        />
      </div>

      {magnets.length > 0 && (
        <MagnetsPanel magnets={magnets} currentPrice={displayPrice} />
      )}

      <div className="chart-workspace__bottom">
        <span className="chart-workspace__bottom-label">
          MUGGER v0.020 · RSI · CVD · Liquidity Magnets · Forward Liquidations · {candles.length} candles
        </span>
        <span className="chart-workspace__bottom-count">
          {magnets.filter(m => !m.finished).length} magnets
        </span>
      </div>
    </main>
  )
}
