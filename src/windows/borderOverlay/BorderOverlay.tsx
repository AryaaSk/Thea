export default function BorderOverlay() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        border: '3px solid #D4A017',
        borderRadius: '12px',
        boxShadow: 'inset 0 0 20px rgba(212, 160, 23, 0.3), 0 0 20px rgba(212, 160, 23, 0.2)',
        zIndex: 999999,
      }}
    />
  );
}
