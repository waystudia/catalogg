import { supabase } from '../supabase';

export type PlatformUserDeletionTarget = {
  kind: 'restaurant' | 'driver' | 'client';
  id: string;
};

export type PlatformLegalConsentSubject =
  | { kind: 'client'; phone: string }
  | { kind: 'restaurant'; id: string }
  | { kind: 'driver'; id: string };

export type PlatformLegalConsentRecord = {
  id: string;
  documentCode: string;
  documentVersion: string;
  documentSha256: string;
  granted: boolean;
  source: string;
  grantedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  orderId: string | null;
};

type PlatformLegalConsentRpcRow = {
  id?: unknown;
  document_code?: unknown;
  document_version?: unknown;
  document_sha256?: unknown;
  granted?: unknown;
  source?: unknown;
  granted_at?: unknown;
  revoked_at?: unknown;
  created_at?: unknown;
  order_id?: unknown;
};

export async function getPlatformLegalConsentHistory(
  subject: PlatformLegalConsentSubject
): Promise<PlatformLegalConsentRecord[]> {
  if (!supabase) return [];
  const subjectType = subject.kind === 'restaurant' ? 'restaurant_representative' : subject.kind;
  const { data, error } = await supabase.rpc('get_platform_legal_consent_history', {
    target_subject_type: subjectType,
    target_subject_id: subject.kind === 'client' ? null : subject.id,
    target_client_phone: subject.kind === 'client' ? subject.phone : null
  });
  if (error) throw error;
  return ((data ?? []) as PlatformLegalConsentRpcRow[]).flatMap((row) => {
    if (
      typeof row.id !== 'string'
      || typeof row.document_code !== 'string'
      || typeof row.document_version !== 'string'
      || typeof row.document_sha256 !== 'string'
      || typeof row.source !== 'string'
      || typeof row.created_at !== 'string'
    ) return [];
    return [{
      id: row.id,
      documentCode: row.document_code,
      documentVersion: row.document_version,
      documentSha256: row.document_sha256,
      granted: row.granted === true,
      source: row.source,
      grantedAt: typeof row.granted_at === 'string' ? row.granted_at : null,
      revokedAt: typeof row.revoked_at === 'string' ? row.revoked_at : null,
      createdAt: row.created_at,
      orderId: typeof row.order_id === 'string' ? row.order_id : null
    }];
  });
}

const getFunctionErrorMessage = async (error: unknown) => {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = (await context.clone().json()) as { error?: string };
        if (body.error) return body.error;
      } catch {
        // Fall through to the original error message.
      }
    }
  }
  return error instanceof Error ? error.message : 'Не удалось удалить пользователя.';
};

export async function deletePlatformUser(target: PlatformUserDeletionTarget): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.functions.invoke('delete-platform-user', {
    body: { ...target, confirmed: true }
  });
  if (error) throw new Error(await getFunctionErrorMessage(error));
}
