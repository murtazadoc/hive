-- =====================================================
-- HIVE DATABASE SCHEMA - Session 1
-- Authentication + User/Business Profiles + RBAC
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- CORE USER ENTITY (The Human)
-- =====================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Authentication
    phone_number VARCHAR(20) UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    
    -- Profile
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    
    -- Verification
    phone_verified BOOLEAN DEFAULT FALSE,
    email_verified BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason TEXT,
    
    -- Metadata
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_email ON users(email);

-- =====================================================
-- OTP VERIFICATION
-- =====================================================
CREATE TABLE otp_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Can also be used for new registrations (user_id null)
    phone_number VARCHAR(20),
    email VARCHAR(255),
    
    code VARCHAR(6) NOT NULL,
    purpose VARCHAR(50) NOT NULL, -- 'registration', 'login', 'password_reset'
    
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    attempts INT DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_otp_phone ON otp_codes(phone_number, purpose);
CREATE INDEX idx_otp_expires ON otp_codes(expires_at);

-- =====================================================
-- BUSINESS CATEGORIES
-- =====================================================
CREATE TABLE business_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    
    -- Hierarchy support
    parent_id UUID REFERENCES business_categories(id),
    level INT DEFAULT 0,
    
    -- Ordering
    sort_order INT DEFAULT 0,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_categories_parent ON business_categories(parent_id);
CREATE INDEX idx_categories_slug ON business_categories(slug);

-- =====================================================
-- BUSINESS PROFILES (The Persona/Brand)
-- =====================================================
CREATE TYPE business_type AS ENUM ('retail', 'professional', 'both');
CREATE TYPE business_status AS ENUM ('draft', 'pending', 'approved', 'rejected', 'suspended');

CREATE TABLE business_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Ownership
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Basic Info
    business_name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) UNIQUE NOT NULL,
    tagline VARCHAR(300),
    description TEXT,
    
    -- Type
    business_type business_type NOT NULL DEFAULT 'retail',
    category_id UUID REFERENCES business_categories(id),
    
    -- Contact
    whatsapp_number VARCHAR(20) NOT NULL,
    phone_number VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(500),
    
    -- Location
    address TEXT,
    city VARCHAR(100),
    area VARCHAR(100), -- e.g., 'Saifee Park'
    country VARCHAR(100) DEFAULT 'Kenya',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Media
    logo_url TEXT,
    cover_image_url TEXT,
    
    -- Verification & Status
    status business_status DEFAULT 'draft',
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    verification_notes TEXT,
    
    -- KYC Documents
    kyc_submitted BOOLEAN DEFAULT FALSE,
    kyc_document_urls JSONB DEFAULT '[]',
    
    -- Stats (denormalized for performance)
    product_count INT DEFAULT 0,
    follower_count INT DEFAULT 0,
    rating_average DECIMAL(3, 2) DEFAULT 0,
    rating_count INT DEFAULT 0,
    
    -- Settings
    settings JSONB DEFAULT '{}',
    
    -- Metadata
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_business_owner ON business_profiles(owner_id);
CREATE INDEX idx_business_status ON business_profiles(status);
CREATE INDEX idx_business_category ON business_profiles(category_id);
CREATE INDEX idx_business_slug ON business_profiles(slug);
CREATE INDEX idx_business_area ON business_profiles(area);
CREATE INDEX idx_business_verified ON business_profiles(is_verified) WHERE is_verified = TRUE;

-- =====================================================
-- ROLE-BASED ACCESS CONTROL (RBAC)
-- =====================================================
CREATE TYPE business_role AS ENUM ('owner', 'admin', 'editor', 'viewer');

CREATE TABLE business_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    role business_role NOT NULL DEFAULT 'viewer',
    
    -- Granular Permissions (override role defaults)
    permissions JSONB DEFAULT '{}',
    -- Example: {"can_edit_products": true, "can_manage_orders": false}
    
    invited_by UUID REFERENCES users(id),
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(business_id, user_id)
);

CREATE INDEX idx_members_business ON business_members(business_id);
CREATE INDEX idx_members_user ON business_members(user_id);

-- =====================================================
-- REFRESH TOKENS (for JWT auth)
-- =====================================================
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    token_hash VARCHAR(255) NOT NULL,
    device_info JSONB DEFAULT '{}',
    ip_address INET,
    
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_token ON refresh_tokens(token_hash);

