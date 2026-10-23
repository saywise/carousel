# Saywise Content Studio

A localhost-first React content editor for Saywise Company Spotlight and Job Explainer carousels, static posts, and general content. OpenAI powers research and generation; React and CSS render editable, branded slides deterministically. The official Saywise palette, logos, Sage illustrations, and reference assets are bundled locally.

## Run locally

Requires Node.js 24+ and npm.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open <http://127.0.0.1:3000>. The example configuration uses saved demonstration content and requires no credentials. To use a different port, update both `PORT` and `APP_ORIGIN` in your local `.env`. Existing developers should preserve their own ignored `.env` when pulling changes.

The studio includes carousel/static-post generation, editable text and theme tokens, slide addition, caption generation, content briefs, topic ideas, optional image generation/editing, a SQLite project library, JSON import/export, PNG export, and a ZIP containing all slides as numbered PNGs. Illustrations can be saved in the image library and applied as a separate editable layer on any slide. Text, logos and final layout remain deterministic. Geist Sans and brand assets are bundled locally. Nothing is published automatically.

## Execution modes

Set `GENERATION_MODE` on the **server**, then restart:

| Mode | Text | Images | Authentication |
| --- | --- | --- | --- |
| `demo` | Saved fixtures; prompts are not interpreted | Saved, labeled illustration | None |
| `codex` | Noninteractive local CLI with strict JSON schema | Saved, labeled illustration | Existing `codex login` |
| `openai` | Official SDK, Responses API, strict JSON schema | Official SDK, Image API generation/edit endpoints | Server `OPENAI_API_KEY` |

Local Codex mode requires `NODE_ENV=development` and a loopback `HOST`. Run `codex login` interactively if needed, then set `GENERATION_MODE=codex` and optionally `CODEX_BIN` and `CODEX_MODEL`. `npm run test:codex` makes one live structured-caption request against your CLI account. The installed CLI was verified as `0.162.0-alpha.17.2`, logged in through ChatGPT, with support for `exec`, `--output-schema`, `--output-last-message`, `--json`, `--ephemeral`, and `--ignore-user-config`.

The adapter probes required flags, runs with no shell interpolation in a temporary directory, ignores user provider/MCP configuration, selects OpenAI, uses a read-only sandbox with the shell tool disabled, bounds output/time, and deletes temporary files. It does not read or copy CLI credentials. If unavailable or unsupported, the UI reports the problem and instructs you to set `GENERATION_MODE=demo`. There is no silent text fallback. Do not tunnel, proxy, or publish this development server. Host and Origin checks limit browser access but do not make a local CLI suitable for hosting.

## Shared architecture

```text
React editor → server API → GenerationService → demo | local Codex | OpenAI SDK
                         ↘ shared schemas/prompts ↙
React + CSS + local fonts → deterministic preview / PNG / ZIP
SQLite repository        → editable projects / image library / generation usage
```

- `shared/content.ts`: Zod contracts, editable slide/project models, seven typed generation methods.
- `server/generation/prompts.ts`: shared system and operation prompts.
- `server/generation/service.ts`: mode routing, output validation, normalized errors, usage ledger.
- `server/generation/openai.ts`: production Responses and Image APIs. The official SDK retries transient failures with backoff and Retry-After handling. A complete-operation deadline bounds retry duration.
- `server/generation/codex.ts`: development-only process adapter. Replaced by a rejecting stub in `npm run build`; the build checks for CLI leakage.
- `server/store.ts`: SQLite repository interface. Content and usage schemas do not depend on the CLI. Keep `DATA_DIR` on a persistent volume. Node 24 currently emits an experimental warning for `node:sqlite`.
- `src/Slide.tsx` and `src/styles.css`: deterministic text/theme rendering. AI never renders final branded slides. The preview and all exports use the same component. PNG exports are 1080 × 1350, individually or together in a ZIP.

