import { supabase } from '../supabase';

export type PlatformUserDeletionTarget = {
  kind: 'restaurant' | 'driver' | 'client';
  id: string;
};

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
