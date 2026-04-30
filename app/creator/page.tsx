"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type TurnColor = "normal" | "blue" | "green" | "red";

type Corner = {
  id: number;
  x: number;
  y: number;
  labelX?: number;
  labelY?: number;
  color: TurnColor;
};

type Template = {
  id: string;
  team: string;
  track_name: string;
  track_map_url: string | null;
  corner_count: number;
  corners: Corner[];
};

const TEAM_OPTIONS = ["GB3", "GT3", "British F4", "FIA F3", "FIA F2", "FREC", "F1 Academy"];

const COLOUR_ORDER: TurnColor[] = ["normal", "blue", "green", "red"];

function markerClass(color: TurnColor) {
  switch (color) {
    case "blue":
      return "bg-blue-600 text-white border-blue-300";
    case "green":
      return "bg-green-600 text-white border-green-300";
    case "red":
      return "bg-red-600 text-white border-red-300";
    default:
      return "bg-red-600 text-white border-white";
  }
}

function normaliseCorner(corner: Corner): Corner {
  return {
    ...corner,
    labelX: typeof corner.labelX === "number" ? corner.labelX : corner.x,
    labelY: typeof corner.labelY === "number" ? corner.labelY : corner.y,
    color: corner.color ?? "normal",
  };
}

function sortCornersById(corners: Corner[]): Corner[] {
  return [...corners].map(normaliseCorner).sort((a, b) => a.id - b.id);
}

function buildInitialCorners(count: number): Corner[] {
  if (count <= 0) return [];

  const cols = Math.min(4, count);
  const rows = Math.ceil(count / cols);

  return Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const x = 16 + (col / Math.max(cols - 1, 1)) * 68;
    const y = 18 + (row / Math.max(rows - 1, 1)) * 64;

    return {
      id: i + 1,
      x,
      y,
      labelX: x,
      labelY: y,
      color: "normal",
    };
  });
}

