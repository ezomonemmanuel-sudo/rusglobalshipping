# Rusway

Rusway is a Russia-origin international courier workspace with private customer tracking and role-protected operational tools. The interface includes a shipping overview, shipment creation and editing, chronological tracking, customs records, configurable route pricing, estimates in RUB/USD/EUR/GBP/NGN, and audit history.

## Technology

The application uses React 19, TypeScript, TanStack Start/Router, Vite, Lucide icons, and custom responsive CSS. Netlify Functions provide the API, Netlify Identity provides authentication, and Netlify Database provides persistent Postgres storage through the Drizzle Netlify adapter. Runtime input validation uses Zod. Database migrations are in `netlify/database/migrations`.

## Local development

Install Node.js 22+, pnpm, and the Netlify CLI. Link the project to the intended Netlify site using the CLI if it is not already linked.

```sh
pnpm install
netlify dev --port 8889
```

Visit the URL printed by the CLI. Identity requires a real HTTPS Netlify deployment for working authentication cookies; use a deploy preview or staging site to exercise login, email confirmation, password recovery, and protected operations. Direct Vite development does not emulate the application API.

## Production setup

The repository is configured for the Netlify deployment pipeline. Netlify builds the frontend and server application, packages the functions, and applies the generated database migration. Identity activation has been requested for this site. No database connection string or external database service is configured in client code. The production database branch does not exist until the initial deployment provisions it; migrations have been generated, not manually applied during this implementation.

Before accepting real shipments:

1. Publish the application and confirm that the database migration and Identity feature are active. Verify Identity email delivery and the configured site URL, and confirm email links return to the deployed site.
2. An authorized Netlify Identity administrator must invite or verify `Emmyreign100@gmail.com` and assign `admin` in **application metadata roles**, not editable user metadata. This is the only account permitted to use operational tools; matching the email without the role, or having a staff role on another account, does not grant access. Ordinary accounts remain customers. There is deliberately no public bootstrap-admin endpoint or self-service role editor.
3. Open `/admin` or `/admin-login` and sign in with the designated account. Set the password through Netlify Identity’s invitation or recovery email, and replace any password previously shared in a message. Passwords are never prefilled, hard-coded, or stored in application records. Add the desired Economy, Standard, Express, and Priority service levels, their actual estimated transit windows, and availability. Service names remain configurable.
4. Configure actual Russian origin/destination routes and independent rates for each currency you offer. The wildcard `*` means all Russian cities or all destination countries and must be enabled only when the operation actually supports that scope. Verify custom origin cities are in Russia before accepting them; free-text location entry is not an address-verification service.
5. When creating a shipment on a customer’s behalf, assign the verified customer’s Identity UUID as the account ID. Leaving it blank assigns the shipment to the administrator’s own account. Confirm the full recipient address, destination region/postal requirements, accurate goods declaration, and real route availability.
6. Verify the deployed access matrix using the designated administrator, that same email without an administrator role, an unrelated account with a staff role, and ordinary customers. Check direct access to `/admin`, direct operational API mutations, another customer’s shipment UUID, customs notes, internal notes, pricing management, and audit records. Only the designated, role-verified administrator may use staff privileges; all other accounts remain ownership-scoped customers.
7. Review the Netlify Database backup/restore options, retention, and availability for the site’s account and plan. Establish and verify the appropriate production backup/restore procedure before storing live shipment records. This repository does not claim to have enabled or verified a platform backup policy.
8. Review function logs, request identifiers, operational audit records, account access policies, and data-retention requirements. Perform staging smoke checks before taking live customer traffic.

Configuration and provider-managed credentials belong in Netlify environment variables with server/runtime scopes. Never put secrets in `VITE_*` variables, commit them, or add them to logs. Additional integration secrets are not required or created by the current implementation.

## Behavior and safeguards

Customers can create and view only their own shipment records. They cannot edit existing shipments, update statuses/locations/customs, create tracking events, access internal notes, configure rates, inspect operational audit logs, or assign roles. Every protected operation validates the current Identity session against the Identity user endpoint and requires both the designated account email and the server-controlled `admin` application role for staff access. Email matching is case-insensitive; neither customer signup nor editable profile metadata can grant access. The API fails closed when Identity verification is unavailable. `/admin` also has a server-side route guard that redirects unauthorized visitors to `/admin-login` without rendering the dashboard.

## Administrator workspace

The dedicated sign-in screen provides normal password-manager support, password visibility controls, safe login errors, and password recovery. The customer workspace footer links to administrator access. The dashboard presents real shipment totals and quick access to all shipments, service/rate configuration, operational activity, and shipment creation. Shipment details include verified tracking events, customs information, private notes, and per-record audit history. Customer assignments use verified Identity UUIDs; account provisioning and role assignment remain outside the application with an authorized Identity administrator.

Adding the sign-in screen and account restriction did not provision an Identity user, set a password, or verify production login. Complete the account invitation, email verification, administrator-role assignment, and deployed access checks before relying on this workspace for live operations.

All operational mutations and their audit entries share a database transaction. Tracking events are append-only through the application. A row lock serializes concurrent shipment changes; the newest event by actual event time determines current status/location, so adding an older event does not move the shipment backward. Tracking dates are displayed in UTC; the handler enters actual event dates in their local timezone, which the browser converts to UTC.

Creation produces a tracking number and a **Shipment Created** record, not a pickup, customs release, or transportation scan. Initial location is explicitly the declared origin with pickup unconfirmed. No operational shipment samples, fake delivery history, approvals, carrier partnerships, prices, or exchange rates are seeded. The map is a labeled destination-planning illustration, not a live tracking map.

Quotes use `base + max(actual kg, length × width × height / volumetric divisor) × package count × per-kg rate + package count × per-package fee`. Dimensions and weight apply per package. Quotes expire after 24 hours and exclude customs duties, taxes, and additional handling. Destination-specific rates take priority over wildcard rates, then origin specificity, then the most recently updated rate. There is no currency conversion or live carrier pricing. Unconfigured routes/currencies cannot produce estimates or new shipment records.

The full destination directory is distinct from actual supported routes. This is courier operations software, not a carrier network or a sanctions/customs-compliance certification. Staff must confirm that locations, services, export/import conditions, goods, and documentation are valid for each actual shipment.

## API and future carrier imports

The API lives at `/api/operations`. Resources include `session`, `services`, `rates`, `quotes`, `shipments`, `tracking`, and `audit`. Shipment actions are `events`, `customs`, and `notes`. Protected reads always enforce ownership or staff authorization. Browser mutations require same-origin JSON. Authenticated server integrations may provide a current Netlify Identity bearer token instead of a browser cookie; all the same role checks apply. No unauthenticated carrier webhook or third-party carrier integration is enabled.

Carrier imports can be added by building a signature-verified adapter around the same transactional tracking-event operation, with explicit source attribution and idempotency. Until such an integration exists, actual events must be entered by authorized handlers.

## Schema changes

Change `db/schema.ts`, inspect migration state with `netlify db status`, then generate a descriptively named migration:

```sh
pnpm db:generate --name add_shipment_field
```

Never edit applied migrations. Netlify applies migrations from the configured migration directory during deployment. The Drizzle packages must stay on a release line that includes `drizzle-orm/netlify-db`; this project uses the beta versions prescribed by its Netlify Database integration.

Builds, type checks, dev servers, and runtime tests were intentionally not executed during the agent implementation; the deployment pipeline performs build validation. Production deployment, email delivery, cross-account runtime checks, and backups still require the deployment/setup checks above.
