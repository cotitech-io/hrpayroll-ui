// pMTT uses 18 decimals; 256-bit ciphertext storage matches the ctUint256 balance type
// used throughout the payroll/pToken contracts.
export const PTOKEN_DECIMALS = 18

/** Display-format a raw pMTT amount (Number precision is fine at testnet scale). */
export function formatPMtt(raw: bigint | string): string {
  return (Number(raw) / 10 ** PTOKEN_DECIMALS).toLocaleString()
}
