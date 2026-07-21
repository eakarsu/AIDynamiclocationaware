BEGIN;
CREATE TABLE IF NOT EXISTS ad_workspaces(id UUID PRIMARY KEY,name TEXT NOT NULL,created_by BIGINT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS ad_memberships(workspace_id UUID NOT NULL REFERENCES ad_workspaces(id) ON DELETE CASCADE,user_id BIGINT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','privacy_reviewer','campaign_manager','analyst','viewer')),PRIMARY KEY(workspace_id,user_id));
CREATE TABLE IF NOT EXISTS location_consent_events(
  id UUID PRIMARY KEY,workspace_id UUID NOT NULL REFERENCES ad_workspaces(id) ON DELETE CASCADE,subject_hash CHAR(64) NOT NULL,
  consent_version TEXT NOT NULL,purposes TEXT[] NOT NULL,action TEXT NOT NULL CHECK(action IN ('granted','revoked')),
  occurred_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ NOT NULL,proof_ref TEXT NOT NULL,created_by BIGINT NOT NULL,
  CHECK(expires_at>occurred_at),UNIQUE(workspace_id,subject_hash,consent_version,occurred_at)
);
CREATE TABLE IF NOT EXISTS minimized_location_contexts(
  id UUID PRIMARY KEY,workspace_id UUID NOT NULL REFERENCES ad_workspaces(id) ON DELETE CASCADE,subject_hash CHAR(64) NOT NULL,
  consent_event_id UUID NOT NULL REFERENCES location_consent_events(id),latitude_coarse NUMERIC(6,3) NOT NULL,longitude_coarse NUMERIC(7,3) NOT NULL,
  precision_decimals INTEGER NOT NULL CHECK(precision_decimals BETWEEN 2 AND 3),place_category TEXT,context_tags TEXT[] NOT NULL DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ NOT NULL,source_accuracy_meters INTEGER CHECK(source_accuracy_meters>=0),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK(expires_at>recorded_at)
);
CREATE TABLE IF NOT EXISTS governed_campaigns(
  id UUID PRIMARY KEY,workspace_id UUID NOT NULL REFERENCES ad_workspaces(id) ON DELETE CASCADE,name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','privacy_review','active','paused','completed')),
  allowed_purposes TEXT[] NOT NULL,frequency_cap_count INTEGER NOT NULL CHECK(frequency_cap_count BETWEEN 1 AND 100),frequency_cap_hours INTEGER NOT NULL CHECK(frequency_cap_hours BETWEEN 1 AND 720),
  starts_at TIMESTAMPTZ NOT NULL,ends_at TIMESTAMPTZ NOT NULL,created_by BIGINT NOT NULL,approved_by BIGINT,CHECK(ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS governed_creatives(
  id UUID PRIMARY KEY,workspace_id UUID NOT NULL REFERENCES ad_workspaces(id) ON DELETE CASCADE,campaign_id UUID NOT NULL REFERENCES governed_campaigns(id) ON DELETE CASCADE,
  creative_ref TEXT NOT NULL,content_hash CHAR(64) NOT NULL,required_context_tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected','retired')),reviewed_by BIGINT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(campaign_id,content_hash)
);
CREATE TABLE IF NOT EXISTS delivery_decisions(
  id UUID PRIMARY KEY,workspace_id UUID NOT NULL REFERENCES ad_workspaces(id) ON DELETE CASCADE,campaign_id UUID NOT NULL REFERENCES governed_campaigns(id),
  creative_id UUID NOT NULL REFERENCES governed_creatives(id),location_context_id UUID NOT NULL REFERENCES minimized_location_contexts(id),subject_hash CHAR(64) NOT NULL,
  policy_version TEXT NOT NULL,decision TEXT NOT NULL CHECK(decision IN ('eligible','suppressed')),reason_codes TEXT[] NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),created_by BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS delivery_events(
  id UUID PRIMARY KEY,workspace_id UUID NOT NULL REFERENCES ad_workspaces(id) ON DELETE CASCADE,decision_id UUID NOT NULL REFERENCES delivery_decisions(id),
  external_event_id TEXT NOT NULL,event_type TEXT NOT NULL CHECK(event_type IN ('served','viewable','conversion','failed')),
  occurred_at TIMESTAMPTZ NOT NULL,failure_code TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(workspace_id,external_event_id,event_type)
);
CREATE TABLE IF NOT EXISTS ad_integration_jobs(
  id UUID PRIMARY KEY,workspace_id UUID NOT NULL REFERENCES ad_workspaces(id) ON DELETE CASCADE,provider TEXT NOT NULL,operation TEXT NOT NULL,idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','succeeded','failed','quarantined','cancelled')),failure_code TEXT,failure_detail TEXT,created_by BIGINT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(workspace_id,provider,idempotency_key)
);
CREATE TABLE IF NOT EXISTS ad_audit_events(
  id BIGSERIAL PRIMARY KEY,workspace_id UUID NOT NULL REFERENCES ad_workspaces(id) ON DELETE CASCADE,actor_user_id BIGINT NOT NULL,action TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,reason TEXT,metadata JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consent_subject ON location_consent_events(workspace_id,subject_hash,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_expiry ON minimized_location_contexts(workspace_id,expires_at);
CREATE INDEX IF NOT EXISTS idx_delivery_frequency ON delivery_decisions(workspace_id,subject_hash,campaign_id,decided_at DESC);
COMMIT;

