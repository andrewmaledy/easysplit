-- EasySplit D1 Schema

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CAD',
    simplify_by_default INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    partner_id INTEGER REFERENCES members(id),
    etransfer TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    cost REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CAD',
    date TEXT NOT NULL,
    split_type TEXT NOT NULL DEFAULT 'equal',
    is_payment INTEGER NOT NULL DEFAULT 0,
    details TEXT,
    from_member_id INTEGER REFERENCES members(id),
    to_member_id INTEGER REFERENCES members(id),
    created_by_member_id INTEGER REFERENCES members(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    paid_share REAL NOT NULL DEFAULT 0,
    owed_share REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_members_project ON members(project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_project ON expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_shares_expense ON shares(expense_id);
CREATE INDEX IF NOT EXISTS idx_shares_member ON shares(member_id);
