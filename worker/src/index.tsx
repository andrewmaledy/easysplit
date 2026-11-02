import { Hono } from 'hono'
import {
  type Env, roundCents, fmtMoney, fmtDate, hashPassword, verifyPassword, genSalt,
  getProject, getMembers, getExpenses, getShares, computeBalances, simplifyDebts,
  computeRawDebts, setSession, getSessionProjectId, clearSession,
} from './lib'
import { homePage, pickProjectPage, errorPage, projectPage } from './views'

const app = new Hono<{ Bindings: Env }>()

// ─── Schema init ────────────────────────────────────────────────────────────

async function ensureSchema(db: D1Database) {
  await db.exec(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'CAD', simplify_by_default INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));`)
  await db.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, partner_id INTEGER REFERENCES members(id), etransfer TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(project_id, name));`)
  await db.exec(`CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, description TEXT NOT NULL, cost REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'CAD', date TEXT NOT NULL, split_type TEXT NOT NULL DEFAULT 'equal', is_payment INTEGER NOT NULL DEFAULT 0, details TEXT, from_member_id INTEGER REFERENCES members(id), to_member_id INTEGER REFERENCES members(id), created_by_member_id INTEGER REFERENCES members(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));`)
  await db.exec(`CREATE TABLE IF NOT EXISTS shares (id INTEGER PRIMARY KEY AUTOINCREMENT, expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE, paid_share REAL NOT NULL DEFAULT 0, owed_share REAL NOT NULL DEFAULT 0);`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_members_project ON members(project_id);`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_project ON expenses(project_id);`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_shares_expense ON shares(expense_id);`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_shares_member ON shares(member_id);`)
}

app.use('*', async (c, next) => {
  await ensureSchema(c.env.DB)
  await next()
})

// ─── Flash messages via cookie ───────────────────────────────────────────────

function setFlash(c: any, cat: string, msg: string) {
  setCookie(c, 'flash', `${cat}:${msg}`, { httpOnly: false, maxAge: 10, path: '/' })
}

function getFlash(c: any): { cat: string; msg: string }[] {
  const raw = getCookie(c, 'flash')
  if (!raw) return []
  setCookie(c, 'flash', '', { maxAge: 0, path: '/' })
  if (raw.includes(':')) {
    const [cat, ...rest] = raw.split(':')
    return [{ cat, msg: rest.join(':') }]
  }
  return []
}

import { setCookie, getCookie } from 'hono/cookie'

async function parseForm(c: any): Promise<Record<string, any>> {
  const raw = await c.req.parseBody({ all: true })
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(raw)) {
    result[key] = Array.isArray(value) && value.length === 1 ? value[0] : value
  }
  return result
}

// ─── Home ───────────────────────────────────────────────────────────────────

app.get('/', async (c) => {
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId) return c.redirect(`/projects/${sessionId}`)
  const flashMsgs = getFlash(c)
  return c.html(homePage(sessionId !== null ? 'x' : null, flashMsgs))
})

// ─── Create project ─────────────────────────────────────────────────────────

app.post('/projects', async (c) => {
  const body = await parseForm(c)
  const name = (body.name as string)?.trim()
  const password = (body.password as string)?.trim()
  const currency = (body.currency as string)?.trim().toUpperCase() || 'CAD'
  const simplify = body.simplify_by_default === 'on' || !!body.simplify_by_default
  const memberNames = (Array.isArray(body.members) ? body.members : [body.members]).filter((m: any) => m && m.trim())

  if (!name || !password || memberNames.length === 0) {
    setFlash(c, 'error', 'Name, password, and at least one member are required.')
    return c.redirect('/')
  }

  const salt = genSalt()
  const hash = await hashPassword(password, salt)
  const result = await c.env.DB.prepare(
    'INSERT INTO projects (name, password_hash, password_salt, currency, simplify_by_default) VALUES (?, ?, ?, ?, ?)'
  ).bind(name, hash, salt, currency, simplify ? 1 : 0).run()
  const projectId = result.meta.last_row_id!

  for (const memberName of memberNames) {
    await c.env.DB.prepare('INSERT INTO members (project_id, name) VALUES (?, ?)').bind(projectId, memberName.trim()).run()
  }

  await setSession(c.env.SESSIONS, c, projectId)
  return c.redirect(`/projects/${projectId}`)
})

