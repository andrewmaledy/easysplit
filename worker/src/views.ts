import { html } from 'hono/html'
import { STYLES } from './styles'
import { fmtMoney, fmtDate, type Project, type Member, type Balance } from './lib'

// ─── Base layout ────────────────────────────────────────────────────────────

export function layout(title: string, sessionId: string | null, flashMsgs: {cat: string; msg: string}[], content: any) {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>${STYLES}</style>
</head>
<body>
  <div class="nav">
    <a href="/" class="nav-brand"><span class="dot"></span> EasySplit</a>
    ${sessionId ? html`<form action="/logout" method="POST"><button type="submit" class="btn-leave">Log Out</button></form>` : ''}
  </div>
  <div class="container">
    ${flashMsgs.map(f => html`<div class="flash ${f.cat}">${f.msg}</div>`)}
    ${content}
  </div>
</body>`
}

// ─── Home page ─────────────────────────────────────────────────────────────

export function homePage(sessionId: string | null, flashMsgs: any[]) {
  return layout('EasySplit', sessionId, flashMsgs, html`
    <div class="hero">
      <h1>Split expenses, the easy way.</h1>
      <p>Create a trip, set a password, share it with your group. Add expenses as you go and see exactly who owes what.</p>
    </div>
    <div class="split-cards">
      <div class="card">
        <h2>Enter a Trip</h2>
        <p style="color:var(--text-dim);font-size:0.8125rem;margin-bottom:16px;">Got a trip password? Enter it to jump in.</p>
        <form method="POST" action="/join">
          <div class="field">
            <label for="password">Trip Password</label>
            <input type="password" id="password" name="password" required autofocus placeholder="Enter the password shared with you">
          </div>
          <button type="submit" style="width:100%;">Enter Trip</button>
        </form>
      </div>
      <div class="card">
        <h2>Create a Trip</h2>
        <p style="color:var(--text-dim);font-size:0.8125rem;margin-bottom:16px;">Start a new trip and invite people with the password.</p>
        <form method="POST" action="/projects">
          <div class="row">
            <div class="field" style="flex:2;">
              <label for="name">Trip Name</label>
              <input type="text" id="name" name="name" required placeholder="Weekend in Lisbon">
            </div>
            <div class="field" style="max-width:90px;flex:0;">
              <label for="currency">Currency</label>
              <input type="text" id="currency" name="currency" value="CAD" maxlength="3">
            </div>
          </div>
          <div class="field">
            <label for="create_password">Trip Password</label>
            <input type="password" id="create_password" name="password" required placeholder="Set a password to share">
          </div>
          <div class="field">
            <label>Members</label>
            <div class="member-input-list" id="member-fields">
              <input type="text" name="members" placeholder="Your name">
            </div>
            <button type="button" class="add-member-btn" onclick="addMemberField()">+ Add member</button>
          </div>
          <div class="field">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--text);font-size:0.8125rem;font-weight:600;">
              <input type="checkbox" name="simplify_by_default" checked style="width:16px;height:16px;accent-color:var(--accent);">
              Simplify debts — minimize the number of payments to settle up
            </label>
          </div>
          <button type="submit" style="width:100%;">Create Trip</button>
        </form>
      </div>
    </div>
    <script>
    function addMemberField() {
      const c = document.getElementById('member-fields');
      const n = c.children.length;
      const i = document.createElement('input');
      i.type = 'text'; i.name = 'members'; i.placeholder = 'Member ' + (n + 1);
      c.appendChild(i); i.focus();
    }
    </script>
  `)
}

// ─── Pick project page ──────────────────────────────────────────────────────

export function pickProjectPage(sessionId: string | null, flashMsgs: any[], projects: any[]) {
  return layout('Select a Trip — EasySplit', sessionId, flashMsgs, html`
    <div class="section">
      <div class="section-header"><h2>Multiple Trips Found</h2></div>
      <p style="color:var(--text-dim);font-size:0.8125rem;margin-bottom:16px;">Several trips share that password. Which one do you want to open?</p>
      <div class="card">
        ${projects.map((p) => html`
          <form method="POST" action="/projects/${p.id}/select" style="margin-bottom:10px;">
            <button type="submit" class="btn-secondary" style="width:100%;text-align:left;display:flex;align-items:center;gap:10px;">
              <span style="font-weight:600;">${p.name}</span>
              <span class="pill" style="margin-left:auto;">ID ${p.id}</span>
            </button>
          </form>
        `)}
      </div>
      <p style="margin-top:16px;"><a href="/" class="btn btn-secondary">Back</a></p>
    </div>
  `)
}

// ─── Error page ─────────────────────────────────────────────────────────────

export function errorPage(sessionId: string | null, flashMsgs: any[], code: number, message: string) {
  return layout(`Error ${code}`, sessionId, flashMsgs, html`
    <div class="card empty-state" style="margin-top:40px;">
      <div class="icon">${code}</div>
      <p style="font-weight:600;margin-bottom:8px;">${message}</p>
      <p style="margin-top:16px;"><a href="/" class="btn">Go Home</a></p>
    </div>
  `)
}

// ─── Project page ───────────────────────────────────────────────────────────
// This is the big one — ported from project.html

export function projectPage(
  project: Project,
  members: Member[],
  membersJson: any[],
  expenses: any[],
  payments: any[],
  balances: Balance[],
  simplified: any[],
  etransferMap: Record<string, string | null>,
  today: string,
  maxAbs: number,
  flashMsgs: any[],
  sessionId: string | null,
) {
  return layout(`${project.name} — EasySplit`, sessionId, flashMsgs, html`
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:4px;">
      <h1>${project.name}</h1>
      <span class="pill hide-mobile">${project.currency}</span>
      <form method="POST" action="/projects/${project.id}/toggle-simplify" class="hide-mobile">
        <button type="submit" class="pill ${project.simplify_by_default ? 'green' : ''}" style="cursor:pointer;border:none;font-family:inherit;font-size:0.8125rem;font-weight:500;">
          Simplify debts: ${project.simplify_by_default ? 'On' : 'Off'}
        </button>
      </form>
      <button type="button" class="pill hide-mobile" style="cursor:pointer;border:1px solid var(--border);font-family:inherit;font-size:0.8125rem;font-weight:500;background:var(--surface);" onclick="openTripSettings()">&#9881; Trip Settings</button>
    </div>
    <p class="hide-mobile" style="color:var(--text-dim);font-size:0.75rem;margin-bottom:18px;">Share the trip password with anyone you want to add expenses.</p>

    <div class="mobile-tabs">
      <div class="mobile-tab active" onclick="mobileTab('expenses')">Expenses</div>
      <div class="mobile-tab" onclick="mobileTab('add')">+ Add</div>
      <div class="mobile-tab" onclick="mobileTab('balances')">Balances</div>
      <div class="mobile-tab" onclick="mobileTab('settle')">Settle</div>
      <div class="mobile-tab" onclick="mobileTab('members')">Members</div>
    </div>

    <div class="dashboard-grid">
      ${settleTile(project, simplified, etransferMap, payments)}
      ${balancesTile(project, balances, maxAbs)}
      ${addExpenseTile(project, members, today)}
      ${expensesTile(project, expenses)}
      ${membersTile(project, members)}
    </div>

    ${mathModal()}
    ${editExpenseModal(members)}
    ${addMemberModal(project)}
    ${settleModal(project)}
    ${tripSettingsModal(project)}
    ${editMemberModal()}

    <script>
    const projectId = ${project.id};
    const membersData = ${JSON.stringify(membersJson)};
    ${PROJECT_JS}
    </script>
  `)
}

// ─── Settle tile ───────────────────────────────────────────────────────────

function settleTile(project: Project, simplified: any[], etransferMap: Record<string, string | null>, payments: any[]) {
  return html`
    <div class="section tile-settle">
      <div class="section-header">
        <h2>Settle Up</h2>
        <button class="btn-secondary btn-sm hide-mobile" id="show-math-btn">Show me the math</button>
      </div>
      ${simplified.length ? html`
        <div class="card" style="padding:16px;">
          ${simplified.map((t) => html`
            <div class="debt-card">
              <div class="avatar">${t.from[0].toUpperCase()}</div>
              <div>
                <div class="who">${t.from}</div>
                <div class="arrow">pays ${t.to}</div>
                ${etransferMap[t.to] ? html`<div style="font-size:0.6875rem;color:var(--text-dim);margin-top:2px;">&#128231; ${etransferMap[t.to]}</div>` : ''}
              </div>
              <div class="amt">${project.currency} ${fmtMoney(t.amount)}</div>
              <button type="button" class="btn-sm" style="margin-left:8px;" onclick="openSettle('${t.from}', '${t.to}', ${t.amount})">Settle</button>
            </div>
          `)}
        </div>
      ` : html`
        <div class="card empty-state">
          <div class="icon">&#10003;</div>
          <p style="font-weight:500;">Everyone's settled up!</p>
        </div>
      `}
      ${payments.length ? html`
        <div style="margin-top:16px;">
          <h3 style="font-size:0.8125rem;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Payment History</h3>
          ${payments.map((p) => html`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border);font-size:0.875rem;">
              <div><span style="font-weight:500;">${p.description}</span><span style="color:var(--text-dim);margin-left:4px;">${fmtDate(p.date)}</span></div>
              <span style="font-weight:600;">${project.currency} ${fmtMoney(p.cost)}</span>
            </div>
          `)}
        </div>
      ` : ''}
    </div>
  `
}

// ─── Balances tile ─────────────────────────────────────────────────────────

function balancesTile(project: Project, balances: Balance[], maxAbs: number) {
  const shown: number[] = []
  const rows: any[] = []
  for (const b of balances) {
    if (shown.includes(b.member_id)) continue
    const pid = b.partner_id
    if (pid) {
      const partner = balances.find(x => x.member_id === pid)
      if (partner) { shown.push(pid); shown.push(b.member_id)
        const combinedNet = partner ? roundCents(b.net + partner.net) : b.net
        const combinedName = partner ? `${b.name} & ${partner.name}` : b.name
        rows.push({ combined: true, name: combinedName, net: combinedNet, b, partner })
        continue
      }
    }
    rows.push({ combined: false, name: b.name, net: b.net, b })
  }

  return html`
    <div class="section tile-balances">
      <div class="section-header"><h2>Balances</h2></div>
      <div class="card">
        ${rows.map((r) => {
          if (r.combined) {
            const w = Math.abs(r.net / maxAbs * 50)
            return html`
              <div class="balance-bar">
                <div class="name">
                  <span>${r.name}</span>
                  ${r.b.net !== r.partner.net ? html`<span style="font-size:0.75rem;color:var(--text-dim);margin-left:4px;">(${r.b.name} ${r.b.net >= 0 ? '+' : ''}${r.b.net.toFixed(2)}, ${r.partner.name} ${r.partner.net >= 0 ? '+' : ''}${r.partner.net.toFixed(2)})</span>` : ''}
                </div>
                <div class="bar-track">
                  ${r.net > 0.01 ? html`<div class="bar-fill pos" style="width:${w.toFixed(1)}%;"></div>` : ''}
                  ${r.net < -0.01 ? html`<div class="bar-fill neg" style="width:${w.toFixed(1)}%;"></div>` : ''}
                </div>
                <div class="amt ${r.net > 0.01 ? 'pos' : r.net < -0.01 ? 'neg' : 'neutral'}">
                  ${r.net > 0.01 ? '+' : ''}${project.currency} ${fmtMoney(r.net)}
                </div>
              </div>
            `
          }
          const w = Math.abs(r.net / maxAbs * 50)
          return html`
            <div class="balance-bar">
              <div class="name">${r.name}</div>
              <div class="bar-track">
                ${r.net > 0.01 ? html`<div class="bar-fill pos" style="width:${w.toFixed(1)}%;"></div>` : ''}
                ${r.net < -0.01 ? html`<div class="bar-fill neg" style="width:${w.toFixed(1)}%;"></div>` : ''}
              </div>
              <div class="amt ${r.net > 0.01 ? 'pos' : r.net < -0.01 ? 'neg' : 'neutral'}">
                ${r.net > 0.01 ? '+' : ''}${project.currency} ${fmtMoney(r.net)}
              </div>
            </div>
          `
        })}
      </div>
    </div>
  `
}

function roundCents(n: number): number { return Math.round(n * 100) / 100 }

// ─── Add expense tile ──────────────────────────────────────────────────────

function addExpenseTile(project: Project, members: Member[], today: string) {
  return html`
    <div class="section tile-add-expense">
      <div class="section-header"><h2>Add Expense</h2></div>
      <div class="card">
        <form method="POST" action="/projects/${project.id}/expenses" id="expense-form">
          <div class="field">
            <label for="description">What was it for?</label>
            <input type="text" id="description" name="description" required placeholder="Dinner, gas, groceries...">
          </div>
          <div class="field">
            <label for="details">Notes <span style="color:var(--text-dim);font-weight:400;">(optional)</span></label>
            <textarea id="details" name="details" rows="2" placeholder="Add any extra details..." style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.9375rem;font-family:inherit;resize:vertical;background:var(--surface);color:var(--text);"></textarea>
          </div>
          <div class="row">
            <div class="field" style="flex:1;">
              <label for="cost">Cost</label>
              <input type="number" id="cost" name="cost" step="0.01" min="0.01" required placeholder="0.00">
            </div>
            <div class="field" style="flex:1;">
              <label for="date">Date</label>
              <input type="date" id="date" name="date" value="${today}">
            </div>
          </div>
          <div class="row">
            <div class="field" style="flex:1;">
              <label for="created_by_member_id">Entered by</label>
              <select id="created_by_member_id" name="created_by_member_id">
                ${members.map(m => html`<option value="${m.id}">${m.name}</option>`)}
              </select>
            </div>
            <div class="field" style="flex:1;">
              <label for="payer_id">Paid by</label>
              <select id="payer_id" name="payer_id">
                ${members.map(m => html`<option value="${m.id}">${m.name}</option>`)}
              </select>
            </div>
          </div>
          <div class="field">
            <label>Split</label>
            <div class="tabs">
              <div class="tab active" id="tab-equal" onclick="showSplit('equal')">Split Equally</div>
              <div class="tab" id="tab-custom" onclick="showSplit('custom')">Custom</div>
            </div>
            <input type="hidden" name="split_type" id="split_type" value="equal">
          </div>
          <div id="equal-split">
            <label>Split among</label>
            <div class="check-row">
              ${members.map(m => html`
                <label>
                  <input type="checkbox" name="involved_members" value="${m.id}" checked
                         data-partner="${m.partner_id || ''}"
                         onchange="syncPartner(this)">
                  ${m.name}
                </label>
              `)}
            </div>
          </div>
          <div id="custom-split" style="display:none;"></div>
          <button type="submit" style="width:100%;margin-top:8px;">Add Expense</button>
        </form>
      </div>
    </div>
  `
}

// ─── Expenses tile ─────────────────────────────────────────────────────────

function expensesTile(project: Project, expenses: any[]) {
  return html`
    <div class="section tile-expenses mobile-active">
      <div class="section-header"><h2>Expenses</h2></div>
      ${expenses.length ? html`
        <div class="card" style="padding:0;overflow:hidden;">
          <table>
            <thead>
              <tr>
                <th class="hide-mobile">Date</th>
                <th>Description</th>
                <th class="hide-mobile">By</th>
                <th class="right">Cost</th>
                <th class="hide-mobile">Split</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${expenses.map((e) => html`
                <tr${e.is_payment ? ' class="payment-row"' : ''}>
                  <td class="hide-mobile" style="color:var(--text-dim);font-size:0.875rem;white-space:nowrap;">${fmtDate(e.date)}</td>
                  <td style="font-weight:500;">
                    ${e.description}
                    ${e.is_payment ? html`<span class="pill green" style="margin-left:6px;font-size:0.7rem;padding:1px 8px;">Payment</span>` : ''}
                    ${e.details ? html`<div style="font-size:0.75rem;color:var(--text-dim);font-weight:400;margin-top:2px;">${e.details}</div>` : ''}
                  </td>
                  <td class="hide-mobile" style="color:var(--text-dim);">${e.created_by_name || '—'}</td>
                  <td class="right" style="font-weight:600;">${project.currency} ${fmtMoney(e.cost)}</td>
                  <td class="hide-mobile">
                    <div class="pie-cell">
                      <div class="pie-icon" style="background: conic-gradient(${e.pie.map((seg: any, i: number) => `${i ? ', ' : ''}#${seg.color} ${seg.start}% ${seg.end}%`).join('')});"
                           data-pie='${JSON.stringify(e.pie)}' data-currency="${project.currency}"></div>
                    </div>
                  </td>
                  <td>
                    <div class="expense-actions">
                      <button type="button" class="btn-secondary btn-sm" onclick="openEditExpense(${e.id})">Edit</button>
                      <form method="POST" action="/projects/${project.id}/expenses/${e.id}/delete" style="display:inline;" onsubmit="return confirm('Delete this expense?');">
                        <button type="submit" class="btn-danger btn-sm">Delete</button>
                      </form>
                    </div>
                  </td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      ` : html`
        <div class="card empty-state">
          <div class="icon">&#128178;</div>
          <p>No expenses yet. Add one!</p>
        </div>
      `}
    </div>
  `
}

