import { createPublicClient, http, type AbiEvent, type Log } from 'viem'
import { avalancheFuji } from 'viem/chains'

// Public RPC endpoints commonly cap eth_getLogs at a fixed block range, and the cap varies
// a lot by chain — confirmed by testing the actual endpoints, not assumed: Sepolia's allows
// 50,000, Avalanche Fuji's only 2,048. Use a size safe for the smallest known cap.
const CHUNK_SIZE = 2_000n
// How many chunk requests to run concurrently. Avalanche's public Fuji RPC rate-limits
// aggressively (429s often surface in the browser as CORS failures). Keep this low.
const CONCURRENCY = 3

// A dedicated client on Avalanche's own public Fuji RPC, deliberately not the wagmi client
// wired up by @coti-io/coti-wallet-plugin — its Fuji transport falls back to
// avalanche-fuji-c-chain-rpc.publicnode.com when the primary (QuickNode) hiccups, and
// publicnode's free tier rejects eth_getLogs outright ("archive requests require a personal
// token"). There's no config option to override the plugin's Fuji RPC, so log scans use this
// client instead of whatever `usePublicClient` hands back.
const logsClient = createPublicClient({
  chain: avalancheFuji,
  transport: http('https://api.avax-test.network/ext/bc/C/rpc'),
})

export async function getLogsChunked<TEvent extends AbiEvent>(
  params: {
    address: `0x${string}`
    event: TEvent
    lookback?: bigint
  },
): Promise<Log[]> {
  const { address, event, lookback = 100_000n } = params
  const publicClient = logsClient
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
