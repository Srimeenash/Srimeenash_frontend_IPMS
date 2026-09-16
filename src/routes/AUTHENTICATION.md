# Authentication & Module System Documentation

## Overview

The IPMS (Inventory & Project Management System) now features a complete authentication system with 4 role-based module dashboards.

## Authentication Pages

### Login Page (`/login`)
- **Purpose**: User authentication entry point
- **URL**: `http://localhost:5173/login`
- **Features**:
  - Email and password validation
  - Displays demo credentials for testing
  - Auto-redirects authenticated users to their module
  - Error messages for invalid credentials
- **Demo Users**:
  - Admin: `admin@ipms.local` / `admin123`
  - Procurement: `procurement@ipms.local` / `procure123`
  - Inventory: `inventory@ipms.local` / `inventory123`
  - Engineer: `engineer@ipms.local` / `engineer123`
  - Finance: `finance@ipms.local` / `finance123`

### Register Page (`/register`)
- **Purpose**: New user account creation
- **URL**: `http://localhost:5173/register`
- **Features**:
  - Full name, email, password fields
  - Role selection (Procurement, Inventory, Engineer, Finance)
  - Password validation (minimum 6 characters)
  - Confirm password field
  - Link back to login

## Module Dashboards

Each role has a dedicated module dashboard with role-specific KPIs and data views.

### 1. Procurement Module (`/procurement`)
- **For**: Procurement officers and managers
- **KPIs**:
  - Total Purchase Orders
  - Total Material Requests
  - Active Vendors
- **Sections**:
  - Purchase Orders table
  - Material Requests table
  - Vendor management
- **Access**: Login as `procurement@ipms.local`

### 2. Inventory Module (`/inventory`)
- **For**: Inventory managers and warehouse staff
- **Features**:
  - Inventory summary cards
  - Tabbed inventory view (Categories, Available, In-Drone, Scrap)
  - DataTable for inventory items
- **Access**: Login as `inventory@ipms.local`

### 3. Engineer Module (`/engineer`)
- **For**: Engineering team and design leads
- **KPIs**:
  - BOMs Created
  - Component Requests
  - Pending Requests
- **Sections**:
  - Bill of Materials (BOM) management
  - Component Requests
  - Material request tracking
- **Access**: Login as `engineer@ipms.local`

### 4. Finance Module (`/finance`)
- **For**: Finance officers and accountants
- **KPIs**:
  - Total Expenditure (currency formatted)
  - Project Budgets
  - Approved Purchase Orders
- **Sections**:
  - Purchase Order costs breakdown
  - Project budget analysis
  - Financial reporting
- **Access**: Login as `finance@ipms.local`

## Admin Dashboard (`/`)
- **For**: System administrators with full access
- **Access**: Login as `admin@ipms.local`
- **Features**: Access to all modules and system-wide KPIs

## Authentication Flow

1. **Unauthenticated User** → Redirected to `/login`
2. **Valid Credentials** → Stored in localStorage
3. **User Logged In** → Redirected to role-specific module
4. **Access Protected Routes** → Auto-redirects to login if session expired
5. **Logout** → Clears localStorage, redirects to `/login`

## User Data Management

- **Storage**: `src/lib/data.json` → `users` array
- **Session**: localStorage (`user` and `role` keys)
- **Format**:
  ```json
  {
    "id": "user-1",
    "fullName": "Admin User",
    "email": "admin@ipms.local",
    "password": "admin123",
    "role": "admin"
  }
  ```

## Navigation Structure

### Top Navigation Bar (Topbar)
- Search functionality
- Notification bell
- User profile dropdown
- Logout button

### Side Navigation (Sidebar)
Organized into 3 groups:
1. **MAIN**: Dashboard
2. **MODULES**: Procurement, Inventory, Engineer, Finance
3. **OPERATIONS**: Supporting functions (Vendors, BOM, Material Requests, Purchase Orders, Inward, Outward, Component Requests)

## Security Notes

⚠️ **Important**: This is a frontend demo authentication system.
- Passwords are stored in plain JSON (not production-ready)
- Session is stored in browser localStorage (not secure for production)
- In production, implement:
  - Backend authentication API
  - JWT/OAuth tokens
  - Secure session management
  - Password hashing (bcrypt, argon2)
  - Role-based access control (RBAC) on backend

## File Structure

```
src/routes/
├── login.jsx                 # Login page
├── register.jsx              # Registration page
├── procurement.jsx           # Procurement module
├── inventory.jsx             # Inventory module
├── engineer.jsx              # Engineer module
├── finance.jsx               # Finance module
└── __root.jsx                # Root layout with auth logic

src/lib/
└── data.json                 # User data and module data

src/components/app/
├── Sidebar.jsx              # Navigation sidebar (with module sections)
├── Topbar.jsx               # Top bar (with user profile & logout)
└── PageShell.jsx            # Page layout wrapper
```

## Testing the System

1. **Start the development server**:
   ```bash
   npm run dev
   ```

2. **Navigate to login**:
   - Open `http://localhost:5173/login`

3. **Try different roles**:
   - Use the demo credentials to test each role
   - Observe different dashboards and KPIs

4. **Test logout**:
   - Click profile dropdown → Logout
   - Verify redirect to login page

5. **Test registration** (optional):
   - Click "Register" on login page
   - Create new account with role
   - Verify login works with new account

## Future Enhancements

- [ ] Backend authentication API
- [ ] JWT token management
- [ ] Password reset functionality
- [ ] Role-based route guards
- [ ] User profile editing
- [ ] Two-factor authentication
- [ ] Audit logging
