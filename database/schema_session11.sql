-- =====================================================
-- HIVE DATABASE SCHEMA - SESSION 11
-- Analytics & Event Tracking
-- =====================================================

-- =====================================================
-- ANALYTICS EVENTS
-- =====================================================
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event info
    event_name VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL,    -- page_view, action, conversion, error
    
    -- Actor
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    anonymous_id VARCHAR(100),              -- For non-logged in users
    session_id VARCHAR(100),
    
    -- Context
    business_id UUID REFERENCES business_profiles(id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    order_id UUID,
    
    -- Properties
    properties JSONB DEFAULT '{}',
    
    -- Attribution
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    referrer TEXT,
    
    -- Device & Location
    device_type VARCHAR(20),                -- mobile, tablet, desktop
    platform VARCHAR(20),                   -- ios, android, web
    app_version VARCHAR(20),
    os_version VARCHAR(50),
    browser VARCHAR(50),
    country VARCHAR(5),
    region VARCHAR(100),
    city VARCHAR(100),
    
    -- Timestamps
    client_timestamp TIMESTAMPTZ,           -- When event occurred on client
    created_at TIMESTAMPTZ DEFAULT NOW()    -- When received by server
);

-- =====================================================
-- PAGE VIEWS (optimized for page analytics)
-- =====================================================
CREATE TABLE page_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Actor
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    anonymous_id VARCHAR(100),
    session_id VARCHAR(100) NOT NULL,
    
    -- Page info
    page_path VARCHAR(500) NOT NULL,
    page_title VARCHAR(255),
    page_type VARCHAR(50),                  -- home, product, business, search, checkout
    
    -- Related entities
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    business_id UUID REFERENCES business_profiles(id) ON DELETE SET NULL,
    category_id UUID,
    
    -- Engagement
    time_on_page INTEGER,                   -- Seconds
    scroll_depth INTEGER,                   -- Percentage 0-100
    
    -- Referrer
    referrer_path VARCHAR(500),
    referrer_external TEXT,
    
    -- Device
    device_type VARCHAR(20),
    platform VARCHAR(20),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- USER SESSIONS
-- =====================================================
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(100) NOT NULL UNIQUE,
    
    -- Actor
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    anonymous_id VARCHAR(100),
    
    -- Session info
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    -- Engagement
    page_views INTEGER DEFAULT 0,
    events_count INTEGER DEFAULT 0,
    
    -- Entry & Exit
    entry_page VARCHAR(500),
    exit_page VARCHAR(500),
    
    -- Attribution (first touch)
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    referrer TEXT,
    
    -- Device
    device_type VARCHAR(20),
    platform VARCHAR(20),
    browser VARCHAR(50),
    country VARCHAR(5),
    city VARCHAR(100),
    
    -- Conversion
    converted BOOLEAN DEFAULT false,
    conversion_type VARCHAR(50),
    conversion_value DECIMAL(12, 2),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PRODUCT ANALYTICS (aggregated)
-- =====================================================
CREATE TABLE product_analytics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    -- Views
    views INTEGER DEFAULT 0,
    unique_viewers INTEGER DEFAULT 0,
    
    -- Engagement
    add_to_cart INTEGER DEFAULT 0,
    add_to_wishlist INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    
    -- Conversions
    orders INTEGER DEFAULT 0,
    units_sold INTEGER DEFAULT 0,
    revenue DECIMAL(12, 2) DEFAULT 0,
    
    -- Sources
    views_from_search INTEGER DEFAULT 0,
    views_from_feed INTEGER DEFAULT 0,
    views_from_share INTEGER DEFAULT 0,
    views_from_category INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_product_date UNIQUE (product_id, date)
);

-- =====================================================
-- BUSINESS ANALYTICS (aggregated)
-- =====================================================
CREATE TABLE business_analytics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    -- Profile
    profile_views INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,
    new_followers INTEGER DEFAULT 0,
    unfollows INTEGER DEFAULT 0,
    
    -- Products
    product_views INTEGER DEFAULT 0,
    product_clicks INTEGER DEFAULT 0,
    
    -- Engagement
    whatsapp_clicks INTEGER DEFAULT 0,
    phone_clicks INTEGER DEFAULT 0,
    share_clicks INTEGER DEFAULT 0,
    
    -- Reels
    reel_views INTEGER DEFAULT 0,
    reel_likes INTEGER DEFAULT 0,
    reel_comments INTEGER DEFAULT 0,
    reel_shares INTEGER DEFAULT 0,
    
    -- Conversions
    orders INTEGER DEFAULT 0,
    revenue DECIMAL(12, 2) DEFAULT 0,
    average_order_value DECIMAL(10, 2) DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_business_date UNIQUE (business_id, date)
);

-- =====================================================
-- SEARCH ANALYTICS
-- =====================================================
CREATE TABLE search_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Search info
    query VARCHAR(500) NOT NULL,
    normalized_query VARCHAR(500),
    
    -- Results
    results_count INTEGER DEFAULT 0,
    
    -- User action
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    clicked_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    clicked_position INTEGER,
    
    -- Filters used
    category_filter UUID,
    price_min DECIMAL(10, 2),
    price_max DECIMAL(10, 2),
    
    -- Session
    session_id VARCHAR(100),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- FUNNEL EVENTS
