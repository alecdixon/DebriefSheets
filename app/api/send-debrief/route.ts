import { Resend } from "resend";
import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

type TurnColor = "normal" | "blue" | "green" | "red";

type Corner = {
  id: number;
  x: number;
  y: number;
  color?: TurnColor;
};

type CornerFeedback = {
  cornerId: number;
  entryBalance: string;
  midBalance: string;
  exitBalance: string;
  entryBalanceValue?: number;
  midBalanceValue?: number;
  exitBalanceValue?: number;
  comment: string;
};

type IncidentMarker = {
  id: number;
  x: number;
  y: number;
  note: string;
};

type RequestBody = {
  driverName: string;
  sessionName: string;
  trackName: string;
  trackMapUrl?: string | null;
  corners?: Corner[];
  incidentMarkers?: IncidentMarker[];
  primaryRecipientEmail: string;
  extraRecipientEmail?: string | null;
  primaryLimitation?: string;
  overallComments?: string;
  reliabilityFlags: Record<string, boolean>;
  cornerFeedback: CornerFeedback[];
  team?: string;
  templateId?: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (typeof error === "object" && error !== null) {
    if ("message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }

    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return "Unknown object error";
    }
  }

  return String(error);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  if (!text?.trim()) return ["-"];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function getBalanceColor(value?: number) {
  if (value === undefined || value === null) {
    return rgb(0.18, 0.68, 0.35);
  }

  if (value <= -2.25) return rgb(0.12, 0.34, 0.78);
  if (value <= -1.25) return rgb(0.18, 0.52, 0.88);
  if (value <= -0.25) return rgb(0.14, 0.72, 0.84);
  if (value < 0.25) return rgb(0.18, 0.68, 0.35);
  if (value < 1.25) return rgb(0.86, 0.71, 0.14);
  if (value < 2.25) return rgb(0.91, 0.48, 0.15);
  return rgb(0.82, 0.19, 0.18);
}

function getTurnColor(color?: TurnColor) {
  switch (color) {
    case "blue":
      return rgb(0.16, 0.39, 0.86);
    case "green":
      return rgb(0.17, 0.69, 0.33);
    case "red":
      return rgb(0.87, 0.21, 0.18);
    default:
      return rgb(0.08, 0.1, 0.13);
  }
}

async function buildDebriefPdf(payload: {
  driverName: string;
  sessionName: string;
  trackName: string;
  trackMapUrl?: string | null;
  corners: Corner[];
  incidentMarkers: IncidentMarker[];
  primaryLimitation?: string;
  overallComments?: string;
  reliabilityFlags: Record<string, boolean>;
  cornerFeedback: CornerFeedback[];
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 24;

  const colors = {
    bg: rgb(0.08, 0.1, 0.13),
    panel: rgb(0.11, 0.14, 0.19),
    panel2: rgb(0.08, 0.11, 0.16),
    border: rgb(0.19, 0.23, 0.29),
    text: rgb(1, 1, 1),
    muted: rgb(0.65, 0.68, 0.73),
    accent: rgb(0.88, 0.02, 0.0),
    issue: rgb(0.78, 0.18, 0.18),
    incident: rgb(0.95, 0.8, 0.15),
    black: rgb(0, 0, 0),
    ok: rgb(0.18, 0.68, 0.35),
  };

  function addPage(): PDFPage {
    const page = pdf.addPage([pageWidth, pageHeight]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: colors.bg,
    });
    return page;
  }

  function drawPanel(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height: number,
    title: string
  ) {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: colors.panel,
      borderColor: colors.border,
      borderWidth: 1,
    });

    page.drawText(title, {
      x: x + 14,
      y: y + height - 26,
      size: 13,
      font: bold,
      color: colors.text,
    });
  }

  function drawMutedTextBlock(
    page: PDFPage,
    lines: string[],
    x: number,
    startY: number,
    lineGap: number,
    size = 10
  ) {
    lines.forEach((line, index) => {
      page.drawText(line, {
        x,
        y: startY - index * lineGap,
        size,
        font,
        color: colors.muted,
      });
    });
  }

  function drawBalanceChip(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    value?: number
  ) {
    const fill = getBalanceColor(value);

    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: fill,
      borderColor: colors.border,
      borderWidth: 0.8,
    });

    const textWidth = bold.widthOfTextAtSize(label, 8.5);
    page.drawText(label, {
      x: x + (width - textWidth) / 2,
      y: y + height / 2 - 3.5,
      size: 8.5,
      font: bold,
      color: colors.text,
    });
  }

  function drawTurnChip(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    color?: TurnColor
  ) {
    const fill = getTurnColor(color);

    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: fill,
      borderColor: colors.border,
      borderWidth: 0.8,
    });

    const textWidth = bold.widthOfTextAtSize(label, 8.5);
    page.drawText(label, {
      x: x + (width - textWidth) / 2,
      y: y + height / 2 - 3.5,
      size: 8.5,
      font: bold,
      color: colors.text,
    });
  }

  async function drawTrackMap(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height: number,
    imageUrl?: string | null,
    corners: Corner[] = [],
    incidentMarkers: IncidentMarker[] = []
  ) {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: colors.panel2,
      borderColor: colors.border,
      borderWidth: 1,
    });

    if (!imageUrl) {
      page.drawText("No track map available", {
        x: x + 16,
        y: y + height / 2,
        size: 11,
        font,
        color: colors.muted,
      });
      return;
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`Track map fetch failed: ${response.status}`);

      const imageBytes = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "";

      let image;
      if (contentType.includes("png")) {
        image = await pdf.embedPng(imageBytes);
      } else {
        image = await pdf.embedJpg(imageBytes);
      }

      const padding = 16;
      const boxX = x + padding;
      const boxY = y + padding;
      const boxW = width - padding * 2;
      const boxH = height - padding * 2;

      const imgW = image.width;
      const imgH = image.height;
      const scale = Math.min(boxW / imgW, boxH / imgH);

      const drawW = imgW * scale;
      const drawH = imgH * scale;
      const drawX = boxX + (boxW - drawW) / 2;
      const drawY = boxY + (boxH - drawH) / 2;

      page.drawImage(image, {
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH,
      });

      for (const corner of corners) {
        const markerX = drawX + (corner.x / 100) * drawW;
        const markerY = drawY + drawH - (corner.y / 100) * drawH;

        page.drawCircle({
          x: markerX,
          y: markerY,
          size: 11,
          color: getTurnColor(corner.color),
          borderColor: colors.text,
          borderWidth: 1.5,
        });

        const label = String(corner.id);
        const fontSize = label.length >= 2 ? 8 : 9;
        const textWidth = bold.widthOfTextAtSize(label, fontSize);

        page.drawText(label, {
          x: markerX - textWidth / 2,
          y: markerY - fontSize / 2 + 1,
          size: fontSize,
          font: bold,
          color: colors.text,
        });
      }

      for (let i = 0; i < incidentMarkers.length; i++) {
        const marker = incidentMarkers[i];
        const markerX = drawX + (marker.x / 100) * drawW;
        const markerY = drawY + drawH - (marker.y / 100) * drawH;

        page.drawCircle({
          x: markerX,
          y: markerY,
          size: 8,
          color: colors.incident,
          borderColor: colors.black,
          borderWidth: 1,
        });

        const label = `H${i + 1}`;
        const fontSize = 6.5;
        const textWidth = bold.widthOfTextAtSize(label, fontSize);

        page.drawText(label, {
          x: markerX - textWidth / 2,
          y: markerY - fontSize / 2 + 0.5,
          size: fontSize,
          font: bold,
          color: colors.black,
        });
      }
    } catch {
      page.drawText("Track map could not be loaded", {
        x: x + 16,
        y: y + height / 2,
        size: 11,
        font,
        color: colors.muted,
      });
    }
  }

  function drawCornerSummaryCard(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    row: CornerFeedback,
    cornerMeta?: Corner
  ) {
    const rowHeight = 32;

    page.drawRectangle({
      x,
      y,
      width,
      height: rowHeight,
      color: colors.panel2,
      borderColor: colors.border,
      borderWidth: 1,
    });

    drawTurnChip(page, x + 8, y + 7, 42, 18, `T${row.cornerId}`, cornerMeta?.color);
    drawBalanceChip(page, x + 58, y + 7, 50, 18, row.entryBalance || "-", row.entryBalanceValue);
    drawBalanceChip(page, x + 114, y + 7, 50, 18, row.midBalance || "-", row.midBalanceValue);
    drawBalanceChip(page, x + 170, y + 7, 50, 18, row.exitBalance || "-", row.exitBalanceValue);

    const comment = row.comment?.trim() ? row.comment.trim() : "-";
    const commentLines = wrapText(comment, 24).slice(0, 2);

    commentLines.forEach((line, index) => {
      page.drawText(line, {
        x: x + 228,
        y: y + 16 - index * 10,
        size: 8.5,
        font,
        color: colors.muted,
      });
    });
  }

  const cornerLookup = new Map(payload.corners.map((corner) => [corner.id, corner]));
  const sortedRows = [...payload.cornerFeedback].sort((a, b) => a.cornerId - b.cornerId);

  const activeIssues = Object.entries(payload.reliabilityFlags)
    .filter(([, value]) => value)
    .map(([key]) => key);

  const page1 = addPage();

  page1.drawRectangle({
    x: margin,
    y: pageHeight - 84,
    width: pageWidth - margin * 2,
    height: 58,
    color: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
  });

  page1.drawText("Rodin Motorsport", {
    x: margin + 16,
    y: pageHeight - 48,
    size: 10.5,
    font: bold,
    color: colors.accent,
  });

  page1.drawText("Driver Debrief", {
    x: margin + 16,
    y: pageHeight - 68,
    size: 22,
    font: bold,
    color: colors.text,
  });

  const rightHeader = `${payload.trackName || "-"}${payload.sessionName ? ` · ${payload.sessionName}` : ""}`;
  page1.drawText(rightHeader, {
    x: pageWidth - 260,
    y: pageHeight - 60,
    size: 13,
    font: bold,
    color: colors.text,
  });

  const topPanelY = 392;
  const topPanelH = 84;
  const infoW = 250;
  const issuesW = pageWidth - margin * 2 - infoW - 12;

  drawPanel(page1, margin, topPanelY, infoW, topPanelH, "Session Info");
  drawMutedTextBlock(
    page1,
    [
      `Driver: ${payload.driverName || "-"}`,
      `Session: ${payload.sessionName || "-"}`,
      `Track: ${payload.trackName || "-"}`,
    ],
    margin + 14,
    topPanelY + topPanelH - 44,
    16,
    10
  );

  drawPanel(page1, margin + infoW + 12, topPanelY, issuesW, topPanelH, "Reliability / Issues");
  drawMutedTextBlock(
    page1,
    wrapText(activeIssues.length ? activeIssues.join(" • ") : "No issues flagged", 78).slice(0, 3),
    margin + infoW + 26,
    topPanelY + topPanelH - 44,
    16,
    10
  );

  const contentY = 132;
  const contentH = 246;
  const leftW = 360;
  const rightX = margin + leftW + 12;
  const rightW = pageWidth - margin - rightX;

  drawPanel(page1, margin, contentY, leftW, contentH, "Track Map");
  await drawTrackMap(
    page1,
    margin + 10,
    contentY + 10,
    leftW - 20,
    contentH - 34,
    payload.trackMapUrl,
    payload.corners,
    payload.incidentMarkers
  );

  drawPanel(page1, rightX, contentY, rightW, contentH, "Corner Balance Summary");

  page1.drawText("Corner", {
    x: rightX + 10,
    y: contentY + contentH - 44,
    size: 9,
    font: bold,
    color: colors.muted,
  });
  page1.drawText("Entry", {
    x: rightX + 62,
    y: contentY + contentH - 44,
    size: 9,
    font: bold,
    color: colors.muted,
  });
  page1.drawText("Mid", {
    x: rightX + 118,
    y: contentY + contentH - 44,
    size: 9,
    font: bold,
    color: colors.muted,
  });
  page1.drawText("Exit", {
    x: rightX + 174,
    y: contentY + contentH - 44,
    size: 9,
    font: bold,
    color: colors.muted,
  });
  page1.drawText("Comment", {
    x: rightX + 230,
    y: contentY + contentH - 44,
    size: 9,
    font: bold,
    color: colors.muted,
  });

  let summaryY = contentY + contentH - 76;
  const summaryRowHeight = 38;
  const firstPageRows = Math.min(sortedRows.length, 5);

  for (let i = 0; i < firstPageRows; i++) {
    const row = sortedRows[i];
    const cornerMeta = cornerLookup.get(row.cornerId);
    drawCornerSummaryCard(page1, rightX + 10, summaryY, rightW - 20, row, cornerMeta);
    summaryY -= summaryRowHeight;
  }

  if (sortedRows.length > firstPageRows) {
    page1.drawText(`+ ${sortedRows.length - firstPageRows} more corners on following page(s)`, {
      x: rightX + 10,
      y: contentY + 12,
      size: 8.5,
      font,
      color: colors.muted,
    });
  }

  const bottomY = 24;
  const bottomH = 96;
  const leftBottomW = 392;
  const rightBottomX = margin + leftBottomW + 12;
  const rightBottomW = pageWidth - margin - rightBottomX;

  drawPanel(page1, margin, bottomY, leftBottomW, bottomH, "Primary Limitation");
  drawMutedTextBlock(
    page1,
    wrapText(payload.primaryLimitation || "-", 56).slice(0, 4),
    margin + 14,
    bottomY + bottomH - 42,
    14,
    9.5
  );

  drawPanel(page1, rightBottomX, bottomY, rightBottomW, bottomH, "Overall Comments");
  drawMutedTextBlock(
    page1,
    wrapText(payload.overallComments || "-", 50).slice(0, 4),
    rightBottomX + 14,
    bottomY + bottomH - 42,
    14,
    9.5
  );

  if (payload.incidentMarkers.length > 0) {
    const incidentPage = addPage();
    let incidentY = pageHeight - 40;

    incidentPage.drawText("Incident Marker Notes", {
      x: margin,
      y: incidentY,
      size: 18,
      font: bold,
      color: colors.text,
    });

    incidentY -= 30;

    for (let i = 0; i < payload.incidentMarkers.length; i++) {
      const marker = payload.incidentMarkers[i];
      const lines = wrapText(marker.note?.trim() ? marker.note.trim() : "No note", 95);
      const blockHeight = Math.max(34, lines.length * 14 + 16);

      if (incidentY - blockHeight < 30) {
        incidentY = pageHeight - 40;
        const newPage = addPage();

        newPage.drawText("Incident Marker Notes", {
          x: margin,
          y: incidentY,
          size: 18,
          font: bold,
          color: colors.text,
        });

        incidentY -= 30;

        newPage.drawRectangle({
          x: margin,
          y: incidentY - blockHeight + 8,
          width: pageWidth - margin * 2,
          height: blockHeight,
          color: colors.panel,
          borderColor: colors.border,
          borderWidth: 1,
        });

        newPage.drawText(`H${i + 1}`, {
          x: margin + 12,
          y: incidentY - 10,
          size: 11,
          font: bold,
          color: colors.incident,
        });

        lines.forEach((line, lineIndex) => {
          newPage.drawText(line, {
            x: margin + 50,
            y: incidentY - 10 - lineIndex * 14,
            size: 10,
            font,
            color: colors.muted,
          });
        });

        incidentY -= blockHeight + 10;
        continue;
      }

      incidentPage.drawRectangle({
        x: margin,
        y: incidentY - blockHeight + 8,
        width: pageWidth - margin * 2,
        height: blockHeight,
        color: colors.panel,
        borderColor: colors.border,
        borderWidth: 1,
      });

      incidentPage.drawText(`H${i + 1}`, {
        x: margin + 12,
        y: incidentY - 10,
        size: 11,
        font: bold,
        color: colors.incident,
      });

      lines.forEach((line, lineIndex) => {
        incidentPage.drawText(line, {
          x: margin + 50,
          y: incidentY - 10 - lineIndex * 14,
          size: 10,
          font,
          color: colors.muted,
        });
      });

      incidentY -= blockHeight + 10;
    }
  }

  let currentPage = addPage();
  let cursorY = pageHeight - 40;

  currentPage.drawText("Full Corner Summary", {
    x: margin,
    y: cursorY,
    size: 18,
    font: bold,
    color: colors.text,
  });

  cursorY -= 28;

  function drawTableHeader(page: PDFPage, y: number) {
    page.drawRectangle({
      x: margin,
      y: y - 16,
      width: pageWidth - margin * 2,
      height: 24,
      color: colors.panel,
      borderColor: colors.border,
      borderWidth: 1,
    });

    page.drawText("Corner", {
      x: margin + 10,
      y: y - 8,
      size: 10,
      font: bold,
      color: colors.muted,
    });

    page.drawText("Entry", {
      x: margin + 75,
      y: y - 8,
      size: 10,
      font: bold,
      color: colors.muted,
    });

    page.drawText("Mid", {
      x: margin + 145,
      y: y - 8,
      size: 10,
      font: bold,
      color: colors.muted,
    });

    page.drawText("Exit", {
      x: margin + 215,
      y: y - 8,
      size: 10,
      font: bold,
      color: colors.muted,
    });

    page.drawText("Comment", {
      x: margin + 290,
      y: y - 8,
      size: 10,
      font: bold,
      color: colors.muted,
    });
  }

  drawTableHeader(currentPage, cursorY);
  cursorY -= 30;

  for (const row of sortedRows) {
    const commentLines = wrapText(row.comment || "-", 55);
    const rowHeight = Math.max(28, commentLines.length * 14 + 12);

    if (cursorY - rowHeight < 30) {
      currentPage = addPage();
      cursorY = pageHeight - 40;

      currentPage.drawText("Full Corner Summary", {
        x: margin,
        y: cursorY,
        size: 18,
        font: bold,
        color: colors.text,
      });

      cursorY -= 28;
      drawTableHeader(currentPage, cursorY);
      cursorY -= 30;
    }

    currentPage.drawRectangle({
      x: margin,
      y: cursorY - rowHeight + 8,
      width: pageWidth - margin * 2,
      height: rowHeight,
      color: colors.panel,
      borderColor: colors.border,
      borderWidth: 1,
    });

    const cornerMeta = cornerLookup.get(row.cornerId);

    drawTurnChip(
      currentPage,
      margin + 8,
      cursorY - 17,
      42,
      18,
      `T${row.cornerId}`,
      cornerMeta?.color
    );

    drawBalanceChip(
      currentPage,
      margin + 66,
      cursorY - 17,
      52,
      18,
      row.entryBalance || "-",
      row.entryBalanceValue
    );
    drawBalanceChip(
      currentPage,
      margin + 136,
      cursorY - 17,
      52,
      18,
      row.midBalance || "-",
      row.midBalanceValue
    );
    drawBalanceChip(
      currentPage,
      margin + 206,
      cursorY - 17,
      52,
      18,
      row.exitBalance || "-",
      row.exitBalanceValue
    );

    commentLines.forEach((line, i) => {
      currentPage.drawText(line, {
        x: margin + 290,
        y: cursorY - 10 - i * 14,
        size: 10,
        font,
        color: colors.muted,
      });
    });

    cursorY -= rowHeight + 8;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);
    const body = (await request.json()) as RequestBody;

    const {
      driverName,
      sessionName,
      trackName,
      trackMapUrl,
      corners,
      incidentMarkers,
      primaryRecipientEmail,
      extraRecipientEmail,
      primaryLimitation,
      overallComments,
      reliabilityFlags,
      cornerFeedback,
      team,
      templateId,
    } = body;

    if (!driverName || !primaryRecipientEmail || !trackName) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    const intendedRecipients = [
      primaryRecipientEmail?.trim(),
      extraRecipientEmail?.trim(),
    ].filter((value, index, array): value is string => {
      return Boolean(value) && array.indexOf(value) === index;
    });

    const actualRecipient = "alec.dixon@rodinmotorsport.com";
    const recipientLabel = intendedRecipients.join(" | ");

    const { error: saveError } = await supabase.from("submitted_debriefs").insert({
      team: team ?? null,
      template_id: templateId ?? null,
      track_name: trackName,
      session_name: sessionName ?? null,
      driver_name: driverName,
      primary_limitation: primaryLimitation ?? null,
      overall_comments: overallComments ?? null,
      reliability_flags: reliabilityFlags ?? {},
      corner_feedback: cornerFeedback ?? [],
      incident_markers: incidentMarkers ?? [],
    });

    if (saveError) {
      return NextResponse.json(
        { error: `Failed to save debrief: ${saveError.message}` },
        { status: 500 }
      );
    }

    const pdfBuffer = await buildDebriefPdf({
      driverName,
      sessionName,
      trackName,
      trackMapUrl,
      corners: corners ?? [],
      incidentMarkers: incidentMarkers ?? [],
      primaryLimitation,
      overallComments,
      reliabilityFlags: reliabilityFlags ?? {},
      cornerFeedback: cornerFeedback ?? [],
    });

    const pdfBase64 = pdfBuffer.toString("base64");

    const safeTrack = slugify(trackName || "track");
    const safeDriver = slugify(driverName || "driver");
    const safeSession = slugify(sessionName || "session");
    const attachmentFilename = `${safeTrack}-${safeDriver}-debrief-${safeSession}.pdf`;

    const { data, error } = await resend.emails.send({
      from: "Debrief App <onboarding@resend.dev>",
      to: [actualRecipient],
      subject: `[FORWARD_TO=${recipientLabel}] [TEAM=${team ?? "UNKNOWN"}] ${trackName} debrief - ${driverName}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>Driver Debrief Submitted</h2>
          <p><strong>Selected recipient(s):</strong> ${recipientLabel || "None provided"}</p>
          <p><strong>Team:</strong> ${team ?? "Not provided"}</p>
          <p><strong>Track:</strong> ${trackName}</p>
          <p><strong>Driver:</strong> ${driverName}</p>
          <p><strong>Session:</strong> ${sessionName || "Not provided"}</p>
          <p>The completed debrief PDF is attached.</p>
        </div>
      `,
      attachments: [
        {
          filename: attachmentFilename,
          content: pdfBase64,
        },
      ],
    });

    if (error) {
      return NextResponse.json(
        { error: `Failed to send email: ${getErrorMessage(error)}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      sentTo: actualRecipient,
      intendedRecipients,
      attachmentFilename,
    });
  } catch (error) {
    console.error("send-debrief route failed:", error);

    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}