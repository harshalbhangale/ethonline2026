export const metadata = { title: "Offline · StickerBomb" };

export default function Offline() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col items-center justify-center gap-3 bg-[var(--bg)] px-7 text-center">
      <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">
        You are offline
      </h1>
      <p className="text-[14px] leading-relaxed text-[var(--muted)]">
        Your jobs and photos are safe. Reconnect and this screen will catch up on
        its own.
      </p>
    </div>
  );
}