-- =====================================================
CREATE TABLE funnel_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Funnel info
    funnel_name VARCHAR(50) NOT NULL,       -- checkout, signup, onboarding
    step_name VARCHAR(50) NOT NULL,
    step_order INTEGER NOT NULL,
    
    -- Actor
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    anonymous_id VARCHAR(100),
    session_id VARCHAR(100),
    
    -- Context
    properties JSONB DEFAULT '{}',
    
    -- Time
    time_from_previous_step INTEGER,        -- Seconds
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- REAL-TIME METRICS (for dashboard)
-- =====================================================
CREATE TABLE realtime_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    metric_name VARCHAR(50) NOT NULL,
    metric_value DECIMAL(20, 4) NOT NULL,
    
    -- Dimensions
    dimension_1 VARCHAR(100),               -- e.g., platform
    dimension_2 VARCHAR(100),               -- e.g., country
    
    -- Time bucket
    bucket_time TIMESTAMPTZ NOT NULL,       -- Rounded to minute/hour
    bucket_size VARCHAR(10) NOT NULL,       -- minute, hour, day
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_metric_bucket UNIQUE (metric_name, dimension_1, dimension_2, bucket_time, bucket_size)
);

-- =====================================================
-- CONVERSION GOALS
-- =====================================================
CREATE TABLE conversion_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Goal info
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Trigger
    event_name VARCHAR(100) NOT NULL,
    event_conditions JSONB DEFAULT '{}',    -- { "properties.amount": { "gte": 1000 } }
    
    -- Value
    value_type VARCHAR(20) DEFAULT 'count', -- count, sum, average
    value_property VARCHAR(100),            -- e.g., "properties.amount"
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
-- Events
CREATE INDEX idx_events_name ON analytics_events(event_name, created_at DESC);
CREATE INDEX idx_events_user ON analytics_events(user_id, created_at DESC);
CREATE INDEX idx_events_session ON analytics_events(session_id, created_at DESC);
CREATE INDEX idx_events_business ON analytics_events(business_id, created_at DESC);
CREATE INDEX idx_events_product ON analytics_events(product_id, created_at DESC);
CREATE INDEX idx_events_category ON analytics_events(event_category, created_at DESC);
CREATE INDEX idx_events_date ON analytics_events(created_at DESC);

-- Page views
CREATE INDEX idx_pageviews_session ON page_views(session_id, created_at DESC);
CREATE INDEX idx_pageviews_path ON page_views(page_path, created_at DESC);
CREATE INDEX idx_pageviews_product ON page_views(product_id, created_at DESC);
CREATE INDEX idx_pageviews_business ON page_views(business_id, created_at DESC);

-- Sessions
CREATE INDEX idx_sessions_user ON user_sessions(user_id, started_at DESC);
CREATE INDEX idx_sessions_date ON user_sessions(started_at DESC);
CREATE INDEX idx_sessions_converted ON user_sessions(converted, started_at DESC);

-- Aggregates
CREATE INDEX idx_product_analytics_date ON product_analytics_daily(date DESC, product_id);
CREATE INDEX idx_business_analytics_date ON business_analytics_daily(date DESC, business_id);

-- Search
CREATE INDEX idx_search_query ON search_analytics(normalized_query, created_at DESC);

-- Real-time
CREATE INDEX idx_realtime_metric ON realtime_metrics(metric_name, bucket_time DESC);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Increment product analytics
CREATE OR REPLACE FUNCTION increment_product_metric(
    p_product_id UUID,
    p_metric VARCHAR,
    p_value INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO product_analytics_daily (id, product_id, date)
    VALUES (gen_random_uuid(), p_product_id, CURRENT_DATE)
    ON CONFLICT (product_id, date) DO NOTHING;
    
    EXECUTE format(
        'UPDATE product_analytics_daily SET %I = %I + $1 WHERE product_id = $2 AND date = CURRENT_DATE',
        p_metric, p_metric
    ) USING p_value, p_product_id;
END;
$$ LANGUAGE plpgsql;

-- Increment business analytics
CREATE OR REPLACE FUNCTION increment_business_metric(
    p_business_id UUID,
    p_metric VARCHAR,
    p_value INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO business_analytics_daily (id, business_id, date)
    VALUES (gen_random_uuid(), p_business_id, CURRENT_DATE)
    ON CONFLICT (business_id, date) DO NOTHING;
    
    EXECUTE format(
        'UPDATE business_analytics_daily SET %I = %I + $1 WHERE business_id = $2 AND date = CURRENT_DATE',
        p_metric, p_metric
    ) USING p_value, p_business_id;
END;
$$ LANGUAGE plpgsql;

-- Get trending products
CREATE OR REPLACE FUNCTION get_trending_products(
    p_days INTEGER DEFAULT 7,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    product_id UUID,
    total_views BIGINT,
    total_orders BIGINT,
    score DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pa.product_id,
        SUM(pa.views)::BIGINT as total_views,
        SUM(pa.orders)::BIGINT as total_orders,
        (SUM(pa.views) * 1 + SUM(pa.orders) * 10 + SUM(pa.add_to_cart) * 3)::DECIMAL as score
    FROM product_analytics_daily pa
    WHERE pa.date >= CURRENT_DATE - p_days
    GROUP BY pa.product_id
    ORDER BY score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- MATERIALIZED VIEWS (for fast dashboard queries)
-- =====================================================

-- Daily platform stats
CREATE MATERIALIZED VIEW mv_daily_platform_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(DISTINCT session_id) as sessions,
    COUNT(DISTINCT user_id) as users,
    COUNT(DISTINCT anonymous_id) FILTER (WHERE user_id IS NULL) as anonymous_users,
    COUNT(*) FILTER (WHERE event_name = 'page_view') as page_views,
    COUNT(*) FILTER (WHERE event_name = 'add_to_cart') as add_to_carts,
    COUNT(*) FILTER (WHERE event_name = 'purchase') as purchases,
    SUM((properties->>'amount')::DECIMAL) FILTER (WHERE event_name = 'purchase') as revenue
FROM analytics_events
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

CREATE UNIQUE INDEX ON mv_daily_platform_stats(date);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_platform_stats;
END;
$$ LANGUAGE plpgsql;
