import { NECK_LIMIT, TORSO_LIMIT } from "@/domain/posture/posture";
import type { PostureSessionMetrics } from "@/domain/reports/report.types";

export interface ValidationIssue {
  field: "diagnosis" | "recommendation";
  code: "empty" | "too_long" | "format" | "medical_claim" | "language" | "inconsistent";
  message: string;
  hard: boolean;
}

export function sanitizeText(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[*•-]\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const DEFINITIVE_DIAGNOSIS =
  /\b(you (have|suffer from)|usted (tiene|padece)|tienes|padeces|sufres de)\b[^.]{0,60}\b(hernia|herniated|disc|disco|scoliosis|escoliosis|arthritis|artritis|arthrosis|artrosis|sciatica|ci[aá]tica|tumou?r|tumor|cancer|c[aá]ncer|fracture|fractura)\b/i;
const MEDICATION =
  /\b(ibuprofen|ibuprofeno|paracetamol|acetaminophen|naproxen|naproxeno|diclofenac|diclofenaco|aspirin|aspirina|tramadol|cortico|corticoid|inyecci[oó]n|injection|prescri(be|bo|ption)|receta m[eé]dica)\b/i;

const ES_MARKERS = /\b(el|la|los|las|de|que|con|para|tu|una|un|en|por|es|y)\b/gi;
const EN_MARKERS = /\b(the|and|your|with|for|you|is|are|of|to|in)\b/gi;

export function validateOutputs(
  out: { diagnosis: string; recommendation: string },
  metrics: PostureSessionMetrics,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fields = [
    ["diagnosis", out.diagnosis, 900],
    ["recommendation", out.recommendation, 1500],
  ] as const;

  for (const [field, text, max] of fields) {
    if (text.trim().length < 20) {
      issues.push({ field, code: "empty", message: `${field} is empty or too short`, hard: true });
      continue;
    }
    if (text.length > max) {
      issues.push({
        field,
        code: "too_long",
        message: `${field} exceeds ${max} characters`,
        hard: false,
      });
    }
    if (DEFINITIVE_DIAGNOSIS.test(text) || MEDICATION.test(text)) {
      issues.push({
        field,
        code: "medical_claim",
        message: `${field} contains a definitive medical diagnosis or medication advice`,
        hard: true,
      });
    }
    const es = (text.match(ES_MARKERS) ?? []).length;
    const en = (text.match(EN_MARKERS) ?? []).length;
    const wrong = metrics.locale === "es" ? en > es * 1.5 && en > 5 : es > en * 1.5 && es > 5;
    if (wrong) {
      issues.push({
        field,
        code: "language",
        message: `${field} is not written in ${metrics.locale === "es" ? "Spanish" : "English"}`,
        hard: false,
      });
    }
    if (
      metrics.score >= 85 &&
      /(riesgo alto|alto riesgo|high risk|severe|severo|grave)/i.test(text)
    ) {
      issues.push({
        field,
        code: "inconsistent",
        message: `${field} claims high risk but score is ${metrics.score}`,
        hard: false,
      });
    }
    if (metrics.score < 60 && /(excelente|excellent|perfect[ao]?)\b/i.test(text)) {
      issues.push({
        field,
        code: "inconsistent",
        message: `${field} praises posture but score is ${metrics.score}`,
        hard: false,
      });
    }
  }

  const numbered = (out.recommendation.match(/^\s*\d+[.)]/gm) ?? []).length;
  if (out.recommendation.trim().length >= 20 && numbered < 3) {
    issues.push({
      field: "recommendation",
      code: "format",
      message: "recommendation must contain 4 numbered actions",
      hard: false,
    });
  }
  return issues;
}

export function buildSafeFallback(metrics: PostureSessionMetrics): {
  diagnosis: string;
  recommendation: string;
} {
  const neckHigh = metrics.avgNeckAngle > NECK_LIMIT;
  const torsoHigh = metrics.avgTorsoAngle > TORSO_LIMIT;
  const n = metrics.avgNeckAngle.toFixed(0);
  const t = metrics.avgTorsoAngle.toFixed(0);
  const g = metrics.goodPosturePct.toFixed(0);

  if (metrics.locale === "en") {
    const findings = [
      neckHigh ? `average neck inclination (${n}°) is above the ${NECK_LIMIT}° reference` : null,
      torsoHigh ? `average torso inclination (${t}°) is above the ${TORSO_LIMIT}° reference` : null,
    ].filter(Boolean);
    return {
      diagnosis: `You kept a good posture ${g}% of the session with ${metrics.alertsCount} sustained alert(s) and a score of ${metrics.score}/100. ${
        findings.length
          ? `Measured: ${findings.join("; ")}.`
          : "Measured angles stayed within the reference values."
      } This is an informational summary, not a medical assessment.`,
      recommendation: [
        "1. Place the top of the screen at eye level, about an arm's length away.",
        "2. Sit with your hips back in the chair and your lower back supported.",
        "3. Take a 2–3 minute active break every 30–45 minutes.",
        "4. Do 10 gentle chin tucks every couple of hours.",
        "Small, consistent adjustments add up — keep going.",
      ].join("\n"),
    };
  }
  const findings = [
    neckHigh
      ? `la inclinación cervical media (${n}°) supera la referencia de ${NECK_LIMIT}°`
      : null,
    torsoHigh
      ? `la inclinación torácica media (${t}°) supera la referencia de ${TORSO_LIMIT}°`
      : null,
  ].filter(Boolean);
  return {
    diagnosis: `Mantuviste buena postura el ${g}% de la sesión, con ${metrics.alertsCount} alerta(s) sostenida(s) y un puntaje de ${metrics.score}/100. ${
      findings.length
        ? `Medido: ${findings.join("; ")}.`
        : "Los ángulos medidos se mantuvieron dentro de los valores de referencia."
    } Es un resumen informativo, no una valoración médica.`,
    recommendation: [
      "1. Sube la pantalla hasta que el borde superior quede a la altura de los ojos, a un largo de brazo.",
      "2. Siéntate con la cadera al fondo de la silla y la zona lumbar apoyada.",
      "3. Haz una pausa activa de 2–3 minutos cada 30–45 minutos.",
      "4. Realiza 10 retracciones suaves del mentón cada un par de horas.",
      "Los pequeños ajustes constantes suman: sigue así.",
    ].join("\n"),
  };
}
