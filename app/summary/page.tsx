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
  team: string | null;
  driver_name: string | null;
  session_name: string | null;
  track_name: string | null;
  created_at?: string | null;
  corner_feedback: SubmittedCornerFeedback[] | null;
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

function safeText(value: string | null | undefined, fallback = "-") {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || fallback;
}

function formatDate(dateString?: string | null) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function SummaryPage() {
  const [allDebriefs, setAllDebriefs] = useState<SubmittedDebrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedDebriefIds, setSelectedDebriefIds] = useState<string[]>([]);
  const [clearing, setClearing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadDebriefs() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("submitted_debriefs")
      .select(
        "id, team, driver_name, session_name, track_name, created_at, corner_feedback"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading debriefs:", error);
      setAllDebriefs([]);
      setErrorMessage(error.message || "Failed to load submitted debriefs.");
      setLoading(false);
      return;
    }

    const cleaned = ((data ?? []) as SubmittedDebrief[]).map((row) => ({
      ...row,
      team: row.team ?? "",
      driver_name: row.driver_name ?? "",
      session_name: row.session_name ?? "",
      track_name: row.track_name ?? "",
      corner_feedback: Array.isArray(row.corner_feedback) ? row.corner_feedback : [],
    }));

    setAllDebriefs(cleaned);
    setLoading(false);
  }

  useEffect(() => {
    loadDebriefs();
  }, []);

  const availableTeams = useMemo(() => {
    const teams = allDebriefs
      .map((d) => safeText(d.team, ""))
      .filter((team) => team !== "");

    return Array.from(new Set(teams)).sort((a, b) => a.localeCompare(b));
  }, [allDebriefs]);

  useEffect(() => {
    if (availableTeams.length === 0) {
      setSelectedTeam("");
      return;
    }

    if (selectedTeam && availableTeams.includes(selectedTeam)) {
      return;
    }

    setSelectedTeam(availableTeams[0]);
  }, [availableTeams, selectedTeam]);

  const teamDebriefs = useMemo(() => {
    if (!selectedTeam) return [];
    return allDebriefs.filter(
      (d) => safeText(d.team, "") === selectedTeam
    );
  }, [allDebriefs, selectedTeam]);

  useEffect(() => {
    setSelectedDebriefIds((prev) =>
      prev.filter((id) => teamDebriefs.some((d) => d.id === id))
    );
  }, [teamDebriefs]);

  const selectedDebriefs = useMemo(() => {
    return selectedDebriefIds
      .map((id) => teamDebriefs.find((d) => d.id === id))
      .filter((d): d is SubmittedDebrief => Boolean(d));
  }, [selectedDebriefIds, teamDebriefs]);

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

  function toggleDebriefSelection(id: string) {
    setSelectedDebriefIds((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    );
  }

  async function handleClearTeamDebriefs() {
    if (!selectedTeam) return;

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete all submitted debriefs for "${selectedTeam}"?`
    );

    if (!confirmed) return;

    setClearing(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("submitted_debriefs")
      .delete()
      .eq("team", selectedTeam);

    if (error) {
      console.error("Error clearing team debriefs:", error);
      setErrorMessage(error.message || "Failed to clear team debriefs.");
      setClearing(false);
      return;
    }

    setSelectedDebriefIds([]);
    await loadDebriefs();
    setClearing(false);
  }

  function handlePrintPdf() {
    window.print();
  }

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

  return (
    <main className="min-h-screen bg-[#0A0E14] px-4 py-6 text-white md:px-8 md:py-8 print:bg-white print:px-0 print:py-0 print:text-black">
      <style jsx global>{`
        @media print {
          body {
            background: #ffffff !important;
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
        }
      `}</style>

      <div className="mx-auto max-w-[1700px] space-y-6">
        <section className="print-shell rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
          <h1 className="text-3xl font-bold">Team Debrief Summary</h1>
          <p className="mt-2 text-sm text-[#9CA3AF] print:text-[#374151]">
            Select a team, tick the debrief sheets you want to compare, then print or save as PDF.
          </p>
          {errorMessage ? (
            <p className="mt-3 text-sm text-red-400 print:text-red-700">{errorMessage}</p>
          ) : null}
        </section>

        <section className="print-shell print-hide rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
          <div className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-white">
                Team
              </label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none"
              >
                {availableTeams.length === 0 ? (
                  <option value="">No teams available</option>
                ) : (
                  <>
                    <option value="" disabled>
                      Select team
                    </option>
                    {availableTeams.map((team) => (
                      <option key={team} value={team}>
                        {team}
                      </option>
                    ))}
                  </>
                )}
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

            <button
              type="button"
              onClick={handleClearTeamDebriefs}
              disabled={!selectedTeam || clearing || teamDebriefs.length === 0}
              className="self-end rounded-2xl border border-[#7f1d1d] bg-[#7f1d1d]/20 px-5 py-3 text-sm font-semibold text-red-200 transition hover:bg-[#7f1d1d]/35 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {clearing ? "Clearing..." : "Clear Team Debriefs"}
            </button>
          </div>
        </section>

        <section className="print-shell print-hide rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
          <h2 className="text-2xl font-semibold text-white">Submitted Debriefs</h2>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            All submitted debrief sheets for the selected team.
          </p>

          {loading ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">Loading submitted debriefs...</p>
          ) : !selectedTeam ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">No team selected.</p>
          ) : teamDebriefs.length === 0 ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">
              No submitted debriefs found for this team.
            </p>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl border border-[#2A3441]">
              <div className="grid grid-cols-[60px_1.2fr_1fr_1fr_1fr] gap-3 bg-[#111827] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">
                <div>Select</div>
                <div>Driver</div>
                <div>Session</div>
                <div>Track</div>
                <div>Submitted</div>
              </div>

              <div className="divide-y divide-[#2A3441]">
                {teamDebriefs.map((debrief) => {
                  const checked = selectedDebriefIds.includes(debrief.id);

                  return (
                    <label
                      key={debrief.id}
                      className="grid cursor-pointer grid-cols-[60px_1.2fr_1fr_1fr_1fr] gap-3 bg-[#1B2430] px-4 py-4 transition hover:bg-[#243041]"
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

        <section className="print-shell rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
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
                      {safeText(debrief.session_name, "No Session")}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-6 overflow-x-auto">
            <div className="min-w-[1500px] rounded-2xl border border-[#2A3441] bg-[#111827] print:border-[#d1d5db] print:bg-white">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="h-auto w-full"
                preserveAspectRatio="xMinYMin meet"
              >
                <rect x={0} y={0} width={svgWidth} height={svgHeight} fill="#f3f4f6" />

                <rect x={0} y={0} width={turnColWidth} height={headerHeight} fill="#d1d5db" stroke="#111827" />
                <rect x={turnColWidth} y={0} width={phaseColWidth} height={headerHeight} fill="#d1d5db" stroke="#111827" />
                <rect x={graphLeft} y={0} width={graphWidth} height={headerHeight} fill="#d1d5db" stroke="#111827" />
                <rect x={commentLeft} y={0} width={commentWidth} height={headerHeight} fill="#d1d5db" stroke="#111827" />

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
                        y={blockY + rowsPerCorner * rowHeight / 2 + 6}
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

                  const maxCommentLines = 3;
                  const lineHeight = 11;

                  return corner.comments.slice(0, maxCommentLines).map((entry, index) => (
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
      </div>
    </main>
  );
}