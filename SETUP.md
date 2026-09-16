# IPMS App - Setup & Routing Guide

## Project Overview

This is an **Inventory & Procurement Management System (IPMS)** built with:
- **React** + **TanStack Router** for file-based routing
- **TanStack React Query** for data fetching
- **Vite** for bundling
- **Tailwind CSS** for styling

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
Opens at `http://localhost:5173` with hot reload.

### 3. Build for Production
```bash
npm run build
```
Creates optimized build in `dist/` folder.

### 4. Preview Production Build
```bash
npm run preview
```
Or use the Node.js server:
```bash
node server.js
```
Opens at `http://localhost:8080`

---

## Available Routes

### Authentication
- **`/`** → Login (default page)
- **`/login`** → Login page
- **`/register`** → Registration page

### Main Modules (Dashboards)
- **`/procurement`** → Procurement module dashboard
- **`/inventory`** → Inventory management dashboard
- **`/engineer`** → Engineer module dashboard
- **`/finance`** → Finance module dashboard

### Operations & Management

#### Vendors
- **`/vendors`** → Vendor list
- **`/vendors/:vendorId`** → Vendor details

#### Bill of Materials (BOM)
- **`/bom`** → BOM list
- **`/bom/new`** → Create new BOM

#### Material Requests
- **`/material-requests`** → Material requests list
- **`/material-requests/new`** → Create new material request

#### Purchase Orders
- **`/purchase-orders`** → Purchase orders list
- **`/purchase-orders/new`** → Create new purchase order

#### Inward Shipments
- **`/inward`** → Inward shipments list
- **`/inward/new`** → Create new inward shipment

#### Outward Shipments
- **`/outward`** → Outward shipments list
- **`/outward/new`** → Create new outward shipment

#### Component Requests
- **`/component-requests`** → Component requests list
- **`/component-requests/new`** → Create new component request

---

## Navigation Features

### Using TanStack Router Links
```jsx
import { Link } from '@tanstack/react-router'

export function MyComponent() {
  return <Link to="/procurement">Go to Procurement</Link>
}
```

### Using useNavigate Hook
```jsx
import { useNavigate } from '@tanstack/react-router'

export function MyComponent() {
  const navigate = useNavigate()
  
  const handleClick = () => {
    navigate({ to: '/inventory' })
  }
  
  return <button onClick={handleClick}>Go to Inventory</button>
}
```

### URL Parameters
```jsx
// Navigate with params
navigate({ to: '/vendors/$vendorId', params: { vendorId: '123' } })

// Use in component
export function VendorPage() {
  const { vendorId } = useParams({ from: '/vendors/$vendorId' })
  return <div>Vendor: {vendorId}</div>
}
```

---

## File Structure

```
src/
├── App.jsx                 # Main app component with router
├── main.jsx               # Entry point that hydrates App
├── router.jsx             # Router configuration
├── routes/                # File-based route components
│   ├── __root.jsx         # Root layout
│   ├── index.jsx          # Dashboard
│   ├── login.jsx          # Login page
│   ├── register.jsx       # Register page
│   ├── procurement.jsx
│   ├── inventory.jsx
│   ├── engineer.jsx
│   ├── finance.jsx
│   ├── vendors.jsx
│   ├── vendors.$vendorId.jsx
│   ├── bom.jsx
│   ├── bom.new.jsx
│   └── ... (other routes)
├── components/            # Reusable components
├── lib/                   # Utilities and helpers
└── styles.css            # Global styles
```

---

## SPA Routing

This app is a **Single Page Application (SPA)**, meaning:
- Client-side routing handles navigation (no full page reload)
- Direct URL access (e.g., `/procurement`) works seamlessly
- Refresh on any route preserves the page (both dev & production)

### Dev Server
Vite dev server (`npm run dev`) automatically serves `index.html` for all routes.

### Production Deployment

**Using Node.js Express** (recommended):
```bash
npm run build
node server.js
```

**Using Nginx**:
```nginx
server {
  listen 80;
  root /path/to/dist;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

**Using Apache** (add `.htaccess` in `dist/`):
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

**Using Cloudflare Pages / Vercel**:
These platforms automatically handle SPA routing. Just deploy the `dist/` folder.

---

## Troubleshooting

### 404 Errors on Direct URL / Refresh
- **Dev**: Make sure you're using `npm run dev` (not a static file server)
- **Production**: Verify server fallback to `index.html` is configured (see above)

### Routes Not Working
- Check `src/routeTree.gen.ts` and `src/routeTree.gen.js` are up to date
- Ensure route files follow naming convention: `path-name.jsx` → `/path-name`
- Nested routes: `path/name.new.jsx` → `/path/name/new`

### Sidebar Navigation Not Highlighting
Check `src/components/app/Sidebar.jsx` for active route logic.

---

## Next Steps

1. ✅ Install dependencies: `npm install`
2. ✅ Run dev: `npm run dev`
3. ✅ Test routes in browser (e.g., http://localhost:5173/procurement)
4. ✅ Build: `npm run build`
5. ✅ Deploy `dist/` folder with proper SPA fallback

Enjoy building! 🚀