// ─── Join project ──────────────────────────────────────────────────────────

app.post('/join', async (c) => {
  const body = await parseForm(c)
  const password = (body.password as string)?.trim()
  if (!password) { setFlash(c, 'error', 'Password is required.'); return c.redirect('/') }

  const projects = (await c.env.DB.prepare('SELECT id, password_hash, password_salt, name FROM projects ORDER BY id').all<any>()).results
  const matches: any[] = []
  for (const p of projects) {
    if (await verifyPassword(password, p.password_salt, p.password_hash)) matches.push(p)
  }

  if (matches.length === 0) { setFlash(c, 'error', 'No trip found with that password.'); return c.redirect('/') }
  if (matches.length === 1) { await setSession(c.env.SESSIONS, c, matches[0].id); return c.redirect(`/projects/${matches[0].id}`) }
  return c.html(pickProjectPage(null, [], matches))
})

app.post('/projects/:id/select', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  await setSession(c.env.SESSIONS, c, projectId)
  return c.redirect(`/projects/${projectId}`)
})

app.post('/logout', async (c) => { await clearSession(c.env.SESSIONS, c); return c.redirect('/') })

// ─── Project page ──────────────────────────────────────────────────────────

app.get('/projects/:id', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')

  const project = await getProject(c.env.DB, projectId)
  if (!project) { await clearSession(c.env.SESSIONS, c); setFlash(c, 'error', 'That project no longer exists.'); return c.redirect('/') }

  const members = await getMembers(c.env.DB, projectId)
  const expensesRaw = await getExpenses(c.env.DB, projectId)
  const balances = await computeBalances(c.env.DB, projectId)
  const simplified = simplifyDebts(balances)

  let maxAbs = 0.01
  for (const b of balances) {
    maxAbs = Math.max(maxAbs, Math.abs(b.net))
    if (b.partner_id) {
      const partner = balances.find(x => x.member_id === b.partner_id)
      if (partner) maxAbs = Math.max(maxAbs, Math.abs(b.net + partner.net))
    }
  }

  // Build expense list with shares and pie data
  const AVATAR_COLORS = ['4f46e5', '0ea5e9', '10b981', 'f43f5e', 'a855f7', 'f59e0b', '6b7280']
  const expenseList: any[] = []
  for (const e of expensesRaw) {
    const shares = await getShares(c.env.DB, e.id)
    const pie: any[] = []
    let cum = 0
    for (let i = 0; i < shares.length; i++) {
      const s = shares[i]
      if (s.owed_share > 0) {
        const pct = (s.owed_share / e.cost) * 100
        pie.push({ name: s.member_name, owed: s.owed_share, color: AVATAR_COLORS[i % AVATAR_COLORS.length], start: cum, end: cum + pct })
        cum += pct
      }
    }
    expenseList.push({
      id: e.id, description: e.description, cost: e.cost, currency: e.currency,
      date: e.date, details: e.details, created_by_name: e.created_by_name,
      is_payment: !!e.is_payment, shares, pie,
    })
  }

  const payments = expenseList.filter(e => e.is_payment)
  const membersJson = members.map(m => ({ id: m.id, name: m.name, partner_id: m.partner_id, etransfer: m.etransfer }))
  const etransferMap: Record<string, string | null> = {}
  for (const m of members) etransferMap[m.name] = m.etransfer
  const today = new Date().toISOString().slice(0, 10)
  const flashMsgs = getFlash(c)

  return c.html(projectPage(project, members, membersJson, expenseList, payments, balances, simplified, etransferMap, today, maxAbs, flashMsgs, 'x'))
})

// ─── Add expense ───────────────────────────────────────────────────────────