// ─── Members tile ──────────────────────────────────────────────────────────

function membersTile(project: Project, members: Member[]) {
  const shown: number[] = []
  const chips: any[] = []
  for (const m of members) {
    if (shown.includes(m.id)) continue
    const pid = m.partner_id
    if (pid) {
      const partner = members.find(x => x.id === pid)
      if (partner) { shown.push(pid); shown.push(m.id)
        chips.push({ grouped: true, m, partner })
        continue
      }
    }
    chips.push({ grouped: false, m })
  }

  return html`
    <div class="section tile-members">
      <div class="section-header">
        <h2>Members</h2>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary btn-sm hide-mobile" onclick="openTripSettings()">&#9881; Settings</button>
          <button class="btn-secondary btn-sm" onclick="openAddMember()">+ Add Member</button>
        </div>
      </div>
      <div class="card">
        <div class="mobile-only" style="display:none;margin-bottom:12px;">
          <form method="POST" action="/projects/${project.id}/toggle-simplify" style="display:inline;">
            <button type="submit" class="pill ${project.simplify_by_default ? 'green' : ''}" style="cursor:pointer;border:1px solid var(--border);font-family:inherit;font-size:0.8125rem;font-weight:500;background:var(--surface);">
              Simplify: ${project.simplify_by_default ? 'On' : 'Off'}
            </button>
          </form>
          <button type="button" class="pill" style="margin-left:8px;cursor:pointer;border:1px solid var(--border);font-family:inherit;font-size:0.8125rem;font-weight:500;background:var(--surface);color:var(--accent);" onclick="openTripSettings()">&#9881; Trip Settings</button>
        </div>
        <div class="members-list">
          ${chips.map((c) => {
            if (c.grouped) {
              return html`
                <span class="member-group">
                  <span class="member-chip">
                    <span class="av">${c.m.name[0].toUpperCase()}</span>
                    <span>${c.m.name}</span>
                    <button type="button" onclick="openEditMember(${c.m.id})" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:0.6875rem;padding:0 2px;font-weight:600;" title="Edit">Edit</button>
                  </span>
                  <span class="label">grouped</span>
                  <span class="member-chip">
                    <span class="av">${c.partner.name[0].toUpperCase()}</span>
                    <span>${c.partner.name}</span>
                    <button type="button" onclick="openEditMember(${c.partner.id})" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:0.6875rem;padding:0 2px;font-weight:600;" title="Edit">Edit</button>
                  </span>
                </span>
              `
            }
            return html`
              <span class="member-chip">
                <span class="av">${c.m.name[0].toUpperCase()}</span>
                <span>${c.m.name}</span>
                <button type="button" onclick="openEditMember(${c.m.id})" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:0.6875rem;padding:0 2px;font-weight:600;" title="Edit">Edit</button>
              </span>
            `
          })}
        </div>
      </div>
    </div>
  `
}

