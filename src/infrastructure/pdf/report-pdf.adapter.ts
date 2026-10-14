import { jsPDF } from "jspdf";
import { formatDuration } from "@/domain/posture/posture";
import type { PostureReportData } from "@/domain/reports/report.types";

/** Se mantiene el alias `ReportData` para no romper imports existentes. */
export type ReportData = PostureReportData;

type Labels = {
  title: string;
  employee: string;
  dept: string;
  date: string;
  duration: string;
  goodPct: string;
  neck: string;
  torso: string;
  alerts: string;
  score: string;
  diagnosis: string;
  recommendation: string;
  footer: string;
};

export function buildReportPdf(data: ReportData, l: Labels): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = 0;

  doc.setFillColor(16, 42, 46);
  doc.rect(0, 0, pageW, 96, "F");
  doc.setTextColor(140, 226, 205);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("PosturaIA", margin, 46);
  doc.setTextColor(235, 245, 244);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(l.title, margin, 70);
  y = 132;

  doc.setTextColor(30, 41, 45);
  doc.setFontSize(11);
  const rows: Array<[string, string]> = [
    [l.employee, data.employeeName || data.email],
    [l.dept, data.department || "-"],
    [l.date, new Date(data.startedAt).toLocaleString()],
    [l.duration, `${formatDuration(data.durationSeconds)} (mm:ss)`],
    [l.goodPct, `${data.goodPosturePct.toFixed(1)} %`],
    [l.neck, `${data.avgNeckAngle.toFixed(1)}°`],
    [l.torso, `${data.avgTorsoAngle.toFixed(1)}°`],
    [l.alerts, String(data.alertsCount)],
    [l.score, `${data.score} / 100`],
  ];
  rows.forEach(([k, v], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(243, 248, 247);
      doc.rect(margin, y - 13, pageW - margin * 2, 22, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.text(k, margin + 8, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, margin + 240, y);
    y += 22;
  });

  const section = (heading: string, body: string) => {
    y += 26;
    if (y > 700) {
      doc.addPage();
      y = 80;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(16, 92, 84);
    doc.text(heading, margin, y);
    y += 8;
    doc.setDrawColor(200, 224, 220);
    doc.line(margin, y, pageW - margin, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 45);
    const lines = doc.splitTextToSize(body || "-", pageW - margin * 2);
    lines.forEach((line: string) => {
      if (y > 780) {
        doc.addPage();
        y = 80;
      }
      doc.text(line, margin, y);
      y += 16;
    });
  };

  section(l.diagnosis, data.diagnosis);
  section(l.recommendation, data.recommendation);

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(9);
    doc.setTextColor(120, 135, 138);
    doc.text(l.footer, margin, doc.internal.pageSize.getHeight() - 28);
  }
  return doc;
}