app.post('/projects/:id/expenses', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')

  const project = await getProject(c.env.DB, projectId)
  const members = await getMembers(c.env.DB, projectId)
  const body = await parseForm(c)

  const description = (body.description as string)?.trim()
  const details = (body.details as string)?.trim() || null
  const cost = parseFloat(body.cost as string)
  const expenseDate = (body.date as string) || new Date().toISOString().slice(0, 10)
  const splitType = body.split_type as string || 'equal'
  const payerId = parseInt(body.payer_id as string)
  const createdBy = parseInt(body.created_by_member_id as string) || null

  if (!description || !cost || cost < 0.01 || !payerId) {
    setFlash(c, 'error', 'Description, cost, and payer are required.')
    return c.redirect(`/projects/${projectId}`)
  }

  const memberIds = members.map(m => m.id)
  let sharesData: [number, number, number][] = []

  if (splitType === 'equal') {
    const involved = (Array.isArray(body.involved_members) ? body.involved_members : [body.involved_members]).filter(Boolean).map(Number)
    if (involved.length === 0) { setFlash(c, 'error', 'Select at least one member to split among.'); return c.redirect(`/projects/${projectId}`) }
    const perPerson = roundCents(cost / involved.length)
    const remainder = roundCents(cost - perPerson * involved.length)
    involved.forEach((mid, idx) => { sharesData.push([mid, idx === 0 ? cost : 0, perPerson + (idx === 0 ? remainder : 0)]) })
  } else {
    for (const m of members) {
      const paidStr = body[`paid_${m.id}`] as string
      const owedStr = body[`owed_${m.id}`] as string
      const paid = paidStr ? parseFloat(paidStr) : 0
      const owed = owedStr ? parseFloat(owedStr) : 0
      if (paid > 0 || owed > 0) sharesData.push([m.id, roundCents(paid), roundCents(owed)])
    }
    const totalPaid = roundCents(sharesData.reduce((s, x) => s + x[1], 0))
    const totalOwed = roundCents(sharesData.reduce((s, x) => s + x[2], 0))
    if (Math.abs(totalPaid - cost) > 0.02) { setFlash(c, 'error', `Paid shares (${totalPaid}) must equal the cost (${cost}).`); return c.redirect(`/projects/${projectId}`) }
    if (Math.abs(totalOwed - cost) > 0.02) { setFlash(c, 'error', `Owed shares (${totalOwed}) must equal the cost (${cost}).`); return c.redirect(`/projects/${projectId}`) }
  }

  const result = await c.env.DB.prepare(
    'INSERT INTO expenses (project_id, description, cost, currency, date, split_type, details, created_by_member_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(projectId, description, cost, project!.currency, expenseDate, splitType, details, createdBy).run()
  const expenseId = result.meta.last_row_id!

  for (const [memberId, paid, owed] of sharesData) {
    await c.env.DB.prepare('INSERT INTO shares (expense_id, member_id, paid_share, owed_share) VALUES (?, ?, ?, ?)').bind(expenseId, memberId, paid, owed).run()
  }

  setFlash(c, 'success', 'Expense added.')
  return c.redirect(`/projects/${projectId}`)
})

// ─── Delete expense ────────────────────────────────────────────────────────

app.post('/projects/:id/expenses/:eid/delete', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')
  const expenseId = parseInt(c.req.param('eid'))
  await c.env.DB.prepare('DELETE FROM shares WHERE expense_id = ?').bind(expenseId).run()
  await c.env.DB.prepare('DELETE FROM expenses WHERE id = ? AND project_id = ?').bind(expenseId, projectId).run()
  setFlash(c, 'success', 'Expense deleted.')
  return c.redirect(`/projects/${projectId}`)
})

// ─── Expense data (for edit modal) ─────────────────────────────────────────

app.get('/projects/:id/expenses/:eid/data', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')
  const expenseId = parseInt(c.req.param('eid'))
  const expense = await c.env.DB.prepare('SELECT * FROM expenses WHERE id = ? AND project_id = ?').bind(expenseId, projectId).first<any>()
  if (!expense) return c.json({ error: 'not found' }, 404)
  const shares = await getShares(c.env.DB, expenseId)
  return c.json({
    description: expense.description, cost: expense.cost, date: expense.date,
    split_type: expense.split_type, details: expense.details,
    created_by_member_id: expense.created_by_member_id,
    shares: shares.map(s => ({ member_id: s.member_id, member_name: s.member_name, paid_share: s.paid_share, owed_share: s.owed_share })),
  })
})

// ─── Edit expense ──────────────────────────────────────────────────────────

