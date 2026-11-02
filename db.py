import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "easysplit.db"
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def get_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def init_db():
    db = get_db()
    with open(SCHEMA_PATH) as f:
        db.executescript(f.read())
    cols = [r[1] for r in db.execute("PRAGMA table_info(expenses)")]
    if "split_type" not in cols:
        db.execute("ALTER TABLE expenses ADD COLUMN split_type TEXT NOT NULL DEFAULT 'equal'")
    cols = [r[1] for r in db.execute("PRAGMA table_info(expenses)")]
    if "is_payment" not in cols:
        db.execute("ALTER TABLE expenses ADD COLUMN is_payment INTEGER NOT NULL DEFAULT 0")
    cols = [r[1] for r in db.execute("PRAGMA table_info(expenses)")]
    if "details" not in cols:
        db.execute("ALTER TABLE expenses ADD COLUMN details TEXT")
    db.commit()
    db.close()


def query(sql, params=(), one=False):
    db = get_db()
    cur = db.execute(sql, params)
    rows = cur.fetchall()
    cur.close()
    db.close()
    if one:
        return rows[0] if rows else None
    return rows


def execute(sql, params=(), return_id=False):
    db = get_db()
    cur = db.execute(sql, params)
    db.commit()
    rowid = cur.lastrowid
    cur.close()
    db.close()
    return rowid if return_id else None


def executemany(sql, params_list):
    db = get_db()
    db.executemany(sql, params_list)
    db.commit()
    db.close()
