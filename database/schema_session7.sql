-- =====================================================
-- HIVE DATABASE SCHEMA - SESSION 7
-- Content Moderation System
-- =====================================================

-- =====================================================
-- MODERATION QUEUE
-- =====================================================
CREATE TABLE moderation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Content reference
    content_type VARCHAR(30) NOT NULL, -- product, business, reel, comment, image
    content_id UUID NOT NULL,
    business_id UUID REFERENCES business_profiles(id) ON DELETE SET NULL,
    
    -- Content snapshot (in case original is deleted)
    content_snapshot JSONB,
    
    -- Detection results
    auto_flags JSONB DEFAULT '{}',      -- { "alcohol": 0.95, "nsfw": 0.12 }
    detection_labels TEXT[] DEFAULT '{}', -- ['alcohol', 'tobacco', 'weapon']
    confidence_score DECIMAL(5, 4),     -- Overall confidence
    
    -- Priority (higher = more urgent)
    priority INTEGER DEFAULT 50,        -- 0-100
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, in_review, approved, rejected, escalated
    
    -- Review details
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    action_taken VARCHAR(30),           -- approve, reject, warn, suspend, escalate
    
    -- Source
    detection_source VARCHAR(30) DEFAULT 'auto', -- auto, user_report, admin
    reporter_id UUID REFERENCES users(id),
    report_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- USER REPORTS
