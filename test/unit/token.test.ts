import { decodeProtectedHeader, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { signCustomerToken } from '../../src/loopback/token.js';

const secret = 'test-identity-secret';
const customer = {
  externalId: 'cus_maple',
  contactEmail: 'owner@maple.example',
  contactName: 'Avery Maple',
};

describe('customer token', () => {
  it('is HS256 with sub, email, name and a one hour expiry', async () => {
    const now = new Date();
    const token = await signCustomerToken(customer, secret, now);

    expect(decodeProtectedHeader(token).alg).toBe('HS256');
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
    });
    expect(payload.sub).toBe('cus_maple');
    expect(payload.email).toBe('owner@maple.example');
    expect(payload.name).toBe('Avery Maple');
    expect(payload.exp! - payload.iat!).toBe(3600);
    expect(payload.iat).toBe(Math.floor(now.getTime() / 1000));
  });

  it('does not verify with another secret', async () => {
    const token = await signCustomerToken(customer, secret, new Date());
    await expect(jwtVerify(token, new TextEncoder().encode('other-secret'))).rejects.toThrow();
  });
});
