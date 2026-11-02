from datetime import date

from flask import (
    Flask, render_template, request, redirect,
    url_for, session, jsonify, flash, abort,
)
from werkzeug.security import generate_password_hash, check_password_hash

import db

app = Flask(__name__)
app.secret_key = "easysplit-secret-key-change-in-production"


def round_cents(value):
    return round(value + 1e-9, 2)


def require_project_access(project_id):
    if session.get("project_id") != project_id:
        flash("Please enter the trip password to access that page.", "error")
        return False
    return True


def get_project_or_404(project_id):
    project = db.query(
        "SELECT * FROM projects WHERE id = ?", (project_id,), one=True
    )
    if not project:
        abort(404)
    return project


def get_members(project_id):
    return db.query(
        "SELECT * FROM members WHERE project_id = ? ORDER BY name",
        (project_id,),
    )


def get_expenses(project_id):
    return db.query(
        """
        SELECT e.*, m.name AS created_by_name
        FROM expenses e
        LEFT JOIN members m ON e.created_by_member_id = m.id
        WHERE e.project_id = ?
        ORDER BY e.date DESC, e.created_at DESC
        """,
        (project_id,),
    )


def get_shares_for_expense(expense_id):
    return db.query(
        """
        SELECT s.*, m.name AS member_name
        FROM shares s
        JOIN members m ON s.member_id = m.id
        WHERE s.expense_id = ?
        ORDER BY m.name
        """,
        (expense_id,),
    )


def get_all_shares(project_id):
    return db.query(
        """
        SELECT s.member_id, m.name AS member_name,
               s.paid_share, s.owed_share, s.expense_id
        FROM shares s
        JOIN members m ON s.member_id = m.id
        JOIN expenses e ON s.expense_id = e.id
        WHERE e.project_id = ?
        """,
        (project_id,),
    )


def compute_balances(project_id):
    rows = get_all_shares(project_id)
    balances = {}
    for r in rows:
        mid = r["member_id"]
        if mid not in balances:
            balances[mid] = {
                "member_id": mid,
                "name": r["member_name"],
                "paid": 0.0,
                "owed": 0.0,
                "net": 0.0,
            }
        balances[mid]["paid"] += r["paid_share"]
        balances[mid]["owed"] += r["owed_share"]
    for b in balances.values():
        b["paid"] = round_cents(b["paid"])
        b["owed"] = round_cents(b["owed"])
        b["net"] = round_cents(b["paid"] - b["owed"])
    members = get_members(project_id)
    for m in members:
        if m["id"] not in balances:
            balances[m["id"]] = {
                "member_id": m["id"],
                "name": m["name"],
                "paid": 0.0,
                "owed": 0.0,
                "net": 0.0,
            }
    return sorted(balances.values(), key=lambda b: b["name"])


def compute_raw_debts(project_id):
    expenses = db.query("SELECT id, description FROM expenses WHERE project_id = ? ORDER BY date DESC, created_at DESC", (project_id,))
    aggregated = {}
    breakdown = []

    for e in expenses:
        shares = get_shares_for_expense(e["id"])
        nets = {}
        for s in shares:
            mid = s["member_id"]
            nets[mid] = nets.get(mid, 0.0) + s["paid_share"] - s["owed_share"]

        debtors = {mid: -net for mid, net in nets.items() if net < -0.01}
        creditors = {mid: net for mid, net in nets.items() if net > 0.01}
        total_creditor = sum(creditors.values()) or 1

        expense_debts = []
        for d_id, d_amt in debtors.items():
            for c_id, c_amt in creditors.items():
                share = round_cents(d_amt * (c_amt / total_creditor))
                if share < 0.01:
                    continue
                key = tuple(sorted([d_id, c_id]))
                pair = aggregated.setdefault(key, {})
                pair.setdefault((d_id, c_id), 0.0)
                pair[(d_id, c_id)] += share
                expense_debts.append({
                    "from": next(s["member_name"] for s in shares if s["member_id"] == d_id),
                    "to": next(s["member_name"] for s in shares if s["member_id"] == c_id),
                    "amount": share,
                })

        if expense_debts:
            breakdown.append({"description": e["description"], "debts": expense_debts})

    member_names = {m["id"]: m["name"] for m in get_members(project_id)}
    raw_pairs = []
    for key, directions in aggregated.items():
        for (d_id, c_id), amount in directions.items():
            if amount > 0.01:
                raw_pairs.append({
                    "from": member_names.get(d_id, "?"),
                    "to": member_names.get(c_id, "?"),
                    "amount": round_cents(amount),
                })

    raw_pairs.sort(key=lambda x: (x["from"], x["to"]))
    return raw_pairs, breakdown


