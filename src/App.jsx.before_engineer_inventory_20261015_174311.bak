import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import {
  AuthProvider,
  useAuth,
} from "./AuthContext";

import ProtectedRoute from "./ProtectedRoute";

import Dashboard from "./routes/index";
import LoginPage from "./routes/login";

import ProcurementPage from "./routes/procurement";
import InventoryPage from "./routes/inventory";
import EngineerPage from "./routes/engineer";
import FinancePage from "./routes/finance";

import VendorsPage from "./routes/vendors";
import VendorNewPage from "./routes/vendors.new";
import VendorDetailPage from "./routes/VendorDetailPage";

import BomPage from "./routes/bom";
import BomNewPage from "./routes/bom.new";
import BomDetailPage from "./routes/bom.$bomId";

import ComponentRequestsPage from "./routes/component-requests";
import ComponentRequestsNewPage from "./routes/component-requests.new";

import ComponentUsagePage from "./routes/component-usage";

import ProjectsPage from "./routes/projects";
import ProjectsDetailPage from "./routes/projects.$projectCode";

import MaterialRequestsPage from "./routes/material-requests";
import MaterialRequestsNewPage from "./routes/material-requests.new";

import PurchaseOrdersPage from "./routes/purchase-orders";
import PurchaseOrdersNewPage from "./routes/purchase-orders.new";
import PurchaseOrderDetailPage from "./routes/purchase-orders.$poId";

import InwardPage from "./routes/inward";
import InwardNewPage from "./routes/inward.new";
import InwardDetailPage from "./routes/inward.$grnId";
import InwardQCPage from "./routes/inward.qc";

import OutwardPage from "./routes/outward";
import OutwardNewPage from "./routes/outward.new";

import ScrapPage from "./routes/scrap";

import NotificationsPage from "./routes/NotificationsPage";
import MaterialsNotificationsPage from "./routes/materialsnotifications";
import ScrapNotificationsPage from "./routes/ScrapNotificationsPage";
import RolesPage from "./routes/roles";
import FinanceNotifications from "./routes/FinanceNotifications";
import InventoryNotifications from "./routes/InventoryNotifications";
import ManagementNotifications from "./routes/ManagementNotifications";

import {
  ToastContainer,
} from "react-toastify";

import "react-toastify/dist/ReactToastify.css";


const ALL_IPMS_ROLES = [
  "admin",
  "manager",
  "procurement",
  "finance",
  "inventory",
  "engineer",
  "management",
];


const INVENTORY_ROLES = [
  "admin",
  "manager",
  "procurement",
  "finance",
  "inventory",
];


const PROCUREMENT_ROLES = [
  "admin",
  "manager",
  "procurement",
];


const FINANCE_ROLES = [
  "admin",
  "manager",
  "finance",
];


const VENDOR_ROLES = [
  "admin",
  "manager",
  "procurement",
  "finance",
];


const BOM_ROLES = [
  "admin",
  "manager",
  "engineer",
];


const MATERIAL_REQUEST_ROLES = [
  "admin",
  "manager",
  "inventory",
  "engineer",
];


const PURCHASE_ORDER_ROLES = [
  "admin",
  "manager",
  "procurement",
  "finance",
  "inventory",
];


const INWARD_OUTWARD_ROLES = [
  "admin",
  "manager",
  "procurement",
  "finance",
  "inventory",
  "management",
];


const COMPONENT_USAGE_ROLES = [
  "admin",
  "manager",
  "procurement",
  "inventory",
  "engineer",
];


const PROJECT_ROLES = [
  "admin",
  "manager",
  "engineer",
];


const ENGINEER_ROLES = [
  "admin",
  "manager",
  "engineer",
];


const withManagement = (roles) =>
  Array.from(
    new Set([
      ...roles,
      "management",
    ]),
  );

