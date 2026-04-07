import { WifiSlash } from "@phosphor-icons/react/dist/ssr";

export default function OfflinePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-100">
        <WifiSlash size={32} className="text-amber-600" weight="bold" />
      </div>
      <h1 className="text-xl font-bold text-zinc-800">You&apos;re Offline</h1>
      <p className="text-sm text-zinc-500 max-w-xs">
        This page isn&apos;t available offline. Your queued photos will upload automatically when you reconnect.
      </p>
      <a
        href="/installer"
        className="mt-4 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white"
      >
        Go to Dashboard
      </a>
    </div>
  );
}
