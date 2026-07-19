import { parseUnits, type Hex } from 'viem'
import { PTOKEN_DECIMALS } from './format'
import type { RosterEntry } from './merkle'

export type RosterRow = { recipient: string; amount: string }

export function parseCsv(text: string): RosterRow[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [recipient, amount] = line.split(',').map((s) => s.trim())
      return { recipient: recipient ?? '', amount: amount ?? '' }
    })
}

export function toRoster(rows: RosterRow[]): RosterEntry[] {
  return rows.map((row, index) => ({
    index,
    recipient: row.recipient as Hex,
    amount: parseUnits(row.amount || '0', PTOKEN_DECIMALS),
  }))
}
