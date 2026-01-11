-- =====================================================
-- HIVE DATABASE SCHEMA - Session 2
-- Product Catalog, Images, Inventory, Sync
-- =====================================================

-- =====================================================
-- PRODUCT CATEGORIES (Separate from Business Categories)
-- =====================================================
CREATE TABLE product_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    image_url TEXT,
    
    -- Hierarchy
    parent_id UUID REFERENCES product_categories(id),
    level INT DEFAULT 0,
    sort_order INT DEFAULT 0,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(business_id, slug)
);

CREATE INDEX idx_prod_cat_business ON product_categories(business_id);
CREATE INDEX idx_prod_cat_parent ON product_categories(parent_id);

-- =====================================================
-- PRODUCTS
-- =====================================================
CREATE TYPE product_status AS ENUM ('draft', 'active', 'out_of_stock', 'discontinued');

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    category_id UUID REFERENCES product_categories(id),
    
    -- Basic Info
    name VARCHAR(300) NOT NULL,
    slug VARCHAR(300) NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    
    -- Pricing
    price DECIMAL(12, 2) NOT NULL,
    compare_at_price DECIMAL(12, 2), -- Original price for discounts
    cost_price DECIMAL(12, 2), -- For profit calculations
    currency VARCHAR(3) DEFAULT 'KES',
    
    -- Inventory
    sku VARCHAR(100),
    barcode VARCHAR(100),
    track_inventory BOOLEAN DEFAULT TRUE,
    quantity INT DEFAULT 0,
    low_stock_threshold INT DEFAULT 5,
    
    -- Physical
    weight DECIMAL(10, 2),
    weight_unit VARCHAR(10) DEFAULT 'kg',
    
    -- Status
    status product_status DEFAULT 'draft',
    is_featured BOOLEAN DEFAULT FALSE,
    
    -- SEO
    meta_title VARCHAR(200),
    meta_description VARCHAR(500),
    
    -- Attributes (flexible JSON for variants)
    attributes JSONB DEFAULT '{}',
    -- Example: {"color": "Red", "size": "XL", "material": "Cotton"}
    
    -- Tags for search
    tags TEXT[] DEFAULT '{}',
    
    -- Stats
    view_count INT DEFAULT 0,
    order_count INT DEFAULT 0,
    
    -- Sync tracking
    sync_id VARCHAR(100), -- Client-generated ID for offline sync
    last_synced_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(business_id, slug),
    UNIQUE(business_id, sku)
);

CREATE INDEX idx_products_business ON products(business_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_featured ON products(is_featured) WHERE is_featured = TRUE;
CREATE INDEX idx_products_tags ON products USING GIN(tags);
CREATE INDEX idx_products_sync ON products(sync_id);

-- Full text search index
CREATE INDEX idx_products_search ON products USING GIN(
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(short_description, ''))
);

-- =====================================================
-- PRODUCT IMAGES
-- =====================================================
CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    alt_text VARCHAR(300),
    
    -- Ordering
    sort_order INT DEFAULT 0,
    is_primary BOOLEAN DEFAULT FALSE,
    
    -- Image metadata
    width INT,
    height INT,
    file_size INT,
    mime_type VARCHAR(50),
    
    -- Sync
    sync_id VARCHAR(100),
    local_path TEXT, -- For offline reference
    upload_status VARCHAR(20) DEFAULT 'completed', -- 'pending', 'uploading', 'completed', 'failed'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_prod_images_product ON product_images(product_id);
CREATE INDEX idx_prod_images_primary ON product_images(product_id, is_primary) WHERE is_primary = TRUE;

-- =====================================================
-- PRODUCT VARIANTS (Optional - for products with variants)
-- =====================================================
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    name VARCHAR(200) NOT NULL, -- e.g., "Red / Large"
    sku VARCHAR(100),
    barcode VARCHAR(100),
    
    price DECIMAL(12, 2) NOT NULL,
    compare_at_price DECIMAL(12, 2),
    cost_price DECIMAL(12, 2),
    
    quantity INT DEFAULT 0,
    
    -- Variant options
    options JSONB NOT NULL DEFAULT '{}',
    -- Example: {"color": "Red", "size": "Large"}
    
    image_id UUID REFERENCES product_images(id),
    
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    
    sync_id VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_sku ON product_variants(sku);

-- =====================================================
-- INVENTORY LOGS (Track all inventory changes)
-- =====================================================
CREATE TYPE inventory_action AS ENUM ('set', 'add', 'subtract', 'sale', 'return', 'adjustment', 'sync');

CREATE TABLE inventory_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    
    action inventory_action NOT NULL,
    quantity_change INT NOT NULL, -- Can be negative
    quantity_before INT NOT NULL,
    quantity_after INT NOT NULL,
    
    reason TEXT,
    reference_type VARCHAR(50), -- 'order', 'manual', 'sync'
    reference_id UUID,
    
    performed_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_inv_logs_product ON inventory_logs(product_id);
CREATE INDEX idx_inv_logs_business ON inventory_logs(business_id);
CREATE INDEX idx_inv_logs_created ON inventory_logs(created_at);

-- =====================================================
-- SYNC QUEUE (For offline-first architecture)
-- =====================================================
CREATE TYPE sync_operation AS ENUM ('create', 'update', 'delete');
CREATE TYPE sync_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'conflict');

CREATE TABLE sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES business_profiles(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    
    -- What changed
    entity_type VARCHAR(50) NOT NULL, -- 'product', 'product_image', 'category'
    entity_id UUID NOT NULL,
    sync_id VARCHAR(100) NOT NULL, -- Client-generated
    
    operation sync_operation NOT NULL,
    payload JSONB NOT NULL,
    
    -- Conflict resolution
    client_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    server_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    status sync_status DEFAULT 'pending',
    error_message TEXT,
    retry_count INT DEFAULT 0,
    
    processed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sync_user ON sync_queue(user_id, status);
CREATE INDEX idx_sync_business ON sync_queue(business_id);
CREATE INDEX idx_sync_status ON sync_queue(status) WHERE status = 'pending';
CREATE INDEX idx_sync_entity ON sync_queue(entity_type, entity_id);

-- =====================================================
-- SYNC CHECKPOINTS (Track last sync per device)
-- =====================================================
CREATE TABLE sync_checkpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES business_profiles(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    
    entity_type VARCHAR(50) NOT NULL,
    last_sync_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_sync_id UUID,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, business_id, device_id, entity_type)
);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update product updated_at
CREATE TRIGGER trigger_products_updated
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update product category updated_at
CREATE TRIGGER trigger_prod_cat_updated
    BEFORE UPDATE ON product_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update variant updated_at
CREATE TRIGGER trigger_variants_updated
    BEFORE UPDATE ON product_variants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-update business product count
CREATE OR REPLACE FUNCTION update_product_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE business_profiles 
        SET product_count = product_count + 1 
        WHERE id = NEW.business_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE business_profiles 
        SET product_count = product_count - 1 
        WHERE id = OLD.business_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_product_count
    AFTER INSERT OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION update_product_count();

-- Set primary image if first image
CREATE OR REPLACE FUNCTION set_primary_image()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM product_images 
        WHERE product_id = NEW.product_id AND is_primary = TRUE
    ) THEN
        NEW.is_primary := TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_primary_image
    BEFORE INSERT ON product_images
    FOR EACH ROW EXECUTE FUNCTION set_primary_image();