Images can be edited by uploading a PNG/JPEG/WebP (up to 5 MB) as reference. The server accepts bytes, not arbitrary image URLs. Use photography you have licensed and approved company logo assets. Saved brand-kit demonstration images are explicitly marked.

## Move to production API mode

1. Set `GENERATION_MODE=openai`, `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL`, and `OPENAI_IMAGE_MODEL` in your host's secret/environment settings. Model defaults are configurable examples; confirm your API account has access. ChatGPT/Codex subscription access does not supply production API authentication.
2. Set `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT`, and the exact HTTPS `APP_ORIGIN` of the deployment.
3. Set `STUDIO_USER` and a strong `STUDIO_PASSWORD` of at least 16 characters. The single-workspace application uses HTTP Basic authentication in production. Terminate HTTPS at your reverse proxy and preserve the original Host header. For a multi-user service, replace this guard and add per-user authorization/quotas before opening access.
4. Configure persistent `DATA_DIR` and backups. The included SQLite storage suits one server instance. For horizontally scaled hosting, implement the same `Store` interface with a shared database and use distributed rate limiting.
5. Run `npm test` and `npm run build`, then `npm start`. The production build contains no CLI invocation adapter. The included Dockerfile copies only the built application and production dependencies, with no Codex installation, user home, login, or `.env`.
6. Set `ENABLE_WEB_RESEARCH=true` to enable researched company and job posts.
7. Run `npm run test:openai` in a trusted environment with valid API credentials for one billable text request. Image integration is contract-tested without billing; verify real image access separately if enabling it.

Do not use `VITE_` variables for credentials or place secrets in client code. There is no client provider or model selector. Switching generation infrastructure does not change the editor, content model, rendering, exports, or prompts.

## Research, usage, and limits

`ENABLE_WEB_RESEARCH=true` enables live research for company/job drafts and topic recommendations. Production uses Responses web search with a required tool call; company/job drafts fail if any cited URL is absent from API search metadata. Local Codex probes `--search`, runs with web search enabled and the shell disabled, and requires observed search events plus source links. CLI search events do not expose the complete source metadata available in the API; the UI asks you to review citations. A source-backed angle is not a proven popularity ranking. Company/job generation fails visibly when live research is disabled, except in demo mode, where research placeholders are clearly labeled. Deployment must set this flag explicitly.

The database records input/cached/output tokens when available, image counts, web-search calls, execution mode, model, timestamp, completion/failure, and estimated USD. Usage from completed API responses is retained even if a refusal, incomplete response, or validation failure follows. Requests that fail before returning usage remain unknown. The UI shows the last 500 records; stored history is retained.

Set the optional pricing variables in `.env.example` from your current model prices. Text estimates account for cached tokens. Image estimates use a configurable per-image allowance for the fixed 1024 × 1024, medium-quality output; actual image token billing can differ. Search estimates use a per-call allowance. Missing rates yield **unknown**, not $0. Codex tokens are subscription usage and are not assigned an API dollar estimate. Demo requests cost $0 and do not claim model token usage.

The server limits generation to 10 requests/minute per client and two simultaneous operations. Default SDK retries: two. Default overall deadline: 120 seconds. Public error messages exclude raw SDK/CLI logs, credentials, and local paths. In-memory rate limits reset on restart; use edge quotas for a hosted service. SQLite usage is an application ledger, not the authoritative OpenAI invoice.

## Verification

```sh
npm test             # contracts, SDK requests, retries, refusals, deadlines, research, HTTP boundaries, storage
npm run build        # type checking, client build, server build, CLI-exclusion check
npm run test:codex   # live local CLI test; uses your subscription
npm run test:openai  # live API test; requires credentials and incurs API usage
```