// Management can view normal module list/detail screens, but does not receive
// create/new/QC routes. Those routes keep the original role matrices.
const PROCUREMENT_VIEW_ROLES = withManagement(PROCUREMENT_ROLES);
const INVENTORY_VIEW_ROLES = withManagement(INVENTORY_ROLES);
const FINANCE_VIEW_ROLES = withManagement(FINANCE_ROLES);
const VENDOR_VIEW_ROLES = withManagement(VENDOR_ROLES);
const BOM_VIEW_ROLES = withManagement(BOM_ROLES);
const MATERIAL_REQUEST_VIEW_ROLES = withManagement(MATERIAL_REQUEST_ROLES);
const PURCHASE_ORDER_VIEW_ROLES = withManagement(PURCHASE_ORDER_ROLES);
const COMPONENT_USAGE_VIEW_ROLES = withManagement(COMPONENT_USAGE_ROLES);
const PROJECT_VIEW_ROLES = withManagement(PROJECT_ROLES);

const INWARD_OUTWARD_WORK_ROLES =
  INWARD_OUTWARD_ROLES.filter(
    (role) => role !== "management",
  );

const COMPONENT_REQUEST_WORK_ROLES =
  ALL_IPMS_ROLES.filter(
    (role) => role !== "management",
  );



const normalizeAppRole = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getAppRoleHome = (value) => {
  switch (normalizeAppRole(value)) {
    case "procurement":
      return "/procurement";
    case "inventory":
      return "/inventory";
    case "finance":
      return "/finance";
    case "management":
      return "/management-notifications";
    case "engineer":
      return "/engineer";
    case "admin":
    case "manager":
    default:
      return "/dashboard";
  }
};

function RoleAwareFallback() {
  const {
    user,
    activeRole,
    isAuthenticated,
  } = useAuth();

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  const role =
    activeRole ||
    user?.active_role ||
    user?.activeRole ||
    user?.role;

  return (
    <Navigate
      to={getAppRoleHome(role)}
      replace
    />
  );
}


function Guard({
  children,
  roles,
}) {
  return (
    <ProtectedRoute
      allowedRoles={roles}
    >
      {children}
    </ProtectedRoute>
  );
}


