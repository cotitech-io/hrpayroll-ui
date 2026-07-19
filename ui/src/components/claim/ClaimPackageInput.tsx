import { useEffect, useState } from 'react'
import { parseClaimPackage, type ClaimPackage } from '../../lib/claimPackage'
import { InlineError } from '../InlineError'

/** Paste-a-claim-package textarea; emits the parsed package (or null) upward. */
export function ClaimPackageInput({
  value,
  onChange,
}: {
  /** Controlled textarea text (e.g. after Copy from the campaign modal). */
  value?: string
  onChange: (pkg: ClaimPackage | null, raw?: string) => void
}) {
  const [text, setText] = useState(value ?? '')
  const [parseError, setParseError] = useState<string | null>(null)

  useEffect(() => {
    if (value !== undefined && value !== text) {
      setText(value)
      if (!value.trim()) {
        setParseError(null)
        return
      }
      try {
        parseClaimPackage(value)
        setParseError(null)
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e))
      }
    }
  }, [value])

  function handleChange(next: string) {
    setText(next)
    if (!next.trim()) {
      onChange(null, next)
      setParseError(null)
      return
    }
    try {
      onChange(parseClaimPackage(next), next)
      setParseError(null)
    } catch (e) {
      onChange(null, next)
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
