import { useState } from 'react'
import { Trash2, Upload, Plus, Rocket } from 'lucide-react'
import { Button } from '../ui/button'
import { toRoster, type RosterRow } from '../../lib/roster'
import type { RosterEntry } from '../../lib/merkle'
import { RosterCsvModal } from './RosterCsvModal'
import { RosterEditor } from './RosterEditor'

/** "Add Payroll" card: campaign name + roster editor + CSV import + deploy trigger. */
export function CreatePayroll({
  canDeploy,
  isDeploying,
  onDeploy,
}: {
  /** Private access unlocked — deploying needs the session AES key. */
  canDeploy: boolean
  isDeploying: boolean
  onDeploy: (params: { roster: RosterEntry[]; campaignName: string }) => void
}) {
  const [rows, setRows] = useState<RosterRow[]>([{ recipient: '', amount: '' }])
  const [campaignName, setCampaignName] = useState('Q1 Payroll')
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)

  const roster = toRoster(rows.filter((r) => r.recipient.trim() && r.amount.trim()))
  const totalAmount = roster.reduce((acc, r) => acc + Number(r.amount || 0), 0)

  const clear = () => {
    setRows([{ recipient: '', amount: '' }])
    setCampaignName('')
  }

  return (
    <>
      <div className="space-y-6">
        {/* Section 1 — Campaign details */}
        <section className="rounded-3xl border border-white/5 bg-[#151828]/80 pt-0 px-6 pb-6 sm:px-8 sm:pb-8 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
          <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex-1 min-w-0 max-w-md">
              <label className="block text-sm font-medium text-foreground mb-1 mt-0">Campaign name</label>
              <p className="text-xs text-muted-foreground mb-3">Stored locally with your claim packages.</p>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g., Q1 Payroll"
                className="w-full rounded-xl border border-white/5 bg-black/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition"
              />
            </div>
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          </header>
        </section>

        {/* Section 2 — Roster */}
        <section className="rounded-3xl border border-white/5 bg-[#151828]/80 pt-0 px-6 pb-6 sm:px-8 sm:pb-8">
          <header className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground m-0">
              Roster
            </h2>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCsvModalOpen(true)}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Paste CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRows((prev) => [...prev, { recipient: '', amount: '' }])}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add row
              </Button>
            </div>
          </header>

          <div className="rounded-2xl border border-white/5 bg-black/20 p-4 sm:p-5">
            <RosterEditor rows={rows} onChange={setRows} />
          </div>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">{roster.length}</span> recipient{roster.length === 1 ? '' : 's'}
              <span className="mx-2 text-white/20">•</span>
              <span className="text-foreground font-medium">{totalAmount.toLocaleString()}</span> pMTT total
            </div>
            <Button
              type="button"
              disabled={roster.length === 0 || isDeploying}
              onClick={() => onDeploy({ roster, campaignName })}
              className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6"
            >
              <Rocket className="h-4 w-4" />
              {isDeploying ? 'Deploying…' : 'Deploy payroll'}
            </Button>
          </div>

          {!canDeploy && (
            <p className="mt-3 text-xs text-muted-foreground">
              Deploying will unlock private access first.
            </p>
          )}
        </section>
      </div>

      <RosterCsvModal open={isCsvModalOpen} onClose={() => setIsCsvModalOpen(false)} onApply={setRows} />
    </>
  )
}
