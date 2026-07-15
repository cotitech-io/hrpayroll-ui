import { useState } from 'react'
import { parseUnits, type Hex } from 'viem'
import { useAccount, useReadContract } from 'wagmi'
import { usePrivateUnlock } from '@coti-io/coti-wallet-plugin'
import { Button } from '../components/ui/button'
import { avaxContracts, AVAX_CHAIN_ID } from '../config/contracts'
import { useCreateCampaign, type CreateCampaignResult } from '../hooks/useCreateCampaign'
import { useFundCampaign } from '../hooks/useFundCampaign'
import { downloadClaimPackage } from '../lib/claimPackage'
import type { RosterEntry } from '../lib/merkle'

// pPUSD uses 6 decimals — see EmployeePage's pToken balance comment.
const PTOKEN_DECIMALS = 6
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

function VaultOwnerCheck() {
  const { address } = useAccount()
  const { data: owner } = useReadContract({
    ...avaxContracts.payrollVault,
    functionName: 'owner',
    chainId: AVAX_CHAIN_ID,
  })
  if (!owner || !address) return null
  if (owner.toLowerCase() === address.toLowerCase()) return null
  return (
    <p style={{ color: 'crimson' }}>
      Connected wallet is not the payroll vault owner ({owner}). Campaign creation will revert until you
      connect that wallet.
    </p>
  )
}

export function EmployerPage() {
  const { isConnected } = useAccount()
  const { isUnlocked } = usePrivateUnlock()

  const [rows, setRows] = useState<RosterRow[]>([{ recipient: '', amount: '' }])
  const [csvText, setCsvText] = useState('')
  const [campaignName, setCampaignName] = useState('Q1 Payroll')
  const [fundAmount, setFundAmount] = useState('')
  const [stage, setStage] = useState<string | null>(null)
  const [result, setResult] = useState<CreateCampaignResult | null>(null)

  const createCampaign = useCreateCampaign(setStage)
  const fundCampaign = useFundCampaign(setStage)

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
        <p>Connect a wallet to create or fund a payroll campaign.</p>
      </div>
    )
  }

  return (
    <div>
      <VaultOwnerCheck />

      {!result && (
        <>
          <label>
            Payroll Name
            <input
              type="text"
              style={{ width: '100%' }}
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
          </label>

          <h2 style={{ marginTop: '2rem' }}>Roster</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Index</th>
                <th style={{ textAlign: 'left' }}>Recipient address</th>
                <th style={{ textAlign: 'left' }}>Amount (pPUSD)</th>
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
          <Button type="button" variant="secondary" onClick={addRow} className="mt-2">
            Add row
          </Button>

          <details style={{ marginTop: '0.75rem' }}>
            <summary>Paste CSV instead (address,amount per line)</summary>
            <textarea
              rows={5}
              style={{ width: '100%', fontFamily: 'monospace', marginTop: '0.5rem' }}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'0xabc...,2500\n0xdef...,1800'}
            />
            <Button type="button" variant="secondary" onClick={applyCsv} className="mt-2">
              Load CSV into roster
            </Button>
          </details>

          <p>
            {roster.length} recipient(s), total {(Number(totalAmount) / 10 ** PTOKEN_DECIMALS).toLocaleString()}{' '}
            pPUSD
          </p>

          <Button
            type="button"
            disabled={!isUnlocked || roster.length === 0 || createCampaign.isPending}
            onClick={() =>
              createCampaign.mutate(
                { roster, campaignName },
                { onSuccess: (data) => setResult(data) },
              )
            }
          >
            {createCampaign.isPending ? 'Deploying…' : 'Deploy Payroll'}
          </Button>
          {createCampaign.isPending && stage && <p style={{ opacity: 0.7 }}>{stage}</p>}
          {createCampaign.error && <p style={{ color: 'crimson' }}>{(createCampaign.error as Error).message}</p>}
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
            Amount (pPUSD)
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
          {fundCampaign.isPending && stage && <p style={{ opacity: 0.7 }}>{stage}</p>}
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
                      onClick={() => downloadClaimPackage(pkg, campaignName)}
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