// ─── Modals ─────────────────────────────────────────────────────────────────

function mathModal() {
  return html`
    <div id="math-modal" class="modal-overlay" style="display:none;">
      <div class="modal">
        <div class="modal-header"><h2>How the debts work</h2><button class="modal-close" onclick="closeMath()">&times;</button></div>
        <div class="modal-body" id="math-body"></div>
      </div>
    </div>
  `
}

function editExpenseModal(members: Member[]) {
  return html`
    <div id="edit-modal" class="modal-overlay" style="display:none;">
      <div class="modal">
        <div class="modal-header"><h2>Edit Expense</h2><button class="modal-close" onclick="closeEditExpense()">&times;</button></div>
        <div class="modal-body">
          <form method="POST" action="" id="edit-expense-form">
            <div class="field"><label for="edit_description">What was it for?</label><input type="text" id="edit_description" name="description" required></div>
            <div class="field"><label for="edit_details">Notes <span style="color:var(--text-dim);font-weight:400;">(optional)</span></label><textarea id="edit_details" name="details" rows="2" placeholder="Add any extra details..." style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.9375rem;font-family:inherit;resize:vertical;background:var(--surface);color:var(--text);"></textarea></div>
            <div class="row">
              <div class="field" style="flex:1;"><label for="edit_cost">Cost</label><input type="number" id="edit_cost" name="cost" step="0.01" min="0.01" required oninput="updateEditSummary()"></div>
              <div class="field" style="flex:1;"><label for="edit_date">Date</label><input type="date" id="edit_date" name="date"></div>
            </div>
            <div class="row">
              <div class="field" style="flex:1;"><label for="edit_created_by">Entered by</label><select id="edit_created_by" name="created_by_member_id">${members.map(m => html`<option value="${m.id}">${m.name}</option>`)}</select></div>
              <div class="field" style="flex:1;"><label for="edit_payer">Paid by</label><select id="edit_payer" name="payer_id">${members.map(m => html`<option value="${m.id}">${m.name}</option>`)}</select></div>
            </div>
            <div class="field"><label>Split</label><div class="tabs"><div class="tab active" id="edit-tab-equal" onclick="showEditSplit('equal')">Split Equally</div><div class="tab" id="edit-tab-custom" onclick="showEditSplit('custom')">Custom</div></div><input type="hidden" name="split_type" id="edit_split_type" value="equal"></div>
            <div id="edit-equal-split"><label>Split among</label><div class="check-row" id="edit-involved-members"></div></div>
            <div id="edit-custom-split" style="display:none;"></div>
            <button type="submit" style="width:100%;margin-top:8px;">Save Changes</button>
          </form>
        </div>
      </div>
    </div>
  `
}

