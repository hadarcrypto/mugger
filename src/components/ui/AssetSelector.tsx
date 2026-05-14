import React, { useState, useEffect, useRef } from 'react'
import type { ScannedAsset } from '../../data/scanner'
import { scanAssets, getDTCandidates, getSTCandidates } from '../../data/scanner'
import './AssetSelector.css'

interface AssetSelectorProps {
  currentSymbol: string
  onSelect: (symbol: string) => void
}

const fmt = {
  p: (v: number) => v > 1000
    ? `$${v.toLocaleString('en', { maximumFractionDigits: 0 })}`
    : v > 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`,
  pct: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`,
}

const DirectionArrow = ({ dir }: { dir: string }) => (
  <span className={`asset-dir asset-dir--${dir}`}>
    {dir === 'long' ? '↑' : dir === 'short' ? '↓' : '→'}
  </span>
)

const EdgeBar = ({ edge, tier }: { edge: number; tier?: string }) => (
  <div className="asset-edge-bar">
    <div className={`asset-edge-fill asset-edge-fill--${tier ?? 'neutral'}`} style={{ width: `${edge}%` }} />
    <span className="asset-edge-num">{edge}</span>
  </div>
)

export const AssetSelector: React.FC<AssetSelectorProps> = ({ currentSymbol, onSelect }) => {
  const [open, setOpen] = useState(false)
  const [assets, setAssets] = useState<ScannedAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'DT' | 'ST' | 'ALL'>('DT')
  const [lastScan, setLastScan] = useState<Date | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const currentName = currentSymbol.replace('USDT', '')

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Scan when opened
  useEffect(() => {
    if (!open) return
    setLoading(true)
    scanAssets().then(results => {
      setAssets(results)
      setLastScan(new Date())
      setLoading(false)
    })
  }, [open])

  const dtList = getDTCandidates(assets)
  const stList = getSTCandidates(assets)
  const list = tab === 'ALL' ? assets : tab === 'DT' ? dtList : stList

  return (
    <div className="asset-selector" ref={dropRef}>
      {/* Trigger */}
      <button
        className="asset-selector__trigger"
        onClick={() => setOpen(o => !o)}
      >
        <span className="asset-selector__name">{currentName}</span>
        <span className={`asset-selector__arrow ${open ? 'asset-selector__arrow--open' : ''}`}>▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="asset-selector__dropdown">
          {/* Tabs */}
          <div className="asset-selector__tabs">
            <button
              className={`asset-selector__tab ${tab === 'DT' ? 'asset-selector__tab--active' : ''}`}
              onClick={() => setTab('DT')}
            >
              Day Trading
            </button>
            <button
              className={`asset-selector__tab ${tab === 'ST' ? 'asset-selector__tab--active' : ''}`}
              onClick={() => setTab('ST')}
            >
              Swing
            </button>
            <button
              className={`asset-selector__tab ${tab === 'ALL' ? 'asset-selector__tab--active' : ''}`}
              onClick={() => setTab('ALL')}
            >
              All
            </button>
            {lastScan && (
            <button
              className={`asset-selector__tab ${tab === 'ALL' ? 'asset-selector__tab--active' : ''}`}
              onClick={() => setTab('ALL')}
            >
              All
            </button>
              <span className="asset-selector__scan-time">
                {lastScan.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            )}
          </div>

          {/* List */}
          <div className="asset-selector__list">
            {loading && (
              <div className="asset-selector__loading">
                <span className="state-dot state-dot--watching" />
                Scanning {tab === 'DT' ? '43 assets' : '43 assets'}...
              </div>
            )}

            {!loading && list.length === 0 && (
              <div className="asset-selector__empty">No anomalies detected</div>
            )}

            {!loading && list.map(a => (
              <button
                key={a.symbol}
                className={`asset-row ${a.symbol === currentSymbol ? 'asset-row--active' : ''}`}
                onClick={() => { onSelect(a.symbol); setOpen(false) }}
              >
                <div className="asset-row__left">
                  <DirectionArrow dir={a.direction} />
                  <span className="asset-row__name">{a.name}</span>
                  <span className={`asset-row__change ${a.change24h >= 0 ? 'pos' : 'neg'}`}>
                    {fmt.pct(a.change24h)}
                  </span>
                </div>
                <div className="asset-row__right">
                  <EdgeBar edge={tab === 'DT' ? a.dtEdge : a.stEdge} tier={a.tier} />
                  <span className="asset-row__reason">{a.reason}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="asset-selector__footer">
            Ranked by EDGE · Anomalies first · Updates every 5min
          </div>
        </div>
      )}
    </div>
  )
}
