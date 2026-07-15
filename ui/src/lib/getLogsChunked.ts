import type { AbiEvent, Log, PublicClient } from 'viem'

// Public RPC endpoints commonly cap eth_getLogs at a fixed block range, and the cap varies
// a lot by chain — confirmed by testing the actual endpoints, not assumed: Sepolia's allows
// 50,000, Avalanche Fuji's only 2,048. Use a size safe for the smallest known cap.
const CHUNK_SIZE = 2_000n
// How many chunk requests to run concurrently. Fuji's tiny cap means covering the same
// block-count lookback takes far more chunks than Sepolia; fetching them in parallel
// batches keeps wall-clock time reasonable instead of one request at a time.
const CONCURRENCY = 10

export async function getLogsChunked<TEvent extends AbiEvent>(
  publicClient: PublicClient,
  params: {
    address: `0x${string}`
    event: TEvent
    lookback?: bigint
  },
): Promise<Log[]> {
  const { address, event, lookback = 100_000n } = params
  const latest = await publicClient.getBlockNumber()
  const earliest = latest > lookback ? latest - lookback : 0n

  const ranges: { fromBlock: bigint; toBlock: bigint }[] = []
  let toBlock = latest
  while (toBlock >= earliest) {
    const fromBlock = toBlock - CHUNK_SIZE + 1n > earliest ? toBlock - CHUNK_SIZE + 1n : earliest
    ranges.push({ fromBlock, toBlock })
    if (fromBlock === earliest) break
    toBlock = fromBlock - 1n
  }

  const logs: Log[] = []
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = ranges.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(({ fromBlock, toBlock }) => publicClient.getLogs({ address, event, fromBlock, toBlock })),
    )
    for (const chunk of results) logs.push(...chunk)
  }
  return logs
}
