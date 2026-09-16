import {
  Navigate,
  useLocation,
} from "react-router-dom";

import {
  useAuth,
} from "./AuthContext";


const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .toLowerCase();


const getRoleHome = (role) => {
  switch (normalizeRole(role)) {
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


export default function ProtectedRoute({
  children,
  allowedRoles,
}) {
  const location = useLocation();

  const {
    user,
    activeRole,
    isAuthenticated,
  } = useAuth();


  // ----------------------------------------------------------
  // NOT LOGGED IN
  // ----------------------------------------------------------

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location,
        }}
      />
    );
  }


  // ----------------------------------------------------------
  // AUTHENTICATION-ONLY ROUTE
  // ----------------------------------------------------------
  //
  // If allowedRoles is not provided, any logged-in user can
  // access this route.
  // ----------------------------------------------------------

  if (
    !Array.isArray(allowedRoles) ||
    allowedRoles.length === 0
  ) {
    return children;
  }


  // ----------------------------------------------------------
  // ACTIVE ROLE
  // ----------------------------------------------------------
  //
  // activeRole comes from AuthContext.
  //
  // Fallbacks are kept for compatibility with old sessions.
  // ----------------------------------------------------------

  const role = normalizeRole(
    activeRole ||
      user?.active_role ||
      user?.role?.name ||
      user?.role ||
      "",
  );


  const normalizedAllowedRoles =
    allowedRoles.map(
      (item) =>
        normalizeRole(item),
    );


  // ----------------------------------------------------------
  // ROLE NOT ALLOWED
  // ----------------------------------------------------------
  //
  // Do NOT send an already authenticated user back to Login.
  // Send them to the home page for their current active role.
  // Management must remain inside the authenticated session and routes
  // to /management-notifications.
  // ----------------------------------------------------------

  if (
    !normalizedAllowedRoles.includes(
      role,
    )
  ) {
    return (
      <Navigate
        to={getRoleHome(role)}
        replace
      />
    );
  }


  return children;
}
