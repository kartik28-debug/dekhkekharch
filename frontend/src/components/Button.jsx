// Shared reusable Button component
export default function Button({ children, variant = 'primary', size, full, onClick, type = 'button', disabled }) {
  const cls = [
    'btn',
    `btn-${variant}`,
    size === 'sm' ? 'btn-sm' : '',
    full ? 'btn-full' : '',
  ].filter(Boolean).join(' ');

  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
