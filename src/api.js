import axios from "axios";

import {
  clearAuth,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "./authStore";

import config from "./config";


/* ============================================================
   AXIOS INSTANCE
   ============================================================ */

const API = axios.create({
  baseURL: config.baseURL,
});


/* ============================================================
   NATIVE FETCH

   IMPORTANT:
   Several older IPMS pages still call plain fetch(...).
   We install one global authenticated fetch bridge below so those
   pages also receive the current JWT automatically.

   Keep a permanent reference to the browser's ORIGINAL fetch so
   HMR / Vite reloads cannot wrap fetch repeatedly.
   ============================================================ */

const ORIGINAL_FETCH_KEY = "__ipms_original_fetch__";

if (
  typeof globalThis !== "undefined" &&
  typeof globalThis.fetch === "function" &&
  !globalThis[ORIGINAL_FETCH_KEY]
) {
  globalThis[ORIGINAL_FETCH_KEY] =
    globalThis.fetch.bind(globalThis);
}

const nativeFetch =
  typeof globalThis !== "undefined"
    ? globalThis[ORIGINAL_FETCH_KEY]
    : null;


let refreshPromise = null;

/*
 * ============================================================
 * REQUEST PERFORMANCE / SAFETY
 * ============================================================
 *
 * - A request is never allowed to keep a page loader alive forever.
 * - Concurrent identical authenticated GET requests share one promise.
 *
 * This is especially important in the Inventory page because several
 * independent loaders need the same Project Inventory / MR / Inward /
 * Outward / Components / PO data at the same time.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

const authenticatedGetInFlight =
  new Map();

const getRequestMethod = (
  options = {},
) =>
  String(
    options?.method || "GET",
  )
    .trim()
    .toUpperCase();

const canDedupeAuthenticatedGet = (
  options = {},
) =>
  getRequestMethod(options) ===
    "GET" &&
  options?.body === undefined &&
  options?.dedupe !== false;

const createTimeoutFetchOptions = (
  options = {},
) => {
  const {
    dedupe: _dedupe,
    timeoutMs:
      requestedTimeoutMs,
    ...fetchOptions
  } = options || {};

  const timeoutMs = Math.max(
    1000,
    Number(
      requestedTimeoutMs ??
        DEFAULT_REQUEST_TIMEOUT_MS,
    ) ||
      DEFAULT_REQUEST_TIMEOUT_MS,
  );

  const timeoutController =
    new AbortController();

  const externalSignal =
    fetchOptions.signal;

  let externalAbortHandler =
    null;

  if (externalSignal) {
    if (externalSignal.aborted) {
      timeoutController.abort(
        externalSignal.reason,
      );
    } else {
      externalAbortHandler = () => {
        timeoutController.abort(
          externalSignal.reason,
        );
      };

      externalSignal.addEventListener(
        "abort",
        externalAbortHandler,
        {
          once: true,
        },
      );
    }
  }

  const timeoutId =
    setTimeout(() => {
      timeoutController.abort(
        new DOMException(
          `Request timed out after ${timeoutMs} ms.`,
          "TimeoutError",
        ),
      );
    }, timeoutMs);

  return {
    fetchOptions: {
      ...fetchOptions,
      signal:
        timeoutController.signal,
    },

    cleanup: () => {
      clearTimeout(timeoutId);

      if (
        externalSignal &&
        externalAbortHandler
      ) {
        externalSignal.removeEventListener(
          "abort",
          externalAbortHandler,
        );
      }
    },

    timeoutMs,

    externalSignal,
  };
};

const fetchWithTimeout = async (
  input,
  options = {},
) => {
  if (!nativeFetch) {
    throw new Error(
      "Fetch API is unavailable.",
    );
  }

  const {
    fetchOptions,
    cleanup,
    timeoutMs,
    externalSignal,
  } = createTimeoutFetchOptions(
    options,
  );

  try {
    return await nativeFetch(
      input,
      fetchOptions,
    );
  } catch (error) {
    const timeoutLike =
      error?.name ===
        "TimeoutError" ||
      (
        error?.name ===
          "AbortError" &&
        !externalSignal?.aborted
      );

    if (timeoutLike) {
      throw new Error(
        `Request timed out after ${Math.round(
          timeoutMs / 1000,
        )} seconds.`,
      );
    }

    throw error;
  } finally {
    cleanup();
  }
};



/* ============================================================
   URL HELPERS
   ============================================================ */

const buildUrl = (path) => {
  if (!path) {
    return config.baseURL;
  }

  if (typeof path !== "string") {
    throw new Error(
      "API path must be a string.",
    );
  }

  return path.startsWith("http")
    ? path
    : `${config.baseURL}${path}`;
};


const getRequestUrl = (input) => {
  if (typeof input === "string") {
    return input;
  }

  if (
    typeof Request !== "undefined" &&
    input instanceof Request
  ) {
    return input.url;
  }

  if (input?.url) {
    return String(input.url);
  }

  return "";
};


const toAbsoluteUrl = (value) => {
  try {
    if (
      typeof window !== "undefined"
    ) {
      return new URL(
        value,
        window.location.origin,
      ).href;
    }

    return new URL(value).href;
  } catch {
    return String(value || "");
  }
};


const getApiBaseAbsolute = () => {
  const raw = String(
    config.baseURL || "",
  ).replace(/\/+$/, "");

  return toAbsoluteUrl(raw);
};


const isApiRequest = (input) => {
  const requestUrl = toAbsoluteUrl(
    getRequestUrl(input),
  );

  const apiBase =
    getApiBaseAbsolute();

  if (!requestUrl || !apiBase) {
    return false;
  }

  return (
    requestUrl === apiBase ||
    requestUrl.startsWith(
      `${apiBase}/`,
    )
  );
};


const isRoleSwitchPath = (path) => {
  const value =
    typeof path === "string"
      ? path
      : getRequestUrl(path);

  return String(value || "").includes(
    "/auth/switch-role/",
  );
};


/*
 * These endpoints MUST work without an existing JWT.
 * Do not force a Bearer token onto them.
 */
const isPublicAuthRequest = (input) => {
  const value = String(
    getRequestUrl(input) || "",
  );

  return [
    "/auth/login/",
    "/auth/login/verify/",
    "/auth/login/resend/",
    "/auth/token/refresh/",
    "/auth/register/",
  ].some((path) =>
    value.includes(path),
  );
};


/* ============================================================
   AUTH / ERROR HELPERS
   ============================================================ */

const redirectToLogin = () => {
  clearAuth();

  if (
    typeof window !== "undefined" &&
    window.location.pathname !==
      "/login" &&
    window.location.pathname !== "/"
  ) {
    window.location.replace(
      "/login",
    );
  }
};


const readResponse = async (
  response,
) => {
  if (response.status === 204) {
    return null;
  }

  const contentType =
    response.headers.get(
      "content-type",
    ) || "";

  if (
    contentType.includes(
      "application/json",
    )
  ) {
    return response.json();
  }

  return response.text();
};


const getErrorMessage = (
  data,
  fallback = "Request failed.",
) => {
  if (!data) {
    return fallback;
  }

  if (typeof data === "string") {
    return data || fallback;
  }

  if (data.detail) {
    return Array.isArray(data.detail)
      ? data.detail.join(" ")
      : String(data.detail);
  }

  const message = Object.entries(data)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: ${value.join(
          ", ",
        )}`;
      }

      if (
        value &&
        typeof value === "object"
      ) {
        return `${key}: ${JSON.stringify(
          value,
        )}`;
      }

      return `${key}: ${value}`;
    })
    .join("; ");

  return message || fallback;
};


/* ============================================================
   TOKEN REFRESH

   All simultaneous 401 responses share ONE refresh request.
   ============================================================ */

export const refreshAccessToken =
  async () => {
    if (refreshPromise) {
      return refreshPromise;
    }

    const refresh =
      getRefreshToken();

    if (!refresh) {
      throw new Error(
        "Refresh token is missing.",
      );
    }

    if (!nativeFetch) {
      throw new Error(
        "Fetch API is unavailable.",
      );
    }

    refreshPromise = fetchWithTimeout(
      `${config.baseURL}/auth/token/refresh/`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          refresh,
        }),
        timeoutMs: 15000,
      },
    )
      .then(async (response) => {
        const data =
          await readResponse(
            response,
          );

        if (
          !response.ok ||
          !data?.access
        ) {
          throw new Error(
            getErrorMessage(
              data,
              "Session refresh failed.",
            ),
          );
        }

        /*
         * Standard SimpleJWT normally returns only a new access
         * token. If ROTATE_REFRESH_TOKENS is enabled later, keep
         * the returned refresh token as well.
         */
        setAccessToken(
          data.access,
        );

        if (data?.refresh) {
          setRefreshToken(
            data.refresh,
          );
        }

        return data.access;
      })
      .finally(() => {
        refreshPromise = null;
      });

    return refreshPromise;
  };


/* ============================================================
   FETCH HEADER HELPER
   ============================================================ */

const fetchWithAccessToken = async (
  input,
  options = {},
  accessToken = null,
) => {
  if (!nativeFetch) {
    throw new Error(
      "Fetch API is unavailable.",
    );
  }

  const sourceHeaders =
    options.headers ||
    (
      typeof Request !==
        "undefined" &&
      input instanceof Request
        ? input.headers
        : undefined
    );

  const headers =
    new Headers(
      sourceHeaders || {},
    );

  if (accessToken) {
    headers.set(
      "Authorization",
      `Bearer ${accessToken}`,
    );
  }

  const body = options.body;

  const isFormData =
    typeof FormData !==
      "undefined" &&
    body instanceof FormData;

  if (isFormData) {
    /*
     * Browser must generate multipart boundary.
     */
    headers.delete(
      "Content-Type",
    );
  } else if (
    body !== undefined &&
    body !== null &&
    !headers.has(
      "Content-Type",
    )
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  return fetchWithTimeout(
    input,
    {
      ...options,
      headers,
    },
  );
};


/* ============================================================
   GLOBAL LEGACY FETCH BRIDGE

   WHY THIS EXISTS:
   Some current IPMS modules still contain code like:

       fetch(`${config.baseURL}/materialrequest/...`)

   Those calls do not manually attach Authorization and Django
   correctly returns 401.

   This bridge means:
   - existing plain fetch API calls receive Bearer <JWT>
   - expired access token refreshes once
   - request retries once
   - public login/OTP/refresh endpoints remain public

   This avoids having to immediately rewrite every old page.
   New code should still prefer fetchAuthenticatedJson().
   ============================================================ */

const globalAuthenticatedFetch =
  async (
    input,
    options = {},
  ) => {
    /*
     * External / non-IPMS requests remain untouched.
     */
    if (
      !isApiRequest(input) ||
      isPublicAuthRequest(input)
    ) {
      return nativeFetch(
        input,
        options,
      );
    }

    const access =
      getAccessToken();

    let response =
      await fetchWithAccessToken(
        input,
        options,
        access,
      );

    if (
      response.status !== 401
    ) {
      return response;
    }

    /*
     * Access token may simply be expired.
     * Refresh once and repeat this exact request.
     */
    try {
      const nextAccess =
        await refreshAccessToken();

      response =
        await fetchWithAccessToken(
          input,
          options,
          nextAccess,
        );

      if (
        response.status === 401
      ) {
        redirectToLogin();
      }

      return response;
    } catch (
      refreshError
    ) {
      console.error(
        "JWT refresh failed:",
        refreshError,
      );

      redirectToLogin();

      /*
       * Return the original 401 response so older pages that do
       * `await response.json()` do not crash before redirect.
       */
      return response;
    }
  };


if (
  typeof window !== "undefined" &&
  nativeFetch
) {
  window.fetch =
    globalAuthenticatedFetch;

  window.__ipms_authenticated_fetch_installed__ =
    true;
}


/* ============================================================
   AXIOS REQUEST INTERCEPTOR
   ============================================================ */

API.interceptors.request.use(
  (requestConfig) => {
    const token =
      getAccessToken();

    requestConfig.headers =
      requestConfig.headers || {};

    if (token) {
      requestConfig.headers.Authorization =
        `Bearer ${token}`;
    }

    const isFormData =
      typeof FormData !==
        "undefined" &&
      requestConfig.data instanceof
        FormData;

    const hasBody =
      requestConfig.data !==
        undefined &&
      requestConfig.data !== null;

    if (isFormData) {
      delete requestConfig.headers[
        "Content-Type"
      ];
    } else if (
      hasBody &&
      !requestConfig.headers[
        "Content-Type"
      ]
    ) {
      requestConfig.headers[
        "Content-Type"
      ] = "application/json";
    }

    return requestConfig;
  },
);


/* ============================================================
   AXIOS RESPONSE INTERCEPTOR
   ============================================================ */

API.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest =
      error.config;

    const status =
      error.response?.status;

    const requestUrl =
      originalRequest?.url || "";

    /*
     * Failed role switching must NOT destroy the currently
     * active role session.
     */
    if (
      isRoleSwitchPath(
        requestUrl,
      ) &&
      (
        status === 400 ||
        status === 401 ||
        status === 403
      )
    ) {
      return Promise.reject(
        error,
      );
    }

    if (status === 403) {
      return Promise.reject(
        error,
      );
    }

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._jwtRetried
    ) {
      originalRequest._jwtRetried =
        true;

      try {
        const access =
          await refreshAccessToken();

        originalRequest.headers =
          originalRequest.headers ||
          {};

        originalRequest.headers.Authorization =
          `Bearer ${access}`;

        return API(
          originalRequest,
        );
      } catch (
        refreshError
      ) {
        redirectToLogin();

        return Promise.reject(
          refreshError,
        );
      }
    }

    return Promise.reject(error);
  },
);


/* ============================================================
   PUBLIC JSON FETCH
   ============================================================ */

export async function fetchJson(
  path,
  options = {},
) {
  const body = options.body;

  const isFormData =
    typeof FormData !==
      "undefined" &&
    body instanceof FormData;

  const headers = new Headers(
    options.headers || {},
  );

  if (
    !isFormData &&
    body !== undefined &&
    body !== null &&
    !headers.has(
      "Content-Type",
    )
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  if (isFormData) {
    headers.delete(
      "Content-Type",
    );
  }

  const response =
    await fetchWithTimeout(
      buildUrl(path),
      {
        ...options,
        headers,
      },
    );

  const data =
    await readResponse(
      response,
    );

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        response.statusText,
      ),
    );
  }

  return data;
}


/* ============================================================
   AUTHENTICATED JSON FETCH
   ============================================================ */

async function authenticatedRequest(
  path,
  options = {},
  canRefresh = true,
) {
  let access = getAccessToken();

  if (!access && canRefresh && getRefreshToken()) {
    try {
      access = await refreshAccessToken();
    } catch (refreshError) {
      redirectToLogin();
      throw refreshError;
    }
  }

  const response =
    await fetchWithAccessToken(
      buildUrl(path),
      options,
      access,
    );

  /*
   * Role switch 400/401/403 is a role access error, not a
   * reason to destroy the current session.
   */
  if (
    isRoleSwitchPath(path) &&
    (
      response.status === 400 ||
      response.status === 401 ||
      response.status === 403
    )
  ) {
    const data =
      await readResponse(
        response,
      );

    throw new Error(
      getErrorMessage(
        data,
        "Unable to verify role access.",
      ),
    );
  }

  /*
   * Normal access-token expiry.
   */
  if (
    response.status === 401 &&
    canRefresh
  ) {
    try {
      await refreshAccessToken();

      return authenticatedRequest(
        path,
        options,
        false,
      );
    } catch (
      refreshError
    ) {
      redirectToLogin();
      throw refreshError;
    }
  }

  const data =
    await readResponse(
      response,
    );

  if (
    response.status === 403
  ) {
    throw new Error(
      getErrorMessage(
        data,
        "You do not have permission to perform this action.",
      ),
    );
  }

  if (
    response.status === 401
  ) {
    redirectToLogin();

    throw new Error(
      getErrorMessage(
        data,
        "Your session has expired.",
      ),
    );
  }

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        response.statusText ||
          "Request failed.",
      ),
    );
  }

  return data;
}


export function fetchAuthenticatedJson(
  path,
  options = {},
) {
  const shouldDedupe =
    canDedupeAuthenticatedGet(
      options,
    );

  if (!shouldDedupe) {
    return authenticatedRequest(
      path,
      options,
      true,
    );
  }

  const requestKey =
    buildUrl(path);

  const existingRequest =
    authenticatedGetInFlight.get(
      requestKey,
    );

  if (existingRequest) {
    return existingRequest;
  }

  const requestPromise =
    authenticatedRequest(
      path,
      options,
      true,
    );

  authenticatedGetInFlight.set(
    requestKey,
    requestPromise,
  );

  /*
   * Delete only if this exact promise is still registered.
   * A later request must never be removed by an older finally().
   */
  requestPromise
    .finally(() => {
      if (
        authenticatedGetInFlight.get(
          requestKey,
        ) === requestPromise
      ) {
        authenticatedGetInFlight.delete(
          requestKey,
        );
      }
    })
    .catch(() => {});

  return requestPromise;
}


export default API;
