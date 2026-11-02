// ─── Types ──────────────────────────────────────────────────────────────────

export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
}

export interface Project {
  id: number
  name: string
  password_hash: string
  password_salt: string
  currency: string
  simplify_by_default: number
}

export interface Member {
  id: number
  project_id: number
  name: string
  partner_id: number | null
  etransfer: string | null
}

export interface Balance {
  member_id: number
  name: string
  paid: number
  owed: number
  net: number
  partner_id: number | null
  etransfer: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100
}

export function fmtMoney(value: number): string {
  return (value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtDate(value: string): string {
  if (!value) return ''
  try {
    const d = new Date(value + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return value
  }
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256
  )
  return btoa(String.fromCharCode(...new Uint8Array(bits)))
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  return await hashPassword(password, salt) === hash
}

export function genSalt(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr))
}

export function genSessionId(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr)).replace(/[/+=]/g, '')
}

// ─── DB helpers ─────────────────────────────────────────────────────────────

export async function getProject(db: D1Database, projectId: number): Promise<Project | null> {
  return await db.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<Project>() ?? null
}

export async function getMembers(db: D1Database, projectId: number): Promise<Member[]> {
  return (await db.prepare('SELECT * FROM members WHERE project_id = ? ORDER BY name').bind(projectId).all<Member>()).results ?? []
}

export async function getExpenses(db: D1Database, projectId: number): Promise<any[]> {
  return (await db.prepare(`
    SELECT e.*, m.name as created_by_name
    FROM expenses e LEFT JOIN members m ON e.created_by_member_id = m.id
    WHERE e.project_id = ? ORDER BY e.date DESC, e.created_at DESC
  `).bind(projectId).all<any>()).results ?? []
}

export async function getShares(db: D1Database, expenseId: number): Promise<any[]> {
  return (await db.prepare(`
    SELECT s.*, m.name as member_name
    FROM shares s JOIN members m ON s.member_id = m.id
    WHERE s.expense_id = ?
  `).bind(expenseId).all<any>()).results ?? []
}

export async function getAllShares(db: D1Database, projectId: number): Promise<any[]> {
  return (await db.prepare(`
    SELECT s.*, m.name as member_name, m.id as member_id
    FROM shares s JOIN expenses e ON s.expense_id = e.id JOIN members m ON s.member_id = m.id
    WHERE e.project_id = ?
  `).bind(projectId).all<any>()).results ?? []
}

// ─── Balance computation ────────────────────────────────────────────────────

export async function computeBalances(db: D1Database, projectId: number): Promise<Balance[]> {
  const rows = await getAllShares(db, projectId)
  const members = await getMembers(db, projectId)
  const balances: Record<number, Balance> = {}

  for (const m of members) {
    balances[m.id] = { member_id: m.id, name: m.name, paid: 0, owed: 0, net: 0, partner_id: m.partner_id, etransfer: m.etransfer }
  }
  for (const r of rows) {
    if (!balances[r.member_id]) balances[r.member_id] = { member_id: r.member_id, name: r.member_name, paid: 0, owed: 0, net: 0, partner_id: null, etransfer: null }
    balances[r.member_id].paid += r.paid_share
    balances[r.member_id].owed += r.owed_share
  }
  for (const b of Object.values(balances)) {
    b.paid = roundCents(b.paid)
    b.owed = roundCents(b.owed)
    b.net = roundCents(b.paid - b.owed)
  }
  return Object.values(balances).sort((a, b) => a.name.localeCompare(b.name))
}

// ─── Simplify debts ────────────────────────────────────────────────────────

