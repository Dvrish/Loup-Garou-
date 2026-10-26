import { useEffect } from 'react';

/** Petit message d'erreur ou d'information qui disparaît tout seul. */
export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="toast" role="alert" onClick={onClose}>
      {message}
    </div>
  );
}
