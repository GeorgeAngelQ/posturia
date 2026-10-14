"""PosturaIA - referencia en Python del algoritmo de postura (torso/pecho -> cabeza).

Implementa la misma lógica que usa la app web (src/lib/posture.ts) con MediaPipe Pose
en el escritorio, para validar el reconocimiento cuando la cámara solo encuadra desde
el pecho hacia arriba.

Uso:
    pip install mediapipe opencv-python
    python python/posture_upper_body.py            # webcam 0
    python python/posture_upper_body.py --source video.mp4
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass

import cv2
import mediapipe as mp

NECK_LIMIT = 38.0
TORSO_LIMIT = 12.0
SHOULDER_TILT_LIMIT = 10.0

L = mp.solutions.pose.PoseLandmark


@dataclass
class Reading:
    neck: float
    torso: float
    good: bool
    mode: str  # "full" | "upper"
    confidence: float


def angle_from_vertical(ax, ay, bx, by) -> float:
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy)
    if length == 0:
        return 0.0
    return math.degrees(math.acos(max(-1.0, min(1.0, -dy / length))))


def tilt_from_horizontal(ax, ay, bx, by) -> float:
    angle = abs(math.degrees(math.atan2(by - ay, bx - ax))) % 180
    return 180 - angle if angle > 90 else angle


def visible(lm, idx, min_vis):
    p = lm[idx]
    return p if p.visibility >= min_vis else None


def midpoint(lm, i, j, min_vis=0.25):
    a, b = visible(lm, i, min_vis), visible(lm, j, min_vis)
    if a and b:
        wa, wb = a.visibility, b.visibility
        w = wa + wb
        return ((a.x * wa + b.x * wb) / w, (a.y * wa + b.y * wb) / w, w / 2)
    p = a or b
    return (p.x, p.y, p.visibility) if p else None


def head_point(lm):
    return (
        midpoint(lm, L.LEFT_EAR, L.RIGHT_EAR, 0.3)
        or midpoint(lm, L.LEFT_EYE, L.RIGHT_EYE, 0.3)
        or ((lm[L.NOSE].x, lm[L.NOSE].y, lm[L.NOSE].visibility) if lm[L.NOSE].visibility >= 0.3 else None)
    )


def read_posture(lm) -> Reading | None:
    head = head_point(lm)
    shoulder = midpoint(lm, L.LEFT_SHOULDER, L.RIGHT_SHOULDER, 0.25)
    if not head or not shoulder:
        return None

    neck = angle_from_vertical(shoulder[0], shoulder[1], head[0], head[1])
    hip = midpoint(lm, L.LEFT_HIP, L.RIGHT_HIP, 0.35)

    if hip:
        torso = angle_from_vertical(hip[0], hip[1], shoulder[0], shoulder[1])
        return Reading(
            neck,
            torso,
            neck <= NECK_LIMIT and torso <= TORSO_LIMIT,
            "full",
            (head[2] + shoulder[2] + hip[2]) / 3,
        )

    ls, rs = visible(lm, L.LEFT_SHOULDER, 0.25), visible(lm, L.RIGHT_SHOULDER, 0.25)
    tilt = tilt_from_horizontal(ls.x, ls.y, rs.x, rs.y) if ls and rs else 0.0
    return Reading(
        neck,
        tilt,
        neck <= NECK_LIMIT and tilt <= SHOULDER_TILT_LIMIT,
        "upper",
        (head[2] + shoulder[2]) / 2,
    )


def smooth(prev: float | None, value: float, alpha: float = 0.3) -> float:
    return value if prev is None else prev + alpha * (value - prev)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="0", help="índice de webcam o ruta de video")
    parser.add_argument("--complexity", type=int, default=1, choices=[0, 1, 2])
    args = parser.parse_args()

    source = int(args.source) if args.source.isdigit() else args.source
    cap = cv2.VideoCapture(source)
    neck_s: float | None = None
    torso_s: float | None = None

    with mp.solutions.pose.Pose(
        model_complexity=args.complexity,
        smooth_landmarks=True,
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as pose:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            result = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            label, color = "sin deteccion", (0, 165, 255)

            if result.pose_landmarks:
                mp.solutions.drawing_utils.draw_landmarks(
                    frame, result.pose_landmarks, mp.solutions.pose.POSE_CONNECTIONS
                )
                reading = read_posture(result.pose_landmarks.landmark)
                if reading:
                    neck_s = smooth(neck_s, reading.neck)
                    torso_s = smooth(torso_s, reading.torso)
                    limit = TORSO_LIMIT if reading.mode == "full" else SHOULDER_TILT_LIMIT
                    good = neck_s <= NECK_LIMIT and torso_s <= limit
                    label = (
                        f"{'CORRECTA' if good else 'INCORRECTA'} | modo {reading.mode} | "
                        f"cervical {neck_s:.0f} | torso {torso_s:.0f}"
                    )
                    color = (0, 200, 0) if good else (0, 0, 255)
            else:
                neck_s = torso_s = None

            cv2.putText(frame, label, (16, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            cv2.imshow("PosturaIA - referencia Python", frame)
            if cv2.waitKey(1) & 0xFF == 27:
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