function addMemberModal(project: Project) {
  return html`
    <div id="addmember-modal" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header"><h2>Add Member</h2><button class="modal-close" onclick="closeAddMember()">&times;</button></div>
        <div class="modal-body">
          <form method="POST" action="/projects/${project.id}/members">
            <div class="field"><label for="new_member_name">Name</label><input type="text" id="new_member_name" name="name" required></div>
            <div class="field"><label>Recalculate past expenses?</label>
              <div class="radio-cards">
                <div class="radio-card selected" id="rc-future" onclick="selectRecalc('future')">
                  <input type="radio" name="recalc" value="future" checked>
                  <div><div style="font-weight:600;font-size:0.875rem;">Future only</div><div style="font-size:0.75rem;color:var(--text-dim);">New member only included in new expenses</div></div>
                </div>
                <div class="radio-card" id="rc-past" onclick="selectRecalc('past')">
                  <input type="radio" name="recalc" value="past">
                  <div><div style="font-weight:600;font-size:0.875rem;">Recalculate all</div><div style="font-size:0.75rem;color:var(--text-dim);">Add to past equal-split expenses</div></div>
                </div>
              </div>
            </div>
            <button type="submit" style="width:100%;">Add Member</button>
          </form>
        </div>
      </div>
    </div>
  `
}