export default function CreatorPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [team, setTeam] = useState("GB3");
  const [trackName, setTrackName] = useState("");
  const [trackMapDataUrl, setTrackMapDataUrl] = useState("");
  const [turnCount, setTurnCount] = useState("10");
  const [corners, setCorners] = useState<Corner[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const [anchorCornerId, setAnchorCornerId] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const [status, setStatus] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [origin, setOrigin] = useState("");
  const [mapAspectRatio, setMapAspectRatio] = useState<number>(1.6);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [saving, setSaving] = useState(false);

  const dragRef = useRef<{
    pointerId: number | null;
    cornerId: number | null;
    moved: boolean;
  }>({
    pointerId: null,
    cornerId: null,
    moved: false,
  });

  const filteredTemplates = templates.filter((template) => template.team === team);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoadingTemplates(true);

    const { data, error } = await supabase
      .from("debrief_templates")
      .select("id, team, track_name, track_map_url, corner_count, corners")
      .order("track_name", { ascending: true });

    if (error) {
      setStatus(`Failed to load templates: ${error.message}`);
    } else {
      setTemplates((data ?? []) as Template[]);
    }

    setLoadingTemplates(false);
  }

  function getPercentPosition(clientX: number, clientY: number, container: HTMLDivElement) {
    const rect = container.getBoundingClientRect();

    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    return {
      x: Math.max(2, Math.min(98, x)),
      y: Math.max(2, Math.min(98, y)),
    };
  }

  function resetForm() {
    setSelectedTemplateId(null);
    setTeam("GB3");
    setTrackName("");
    setTrackMapDataUrl("");
    setTurnCount("10");
    setCorners([]);
    setAnchorCornerId(null);
    setGeneratedLink("");
    setMapAspectRatio(1.6);
    setStatus("");
  }

  function loadTemplateIntoForm(template: Template) {
    const cleanCorners = sortCornersById((template.corners ?? []) as Corner[]);

    setSelectedTemplateId(template.id);
    setTeam(template.team || "GB3");
    setTrackName(template.track_name || "");
    setTrackMapDataUrl(template.track_map_url || "");
    setCorners(cleanCorners);
    setTurnCount(String(template.corner_count || cleanCorners.length || 0));
    setGeneratedLink(`${origin}/driver/${template.id}`);
    setAnchorCornerId(null);
    setStatus(`Editing template: ${template.track_name}`);
  }

  function handleSelectTrackMapClick() {
    fileInputRef.current?.click();
  }

  function handleTrackMapFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setStatus("Please select a valid image file.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result === "string") {
        setTrackMapDataUrl(result);
        setStatus(`Loaded track map: ${file.name}`);
      }
    };

    reader.readAsDataURL(file);
  }

  function handleGenerateTurns() {
    const count = Number(turnCount);

    if (!Number.isFinite(count) || count <= 0) {
      setStatus("Please enter a valid number of turns.");
      return;
    }

    setCorners(buildInitialCorners(count));
    setAnchorCornerId(null);
    setStatus(
      `${count} turns generated. Drag labels into clear positions. Right-click a label, then click the exact track point.`
    );
  }

  function addSingleCorner() {
    const usedIds = new Set(corners.map((corner) => corner.id));

    let nextId = 1;

    while (usedIds.has(nextId)) {
      nextId += 1;
    }

    const newCorner: Corner = {
      id: nextId,
      x: 50,
      y: 50,
      labelX: 50,
      labelY: 50,
      color: "normal",
    };

    const updatedCorners = sortCornersById([...corners, newCorner]);

    setCorners(updatedCorners);
    setTurnCount(String(updatedCorners.length));
    setAnchorCornerId(null);
    setStatus(
      `Added T${nextId}. Drag the label into position, then right-click it and click the exact track point.`
    );
  }

  function moveLabel(
    cornerId: number,
    clientX: number,
    clientY: number,
    container: HTMLDivElement
  ) {
    const position = getPercentPosition(clientX, clientY, container);

    setCorners((prev) =>
      prev.map((corner) =>
        corner.id === cornerId
          ? {
              ...corner,
              labelX: position.x,
              labelY: position.y,
            }
          : corner
      )
    );
  }

  function handleMarkerPointerDown(
    e: React.PointerEvent<HTMLButtonElement>,
    cornerId: number
  ) {
    if (e.button !== 0) return;

    e.stopPropagation();

    dragRef.current = {
      pointerId: e.pointerId,
      cornerId,
      moved: false,
    };

    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePreviewPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag.pointerId !== e.pointerId || drag.cornerId === null) return;

    dragRef.current.moved = true;
    moveLabel(drag.cornerId, e.clientX, e.clientY, e.currentTarget);
  }

  function handlePreviewPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag.pointerId !== e.pointerId || drag.cornerId === null) return;

    dragRef.current = {
      pointerId: null,
      cornerId: null,
      moved: false,
    };
  }

  function handleMapClick(e: React.MouseEvent<HTMLDivElement>) {
    if (anchorCornerId === null) return;

    const position = getPercentPosition(e.clientX, e.clientY, e.currentTarget);

    setCorners((prev) =>
      prev.map((corner) =>
        corner.id === anchorCornerId
          ? {
              ...corner,
              x: position.x,
              y: position.y,
            }
          : corner
      )
    );

    setStatus(`Track point set for T${anchorCornerId}.`);
    setAnchorCornerId(null);
  }

  function handleMarkerRightClick(e: React.MouseEvent<HTMLButtonElement>, cornerId: number) {
    e.preventDefault();
    e.stopPropagation();

    setAnchorCornerId(cornerId);
    setStatus(`Click the exact track point for T${cornerId}.`);
  }

  function cycleCornerColour(cornerId: number) {
    setCorners((prev) =>
      prev.map((corner) => {
        if (corner.id !== cornerId) return corner;

        const currentIndex = COLOUR_ORDER.indexOf(corner.color);
        const nextColour = COLOUR_ORDER[(currentIndex + 1) % COLOUR_ORDER.length];

        return {
          ...corner,
          color: nextColour,
        };
      })
    );
  }

  function removeLastCorner() {
    setCorners((prev) => {
      const updatedCorners = prev.slice(0, -1);
      setTurnCount(String(updatedCorners.length));
      return updatedCorners;
    });
  }

  function resetCorners() {
    setCorners([]);
    setTurnCount("0");
    setAnchorCornerId(null);
  }

  function removeSpecificCorner(cornerId: number) {
    setCorners((prev) => {
      const updatedCorners = prev.filter((corner) => corner.id !== cornerId);
      setTurnCount(String(updatedCorners.length));
      return updatedCorners;
    });

    if (anchorCornerId === cornerId) {
      setAnchorCornerId(null);
    }
  }

  function resetLabelPositionsToTrackPoints() {
    setCorners((prev) =>
      prev.map((corner) => ({
        ...corner,
        labelX: corner.x,
        labelY: corner.y,
      }))
    );

    setStatus("Label positions reset to track points.");
  }

  async function handleSaveTemplate() {
    if (!team.trim()) {
      setStatus("Please select a team.");
      return;
    }

    if (!trackName.trim()) {
      setStatus("Please enter a track name.");
      return;
    }

    if (!trackMapDataUrl.trim()) {
      setStatus("Please select a track map.");
      return;
    }

    if (corners.length === 0) {
      setStatus("Please generate and position the turns first.");
      return;
    }

    try {
      setSaving(true);
      setStatus(selectedTemplateId ? "Updating template..." : "Saving template...");

      const payload = {
        team,
        track_name: trackName.trim(),
        track_map_url: trackMapDataUrl,
        corner_count: corners.length,
        corners: sortCornersById(corners),
      };

      if (selectedTemplateId) {
        const { error } = await supabase
          .from("debrief_templates")
          .update(payload)
          .eq("id", selectedTemplateId);

        if (error) {
          setStatus(`Failed to update template: ${error.message}`);
          return;
        }

        setGeneratedLink(`${origin}/driver/${selectedTemplateId}`);
        setStatus("Template updated successfully.");
      } else {
        const { data, error } = await supabase
          .from("debrief_templates")
          .insert([payload])
          .select("id")
          .single();

        if (error) {
          setStatus(`Failed to save template: ${error.message}`);
          return;
        }

        const newId = data.id as string;
        setSelectedTemplateId(newId);
        setGeneratedLink(`${origin}/driver/${newId}`);
        setStatus("Template saved successfully.");
      }

      await loadTemplates();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Failed to save template: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  function handleGenerateDriverLink() {
    if (!selectedTemplateId) {
      setStatus("Save the template to Supabase first, then generate the driver link.");
      return;
    }

    const link = `${origin}/driver/${selectedTemplateId}`;
    setGeneratedLink(link);
    setStatus("Driver link generated.");
  }

  function handleCopyLink() {
    if (!generatedLink) return;

    navigator.clipboard.writeText(generatedLink);
    setStatus("Link copied to clipboard.");
  }

  async function handleDeleteTemplate(templateId: string) {
    const confirmed = window.confirm("Delete this template?");
    if (!confirmed) return;

    const { error } = await supabase.from("debrief_templates").delete().eq("id", templateId);

    if (error) {
      setStatus(`Failed to delete template: ${error.message}`);
      return;
    }

    if (selectedTemplateId === templateId) {
      resetForm();
    }

    setStatus("Template deleted.");
    await loadTemplates();
  }

  return (
    <main className="min-h-screen bg-[#0A0E14] px-4 py-6 text-white md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] px-5 py-6 shadow-2xl md:px-8 md:py-7">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#E10600]">
            Rodin Motorsport
          </p>

          <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
                Debrief Template Creator
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#9CA3AF] md:text-base">
                Create a team template, position readable corner labels, add leader lines, save to
                Supabase, and generate a driver page link.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowHelp((prev) => !prev)}
              className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-5 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
            >
              {showHelp ? "Hide Help" : "Help / Controls"}
            </button>
          </div>

          {showHelp && (
            <div className="mt-6 rounded-3xl border border-yellow-400/30 bg-yellow-400/10 p-5 text-sm leading-6 text-yellow-50">
              <h2 className="text-lg font-semibold text-white">PC controls</h2>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-yellow-400/20 bg-black/20 p-4">
                  <div className="font-semibold text-white">Left-drag label</div>
                  <div className="mt-1 text-yellow-100">
                    Moves the visible T-number label to a clearer position.
                  </div>
                </div>

                <div className="rounded-2xl border border-yellow-400/20 bg-black/20 p-4">
                  <div className="font-semibold text-white">Right-click label</div>
                  <div className="mt-1 text-yellow-100">
                    Selects that corner so you can place its exact track point.
                  </div>
                </div>

                <div className="rounded-2xl border border-yellow-400/20 bg-black/20 p-4">
                  <div className="font-semibold text-white">
                    Left-click map after right-clicking
                  </div>
                  <div className="mt-1 text-yellow-100">
                    Places the actual corner point and draws the leader line.
                  </div>
                </div>

                <div className="rounded-2xl border border-yellow-400/20 bg-black/20 p-4">
                  <div className="font-semibold text-white">Double-click label</div>
                  <div className="mt-1 text-yellow-100">
                    Cycles colour: normal, blue, green, red.
                  </div>
                </div>
              </div>

              <p className="mt-4 text-yellow-100">
                Recommended workflow: upload the map, generate turns, drag labels into readable
                positions, then right-click each label and click its exact corner point on the track.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-5 shadow-2xl md:p-7">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-white">Team</label>
              <select
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none"
              >
                {TEAM_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white">Track Name</label>
              <input
                value={trackName}
                onChange={(e) => setTrackName(e.target.value)}
                className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white placeholder:text-slate-500 outline-none"
                placeholder="e.g. Silverstone GP"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-white">Track Map</label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSelectTrackMapClick}
                  className="rounded-2xl bg-[#E10600] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#C50500]"
                >
                  Select Track Map
                </button>

                <span className="self-center text-sm text-[#9CA3AF]">
                  JPG, PNG, WEBP supported
                </span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/png,image/jpeg,image/webp"
                onChange={handleTrackMapFileChange}
                className="hidden"
              />
            </div>

            <div className="w-full lg:w-[220px]">
              <label className="mb-2 block text-sm font-medium text-white">
                Amount of Turns
              </label>
              <input
                type="number"
                min={1}
                value={turnCount}
                onChange={(e) => setTurnCount(e.target.value)}
                className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleGenerateTurns}
              className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-5 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
            >
              Generate Turns
            </button>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-4 shadow-2xl md:p-6">
          <div className="mb-5 flex flex-col gap-4 border-b border-[#2A3441] pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">Track Map Preview</h2>
              <p className="mt-2 text-sm text-[#9CA3AF]">
                Left-drag labels to move them. Right-click a label, then click the exact track
                point. Double-click a label to change colour.
              </p>
            </div>

            <div className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm text-[#9CA3AF]">
              {anchorCornerId === null ? (
                <span>No anchor selected</span>
              ) : (
                <span className="font-semibold text-yellow-300">
                  Click map to place track point for T{anchorCornerId}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-[24px] bg-[#111827] p-3 sm:p-4">
            <div className="mx-auto w-full max-w-[900px]">
              <div
                className={`relative w-full overflow-hidden rounded-[20px] border bg-[#0F141C] ${
                  anchorCornerId === null ? "border-[#2A3441]" : "border-yellow-400"
                }`}
                style={{ aspectRatio: String(mapAspectRatio) }}
                onClick={handleMapClick}
                onPointerMove={handlePreviewPointerMove}
                onPointerUp={handlePreviewPointerUp}
                onPointerLeave={handlePreviewPointerUp}
                onContextMenu={(e) => e.preventDefault()}
              >
                {trackMapDataUrl ? (
                  <>
                    <img
                      src={trackMapDataUrl}
                      alt="Track map preview"
                      className="absolute inset-0 h-full w-full select-none"
                      draggable={false}
                      onLoad={(e) => {
                        const img = e.currentTarget;

                        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                          setMapAspectRatio(img.naturalWidth / img.naturalHeight);
                        }
                      }}
                    />

                    <svg className="pointer-events-none absolute inset-0 h-full w-full">
                      {corners.map((corner) => {
                        const cleanCorner = normaliseCorner(corner);
                        const labelX = cleanCorner.labelX ?? cleanCorner.x;
                        const labelY = cleanCorner.labelY ?? cleanCorner.y;

                        return (
                          <g key={`line-${cleanCorner.id}`}>
                            <line
                              x1={`${cleanCorner.x}%`}
                              y1={`${cleanCorner.y}%`}
                              x2={`${labelX}%`}
                              y2={`${labelY}%`}
                              stroke={
                                anchorCornerId === cleanCorner.id
                                  ? "rgba(250, 204, 21, 0.95)"
                                  : "rgba(255,255,255,0.72)"
                              }
                              strokeWidth={anchorCornerId === cleanCorner.id ? "2.4" : "1.5"}
                            />

                            <circle
                              cx={`${cleanCorner.x}%`}
                              cy={`${cleanCorner.y}%`}
                              r={anchorCornerId === cleanCorner.id ? "6" : "4"}
                              fill={
                                anchorCornerId === cleanCorner.id
                                  ? "rgba(250, 204, 21, 0.95)"
                                  : "rgba(255,255,255,0.95)"
                              }
                              stroke="rgba(0,0,0,0.85)"
                              strokeWidth="1"
                            />
                          </g>
                        );
                      })}
                    </svg>

                    {corners.map((corner) => {
                      const cleanCorner = normaliseCorner(corner);
                      const labelX = cleanCorner.labelX ?? cleanCorner.x;
                      const labelY = cleanCorner.labelY ?? cleanCorner.y;

                      return (
                        <button
                          key={cleanCorner.id}
                          type="button"
                          onPointerDown={(e) => handleMarkerPointerDown(e, cleanCorner.id)}
                          onContextMenu={(e) => handleMarkerRightClick(e, cleanCorner.id)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            cycleCornerColour(cleanCorner.id);
                          }}
                          className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-3 py-1.5 text-sm font-bold shadow-[0_0_14px_rgba(0,0,0,0.75)] transition hover:scale-110 sm:text-base ${
                            anchorCornerId === cleanCorner.id ? "ring-4 ring-yellow-300" : ""
                          } ${markerClass(cleanCorner.color)}`}
                          style={{
                            left: `${labelX}%`,
                            top: `${labelY}%`,
                            touchAction: "none",
                          }}
                          title={`T${cleanCorner.id}: drag to move label, right-click to set track point, double-click to colour`}
                        >
                          T{cleanCorner.id}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <div className="flex h-full min-h-[320px] items-center justify-center px-6 text-center text-sm text-[#9CA3AF]">
                    Select a track map, then generate turns.
                  </div>
                )}
              </div>
            </div>
          </div>

          {corners.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={addSingleCorner}
                className="rounded-2xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm font-semibold text-green-300 transition hover:bg-green-500/20"
              >
                Add Single Turn
              </button>

              <button
                type="button"
                onClick={removeLastCorner}
                className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
              >
                Remove Last Turn
              </button>

              <button
                type="button"
                onClick={resetLabelPositionsToTrackPoints}
                className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-yellow-400"
              >
                Reset Labels to Track Points
              </button>

              <button
                type="button"
                onClick={() => {
                  setAnchorCornerId(null);
                  setStatus("Anchor selection cancelled.");
                }}
                className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-yellow-400"
              >
                Cancel Anchor Selection
              </button>

              <button
                type="button"
                onClick={resetCorners}
                className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
              >
                Reset All Turns
              </button>
            </div>
          )}

          {corners.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortCornersById(corners).map((corner) => {
                const cleanCorner = normaliseCorner(corner);

                return (
                  <div
                    key={cleanCorner.id}
                    className="flex items-center justify-between rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3"
                  >
                    <div className="text-sm text-white">
                      <div className="font-semibold">T{cleanCorner.id}</div>
                      <div className="mt-1 text-xs text-[#9CA3AF]">
                        Point {cleanCorner.x.toFixed(1)} / {cleanCorner.y.toFixed(1)}
                      </div>
                      <div className="text-xs text-[#9CA3AF]">
                        Label {(cleanCorner.labelX ?? cleanCorner.x).toFixed(1)} /{" "}
                        {(cleanCorner.labelY ?? cleanCorner.y).toFixed(1)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeSpecificCorner(cleanCorner.id)}
                      className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-300 transition hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-5 shadow-2xl md:p-7">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={saving}
              className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-5 py-3 text-sm font-semibold text-white transition hover:border-[#E10600] disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : selectedTemplateId
                  ? "Update Template"
                  : "Save Template to Supabase"}
            </button>

            <button
              type="button"
              onClick={handleGenerateDriverLink}
              className="rounded-2xl bg-[#E10600] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#C50500]"
            >
              Generate Driver Link
            </button>

            {generatedLink && (
              <button
                type="button"
                onClick={handleCopyLink}
                className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-5 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
              >
                Copy Link
              </button>
            )}

            {selectedTemplateId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-5 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
              >
                New Template
              </button>
            )}
          </div>

          {generatedLink && (
            <div className="mt-4 break-all rounded-2xl border border-[#2A3441] bg-[#1B2430] p-4 text-sm text-[#9CA3AF]">
              {generatedLink}
            </div>
          )}

          {status && (
            <div className="mt-4 rounded-2xl border border-[#2A3441] bg-[#1B2430] p-4 text-sm text-[#9CA3AF]">
              {status}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-5 shadow-2xl md:p-7">
          <h2 className="text-2xl font-semibold text-white">Saved Templates</h2>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            Showing templates for {team}. Change the team selection at the top to filter this list.
          </p>

          {loadingTemplates ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">Loading templates...</p>
          ) : filteredTemplates.length === 0 ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">
              No templates saved for {team} yet.
            </p>
          ) : (
            <div className="mt-5 grid gap-4">
              {filteredTemplates.map((template) => {
                const driverUrl = `${origin}/driver/${template.id}`;

                return (
                  <div
                    key={template.id}
                    className="rounded-3xl border border-[#2A3441] bg-[#111827] p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-[#2A3441] bg-[#1B2430] px-3 py-1 text-xs font-semibold text-white">
                            {template.team || "No team"}
                          </span>

                          <span className="rounded-full border border-[#2A3441] bg-[#1B2430] px-3 py-1 text-xs font-semibold text-white">
                            {template.corner_count} turns
                          </span>
                        </div>

                        <h3 className="text-xl font-semibold text-white">
                          {template.track_name}
                        </h3>

                        <p className="break-all text-sm text-[#9CA3AF]">{driverUrl}</p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => loadTemplateIntoForm(template)}
                          className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
                        >
                          Edit
                        </button>

                        <Link
                          href={`/driver/${template.id}`}
                          className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
                        >
                          Open Driver Page
                        </Link>

                        <button
                          type="button"
                          onClick={() => {
                            setGeneratedLink(driverUrl);
                            navigator.clipboard.writeText(driverUrl);
                            setStatus("Link copied to clipboard.");
                          }}
                          className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
                        >
                          Copy Link
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(template.id)}
                          className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}