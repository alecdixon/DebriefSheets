"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type TurnColor = "normal" | "blue" | "green" | "red";

type Corner = {
  id: number;
  x: number;
  y: number;
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

const TEAM_OPTIONS = ["GB3", "GT3", "British F4", "FIA F3", "FIA F2", "FREC"];

function colourButtonClass(active: boolean) {
  return active
    ? "border-[#E10600] bg-[#E10600] text-white"
    : "border-[#2A3441] bg-[#1B2430] text-white";
}

function markerClass(color: TurnColor) {
  switch (color) {
    case "blue":
      return "bg-blue-600 text-white border-blue-400";
    case "green":
      return "bg-green-600 text-white border-green-400";
    case "red":
      return "bg-red-600 text-white border-red-400";
    default:
      return "bg-black text-white border-white/20";
  }
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
      color: "normal" as TurnColor,
    };
  });
}

function sortCornersById(corners: Corner[]): Corner[] {
  return [...corners].sort((a, b) => a.id - b.id);
}

export default function CreatorPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [team, setTeam] = useState("GB3");
  const [trackName, setTrackName] = useState("");
  const [trackMapDataUrl, setTrackMapDataUrl] = useState("");
  const [turnCount, setTurnCount] = useState("10");
  const [corners, setCorners] = useState<Corner[]>([]);
  const [selectedColour, setSelectedColour] = useState<TurnColor>("normal");

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

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

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId]
  );

  function resetForm() {
    setSelectedTemplateId(null);
    setTeam("GB3");
    setTrackName("");
    setTrackMapDataUrl("");
    setTurnCount("10");
    setCorners([]);
    setSelectedColour("normal");
    setGeneratedLink("");
    setMapAspectRatio(1.6);
    setStatus("");
  }

  function loadTemplateIntoForm(template: Template) {
    setSelectedTemplateId(template.id);
    setTeam(template.team || "GB3");
    setTrackName(template.track_name || "");
    setTrackMapDataUrl(template.track_map_url || "");
    setCorners(sortCornersById((template.corners ?? []) as Corner[]));
    setTurnCount(String(template.corner_count || (template.corners ?? []).length || 0));
    setGeneratedLink(`${origin}/driver/${template.id}`);
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
    setStatus(`${count} turns generated. Drag them onto the corners.`);
  }

  function updateCornerPosition(
    cornerId: number,
    clientX: number,
    clientY: number,
    container: HTMLDivElement
  ) {
    const rect = container.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    const clampedX = Math.max(3, Math.min(97, x));
    const clampedY = Math.max(4, Math.min(96, y));

    setCorners((prev) =>
      prev.map((corner) =>
        corner.id === cornerId ? { ...corner, x: clampedX, y: clampedY } : corner
      )
    );
  }

  function handleMarkerPointerDown(
    e: React.PointerEvent<HTMLButtonElement>,
    cornerId: number
  ) {
    e.stopPropagation();
    dragRef.current = {
      pointerId: e.pointerId,
      cornerId,
      moved: false,
    };
  }

  function handlePreviewPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag.pointerId !== e.pointerId || drag.cornerId === null) return;

    dragRef.current.moved = true;
    updateCornerPosition(drag.cornerId, e.clientX, e.clientY, e.currentTarget);
  }

  function handlePreviewPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag.pointerId !== e.pointerId || drag.cornerId === null) return;

    const cornerId = drag.cornerId;
    const moved = drag.moved;

    dragRef.current = {
      pointerId: null,
      cornerId: null,
      moved: false,
    };

    if (!moved) {
      setCorners((prev) =>
        prev.map((corner) =>
          corner.id === cornerId ? { ...corner, color: selectedColour } : corner
        )
      );
    }
  }

  function removeLastCorner() {
    setCorners((prev) => prev.slice(0, -1));
  }

  function resetCorners() {
    setCorners([]);
  }

  function removeSpecificCorner(cornerId: number) {
    setCorners((prev) => prev.filter((corner) => corner.id !== cornerId));
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

    const { error } = await supabase
      .from("debrief_templates")
      .delete()
      .eq("id", templateId);

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
          <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
            Debrief Template Creator
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#9CA3AF] md:text-base">
            Create a team template, position T1/T2/T3 markers on the map, colour-code them,
            save to Supabase, and generate a shareable driver page link.
          </p>
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-5 shadow-2xl md:p-7">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-white">
                Team
              </label>
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
              <label className="mb-2 block text-sm font-medium text-white">
                Track Name
              </label>
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
              <label className="mb-2 block text-sm font-medium text-white">
                Track Map
              </label>
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
                Drag T1, T2, T3... onto the corners. Tap a marker to set its current colour mode.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedColour("normal")}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${colourButtonClass(
                  selectedColour === "normal"
                )}`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setSelectedColour("blue")}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${colourButtonClass(
                  selectedColour === "blue"
                )}`}
              >
                Blue
              </button>
              <button
                type="button"
                onClick={() => setSelectedColour("green")}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${colourButtonClass(
                  selectedColour === "green"
                )}`}
              >
                Green
              </button>
              <button
                type="button"
                onClick={() => setSelectedColour("red")}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${colourButtonClass(
                  selectedColour === "red"
                )}`}
              >
                Red
              </button>
            </div>
          </div>

          <div className="rounded-[24px] bg-[#111827] p-3 sm:p-4">
            <div className="mx-auto w-full max-w-[900px]">
              <div
                className="relative w-full overflow-hidden rounded-[20px] border border-[#2A3441] bg-[#0F141C]"
                style={{ aspectRatio: String(mapAspectRatio) }}
                onPointerMove={handlePreviewPointerMove}
                onPointerUp={handlePreviewPointerUp}
                onPointerLeave={handlePreviewPointerUp}
              >
                {trackMapDataUrl ? (
                  <>
                    <img
                      src={trackMapDataUrl}
                      alt="Track map preview"
                      className="absolute inset-0 h-full w-full"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                          setMapAspectRatio(img.naturalWidth / img.naturalHeight);
                        }
                      }}
                    />

                    {corners.map((corner) => (
                      <button
                        key={corner.id}
                        type="button"
                        onPointerDown={(e) => handleMarkerPointerDown(e, corner.id)}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1.5 text-sm font-semibold shadow-lg transition sm:text-base ${markerClass(
                          corner.color
                        )}`}
                        style={{
                          left: `${corner.x}%`,
                          top: `${corner.y}%`,
                          touchAction: "none",
                        }}
                      >
                        T{corner.id}
                      </button>
                    ))}
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
                onClick={removeLastCorner}
                className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
              >
                Remove Last Turn
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
              {corners.map((corner) => (
                <div
                  key={corner.id}
                  className="flex items-center justify-between rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3"
                >
                  <div className="text-sm text-white">
                    T{corner.id} — x {corner.x.toFixed(1)} / y {corner.y.toFixed(1)}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSpecificCorner(corner.id)}
                    className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-300 transition hover:bg-red-500/20"
                  >
                    Remove
                  </button>
                </div>
              ))}
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
              {saving ? "Saving..." : selectedTemplateId ? "Update Template" : "Save Template to Supabase"}
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
            <div className="mt-4 rounded-2xl border border-[#2A3441] bg-[#1B2430] p-4 text-sm text-[#9CA3AF] break-all">
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
            Load one to edit it, or open the live driver page.
          </p>

          {loadingTemplates ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">Loading templates...</p>
          ) : templates.length === 0 ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">No templates saved yet.</p>
          ) : (
            <div className="mt-5 grid gap-4">
              {templates.map((template) => {
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