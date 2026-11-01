import { useServerFn } from "@tanstack/react-start";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Camera,
  CircleStop,
  ClipboardList,
  Cpu,
  Download,
  Eye,
  Hand,
  Lightbulb,
  Lock,
  Maximize,
  Monitor,
  Play,
  ScanLine,
  Sparkles,
  Timer,
  Volume2,
  VolumeX,
} from "lucide-react";
import { analyzeSession } from "@/infrastructure/server-functions/analyze-session.server";
import { sendSessionReportEmailFn } from "@/infrastructure/server-functions/send-session-report-email.server";
import { useI18n } from "@/presentation/i18n/i18n";
import { useAuth } from "@/presentation/hooks/useAuth";
import { useOrganization } from "@/presentation/organization/organization-context";
import { buildReportPdf } from "@/infrastructure/pdf/report-pdf.adapter";
import { reportPdfLabels } from "@/infrastructure/pdf/report-pdf-labels";
import {
  startPostureSession,
  finishPostureSession,
} from "@/infrastructure/supabase/repositories/posture-sessions.repository";
import { recordPostureAlert } from "@/infrastructure/supabase/repositories/posture-alerts.repository";
import { getProfileSummary } from "@/infrastructure/supabase/repositories/profiles.repository";
import {
  createSmoother,
  ergonomicScore,
  NECK_LIMIT,
  readPosture,
  riskLevel,
  SHOULDER_TILT_LIMIT,
  TORSO_LIMIT,
  type Point,
  type PostureMode,
} from "@/domain/posture/posture";
import {
  Card,
  CardHeader,
  Chip,
  PageHeader,
  ProgressBar,
  ScoreRing,
  riskTone,
  toneText,
  type Tone,
} from "@/presentation/components/kit";
import cameraGuide from "@/assets/camera-guide.jpg";

type Stats = {
  samples: number;
  goodSamples: number;
  neckSum: number;
  torsoSum: number;
  alerts: number;
};

type AlertEntry = {
  id: number;
  at: number;
  type: "forward_head" | "torso_slouch";
  severity: "high" | "medium";
  neck: number;
  torso: number;
  mode: PostureMode;
};

type IconType = ComponentType<{ className?: string }>;

const BAD_STREAK_SECONDS = 8;
const BREAK_TARGET_MINUTES = 50;