def simplify_debts(balances):
    debtors = []
    creditors = []
    for b in balances:
        net = b["net"]
        if net < -0.01:
            debtors.append({"name": b["name"], "amount": round_cents(-net)})
        elif net > 0.01:
            creditors.append({"name": b["name"], "amount": round_cents(net)})

    debtors.sort(key=lambda d: d["amount"], reverse=True)
    creditors.sort(key=lambda c: c["amount"], reverse=True)

    transactions = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        pay = min(debtors[i]["amount"], creditors[j]["amount"])
        transactions.append({
            "from": debtors[i]["name"],
            "to": creditors[j]["name"],
            "amount": round_cents(pay),
        })
        debtors[i]["amount"] = round_cents(debtors[i]["amount"] - pay)
        creditors[j]["amount"] = round_cents(creditors[j]["amount"] - pay)
        if debtors[i]["amount"] < 0.01:
            i += 1
        if creditors[j]["amount"] < 0.01:
            j += 1

    return transactions


def fmt_money(value):
    return f"{value:,.2f}"


app.jinja_env.filters["money"] = fmt_money


@app.route("/")
def home():
    if "project_id" in session:
        pid = session["project_id"]
        if db.query("SELECT 1 FROM projects WHERE id = ?", (pid,), one=True):
            return redirect(url_for("project", project_id=pid))
        session.pop("project_id", None)
    return render_template("home.html")


@app.route("/projects", methods=["POST"])
def create_project():
    name = request.form.get("name", "").strip()
    password = request.form.get("password", "")
    currency = request.form.get("currency", "USD").strip().upper() or "USD"
    simplify = 1 if request.form.get("simplify_by_default") else 0
    member_names = [m.strip() for m in request.form.getlist("members") if m.strip()]

    if not name or not password or not member_names:
        flash("Project name, password, and at least one member are required.", "error")
        return redirect(url_for("home"))

    pid = db.execute(
        "INSERT INTO projects (name, password_hash, currency, simplify_by_default) VALUES (?, ?, ?, ?)",
        (name, generate_password_hash(password), currency, simplify),
        return_id=True,
    )
    for mname in member_names:
        db.execute(
            "INSERT OR IGNORE INTO members (project_id, name) VALUES (?, ?)",
            (pid, mname),
        )

    session["project_id"] = pid
    return redirect(url_for("project", project_id=pid))


@app.route("/projects/join", methods=["POST"])
def join_project():
    password = request.form.get("password", "")
    projects = db.query("SELECT id, password_hash, name FROM projects ORDER BY id")
    matches = [p for p in projects if check_password_hash(p["password_hash"], password)]
    if not matches:
        flash("No trip found with that password.", "error")
        return redirect(url_for("home"))
    if len(matches) == 1:
        session["project_id"] = matches[0]["id"]
        return redirect(url_for("project", project_id=matches[0]["id"]))
    return render_template("pick_project.html", projects=matches)


@app.route("/projects/<int:project_id>/select", methods=["POST"])
def select_project(project_id):
    session["project_id"] = project_id
    return redirect(url_for("project", project_id=project_id))


@app.route("/projects/<int:project_id>/logout", methods=["POST"])
def logout_project(project_id):
    session.pop("project_id", None)
    return redirect(url_for("home"))


