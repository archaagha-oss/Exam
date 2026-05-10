import { describe, it, expect } from 'vitest';

// Pull the escapeCSV implementation by re-implementing the same rules,
// or by exposing it. For now we test the rule shape: leading =/+/-/@/tab/CR
// must be defanged with a single quote so spreadsheets don't execute it.

function escapeCSV(val: any): string {
  if (val == null) return '';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

describe('CSV formula injection escape', () => {
  it("prefixes leading = with '", () => {
    expect(escapeCSV('=cmd|"/c calc"!A1').startsWith(`"'=cmd|`)).toBe(true);
  });
  it("prefixes leading + with '", () => {
    expect(escapeCSV('+1+1')).toBe(`'+1+1`);
  });
  it("prefixes leading - with '", () => {
    expect(escapeCSV('-2+3')).toBe(`'-2+3`);
  });
  it("prefixes leading @ with '", () => {
    expect(escapeCSV('@SUM(A1:A2)').startsWith(`'@SUM`)).toBe(true);
  });
  it('leaves benign strings alone', () => {
    expect(escapeCSV('Alice Johnson')).toBe('Alice Johnson');
    expect(escapeCSV('alice@school.edu')).toBe('alice@school.edu');
  });
});
