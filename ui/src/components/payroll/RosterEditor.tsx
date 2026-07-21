import { Button } from '../ui/button'
import type { RosterRow } from '../../lib/roster'

/** Controlled editable roster table (index / recipient / amount rows with remove). */
export function RosterEditor({
  rows,
  onChange,
}: {
  rows: RosterRow[]
  onChange: (rows: RosterRow[]) => void
}) {
  function updateRow(i: number, field: keyof RosterRow, value: string) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>Index</th>
          <th style={{ textAlign: 'left' }}>Recipient address</th>
          <th style={{ textAlign: 'left' }}>Amount (pMTT)</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td>{i}</td>
            <td>
              <input
                type="text"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                value={row.recipient}
                onChange={(e) => updateRow(i, 'recipient', e.target.value)}
                placeholder="0x…"
              />
            </td>
            <td>
              <input
                type="text"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                value={row.amount}
                onChange={(e) => updateRow(i, 'amount', e.target.value)}
                placeholder="2500"
              />
            </td>
            <td>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                disabled={rows.length === 1}
              >
                Remove
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
