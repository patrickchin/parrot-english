# R2 Background Media

## Purpose

Lesson backgrounds are delivered from Cloudflare R2 so generated image history
does not inflate the Git repository or Worker static-asset bundle. The
repository owns background IDs, alt text, and versioned delivery URLs. R2 owns
the image bytes and generation records.

This runbook covers backgrounds only. Character sprites and saved lesson audio
remain under `public/assets`.

## Architecture

Use two R2 buckets:

| Bucket | Access | Contents |
| --- | --- | --- |
| `parrot-english-media` | Public custom domain | Approved 2048x1152 WebPs |
| `parrot-english-art-source` | Private | Original generations and prompt JSON |

The browser requests approved backgrounds directly from the public media
domain. The application Worker does not need an R2 binding and does not proxy
background requests.

Public keys follow this immutable layout:

```text
backgrounds/<background-id>/v<version>/landscape.webp
```

Private source keys use the same prefix:

```text
backgrounds/<background-id>/v<version>/original.png
backgrounds/<background-id>/v<version>/prompt.json
```

Never overwrite an existing version. Increment the version and update the
catalog URL instead.

## One-Time Cloudflare Setup

These steps change external Cloudflare state and should be run deliberately by
an authorized account owner:

```bash
npx wrangler login
npx wrangler r2 bucket create parrot-english-media
npx wrangler r2 bucket create parrot-english-art-source
```

In the Cloudflare dashboard:

1. Keep `parrot-english-art-source` private. Do not enable `r2.dev` or connect a
   domain to it.
2. Connect `parrot-english-media` to the Cloudflare-managed hostname
   `media.parrotbook.com`.
3. Do not use the public `r2.dev` development URL for production delivery.
4. Enable cache rules and Smart Tiered Cache for the media hostname.

The publisher sets this object metadata on approved WebPs:

```text
Content-Type: image/webp
Cache-Control: public, max-age=31536000, immutable
```

Regular cross-origin `<img>` display does not require a bucket CORS policy.
Add an allowlist later only if browser code needs to fetch image bytes or draw
them to a canvas.

## Environment

Export the non-secret deployment values in the shell that runs the publisher:

```bash
export PARROT_MEDIA_ORIGIN=https://media.parrotbook.com
export PARROT_MEDIA_PUBLIC_BUCKET=parrot-english-media
export PARROT_MEDIA_SOURCE_BUCKET=parrot-english-art-source
```

Wrangler authentication remains outside Git. Never add an R2 API token or
Cloudflare credential to a manifest or catalog file.

The publisher invokes the repository's Wrangler dependency in npm offline mode,
so it will fail clearly rather than downloading a missing CLI. Run the normal
project dependency installation before publishing.

## Staging Layout

Stage each approved candidate under the already-gitignored
`tmp/imagegen/backgrounds` directory:

```text
tmp/imagegen/backgrounds/playground-day/original.png
tmp/imagegen/backgrounds/playground-day/landscape.webp
tmp/imagegen/backgrounds/playground-day/prompt.json
tmp/imagegen/backgrounds/publish.json
```

The final WebP must be exactly 2048x1152. The prompt record must be valid JSON
with a non-empty `prompt` field:

```json
{
  "prompt": "Create a sunny preschool playground background."
}
```

The publish manifest uses repository-relative staging paths:

```json
{
  "schemaVersion": 1,
  "assets": [
    {
      "id": "playground-day",
      "alt": "A sunny playground with a swing and slide",
      "version": 1,
      "sourceFile": "tmp/imagegen/backgrounds/playground-day/original.png",
      "promptFile": "tmp/imagegen/backgrounds/playground-day/prompt.json",
      "finalFile": "tmp/imagegen/backgrounds/playground-day/landscape.webp"
    }
  ]
}
```

Asset IDs must be lowercase kebab-case. The publisher rejects absolute paths,
directory traversal, unsupported extensions, malformed prompts, empty sources,
and incorrectly sized final images.

## Dry Run

Publishing is a dry run unless `--apply` is present:

```bash
npm run publish:backgrounds -- \
  --manifest tmp/imagegen/backgrounds/publish.json
```

The dry run reads and validates every local file, calculates the private and
public object keys, and prints the catalog entries. It does not run Wrangler or
make a network request.

## Publish

After reviewing the dry-run output:

```bash
npm run publish:backgrounds -- \
  --manifest tmp/imagegen/backgrounds/publish.json \
  --apply
```

Before writing anything, the publisher checks every proposed key directly in
R2. If any key exists, the entire publish stops and asks for a new version. It
then uploads private sources first and the public WebP last. Finally, it sends a
HEAD request to each delivery URL and requires:

- HTTP success;
- `Content-Type: image/webp`;
- a positive `Content-Length`;
- at least one year of immutable caching.

Copy the emitted catalog entries into `content/catalogs/backgrounds.json` only
after publishing and verification succeed.

## Catalog Verification

Run the non-mutating verifier after any background catalog change:

```bash
npm run verify:backgrounds
```

Remote paths are requested and checked. Repository-local paths are still
reported as skipped so older branches remain diagnosable, but the main catalog
must contain only versioned `media.parrotbook.com` URLs.

Do not put this network check in the default unit-test suite. Run it explicitly
during media publishing and deployment verification.

## Publishing Order

1. Generate and review candidates locally.
2. Publish the approved private source records and public delivery WebPs.
3. Add the emitted catalog entries only after remote verification succeeds.
4. Run focused tests, `npm run build`, `npm run test:browser`, and
   `npm run verify:backgrounds`.
5. Deploy the catalog change while leaving previous R2 versions available for
   rollback.

Always upload before deploying a catalog reference. Keep previous R2 versions
available so rollback requires only restoring the earlier catalog URL.
