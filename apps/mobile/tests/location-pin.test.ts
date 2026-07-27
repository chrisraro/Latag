import { resolvePin } from "../lib/geocode";

const MANILA: [number, number] = [120.9842, 14.5995]; // the picker's default viewport

test("a typed name with no camera move returns the name and NO coordinates", () => {
  expect(resolvePin("Naga Ukay Center", false, MANILA)).toEqual({
    name: "Naga Ukay Center",
    lat: null,
    lng: null,
  });
});

test("nothing typed and no camera move pins nothing at all", () => {
  expect(resolvePin("", false, MANILA)).toBeNull();
  expect(resolvePin("   ", false, MANILA)).toBeNull();
});

test("a placed camera returns its centre as lat/lng", () => {
  expect(resolvePin("SM Naga", true, [123.1948, 13.6218])).toEqual({
    name: "SM Naga",
    lat: 13.6218,
    lng: 123.1948,
  });
});

test("a placed camera with no name falls back to the generic label", () => {
  expect(resolvePin("  ", true, [123.1948, 13.6218])).toEqual({
    name: "Pinned location",
    lat: 13.6218,
    lng: 123.1948,
  });
});

test("names are trimmed", () => {
  expect(resolvePin("  Divisoria  ", false, MANILA)?.name).toBe("Divisoria");
});
