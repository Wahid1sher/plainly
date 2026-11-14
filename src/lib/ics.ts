import type { ActionItem } from './prompts';

function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/** Builds an .ics calendar file with an all-day event and a 3-day reminder for each deadline. */
export function buildICS(title: string, actions: ActionItem[]): string | null {
  const dated = actions.filter((a) => a.deadline);
  if (!dated.length) return null;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const events = dated.map((a, i) => {
    const d = a.deadline.replace(/-/g, '');
    const next = new Date(a.deadline + 'T12:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    const end = next.toISOString().slice(0, 10).replace(/-/g, '');
    return [
      'BEGIN:VEVENT',
      `UID:${stamp}-${i}@plainly.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${esc(a.task)}`,
      `DESCRIPTION:${esc(`${a.why}\n\nFrom: ${title} (Plainly)`)}`,
      'BEGIN:VALARM',
      'TRIGGER:-P3D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(a.task)}`,
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Plainly//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n');
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