/** hh:mm:ss */
function formatHms(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function MonitorView() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { membership, departmentName } = useOrganization();
  const analyze = useServerFn(analyzeSession);
  const emailReport = useServerFn(sendSessionReportEmailFn);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
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
  const skeletonRef = useRef(true);
  const skeletonColorRef = useRef("white");
  const smootherRef = useRef(createSmoother(0.3));
  const alertIdRef = useRef(0);
  const perfRef = useRef({ ema: 0, frames: 0, windowStart: 0 });

  const [modelLoading, setModelLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [sound, setSound] = useState(true);
  const [skeleton, setSkeleton] = useState(true);
  const [reading, setReading] = useState<{
    neck: number;
    torso: number;
    good: boolean;
    mode: PostureMode;
  } | null>(null);
  const [detected, setDetected] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [stats, setStats] = useState<Stats>(statsRef.current);
  const [perf, setPerf] = useState<{ ms: number; fps: number } | null>(null);
  const [videoRes, setVideoRes] = useState<{ w: number; h: number } | null>(null);
  const [alertLog, setAlertLog] = useState<AlertEntry[]>([]);
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

  useEffect(() => {
    skeletonRef.current = skeleton;
  }, [skeleton]);

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
      const t0 = performance.now();
      const res = landmarker.detectForVideo(video, t0) as {
        landmarks?: Point[][];
      };
      const t1 = performance.now();

      // Latencia de inferencia (media móvil exponencial) y FPS procesados por segundo.
      const p = perfRef.current;
      p.ema = p.ema === 0 ? t1 - t0 : p.ema * 0.9 + (t1 - t0) * 0.1;
      p.frames += 1;
      if (p.windowStart === 0) p.windowStart = t1;
      if (t1 - p.windowStart >= 1000) {
        setPerf({ ms: p.ema, fps: (p.frames * 1000) / (t1 - p.windowStart) });
        p.frames = 0;
        p.windowStart = t1;
      }

      const lm = res?.landmarks?.[0];
      const ctx = canvas.getContext("2d");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (lm && skeletonRef.current) {
          const color = skeletonColorRef.current;
          ctx.fillStyle = color;
          lm.forEach((pt) => {
            ctx.beginPath();
            ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 3.5, 0, Math.PI * 2);
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
          ctx.strokeStyle = color;
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
              const alertType = posture.neckAngle > NECK_LIMIT ? "forward_head" : "torso_slouch";
              const severity = posture.neckAngle > NECK_LIMIT + 15 ? "high" : "medium";
              setAlertLog((prev) => [
                {
                  id: (alertIdRef.current += 1),
                  at: Date.now(),
                  type: alertType,
                  severity,
                  neck: posture.neckAngle,
                  torso: posture.torsoAngle,
                  mode: posture.mode,
                },
                ...prev,
              ]);
              const sessionId = sessionIdRef.current;
              if (sessionId && user) {
                recordPostureAlert({
                  session_id: sessionId,
                  user_id: user.id,
                  alert_type: alertType,
                  severity,
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
    if (!membership) {
      toast.error(t("monitor.noOrg"));
      return;
    }
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
        setVideoRes({
          w: videoRef.current.videoWidth || 0,
          h: videoRef.current.videoHeight || 0,
        });
      }

      const startedAt = new Date().toISOString();
      const session = await startPostureSession(user.id, membership.orgId, startedAt);
      sessionIdRef.current = session.id;

      // El canvas no entiende `var(--token)`: se resuelve el color del tema vigente al iniciar.
      const resolved = getComputedStyle(document.documentElement)
        .getPropertyValue("--success-strong")
        .trim();
      if (resolved) skeletonColorRef.current = resolved;

      statsRef.current = { samples: 0, goodSamples: 0, neckSum: 0, torsoSum: 0, alerts: 0 };
      setStats(statsRef.current);
      setElapsed(0);
      setResult(null);
      setAlertLog([]);
      setPerf(null);
      perfRef.current = { ema: 0, frames: 0, windowStart: 0 };
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
    setPerf(null);
    setVideoRes(null);
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

    emailReport({
      data: {
        locale,
        department: departmentName || "",
        startedAt,
        durationSeconds: duration,
        goodPosturePct: goodPct,
        avgNeckAngle: neck,
        avgTorsoAngle: torso,
        alertsCount: s.alerts,
        score,
        diagnosis,
        recommendation,
      },
    })
      .then((res) => {
        if (res.delivered) toast.success(t("monitor.reportEmailed"));
      })
      .catch((err) => console.error("[sendSessionReportEmail]", err));
  };

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
      reportPdfLabels(locale),
    );
    doc.save(`posturaia-${result.startedAt.slice(0, 10)}.pdf`);
  };

  const toggleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  // ---------- Estado derivado para la presentación ----------
  const goodPctLive = stats.samples > 0 ? (stats.goodSamples / stats.samples) * 100 : 0;
  const liveScore = ergonomicScore(goodPctLive, stats.alerts, elapsed / 60);
  const hasData = stats.samples > 0;
  const liveRisk = riskLevel(liveScore);
  const liveTone: Tone = hasData ? riskTone(liveRisk) : "neutral";
  const badSeconds = Math.max(0, stats.samples - stats.goodSamples);
  const isUpper = reading?.mode === "upper";
  const torsoLimit = isUpper ? SHOULDER_TILT_LIMIT : TORSO_LIMIT;
  const lastAlert = alertLog[0];

  const levelText = !hasData
    ? { title: t("monitor.v.levelIdle"), desc: t("monitor.v.levelIdleDesc") }
    : liveRisk === "low"
      ? { title: t("monitor.v.levelLow"), desc: t("monitor.v.levelLowDesc") }
      : liveRisk === "mid"
        ? { title: t("monitor.v.levelMid"), desc: t("monitor.v.levelMidDesc") }
        : { title: t("monitor.v.levelHigh"), desc: t("monitor.v.levelHighDesc") };

  const ago = (at: number) => {
    const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
    return secs < 60
      ? t("monitor.v.agoSec").replace("{n}", String(secs))
      : t("monitor.v.agoMin").replace("{n}", String(Math.floor(secs / 60)));
  };

  const shortDuration = (secs: number) =>
    secs < 60
      ? `${secs} ${t("monitor.v.secShort")}`
      : `${Math.floor(secs / 60)} ${t("monitor.v.minShort")}`;

  const cameraLabel = [
    videoRes && videoRes.w > 0 ? `${videoRes.w}×${videoRes.h}` : null,
    perf ? `${Math.round(perf.fps)} ${t("monitor.v.fps")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const torsoLabel = isUpper ? t("monitor.v.readShoulders") : t("monitor.v.readTorso");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("monitor.title")}
        chips={
          <>
            <Chip tone="info" mono upper dot>
              {t("monitor.v.mediapipe")}
            </Chip>
            <Chip tone="neutral" icon={Cpu}>
              {t("monitor.v.webgl")}
            </Chip>
          </>
        }
        right={
          <>
            <HeaderStat
              icon={Timer}
              label={t("monitor.v.sessionDuration")}
              value={formatHms(elapsed)}
            />
            <HeaderStat
              icon={Activity}
              label={t("monitor.v.latency")}
              value={perf ? `${perf.ms.toFixed(1)} ms` : "—"}
              hint={perf ? `(${Math.round(perf.fps)} ${t("monitor.v.fps")})` : undefined}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-success-soft px-5 py-4 text-success-soft-foreground">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card/70">
          <Lock className="size-4" />
        </span>
        <p className="min-w-0 flex-1 text-sm leading-relaxed">
          <strong className="font-bold">{t("monitor.v.privacyStrong")}</strong>{" "}
          {t("monitor.v.privacyBody")}
        </p>
        <p className="w-full text-[11px] font-semibold uppercase leading-snug tracking-wider opacity-80 sm:w-auto sm:max-w-[10rem]">
          {t("monitor.v.zeroTelemetry")}
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* ------------------------- Columna principal ------------------------- */}
        <div className="space-y-6">
          <Card padded={false} className="overflow-hidden">
            <div ref={stageRef} className="relative aspect-[4/3] bg-muted">
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
                <>
                  <div className="absolute left-3 top-3 flex flex-col items-start gap-2 sm:left-4 sm:top-4">
                    <Chip
                      tone="neutral"
                      dot
                      upper
                      className="bg-card/90! text-foreground! shadow-sm backdrop-blur"
                    >
                      {t("monitor.v.cameraActive")}
                      {cameraLabel && ` (${cameraLabel})`}
                    </Chip>
                    {!detected || !reading ? (
                      <Chip tone="warning" className="shadow-sm">
                        {t("monitor.v.noBody")}
                      </Chip>
                    ) : reading.good ? (
                      <Chip tone="success" icon={ScanLine} className="shadow-sm">
                        {t("monitor.v.postureOptimal")} — {t("monitor.v.score")} {liveScore}
                      </Chip>
                    ) : (
                      <Chip tone="danger" icon={AlertTriangle} className="shadow-sm">
                        {t("monitor.v.postureBad")} — {t("monitor.v.score")} {liveScore}
                      </Chip>
                    )}
                  </div>

                  <div className="absolute inset-x-3 bottom-3 grid grid-cols-3 divide-x divide-border rounded-2xl bg-card/90 py-2.5 shadow-sm backdrop-blur sm:inset-x-4 sm:bottom-4">
                    <Reading
                      label={t("monitor.v.readNeck")}
                      value={reading ? `${reading.neck.toFixed(1)}°` : "—"}
                      warn={Boolean(reading && reading.neck > NECK_LIMIT)}
                    />
                    <Reading
                      label={torsoLabel}
                      value={reading ? `${reading.torso.toFixed(1)}°` : "—"}
                      warn={Boolean(reading && reading.torso > torsoLimit)}
                    />
                    <Reading
                      label={t("monitor.v.readMode")}
                      value={
                        reading
                          ? isUpper
                            ? t("monitor.v.modeUpperShort")
                            : t("monitor.v.modeFullShort")
                          : "—"
                      }
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
              <div
                role="group"
                aria-label={t("monitor.v.modeAuto")}
                title={t("monitor.v.modeAuto")}
                className="inline-flex items-center gap-1 rounded-2xl border border-border bg-secondary p-1"
              >
                <ModeSegment active={Boolean(reading && isUpper)}>
                  {t("monitor.v.modeUpperShort")}
                </ModeSegment>
                <ModeSegment active={Boolean(reading && !isUpper)}>
                  {t("monitor.v.modeFullShort")}
                </ModeSegment>
              </div>

              <div className="flex items-center gap-2">
                <IconButton
                  onClick={() => setSound((v) => !v)}
                  label={t("monitor.v.sound")}
                  pressed={sound}
                >
                  {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                </IconButton>
                <IconButton
                  onClick={() => setSkeleton((v) => !v)}
                  label={skeleton ? t("monitor.v.skeletonOn") : t("monitor.v.skeletonOff")}
                  pressed={skeleton}
                >
                  <Eye className="size-4" />
                </IconButton>
                <IconButton onClick={toggleFullscreen} label={t("monitor.v.fullscreen")}>
                  <Maximize className="size-4" />
                </IconButton>
              </div>

              <div className="ml-auto">
                {!running ? (
                  <button
                    type="button"
                    onClick={start}
                    disabled={modelLoading}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    <Play className="size-4" /> {t("monitor.v.start")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stop}
                    className="inline-flex items-center gap-2 rounded-xl bg-danger-soft px-5 py-2.5 text-sm font-semibold text-danger-soft-foreground transition-opacity hover:opacity-90"
                  >
                    <CircleStop className="size-4" /> {t("monitor.v.stop")}
                  </button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={ClipboardList}
              title={t("monitor.v.incidentsTitle")}
              right={
                <span className="text-xs text-muted-foreground">{t("monitor.v.incidentsSub")}</span>
              }
            />
            <ul className="mt-4 space-y-3">
              {alertLog.length === 0 && (
                <li className="rounded-2xl bg-secondary/60 px-4 py-6 text-center text-sm text-muted-foreground">
                  {t("monitor.v.incidentsEmpty")}
                </li>
              )}
              {alertLog.map((a) => {
                const tone: Tone = a.severity === "high" ? "danger" : "warning";
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-start gap-3 rounded-2xl bg-secondary/60 p-4"
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                        tone === "danger"
                          ? "bg-danger-soft text-danger-soft-foreground"
                          : "bg-warning-soft text-warning-soft-foreground"
                      }`}
                    >
                      <AlertTriangle className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">
                        {a.type === "forward_head"
                          ? t("monitor.v.incForwardHead")
                          : t("monitor.v.incTorsoSlouch")}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {t("monitor.v.incAngles")
                          .replace("{neck}", a.neck.toFixed(0))
                          .replace(
                            "{torsoLabel}",
                            a.mode === "upper"
                              ? t("monitor.v.readShoulders")
                              : t("monitor.v.readTorso"),
                          )
                          .replace("{torso}", a.torso.toFixed(0))}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="text-xs text-muted-foreground">{ago(a.at)}</span>
                      <Chip tone={tone}>
                        {a.severity === "high" ? t("monitor.v.sevHigh") : t("monitor.v.sevMedium")}
                      </Chip>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        {/* ------------------------- Columna lateral ------------------------- */}
        <div className="space-y-6">
          <Card>
            <p className="eyebrow">{t("monitor.v.scoreTitle")}</p>
            <div className="mt-4 flex items-center gap-5">
              <ScoreRing value={hasData ? liveScore : 0} tone={liveTone} size={116} stroke={10}>
                <span className="text-3xl font-extrabold leading-none">
                  {hasData ? liveScore : "—"}
                </span>
                <span className="mt-1 text-[11px] text-muted-foreground">/ 100</span>
              </ScoreRing>
              <div className="min-w-0">
                <p className={`text-lg font-extrabold leading-tight ${toneText[liveTone]}`}>
                  {levelText.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {levelText.desc}
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3 rounded-xl bg-secondary/60 px-4 py-3 text-xs">
              <span className="shrink-0 text-muted-foreground">{t("monitor.v.goodPctBar")}</span>
              <ProgressBar value={goodPctLive} tone={liveTone === "neutral" ? "info" : liveTone} />
              <span className="shrink-0 font-bold">{goodPctLive.toFixed(0)}%</span>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
            <MiniStat
              label={t("monitor.v.statGood")}
              value={`${goodPctLive.toFixed(0)}%`}
              sub={t("monitor.v.statGoodSub")}
              tone={
                hasData
                  ? goodPctLive >= 80
                    ? "success"
                    : goodPctLive >= 60
                      ? "warning"
                      : "danger"
                  : "neutral"
              }
            />
            <MiniStat
              label={t("monitor.v.statNeck")}
              value={reading ? `${reading.neck.toFixed(0)}°` : "—"}
              sub={t("monitor.v.statNeckSub").replace("{n}", String(NECK_LIMIT))}
              tone={reading ? (reading.neck > NECK_LIMIT ? "danger" : "success") : "neutral"}
            />
            <MiniStat
              label={isUpper ? t("monitor.v.statShoulders") : t("monitor.v.statTorso")}
              value={reading ? `${reading.torso.toFixed(0)}°` : "—"}
              sub={t("monitor.v.statLimitSub").replace("{n}", String(torsoLimit))}
              tone={reading ? (reading.torso > torsoLimit ? "danger" : "success") : "neutral"}
            />
            <MiniStat
              label={t("monitor.v.statAlerts")}
              value={String(stats.alerts)}
              sub={lastAlert ? ago(lastAlert.at) : t("monitor.v.statAlertsNone")}
              tone={stats.alerts > 0 ? "warning" : "neutral"}
            />
            <MiniStat
              label={t("monitor.v.statBad")}
              value={shortDuration(badSeconds)}
              sub={t("monitor.v.statBadSub")}
              tone={badSeconds > 0 ? "warning" : "neutral"}
            />
            <MiniStat
              label={t("monitor.v.statContinuous")}
              value={shortDuration(elapsed)}
              sub={t("monitor.v.statContinuousSub").replace("{n}", String(BREAK_TARGET_MINUTES))}
              tone="info"
            />
          </div>

          <Card>
            <CardHeader
              icon={Lightbulb}
              iconTone="warning"
              title={t("monitor.v.recsTitle")}
              right={<Chip tone="info">{t("monitor.v.recsCount")}</Chip>}
            />
            <ul className="mt-4 space-y-3">
              <Recommendation
                icon={Eye}
                tone="info"
                title={t("monitor.v.rec1Title")}
                body={t("monitor.v.rec1Body")}
              />
              <Recommendation
                icon={Monitor}
                tone="success"
                title={t("monitor.v.rec2Title")}
                body={t("monitor.v.rec2Body")}
              />
              <Recommendation
                icon={Hand}
                tone="warning"
                title={t("monitor.v.rec3Title")}
                body={t("monitor.v.rec3Body")}
              />
            </ul>
          </Card>

          <section className="rounded-2xl bg-info-soft p-6 text-info-soft-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-2.5 py-1 text-xs font-semibold">
              <Sparkles className="size-3.5" /> {t("monitor.v.postBadge")}
            </span>
            <h2 className="mt-3 text-xl font-extrabold leading-tight text-foreground">
              {t("monitor.v.postTitle")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed">{t("monitor.v.postBody")}</p>
            <button
              type="button"
              onClick={stop}
              disabled={!running}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ClipboardList className="size-4" /> {t("monitor.v.postButton")}
            </button>
            {!running && <p className="mt-2 text-xs opacity-80">{t("monitor.v.postHelp")}</p>}
          </section>

          <Card padded={false} className="overflow-hidden">
            <h2 className="eyebrow px-5 pt-5">{t("monitor.setupTitle")}</h2>
            <img
              src={cameraGuide}
              alt={t("monitor.setupAlt")}
              width={1024}
              height={640}
              loading="lazy"
              className="mt-4 w-full"
            />
            <p className="p-5 text-sm text-muted-foreground">{t("monitor.setupCaption")}</p>
          </Card>
        </div>
      </div>

      {analyzing && (
        <Card>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Sparkles className="size-5 animate-pulse text-primary" />
            <div>
              <p className="font-bold text-foreground">{t("monitor.v.analyzingTitle")}</p>
              <p>{t("monitor.analyzing")}</p>
            </div>
          </div>
        </Card>
      )}

      {result && !analyzing && (
        <Card className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold">{t("monitor.v.resultTitle")}</h2>
            <button
              type="button"
              onClick={downloadPdf}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Download className="size-4" /> {t("report.download")}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <ScoreRing
              value={result.score}
              tone={riskTone(riskLevel(result.score))}
              size={116}
              stroke={10}
            >
              <span className="text-3xl font-extrabold leading-none">{result.score}</span>
              <span className="mt-1 text-[11px] text-muted-foreground">/ 100</span>
            </ScoreRing>
            <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-5">
              <MiniStat
                label={t("monitor.v.resultDuration")}
                value={formatHms(result.duration)}
                tone="info"
              />
              <MiniStat
                label={t("monitor.v.statGood")}
                value={`${result.goodPct.toFixed(0)}%`}
                tone="success"
              />
              <MiniStat
                label={t("monitor.v.resultAvgNeck")}
                value={`${result.neck.toFixed(0)}°`}
                tone="info"
              />
              <MiniStat
                label={t("monitor.v.resultAvgTorso")}
                value={`${result.torso.toFixed(0)}°`}
                tone="info"
              />
              <MiniStat
                label={t("monitor.v.statAlerts")}
                value={String(result.alerts)}
                tone={result.alerts > 0 ? "warning" : "neutral"}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Block title={t("agents.analyst")} body={result.diagnosis} />
            <Block title={t("agents.coach")} body={result.recommendation} />
          </div>
        </Card>
      )}
    </div>
  );
}

function HeaderStat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: IconType;
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <div className="panel flex items-center gap-3 px-4 py-3">
      <Icon className="size-5 shrink-0 text-primary" />
      <div className="leading-tight">
        <p className="eyebrow">{label}</p>
        <p className="mt-0.5 text-lg font-extrabold tabular-nums">
          {value}
          {hint && <span className="ml-1 text-xs font-medium text-muted-foreground">{hint}</span>}
        </p>
      </div>
    </div>
  );
}

function Reading({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0 px-3 text-center sm:px-4 sm:text-left">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p
        className={`truncate text-sm font-extrabold tabular-nums ${
          warn ? "text-danger-strong" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ModeSegment({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      aria-current={active}
      className={`rounded-xl px-3.5 py-2 text-sm font-semibold ${
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

function IconButton({
  onClick,
  label,
  pressed,
  children,
}: {
  onClick: () => void;
  label: string;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`flex size-10 items-center justify-center rounded-xl border border-border transition-colors hover:bg-muted ${
        pressed
          ? "bg-info-soft text-info-soft-foreground"
          : "bg-secondary text-secondary-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function MiniStat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <div className="panel p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={`mt-2 text-2xl font-extrabold leading-none tabular-nums ${toneText[tone === "neutral" ? "info" : tone]}`}
      >
        {value}
      </p>
      {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Recommendation({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: IconType;
  tone: Tone;
  title: string;
  body: string;
}) {
  const box: Record<string, string> = {
    info: "bg-info-soft text-info-soft-foreground",
    success: "bg-success-soft text-success-soft-foreground",
    warning: "bg-warning-soft text-warning-soft-foreground",
  };
  return (
    <li className="flex gap-3 rounded-2xl bg-secondary/60 p-4">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${box[tone] ?? box["info"]}`}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </li>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div className="rounded-2xl bg-secondary/60 p-5">
      <h3 className="text-xs font-bold uppercase tracking-wide text-primary">{title}</h3>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
