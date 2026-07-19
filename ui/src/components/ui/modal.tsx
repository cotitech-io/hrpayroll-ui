import type { ReactNode } from 'react'

export function Modal({
  open,
  onClose,
  title,
  children,
  dismissable = true,
  width = '480px',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** When false, the backdrop and × are inert — used while a process must run to completion. */
  dismissable?: boolean
  /** CSS width for the dialog panel (still capped at 100%). */
  width?: string
}) {
  if (!open) return null

  return (
    <div
      className="modal-overlay-blur"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={dismissable ? onClose : undefined}
    >
      <div
        className="bg-card border border-border rounded-lg"
        style={{ width, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', padding: '1.5rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          {dismissable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1 }}
            >
              ×
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
