import type { AIProvider } from "@/domain/ai/ai-provider";
import type { PostureDiagnosisResult, PostureSessionMetrics } from "@/domain/reports/report.types";

function languageName(locale: PostureSessionMetrics["locale"]): string {
  return locale === "en" ? "English" : "Spanish";
}

function summarizeMetrics(data: PostureSessionMetrics): string {
  return [
    `Session duration: ${Math.round(data.durationSeconds / 60)} minutes`,
    `Good posture time: ${data.goodPosturePct.toFixed(1)}%`,
    `Average neck (cervical) inclination: ${data.avgNeckAngle.toFixed(1)} degrees (healthy <= 38)`,
    `Average torso (thoracic) inclination: ${data.avgTorsoAngle.toFixed(1)} degrees (healthy <= 12)`,
    `Sustained bad-posture alerts: ${data.alertsCount}`,
    `Ergonomic score: ${data.score}/100`,
    data.department ? `Team/department: ${data.department}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function analystSystemPrompt(lang: string): string {
  return `You are the Biomechanical Analyst agent of an occupational-health system. You evaluate seated desk posture from computer-vision angle measurements. Write a concise clinical-style diagnosis in ${lang}: 3 to 5 short sentences, no lists, no markdown, no invented medical diagnoses. Name the detected deviations (forward head, thoracic slouch, etc.) and their likely musculoskeletal risk.`;
}

function coachSystemPrompt(lang: string): string {
  return `You are the Ergonomics Coach agent. Based on the Analyst's diagnosis and the measured data, write personalized advice in ${lang} for an office employee. Format: 4 short numbered actions (workstation setup, active breaks, exercises, habit), each one sentence, plain text without markdown symbols. End with one encouraging line.`;
}

export async function diagnosePostureSession(
  provider: AIProvider,
  data: PostureSessionMetrics,
): Promise<PostureDiagnosisResult> {
  const lang = languageName(data.locale);
  const metrics = summarizeMetrics(data);

  const diagnosis = await provider.chat([
    { role: "system", content: analystSystemPrompt(lang) },
    { role: "user", content: `Measured session data:\n${metrics}` },
  ]);

  const recommendation = await provider.chat([
    { role: "system", content: coachSystemPrompt(lang) },
    {
      role: "user",
      content: `Measured session data:\n${metrics}\n\nAnalyst diagnosis:\n${diagnosis}`,
    },
  ]);

  return { diagnosis, recommendation };
}
