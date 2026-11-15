import { describe, expect, it } from 'vitest';
import { extractDates } from './dates';
import { SAMPLES } from './samples';

describe('extractDates (deadline guard)', () => {
  it('reads the formats used in letters', () => {
    const d = extractDates('Due December 3, 2026. Sent 11/06/2026. Effective 1 January 2027. ISO 2027-02-04. Nov. 20, 2026');
    expect([...d].sort()).toEqual(['2026-11-06', '2026-11-20', '2026-12-03', '2027-01-01', '2027-02-04']);
  });
  it('finds the real deadlines in the benefits letter and not invented ones', () => {
    const d = extractDates(SAMPLES[2].text);
    expect(d.has('2026-11-20')).toBe(true);
    expect(d.has('2026-11-30')).toBe(true);
    expect(d.has('2026-12-20')).toBe(false); // the date Gemini Nano invented in testing
  });
  it('ignores impossible dates', () => {
    expect(extractDates('February 30, 2026 and 13/45/2026').size).toBe(0);
  });
});
