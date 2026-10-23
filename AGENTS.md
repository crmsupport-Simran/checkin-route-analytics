# Project maintenance instructions

## Keep the published SOP current

- The maintained dashboard operating procedure is `docs/Check-In_Route_Analytics_Dashboard_SOP.docx`.
- The website serves the same document from `public/Check-In_Route_Analytics_Dashboard_SOP.docx`. Keep the two files byte-for-byte identical so the in-app **Download Dashboard SOP** link always matches the maintained copy.
- Whenever a change affects a dashboard, report, business rule, source field, date bucket, upload, calculation, export, storage behavior, or user workflow, update the SOP in the same change. Document the actual implemented behavior and any changed rule; do not silently change unrelated KPI scopes.
- Re-render the DOCX and visually inspect every page after editing. Keep the title, revision date, dashboard inventory, formula summary, designation lists, and reconciliation guidance accurate.
- The app footer link uses `import.meta.env.BASE_URL`; preserve that base-path behavior for GitHub Pages deployment.
