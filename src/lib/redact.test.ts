import { describe, expect, it } from 'vitest';
import { applyRedaction, detectWithRules, locate, mergeFindings, redactWithRules, rehydrate, rehydrateDeep } from './redact';
import { SAMPLES } from './samples';

describe('Privacy Shield rules', () => {
  it('hides emails, phones, labelled IDs, DOB, addresses and salutation names', () => {
    const { redacted, vault } = redactWithRules(SAMPLES[0].text);
    for (const secret of ['maria.lopez81@example.com', '(559) 555-0148', 'RGH-55821934', 'BVX449201877', '04/17/1981', '1427 Juniper Street, Apt 3B, Fresno, CA 93721', 'Maria Elena Lopez']) {
      expect(redacted).not.toContain(secret);
    }
    expect(Object.keys(vault).length).toBeGreaterThan(5);
  });

  it('keeps money, dates and organisations so the explanation still works', () => {
    const { redacted } = redactWithRules(SAMPLES[0].text);
    for (const keep of ['$3,077.14', 'December 3, 2026', 'Riverside General', 'BlueValley PPO', '400%']) {
      expect(redacted).toContain(keep);
    }
  });

  it('hides names, case numbers and addresses in a benefits letter', () => {
    const { redacted } = redactWithRules(SAMPLES[2].text);
    for (const secret of ['Ahmad Rahimi', '7730-418-2296', 'SN-00482117', '2210 Lakeview Avenue, Apt 7, Columbus, OH 43215']) {
      expect(redacted).not.toContain(secret);
    }
    expect(redacted).toContain('November 20, 2026');
    expect(redacted).toContain('Case number: [ID_');
  });

  it('only flags card numbers that pass the Luhn check', () => {
    expect(detectWithRules('card 4111 1111 1111 1111').some((f) => f.type === 'CARD')).toBe(true);
    expect(detectWithRules('card 4111 1111 1111 1112').some((f) => f.type === 'CARD')).toBe(false);
  });

  it('uses one placeholder per distinct value and round-trips through rehydrate', () => {
    const text = 'Dear Ana Silva, your file. Contact Ana Silva at ana@x.org.';
    const r = applyRedaction(text, mergeFindings(detectWithRules(text), locate(text, [{ text: 'Ana Silva', type: 'NAME' }])));
    expect(r.redacted).toBe('Dear [NAME_1], your file. Contact [NAME_1] at [EMAIL_1].');
    expect(rehydrate(r.redacted, r.vault)).toBe(text);
    expect(rehydrateDeep({ a: ['[NAME_1]'] }, r.vault)).toEqual({ a: ['Ana Silva'] });
  });

  it('on-device findings hide first names used alone', () => {
    const text = 'Patient: Grace Kim. Hi Grace, see you soon.';
    const r = applyRedaction(text, mergeFindings(locate(text, [{ text: 'Grace Kim', type: 'person name' }])));
    expect(r.redacted).not.toMatch(/Grace/);
  });
});

describe('Privacy Shield precision', () => {
  it('keeps departments and toll-free business numbers', () => {
    const { redacted } = redactWithRules('To pay, call Patient Financial Services at 1-800-555-0199. Dear Valued Customer, call (559) 555-0148.');
    expect(redacted).toContain('Patient Financial Services');
    expect(redacted).toContain('1-800-555-0199');
    expect(redacted).not.toContain('(559) 555-0148');
  });
});

describe('Gemini Nano findings are sanity-checked', () => {
  const bill = SAMPLES[0].text;
  it('a deadline Nano mistakes for a date of birth is kept', () => {
    const f = locate(bill, [{ text: 'December 3, 2026', type: 'date of birth' }]);
    expect(f).toHaveLength(0);
  });
  it('a real, labelled date of birth is still hidden', () => {
    const f = locate(bill, [{ text: '04/17/1981', type: 'date of birth' }]);
    expect(f.length).toBeGreaterThan(0);
  });
  it('money, organisations, toll-free numbers and dates-as-IDs are kept', () => {
    const f = locate(bill, [
      { text: '$3,077.14', type: 'id number' },
      { text: 'Riverside General Hospital', type: 'person name' },
      { text: '1-800-555-0199', type: 'phone' },
      { text: 'November 3, 2026', type: 'id number' },
      { text: 'BlueValley PPO', type: 'id number' },
      { text: 'RIVERSIDE GENERAL HOSPITAL', type: 'home address' },
    ]);
    expect(f).toHaveLength(0);
  });
  it('short service numbers like TTY 711 are kept', () => {
    expect(SAMPLES[2].text).toContain('711');
    expect(locate(SAMPLES[2].text, [{ text: '711', type: 'phone' }])).toHaveLength(0);
  });
});
