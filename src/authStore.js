/* ============================================================
   IPMS AUTH STORE

   One canonical session is stored in "auth_state".
   Mirror keys are retained because several older pages still read
   ipms_access / ipms_refresh / ipms_user directly.
   ============================================================ */

const STORAGE_KEY =
  "auth_state";

const MIRROR_KEYS = {
  access: "ipms_access",
  refresh: "ipms_refresh",
  user: "ipms_user",
};

const LEGACY_KEYS = [
  "access",
  "access_token",
  "accessToken",
  "refresh",
  "refresh_token",
  "refreshToken",
  "user",
  "authUser",
  "currentUser",
];

const EMPTY_AUTH_STATE = {
  access: null,
  refresh: null,
  user: null,
};


const parseJson = (value) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};


const clearLegacyAuthKeys =
  () => {
    if (
      typeof window ===
      "undefined"
    ) {
      return;
    }

    for (const storage of [
      window.localStorage,
      window.sessionStorage,
    ]) {
      LEGACY_KEYS.forEach(
        (key) => {
          storage.removeItem(
            key,
          );
        },
      );
    }
  };


function loadAuthState() {
  if (
    typeof window ===
    "undefined"
  ) {
    return {
      ...EMPTY_AUTH_STATE,
    };
  }

  const canonical = parseJson(
    window.localStorage.getItem(
      STORAGE_KEY,
    ),
  );

  if (
    canonical &&
    (
      canonical.access ||
      canonical.refresh ||
      canonical.user
    )
  ) {
    return {
      access:
        canonical.access ||
        null,
      refresh:
        canonical.refresh ||
        null,
      user:
        canonical.user ||
        null,
    };
  }

  /*
   * Recover a session created by an older frontend build.
   */
  const access =
    window.localStorage.getItem(
      MIRROR_KEYS.access,
    ) ||
    window.localStorage.getItem(
      "access",
    ) ||
    window.localStorage.getItem(
      "access_token",
    ) ||
    window.localStorage.getItem(
      "accessToken",
    ) ||
    window.sessionStorage.getItem(
      "access",
    ) ||
    window.sessionStorage.getItem(
      "access_token",
    ) ||
    window.sessionStorage.getItem(
      "accessToken",
    ) ||
    null;

  const refresh =
    window.localStorage.getItem(
      MIRROR_KEYS.refresh,
    ) ||
    window.localStorage.getItem(
      "refresh",
    ) ||
    window.localStorage.getItem(
      "refresh_token",
    ) ||
    window.localStorage.getItem(
      "refreshToken",
    ) ||
    window.sessionStorage.getItem(
      "refresh",
    ) ||
    window.sessionStorage.getItem(
      "refresh_token",
    ) ||
    window.sessionStorage.getItem(
      "refreshToken",
    ) ||
    null;

  const user =
    parseJson(
      window.localStorage.getItem(
        MIRROR_KEYS.user,
      ),
    ) ||
    parseJson(
      window.localStorage.getItem(
        "user",
      ),
    ) ||
    parseJson(
      window.sessionStorage.getItem(
        "user",
      ),
    ) ||
    null;

  return {
    access,
    refresh,
    user,
  };
}


let authState =
  loadAuthState();


const emitAuthChanged = () => {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(
      "ipms:auth-changed",
      {
        detail: {
          access:
            authState.access,
          refresh:
            authState.refresh,
          user:
            authState.user,
        },
      },
    ),
  );
};


function saveAuthState(
  state,
  {
    emit = true,
  } = {},
) {
  authState = {
    access:
      state?.access ||
      null,
    refresh:
      state?.refresh ||
      null,
    user:
      state?.user ||
      null,
  };

  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      authState,
    ),
  );

  if (authState.access) {
    window.localStorage.setItem(
      MIRROR_KEYS.access,
      authState.access,
    );
  } else {
    window.localStorage.removeItem(
      MIRROR_KEYS.access,
    );
  }

  if (authState.refresh) {
    window.localStorage.setItem(
      MIRROR_KEYS.refresh,
      authState.refresh,
    );
  } else {
    window.localStorage.removeItem(
      MIRROR_KEYS.refresh,
    );
  }

  if (authState.user) {
    window.localStorage.setItem(
      MIRROR_KEYS.user,
      JSON.stringify(
        authState.user,
      ),
    );
  } else {
    window.localStorage.removeItem(
      MIRROR_KEYS.user,
    );
  }

  if (emit) {
    emitAuthChanged();
  }
}


/*
 * Normalize a recovered old session into the new canonical format.
 */
if (
  authState.access ||
  authState.refresh ||
  authState.user
) {
  saveAuthState(
    authState,
    {
      emit: false,
    },
  );
}


export function getAuthState() {
  return {
    ...authState,
  };
}


export function getAccessToken() {
  return (
    authState.access ||
    null
  );
}


export function getRefreshToken() {
  return (
    authState.refresh ||
    null
  );
}


export function getUser() {
  return (
    authState.user ||
    null
  );
}


export function isAuthenticated() {
  return Boolean(
    authState.access,
  );
}


export function setAuth({
  access,
  refresh,
  user,
}) {
  /*
   * Remove stale token names from older builds so there is only one
   * current session.
   */
  clearLegacyAuthKeys();

  saveAuthState({
    access:
      access || null,
    refresh:
      refresh || null,
    user:
      user || null,
  });

  return getAuthState();
}


export function setAccessToken(
  access,
) {
  saveAuthState({
    ...authState,
    access:
      access || null,
  });

  return (
    authState.access
  );
}


export function setRefreshToken(
  refresh,
) {
  saveAuthState({
    ...authState,
    refresh:
      refresh || null,
  });

  return (
    authState.refresh
  );
}


export function setStoredUser(
  user,
) {
  saveAuthState({
    ...authState,
    user:
      user || null,
  });

  return (
    authState.user
  );
}


export function updateStoredUser(
  updates,
) {
  const currentUser =
    authState.user &&
    typeof authState.user ===
      "object"
      ? authState.user
      : {};

  const updatedUser = {
    ...currentUser,
    ...(updates || {}),
  };

  saveAuthState({
    ...authState,
    user: updatedUser,
  });

  return updatedUser;
}


export function clearAuth() {
  authState = {
    ...EMPTY_AUTH_STATE,
  };

  if (
    typeof window !==
    "undefined"
  ) {
    window.localStorage.removeItem(
      STORAGE_KEY,
    );

    Object.values(
      MIRROR_KEYS,
    ).forEach(
      (key) => {
        window.localStorage.removeItem(
          key,
        );
      },
    );

    clearLegacyAuthKeys();

    emitAuthChanged();
  }
}


export function getAuthStorageKeys() {
  return {
    state:
      STORAGE_KEY,
    access:
      MIRROR_KEYS.access,
    refresh:
      MIRROR_KEYS.refresh,
    user:
      MIRROR_KEYS.user,
  };
}
