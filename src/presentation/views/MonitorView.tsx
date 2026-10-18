import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, CircleStop, Download, Play, Volume2, VolumeX } from "lucide-react";
import { analyzeSession } from "@/infrastructure/server-functions/analyze-session.server";
import { useI18n } from "@/presentation/i18n/i18n";
import { useAuth } from "@/presentation/hooks/useAuth";
import { useOrganization } from "@/presentation/organization/organization-context";
import { buildReportPdf } from "@/infrastructure/pdf/report-pdf.adapter";
import {
  startPostureSession,
  finishPostureSession,
} from "@/infrastructure/supabase/repositories/posture-sessions.repository";
import { recordPostureAlert } from "@/infrastructure/supabase/repositories/posture-alerts.repository";
import { getProfileSummary } from "@/infrastructure/supabase/repositories/profiles.repository";
import { getDepartmentByUserId } from "@/infrastructure/supabase/repositories/organizations.repository";
import {
  createSmoother,
  ergonomicScore,
  formatDuration,
  NECK_LIMIT,
  readPosture,
  SHOULDER_TILT_LIMIT,
  TORSO_LIMIT,
  type Point,
  type PostureMode,
} from "@/domain/posture/posture";
import cameraGuide from "@/assets/camera-guide.jpg";

type Stats = {
  samples: number;
  goodSamples: number;
  neckSum: number;
  torsoSum: number;
  alerts: number;
};

const BAD_STREAK_SECONDS = 8;

