import React from 'react'
import type { Condition, ConditionState } from '../../types'
import './SignalsPanel.css'

interface SignalsPanelProps {
  conditions: Condition[]
  activeCount: number
}

const STATE_LABELS: Record<ConditionState, string> = {
  inactive: 'Idle',
  watching: 'Watch',
  active:   'Active',
  alert:    'Alert',
}

const ConditionCard: React.FC<{ condition: Condition }> = ({ condition }) => {
  const { state, label, value } = condition
  return (
    <div className={`cond-card cond-card--${state}`}>
      <div className="cond-card__header">
        <span className={`state-dot state-dot--${state}`} />
        <span className="cond-card__label">{label}</span>
        {value && (
          <span className="cond-card__value">{value}</span>
        )}
      </div>
      <div className="cond-card__state">{STATE_LABELS[state]}</div>
    </div>
  )
}

export const SignalsPanel: React.FC<SignalsPanelProps> = ({ conditions, activeCount }) => {
  return (
    <div className="signals-panel">
      {/* Header */}
      <div className="signals-panel__header">
        <span className="signals-panel__title">Conditions</span>
        <span className={`signals-panel__count ${activeCount > 0 ? 'signals-panel__count--active' : ''}`}>
          {activeCount} active
        </span>
      </div>

      <div className="sep-h" />

      {/* Conditions */}
      <div className="signals-panel__conditions">
        {conditions.map(c => (
          <ConditionCard key={c.id} condition={c} />
        ))}
      </div>

      <div className="sep-h" />

      {/* Future zones */}
      <div className="signals-panel__future">
        <div className="signals-panel__future-title">Coming</div>
        {[
          'Anomaly Score',
          'Liquidation Map',
          'OI Divergence',
          'Funding Signal',
          'Alert Engine',
        ].map(label => (
          <div key={label} className="signals-panel__future-item">
            <span className="state-dot state-dot--inactive" />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Bottom note */}
      <div className="signals-panel__note">
        Anomaly engine — v0.002
      </div>
    </div>
  )
}
