"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import AuthPrompt from "@/components/AuthPrompt";
import CampaignStatusBadge from "@/components/campaigns/CampaignStatusBadge";
import PlacementBoard from "@/components/placements/PlacementBoard";
import { Card } from "@/components/ui";
import {
  authenticatedFetch,
  ClientApiError,
} from "@/lib/api/authenticated-fetch";
import {
  formatCampaignDate,
  formatOptionalCampaignBudget,
  formatOptionalCampaignDate,
  formatOptionalPlacements,
  notSetLabel,
} from "@/lib/campaigns/format";
import type { CampaignDto, CampaignResponse } from "@/lib/campaigns/types";

type CampaignLoadState = {
  scope: string | null;
  campaign: CampaignDto | null;
  loading: boolean;
  error: string | null;
};

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">{label}</p>
      <div className="mt-1.5 text-[14px] font-semibold">{children}</div>
    </div>
  );
}

function EditCampaignForm({
  campaign,
  requestScope,
  getAccessToken,
  onCancel,
  onSaved,
}: {
  campaign: CampaignDto;
  requestScope: string;
  getAccessToken: () => Promise<string | null>;
  onCancel: () => void;
  onSaved: (campaign: CampaignDto, requestScope: string) => void;
}) {
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const [form, setForm] = useState({
    name: campaign.name,
    briefText: campaign.briefText,
    placementCount: campaign.placementCount?.toString() ?? "",
    budgetLimit: campaign.budgetLimit ?? "",
    destinationUrl: campaign.destinationUrl ?? "",
    deadline: campaign.deadline ? toLocalDateTime(campaign.deadline) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelSave = useCallback(() => {
    ++requestSequence.current;
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  useEffect(() => cancelSave, [requestScope, cancelSave]);

  function setField(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const scope = requestScope;
    const sequence = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setSaving(true);
    setError(null);

    try {
      const response = await authenticatedFetch<CampaignResponse>(
        getAccessToken,
        `/api/campaigns/${campaign.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // Only send fields the brand actually filled in. A draft may still be
          // incomplete, and empty strings would fail validation.
          body: JSON.stringify({
            name: form.name,
            briefText: form.briefText,
            ...(form.placementCount.trim()
              ? { placementCount: Number(form.placementCount) }
              : {}),
            ...(form.budgetLimit.trim()
              ? { budgetLimit: form.budgetLimit.trim() }
              : {}),
            ...(form.destinationUrl.trim()
              ? { destinationUrl: form.destinationUrl.trim() }
              : {}),
            ...(form.deadline.trim()
              ? { deadline: new Date(form.deadline).toISOString() }
              : {}),
          }),
          signal: controller.signal,
        },
      );

      if (controller.signal.aborted || sequence !== requestSequence.current) {
        return;
      }

      onSaved(response.campaign, scope);
    } catch (caught) {
      if (controller.signal.aborted || sequence !== requestSequence.current) {
        return;
      }

      setError(
        caught instanceof ClientApiError
          ? caught.message
          : "Could not update this campaign.",
      );
    } finally {
      if (sequence === requestSequence.current) {
        requestController.current = null;
        setSaving(false);
      }
    }
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-medium outline-none focus:border-muted";

  return (
    <Card className="overflow-hidden">
      <form onSubmit={save}>
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-[16px] font-bold">Edit draft</h2>
          <p className="text-[12.5px] text-muted">Draft fields remain editable until quote approval.</p>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-[12.5px] font-semibold text-muted">Campaign name</span>
            <input className={inputClass} value={form.name} onChange={(event) => setField("name", event.target.value)} required />
          </label>
          <label className="sm:col-span-2">
            <span className="text-[12.5px] font-semibold text-muted">Original brief</span>
            <textarea className={`${inputClass} resize-none`} rows={3} value={form.briefText} onChange={(event) => setField("briefText", event.target.value)} required />
          </label>
          <label>
            <span className="text-[12.5px] font-semibold text-muted">Placements</span>
            <input className={inputClass} type="number" min="1" max="1000" value={form.placementCount} onChange={(event) => setField("placementCount", event.target.value)} required />
          </label>
          <label>
            <span className="text-[12.5px] font-semibold text-muted">Budget (USD)</span>
            <input className={inputClass} inputMode="decimal" value={form.budgetLimit} onChange={(event) => setField("budgetLimit", event.target.value)} />
          </label>
          <label>
            <span className="text-[12.5px] font-semibold text-muted">Deadline</span>
            <input className={inputClass} type="datetime-local" value={form.deadline} onChange={(event) => setField("deadline", event.target.value)} />
          </label>
          <label className="sm:col-span-2">
            <span className="text-[12.5px] font-semibold text-muted">Destination URL</span>
            <input className={inputClass} value={form.destinationUrl} onChange={(event) => setField("destinationUrl", event.target.value)} />
          </label>
        </div>
        <p className="border-t border-line px-6 py-3 text-[12px] text-faint">
          Campaign area is set in the location steps of the campaign wizard.
        </p>
        {error ? <p className="border-t border-fail/20 bg-fail/5 px-6 py-3 text-[12.5px] text-fail">{error}</p> : null}
        <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
          <button type="button" onClick={onCancel} className="h-10 rounded-xl border border-line px-4 text-[13px] font-semibold hover:bg-raised">Cancel</button>
          <button disabled={saving} className="h-10 rounded-xl bg-solid px-4 text-[13px] font-semibold text-solid-ink disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </Card>
  );
}

export default function CampaignDetails({ campaignId }: { campaignId: string }) {
  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
  const userId = ready && authenticated ? user?.id ?? null : null;
  const requestScope = userId ? `${userId}:${campaignId}` : null;
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const [loadState, setLoadState] = useState<CampaignLoadState>({
    scope: null,
    campaign: null,
    loading: true,
    error: null,
  });
  const [editingScope, setEditingScope] = useState<string | null>(null);

  const cancelRequest = useCallback(() => {
    ++requestSequence.current;
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  const loadCampaign = useCallback(async () => {
    if (!requestScope) return;

    const scope = requestScope;
    const sequence = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;

    setLoadState((previous) => ({
      scope,
      campaign: previous.scope === scope ? previous.campaign : null,
      loading: true,
      error: null,
    }));

    try {
      const response = await authenticatedFetch<CampaignResponse>(
        getAccessToken,
        `/api/campaigns/${campaignId}`,
        { signal: controller.signal },
      );

      if (controller.signal.aborted || sequence !== requestSequence.current) {
        return;
      }

      setLoadState({
        scope,
        campaign: response.campaign,
        loading: false,
        error: null,
      });
    } catch (caught) {
      if (controller.signal.aborted || sequence !== requestSequence.current) {
        return;
      }

      setLoadState((previous) => ({
        scope,
        campaign: previous.scope === scope ? previous.campaign : null,
        loading: false,
        error:
          caught instanceof Error ? caught.message : "Could not load campaign.",
      }));
    } finally {
      if (sequence === requestSequence.current) {
        requestController.current = null;
      }
    }
  }, [campaignId, getAccessToken, requestScope]);

  useEffect(() => {
    setEditingScope(null);

    if (!ready) return;

    if (!authenticated || !requestScope) {
      cancelRequest();
      setLoadState({
        scope: null,
        campaign: null,
        loading: false,
        error: null,
      });
      return;
    }

    void loadCampaign();
    return cancelRequest;
  }, [
    ready,
    authenticated,
    requestScope,
    loadCampaign,
    cancelRequest,
  ]);

  const currentState: CampaignLoadState =
    requestScope && loadState.scope === requestScope
      ? loadState
      : {
          scope: requestScope,
          campaign: null,
          loading: !ready || Boolean(requestScope),
          error: null,
        };
  const { campaign, loading, error } = currentState;
  const editing = Boolean(requestScope && editingScope === requestScope);

  if (!ready || loading) {
    return <div className="h-96 animate-pulse rounded-[20px] bg-raised" />;
  }

  if (!authenticated) {
    return <AuthPrompt onSignIn={() => void login()} />;
  }

  if (!requestScope || error || !campaign) {
    return (
      <Card className="px-6 py-10 text-center">
        <h1 className="text-[20px] font-bold">Campaign unavailable</h1>
        <p className="mt-2 text-[13.5px] text-muted">{error ?? "Campaign not found."}</p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href="/brand" className="h-10 rounded-xl border border-line px-4 py-2.5 text-[13px] font-semibold">Back to campaigns</Link>
          {requestScope ? (
            <button onClick={() => void loadCampaign()} className="h-10 rounded-xl bg-solid px-4 text-[13px] font-semibold text-solid-ink">Try again</button>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/brand" className="text-[12.5px] font-semibold text-muted hover:text-ink">← All campaigns</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[34px] font-extrabold leading-tight tracking-[-0.03em]">{campaign.name}</h1>
              <CampaignStatusBadge status={campaign.status} />
            </div>
            <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-muted">{campaign.briefText}</p>
          </div>
          {campaign.status === "DRAFT" ? (
            <button
              onClick={() => setEditingScope(editing ? null : requestScope)}
              className="h-10 rounded-xl border border-line px-4 text-[13px] font-semibold hover:bg-raised"
            >
              {editing ? "Close editor" : "Edit draft"}
            </button>
          ) : null}
        </div>
      </div>

      {editing ? (
        <EditCampaignForm
          key={requestScope}
          campaign={campaign}
          requestScope={requestScope}
          getAccessToken={getAccessToken}
          onCancel={() => setEditingScope(null)}
          onSaved={(updated, savedScope) => {
            if (savedScope !== requestScope) return;

            setLoadState((previous) =>
              previous.scope === savedScope
                ? { ...previous, campaign: updated }
                : previous,
            );
            setEditingScope(null);
          }}
        />
      ) : null}

      <Card gradient className="p-6 sm:p-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Placement plan">{formatOptionalPlacements(campaign.placementCount)}</Detail>
          <Detail label="Area">{campaign.areaLabel ?? notSetLabel}</Detail>
          <Detail label="Budget limit">{formatOptionalCampaignBudget(campaign.budgetLimit, campaign.currency)}</Detail>
          <Detail label="Deadline">{formatOptionalCampaignDate(campaign.deadline, true)}</Detail>
        </div>
        <div className="mt-7 border-t border-line pt-6">
          <Detail label="Scan destination">
            {campaign.destinationUrl ? (
              <a href={campaign.destinationUrl} target="_blank" rel="noreferrer" className="break-all text-badge hover:underline">{campaign.destinationUrl}</a>
            ) : (
              <span className="text-muted">{notSetLabel}</span>
            )}
          </Detail>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          ["Quote", "A deterministic campaign quote will appear here in Phase 2."],
          ["QR assets", "Unique printable assets are generated after quote approval."],
        ].map(([title, body]) => (
          <Card key={title} className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-bold">{title}</h2>
              <span className="rounded-full bg-raised px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint">Next phase</span>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{body}</p>
          </Card>
        ))}
      </div>

      <PlacementBoard campaignId={campaign.id} funded={campaign.fundedAt !== null} />

      <p className="text-[11.5px] text-faint">Created {formatCampaignDate(campaign.createdAt, true)} · Last updated {formatCampaignDate(campaign.updatedAt, true)}</p>
    </div>
  );
}
