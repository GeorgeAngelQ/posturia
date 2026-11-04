import { supabase } from "@/infrastructure/supabase/client";
import { loose } from "@/infrastructure/supabase/loose-client";

export const CONSENT_VERSION = "2026-11";

export type PrivacyMode = "individual" | "aggregate";

export async function hasMonitoringConsent(userId: string): Promise<boolean> {
  const { data, error } = await loose(supabase)
    .from("profiles")
    .select("monitoring_consent_at, monitoring_consent_version")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[consent] no se pudo leer el consentimiento:", error.message);
    return true;
  }
  return (
    Boolean(data?.monitoring_consent_at) && data?.monitoring_consent_version === CONSENT_VERSION
  );
}

export async function acceptMonitoringConsent(userId: string): Promise<void> {
  const { error } = await loose(supabase)
    .from("profiles")
    .update({
      monitoring_consent_at: new Date().toISOString(),
      monitoring_consent_version: CONSENT_VERSION,
    })
    .eq("id", userId);
  if (error) throw error;
}

export async function getOrgPrivacyMode(orgId: string): Promise<PrivacyMode> {
  const { data, error } = await loose(supabase)
    .from("organizations")
    .select("privacy_mode")
    .eq("id", orgId)
    .maybeSingle();
  if (error) return "individual";
  return data?.privacy_mode === "aggregate" ? "aggregate" : "individual";
}

export async function setOrgPrivacyMode(orgId: string, mode: PrivacyMode): Promise<void> {
  const { error } = await loose(supabase)
    .from("organizations")
    .update({ privacy_mode: mode })
    .eq("id", orgId);
  if (error) throw error;
}