function settleModal(project: Project) {
  return html`
    <div id="settle-modal" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header"><h2>Settle Up</h2><button class="modal-close" onclick="closeSettle()">&times;</button></div>
        <div class="modal-body">
          <form method="POST" action="/projects/${project.id}/settle" id="settle-form">
            <div class="settle-summary">
              <div class="settle-who"><div><div class="who" id="settle-from"></div><div class="arrow">pays <span id="settle-to"></span></div></div></div>
              <div class="settle-total"><div class="settle-label">Total owed</div><div class="settle-amount" id="settle-total"></div></div>
            </div>
            <div class="field"><label for="settle_amount">Amount to pay</label><input type="number" id="settle_amount" name="amount" step="0.01" min="0.01" required></div>
            <input type="hidden" name="from_name" id="settle_from_name">
            <input type="hidden" name="to_name" id="settle_to_name">
            <div class="settle-remaining-bar">
              <div class="progress-row"><span class="progress-label">Remaining after payment</span><span class="progress-value" id="settle-remaining">$0.00</span></div>
              <div class="progress-bar-track"><div class="progress-bar-fill" id="settle-bar" style="width:0%;background:var(--green);"></div></div>
            </div>
            <div class="settle-quick">
              <button type="button" class="btn-secondary btn-sm" onclick="settleHalf()">Half</button>
              <button type="button" class="btn-secondary btn-sm" onclick="settleFull()">Full amount</button>
            </div>
            <button type="submit" style="width:100%;margin-top:12px;">Settle Up</button>
          </form>
        </div>
      </div>
    </div>
  `
}

