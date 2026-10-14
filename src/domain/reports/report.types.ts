

export type Locale = "es" | "en";

export type PostureSessionMetrics = {
  locale: Locale;
  durationSeconds: number;
  goodPosturePct: number;
  avgNeckAngle: number;
  avgTorsoAngle: number;
  alertsCount: number;
  score: number;
  department?: string | undefined;
};

export type PostureDiagnosisResult = {
  diagnosis: string;
  recommendation: string;
};

export type PostureReportData = {
  employeeName: string;
  email: string;
  department: string;
  startedAt: string;
  durationSeconds: number;
  goodPosturePct: number;
  avgNeckAngle: number;
  avgTorsoAngle: number;
  alertsCount: number;
  score: number;
  diagnosis: string;
  recommendation: string;
};
