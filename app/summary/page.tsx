"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type SubmittedCornerFeedback = {
  cornerId: number;
  entryBalanceValue?: number | null;
  midBalanceValue?: number | null;
  exitBalanceValue?: number | null;
  comment?: string | null;
};

type SubmittedDebrief = {
  id: string;
  team?: string | null;
  driver_name?: string | null;
  session_name?: string | null;
  track_name?: string | null;
  created_at?: string | null;
  corner_feedback?: SubmittedCornerFeedback[] | null;
  [key: string]: unknown;
};

type CleanedDebrief = {
  id: string;
  team: string;
  driver_name: string;
  session_name: string;
  track_name: string;
  created_at: string;
  corner_feedback: SubmittedCornerFeedback[];
  derived_year: string;
};

type TemplateCorner = {
  id: number;
  x: number;
  y: number;
};

type TrackTemplate = {
  id: string;
  track_name: string;
  team: string;
  track_map_url: string | null;
  corners: TemplateCorner[];
};

type PhaseMode = "entry" | "mid" | "exit" | "average" | "all";
type CarColourMap = Record<string, string>;

type SequentialPoint = {
  key: string;
  corner: number;
  phase: "entry" | "mid" | "exit";
  label: string;
};

const AVAILABLE_COLOURS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#eab308",
  "#8b5cf6",
];

const MAJOR_TICKS = [-3, -2, -1, 0, 1, 2, 3];
const MINOR_TICKS = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];

function clampBalance(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.max(-3, Math.min(3, value));
}

