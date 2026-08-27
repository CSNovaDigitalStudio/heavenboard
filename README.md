# MOT Theology Performance Dashboard — Secure Shared Version

This build is designed for **GitHub Pages + Google Sheets + Google Apps Script**.

The Google Apps Script URL is already configured in `app.js`:

`https://script.google.com/macros/s/AKfycby5p_eTx-p2P_c8Ah44bYvYeWn07palDn1Nj7Cf2jUKbK_tCDeQ8x0CDTBwIlyfTLtS8w/exec`

Users do **not** enter this URL and do **not** receive an API key. They only sign in with a username and password created by an administrator.

## Important: update your existing Apps Script deployment first

1. Open the Google Sheet currently attached to your dashboard.
2. Go to **Extensions → Apps Script**.
3. Replace the old Apps Script code with the complete contents of `google-apps-script.gs` from this package.
4. Click **Deploy → Manage deployments**.
5. Edit your **existing Web app deployment**.
6. Under Version choose **New version**, then deploy it.
7. Keep the existing deployment instead of making a different deployment. This preserves the `/exec` URL already configured in the website.
8. Ensure the Web app still executes as you and is accessible to the people who need to use the dashboard.

## Pre-built administrator login

The backend automatically creates one administrator account the first time it runs:

- **Username:** `admin`
- **Password:** `Heavenly@2026`

There is no first-time setup screen and no setup code. Sign in with the account above, then change the administrator password under **Settings → Security**.

## Creating logins for workers

Sign in as Administrator and open:

**Settings → Login accounts & roles**

You can create:

- **Administrator** — whole-Theology access, editing, user management, imports and backups.
- **Cell leader** — receives only the people and records in the assigned cell and can update that cell.
- **Worker** — receives only their own linked performance data and has view-only access.

A worker only needs the GitHub Pages website URL plus their username and password.

## What is stored where

- GitHub Pages: HTML, CSS, JavaScript and images.
- Google Apps Script: authentication and permission enforcement.
- Google Sheets: workers, participation records and hashed login credentials.
- The browser keeps only a temporary local copy of the currently signed-in user's permitted data. It is cleared on sign-out.

Passwords are not stored as plain text in the Google Sheet. They are salted and hashed before storage.

## Tracked activities

- Weekly Education — Wednesday 20:30, Saturday 09:30, Sunday 14:30.
- Service Attendance — Wednesday and Sunday.
- Cleaning Meeting — Sunday 09:00.
- Tithe & Offering — once per month.

## Data and reporting

The dashboard includes Theology/cell/individual performance views, filters, PNG chart export, CSV export, Excel export, Excel import, JSON backup, and record history.

## GitHub Pages

Upload the website contents so that `index.html` is at the repository's published root. The secure backend script itself belongs in Google Apps Script; `google-apps-script.gs` is included in the ZIP as your deployable backend source.
