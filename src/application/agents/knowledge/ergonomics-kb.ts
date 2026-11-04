import type { Locale } from "@/domain/reports/report.types";

export type KbTopic = "forward_head" | "torso_slouch" | "general";

export interface KbEntry {
  title: string;
  howTo: string;
  frequency: string;
}

const KB: Record<Locale, Record<KbTopic, KbEntry[]>> = {
  es: {
    forward_head: [
      {
        title: "Altura del monitor",
        howTo:
          "Sube la pantalla hasta que el borde superior quede a la altura de los ojos, a un largo de brazo; en portátil usa un soporte y un teclado externo.",
        frequency: "Ajuste único, revisar cada semana",
      },
      {
        title: "Retracción cervical (chin tuck)",
        howTo:
          "Sentado y con la mirada al frente, lleva el mentón hacia atrás como formando doble mentón, sin inclinar la cabeza. Mantén 5 segundos.",
        frequency: "10 repeticiones cada 1–2 horas",
      },
      {
        title: "Referencia oreja-hombro",
        howTo:
          "Alinea mentalmente la oreja sobre el hombro; si la cabeza avanza al leer, acerca el texto en vez de acercar el cuello.",
        frequency: "Chequeo cada 30 minutos",
      },
    ],
    torso_slouch: [
      {
        title: "Silla y apoyo lumbar",
        howTo:
          "Lleva la cadera al fondo del asiento, apoya la zona lumbar en el respaldo (o un cojín pequeño) y mantén los pies planos con rodillas cerca de 90°.",
        frequency: "Ajuste al iniciar la jornada",
      },
      {
        title: "Extensión torácica en la silla",
        howTo:
          "Entrelaza las manos detrás de la nuca y extiende suavemente la parte alta de la espalda sobre el respaldo, sin arquear la zona lumbar.",
        frequency: "5 repeticiones cada hora",
      },
      {
        title: "Pausa activa de pie",
        howTo: "Levántate, camina o estira 2–3 minutos para romper la postura sostenida.",
        frequency: "Cada 30–45 minutos",
      },
    ],
    general: [
      {
        title: "Regla 20-20-20",
        howTo:
          "Cada 20 minutos mira un punto a 6 metros durante 20 segundos para descansar la vista y soltar los hombros.",
        frequency: "Cada 20 minutos",
      },
      {
        title: "Micropausas",
        howTo: "Rota los hombros hacia atrás y gira suavemente el cuello a ambos lados.",
        frequency: "1 minuto por hora",
      },
    ],
  },
  en: {
    forward_head: [
      {
        title: "Monitor height",
        howTo:
          "Raise the screen until its top edge is at eye level, about an arm's length away; with a laptop use a stand and an external keyboard.",
        frequency: "One-time setup, review weekly",
      },
      {
        title: "Chin tuck",
        howTo:
          "Seated, eyes forward, glide your chin straight back as if making a double chin, without tilting the head. Hold for 5 seconds.",
        frequency: "10 reps every 1–2 hours",
      },
      {
        title: "Ear-over-shoulder cue",
        howTo:
          "Mentally line up your ear over your shoulder; if your head drifts forward when reading, bring the text closer instead of your neck.",
        frequency: "Check every 30 minutes",
      },
    ],
    torso_slouch: [
      {
        title: "Chair and lumbar support",
        howTo:
          "Slide your hips to the back of the seat, rest your lower back on the backrest (or a small cushion) and keep feet flat with knees near 90°.",
        frequency: "Adjust at the start of the day",
      },
      {
        title: "Seated thoracic extension",
        howTo:
          "Interlace your hands behind your head and gently extend your upper back over the backrest without arching the lower back.",
        frequency: "5 reps every hour",
      },
      {
        title: "Standing active break",
        howTo: "Stand up, walk or stretch for 2–3 minutes to break sustained posture.",
        frequency: "Every 30–45 minutes",
      },
    ],
    general: [
      {
        title: "20-20-20 rule",
        howTo:
          "Every 20 minutes look at something 6 meters away for 20 seconds to rest your eyes and drop your shoulders.",
        frequency: "Every 20 minutes",
      },
      {
        title: "Micro-breaks",
        howTo: "Roll your shoulders back and gently turn your neck from side to side.",
        frequency: "1 minute per hour",
      },
    ],
  },
};

export function lookupKb(topic: KbTopic, locale: Locale): KbEntry[] {
  return KB[locale][topic];
}
