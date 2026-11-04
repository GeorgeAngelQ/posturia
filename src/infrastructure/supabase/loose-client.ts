import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente sin tipado de tablas, para las tablas/columnas añadidas por la
 * migración `20261103000000_agentic_runtime.sql` que aún no aparecen en el
 * `types.ts` autogenerado (Lovable lo regenera al aplicar la migración; hasta
 * entonces, y sin tocar ese archivo, estas consultas se tipan a mano).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseClient = SupabaseClient<any, "public", any>;

export function loose(client: unknown): LooseClient {
  return client as LooseClient;
}
