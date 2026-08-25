# Heavenly School Performance Dashboard

A responsive school participation dashboard built around the supplied **7-cell / 30-worker structure**.

## Included structure

- Cell 1 — 4 workers
- Cell 2 — 3 workers
- Cell 3 — 5 workers
- Cell 04 — 5 workers
- Cell 05 — 4 workers
- Cell 06 — 4 workers
- Cell 7 — 5 workers
- Total — 30 workers

The actual names supplied are preloaded in the website, Google Sheets backend seed, and Excel template.

## Tracked activities

1. **Weekly Education** — continuous
   - Wednesday 20:30
   - Saturday 09:30
   - Sunday 14:30
2. **Tithe & Offering** — recorded together once per month
3. **Service Attendance** — Wednesday and Sunday
4. **Cleaning Meeting** — Sunday 09:00

## Performance views

The Dashboard and Reports screens support:

- Whole-school performance
- Performance by cell
- Individual worker performance
- Date-range filtering
- Cell and worker filtering
- Weekly trend chart
- Activity/category comparison
- Cell comparison
- Monthly Tithe & Offering performance
- Follow-up list for low participation
- Detailed record history

Performance percentages use recorded, non-excused entries. `Present` counts positively for attendance activities, and `Submitted` counts positively for Tithe & Offering.

## Updating data

Use the four input screens to batch update workers. You can filter to one cell before saving. The **Workers & Cells** screen allows changes to names, cell assignment, and active status.

Data works immediately in browser Local Mode using `localStorage`.

## Export options

- Individual charts can be downloaded as PNG images.
- Reports can be exported as CSV.
- Filtered record history can be exported as CSV or Excel.
- A full multi-sheet Excel workbook can be exported from Settings.
- A filtered Excel workbook can be exported from Reports.
- Full JSON backup / restore is available.
- Excel files exported by this dashboard can be imported again for bulk updates.

The Excel workbook contains:

- Workers
- Education
- Service Attendance
- Cleaning
- Tithe Offering
- Performance Summary

## Connect to Google Sheets

1. Create a new Google Sheet.
2. Open **Extensions → Apps Script**.
3. Replace the default code with all contents of `google-apps-script.gs`.
4. Change `API_KEY` at the top to a long private value.
5. Save the Apps Script project.
6. Deploy it as a **Web app**.
7. Copy the `/exec` Web App URL.
8. In this website open **Settings**.
9. Paste the Web App URL and the same API key.
10. Click **Save & connect**.

The backend creates these tabs automatically: `People`, `Education`, `Service`, `Cleaning`, and `Finance`.

> If you used the older dashboard schema, use a fresh Google Sheet or back up the old sheet first. The new backend uses a different schema.

## Hosting

The project is static HTML/CSS/JavaScript and can be hosted on GitHub Pages, cPanel, Netlify, Cloudflare Pages, or a similar static host.

`Chart.js` and `SheetJS` are loaded from jsDelivr, so internet access is required for charts and Excel import/export.

## Privacy

This dashboard can contain religious attendance and financial-participation information. Keep any connected Google Sheet private and only grant access to authorised users.
