import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Locale = "es" | "en";

type Dict = Record<string, string>;

const es: Dict = {
  "app.name": "PosturaIA",
  "app.tagline": "Monitoreo y corrección postural con IA para el bienestar del equipo",
  "nav.monitor": "Monitoreo",
  "nav.reports": "Mis informes",
  "nav.hr": "Panel RR. HH.",
  "nav.signout": "Salir",
  "lang.label": "Idioma",

  "landing.badge": "Salud ocupacional · Bienestar corporativo",
  "landing.hero": "Cuida la espalda de tu equipo, en tiempo real",
  "landing.sub":
    "PosturaIA analiza la postura frente al ordenador con visión por computador, la evalúa con dos agentes de IA y entrega recomendaciones ergonómicas personalizadas. RR. HH. obtiene visibilidad objetiva del bienestar físico del equipo.",
  "landing.cta": "Ingresar",
  "landing.cta2": "Ver cómo funciona",
  "landing.privacy":
    "El video se procesa en tu navegador. Nunca se graba ni se envía a un servidor.",
  "landing.f1.title": "Visión por computador",
  "landing.f1.desc":
    "Detección de puntos corporales y cálculo continuo de los ángulos cervical y torácico.",
  "landing.f2.title": "Dos agentes de IA",
  "landing.f2.desc":
    "El Analista biomecánico diagnostica; el Coach ergónomo redacta la recomendación personalizada.",
  "landing.f3.title": "Hiperautomatización",
  "landing.f3.desc":
    "Alerta sonora ante mala postura prolongada e informe PDF automático al cerrar la sesión.",
  "landing.f4.title": "Visibilidad para RR. HH.",
  "landing.f4.desc":
    "Indicadores agregados del equipo: puntaje promedio, alertas y áreas con mayor riesgo.",
  "landing.steps": "Cómo funciona",
  "landing.step1": "Inicias tu sesión de trabajo y activas la cámara.",
  "landing.step2": "El sistema mide tu postura cada segundo y te avisa si la mantienes mal.",
  "landing.step3": "Al cerrar, los agentes generan tu diagnóstico y tu informe PDF.",

  "auth.title": "Acceso de colaboradores",
  "auth.signin": "Iniciar sesión",
  "auth.signup": "Crear cuenta",
  "auth.email": "Correo corporativo",
  "auth.password": "Contraseña",
  "auth.name": "Nombre completo",
  "auth.orgName": "Nombre de tu empresa",
  "auth.orgNameHint":
    "Crea una organización nueva. Si fuiste invitado por correo, este campo se ignora y te unes directamente a esa organización.",
  "auth.google": "Continuar con Google",
  "auth.toSignup": "¿No tienes cuenta? Crear una",
  "auth.toSignin": "¿Ya tienes cuenta? Iniciar sesión",
  "auth.checkEmail": "Cuenta creada. Revisa tu correo si se solicita confirmación.",
  "auth.or": "o",

  "monitor.title": "Monitoreo postural",
  "monitor.start": "Iniciar sesión de monitoreo",
  "monitor.stop": "Cerrar sesión y generar informe",
  "monitor.loading": "Cargando modelo de visión…",
  "monitor.noBody": "No se detecta a la persona. Ubícate de perfil frente a la cámara.",
  "monitor.good": "Postura correcta",
  "monitor.bad": "Postura incorrecta",
  "monitor.neck": "Ángulo cervical",
  "monitor.torso": "Ángulo torácico",
  "monitor.time": "Tiempo de sesión",
  "monitor.goodPct": "% postura correcta",
  "monitor.alerts": "Alertas",
  "monitor.score": "Puntaje ergonómico",
  "monitor.sound": "Alerta sonora",
  "monitor.cameraError": "No se pudo acceder a la cámara. Revisa los permisos del navegador.",
  "monitor.noOrg": "Tu cuenta no está asociada a ninguna organización. Contacta a soporte.",
  "monitor.alertToast": "Llevas demasiado tiempo en mala postura. Corrige tu espalda y cuello.",
  "monitor.analyzing": "Los agentes están analizando tu sesión…",
  "monitor.reportEmailed": "Te enviamos el informe por correo.",
  "monitor.tipsTitle": "Guía rápida",
  "monitor.modeFull": "Cuerpo completo (cabeza, hombros y cadera)",
  "monitor.modeUpper": "Torso superior (cabeza y hombros)",
  "monitor.modeLabel": "Encuadre detectado",
  "monitor.shoulders": "Inclinación de hombros",
  "monitor.cameraIdle": "Activa la cámara para comenzar",
  "monitor.tip1": "Colócate de perfil (lateral) a unos 70 cm de la cámara.",
  "monitor.tip2": "Asegura buena iluminación frontal.",
  "monitor.tip3": "Mantén los hombros relajados y la pantalla a la altura de los ojos.",
  "monitor.setupTitle": "Cómo colocarte frente a la cámara",
  "monitor.setupAlt":
    "Persona sentada de perfil frente a un portátil, con cabeza y torso completos dentro del encuadre a unos 70 cm de la cámara.",
  "monitor.setupCaption":
    "Siéntate de perfil, a 60-80 cm de la cámara, con cabeza, hombros y cadera visibles en el encuadre.",

  "agents.analyst": "Agente Analista — diagnóstico biomecánico",
  "agents.coach": "Agente Coach — recomendación ergonómica",
  "agents.failed": "No se pudo generar el análisis de IA. El informe usa el resumen medido.",

  "report.title": "Informe de sesión",
  "report.download": "Descargar PDF",
  "report.generated": "Informe generado",
  "reports.title": "Mis informes de postura",
  "reports.empty": "Aún no tienes sesiones registradas.",
  "reports.date": "Fecha",
  "reports.duration": "Duración",
  "reports.view": "Ver detalle",

  "hr.title": "Panel de RR. HH.",
  "hr.sub": "Indicadores agregados de bienestar postural del equipo.",
  "hr.noAccess":
    "Esta sección es exclusiva del área de RR. HH. Solicita el permiso a tu administrador.",
  "hr.employees": "Colaboradores monitoreados",
  "hr.sessions": "Sesiones registradas",
  "hr.avgScore": "Puntaje promedio",
  "hr.totalAlerts": "Alertas totales",
  "hr.byEmployee": "Detalle por colaborador",
  "hr.byDept": "Puntaje promedio por área",
  "hr.employee": "Colaborador",
  "hr.dept": "Área",
  "hr.lastSession": "Última sesión",
  "hr.risk": "Riesgo",
  "hr.risk.low": "Bajo",
  "hr.risk.mid": "Medio",
  "hr.risk.high": "Alto",
  "hr.trend": "Puntaje de las últimas sesiones",

  "nav.org": "Organización",
  "org.title": "Configuración de la organización",
  "org.sub": "Gestiona departamentos, invitaciones y miembros de tu organización.",
  "org.noAccess": "Esta sección es exclusiva de los administradores de la organización.",

  "org.departments": "Departamentos",
  "org.departmentsHint":
    "Catálogo de áreas de tu organización, usado para agrupar colaboradores en los informes.",
  "org.newDepartment": "Nombre del departamento",
  "org.add": "Agregar",
  "org.noDepartments": "Aún no hay departamentos.",
  "org.deleteDepartment": "Eliminar",
  "org.confirmDeleteDepartment":
    "¿Eliminar este departamento? Los miembros asignados quedarán sin departamento.",

  "org.invites": "Invitaciones",
  "org.invitesHint":
    "Invita colaboradores por correo. Al registrarse con ese correo, se unen automáticamente a tu organización.",
  "org.inviteEmail": "Correo del invitado",
  "org.inviteRole": "Rol",
  "org.inviteDeptNone": "Sin asignar",
  "org.sendInvite": "Enviar invitación",
  "org.inviteSent": "Invitación creada. Copia el enlace y envíaselo a la persona.",
  "org.inviteInvalidEmail": "Ingresa un correo válido.",
  "org.inviteDuplicate": "Ya existe una invitación pendiente para ese correo.",
  "org.noInvites": "No hay invitaciones pendientes.",
  "org.status.pending": "Pendiente",
  "org.status.expired": "Vencida",
  "org.expiresOn": "Vence",
  "org.copyLink": "Copiar enlace",
  "org.linkCopied": "Enlace copiado al portapapeles.",
  "org.cancelInvite": "Cancelar",
  "org.confirmCancelInvite": "¿Cancelar esta invitación?",
  "org.inviteSentEmail": "Invitación enviada por correo.",
  "org.inviteEmailFailed":
    "La invitación se creó, pero no se pudo enviar el correo. Copia el enlace y envíaselo manualmente.",

  "org.role.owner": "Dueño",
  "org.role.hr": "RR. HH.",
  "org.role.employee": "Colaborador",
  "org.unassigned": "Sin asignar",

  "org.members": "Miembros",
  "org.membersHint":
    "Cambia el rol o el departamento de cada colaborador, o quítalo de la organización.",
  "org.ownerOnlyHint":
    "Solo el dueño de la organización puede cambiar roles, departamentos o quitar miembros.",
  "org.noMembers": "Aún no hay miembros.",
  "org.removeMember": "Quitar",
  "org.confirmRemoveMember":
    "¿Quitar a esta persona de la organización? Conserva su cuenta, pero pierde acceso a estos datos.",

  "common.minutes": "min",
  "common.loading": "Cargando…",
  "common.close": "Cerrar",
};

