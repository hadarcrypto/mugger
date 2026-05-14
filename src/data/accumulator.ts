/**
 * Statistical Accumulator v0.020
 * - IndexedDB замість localStorage (більша квота, не скидається при "Clear Site Data")
 * - Fallback до localStorage якщо IndexedDB недоступний
 * - Логує причину відсутності сетапу (setup rejection log)
 * - Готовий до синхронізації з сервером (Supabase/PlanetScale) в майбутньому
 */

import type { ActiveSetup } from './setup'

const DB_NAME    = 'mugger_db'
const DB_VERSION = 1
const STORE_RECORDS = 'setup_records'
const STORE_STATS   = 'accumulator_stats'
const LS_FALLBACK   = 'mugger_stats_v2'

export interface SetupRecord {
  id: string
  direction: 'long' | 'short'
  timeframe: string
  mode: 'DT' | 'ST'
  edge: number
  outcome: 'win_tp1' | 'win_tp2' | 'win_tp3' | 'loss' | 'pending'
  rr_achieved: number
  fundingSign: 'pos' | 'neg' | 'neutral'
  lsSkew: 'crowd_long' | 'crowd_short' | 'neutral'
  rsiZone: 'overbought' | 'oversold' | 'neutral'
  rejectionReason?: string   // why no setup was generated (null = setup was generated)
  createdAt: number
  closedAt?: number
}

export interface SetupRejection {
  symbol: string
  timeframe: string
  mode: 'DT' | 'ST'
  edge: number
  reason: string    // e.g. "RR1 < 1.5", "no magnets", "edge below threshold"
  timestamp: number
}

export interface AccumulatorStats {
  totalSetups: number
  wins: number
  losses: number
  pending: number
  winRate: number
  avgRR: number
  byTimeframe: Record<string, { wins: number; losses: number; winRate: number }>
  byDirection: Record<string, { wins: number; losses: number; winRate: number }>
  byMode:      Record<string, { wins: number; losses: number; winRate: number }>
  weights: {
    funding:    number
    crowdSkew:  number
    rsiExtreme: number
    volumeSpike: number
    volatility:  number
  }
  lastUpdated: number
}

const DEFAULT_STATS: AccumulatorStats = {
  totalSetups: 0, wins: 0, losses: 0, pending: 0,
  winRate: 0, avgRR: 0,
  byTimeframe: {}, byDirection: {}, byMode: {},
  weights: { funding: 1.0, crowdSkew: 1.0, rsiExtreme: 1.0, volumeSpike: 1.0, volatility: 1.0 },
  lastUpdated: Date.now(),
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no idb')); return }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        const s = db.createObjectStore(STORE_RECORDS, { keyPath: 'id' })
        s.createIndex('outcome',   'outcome',   { unique: false })
        s.createIndex('mode',      'mode',      { unique: false })
        s.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_STATS)) {
        db.createObjectStore(STORE_STATS, { keyPath: 'id' })
      }
    }
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror   = () => reject(req.error)
  })
  return dbPromise
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(storeName, 'readonly')
      const req = tx.objectStore(storeName).getAll()
      req.onsuccess = () => resolve(req.result as T[])
      req.onerror   = () => reject(req.error)
    })
  } catch { return [] }
}

async function idbPut(storeName: string, value: object): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const req = tx.objectStore(storeName).put(value)
      req.onsuccess = () => resolve()
      req.onerror   = () => reject(req.error)
    })
  } catch {
    // Fallback to localStorage
    try {
      const existing = JSON.parse(localStorage.getItem(LS_FALLBACK) || '{}')
      localStorage.setItem(LS_FALLBACK, JSON.stringify({ ...existing, [storeName]: value }))
    } catch {}
  }
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(storeName, 'readwrite')
      const req = tx.objectStore(storeName).delete(key)
      req.onsuccess = () => resolve()
      req.onerror   = () => reject(req.error)
    })
  } catch {}
}

// ─── Stats rebuilder ──────────────────────────────────────────────────────────

