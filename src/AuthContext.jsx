import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  clearAuth,
  getAccessToken,
  getUser,
  setAuth,
  updateStoredUser,
} from "./authStore";

import {
  fetchAuthenticatedJson,
} from "./api";


/* ============================================================
   ROLE HELPERS
   ============================================================ */

const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .toLowerCase();


const getUserRoles = (user) => {
  if (!user) {
    return [];
  }

  const result = [];

  if (Array.isArray(user.roles)) {
    user.roles.forEach(
      (role) => {
        const normalized =
          normalizeRole(role);

        if (
          normalized &&
          !result.includes(
            normalized,
          )
        ) {
          result.push(
            normalized,
          );
        }
      },
    );
  }

  const primaryRole =
    normalizeRole(
      user.role,
    );

  if (
    primaryRole &&
    !result.includes(
      primaryRole,
    )
  ) {
    result.unshift(
      primaryRole,
    );
  }

  if (
    Array.isArray(
      user.additional_roles,
    )
  ) {
    user.additional_roles.forEach(
      (role) => {
        const normalized =
          normalizeRole(role);

        if (
          normalized &&
          !result.includes(
            normalized,
          )
        ) {
          result.push(
            normalized,
          );
        }
      },
    );
  }

  return result;
};


/* ============================================================
   AUTH CONTEXT
   ============================================================ */

const AuthContext =
  createContext({
    user: null,
    access: null,

    roles: [],
    activeRole: null,
    canSwitchRole: false,

    isAuthenticated: false,

    login: () => {},
    logout: () => {},

    updateUser: () => {},
    setUser: () => {},

    hasRole: () => false,

    reauthenticateRole:
      async () => {},

    switchRole:
      async () => {},
  });


/* ============================================================
   AUTH PROVIDER
   ============================================================ */

