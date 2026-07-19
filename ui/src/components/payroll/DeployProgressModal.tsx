import { InlineError } from '../InlineError'
import { Button } from '../ui/button'
import { Modal } from '../ui/modal'

export function DeployProgressModal({
  open,
  onClose,
  stages,
  isPending,
  error,
}: {
  open: boolean
  onClose: () => void
  stages: string[]
  isPending: boolean
  error: Error | null
}) {
  return (
    <Modal open={open} onClose={onClose} title="Deploying Payroll">
      {/* Always dismissable — closing this view doesn't cancel the mutation, which
          keeps running in the background either way. Locking it to "done only" trapped
          the user with no way out if a step ever hung (e.g. an unanswered wallet network
          switch prompt), since isPending would then never turn false. */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {stages.map((s, i) => (
          <li key={i} style={{ opacity: i === stages.length - 1 && isPending ? 1 : 0.6 }}>
            {i === stages.length - 1 && isPending ? '⏳' : '✓'} {s}
          </li>
        ))}
      </ul>
      {error && <InlineError style={{ marginTop: '0.75rem' }}>{error.message}</InlineError>}
      {!isPending && (
        <Button type="button" className="mt-4" onClick={onClose}>
          Close
        </Button>
      )}
    </Modal>
  )
}