@app.route("/projects/<int:project_id>")
def project(project_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    project = db.query("SELECT * FROM projects WHERE id = ?", (project_id,), one=True)
    if not project:
        session.pop("project_id", None)
        flash("That project no longer exists.", "error")
        return redirect(url_for("home"))
    members = get_members(project_id)
    expenses = get_expenses(project_id)

    expense_list = []
    for e in expenses:
        shares = get_shares_for_expense(e["id"])
        expense_list.append({
            "id": e["id"],
            "description": e["description"],
            "cost": e["cost"],
            "currency": e["currency"],
            "date": e["date"],
            "created_by_name": e["created_by_name"],
            "shares": shares,
        })

    balances = compute_balances(project_id)
    simplified = simplify_debts(balances) if project["simplify_by_default"] else []
    max_bal = max((b["net"] for b in balances), default=0)
    min_bal = min((b["net"] for b in balances), default=0)
    max_abs = max(abs(max_bal), abs(min_bal), 0.01)

    return render_template(
        "project.html",
        project=project,
        members=members,
        expenses=expense_list,
        balances=balances,
        simplified=simplified,
        today=date.today().isoformat(),
        max_abs=max_abs,
    )


@app.route("/projects/<int:project_id>/expenses", methods=["POST"])
def add_expense(project_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    project = get_project_or_404(project_id)

    description = request.form.get("description", "").strip()
    cost_str = request.form.get("cost", "0").strip()
    expense_date = request.form.get("date") or date.today().isoformat()
    split_type = request.form.get("split_type", "equal")
    payer_id = request.form.get("payer_id", type=int)
    created_by = request.form.get("created_by_member_id", type=int)

    if not description:
        flash("Description is required.", "error")
        return redirect(url_for("project", project_id=project_id))

    try:
        cost = float(cost_str)
    except ValueError:
        flash("Cost must be a valid number.", "error")
        return redirect(url_for("project", project_id=project_id))

    if cost <= 0:
        flash("Cost must be greater than zero.", "error")
        return redirect(url_for("project", project_id=project_id))

    members = get_members(project_id)
    if not members:
        flash("Project has no members.", "error")
        return redirect(url_for("project", project_id=project_id))

    member_ids = [m["id"] for m in members]
    member_map = {m["id"]: m for m in members}

    shares_data = []

    if split_type == "equal":
        involved_ids = [int(mid) for mid in request.form.getlist("involved_members")
                        if int(mid) in member_ids]
        if not involved_ids:
            involved_ids = member_ids
        if payer_id not in member_ids:
            payer_id = involved_ids[0]

        per_person = round_cents(cost / len(involved_ids))
        total_assigned = per_person * len(involved_ids)
        remainder = round_cents(cost - total_assigned)

        for idx, mid in enumerate(involved_ids):
            owed = per_person + (remainder if idx == 0 else 0)
            paid = cost if mid == payer_id else 0.0
            shares_data.append((mid, round_cents(paid), round_cents(owed)))

    elif split_type == "custom":
        total_paid = 0.0
        total_owed = 0.0
        for m in members:
            mid = m["id"]
            if request.form.get(f"custom_excluded_{mid}") == "1":
                shares_data.append((mid, 0.0, 0.0))
                continue
            paid = float(request.form.get(f"paid_{mid}", "0") or "0")
            owed = float(request.form.get(f"owed_{mid}", "0") or "0")
            total_paid += paid
            total_owed += owed
            shares_data.append((mid, round_cents(paid), round_cents(owed)))

        if abs(total_paid - cost) > 0.02:
            flash(f"Paid shares ({total_paid:.2f}) must equal the cost ({cost:.2f}).", "error")
            return redirect(url_for("project", project_id=project_id))
        if abs(total_owed - cost) > 0.02:
            flash(f"Owed shares ({total_owed:.2f}) must equal the cost ({cost:.2f}).", "error")
            return redirect(url_for("project", project_id=project_id))

    else:
        flash("Invalid split type.", "error")
        return redirect(url_for("project", project_id=project_id))

    expense_id = db.execute(
        """INSERT INTO expenses
           (project_id, description, cost, currency, date, created_by_member_id)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (project_id, description, cost, project["currency"], expense_date, created_by),
        return_id=True,
    )

    for member_id, paid, owed in shares_data:
        if paid > 0 or owed > 0:
            db.execute(
                "INSERT INTO shares (expense_id, member_id, paid_share, owed_share) VALUES (?, ?, ?, ?)",
                (expense_id, member_id, paid, owed),
            )

    flash("Expense added.", "success")
    return redirect(url_for("project", project_id=project_id))


@app.route("/projects/<int:project_id>/expenses/<int:expense_id>/delete", methods=["POST"])
def delete_expense(project_id, expense_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    db.execute("DELETE FROM shares WHERE expense_id = ?", (expense_id,))
    db.execute("DELETE FROM expenses WHERE id = ? AND project_id = ?", (expense_id, project_id))
    flash("Expense deleted.", "success")
    return redirect(url_for("project", project_id=project_id))


@app.route("/projects/<int:project_id>/members", methods=["POST"])
def add_member(project_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    name = request.form.get("name", "").strip()
    if not name:
        flash("Member name is required.", "error")
        return redirect(url_for("project", project_id=project_id))
    db.execute(
        "INSERT OR IGNORE INTO members (project_id, name) VALUES (?, ?)",
        (project_id, name),
    )
    flash("Member added.", "success")
    return redirect(url_for("project", project_id=project_id))


@app.route("/projects/<int:project_id>/toggle-simplify", methods=["POST"])
def toggle_simplify(project_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    project = get_project_or_404(project_id)
    new_val = 0 if project["simplify_by_default"] else 1
    db.execute("UPDATE projects SET simplify_by_default = ? WHERE id = ?", (new_val, project_id))
    return redirect(url_for("project", project_id=project_id))


@app.route("/projects/<int:project_id>/balances")
def balances_json(project_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    project = get_project_or_404(project_id)
    balances = compute_balances(project_id)
    simplified = simplify_debts(balances) if project["simplify_by_default"] else []
    return jsonify({
        "balances": balances,
        "simplified_debts": simplified,
        "simplify_by_default": bool(project["simplify_by_default"]),
    })


@app.route("/projects/<int:project_id>/math")
def math_json(project_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    project = get_project_or_404(project_id)
    balances = compute_balances(project_id)
    simplified = simplify_debts(balances)
    raw_pairs, breakdown = compute_raw_debts(project_id)
    return jsonify({
        "raw_debts": raw_pairs,
        "simplified_debts": simplified,
        "breakdown": breakdown,
        "simplify_by_default": bool(project["simplify_by_default"]),
        "currency": project["currency"],
    })


@app.errorhandler(403)
def forbidden(e):
    return render_template("error.html", code=403, message="Access denied. Wrong project or password not verified."), 403


@app.errorhandler(404)
def not_found(e):
    return render_template("error.html", code=404, message="Project not found."), 404


if __name__ == "__main__":
    db.init_db()
    app.run(debug=True, port=5001)
