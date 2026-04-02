"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type SubmittedCornerFeedback = {
  cornerId: number;
  entryBalanceValue?: number;
  midBalanceValue?: number;
  exitBalanceValue?: number;
  comment?: string;
};

type SubmittedDebrief = {
  id: string;
  team: string | null;
  driver_name: string;
  session_name: string | null;
  track_name: string;
  created_at?: string;
  corner_feedback: SubmittedCornerFeedback[];
};

type PhaseKey = "entryBalanceValue" | "midBalanceValue" | "exitBalanceValue";
type DriverColour = "red" | "blue" | "grey";

const lineColours = ["#ef4444", "#2563eb", "#9ca3af"];

const DRIVER_COLOURS: Record<DriverColour, string> = {
  red: "#ef4444",
  blue: "#2563eb",
  grey: "#9ca3af",
};

const phaseRows: { key: PhaseKey; label: string }[] = [
  { key: "entryBalanceValue", label: "Entry" },
  { key: "midBalanceValue", label: "Mid" },
  { key: "exitBalanceValue", label: "Exit" },
];

const majorScaleLabels = [
  { label: "US 3", value: -3 },
  { label: "US 2", value: -2 },
  { label: "US 1", value: -1 },
  { label: "OK", value: 0 },
  { label: "OS 1", value: 1 },
  { label: "OS 2", value: 2 },
  { label: "OS 3", value: 3 },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function xForBalance(value: number, left: number, width: number) {
  const clamped = clamp(value, -3, 3);
  const normalised = (clamped + 3) / 6;
  return left + normalised * width;
}

export default function SummaryPage() {
  const [allDebriefs, setAllDebriefs] = useState<SubmittedDebrief[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTeam, setSelectedTeam] = useState("GB3");
  const [selectedTrack, setSelectedTrack] = useState("");
  const [selectedSession, setSelectedSession] = useState("");

  const [selectedDebriefIds, setSelectedDebriefIds] = useState<string[]>([]);

  useEffect(() => {
    async function loadDebriefs() {
      setLoading(true);

      const { data, error } = await supabase
        .from("submitted_debriefs")
        .select(
          "id, team, driver_name, session_name, track_name, created_at, corner_feedback"
        )
        .order("created_at", { ascending: false });

      if (!error) {
        setAllDebriefs((data ?? []) as SubmittedDebrief[]);
      }

      setLoading(false);
    }

    loadDebriefs();
  }, []);

  const availableTeams = useMemo(() => {
    const teams = Array.from(
      new Set(
        allDebriefs
          .map((d) => d.team?.trim())
          .filter((value): value is string => !!value)
      )
    );
    return teams.sort();
  }, [allDebriefs]);

  const filteredByTeam = useMemo(() => {
    return allDebriefs.filter((d) => (d.team ?? "") === selectedTeam);
  }, [allDebriefs, selectedTeam]);

  const availableTracks = useMemo(() => {
    return Array.from(
      new Set(filteredByTeam.map((d) => d.track_name).filter(Boolean))
    ).sort();
  }, [filteredByTeam]);

  const filteredByTrack = useMemo(() => {
    if (!selectedTrack) return filteredByTeam;
    return filteredByTeam.filter((d) => d.track_name === selectedTrack);
  }, [filteredByTeam, selectedTrack]);

  const availableSessions = useMemo(() => {
    return Array.from(
      new Set(filteredByTrack.map((d) => d.session_name ?? "").filter(Boolean))
    ).sort();
  }, [filteredByTrack]);

  const fullyFilteredDebriefs = useMemo(() => {
    return filteredByTrack.filter((d) =>
      selectedSession ? (d.session_name ?? "") === selectedSession : true
    );
  }, [filteredByTrack, selectedSession]);

  useEffect(() => {
    if (availableTeams.length > 0 && !availableTeams.includes(selectedTeam)) {
      setSelectedTeam(availableTeams[0]);
    }
  }, [availableTeams, selectedTeam]);

  useEffect(() => {
    if (selectedTrack && !availableTracks.includes(selectedTrack)) {
      setSelectedTrack("");
    }
  }, [availableTracks, selectedTrack]);

  useEffect(() => {
    if (selectedSession && !availableSessions.includes(selectedSession)) {
      setSelectedSession("");
    }
  }, [availableSessions, selectedSession]);

  useEffect(() => {
    const nextIds = fullyFilteredDebriefs.slice(0, 3).map((d) => d.id);
    setSelectedDebriefIds(nextIds);
  }, [selectedTeam, selectedTrack, selectedSession, allDebriefs]);

  const selectedDebriefs = useMemo(() => {
    return selectedDebriefIds
      .map((id) => fullyFilteredDebriefs.find((d) => d.id === id))
      .filter((d): d is SubmittedDebrief => !!d)
      .slice(0, 3);
  }, [fullyFilteredDebriefs, selectedDebriefIds]);

  const maxCorner = useMemo(() => {
    if (selectedDebriefs.length === 0) return 0;
    return (
      Math.max(
        ...selectedDebriefs.flatMap((d) =>
          (d.corner_feedback ?? []).map((c) => c.cornerId)
        )
      ) || 0
    );
  }, [selectedDebriefs]);

  const commentsByCorner = useMemo(() => {
    return Array.from({ length: maxCorner }, (_, i) => {
      const cornerId = i + 1;
      const comments = selectedDebriefs
        .map((debrief) => {
          const feedback = (debrief.corner_feedback ?? []).find(
            (c) => c.cornerId === cornerId
          );
          const comment = feedback?.comment?.trim() ?? "";
          if (!comment) return null;
          return {
            driverName: debrief.driver_name,
            comment,
          };
        })
        .filter(
          (item): item is { driverName: string; comment: string } => item !== null
        );

      return { cornerId, comments };
    });
  }, [selectedDebriefs, maxCorner]);

  function toggleDebriefSelection(id: string) {
    setSelectedDebriefIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), id];
      }
      return [...prev, id];
    });
  }

  const svgWidth = 980;
  const headerHeight = 46;
  const rowHeight = 28;
  const rowsPerCorner = 3;
  const bodyHeight = maxCorner * rowsPerCorner * rowHeight;
  const svgHeight = headerHeight + bodyHeight + 2;

  const turnColWidth = 58;
  const phaseColWidth = 62;
  const graphLeft = turnColWidth + phaseColWidth;
  const graphWidth = 280;
  const commentLeft = graphLeft + graphWidth;
  const commentWidth = svgWidth - commentLeft;

  return (
    <main className="min-h-screen bg-[#0A0E14] px-4 py-6 text-white md:px-8 md:py-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
          <h1 className="text-3xl font-bold">Team Debrief Summary</h1>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            Compare up to three drivers corner by corner and collect all comments in one place.
          </p>
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-white">Team</label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none"
              >
                {availableTeams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white">Track</label>
              <select
                value={selectedTrack}
                onChange={(e) => setSelectedTrack(e.target.value)}
                className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none"
              >
                <option value="">All tracks</option>
                {availableTracks.map((track) => (
                  <option key={track} value={track}>
                    {track}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white">Session</label>
              <select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none"
              >
                <option value="">All sessions</option>
                {availableSessions.map((session) => (
                  <option key={session} value={session}>
                    {session}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
          <h2 className="text-2xl font-semibold text-white">Select Drivers</h2>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            Choose up to three submitted debriefs from the filtered list.
          </p>

          {loading ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">Loading submitted debriefs...</p>
          ) : fullyFilteredDebriefs.length === 0 ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">
              No submitted debriefs match the current filters.
            </p>
          ) : (
            <div className="mt-5 grid gap-3">
              {fullyFilteredDebriefs.map((debrief) => {
                const active = selectedDebriefIds.includes(debrief.id);
                return (
                  <button
                    key={debrief.id}
                    type="button"
                    onClick={() => toggleDebriefSelection(debrief.id)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      active
                        ? "border-[#E10600] bg-[#E10600]/15 text-white"
                        : "border-[#2A3441] bg-[#1B2430] text-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold">{debrief.driver_name}</span>
                      <span className="text-xs text-[#9CA3AF]">{debrief.track_name}</span>
                      <span className="text-xs text-[#9CA3AF]">
                        {debrief.session_name || "No session"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
          <div className="flex flex-wrap items-center gap-6">
            {selectedDebriefs.map((debrief, index) => {
              const colour = lineColours[index % lineColours.length];
              return (
                <div key={debrief.id} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: colour }}
                  />
                  <span className="text-sm text-white">{debrief.driver_name}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-6 overflow-x-auto">
            <div className="min-w-[980px] rounded-2xl border border-[#2A3441] bg-[#111827]">
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

                <text x={12} y={28} fontSize="12" fill="#111827" fontWeight="700">
                  Turn
                </text>
                <text x={commentLeft + commentWidth / 2} y={28} fontSize="12" fill="#111827" fontWeight="700" textAnchor="middle">
                  Other Comments
                </text>

                {majorScaleLabels.map((item, index) => {
                  const x = xForBalance(item.value, graphLeft, graphWidth);
                  const cellWidth = graphWidth / 7;
                  return (
                    <g key={item.label}>
                      <rect
                        x={graphLeft + index * cellWidth}
                        y={0}
                        width={cellWidth}
                        height={18}
                        fill={
                          item.value === -3
                            ? "#ef4444"
                            : item.value === -2
                            ? "#f59e0b"
                            : item.value === -1
                            ? "#eab308"
                            : item.value === 0
                            ? "#22c55e"
                            : item.value === 1
                            ? "#eab308"
                            : item.value === 2
                            ? "#f59e0b"
                            : "#ef4444"
                        }
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
                      strokeWidth={isMajor ? 1.2 : 0.7}
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

                {commentsByCorner.map((corner) => {
                  if (corner.comments.length === 0) return null;

                  const blockY =
                    headerHeight + (corner.cornerId - 1) * rowsPerCorner * rowHeight;
                  const text = corner.comments
                    .map((entry) => `${entry.driverName}: ${entry.comment}`)
                    .join(" | ");

                  return (
                    <text
                      key={`comment-${corner.cornerId}`}
                      x={commentLeft + 8}
                      y={blockY + rowHeight + 18}
                      fontSize="11"
                      fill="#111827"
                    >
                      {text}
                    </text>
                  );
                })}
              </svg>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}