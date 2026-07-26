# Personal Data Inventory

This inventory is an audit starting point. Table names and exact columns must be verified against the final Supabase schema before production launch.

| Data Category | Examples | Likely Location | Subject | Purpose | Risk |
| --- | --- | --- | --- | --- | --- |
| Client identity | name, phone, email | `client_profiles`, `orders`, `client_addresses`, `users` | Customer | Ordering, delivery, support | High |
| Delivery address | settlement, street, house, apartment, coordinates, comments | `orders`, `client_addresses`, `deliveries` | Customer | Delivery routing | High |
| Restaurant owner data | owner name, phone, email, business address | `clients`, `catalog_members`, `profiles`, `restaurants` | Restaurant staff | Admin access and billing | High |
| Driver identity | name, phone, email, vehicle, car number, photo | `drivers`, `users`, `profiles` | Driver | Delivery operations | High |
| Driver location | current/last location, online status, route data | `drivers`, `deliveries`, `delivery_status_history` | Driver | Dispatch and routing | High |
| Orders | cart items, prices, statuses, timestamps, comments | `orders`, `order_items`, `order_status_history` | Customer/restaurant/driver | Fulfillment and accounting | High |
| Payments and debts | revenue, debt, tariffs, settlement records | `restaurant_payments`, `delivery_settlements`, `platform_debts`, `platform_billing_settings` | Restaurant/driver/platform | Billing and reconciliation | Medium |
| Push subscriptions | browser endpoint and keys | `web_push_subscriptions` | User/browser | Notifications | Medium |
| Audit trail | admin actions, status changes, errors | `audit_logs`, status history tables | Staff/customer/driver | Security and support | Medium |
| Uploaded files | restaurant images, product photos, driver photos | Storage buckets, URL columns | Restaurant/driver | Catalog and verification | Medium |

## Required Decisions

- Define retention periods for orders, delivery addresses, driver location history, and logs.
- Define whether exact coordinates are stored forever or rounded/expired after fulfillment.
- Define legal basis and consent text for geolocation and push notifications.
- Define support/admin access rules to personal data.
- Define export/delete correction workflow for personal data subjects.
