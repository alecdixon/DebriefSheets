"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TurnColor = "normal" | "blue" | "green" | "red";

type TurnMarker = {
  id: number;
  label: number;
  x: number; // percent
  y: number; // percent
  color: TurnColor;
};

type LocalTemplate = {
  id: string;
  team: string;
  trackName: string;
  trackMapDataUrl: string;
  turnCount: number;
  turns: TurnMarker[];
  createdAt: string;
};

const TEAM_OPTIONS = ["GB3", "GT3", "British F4", "FIA F3", "FIA F2", "FREC"];
const STORAGE_KEY = "debrief_local_templates_v1";

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

function buildInitialTurns(count: number): TurnMarker[] {
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
      label: i + 1,
      x,
      y,
      color: "normal" as TurnColor,
    };
  });
}

function readTemplates(): LocalTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalTemplate[];
  } catch {
    return [];
  }
}

function writeTemplates(templates: LocalTemplate[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export default function CreatorPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [team, setTeam] = useState("GB3");
  const [trackName, setTrackName] = useState("");
  const [trackMapDataUrl, setTrackMapDataUrl] = useState("");
  const [turnCount, setTurnCount] = useState("10");
  const [turns, setTurns] = useState<TurnMarker[]>([]);
  const [selectedColour, setSelectedColour] = useState<TurnColor>("normal");
  const [status, setStatus] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [mapAspectRatio, setMapAspectRatio] = useState<number>(1.6);
  const [origin, setOrigin] = useState("");
  const [savedTemplates, setSavedTemplates] = useState<LocalTemplate[]>([]);

  const dragRef = useRef<{
    pointerId: number | null;
    markerId: number | null;
    moved: boolean;
  }>({
    pointerId: null,
    markerId: null,
    moved: false,
  });

  useEffect(() => {
    setOrigin(window.location.origin);
    setSavedTemplates(readTemplates());
  }, []);

  const canGenerate = useMemo(() => {
    return (
      team.trim() !== "" &&
      trackName.trim() !== "" &&
      trackMapDataUrl.trim() !== "" &&
      turns.length > 0
    );
  }, [team, trackName, trackMapDataUrl, turns]);

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

    setTurns(buildInitialTurns(count));
    setStatus(`${count} turns generated. Drag them onto the corners.`);
  }

  function updateMarkerPosition(
    markerId: number,
    clientX: number,
    clientY: number,
    container: HTMLDivElement
  ) {
    const rect = container.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    const clampedX = Math.max(3, Math.min(97, x));
    const clampedY = Math.max(4, Math.min(96, y));

    setTurns((prev) =>
      prev.map((turn) =>
        turn.id === markerId ? { ...turn, x: clampedX, y: clampedY } : turn
      )
    );
  }

  function handleMarkerPointerDown(
    e: React.PointerEvent<HTMLButtonElement>,
    markerId: number
  ) {
    e.stopPropagation();
    dragRef.current = {
      pointerId: e.pointerId,
      markerId,
      moved: false,
    };
  }

  function handlePreviewPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag.pointerId !== e.pointerId || drag.markerId === null) return;

    dragRef.current.moved = true;
    updateMarkerPosition(drag.markerId, e.clientX, e.clientY, e.currentTarget);
  }

  function handlePreviewPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag.pointerId !== e.pointerId || drag.markerId === null) return;

    const markerId = drag.markerId;
    const moved = drag.moved;

    dragRef.current = {
      pointerId: null,
      markerId: null,
      moved: false,
    };

    if (!moved) {
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === markerId ? { ...turn, color: selectedColour } : turn
        )
      );
    }
  }

  function saveTemplateToLocalStorage(templateId?: string) {
    const id = templateId ?? `tpl_${Date.now()}`;

    const template: LocalTemplate = {
      id,
      team,
      trackName: trackName.trim(),
      trackMapDataUrl,
      turnCount: turns.length,
      turns,
      createdAt: new Date().toISOString(),
    };

    const existing = readTemplates();
    const withoutCurrent = existing.filter((item) => item.id !== id);
    const updated = [template, ...withoutCurrent];

    writeTemplates(updated);
    setSavedTemplates(updated);

    return template;
  }

  function handleSaveTemplateLocally() {
    if (!canGenerate) {
      setStatus("Please choose a team, enter a track name, select a map, and generate turns first.");
      return;
    }

    const saved = saveTemplateToLocalStorage();
    setStatus(`Template saved locally: ${saved.trackName} (${saved.team})`);
  }

  function handleGenerateDriverLink() {
    if (!canGenerate) {
      setStatus("Please complete the template first.");
      return;
    }

    const saved = saveTemplateToLocalStorage();
    const link = `${origin}/driver?localTemplateId=${saved.id}`;
    setGeneratedLink(link);
    setStatus("Driver link generated.");
  }

  function handleCopyLink() {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setStatus("Link copied to clipboard.");
  }

  function handleLoadSavedTemplate(template: LocalTemplate) {
    setTeam(template.team);
    setTrackName(template.trackName);
    setTrackMapDataUrl(template.trackMapDataUrl);
    setTurnCount(String(template.turnCount));
    setTurns(template.turns);
    setGeneratedLink(`${origin}/driver?localTemplateId=${template.id}`);
    setStatus(`Loaded local template: ${template.trackName}`);
  }

  function handleDeleteSavedTemplate(templateId: string) {
    const updated = readTemplates().filter((item) => item.id !== templateId);
    writeTemplates(updated);
    setSavedTemplates(updated);
    setStatus("Local template deleted.");
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
            Create a local team-specific template, drag turns onto the map, colour-code
            the markers, save locally, and generate a driver link.
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
                Drag the turn numbers onto the corners. Tap a turn to apply the selected colour mode.
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

                    {turns.map((turn) => (
                      <button
                        key={turn.id}
                        type="button"
                        onPointerDown={(e) => handleMarkerPointerDown(e, turn.id)}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1.5 text-sm font-semibold shadow-lg transition sm:text-base ${markerClass(
                          turn.color
                        )}`}
                        style={{
                          left: `${turn.x}%`,
                          top: `${turn.y}%`,
                          touchAction: "none",
                        }}
                      >
                        {turn.label}
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
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-5 shadow-2xl md:p-7">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSaveTemplateLocally}
              className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-5 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
            >
              Save Template Locally
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
          <h2 className="text-2xl font-semibold text-white">Saved Local Templates</h2>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            These are stored in this browser only.
          </p>

          {savedTemplates.length === 0 ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">No local templates saved yet.</p>
          ) : (
            <div className="mt-5 grid gap-4">
              {savedTemplates.map((template) => (
                <div
                  key={template.id}
                  className="rounded-3xl border border-[#2A3441] bg-[#111827] p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-[#2A3441] bg-[#1B2430] px-3 py-1 text-xs font-semibold text-white">
                          {template.team}
                        </span>
                        <span className="rounded-full border border-[#2A3441] bg-[#1B2430] px-3 py-1 text-xs font-semibold text-white">
                          {template.turnCount} turns
                        </span>
                      </div>
                      <h3 className="text-xl font-semibold text-white">
                        {template.trackName}
                      </h3>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => handleLoadSavedTemplate(template)}
                        className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
                      >
                        Load
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setGeneratedLink(`${origin}/driver?localTemplateId=${template.id}`)
                        }
                        className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
                      >
                        Build Link
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSavedTemplate(template.id)}
                        className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}