function averageValid(values: Array<number | null | undefined>): number | null {
  const valid = values.filter(
    (v): v is number => v !== null && v !== undefined && !Number.isNaN(v)
  );
  if (!valid.length) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function yLabel(value: number): string {
  if (value === 0) return "OK";
  if (value < 0) return `US ${Math.abs(value)}`;
  return `OS ${value}`;
}

function formatDebriefLabel(row: CleanedDebrief): string {
  return `${row.driver_name} | ${row.session_name} | ${row.track_name} | ${row.derived_year}`;
}

function getPointValue(
  row: SubmittedCornerFeedback,
  phaseMode: PhaseMode
): number | null {
  const entry = clampBalance(row.entryBalanceValue ?? null);
  const mid = clampBalance(row.midBalanceValue ?? null);
  const exit = clampBalance(row.exitBalanceValue ?? null);

  if (phaseMode === "entry") return entry;
  if (phaseMode === "mid") return mid;
  if (phaseMode === "exit") return exit;
  if (phaseMode === "average") return averageValid([entry, mid, exit]);

  return null;
}

function isValidTemplateCornerArray(value: unknown): value is TemplateCorner[] {
  return (
    Array.isArray(value) &&
    value.every(
      (corner) =>
        typeof corner === "object" &&
        corner !== null &&
        typeof (corner as TemplateCorner).id === "number" &&
        typeof (corner as TemplateCorner).x === "number" &&
        typeof (corner as TemplateCorner).y === "number"
    )
  );
}

export default function CornerBalanceComparisonChart() {
  const [debriefs, setDebriefs] = useState<CleanedDebrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [teamFilter, setTeamFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [trackFilter, setTrackFilter] = useState("all");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [phaseMode, setPhaseMode] = useState<PhaseMode>("average");
  const [carColours, setCarColours] = useState<CarColourMap>({});

  const [trackTemplate, setTrackTemplate] = useState<TrackTemplate | null>(null);
  const [trackMapAspectRatio, setTrackMapAspectRatio] = useState<number>(1);

  useEffect(() => {
    async function loadDebriefs() {
      setLoading(true);
      setError(null);

      const { data, error: supabaseError } = await supabase
        .from("submitted_debriefs")
        .select("id, team, driver_name, session_name, track_name, created_at, corner_feedback")
        .order("created_at", { ascending: false });

      if (supabaseError) {
        setError(supabaseError.message);
        setLoading(false);
        return;
      }

      const cleaned: CleanedDebrief[] = (data ?? []).map((row: SubmittedDebrief) => {
        const createdAt = row.created_at ?? "";
        const derivedYear = createdAt
          ? new Date(createdAt).getFullYear().toString()
          : "Unknown";

        return {
          id: String(row.id),
          team: row.team?.trim() || "Unknown",
          driver_name: row.driver_name?.trim() || "Unknown driver",
          session_name: row.session_name?.trim() || "Unknown session",
          track_name: row.track_name?.trim() || "Unknown track",
          created_at: createdAt,
          corner_feedback: Array.isArray(row.corner_feedback) ? row.corner_feedback : [],
          derived_year: derivedYear,
        };
      });

      setDebriefs(cleaned);

      const initialColours: CarColourMap = {};
      cleaned.forEach((row, index) => {
        initialColours[row.id] = AVAILABLE_COLOURS[index % AVAILABLE_COLOURS.length];
      });
      setCarColours(initialColours);

      setLoading(false);
    }

    loadDebriefs();
  }, []);

  const teamOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(debriefs.map((d) => d.team))).sort()];
  }, [debriefs]);

  const yearOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(debriefs.map((d) => d.derived_year))).sort()];
  }, [debriefs]);

  const trackOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(debriefs.map((d) => d.track_name))).sort()];
  }, [debriefs]);

  const filteredDebriefs = useMemo(() => {
    return debriefs.filter((d) => {
      if (teamFilter !== "all" && d.team !== teamFilter) return false;
      if (yearFilter !== "all" && d.derived_year !== yearFilter) return false;
      if (trackFilter !== "all" && d.track_name !== trackFilter) return false;
      return true;
    });
  }, [debriefs, teamFilter, yearFilter, trackFilter]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => filteredDebriefs.some((d) => d.id === id)));
  }, [filteredDebriefs]);

  useEffect(() => {
    async function loadTrackTemplate() {
      if (trackFilter === "all") {
        setTrackTemplate(null);
        setTrackMapAspectRatio(1);
        return;
      }

      const inferredTeam =
        teamFilter !== "all"
          ? teamFilter
          : filteredDebriefs.find((d) => d.track_name === trackFilter)?.team ?? null;

      let query = supabase
        .from("debrief_templates")
        .select("id, track_name, team, track_map_url, corners")
        .eq("track_name", trackFilter);

      if (inferredTeam) {
        query = query.eq("team", inferredTeam);
      }

      const { data, error: templateError } = await query.limit(1).maybeSingle();

      if (templateError || !data) {
        setTrackTemplate(null);
        setTrackMapAspectRatio(1);
        return;
      }

      setTrackTemplate({
        id: String(data.id),
        track_name: String(data.track_name ?? ""),
        team: String(data.team ?? ""),
        track_map_url:
          typeof data.track_map_url === "string" && data.track_map_url.trim()
            ? data.track_map_url.trim()
            : null,
        corners: isValidTemplateCornerArray(data.corners) ? data.corners : [],
      });
    }

    loadTrackTemplate();
  }, [trackFilter, teamFilter, filteredDebriefs]);

  const selectedDebriefs = useMemo(() => {
    return filteredDebriefs.filter((d) => selectedIds.includes(d.id));
  }, [filteredDebriefs, selectedIds]);

  const allCornerNumbers = useMemo(() => {
    const cornerSet = new Set<number>();

    selectedDebriefs.forEach((debrief) => {
      debrief.corner_feedback.forEach((row) => {
        if (typeof row.cornerId === "number") {
          cornerSet.add(row.cornerId);
        }
      });
    });

    return Array.from(cornerSet).sort((a, b) => a - b);
  }, [selectedDebriefs]);

  const sequentialXAxis = useMemo<SequentialPoint[]>(() => {
    if (phaseMode !== "all") return [];

    const points: SequentialPoint[] = [];

    allCornerNumbers.forEach((corner) => {
      points.push(
        {
          key: `T${corner}-entry`,
          corner,
          phase: "entry",
          label: `T${corner}E`,
        },
        {
          key: `T${corner}-mid`,
          corner,
          phase: "mid",
          label: `T${corner}M`,
        },
        {
          key: `T${corner}-exit`,
          corner,
          phase: "exit",
          label: `T${corner}X`,
        }
      );
    });

    return points;
  }, [allCornerNumbers, phaseMode]);

  const chartGeometry = {
    width: Math.max(1180, phaseMode === "all" ? 140 + sequentialXAxis.length * 40 : 1180),
    height: 520,
    leftPadding: 86,
    rightPadding: 28,
    topPadding: 28,
    bottomPadding: 78,
  };

  const plotWidth =
    chartGeometry.width - chartGeometry.leftPadding - chartGeometry.rightPadding;
  const plotHeight =
    chartGeometry.height - chartGeometry.topPadding - chartGeometry.bottomPadding;

  function xScaleStandard(cornerNumber: number): number {
    if (allCornerNumbers.length <= 1) {
      return chartGeometry.leftPadding + plotWidth / 2;
    }

    const index = allCornerNumbers.findIndex((c) => c === cornerNumber);
    const step = plotWidth / (allCornerNumbers.length - 1);
    return chartGeometry.leftPadding + index * step;
  }

  function xScaleSequential(index: number): number {
    if (sequentialXAxis.length <= 1) {
      return chartGeometry.leftPadding + plotWidth / 2;
    }

    const step = plotWidth / (sequentialXAxis.length - 1);
    return chartGeometry.leftPadding + index * step;
  }

  function yScale(value: number): number {
    const min = -3;
    const max = 3;
    const normalized = (value - min) / (max - min);
    return chartGeometry.topPadding + plotHeight - normalized * plotHeight;
  }

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
  }

  function updateColour(id: string, colour: string) {
    setCarColours((prev) => ({
      ...prev,
      [id]: colour,
    }));
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-6 text-white">
        Loading balance comparison chart...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-[#0b1220] p-6 text-red-300">
        Failed to load debriefs: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-2xl border border-white/10 bg-[#0b1220] p-6 text-white shadow-2xl">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Corner Balance Comparison</h2>
        <p className="mt-2 text-sm text-white/60">
          Understeer is negative, neutral is zero, oversteer is positive.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-white/75">Team</label>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white outline-none transition focus:border-white/25"
          >
            {teamOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All teams" : option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-white/75">Year</label>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white outline-none transition focus:border-white/25"
          >
            {yearOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All years" : option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-white/75">Circuit</label>
          <select
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white outline-none transition focus:border-white/25"
          >
            {trackOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All circuits" : option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-white/75">Phase</label>
          <select
            value={phaseMode}
            onChange={(e) => setPhaseMode(e.target.value as PhaseMode)}
            className="w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white outline-none transition focus:border-white/25"
          >
            <option value="all">All</option>
            <option value="average">Average</option>
            <option value="entry">Entry</option>
            <option value="mid">Mid</option>
            <option value="exit">Exit</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
            Available Debriefs
          </h3>
          <span className="text-xs text-white/45">{selectedDebriefs.length} selected</span>
        </div>

        <div className="grid max-h-[260px] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
          {filteredDebriefs.map((row) => {
            const checked = selectedIds.includes(row.id);

            return (
              <label
                key={row.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                  checked
                    ? "border-white/20 bg-white/8"
                    : "border-white/8 bg-white/[0.03] hover:bg-white/[0.05]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSelection(row.id)}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">{row.driver_name}</div>
                  <div className="truncate text-xs text-white/55">
                    {row.session_name} · {row.track_name} · {row.team} · {row.derived_year}
                  </div>
                </div>
              </label>
            );
          })}

          {!filteredDebriefs.length && (
            <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/50">
              No debriefs match the current filters.
            </div>
          )}
        </div>
      </div>

      {selectedDebriefs.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-4">
          <div className="mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
              Car Colours
            </h3>
            <p className="mt-1 text-xs text-white/45">
              Select the line colour for each selected car before the chart.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {selectedDebriefs.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3"
              >
                <div className="min-w-0 pr-4">
                  <div className="truncate text-sm font-medium text-white">{row.driver_name}</div>
                  <div className="truncate text-xs text-white/50">
                    {row.session_name} · {row.track_name}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={carColours[row.id] ?? "#3b82f6"}
                    onChange={(e) => updateColour(row.id, e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded-md border border-white/10 bg-transparent p-1"
                  />
                  <div
                    className="h-4 w-10 rounded-full"
                    style={{ backgroundColor: carColours[row.id] ?? "#3b82f6" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {trackFilter !== "all" && trackTemplate?.track_map_url && (
        <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
                Track Map
              </h3>
              <p className="mt-1 text-xs text-white/45">
                {trackTemplate.track_name}
                {trackTemplate.team ? ` · ${trackTemplate.team}` : ""}
              </p>
            </div>

            <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/55">
              {trackTemplate.corners.length} corners
            </div>
          </div>

          <div className="mx-auto w-full max-w-[760px]">
            <div
              className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#09111f]"
              style={{ aspectRatio: String(trackMapAspectRatio) }}
            >
              <img
                src={trackTemplate.track_map_url}
                alt={`${trackTemplate.track_name} track map`}
                className="absolute inset-0 h-full w-full object-contain"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    setTrackMapAspectRatio(img.naturalWidth / img.naturalHeight);
                  }
                }}
              />

              {trackTemplate.corners.map((corner) => (
                <div
                  key={corner.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-[#141A22]/95 px-2.5 py-1 text-xs font-semibold text-white shadow-lg"
                  style={{
                    left: `${corner.x}%`,
                    top: `${corner.y}%`,
                  }}
                >
                  T{corner.id}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-[#09111f] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
              Balance Comparison Chart
            </h3>
            <p className="mt-1 text-xs text-white/45">
              Major lines at whole steps, minor dashed lines at half steps.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-white/55">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
              Phase: {phaseMode}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
              Corners: {allCornerNumbers.length}
            </span>
            {phaseMode === "all" && (
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                Points: {sequentialXAxis.length}
              </span>
            )}
          </div>
        </div>

        {selectedDebriefs.length === 0 ? (
          <div className="flex h-[420px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] text-sm text-white/45">
            Select one or more debriefs to display the balance comparison chart.
          </div>
        ) : allCornerNumbers.length === 0 ? (
          <div className="flex h-[420px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] text-sm text-white/45">
            No corner balance data found for the selected debriefs.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
              className="min-w-[980px]"
            >
              <defs>
                {selectedDebriefs.map((debrief) => {
                  const colour = carColours[debrief.id] ?? "#3b82f6";
                  return (
                    <filter
                      id={`glow-${debrief.id}`}
                      key={`glow-${debrief.id}`}
                      x="-50%"
                      y="-50%"
                      width="200%"
                      height="200%"
                    >
                      <feDropShadow
                        dx="0"
                        dy="0"
                        stdDeviation="3"
                        floodColor={colour}
                        floodOpacity="0.45"
                      />
                    </filter>
                  );
                })}
              </defs>

              <rect
                x={0}
                y={0}
                width={chartGeometry.width}
                height={chartGeometry.height}
                fill="#09111f"
                rx={18}
              />

              <rect
                x={chartGeometry.leftPadding}
                y={chartGeometry.topPadding}
                width={plotWidth}
                height={plotHeight}
                fill="#0d1628"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={1}
                rx={12}
              />

              {MINOR_TICKS.map((value) => {
                const y = yScale(value);

                return (
                  <line
                    key={`minor-${value}`}
                    x1={chartGeometry.leftPadding}
                    x2={chartGeometry.leftPadding + plotWidth}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.11)"
                    strokeWidth={1}
                    strokeDasharray="4 6"
                  />
                );
              })}

              {MAJOR_TICKS.map((value) => {
                const y = yScale(value);
                const isZero = value === 0;

                return (
                  <g key={`major-${value}`}>
                    <line
                      x1={chartGeometry.leftPadding}
                      x2={chartGeometry.leftPadding + plotWidth}
                      y1={y}
                      y2={y}
                      stroke={isZero ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.18)"}
                      strokeWidth={isZero ? 2.2 : 1.2}
                    />
                    <text
                      x={chartGeometry.leftPadding - 12}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="12"
                      fill={isZero ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.55)"}
                    >
                      {yLabel(value)}
                    </text>
                  </g>
                );
              })}

              {phaseMode === "all"
                ? sequentialXAxis.map((point, index) => {
                    const x = xScaleSequential(index);
                    const isCornerStart = point.phase === "entry";
                    const isCornerMid = point.phase === "mid";
                    const isCornerEnd = point.phase === "exit";

                    return (
                      <g key={`seq-axis-${point.key}`}>
                        <line
                          x1={x}
                          x2={x}
                          y1={chartGeometry.topPadding}
                          y2={chartGeometry.topPadding + plotHeight}
                          stroke={
                            isCornerStart
                              ? "rgba(255,255,255,0.10)"
                              : "rgba(255,255,255,0.05)"
                          }
                          strokeWidth={isCornerStart ? 1.2 : 1}
                        />
                        <text
                          x={x}
                          y={chartGeometry.topPadding + plotHeight + 24}
                          textAnchor="middle"
                          fontSize="11"
                          fill={
                            isCornerStart || isCornerEnd
                              ? "rgba(255,255,255,0.72)"
                              : "rgba(255,255,255,0.52)"
                          }
                        >
                          {point.label}
                        </text>

                        {isCornerMid && (
                          <text
                            x={x}
                            y={chartGeometry.topPadding + plotHeight + 42}
                            textAnchor="middle"
                            fontSize="10"
                            fill="rgba(255,255,255,0.35)"
                          >
                            T{point.corner}
                          </text>
                        )}
                      </g>
                    );
                  })
                : allCornerNumbers.map((corner) => {
                    const x = xScaleStandard(corner);
                    return (
                      <g key={`corner-${corner}`}>
                        <line
                          x1={x}
                          x2={x}
                          y1={chartGeometry.topPadding}
                          y2={chartGeometry.topPadding + plotHeight}
                          stroke="rgba(255,255,255,0.06)"
                          strokeWidth={1}
                        />
                        <text
                          x={x}
                          y={chartGeometry.topPadding + plotHeight + 24}
                          textAnchor="middle"
                          fontSize="12"
                          fill="rgba(255,255,255,0.72)"
                        >
                          T{corner}
                        </text>
                      </g>
                    );
                  })}

              {selectedDebriefs.map((debrief) => {
                const colour = carColours[debrief.id] ?? "#3b82f6";

                const points =
                  phaseMode === "all"
                    ? sequentialXAxis
                        .map((seqPoint, index) => {
                          const row = debrief.corner_feedback.find(
                            (r) => r.cornerId === seqPoint.corner
                          );
                          if (!row) return null;

                          let value: number | null = null;
                          if (seqPoint.phase === "entry") {
                            value = clampBalance(row.entryBalanceValue ?? null);
                          }
                          if (seqPoint.phase === "mid") {
                            value = clampBalance(row.midBalanceValue ?? null);
                          }
                          if (seqPoint.phase === "exit") {
                            value = clampBalance(row.exitBalanceValue ?? null);
                          }

                          if (value === null) return null;

                          return {
                            key: seqPoint.key,
                            x: xScaleSequential(index),
                            y: yScale(value),
                            value,
                            label: seqPoint.label,
                          };
                        })
                        .filter(
                          (
                            point
                          ): point is {
                            key: string;
                            x: number;
                            y: number;
                            value: number;
                            label: string;
                          } => Boolean(point)
                        )
                    : allCornerNumbers
                        .map((corner) => {
                          const row = debrief.corner_feedback.find((r) => r.cornerId === corner);
                          if (!row) return null;

                          const value = getPointValue(row, phaseMode);
                          if (value === null) return null;

                          return {
                            key: `T${corner}`,
                            x: xScaleStandard(corner),
                            y: yScale(value),
                            value,
                            label: `T${corner}`,
                          };
                        })
                        .filter(
                          (
                            point
                          ): point is {
                            key: string;
                            x: number;
                            y: number;
                            value: number;
                            label: string;
                          } => Boolean(point)
                        );

                const path = points
                  .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
                  .join(" ");

                return (
                  <g key={`series-${debrief.id}`}>
                    {points.length > 1 && (
                      <path
                        d={path}
                        fill="none"
                        stroke={colour}
                        strokeWidth={3}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        filter={`url(#glow-${debrief.id})`}
                      />
                    )}

                    {points.map((point) => (
                      <g key={`point-${debrief.id}-${point.key}`}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={5.5}
                          fill={colour}
                          stroke="#07101d"
                          strokeWidth={2}
                        />
                        <title>
                          {`${debrief.driver_name} | ${point.label} | ${point.value.toFixed(2)}`}
                        </title>
                      </g>
                    ))}
                  </g>
                );
              })}

              <text
                x={chartGeometry.leftPadding}
                y={16}
                fontSize="13"
                fill="rgba(255,255,255,0.78)"
                fontWeight="600"
              >
                Balance
              </text>
            </svg>
          </div>
        )}
      </div>

      {selectedDebriefs.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
            Legend
          </h3>

          <div className="grid gap-2 md:grid-cols-2">
            {selectedDebriefs.map((debrief) => (
              <div
                key={`legend-${debrief.id}`}
                className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2"
              >
                <span
                  className="h-3 w-10 rounded-full"
                  style={{ backgroundColor: carColours[debrief.id] ?? "#3b82f6" }}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm text-white">{debrief.driver_name}</div>
                  <div className="truncate text-xs text-white/50">
                    {formatDebriefLabel(debrief)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}