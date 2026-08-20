import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import NavBar from '../components/NavBar';
import Button from '../components/Button';
import Modal from '../components/Modal';

const MOCK_GOALS = [
  { id: 'g1', name: 'Emergency Buffer Top-up', target: 15000, current: 10000 },
  { id: 'g2', name: 'New Laptop', target: 80000, current: 24000 },
  { id: 'g3', name: 'Vacation – Goa', target: 30000, current: 8500 },
  { id: 'g4', name: 'Camera', target: 55000, current: 0 },
];

let nextId = MOCK_GOALS.length + 1;

function GoalForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { name: '', target: '', current: '' });
  const change = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  return (
    <div className="col">
      <div className="input-group">
        <label>Goal Name</label>
        <input name="name" className="input" placeholder="e.g. New Laptop" value={form.name} onChange={change} />
      </div>
      <div className="grid-2">
        <div className="input-group">
          <label>Target (₹)</label>
          <input name="target" type="number" className="input" placeholder="0" value={form.target} onChange={change} />
        </div>
        <div className="input-group">
          <label>Current (₹)</label>
          <input name="current" type="number" className="input" placeholder="0" value={form.current} onChange={change} />
        </div>
      </div>
      <div className="row mt-8">
        <Button onClick={() => onSave(form)}>Save</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const [goals, setGoals] = useState(MOCK_GOALS);
  const [modalMode, setModalMode] = useState(null);
  const [editing, setEditing] = useState(null);

  const openAdd  = () => setModalMode('add');
  const openEdit = g  => { setEditing(g); setModalMode('edit'); };
  const closeModal = () => { setModalMode(null); setEditing(null); };

  const handleAdd = form => {
    if (!form.name) return;
    setGoals(p => [...p, { id: `g${nextId++}`, name: form.name, target: +form.target || 0, current: +form.current || 0 }]);
    closeModal();
  };

  const handleEdit = form => {
    setGoals(p => p.map(g => g.id === editing.id
      ? { ...g, name: form.name, target: +form.target || 0, current: +form.current || 0 }
      : g));
    closeModal();
  };

  const handleDelete = id => setGoals(p => p.filter(g => g.id !== id));

  const onDragEnd = result => {
    if (!result.destination) return;
    const reordered = Array.from(goals);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setGoals(reordered);
  };

  return (
    <>
      <NavBar title="Goals" />
      <div className="page">
        <div className="flex items-center justify-between mb-8">
          <h1 className="page-title" style={{ marginBottom: 0 }}>Goals</h1>
          <Button id="add-goal-btn" onClick={openAdd}>+ Add Goal</Button>
        </div>
        <p className="text-muted mb-24" style={{ fontSize: '0.8rem' }}>
          Drag ⠿ to reprioritize. The first goal gets funded first (FIFO).
        </p>

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="goals-list">
            {provided => (
              <div
                className="col"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                {goals.map((goal, index) => {
                  const pct = Math.min(Math.round((goal.current / (goal.target || 1)) * 100), 100);
                  return (
                    <Draggable key={goal.id} draggableId={goal.id} index={index}>
                      {(prov, snapshot) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          className="list-item"
                          style={{
                            ...prov.draggableProps.style,
                            opacity: snapshot.isDragging ? 0.85 : 1,
                            background: snapshot.isDragging ? 'var(--border)' : undefined,
                          }}
                        >
                          {/* Drag handle */}
                          <span
                            className="drag-handle"
                            {...prov.dragHandleProps}
                            title="Drag to reorder"
                          >⠿</span>

                          <div className="list-item-content">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-muted" style={{ fontSize: '0.7rem', marginRight: 6 }}>
                                  #{index + 1}
                                </span>
                                <span className="list-item-title">{goal.name}</span>
                              </div>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: pct === 100 ? 'var(--success)' : 'var(--muted)' }}>
                                {pct}%
                              </span>
                            </div>
                            <div className="list-item-sub mt-4">
                              ₹{goal.current.toLocaleString()} / ₹{goal.target.toLocaleString()}
                            </div>
                            <div className="progress-bar-track mt-8">
                              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                          </div>

                          <div className="list-item-actions">
                            <Button variant="secondary" size="sm" onClick={() => openEdit(goal)}>Edit</Button>
                            <Button variant="danger" size="sm" onClick={() => handleDelete(goal.id)}>Delete</Button>
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
      </div>

      <Modal open={modalMode === 'add'} onClose={closeModal} title="Add Goal">
        <GoalForm onSave={handleAdd} onCancel={closeModal} />
      </Modal>
      <Modal open={modalMode === 'edit'} onClose={closeModal} title="Edit Goal">
        {editing && (
          <GoalForm
            initial={{ name: editing.name, target: editing.target, current: editing.current }}
            onSave={handleEdit}
            onCancel={closeModal}
          />
        )}
      </Modal>
    </>
  );
}
