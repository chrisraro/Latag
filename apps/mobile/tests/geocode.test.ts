import { buildSearchUrl, parseResults, searchPlaces } from "../lib/geocode";

describe("buildSearchUrl", () => {
  test("targets nominatim /search with format=json, limit=5, countrycodes=ph", () => {
    const url = buildSearchUrl("ukay");
    expect(url.startsWith("https://nominatim.openstreetmap.org/search?")).toBe(true);
    expect(url).toContain("q=ukay");
    expect(url).toContain("format=json");
    expect(url).toContain("limit=5");
    expect(url).toContain("countrycodes=ph");
  });

  test("encodes the query", () => {
    expect(buildSearchUrl("SM City Cebu & Annex")).toContain("q=SM%20City%20Cebu%20%26%20Annex");
  });
});

describe("parseResults", () => {
  test("maps display_name/lat/lon rows, shortening name to first 3 comma segments", () => {
    const rows = [
      {
        display_name: "Baguio Night Market, Harrison Road, Baguio, Benguet, Cordillera, 2600, Philippines",
        lat: "16.4093",
        lon: "120.5950",
      },
    ];
    expect(parseResults(rows)).toEqual([
      { name: "Baguio Night Market, Harrison Road, Baguio", lat: 16.4093, lng: 120.595 },
    ]);
  });

  test("keeps short display_names whole", () => {
    const rows = [{ display_name: "Cebu, Philippines", lat: "10.3", lon: "123.9" }];
    expect(parseResults(rows)[0].name).toBe("Cebu, Philippines");
  });

  test("tolerates garbage: non-array, malformed rows, non-numeric coords", () => {
    expect(parseResults(null)).toEqual([]);
    expect(parseResults("nope")).toEqual([]);
    expect(parseResults({ display_name: "x" })).toEqual([]);
    expect(
      parseResults([
        null,
        42,
        { display_name: "No coords" },
        { display_name: "Bad lat", lat: "abc", lon: "120" },
        { lat: "10", lon: "120" },
        { display_name: "Good, Row", lat: "10.5", lon: "121.5" },
      ]),
    ).toEqual([{ name: "Good, Row", lat: 10.5, lng: 121.5 }]);
  });
});

describe("searchPlaces", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  test("fetches the search URL with latag-app User-Agent and parses results", async () => {
    const rows = [{ display_name: "Anonas, Quezon City, Metro Manila, Philippines", lat: "14.62", lon: "121.06" }];
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => rows }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const out = await searchPlaces("anonas");
    expect(out).toEqual([{ name: "Anonas, Quezon City, Metro Manila", lat: 14.62, lng: 121.06 }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(buildSearchUrl("anonas"));
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("latag-app");
  });

  test("network failure resolves to [] (never throws)", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(searchPlaces("cebu")).resolves.toEqual([]);
  });

  test("non-ok response resolves to []", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => [] })) as unknown as typeof fetch;
    await expect(searchPlaces("cebu")).resolves.toEqual([]);
  });

  test("aborts after 6s and resolves to []", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener("abort", () => reject(new Error("aborted")));
        }),
    ) as unknown as typeof fetch;

    const pending = searchPlaces("slow query");
    jest.advanceTimersByTime(6000);
    await expect(pending).resolves.toEqual([]);
  });
});
