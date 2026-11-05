# CBD Ventures AI Assistance

A mobile-first student guide built by upgrading the original **CBDventures Assistant** Node.js project. The public-facing app name remains **CBD Ventures AI Assistance**. The app serves students at **Richfield Pretoria Campus, 291 Helen Joseph Street, Pretoria** and includes a searchable directory, photographed student picks, walking directions, budget conversations, offline fallbacks, and optional AI and map providers.

## Project status

The app runs with **Node.js 20+ and no third-party npm dependencies**. It works without paid APIs: the local directory and built-in student chatbot stay available without credentials. Student-uploaded photos live under `public/images/` and load without a photo API. The directory also includes publicly listed salon and public transport leads flagged for location verification, so all nine category filters have usable entries or clear map-listed alternatives.

Directory results are split into:

- **Mapped nearby:** Records with valid latitude/longitude **at or inside 1,000 m straight-line** from the approximate campus pin. Sorted from closest to farthest. The directory validates the radius on every load.
- **Student picks awaiting verification:** Real submitted names, storefront photos, and addresses which have **not yet been independently geocoded**. These are visible and searchable but are **not** described as inside the 1 km radius. This preserves student submissions without inventing precise positions.

All walking directions use this starting address, **even when a student accesses the site from somewhere else**: `291 Helen Joseph Street, Pretoria Central, Pretoria, South Africa`. For known geocoded locations, Google Maps receives destination coordinates. For unverified entries it receives the submitted address (or a name search if the address is incomplete). Google Maps is an external service; verify its resolved destination before travelling.

**Address/photo discrepancies:** The photo of Top Class Fast Foods shows **287 Pretorius Street**, although an earlier submitted address was 295; public listing also supports 287. Asian Delight Shawarma shows **223 Central Street**, while an earlier submitted address was 278; a public business listing supports 223. Both discrepancies appear in the app. The photo reads **Thuba Rush KJ** (original submitted name was “Thaba Rush KJ”) and **Quick Bake** (submitted “Quick Bak”). Original spellings are searchable aliases.

## Start locally

```bash
npm start
```

Open `http://localhost:3000`. Optional: copy `.env.example` to `.env` to choose providers. The built-in Node server loads `.env` itself, without dotenv.

```bash
npm test
npm run check
```

## Environment configuration

| Variable | Required? | Purpose |
|---|---|---|
| `PORT` | No | Node HTTP port; Render sets this automatically. Default 3000. |
| `NODE_ENV` | No | Environment label. |
| `DIRECTORY_PROVIDER` | No | `seed` (default, works without internet), `osm` (Overpass live search), `google` (Google Places Nearby Search), or `auto` (Google if configured, otherwise OSM). Live search can fail or time out; seed locations remain available. |
| `AI_PROVIDER` | No | `none` (default, built-in guide), `openai`, `openai-compatible`, `anthropic`, `gemini` or `ollama`. |
| `AI_MODEL` | For a custom model | Model ID appropriate for your provider. |
| `AI_BASE_URL` | Custom OpenAI-compatible / Ollama | Base endpoint including `/v1`, e.g. `https://api.openai.com/v1`. |
| `OPENAI_API_KEY` | When using OpenAI | Private, server-side OpenAI key. |
| `ANTHROPIC_API_KEY` | When using Anthropic | Private, server-side Anthropic key. |
| `GEMINI_API_KEY` | When using Gemini | Private, server-side Gemini key. |
| `AI_API_KEY` | Optional alternative | Generic provider key for supported non-Ollama providers. |
| `GOOGLE_PLACES_API_KEY` | For Google directory / Places Photos | Google Places API (New) key. Activate API and billing as required by Google. |
| `GOOGLE_STREET_VIEW_API_KEY` | For Street View images | Server-side Street View Static API key, with required API permissions and billing. |
| `PHOTO_MODE` | No | `auto` (default), `streetview`, or `off`. Does not affect your seven bundled storefront photos. |
| `CAMPUS_LAT` | No | Override approximate latitude of campus map reference point, default `-25.746467`. |
| `CAMPUS_LNG` | No | Override approximate longitude of campus map reference point, default `28.19252`. |

**No API key is required for the delivered build.** Do not commit real secrets. The server never sends keys to the browser. `/api/config` returns only enabled flags and provider names. Remote AI and photo calls happen on the server. Keys in Render should go into the Environment area as secret values.

