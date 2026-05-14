import React, { useState, useEffect } from 'react'
import type { Ticker } from '../../types'
import { AssetSelector } from '../ui/AssetSelector'
import './Header.css'

interface HeaderProps {
  ticker: Ticker | null
  isConnected: boolean
  lastUpdate: number | null
  livePrice: number | null
  currentSymbol: string
  onSymbolChange: (symbol: string) => void
}

// Mugger logo — minimal jaw/M mark
const MuggerMark: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="mugger-mark">
    <rect x="0.5" y="0.5" width="19" height="19" rx="1" stroke="#2a2a2a" />
    {/* Crocodile jaw / candlestick hybrid */}
    <path d="M3 13 L7 13 L7 7 L13 7 L13 13 L17 13" stroke="#686868" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M3 11 L17 6" stroke="#b8b8b8" strokeWidth="0.8" strokeLinecap="round"/>
    <rect x="6" y="9" width="1.5" height="4" fill="#b8b8b8"/>
    <rect x="9.5" y="7.5" width="1.5" height="5.5" fill="#686868"/>
    <rect x="13" y="9" width="1.5" height="4" fill="#b8b8b8"/>
    <circle cx="16" cy="7" r="1.2" fill="#d8d8d8"/>
  </svg>
)

const fmt = {
  price: (v: number) => v > 1000
    ? `$${v.toLocaleString('en', { maximumFractionDigits: 0 })}`
    : `$${v.toFixed(2)}`,
  pct: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`,
  time: (ts: number) => new Date(ts).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
}

export const Header: React.FC<HeaderProps> = ({ ticker, isConnected, lastUpdate, livePrice, currentSymbol, onSymbolChange }) => {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])
  const displayPrice = livePrice ?? ticker?.price ?? 0
  const pct = ticker?.changePct24h ?? 0
  const isPositive = pct >= 0

  return (
    <header className="header">
      {/* Brand */}
      <div className="header__brand">
        <MuggerMark />
        <div className="header__brand-text">
          <span className="header__name">MUGGER</span>
          
        </div>
      </div>

      <div className="header__sep" />

      {/* BTC Price */}
      <div className="header__market">
        <AssetSelector currentSymbol={currentSymbol} onSelect={onSymbolChange} />
        <span className="header__price">
          {displayPrice > 0 ? fmt.price(displayPrice) : '—'}
        </span>
        <span className={`header__change ${isPositive ? 'pos' : 'neg'}`}>
          {ticker ? fmt.pct(pct) : '—'}
        </span>
      </div>

      <div className="header__sep" />

      {/* 24H stats */}
      {ticker && (
        <div className="header__stats">
          <div className="header__stat">
            <span className="header__stat-label">24H H</span>
            <span className="header__stat-value">{fmt.price(ticker.high24h)}</span>
          </div>
          <div className="header__stat">
            <span className="header__stat-label">24H L</span>
            <span className="header__stat-value">{fmt.price(ticker.low24h)}</span>
          </div>
          <div className="header__stat">
            <span className="header__stat-label">Vol</span>
            <span className="header__stat-value">
              ${(ticker.volume24h / 1e9).toFixed(2)}B
            </span>
          </div>
        </div>
      )}

      {/* Status */}
      <div className="header__status">
        <div className={`header__conn ${isConnected ? 'header__conn--live' : 'header__conn--off'}`}>
          <span className="header__conn-dot" />
          <span className="header__conn-label">
            {isConnected ? 'LIVE' : 'CONNECTING'}
          </span>
        </div>
        <span className="header__time">{fmt.time(now)}</span>
      </div>
    </header>
  )
}
