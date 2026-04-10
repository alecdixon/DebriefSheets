"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  year?: number | string | null;
  [key: string]: unknown;
};

type CleanedDebrief = SubmittedDebrief & {
  id: string;
  team: string;
  driver_name: string;
  session_name: string;
  track_name: string;
  created_at: string;
  corner_feedback: SubmittedCornerFeedback[];
  derived_year: string;
};

type PhaseKey = "entryBalanceValue" | "midBalanceValue" | "exitBalanceValue";

const lineColours = [
  "#ef4444",
  "#2563eb",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#06b6d4",
  "#e11d48",
  "#84cc16",
  "#14b8a6",
  "#f97316",
];

const phaseRows: { key: PhaseKey; label: string }[] = [
  { key: "entryBalanceValue", label: "Entry" },
  { key: "midBalanceValue", label: "Mid" },
  { key: "exitBalanceValue", label: "Exit" },
];

const majorScaleLabels = [
  { label: "US 3", value: -3, fill: "#ef4444" },
  { label: "US 2", value: -2, fill: "#f59e0b" },
  { label: "US 1", value: -1, fill: "#eab308" },
  { label: "OK", value: 0, fill: "#22c55e" },
  { label: "OS 1", value: 1, fill: "#eab308" },
  { label: "OS 2", value: 2, fill: "#f59e0b" },
  { label: "OS 3", value: 3, fill: "#ef4444" },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function xForBalance(value: number, left: number, width: number) {
  const clamped = clamp(value, -3, 3);
  const normalised = (clamped + 3) / 6;
  return left + normalised * width;
}

function xForDelta(value: number, left: number, width: number, maxAbs: number) {
  const safeMax = Math.max(0.1, maxAbs);
  const clamped = clamp(value, -safeMax, safeMax);
  const normalised = (clamped + safeMax) / (2 * safeMax);
  return left + normalised * width;
}

function safeText(value: unknown, fallback = "-") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function formatDate(dateString?: string | null) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function deriveYear(row: SubmittedDebrief): string {
  if (typeof row.year === "number" && Number.isFinite(row.year)) {
    return String(row.year);
  }

  if (typeof row.year === "string" && row.year.trim()) {
    return row.year.trim();
  }

  if (typeof row.created_at === "string" && row.created_at.trim()) {
    const date = new Date(row.created_at);
    if (!Number.isNaN(date.getTime())) {
      return String(date.getFullYear());
    }
  }

  return "";
}

export default function SummaryPage() {
  const [allDebriefs, setAllDebriefs] = useState<CleanedDebrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState("All");
  const [selectedYear, setSelectedYear] = useState("All");
  const [selectedCircuit, setSelectedCircuit] = useState("All");
  const [selectedDebriefIds, setSelectedDebriefIds] = useState<string[]>([]);
  const [clearing, setClearing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [printScale, setPrintScale] = useState(1);

  const [baselineDebriefId, setBaselineDebriefId] = useState<string>("");
  const [manualCornerDeltas, setManualCornerDeltas] = useState<
    Record<string, Record<number, string>>
  >({});

  const printContentRef = useRef<HTMLDivElement | null>(null);

  async function loadDebriefs() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("submitted_debriefs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading debriefs:", error);
      setAllDebriefs([]);
      setErrorMessage(error.message || "Failed to load submitted debriefs.");
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as SubmittedDebrief[];

    const cleaned: CleanedDebrief[] = rows.map((row) => ({
      ...row,
      id: String(row.id ?? ""),
      team: typeof row.team === "string" ? row.team.trim() : "",
      driver_name: typeof row.driver_name === "string" ? row.driver_name.trim() : "",
      session_name: typeof row.session_name === "string" ? row.session_name.trim() : "",
      track_name: typeof row.track_name === "string" ? row.track_name.trim() : "",
      created_at: typeof row.created_at === "string" ? row.created_at : "",
      corner_feedback: Array.isArray(row.corner_feedback) ? row.corner_feedback : [],
      derived_year: deriveYear(row),
    }));

    setAllDebriefs(cleaned);
    setLoading(false);
  }

  useEffect(() => {
    loadDebriefs();
  }, []);

  const availableTeams = useMemo(() => {
    const teams = allDebriefs.map((d) => d.team).filter((team) => team.length > 0);
    return ["All", ...Array.from(new Set(teams)).sort((a, b) => a.localeCompare(b))];
  }, [allDebriefs]);

  const availableYears = useMemo(() => {
    const years = allDebriefs
      .map((d) => d.derived_year)
      .filter((year) => year.length > 0);

    return ["All", ...Array.from(new Set(years)).sort((a, b) => b.localeCompare(a))];
  }, [allDebriefs]);

  const availableCircuits = useMemo(() => {
    const circuits = allDebriefs
      .map((d) => d.track_name)
      .filter((track) => track.length > 0);

    return ["All", ...Array.from(new Set(circuits)).sort((a, b) => a.localeCompare(b))];
  }, [allDebriefs]);

  useEffect(() => {
    if (!availableTeams.includes(selectedTeam)) setSelectedTeam("All");
  }, [availableTeams, selectedTeam]);

  useEffect(() => {
    if (!availableYears.includes(selectedYear)) setSelectedYear("All");
  }, [availableYears, selectedYear]);

  useEffect(() => {
    if (!availableCircuits.includes(selectedCircuit)) setSelectedCircuit("All");
  }, [availableCircuits, selectedCircuit]);

  const filteredDebriefs = useMemo(() => {
    return allDebriefs.filter((d) => {
      const matchesTeam = selectedTeam === "All" || d.team === selectedTeam;
      const matchesYear = selectedYear === "All" || d.derived_year === selectedYear;
      const matchesCircuit = selectedCircuit === "All" || d.track_name === selectedCircuit;
      return matchesTeam && matchesYear && matchesCircuit;
    });
  }, [allDebriefs, selectedTeam, selectedYear, selectedCircuit]);

  useEffect(() => {
    setSelectedDebriefIds((prev) =>
      prev.filter((id) => filteredDebriefs.some((d) => d.id === id))
    );
  }, [filteredDebriefs]);

  const selectedDebriefs = useMemo(() => {
    return selectedDebriefIds
      .map((id) => filteredDebriefs.find((d) => d.id === id))
      .filter((d): d is CleanedDebrief => Boolean(d));
  }, [selectedDebriefIds, filteredDebriefs]);

  useEffect(() => {
    if (selectedDebriefs.length === 0) {
      setBaselineDebriefId("");
      return;
    }

    const stillExists = selectedDebriefs.some((d) => d.id === baselineDebriefId);
    if (!stillExists) {
      setBaselineDebriefId(selectedDebriefs[0].id);
    }
  }, [selectedDebriefs, baselineDebriefId]);

  const maxCorner = useMemo(() => {
    if (selectedDebriefs.length === 0) return 0;

    const values = selectedDebriefs.flatMap((debrief) =>
      (debrief.corner_feedback ?? [])
        .map((item) => item.cornerId)
        .filter((value): value is number => typeof value === "number")
    );

    return values.length ? Math.max(...values) : 0;
  }, [selectedDebriefs]);

  const commentsByCorner = useMemo(() => {
    return Array.from({ length: maxCorner }, (_, index) => {
      const cornerId = index + 1;

      const comments = selectedDebriefs
        .map((debrief) => {
          const feedback = (debrief.corner_feedback ?? []).find(
            (c) => c.cornerId === cornerId
          );

          const comment = safeText(feedback?.comment, "");
          if (!comment) return null;

          return {
            driverName: safeText(debrief.driver_name, "Unknown Driver"),
            sessionName: safeText(debrief.session_name, "No Session"),
            comment,
          };
        })
        .filter(
          (
            item
          ): item is {
            driverName: string;
            sessionName: string;
            comment: string;
          } => item !== null
        );

      return { cornerId, comments };
    });
  }, [selectedDebriefs, maxCorner]);

  const baselineDebrief = useMemo(() => {
    return selectedDebriefs.find((d) => d.id === baselineDebriefId) ?? null;
  }, [selectedDebriefs, baselineDebriefId]);

  const comparisonDebriefs = useMemo(() => {
    return selectedDebriefs.filter((d) => d.id !== baselineDebriefId);
  }, [selectedDebriefs, baselineDebriefId]);

  const maxDeltaMagnitude = useMemo(() => {
    const values: number[] = [];

    comparisonDebriefs.forEach((debrief) => {
      for (let cornerId = 1; cornerId <= maxCorner; cornerId += 1) {
        const raw = manualCornerDeltas[debrief.id]?.[cornerId] ?? "";
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) {
          values.push(Math.abs(parsed));
        }
      }
    });

    return Math.max(1, ...values);
  }, [comparisonDebriefs, maxCorner, manualCornerDeltas]);

  function updateManualCornerDelta(debriefId: string, cornerId: number, value: string) {
    setManualCornerDeltas((prev) => ({
      ...prev,
      [debriefId]: {
        ...(prev[debriefId] ?? {}),
        [cornerId]: value,
      },
    }));
  }

  function getManualCornerDelta(debriefId: string, cornerId: number) {
    return manualCornerDeltas[debriefId]?.[cornerId] ?? "";
  }

  function toggleDebriefSelection(id: string) {
    setSelectedDebriefIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleSelectAllVisible() {
    const visibleIds = filteredDebriefs.map((d) => d.id);
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedDebriefIds.includes(id));

    if (allVisibleSelected) {
      setSelectedDebriefIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      return;
    }

    setSelectedDebriefIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  }

  async function handleClearFilteredDebriefs() {
    if (filteredDebriefs.length === 0) return;

    const filterSummary = [
      selectedTeam !== "All" ? `Team: ${selectedTeam}` : null,
      selectedYear !== "All" ? `Year: ${selectedYear}` : null,
      selectedCircuit !== "All" ? `Circuit: ${selectedCircuit}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const label = filterSummary || "all currently filtered debriefs";

    const confirmed = window.confirm(`Delete ${label}?`);
    if (!confirmed) return;

    setClearing(true);
    setErrorMessage("");

    const idsToDelete = filteredDebriefs.map((d) => d.id);

    const { error } = await supabase
      .from("submitted_debriefs")
      .delete()
      .in("id", idsToDelete);

    if (error) {
      console.error("Error clearing filtered debriefs:", error);
      setErrorMessage(error.message || "Failed to clear filtered debriefs.");
      setClearing(false);
      return;
    }

    setSelectedDebriefIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
    await loadDebriefs();
    setClearing(false);
  }

  function handlePrintPdf() {
    const printable = printContentRef.current;
    if (!printable) {
      window.print();
      return;
    }

    const contentWidth = printable.scrollWidth;
    const contentHeight = printable.scrollHeight;

    const pageWidthPx = 1122;
    const pageHeightPx = 760;

    const scaleX = pageWidthPx / contentWidth;
    const scaleY = pageHeightPx / contentHeight;
    const nextScale = Math.min(scaleX, scaleY, 1);

    setPrintScale(nextScale);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }

  useEffect(() => {
    const resetAfterPrint = () => setPrintScale(1);
    window.addEventListener("afterprint", resetAfterPrint);
    return () => window.removeEventListener("afterprint", resetAfterPrint);
  }, []);

  const svgWidth = 1500;
  const headerHeight = 46;
  const rowHeight = 28;
  const rowsPerCorner = 3;
  const bodyHeight = Math.max(maxCorner * rowsPerCorner * rowHeight, 140);
  const svgHeight = headerHeight + bodyHeight + 2;

  const turnColWidth = 58;
  const phaseColWidth = 72;
  const graphLeft = turnColWidth + phaseColWidth;
  const graphWidth = 430;
  const commentLeft = graphLeft + graphWidth;
  const commentWidth = svgWidth - commentLeft;

  const deltaSvgWidth = 1500;
  const deltaHeaderHeight = 46;
  const deltaRowHeight = 34;
  const deltaBodyHeight = Math.max(maxCorner * deltaRowHeight, 140);
  const deltaSvgHeight = deltaHeaderHeight + deltaBodyHeight + 2;

  const deltaTurnColWidth = 70;
  const deltaGraphLeft = deltaTurnColWidth;
  const deltaGraphWidth = 760;
  const deltaInfoLeft = deltaGraphLeft + deltaGraphWidth;
  const deltaInfoWidth = deltaSvgWidth - deltaInfoLeft;

  const allVisibleSelected =
    filteredDebriefs.length > 0 &&
    filteredDebriefs.every((d) => selectedDebriefIds.includes(d.id));

  return (
    <main className="min-h-screen bg-[#0A0E14] px-4 py-6 text-white md:px-8 md:py-8 print:bg-white print:px-0 print:py-0 print:text-black">
      <style jsx global>{`
        @page {
          size: A4 landscape;
          margin: 8mm;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
            width: 100%;
            height: 100%;
            overflow: hidden !important;
          }

          .print-hide {
            display: none !important;
          }

          .print-shell {
            background: #ffffff !important;
            color: #111827 !important;
            border: 1px solid #d1d5db !important;
            box-shadow: none !important;
          }

          .print-root {
            padding: 0 !important;
            margin: 0 !important;
            min-height: auto !important;
          }

          .print-page {
            width: 100%;
            height: 100%;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="print-root mx-auto max-w-[1700px] space-y-6">
        {errorMessage ? (
          <section className="print-hide rounded-2xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </section>
        ) : null}

        <section className="print-shell print-hide rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
          <div className="grid gap-4 md:grid-cols-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-white">Team</label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none"
              >
                {availableTeams.map((team) => (
                  <option key={team} value={team}>
                    {team === "All" ? "All Teams" : team}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white">Year</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year === "All" ? "All Years" : year}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white">Circuit</label>
              <select
                value={selectedCircuit}
                onChange={(e) => setSelectedCircuit(e.target.value)}
                className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none"
              >
                {availableCircuits.map((circuit) => (
                  <option key={circuit} value={circuit}>
                    {circuit === "All" ? "All Circuits" : circuit}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={loadDebriefs}
              className="self-end rounded-2xl border border-[#2A3441] bg-[#1B2430] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243041]"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={handlePrintPdf}
              disabled={selectedDebriefs.length === 0}
              className="self-end rounded-2xl border border-[#2A3441] bg-[#1B2430] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243041] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Print / Save PDF
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleClearFilteredDebriefs}
              disabled={filteredDebriefs.length === 0 || clearing}
              className="rounded-2xl border border-[#7f1d1d] bg-[#7f1d1d]/20 px-5 py-3 text-sm font-semibold text-red-200 transition hover:bg-[#7f1d1d]/35 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {clearing ? "Clearing..." : "Clear Filtered Debriefs"}
            </button>

            <button
              type="button"
              onClick={toggleSelectAllVisible}
              disabled={filteredDebriefs.length === 0}
              className="rounded-2xl border border-[#2A3441] bg-[#1B2430] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243041] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allVisibleSelected ? "Deselect All Visible" : "Select All Visible"}
            </button>
          </div>
        </section>

        <section className="print-shell print-hide rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
          <h2 className="text-2xl font-semibold text-white">Submitted Debriefs</h2>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            Debriefs matching the selected team, year, and circuit filters.
          </p>

          {loading ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">Loading submitted debriefs...</p>
          ) : filteredDebriefs.length === 0 ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">
              No submitted debriefs found for the current filters.
            </p>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl border border-[#2A3441]">
              <div className="grid grid-cols-[60px_1fr_1fr_1fr_120px_160px] gap-3 bg-[#111827] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">
                <div>Select</div>
                <div>Driver</div>
                <div>Session</div>
                <div>Track</div>
                <div>Year</div>
                <div>Submitted</div>
              </div>

              <div className="divide-y divide-[#2A3441]">
                {filteredDebriefs.map((debrief) => {
                  const checked = selectedDebriefIds.includes(debrief.id);

                  return (
                    <label
                      key={debrief.id}
                      className="grid cursor-pointer grid-cols-[60px_1fr_1fr_1fr_120px_160px] gap-3 bg-[#1B2430] px-4 py-4 transition hover:bg-[#243041]"
                    >
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDebriefSelection(debrief.id)}
                          className="h-4 w-4 rounded border-[#2A3441] bg-[#111827] accent-[#E10600]"
                        />
                      </div>

                      <div className="text-sm font-semibold text-white">
                        {safeText(debrief.driver_name, "Unknown Driver")}
                      </div>

                      <div className="text-sm text-[#D1D5DB]">
                        {safeText(debrief.session_name, "No Session")}
                      </div>

                      <div className="text-sm text-[#D1D5DB]">
                        {safeText(debrief.track_name, "-")}
                      </div>

                      <div className="text-sm text-[#D1D5DB]">
                        {debrief.derived_year || "-"}
                      </div>

                      <div className="text-sm text-[#9CA3AF]">
                        {formatDate(debrief.created_at)}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <div
          className="print-page"
          style={{
            transform: `scale(${printScale})`,
            transformOrigin: "top left",
            width: printScale < 1 ? `${100 / printScale}%` : "100%",
          }}
        >
          <div ref={printContentRef} className="space-y-6">
            <section className="print-shell print-avoid-break rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
              <div className="flex flex-wrap items-center gap-6">
                {selectedDebriefs.length === 0 ? (
                  <p className="text-sm text-[#9CA3AF] print:text-[#374151]">
                    No debriefs selected.
                  </p>
                ) : (
                  selectedDebriefs.map((debrief, index) => {
                    const colour = lineColours[index % lineColours.length];
                    return (
                      <div key={debrief.id} className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: colour }}
                        />
                        <span className="text-sm text-white print:text-[#111827]">
                          {safeText(debrief.driver_name, "Unknown Driver")} —{" "}
                          {safeText(debrief.session_name, "No Session")} —{" "}
                          {safeText(debrief.track_name, "-")}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-6 overflow-x-auto print:overflow-visible">
                <div className="min-w-[1500px] rounded-2xl border border-[#2A3441] bg-[#111827] print:min-w-0 print:border-[#d1d5db] print:bg-white">
                  <svg
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    className="h-auto w-full"
                    preserveAspectRatio="xMinYMin meet"
                  >
                    <rect x={0} y={0} width={svgWidth} height={svgHeight} fill="#f3f4f6" />

                    <rect
                      x={0}
                      y={0}
                      width={turnColWidth}
                      height={headerHeight}
                      fill="#d1d5db"
                      stroke="#111827"
                    />
                    <rect
                      x={turnColWidth}
                      y={0}
                      width={phaseColWidth}
                      height={headerHeight}
                      fill="#d1d5db"
                      stroke="#111827"
                    />
                    <rect
                      x={graphLeft}
                      y={0}
                      width={graphWidth}
                      height={headerHeight}
                      fill="#d1d5db"
                      stroke="#111827"
                    />
                    <rect
                      x={commentLeft}
                      y={0}
                      width={commentWidth}
                      height={headerHeight}
                      fill="#d1d5db"
                      stroke="#111827"
                    />

                    <text x={12} y={29} fontSize="12" fill="#111827" fontWeight="700">
                      Turn
                    </text>
                    <text
                      x={turnColWidth + phaseColWidth / 2}
                      y={29}
                      fontSize="12"
                      fill="#111827"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      Phase
                    </text>
                    <text
                      x={graphLeft + graphWidth / 2}
                      y={29}
                      fontSize="12"
                      fill="#111827"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      Car Balance
                    </text>
                    <text
                      x={commentLeft + commentWidth / 2}
                      y={29}
                      fontSize="12"
                      fill="#111827"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      Comments
                    </text>

                    {majorScaleLabels.map((item, index) => {
                      const cellWidth = graphWidth / 7;
                      const x = xForBalance(item.value, graphLeft, graphWidth);

                      return (
                        <g key={item.label}>
                          <rect
                            x={graphLeft + index * cellWidth}
                            y={0}
                            width={cellWidth}
                            height={18}
                            fill={item.fill}
                            stroke="#111827"
                          />
                          <text
                            x={x}
                            y={13}
                            fontSize="10"
                            fill="#111827"
                            fontWeight="700"
                            textAnchor="middle"
                          >
                            {item.label}
                          </text>
                        </g>
                      );
                    })}

                    {Array.from({ length: 13 }, (_, i) => {
                      const value = -3 + i * 0.5;
                      const x = xForBalance(value, graphLeft, graphWidth);
                      const isMajor = Number.isInteger(value);

                      return (
                        <line
                          key={value}
                          x1={x}
                          x2={x}
                          y1={headerHeight}
                          y2={svgHeight}
                          stroke="#6b7280"
                          strokeDasharray={isMajor ? "0" : "4 4"}
                          strokeWidth={isMajor ? 1.1 : 0.7}
                        />
                      );
                    })}

                    {Array.from({ length: maxCorner }).map((_, cornerIndex) => {
                      const cornerId = cornerIndex + 1;
                      const blockY = headerHeight + cornerIndex * rowsPerCorner * rowHeight;

                      return (
                        <g key={`corner-${cornerId}`}>
                          <rect
                            x={0}
                            y={blockY}
                            width={turnColWidth}
                            height={rowsPerCorner * rowHeight}
                            fill="#ffffff"
                            stroke="#111827"
                          />
                          <text
                            x={turnColWidth / 2}
                            y={blockY + (rowsPerCorner * rowHeight) / 2 + 6}
                            fontSize="24"
                            fill="#111827"
                            textAnchor="middle"
                          >
                            {cornerId}
                          </text>

                          {phaseRows.map((phase, phaseIndex) => {
                            const y = blockY + phaseIndex * rowHeight;

                            return (
                              <g key={`${cornerId}-${phase.label}`}>
                                <rect
                                  x={turnColWidth}
                                  y={y}
                                  width={phaseColWidth}
                                  height={rowHeight}
                                  fill="#ffffff"
                                  stroke="#111827"
                                />
                                <text
                                  x={turnColWidth + phaseColWidth / 2}
                                  y={y + 18}
                                  fontSize="11"
                                  fill="#111827"
                                  textAnchor="middle"
                                >
                                  {phase.label}
                                </text>

                                <rect
                                  x={graphLeft}
                                  y={y}
                                  width={graphWidth}
                                  height={rowHeight}
                                  fill="#ffffff"
                                  stroke="#111827"
                                />
                                <rect
                                  x={commentLeft}
                                  y={y}
                                  width={commentWidth}
                                  height={rowHeight}
                                  fill="#ffffff"
                                  stroke="#111827"
                                />
                              </g>
                            );
                          })}
                        </g>
                      );
                    })}

                    {selectedDebriefs.map((debrief, driverIndex) => {
                      const colour = lineColours[driverIndex % lineColours.length];
                      const points: string[] = [];

                      Array.from({ length: maxCorner }).forEach((_, cornerIndex) => {
                        const cornerId = cornerIndex + 1;
                        const feedback = (debrief.corner_feedback ?? []).find(
                          (c) => c.cornerId === cornerId
                        );

                        phaseRows.forEach((phase, phaseIndex) => {
                          const value = feedback?.[phase.key];
                          if (typeof value !== "number") return;

                          const x = xForBalance(value, graphLeft, graphWidth);
                          const y =
                            headerHeight +
                            cornerIndex * rowsPerCorner * rowHeight +
                            phaseIndex * rowHeight +
                            rowHeight / 2;

                          points.push(`${x},${y}`);
                        });
                      });

                      if (points.length < 2) return null;

                      return (
                        <polyline
                          key={debrief.id}
                          fill="none"
                          stroke={colour}
                          strokeWidth="2.5"
                          points={points.join(" ")}
                        />
                      );
                    })}

                    {selectedDebriefs.map((debrief, driverIndex) => {
                      const colour = lineColours[driverIndex % lineColours.length];

                      return Array.from({ length: maxCorner }).flatMap((_, cornerIndex) => {
                        const cornerId = cornerIndex + 1;
                        const feedback = (debrief.corner_feedback ?? []).find(
                          (c) => c.cornerId === cornerId
                        );

                        return phaseRows.map((phase, phaseIndex) => {
                          const value = feedback?.[phase.key];
                          if (typeof value !== "number") return null;

                          const x = xForBalance(value, graphLeft, graphWidth);
                          const y =
                            headerHeight +
                            cornerIndex * rowsPerCorner * rowHeight +
                            phaseIndex * rowHeight +
                            rowHeight / 2;

                          return (
                            <circle
                              key={`${debrief.id}-${cornerId}-${phase.key}`}
                              cx={x}
                              cy={y}
                              r={3.5}
                              fill={colour}
                              stroke="#111827"
                              strokeWidth={0.8}
                            />
                          );
                        });
                      });
                    })}

                    {commentsByCorner.map((corner) => {
                      if (corner.comments.length === 0) return null;

                      const blockY =
                        headerHeight + (corner.cornerId - 1) * rowsPerCorner * rowHeight;
                      const lineHeight = 11;

                      return corner.comments.slice(0, 3).map((entry, index) => (
                        <text
                          key={`comment-${corner.cornerId}-${entry.driverName}-${index}`}
                          x={commentLeft + 8}
                          y={blockY + 16 + index * lineHeight}
                          fontSize="10"
                          fill="#111827"
                        >
                          <tspan fontWeight="700">
                            {entry.driverName} ({entry.sessionName}):
                          </tspan>
                          <tspan> {entry.comment}</tspan>
                        </text>
                      ));
                    })}
                  </svg>
                </div>
              </div>
            </section>

            <section className="print-shell print-hide rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
              <h2 className="text-2xl font-semibold text-white">Corner Delta Input</h2>
              <p className="mt-2 text-sm text-[#9CA3AF]">
                Choose one selected debrief as the baseline, then manually enter a per-corner
                delta for each of the other selected cars.
              </p>

              {selectedDebriefs.length < 2 ? (
                <p className="mt-5 text-sm text-[#9CA3AF]">
                  Select at least 2 debriefs to use the corner delta tool.
                </p>
              ) : (
                <>
                  <div className="mt-5 max-w-xl">
                    <label className="mb-2 block text-sm font-medium text-white">
                      Baseline Debrief
                    </label>
                    <select
                      value={baselineDebriefId}
                      onChange={(e) => setBaselineDebriefId(e.target.value)}
                      className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none"
                    >
                      {selectedDebriefs.map((debrief) => (
                        <option key={debrief.id} value={debrief.id}>
                          {safeText(debrief.driver_name, "Unknown Driver")} —{" "}
                          {safeText(debrief.session_name, "No Session")} —{" "}
                          {safeText(debrief.track_name, "-")}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-6 space-y-6">
                    {comparisonDebriefs.map((debrief) => {
                      const selectedIndex = selectedDebriefs.findIndex(
                        (item) => item.id === debrief.id
                      );
                      const colour = lineColours[selectedIndex % lineColours.length];

                      return (
                        <div
                          key={debrief.id}
                          className="rounded-2xl border border-[#2A3441] bg-[#111827] p-4"
                        >
                          <div className="mb-4 flex flex-wrap items-center gap-3">
                            <span
                              className="inline-block h-3 w-3 rounded-full"
                              style={{ backgroundColor: colour }}
                            />
                            <span className="text-sm font-semibold text-white">
                              {safeText(debrief.driver_name, "Unknown Driver")} —{" "}
                              {safeText(debrief.session_name, "No Session")} —{" "}
                              {safeText(debrief.track_name, "-")}
                            </span>
                            <span className="text-sm text-[#9CA3AF]">
                              vs baseline{" "}
                              {baselineDebrief
                                ? safeText(baselineDebrief.driver_name, "Unknown Driver")
                                : "-"}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                            {Array.from({ length: maxCorner }).map((_, cornerIndex) => {
                              const cornerId = cornerIndex + 1;

                              return (
                                <div key={`${debrief.id}-corner-${cornerId}`}>
                                  <label className="mb-1 block text-xs font-medium text-[#9CA3AF]">
                                    T{cornerId}
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={getManualCornerDelta(debrief.id, cornerId)}
                                    onChange={(e) =>
                                      updateManualCornerDelta(
                                        debrief.id,
                                        cornerId,
                                        e.target.value
                                      )
                                    }
                                    className="w-full rounded-xl border border-[#2A3441] bg-[#1B2430] px-3 py-2 text-sm text-white outline-none"
                                    placeholder="0.00"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            <section className="print-shell print-avoid-break rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
              <h2 className="text-2xl font-semibold text-white">Corner Delta Plot</h2>
              <p className="mt-2 text-sm text-[#9CA3AF]">
                Manual corner delta values for each non-baseline car relative to the chosen
                baseline.
              </p>

              {selectedDebriefs.length < 2 ? (
                <p className="mt-5 text-sm text-[#9CA3AF]">
                  Select at least 2 debriefs to display the corner delta plot.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-6">
                    {baselineDebrief ? (
                      <div className="text-sm font-semibold text-white print:text-[#111827]">
                        Baseline: {safeText(baselineDebrief.driver_name, "Unknown Driver")} —{" "}
                        {safeText(baselineDebrief.session_name, "No Session")} —{" "}
                        {safeText(baselineDebrief.track_name, "-")}
                      </div>
                    ) : null}

                    {comparisonDebriefs.map((debrief) => {
                      const selectedIndex = selectedDebriefs.findIndex(
                        (item) => item.id === debrief.id
                      );
                      const colour = lineColours[selectedIndex % lineColours.length];

                      return (
                        <div key={debrief.id} className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: colour }}
                          />
                          <span className="text-sm text-white print:text-[#111827]">
                            {safeText(debrief.driver_name, "Unknown Driver")} —{" "}
                            {safeText(debrief.session_name, "No Session")}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 overflow-x-auto print:overflow-visible">
                    <div className="min-w-[1500px] rounded-2xl border border-[#2A3441] bg-[#111827] print:min-w-0 print:border-[#d1d5db] print:bg-white">
                      <svg
                        viewBox={`0 0 ${deltaSvgWidth} ${deltaSvgHeight}`}
                        className="h-auto w-full"
                        preserveAspectRatio="xMinYMin meet"
                      >
                        <rect
                          x={0}
                          y={0}
                          width={deltaSvgWidth}
                          height={deltaSvgHeight}
                          fill="#f3f4f6"
                        />

                        <rect
                          x={0}
                          y={0}
                          width={deltaTurnColWidth}
                          height={deltaHeaderHeight}
                          fill="#d1d5db"
                          stroke="#111827"
                        />
                        <rect
                          x={deltaGraphLeft}
                          y={0}
                          width={deltaGraphWidth}
                          height={deltaHeaderHeight}
                          fill="#d1d5db"
                          stroke="#111827"
                        />
                        <rect
                          x={deltaInfoLeft}
                          y={0}
                          width={deltaInfoWidth}
                          height={deltaHeaderHeight}
                          fill="#d1d5db"
                          stroke="#111827"
                        />

                        <text x={16} y={29} fontSize="12" fill="#111827" fontWeight="700">
                          Turn
                        </text>

                        <text
                          x={deltaGraphLeft + deltaGraphWidth / 2}
                          y={29}
                          fontSize="12"
                          fill="#111827"
                          fontWeight="700"
                          textAnchor="middle"
                        >
                          Corner Delta
                        </text>

                        <text
                          x={deltaInfoLeft + deltaInfoWidth / 2}
                          y={29}
                          fontSize="12"
                          fill="#111827"
                          fontWeight="700"
                          textAnchor="middle"
                        >
                          Values
                        </text>

                        {Array.from({ length: 9 }, (_, i) => {
                          const value = -maxDeltaMagnitude + (i * (maxDeltaMagnitude * 2)) / 8;
                          const x = xForDelta(
                            value,
                            deltaGraphLeft,
                            deltaGraphWidth,
                            maxDeltaMagnitude
                          );
                          const isZero = Math.abs(value) < 0.0001;

                          return (
                            <g key={`delta-grid-${i}`}>
                              <line
                                x1={x}
                                x2={x}
                                y1={deltaHeaderHeight}
                                y2={deltaSvgHeight}
                                stroke={isZero ? "#111827" : "#6b7280"}
                                strokeDasharray={isZero ? "0" : "4 4"}
                                strokeWidth={isZero ? 1.2 : 0.7}
                              />
                              <text
                                x={x}
                                y={14}
                                fontSize="10"
                                fill="#111827"
                                fontWeight="700"
                                textAnchor="middle"
                              >
                                {value.toFixed(1)}
                              </text>
                            </g>
                          );
                        })}

                        {Array.from({ length: maxCorner }).map((_, cornerIndex) => {
                          const cornerId = cornerIndex + 1;
                          const y = deltaHeaderHeight + cornerIndex * deltaRowHeight;

                          return (
                            <g key={`delta-row-${cornerId}`}>
                              <rect
                                x={0}
                                y={y}
                                width={deltaTurnColWidth}
                                height={deltaRowHeight}
                                fill="#ffffff"
                                stroke="#111827"
                              />
                              <rect
                                x={deltaGraphLeft}
                                y={y}
                                width={deltaGraphWidth}
                                height={deltaRowHeight}
                                fill="#ffffff"
                                stroke="#111827"
                              />
                              <rect
                                x={deltaInfoLeft}
                                y={y}
                                width={deltaInfoWidth}
                                height={deltaRowHeight}
                                fill="#ffffff"
                                stroke="#111827"
                              />

                              <text
                                x={deltaTurnColWidth / 2}
                                y={y + 22}
                                fontSize="15"
                                fill="#111827"
                                textAnchor="middle"
                                fontWeight="700"
                              >
                                {cornerId}
                              </text>
                            </g>
                          );
                        })}

                        {comparisonDebriefs.map((debrief) => {
                          const selectedIndex = selectedDebriefs.findIndex(
                            (item) => item.id === debrief.id
                          );
                          const colour = lineColours[selectedIndex % lineColours.length];
                          const points: string[] = [];

                          Array.from({ length: maxCorner }).forEach((_, cornerIndex) => {
                            const cornerId = cornerIndex + 1;
                            const raw = getManualCornerDelta(debrief.id, cornerId);
                            const value = Number(raw);

                            if (Number.isNaN(value)) return;

                            const x = xForDelta(
                              value,
                              deltaGraphLeft,
                              deltaGraphWidth,
                              maxDeltaMagnitude
                            );
                            const y =
                              deltaHeaderHeight +
                              cornerIndex * deltaRowHeight +
                              deltaRowHeight / 2;

                            points.push(`${x},${y}`);
                          });

                          if (points.length < 2) return null;

                          return (
                            <polyline
                              key={`delta-line-${debrief.id}`}
                              fill="none"
                              stroke={colour}
                              strokeWidth="2.5"
                              points={points.join(" ")}
                            />
                          );
                        })}

                        {comparisonDebriefs.map((debrief) => {
                          const selectedIndex = selectedDebriefs.findIndex(
                            (item) => item.id === debrief.id
                          );
                          const colour = lineColours[selectedIndex % lineColours.length];

                          return Array.from({ length: maxCorner }).map((_, cornerIndex) => {
                            const cornerId = cornerIndex + 1;
                            const raw = getManualCornerDelta(debrief.id, cornerId);
                            const value = Number(raw);

                            if (Number.isNaN(value)) return null;

                            const x = xForDelta(
                              value,
                              deltaGraphLeft,
                              deltaGraphWidth,
                              maxDeltaMagnitude
                            );
                            const y =
                              deltaHeaderHeight +
                              cornerIndex * deltaRowHeight +
                              deltaRowHeight / 2;

                            return (
                              <circle
                                key={`delta-point-${debrief.id}-${cornerId}`}
                                cx={x}
                                cy={y}
                                r={4}
                                fill={colour}
                                stroke="#111827"
                                strokeWidth={0.8}
                              />
                            );
                          });
                        })}

                        {Array.from({ length: maxCorner }).map((_, cornerIndex) => {
                          const cornerId = cornerIndex + 1;
                          const y = deltaHeaderHeight + cornerIndex * deltaRowHeight + 22;

                          const entries = comparisonDebriefs
                            .map((debrief) => {
                              const raw = getManualCornerDelta(debrief.id, cornerId);
                              const value = Number(raw);
                              if (Number.isNaN(value)) return null;

                              return `${safeText(debrief.driver_name, "Driver")}: ${value.toFixed(
                                2
                              )}`;
                            })
                            .filter((entry): entry is string => Boolean(entry));

                          if (entries.length === 0) return null;

                          return (
                            <text
                              key={`delta-values-${cornerId}`}
                              x={deltaInfoLeft + 8}
                              y={y}
                              fontSize="11"
                              fill="#111827"
                            >
                              {entries.join("   |   ")}
                            </text>
                          );
                        })}
                      </svg>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}