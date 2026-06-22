# Rijksmuseum visual linked-data export

`rijksmuseum-visual-lod.jsonld` is an import bundle for the Suriname Time
Machine database model. It follows the model's source chain:

```text
E22 Rijksmuseum object source
  └─ P128 carries → E36 visual item
       ├─ P138 represents → E25/E26 physical feature, when applicable
       └─ spatialCoverage → E53 Place or an unresolved target-place URI

E13 visual depiction observation
  ├─ P140 assigned attribute to → target gazetteer place
  ├─ P141 assigned → E36 visual item
  ├─ P4 has time-span → E52 year
  └─ prov:hadPrimarySource → E22 Rijksmuseum object source
```

The export includes one E22 source per Rijksmuseum object with an image and a
curated STM gazetteer reference. It records rights metadata for every source;
consumers must only display image pixels when `isPublicDomain` is true.

Regenerate after enriching collection or location data:

```bash
pnpm export:visual-lod
```

The companion report lists image-place links that cannot yet be attached,
because their target place URI is absent from the database-model repository's
current `data/places-gazetteer.jsonld`. Do not create replacement places from
the export automatically: resolve or restore those authority records first.
