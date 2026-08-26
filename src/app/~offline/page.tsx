export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-[#0d0e10] text-zinc-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161719] p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-400">Offline</p>
        <h1 className="mt-3 text-2xl font-semibold">Connection required</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Reyo Pack can show its last safe queue snapshot, but the server must be reachable before a scan can be claimed or packed.
        </p>
      </section>
    </main>
  );
}
