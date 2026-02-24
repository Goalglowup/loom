# Loom Dashboard

Minimal observability dashboard for Loom Phase 1.

## Tech Stack

- **React 19** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **React Router** - Client-side routing

## Development

```bash
cd dashboard
npm install
npm run dev    # Development server on port 5173
npm run build  # Production build to dist/
```

## Production

The dashboard is built and served as static files by the Fastify server at `/dashboard`.

- Built files are in `dist/`
- Assets are served with `/dashboard/` prefix
- SPA fallback handles React Router navigation

## Structure

```
dashboard/
├── src/
│   ├── components/
│   │   ├── Layout.tsx        # Main layout with header & nav
│   │   └── Layout.css
│   ├── pages/
│   │   ├── TracesPage.tsx    # Trace list/detail view (placeholder)
│   │   ├── AnalyticsPage.tsx # Analytics summary (placeholder)
│   │   └── *.css
│   ├── App.tsx               # Route configuration
│   ├── main.tsx              # React app entry
│   └── index.css             # Global styles
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Phase 1 Features

- ✅ Basic routing (Traces, Analytics)
- ✅ Responsive layout with header and navigation
- ✅ Served by Fastify at `/dashboard`
- ⏳ API integration (Wave 3)
- ⏳ Trace visualization (Wave 3)
- ⏳ Analytics charts (Wave 3)

## Notes

- Uses BrowserRouter with `/dashboard` basename
- Vite base path set to `/dashboard/` for correct asset URLs
- Fastify serves static files with SPA fallback for React Router
- Dashboard is minimal and focused on visibility/auditability
