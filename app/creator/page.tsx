"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Corner = {
  id: number;
  x: number;
  y: number;
};

type SavedTemplate = {
  id: string;
  trackName: string;
  cornerCount: number;
  trackMap: string | null;
  corners: Corner[];
  createdAt: string;
};

function makeDefaultCorners(count: number): Corner[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    x: 16 + ((i * 9) % 68),
    y: 18 + ((i * 7) % 58),
  }));
}

const STORAGE_KEY = "driver-debrief-templates";

export default function CreatorPage() {
  const [trackName, setTrackName] = useState("");
  const [cornerCount, setCornerCount] = useState(9);
  const [trackMap, setTrackMap] = useState<string | null>(null);
  const [templateCreated, setTemplateCreated] = useState(false);
  const [corners, setCorners] = useState<Corner[]>([]);
  const [draggingCornerId, setDraggingCornerId] = useState<number | null>(null);

  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const [shareLink, setShareLink] = useState("");
  const [cloudSaveMessage, setCloudSaveMessage] = useState("");

  const mapRef = useRef<HTMLDivElement | null>(null);

  const canCreate = useMemo(() => {
    return trackName.trim() !== "" && trackMap !== null && cornerCount > 0;
  }, [trackName, trackMap, cornerCount]);

  const canSave = useMemo(() => {
    return (
      trackName.trim() !== "" &&
      trackMap !== null &&
      corners.length > 0 &&
      templateCreated
    );
  }, [trackName, trackMap, corners, templateCreated]);

  useEffect(() => {
    loadSavedTemplates();
  }, []);

  function loadSavedTemplates() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setSavedTemplates([]);
        return;
      }

      const parsed = JSON.parse(raw) as SavedTemplate[];
      setSavedTemplates(parsed);
    } catch {
      setSavedTemplates([]);
    }
  }

  function persistTemplates(templates: SavedTemplate[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    setSavedTemplates(templates);
  }

  function handleTrackMapUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setTrackMap(reader.result as string);
      setTemplateCreated(false);
      setCorners([]);
      setSaveMessage("");
      setCloudSaveMessage("");
      setShareLink("");
    };
    reader.readAsDataURL(file);
  }

  function handleCreateTemplate() {
    const safeCornerCount = Math.max(1, Math.min(40, cornerCount));
    setCorners(makeDefaultCorners(safeCornerCount));
    setTemplateCreated(true);
    setSaveMessage("");
    setCloudSaveMessage("");
    setShareLink("");
  }

  function updateCornerPosition(cornerId: number, clientX: number, clientY: number) {
    if (!mapRef.current) return;

    const rect = mapRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    const clampedX = Math.max(2, Math.min(98, x));
    const clampedY = Math.max(2, Math.min(98, y));

    setCorners((prev) =>
      prev.map((corner) =>
        corner.id === cornerId ? { ...corner, x: clampedX, y: clampedY } : corner
      )
    );
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (draggingCornerId === null) return;
    updateCornerPosition(draggingCornerId, e.clientX, e.clientY);
  }

  function handleMouseUp() {
    setDraggingCornerId(null);
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (draggingCornerId === null) return;
    const touch = e.touches[0];
    if (!touch) return;
    updateCornerPosition(draggingCornerId, touch.clientX, touch.clientY);
  }

  function handleTouchEnd() {
    setDraggingCornerId(null);
  }

  function handleSaveTemplate() {
    if (!canSave) return;

    const newTemplate: SavedTemplate = {
      id: crypto.randomUUID(),
      trackName: trackName.trim(),
      cornerCount,
      trackMap,
      corners,
      createdAt: new Date().toISOString(),
    };

    const updated = [newTemplate, ...savedTemplates];
    persistTemplates(updated);
    setSelectedTemplateId(newTemplate.id);
    setSaveMessage("Template saved locally.");
    setCloudSaveMessage("");
  }

  function handleLoadTemplate() {
    if (!selectedTemplateId) return;

    const selected = savedTemplates.find((t) => t.id === selectedTemplateId);
    if (!selected) return;

    setTrackName(selected.trackName);
    setCornerCount(selected.cornerCount);
    setTrackMap(selected.trackMap);
    setCorners(selected.corners);
    setTemplateCreated(true);
    setSaveMessage("Template loaded.");
    setCloudSaveMessage("");
    setShareLink("");
  }

  function handleDeleteTemplate() {
    if (!selectedTemplateId) return;

    const updated = savedTemplates.filter((t) => t.id !== selectedTemplateId);
    persistTemplates(updated);
    setSelectedTemplateId("");
    setSaveMessage("Template deleted.");
    setCloudSaveMessage("");
    setShareLink("");
  }

  function handleNewBlankTemplate() {
    setTrackName("");
    setCornerCount(9);
    setTrackMap(null);
    setCorners([]);
    setTemplateCreated(false);
    setDraggingCornerId(null);
    setSaveMessage("");
    setCloudSaveMessage("");
    setShareLink("");
  }

  async function handleSaveTemplateToCloud() {
    if (!trackMap || !templateCreated || corners.length === 0 || !trackName.trim()) {
      setCloudSaveMessage("Complete the template before saving to cloud.");
      return;
    }

    try {
      setCloudSaveMessage("Uploading track map...");
      setShareLink("");

      const response = await fetch(trackMap);
      const blob = await response.blob();

      const fileName = `${crypto.randomUUID()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("track-maps")
        .upload(fileName, blob, {
          contentType: "image/png",
          upsert: false,
        });

      if (uploadError) {
        setCloudSaveMessage(`Track map upload failed: ${uploadError.message}`);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("track-maps")
        .getPublicUrl(fileName);

      setCloudSaveMessage("Saving template to database...");

      const { data, error } = await supabase
        .from("debrief_templates")
        .insert({
          track_name: trackName.trim(),
          corner_count: cornerCount,
          track_map_url: publicUrlData.publicUrl,
          corners: corners,
        })
        .select("id")
        .single();

      if (error) {
        setCloudSaveMessage(`Database save failed: ${error.message}`);
        return;
      }

      const link = `${window.location.origin}/driver/${data.id}`;
      setShareLink(link);
      setCloudSaveMessage("Template saved to cloud.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setCloudSaveMessage(`Save failed: ${message}`);
    }
  }

  return (
    <main className="min-h-screen bg-[#0A0E14] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-[30px] border border-[#2A3441] bg-[#141A22] px-6 py-8 shadow-2xl md:px-8 md:py-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#E10600]">
                Rodin Motorsport
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-white md:text-5xl">
                Debrief Template Builder
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9CA3AF] md:text-base">
                Upload a circuit map, define the number of corners, drag the markers
                into place, and generate a driver link for WhatsApp.
              </p>
            </div>

            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                templateCreated
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-[#2A3441] bg-[#1B2430] text-[#9CA3AF]"
              }`}
            >
              {templateCreated ? "Template draft created" : "Template not created yet"}
            </div>
          </div>
        </section>

        <section className="grid gap-8 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-8">
            <div className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl md:p-7">
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">
                  Setup
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Template Inputs
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#9CA3AF]">
                  Define the circuit and generate the initial corner layout.
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-white">
                    Track name
                  </label>
                  <input
                    className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-[#E10600]"
                    placeholder="Brands Hatch GP"
                    value={trackName}
                    onChange={(e) => setTrackName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white">
                    Number of corners
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none transition focus:border-[#E10600]"
                    value={cornerCount}
                    onChange={(e) => setCornerCount(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white">
                    Track map image
                  </label>
                  <div className="rounded-2xl border border-dashed border-[#2A3441] bg-[#1B2430] p-4">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleTrackMapUpload}
                      className="block w-full text-sm text-[#9CA3AF] file:mr-4 file:rounded-xl file:border-0 file:bg-[#E10600] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#C50500]"
                    />
                    <p className="mt-3 text-xs leading-5 text-[#9CA3AF]">
                      Use a clean track image with enough space around the layout
                      for corner labels.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={handleCreateTemplate}
                    disabled={!canCreate}
                    className="rounded-2xl bg-[#E10600] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#C50500] disabled:cursor-not-allowed disabled:bg-[#2A3441] disabled:text-[#9CA3AF]"
                  >
                    Create Initial Template
                  </button>

                  <button
                    onClick={handleSaveTemplate}
                    disabled={!canSave}
                    className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#E10600] hover:text-white disabled:cursor-not-allowed disabled:text-[#9CA3AF]"
                  >
                    Save Locally
                  </button>
                </div>

                <button
                  onClick={handleSaveTemplateToCloud}
                  disabled={!canSave}
                  className="w-full rounded-2xl bg-[#E10600] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#C50500] disabled:cursor-not-allowed disabled:bg-[#2A3441] disabled:text-[#9CA3AF]"
                >
                  Save Template to Cloud
                </button>

                <button
                  onClick={handleNewBlankTemplate}
                  className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-[#9CA3AF] transition hover:text-white"
                >
                  New Blank Template
                </button>

                {templateCreated && (
                  <div className="rounded-2xl border border-[#2A3441] bg-[#1B2430] p-4 text-sm text-[#9CA3AF]">
                    Drag each corner marker to its exact position on the circuit map.
                  </div>
                )}

                {saveMessage && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                    {saveMessage}
                  </div>
                )}

                {cloudSaveMessage && (
                  <div className="rounded-2xl border border-[#2A3441] bg-[#1B2430] p-4 text-sm text-[#9CA3AF]">
                    {cloudSaveMessage}
                  </div>
                )}

                {shareLink && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm">
                    <div className="font-semibold text-emerald-300">Driver link ready</div>
                    <div className="mt-2 break-all text-white">{shareLink}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl md:p-7">
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">
                  Library
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Saved Templates
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#9CA3AF]">
                  Load an existing local template instead of rebuilding it each time.
                </p>
              </div>

              <div className="space-y-4">
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none"
                >
                  <option value="">Select saved template</option>
                  {savedTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.trackName} ({template.cornerCount} corners)
                    </option>
                  ))}
                </select>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={handleLoadTemplate}
                    disabled={!selectedTemplateId}
                    className="rounded-2xl bg-[#E10600] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#C50500] disabled:cursor-not-allowed disabled:bg-[#2A3441] disabled:text-[#9CA3AF]"
                  >
                    Load Template
                  </button>

                  <button
                    onClick={handleDeleteTemplate}
                    disabled={!selectedTemplateId}
                    className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-red-500 hover:text-red-300 disabled:cursor-not-allowed disabled:text-[#9CA3AF]"
                  >
                    Delete Template
                  </button>
                </div>

                <div className="text-sm text-[#9CA3AF]">
                  {savedTemplates.length === 0
                    ? "No templates saved locally yet."
                    : `${savedTemplates.length} template(s) saved in this browser.`}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-5 shadow-2xl md:p-6">
            <div className="mb-5 flex flex-col gap-4 border-b border-[#2A3441] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">
                  Preview
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Circuit Template
                </h2>
              </div>

              <div className="flex flex-wrap gap-2 text-sm">
                <div className="rounded-full border border-[#2A3441] bg-[#1B2430] px-3 py-1.5 text-white">
                  {trackName || "Track not set"}
                </div>
                <div className="rounded-full border border-[#2A3441] bg-[#1B2430] px-3 py-1.5 text-white">
                  {cornerCount} corners
                </div>
              </div>
            </div>

            {!trackMap ? (
              <div className="flex min-h-[520px] items-center justify-center rounded-[24px] border border-dashed border-[#2A3441] bg-[#111827] px-6 text-center">
                <div>
                  <p className="text-lg font-medium text-white">
                    No circuit map loaded
                  </p>
                  <p className="mt-2 text-sm text-[#9CA3AF]">
                    Upload a map on the left to begin building the template.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] bg-[#111827] p-4">
                <div
                  ref={mapRef}
                  className="relative min-h-[620px] overflow-hidden rounded-[20px] border border-[#2A3441] bg-[#0F141C]"
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <img
                    src={trackMap}
                    alt="Track map preview"
                    className="h-full w-full object-contain select-none"
                    draggable={false}
                  />

                  {templateCreated &&
                    corners.map((corner) => (
                      <button
                        key={corner.id}
                        type="button"
                        onMouseDown={() => setDraggingCornerId(corner.id)}
                        onTouchStart={() => setDraggingCornerId(corner.id)}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1 text-base font-semibold text-white shadow-lg transition ${
                          draggingCornerId === corner.id
                            ? "border-[#E10600] bg-[#E10600]"
                            : "border-[#2A3441] bg-[#141A22]/95"
                        }`}
                        style={{
                          left: `${corner.x}%`,
                          top: `${corner.y}%`,
                        }}
                      >
                        T{corner.id}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}