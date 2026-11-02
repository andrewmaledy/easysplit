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
                "partner_id": m["partner_id"] if "partner_id" in m.keys() else None,
            }
        else:
            balances[m["id"]]["partner_id"] = m["partner_id"] if "partner_id" in m.keys() else None
    return sorted(balances.values(), key=lambda b: b["name"])


def compute_raw_debts(project_id):
    expenses = db.query(
        "SELECT id, description FROM expenses WHERE project_id = ? AND is_payment = 0 ORDER BY date DESC, created_at DESC",
        (project_id,),
    )
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
    linked = {}
    seen = set()
    merged = []
    for b in balances:
        pid = b.get("partner_id")
        if pid and b["member_id"] not in seen and pid not in seen:
            partner = next((x for x in balances if x["member_id"] == pid), None)
            if partner:
                name = f"{b['name']} & {partner['name']}"
                net = round_cents(b["net"] + partner["net"])
                merged.append({"name": name, "net": net, "members": [b["member_id"], pid]})
                seen.add(b["member_id"])
                seen.add(pid)
                linked[b["member_id"]] = name
                linked[pid] = name
                continue
        if b["member_id"] not in seen:
            merged.append({"name": b["name"], "net": b["net"], "members": [b["member_id"]]})
            seen.add(b["member_id"])

    debtors = []
    creditors = []
    for m in merged:
        net = m["net"]
        if net < -0.01:
            debtors.append({"name": m["name"], "amount": round_cents(-net)})
        elif net > 0.01:
            creditors.append({"name": m["name"], "amount": round_cents(net)})

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


def fmt_date(value):
    if not value:
        return ""
    try:
        from datetime import datetime
        d = datetime.strptime(value, "%Y-%m-%d")
        return d.strftime("%b %-d, %Y")
    except (ValueError, TypeError):
        return value


app.jinja_env.filters["money"] = fmt_money
app.jinja_env.filters["fmtdate"] = fmt_date


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
    currency = request.form.get("currency", "CAD").strip().upper() or "CAD"
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

    pie_colors = ["6366f1", "22c55e", "f59e0b", "ef4444", "ec4899", "06b6d4", "a855f7", "84cc16"]
    expense_list = []
    for e in expenses:
        shares = get_shares_for_expense(e["id"])
        pie_data = []
        cum = 0.0
        for idx, s in enumerate(shares):
            if s["owed_share"] > 0:
                pct = round(s["owed_share"] / e["cost"] * 100, 1) if e["cost"] else 0
                pie_data.append({
                    "name": s["member_name"],
                    "owed": round_cents(s["owed_share"]),
                    "pct": pct,
                    "start": round(cum, 1),
                    "end": round(cum + pct, 1),
                    "color": pie_colors[idx % len(pie_colors)],
                })
                cum += pct
        expense_list.append({
            "id": e["id"],
            "description": e["description"],
            "cost": e["cost"],
            "currency": e["currency"],
            "date": e["date"],
            "details": e["details"] if "details" in e.keys() else None,
            "created_by_name": e["created_by_name"],
            "is_payment": bool(e["is_payment"]) if "is_payment" in e.keys() else False,
            "shares": shares,
            "pie": pie_data,
        })

    balances = compute_balances(project_id)
    simplified = simplify_debts(balances)
    max_bal = max((b["net"] for b in balances), default=0)
    min_bal = min((b["net"] for b in balances), default=0)
    max_abs = max(abs(max_bal), abs(min_bal), 0.01)
    for b in balances:
        pid = b.get("partner_id")
        if pid:
            partner = next((x for x in balances if x["member_id"] == pid), None)
            if partner:
                combined = abs(b["net"] + partner["net"])
                if combined > max_abs:
                    max_abs = combined

    members_json = [{"id": m["id"], "name": m["name"], "partner_id": m["partner_id"] if "partner_id" in m.keys() else None} for m in members]

    payments = [e for e in expense_list if e["is_payment"]]

    return render_template(
        "project.html",
        project=project,
        members=members,
        members_json=members_json,
        expenses=expense_list,
        payments=payments,
        balances=balances,
        simplified=simplified,
        today=date.today().isoformat(),
        max_abs=max_abs,
    )


