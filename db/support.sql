-- The read-only surface Loopback queries (public API: changing it breaks Loopback's demo).
--
-- Schema `support` holds customer-scoped views. Each has a `customer_id` column with the
-- customer's external id (cus_...). No card numbers, no data about the customer's own
-- clients beyond their company name, no personal data beyond the customer's own name
-- and email. Role `loopback_reader` can read these views and nothing else.
--
-- The reader password is a published demo value. Never reuse this image with real data.

CREATE SCHEMA support;

CREATE VIEW support.customer_account AS
SELECT
  c.external_id AS customer_id,
  c.company_name,
  c.contact_name,
  c.contact_email,
  c.country,
  c.timezone,
  c.currency,
  p.id AS plan,
  p.name AS plan_name,
  p.monthly_invoice_limit,
  s.billing_interval,
  s.status AS subscription_status,
  s.current_period_start,
  s.current_period_end,
  s.canceled_at,
  CASE s.billing_interval WHEN 'year' THEN p.annual_price_cents ELSE p.monthly_price_cents END
    AS plan_price_cents,
  (SELECT count(*) FROM invoices i
    WHERE i.customer_id = c.id
      AND i.created_at >= date_trunc('month', now())
      AND i.status <> 'draft'
      AND i.deleted_at IS NULL)::int AS invoices_issued_this_month,
  k.brand AS card_brand,
  k.last4 AS card_last4,
  k.exp_month AS card_exp_month,
  k.exp_year AS card_exp_year,
  c.created_at AS customer_since
FROM customers c
JOIN subscriptions s ON s.customer_id = c.id
JOIN plans p ON p.id = s.plan_id
LEFT JOIN cards k ON k.customer_id = c.id;

CREATE VIEW support.billing_invoices AS
SELECT
  c.external_id AS customer_id,
  b.number,
  b.description,
  b.amount_cents,
  b.currency,
  b.status,
  b.period_start,
  b.period_end,
  b.retry_count,
  (SELECT min(r.scheduled_for) FROM payment_retries r
    WHERE r.billing_invoice_id = b.id AND r.status = 'scheduled') AS next_retry_at,
  b.created_at
FROM billing_invoices b
JOIN customers c ON c.id = b.customer_id;

CREATE VIEW support.payments AS
SELECT
  c.external_id AS customer_id,
  b.number AS billing_invoice_number,
  p.amount_cents,
  p.currency,
  p.status,
  p.failure_code,
  r.attempt AS retry_attempt,
  p.card_last4,
  p.attempted_at
FROM payments p
JOIN customers c ON c.id = p.customer_id
JOIN billing_invoices b ON b.id = p.billing_invoice_id
LEFT JOIN payment_retries r ON r.payment_id = p.id;

-- The customer's own invoices from the last 90 days, including drafts and deleted ones
-- (flagged) so support can see what counts toward the monthly limit.
CREATE VIEW support.recent_invoices AS
SELECT
  c.external_id AS customer_id,
  i.number,
  i.client_name,
  i.issue_date,
  i.due_date,
  i.status,
  i.currency,
  i.subtotal_cents,
  i.vat_cents,
  i.total_cents,
  (SELECT count(*) FROM invoice_lines l WHERE l.invoice_id = i.id)::int AS line_count,
  i.created_at,
  i.sent_at,
  i.paid_at,
  i.deleted_at
FROM invoices i
JOIN customers c ON c.id = i.customer_id
WHERE i.created_at >= now() - interval '90 days';

-- Nobody but owners touches public or creates temp objects by default.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
DO $$
BEGIN
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
END
$$;

-- Roles are cluster-wide; create it once even if several databases load this file.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loopback_reader') THEN
    CREATE ROLE loopback_reader LOGIN PASSWORD 'loopback_reader_demo'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    ALTER ROLE loopback_reader SET default_transaction_read_only = on;
    ALTER ROLE loopback_reader SET statement_timeout = '5s';
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO loopback_reader', current_database());
END
$$;
GRANT USAGE ON SCHEMA support TO loopback_reader;
GRANT SELECT ON support.customer_account, support.billing_invoices, support.payments,
  support.recent_invoices TO loopback_reader;