export function AuthProvider({
  children,
}) {
  const [
    user,
    setUserState,
  ] = useState(
    getUser(),
  );

  const [
    access,
    setAccessState,
  ] = useState(
    getAccessToken(),
  );


  /* ==========================================================
     KEEP REACT CONTEXT SYNCHRONIZED WITH authStore

     api.js can refresh the JWT in the background.
     Without this listener AuthContext.access keeps the OLD token,
     and older components that read `access` directly can continue
     sending the expired JWT.
     ========================================================== */

  useEffect(() => {
    const syncFromAuthStore =
      () => {
        setAccessState(
          getAccessToken() ||
            null,
        );

        setUserState(
          getUser() ||
            null,
        );
      };

    window.addEventListener(
      "ipms:auth-changed",
      syncFromAuthStore,
    );

    /*
     * Also synchronize if another browser tab changes the session.
     */
    window.addEventListener(
      "storage",
      syncFromAuthStore,
    );

    syncFromAuthStore();

    return () => {
      window.removeEventListener(
        "ipms:auth-changed",
        syncFromAuthStore,
      );

      window.removeEventListener(
        "storage",
        syncFromAuthStore,
      );
    };
  }, []);


  /* ==========================================================
     LOGIN / SESSION REPLACEMENT
     ========================================================== */

  const login = ({
    access: nextAccess,
    refresh,
    user: nextUser,
  }) => {
    if (!nextAccess) {
      throw new Error(
        "Login session is missing an access token.",
      );
    }

    if (!refresh) {
      throw new Error(
        "Login session is missing a refresh token.",
      );
    }

    setAuth({
      access: nextAccess,
      refresh,
      user:
        nextUser || null,
    });

    /*
     * Set local React state immediately. The authStore event above
     * also keeps it synchronized after future token refreshes.
     */
    setUserState(
      nextUser || null,
    );

    setAccessState(
      nextAccess,
    );
  };


  /* ==========================================================
     UPDATE CURRENT USER
     ========================================================== */

  const updateUser = (
    updates,
  ) => {
    const updatedUser =
      updateStoredUser(
        updates,
      );

    setUserState(
      updatedUser,
    );

    return updatedUser;
  };


  /* ==========================================================
     SET CURRENT USER
     ========================================================== */

  const setUser = (
    nextUser,
  ) => {
    if (
      typeof nextUser ===
      "function"
    ) {
      setUserState(
        (previous) => {
          const resolved =
            nextUser(
              previous,
            );

          updateStoredUser(
            resolved,
          );

          return resolved;
        },
      );

      return;
    }

    updateStoredUser(
      nextUser,
    );

    setUserState(
      nextUser || null,
    );
  };


  /* ==========================================================
     ASSIGNED ROLES
     ========================================================== */

  const roles = useMemo(
    () =>
      getUserRoles(user),
    [user],
  );


  /* ==========================================================
     ACTIVE ROLE
     ========================================================== */

  const activeRole = useMemo(
    () => {
      const backendActiveRole =
        normalizeRole(
          user?.active_role,
        );

      if (
        backendActiveRole &&
        roles.includes(
          backendActiveRole,
        )
      ) {
        return backendActiveRole;
      }

      const primaryRole =
        normalizeRole(
          user?.role,
        );

      if (
        primaryRole &&
        roles.includes(
          primaryRole,
        )
      ) {
        return primaryRole;
      }

      return (
        roles[0] || null
      );
    },
    [
      user,
      roles,
    ],
  );


  /* ==========================================================
     CAN CHANGE ROLE
     ========================================================== */

  const canSwitchRole =
    useMemo(
      () => {
        const primaryRole =
          normalizeRole(
            user?.role,
          );

        if (
          primaryRole ===
          "engineer"
        ) {
          return false;
        }

        return (
          roles.length > 1
        );
      },
      [
        user,
        roles,
      ],
    );


  /* ==========================================================
     HAS ASSIGNED ROLE
     ========================================================== */

  const hasRole = (
    role,
  ) => {
    const normalized =
      normalizeRole(role);

    if (!normalized) {
      return false;
    }

    return roles.includes(
      normalized,
    );
  };


  /* ==========================================================
     ROLE SWITCH
     ========================================================== */

  const switchRole =
    async (role) => {
      const requestedRole =
        normalizeRole(role);

      if (!requestedRole) {
        throw new Error(
          "Role is required.",
        );
      }

      if (
        !roles.includes(
          requestedRole,
        )
      ) {
        throw new Error(
          "You do not have access to this role.",
        );
      }

      if (
        requestedRole ===
        activeRole
      ) {
        return user;
      }

      const data =
        await fetchAuthenticatedJson(
          "/auth/switch-role/",
          {
            method: "POST",
            body: JSON.stringify({
              role:
                requestedRole,
            }),
          },
        );

      if (
        !data?.access ||
        !data?.refresh ||
        !data?.user
      ) {
        throw new Error(
          "Role switch succeeded but no valid session was returned.",
        );
      }

      const nextUser = {
        ...data.user,

        active_role:
          data.user
            ?.active_role ||
          data.active_role ||
          requestedRole,

        activeRole:
          data.user
            ?.active_role ||
          data.active_role ||
          requestedRole,
      };

      /*
       * Replace access + refresh + user ATOMICALLY.
       */
      login({
        access:
          data.access,
        refresh:
          data.refresh,
        user:
          nextUser,
      });

      return nextUser;
    };


  /*
   * Compatibility alias used by older role-login controls.
   */
  const reauthenticateRole =
    async ({ role }) =>
      switchRole(role);


  /* ==========================================================
     LOGOUT
     ========================================================== */

  const logout = () => {
    clearAuth();

    setUserState(null);
    setAccessState(null);
  };


  /* ==========================================================
     CONTEXT VALUE
     ========================================================== */

  const value = useMemo(
    () => ({
      user,
      access,

      roles,
      activeRole,
      canSwitchRole,

      isAuthenticated:
        Boolean(access),

      login,
      logout,

      updateUser,
      setUser,

      hasRole,
      reauthenticateRole,
      switchRole,
    }),
    [
      access,
      user,
      roles,
      activeRole,
      canSwitchRole,
    ],
  );


  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}


/* ============================================================
   AUTH HOOK
   ============================================================ */

export function useAuth() {
  return useContext(
    AuthContext,
  );
}
