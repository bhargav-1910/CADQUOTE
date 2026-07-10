# CRM-lite Customer Records — Design

**Date:** 2026-07-10 · **Status:** Approved by user (spec quoted back verbatim with "implement this")

## Problem

Every quote stores customer name/email/company as free text — retyped each
time, with no way to see "everything I've quoted Acme", no per-customer win
rate, and no guard against quoting the same part at two different prices.

## Design

### Data model

- New `customers` table: `id`, `user_id` (owner — customers are private to a
  workspace), `name` (required), `email`, `company`, `phone`, `gstin`,
  `notes`, timestamps.
- `quotes.customer_id` — nullable FK. The existing free-text
  `customer_name/email/company` columns stay as a point-in-time snapshot on
  each quote (historical quotes must not change when a customer record is
  edited).

### Linking rules (find-or-create)

Implemented once in `app/services/customers.py` and used by quote creation,
the customers API, and the startup backfill:

1. Match by `lower(email)` within the owner's customers when an email is
   present.
2. Else match by case-insensitive `name` + `company`.
3. Else create. On match, fill in any blank fields from the new data
   (never overwrite non-empty values).

Quote creation (single + combined) links `customer_id` automatically from
the free-text fields; an explicit `customer_id` in the request wins after an
ownership check. A startup backfill (idempotent, like the geometry recovery
janitor) links pre-existing quotes so history is complete on day one.

### API (`/api/customers`, owner-scoped)

- `GET /customers?search=` — list with aggregates per customer:
  `quote_count`, `total_quoted_value`, `accepted_count`, `declined_count`,
  `last_quote_at` (single grouped outer-join query).
- `POST /customers` — find-or-create semantics (the picker's "create on the
  fly").
- `GET /customers/{id}` — detail with the same aggregates.
- `PATCH /customers/{id}` — edit contact fields/notes.
- `GET /customers/{id}/quotes` — quote timeline (reuses `QuoteListResponse`).

Win rate is presented as `accepted_count / quote_count`; both raw counts are
returned so the UI can also show accepted-vs-declined.

### Frontend

- **Customers list** (`/customers`): search box + table (customer, contact,
  quotes, total quoted, won, last activity); rows link to detail.
- **Customer detail** (`/customers/:id`): contact card with inline edit,
  stat tiles (total quoted, quotes, won/win-rate), expiring-soon strip
  (valid quotes ending within 7 days), full quote timeline with status
  pills.
- **QuoteBuilder picker**: combobox above the customer fields — type to
  search existing customers (debounced), pick one to fill the fields and
  set `customer_id`; manual edits to name/email clear the picked id (the
  backend still dedupes by email). "Create new" just types a fresh name.
- **Quote detail**: customer name links to the customer page when linked.
- Nav: "Customers" entry between My Quotes and Cost Master.

## Out of scope (YAGNI)

Customer deletion/merge UI, customer-level pricing rules, import/export,
reminder emails. All can layer on later without schema changes.

## Testing

- Unit: match-key normalization + find-or-create precedence (smoke tests).
- Live: create two quotes with the same email → one customer with two
  quotes and correct totals; UI screenshots of list, detail, and picker.