app.post('/projects/:id/expenses/:eid/edit', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')
  const expenseId = parseInt(c.req.param('eid'))
  const project = await getProject(c.env.DB, projectId)
  const members = await getMembers(c.env.DB, projectId)
  const body = await parseForm(c)

  const description = (body.description as string)?.trim()
  const details = (body.details as string)?.trim() || null
  const cost = parseFloat(body.cost as string)
  const expenseDate = (body.date as string) || new Date().toISOString().slice(0, 10)
  const splitType = body.split_type as string || 'equal'
  const payerId = parseInt(body.payer_id as string)
  const createdBy = parseInt(body.created_by_member_id as string) || null

  if (!description || !cost || cost < 0.01) { setFlash(c, 'error', 'Description and cost are required.'); return c.redirect(`/projects/${projectId}`) }

  let sharesData: [number, number, number][] = []
  if (splitType === 'equal') {
    const involved = (Array.isArray(body.involved_members) ? body.involved_members : [body.involved_members]).filter(Boolean).map(Number)
    if (involved.length === 0) { setFlash(c, 'error', 'Select at least one member.'); return c.redirect(`/projects/${projectId}`) }
    const perPerson = roundCents(cost / involved.length)
    const remainder = roundCents(cost - perPerson * involved.length)
    involved.forEach((mid, idx) => { sharesData.push([mid, idx === 0 ? cost : 0, perPerson + (idx === 0 ? remainder : 0)]) })
  } else {
    for (const m of members) {
      const paid = parseFloat(body[`paid_${m.id}`] as string) || 0
      const owed = parseFloat(body[`owed_${m.id}`] as string) || 0
      if (paid > 0 || owed > 0) sharesData.push([m.id, roundCents(paid), roundCents(owed)])
    }
  }

  await c.env.DB.prepare('UPDATE expenses SET description = ?, cost = ?, date = ?, split_type = ?, details = ?, created_by_member_id = ? WHERE id = ? AND project_id = ?')
    .bind(description, cost, expenseDate, splitType, details, createdBy, expenseId, projectId).run()
  await c.env.DB.prepare('DELETE FROM shares WHERE expense_id = ?').bind(expenseId).run()
  for (const [memberId, paid, owed] of sharesData) {
    await c.env.DB.prepare('INSERT INTO shares (expense_id, member_id, paid_share, owed_share) VALUES (?, ?, ?, ?)').bind(expenseId, memberId, paid, owed).run()
  }

  setFlash(c, 'success', 'Expense updated.')
  return c.redirect(`/projects/${projectId}`)
})

// ─── Settle up ─────────────────────────────────────────────────────────────

app.post('/projects/:id/settle', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')
  const project = await getProject(c.env.DB, projectId)
  const members = await getMembers(c.env.DB, projectId)
  const body = await parseForm(c)
  const fromName = body.from_name as string
  const toName = body.to_name as string
  const amount = parseFloat(body.amount as string)

  if (!fromName || !toName || !amount || amount < 0.01) { setFlash(c, 'error', 'Invalid settlement.'); return c.redirect(`/projects/${projectId}`) }

  const fromMember = members.find(m => m.name === fromName)
  const toMember = members.find(m => m.name === toName)
  if (!fromMember || !toMember) { setFlash(c, 'error', 'Members not found.'); return c.redirect(`/projects/${projectId}`) }

  const today = new Date().toISOString().slice(0, 10)
  const desc = `${fromName} paid ${toName}`
  const result = await c.env.DB.prepare(
    'INSERT INTO expenses (project_id, description, cost, currency, date, split_type, is_payment, from_member_id, to_member_id) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)'
  ).bind(projectId, desc, amount, project!.currency, today, 'equal', fromMember.id, toMember.id).run()
  const expenseId = result.meta.last_row_id!

  await c.env.DB.prepare('INSERT INTO shares (expense_id, member_id, paid_share, owed_share) VALUES (?, ?, ?, 0)').bind(expenseId, fromMember.id, amount).run()
  await c.env.DB.prepare('INSERT INTO shares (expense_id, member_id, paid_share, owed_share) VALUES (?, ?, 0, ?)').bind(expenseId, toMember.id, amount).run()

  setFlash(c, 'success', `Settled: ${fromName} paid ${toName} ${amount.toFixed(2)}`)
  return c.redirect(`/projects/${projectId}`)
})

// ─── Balances API ──────────────────────────────────────────────────────────

app.get('/projects/:id/balances', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')
  const project = await getProject(c.env.DB, projectId)
  const balances = await computeBalances(c.env.DB, projectId)
  const simplified = simplifyDebts(balances)
  return c.json({ balances, simplified_debts: simplified, simplify_by_default: !!project?.simplify_by_default })
})

// ─── Math API ──────────────────────────────────────────────────────────────

