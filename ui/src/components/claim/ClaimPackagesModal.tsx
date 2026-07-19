import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { parseUnits, type Hex } from 'viem'
import { Modal } from '../ui/modal'
import { Button } from '../ui/button'
import { InlineError } from '../InlineError'
import type { VaultCampaignRoster } from '../../hooks/useVaultCampaignRosters'
import { saveCampaign } from '../../lib/campaignStorage'
import { copyClaimPackage, type ClaimPackage } from '../../lib/claimPackage'
import { formatPMtt, PTOKEN_DECIMALS, shortAddr } from '../../lib/format'

export function ClaimPackagesModal({
  campaign,
  onClose,
  onSelectPackage,
  highlightRecipient,
}: {
  campaign: VaultCampaignRoster | null
  onClose: () => void
  /** When set, Copy also hands the package to the parent (employee claim form). */
  onSelectPackage?: (pkg: ClaimPackage) => void
  highlightRecipient?: Hex
}) {
  const queryClient = useQueryClient()
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [amountDrafts, setAmountDrafts] = useState<Record<number, string>>({})
  const [applyError, setApplyError] = useState<string | null>(null)

  const missingAmounts = useMemo(
    () => (campaign ? campaign.rows.some((r) => r.amount === undefined) : false),
    [campaign],
  )

  if (!campaign) return null

  async function handleCopy(pkg: ClaimPackage) {
    setCopyError(null)
    try {
      await copyClaimPackage(pkg)
      setCopiedIndex(pkg.index)
      onSelectPackage?.(pkg)
    } catch (e) {
      setCopyError(e instanceof Error ? e.message : String(e))
    }
  }

  function handleApplyAmounts() {
    if (!campaign) return
    setApplyError(null)
    try {
      const packages = campaign.rows.map((row) => {
        const existing = row.amount
        const draft = amountDrafts[row.index]?.trim()
        const human = draft || (existing ? formatPMttRaw(existing) : '')
        if (!human) {
          throw new Error(`Enter an amount (pMTT) for index ${row.index}.`)
        }
        const amount = parseUnits(human, PTOKEN_DECIMALS)
        return {
          facadeAddress: campaign.facadeAddress,
          index: row.index,
          recipient: row.recipient,
          amount: amount.toString(),
          // Replaced from chain when the roster query rebuilds proofs.
          amountCommitment: row.amountCommitment,
          proof: [] as Hex[],
        }
      })
      saveCampaign({
        facadeAddress: campaign.facadeAddress,
        campaignName: campaign.campaignName,
        runId: campaign.runId.toString(),
        packages,
      })
      queryClient.invalidateQueries({ queryKey: ['vault-campaign-rosters'] })
      setAmountDrafts({})
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      open={!!campaign}
      onClose={onClose}
      title={`runId ${campaign.runId} (${shortAddr(campaign.facadeAddress)})`}
      width="720px"
    >
      <p style={{ marginTop: 0, opacity: 0.75, fontSize: '0.9rem' }}>
        {campaign.campaignName}
        {campaign.poolCreditedTotal > 0n ? ' · funded' : ' · not funded'}
        {campaign.hasExpired ? ' · expired' : ''}
      </p>
      <p style={{ opacity: 0.75, fontSize: '0.85rem' }}>
        Plaintext amounts are not on-chain. If this browser created or imported the campaign,
        Copy is enabled. Otherwise enter each amount (pMTT) and apply — proofs are rebuilt from
        on-chain commitments.
      </p>

      {missingAmounts && (
        <div style={{ marginBottom: '0.75rem' }}>
          <Button type="button" size="sm" onClick={handleApplyAmounts}>
            Apply amounts & rebuild packages
          </Button>
          {applyError && <InlineError>{applyError}</InlineError>}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.35rem 0.25rem' }}>Index</th>
            <th style={{ textAlign: 'left', padding: '0.35rem 0.25rem' }}>Recipient</th>
            <th style={{ textAlign: 'left', padding: '0.35rem 0.25rem' }}>Amount</th>
            <th style={{ textAlign: 'left', padding: '0.35rem 0.25rem' }}>hasClaimed</th>
            <th style={{ padding: '0.35rem 0.25rem' }} />
          </tr>
        </thead>
        <tbody>
          {campaign.rows.map((row) => {
            const mine =
              highlightRecipient &&
              row.recipient.toLowerCase() === highlightRecipient.toLowerCase()
            return (
              <tr
                key={row.index}
                style={{
                  background: mine ? 'color-mix(in srgb, var(--primary, #3b82f6) 12%, transparent)' : undefined,
                }}
              >
                <td style={{ padding: '0.4rem 0.25rem' }}>{row.index}</td>
                <td style={{ padding: '0.4rem 0.25rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {row.recipient}
                </td>
                <td style={{ padding: '0.4rem 0.25rem' }}>
                  {row.amount !== undefined ? (
                    `${formatPMtt(row.amount)} pMTT`
                  ) : (
                    <input
                      type="text"
                      placeholder="250"
                      value={amountDrafts[row.index] ?? ''}
                      onChange={(e) =>
                        setAmountDrafts((prev) => ({ ...prev, [row.index]: e.target.value }))
                      }
                      style={{ width: '6rem' }}
                    />
                  )}
                </td>
                <td style={{ padding: '0.4rem 0.25rem' }}>{String(row.hasClaimed)}</td>
                <td style={{ padding: '0.4rem 0.25rem', textAlign: 'right' }}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!row.package || row.hasClaimed}
                    onClick={() => row.package && handleCopy(row.package)}
                  >
                    {copiedIndex === row.index ? 'Copied' : 'Copy JSON'}
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {copyError && <InlineError>{copyError}</InlineError>}
      <p style={{ opacity: 0.65, fontSize: '0.8rem', marginBottom: 0 }}>
        Facade: <code>{campaign.facadeAddress}</code>
      </p>
    </Modal>
  )
}

/** formatPMtt for draft defaults uses locale grouping — avoid that when round-tripping. */
function formatPMttRaw(raw: string): string {
  return (Number(raw) / 10 ** PTOKEN_DECIMALS).toString()
}
