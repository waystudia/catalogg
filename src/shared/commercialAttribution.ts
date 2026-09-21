import { supabase } from './supabase';
import { getCommercialAttributionSessionId } from './commercialSession';

const tokenPattern = /^[A-Za-z0-9_-]{8,96}$/;
export { getCommercialAttributionSessionId } from './commercialSession';

export const getCommercialTrackingToken = () => {
  if (typeof window === 'undefined') return null;
  const token = new URLSearchParams(window.location.search).get('r')?.trim() ?? '';
  return tokenPattern.test(token) ? token : null;
};

export async function captureCommercialAttribution(catalogId: string) {
  const token = getCommercialTrackingToken();
  const sessionId = getCommercialAttributionSessionId();
  if (!supabase || !token || !sessionId || !catalogId) return false;
  const { data, error } = await supabase.rpc('record_commercial_attribution', {
    target_catalog_id: catalogId,
    tracking_token: token,
    client_session_id: sessionId
  });
  if (error) {
    console.warn('Commercial attribution was not recorded.', error);
    return false;
  }
  return data === true;
}

export async function captureCommercialAttributionForCatalogSlug(catalogSlug: string) {
  if (!supabase || !catalogSlug) return false;
  const { data, error } = await supabase
    .from('catalogs')
    .select('id')
    .eq('slug', catalogSlug)
    .maybeSingle();
  if (error || !data?.id) return false;
  return captureCommercialAttribution(String(data.id));
}
