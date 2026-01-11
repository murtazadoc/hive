-- =====================================================
-- HIVE DATABASE SCHEMA - SESSION 9
-- M-Pesa Payments & Wallet System
-- =====================================================

-- =====================================================
-- USER WALLETS
-- =====================================================
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Balance
    balance DECIMAL(12, 2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'KES',
    
    -- Limits
    daily_limit DECIMAL(12, 2) DEFAULT 150000.00,
    transaction_limit DECIMAL(12, 2) DEFAULT 70000.00,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_frozen BOOLEAN DEFAULT false,
    frozen_reason TEXT,
    frozen_at TIMESTAMPTZ,
    
    -- KYC
    kyc_level INTEGER DEFAULT 1,          -- 1: basic, 2: verified, 3: premium
    kyc_verified_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_user_wallet UNIQUE (user_id),
    CONSTRAINT positive_balance CHECK (balance >= 0)
);

-- =====================================================
-- TRANSACTIONS
-- =====================================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference
    reference VARCHAR(50) NOT NULL UNIQUE,
    external_reference VARCHAR(100),      -- M-Pesa receipt, etc.
    
    -- Type
    type VARCHAR(30) NOT NULL,            -- deposit, withdrawal, payment, refund, transfer
    
    -- Parties
    user_id UUID REFERENCES users(id),
    wallet_id UUID REFERENCES wallets(id),
    business_id UUID REFERENCES business_profiles(id),
    
    -- Amount
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'KES',
    fee DECIMAL(10, 2) DEFAULT 0.00,
    net_amount DECIMAL(12, 2),            -- amount - fee
    
    -- Payment method
    payment_method VARCHAR(30) NOT NULL,  -- mpesa, wallet, card
    payment_channel VARCHAR(30),          -- stk_push, paybill, till, b2c
    
    -- M-Pesa specific
    mpesa_receipt VARCHAR(20),
    phone_number VARCHAR(15),
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed, cancelled, refunded
    failure_reason TEXT,
    
    -- Related
    order_id UUID,
    parent_transaction_id UUID REFERENCES transactions(id),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Timestamps
    initiated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ORDERS
-- =====================================================
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference
    order_number VARCHAR(20) NOT NULL UNIQUE,
    
    -- Parties
    buyer_id UUID NOT NULL REFERENCES users(id),
    business_id UUID NOT NULL REFERENCES business_profiles(id),
    
    -- Items
    items JSONB NOT NULL,                 -- [{ productId, name, price, quantity, ... }]
    item_count INTEGER NOT NULL,
    
    -- Amounts
    subtotal DECIMAL(12, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) DEFAULT 0.00,
    delivery_fee DECIMAL(10, 2) DEFAULT 0.00,
    service_fee DECIMAL(10, 2) DEFAULT 0.00,
    total_amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'KES',
    
    -- Discount
    discount_code VARCHAR(50),
    discount_id UUID,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, paid, confirmed, processing, shipped, delivered, cancelled, refunded
    payment_status VARCHAR(20) DEFAULT 'pending', -- pending, paid, partial, refunded
    
    -- Delivery
    delivery_type VARCHAR(20),            -- pickup, delivery
    delivery_address JSONB,
    delivery_notes TEXT,
    estimated_delivery TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    
    -- Contact
    buyer_phone VARCHAR(15),
    buyer_name VARCHAR(100),
    
    -- Timestamps
    paid_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ORDER ITEMS (denormalized for history)
-- =====================================================
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    
    -- Product snapshot
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(50),
    product_image TEXT,
    
    -- Pricing
    unit_price DECIMAL(10, 2) NOT NULL,
    quantity INTEGER NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    
    -- Variant
    variant_id UUID,
    variant_name VARCHAR(100),
    variant_options JSONB,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, shipped, delivered, cancelled
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- MPESA CALLBACKS
-- =====================================================
CREATE TABLE mpesa_callbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Request info
    checkout_request_id VARCHAR(100) NOT NULL,
    merchant_request_id VARCHAR(100),
    
    -- Callback data
    result_code INTEGER,
    result_desc TEXT,
    
    -- Transaction details (from successful callback)
    mpesa_receipt VARCHAR(20),
    transaction_date TIMESTAMPTZ,
    phone_number VARCHAR(15),
    amount DECIMAL(12, 2),
    
    -- Raw payload
    raw_callback JSONB NOT NULL,
    
    -- Processing
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMPTZ,
    transaction_id UUID REFERENCES transactions(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- BUSINESS PAYOUTS
-- =====================================================
CREATE TABLE business_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES business_profiles(id),
    
    -- Amount
    amount DECIMAL(12, 2) NOT NULL,
    fee DECIMAL(10, 2) DEFAULT 0.00,
    net_amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'KES',
    
    -- Destination
    payout_method VARCHAR(30) NOT NULL,   -- mpesa, bank
    phone_number VARCHAR(15),
    bank_account JSONB,                   -- { bank, account_number, account_name }
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    failure_reason TEXT,
    
    -- M-Pesa B2C
    mpesa_conversation_id VARCHAR(100),
    mpesa_originator_id VARCHAR(100),
    mpesa_receipt VARCHAR(20),
    
    -- Timestamps
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- DISCOUNT CODES
-- =====================================================
CREATE TABLE discount_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Code
    code VARCHAR(50) NOT NULL UNIQUE,
    
    -- Scope
    business_id UUID REFERENCES business_profiles(id), -- NULL = platform-wide
    
    -- Discount
    discount_type VARCHAR(20) NOT NULL,   -- percentage, fixed
    discount_value DECIMAL(10, 2) NOT NULL,
    max_discount DECIMAL(10, 2),          -- Cap for percentage discounts
    min_order_amount DECIMAL(10, 2),
    
    -- Usage limits
    usage_limit INTEGER,
    usage_count INTEGER DEFAULT 0,
    per_user_limit INTEGER DEFAULT 1,
    
    -- Validity
    starts_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    -- Restrictions
    product_ids UUID[],                   -- Empty = all products
    category_ids UUID[],
    first_order_only BOOLEAN DEFAULT false,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- DISCOUNT USAGE
-- =====================================================
CREATE TABLE discount_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discount_id UUID NOT NULL REFERENCES discount_codes(id),
    user_id UUID NOT NULL REFERENCES users(id),
    order_id UUID REFERENCES orders(id),
    
    discount_amount DECIMAL(10, 2) NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_discount_order UNIQUE (discount_id, order_id)
);

