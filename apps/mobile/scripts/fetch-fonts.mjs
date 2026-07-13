import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const SRC = "https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf";
mkdirSync("assets/fonts", { recursive: true });
const buf = await (await fetch(SRC)).arrayBuffer();
writeFileSync("assets/fonts/Archivo-VF.ttf", Buffer.from(buf));
const instances = [
  ["Archivo-Regular", "wdth=100 wght=400"], ["Archivo-Medium", "wdth=100 wght=500"],
  ["Archivo-SemiBold", "wdth=100 wght=600"], ["Archivo-Bold", "wdth=100 wght=700"],
  ["ArchivoExpanded-ExtraBold", "wdth=125 wght=800"], ["ArchivoExpanded-Black", "wdth=125 wght=900"],
];
for (const [name, axes] of instances)
  execSync(`uvx --from fonttools fonttools varLib.instancer assets/fonts/Archivo-VF.ttf ${axes} -o assets/fonts/${name}.ttf`, { stdio: "inherit" });
