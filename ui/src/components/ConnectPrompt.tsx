import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Zap, ArrowRight } from 'lucide-react'
import orbsBg from '../assets/connect-orbs-bg.jpg'

/** Empty state shown when no wallet is connected. Styled like a premium dark card
 *  with a 3D-style abstract background, a lightning-bolt icon, and a bottom
 *  action banner that opens the wallet connection modal. */
export function ConnectPrompt({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="relative overflow-hidden rounded-3xl border border-violet-500/25 bg-[#130d24] p-5 shadow-2xl shadow-violet-950/50">
        {/* 3D orbs background image (matches Sablier airdrop card) */}
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${orbsBg})` }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#130d24]/70" />

        <div className="relative flex flex-col">
          {/* Icon */}
          <div className="mb-10 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-xl backdrop-blur-md">
            <Zap className="h-8 w-8 fill-white text-white" />
          </div>

          {/* Bottom action banner */}
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-[#161225]/95 px-5 py-4 backdrop-blur-md">
            <p className="flex-1 text-base font-semibold leading-snug text-white sm:text-lg">
              {message}
            </p>
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => (
                <button
                  type="button"
                  onClick={openConnectModal}
                  disabled={!mounted}
                  aria-label="Connect wallet"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/30 transition-all hover:scale-105 hover:bg-violet-500 disabled:opacity-50"
                >
                  <ArrowRight className="h-5 w-5" />
                </button>
              )}
            </ConnectButton.Custom>
          </div>
        </div>
      </div>
    </div>
  )
}