-- =====================================================
CREATE TABLE user_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reporter
    reporter_id UUID NOT NULL REFERENCES users(id),
    
    -- Reported content
    content_type VARCHAR(30) NOT NULL,
    content_id UUID NOT NULL,
    
    -- Report details
    reason VARCHAR(50) NOT NULL,        -- inappropriate, spam, fake, harassment, etc.
    description TEXT,
    screenshots TEXT[] DEFAULT '{}',    -- Evidence URLs
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, investigating, resolved, dismissed
    
    -- Resolution
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    action_taken VARCHAR(30),
    
    -- Link to moderation queue
    moderation_queue_id UUID REFERENCES moderation_queue(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- CONTENT VIOLATIONS
-- =====================================================
CREATE TABLE content_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Violator
    business_id UUID REFERENCES business_profiles(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Violation details
    violation_type VARCHAR(50) NOT NULL, -- alcohol_unlicensed, nsfw, spam, fake, etc.
    severity VARCHAR(20) DEFAULT 'minor', -- minor, moderate, major, critical
    
    -- Related content
    content_type VARCHAR(30),
    content_id UUID,
    moderation_queue_id UUID REFERENCES moderation_queue(id),
    
    -- Action
    action_taken VARCHAR(30) NOT NULL,  -- warning, content_removed, suspended, banned
    action_details JSONB,               -- { "suspension_days": 7 }
    
    -- Handled by
    created_by UUID REFERENCES users(id),
    
    -- Appeal
    appeal_status VARCHAR(20),          -- none, pending, approved, denied
    appeal_notes TEXT,
    appeal_reviewed_by UUID REFERENCES users(id),
    appeal_reviewed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- BANNED CONTENT PATTERNS
-- =====================================================
CREATE TABLE banned_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Pattern type
    pattern_type VARCHAR(20) NOT NULL,  -- keyword, regex, image_hash
    
    -- Pattern value
    pattern_value TEXT NOT NULL,
    
    -- Matching
    match_mode VARCHAR(20) DEFAULT 'contains', -- exact, contains, regex
    case_sensitive BOOLEAN DEFAULT false,
    
    -- Category
    category VARCHAR(50) NOT NULL,      -- profanity, spam, scam, prohibited
    
    -- Action
    action VARCHAR(30) DEFAULT 'flag',  -- flag, block, warn
    severity VARCHAR(20) DEFAULT 'moderate',
    
    -- Metadata
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ALCOHOL/RESTRICTED BUSINESS LICENSES
-- =====================================================
CREATE TABLE business_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    
    -- License type
    license_type VARCHAR(50) NOT NULL,  -- alcohol_retail, alcohol_wholesale, tobacco, pharmacy
    license_number VARCHAR(100),
    
    -- Issuing authority
    issuing_authority VARCHAR(100),
    jurisdiction VARCHAR(100),          -- County, city
    
    -- Validity
    issued_date DATE,
    expiry_date DATE,
    
    -- Verification
    verification_status VARCHAR(20) DEFAULT 'pending', -- pending, verified, rejected, expired
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    
    -- Documents
    document_urls TEXT[] DEFAULT '{}',
    
    -- Restrictions
    restrictions JSONB DEFAULT '{}',    -- { "no_minors": true, "hours": "9am-8pm" }
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_business_license UNIQUE (business_id, license_type)
);

-- =====================================================
-- MODERATION ACTIONS LOG
-- =====================================================
CREATE TABLE moderation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Actor
    moderator_id UUID NOT NULL REFERENCES users(id),
    
    -- Target
    target_type VARCHAR(30) NOT NULL,   -- business, user, product, reel
    target_id UUID NOT NULL,
    
    -- Action
    action VARCHAR(30) NOT NULL,        -- approve, reject, warn, suspend, ban, restore
    reason TEXT,
    
    -- Previous state
    previous_state JSONB,
    
    -- Related
    moderation_queue_id UUID REFERENCES moderation_queue(id),
    violation_id UUID REFERENCES content_violations(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- MODERATION SETTINGS
-- =====================================================
CREATE TABLE moderation_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    description TEXT,
    
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO moderation_settings (setting_key, setting_value, description) VALUES
('auto_moderation_enabled', 'true', 'Enable automatic content moderation'),
('alcohol_detection_threshold', '0.7', 'Confidence threshold for alcohol detection'),
('nsfw_detection_threshold', '0.8', 'Confidence threshold for NSFW detection'),
('auto_approve_verified_businesses', 'true', 'Auto-approve content from verified businesses'),
('require_license_for_alcohol', 'true', 'Require license verification for alcohol products'),
('max_warnings_before_suspension', '3', 'Number of warnings before auto-suspension'),
('suspension_duration_days', '7', 'Default suspension duration in days');

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_moderation_queue_status ON moderation_queue(status, priority DESC);
CREATE INDEX idx_moderation_queue_content ON moderation_queue(content_type, content_id);
CREATE INDEX idx_moderation_queue_business ON moderation_queue(business_id);
CREATE INDEX idx_moderation_queue_created ON moderation_queue(created_at DESC);

CREATE INDEX idx_user_reports_status ON user_reports(status);
CREATE INDEX idx_user_reports_content ON user_reports(content_type, content_id);
CREATE INDEX idx_user_reports_reporter ON user_reports(reporter_id);

CREATE INDEX idx_violations_business ON content_violations(business_id);
CREATE INDEX idx_violations_user ON content_violations(user_id);
CREATE INDEX idx_violations_type ON content_violations(violation_type);

CREATE INDEX idx_banned_patterns_active ON banned_patterns(is_active, pattern_type);
CREATE INDEX idx_banned_patterns_category ON banned_patterns(category);

CREATE INDEX idx_business_licenses_business ON business_licenses(business_id);
CREATE INDEX idx_business_licenses_status ON business_licenses(verification_status);
CREATE INDEX idx_business_licenses_expiry ON business_licenses(expiry_date);

CREATE INDEX idx_moderation_actions_target ON moderation_actions(target_type, target_id);
CREATE INDEX idx_moderation_actions_moderator ON moderation_actions(moderator_id);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Count violations for a business
CREATE OR REPLACE FUNCTION count_business_violations(
    biz_id UUID,
    severity_filter VARCHAR DEFAULT NULL,
    days_back INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM content_violations
        WHERE business_id = biz_id
            AND created_at > NOW() - (days_back || ' days')::INTERVAL
            AND (severity_filter IS NULL OR severity = severity_filter)
    );
END;
$$ LANGUAGE plpgsql;

-- Check if business has valid license
CREATE OR REPLACE FUNCTION has_valid_license(
    biz_id UUID,
    license_type_filter VARCHAR
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM business_licenses
        WHERE business_id = biz_id
            AND license_type = license_type_filter
            AND verification_status = 'verified'
            AND is_active = true
            AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE TRIGGER update_moderation_queue_timestamp
    BEFORE UPDATE ON moderation_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_banned_patterns_timestamp
    BEFORE UPDATE ON banned_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_licenses_timestamp
    BEFORE UPDATE ON business_licenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
