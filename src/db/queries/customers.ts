import type { Db } from '../pool.js';

export interface Customer {
  id: number;
  externalId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  country: string;
  timezone: string;
  currency: 'EUR' | 'USD';
  defaultVatRateBps: number;
}

export interface CustomerListItem extends Customer {
  planName: string;
  subscriptionStatus: string;
}

const COLUMNS = `
  c.id, c.external_id AS "externalId", c.company_name AS "companyName",
  c.contact_name AS "contactName", c.contact_email AS "contactEmail", c.country,
  c.timezone, c.currency, c.default_vat_rate_bps AS "defaultVatRateBps"`;

export async function listCustomers(db: Db): Promise<CustomerListItem[]> {
  const { rows } = await db.query<CustomerListItem>(
    `SELECT ${COLUMNS}, p.name AS "planName", s.status AS "subscriptionStatus"
       FROM customers c
       JOIN subscriptions s ON s.customer_id = c.id
       JOIN plans p ON p.id = s.plan_id
      ORDER BY c.company_name`,
  );
  return rows;
}

export async function getCustomerByExternalId(
  db: Db,
  externalId: string,
): Promise<Customer | null> {
  const { rows } = await db.query<Customer>(
    `SELECT ${COLUMNS} FROM customers c WHERE c.external_id = $1`,
    [externalId],
  );
  return rows[0] ?? null;
}
