import Link from "next/link";

export default function WorkerPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[620px] rounded-[24px] border border-line bg-surface px-6 py-12 text-center sm:px-10">
        <span className="inline-flex rounded-full border border-badge/40 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.1em] text-badge">Phase 3</span>
        <h1 className="mt-5 text-[34px] font-extrabold tracking-[-0.035em]">Worker Portal</h1>
        <p className="mx-auto mt-3 max-w-[46ch] text-[14px] leading-relaxed text-muted">The mobile installation and verification experience is intentionally deferred until campaign and QR foundations are complete.</p>
        <Link href="/" className="mt-7 inline-flex h-10 items-center rounded-xl border border-line px-4 text-[13.5px] font-semibold hover:bg-raised">← Back to StickerBomb</Link>
      </div>
    </main>
  );
}