const en: Dict = {
  "app.name": "PosturaIA",
  "app.tagline": "AI posture monitoring and correction for team wellbeing",
  "nav.monitor": "Monitoring",
  "nav.reports": "My reports",
  "nav.hr": "HR dashboard",
  "nav.signout": "Sign out",
  "lang.label": "Language",

  "landing.badge": "Occupational health · Corporate wellbeing",
  "landing.hero": "Protect your team's back, in real time",
  "landing.sub":
    "PosturaIA reads desk posture with computer vision, evaluates it with two AI agents and delivers personalized ergonomic advice. HR gets objective visibility of the team's physical wellbeing.",
  "landing.cta": "Sign in",
  "landing.cta2": "See how it works",
  "landing.privacy": "Video is processed in your browser. It is never recorded or uploaded.",
  "landing.f1.title": "Computer vision",
  "landing.f1.desc": "Body landmark detection and continuous neck and torso angle measurement.",
  "landing.f2.title": "Two AI agents",
  "landing.f2.desc":
    "The biomechanical Analyst diagnoses; the ergonomics Coach writes the personalized advice.",
  "landing.f3.title": "Hyperautomation",
  "landing.f3.desc":
    "Sound alert on sustained bad posture and automatic PDF report on session end.",
  "landing.f4.title": "HR visibility",
  "landing.f4.desc": "Aggregated team metrics: average score, alerts and highest-risk areas.",
  "landing.steps": "How it works",
  "landing.step1": "Start your work session and turn on the camera.",
  "landing.step2": "The system measures your posture every second and warns you when it slips.",
  "landing.step3": "On close, the agents generate your diagnosis and your PDF report.",

  "auth.title": "Employee access",
  "auth.signin": "Sign in",
  "auth.signup": "Create account",
  "auth.email": "Work email",
  "auth.password": "Password",
  "auth.name": "Full name",
  "auth.orgName": "Your company name",
  "auth.orgNameHint":
    "Creates a new organization. If you were invited by email, this field is ignored and you join that organization directly.",
  "auth.google": "Continue with Google",
  "auth.toSignup": "No account yet? Create one",
  "auth.toSignin": "Already have an account? Sign in",
  "auth.checkEmail": "Account created. Check your inbox if confirmation is required.",
  "auth.or": "or",

  "monitor.title": "Posture monitoring",
  "monitor.start": "Start monitoring session",
  "monitor.stop": "End session and generate report",
  "monitor.loading": "Loading vision model…",
  "monitor.noBody": "No person detected. Sit sideways in front of the camera.",
  "monitor.good": "Good posture",
  "monitor.bad": "Poor posture",
  "monitor.neck": "Neck angle",
  "monitor.torso": "Torso angle",
  "monitor.time": "Session time",
  "monitor.goodPct": "% good posture",
  "monitor.alerts": "Alerts",
  "monitor.score": "Ergonomic score",
  "monitor.sound": "Sound alert",
  "monitor.cameraError": "Camera access failed. Check your browser permissions.",
  "monitor.noOrg": "Your account isn't linked to any organization. Contact support.",
  "monitor.alertToast": "You have been slouching too long. Straighten your back and neck.",
  "monitor.analyzing": "The agents are analyzing your session…",
  "monitor.reportEmailed": "We emailed you the report.",
  "monitor.tipsTitle": "Quick guide",
  "monitor.modeFull": "Full body (head, shoulders and hips)",
  "monitor.modeUpper": "Upper torso (head and shoulders)",
  "monitor.modeLabel": "Detected framing",
  "monitor.shoulders": "Shoulder tilt",
  "monitor.cameraIdle": "Turn on your camera to start",
  "monitor.tip1": "Sit sideways, about 70 cm from the camera.",
  "monitor.tip2": "Make sure you have good front lighting.",
  "monitor.tip3": "Keep shoulders relaxed and the screen at eye level.",
  "monitor.setupTitle": "How to sit in front of the camera",
  "monitor.setupAlt":
    "Person sitting sideways at a laptop, head and torso fully inside the frame about 70 cm from the camera.",
  "monitor.setupCaption":
    "Sit sideways, 60-80 cm from the camera, with head, shoulders and hips visible in the frame.",

  "agents.analyst": "Analyst agent — biomechanical diagnosis",
  "agents.coach": "Coach agent — ergonomic recommendation",
  "agents.failed": "AI analysis unavailable. The report uses the measured summary.",

  "report.title": "Session report",
  "report.download": "Download PDF",
  "report.generated": "Report generated",
  "reports.title": "My posture reports",
  "reports.empty": "You have no recorded sessions yet.",
  "reports.date": "Date",
  "reports.duration": "Duration",
  "reports.view": "View detail",

  "hr.title": "HR dashboard",
  "hr.sub": "Aggregated posture wellbeing metrics for the team.",
  "hr.noAccess": "This section is HR-only. Ask your administrator for access.",
  "hr.employees": "Monitored employees",
  "hr.sessions": "Recorded sessions",
  "hr.avgScore": "Average score",
  "hr.totalAlerts": "Total alerts",
  "hr.byEmployee": "Employee breakdown",
  "hr.byDept": "Average score by area",
  "hr.employee": "Employee",
  "hr.dept": "Area",
  "hr.lastSession": "Last session",
  "hr.risk": "Risk",
  "hr.risk.low": "Low",
  "hr.risk.mid": "Medium",
  "hr.risk.high": "High",
  "hr.trend": "Score across latest sessions",

  "nav.org": "Organization",
  "org.title": "Organization settings",
  "org.sub": "Manage your organization's departments, invites and members.",
  "org.noAccess": "This section is for organization administrators only.",

  "org.departments": "Departments",
  "org.departmentsHint":
    "Your organization's area catalog, used to group employees in the reports.",
  "org.newDepartment": "Department name",
  "org.add": "Add",
  "org.noDepartments": "No departments yet.",
  "org.deleteDepartment": "Delete",
  "org.confirmDeleteDepartment":
    "Delete this department? Assigned members will be left unassigned.",

  "org.invites": "Invites",
  "org.invitesHint":
    "Invite employees by email. When they sign up with that email, they join your organization automatically.",
  "org.inviteEmail": "Invitee's email",
  "org.inviteRole": "Role",
  "org.inviteDeptNone": "Unassigned",
  "org.sendInvite": "Send invite",
  "org.inviteSent": "Invite created. Copy the link and send it to them.",
  "org.inviteInvalidEmail": "Enter a valid email address.",
  "org.inviteDuplicate": "There's already a pending invite for that email.",
  "org.noInvites": "No pending invites.",
  "org.status.pending": "Pending",
  "org.status.expired": "Expired",
  "org.expiresOn": "Expires",
  "org.copyLink": "Copy link",
  "org.linkCopied": "Link copied to clipboard.",
  "org.cancelInvite": "Cancel",
  "org.confirmCancelInvite": "Cancel this invite?",
  "org.inviteSentEmail": "Invite sent by email.",
  "org.inviteEmailFailed":
    "The invite was created, but the email couldn't be sent. Copy the link and share it manually.",

  "org.role.owner": "Owner",
  "org.role.hr": "HR",
  "org.role.employee": "Employee",
  "org.unassigned": "Unassigned",

  "org.members": "Members",
  "org.membersHint":
    "Change each employee's role or department, or remove them from the organization.",
  "org.ownerOnlyHint":
    "Only the organization owner can change roles, departments or remove members.",
  "org.noMembers": "No members yet.",
  "org.removeMember": "Remove",
  "org.confirmRemoveMember":
    "Remove this person from the organization? Their account stays, but they lose access to this data.",

  "common.minutes": "min",
  "common.loading": "Loading…",
  "common.close": "Close",
};

const dicts: Record<Locale, Dict> = { es, en };

type I18nValue = { locale: Locale; setLocale: (l: Locale) => void; t: (k: string) => string };

const I18nContext = createContext<I18nValue>({
  locale: "es",
  setLocale: () => {},
  t: (k) => es[k] ?? k,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("es");

  useEffect(() => {
    const stored = window.localStorage.getItem("posturaia.locale");
    if (stored === "en" || stored === "es") setLocaleState(stored);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    window.localStorage.setItem("posturaia.locale", l);
  }, []);

  const t = useCallback((k: string) => dicts[locale][k] ?? dicts.es[k] ?? k, [locale]);

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
