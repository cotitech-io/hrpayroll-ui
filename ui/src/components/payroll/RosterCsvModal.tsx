import { useState } from 'react'
import { Button } from '../ui/button'
import { Modal } from '../ui/modal'
import { parseCsv, type RosterRow } from '../../lib/roster'

export function RosterCsvModal({
  open,
  onClose,
  onApply,
}: {
  open: boolean
  onClose: () => void
  onApply: (rows: RosterRow[]) => void
}) {
  // Lives here (not inside Modal's children) so the pasted text survives close/reopen.
  const [csvText, setCsvText] = useState('')

  return (
    <Modal open={open} onClose={onClose} title="Paste CSV">
      <textarea
        rows={8}
        style={{ width: '100%', fontFamily: 'monospace' }}
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        placeholder={'0xabc...,2500\n0xdef...,1800'}
      />
      <Button
        type="button"
        onClick={() => {
          const parsed = parseCsv(csvText)
          if (parsed.length > 0) onApply(parsed)
          onClose()
        }}
        className="mt-2"
      >
        Load CSV into roster
      </Button>
    </Modal>
  )
}
