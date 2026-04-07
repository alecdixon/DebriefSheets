"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Corner = {
  id: number;
  x: number;
  y: number;
};

type Template = {
  id: string;
  team_name?: string | null;
  track_name: string;
  corner_count: number;
  track_map_url: string | null;
  corners: Corner[];
};

type CornerFeedback = {
  cornerId: number;
  balance: string;
  comment: string;
};

type Recipient = {
  id: string;
  name: string;
  email: string;
  active: boolean;
};

const reliabilityItems = [
  "Any spins or contact",
  "Bodywork",
  "Engine",
  "Gearbox",
  "Brakes & bias",
  "Lockups",
  "Vibrations",
  "Seat / pedals",
  "Pitboard visible",
  "Radio",
];

const balanceOptions = ["US 3", "US 2", "US 1", "OK", "OS 1", "OS 2", "OS 3"];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (typeof error === "string") return error;

  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown object error";
    }
  }

  return "Unknown error";
}

function normaliseCorners(value: unknown): Corner[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        "x" in item &&
        "y" in item
      ) {
        const corner = item as Record<string, unknown>;
        return {
          id: Number(corner.id),
          x: Number(corner.x),
          y: Number(corner.y),
        };
      }
      return null;
    })
    .filter((item): item is Corner => item !== null);
}

