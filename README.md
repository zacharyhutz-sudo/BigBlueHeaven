# Big Blue Heaven

A vacation-rental site for Big Blue Heaven on North Cape San Blas, Florida. The gallery uses photographs from the Cape & Coast property listing. Guests can request a stay at `/availability` and browse the Cape San Blas local guide at `/guide`. The owner manages requests, rates, and blocked dates at `/admin`.

## Deploy from GitHub to Netlify

1. Extract the ZIP. Upload its **contents** to the root of a GitHub repository. You should see `netlify.toml`, `package.json`, `public/`, `server/`, and `netlify/functions/` in the repository.
2. In Netlify, import an existing project from GitHub and select that repository. Leave the base directory empty. The included `netlify.toml` sets the build command to `npm run build`, publish directory to `public`, and functions directory to `netlify/functions`.
3. In the Netlify project’s environment variables, add `CALENDAR_ADMIN_PASSWORD` as a secret with the owner password supplied for this site. Apply it to the **Production** deploy context, with **Functions** access. If the site already deployed before you set it, trigger a new production deploy.
4. Open the deployed site, use **Owner login** in the footer, and sign in with that password.

The included tests run during the build. The function uses Netlify Blobs with the site’s automatic credentials. This project has no separate database account, schema setup, or SQL to paste.

## Manage stays and pricing

1. Guests select check-in and check-out on the calendar or enter them in the form. The lodging estimate starts at **$1,200 per night**. Each night uses the rate in effect on that date. Guests submit contact information and get a reference number.
2. Open **Owner login** and review **Stay requests**. Pending requests leave dates open. Approving a request reserves the nights from check-in through the night before checkout. The owner dashboard shows the guest's email so you can arrange confirmation and payment directly. Declined requests leave dates open. Cancelling an approved reservation releases its nights, subject to any separate owner blocks.
3. In **Nightly rates**, set the standard rate and any seasonal date ranges. Both endpoints of a seasonal rate range are included. Review the configuration and select **Save rates**. A new estimate reflects the saved rates. Previously submitted requests keep the estimate the guest saw.
4. Use **Block or reopen dates** to set dates for stays or maintenance outside this site's booking form. Both dates are included. To mark a single date, use the same date twice. Set **Departure only** on the arrival date of an externally booked stay when an earlier guest can check out that day. Mark the other occupied nights **Unavailable**.

This launch shows a lodging estimate. The owner handles applicable fees, taxes, payment, and guest follow-up directly. Submitted requests appear in the owner dashboard.

Calendar edits, pricing, and requests persist in Netlify Blobs across code redeploys. The guest calendar refreshes every 30 seconds while visible and when it regains focus. Existing date overrides in the Netlify project are retained.

The starting calendar was captured from Cape & Coast on November 20, 2026 and covers November 1, 2026 through April 30, 2028. Dates outside that range show as unconfirmed until the owner opens them.

## Run the checks

With Node.js 22.12 or newer, run `npm ci` followed by `npm test`. The integration test runs against a temporary local instance of Netlify’s Blobs server. The tests cover owner authentication, date edits, seasonal estimates, request submission, retained quotes, and approving or cancelling reservations.
