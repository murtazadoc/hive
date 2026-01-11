-- =====================================================
-- HIVE DATABASE OPTIMIZATION - SESSION 12
-- Performance Indexes & Query Optimization
-- =====================================================

-- =====================================================
-- COMPOSITE INDEXES FOR COMMON QUERIES
-- =====================================================

-- Products listing with filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_listing 
ON products (status, business_id, category_id, created_at DESC)
WHERE status = 'active';

-- Products price range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_price_range
ON products (status, price, created_at DESC)
WHERE status = 'active';

-- Products search by name (trigram for fuzzy search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name_trgm
ON products USING gin (name gin_trgm_ops);

-- Business profiles listing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_active
ON business_profiles (status, created_at DESC)
WHERE status = 'approved';

-- Orders by status for business
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_business_status
ON orders (business_id, status, created_at DESC);

-- Orders by buyer
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_buyer_status
ON orders (buyer_id, status, created_at DESC);

-- Transactions by date range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_date
ON transactions (created_at DESC, status);

-- Notifications unread
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_unread_user
ON notifications (user_id, created_at DESC)
WHERE read_at IS NULL;

-- Reels feed
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reels_feed
ON reels (status, created_at DESC)
WHERE status = 'active';

-- User sessions active
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_active
ON user_sessions (user_id, started_at DESC)
WHERE ended_at IS NULL;

-- =====================================================
-- PARTIAL INDEXES FOR COMMON FILTERS
-- =====================================================

-- Only active products
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_active_only
ON products (created_at DESC)
WHERE status = 'active' AND deleted_at IS NULL;

-- Only approved businesses
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_approved_only
ON business_profiles (business_name, slug)
WHERE status = 'approved';

-- Only pending orders
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_pending
ON orders (created_at DESC)
WHERE status = 'pending' AND payment_status = 'pending';

-- Featured products
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_featured
ON products (created_at DESC)
WHERE is_featured = true AND status = 'active';

-- =====================================================
-- COVERING INDEXES (include columns to avoid table lookup)
-- =====================================================

-- Product card data (for listings)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_card
ON products (status, created_at DESC)
INCLUDE (id, name, slug, price, compare_at_price, business_id);

-- Business card data
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_card
ON business_profiles (status, created_at DESC)
INCLUDE (id, business_name, slug, logo_url, followers_count);

-- =====================================================
-- BRIN INDEXES (for time-series data)
-- =====================================================

-- Analytics events (time-based)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_brin
ON analytics_events USING brin (created_at);

-- Page views (time-based)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_page_views_brin
ON page_views USING brin (created_at);

-- SMS messages (time-based)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sms_messages_brin
ON sms_messages USING brin (created_at);

-- =====================================================
-- PERFORMANCE CONFIGURATION
-- =====================================================

-- Increase work_mem for complex queries (per session)
-- SET work_mem = '256MB';

-- Increase maintenance_work_mem for index creation
-- SET maintenance_work_mem = '512MB';

-- Enable parallel query execution
-- SET max_parallel_workers_per_gather = 4;

-- =====================================================
-- TABLE PARTITIONING (for large tables)
-- =====================================================

-- Partition analytics_events by month
-- (Run in migration, recreates table)
/*
CREATE TABLE analytics_events_partitioned (
    LIKE analytics_events INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Create partitions
CREATE TABLE analytics_events_2024_01 PARTITION OF analytics_events_partitioned
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE analytics_events_2024_02 PARTITION OF analytics_events_partitioned
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
-- ... continue for each month
*/

-- =====================================================
-- MATERIALIZED VIEWS FOR DASHBOARDS
-- =====================================================

-- Business statistics (refresh hourly)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_business_stats AS
SELECT 
    bp.id as business_id,
    bp.business_name,
    COUNT(DISTINCT p.id) as product_count,
    COUNT(DISTINCT o.id) FILTER (WHERE o.payment_status = 'paid') as total_orders,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_status = 'paid'), 0) as total_revenue,
    bp.followers_count,
    COALESCE(AVG(o.total_amount) FILTER (WHERE o.payment_status = 'paid'), 0) as avg_order_value
FROM business_profiles bp
LEFT JOIN products p ON p.business_id = bp.id AND p.status = 'active'
LEFT JOIN orders o ON o.business_id = bp.id
WHERE bp.status = 'approved'
GROUP BY bp.id, bp.business_name, bp.followers_count;

CREATE UNIQUE INDEX ON mv_business_stats (business_id);

-- Category product counts (refresh daily)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_category_counts AS
SELECT 
    c.id as category_id,
    c.name,
    c.slug,
    COUNT(DISTINCT p.id) as product_count,
    COUNT(DISTINCT p.business_id) as business_count
FROM categories c
LEFT JOIN products p ON p.category_id = c.id AND p.status = 'active'
GROUP BY c.id, c.name, c.slug;

CREATE UNIQUE INDEX ON mv_category_counts (category_id);

-- =====================================================
-- REFRESH FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_business_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_category_counts;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_platform_stats;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VACUUM & ANALYZE SCHEDULE
-- =====================================================

-- Run ANALYZE on frequently updated tables
ANALYZE products;
ANALYZE orders;
ANALYZE transactions;
ANALYZE analytics_events;
ANALYZE notifications;

-- =====================================================
-- QUERY OPTIMIZATION EXAMPLES
-- =====================================================

-- Before: Slow product listing
-- SELECT * FROM products 
-- WHERE status = 'active' AND category_id = 'xxx'
-- ORDER BY created_at DESC LIMIT 20;

-- After: Optimized with index
-- Uses idx_products_listing index

-- Before: Slow text search
-- SELECT * FROM products WHERE name ILIKE '%phone%';

-- After: Optimized with trigram index
-- SELECT * FROM products WHERE name % 'phone' ORDER BY similarity(name, 'phone') DESC;

-- Before: Slow aggregation
-- SELECT business_id, COUNT(*), SUM(total_amount) FROM orders GROUP BY business_id;

-- After: Use materialized view
-- SELECT * FROM mv_business_stats WHERE business_id = 'xxx';

-- =====================================================
-- CONNECTION POOLING RECOMMENDATION
-- =====================================================

-- Use PgBouncer with these settings:
-- pool_mode = transaction
-- default_pool_size = 20
-- max_client_conn = 200
-- reserve_pool_size = 5

-- =====================================================
-- MONITORING QUERIES
-- =====================================================

-- Find slow queries
CREATE VIEW slow_queries AS
SELECT 
    query,
    calls,
    mean_exec_time,
    total_exec_time,
    rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Find missing indexes
CREATE VIEW missing_indexes AS
SELECT 
    schemaname,
    relname as table_name,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch,
    CASE WHEN seq_scan > 0 
         THEN round((seq_tup_read::numeric / seq_scan), 2) 
         ELSE 0 
    END as avg_seq_tup_read
FROM pg_stat_user_tables
WHERE seq_scan > 100
ORDER BY seq_tup_read DESC;

-- Table sizes
CREATE VIEW table_sizes AS
SELECT
    relname as table_name,
    pg_size_pretty(pg_total_relation_size(relid)) as total_size,
    pg_size_pretty(pg_relation_size(relid)) as data_size,
    pg_size_pretty(pg_indexes_size(relid)) as index_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