export default function DriverTemplatePage() {
  const params = useParams();
  const templateId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [template, setTemplate] = useState<Template | null>(null);
  const [selectedCornerId, setSelectedCornerId] = useState<number | null>(null);

  const [driverName, setDriverName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [overallComments, setOverallComments] = useState("");
  const [primaryLimitation, setPrimaryLimitation] = useState("");

  const [reliabilityFlags, setReliabilityFlags] = useState<Record<string, boolean>>({});
  const [cornerFeedback, setCornerFeedback] = useState<CornerFeedback[]>([]);

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [primaryRecipientId, setPrimaryRecipientId] = useState("");
  const [showExtraRecipient, setShowExtraRecipient] = useState(false);
  const [extraRecipientId, setExtraRecipientId] = useState("");

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [sendStatus, setSendStatus] = useState("");

  useEffect(() => {
    async function loadPage() {
      if (!templateId || typeof templateId !== "string") {
        setLoadError("No template ID found in the URL.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError("");

      try {
        const [
          { data: templateData, error: templateError },
          { data: recipientData, error: recipientError },
        ] = await Promise.all([
          supabase
            .from("debrief_templates")
            .select("*")
            .eq("id", templateId)
            .single(),
          supabase
            .from("engineers")
            .select("id, name, email, active")
            .eq("active", true)
            .order("name", { ascending: true }),
        ]);

        if (templateError) {
          throw new Error(`Could not load template: ${templateError.message}`);
        }

        if (!templateData) {
          throw new Error("Template not found.");
        }

        const parsedCorners = normaliseCorners(templateData.corners);

        const parsedTemplate: Template = {
          id: String(templateData.id),
          team_name:
            typeof templateData.team_name === "string" || templateData.team_name === null
              ? templateData.team_name
              : null,
          track_name: String(templateData.track_name ?? ""),
          corner_count: Number(templateData.corner_count ?? parsedCorners.length),
          track_map_url:
            typeof templateData.track_map_url === "string" || templateData.track_map_url === null
              ? templateData.track_map_url
              : null,
          corners: parsedCorners,
        };

        setTemplate(parsedTemplate);
        setSelectedCornerId(parsedCorners[0]?.id ?? null);
        setCornerFeedback(
          parsedCorners.map((corner) => ({
            cornerId: corner.id,
            balance: "",
            comment: "",
          }))
        );

        if (recipientError) {
          setLoadError(`Could not load recipients: ${recipientError.message}`);
          setRecipients([]);
        } else {
          setRecipients((recipientData ?? []) as Recipient[]);
        }
      } catch (error) {
        setLoadError(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    }

    loadPage();
  }, [templateId]);

  function toggleReliability(item: string) {
    setReliabilityFlags((prev) => ({
      ...prev,
      [item]: !prev[item],
    }));
  }

  function updateCornerFeedback(cornerId: number, patch: Partial<CornerFeedback>) {
    setCornerFeedback((prev) =>
      prev.map((entry) =>
        entry.cornerId === cornerId ? { ...entry, ...patch } : entry
      )
    );
  }

  const selectedCorner = useMemo(() => {
    return template?.corners.find((c) => c.id === selectedCornerId) ?? null;
  }, [template, selectedCornerId]);

  const selectedCornerEntry = useMemo(() => {
    return cornerFeedback.find((c) => c.cornerId === selectedCornerId) ?? null;
  }, [cornerFeedback, selectedCornerId]);

  const completedCorners = useMemo(() => {
    return cornerFeedback.filter(
      (entry) => entry.balance.trim() !== "" || entry.comment.trim() !== ""
    ).length;
  }, [cornerFeedback]);

  const primaryRecipient = useMemo(() => {
    return recipients.find((r) => r.id === primaryRecipientId) ?? null;
  }, [recipients, primaryRecipientId]);

  const extraRecipient = useMemo(() => {
    return recipients.find((r) => r.id === extraRecipientId) ?? null;
  }, [recipients, extraRecipientId]);

  const recipientErrorMessage = useMemo(() => {
    if (showExtraRecipient && extraRecipientId && primaryRecipientId === extraRecipientId) {
      return "Additional recipient must be different from the primary recipient.";
    }
    return "";
  }, [showExtraRecipient, extraRecipientId, primaryRecipientId]);

  function goToPreviousCorner() {
    if (!template || selectedCornerId === null) return;
    const currentIndex = template.corners.findIndex((c) => c.id === selectedCornerId);
    if (currentIndex > 0) {
      setSelectedCornerId(template.corners[currentIndex - 1].id);
    }
  }

  function goToNextCorner() {
    if (!template || selectedCornerId === null) return;
    const currentIndex = template.corners.findIndex((c) => c.id === selectedCornerId);
    if (currentIndex >= 0 && currentIndex < template.corners.length - 1) {
      setSelectedCornerId(template.corners[currentIndex + 1].id);
    }
  }

  async function handleSendPdf() {
    if (!template) {
      setSendStatus("No template loaded.");
      return;
    }

    if (!driverName.trim()) {
      setSendStatus("Please enter the driver name.");
      return;
    }

    if (!sessionName.trim()) {
      setSendStatus("Please enter the session name.");
      return;
    }

    if (!primaryRecipient) {
      setSendStatus("Please select a primary recipient.");
      return;
    }

    if (recipientErrorMessage) {
      setSendStatus(recipientErrorMessage);
      return;
    }

    try {
      setSending(true);
      setSendStatus("Sending PDF...");

      const activeReliabilityItems = reliabilityItems.filter((item) => !!reliabilityFlags[item]);

      const payload = {
        templateId: template.id,
        team: template.team_name ?? "Unknown Team",
        trackName: template.track_name,
        driverName: driverName.trim(),
        sessionName: sessionName.trim(),
        overallComments: overallComments.trim(),
        primaryLimitation: primaryLimitation.trim(),
        reliabilityItems: activeReliabilityItems,
        cornerFeedback,
        recipients: [
          primaryRecipient.email,
          ...(extraRecipient ? [extraRecipient.email] : []),
        ],
      };

      const response = await fetch("/api/send-debrief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            `Request failed with status ${response.status}`
        );
      }

      setSendStatus(
        `PDF sent successfully to ${primaryRecipient.name}${
          extraRecipient ? ` and ${extraRecipient.name}` : ""
        }.`
      );
    } catch (error) {
      setSendStatus(`Send failed: ${getErrorMessage(error)}`);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0A0E14] px-4 py-8 text-white">
        <div className="mx-auto max-w-5xl">Loading debrief…</div>
      </main>
    );
  }

  if (!template) {
    return (
      <main className="min-h-screen bg-[#0A0E14] px-4 py-8 text-white">
        <div className="mx-auto max-w-5xl space-y-3">
          <div>Template not found.</div>
          {loadError && <div className="text-sm text-red-300">{loadError}</div>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0A0E14] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] px-6 py-7 shadow-2xl md:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#E10600]">
            Rodin Motorsport
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
            Driver Debrief
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#9CA3AF] md:text-base">
            {template.team_name ? `${template.team_name} · ` : ""}
            {template.track_name}
          </p>
          {loadError && <p className="mt-3 text-sm text-red-300">{loadError}</p>}
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl md:p-7">
          <div className="grid gap-4 md:grid-cols-2">
            <input
              className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white placeholder:text-slate-500"
              placeholder="Driver name"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
            />
            <input
              className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white placeholder:text-slate-500"
              placeholder="Session"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
          </div>
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl md:p-7">
          <h2 className="text-2xl font-semibold text-white">Reliability</h2>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            Optional: tap only the items that had an issue.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reliabilityItems.map((item) => {
              const active = !!reliabilityFlags[item];
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleReliability(item)}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
                    active
                      ? "border-red-500 bg-red-500/15 text-red-300"
                      : "border-[#2A3441] bg-[#1B2430] text-white"
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-5 shadow-2xl md:p-6">
          <div className="mb-5 flex flex-col gap-4 border-b border-[#2A3441] pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">Track Map</h2>
              <p className="mt-2 text-sm text-[#9CA3AF]">
                Tap a corner marker to enter feedback for that part of the lap.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <div className="rounded-full border border-[#2A3441] bg-[#1B2430] px-3 py-1.5 text-white">
                {template.track_name}
              </div>
              <div className="rounded-full border border-[#2A3441] bg-[#1B2430] px-3 py-1.5 text-white">
                {completedCorners}/{template.corner_count} completed
              </div>
            </div>
          </div>

          <div className="rounded-[24px] bg-[#111827] p-4">
            <div className="relative min-h-[520px] overflow-hidden rounded-[20px] border border-[#2A3441] bg-[#0F141C]">
              {template.track_map_url ? (
                <img
                  src={template.track_map_url}
                  alt="Track map"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-[520px] items-center justify-center text-sm text-[#9CA3AF]">
                  No track map uploaded for this template.
                </div>
              )}

              {template.corners.map((corner) => (
                <button
                  key={corner.id}
                  type="button"
                  onClick={() => setSelectedCornerId(corner.id)}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1 text-base font-semibold text-white shadow-lg transition ${
                    selectedCornerId === corner.id
                      ? "border-[#E10600] bg-[#E10600]"
                      : "border-[#2A3441] bg-[#141A22]/95"
                  }`}
                  style={{ left: `${corner.x}%`, top: `${corner.y}%` }}
                >
                  T{corner.id}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl md:p-7">
          <div className="flex flex-col gap-4 border-b border-[#2A3441] pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">Selected Corner</h2>
              <p className="mt-2 text-sm text-[#9CA3AF]">
                Enter the balance and any comments for the selected corner.
              </p>
            </div>

            {selectedCorner && (
              <div className="rounded-full border border-[#2A3441] bg-[#1B2430] px-4 py-2 text-sm text-white">
                Corner T{selectedCorner.id}
              </div>
            )}
          </div>

          {!selectedCorner || !selectedCornerEntry ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">Select a corner on the map above.</p>
          ) : (
            <div className="mt-5 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-white">
                  Balance
                </label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                  {balanceOptions.map((option) => {
                    const active = selectedCornerEntry.balance === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() =>
                          updateCornerFeedback(selectedCorner.id, { balance: option })
                        }
                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                          active
                            ? "border-[#E10600] bg-[#E10600] text-white"
                            : "border-[#2A3441] bg-[#1B2430] text-white hover:border-[#E10600]"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white">
                  Corner comment
                </label>
                <textarea
                  value={selectedCornerEntry.comment}
                  onChange={(e) =>
                    updateCornerFeedback(selectedCorner.id, {
                      comment: e.target.value,
                    })
                  }
                  className="min-h-[140px] w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none placeholder:text-slate-500"
                  placeholder="Add driver comments for this corner"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={goToPreviousCorner}
                  className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
                >
                  Previous Corner
                </button>

                <button
                  type="button"
                  onClick={goToNextCorner}
                  className="rounded-2xl bg-[#E10600] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#C50500]"
                >
                  Next Corner
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl md:p-7">
          <h2 className="text-2xl font-semibold text-white">Overall Debrief</h2>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            Summarise the main limitation and any overall comments.
          </p>

          <div className="mt-5 space-y-4">
            <textarea
              value={primaryLimitation}
              onChange={(e) => setPrimaryLimitation(e.target.value)}
              className="min-h-[100px] w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none placeholder:text-slate-500"
              placeholder="Primary limitation of the car"
            />

            <textarea
              value={overallComments}
              onChange={(e) => setOverallComments(e.target.value)}
              className="min-h-[140px] w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none placeholder:text-slate-500"
              placeholder="Overall comments"
            />
          </div>
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl md:p-7">
          <h2 className="text-2xl font-semibold text-white">Send PDF</h2>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            Choose the main engineer, and optionally add one extra recipient such as the team manager.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-white">
                Primary recipient
              </label>
              <select
                value={primaryRecipientId}
                onChange={(e) => setPrimaryRecipientId(e.target.value)}
                className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none"
              >
                <option value="">Select engineer</option>
                {recipients.map((recipient) => (
                  <option key={recipient.id} value={recipient.id}>
                    {recipient.name}
                  </option>
                ))}
              </select>
              {primaryRecipient && (
                <p className="mt-2 text-sm text-[#9CA3AF]">{primaryRecipient.email}</p>
              )}
            </div>

            {!showExtraRecipient ? (
              <button
                type="button"
                onClick={() => setShowExtraRecipient(true)}
                className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
              >
                Add person
              </button>
            ) : (
              <div className="space-y-3 rounded-2xl border border-[#2A3441] bg-[#1B2430] p-4">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-white">
                    Additional recipient
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowExtraRecipient(false);
                      setExtraRecipientId("");
                    }}
                    className="text-sm font-semibold text-[#9CA3AF] transition hover:text-white"
                  >
                    Remove
                  </button>
                </div>

                <select
                  value={extraRecipientId}
                  onChange={(e) => setExtraRecipientId(e.target.value)}
                  className="w-full rounded-2xl border border-[#2A3441] bg-[#141A22] px-4 py-3 text-white outline-none"
                >
                  <option value="">Select additional person</option>
                  {recipients.map((recipient) => (
                    <option key={recipient.id} value={recipient.id}>
                      {recipient.name}
                    </option>
                  ))}
                </select>

                {extraRecipient && (
                  <p className="text-sm text-[#9CA3AF]">{extraRecipient.email}</p>
                )}
              </div>
            )}

            {recipientErrorMessage && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                {recipientErrorMessage}
              </div>
            )}

            <button
              type="button"
              onClick={handleSendPdf}
              disabled={sending}
              className="w-full rounded-2xl bg-[#E10600] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#C50500] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send PDF"}
            </button>

            {sendStatus && (
              <div className="rounded-2xl border border-[#2A3441] bg-[#1B2430] p-4 text-sm text-[#9CA3AF]">
                {sendStatus}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}