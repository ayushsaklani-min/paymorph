-- Reserved migration name after a locally rolled-back duplicate-table attempt.
-- The existing WebhookEvent table is the inbound-provider idempotency store.
SELECT 1;
