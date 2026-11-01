import type { Locale } from "@/domain/reports/report.types";
import type { Labels } from "./report-pdf.adapter";

export function reportPdfLabels(locale: Locale): Labels {
  if (locale === "en") {
    return {
      title: "Session report",
      employee: "Employee",
      dept: "Area",
      date: "Date",
      duration: "Duration",
      goodPct: "% good posture",
      neck: "Neck angle",
      torso: "Torso angle",
      alerts: "Alerts",
      score: "Ergonomic score",
      diagnosis: "Analyst agent — biomechanical diagnosis",
      recommendation: "Coach agent — ergonomic recommendation",
      footer: "PosturaIA · Video is processed in your browser. It is never recorded or uploaded.",
    };
  }
  return {
    title: "Informe de sesión",
    employee: "Colaborador",
    dept: "Área",
    date: "Fecha",
    duration: "Duración",
    goodPct: "% postura correcta",
    neck: "Ángulo cervical",
    torso: "Ángulo torácico",
    alerts: "Alertas",
    score: "Puntaje ergonómico",
    diagnosis: "Agente Analista — diagnóstico biomecánico",
    recommendation: "Agente Coach — recomendación ergonómica",
    footer:
      "PosturaIA · El video se procesa en tu navegador. Nunca se graba ni se envía a un servidor.",
  };
}
