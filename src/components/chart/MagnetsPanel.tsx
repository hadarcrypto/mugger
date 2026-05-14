import React from 'react'
import type { LiquidityMagnet } from '../../types'
import './MagnetsPanel.css'

interface MagnetsPanelProps {
  magnets: LiquidityMagnet[]
  currentPrice: number
}

const STRENGTH_DOTS: Record<string, number> = {
  extreme: 4, strong: 3, medium: 2, weak: 1
}

export const MagnetsPanel: React.FC<MagnetsPanelProps> = ({ magnets, currentPrice }) => {
  const upper = magnets.filter(m => m.side === 'upper' && !m.finished).slice(0, 3)
  const lower = magnets.filter(m => m.side === 'lower' && !m.finished).slice(0, 3)

  const fmt = {
    price: (v: number) => v > 1000
      ? `$${v.toLocaleString('en', { maximumFractionDigits: 0 })}`
      : `$${v.toFixed(2)}`,
    pct: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`,
    liq: (v: number) => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1e3).toFixed(0)}K`,
  }

  return (
    <div className="magnets-panel">
      <div className="magnets-panel__header">
        <span className="magnets-panel__title">Liquidity Magnets</span>
        <span className="magnets-panel__subtitle">Synthetic · Based on structure</span>
      </div>

      <div className="magnets-panel__grid">
        {/* Upper magnets */}
        <div className="magnets-col magnets-col--upper">
          <div className="magnets-col__label">↑ Upper</div>
          {upper.length === 0 && <div className="magnets-empty">—</div>}
          {upper.map((m, i) => (
            <div key={i} className={`magnet-item magnet-item--${m.strength}`}>
              <div className="magnet-item__dots">
                {Array.from({ length: STRENGTH_DOTS[m.strength] }).map((_, d) => (
                  <span key={d} className="magnet-item__dot" />
                ))}
              </div>
              <div className="magnet-item__price">{fmt.price(m.price)}</div>
              <div className="magnet-item__dist">{fmt.pct(m.distancePct)}</div>
              <div className="magnet-item__liq">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Current price divider */}
        <div className="magnets-current">
          <div className="magnets-current__line" />
          <div className="magnets-current__price">
            {fmt.price(currentPrice)}
          </div>
          <div className="magnets-current__line" />
        </div>

        {/* Lower magnets */}
        <div className="magnets-col magnets-col--lower">
          <div className="magnets-col__label">↓ Lower</div>
          {lower.length === 0 && <div className="magnets-empty">—</div>}
          {lower.map((m, i) => (
            <div key={i} className={`magnet-item magnet-item--${m.strength}`}>
              <div className="magnet-item__dots">
                {Array.from({ length: STRENGTH_DOTS[m.strength] }).map((_, d) => (
                  <span key={d} className="magnet-item__dot" />
                ))}
              </div>
              <div className="magnet-item__price">{fmt.price(m.price)}</div>
              <div className="magnet-item__dist">{fmt.pct(m.distancePct)}</div>
              <div className="magnet-item__liq">{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
