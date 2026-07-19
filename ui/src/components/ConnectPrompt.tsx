/** Empty state shown when no wallet is connected. */
export function ConnectPrompt({ message }: { message: string }) {
  return (
    <div>
      <p>{message}</p>
    </div>
  )
}
