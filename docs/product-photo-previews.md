# Product photo variants

New inline product photos saved through `saveProductToSupabase` or `updateProductInSupabase` are uploaded as two immutable, content-addressed Storage objects when the browser supports decoding/encoding and a smaller preview can be produced:

- `<sha256>.full-v1.<extension>`: the existing large upload, unchanged by this step (the uploader already compresses it to a 1200px / ~350KiB target).
- `<sha256>.thumb-v1.webp`: at most 400px, WebP, quality 0.72, ~45KiB target; encoder may reduce dimensions further to meet the size target.

The preview is generated once on the uploader's device and uploaded before the large file. The save fails on either upload error; the database receives a versioned full URL only after both uploads succeed. Files use a one-year browser cache. Repeated inline photos within a save upload once. No database migration or additional image requests in the initial JSON payload are required.

`SafeImage preview` derives the matching thumbnail only for the versioned public catalog-assets URL. The catalogue tiles (including gallery slides), marketplace recommendations/favourites, cart, checkout, order thumbnails and merchant stock lists use previews. Product hero and zoom retain the full image. Preview request failure retries the full image; a broken full image retains the established placeholder.

Legacy/remote URLs are left untouched. GIFs preserve animation and use the full file. If the encoder is unavailable, decoding fails, WebP output is unsupported or the preview is not smaller, only the regular full image is stored without a variant marker. QR codes, banners and other non-product persistence paths do not opt into variant generation.

This change applies to new/replaced product uploads. Existing files are neither downloaded nor reprocessed automatically; remote links are not copied. No claim that old catalogue photos became smaller. A separate audited backfill would be needed for those files. The original camera file is not newly retained: the existing uploader's compression policy still applies.

Changing the algorithm should use a new suffix version, preserving old public files. Do not delete old media on image replacement: orders or other saved references may still use them. Failed upload/save can leave an unreferenced file; cleanup needs an independent reference audit.
