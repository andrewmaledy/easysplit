export const STYLES = `
        :root {
            --bg: #f7f8fa; --surface: #ffffff; --surface-2: #f3f4f6; --border: #e5e7eb;
            --text: #111827; --text-dim: #6b7280; --accent: #4f46e5; --accent-hover: #4338ca;
            --accent-soft: #eef2ff; --accent-border: #c7d2fe; --green: #059669; --red: #dc2626;
            --amber: #d97706; --radius: 12px; --radius-sm: 8px;
            --shadow: 0 1px 2px rgba(0,0,0,0.04); --shadow-lg: 0 8px 30px rgba(0,0,0,0.10);
            --btn-primary: #111827; --btn-primary-hover: #1f2937;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; -webkit-font-smoothing: antialiased; min-height: 100vh; }
        a { color: var(--accent); text-decoration: none; }
        a:hover { color: var(--accent-hover); }
        .nav { background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
        .nav-brand { color: var(--text); font-size: 1rem; font-weight: 800; display: flex; align-items: center; gap: 7px; letter-spacing: -0.02em; }
        .nav-brand .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); }
        .nav form { display: inline; }
        .nav .btn-leave { background: var(--surface-2); color: var(--text-dim); border: 1px solid var(--border); padding: 6px 14px; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.8125rem; font-weight: 600; transition: all 0.15s; }
        .nav .btn-leave:hover { color: var(--text); border-color: var(--text-dim); }
        .container { max-width: 840px; margin: 0 auto; padding: 22px 16px 60px; }
        .dashboard-grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-areas: "add-expense balances" "expenses settle" "members members"; gap: 0 12px; }
        .tile-settle { grid-area: settle; } .tile-balances { grid-area: balances; }
        .tile-add-expense { grid-area: add-expense; } .tile-expenses { grid-area: expenses; }
        .tile-members { grid-area: members; }
        @media (max-width: 820px) {
            .dashboard-grid { grid-template-columns: 1fr; grid-template-areas: "add-expense" "expenses" "balances" "settle" "members"; gap: 0; }
            .mobile-tabs { display: flex; }
            .tile-add-expense, .tile-expenses, .tile-balances, .tile-settle, .tile-members { display: none; }
            .tile-add-expense.mobile-active, .tile-expenses.mobile-active, .tile-balances.mobile-active, .tile-settle.mobile-active, .tile-members.mobile-active { display: block; }
            .container { padding: 16px 14px 80px; } .nav { padding: 10px 14px; } h1 { font-size: 1.3rem; }
            .section { margin-bottom: 20px; } .card { padding: 14px; }
            .modal-overlay { padding: 0; } .modal { border-radius: 0; min-height: 100vh; max-width: 100%; }
            .modal-body { max-height: calc(100vh - 56px); }
            .hide-mobile { display: none !important; } .mobile-only { display: flex !important; }
            table th.hide-mobile, table td.hide-mobile { display: none; }
            .balance-bar .bar-track { display: none; } .members-list { gap: 6px; }
            .member-chip { padding: 4px 10px; font-size: 0.8125rem; }
            .debt-card { padding: 10px 12px; gap: 8px; } .debt-card .amt { font-size: 0.9375rem; }
            .share-grid { grid-template-columns: 1fr 90px 90px; gap: 6px; } .expense-actions { gap: 4px; }
        }
        .mobile-tabs { display: none; position: sticky; top: 47px; z-index: 99; background: var(--surface); border-bottom: 1px solid var(--border); padding: 8px 14px; gap: 6px; }
        .mobile-tab { flex: 1; padding: 8px 0; text-align: center; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.8125rem; font-weight: 600; color: var(--text-dim); cursor: pointer; font-family: inherit; }
        .mobile-tab.active { background: var(--btn-primary); color: #fff; border-color: var(--btn-primary); }
        h1 { font-size: 1.375rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 2px; }
        h2 { font-size: 1rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 14px; }
        h3 { font-size: 0.8125rem; font-weight: 700; margin-bottom: 8px; }
        .section { margin-bottom: 24px; }
        .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .section-header h2 { margin-bottom: 0; }
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 12px; }
        label { display: block; font-weight: 600; margin-bottom: 5px; font-size: 0.75rem; color: var(--text-dim); letter-spacing: 0.01em; }
        input[type="text"], input[type="number"], input[type="password"], input[type="date"], select, textarea { width: 100%; padding: 10px 12px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-size: 0.875rem; font-family: inherit; transition: border-color 0.15s; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); }
        input::placeholder { color: var(--text-dim); opacity: 0.5; }
        .field { margin-bottom: 14px; } .row { display: flex; gap: 10px; flex-wrap: wrap; } .row > div { flex: 1; min-width: 130px; }
        button, .btn { background: var(--btn-primary); color: #fff; border: none; padding: 10px 18px; border-radius: var(--radius-sm); font-size: 0.8125rem; font-weight: 700; cursor: pointer; transition: all 0.15s; text-decoration: none; display: inline-block; font-family: inherit; }
        button:hover, .btn:hover { background: var(--btn-primary-hover); } button:active { transform: scale(0.98); }
        .btn-secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); font-weight: 600; } .btn-secondary:hover { background: var(--surface-2); }
        .btn-danger { background: var(--red); } .btn-danger:hover { background: #b91c1c; }
        .btn-sm { padding: 4px 12px; font-size: 0.6875rem; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #f3f4f6; }
        th { font-weight: 700; font-size: 0.6875rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; }
        td.right, th.right { text-align: right; } tbody tr:last-child td { border-bottom: none; } tbody tr:hover { background: var(--bg); }
        .pos { color: var(--green); font-weight: 700; } .neg { color: var(--red); font-weight: 700; } .neutral { color: var(--text-dim); }
        .flash { padding: 10px 16px; border-radius: var(--radius-sm); margin-bottom: 16px; font-size: 0.8125rem; font-weight: 600; }
        .flash.error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
        .flash.success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
        .pill { display: inline-flex; align-items: center; gap: 5px; background: var(--surface); border: 1px solid var(--border); border-radius: 7px; padding: 3px 11px; font-size: 0.6875rem; font-weight: 600; color: var(--text-dim); }
        .pill.accent { background: var(--accent-soft); border-color: var(--accent-border); color: var(--accent); }
        .pill.green { background: #ecfdf5; border-color: #a7f3d0; color: var(--green); }
        .check-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .check-row label { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; color: var(--text); cursor: pointer; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 7px 12px; font-size: 0.8125rem; transition: all 0.15s; }
        .check-row label:hover { border-color: var(--text-dim); }
        .check-row input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
        .share-grid { display: grid; grid-template-columns: 1fr 100px 100px; gap: 8px; align-items: center; margin-bottom: 8px; }
        .share-grid .hdr { font-size: 0.6875rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; }
        .debt-card { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: var(--radius-sm); background: var(--surface); border: 1px solid var(--border); margin-bottom: 8px; }
        .debt-card .who { font-weight: 600; font-size: 0.8125rem; } .debt-card .arrow { color: var(--text-dim); font-size: 0.75rem; }
        .debt-card .amt { margin-left: auto; font-weight: 700; font-size: 0.875rem; color: var(--text); }
        .debt-card .avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--accent-soft); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.6875rem; color: var(--accent); }
        .debt-card .btn { background: var(--btn-primary); color: #fff; }
        .empty-state { text-align: center; padding: 32px 20px; color: var(--text-dim); }
        .empty-state .icon { font-size: 1.75rem; margin-bottom: 6px; opacity: 0.3; }
        .tabs { display: inline-flex; gap: 4px; background: var(--surface-2); border-radius: var(--radius-sm); padding: 3px; }
        .tab { padding: 7px 16px; border-radius: 6px; cursor: pointer; font-size: 0.8125rem; font-weight: 600; color: var(--text-dim); transition: all 0.15s; border: none; background: transparent; }
        .tab.active { background: var(--btn-primary); color: #fff; } .tab:not(.active):hover { color: var(--text); }
        .hint { font-size: 0.75rem; color: var(--text-dim); margin-top: 6px; }
        .members-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
        .member-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px 4px 4px; font-size: 0.75rem; font-weight: 600; }
        .member-chip .av { width: 20px; height: 20px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 0.5625rem; font-weight: 800; }
        .member-group { display: inline-flex; align-items: center; gap: 3px; background: var(--accent-soft); border: 1px solid var(--accent-border); border-radius: 999px; padding: 2px 4px 2px 2px; }
        .member-group .label { font-size: 0.5625rem; color: var(--accent); font-weight: 600; padding: 0 2px; }
        .add-member-row { display: flex; gap: 10px; align-items: flex-end; } .add-member-row .field { flex: 1; margin-bottom: 0; }
        .hero { text-align: center; padding: 40px 0 32px; }
        .hero h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.04em; margin-bottom: 10px; }
        .hero p { color: var(--text-dim); font-size: 0.9375rem; max-width: 440px; margin: 0 auto; }
        .split-cards { display: flex; gap: 16px; margin-top: 28px; } .split-cards > div { flex: 1; }
        @media (max-width: 700px) { .split-cards { flex-direction: column; } }
        .member-input-list input { margin-bottom: 8px; }
        .add-member-btn { background: transparent; color: var(--accent); border: 1px dashed var(--border); padding: 7px 14px; border-radius: var(--radius-sm); font-size: 0.8125rem; font-weight: 600; cursor: pointer; margin-top: 4px; transition: all 0.15s; }
        .add-member-btn:hover { background: var(--accent-soft); border-color: var(--accent); }
        .expense-split-tags { display: flex; flex-wrap: wrap; gap: 4px; }
        .expense-split-tags .tag { background: var(--surface-2); border-radius: 6px; padding: 2px 8px; font-size: 0.75rem; color: var(--text-dim); }
        .balance-bar { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
        .balance-bar:last-child { border-bottom: none; }
        .balance-bar .name { font-weight: 600; font-size: 0.8125rem; min-width: 80px; }
        .balance-bar .bar-track { flex: 1; height: 6px; background: var(--surface-2); border-radius: 999px; overflow: hidden; position: relative; }
        .balance-bar .bar-fill { height: 100%; border-radius: 999px; position: absolute; top: 0; }
        .balance-bar .bar-fill.pos { background: var(--green); left: 50%; } .balance-bar .bar-fill.neg { background: var(--red); right: 50%; }
        .balance-bar .amt { font-size: 0.8125rem; font-weight: 700; min-width: 80px; text-align: right; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.25); backdrop-filter: blur(4px); display: flex; align-items: flex-start; justify-content: center; z-index: 1000; padding: 40px 20px; overflow-y: auto; }
        .modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); width: 100%; max-width: 600px; box-shadow: var(--shadow-lg); }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
        .modal-header h2 { margin: 0; font-size: 1rem; }
        .modal-close { background: none; border: none; color: var(--text-dim); font-size: 1.25rem; cursor: pointer; padding: 0 4px; line-height: 1; }
        .modal-close:hover { color: var(--text); }
        .modal-body { padding: 16px 20px 24px; max-height: 70vh; overflow-y: auto; }
        .math-subtitle { color: var(--text-dim); font-size: 0.8125rem; margin-bottom: 14px; }
        .breakdown-item { background: var(--bg); border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 8px; border: 1px solid var(--border); }
        .breakdown-title { font-weight: 600; font-size: 0.8125rem; margin-bottom: 6px; }
        .breakdown-debt { font-size: 0.75rem; color: var(--text-dim); padding: 2px 0; }
        .custom-progress { background: var(--bg); border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 14px; border: 1px solid var(--border); }
        .progress-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
        .progress-label { font-size: 0.75rem; font-weight: 600; color: var(--text-dim); }
        .progress-value { font-size: 0.8125rem; font-weight: 700; color: var(--text); }
        .progress-remaining { font-size: 0.75rem; color: var(--text-dim); }
        .progress-remaining.over { color: var(--red); font-weight: 600; }
        .progress-remaining.done { color: var(--green); font-weight: 600; }
        .progress-bar-track { height: 6px; background: var(--surface-2); border-radius: 999px; overflow: hidden; margin-bottom: 4px; }
        .progress-bar-fill { height: 100%; border-radius: 999px; background: var(--accent); transition: width 0.2s, background 0.2s; }
        .progress-bar-fill.paid, .progress-bar-fill.complete { background: var(--green); }
        .progress-bar-fill.over { background: var(--red); }
        .custom-members { display: flex; flex-direction: column; gap: 8px; }
        .custom-member { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; transition: opacity 0.2s, border-color 0.2s; }
        .custom-member.excluded { opacity: 0.35; }
        .cm-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .cm-identity { display: flex; align-items: center; gap: 8px; }
        .cm-header-right { display: flex; align-items: center; gap: 8px; }
        .cm-exclude-btn { background: var(--bg); color: var(--text-dim); border: 1px solid var(--border); border-radius: 6px; padding: 3px 10px; font-size: 0.6875rem; font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: inherit; }
        .cm-exclude-btn:hover { border-color: var(--text-dim); color: var(--text); }
        .custom-member.excluded .cm-exclude-btn { background: var(--accent-soft); color: var(--accent); border-color: var(--accent-border); }
        .cm-avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 0.6875rem; font-weight: 800; flex-shrink: 0; }
        .custom-member.excluded .cm-avatar { background: var(--border); color: var(--text-dim); }
        .cm-name { font-weight: 600; font-size: 0.875rem; color: var(--text); }
        .custom-member.excluded .cm-name { text-decoration: line-through; color: var(--text-dim); }
        .cm-pct { font-size: 0.75rem; font-weight: 600; color: var(--accent); background: var(--accent-soft); border-radius: 999px; padding: 2px 8px; min-width: 40px; text-align: center; }
        .custom-member.excluded .cm-pct { background: var(--surface-2); color: var(--text-dim); }
        .cm-inputs { display: flex; gap: 8px; } .cm-field { flex: 1; display: flex; flex-direction: column; gap: 3px; }
        .cm-field-label { font-size: 0.6875rem; color: var(--text-dim); font-weight: 600; }
        .cm-field input { padding: 6px 10px; font-size: 0.8125rem; border-radius: 6px; background: var(--bg); border: 1px solid var(--border); color: var(--text); font-family: inherit; width: 100%; }
        .cm-field input:focus { outline: none; border-color: var(--accent); }
        .custom-member.excluded .cm-field input { opacity: 0.4; }
        .radio-cards { display: flex; flex-direction: column; gap: 8px; }
        .radio-card { display: flex; align-items: flex-start; gap: 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 14px; cursor: pointer; transition: all 0.15s; font-family: inherit; }
        .radio-card input[type=radio] { margin-top: 2px; accent-color: var(--accent); width: 16px; height: 16px; }
        .radio-card.selected { border-color: var(--accent); background: var(--accent-soft); }
        .pie-cell { position: relative; display: inline-block; }
        .pie-icon { width: 22px; height: 22px; border-radius: 50%; cursor: pointer; display: inline-block; border: 1px solid var(--border); transition: transform 0.15s; }
        .pie-cell:hover .pie-icon { transform: scale(1.15); }
        .pie-float { position: fixed; z-index: 999; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 14px; box-shadow: var(--shadow-lg); min-width: 220px; pointer-events: none; }
        .pie-float-title { font-size: 0.6875rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
        .pie-float-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 0.8125rem; }
        .pie-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .expense-actions { display: flex; gap: 6px; }
        .payment-row { background: rgba(5,150,105,0.02); } .payment-row:hover { background: rgba(5,150,105,0.05) !important; }
        .settle-summary { display: flex; align-items: center; justify-content: space-between; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px; }
        .settle-who { display: flex; align-items: center; gap: 10px; } .settle-who .who { font-weight: 600; font-size: 0.875rem; }
        .settle-who .arrow { font-size: 0.8125rem; color: var(--text-dim); }
        .settle-total { text-align: right; } .settle-label { font-size: 0.75rem; color: var(--text-dim); }
        .settle-amount { font-size: 1.125rem; font-weight: 700; } .settle-remaining-bar { margin: 14px 0; } .settle-quick { display: flex; gap: 8px; }
`
