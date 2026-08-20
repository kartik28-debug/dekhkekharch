// Simple modal overlay with close-on-backdrop-click
export default function Modal({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        {title && <p className="modal-title">{title}</p>}
        {children}
      </div>
    </div>
  );
}
