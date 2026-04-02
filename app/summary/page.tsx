"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

type ChartMode = "entry" | "mid" | "exit";

const lineColours = ["#3b82f6", "#22c55e", "#ef4444"];

export default function SummaryPage() {
  const [allDebriefs, setAllDebriefs] = useState<SubmittedDebrief[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTeam, setSelectedTeam] = useState("GB3");
  const [selectedTrack, setSelectedTrack] = useState("");
  const [selectedSession, setSelectedSession] = useState("");
  const [mode, setMode] = useState<ChartMode>("mid");

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
    const tracks = Array.from(new Set(filteredByTeam.map((d) => d.track_name).filter(Boolean)));
    return tracks.sort();
  }, [filteredByTeam]);

  const filteredByTrack = useMemo(() => {
    if (!selectedTrack) return filteredByTeam;
    return filteredByTeam.filter((d) => d.track_name === selectedTrack);
  }, [filteredByTeam, selectedTrack]);

  const availableSessions = useMemo(() => {
    const sessions = Array.from(
      new Set(filteredByTrack.map((d) => d.session_name ?? "").filter(Boolean))
    );
    return sessions.sort();
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
      .filter((d): d is SubmittedDebrief => !!d);
  }, [fullyFilteredDebriefs, selectedDebriefIds]);

  const chartData = useMemo(() => {
    if (selectedDebriefs.length === 0) return [];

    const maxCorner =
      Math.max(
        ...selectedDebriefs.flatMap((d) =>
          (d.corner_feedback ?? []).map((c) => c.cornerId)
        )
      ) || 0;

    return Array.from({ length: maxCorner }, (_, i) => {
      const cornerId = i + 1;
      const row: Record<string, string | number | null> = {
        corner: `T${cornerId}`,
      };

      selectedDebriefs.forEach((debrief) => {
        const feedback = (debrief.corner_feedback ?? []).find(
          (c) => c.cornerId === cornerId
        );

        let value: number | null = null;

        if (feedback) {
          if (mode === "entry") value = feedback.entryBalanceValue ?? null;
          if (mode === "mid") value = feedback.midBalanceValue ?? null;
          if (mode === "exit") value = feedback.exitBalanceValue ?? null;
        }

        row[debrief.driver_name] = value;
      });

      return row;
    });
  }, [selectedDebriefs, mode]);

  const commentsByCorner = useMemo(() => {
    if (selectedDebriefs.length === 0) return [];

    const maxCorner =
      Math.max(
        ...selectedDebriefs.flatMap((d) =>
          (d.corner_feedback ?? []).map((c) => c.cornerId)
        )
      ) || 0;

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

      return {
        cornerId,
        comments,
      };
    }).filter((corner) => corner.comments.length > 0);
  }, [selectedDebriefs]);

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

  return (
    <main className="min-h-screen bg-[#0A0E14] px-4 py-6 text-white md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
          <h1 className="text-3xl font-bold">Team Debrief Summary</h1>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            Compare up to three submitted debriefs corner by corner and review all driver comments in one place.
          </p>
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
          <div className="grid gap-4 md:grid-cols-4">
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

            <div>
              <label className="mb-2 block text-sm font-medium text-white">Phase</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ChartMode)}
                className="w-full rounded-2xl border border-[#2A3441] bg-[#1B2430] px-4 py-3 text-white outline-none"
              >
                <option value="entry">Entry</option>
                <option value="mid">Mid</option>
                <option value="exit">Exit</option>
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
          <h2 className="text-2xl font-semibold text-white">Select Debriefs</h2>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            Choose up to three debriefs from the filtered list.
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
          <h2 className="text-2xl font-semibold text-white">Balance Comparison</h2>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            {selectedTeam || "Team"} · {selectedTrack || "All tracks"} · {selectedSession || "All sessions"} · {mode}
          </p>

          <div className="mt-6 h-[520px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="#2A3441" />
                <XAxis dataKey="corner" stroke="#9CA3AF" />
                <YAxis domain={[-3, 3]} stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#141A22",
                    border: "1px solid #2A3441",
                    borderRadius: "14px",
                    color: "#fff",
                  }}
                />
                <Legend />
                {selectedDebriefs.map((debrief, index) => (
                  <Line
                    key={debrief.id}
                    type="monotone"
                    dataKey={debrief.driver_name}
                    name={debrief.driver_name}
                    stroke={lineColours[index % lineColours.length]}
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#2A3441] bg-[#141A22] p-6 shadow-2xl">
          <h2 className="text-2xl font-semibold text-white">Corner Comments</h2>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            All driver comments ordered corner by corner for the selected debriefs.
          </p>

          {commentsByCorner.length === 0 ? (
            <p className="mt-5 text-sm text-[#9CA3AF]">
              No comments available for the selected debriefs.
            </p>
          ) : (
            <div className="mt-5 space-y-5">
              {commentsByCorner.map((corner) => (
                <div
                  key={corner.cornerId}
                  className="rounded-3xl border border-[#2A3441] bg-[#111827] p-5"
                >
                  <h3 className="text-xl font-semibold text-white">T{corner.cornerId}</h3>

                  <div className="mt-4 space-y-3">
                    {corner.comments.map((entry, index) => (
                      <div
                        key={`${corner.cornerId}-${entry.driverName}-${index}`}
                        className="rounded-2xl border border-[#2A3441] bg-[#1B2430] p-4"
                      >
                        <div className="mb-2 text-sm font-semibold text-white">
                          {entry.driverName}
                        </div>
                        <div className="text-sm leading-6 text-[#9CA3AF]">
                          {entry.comment}
                        </div>
                      </div>
                    ))}
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