app.get('/projects/:id/math', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')
  const project = await getProject(c.env.DB, projectId)
  const balances = await computeBalances(c.env.DB, projectId)
  const simplified = simplifyDebts(balances)
  const { rawPairs, breakdown } = await computeRawDebts(c.env.DB, projectId)
  return c.json({ simplified, raw_pairs: rawPairs, breakdown, currency: project?.currency })
})

// ─── Toggle simplify ────────────────────────────────────────────────────────

app.post('/projects/:id/toggle-simplify', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')
  const project = await getProject(c.env.DB, projectId)
  const newVal = project?.simplify_by_default ? 0 : 1
  await c.env.DB.prepare('UPDATE projects SET simplify_by_default = ? WHERE id = ?').bind(newVal, projectId).run()
  return c.redirect(`/projects/${projectId}`)
})

// ─── Edit project ───────────────────────────────────────────────────────────

app.post('/projects/:id/edit', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')
  const body = await parseForm(c)
  const name = (body.name as string)?.trim()
  const currency = (body.currency as string)?.trim().toUpperCase() || 'CAD'
  if (!name) { setFlash(c, 'error', 'Trip name is required.'); return c.redirect(`/projects/${projectId}`) }
  await c.env.DB.prepare('UPDATE projects SET name = ?, currency = ? WHERE id = ?').bind(name, currency, projectId).run()
  setFlash(c, 'success', 'Trip updated.')
  return c.redirect(`/projects/${projectId}`)
})

// ─── Delete project ─────────────────────────────────────────────────────────

app.post('/projects/:id/delete', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')
  await c.env.DB.prepare('DELETE FROM shares WHERE expense_id IN (SELECT id FROM expenses WHERE project_id = ?)').bind(projectId).run()
  await c.env.DB.prepare('DELETE FROM expenses WHERE project_id = ?').bind(projectId).run()
  await c.env.DB.prepare('DELETE FROM members WHERE project_id = ?').bind(projectId).run()
  await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(projectId).run()
  await clearSession(c.env.SESSIONS, c)
  setFlash(c, 'success', 'Trip deleted.')
  return c.redirect('/')
})

// ─── Add member ─────────────────────────────────────────────────────────────

app.post('/projects/:id/members', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')
  const body = await parseForm(c)
  const name = (body.name as string)?.trim()
  const recalc = body.recalc as string || 'future'
  if (!name) { setFlash(c, 'error', 'Name is required.'); return c.redirect(`/projects/${projectId}`) }

  try {
    await c.env.DB.prepare('INSERT INTO members (project_id, name) VALUES (?, ?)').bind(projectId, name).run()
  } catch {
    setFlash(c, 'error', 'A member with that name already exists.')
    return c.redirect(`/projects/${projectId}`)
  }

  if (recalc === 'past') {
    const newMember = await c.env.DB.prepare('SELECT id FROM members WHERE project_id = ? AND name = ?').bind(projectId, name).first<any>()
    const expenses = (await c.env.DB.prepare('SELECT id FROM expenses WHERE project_id = ? AND is_payment = 0 AND split_type = ?').bind(projectId, 'equal').all<any>()).results
    for (const e of expenses) {
      const shares = (await c.env.DB.prepare('SELECT id FROM shares WHERE expense_id = ?').bind(e.id).all<any>()).results
      const n = shares.length + 1
      const cost = (await c.env.DB.prepare('SELECT cost FROM expenses WHERE id = ?').bind(e.id).first<any>())?.cost || 0
      const perPerson = roundCents(cost / n)
      const remainder = roundCents(cost - perPerson * n)
      for (let i = 0; i < shares.length; i++) { await c.env.DB.prepare('UPDATE shares SET owed_share = ? WHERE id = ?').bind(perPerson + (i === 0 ? remainder : 0), shares[i].id).run() }
      await c.env.DB.prepare('INSERT INTO shares (expense_id, member_id, paid_share, owed_share) VALUES (?, ?, 0, ?)').bind(e.id, newMember!.id, perPerson).run()
    }
    setFlash(c, 'success', `${name} added and included in all ${expenses.length} equal-split expenses.`)
  } else {
    setFlash(c, 'success', `${name} added.`)
  }
  return c.redirect(`/projects/${projectId}`)
})

// ─── Member data ────────────────────────────────────────────────────────────

