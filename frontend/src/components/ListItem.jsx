// Generic list item with title, subtitle, and action buttons
import Button from './Button';

export default function ListItem({ title, subtitle, onEdit, onDelete, extra, dragHandle }) {
  return (
    <div className="list-item">
      {dragHandle && <span className="drag-handle">{dragHandle}</span>}
      <div className="list-item-content">
        <div className="list-item-title">{title}</div>
        {subtitle && <div className="list-item-sub">{subtitle}</div>}
        {extra}
      </div>
      <div className="list-item-actions">
        {onEdit && (
          <Button variant="secondary" size="sm" onClick={onEdit}>Edit</Button>
        )}
        {onDelete && (
          <Button variant="danger" size="sm" onClick={onDelete}>Delete</Button>
        )}
      </div>
    </div>
  );
}
