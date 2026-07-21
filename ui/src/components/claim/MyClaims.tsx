import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { parseUnits, type Hex } from 'viem'
import { Wallet, Hash, Calendar, Coins } from 'lucide-react'
import { InlineError } from '../InlineError'
import { Button } from '../ui/button'
import { AddressLink } from '../AddressLink'
import { useVaultCampaignRosters } from '../../hooks/useVaultCampaignRosters'
import { useClaimFlow } from '../../hooks/useClaimFlow'
import { buildClaimPackageForIndex } from '../../lib/claimPackage'
import { formatPMtt, PTOKEN_DECIMALS } from '../../lib/format'

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

function Chip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-300">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

/**
 * Primary employee claim UX — no JSON.
 * Card-grid layout matching /organization/runs.
 */
export function MyClaims({ unlocked }: { unlocked: boolean }) {
  const { address } = useAccount()
  const queryClient = useQueryClient()
  const rosters = useVaultCampaignRosters()
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [payoutTos, setPayoutTos] = useState<Record<string, string>>({})
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
      const payoutTo = (payoutTos[row.key] ?? '').trim()
      claim.mutate(
        {
          pkg,
          payoutTo: (payoutTo || undefined) as Hex | undefined,
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

  if (rosters.isLoading) {
    return <p className="text-sm text-slate-400">Looking up payrolls for your wallet…</p>
  }
  if (rosters.error) return <InlineError>{(rosters.error as Error).message}</InlineError>

  if (mine.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-[#151828] px-5 py-10 text-center text-sm text-slate-300">
        No payroll roster entries match <code className="text-slate-400">{address}</code> on this
        vault. Connect the wallet your organization registered, or ask them to confirm your address.
      </div>
    )
  }

  return (
    <>
      <div className="mb-4">
        <p className="text-sm text-slate-400">
          {mine.length} claim{mine.length === 1 ? '' : 's'} on{' '}
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
            Avalanche Fuji
          </span>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {mine.map((row) => {
          const human = amountFor(row)
          const blocked =
            !unlocked || row.hasClaimed || row.hasExpired || !row.funded || !human.trim()
          const isActive = activeKey === row.key && claim.isPending
          const progress = row.hasClaimed ? 100 : 0

          return (
            <div
              key={row.key}
              className="flex flex-col rounded-2xl border border-white/5 bg-[#151828] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
            >
              {/* Header */}
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/20 to-indigo-500/10 text-violet-300">
                  <Wallet className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Your claim</p>
                  <p className="mt-0.5 truncate text-lg font-semibold text-white">
                    {row.campaignName || `Run #${row.runId.toString()}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {row.hasClaimed ? (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
                      Claimed
                    </span>
                  ) : row.hasExpired ? (
                    <span className="rounded-full bg-slate-500/15 px-2.5 py-1 text-xs font-medium text-slate-300">
                      Expired
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
                      Active
                    </span>
                  )}
                  {row.funded ? (
                    <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-300">
                      Funded
                    </span>
                  ) : (
                    <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-medium text-orange-400">
                      Not funded
                    </span>
                  )}
                </div>
              </div>

              {/* Chips */}
              <div className="mt-5 flex flex-wrap gap-2">
                <Chip icon={<Hash className="h-3 w-3" />}>#{row.runId.toString()}</Chip>
                <Chip>
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                  Avalanche · Fuji
                </Chip>
                <Chip>
                  <AddressLink address={row.facadeAddress} />
                </Chip>
                <Chip icon={<Calendar className="h-3 w-3" />}>Index {row.index}</Chip>
                {row.knownAmount !== undefined && (
                  <Chip icon={<Coins className="h-3 w-3" />}>
                    {formatPMtt(row.knownAmount)} pMTT
                  </Chip>
                )}
              </div>

              {/* Inputs */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
                  Amount (pMTT)
                  <input
                    type="text"
                    className="rounded-xl border border-white/10 bg-[#0f1120] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/50 focus:outline-none disabled:opacity-50"
                    value={human}
                    disabled={row.hasClaimed}
                    onChange={(e) =>
                      setAmounts((prev) => ({ ...prev, [row.key]: e.target.value }))
                    }
                    placeholder="250"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
                  Payout address (optional)
                  <input
                    type="text"
                    className="rounded-xl border border-white/10 bg-[#0f1120] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/50 focus:outline-none disabled:opacity-50"
                    value={payoutTos[row.key] ?? ''}
                    disabled={row.hasClaimed}
                    onChange={(e) =>
                      setPayoutTos((prev) => ({ ...prev, [row.key]: e.target.value }))
                    }
                    placeholder="Leave blank for this wallet"
                  />
                </label>
              </div>

              {/* Bottom bar */}
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/5 bg-[#0f1120] p-3">
                <div className="min-w-0 flex-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    Claimed: <span className="font-semibold text-white">{progress}%</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl bg-orange-500 px-4 text-white hover:bg-orange-500/90"
                    disabled={blocked || claim.isPending}
                    onClick={() => handleClaim(row)}
                  >
                    {isActive ? 'Claiming…' : row.hasClaimed ? 'Claimed' : 'Claim'}
                  </Button>
                </div>
              </div>

              {/* Status messages */}
              <div className="mt-3 space-y-1 text-xs">
                {!row.funded && (
                  <p className="text-orange-400">Waiting for organization funding.</p>
                )}
                {row.hasExpired && !row.hasClaimed && (
                  <p className="text-orange-400">Campaign expired.</p>
                )}
                {!unlocked && (
                  <p className="text-slate-400">Unlock private access to claim.</p>
                )}
                {!human.trim() && !row.hasClaimed && (
                  <p className="text-slate-400">
                    Enter the amount your organization told you (must match the registered payroll).
                  </p>
                )}
                {isActive && stage && <p className="text-slate-400">{stage}</p>}
                {activeKey === row.key && localError && <InlineError>{localError}</InlineError>}
                {activeKey === row.key && claim.error && (
                  <InlineError>{(claim.error as Error).message}</InlineError>
                )}
                {activeKey === row.key && claim.data?.status === 'completed' && (
                  <p className="text-emerald-400">Claim completed.</p>
                )}
                {activeKey === row.key && claim.data?.status === 'pending' && (
                  <p className="text-orange-400">{claim.data.message}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
