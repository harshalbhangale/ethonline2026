"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import BriefStep, {
  type BriefStepValues,
} from "@/components/campaigns/wizard/BriefStep";
import CreativeStep from "@/components/campaigns/wizard/CreativeStep";
import LocationStep from "@/components/campaigns/wizard/LocationStep";
import PlacementAreaStep from "@/components/campaigns/wizard/PlacementAreaStep";
import ReviewAndFundStep from "@/components/campaigns/wizard/ReviewAndFundStep";
import WizardChrome from "@/components/campaigns/wizard/WizardChrome";
import { Card } from "@/components/ui";
import { authenticatedFetch } from "@/lib/api/authenticated-fetch";
import {
  formatOptionalCampaignBudget,
  formatOptionalCampaignDate,
  formatOptionalPlacements,
} from "@/lib/campaigns/format";
import type { SelectedPlace } from "@/lib/campaigns/geo";
import type {
  CampaignDto,
  CampaignResponse,
  CampaignWizardStepValue,
  LocationStrategyValue,
} from "@/lib/campaigns/types";
import {
  isStepReachable,
  previousStep,
  slugFromStep,
  stepFromSlug,
} from "@/lib/campaigns/wizard";

type LoadState = {
  scope: string | null;
  campaign: CampaignDto | null;
  loading: boolean;
  error: string | null;
};

