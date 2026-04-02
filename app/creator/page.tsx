"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Corner = {
  id: number;
  x: number;
  y: number;
};

type Template = {
  id: string;
  track_name: string;
  team: string;
  corner_count: number;
  track_map_url: string | null;
  corners: Corner[];
};

const TEAM_OPTIONS = [
  "GB3",
  "GT3",
  "British F4",
  "FIA F3",
  "FIA F2",
  "FREC",
];

function normaliseCorners(corners: Corner[]): Corner[] {
  return corners.map((corner, index) => ({
    ...corner,
    id: index + 1,
  }));
}

export default function CreatorPage() {
  const [team, setTeam] = useState("GB3");
  const [trackName, setTrackName] = useState("");
  const [trackMapUrl, setTrackMapUrl] = useState("");
  const [corners, setCorners] = useState<Corner[]>([]);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const [status, setStatus] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [saving, setSaving] = useState(false);

  const [mapAspectRatio, setMapAspectRatio] = useState<number>(1);
  const [origin, setOrigin] = useState("");

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
      .select("id, track_name, team, corner_count, track_map_url, corners")
      .order("track_name", { ascending: true });

    if (error) {
      setStatus(`Failed to load templates: ${error.message}`);
    } else {
      setTemplates((data ?? []) as Template[]);
    }

    setLoadingTemplates(false);
  }

  const selectedTemplate = useMemo(() => {
    return templates.find((template) => template.id === selectedTemplateId) ?? null;
  }, [templates, selectedTemplateId]);

  const nextCornerNumber = useMemo(() => corners.length + 1, [corners.length]);

  function resetForm() {
    setSelectedTemplateId(null);
    setTeam("GB3");
    setTrackName("");
    setTrackMapUrl("");
    setCorners([]);
    setMapAspectRatio(1);
    setStatus("");
  }

  function loadTemplateIntoForm(template: Template) {
    setSelectedTemplateId(template.id);
    setTeam(template.team || "GB3");
    setTrackName(template.track_name || "");
    setTrackMapUrl(template.track_map_url || "");
    setCorners(normaliseCorners(template.corners || []));
    setStatus(`Editing template: ${template.track_name}`);
  }

  function addCornerFromClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!trackMapUrl.trim()) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newCorner: Corner = {
      id: nextCornerNumber,
      x,
      y,
    };

    setCorners((prev) => [...prev, newCorner]);
  }

  function removeLastCorner() {
    setCorners((prev) => prev.slice(0, -1));
  }

  function resetCorners() {
    setCorners([]);
  }

  function removeCorner(cornerId: number) {
    setCorners((prev) =>
      normaliseCorners(prev.filter((corner) => corner.id !== cornerId))
    );
  }

  async function handleSaveTemplate() {
    if (!trackName.trim()) {
      setStatus("Please enter a track name.");
      return;
    }

    if (!team.trim()) {
      setStatus("Please select a team.");
      return;
    }

    if (!trackMapUrl.trim()) {
      setStatus("Please enter a track map URL.");
      return;
    }

    if (corners.length === 0) {
      setStatus("Please place at least one corner on the map.");
      return;
    }

    try {
      setSaving(true);
      setStatus(selectedTemplateId ? "Updating template..." : "Saving template...");

      const payload = {
        track_name: trackName.trim(),
        team,
        corner_count: corners.length,
        track_map_url: trackMapUrl.trim(),
        corners: normaliseCorners(corners),
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

        setStatus("Template updated successfully.");
      } else {
        const { error } = await supabase
          .from("debrief_templates")
          .insert([payload]);

        if (error) {
          setStatus(`Failed to save template: ${error.message}`);
          return;
        }

        setStatus(`Template saved successfully for ${team}.`);
      }

      await loadTemplates();
      resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Failed to save template: ${message}`);
    } finally {
      setSaving(false);
    }
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
            Create and edit team-specific debrief templates. The team saved on the
            template controls which engineers appear on the driver page.
          </p>
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-5 shadow-2xl md:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
            >
              New Template
            </button>

            {selectedTemplate && (
              <div className="rounded-full border border-[#2A3441] bg-[#1B2430] px-4 py-2 text-sm text-white">
                Editing: {selectedTemplate.track_name}
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
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
                Track name
              </label>
              <input
                value={trackName}
                onChange={(e) => setTrackName(e.target.value)}
                className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white placeholder:text-slate-500 outline-none"
                placeholder="e.g. Silverstone GP"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-white">
              Track map URL
            </label>
            <input
              value={trackMapUrl}
              onChange={(e) => setTrackMapUrl(e.target.value)}
              className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white placeholder:text-slate-500 outline-none"
              placeholder="Paste image URL"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <div className="rounded-full border border-[#2A3441] bg-[#1B2430] px-3 py-1.5 text-white">
              Team: {team}
            </div>
            <div className="rounded-full border border-[#2A3441] bg-[#1B2430] px-3 py-1.5 text-white">
              Corners placed: {corners.length}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-4 shadow-2xl md:p-6">
          <div className="mb-5 flex flex-col gap-4 border-b border-[#2A3441] pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">Track Map</h2>
              <p className="mt-2 text-sm text-[#9CA3AF]">
                Click on the map to place corners in order. Click the small remove
                button in the list below to delete a specific corner.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={removeLastCorner}
                className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
              >
                Remove Last Corner
              </button>

              <button
                type="button"
                onClick={resetCorners}
                className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
              >
                Reset All Corners
              </button>
            </div>
          </div>

          <div className="rounded-[24px] bg-[#111827] p-3 sm:p-4">
            <div className="mx-auto w-full max-w-[760px]">
              <div
                className="relative w-full overflow-hidden rounded-[20px] border border-[#2A3441] bg-[#0F141C]"
                style={{ aspectRatio: String(mapAspectRatio) }}
                onClick={addCornerFromClick}
              >
                {trackMapUrl.trim() ? (
                  <>
                    <img
                      src={trackMapUrl}
                      alt="Track map"
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
                        onClick={(e) => e.stopPropagation()}
                        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#E10600] bg-[#E10600] px-2.5 py-1 text-sm font-semibold text-white shadow-lg sm:px-3 sm:py-1.5 sm:text-base"
                        style={{
                          left: `${corner.x}%`,
                          top: `${corner.y}%`,
                        }}
                      >
                        T{corner.id}
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="flex h-full min-h-[280px] items-center justify-center px-6 text-center text-sm text-[#9CA3AF]">
                    Paste a track map URL above to start placing corners.
                  </div>
                )}
              </div>
            </div>
          </div>

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
                    onClick={() => removeCorner(corner.id)}
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
          <h2 className="text-2xl font-semibold text-white">
            {selectedTemplateId ? "Update Template" : "Save Template"}
          </h2>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            Saving the template stores the selected team as well, so the driver page
            can show only that team’s engineers.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={saving}
              className="rounded-2xl bg-[#E10600] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#C50500] disabled:opacity-60"
            >
              {saving
                ? selectedTemplateId
                  ? "Updating..."
                  : "Saving..."
                : selectedTemplateId
                ? "Update Template"
                : "Save Template"}
            </button>

            {selectedTemplateId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-5 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
              >
                Cancel Editing
              </button>
            )}
          </div>

          {status && (
            <div className="mt-4 rounded-2xl border border-[#2A3441] bg-[#1B2430] p-4 text-sm text-[#9CA3AF]">
              {status}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-5 shadow-2xl md:p-7">
          <div className="flex flex-col gap-3 border-b border-[#2A3441] pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">Existing Templates</h2>
              <p className="mt-2 text-sm text-[#9CA3AF]">
                Select a template to edit it, or open its driver page directly.
              </p>
            </div>
          </div>

          {loadingTemplates ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">Loading templates...</p>
          ) : templates.length === 0 ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">No templates saved yet.</p>
          ) : (
            <div className="mt-5 grid gap-4">
              {templates.map((template) => {
                const driverPath = `/driver/${template.id}`;
                const driverUrl = origin ? `${origin}${driverPath}` : driverPath;
                const isEditing = selectedTemplateId === template.id;

                return (
                  <div
                    key={template.id}
                    className={`rounded-3xl border p-4 ${
                      isEditing
                        ? "border-[#E10600] bg-[#161D27]"
                        : "border-[#2A3441] bg-[#111827]"
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-[#2A3441] bg-[#1B2430] px-3 py-1 text-xs font-semibold text-white">
                            {template.team || "No team"}
                          </span>
                          <span className="rounded-full border border-[#2A3441] bg-[#1B2430] px-3 py-1 text-xs font-semibold text-white">
                            {template.corner_count} corners
                          </span>
                        </div>

                        <h3 className="text-xl font-semibold text-white">
                          {template.track_name}
                        </h3>

                        <p className="break-all text-sm text-[#9CA3AF]">
                          {driverUrl}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => loadTemplateIntoForm(template)}
                          className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
                        >
                          Edit Template
                        </button>

                        <Link
                          href={driverPath}
                          className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#E10600]"
                        >
                          Open Driver Page
                        </Link>

                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(driverUrl)}
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