"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { SelfieCheckCard } from "@/components/worker/SelfieCheckCard";
import { authenticatedFetch } from "@/lib/api/authenticated-fetch";

type Profile = {
  displayName: string;
  payoutAddress: string | null;
  primaryWalletAddress: string | null;
};

export default function WorkerProfile() {
  const { getAccessToken } = usePrivy();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "fail"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authenticatedFetch<Profile>(getAccessToken, "/api/worker/profile")
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setInput(data.primaryWalletAddress ?? "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  async function save(address: string | null) {
    setSaving(true);
    setNotice(null);
    try {
      const data = await authenticatedFetch<Profile>(getAccessToken, "/api/worker/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryWalletAddress: address }),
      });
      setProfile(data);
      setInput(data.primaryWalletAddress ?? "");
      setNotice({ tone: "ok", text: address ? "Primary wallet saved." : "Primary wallet removed." });
    } catch (caught) {
      setNotice({ tone: "fail", text: caught instanceof Error ? caught.message : "Could not save that address." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Profile</h1>
      <p className="mt-1.5 text-[14px] text-[var(--muted)]">{profile?.displayName ?? "Worker"}</p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--faint)]">Payout wallet</p>
          <p className="mt-1.5 font-mono text-[13px] text-[var(--muted)]">
            {profile?.payoutAddress ?? "Created on your first payout"}
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--faint)]">
            Every job you complete pays into this wallet. StickerBomb manages it for you.
          </p>
        </div>

        <div className="border-t border-[var(--line)] p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--faint)]">Primary wallet</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--faint)]">
            Your own wallet. Once set, everything in your payout wallet is sent here automatically every day at 7:00 AM UTC.
          </p>

          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="0x…"
            className="mt-3 h-11 w-full rounded-xl border border-[var(--line)] bg-transparent px-3.5 font-mono text-[13.5px] text-[var(--ink)] outline-none focus:border-[var(--ink)]"
          />

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={saving || input.trim() === (profile?.primaryWalletAddress ?? "")}
              onClick={() => void save(input.trim() || null)}
              className="h-10 flex-1 rounded-xl bg-[var(--solid)] text-[13.5px] font-semibold text-[var(--solid-ink)] disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save wallet"}
            </button>
            {profile?.primaryWalletAddress ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(null)}
                className="h-10 rounded-xl border border-[var(--line)] px-4 text-[13.5px] font-semibold text-[var(--muted)] disabled:opacity-40"
              >
                Remove
              </button>
            ) : null}
          </div>

          {notice ? (
            <p
              className={`mt-3 text-[12.5px] ${notice.tone === "ok" ? "text-[var(--good)]" : "text-[var(--bad)]"}`}
            >
              {notice.text}
            </p>
          ) : null}
        </div>

        <SelfieCheckCard />
      </div>
    </>
  );
}
