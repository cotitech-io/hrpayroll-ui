import { X } from 'lucide-react'
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

  const inputClass =
    'w-full rounded-lg border border-white/5 bg-black/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition'

  return (
    <div className="space-y-2">
      <div className="hidden sm:grid grid-cols-[2rem_1fr_10rem_2rem] gap-3 px-2 pb-2 text-xs uppercase tracking-wider text-muted-foreground">
        <div>#</div>
        <div>Recipient address</div>
        <div>Amount (pMTT)</div>
        <div />
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-[2rem_1fr_10rem_2rem] gap-3 items-center"
        >
          <div className="text-sm text-muted-foreground text-center">{i}</div>
          <input
            type="text"
            className={inputClass + ' font-mono'}
            value={row.recipient}
            onChange={(e) => updateRow(i, 'recipient', e.target.value)}
            placeholder="0x…"
          />
          <input
            type="text"
            className={inputClass}
            value={row.amount}
            onChange={(e) => updateRow(i, 'amount', e.target.value)}
            placeholder="2500"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            disabled={rows.length === 1}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition"
            aria-label="Remove row"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
