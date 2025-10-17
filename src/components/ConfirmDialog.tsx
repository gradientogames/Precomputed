import { useEffect, useRef } from 'react'

export type ConfirmDialogProps = {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title = 'Please confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (open) {
      // Focus the least destructive action by default
      cancelRef.current?.focus()
      // Prevent background scroll while open
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open])

  if (!open) return null

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="modal" role="document">
        <div className="modal-header">
          <h3 id="confirm-title">{title}</h3>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-actions">
          <button ref={cancelRef} className="btn" onClick={onCancel}>{cancelLabel}</button>
          <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
