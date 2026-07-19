import { useState } from 'react'
import { parseUnits, type Hex } from 'viem'
import { useAccount, useReadContract } from 'wagmi'
import { usePrivateUnlock } from '@coti-io/coti-wallet-plugin'
import { Button } from '../components/ui/button'
import { Modal } from '../components/ui/modal'
import { cotiTestnetContracts, COTI_TESTNET_CHAIN_ID } from '../config/contracts'
import { useCreateCampaign, type CreateCampaignResult } from '../hooks/useCreateCampaign'
import { useEmployerCampaigns, type EmployerCampaign } from '../hooks/useEmployerCampaigns'
import { useFundCampaign } from '../hooks/useFundCampaign'
import { downloadClaimPackage, toClaimPackage, withFacadeAddress } from '../lib/claimPackage'
import type { RosterEntry } from '../lib/merkle'

// pMTT uses 18 decimals — see EmployeePage's pToken balance comment.
const PTOKEN_DECIMALS = 18
const DEFAULT_FACADE_ETH_TOPUP_WEI = 100_000_000_000_000_000n // 0.1 AVAX reserve for the facade's own future inbox fees (ack/clawback round trips).

type RosterRow = { recipient: string; amount: string }

function parseCsv(text: string): RosterRow[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [recipient, amount] = line.split(',').map((s) => s.trim())
      return { recipient: recipient ?? '', amount: amount ?? '' }
    })
}

function toRoster(rows: RosterRow[]): RosterEntry[] {
  return rows.map((row, index) => ({
    index,
    recipient: row.recipient as Hex,
    amount: parseUnits(row.amount || '0', PTOKEN_DECIMALS),
  }))
}

