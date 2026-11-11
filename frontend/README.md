# Product Explorer frontend

Next.js app for browsing the saved book catalogue.

Create `.env.local` with the backend URL:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Then run:

```bash
npm ci --legacy-peer-deps
npm run dev
```

Open [localhost:3000](http://localhost:3000).

## Checks and build

```bash
npm run lint
npm run build
npm start
```

Set the API URL before the production build. It is included in the browser bundle.

The app includes category pages, paginated book lists, individual book details and a refresh button. Missing covers have a text fallback. Loading, empty and failed requests have separate states. CSS handles the hover effects and respects reduced-motion preferences.

See the [project README](../README.md) for backend setup and deployment.
