import React from 'react'
import type { Ticker, FundingData, LongShortData, FearGreedData } from '../../types'
import './Sidebar.css'

interface SidebarProps {
  ticker: Ticker | null
  funding: FundingData | null
  longShort: LongShortData | null
  fearGreed: FearGreedData | null
  openInterest: number
}

const fmt = {
  price: (v: number) => v > 1000
    ? `$${v.toLocaleString('en', { maximumFractionDigits: 0 })}`
    : `$${v.toFixed(2)}`,
  fund: (v: number) => `${(v * 100).toFixed(4)}%`,
  oi: (v: number) => v > 1e9
    ? `$${(v / 1e9).toFixed(2)}B`
    : v > 1e6
    ? `$${(v / 1e6).toFixed(1)}M`
    : `$${v.toFixed(0)}`,
}

const StatRow: React.FC<{ label: string; value: React.ReactNode; dimValue?: boolean }> = ({
  label, value, dimValue
}) => (
  <div className="stat-row">
    <span className="stat-row__label">{label}</span>
    <span className={`stat-row__value${dimValue ? ' stat-row__value--dim' : ''}`}>{value}</span>
  </div>
)

export const Sidebar: React.FC<SidebarProps> = ({
  ticker, funding, longShort, fearGreed, openInterest
}) => {
  const fundingRate = funding?.fundingRate ?? 0
  const fundingColor = fundingRate < -0.0001
    ? 'var(--text-bright)'
    : fundingRate > 0.0002
    ? 'var(--up)'
    : 'var(--text-primary)'

  const fgValue = fearGreed?.value ?? 0
  const fgClass = fgValue < 30 ? 'neg' : fgValue > 70 ? 'pos' : ''

  return (
    <aside className="sidebar">
      {/* Market */}
      <div className="sidebar__section">
        <div className="sidebar__section-title">Market</div>
        <StatRow label="Asset"   value="BTC / USDT" />
        <StatRow label="Mode"    value="Observe" />
        <StatRow label="Source"  value="Binance" />
        <StatRow
          label="Status"
          value={
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="state-dot state-dot--active" />
              Watching
            </span>
          }
        />
      </div>

      <div className="sep-h" />

      {/* Derivatives */}
      <div className="sidebar__section">
        <div className="sidebar__section-title">Derivatives</div>
        <StatRow
          label="Funding"
          value={
            <span style={{ color: fundingColor }}>
              {funding ? fmt.fund(fundingRate) : '—'}
            </span>
          }
        />
        <StatRow
          label="Open Int."
          value={openInterest > 0 ? fmt.oi(openInterest * (ticker?.price ?? 1)) : '—'}
          dimValue={!openInterest}
        />
        {longShort && (
          <>
            <StatRow
              label="Long Acc."
              value={`${longShort.longAccount.toFixed(1)}%`}
            />
            <StatRow
              label="Short Acc."
              value={`${longShort.shortAccount.toFixed(1)}%`}
            />
            <StatRow
              label="L/S Ratio"
              value={longShort.longShortRatio.toFixed(3)}
            />
          </>
        )}
      </div>

      <div className="sep-h" />

      {/* Sentiment */}
      <div className="sidebar__section">
        <div className="sidebar__section-title">Sentiment</div>
        {fearGreed ? (
          <>
            <StatRow
              label="Fear/Greed"
              value={
                <span className={fgClass}>
                  {fearGreed.value} — {fearGreed.classification}
                </span>
              }
            />
            <div className="fg-bar">
              <div
                className="fg-bar__fill"
                style={{ width: `${fearGreed.value}%` }}
              />
              <div className="fg-bar__labels">
                <span>Fear</span>
                <span>Greed</span>
              </div>
            </div>
          </>
        ) : (
          <StatRow label="Fear/Greed" value="—" dimValue />
        )}
      </div>

      <div className="sep-h" />

      {/* System */}
      <div className="sidebar__section sidebar__section--bottom">
        <div className="sidebar__section-title">System</div>
        <StatRow label="Version"    value="v0.020" />
        <StatRow label="Next →"      value="v0.021" dimValue />
        <StatRow label=""            value="Multi-asset ETH+alts" dimValue />
        <StatRow label=""            value="Real Coinglass heatmap" dimValue />
      </div>
    </aside>
  )
}