-- =====================================================
-- PROFESSIONAL PROFILES (Extension for Professionals)
-- =====================================================
CREATE TABLE professional_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    
    -- Professional Details
    title VARCHAR(200), -- e.g., "Certified Electrician"
    years_of_experience INT,
    certifications JSONB DEFAULT '[]',
    
    -- Service Areas
    service_areas JSONB DEFAULT '[]', -- ["Saifee Park", "Parklands"]
    
    -- Availability
    availability JSONB DEFAULT '{}',
    -- {"monday": {"start": "09:00", "end": "17:00"}, ...}
    
    hourly_rate DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'KES',
    
    -- Portfolio link (separate table)
    portfolio_enabled BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_professional_business ON professional_profiles(business_id);

-- =====================================================
-- ACTIVITY LOGS (Audit Trail)
-- =====================================================
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    user_id UUID REFERENCES users(id),
    business_id UUID REFERENCES business_profiles(id),
    
    action VARCHAR(100) NOT NULL, -- 'login', 'business_created', 'product_added'
    entity_type VARCHAR(50),
    entity_id UUID,
    
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_activity_user ON activity_logs(user_id);
CREATE INDEX idx_activity_business ON activity_logs(business_id);
CREATE INDEX idx_activity_created ON activity_logs(created_at);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_business_updated
    BEFORE UPDATE ON business_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_members_updated
    BEFORE UPDATE ON business_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create owner membership when business is created
CREATE OR REPLACE FUNCTION create_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO business_members (business_id, user_id, role, accepted_at)
    VALUES (NEW.id, NEW.owner_id, 'owner', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_business_owner_membership
    AFTER INSERT ON business_profiles
    FOR EACH ROW EXECUTE FUNCTION create_owner_membership();

-- Generate slug from business name
CREATE OR REPLACE FUNCTION generate_unique_slug(base_name VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    base_slug VARCHAR;
    final_slug VARCHAR;
    counter INT := 0;
BEGIN
    -- Convert to lowercase and replace spaces/special chars with hyphens
    base_slug := LOWER(REGEXP_REPLACE(base_name, '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := TRIM(BOTH '-' FROM base_slug);
    
    final_slug := base_slug;
    
    -- Check for uniqueness and append number if needed
    WHILE EXISTS (SELECT 1 FROM business_profiles WHERE slug = final_slug) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;
    
    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SEED DATA: Default Categories
-- =====================================================
INSERT INTO business_categories (name, slug, icon, sort_order) VALUES
('Retail & Shopping', 'retail', 'shopping-bag', 1),
('Food & Dining', 'food', 'utensils', 2),
('Professional Services', 'professional', 'briefcase', 3),
('Home Services', 'home-services', 'home', 4),
('Health & Wellness', 'health', 'heart', 5),
('Education & Training', 'education', 'book', 6),
('Technology', 'technology', 'laptop', 7),
('Beauty & Fashion', 'beauty', 'scissors', 8),
('Automotive', 'automotive', 'car', 9),
('Events & Entertainment', 'events', 'calendar', 10);

-- Sub-categories for Retail
INSERT INTO business_categories (name, slug, icon, parent_id, level, sort_order)
SELECT 
    sub.name, 
    sub.slug, 
    sub.icon,
    (SELECT id FROM business_categories WHERE slug = 'retail'),
    1,
    sub.sort_order
FROM (VALUES
    ('Electronics', 'electronics', 'smartphone', 1),
    ('Clothing', 'clothing', 'shirt', 2),
    ('Hardware', 'hardware', 'wrench', 3),
    ('Groceries', 'groceries', 'shopping-cart', 4),
    ('Furniture', 'furniture', 'sofa', 5)
) AS sub(name, slug, icon, sort_order);

-- Sub-categories for Professional Services
INSERT INTO business_categories (name, slug, icon, parent_id, level, sort_order)
SELECT 
    sub.name, 
    sub.slug, 
    sub.icon,
    (SELECT id FROM business_categories WHERE slug = 'professional'),
    1,
    sub.sort_order
FROM (VALUES
    ('Legal Services', 'legal', 'scale', 1),
    ('Accounting', 'accounting', 'calculator', 2),
    ('Consulting', 'consulting', 'users', 3),
    ('Design & Creative', 'design', 'palette', 4),
    ('IT Services', 'it-services', 'code', 5)
) AS sub(name, slug, icon, sort_order);

-- Sub-categories for Home Services
INSERT INTO business_categories (name, slug, icon, parent_id, level, sort_order)
SELECT 
    sub.name, 
    sub.slug, 
    sub.icon,
    (SELECT id FROM business_categories WHERE slug = 'home-services'),
    1,
    sub.sort_order
FROM (VALUES
    ('Electricians', 'electricians', 'zap', 1),
    ('Plumbers', 'plumbers', 'droplet', 2),
    ('Carpenters', 'carpenters', 'tool', 3),
    ('Cleaning Services', 'cleaning', 'spray-can', 4),
    ('Landscaping', 'landscaping', 'tree', 5)
) AS sub(name, slug, icon, sort_order);
