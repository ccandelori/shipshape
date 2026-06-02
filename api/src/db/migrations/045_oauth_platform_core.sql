-- Migration 045: OAuth Platform Core Tables for Plugforge
-- Adds tables for OAuth apps, authorization codes, device codes, and issued tokens
-- Follows existing patterns from 010_oauth_state.sql and 014_api_tokens.sql
-- All tables are infrastructure (not content/documents)

BEGIN;

-- OAuth Apps: Registered third-party and system applications
CREATE TABLE IF NOT EXISTS oauth_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id TEXT UNIQUE NOT NULL,                    -- Opaque, URL-safe identifier
    client_secret_hash TEXT,                           -- Hashed (bcrypt or similar); NULL for public clients (PKCE-only)
    name TEXT NOT NULL,
    description TEXT,
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    redirect_uris JSONB NOT NULL DEFAULT '[]',         -- Array of allowed redirect URIs
    allowed_grant_types TEXT[] NOT NULL DEFAULT ARRAY['authorization_code', 'device_code', 'client_credentials'],
    default_scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    is_system BOOLEAN NOT NULL DEFAULT FALSE,          -- For internal agent / machine clients
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_apps_client_id ON oauth_apps(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_apps_workspace ON oauth_apps(workspace_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_oauth_apps_system ON oauth_apps(is_system) WHERE is_system = TRUE;

-- Authorization Codes (for Authorization Code + PKCE flow)
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash TEXT UNIQUE NOT NULL,                    -- SHA-256 of the one-time code
    app_id UUID NOT NULL REFERENCES oauth_apps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT,
    code_challenge_method TEXT CHECK (code_challenge_method IN ('plain', 'S256')),
    scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_hash ON oauth_authorization_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_expires ON oauth_authorization_codes(expires_at);

-- Device Codes (for Device Authorization Grant)
CREATE TABLE IF NOT EXISTS oauth_device_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_code_hash TEXT UNIQUE NOT NULL,
    user_code TEXT UNIQUE NOT NULL,                    -- Short user-friendly code
    app_id UUID NOT NULL REFERENCES oauth_apps(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    expires_at TIMESTAMPTZ NOT NULL,
    authorized_at TIMESTAMPTZ,                         -- When user completed consent
    last_polled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_device_codes_device_hash ON oauth_device_codes(device_code_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_device_codes_user_code ON oauth_device_codes(user_code);
CREATE INDEX IF NOT EXISTS idx_oauth_device_codes_expires ON oauth_device_codes(expires_at);

-- Issued Tokens (access + refresh)
CREATE TABLE IF NOT EXISTS oauth_issued_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT UNIQUE NOT NULL,
    app_id UUID NOT NULL REFERENCES oauth_apps(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    token_type TEXT NOT NULL CHECK (token_type IN ('access', 'refresh')),
    scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    family_id UUID,                                    -- For refresh token rotation families
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_hash ON oauth_issued_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_app ON oauth_issued_tokens(app_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_family ON oauth_issued_tokens(family_id) WHERE family_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires ON oauth_issued_tokens(expires_at);

-- Add updated_at trigger for oauth_apps (following existing patterns)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_oauth_apps_updated_at
    BEFORE UPDATE ON oauth_apps
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;