import { useState } from 'react'
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

  return (
    <>
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="font-bold" style={{ marginTop: 0 }}>Add Payroll</h2>

        <label>
          <input
            type="text"
            style={{ width: '100%' }}
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="Payroll name"
          />
        </label>

        <h2 style={{ marginTop: '2rem' }}>Roster</h2>
        <div className="bg-card border border-border rounded-lg p-4">
          <RosterEditor rows={rows} onChange={setRows} />
          <div className="flex gap-2 mt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRows((prev) => [...prev, { recipient: '', amount: '' }])}
            >
              Add row
            </Button>
            <Button type="button" variant="secondary" onClick={() => setIsCsvModalOpen(true)}>
              Paste CSV
            </Button>
            <Button
              type="button"
              disabled={!canDeploy || roster.length === 0 || isDeploying}
              onClick={() => onDeploy({ roster, campaignName })}
            >
              {isDeploying ? 'Deploying…' : 'Deploy Payroll'}
            </Button>
          </div>
        </div>
      </div>

      <RosterCsvModal open={isCsvModalOpen} onClose={() => setIsCsvModalOpen(false)} onApply={setRows} />
    </>
  )
}
