import { describe, expect, it } from 'vitest';
import { DEVICES } from '../helpers/mock-nbi.js';
import { MASK, isSecretKey, redactData, redactText } from '../../src/redact.js';

describe('redact', () => {
  it('detects secret key names', () => {
    for (const k of ['Password', 'KeyPassphrase', 'PreSharedKey', 'ConnectionRequestPassword', 'SNMPCommunity', 'X_ApiToken', 'key']) expect(isSecretKey(k), k).toBe(true);
    for (const k of ['SSID', 'Username', 'SerialNumber', 'Enable', 'KeyIndex2x']) expect(isSecretKey(k), k).toBe(false);
  });

  it('masks _value of secret parameter nodes and keeps the rest', () => {
    const out = JSON.stringify(redactData(DEVICES[0]));
    expect(out).not.toContain('super-secret-wifi');
    expect(out).not.toContain('pppoe-pass-123');
    expect(out).not.toContain('psk-should-hide');
    expect(out).toContain('Rumah-Budi');
    expect(out).toContain('budi.s@isp.example');
    expect(out).toContain('xsd:string');
    expect(out).toContain(MASK);
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(DEVICES[0]);
    redactData(DEVICES[0]);
    expect(JSON.stringify(DEVICES[0])).toBe(before);
  });

  it('masks assignments in free text and exact known values', () => {
    expect(redactText('const password = "hunter2"; x')).not.toContain('hunter2');
    expect(redactText('community: public123 ok')).not.toContain('public123');
    expect(redactText('Authorization: Bearer abcdefghij123456')).not.toContain('abcdefghij');
    expect(redactText('leak S3CRETVALUE here', ['S3CRETVALUE'])).toBe(`leak ${MASK} here`);
  });

  it('survives deep structures', () => {
    let o: Record<string, unknown> = { a: 1 };
    for (let i = 0; i < 200; i++) o = { n: o };
    expect(() => redactData(o)).not.toThrow();
  });
});
