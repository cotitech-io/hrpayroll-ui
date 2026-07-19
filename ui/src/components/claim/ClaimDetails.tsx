import type { ClaimPackage } from '../../lib/claimPackage'

export function ClaimDetails({
  pkg,
  alreadyClaimed,
}: {
  pkg: ClaimPackage
  alreadyClaimed: boolean | undefined
}) {
  return (
    <dl>
      <dt>Campaign facade</dt>
      <dd>{pkg.facadeAddress}</dd>
      <dt>Index</dt>
      <dd>{pkg.index}</dd>
      <dt>Recipient</dt>
      <dd>{pkg.recipient}</dd>
      <dt>Amount</dt>
      <dd>{pkg.amount}</dd>
      <dt>Already claimed?</dt>
      <dd>{String(alreadyClaimed ?? '—')}</dd>
    </dl>
  )
}
