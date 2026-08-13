# Shared Payment Engine

This layer is provider-neutral.

## Rules from Project Context

- Local access: 3 ETB per service.
- International access: $1 for 7 days.
- Payment must be verified by the backend before Save/Download.
- The platform must never collect or store provider PINs/passwords.
- Provider-specific verification belongs in trusted adapters/webhooks.
- International access is protected by a maximum of 10 services per rolling 24-hour period.

`payment.engine.js` only creates the normalized payment intent. It does not pretend that a payment is successful.
