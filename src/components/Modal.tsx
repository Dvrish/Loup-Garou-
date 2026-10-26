import type { ReactNode } from 'react';

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modal__panel panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose} aria-label="Fermer">
          ×
        </button>
        <h2 className="modal__title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