def process_expense_form(project_id, members):
    member_ids = [m["id"] for m in members]
    split_type = request.form.get("split_type", "equal")
    payer_id = request.form.get("payer_id", type=int)
    cost_str = request.form.get("cost", "0").strip()
    cost = float(cost_str) if cost_str else 0.0
    description = request.form.get("description", "").strip()
    details = request.form.get("details", "").strip()
    expense_date = request.form.get("date") or date.today().isoformat()
    created_by = request.form.get("created_by_member_id", type=int)

    errors = []
    if not description:
        errors.append("Description is required.")
    if cost <= 0:
        errors.append("Cost must be greater than zero.")

    shares_data = []

    if not errors:
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
                errors.append(f"Paid shares ({total_paid:.2f}) must equal the cost ({cost:.2f}).")
            if abs(total_owed - cost) > 0.02:
                errors.append(f"Owed shares ({total_owed:.2f}) must equal the cost ({cost:.2f}).")
        else:
            errors.append("Invalid split type.")

    return {
        "description": description,
        "details": details,
        "cost": cost,
        "date": expense_date,
        "split_type": split_type,
        "created_by": created_by,
        "shares_data": shares_data,
        "errors": errors,
    }


@app.route("/projects/<int:project_id>/expenses", methods=["POST"])
def add_expense(project_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    project = get_project_or_404(project_id)
    members = get_members(project_id)
    if not members:
        flash("Project has no members.", "error")
        return redirect(url_for("project", project_id=project_id))

    try:
        data = process_expense_form(project_id, members)
    except (ValueError, TypeError):
        flash("Invalid input.", "error")
        return redirect(url_for("project", project_id=project_id))

    if data["errors"]:
        for err in data["errors"]:
            flash(err, "error")
        return redirect(url_for("project", project_id=project_id))

    expense_id = db.execute(
        """INSERT INTO expenses
           (project_id, description, cost, currency, date, split_type, details, created_by_member_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (project_id, data["description"], data["cost"], project["currency"],
         data["date"], data["split_type"], data["details"], data["created_by"]),
        return_id=True,
    )

    for member_id, paid, owed in data["shares_data"]:
        if paid > 0 or owed > 0:
            db.execute(
                "INSERT INTO shares (expense_id, member_id, paid_share, owed_share) VALUES (?, ?, ?, ?)",
                (expense_id, member_id, paid, owed),
            )

    flash("Expense added.", "success")
    return redirect(url_for("project", project_id=project_id))


@app.route("/projects/<int:project_id>/expenses/<int:expense_id>/data")
def expense_data(project_id, expense_id):
    if not require_project_access(project_id):
        return jsonify({"error": "access denied"}), 403
    expense = db.query(
        "SELECT * FROM expenses WHERE id = ? AND project_id = ?",
        (expense_id, project_id), one=True,
    )
    if not expense:
        return jsonify({"error": "not found"}), 404
    shares = get_shares_for_expense(expense_id)
    return jsonify({
        "id": expense["id"],
        "description": expense["description"],
        "cost": expense["cost"],
        "date": expense["date"],
        "split_type": expense["split_type"],
        "details": expense["details"] if "details" in expense.keys() else None,
        "created_by_member_id": expense["created_by_member_id"],
        "shares": [{"member_id": s["member_id"], "member_name": s["member_name"],
                     "paid_share": s["paid_share"], "owed_share": s["owed_share"]}
                    for s in shares],
    })


@app.route("/projects/<int:project_id>/expenses/<int:expense_id>/edit", methods=["POST"])
def edit_expense(project_id, expense_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    project = get_project_or_404(project_id)
    members = get_members(project_id)
    if not members:
        flash("Project has no members.", "error")
        return redirect(url_for("project", project_id=project_id))

    try:
        data = process_expense_form(project_id, members)
    except (ValueError, TypeError):
        flash("Invalid input.", "error")
        return redirect(url_for("project", project_id=project_id))

    if data["errors"]:
        for err in data["errors"]:
            flash(err, "error")
        return redirect(url_for("project", project_id=project_id))

    db.execute(
        """UPDATE expenses SET description = ?, cost = ?, date = ?, split_type = ?, details = ?,
           created_by_member_id = ? WHERE id = ? AND project_id = ?""",
        (data["description"], data["cost"], data["date"], data["split_type"],
         data["details"], data["created_by"], expense_id, project_id),
    )
    db.execute("DELETE FROM shares WHERE expense_id = ?", (expense_id,))
    for member_id, paid, owed in data["shares_data"]:
        if paid > 0 or owed > 0:
            db.execute(
                "INSERT INTO shares (expense_id, member_id, paid_share, owed_share) VALUES (?, ?, ?, ?)",
                (expense_id, member_id, paid, owed),
            )

    flash("Expense updated.", "success")
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
    recalculate = request.form.get("recalculate") == "on"

    new_member_id = db.execute(
        "INSERT OR IGNORE INTO members (project_id, name) VALUES (?, ?)",
        (project_id, name),
        return_id=True,
    )
    if not new_member_id:
        existing = db.query(
            "SELECT id FROM members WHERE project_id = ? AND name = ?",
            (project_id, name), one=True,
        )
        new_member_id = existing["id"] if existing else None

    if recalculate and new_member_id:
        expenses = db.query(
            "SELECT id, cost FROM expenses WHERE project_id = ? AND split_type = 'equal'",
            (project_id,),
        )
        for e in expenses:
            shares = db.query(
                "SELECT id, member_id, paid_share, owed_share FROM shares WHERE expense_id = ? AND owed_share > 0",
                (e["id"],),
            )
            n_current = len(shares)
            if n_current == 0:
                continue
            n_new = n_current + 1
            per_person = round_cents(e["cost"] / n_new)
            remainder = round_cents(e["cost"] - per_person * n_new)
            for idx, s in enumerate(shares):
                owed = per_person + (remainder if idx == 0 else 0)
                db.execute(
                    "UPDATE shares SET owed_share = ? WHERE id = ?",
                    (owed, s["id"]),
                )
            db.execute(
                "INSERT INTO shares (expense_id, member_id, paid_share, owed_share) VALUES (?, ?, 0, ?)",
                (e["id"], new_member_id, per_person),
            )
        flash(f"{name} added and included in all {len(expenses)} equal-split expenses.", "success")
    else:
        flash(f"{name} added. They'll be included in future expenses.", "success")
    return redirect(url_for("project", project_id=project_id))


@app.route("/projects/<int:project_id>/members/<int:member_id>/rename", methods=["POST"])
def rename_member(project_id, member_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    name = request.form.get("name", "").strip()
    if not name:
        flash("Name is required.", "error")
        return redirect(url_for("project", project_id=project_id))
    db.execute("UPDATE members SET name = ? WHERE id = ? AND project_id = ?", (name, member_id, project_id))
    flash("Member renamed.", "success")
    return redirect(url_for("project", project_id=project_id))


@app.route("/projects/<int:project_id>/members/<int:member_id>/delete", methods=["POST"])
def delete_member(project_id, member_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    shares = db.query("SELECT 1 FROM shares WHERE member_id = ? LIMIT 1", (member_id,))
    if shares:
        flash("Cannot delete a member with expenses. Delete their expenses first.", "error")
        return redirect(url_for("project", project_id=project_id))
    created = db.query("SELECT 1 FROM expenses WHERE created_by_member_id = ? LIMIT 1", (member_id,))
    if created:
        flash("Cannot delete a member who created expenses. Delete those expenses first.", "error")
        return redirect(url_for("project", project_id=project_id))
    member = db.query("SELECT partner_id FROM members WHERE id = ? AND project_id = ?", (member_id, project_id), one=True)
    if member and member["partner_id"]:
        db.execute("UPDATE members SET partner_id = NULL WHERE id = ? AND project_id = ?", (member["partner_id"], project_id))
    db.execute("DELETE FROM members WHERE id = ? AND project_id = ?", (member_id, project_id))
    flash("Member removed.", "success")
    return redirect(url_for("project", project_id=project_id))


@app.route("/projects/<int:project_id>/edit", methods=["POST"])
def edit_project(project_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    name = request.form.get("name", "").strip()
    currency = request.form.get("currency", "").strip().upper()
    if not name:
        flash("Trip name is required.", "error")
        return redirect(url_for("project", project_id=project_id))
    if not currency:
        currency = "CAD"
    db.execute("UPDATE projects SET name = ?, currency = ? WHERE id = ?", (name, currency, project_id))
    flash("Trip updated.", "success")
    return redirect(url_for("project", project_id=project_id))


@app.route("/projects/<int:project_id>/delete", methods=["POST"])
def delete_project(project_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    session.pop("project_id", None)
    flash("Trip deleted.", "success")
    return redirect(url_for("home"))


@app.route("/projects/<int:project_id>/members/<int:member_id>/link", methods=["POST"])
def link_partner(project_id, member_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    partner_id = request.form.get("partner_id", type=int)
    if not partner_id or partner_id == member_id:
        flash("Select a different member to link.", "error")
        return redirect(url_for("project", project_id=project_id))
    members = get_members(project_id)
    member_ids = {m["id"] for m in members}
    if partner_id not in member_ids:
        flash("Invalid member.", "error")
        return redirect(url_for("project", project_id=project_id))
    for m in members:
        if m["partner_id"] == member_id or m["partner_id"] == partner_id:
            if m["id"] != member_id and m["id"] != partner_id:
                flash("One of those members is already linked.", "error")
                return redirect(url_for("project", project_id=project_id))
    db.execute("UPDATE members SET partner_id = ? WHERE id = ? AND project_id = ?", (partner_id, member_id, project_id))
    db.execute("UPDATE members SET partner_id = ? WHERE id = ? AND project_id = ?", (member_id, partner_id, project_id))
    flash("Members linked.", "success")
    return redirect(url_for("project", project_id=project_id))


@app.route("/projects/<int:project_id>/members/<int:member_id>/unlink", methods=["POST"])
def unlink_partner(project_id, member_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    member = db.query("SELECT partner_id FROM members WHERE id = ? AND project_id = ?", (member_id, project_id), one=True)
    if member and member["partner_id"]:
        db.execute("UPDATE members SET partner_id = NULL WHERE id = ? AND project_id = ?", (member_id, project_id))
        db.execute("UPDATE members SET partner_id = NULL WHERE id = ? AND project_id = ?", (member["partner_id"], project_id))
        flash("Members unlinked.", "success")
    return redirect(url_for("project", project_id=project_id))


@app.route("/projects/<int:project_id>/toggle-simplify", methods=["POST"])
def toggle_simplify(project_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    project = get_project_or_404(project_id)
    new_val = 0 if project["simplify_by_default"] else 1
    db.execute("UPDATE projects SET simplify_by_default = ? WHERE id = ?", (new_val, project_id))
    return redirect(url_for("project", project_id=project_id))


@app.route("/projects/<int:project_id>/settle", methods=["POST"])
def settle_up(project_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    project = get_project_or_404(project_id)
    from_name = request.form.get("from_name", "").strip()
    to_name = request.form.get("to_name", "").strip()
    amount_str = request.form.get("amount", "0").strip()

    try:
        amount = float(amount_str)
    except ValueError:
        flash("Invalid amount.", "error")
        return redirect(url_for("project", project_id=project_id))

    if amount <= 0 or not from_name or not to_name:
        flash("Invalid settlement.", "error")
        return redirect(url_for("project", project_id=project_id))

    from_member = db.query(
        "SELECT id FROM members WHERE project_id = ? AND name = ?",
        (project_id, from_name), one=True,
    )
    to_member = db.query(
        "SELECT id FROM members WHERE project_id = ? AND name = ?",
        (project_id, to_name), one=True,
    )
    if not from_member or not to_member:
        flash("Member not found.", "error")
        return redirect(url_for("project", project_id=project_id))

    expense_id = db.execute(
        """INSERT INTO expenses
           (project_id, description, cost, currency, date, split_type, is_payment, created_by_member_id)
           VALUES (?, ?, ?, ?, ?, 'payment', 1, ?)""",
        (project_id, f"Settlement: {from_name} → {to_name}", amount, project["currency"],
         date.today().isoformat(), from_member["id"]),
        return_id=True,
    )
    db.execute(
        "INSERT INTO shares (expense_id, member_id, paid_share, owed_share) VALUES (?, ?, ?, 0)",
        (expense_id, from_member["id"], amount),
    )
    db.execute(
        "INSERT INTO shares (expense_id, member_id, paid_share, owed_share) VALUES (?, ?, 0, ?)",
        (expense_id, to_member["id"], amount),
    )

    flash(f"Settled: {from_name} paid {to_name} {project['currency']} {amount:.2f}", "success")
    return redirect(url_for("project", project_id=project_id))


@app.route("/projects/<int:project_id>/balances")
def balances_json(project_id):
    if not require_project_access(project_id):
        return redirect(url_for("home"))
    project = get_project_or_404(project_id)
    balances = compute_balances(project_id)
    simplified = simplify_debts(balances)
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
