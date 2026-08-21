import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import NavBar from '../components/NavBar';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../api/goals';

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_TARGET = 10_000_000; // ₹1 Crore hard cap per goal target
const MIN_NAME_LEN = 2;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate a raw string value as a positive numeric target.
 * Returns { value: number, error: string|null }
 */
function validateTarget(raw) {
  if (raw === '' || raw === null || raw === undefined) {
    return { value: null, error: 'Target amount is required.' };
  }
  // Reject anything that isn't a simple number (no operators, no spaces mid-string)
  if (!/^\d+(\.\d+)?$/.test(String(raw).trim())) {
    return { value: null, error: 'Enter a valid positive number (e.g. 50000).' };
  }
  const n = parseFloat(raw);
  if (isNaN(n)) {
    return { value: null, error: 'Enter a valid number.' };
  }
  if (n <= 0) {
    return { value: null, error: 'Target must be greater than ₹0.' };
  }
  if (n > MAX_TARGET) {
    return { value: null, error: `Target cannot exceed ₹${MAX_TARGET.toLocaleString('en-IN')}.` };
  }
  return { value: n, error: null };
}

/**
 * Validate a goal name string.
 * Returns error string or null.
 */
function validateName(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return 'Goal name cannot be empty.';
  if (trimmed.length < MIN_NAME_LEN) return `Name must be at least ${MIN_NAME_LEN} characters.`;
  if (trimmed.length > 100) return 'Name must be 100 characters or less.';
  return null;
}

/* ── tiny shimmer helper ── */
function Shimmer({ style }) {
  return (
    <div style={{
      background: 'linear-gradient(90deg,var(--bg-card) 25%,var(--border) 50%,var(--bg-card) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
      borderRadius: 8,
      ...style,
    }} />
  );
}

/* ── Inline validation error ── */
function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <p style={{ color: 'var(--danger)', fontSize: '0.78rem', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
      ⚠ {msg}
    </p>
  );
}

