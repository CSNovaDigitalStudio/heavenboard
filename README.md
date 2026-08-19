# Heavenly Participation Dashboard

A bright, heavenly-themed participation tracker for a 30-person workforce. The supplied background image is built directly into the design.

## What is included

- `index.html` — page structure
- `styles.css` — full responsive heavenly design
- `app.js` — data entry, filters, calculations, charts, search, local backups, Google Sheets sync
- `google-apps-script.gs` — Google Sheets database/API backend
- `assets/heavenly-background.jpg` — supplied image used as the site background
- `database-template.xlsx` — optional Excel workbook with matching database tabs

## Tracked activities

- **Education:** Wednesday, Saturday, Sunday every week
- **Cleaning meeting:** Wednesday and Sunday every week
- **Evangelism:** once per week
- **Tithe:** once per month
- **Group fees:** once per month

## Fastest way to test it

Open `index.html` in a browser. The site works immediately in **Local Mode** and saves data in that browser using localStorage. Rename the 30 placeholder workers under **Workers**.

For best results, serve the folder using a local/static web server instead of opening it as `file://`. It can be hosted on GitHub Pages, cPanel, Netlify or another static host.

## Connect to Google Sheets

1. Create a new Google Sheet.
2. In the Sheet, open **Extensions → Apps Script**.
3. Delete the default code and paste all contents of `google-apps-script.gs`.
4. At the top of the script, change:

   `const API_KEY = 'CHANGE-THIS-TO-A-LONG-PRIVATE-KEY';`

   Use a long random private key.
5. Save the Apps Script project.
6. Choose **Deploy → New deployment → Web app**.
7. Choose the access level appropriate for your Google account/organisation and deploy.
8. Copy the `/exec` Web App URL.
9. Open the website → **Settings** → paste the Web App URL and the same API key → **Save & connect**.
10. On first connection, the backend automatically creates these Sheet tabs: `People`, `Education`, `Cleaning`, `Evangelism`, `Finance`.

## Privacy note

This tracker may contain religious participation and financial contribution information. Keep the Google Sheet private, treat the Apps Script URL and API key as confidential, and only give access to authorised users.

## Dashboard features

- Date range, group and worker filtering
- Overall participation KPI
- Education, cleaning and evangelism rates
- Tithe and group-fee completion rates
- 8-week education trend chart
- Participation mix chart
- Top worker participation chart
- Monthly finance compliance chart
- Follow-up table for lower participation
- Searchable all-records history
- Delete records
- JSON backup/restore
- CSV export for Excel
- Responsive mobile and desktop layout

## Recommended workflow

1. Rename all 30 workers and set groups.
2. On each Wednesday/Saturday/Sunday, open the relevant activity page and batch-mark the roster.
3. Once per week, record evangelism.
4. Once per month, record tithe and group fees.
5. Use Dashboard filters to review a specific week, month, group or worker.

