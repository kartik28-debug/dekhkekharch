import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import NavBar from '../components/NavBar';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../api/goals';

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

/* ─────────────────────────────────────────────────────────── */
export default function GoalsPage() {
  const location   = useLocation();
  const goalAmount = parseFloat(location.state?.goalAmount ?? 0);

  /* ── remote state ── */
  const [goals, setGoals]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);

  /* ── new goal name input ── */
  const [newName, setNewName]   = useState('');
  const [adding, setAdding]     = useState(false);
  const [addError, setAddError] = useState(null);

  /* ── allocation mode ── */
  const [mode, setMode] = useState('manual');

  /* ── local manual amounts (unsaved input state), keyed by goal id ── */
  const [manualDraft, setManualDraft] = useState({});

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
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Add goal ── */
  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    setAddError(null);
    try {
      // priority = current max + 1 so new goals go to the end
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
    } catch (err) {
      setApiError(err.message);
    } finally {
      setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  /* ── Save manual_amount on blur ── */
  const handleManualBlur = async (g, isLast) => {
    if (isLast) return; // last goal is always auto-leftover, not manually edited
    const raw = parseFloat(manualDraft[g.id]);
    const newAmt = isNaN(raw) ? null : raw;
    // Only call API if value actually changed
    if (String(newAmt) === String(g.manual_amount !== null ? parseFloat(g.manual_amount) : null)) return;
    try {
      const updated = await updateGoal(g.id, { manual_amount: newAmt });
      setGoals(prev => prev.map(x => x.id === g.id ? updated : x));
    } catch (_) { /* silent — user can retry */ }
  };

  /* ── Save target_amount (auto mode) on blur ── */
  const handleTargetBlur = async (g, rawVal) => {
    const newTarget = parseFloat(rawVal) || 0;
    if (newTarget === parseFloat(g.target_amount)) return;
    try {
      const updated = await updateGoal(g.id, { target_amount: newTarget });
      setGoals(prev => prev.map(x => x.id === g.id ? updated : x));
    } catch (_) { /* silent */ }
  };

  /* ── local target draft ── */
  const [targetDraft, setTargetDraft] = useState({});

  /* ── Drag to reorder (auto mode) ── */
  const onDragEnd = async result => {
    if (!result.destination) return;
    const reordered = Array.from(goals);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    // Optimistic update
    setGoals(reordered);

    // Persist new priorities: index → priority
    try {
      await Promise.all(
        reordered.map((g, idx) =>
          g.priority !== idx ? updateGoal(g.id, { priority: idx }) : Promise.resolve()
        )
      );
      // Refresh to get consistent server state
      const fresh = await getGoals();
      setGoals(fresh);
    } catch (_) { /* silent — optimistic already applied */ }
  };

  /* ── Manual mode: compute leftover for the last goal ── */
  const manualEnteredTotal = goals.slice(0, -1).reduce((sum, g) => {
    return sum + (parseFloat(manualDraft[g.id] ?? g.manual_amount ?? 0) || 0);
  }, 0);
  const lastGoalAmt = Math.max(goalAmount - manualEnteredTotal, 0);

  /* ── Auto mode: FIFO allocation ── */
  const computeAutoAlloc = () => {
    let remaining = goalAmount;
    return goals.map(g => {
      const target = parseFloat(targetDraft[g.id] ?? g.target_amount ?? 0) || 0;
      const alloc  = Math.min(remaining, target);
      remaining    = Math.max(remaining - alloc, 0);
      return { ...g, alloc };
    });
  };
  const autoAlloc = computeAutoAlloc();

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .goals-error { background: rgba(255,95,95,.1); border: 1px solid var(--danger);
          border-radius: 10px; padding: 10px 14px; font-size:.83rem;
          color: var(--danger); margin-bottom:16px; }
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
              placeholder="e.g. New Laptop, Vacation – Goa…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              disabled={adding}
              style={{ flex: 1 }}
            />
            <button
              id="add-goal-name-btn"
              className="btn btn-primary"
              onClick={handleAdd}
              disabled={!newName.trim() || adding}
            >
              {adding ? '…' : '+ Add'}
            </button>
          </div>
          {addError && (
            <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 8 }}>{addError}</p>
          )}

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
                  Amounts are saved when you leave each field.
                </p>

                {goals.map((g, idx) => {
                  const isLast = idx === goals.length - 1;
                  const draftVal = manualDraft[g.id] ?? (g.manual_amount !== null ? String(parseFloat(g.manual_amount)) : '');
                  const displayAmt = isLast ? lastGoalAmt : (parseFloat(draftVal) || 0);

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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--muted)', fontWeight: 600 }}>₹</span>
                          <input
                            id={`manual-amt-${g.id}`}
                            type="number"
                            className="input"
                            placeholder="0"
                            value={draftVal}
                            onChange={e => setManualDraft(prev => ({ ...prev, [g.id]: e.target.value }))}
                            onBlur={() => handleManualBlur(g, false)}
                            min={0}
                            max={goalAmount}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Summary */}
                <div className="card mt-8" style={{ background: 'rgba(108,99,255,.08)', border: '1px solid rgba(108,99,255,.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--muted)' }}>
                    <span>Manually allocated</span>
                    <span>₹{manualEnteredTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--muted)', marginTop: 6 }}>
                    <span>Leftover (last goal)</span>
                    <span style={{ color: 'var(--accent-2)' }}>₹{lastGoalAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <hr className="divider" style={{ margin: '10px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>Total Budget</span>
                    <span style={{ color: 'var(--accent)' }}>₹{goalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════ AUTO / PRIORITY MODE ═══════════ */}
            {mode === 'auto' && (
              <div className="col">
                <p className="text-muted mb-8" style={{ fontSize: '0.82rem' }}>
                  Drag ⠿ to set priority. Enter each goal's target. The <strong>#1 goal gets funded first</strong> from the available budget.
                  Targets are saved when you leave each field.
                </p>

                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable droppableId="auto-goals-list">
                    {provided => (
                      <div className="col" ref={provided.innerRef} {...provided.droppableProps}>
                        {autoAlloc.map((g, idx) => (
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

                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
                                        placeholder="0"
                                        value={targetDraft[g.id] ?? (parseFloat(g.target_amount) || '')}
                                        onChange={e => setTargetDraft(prev => ({ ...prev, [g.id]: e.target.value }))}
                                        onBlur={e => handleTargetBlur(g, e.target.value)}
                                        min={0}
                                      />
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right', minWidth: 90 }}>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Allocated</p>
                                    <p style={{ fontSize: '1.2rem', fontWeight: 700, color: g.alloc > 0 ? 'var(--success)' : 'var(--muted)', marginTop: 4 }}>
                                      ₹{g.alloc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>

                {/* Auto summary */}
                <div className="card mt-8" style={{ background: 'rgba(108,99,255,.08)', border: '1px solid rgba(108,99,255,.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--muted)' }}>
                    <span>Total allocated</span>
                    <span>₹{autoAlloc.reduce((s, g) => s + g.alloc, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--muted)', marginTop: 6 }}>
                    <span>Unallocated</span>
                    <span style={{ color: 'var(--accent-3)' }}>
                      ₹{Math.max(goalAmount - autoAlloc.reduce((s, g) => s + g.alloc, 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <hr className="divider" style={{ margin: '10px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>Total Budget</span>
                    <span style={{ color: 'var(--accent)' }}>₹{goalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
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
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 14px',
  },
  indexBadge: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'var(--accent)',
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
    fontSize: '1.4rem',
    fontWeight: 700,
    color: 'var(--accent)',
  },
};
