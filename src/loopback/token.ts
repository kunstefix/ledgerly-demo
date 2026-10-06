// The signed customer token the Loopback widget sends with every conversation.
// HS256 with the connection's identity secret; claims sub, email, name; expires in 1 hour.

import { SignJWT } from 'jose';

export interface TokenCustomer {
  externalId: string;
  contactEmail: string;
  contactName: string;
}

export const TOKEN_TTL_SECONDS = 60 * 60;

export async function signCustomerToken(
  customer: TokenCustomer,
  identitySecret: string,
  now: Date,
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ email: customer.contactEmail, name: customer.contactName })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(customer.externalId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + TOKEN_TTL_SECONDS)
    .sign(new TextEncoder().encode(identitySecret));
}
