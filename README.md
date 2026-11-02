# EasySplit

A simple expense-splitting app with SQLite backend, project-level passwords, and debt simplification. Inspired by [Splitwise](https://www.splitwise.com).

## Features

- **Project-based splitting** — create a project, add members, split expenses
- **Simple password auth** — the project creator sets a password; anyone with the project ID + password can add or delete expenses for any member
- **Split equally or custom** — divide cost evenly across selected members, or specify exact paid/owed amounts per person
- **Simplify debts** — calculates the minimum number of payments needed to settle all balances (greedy algorithm)
- **SQLite** — single-file database, no external server needed

## Quick Start

```bash
pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000.

## How It Works

### Creating a Project
1. Enter a project name, password, currency, and at least one member name
2. You're logged in automatically and get a project ID to share

### Joining a Project
1. Enter the project ID and password on the home page
2. Full access — add expenses, add members, delete expenses

### Splitting Expenses
- **Split Equally**: choose which members are involved and who paid; cost is divided evenly
- **Custom Split**: specify exact "Paid" and "Owes" amounts per member (both columns must sum to the total cost)

### Simplify Debts
Computes each member's net balance (total paid − total owed) across all expenses, then uses a greedy algorithm to produce the minimum set of pairwise payments that settles everything.

Example: if A owes B $10, B owes C $10, and A owes C $10, the raw debts are 3 transactions. Simplified: A pays C $20 and B pays C $10 — but wait, that's not right either. The real simplification: A's net is −$20, B's net is $0, C's net is +$20. So just **A pays C $20** — one transaction instead of three.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Home — create or join a project |
| POST | `/projects` | Create a project |
| POST | `/projects/<id>/join` | Join with password |
| POST | `/projects/<id>/logout` | Leave project |
| GET | `/projects/<id>` | Project dashboard |
| POST | `/projects/<id>/expenses` | Add expense |
| POST | `/projects/<id>/expenses/<eid>/delete` | Delete expense |
| POST | `/projects/<id>/members` | Add a member |
| GET | `/projects/<id>/balances` | JSON balances + simplified debts |

## Project Structure

```
easysplit/
  app.py           # Flask app, routes, simplify debts algorithm
  db.py            # SQLite connection helpers
  schema.sql       # Database schema
  templates/
    base.html      # Shared layout
    home.html      # Create / join page
    project.html   # Dashboard (expenses, balances, simplified debts)
    error.html     # Error page
  requirements.txt
  easysplit.db     # Created automatically on first run
```

## Tech Stack

- Python 3.10+
- Flask
- SQLite (built into Python via `sqlite3`)
