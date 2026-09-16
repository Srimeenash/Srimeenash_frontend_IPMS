// src/routes/role-login.jsx
// Compatibility only. Topbar now switches roles directly.
// This route never asks for email, password, or OTP.

import { useEffect, useMemo } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { fetchAuthenticatedJson } from "@/api";

const normalizeRole = (value) =>
  String(value || "").trim().toLowerCase();

const getRoleHome = (value) => {
  switch (normalizeRole(value)) {
    case "procurement":
      return "/procurement";
    case "inventory":
      return "/inventory";
    case "finance":
      return "/finance";
    case "engineer":
      return "/engineer";
    case "admin":
    case "manager":
    default:
      return "/dashboard";
  }
};

export default function RoleLoginPage() {
  const { role: roleParam } = useParams();
  const navigate = useNavigate();

  const {
    user,
    roles = [],
    activeRole,
    isAuthenticated,
    login,
  } = useAuth();

  const targetRole = normalizeRole(roleParam);
  const currentRole = normalizeRole(
    activeRole ||
      user?.active_role ||
      user?.role,
  );

  const assignedRoles = useMemo(() => {
    const result = [];

    const append = (value) => {
      const normalized = normalizeRole(value);
      if (normalized && !result.includes(normalized)) {
        result.push(normalized);
      }
    };

    (Array.isArray(roles) ? roles : []).forEach(append);
    (Array.isArray(user?.roles) ? user.roles : []).forEach(append);
    append(user?.role);
    (
      Array.isArray(user?.additional_roles)
        ? user.additional_roles
        : []
    ).forEach(append);

    return result;
  }, [roles, user]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !targetRole ||
      !assignedRoles.includes(targetRole) ||
      targetRole === currentRole
    ) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      const session = await fetchAuthenticatedJson(
        "/auth/switch-role/",
        {
          method: "POST",
          body: JSON.stringify({
            role: targetRole,
          }),
        },
      );

      if (cancelled) return;

      if (
        session?.access &&
        session?.refresh &&
        session?.user
      ) {
        login({
          access: session.access,
          refresh: session.refresh,
          user: session.user,
        });

        navigate(
          getRoleHome(targetRole),
          { replace: true },
        );
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    isAuthenticated,
    targetRole,
    currentRole,
    assignedRoles,
    login,
    navigate,
  ]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (
    targetRole === currentRole ||
    !targetRole ||
    !assignedRoles.includes(targetRole)
  ) {
    return (
      <Navigate
        to={getRoleHome(currentRole)}
        replace
      />
    );
  }

  return (
    <div className="p-6 text-sm text-muted-foreground">
      Switching role...
    </div>
  );
}