export function simplifyDebts(balances: Balance[]): { from: string; to: string; amount: number }[] {
  const seen = new Set<number>()
  const merged: { name: string; net: number }[] = []
  for (const b of balances) {
    const pid = b.partner_id
    if (pid && !seen.has(b.member_id) && !seen.has(pid)) {
      const partner = balances.find(x => x.member_id === pid)
      if (partner) { merged.push({ name: `${b.name} & ${partner.name}`, net: roundCents(b.net + partner.net) }); seen.add(b.member_id); seen.add(pid); continue }
    }
    if (!seen.has(b.member_id)) { merged.push({ name: b.name, net: b.net }); seen.add(b.member_id) }
  }
  const debtors = merged.filter(m => m.net < -0.01).map(m => ({ name: m.name, amount: roundCents(-m.net) })).sort((a, b) => b.amount - a.amount)
  const creditors = merged.filter(m => m.net > 0.01).map(m => ({ name: m.name, amount: roundCents(m.net) })).sort((a, b) => b.amount - a.amount)
  const txns: { from: string; to: string; amount: number }[] = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount)
    txns.push({ from: debtors[i].name, to: creditors[j].name, amount: roundCents(pay) })
    debtors[i].amount = roundCents(debtors[i].amount - pay)
    creditors[j].amount = roundCents(creditors[j].amount - pay)
    if (debtors[i].amount < 0.01) i++
    if (creditors[j].amount < 0.01) j++
  }
  return txns
}

// ─── Raw debts ────────────────────────────────────────────────────────────

export async function computeRawDebts(db: D1Database, projectId: number) {
  const expenses = (await db.prepare('SELECT id, description FROM expenses WHERE project_id = ? AND is_payment = 0 ORDER BY date DESC, created_at DESC').bind(projectId).all<any>()).results ?? []
  const aggregated: Record<string, Record<string, number>> = {}
  const breakdown: any[] = []
  for (const e of expenses) {
    const shares = await getShares(db, e.id)
    const nets: Record<number, number> = {}
    for (const s of shares) nets[s.member_id] = (nets[s.member_id] || 0) + s.paid_share - s.owed_share
    const debtors = Object.entries(nets).filter(([, n]) => n < -0.01).map(([id, n]) => ({ id: +id, amt: -n }))
    const creditors = Object.entries(nets).filter(([, n]) => n > 0.01).map(([id, n]) => ({ id: +id, amt: n }))
    const totalCred = creditors.reduce((s, c) => s + c.amt, 0) || 1
    const expenseDebts: any[] = []
    for (const d of debtors) for (const c of creditors) {
      const share = roundCents(d.amt * (c.amt / totalCred))
      if (share < 0.01) continue
      const key = [d.id, c.id].sort().join('-')
      if (!aggregated[key]) aggregated[key] = {}
      const dirKey = `${d.id}-${c.id}`
      aggregated[key][dirKey] = (aggregated[key][dirKey] || 0) + share
      expenseDebts.push({ from: shares.find(s => s.member_id === d.id)?.member_name || '?', to: shares.find(s => s.member_id === c.id)?.member_name || '?', amount: share })
    }
    if (expenseDebts.length) breakdown.push({ description: e.description, debts: expenseDebts })
  }
  const members = await getMembers(db, projectId)
  const names: Record<number, string> = {}
  for (const m of members) names[m.id] = m.name
  const rawPairs: any[] = []
  for (const dirs of Object.values(aggregated)) for (const [dk, amt] of Object.entries(dirs)) {
    if (amt > 0.01) { const [d, c] = dk.split('-').map(Number); rawPairs.push({ from: names[d] || '?', to: names[c] || '?', amount: roundCents(amt) }) }
  }
  rawPairs.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
  return { rawPairs, breakdown }
}

// ─── Session ───────────────────────────────────────────────────────────────

export async function setSession(kv: KVNamespace, c: any, projectId: number) {
  const sid = genSessionId()
  await kv.put(`session:${sid}`, String(projectId), { expirationTtl: 86400 * 30 })
  setCookie(c, 'sid', sid, { httpOnly: true, sameSite: 'Lax', maxAge: 86400 * 30, path: '/' })
}

export async function getSessionProjectId(kv: KVNamespace, c: any): Promise<number | null> {
  const sid = getCookie(c, 'sid')
  if (!sid) return null
  const val = await kv.get(`session:${sid}`)
  return val ? parseInt(val) : null
}

export async function clearSession(kv: KVNamespace, c: any) {
  const sid = getCookie(c, 'sid')
  if (sid) await kv.delete(`session:${sid}`)
  setCookie(c, 'sid', '', { httpOnly: true, sameSite: 'Lax', maxAge: 0, path: '/' })
}

import { setCookie, getCookie } from 'hono/cookie'
