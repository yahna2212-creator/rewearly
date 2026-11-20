# Rewearly MERN rebuild

The project reuses the Rewearly HTML, CSS, imagery, page URLs, and interactions. React renders the cart. Express and MongoDB replace Supabase for accounts, catalog, seller submissions, moderation and orders. Checkout uses transactional inventory updates and a configurable UPI handoff. Administrators confirm payment manually.

## Local setup

1. Use Node.js 24 and run `npm ci`.
2. Copy `.env.example` to `.env`. Add the MongoDB Atlas connection string and a random session secret of at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. The MongoDB user must have read/write access to the chosen database. Use Atlas or another MongoDB replica set for checkout transactions.
3. Run `npm run build` then `npm start` and open `http://localhost:5000`.
4. Create a new account through the website. To grant administrator access to that account, set `ADMIN_EMAIL` in your local environment and run `npm run admin` against the intended database. Newly registered accounts always start without admin privileges.
5. Set `UPI_ID` to the store's payment address before checkout. Payment status is manual. Pending orders reserve the selected outfit.

## Vercel

Import the source as a separate project. Set the project root to this folder. Use `npm run build` and `public` for the output directory. Add `MONGO_URI`, `MONGO_DB`, `JWT_SECRET`, `APP_ORIGIN` (the exact HTTPS deployment origin), and `UPI_ID` as server environment variables. Configure Atlas network access for the deployment. Review the preview before moving the existing domain.

The rebuild starts with a fresh database. Supabase accounts, inventory and orders require a separate migration. Test with new accounts on the preview first.

## Checks

`npm test` runs a smoke test against a temporary MongoDB replica set. It covers registration, login, authorization, listing approval, seller confirmation, and concurrent checkout.
