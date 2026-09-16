export function getUserRole(user, activeRole = null) {
  return String(
    activeRole ||
      user?.active_role ||
      user?.activeRole ||
      user?.role?.name ||
      user?.role ||
      "",
  )
    .trim()
    .toLowerCase();
}

export function isAdmin(user, activeRole = null) {
  const role = getUserRole(user, activeRole);

  // Respect the selected active role. A superuser who switches to
  // Management must still be view-only inside normal modules.
  if (role) {
    return role === "admin";
  }

  return user?.is_superuser === true;
}

export function isManagement(user, activeRole = null) {
  return getUserRole(user, activeRole) === "management";
}

export function canViewCosting(user, activeRole = null) {
  if (!user) {
    return false;
  }

  const role = getUserRole(user, activeRole);

  return [
    "admin",
    "management",
    "procurement",
    "finance",
  ].includes(role);
}

/**
 * Sidebar / route guards decide module visibility.
 * This file decides WORK vs VIEW ONLY.
 *
 * Management intentionally has no work modules:
 * - Management can view all permitted modules.
 * - Management can see costing.
 * - Management can only Approve / Reject Sales from
 *   Management Notifications.
 */
const WORK_MODULES = {
  engineer: [
    "material-request",
    "projects",
    "scrap",
  ],
  procurement: [
    "purchase-order",
    "vendor",
    "inward",
    "outward",
    "procurement",
    "inventory",
  ],
  inventory: [
    "inventory",
    "component-usage",
    "outward",
  ],
  finance: [
    "finance",
  ],
  manager: [],
  management: [],
};

export function canWork(
  user,
  moduleName,
  activeRole = null,
) {
  if (!user) {
    return false;
  }

  if (isAdmin(user, activeRole)) {
    return true;
  }

  const role = getUserRole(user, activeRole);

  return (
    WORK_MODULES[role]?.includes(
      moduleName,
    ) === true
  );
}