Official references used for implementation: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Codex noninteractive mode](https://developers.openai.com/codex/noninteractive), and [Image generation](https://developers.openai.com/api/docs/guides/image-generation).

## Supplied Saywise brand kit

The original `saywise-brand-kit.zip` is extracted under `public/brand/saywise/`: 127 files across `logo`, `colors`, `icons`, `banners`, and `sage`. Original filenames and bytes are retained. `manifest.json` records each original file's size and SHA-256 checksum. The supplied photography attribution is preserved in `banners/photo/PHOTO-CREDIT.txt`; attribution is retained as supplied, without an independent licensing review.

`shared/brand.ts` is the source of truth for the 12 palette colors, asset references, six canvas themes, and brand context used by both generation modes. Values were transcribed from the kit's palette image and checked against its SVG fills. The studio uses locally bundled Geist Sans and actual SVG logos instead of a retyped wordmark. Purple is used for the primary action, mint and blue for the signature gradient, and Sage's original colors remain intact.

Open **Brand kit** in the sidebar to browse/download logos, illustration variants, banner formats, icons, and the palette. Each slide has a **Brand illustration** selection and **Brand colors** controls. Artwork remains a separate, replaceable layer with editable text; the same renderer and local assets are used for preview, PNG, and ZIP export. Legacy `lime`, `ink`, and `paper` themes map to `mint`, `dark`, and `light` when rendering older saved projects. User-selected artwork is stored in the project and is not delegated to the text generator.

Image Studio saves an individual reference and image prompt for each slide. Quick references include Sage upper-body, full-body, glance, and the palette; the Library exposes all raster brand assets and your saved uploads/generated illustrations. In OpenAI API mode, the selected reference bytes are sent through the image-edit request with the shared brand prompt. When revising an existing illustration, the current image is the first input and the optional visual reference is the second. Apply the result to that slide, then continue prompting; earlier versions remain in the Library. SVG assets can be placed directly and are rasterized before image editing. Users may replace the reference with an upload or choose palette-only generation. In demo/Codex mode, the image result is the original Sage PNG, explicitly labeled as saved demonstration content. No image API access is implied by the subscription. AI-generated images are approximate references; exact brand color and logo rendering is enforced by the deterministic slide renderer.

## Content workflows and slide revisions

**Post type** and **Content format** are independent. Choose Company spotlight, Job explainer, or General idea, then Carousel or Static post.

- Company spotlight: paste a public Saywise job URL. Carousels use five fixed sections: what the company does; product screenshot and three strengths; founders with a blurred photo background; growth, backing and why join; then the exact Saywise job and more opportunities. Research must date growth/funding claims and check current ownership. The company label sits at top left, with no slide numbers, tagline or editorial footer on the graphics. Only the last slide carries the Saywise logo.
- Job explainer: paste the same kind of job URL. The server derives the broader role before researching angles and core skills. For example, “Staff Product Manager, AI” becomes “Product Manager”; seniority and the AI team specialization do not define the explainer. The closing hook retains “Staff Product Manager, AI” and the original listing link. Role skills are not represented as requirements from an unverified listing.
- Static posts condense the same guidelines into one graphic and expand the details in the caption. Carousels use the full sequence.

The original prompt, audience, tone, content type, imported listing metadata, broader role, research notes and source links are retained with the project. Revisions use that saved context even if you change the composer for a new draft. The server adds the exact closing CTA and caption link; slide rewrites retain it. Review source claims and listing availability before publication.

Company slides keep editable headings, body, structured points, theme and image layers. The founders' blur is adjustable. Brex includes original logo, product and founder assets from its official press kit; provenance is recorded in `public/company/brex/README.md` and shown in Library. Other companies show empty image slots until a suitable photo/logo is selected or uploaded; the app never invents real company photography. Existing company drafts can be rebuilt into the five-slide structure using **Rebuild as five slides**, with the previous draft available through undo.

Select a slide and use its **Revision prompt** for text or **Create / tweak this slide’s image** for illustrations. Each slide stores its own prompts, reference and applied image. **My library** includes saved projects, uploaded/generated images and the full official brand kit. Choose **Use reference** for generation guidance or **Use on slide** to place the original. Save project to retain changes; Undo restores the last AI/image change in the current session.

Images are stored separately in SQLite and referenced by local asset IDs, keeping editable project JSON compact. Back up and migrate the entire `DATA_DIR`, including the image library. JSON export contains references, not a self-contained media archive. The same renderer is used for preview, PNG and ZIP export.

`node --import tsx scripts/smoke-research.ts` exercises a live Codex company carousel with public research and a clearly identified test listing URL. This consumes subscription usage. Automated tests also cover required fields, source validation, exact links, static/carousel demo workflows, image persistence and rewrite preservation. See the official [web-search tool guide](https://developers.openai.com/api/docs/guides/tools-web-search) and [Codex search guidance](https://learn.chatgpt.com/docs/web-search).

### Job URL import

For either Company spotlight or Job explainer, paste a URL shaped like `https://saywise.com/j/d0e2ade659aa`. **Read job details** previews the company, exact listing title and broader explainer topic. You can adjust the topic; the original title stays attached to the closing CTA. You may also go straight to **Research & create draft**: it imports the listing automatically. Additional direction is optional.

Import runs on the server without AI credentials. It parses JobPosting JSON-LD when available, otherwise Saywise’s public title/metadata, without executing page scripts. The supplied example was checked and imports Brex / Staff Product Manager, AI / Product Manager. Conservative role-family rules remove seniority and team specializations; unfamiliar titles retain more wording for review. Live research and generation continue through the configured Codex or OpenAI adapter.

Only HTTPS Saywise `/j/…` links are accepted. Redirects must remain on the same public listing; the reader bounds response size and time and briefly caches successful imports. Unavailable, private or changed pages report an error instead of inventing details. Imports require network access; the saved General idea demonstration still works offline. Previously saved projects remain readable. Listing metadata records when it was fetched but does not certify the vacancy is still accepting applications.

Company covers use a transparent company logo above a bold headline, with a separately editable cover visual. The logo slot requires an actual PNG with transparent background pixels (verified on the server), including replacements, imports, saves and exports. Renaming a JPEG, adding an alpha channel to an opaque file, or using a baked-in checkerboard does not qualify. Select an official transparent PNG in Library. PNG transparency is a format check, not a verification of logo ownership or authenticity. Cover photography can still use PNG, JPEG or WebP. Existing Brex drafts use the official product image as their default cover visual; choose a replacement in the editor.

**Export all slides as ZIP** renders every slide at 1080 × 1350 (4:5) using the same React/CSS component as the canvas, waits for fonts and images, then packages `slide-01.png`, `slide-02.png`, etc. Rendering is sequential; a failure produces an error instead of a partial archive. Unzip the download before selecting the images in a social app. Single-slide PNG and editable JSON exports remain available. The ZIP currently preserves the 4:5 layout; it does not automatically reformat for TikTok.

### Job Explainer carousels

Paste a Saywise job URL and select Job explainer. New carousels use five required sections: hook, inside the work (three responsibilities), one researched shift, skills (three observable examples), and the exact linked opportunity. Seniority and specialization stay in the final listing title; the explainer uses the normalized role, which can be overridden before generation. Location/work arrangement are included only when supported by the imported listing.

The same named-section JSON contract is used for local Codex and production OpenAI generation, then converted into the editable slide array. Text revisions preserve section purpose, three-point counts, media, prompts and CTA. Static posts retain their one-slide workflow. Older saved job carousels remain readable and offer “Rebuild as five slides” without overwriting the original project.

Job slides use deterministic React/CSS layouts and official brand colors, with no printed slide numbers, decorative footer or repeated Saywise wordmark. The closing slide has a separate company-logo layer validated as a transparent PNG on selection, project save and export. Every slide supports a Library image/reference and image prompt; demo mode provides clearly labeled saved content without claiming live research. ZIP export uses these same layouts.
