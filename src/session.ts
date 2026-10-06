// "Sign in as": a signed cookie holding the customer's external id. No passwords; this
// is a demo with fake data.

import type { FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { getCustomerByExternalId, type Customer } from './db/queries/customers.js';

export const SESSION_COOKIE = 'ledgerly_session';
const WEEK_SECONDS = 7 * 24 * 60 * 60;

declare module 'fastify' {
  interface FastifyRequest {
    customer: Customer | null;
  }
}

export function setSession(reply: FastifyReply, externalId: string): void {
  reply.setCookie(SESSION_COOKIE, externalId, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: WEEK_SECONDS,
  });
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Loads the signed-in customer, if any, onto `request.customer`. */
export function loadSession(pool: pg.Pool) {
  return async (request: FastifyRequest): Promise<void> => {
    request.customer = null;
    const cookie = request.cookies[SESSION_COOKIE];
    if (!cookie) return;
    const unsigned = request.unsignCookie(cookie);
    if (!unsigned.valid || !unsigned.value) return;
    request.customer = await getCustomerByExternalId(pool, unsigned.value);
  };
}

/** Redirects to the sign-in page when nobody is signed in. */
export async function requireCustomer(request: FastifyRequest, reply: FastifyReply) {
  if (!request.customer) return reply.redirect('/');
}

export function signedInCustomer(request: FastifyRequest): Customer {
  if (!request.customer) throw new Error('requireCustomer must run first');
  return request.customer;
}