Sample server configuration for OpenAI: set `AI_PROVIDER=openai`, `OPENAI_API_KEY=...`, `AI_MODEL=gpt-4o-mini`. For Anthropic set `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=...`. For Gemini set `AI_PROVIDER=gemini`, `GEMINI_API_KEY=...`. For a local Ollama server use `AI_PROVIDER=ollama` and `AI_BASE_URL=http://localhost:11434/v1` (not suitable as-is on public Render because the Ollama server must be accessible from Render). For map discovery set `DIRECTORY_PROVIDER=osm` or `google` with its API key.

## Prices and student-budget answers

The project has no verified live menus, opening hours or special prices. A user can ask “What can I buy with R50?”, “What are the prices at Honchos?”, “Budget R30 for lunch”, or “Can I get a meal under R100?”. The **built-in guide always distinguishes hypothetical planning amounts from real shop prices**. Example budget numbers are not claims about a store. AI instructions also forbid presenting sample prices as facts. Actual prices must be checked with a seller.

## Add or update places

Edit `data/places.json`. No bot source change is needed. Every entry supports:

```json
{
  "id":"student:my-place",
  "name":"My Place",
  "category":"food",
  "address":"123 Example Street, Pretoria Central",
  "lat":-25.7461,
  "lng":28.1932,
  "description":"Short factual description",
  "image":"/images/my-place.jpg",
  "sourceLabel":"Directly verified storefront",
  "verificationNote":"Optional important caveat",
  "aliases":["An alternative name"]
}
```

Valid categories: `food`, `groceries`, `health`, `printing`, `study`, `banking`, `grooming`, `transport`, `fun`.

Only add `lat` and `lng` when you have actually confirmed the coordinate. Coordinates outside the 1,000 m radius are excluded from nearby results; do not add invented points to force inclusion. Omit coordinates for unverified submissions: they remain in **Student picks** with their own photo and a destination-search directions link. Put a storefront JPEG in `public/images/` and refer to it as `/images/name.jpg`.

If you have more precise campus entrance coordinates, supply them using `CAMPUS_LAT` and `CAMPUS_LNG`. The current campus pin is sourced from a public business directory and is **approximate**.

## API routes

| Route | Purpose |
|---|---|
| `GET /` | Responsive web app |
| `GET /api/health` | Render-friendly health endpoint |
| `GET /api/config` | Public non-secret provider flags |
| `GET /api/places` | `{ places, pending, campus, radiusMeters, categories, provider, warning }` |
| `GET /api/places?category=food&q=honchos` | Category and name/address filtering |
| `POST /api/chat` | `{ "messages": [{"role":"user","content":"What can R50 buy?"}] }` |
| `GET /api/photo?id=google:...` | Optional server-side Google photo/Street View proxy for recent mapped results |

The app applies request size checks, per-IP basic rate limits, static-file path protections, API timeouts, provider fallback handling, and no secret exposure. Client-side text is rendered without unsafe HTML interpolation.

## Render deployment

`render.yaml` defines the web service, Node runtime, free-plan request, build/start commands, and `/api/health` check. Render availability/plan options are controlled by Render, so adjust `plan` if your account does not offer a free instance.

1. Push the **contents of this project folder** to the GitHub repository connected to Render (not the ZIP itself).
2. Connect the repository as a Render Web Service or deploy using the included Render Blueprint.
3. Build command: `npm install --omit=dev`; start command: `npm start`; health check: `/api/health`.
4. For the dependable no-key version, use `DIRECTORY_PROVIDER=seed` and `AI_PROVIDER=none`. Add API keys only through the Render service environment, never to GitHub.
5. Deploy and confirm `/api/health` says `ok: true`; open `/` to browse and chat.

When the existing Render service was originally created for CBDventures, keep using that connected repository and replace its project files with the new ones, including `server.js`, `public/`, `src/`, `data/`, `package.json`, `render.yaml` and `README.md`. Render redeploys on the configured branch when new commits are pushed; this ZIP does **not** update the live service automatically.

## Data and image credits

The **seven distinct storefront photos** were uploaded by the project owner. A duplicate Four Four Two photo was not stored twice. The photo is documentation of a storefront when taken, **not** verification of live opening, ownership or prices. Other business listings and the campus reference coordinates may change. The directory prioritizes real coordinates and labels anything unverified.

Public informational references include [Richfield's official Pretoria campus page](https://www.richfield.ac.za/campuses/pretoria-campus), [Top Class Fast Foods public listing](https://restaurantguru.com/Top-Class-Fast-Foods-Pretoria), and public location/directory sources noted individually in `data/places.json`.
