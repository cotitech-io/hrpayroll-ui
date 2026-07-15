import type { AbiEvent, Log, PublicClient } from 'viem'

// Public RPC endpoints commonly cap eth_getLogs at a fixed block range (this one at
// 50,000 — confirmed by testing against the actual endpoint, not assumed). Fetch backward
// from latest in chunks instead of a single unbounded call, stopping at `lookback` blocks
// or genesis, whichever comes first.
const CHUNK_SIZE = 50_000n

export async function getLogsChunked<TEvent extends AbiEvent>(
  publicClient: PublicClient,
  params: {
    address: `0x${string}`
    event: TEvent
    lookback?: bigint
  },
): Promise<Log[]> {
  const { address, event, lookback = 300_000n } = params
  const latest = await publicClient.getBlockNumber()
  const earliest = latest > lookback ? latest - lookback : 0n

  const logs: Log[] = []
  let toBlock = latest
  while (toBlock >= earliest) {
    const fromBlock = toBlock - CHUNK_SIZE + 1n > earliest ? toBlock - CHUNK_SIZE + 1n : earliest
    const chunk = await publicClient.getLogs({ address, event, fromBlock, toBlock })
    logs.push(...chunk)
    if (fromBlock === earliest) break
    toBlock = fromBlock - 1n
  }
  return logs
}