function tripSettingsModal(project: Project) {
  return html`
    <div id="tripsettings-modal" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header"><h2>Trip Settings</h2><button class="modal-close" onclick="closeTripSettings()">&times;</button></div>
        <div class="modal-body">
          <form method="POST" action="/projects/${project.id}/edit">
            <div class="field"><label for="trip_name">Trip Name</label><input type="text" id="trip_name" name="name" value="${project.name}" required></div>
            <div class="field"><label for="trip_currency">Currency</label><input type="text" id="trip_currency" name="currency" value="${project.currency}" required maxlength="3" style="text-transform:uppercase;"></div>
            <button type="submit" style="width:100%;">Save Changes</button>
          </form>
          <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);">
          <form method="POST" action="/projects/${project.id}/delete" onsubmit="return confirm('Delete this trip and ALL its data? This cannot be undone.');">
            <button type="submit" class="btn-danger" style="width:100%;">Delete Trip</button>
          </form>
        </div>
      </div>
    </div>
  `
}

function editMemberModal() {
  return html`
    <div id="editmember-modal" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header"><h2>Edit Member</h2><button class="modal-close" onclick="closeEditMember()">&times;</button></div>
        <div class="modal-body">
          <form method="POST" action="" id="edit-member-form">
            <div class="field"><label for="em_name">Name</label><input type="text" id="em_name" name="name" required></div>
            <div class="field"><label for="em_etransfer">E-transfer email/phone <span style="color:var(--text-dim);font-weight:400;">(optional)</span></label><input type="text" id="em_etransfer" name="etransfer" placeholder="alice@example.com or +1 555-0123"></div>
            <div class="field"><label for="em_partner">Grouped with</label><select id="em_partner" name="partner_id"><option value="">None</option></select></div>
            <input type="hidden" name="unlink" id="em_unlink" value="0">
            <button type="submit" style="width:100%;">Save Changes</button>
          </form>
          <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);">
          <form method="POST" action="" id="delete-member-form" onsubmit="return confirm('Remove this member from the trip? They must have no expenses.');">
            <button type="submit" class="btn-danger" style="width:100%;">Remove Member</button>
          </form>
        </div>
      </div>
    </div>
  `
}

// ─── Project JS (all the client-side JS) ────────────────────────────────────