export default function CampaignWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, authenticated, user, getAccessToken } = usePrivy();

  const userId = ready && authenticated ? user?.id ?? null : null;
  const campaignId = searchParams.get("campaign");
  const requestedStep = stepFromSlug(searchParams.get("step"));
  const requestScope = userId ? `${userId}:${campaignId ?? "new"}` : null;

  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({
    scope: null,
    campaign: null,
    loading: Boolean(campaignId),
    error: null,
  });
  const [submitting, setSubmitting] = useState(false);

  const cancelRequest = useCallback(() => {
    ++requestSequence.current;
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  const loadCampaign = useCallback(async () => {
    if (!requestScope || !campaignId) return;

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

      setLoadState({
        scope,
        campaign: null,
        loading: false,
        error:
          caught instanceof Error
            ? caught.message
            : "Could not load this campaign draft.",
      });
    } finally {
      if (sequence === requestSequence.current) {
        requestController.current = null;
      }
    }
  }, [campaignId, getAccessToken, requestScope]);

  useEffect(() => {
    if (!ready) return;

    if (!authenticated || !requestScope) {
      cancelRequest();
      setLoadState({ scope: null, campaign: null, loading: false, error: null });
      return;
    }

    if (!campaignId) {
      cancelRequest();
      setLoadState({
        scope: requestScope,
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
    campaignId,
    loadCampaign,
    cancelRequest,
  ]);

  const current: LoadState =
    requestScope && loadState.scope === requestScope
      ? loadState
      : {
          scope: requestScope,
          campaign: null,
          loading: Boolean(campaignId),
          error: null,
        };
  const { campaign, loading, error } = current;

  // A funded campaign is no longer handled by the wizard. QUOTED stays: its
  // quote is approved but funding failed or awaits approval, so the brand must
  // be able to come back to the fund step.
  useEffect(() => {
    if (campaign && campaign.status !== "DRAFT" && campaign.status !== "QUOTED") {
      router.replace(`/brand/campaigns/${campaign.id}`);
    }
  }, [campaign, router]);

  function goToStep(step: CampaignWizardStepValue, id = campaignId) {
    const params = new URLSearchParams();
    if (id) params.set("campaign", id);
    params.set("step", slugFromStep(step));
    router.replace(`/brand/new?${params.toString()}`);
  }

  async function createFromBrief(values: BriefStepValues) {
    setSubmitting(true);

    try {
      const response = await authenticatedFetch<CampaignResponse>(
        getAccessToken,
        "/api/campaigns",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            briefText: values.briefText,
            placementCount: values.placementCount,
            budgetLimit: values.budgetLimit,
            deadline: values.deadline,
            city: values.city,
            ...(values.countryCode ? { countryCode: values.countryCode } : {}),
            countryName: values.countryName,
            ...(values.destinationUrl
              ? { destinationUrl: values.destinationUrl }
              : {}),
            wizardStep: "LOCATION",
          }),
        },
      );

      goToStep("LOCATION", response.campaign.id);
    } finally {
      setSubmitting(false);
    }
  }

  async function updateFromBrief(values: BriefStepValues, id: string) {
    setSubmitting(true);

    try {
      await authenticatedFetch<CampaignResponse>(
        getAccessToken,
        `/api/campaigns/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            briefText: values.briefText,
            placementCount: values.placementCount,
            budgetLimit: values.budgetLimit,
            deadline: values.deadline,
            city: values.city,
            ...(values.countryCode ? { countryCode: values.countryCode } : {}),
            countryName: values.countryName,
            ...(values.destinationUrl
              ? { destinationUrl: values.destinationUrl }
              : {}),
          }),
        },
      );

      goToStep("LOCATION", id);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveLocation(place: SelectedPlace, id: string) {
    setSubmitting(true);

    try {
      await authenticatedFetch<CampaignResponse>(
        getAccessToken,
        `/api/campaigns/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            city: place.city,
            ...(place.countryCode ? { countryCode: place.countryCode } : {}),
            countryName: place.countryName,
            centerLatitude: place.latitude,
            centerLongitude: place.longitude,
            wizardStep: "PLACEMENTS",
          }),
        },
      );

      goToStep("PLACEMENTS", id);
    } finally {
      setSubmitting(false);
    }
  }

  async function savePlacementArea(
    input: {
      areas: {
        label: string;
        latitude: number;
        longitude: number;
        radiusMetres: number;
      }[];
      strategy: LocationStrategyValue;
      locationIds: string[];
    },
    id: string,
  ) {
    setSubmitting(true);

    try {
      // Areas must be stored before locations are assigned, because the server
      // validates each location against the campaign's own stored geography.
      await authenticatedFetch<{ areas: unknown[] }>(
        getAccessToken,
        `/api/campaigns/${id}/areas`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ areas: input.areas }),
        },
      );

      await authenticatedFetch<CampaignResponse>(
        getAccessToken,
        `/api/campaigns/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locationStrategy: input.strategy }),
        },
      );

      await authenticatedFetch<{ selectedLocationIds: string[] }>(
        getAccessToken,
        `/api/campaigns/${id}/locations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            strategy: input.strategy,
            locationIds: input.locationIds,
          }),
        },
      );

      await authenticatedFetch<CampaignResponse>(
        getAccessToken,
        `/api/campaigns/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wizardStep: "CREATIVE" }),
        },
      );

      goToStep("CREATIVE", id);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveCreative(destinationUrl: string, id: string) {
    setSubmitting(true);

    try {
      await authenticatedFetch<CampaignResponse>(
        getAccessToken,
        `/api/campaigns/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destinationUrl, wizardStep: "REVIEW" }),
        },
      );

      goToStep("REVIEW", id);
    } finally {
      setSubmitting(false);
    }
  }

  const exitHref = campaign ? `/brand/campaigns/${campaign.id}` : "/brand";

  // Resolve the visible step: never ahead of recorded progress, and always BRIEF
  // until a draft exists.
  let step: CampaignWizardStepValue = "BRIEF";
  if (campaign) {
    const desired = requestedStep ?? campaign.wizardStep;
    step = isStepReachable(desired, campaign.wizardStep)
      ? desired
      : campaign.wizardStep;
  }

  if (!ready || loading) {
    return (
      <WizardChrome step="BRIEF" exitHref="/brand">
        <div className="h-72 animate-pulse rounded-[20px] bg-raised" />
      </WizardChrome>
    );
  }

  if (!authenticated) {
    return (
      <WizardChrome step="BRIEF" exitHref="/">
        <Card className="px-6 py-10 text-center">
          <h2 className="text-[18px] font-bold">Sign in to create a campaign</h2>
          <p className="mt-2 text-[13.5px] text-muted">
            Your session ended. Sign in again to continue.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex h-10 items-center rounded-xl bg-solid px-4 text-[13.5px] font-semibold text-solid-ink"
          >
            Go to sign in
          </Link>
        </Card>
      </WizardChrome>
    );
  }

  if (error) {
    return (
      <WizardChrome step="BRIEF" exitHref="/brand">
        <Card className="px-6 py-10 text-center">
          <h2 className="text-[18px] font-bold">Draft unavailable</h2>
          <p className="mt-2 text-[13.5px] text-muted">{error}</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link
              href="/brand"
              className="h-10 rounded-xl border border-line px-4 py-2.5 text-[13px] font-semibold"
            >
              Back to campaigns
            </Link>
            <button
              onClick={() => void loadCampaign()}
              className="h-10 rounded-xl bg-solid px-4 text-[13px] font-semibold text-solid-ink"
            >
              Try again
            </button>
          </div>
        </Card>
      </WizardChrome>
    );
  }

  const back = previousStep(step);
  const summary = campaign ? (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      <span className="font-semibold text-ink">{campaign.name}</span>
      <span>{formatOptionalPlacements(campaign.placementCount)}</span>
      <span>
        {formatOptionalCampaignBudget(campaign.budgetLimit, campaign.currency)}
      </span>
      <span>{formatOptionalCampaignDate(campaign.deadline)}</span>
    </span>
  ) : null;

  return (
    <WizardChrome
      step={step}
      exitHref={exitHref}
      summary={summary}
      wide={step === "LOCATION" || step === "PLACEMENTS"}
      footer={
        step !== "BRIEF" && back ? (
          <button
            type="button"
            onClick={() => goToStep(back)}
            className="h-10 rounded-xl border border-line px-4 text-[13.5px] font-semibold hover:bg-raised"
          >
            Back
          </button>
        ) : null
      }
    >
      {step === "BRIEF" ? (
        <BriefStep
          campaign={campaign}
          submitting={submitting}
          onSubmit={(values) =>
            campaign
              ? updateFromBrief(values, campaign.id)
              : createFromBrief(values)
          }
        />
      ) : null}

      {step === "LOCATION" && campaign ? (
        <LocationStep
          campaign={campaign}
          submitting={submitting}
          onContinue={(place) => saveLocation(place, campaign.id)}
        />
      ) : null}

      {step === "PLACEMENTS" && campaign ? (
        <PlacementAreaStep
          campaign={campaign}
          submitting={submitting}
          onContinue={(input) => savePlacementArea(input, campaign.id)}
        />
      ) : null}

      {step === "CREATIVE" && campaign ? (
        <CreativeStep
          campaign={campaign}
          submitting={submitting}
          onContinue={(destinationUrl) =>
            saveCreative(destinationUrl, campaign.id)
          }
        />
      ) : null}

      {step === "REVIEW" && campaign ? (
        <ReviewAndFundStep
          campaign={campaign}
          onFunded={() => router.replace(`/brand/campaigns/${campaign.id}`)}
        />
      ) : null}

    </WizardChrome>
  );
}
