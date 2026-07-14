import { summarizeUsage } from "../lib/storage-usage";

describe("summarizeUsage", () => {
  test("empty array -> 0 count, 0 bytes, '0 B'", () => {
    expect(summarizeUsage([])).toEqual({ count: 0, bytes: 0, label: "0 B" });
  });

  test("sub-1024 bytes -> bytes label", () => {
    expect(summarizeUsage([500, 300])).toEqual({ count: 2, bytes: 800, label: "800 B" });
  });

  test("boundary: exactly 1024 bytes rolls over into KB", () => {
    expect(summarizeUsage([1024])).toEqual({ count: 1, bytes: 1024, label: "1 KB" });
  });

  test("KB range with whole number -> no trailing .0", () => {
    const bytes = 48 * 1024;
    expect(summarizeUsage([bytes])).toEqual({ count: 1, bytes, label: "48 KB" });
  });

  test("MB range with whole number -> no trailing .0", () => {
    const bytes = 312 * 1024 * 1024;
    expect(summarizeUsage([bytes])).toEqual({ count: 1, bytes, label: "312 MB" });
  });

  test("GB range with a fractional remainder -> 1 decimal max", () => {
    const bytes = 1.5 * 1024 * 1024 * 1024;
    expect(summarizeUsage([bytes])).toEqual({ count: 1, bytes, label: "1.5 GB" });
  });

  test("boundary: exactly 1024^3 rolls over into GB", () => {
    const bytes = 1024 * 1024 * 1024;
    expect(summarizeUsage([bytes])).toEqual({ count: 1, bytes, label: "1 GB" });
  });

  test("count is the number of entries, bytes is the sum, across a mixed set", () => {
    const sizes = [100, 200, 300];
    const result = summarizeUsage(sizes);
    expect(result.count).toBe(3);
    expect(result.bytes).toBe(600);
  });
});