export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="flex">
          <main className="flex-1">

            <Routes>

              {/* =================================================
                  PUBLIC ROUTES
                  ================================================= */}

              <Route
                path="/"
                element={<LoginPage />}
              />

              <Route
                path="/login"
                element={<LoginPage />}
              />

              <Route
                path="/register"
                element={
                  <Navigate
                    to="/login"
                    replace
                  />
                }
              />


              {/* =================================================
                  DASHBOARD
                  ================================================= */}

              <Route
                path="/dashboard"
                element={
                  <Guard
                    roles={
                      ALL_IPMS_ROLES
                    }
                  >
                    <Dashboard />
                  </Guard>
                }
              />


              {/* =================================================
                  ADMIN
                  ================================================= */}

              <Route
                path="/roles"
                element={
                  <Guard
                    roles={[
                      "admin",
                    ]}
                  >
                    <RolesPage />
                  </Guard>
                }
              />


              {/* =================================================
                  PROCUREMENT MODULE
                  ================================================= */}

              <Route
                path="/procurement"
                element={
                  <Guard
                    roles={
                      PROCUREMENT_VIEW_ROLES
                    }
                  >
                    <ProcurementPage />
                  </Guard>
                }
              />


              {/* =================================================
                  INVENTORY MODULE
                  ================================================= */}

              <Route
                path="/inventory"
                element={
                  <Guard
                    roles={
                      INVENTORY_VIEW_ROLES
                    }
                  >
                    <InventoryPage />
                  </Guard>
                }
              />

              <Route
                path="/inventory-notifications"
                element={
                  <Guard
                    roles={[
                      "inventory",
                      "admin",
                      "manager",
                    ]}
                  >
                    <InventoryNotifications />
                  </Guard>
                }
              />


              {/* =================================================
                  ENGINEERING MODULE
                  ================================================= */}

              <Route
                path="/engineer"
                element={
                  <Guard
                    roles={
                      ENGINEER_ROLES
                    }
                  >
                    <EngineerPage />
                  </Guard>
                }
              />


              {/* =================================================
                  FINANCE MODULE
                  ================================================= */}

              <Route
                path="/finance"
                element={
                  <Guard
                    roles={
                      FINANCE_VIEW_ROLES
                    }
                  >
                    <FinancePage />
                  </Guard>
                }
              />

              <Route
                path="/finance/notifications"
                element={
                  <Guard
                    roles={[
                      "finance",
                    ]}
                  >
                    <FinanceNotifications />
                  </Guard>
                }
              />


              {/* =================================================
                  VENDORS
                  ================================================= */}

              <Route
                path="/vendors"
                element={
                  <Guard
                    roles={
                      VENDOR_VIEW_ROLES
                    }
                  >
                    <VendorsPage />
                  </Guard>
                }
              />

              <Route
                path="/vendors/new"
                element={
                  <Guard
                    roles={
                      VENDOR_ROLES
                    }
                  >
                    <VendorNewPage />
                  </Guard>
                }
              />

              <Route
                path="/vendors/:vendorId"
                element={
                  <Guard
                    roles={
                      VENDOR_VIEW_ROLES
                    }
                  >
                    <VendorDetailPage />
                  </Guard>
                }
              />


              {/* =================================================
                  BOM
                  ================================================= */}

              <Route
                path="/bom"
                element={
                  <Guard
                    roles={
                      BOM_VIEW_ROLES
                    }
                  >
                    <BomPage />
                  </Guard>
                }
              />

              <Route
                path="/bom/new"
                element={
                  <Guard
                    roles={
                      BOM_ROLES
                    }
                  >
                    <BomNewPage />
                  </Guard>
                }
              />

              <Route
                path="/bom/:bomId"
                element={
                  <Guard
                    roles={
                      BOM_VIEW_ROLES
                    }
                  >
                    <BomDetailPage />
                  </Guard>
                }
              />


              {/* =================================================
                  COMPONENT REQUESTS

                  These routes were already present but their exact
                  role matrix is not defined in the Sidebar you sent.
                  They are therefore authentication-protected only.
                  ================================================= */}

              <Route
                path="/component-requests"
                element={
                  <ProtectedRoute>
                    <ComponentRequestsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/component-requests/new"
                element={
                  <Guard
                    roles={
                      COMPONENT_REQUEST_WORK_ROLES
                    }
                  >
                    <ComponentRequestsNewPage />
                  </Guard>
                }
              />


              {/* =================================================
                  COMPONENT USAGE
                  ================================================= */}

              <Route
                path="/component-usage"
                element={
                  <Guard
                    roles={
                      COMPONENT_USAGE_VIEW_ROLES
                    }
                  >
                    <ComponentUsagePage />
                  </Guard>
                }
              />


              {/* =================================================
                  PROJECTS
                  ================================================= */}

              <Route
                path="/projects"
                element={
                  <Guard
                    roles={
                      PROJECT_VIEW_ROLES
                    }
                  >
                    <ProjectsPage />
                  </Guard>
                }
              />

              <Route
                path="/projects/:projectCode"
                element={
                  <Guard
                    roles={
                      PROJECT_VIEW_ROLES
                    }
                  >
                    <ProjectsDetailPage />
                  </Guard>
                }
              />


              {/* =================================================
                  MATERIAL REQUESTS
                  ================================================= */}

              <Route
                path="/material-requests"
                element={
                  <Guard
                    roles={
                      MATERIAL_REQUEST_VIEW_ROLES
                    }
                  >
                    <MaterialRequestsPage />
                  </Guard>
                }
              />

              <Route
                path="/material-requests/new"
                element={
                  <Guard
                    roles={
                      MATERIAL_REQUEST_ROLES
                    }
                  >
                    <MaterialRequestsNewPage />
                  </Guard>
                }
              />


              {/* =================================================
                  PURCHASE ORDERS
                  ================================================= */}

              <Route
                path="/purchase-orders"
                element={
                  <Guard
                    roles={
                      PURCHASE_ORDER_VIEW_ROLES
                    }
                  >
                    <PurchaseOrdersPage />
                  </Guard>
                }
              />

              <Route
                path="/purchase-orders/new"
                element={
                  <Guard
                    roles={
                      PURCHASE_ORDER_ROLES
                    }
                  >
                    <PurchaseOrdersNewPage />
                  </Guard>
                }
              />

              <Route
                path="/purchase-orders/:poId"
                element={
                  <Guard
                    roles={
                      PURCHASE_ORDER_VIEW_ROLES
                    }
                  >
                    <PurchaseOrderDetailPage />
                  </Guard>
                }
              />


              {/* =================================================
                  INWARD
                  ================================================= */}

              <Route
                path="/inward"
                element={
                  <Guard
                    roles={
                      INWARD_OUTWARD_ROLES
                    }
                  >
                    <InwardPage />
                  </Guard>
                }
              />

              <Route
                path="/inward/new"
                element={
                  <Guard
                    roles={
                      INWARD_OUTWARD_WORK_ROLES
                    }
                  >
                    <InwardNewPage />
                  </Guard>
                }
              />

              <Route
                path="/inward/:grnId"
                element={
                  <Guard
                    roles={
                      INWARD_OUTWARD_ROLES
                    }
                  >
                    <InwardDetailPage />
                  </Guard>
                }
              />

              <Route
                path="/inward/:grnId/qc"
                element={
                  <Guard
                    roles={
                      INWARD_OUTWARD_WORK_ROLES
                    }
                  >
                    <InwardQCPage />
                  </Guard>
                }
              />


              {/* =================================================
                  OUTWARD
                  ================================================= */}

              <Route
                path="/outward"
                element={
                  <Guard
                    roles={
                      INWARD_OUTWARD_ROLES
                    }
                  >
                    <OutwardPage />
                  </Guard>
                }
              />

              <Route
                path="/outward/new"
                element={
                  <Guard
                    roles={
                      INWARD_OUTWARD_WORK_ROLES
                    }
                  >
                    <OutwardNewPage />
                  </Guard>
                }
              />


              {/* =================================================
                  ENGINEER SCRAP
                  ================================================= */}

              <Route
                path="/scrap"
                element={
                  <Guard
                    roles={[
                      "admin",
                      "engineer",
                      "management",
                    ]}
                  >
                    <ScrapPage />
                  </Guard>
                }
              />


              {/* =================================================
                  NOTIFICATIONS
                  ================================================= */}

              <Route
                path="/notifications"
                element={
                  <Guard
                    roles={[
                      "admin",
                      "manager",
                    ]}
                  >
                    <NotificationsPage />
                  </Guard>
                }
              />

              <Route
                path="/management-notifications"
                element={
                  <Guard
                    roles={[
                      "management",
                      "admin",
                    ]}
                  >
                    <ManagementNotifications />
                  </Guard>
                }
              />

              <Route
                path="/materialsnotifications"
                element={
                  <Guard
                    roles={[
                      "procurement",
                    ]}
                  >
                    <MaterialsNotificationsPage />
                  </Guard>
                }
              />

              <Route
                path="/scrap-notifications"
                element={
                  <Guard
                    roles={[
                      "admin",
                      "manager",
                    ]}
                  >
                    <ScrapNotificationsPage />
                  </Guard>
                }
              />


              {/* =================================================
                  FALLBACK
                  ================================================= */}

              <Route
                path="*"
                element={<RoleAwareFallback />}
              />

            </Routes>


            <ToastContainer
              position="top-center"
              autoClose={1500}
              hideProgressBar
              newestOnTop
              closeOnClick
              pauseOnHover
              theme="dark"
              toastStyle={{
                borderRadius: "12px",
                fontSize: "14px",
                padding:
                  "12px 16px",
              }}
            />

          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