const PROJECT_JS = `
let editingExpenseId = null;
function showSplit(type) {
  document.getElementById('split_type').value = type;
  document.getElementById('equal-split').style.display = type === 'equal' ? '' : 'none';
  document.getElementById('custom-split').style.display = type === 'custom' ? '' : 'none';
  document.getElementById('tab-equal').classList.toggle('active', type === 'equal');
  document.getElementById('tab-custom').classList.toggle('active', type === 'custom');
  if (type === 'custom') updateCustomSummary();
}
function syncPartner(cb) {
  const pid = cb.dataset.partner; if (!pid) return;
  const p = document.querySelector('input[name="involved_members"][value="' + pid + '"]'); if (p) p.checked = cb.checked;
}
function mobileTab(tab) {
  document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  const map = { 'add':'add-expense', 'expenses':'expenses', 'balances':'balances', 'settle':'settle', 'members':'members' };
  const target = map[tab];
  ['add-expense','expenses','balances','settle','members'].forEach(t => {
    document.querySelector('.tile-' + t).classList.remove('mobile-active');
  });
  if (target) document.querySelector('.tile-' + target).classList.add('mobile-active');
  window.scrollTo(0, 0);
}
function openMath() { document.getElementById('math-modal').style.display = 'flex'; document.body.style.overflow = 'hidden'; loadMath(); }
function closeMath() { document.getElementById('math-modal').style.display = 'none'; document.body.style.overflow = ''; }
async function loadMath() {
  const r = await fetch('/projects/' + projectId + '/math'); const d = await r.json();
  let html = '<div class="math-subtitle">Simplified debts — the fewest payments needed to settle up.</div>';
  d.simplified.forEach(t => { html += '<div class="debt-card"><div><div class="who">' + t.from + ' pays ' + t.to + '</div></div><div class="amt">' + d.currency + ' ' + t.amount.toFixed(2) + '</div></div>'; });
  html += '<hr style="margin:16px 0;border:none;border-top:1px solid var(--border);">';
  html += '<div class="math-subtitle">Without simplify — each expense broken down individually.</div>';
  if (d.breakdown.length === 0) { html += '<p style="color:var(--text-dim);font-size:0.8125rem;">No debts to show.</p>'; }
  d.breakdown.forEach(b => { html += '<div class="breakdown-item"><div class="breakdown-title">' + b.description + '</div>'; b.debts.forEach(db => { html += '<div class="breakdown-debt">' + db.from + ' → ' + db.to + ': ' + d.currency + ' ' + db.amount.toFixed(2) + '</div>'; }); html += '</div>'; });
  if (d.raw_pairs && d.raw_pairs.length) {
    html += '<hr style="margin:16px 0;border:none;border-top:1px solid var(--border);"><div class="math-subtitle">Aggregated debts (per pair, after netting).</div>';
    d.raw_pairs.forEach(p => { html += '<div class="breakdown-debt">' + p.from + ' → ' + p.to + ': ' + d.currency + ' ' + p.amount.toFixed(2) + '</div>'; });
  }
  document.getElementById('math-body').innerHTML = html;
}
function openAddMember() { document.getElementById('addmember-modal').style.display = 'flex'; document.getElementById('new_member_name').focus(); document.body.style.overflow = 'hidden'; selectRecalc('future'); }
function closeAddMember() { document.getElementById('addmember-modal').style.display = 'none'; document.body.style.overflow = ''; }
function selectRecalc(w) { document.getElementById('rc-future').classList.toggle('selected', w === 'future'); document.getElementById('rc-past').classList.toggle('selected', w === 'past'); }
function openTripSettings() { document.getElementById('tripsettings-modal').style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeTripSettings() { document.getElementById('tripsettings-modal').style.display = 'none'; document.body.style.overflow = ''; }
let editingMemberId = null;
async function openEditMember(memberId) {
  editingMemberId = memberId;
  const r = await fetch('/projects/' + projectId + '/members/' + memberId + '/data'); const d = await r.json();
  document.getElementById('em_name').value = d.name;
  document.getElementById('em_etransfer').value = d.etransfer || '';
  const sel = document.getElementById('em_partner'); sel.innerHTML = '<option value="">None</option>';
  if (d.partner_id) { sel.innerHTML += '<option value="' + d.partner_id + '" selected>Unlink</option>'; document.getElementById('em_unlink').value = '1'; }
  else { document.getElementById('em_unlink').value = '0'; d.linkable.forEach(m => { sel.innerHTML += '<option value="' + m.id + '">' + m.name + '</option>'; }); }
  document.getElementById('edit-member-form').action = '/projects/' + projectId + '/members/' + memberId + '/edit';
  document.getElementById('delete-member-form').action = '/projects/' + projectId + '/members/' + memberId + '/delete';
  document.getElementById('editmember-modal').style.display = 'flex'; document.body.style.overflow = 'hidden';
}
function closeEditMember() { document.getElementById('editmember-modal').style.display = 'none'; document.body.style.overflow = ''; }
async function openEditExpense(expenseId) {
  editingExpenseId = expenseId;
  const r = await fetch('/projects/' + projectId + '/expenses/' + expenseId + '/data'); const d = await r.json();
  document.getElementById('edit_description').value = d.description;
  document.getElementById('edit_details').value = d.details || '';
  document.getElementById('edit_cost').value = d.cost;
  document.getElementById('edit_date').value = d.date;
  document.getElementById('edit_created_by').value = d.created_by_member_id || '';
  const involvedDiv = document.getElementById('edit-involved-members'); involvedDiv.innerHTML = '';
  const owedMap = {}, paidMap = {};
  d.shares.forEach(s => { if (s.owed_share > 0) owedMap[s.member_id] = s.owed_share; if (s.paid_share > 0) paidMap[s.member_id] = s.paid_share; });
  membersData.forEach(m => { const lbl = document.createElement('label'); const cb = document.createElement('input'); cb.type='checkbox'; cb.value=m.id; cb.checked = m.id in owedMap; lbl.appendChild(cb); lbl.appendChild(document.createTextNode(' ' + m.name)); involvedDiv.appendChild(lbl); });
  const payer = d.shares.find(s => s.paid_share > 0); if (payer) document.getElementById('edit_payer').value = payer.member_id;
  document.getElementById('edit-expense-form').action = '/projects/' + projectId + '/expenses/' + expenseId + '/edit';
  document.getElementById('edit-modal').style.display = 'flex'; document.body.style.overflow = 'hidden';
}
function closeEditExpense() { document.getElementById('edit-modal').style.display = 'none'; document.body.style.overflow = ''; }
function openSettle(from, to, amount) {
  document.getElementById('settle_from_name').value = from; document.getElementById('settle_to_name').value = to;
  document.getElementById('settle-from').textContent = from; document.getElementById('settle-to').textContent = to;
  document.getElementById('settle-total').textContent = '$' + amount.toFixed(2);
  document.getElementById('settle_amount').value = amount.toFixed(2); document.getElementById('settle_amount').max = amount;
  updateSettleRemaining(); document.getElementById('settle-modal').style.display = 'flex'; document.body.style.overflow = 'hidden';
}
function closeSettle() { document.getElementById('settle-modal').style.display = 'none'; document.body.style.overflow = ''; }
function updateSettleRemaining() { const total = parseFloat(document.getElementById('settle-total').textContent.replace('$','')); const amt = parseFloat(document.getElementById('settle_amount').value) || 0; const rem = Math.max(0, total - amt); document.getElementById('settle-remaining').textContent = '$' + rem.toFixed(2); document.getElementById('settle-bar').style.width = (total > 0 ? (amt/total*100) : 0) + '%'; }
function settleHalf() { const total = parseFloat(document.getElementById('settle-total').textContent.replace('$','')); document.getElementById('settle_amount').value = (total/2).toFixed(2); updateSettleRemaining(); }
function settleFull() { const total = parseFloat(document.getElementById('settle-total').textContent.replace('$','')); document.getElementById('settle_amount').value = total.toFixed(2); updateSettleRemaining(); }
document.getElementById('settle_amount').addEventListener('input', updateSettleRemaining);
document.getElementById('show-math-btn').addEventListener('click', openMath);
document.getElementById('math-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeMath(); });
document.getElementById('addmember-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeAddMember(); });
document.getElementById('tripsettings-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeTripSettings(); });
document.getElementById('editmember-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeEditMember(); });
document.getElementById('settle-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeSettle(); });
document.getElementById('edit-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeEditExpense(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMath(); closeAddMember(); closeEditExpense(); closeSettle(); closeTripSettings(); closeEditMember(); } });
// Pie tooltip
let pieFloat = null;
document.addEventListener('mouseover', e => {
  const icon = e.target.closest('.pie-icon'); if (!icon) return;
  const data = JSON.parse(icon.dataset.pie); const cur = icon.dataset.currency;
  if (pieFloat) pieFloat.remove();
  pieFloat = document.createElement('div'); pieFloat.className = 'pie-float';
  let h = '<div class="pie-float-title">Split breakdown</div>';
  data.forEach(s => { h += '<div class="pie-float-row"><span class="pie-dot" style="background:#' + s.color + ';"></span><span>' + s.name + ' — ' + cur + ' ' + s.owed.toFixed(2) + '</span></div>'; });
  pieFloat.innerHTML = h; document.body.appendChild(pieFloat);
  const rect = icon.getBoundingClientRect(); pieFloat.style.top = (rect.bottom + 8) + 'px'; pieFloat.style.left = rect.left + 'px';
});
document.addEventListener('mouseout', e => { if (e.target.closest('.pie-icon') && pieFloat) { pieFloat.remove(); pieFloat = null; } });
`
