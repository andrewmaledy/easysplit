"""Integration test: exercises the full flow without the HTTP layer."""
import os
import sys
import tempfile
import importlib

sys.path.insert(0, os.path.dirname(__file__))

# Use a temp DB
tmpdir = tempfile.mkdtemp()
import db
db.DB_PATH = os.path.join(tmpdir, "test.db")

import app as appmod
appmod.app.config["TESTING"] = True
appmod.app.secret_key = "test"

# Re-init with the temp path
importlib.reload(db)
db.DB_PATH = os.path.join(tmpdir, "test.db")
db.init_db()

from werkzeug.security import generate_password_hash

def run():
    client = appmod.app.test_client()

    # 1. Create project with 3 members
    resp = client.post("/projects", data={
        "name": "Test Trip",
        "password": "secret123",
        "currency": "USD",
        "members": ["Alice", "Bob", "Charlie"],
        "simplify_by_default": "on",
    }, follow_redirects=True)
    assert b"Test Trip" in resp.data, "project page should show name"
    print("PASS: project created")

    # 2. Check session has project_id=1
    with client.session_transaction() as sess:
        assert sess.get("project_id") == 1
    print("PASS: session set")

    # 3. Add equal-split expense: $30 dinner, Alice paid, all 3 involved
    resp = client.post("/projects/1/expenses", data={
        "description": "Dinner",
        "cost": "30",
        "date": "2026-01-01",
        "created_by_member_id": "1",
        "payer_id": "1",
        "split_type": "equal",
        "involved_members": ["1", "2", "3"],
    }, follow_redirects=True)
    assert b"Dinner" in resp.data, "expense should appear"
    print("PASS: equal-split expense added")

    # 4. Add custom-split expense: $60 gas, Alice paid 60 owes 0, Bob owes 30, Charlie owes 30
    resp = client.post("/projects/1/expenses", data={
        "description": "Gas",
        "cost": "60",
        "date": "2026-01-02",
        "created_by_member_id": "1",
        "split_type": "custom",
        "paid_1": "60", "owed_1": "0",
        "paid_2": "0",  "owed_2": "30",
        "paid_3": "0",  "owed_3": "30",
    }, follow_redirects=True)
    assert b"Gas" in resp.data
    print("PASS: custom-split expense added")

    # 4b. Custom split with an excluded member (Charlie excluded)
    # $20 expense, Alice pays 20 owes 10, Bob pays 0 owes 10, Charlie excluded
    resp = client.post("/projects/1/expenses", data={
        "description": "Coffee",
        "cost": "20",
        "date": "2026-01-03",
        "created_by_member_id": "1",
        "split_type": "custom",
        "custom_excluded_1": "0",
        "paid_1": "20", "owed_1": "10",
        "paid_2": "0",  "owed_2": "10",
        "custom_excluded_3": "1",
        "paid_3": "0",  "owed_3": "0",
    }, follow_redirects=True)
    assert b"Coffee" in resp.data
    print("PASS: custom-split with excluded member")

    # 5. Check balances via JSON
    resp = client.get("/projects/1/balances")
    data = resp.get_json()
    bal = {b["name"]: b["net"] for b in data["balances"]}
    # Alice: paid 110, owed 20 -> net +90
    # Bob:   paid 0,   owed 50 -> net -50
    # Charlie: paid 0, owed 40 -> net -40 (excluded from Coffee)
    assert abs(bal["Alice"] - 90) < 0.01, f"Alice net should be 90, got {bal['Alice']}"
    assert abs(bal["Bob"] - (-50)) < 0.01, f"Bob net should be -50, got {bal['Bob']}"
    assert abs(bal["Charlie"] - (-40)) < 0.01, f"Charlie net should be -40, got {bal['Charlie']}"
    print(f"PASS: balances correct — {bal}")

    # 6. Check simplified debts
    simplified = data["simplified_debts"]
    assert len(simplified) == 2, f"expected 2 simplified transactions, got {len(simplified)}"
    # Bob pays Alice 40, Charlie pays Alice 40
    payers = sorted([(t["from"], t["to"], t["amount"]) for t in simplified])
    assert payers == [("Bob", "Alice", 50.0), ("Charlie", "Alice", 40.0)], f"got {payers}"
    print(f"PASS: simplified debts correct — {payers}")

    # 7. Test 3-way chain: add expense to create A→B→C chain
    # Reset: Bob owes Charlie 20 (Bob paid 0 owed 0, Charlie paid 20 owed 0 for a $20 expense Alice not involved)
    # Actually let's test the chain simplification separately
    # Create a new project for chain test
    resp = client.post("/projects", data={
        "name": "Chain Test",
        "password": "pw",
        "currency": "USD",
        "members": ["X", "Y", "Z"],
        "simplify_by_default": "on",
    }, follow_redirects=True)

    # X owes Y $10
    client.post("/projects/2/expenses", data={
        "description": "e1", "cost": "10", "date": "2026-01-01",
        "created_by_member_id": "4", "payer_id": "5",
        "split_type": "custom",
        "paid_4": "0", "owed_4": "10",
        "paid_5": "10", "owed_5": "0",
        "paid_6": "0", "owed_6": "0",
    }, follow_redirects=True)

    # Y owes Z $10
    client.post("/projects/2/expenses", data={
        "description": "e2", "cost": "10", "date": "2026-01-01",
        "created_by_member_id": "5", "payer_id": "6",
        "split_type": "custom",
        "paid_4": "0", "owed_4": "0",
        "paid_5": "0", "owed_5": "10",
        "paid_6": "10", "owed_6": "0",
    }, follow_redirects=True)

    # X owes Z $10
    client.post("/projects/2/expenses", data={
        "description": "e3", "cost": "10", "date": "2026-01-01",
        "created_by_member_id": "4", "payer_id": "6",
        "split_type": "custom",
        "paid_4": "0", "owed_4": "10",
        "paid_5": "0", "owed_5": "0",
        "paid_6": "10", "owed_6": "0",
    }, follow_redirects=True)

    resp = client.get("/projects/2/balances")
    data = resp.get_json()
    simplified = data["simplified_debts"]
    # X net = -20, Y net = 0, Z net = +20
    # Simplified: X pays Z $20 (one transaction instead of three)
    assert len(simplified) == 1, f"expected 1 simplified transaction, got {len(simplified)}: {simplified}"
    t = simplified[0]
    assert t["from"] == "X" and t["to"] == "Z" and abs(t["amount"] - 20) < 0.01, f"got {t}"
    print(f"PASS: 3-way chain simplified to 1 transaction — {t}")

    # 8. Delete an expense (restore session to project 1 first)
    with client.session_transaction() as sess:
        sess["project_id"] = 1
    resp = client.post("/projects/1/expenses/1/delete", follow_redirects=True)
    assert b">Dinner<" not in resp.data, "deleted expense should not appear in table"
    print("PASS: expense deleted")

    # 9. Test join-by-password: clear session, rejoin with password
    with client.session_transaction() as sess:
        sess.pop("project_id", None)
    resp = client.post("/projects/join", data={"password": "secret123"}, follow_redirects=True)
    assert b"Test Trip" in resp.data, "should rejoin project 1 by password"
    print("PASS: join by password")

    # 10. Wrong password
    with client.session_transaction() as sess:
        sess.pop("project_id", None)
    resp = client.post("/projects/join", data={"password": "wrong"}, follow_redirects=True)
    assert b"No trip found" in resp.data, "should show error for wrong password"
    print("PASS: wrong password rejected")

    # 11. Unauthenticated access to project URL redirects home (no 403)
    with client.session_transaction() as sess:
        sess.pop("project_id", None)
    resp = client.get("/projects/1", follow_redirects=True)
    assert resp.status_code == 200
    assert b"Enter a Trip" in resp.data, "should redirect to home page, not 403"
    print("PASS: unauthenticated project URL redirects home (no 403)")

    # 12. Add member with recalculate: new person joins past equal-split expenses
    with client.session_transaction() as sess:
        sess["project_id"] = 1
    # Add a fresh equal-split expense: $40 lunch, Alice paid, all 3 involved
    client.post("/projects/1/expenses", data={
        "description": "Lunch2",
        "cost": "40",
        "date": "2026-01-04",
        "created_by_member_id": "1",
        "payer_id": "1",
        "split_type": "equal",
        "involved_members": ["1", "2", "3"],
    }, follow_redirects=True)
    # Now add Dave with recalculate -> Lunch2 splits among 4: each owes 10
    resp = client.post("/projects/1/members", data={
        "name": "Dave",
        "recalculate": "on",
    }, follow_redirects=True)
    assert b"Dave" in resp.data, "Dave should appear in members"

    resp = client.get("/projects/1/balances")
    data = resp.get_json()
    bal = {b["name"]: b["net"] for b in data["balances"]}
    # Remaining expenses: Gas ($60 custom), Coffee ($20 custom), Lunch2 ($40 equal)
    # Gas: Alice paid 60 owed 0, Bob owed 30, Charlie owed 30
    # Coffee: Alice paid 20 owed 10, Bob owed 10, Charlie excluded
    # Lunch2 (was 3-way @13.33 each, now 4-way @10 each after recalculate):
    #   Alice paid 40 owed 10, Bob owed 10, Charlie owed 10, Dave owed 10
    # Alice: paid 120, owed 0+10+10=20 -> net 100
    # Bob:   paid 0, owed 30+10+10=50 -> net -50
    # Charlie: paid 0, owed 30+0+10=40 -> net -40
    # Dave: paid 0, owed 10 -> net -10
    assert abs(bal["Alice"] - 100) < 0.01, f"Alice net should be 100, got {bal['Alice']}"
    assert abs(bal["Bob"] - (-50)) < 0.01, f"Bob net should be -50, got {bal['Bob']}"
    assert abs(bal["Charlie"] - (-40)) < 0.01, f"Charlie net should be -40, got {bal['Charlie']}"
    assert abs(bal["Dave"] - (-10)) < 0.01, f"Dave net should be -10, got {bal['Dave']}"
    print(f"PASS: add member with recalculate — {bal}")

    # 13. Add member without recalculate: doesn't affect past expenses
    resp = client.post("/projects/1/members", data={
        "name": "Eve",
        "recalculate": "off",
    }, follow_redirects=True)
    resp = client.get("/projects/1/balances")
    data = resp.get_json()
    bal = {b["name"]: b["net"] for b in data["balances"]}
    assert abs(bal["Eve"]) < 0.01, f"Eve net should be 0, got {bal['Eve']}"
    print("PASS: add member without recalculate")

    print("\n✅ All tests passed!")

run()
