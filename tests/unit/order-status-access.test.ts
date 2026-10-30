import { afterEach, expect, test, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../src/shared/supabase', () => ({ supabase: { rpc } }));
vi.mock('../../src/shared/api/clientAccountApi', () => ({ getStoredClientSessionToken: () => 'owner-session' }));
import { getPublicRestaurantOrderStatus, getPublicOrderTracking } from '../../src/shared/api/restaurantOrdersApi';
afterEach(() => rpc.mockReset());
test('loads status through the participant endpoint with the client credential', async () => {
 rpc.mockResolvedValue({ data: { id: 'order-owned', status: 'preparing', items: [] }, error: null });
 expect((await getPublicRestaurantOrderStatus(' order-owned '))?.status).toBe('preparing');
 expect(rpc).toHaveBeenCalledWith('get_order_participant_status', { target_order_id: 'order-owned', client_session_token: 'owner-session', guest_tracking_token: null });
});
test('does not invent a new status for an inaccessible order', async () => {
 rpc.mockResolvedValue({ data: null, error: null });
 expect(await getPublicRestaurantOrderStatus('foreign')).toBeNull();
});
test('tracking uses the same participant check instead of the disabled public endpoint', async () => {
 rpc.mockResolvedValue({ data: { driver_name: 'Тест', delivery_status: 'on_the_way' }, error: null });
 expect((await getPublicOrderTracking('order-owned'))?.deliveryStatus).toBe('on_the_way');
 expect(rpc.mock.calls[0][0]).toBe('get_order_participant_status');
});