/* ─────────────────────────────────────────────────────────── */
export default function GoalsPage() {
  const location   = useLocation();
  const goalAmount = parseFloat(location.state?.goalAmount ?? 0);

  /* ── remote state ── */
  const [goals, setGoals]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [apiError, setApiError] = useState(null);

  /* ── new goal name input ── */
  const [newName, setNewName]   = useState('');
  const [nameError, setNameError] = useState(null); // inline name validation error
  const [adding, setAdding]     = useState(false);
  const [addError, setAddError] = useState(null);

  /* ── allocation mode ── */
  const [mode, setMode] = useState('manual');

  /* ── local manual amounts (unsaved input state), keyed by goal id ── */
  const [manualDraft, setManualDraft] = useState({});

  /* ── local target draft (auto mode), keyed by goal id ── */
  const [targetDraft, setTargetDraft] = useState({});

  /* ── per-goal target validation errors (auto mode) ── */
  const [targetErrors, setTargetErrors] = useState({});

  /* ── per-goal manual validation errors (manual mode) ── */
  const [manualErrors, setManualErrors] = useState({});

  /* ── deleting set (track in-flight deletions) ── */
  const [deletingIds, setDeletingIds] = useState(new Set());

  /* ── Load goals from backend ── */
  const load = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const data = await getGoals();
      setGoals(data);
      // Seed manual draft from persisted manual_amount values
      const draft = {};
      data.forEach(g => {
        if (g.manual_amount !== null && g.manual_amount !== undefined) {
          draft[g.id] = String(parseFloat(g.manual_amount));
        }
      });
      setManualDraft(draft);
      // Clear stale validation state on reload
      setTargetErrors({});
      setManualErrors({});
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Add goal ── */
  const handleAdd = async () => {
    // Validate name before submitting
    const err = validateName(newName);
    if (err) { setNameError(err); return; }
    setNameError(null);

    const trimmed = newName.trim();
    setAdding(true);
    setAddError(null);
    try {
      const maxPriority = goals.reduce((m, g) => Math.max(m, g.priority ?? 0), -1);
      const created = await createGoal({
        name: trimmed,
        priority: maxPriority + 1,
        target_amount: 0,
        allocation_mode: mode,
      });
      setGoals(prev => [...prev, created]);
      setNewName('');
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  };

  /* ── Delete goal ── */
  const handleDelete = async (id) => {
    setDeletingIds(prev => new Set([...prev, id]));
    try {
      await deleteGoal(id);
      setGoals(prev => prev.filter(g => g.id !== id));
      setManualDraft(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
      setTargetErrors(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
      setManualErrors(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
    } catch (err) {
      setApiError(err.message);
    } finally {
      setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  /* ── Save manual_amount on blur (with validation) ── */
  const handleManualBlur = async (g, isLast) => {
    if (isLast) return;
    const rawStr = manualDraft[g.id] ?? '';

    // Validate: must be non-negative number not exceeding goal budget
    if (rawStr === '' || rawStr === undefined) {
      // Empty → treat as 0 (user clearing the field)
      setManualErrors(prev => ({ ...prev, [g.id]: null }));
      const updated = await updateGoal(g.id, { manual_amount: null }).catch(() => null);
      if (updated) setGoals(prev => prev.map(x => x.id === g.id ? updated : x));
      return;
    }

    // Reject non-numeric strings (e.g. "542-25245")
    if (!/^\d+(\.\d{1,2})?$/.test(String(rawStr).trim())) {
      setManualErrors(prev => ({ ...prev, [g.id]: 'Enter a valid positive number.' }));
      return;
    }

    const n = parseFloat(rawStr);
    if (isNaN(n) || n < 0) {
      setManualErrors(prev => ({ ...prev, [g.id]: 'Amount cannot be negative.' }));
      return;
    }
    if (n > MAX_TARGET) {
      setManualErrors(prev => ({ ...prev, [g.id]: `Cannot exceed ₹${MAX_TARGET.toLocaleString('en-IN')}.` }));
      return;
    }

    // Clear error and save
    setManualErrors(prev => ({ ...prev, [g.id]: null }));
    const prevVal = g.manual_amount !== null ? parseFloat(g.manual_amount) : null;
    if (n === prevVal) return;
    try {
      const updated = await updateGoal(g.id, { manual_amount: n });
      setGoals(prev => prev.map(x => x.id === g.id ? updated : x));
    } catch (_) { /* silent — user can retry */ }
  };

  /* ── Save target_amount (auto mode) on blur (with validation) ── */
  const handleTargetBlur = async (g, rawStr) => {
    const { value, error } = validateTarget(rawStr);
    if (error) {
      setTargetErrors(prev => ({ ...prev, [g.id]: error }));
      return;
    }
    setTargetErrors(prev => ({ ...prev, [g.id]: null }));

    const newTarget = value;
    if (newTarget === parseFloat(g.target_amount)) return;
    try {
      const updated = await updateGoal(g.id, { target_amount: newTarget });
      setGoals(prev => prev.map(x => x.id === g.id ? updated : x));
    } catch (_) { /* silent */ }
  };

  /* ── Drag to reorder (auto mode) ── */
  const onDragEnd = async result => {
    if (!result.destination) return;
    const reordered = Array.from(goals);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    setGoals(reordered);

    try {
      await Promise.all(
        reordered.map((g, idx) =>
          g.priority !== idx ? updateGoal(g.id, { priority: idx }) : Promise.resolve()
        )
      );
      const fresh = await getGoals();
      setGoals(fresh);
    } catch (_) { /* silent — optimistic already applied */ }
  };

  /* ── Manual mode: compute leftover for the last goal ──────────────────────
     Hard constraint: manualEnteredTotal must never exceed goalAmount.
     Each non-last goal's contribution is clamped to [0, remaining budget].   */
  const manualEnteredTotal = (() => {
    let runningTotal = 0;
    goals.slice(0, -1).forEach(g => {
      const rawStr = manualDraft[g.id] ?? (g.manual_amount !== null ? String(parseFloat(g.manual_amount ?? 0)) : '');
      // Only count valid, non-negative numbers
      if (/^\d+(\.\d{1,2})?$/.test(String(rawStr).trim())) {
        const n = Math.max(0, parseFloat(rawStr) || 0);
        runningTotal = Math.min(runningTotal + n, goalAmount);
      }
    });
    return runningTotal;
  })();
  const lastGoalAmt = Math.max(goalAmount - manualEnteredTotal, 0);

  /* ── Auto mode: FIFO allocation ────────────────────────────────────────────
     Hard constraint:
       - Each goal's target must be a valid positive number (else treated as 0)
       - The sum of all allocations is strictly capped at goalAmount
       - Allocation is FIFO in priority order: goal[0] gets funded first        */
  const computeAutoAlloc = () => {
    let remaining = Math.max(goalAmount, 0); // never go negative
    return goals.map(g => {
      // Use the draft value if present; fall back to persisted value.
      // IMPORTANT: validate the draft string — only allow clean numeric strings.
      const rawDraft = targetDraft[g.id];
      let target = 0;
      if (rawDraft !== undefined && rawDraft !== '') {
        if (/^\d+(\.\d+)?$/.test(String(rawDraft).trim())) {
          target = Math.max(0, parseFloat(rawDraft) || 0);
        }
        // else: invalid string → treat as 0 (don't allocate anything)
      } else {
        // No draft → use persisted value, clamped to [0, MAX_TARGET]
        const persisted = parseFloat(g.target_amount ?? 0) || 0;
        target = Math.min(Math.max(persisted, 0), MAX_TARGET);
      }

      // Allocate: never exceed remaining budget
      const alloc = Math.min(remaining, target);
      remaining    = Math.max(remaining - alloc, 0);
      return { ...g, alloc };
    });
  };
  const autoAlloc = computeAutoAlloc();
  const totalAutoAllocated = autoAlloc.reduce((s, g) => s + g.alloc, 0);

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .goals-error {
          background: rgba(248,113,113,.08);
          border: 1px solid rgba(248,113,113,.35);
          border-radius: var(--radius-sm);
          padding: 11px 16px;
          font-size: .84rem;
          color: var(--danger);
          margin-bottom: 16px;
        }
        .field-error {
          color: var(--danger);
          font-size: 0.78rem;
          margin-top: 4px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
      `}</style>

      <NavBar title="Goals" />
      <div className="page">
        <h1 className="page-title" style={{ textAlign: 'center' }}>Goals</h1>

        {/* ── API error banner ── */}
        {apiError && (
          <div className="goals-error">
            ⚠️ {apiError}
            <button
              onClick={load}
              style={{ marginLeft: 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
            >Retry</button>
          </div>
        )}

        {/* ── Goal budget (from Savings page) ── */}
        <div className="balance-box mb-24">
          <p className="balance-label">Goal Budget</p>
          <p className="balance-amount purple">
            ₹{goalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-muted mt-8" style={{ fontSize: '0.78rem' }}>
            Carried over from Savings page allocation
          </p>
        </div>

        {/* ── Add goal names ── */}
        <div className="card mb-24">
          <p className="section-label mb-12">Add Goal Names</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              id="new-goal-name-input"
              className="input"
              placeholder="e.g. New Laptop, Vacation – Goa… (min 2 chars)"
              value={newName}
              onChange={e => {
                setNewName(e.target.value);
                // Clear error on change so the user gets instant feedback
                if (nameError) setNameError(validateName(e.target.value));
              }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              disabled={adding}
              style={{ flex: 1, borderColor: nameError ? 'var(--danger)' : undefined }}
            />
            <button
              id="add-goal-name-btn"
              className="btn btn-primary"
              onClick={handleAdd}
              disabled={adding}
            >
              {adding ? '…' : '+ Add'}
            </button>
          </div>

          {/* Name validation error */}
          {nameError && <p className="field-error">⚠ {nameError}</p>}
          {addError && (
            <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 8 }}>{addError}</p>
          )}

          {/* Validation hint */}
          <p style={{ color: 'var(--muted)', fontSize: '0.74rem', marginTop: 6 }}>
            At least {MIN_NAME_LEN} characters. Leading/trailing spaces are trimmed automatically.
          </p>

          {/* Current goal name list */}
          {loading ? (
            <div className="col mt-16">
              {[1, 2].map(i => <Shimmer key={i} style={{ height: 44, borderRadius: 10 }} />)}
            </div>
          ) : goals.length > 0 && (
            <div className="col mt-16">
              {goals.map((g, idx) => (
                <div key={g.id} style={styles.nameRow}>
                  <span style={styles.indexBadge}>{idx + 1}</span>
                  <span style={{ flex: 1, fontSize: '0.92rem', fontWeight: 500 }}>{g.name}</span>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(g.id)}
                    disabled={deletingIds.has(g.id)}
                  >
                    {deletingIds.has(g.id) ? '…' : '✕'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Allocation section (only when goals exist) ── */}
        {!loading && goals.length > 0 && (
          <>
            {/* ── Mode selector ── */}
            <p className="section-label mb-12">Allocation Mode</p>
            <div className="tabs mb-24">
              <button
                id="mode-manual-tab"
                className={`tab ${mode === 'manual' ? 'active' : ''}`}
                onClick={() => setMode('manual')}
              >
                ✏️ Manual Entry
              </button>
              <button
                id="mode-auto-tab"
                className={`tab ${mode === 'auto' ? 'active' : ''}`}
                onClick={() => setMode('auto')}
              >
                ⚡ Auto (Priority)
              </button>
            </div>

            {/* ═══════════ MANUAL MODE ═══════════ */}
            {mode === 'manual' && (
              <div className="col">
                <p className="text-muted mb-8" style={{ fontSize: '0.82rem' }}>
                  Enter the amount for each goal. The <strong>last goal</strong> automatically receives the remaining balance.
                  Amounts are saved when you leave each field. Each amount must be a positive number; the total cannot exceed the Goal Budget.
                </p>

                {goals.map((g, idx) => {
                  const isLast = idx === goals.length - 1;
                  const draftVal = manualDraft[g.id] ?? (g.manual_amount !== null ? String(parseFloat(g.manual_amount)) : '');
                  const displayAmt = isLast ? lastGoalAmt : (parseFloat(draftVal) || 0);
                  const fieldErr = manualErrors[g.id];

                  return (
                    <div key={g.id} className="card" style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={styles.indexBadge}>{idx + 1}</span>
                          <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{g.name}</span>
                        </div>
                        {isLast && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--accent-2)', background: 'rgba(78,205,196,.12)', padding: '2px 8px', borderRadius: 99 }}>
                            auto-leftover
                          </span>
                        )}
                      </div>

                      {isLast ? (
                        <div style={styles.allocBadge('#4ecdc4')}>
                          <span style={styles.badgeLabel}>Assigned Amount</span>
                          <span style={{ ...styles.badgeValue, color: '#4ecdc4' }}>
                            ₹{displayAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>₹</span>
                            <input
                              id={`manual-amt-${g.id}`}
                              type="text"
                              inputMode="decimal"
                              className="input"
                              placeholder="0"
                              value={draftVal}
                              onKeyDown={e => {
                                if (['e', 'E', '+', '-'].includes(e.key)) {
                                  e.preventDefault();
                                }
                              }}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                  setManualDraft(prev => ({ ...prev, [g.id]: val }));
                                  // Clear error on change
                                  if (manualErrors[g.id]) setManualErrors(prev => ({ ...prev, [g.id]: null }));
                                }
                              }}
                              onBlur={() => handleManualBlur(g, false)}
                              style={{ borderColor: fieldErr ? 'var(--danger)' : undefined }}
                            />
                          </div>
                          {fieldErr && <p className="field-error">⚠ {fieldErr}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Manual over-budget warning */}
                {manualEnteredTotal > goalAmount && (
                  <div style={{ background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.35)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: '0.84rem', color: 'var(--danger)' }}>
                    ⚠ Total manually allocated (₹{manualEnteredTotal.toLocaleString('en-IN')}) exceeds the Goal Budget (₹{goalAmount.toLocaleString('en-IN')}). The last goal receives ₹0 and amounts are clamped automatically.
                  </div>
                )}

                {/* Summary */}
                <div className="card mt-8" style={{ background: 'rgba(124,106,246,.08)', border: '1px solid rgba(124,106,246,.25)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--muted)' }}>
                    <span>Manually allocated</span>
                    <span>₹{manualEnteredTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--muted)', marginTop: 6 }}>
                    <span>Leftover (last goal)</span>
                    <span style={{ color: 'var(--accent-2)' }}>₹{lastGoalAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <hr className="divider" style={{ margin: '10px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif' }}>
                    <span>Total Budget</span>
                    <span style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>₹{goalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════ AUTO / PRIORITY MODE ═══════════ */}
            {mode === 'auto' && (
              <div className="col">
                <p className="text-muted mb-8" style={{ fontSize: '0.82rem' }}>
                  Drag ⠿ to set priority. Enter each goal's target amount (must be &gt; ₹0). The <strong>#1 goal gets funded first</strong> from the available budget.
                  The sum of all "Allocated" amounts will never exceed your Goal Budget of ₹{goalAmount.toLocaleString('en-IN')}.
                </p>

                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable droppableId="auto-goals-list">
                    {provided => (
                      <div className="col" ref={provided.innerRef} {...provided.droppableProps}>
                        {autoAlloc.map((g, idx) => {
                          const fieldErr = targetErrors[g.id];
                          const draftVal = targetDraft[g.id] ?? (parseFloat(g.target_amount) || '');
                          return (
                            <Draggable key={g.id} draggableId={String(g.id)} index={idx}>
                              {(prov, snapshot) => (
                                <div
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  className="card"
                                  style={{
                                    ...prov.draggableProps.style,
                                    padding: '14px 16px',
                                    opacity: snapshot.isDragging ? 0.85 : 1,
                                    background: snapshot.isDragging ? 'var(--border)' : undefined,
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                                    <span className="drag-handle" {...prov.dragHandleProps} title="Drag to reprioritize">⠿</span>
                                    <span style={styles.indexBadge}>{idx + 1}</span>
                                    <span style={{ flex: 1, fontWeight: 600, fontSize: '0.92rem' }}>{g.name}</span>
                                    {idx === 0 && (
                                      <span style={{ fontSize: '0.72rem', color: '#f7b731', background: 'rgba(247,183,49,.12)', padding: '2px 8px', borderRadius: 99 }}>
                                        #1 Priority
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                      <label style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Target (₹)
                                      </label>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>₹</span>
                                        <input
                                          id={`auto-target-${g.id}`}
                                          type="number"
                                          className="input"
                                          placeholder="e.g. 50000"
                                          value={draftVal}
                                          onChange={e => {
                                            setTargetDraft(prev => ({ ...prev, [g.id]: e.target.value }));
                                            // Live-clear error when user starts correcting
                                            if (targetErrors[g.id]) setTargetErrors(prev => ({ ...prev, [g.id]: null }));
                                          }}
                                          onBlur={e => handleTargetBlur(g, e.target.value)}
                                          min={1}
                                          max={MAX_TARGET}
                                          style={{ borderColor: fieldErr ? 'var(--danger)' : undefined }}
                                        />
                                      </div>
                                      {fieldErr && <p className="field-error">⚠ {fieldErr}</p>}
                                    </div>
                                    <div style={{ textAlign: 'right', minWidth: 90 }}>
                                      <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Allocated</p>
                                      <p style={{
                                        fontSize: '1.2rem',
                                        fontWeight: 700,
                                        fontFamily: 'Space Grotesk, sans-serif',
                                        fontVariantNumeric: 'tabular-nums',
                                        color: g.alloc > 0 ? 'var(--success)' : 'var(--muted)',
                                        marginTop: 4,
                                      }}>
                                        ₹{g.alloc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>

                {/* Allocation integrity check — surface if anything is off */}
                {totalAutoAllocated > goalAmount && (
                  <div style={{ background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.35)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: '0.84rem', color: 'var(--danger)' }}>
                    ⚠ Internal constraint violation: allocated (₹{totalAutoAllocated.toLocaleString('en-IN')}) exceeds budget. Please refresh.
                  </div>
                )}

                {/* Auto summary */}
                <div className="card mt-8" style={{ background: 'rgba(124,106,246,.08)', border: '1px solid rgba(124,106,246,.25)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--muted)' }}>
                    <span>Total allocated</span>
                    <span style={{ color: totalAutoAllocated <= goalAmount ? 'var(--success)' : 'var(--danger)' }}>
                      ₹{totalAutoAllocated.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--muted)', marginTop: 6 }}>
                    <span>Unallocated</span>
                    <span style={{ color: 'var(--warning)' }}>
                      ₹{Math.max(goalAmount - totalAutoAllocated, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <hr className="divider" style={{ margin: '10px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif' }}>
                    <span>Total Budget</span>
                    <span style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>₹{goalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Empty state (after load) ── */}
        {!loading && goals.length === 0 && !apiError && (
          <div className="coming-soon" style={{ paddingTop: 40 }}>
            <div className="coming-soon-emoji">🎯</div>
            <h2>No goals yet</h2>
            <p>Add goal names above to start allocating your ₹{goalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} budget.</p>
          </div>
        )}

        {/* ── Loading skeleton for allocation section ── */}
        {loading && (
          <div className="col mt-8">
            {[1, 2, 3].map(i => <Shimmer key={i} style={{ height: 80, borderRadius: 12 }} />)}
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Inline styles ─────────────────────────────────────── */
const styles = {
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: '10px 14px',
  },
  indexBadge: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
    color: '#fff',
    fontSize: '0.72rem',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  allocBadge: color => ({
    background: `${color}18`,
    border: `1px solid ${color}55`,
    borderRadius: 10,
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  }),
  badgeLabel: {
    fontSize: '0.7rem',
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
  },
  badgeValue: {
    fontSize: '1.5rem',
    fontWeight: 800,
    fontFamily: 'Space Grotesk, sans-serif',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--accent)',
  },
};