function PreviousCampaigns() {
  const { data: campaigns, isLoading, error } = useEmployerCampaigns()
  const [fundingFor, setFundingFor] = useState<EmployerCampaign | null>(null)
  const [exportingFor, setExportingFor] = useState<EmployerCampaign | null>(null)
  const [fundAmount, setFundAmount] = useState('')
  const [fundStage, setFundStage] = useState<string | null>(null)
  const fundCampaign = useFundCampaign(setFundStage)

  if (isLoading) return <p style={{ opacity: 0.7 }}>Loading your previous campaigns…</p>
  if (error) return <p style={{ color: 'crimson' }}>{(error as Error).message}</p>
  if (!campaigns || campaigns.length === 0) return null

  return (
    <div className="bg-card border border-border rounded-lg p-4" style={{ marginBottom: '2rem' }}>
      <h2 className="font-bold" style={{ marginTop: 0, marginBottom: '1rem' }}>List Payroll</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Run ID</th>
            <th style={{ textAlign: 'left' }}>Name</th>
            <th style={{ textAlign: 'left' }}>Facade</th>
            <th style={{ textAlign: 'left' }}>Status</th>
            <th style={{ textAlign: 'left' }}>Funded</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.facadeAddress}>
              <td>{c.runId.toString()}</td>
              <td>{c.campaignName}</td>
              <td>
                <a
                  href={`https://testnet.snowtrace.io/address/${c.facadeAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {c.facadeAddress.slice(0, 6)}…{c.facadeAddress.slice(-4)}
                </a>
              </td>
              <td>{c.hasExpired ? 'Expired' : 'Active'}</td>
              <td>{c.hasReceivedFunds ? 'Funded' : 'Not funded'}</td>
              <td>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFundAmount('')
                      setFundingFor(c)
                    }}
                  >
                    Fund
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={c.packages.length === 0}
                    title={c.packages.length === 0 ? 'Claim packages are only available in the browser that created this campaign.' : undefined}
                    onClick={() => setExportingFor(c)}
                  >
                    Export
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal
        open={!!fundingFor}
        onClose={() => setFundingFor(null)}
        title={`Fund ${fundingFor?.campaignName ?? ''}`}
      >
        <label>
          Amount (pMTT)
          <input
            type="text"
            style={{ width: '100%' }}
            value={fundAmount}
            onChange={(e) => setFundAmount(e.target.value)}
            placeholder="2500"
          />
        </label>
        <Button
          type="button"
          className="mt-2"
          disabled={!fundAmount.trim() || fundCampaign.isPending}
          onClick={() => {
            if (!fundingFor) return
            fundCampaign.mutate(
              {
                facadeAddress: fundingFor.facadeAddress,
                amount: parseUnits(fundAmount || '0', PTOKEN_DECIMALS),
                facadeEthTopUpWei: DEFAULT_FACADE_ETH_TOPUP_WEI,
              },
              { onSuccess: () => setFundingFor(null) },
            )
          }}
        >
          {fundCampaign.isPending ? 'Funding…' : 'Fund campaign'}
        </Button>
        {fundCampaign.isPending && fundStage && <p style={{ opacity: 0.7 }}>{fundStage}</p>}
        {fundCampaign.error && <p style={{ color: 'crimson' }}>{(fundCampaign.error as Error).message}</p>}
      </Modal>

      <Modal
        open={!!exportingFor}
        onClose={() => setExportingFor(null)}
        title={`Claim packages — ${exportingFor?.campaignName ?? ''}`}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Index</th>
              <th style={{ textAlign: 'left' }}>Recipient</th>
              <th style={{ textAlign: 'left' }}>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {exportingFor?.packages.map((pkg) => (
              <tr key={pkg.index}>
                <td>{pkg.index}</td>
                <td>{pkg.recipient}</td>
                <td>{(Number(pkg.amount) / 10 ** PTOKEN_DECIMALS).toLocaleString()}</td>
                <td>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadClaimPackage(withFacadeAddress(pkg, exportingFor.facadeAddress), exportingFor.campaignName)
                    }
                  >
                    Download
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    </div>
  )
}

// Campaign creation on Fuji is permissionless via the factory, but registering the roster on
// COTI (registerRun/registerLeaf) is still onlyOwner on PrivatePayrollCoti — that owner is the
// effective gate now, not the vault owner.
function CampaignOwnerCheck() {
  const { address } = useAccount()
  const { data: owner } = useReadContract({
    ...cotiTestnetContracts.privatePayrollCoti,
    functionName: 'owner',
    chainId: COTI_TESTNET_CHAIN_ID,
  })
  if (!owner || !address) return null
  if (owner.toLowerCase() === address.toLowerCase()) return null
  return (
    <p style={{ color: 'crimson' }}>
      Connected wallet is not the PrivatePayrollCoti owner ({owner}). Campaign creation will fail at the
      COTI roster-registration step until you connect that wallet.
    </p>
  )
}

export function EmployerPage() {
  const { isConnected } = useAccount()
  const { isUnlocked } = usePrivateUnlock()

  const [rows, setRows] = useState<RosterRow[]>([{ recipient: '', amount: '' }])
  const [csvText, setCsvText] = useState('')
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [campaignName, setCampaignName] = useState('Q1 Payroll')
  const [fundAmount, setFundAmount] = useState('')
  const [fundStage, setFundStage] = useState<string | null>(null)
  const [result, setResult] = useState<CreateCampaignResult | null>(null)
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false)
  const [deployStages, setDeployStages] = useState<string[]>([])

  const createCampaign = useCreateCampaign((s) => setDeployStages((prev) => [...prev, s]))
  const fundCampaign = useFundCampaign(setFundStage)

  function updateRow(i: number, field: keyof RosterRow, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, { recipient: '', amount: '' }])
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  function applyCsv() {
    const parsed = parseCsv(csvText)
    if (parsed.length > 0) setRows(parsed)
  }

  const roster = toRoster(rows.filter((r) => r.recipient.trim() && r.amount.trim()))
  const totalAmount = roster.reduce((sum, e) => sum + e.amount, 0n)

  if (!isConnected) {
    return (
      <div>
        <p>Connect a wallet to create or fund a payroll.</p>
      </div>
    )
  }

  return (
    <div>
      <CampaignOwnerCheck />

      <PreviousCampaigns />

      {!result && (
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
                          style={{ width: '100%' }}
                          value={row.recipient}
                          onChange={(e) => updateRow(i, 'recipient', e.target.value)}
                          placeholder="0x…"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          style={{ width: '100%' }}
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
                          onClick={() => removeRow(i)}
                          disabled={rows.length === 1}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-2 mt-2">
                <Button type="button" variant="secondary" onClick={addRow}>
                  Add row
                </Button>
                <Button type="button" variant="secondary" onClick={() => setIsCsvModalOpen(true)}>
                  Paste CSV
                </Button>
                <Button
                  type="button"
                  disabled={!isUnlocked || roster.length === 0 || createCampaign.isPending}
                  onClick={() => {
                    setDeployStages([])
                    setIsDeployModalOpen(true)
                    createCampaign.mutate(
                      { roster, campaignName },
                      { onSuccess: (data) => setResult(data) },
                    )
                  }}
                >
                  {createCampaign.isPending ? 'Deploying…' : 'Deploy Payroll'}
                </Button>
              </div>
            </div>
          </div>

          <Modal open={isCsvModalOpen} onClose={() => setIsCsvModalOpen(false)} title="Paste CSV">
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
                applyCsv()
                setIsCsvModalOpen(false)
              }}
              className="mt-2"
            >
              Load CSV into roster
            </Button>
          </Modal>

          <Modal
            open={isDeployModalOpen}
            onClose={() => setIsDeployModalOpen(false)}
            title="Deploying Payroll"
          >
            {/* Always dismissable — closing this view doesn't cancel the mutation, which
                keeps running in the background either way. Locking it to "done only" trapped
                the user with no way out if a step ever hung (e.g. an unanswered wallet network
                switch prompt), since isPending would then never turn false. */}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {deployStages.map((s, i) => (
                <li
                  key={i}
                  style={{ opacity: i === deployStages.length - 1 && createCampaign.isPending ? 1 : 0.6 }}
                >
                  {i === deployStages.length - 1 && createCampaign.isPending ? '⏳' : '✓'} {s}
                </li>
              ))}
            </ul>
            {createCampaign.error && (
              <p style={{ color: 'crimson', marginTop: '0.75rem' }}>{(createCampaign.error as Error).message}</p>
            )}
            {!createCampaign.isPending && (
              <Button type="button" className="mt-4" onClick={() => setIsDeployModalOpen(false)}>
                Close
              </Button>
            )}
          </Modal>
        </>
      )}

      {result && (
        <div>
          <h2>Campaign deployed</h2>
          <dl>
            <dt>Facade address</dt>
            <dd>{result.facadeAddress}</dd>
            <dt>Run ID</dt>
            <dd>{result.runId.toString()}</dd>
            <dt>Merkle root</dt>
            <dd>{result.tree.root}</dd>
          </dl>

          <h2>3. Fund campaign</h2>
          <label>
            Amount (pMTT)
            <input
              type="text"
              style={{ width: '100%' }}
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              placeholder={(Number(totalAmount) / 10 ** PTOKEN_DECIMALS).toString()}
            />
          </label>
          <Button
            type="button"
            disabled={!isUnlocked || !fundAmount.trim() || fundCampaign.isPending}
            onClick={() =>
              fundCampaign.mutate({
                facadeAddress: result.facadeAddress,
                amount: parseUnits(fundAmount || '0', PTOKEN_DECIMALS),
                facadeEthTopUpWei: DEFAULT_FACADE_ETH_TOPUP_WEI,
              })
            }
          >
            {fundCampaign.isPending ? 'Funding…' : 'Fund campaign'}
          </Button>
          {fundCampaign.isPending && fundStage && <p style={{ opacity: 0.7 }}>{fundStage}</p>}
          {fundCampaign.error && <p style={{ color: 'crimson' }}>{(fundCampaign.error as Error).message}</p>}
          {fundCampaign.isSuccess && <p style={{ color: 'green' }}>Facade funded.</p>}

          <h2>4. Export claim packages</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Index</th>
                <th style={{ textAlign: 'left' }}>Recipient</th>
                <th style={{ textAlign: 'left' }}>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {result.tree.packages.map((pkg) => (
                <tr key={pkg.index}>
                  <td>{pkg.index}</td>
                  <td>{pkg.recipient}</td>
                  <td>{(Number(pkg.amount) / 10 ** PTOKEN_DECIMALS).toLocaleString()}</td>
                  <td>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadClaimPackage(toClaimPackage(pkg, result.facadeAddress), campaignName)
                      }
                    >
                      Download
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Button type="button" variant="secondary" onClick={() => setResult(null)} className="mt-4">
            Start another campaign
          </Button>
        </div>
      )}
    </div>
  )
}