function rebuildStats(records: SetupRecord[]): AccumulatorStats {
  const closed  = records.filter(r => r.outcome !== 'pending')
  const wins    = closed.filter(r => r.outcome.startsWith('win'))
  const losses  = closed.filter(r => r.outcome === 'loss')

  const byTF:  Record<string, { wins: number; losses: number; winRate: number }> = {}
  const byDir: Record<string, { wins: number; losses: number; winRate: number }> = {}
  const byMode:Record<string, { wins: number; losses: number; winRate: number }> = {}

  closed.forEach(r => {
    const isWin = r.outcome.startsWith('win')
    for (const [map, key] of [[byTF, r.timeframe], [byDir, r.direction], [byMode, r.mode || 'ST']] as [typeof byTF, string][]) {
      if (!map[key]) map[key] = { wins: 0, losses: 0, winRate: 0 }
      if (isWin) map[key].wins++; else map[key].losses++
    }
  })

  for (const map of [byTF, byDir, byMode]) {
    Object.keys(map).forEach(k => {
      const t = map[k], total = t.wins + t.losses
      t.winRate = total > 0 ? Math.round(t.wins / total * 100) : 0
    })
  }

  const globalWR = closed.length > 0 ? wins.length / closed.length : 0
  const avgRR    = wins.length > 0 ? wins.reduce((s, r) => s + r.rr_achieved, 0) / wins.length : 0

  const weights = { ...DEFAULT_STATS.weights }
  if (closed.length >= 10) {
    const calc = (filter: (r: SetupRecord) => boolean, winFilter: (r: SetupRecord) => boolean) => {
      const total = closed.filter(filter).length
      const w     = closed.filter(r => filter(r) && winFilter(r)).length
      return total > 0 ? w / total : 0.5
    }
    const isWin = (r: SetupRecord) => r.outcome.startsWith('win')
    weights.funding    = Math.max(0.5, Math.min(1.5, 0.5 + calc(r => r.fundingSign !== 'neutral', isWin) * 2))
    weights.crowdSkew  = Math.max(0.5, Math.min(1.5, 0.5 + calc(r => r.lsSkew !== 'neutral', isWin) * 2))
    weights.rsiExtreme = Math.max(0.5, Math.min(1.5, 0.5 + calc(r => r.rsiZone !== 'neutral', isWin) * 2))
  }

  return {
    totalSetups: records.length,
    wins: wins.length,
    losses: losses.length,
    pending: records.filter(r => r.outcome === 'pending').length,
    winRate: Math.round(globalWR * 100),
    avgRR: Math.round(avgRR * 100) / 100,
    byTimeframe: byTF,
    byDirection: byDir,
    byMode,
    weights,
    lastUpdated: Date.now(),
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function recordSetup(
  setup: ActiveSetup,
  fundingRate: number,
  longRatio: number,
  rsi: number,
  mode: 'DT' | 'ST' = 'ST'
): Promise<void> {
  const record: SetupRecord = {
    id:          setup.id,
    direction:   setup.direction,
    timeframe:   setup.timeframe,
    mode,
    edge:        setup.edge,
    outcome:     'pending',
    rr_achieved: 0,
    fundingSign: fundingRate < -0.0001 ? 'neg' : fundingRate > 0.0001 ? 'pos' : 'neutral',
    lsSkew:      longRatio < 45 ? 'crowd_short' : longRatio > 55 ? 'crowd_long' : 'neutral',
    rsiZone:     rsi <= 30 ? 'oversold' : rsi >= 70 ? 'overbought' : 'neutral',
    createdAt:   setup.createdAt,
  }
  await idbPut(STORE_RECORDS, record)
  const records = await idbGetAll<SetupRecord>(STORE_RECORDS)
  const stats   = rebuildStats(records)
  await idbPut(STORE_STATS, { id: 'main', ...stats })
}

/** Log why a setup was NOT generated — helps debug edge threshold tuning */
export async function logRejection(rejection: SetupRejection): Promise<void> {
  const id = `rej-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  await idbPut('setup_records', {
    id,
    direction: 'neutral',
    timeframe: rejection.timeframe,
    mode:      rejection.mode,
    edge:      rejection.edge,
    outcome:   'pending',
    rr_achieved: 0,
    fundingSign: 'neutral',
    lsSkew: 'neutral',
    rsiZone: 'neutral',
    rejectionReason: rejection.reason,
    createdAt: rejection.timestamp,
  } as SetupRecord)
}

export async function closeSetup(
  setupId: string,
  outcome: SetupRecord['outcome'],
  rrAchieved: number
): Promise<void> {
  const records = await idbGetAll<SetupRecord>(STORE_RECORDS)
  const rec = records.find(r => r.id === setupId)
  if (!rec) return
  rec.outcome      = outcome
  rec.rr_achieved  = rrAchieved
  rec.closedAt     = Date.now()
  await idbPut(STORE_RECORDS, rec)
  const stats = rebuildStats(records.map(r => r.id === setupId ? rec : r))
  await idbPut(STORE_STATS, { id: 'main', ...stats })
}

export async function getStats(): Promise<AccumulatorStats> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx  = db.transaction(STORE_STATS, 'readonly')
      const req = tx.objectStore(STORE_STATS).get('main')
      req.onsuccess = () => resolve(req.result ? { ...DEFAULT_STATS, ...req.result } : DEFAULT_STATS)
      req.onerror   = () => resolve(DEFAULT_STATS)
    })
  } catch { return DEFAULT_STATS }
}

export async function getRecords(): Promise<SetupRecord[]> {
  return idbGetAll<SetupRecord>(STORE_RECORDS)
}

export async function getAdjustedWeights(): Promise<AccumulatorStats['weights']> {
  const stats = await getStats()
  return stats.weights
}

export async function clearAll(): Promise<void> {
  try {
    const db = await openDB()
    await Promise.all([
      new Promise<void>((res, rej) => {
        const tx  = db.transaction(STORE_RECORDS, 'readwrite')
        const req = tx.objectStore(STORE_RECORDS).clear()
        req.onsuccess = () => res(); req.onerror = () => rej(req.error)
      }),
      new Promise<void>((res, rej) => {
        const tx  = db.transaction(STORE_STATS, 'readwrite')
        const req = tx.objectStore(STORE_STATS).clear()
        req.onsuccess = () => res(); req.onerror = () => rej(req.error)
      }),
    ])
  } catch {
    localStorage.removeItem(LS_FALLBACK)
  }
}

// Sync helper — в майбутньому відправляє записи на сервер
export async function exportForSync(): Promise<SetupRecord[]> {
  return idbGetAll<SetupRecord>(STORE_RECORDS)
}
