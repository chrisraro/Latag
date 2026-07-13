import { orphanUris } from "../lib/media";

test("orphanUris returns files present on disk but absent from db", () => {
  const disk = ["file:///d/latag_media/a.jpg", "file:///d/latag_media/b.jpg", "file:///d/latag_media/c.jpg"];
  const dbRows = ["file:///d/latag_media/b.jpg"];
  expect(orphanUris(disk, dbRows)).toEqual(["file:///d/latag_media/a.jpg", "file:///d/latag_media/c.jpg"]);
});
test("no orphans → empty", () => expect(orphanUris(["file:///x/a.jpg"], ["file:///x/a.jpg"])).toEqual([]));
