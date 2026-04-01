import fs from "fs";

const c = JSON.parse(fs.readFileSync("data/collection.json", "utf-8"));
const allKws = new Set();
c.forEach(o => o.geographicKeywords.forEach(k => allKws.add(k)));

// Read geo-coordinates.ts and extract keys
const content = fs.readFileSync("data/geo-coordinates.ts", "utf-8");
const keys = [...content.matchAll(/['"]([^'"]+)['"]\s*:\s*\{/g)].map(m => m[1]);
console.log("geo-coordinates.ts entries:", keys.length);
const unused = keys.filter(k => !allKws.has(k));
console.log("Entries in geo-coordinates.ts NOT used by any object:", unused.length);
unused.forEach(k => console.log("  UNUSED:", k));

const used = keys.filter(k => allKws.has(k));
console.log("\nUsed entries:", used.length);

// Keywords that exist in objects but not in geo-coordinates.ts AND not in thesaurus
const keySet = new Set(keys);
const inThesaurus = new Set();
c.forEach(o => o.geoKeywordDetails.forEach(d => inThesaurus.add(d.term)));

const fullyUnmapped = [...allKws].filter(k => !keySet.has(k) && !inThesaurus.has(k)).sort();
console.log("\nKeywords with NO source at all (no thesaurus, no coordinates):", fullyUnmapped.length);
fullyUnmapped.forEach(k => console.log("  ORPHAN:", k));

// Keywords in thesaurus but without coords
const inThesaurusNoCoords = [...inThesaurus].filter(k => !keySet.has(k)).sort();
console.log("\nIn thesaurus but NO coordinates:", inThesaurusNoCoords.length);
