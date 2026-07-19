import { shortAddr } from '../lib/format'

/** Shortened address linking to the Fuji Snowtrace explorer. */
export function AddressLink({ address }: { address: string }) {
  return (
    <a
      href={`https://testnet.snowtrace.io/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {shortAddr(address)}
    </a>
  )
}