export function MonitorView() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { membership, isHr, loading: orgLoading } = useOrganization();
  const orgId = membership?.orgId;
  const analyze = useServerFn(analyzeSession);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<{
    detectForVideo: (v: HTMLVideoElement, ts: number) => unknown;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const statsRef = useRef<Stats>({
    samples: 0,
    goodSamples: 0,
    neckSum: 0,
    torsoSum: 0,
    alerts: 0,
  });
  const badStreakRef = useRef(0);
  const lastSampleRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const soundRef = useRef(true);
  const smootherRef = useRef(createSmoother(0.3));

  const [modelLoading, setModelLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [sound, setSound] = useState(true);
  const [reading, setReading] = useState<{
    neck: number;
    torso: number;
    good: boolean;
    mode: PostureMode;
  } | null>(null);
  const [detected, setDetected] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [stats, setStats] = useState<Stats>(statsRef.current);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{
    diagnosis: string;
    recommendation: string;
    score: number;
    goodPct: number;
    neck: number;
    torso: number;
    alerts: number;
    duration: number;
    startedAt: string;
  } | null>(null);

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  const beep = useCallback(() => {
    if (!soundRef.current) return;
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 720;
      gain.gain.value = 0.14;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
      setTimeout(() => void ctx.close(), 700);
    } catch {
      /* audio not available */
    }
  }, []);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker) return;

    if (video.readyState >= 2) {
      const res = landmarker.detectForVideo(video, performance.now()) as {
        landmarks?: Point[][];
      };
      const lm = res?.landmarks?.[0];
      const ctx = canvas.getContext("2d");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (lm) {
          ctx.fillStyle = "#5ee0c0";
          lm.forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x * canvas.width, p.y * canvas.height, 3.5, 0, Math.PI * 2);
            ctx.fill();
          });
          const pairs: Array<[number, number]> = [
            [7, 11],
            [8, 12],
            [11, 12],
            [11, 23],
            [12, 24],
            [23, 24],
          ];
          ctx.strokeStyle = "#5ee0c0";
          ctx.lineWidth = 2.5;
          pairs.forEach(([a, b]) => {
            const pa = lm[a];
            const pb = lm[b];
            if (!pa || !pb) return;
            ctx.beginPath();
            ctx.moveTo(pa.x * canvas.width, pa.y * canvas.height);
            ctx.lineTo(pb.x * canvas.width, pb.y * canvas.height);
            ctx.stroke();
          });
        }
      }

      const posture = smootherRef.current(lm ? readPosture(lm) : null);
      setDetected(Boolean(posture));
      if (posture) {
        setReading({
          neck: posture.neckAngle,
          torso: posture.torsoAngle,
          good: posture.good,
          mode: posture.mode,
        });
        const now = performance.now();
        if (now - lastSampleRef.current >= 1000) {
          lastSampleRef.current = now;
          const s = statsRef.current;
          s.samples += 1;
          s.neckSum += posture.neckAngle;
          s.torsoSum += posture.torsoAngle;
          if (posture.good) {
            s.goodSamples += 1;
            badStreakRef.current = 0;
          } else {
            badStreakRef.current += 1;
            if (badStreakRef.current >= BAD_STREAK_SECONDS) {
              badStreakRef.current = 0;
              s.alerts += 1;
              beep();
              toast.warning(t("monitor.alertToast"));
              const sessionId = sessionIdRef.current;
              if (sessionId && user) {
                recordPostureAlert({
                  session_id: sessionId,
                  user_id: user.id,
                  alert_type: posture.neckAngle > NECK_LIMIT ? "forward_head" : "torso_slouch",
                  severity: posture.neckAngle > NECK_LIMIT + 15 ? "high" : "medium",
                  neck_angle: Number(posture.neckAngle.toFixed(1)),
                  torso_angle: Number(posture.torsoAngle.toFixed(1)),
                });
              }
            }
          }
          setStats({ ...s });
        }
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [beep, t, user]);

  const start = async () => {
    if (!user) return;
    setModelLoading(true);
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
      );
      const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.35,
        minPosePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
      });
      landmarkerRef.current = landmarker as unknown as {
        detectForVideo: (v: HTMLVideoElement, ts: number) => unknown;
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const startedAt = new Date().toISOString();

      if (!user?.id || !orgId) {
        throw new Error("No se encontró el usuario o la organización");
      }

      const session = await startPostureSession(user.id, orgId, startedAt);
      sessionIdRef.current = session.id;

      statsRef.current = { samples: 0, goodSamples: 0, neckSum: 0, torsoSum: 0, alerts: 0 };
      setStats(statsRef.current);
      setElapsed(0);
      setResult(null);
      badStreakRef.current = 0;
      lastSampleRef.current = 0;
      smootherRef.current = createSmoother(0.3);
      setRunning(true);
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : t("monitor.cameraError"));
    } finally {
      setModelLoading(false);
    }
  };

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (video) video.srcObject = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const stop = async () => {
    const sessionId = sessionIdRef.current;
    stopCamera();
    setRunning(false);
    setReading(null);
    const s = statsRef.current;
    const duration = elapsed;
    const goodPct = s.samples > 0 ? (s.goodSamples / s.samples) * 100 : 0;
    const neck = s.samples > 0 ? s.neckSum / s.samples : 0;
    const torso = s.samples > 0 ? s.torsoSum / s.samples : 0;
    const score = ergonomicScore(goodPct, s.alerts, duration / 60);
    const startedAt = new Date(Date.now() - duration * 1000).toISOString();

    setAnalyzing(true);
    let diagnosis = "";
    let recommendation = "";
    try {
      const out = await analyze({
        data: {
          locale,
          durationSeconds: duration,
          goodPosturePct: goodPct,
          avgNeckAngle: neck,
          avgTorsoAngle: torso,
          alertsCount: s.alerts,
          score,
        },
      });
      diagnosis = out.diagnosis;
      recommendation = out.recommendation;
    } catch (err) {
      console.error(err);
      toast.error(t("agents.failed"));
    } finally {
      setAnalyzing(false);
    }

    if (sessionId) {
      await finishPostureSession(sessionId, {
        ended_at: new Date().toISOString(),
        duration_seconds: duration,
        samples: s.samples,
        good_posture_pct: Number(goodPct.toFixed(2)),
        avg_neck_angle: Number(neck.toFixed(2)),
        avg_torso_angle: Number(torso.toFixed(2)),
        score,
        alerts_count: s.alerts,
        diagnosis,
        recommendation,
      });
    }
    sessionIdRef.current = null;

    setResult({
      diagnosis,
      recommendation,
      score,
      goodPct,
      neck,
      torso,
      alerts: s.alerts,
      duration,
      startedAt,
    });
    toast.success(t("report.generated"));
  };

  const { data: departmentName } = useQuery({
    queryKey: ["department", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => getDepartmentByUserId(user!.id),
  });

  const downloadPdf = async () => {
    if (!result || !user) return;
    const profile = await getProfileSummary(user.id);
    const doc = buildReportPdf(
      {
        employeeName: profile?.full_name || "",
        email: profile?.email || user.email || "",
        department: departmentName || "",
        startedAt: result.startedAt,
        durationSeconds: result.duration,
        goodPosturePct: result.goodPct,
        avgNeckAngle: result.neck,
        avgTorsoAngle: result.torso,
        alertsCount: result.alerts,
        score: result.score,
        diagnosis: result.diagnosis,
        recommendation: result.recommendation,
      },
      {
        title: t("report.title"),
        employee: t("hr.employee"),
        dept: t("hr.dept"),
        date: t("reports.date"),
        duration: t("reports.duration"),
        goodPct: t("monitor.goodPct"),
        neck: t("monitor.neck"),
        torso: t("monitor.torso"),
        alerts: t("monitor.alerts"),
        score: t("monitor.score"),
        diagnosis: t("agents.analyst"),
        recommendation: t("agents.coach"),
        footer: `PosturaIA · ${t("landing.privacy")}`,
      },
    );
    doc.save(`posturaia-${result.startedAt.slice(0, 10)}.pdf`);
  };

  const goodPctLive = stats.samples > 0 ? (stats.goodSamples / stats.samples) * 100 : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">{t("monitor.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("landing.privacy")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel overflow-hidden">
          <div className="relative aspect-[4/3] bg-muted">
            <video ref={videoRef} playsInline muted className="size-full object-cover" />
            <canvas ref={canvasRef} className="absolute inset-0 size-full object-cover" />
            {!running && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card/80 text-center">
                <Camera className="size-8 text-primary" />
                <p className="max-w-xs text-sm text-muted-foreground">
                  {modelLoading ? t("monitor.loading") : t("monitor.cameraIdle")}
                </p>
              </div>
            )}
            {running && (
              <div
                className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-semibold ${
                  reading?.good
                    ? "bg-success text-success-foreground"
                    : "bg-destructive text-destructive-foreground"
                }`}
              >
                {reading
                  ? reading.good
                    ? t("monitor.good")
                    : t("monitor.bad")
                  : t("monitor.noBody")}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
            {!running ? (
              <button
                onClick={start}
                disabled={modelLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <Play className="size-4" /> {t("monitor.start")}
              </button>
            ) : (
              <button
                onClick={stop}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
              >
                <CircleStop className="size-4" /> {t("monitor.stop")}
              </button>
            )}
            <button
              onClick={() => setSound((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-secondary-foreground"
            >
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              {t("monitor.sound")}
            </button>
            {!detected && running && (
              <span className="text-xs text-warning">{t("monitor.noBody")}</span>
            )}
            {detected && running && reading && (
              <span className="text-xs text-muted-foreground">
                {t("monitor.modeLabel")}:{" "}
                {reading.mode === "upper" ? t("monitor.modeUpper") : t("monitor.modeFull")}
              </span>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="panel grid grid-cols-2 gap-4 p-5">
            <Metric label={t("monitor.time")} value={formatDuration(elapsed)} />
            <Metric label={t("monitor.goodPct")} value={`${goodPctLive.toFixed(0)}%`} />
            <Metric
              label={t("monitor.neck")}
              value={reading ? `${reading.neck.toFixed(0)}°` : "—"}
              warn={Boolean(reading && reading.neck > NECK_LIMIT)}
            />
            <Metric
              label={reading?.mode === "upper" ? t("monitor.shoulders") : t("monitor.torso")}
              value={reading ? `${reading.torso.toFixed(0)}°` : "—"}
              warn={Boolean(
                reading &&
                reading.torso > (reading.mode === "upper" ? SHOULDER_TILT_LIMIT : TORSO_LIMIT),
              )}
            />
            <Metric label={t("monitor.alerts")} value={String(stats.alerts)} />
            <Metric
              label={t("monitor.score")}
              value={String(ergonomicScore(goodPctLive, stats.alerts, elapsed / 60))}
            />
          </div>

          <div className="panel p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("monitor.tipsTitle")}
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>• {t("monitor.tip1")}</li>
              <li>• {t("monitor.tip2")}</li>
              <li>• {t("monitor.tip3")}</li>
            </ul>
          </div>

          <div className="panel overflow-hidden">
            <h2 className="px-5 pt-5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("monitor.setupTitle")}
            </h2>
            <img
              src={cameraGuide}
              alt={t("monitor.setupAlt")}
              width={1024}
              height={640}
              loading="lazy"
              className="mt-4 w-full"
            />
            <p className="p-5 text-sm text-muted-foreground">{t("monitor.setupCaption")}</p>
          </div>
        </section>
      </div>

      {analyzing && (
        <div className="panel p-5 text-sm text-muted-foreground">{t("monitor.analyzing")}</div>
      )}

      {result && !analyzing && (
        <section className="panel space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">{t("report.title")}</h2>
            <button
              onClick={downloadPdf}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Download className="size-4" /> {t("report.download")}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label={t("monitor.score")} value={`${result.score}/100`} />
            <Metric label={t("monitor.goodPct")} value={`${result.goodPct.toFixed(0)}%`} />
            <Metric label={t("monitor.neck")} value={`${result.neck.toFixed(0)}°`} />
            <Metric label={t("monitor.alerts")} value={String(result.alerts)} />
          </div>
          <Block title={t("agents.analyst")} body={result.diagnosis} />
          <Block title={t("agents.coach")} body={result.recommendation} />
        </section>
      )}
    </div>
  );
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`font-display text-2xl font-bold ${warn ? "text-destructive" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">{title}</h3>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
