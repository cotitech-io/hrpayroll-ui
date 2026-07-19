/** Empty state shown when no wallet is connected. */
export function ConnectPrompt({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
      <p className="text-sm text-slate-600">{message}</p>
    </div>
  )
}
