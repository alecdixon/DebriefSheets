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

type IncidentMarker = {
  id: number;
  x: number;
  y: number;
  note: string;
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

  const [incidentMarkers, setIncidentMarkers] = useState<IncidentMarker[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [addMarkerMode, setAddMarkerMode] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sendStatus, setSendStatus] = useState("");

  useEffect(() => {
    async function loadPage() {
      if (!templateId || typeof templateId !== "string") {
        setLoadError("No template ID found in the URL.");
        setLoading(false);
        return;
      }

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
          setLoadError(`Could not load template: ${templateError.message}`);
        } else if (templateData) {
          const cleanTemplate = templateData as Template;
          setTemplate(cleanTemplate);
          setSelectedCornerId(cleanTemplate.corners?.[0]?.id ?? null);
          setCornerFeedback(
            cleanTemplate.corners.map((corner: Corner) => ({
              cornerId: corner.id,
              balance: "",
              comment: "",
            }))
          );
        }

        if (recipientError) {
          setLoadError((prev) =>
            prev
              ? `${prev} | Could not load recipients: ${recipientError.message}`
              : `Could not load recipients: ${recipientError.message}`
          );
        } else {
          setRecipients((recipientData ?? []) as Recipient[]);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setLoadError(`Failed to load page: ${message}`);
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

  function updateIncidentNote(incidentId: number, note: string) {
    setIncidentMarkers((prev) =>
      prev.map((marker) =>
        marker.id === incidentId ? { ...marker, note } : marker
      )
    );
  }

  function removeIncidentMarker(incidentId: number) {
    setIncidentMarkers((prev) => prev.filter((marker) => marker.id !== incidentId));
    if (selectedIncidentId === incidentId) {
      setSelectedIncidentId(null);
    }
  }

  const selectedCorner = useMemo(() => {
    return template?.corners.find((c) => c.id === selectedCornerId) ?? null;
  }, [template, selectedCornerId]);

  const selectedCornerEntry = useMemo(() => {
    return cornerFeedback.find((c) => c.cornerId === selectedCornerId) ?? null;
  }, [cornerFeedback, selectedCornerId]);

  const selectedIncident = useMemo(() => {
    return incidentMarkers.find((marker) => marker.id === selectedIncidentId) ?? null;
  }, [incidentMarkers, selectedIncidentId]);

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
    if (!primaryRecipientId) return "";
    if (showExtraRecipient && extraRecipientId && primaryRecipientId === extraRecipientId) {
      return "Additional recipient must be different from the primary recipient.";
    }
    return "";
  }, [primaryRecipientId, showExtraRecipient, extraRecipientId]);

  function goToPreviousCorner() {
    if (!template || selectedCornerId === null) return;
    const currentIndex = template.corners.findIndex((c) => c.id === selectedCornerId);
    if (currentIndex > 0) {
      setSelectedCornerId(template.corners[currentIndex - 1].id);
      setSelectedIncidentId(null);
    }
  }

  function goToNextCorner() {
    if (!template || selectedCornerId === null) return;
    const currentIndex = template.corners.findIndex((c) => c.id === selectedCornerId);
    if (currentIndex >= 0 && currentIndex < template.corners.length - 1) {
      setSelectedCornerId(template.corners[currentIndex + 1].id);
      setSelectedIncidentId(null);
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

    if (!primaryRecipient) {
      setSendStatus("Please select a primary recipient.");
      return;
    }

    if (recipientErrorMessage) {
      setSendStatus(recipientErrorMessage);
      return;
    }

    try {
      setSendStatus("Sending email...");

      const response = await fetch("/api/send-debrief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          driverName: driverName.trim(),
          sessionName: sessionName.trim(),
          trackName: template.track_name,
          trackMapUrl: template.track_map_url,
          corners: template.corners,
          primaryRecipientEmail: primaryRecipient.email,
          extraRecipientEmail: extraRecipient?.email ?? "",
          primaryLimitation,
          overallComments,
          reliabilityFlags,
          cornerFeedback,
          incidentMarkers,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setSendStatus(`Send failed: ${result.error || "Unknown error"}`);
        return;
      }

      setSendStatus("Email sent successfully.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setSendStatus(`Send failed: ${message}`);
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
            {template.track_name}
          </p>
          {loadError && <p className="mt-3 text-sm text-red-300">{loadError}</p>}
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl md:p-7">
          <div className="grid gap-4 md:grid-cols-2">
            <input
              className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white placeholder:text-slate-500 outline-none"
              placeholder="Driver name"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
            />
            <input
              className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white placeholder:text-slate-500 outline-none"
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
                Tap a corner marker to enter feedback, or add a helmet marker anywhere on the lap.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <div className="rounded-full border border-[#2A3441] bg-[#1B2430] px-3 py-1.5 text-white">
                {template.track_name}
              </div>
              <div className="rounded-full border border-[#2A3441] bg-[#1B2430] px-3 py-1.5 text-white">
                {completedCorners}/{template.corner_count} completed
              </div>
              <button
                type="button"
                onClick={() => {
                  setAddMarkerMode((prev) => !prev);
                  setSelectedIncidentId(null);
                }}
                className={`rounded-full px-3 py-1.5 font-semibold transition ${
                  addMarkerMode
                    ? "bg-yellow-400 text-black"
                    : "border border-[#2A3441] bg-[#1B2430] text-white"
                }`}
              >
                {addMarkerMode ? "Click map to place marker" : "Add Incident Marker"}
              </button>
            </div>
          </div>

          <div className="rounded-[24px] bg-[#111827] p-4">
            <div
              className="relative min-h-[520px] overflow-hidden rounded-[20px] border border-[#2A3441] bg-[#0F141C]"
              onClick={(e) => {
                if (!addMarkerMode) return;

                const rect = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;

                const newMarker: IncidentMarker = {
                  id: Date.now(),
                  x,
                  y,
                  note: "",
                };

                setIncidentMarkers((prev) => [...prev, newMarker]);
                setSelectedIncidentId(newMarker.id);
                setSelectedCornerId(null);
                setAddMarkerMode(false);
              }}
            >
              {template.track_map_url && (
                <img
                  src={template.track_map_url}
                  alt="Track map"
                  className="h-full w-full object-contain"
                />
              )}

              {template.corners.map((corner) => (
                <button
                  key={corner.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCornerId(corner.id);
                    setSelectedIncidentId(null);
                  }}
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

              {incidentMarkers.map((marker) => (
                <button
                  key={marker.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIncidentId(marker.id);
                    setSelectedCornerId(null);
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-1 text-sm shadow-lg transition ${
                    selectedIncidentId === marker.id
                      ? "border-yellow-400 bg-yellow-400 text-black"
                      : "border-yellow-500 bg-[#141A22] text-white"
                  }`}
                  style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                  title="Incident marker"
                >
                  🪖
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

        {selectedIncident && (
          <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl md:p-7">
            <div className="flex items-center justify-between gap-3 border-b border-[#2A3441] pb-5">
              <div>
                <h2 className="text-2xl font-semibold text-white">Incident Marker</h2>
                <p className="mt-2 text-sm text-[#9CA3AF]">
                  Add a free-form note at this point on the lap.
                </p>
              </div>

              <button
                type="button"
                onClick={() => removeIncidentMarker(selectedIncident.id)}
                className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
              >
                Remove Marker
              </button>
            </div>

            <textarea
              value={selectedIncident.note}
              onChange={(e) => updateIncidentNote(selectedIncident.id, e.target.value)}
              className="mt-5 min-h-[120px] w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none placeholder:text-slate-500"
              placeholder="Describe what happened here..."
            />
          </section>
        )}

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
              className="w-full rounded-2xl bg-[#E10600] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#C50500]"
            >
              Send PDF
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