app.get('/projects/:id/members/:mid/data', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')
  const memberId = parseInt(c.req.param('mid'))
  const member = await c.env.DB.prepare('SELECT id, name, partner_id, etransfer FROM members WHERE id = ? AND project_id = ?').bind(memberId, projectId).first<any>()
  if (!member) return c.json({ error: 'not found' }, 404)
  const members = await getMembers(c.env.DB, projectId)
  const linkable = members.filter(m => m.id !== memberId && !m.partner_id).map(m => ({ id: m.id, name: m.name }))
  return c.json({ id: member.id, name: member.name, partner_id: member.partner_id, etransfer: member.etransfer, linkable })
})

// ─── Edit member ────────────────────────────────────────────────────────────

app.post('/projects/:id/members/:mid/edit', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')
  const memberId = parseInt(c.req.param('mid'))
  const body = await parseForm(c)
  const name = (body.name as string)?.trim()
  const etransfer = (body.etransfer as string)?.trim() || null
  const partnerId = body.partner_id ? parseInt(body.partner_id as string) : null
  const unlink = body.unlink === '1'

  if (!name) { setFlash(c, 'error', 'Name is required.'); return c.redirect(`/projects/${projectId}`) }

  const member = await c.env.DB.prepare('SELECT partner_id FROM members WHERE id = ? AND project_id = ?').bind(memberId, projectId).first<any>()

  if (unlink || (partnerId && partnerId === memberId)) {
    if (member?.partner_id) await c.env.DB.prepare('UPDATE members SET partner_id = NULL WHERE id = ? AND project_id = ?').bind(member.partner_id, projectId).run()
    await c.env.DB.prepare('UPDATE members SET name = ?, etransfer = ?, partner_id = NULL WHERE id = ? AND project_id = ?').bind(name, etransfer, memberId, projectId).run()
  } else if (partnerId) {
    if (member?.partner_id) await c.env.DB.prepare('UPDATE members SET partner_id = NULL WHERE id = ? AND project_id = ?').bind(member.partner_id, projectId).run()
    await c.env.DB.prepare('UPDATE members SET name = ?, etransfer = ?, partner_id = ? WHERE id = ? AND project_id = ?').bind(name, etransfer, partnerId, memberId, projectId).run()
    await c.env.DB.prepare('UPDATE members SET partner_id = ? WHERE id = ? AND project_id = ?').bind(memberId, partnerId, projectId).run()
  } else {
    await c.env.DB.prepare('UPDATE members SET name = ?, etransfer = ? WHERE id = ? AND project_id = ?').bind(name, etransfer, memberId, projectId).run()
  }

  setFlash(c, 'success', 'Member updated.')
  return c.redirect(`/projects/${projectId}`)
})

// ─── Delete member ──────────────────────────────────────────────────────────

app.post('/projects/:id/members/:mid/delete', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const sessionId = await getSessionProjectId(c.env.SESSIONS, c)
  if (sessionId !== projectId) return c.redirect('/')
  const memberId = parseInt(c.req.param('mid'))

  const shares = await c.env.DB.prepare('SELECT 1 FROM shares WHERE member_id = ? LIMIT 1').bind(memberId).first()
  if (shares) { setFlash(c, 'error', 'Cannot delete a member with expenses. Delete their expenses first.'); return c.redirect(`/projects/${projectId}`) }

  const created = await c.env.DB.prepare('SELECT 1 FROM expenses WHERE created_by_member_id = ? LIMIT 1').bind(memberId).first()
  if (created) { setFlash(c, 'error', 'Cannot delete a member who created expenses.'); return c.redirect(`/projects/${projectId}`) }

  const member = await c.env.DB.prepare('SELECT partner_id FROM members WHERE id = ? AND project_id = ?').bind(memberId, projectId).first<any>()
  if (member?.partner_id) await c.env.DB.prepare('UPDATE members SET partner_id = NULL WHERE id = ? AND project_id = ?').bind(member.partner_id, projectId).run()

  await c.env.DB.prepare('DELETE FROM members WHERE id = ? AND project_id = ?').bind(memberId, projectId).run()
  setFlash(c, 'success', 'Member removed.')
  return c.redirect(`/projects/${projectId}`)
})

// ─── 404 ───────────────────────────────────────────────────────────────────

app.notFound((c) => c.html(errorPage(null, [], 404, 'Page not found')))

export default app
