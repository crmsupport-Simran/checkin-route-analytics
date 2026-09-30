# Check-In Route Analytics

A zero-budget, static React dashboard for Sales Employee Check-In / Check-Out Excel reports. It parses your report locally in the browser, filters visits, maps chronological employee routes, calculates road distance through OSRM, and exports filtered route data.

## Privacy and cost model

- Excel data is parsed in the browser with SheetJS. It is not posted to an application backend, database, or analytics service.
- The map uses Leaflet and OpenStreetMap tiles. No Google Maps library, key, billing account, or credit card is used.
- When you select an employee, the app sends only the required latitude/longitude sequence to the public OSRM routing server to calculate a road route. Data such as employee names, mobile numbers, dealer data, and Excel rows are never included in that request.
- OSRM is free public infrastructure, so it is suitable for light interactive use, not high-volume batch processing. Route responses are cached in browser memory for the active page session.

## Requirements

- Node.js 18+ (Node 20+ recommended)
- npm

## Run locally

```bash
npm install
npm run dev
```

Open the local address printed by Vite, normally `http://localhost:5173`.

## Production build

```bash
npm run build
npm run preview
```

The deployable static site is generated in `dist/`.

## Expected Excel sheet and columns

The parser prefers a worksheet named `CheckIn Report` and falls back to the first worksheet. It matches headers by name, not column position, and supports the supplied report fields including `Date`, `Sales User Name`, `Emp ID`, `Check In`, `Start Latitude`, `Start Longitude`, `Check Out`, `End Latitude`, `End Longitude`, `Company Name`, dealer fields, remarks, and `Basic Order Value`.

Coordinates are deliberately mapped as:

- Check-in: `Start Latitude`, `Start Longitude`
- Check-out: `End Latitude`, `End Longitude`

Records with missing or invalid GPS are preserved in the table and excluded from route points. Duplicate records are preserved. Visits are always sequenced by Check-In time—not geographic proximity.

## How routing works

After choosing an employee (and ideally a date), the route sequence is:

`visit 1 check-in → visit 1 check-out → visit 2 check-in → visit 2 check-out …`

OSRM receives its coordinates in `longitude,latitude` order and returns road distance in metres, displayed as kilometres. Longer routes are split into safe-sized chunks. If OSRM is unavailable, the application stays usable and labels the route total as **Approx. straight-line distance** using the Haversine formula; it never labels this fallback as driving distance.

## Deploy to GitHub Pages

1. Push this project to a GitHub repository.
2. Install the Pages helper: `npm install -D gh-pages`.
3. In `package.json`, add `"homepage": "https://YOUR_GITHUB_NAME.github.io/YOUR_REPOSITORY"` and a script: `"deploy": "npm run build && gh-pages -d dist"`.
4. If deploying below a repository path, set Vite's `base` in `vite.config.js` to `'/YOUR_REPOSITORY/'`.
5. Run `npm run deploy`, then select **gh-pages** as the Pages source in the repository settings.

## Deploy to Cloudflare Pages

1. Push the repository to GitHub or GitLab.
2. In Cloudflare Pages, create a project from that repository.
3. Select the Vite framework preset, or enter:
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Deploy. No backend variables or API secrets are required.

## Moving to a private routing server later

For higher traffic, deploy your own OSRM instance and replace the public endpoint in `src/services/routingService.js`. The front-end data model, map, and route caching do not need to change.

## Current MVP capabilities

- Excel/CSV upload and client-only parsing
- File, row, employee, and GPS validation summary
- Combined date, employee, employee ID, manager, type, and text search filters
- KPI dashboard, all-employee summary, click-through employee routes
- Numbered green check-in and red check-out Leaflet markers with visit popups
- Chronological route polyline, OSRM road distance, in-memory route cache, and labelled straight-line fallback
- Visit table, oldest/newest display toggle, route animation, CSV export
- Responsive layout for desktop, tablet, and mobile
