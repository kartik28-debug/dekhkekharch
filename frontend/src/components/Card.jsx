// Shared Card component
export default function Card({ children, className = '', onClick, style }) {
  const cls = ['card', className, onClick ? 'card-link' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} onClick={onClick} style={style}>
      {children}
    </div>
  );
}
