import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { parseUnits, type Hex } from 'viem'
import { InlineError } from '../InlineError'
import { Button } from '../ui/button'
import { useVaultCampaignRosters } from '../../hooks/useVaultCampaignRosters'
import { useClaimFlow } from '../../hooks/useClaimFlow'
import { buildClaimPackageForIndex } from '../../lib/claimPackage'
import { formatPMtt, PTOKEN_DECIMALS, shortAddr } from '../../lib/format'

type MyClaimRow = {
  key: string
  runId: bigint
  facadeAddress: Hex
  campaignName: string
  hasExpired: boolean
  funded: boolean
  index: number
  recipient: Hex
  amountCommitment: Hex
  hasClaimed: boolean
  knownAmount?: string
  roster: Array<{ index: number; recipient: Hex; amountCommitment: Hex }>
}

/**
 * Primary employee claim UX — no JSON.
 * Wallet address finds your roster rows; proofs are rebuilt from on-chain commitments;
 * you only confirm the plaintext amount (salary) the organization registered for you.
 */
export function MyClaims({ unlocked }: { unlocked: boolean }) {
  const { address } = useAccount()
  const queryClient = useQueryClient()
  const rosters = useVaultCampaignRosters()
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [payoutTo, setPayoutTo] = useState('')
  const [stage, setStage] = useState<string | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const claim = useClaimFlow(setStage)

  const mine = useMemo((): MyClaimRow[] => {
    if (!address || !rosters.data) return []
    const out: MyClaimRow[] = []
    for (const c of rosters.data) {
      const roster = c.rows.map((r) => ({
        index: r.index,
        recipient: r.recipient,
        amountCommitment: r.amountCommitment,
      }))
      for (const row of c.rows) {
        if (row.recipient.toLowerCase() !== address.toLowerCase()) continue
        out.push({
          key: `${c.facadeAddress}-${row.index}`,
          runId: c.runId,
          facadeAddress: c.facadeAddress,
          campaignName: c.campaignName,
          hasExpired: c.hasExpired,
          funded: c.poolCreditedTotal > 0n,
          index: row.index,
          recipient: row.recipient,
          amountCommitment: row.amountCommitment,
          hasClaimed: row.hasClaimed,
          knownAmount: row.amount,
          roster,
        })
      }
    }
    return out
  }, [address, rosters.data])

  function amountFor(row: MyClaimRow): string {
    if (amounts[row.key] !== undefined) return amounts[row.key]
    if (row.knownAmount !== undefined) {
      return (Number(row.knownAmount) / 10 ** PTOKEN_DECIMALS).toString()
    }
    return ''
  }

  function handleClaim(row: MyClaimRow) {
    setActiveKey(row.key)
    setStage(null)
    setLocalError(null)
    const human = amountFor(row).trim()
    if (!human) {
      setLocalError('Enter your payroll amount (pMTT) before claiming.')
      return
    }
    try {
      const amount = parseUnits(human, PTOKEN_DECIMALS)
      const pkg = buildClaimPackageForIndex({
        facadeAddress: row.facadeAddress,
        roster: row.roster,
        index: row.index,
        amount,
      })
      claim.mutate(
        {
          pkg,
          payoutTo: (payoutTo.trim() || undefined) as Hex | undefined,
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vault-campaign-rosters'] })
          },
        },
      )
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    }
  }

  if (rosters.isLoading) return <p>Looking up payrolls for your wallet…</p>
  if (rosters.error) return <InlineError>{(rosters.error as Error).message}</InlineError>

  if (mine.length === 0) {
    return (
      <section style={{ margin: '1.25rem 0' }}>
        <h2 style={{ fontSize: '1.15rem' }}>Your claims</h2>
        <p style={{ opacity: 0.75 }}>
          No payroll roster entries match <code>{address}</code> on this vault. Connect the
          wallet your organization registered, or ask them to confirm your address.
        </p>
      </section>
    )
  }

  return (
    <section style={{ margin: '1.25rem 0' }}>
      <h2 style={{ fontSize: '1.15rem' }}>Your claims</h2>

      <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
        Send payout to a different address (optional)
        <input
          type="text"
          style={{ width: '100%' }}
          value={payoutTo}
          onChange={(e) => setPayoutTo(e.target.value)}
          placeholder="Leave blank to receive in this wallet"
        />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {mine.map((row) => {
          const human = amountFor(row)
          const blocked =
            !unlocked || row.hasClaimed || row.hasExpired || !row.funded || !human.trim()
          const isActive = activeKey === row.key && claim.isPending
          return (
            <div
              key={row.key}
              style={{
                border: '1px solid var(--border, #333)',
                borderRadius: 8,
                padding: '0.75rem 1rem',
              }}
            >
              <div style={{ fontWeight: 600 }}>{row.campaignName}</div>
              <div style={{ opacity: 0.75, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                runId {row.runId.toString()} · {shortAddr(row.facadeAddress)} · index {row.index}
                {row.funded ? ' · funded' : ' · not funded yet'}
                {row.hasExpired ? ' · expired' : ''}
                {row.hasClaimed ? ' · already claimed' : ''}
              </div>

              <label style={{ fontSize: '0.9rem' }}>
                Amount (pMTT)
                <input
                  type="text"
                  style={{ width: '8rem', display: 'block', marginTop: 4 }}
                  value={human}
                  disabled={row.hasClaimed}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [row.key]: e.target.value }))}
                  placeholder="250"
                />
              </label>
              {row.knownAmount !== undefined && (
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', opacity: 0.65 }}>
                  Known from this browser: {formatPMtt(row.knownAmount)} pMTT
                </p>
              )}

              <Button
                type="button"
                className="mt-2"
                disabled={blocked || claim.isPending}
                onClick={() => handleClaim(row)}
              >
                {isActive ? 'Claiming…' : row.hasClaimed ? 'Claimed' : 'Claim'}
              </Button>

              {!row.funded && (
                <p style={{ color: 'orange', fontSize: '0.85rem' }}>Waiting for organization funding.</p>
              )}
              {row.hasExpired && !row.hasClaimed && (
                <p style={{ color: 'orange', fontSize: '0.85rem' }}>Campaign expired.</p>
              )}
              {!unlocked && (
                <p style={{ fontSize: '0.85rem', opacity: 0.75 }}>Unlock private access to claim.</p>
              )}
              {!human.trim() && !row.hasClaimed && (
                <p style={{ fontSize: '0.85rem', opacity: 0.75 }}>
                  Enter the amount your organization told you (must match the registered payroll).
                </p>
              )}

              {isActive && stage && <p style={{ opacity: 0.75 }}>{stage}</p>}
              {activeKey === row.key && localError && <InlineError>{localError}</InlineError>}
              {activeKey === row.key && claim.error && (
                <InlineError>{(claim.error as Error).message}</InlineError>
              )}
              {activeKey === row.key && claim.data?.status === 'completed' && (
                <p style={{ color: 'green' }}>Claim completed.</p>
              )}
              {activeKey === row.key && claim.data?.status === 'pending' && (
                <p style={{ color: 'orange' }}>{claim.data.message}</p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
