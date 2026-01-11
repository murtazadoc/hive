-- =====================================================
-- HIVE DATABASE SCHEMA - SESSION 5
-- AI-Powered Search with Vector Embeddings
-- =====================================================

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- EMBEDDINGS TABLE
-- Stores vector embeddings for all searchable entities
-- =====================================================
CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Entity reference (polymorphic)
    entity_type VARCHAR(50) NOT NULL,  -- 'product', 'business', 'category'
    entity_id UUID NOT NULL,
    
    -- The actual embedding vector (1536 dimensions for OpenAI ada-002)
    embedding vector(1536) NOT NULL,
    
    -- Text that was embedded (for debugging/re-embedding)
    embedded_text TEXT NOT NULL,
    
    -- Embedding model used
    model VARCHAR(100) DEFAULT 'text-embedding-ada-002',
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint per entity
    UNIQUE(entity_type, entity_id)
);

-- Index for fast vector similarity search
CREATE INDEX embeddings_vector_idx ON embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for entity lookup
CREATE INDEX embeddings_entity_idx ON embeddings(entity_type, entity_id);

-- =====================================================
-- SEARCH HISTORY TABLE
-- Track user searches for analytics and personalization
-- =====================================================
CREATE TABLE search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Search details
    query TEXT NOT NULL,
    query_embedding vector(1536),
    
    -- Filters applied
    filters JSONB DEFAULT '{}',
    
    -- Results
    result_count INTEGER DEFAULT 0,
    clicked_results JSONB DEFAULT '[]',
    
    -- Session info
    session_id VARCHAR(100),
    device_type VARCHAR(50),
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    
    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user search history
CREATE INDEX search_history_user_idx ON search_history(user_id, created_at DESC);

-- =====================================================
-- POPULAR SEARCHES TABLE
-- Aggregated popular searches (updated periodically)
-- =====================================================
CREATE TABLE popular_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    query TEXT NOT NULL,
    normalized_query TEXT NOT NULL,  -- lowercase, trimmed
    
    -- Aggregated stats
    search_count INTEGER DEFAULT 1,
    last_searched_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Location-based popularity
    county VARCHAR(100),
    city VARCHAR(100),
    
    -- Time period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Unique per query per location per period
    UNIQUE(normalized_query, county, city, period_start)
);

-- Index for trending searches
CREATE INDEX popular_searches_count_idx ON popular_searches(search_count DESC);
CREATE INDEX popular_searches_location_idx ON popular_searches(county, city);

-- =====================================================
-- SEARCH SYNONYMS TABLE
-- Custom synonyms for better search matching
-- =====================================================
CREATE TABLE search_synonyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    term VARCHAR(100) NOT NULL,
    synonyms TEXT[] NOT NULL,  -- Array of synonyms
    
    -- Category-specific synonyms
    category_id UUID REFERENCES business_categories(id),
    
    -- Locale
    locale VARCHAR(10) DEFAULT 'en',
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(term, locale)
);

-- Pre-populate with common Kenyan/East African terms
INSERT INTO search_synonyms (term, synonyms) VALUES
    ('phone', ARRAY['simu', 'smartphone', 'mobile', 'cellphone']),
    ('clothes', ARRAY['nguo', 'clothing', 'apparel', 'garments', 'wear']),
    ('food', ARRAY['chakula', 'meals', 'eats', 'cuisine']),
    ('shoes', ARRAY['viatu', 'footwear', 'sneakers', 'boots']),
    ('electronics', ARRAY['vifaa vya elektroniki', 'gadgets', 'tech']),
    ('beauty', ARRAY['urembo', 'cosmetics', 'skincare', 'makeup']),
    ('furniture', ARRAY['samani', 'fanicha', 'home goods']),
    ('car', ARRAY['gari', 'vehicle', 'auto', 'motor']),
    ('repair', ARRAY['kurekebisha', 'fix', 'service', 'maintenance']),
    ('cheap', ARRAY['bei nafuu', 'affordable', 'budget', 'low price']),
    ('new', ARRAY['mpya', 'latest', 'fresh', 'recent']),
    ('second hand', ARRAY['mitumba', 'used', 'pre-owned', 'refurbished']);

-- =====================================================
-- SEARCH BOOST RULES TABLE
-- Custom rules to boost certain results
-- =====================================================
CREATE TABLE search_boost_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Rule conditions
    query_contains TEXT[],           -- Boost if query contains these
    category_ids UUID[],             -- Boost these categories
    business_ids UUID[],             -- Boost these businesses
    
    -- Boost factor (1.0 = no boost, 2.0 = double score)
    boost_factor DECIMAL(4, 2) DEFAULT 1.5,
    
    -- Validity
    is_active BOOLEAN DEFAULT TRUE,
    start_date DATE,
    end_date DATE,
    
    -- Priority (higher = applied first)
    priority INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- FUNCTIONS FOR VECTOR SEARCH
-- =====================================================

-- Function to search by vector similarity
CREATE OR REPLACE FUNCTION search_by_embedding(
    query_embedding vector(1536),
    entity_types TEXT[],
    limit_count INTEGER DEFAULT 20,
    similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    entity_type VARCHAR,
    entity_id UUID,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.entity_type,
        e.entity_id,
        1 - (e.embedding <=> query_embedding) as similarity
    FROM embeddings e
    WHERE e.entity_type = ANY(entity_types)
    AND 1 - (e.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to find similar products
CREATE OR REPLACE FUNCTION find_similar_products(
    product_id UUID,
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    similar_product_id UUID,
    similarity FLOAT
) AS $$
DECLARE
    product_embedding vector(1536);
BEGIN
    -- Get the embedding for the source product
    SELECT embedding INTO product_embedding
    FROM embeddings
    WHERE entity_type = 'product' AND entity_id = product_id;
    
    IF product_embedding IS NULL THEN
        RETURN;
    END IF;
    
    RETURN QUERY
    SELECT 
        e.entity_id as similar_product_id,
        1 - (e.embedding <=> product_embedding) as similarity
    FROM embeddings e
    WHERE e.entity_type = 'product'
    AND e.entity_id != product_id
    ORDER BY e.embedding <=> product_embedding
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INDEXES FOR HYBRID SEARCH (text + vector)
-- =====================================================

-- Full-text search index on products (if not exists)
CREATE INDEX IF NOT EXISTS products_fts_idx ON products 
USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- Full-text search index on businesses
CREATE INDEX IF NOT EXISTS businesses_fts_idx ON business_profiles
USING gin(to_tsvector('english', business_name || ' ' || COALESCE(description, '')));

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger to update embeddings timestamp
CREATE OR REPLACE FUNCTION update_embedding_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER embeddings_updated
    BEFORE UPDATE ON embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_embedding_timestamp();
