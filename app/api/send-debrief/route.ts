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
    border: rgb(0.19, 0.23, 0.29),
    text: rgb(1, 1, 1),
    muted: rgb(0.65, 0.68, 0.73),
    accent: rgb(0.88, 0.02, 0.0),
    issue: rgb(0.78, 0.18, 0.18),
    incident: rgb(0.95, 0.8, 0.15),
    black: rgb(0, 0, 0),
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
      size: 14,
      font: bold,
      color: colors.text,
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

  async function drawTrackMapPanel(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height: number,
    imageUrl?: string | null,
    corners: Corner[] = [],
    incidentMarkers: IncidentMarker[] = []
  ) {
    drawPanel(page, x, y, width, height, "Track Map");

    if (!imageUrl) {
      page.drawText("No track map available", {
        x: x + 14,
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

      const boxX = x + 14;
      const boxY = y + 14;
      const boxW = width - 28;
      const boxH = height - 44;

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
          size: 12,
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
        x: x + 14,
        y: y + height / 2,
        size: 11,
        font,
        color: colors.muted,
      });
    }
  }

  const page1 = addPage();

  page1.drawRectangle({
    x: margin,
    y: pageHeight - 88,
    width: pageWidth - margin * 2,
    height: 64,
    color: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
  });

  page1.drawText("Rodin Motorsport", {
    x: margin + 16,
    y: pageHeight - 52,
    size: 11,
    font: bold,
    color: colors.accent,
  });

  page1.drawText("Driver Debrief", {
    x: margin + 16,
    y: pageHeight - 74,
    size: 24,
    font: bold,
    color: colors.text,
  });

  page1.drawText(payload.trackName || "-", {
    x: pageWidth - 220,
    y: pageHeight - 68,
    size: 16,
    font: bold,
    color: colors.text,
  });

  drawPanel(page1, margin, pageHeight - 220, 250, 112, "Session Info");

  const infoLines = [
    `Driver: ${payload.driverName || "-"}`,
    `Session: ${payload.sessionName || "-"}`,
    `Track: ${payload.trackName || "-"}`,
  ];

  infoLines.forEach((line, i) => {
    page1.drawText(line, {
      x: margin + 14,
      y: pageHeight - 154 - i * 20,
      size: 11,
      font,
      color: colors.muted,
    });
  });

  drawPanel(page1, 290, pageHeight - 220, pageWidth - 314, 112, "Reliability / Issues");

  const activeIssues = Object.entries(payload.reliabilityFlags)
    .filter(([, value]) => value)
    .map(([key]) => key);

  const issueLines = wrapText(
    activeIssues.length ? activeIssues.join(" • ") : "No issues flagged",
    70
  );

  issueLines.slice(0, 4).forEach((line, i) => {
    page1.drawText(line, {
      x: 304,
      y: pageHeight - 154 - i * 18,
      size: 11,
      font,
      color: activeIssues.length ? colors.issue : colors.muted,
    });
  });

  const leftX = margin;
  const leftW = 380;
  const rightX = 420;
  const rightW = pageWidth - rightX - margin;

  drawPanel(page1, leftX, 220, leftW, 120, "Primary Limitation");
  wrapText(payload.primaryLimitation || "-", 50)
    .slice(0, 4)
    .forEach((line, i) => {
      page1.drawText(line, {
        x: leftX + 14,
        y: 294 - i * 18,
        size: 11,
        font,
        color: colors.muted,
      });
    });

  drawPanel(page1, leftX, 70, leftW, 120, "Overall Comments");
  wrapText(payload.overallComments || "-", 50)
    .slice(0, 4)
    .forEach((line, i) => {
      page1.drawText(line, {
        x: leftX + 14,
        y: 144 - i * 18,
        size: 11,
        font,
        color: colors.muted,
      });
    });

  await drawTrackMapPanel(
    page1,
    rightX,
    70,
    rightW,
    270,
    payload.trackMapUrl,
    payload.corners,
    payload.incidentMarkers
  );

  const incidentLines =
    payload.incidentMarkers.length > 0
      ? payload.incidentMarkers.flatMap((marker, index) =>
          wrapText(
            `H${index + 1}: ${marker.note?.trim() ? marker.note.trim() : "No note"}`,
            42
          )
        )
      : ["No incident markers added"];

  drawPanel(page1, rightX, 24, rightW, 36, "Incident Notes");

  incidentLines.slice(0, 2).forEach((line, i) => {
    page1.drawText(line, {
      x: rightX + 14,
      y: 44 - i * 14,
      size: 9,
      font,
      color: colors.muted,
    });
  });

  const cornerLookup = new Map(payload.corners.map((corner) => [corner.id, corner]));
  const sortedRows = [...payload.cornerFeedback].sort((a, b) => a.cornerId - b.cornerId);

  let currentPage = addPage();
  let cursorY = pageHeight - 40;

  currentPage.drawText("Corner Summary", {
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

      currentPage.drawText("Corner Summary", {
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

    const chipY = cursorY - 17;
    drawBalanceChip(currentPage, margin + 66, chipY, 52, 18, row.entryBalance || "-", row.entryBalanceValue);
    drawBalanceChip(currentPage, margin + 136, chipY, 52, 18, row.midBalance || "-", row.midBalanceValue);
    drawBalanceChip(currentPage, margin + 206, chipY, 52, 18, row.exitBalance || "-", row.exitBalanceValue);

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

  if (payload.incidentMarkers.length > 0) {
    let incidentPage = addPage();
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
      const lines = wrapText(
        marker.note?.trim() ? marker.note.trim() : "No note",
        95
      );
      const blockHeight = Math.max(34, lines.length * 14 + 16);

      if (incidentY - blockHeight < 30) {
        incidentPage = addPage();
        incidentY = pageHeight - 40;

        incidentPage.drawText("Incident Marker Notes", {
          x: margin,
          y: incidentY,
          size: 18,
          font: bold,
          color: colors.text,
        });

        incidentY -= 30;
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

    const recipients = [primaryRecipientEmail];
    if (extraRecipientEmail && extraRecipientEmail !== primaryRecipientEmail) {
      recipients.push(extraRecipientEmail);
    }

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

    const { data, error } = await resend.emails.send({
      from: "Debrief App <onboarding@resend.dev>",
      to: recipients,
      subject: `${trackName} debrief - ${driverName}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>Driver Debrief Submitted</h2>
          <p><strong>Track:</strong> ${trackName}</p>
          <p><strong>Driver:</strong> ${driverName}</p>
          <p><strong>Session:</strong> ${sessionName || "Not provided"}</p>
          <p>The completed debrief PDF is attached.</p>
        </div>
      `,
      attachments: [
        {
          filename: `${trackName}-${driverName}-debrief.pdf`
            .replace(/\s+/g, "-")
            .toLowerCase(),
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

    return NextResponse.json({ success: true, data });
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