-- =====================================================
-- PAYMENT METHODS (saved)
-- =====================================================
CREATE TABLE saved_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Type
    type VARCHAR(20) NOT NULL,            -- mpesa, card
    
    -- Details
    phone_number VARCHAR(15),             -- For M-Pesa
    card_last_four VARCHAR(4),            -- For cards
    card_brand VARCHAR(20),
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    
    -- Tokenization
    token TEXT,                           -- Encrypted token for recurring
    
    -- Preferences
    is_default BOOLEAN DEFAULT false,
    nickname VARCHAR(50),
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_wallets_user ON wallets(user_id);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_business ON transactions(business_id);
CREATE INDEX idx_transactions_reference ON transactions(reference);
CREATE INDEX idx_transactions_mpesa ON transactions(mpesa_receipt);
CREATE INDEX idx_transactions_status ON transactions(status, created_at DESC);
CREATE INDEX idx_transactions_order ON transactions(order_id);

CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_business ON orders(business_id);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status, created_at DESC);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

CREATE INDEX idx_mpesa_callbacks_checkout ON mpesa_callbacks(checkout_request_id);
CREATE INDEX idx_mpesa_callbacks_receipt ON mpesa_callbacks(mpesa_receipt);

CREATE INDEX idx_business_payouts_business ON business_payouts(business_id, status);

CREATE INDEX idx_discount_codes_code ON discount_codes(code);
CREATE INDEX idx_discount_codes_business ON discount_codes(business_id);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    prefix VARCHAR(3) := 'HV';
    date_part VARCHAR(6);
    random_part VARCHAR(6);
BEGIN
    date_part := TO_CHAR(NOW(), 'YYMMDD');
    random_part := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
    RETURN prefix || date_part || random_part;
END;
$$ LANGUAGE plpgsql;

-- Generate transaction reference
CREATE OR REPLACE FUNCTION generate_transaction_ref()
RETURNS VARCHAR(20) AS $$
BEGIN
    RETURN 'TXN' || TO_CHAR(NOW(), 'YYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
END;
$$ LANGUAGE plpgsql;

-- Credit wallet
CREATE OR REPLACE FUNCTION credit_wallet(
    wallet_uuid UUID,
    credit_amount DECIMAL,
    txn_reference VARCHAR
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE wallets
    SET balance = balance + credit_amount,
        updated_at = NOW()
    WHERE id = wallet_uuid AND is_active = true AND is_frozen = false;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Debit wallet
CREATE OR REPLACE FUNCTION debit_wallet(
    wallet_uuid UUID,
    debit_amount DECIMAL,
    txn_reference VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
    current_balance DECIMAL;
BEGIN
    SELECT balance INTO current_balance
    FROM wallets
    WHERE id = wallet_uuid AND is_active = true AND is_frozen = false
    FOR UPDATE;
    
    IF current_balance IS NULL THEN
        RETURN FALSE;
    END IF;
    
    IF current_balance < debit_amount THEN
        RETURN FALSE;
    END IF;
    
    UPDATE wallets
    SET balance = balance - debit_amount,
        updated_at = NOW()
    WHERE id = wallet_uuid;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-generate order number
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL THEN
        NEW.order_number := generate_order_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_order_number
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION set_order_number();

-- Auto-generate transaction reference
CREATE OR REPLACE FUNCTION set_transaction_ref()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.reference IS NULL THEN
        NEW.reference := generate_transaction_ref();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_transaction_ref
    BEFORE INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION set_transaction_ref();

-- Update timestamps
CREATE TRIGGER update_wallets_timestamp
    BEFORE UPDATE ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_timestamp
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_timestamp
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
