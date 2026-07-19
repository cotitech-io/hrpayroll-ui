import { useState } from 'react'
import { parseClaimPackage, type ClaimPackage } from '../../lib/claimPackage'
import { InlineError } from '../InlineError'

/** Paste-a-claim-package textarea; emits the parsed package (or null) upward. */
export function ClaimPackageInput({ onChange }: { onChange: (pkg: ClaimPackage | null) => void }) {
  const [text, setText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  function handleChange(value: string) {
    setText(value)
    if (!value.trim()) {
      onChange(null)
      setParseError(null)
      return
    }
    try {
      onChange(parseClaimPackage(value))
      setParseError(null)
    } catch (e) {
      onChange(null)
      setParseError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <label>
        Paste your claim package (JSON from your employer)
        <textarea
          rows={6}
          style={{ width: '100%', fontFamily: 'monospace' }}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder='{"facadeAddress":"0x...","index":0,"recipient":"0x...","amount":"2500","amountCommitment":"0x...","proof":["0x...",...]}'
        />
      </label>
      {parseError && <InlineError>{parseError}</InlineError>}
    </>
  )
}
