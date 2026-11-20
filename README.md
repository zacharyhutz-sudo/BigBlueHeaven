# Big Blue Heaven

A vacation-rental site for Big Blue Heaven on North Cape San Blas, Florida. The gallery uses photographs from the Cape & Coast property listing. Guests can browse availability at `/availability`. The owner can edit it at `/admin`. Booking, pricing, and payment take place on the linked Cape & Coast listing.

## Deploy from GitHub to Netlify

1. Extract the ZIP. Upload its **contents** to the root of a GitHub repository. You should see `netlify.toml`, `package.json`, `public/`, `server/`, and `netlify/functions/` in the repository.
2. In Netlify, import an existing project from GitHub and select that repository. Leave the base directory empty. The included `netlify.toml` sets the build command to `npm run build`, publish directory to `public`, and functions directory to `netlify/functions`.
3. In the Netlify project’s environment variables, add `CALENDAR_ADMIN_PASSWORD` as a secret with the owner password supplied for this site. Apply it to the **Production** deploy context, with **Functions** access. If the site already deployed before you set it, trigger a new production deploy.
4. Open the deployed site, use **Owner login** in the footer, and sign in with that password.

The included tests run during the build. The function uses Netlify Blobs with the site’s automatic credentials. This project has no separate database account, schema setup, or SQL to paste.

## Edit availability

Choose a first date, a last date, and a status. Both dates are included. For a single date, use the same date twice. For a stay that checks out Saturday morning, mark occupied nights through Friday and set Saturday’s arrival or departure status separately. Click **Save dates**.

Changes are stored on the Netlify project and survive code redeploys. A guest opening the calendar sees the saved values. An already-open guest calendar refreshes every 30 seconds while visible and when it regains focus.

The starting calendar was captured from Cape & Coast on November 20, 2026 and covers November 1, 2026 through April 30, 2028. Dates outside that initial range show as unconfirmed until the owner sets them. Subsequent bookings and cancellations on Cape & Coast require an owner calendar edit here. The owner's changes take precedence over the starting data. Calendar edits made in a separate preview site belong to that preview's storage.

## Run the checks

With Node.js 22.12 or newer, run `npm ci` followed by `npm test`. The integration test runs against a temporary local instance of Netlify’s Blobs server. It checks sign-in, date edits, persistence for guests, conflicts, restricted writes, and sign-out.
