-- Emergency containment for audit finding PD-002.
-- Public UUID-only tracking exposed client/driver PII and precise location.
-- Cross-device tracking must be reintroduced only with a separate high-entropy
-- tracking secret (stored hashed) or an authenticated owner/assignment check.

revoke execute on function public.get_public_restaurant_order_status(uuid) from public, anon, authenticated;
revoke execute on function public.get_public_order_tracking(uuid) from public, anon, authenticated;

