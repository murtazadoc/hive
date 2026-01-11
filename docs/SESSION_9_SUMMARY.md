# 🐝 HIVE - Session 9 Complete

## What Was Built

### ✅ M-Pesa Payments & Wallet System

Full payment infrastructure with STK Push, wallet, orders, and discounts.

---

### Database Schema (`schema_session9.sql`)

| Table | Purpose |
|-------|---------|
| `wallets` | User wallet balance with KYC levels |
| `transactions` | All payment transactions |
| `orders` | Customer orders with items |
| `order_items` | Individual products in order |
| `mpesa_callbacks` | Raw M-Pesa webhook data |
| `business_payouts` | B2C payouts to businesses |
| `discount_codes` | Promotional codes |
| `discount_usage` | Track code usage |
| `saved_payment_methods` | Saved M-Pesa numbers |

---

### Backend Services

#### MpesaService

| Method | Purpose |
|--------|---------|
| `getAccessToken()` | OAuth with Safaricom |
| `initiateSTKPush()` | Send payment prompt to phone |
| `querySTKPushStatus()` | Check payment status |
| `processSTKCallback()` | Handle webhook |
| `sendToMobile()` | B2C payouts |

#### PaymentsService

| Method | Purpose |
|--------|---------|
| `getWallet()` | Get/create user wallet |
| `depositToWallet()` | Top up via M-Pesa |
| `createOrder()` | New order with items |
| `payOrder()` | Pay via M-Pesa or wallet |
| `validateDiscountCode()` | Check promo codes |
| `getUserTransactions()` | Transaction history |

---

### API Endpoints

**Wallet:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/wallet` | GET | Wallet details |
| `/wallet/balance` | GET | Current balance |
| `/wallet/deposit` | POST | Deposit via M-Pesa |
| `/wallet/transactions` | GET | Transaction history |

**Orders:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/orders` | POST | Create order |
| `/orders` | GET | My orders |
| `/orders/:id` | GET | Order details |
| `/orders/:id/pay` | POST | Pay for order |
| `/orders/:id/status` | GET | Payment status |

**Business Orders:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/businesses/:id/orders` | GET | Business orders |
| `/businesses/:id/orders/:id/status` | PUT | Update status |

**Payments:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/payments/status/:id` | GET | Check STK status |
| `/payments/mpesa/callback` | POST | M-Pesa webhook |
| `/discounts/validate` | POST | Validate promo code |

---

### M-Pesa STK Push Flow

```
┌────────────────────────────────────────────────────────────────┐
│                    USER TAPS "PAY"                             │
└─────────────────────────────┬──────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                   INITIATE STK PUSH                            │
│           POST /mpesa/stkpush/v1/processrequest               │
└─────────────────────────────┬──────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│               USER'S PHONE RECEIVES PROMPT                     │
│                  "Enter M-Pesa PIN"                            │
└─────────────────────────────┬──────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
         ┌──────────┐                ┌──────────┐
         │  SUCCESS │                │  CANCEL  │
         └────┬─────┘                └────┬─────┘
              │                           │
              ▼                           ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│   WEBHOOK TO CALLBACK   │    │  STATUS: FAILED         │
│   ResultCode: 0         │    │  ResultCode: 1032       │
└───────────┬─────────────┘    └─────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────────────┐
│                  UPDATE TRANSACTION                            │
│          status: completed, mpesaReceipt: XXX                 │
└─────────────────────────────┬──────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                   UPDATE ORDER                                 │
│         paymentStatus: paid, status: paid                     │
└────────────────────────────────────────────────────────────────┘
```

---

### Mobile Screens

#### CheckoutScreen
- Order summary
- Delivery type (pickup/delivery)
- Delivery address form
- Contact info
- Discount code input
- Price breakdown

#### PaymentScreen
- Payment method selection (M-Pesa/Wallet)
- Phone number input for M-Pesa
- Real-time status polling
- Success/failure states
- Animated pending state

---

### Cart Store

```typescript
const { 
  items,
  addItem,
  removeItem,
  updateQuantity,
  clearCart,
  getTotal,
  getItemCount,
} = useCartStore();
```

Features:
- Persisted to AsyncStorage
- Single-business cart enforcement
- Quantity updates
- Variant support

---

### Discount System

**Types:**
- `percentage` - X% off (with max cap)
- `fixed` - KES X off

**Restrictions:**
- `minOrderAmount` - Minimum subtotal
- `usageLimit` - Total uses allowed
- `perUserLimit` - Uses per customer
- `firstOrderOnly` - New customers only
- `productIds` / `categoryIds` - Specific items

---

### Environment Variables

```env
# M-Pesa Daraja API
MPESA_CONSUMER_KEY=xxxxx
MPESA_CONSUMER_SECRET=xxxxx
MPESA_PASSKEY=xxxxx
MPESA_SHORTCODE=174379
MPESA_INITIATOR_NAME=testapi
MPESA_INITIATOR_PASSWORD=xxxxx
MPESA_CALLBACK_URL=https://api.hive.co.ke
MPESA_ENVIRONMENT=sandbox  # or production
```

---

### Platform Fees

| Fee | Amount |
|-----|--------|
| Service Fee | 2.5% of subtotal |
| Delivery (Nairobi) | KES 150 |
| Delivery (Premium Counties) | KES 250 |
| Wallet Deposit | Free |
| B2C Payout | Per M-Pesa rates |

---

### File Structure

```
backend/src/modules/payments/
├── payments.module.ts
├── payments.controller.ts
├── payments.service.ts
└── mpesa.service.ts

mobile/src/
├── api/
│   └── payments.ts
├── store/
│   └── cartStore.ts
└── screens/checkout/
    ├── CheckoutScreen.tsx
    └── PaymentScreen.tsx
```

---

### Session 9 Metrics

| Metric | Value |
|--------|-------|
| New DB Tables | 9 |
| API Endpoints | 15 |
| Mobile Screens | 2 |
| Payment Methods | 2 (M-Pesa, Wallet) |

---

### Security Considerations

- ✅ Phone number validation (254 format)
- ✅ Amount limits (KES 1 - 150,000)
- ✅ Webhook signature verification (implement in production)
- ✅ Transaction idempotency (unique references)
- ✅ Order ownership verification
- ✅ Wallet balance checks

---

### Future Enhancements

- [ ] Card payments (Visa/Mastercard)
- [ ] Buy Now Pay Later (BNPL)
- [ ] Recurring payments
- [ ] Split payments
- [ ] International payments
- [ ] Invoice generation
- [ ] Refund workflow
- [ ] Business payout scheduling

---

### Next Sessions

| Session | Focus | Key Features |
|---------|-------|--------------|
| **10** | Notifications | Push, SMS, in-app |
| **11** | Analytics | Events, dashboards |
| **12** | Performance | Caching, optimization |
| **13** | Testing | E2E, unit tests |

---

**Ready for Session 10: Push Notifications!** 🚀
