-- Migration 046: Webhook Subscriptions and Deliveries for Plugforge
-- Adds tables for webhook subscriptions and delivery attempts / DLQ
-- Follows patterns from previous platform migration

BEGIN;

-- Webhook Subscriptions: Per-app subscriptions to event types
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES oauth_apps(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    target_url TEXT NOT NULL,
    secret TEXT NOT NULL,                              -- Signing secret (shown once at creation/rotation)
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(app_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_app_event ON webhook_subscriptions(app_id, event_type) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_webhook_subs_active ON webhook_subscriptions(active);

-- Webhook Deliveries: Every attempt + DLQ
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_payload JSONB,                               -- Or reference if large
    idempotency_key TEXT NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed_permanent', 'dlq')),
    response_status INTEGER,
    response_excerpt TEXT,
    latency_ms INTEGER,
    signed_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_sub ON webhook_deliveries(subscription_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_idempotency ON webhook_deliveries(idempotency_key);

-- Trigger for updated_at on subscriptions
CREATE TRIGGER update_webhook_subscriptions_updated_at
    BEFORE UPDATE ON webhook_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;