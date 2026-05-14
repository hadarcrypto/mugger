import React from 'react'
import type { ActiveSetup } from '../../data/setup'
import './SetupCard.css'

interface SetupCardProps {
  setup: ActiveSetup
  onDismiss: () => void
}

const fmt = {
  p: (v: number) => v > 1000
    ? `$${v.toLocaleString('en', { maximumFractionDigits: 0 })}`
    : `$${v.toFixed(2)}`,
  rr: (v: number) => `1:${v.toFixed(1)}`,
}

export const SetupCard: React.FC<SetupCardProps> = ({ setup, onDismiss }) => {
  const isLong = setup.direction === 'long'
  const risk = Math.abs(setup.entry - setup.stop)

  return (
    <div className="setup-card">
      {/* Header */}
      <div className="setup-card__header">
        <div className="setup-card__dot" />
        <span className="setup-card__title">
          {isLong ? '↑ LONG' : '↓ SHORT'} · {setup.timeframe.toUpperCase()}
        </span>
        <span className="setup-card__edge">Edge {setup.edge}</span>
        <span className="setup-card__lev">{setup.leverage}</span>
        <button className="setup-card__close" onClick={onDismiss}>×</button>
      </div>

      {/* Levels */}
      <div className="setup-card__levels">
        {/* Entry */}
        <div className="setup-card__row setup-card__row--entry">
          <span className="setup-card__row-label">Entry</span>
          <span className="setup-card__row-price">{fmt.p(setup.entry)}</span>
        </div>

        {/* Stop */}
        <div className="setup-card__row setup-card__row--stop">
          <span className="setup-card__row-label">Stop</span>
          <span className="setup-card__row-price">{fmt.p(setup.stop)}</span>
          <span className="setup-card__row-sub">Risk {fmt.p(risk)}</span>
        </div>

        {/* TPs */}
        {[
          { label: 'TP1', price: setup.tp1, rr: setup.rr1, pct: 40 },
          { label: 'TP2', price: setup.tp2, rr: setup.rr2, pct: 40 },
          { label: 'TP3', price: setup.tp3, rr: setup.rr3, pct: 20 },
        ].map(tp => (
          <div key={tp.label} className="setup-card__row setup-card__row--tp">
            <span className="setup-card__row-label">{tp.label}</span>
            <span className="setup-card__row-price">{fmt.p(tp.price)}</span>
            <span className="setup-card__row-rr">{fmt.rr(tp.rr)}</span>
            <span className="setup-card__row-sub">{tp.pct}%</span>
          </div>
        ))}
      </div>

      {/* Trigger */}
      <div className="setup-card__trigger">
        {setup.trigger}
      </div>

      {/* Status */}
      <div className="setup-card__status">
        <span className={`setup-card__status-dot setup-card__status-dot--${setup.status}`} />
        <span className="setup-card__status-label">
          {setup.status === 'active'   ? 'Active — watching'
           : setup.status === 'tp1_hit' ? 'TP1 hit — stop to breakeven'
           : setup.status === 'tp2_hit' ? 'TP2 hit — trailing'
           : setup.status === 'tp3_hit' ? 'Complete'
           : setup.status === 'stopped' ? 'Stopped out'
           : 'Invalidated'}
        </span>
      </div>
    </div>
  )
}
