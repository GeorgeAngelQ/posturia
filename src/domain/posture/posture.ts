export type Point = { x: number; y: number; z?: number; visibility?: number };

/** Angle (degrees) between the vector a->b and the vertical axis. */
export function angleFromVertical(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  // Vertical reference points "up" in image space (negative y).
  const cos = -dy / len;
  const clamped = Math.max(-1, Math.min(1, cos));
  return (Math.acos(clamped) * 180) / Math.PI;
}

/** Absolute tilt (degrees) of the segment a->b relative to the horizontal axis. */
export function tiltFromHorizontal(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return 0;
  return Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) % 180 > 90
    ? 180 - (Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) % 180)
    : Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) % 180;
}

export const NECK_LIMIT = 38;
export const TORSO_LIMIT = 12;
/** Upper-body mode: max allowed shoulder-line tilt used as torso proxy. */
export const SHOULDER_TILT_LIMIT = 10;

export type PostureMode = "full" | "upper";

export type PostureReading = {
  neckAngle: number;
  torsoAngle: number;
  good: boolean;
  /** "full" = hips visible, "upper" = only head/chest visible. */
  mode: PostureMode;
  confidence: number;
};

const vis = (p?: Point) => p?.visibility ?? 0;

/** Weighted midpoint of two landmarks, ignoring the ones that are not visible. */
function mid(a?: Point, b?: Point, minVis = 0.25): Point | null {
  const av = vis(a) >= minVis ? a : undefined;
  const bv = vis(b) >= minVis ? b : undefined;
  if (av && bv) {
    const wa = vis(av);
    const wb = vis(bv);
    const w = wa + wb;
    return {
      x: (av.x * wa + bv.x * wb) / w,
      y: (av.y * wa + bv.y * wb) / w,
      visibility: w / 2,
    };
  }
  return av ?? bv ?? null;
}

/** Best available head reference: ears, then eyes, then nose. */
function headPoint(lm: Point[]): Point | null {
  return mid(lm[7], lm[8], 0.3) ?? mid(lm[2], lm[5], 0.3) ?? (vis(lm[0]) >= 0.3 ? lm[0]! : null);
}

/**
 * MediaPipe Pose landmark indices used:
 * 0 = nose, 2/5 = eyes, 7/8 = ears, 11/12 = shoulders, 23/24 = hips.
 *
 * Two operating modes:
 *  - "full": hips visible -> cervical angle (ear->shoulder) + torso angle (hip->shoulder).
 *  - "upper": only head and chest visible -> cervical angle + shoulder-line tilt as
 *    torso proxy, so the session still works with a close-up webcam framing.
 */
export function readPosture(landmarks: Point[]): PostureReading | null {
  if (!landmarks || landmarks.length < 13) return null;

  const head = headPoint(landmarks);
  const leftSh = landmarks[11];
  const rightSh = landmarks[12];
  const shoulder = mid(leftSh, rightSh, 0.25);
  if (!head || !shoulder) return null;

  const hip = mid(landmarks[23], landmarks[24], 0.35);
  const neckAngle = angleFromVertical(shoulder, head);

  if (hip) {
    const torsoAngle = angleFromVertical(hip, shoulder);
    return {
      neckAngle,
      torsoAngle,
      good: neckAngle <= NECK_LIMIT && torsoAngle <= TORSO_LIMIT,
      mode: "full",
      confidence: Math.min(1, (vis(head) + vis(shoulder) + vis(hip)) / 3),
    };
  }

  // Upper-body only: torso lean is not observable, use shoulder-line tilt instead.
  const tilt =
    vis(leftSh) >= 0.25 && vis(rightSh) >= 0.25 ? tiltFromHorizontal(leftSh!, rightSh!) : 0;

  return {
    neckAngle,
    torsoAngle: tilt,
    good: neckAngle <= NECK_LIMIT && tilt <= SHOULDER_TILT_LIMIT,
    mode: "upper",
    confidence: Math.min(1, (vis(head) + vis(shoulder)) / 2),
  };
}

/** Exponential smoothing to remove landmark jitter between frames. */
export function createSmoother(alpha = 0.3) {
  let neck: number | null = null;
  let torso: number | null = null;
  return (reading: PostureReading | null): PostureReading | null => {
    if (!reading) {
      neck = null;
      torso = null;
      return null;
    }
    neck = neck === null ? reading.neckAngle : neck + alpha * (reading.neckAngle - neck);
    torso = torso === null ? reading.torsoAngle : torso + alpha * (reading.torsoAngle - torso);
    const limit = reading.mode === "full" ? TORSO_LIMIT : SHOULDER_TILT_LIMIT;
    return {
      ...reading,
      neckAngle: neck,
      torsoAngle: torso,
      good: neck <= NECK_LIMIT && torso <= limit,
    };
  };
}

export function ergonomicScore(goodPct: number, alerts: number, minutes: number): number {
  const alertPenalty = minutes > 0 ? Math.min(25, (alerts / Math.max(1, minutes)) * 12) : 0;
  return Math.max(0, Math.min(100, Math.round(goodPct - alertPenalty)));
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function riskLevel(score: number): "low" | "mid" | "high" {
  if (score >= 80) return "low";
  if (score >= 60) return "mid";
  return "high";
}
