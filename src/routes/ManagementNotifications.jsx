import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { PageHeader, PageShell } from "@/components/app/PageShell";
import { fetchAuthenticatedJson } from "@/api";
import config from "@/config";
import { useAuth } from "@/AuthContext";


const NOTIFICATION_FETCH_PAGE_SIZE = 200;
const notificationInFlightRequests = new Map();

const NOTIFICATION_RELATED_LIST_CACHE_TTL_MS = 5000;
const NOTIFICATION_DETAIL_CACHE_TTL_MS = 15000;
const notificationCompletedRequestCache = new Map();
const notificationDetailCache = new Map();
const notificationDetailInFlightRequests = new Map();


const resolveNotificationPageUrl = (url) => {
  const value = String(url || "").trim();
  if (!value) return "";

  if (
    /^https?:\/\//i.test(value) ||
    value.startsWith("/")
  ) {
    return value;
  }

  const base = String(config.baseURL || "")
    .replace(/\/+$/, "");

  return base
    ? `${base}/${value.replace(/^\/+/, "")}`
    : value;
};

const fetchAllNotificationPages = async (
  initialUrl,
  options = {},
) => {
  const rows = [];
  const visitedUrls = new Set();
  let nextUrl = initialUrl;

  while (nextUrl) {
    const resolvedUrl =
      resolveNotificationPageUrl(nextUrl);

    if (
      !resolvedUrl ||
      visitedUrls.has(resolvedUrl)
    ) {
      break;
    }

    visitedUrls.add(resolvedUrl);

    const payload =
      await fetchAuthenticatedJson(
        resolvedUrl,
        options,
      );

    if (!payload) {
      break;
    }

    if (Array.isArray(payload)) {
      rows.push(...payload);
      break;
    }

    const pageRows =
      Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

    rows.push(...pageRows);

    nextUrl =
      payload?.next ||
      payload?.links?.next ||
      "";
  }

  return rows;
};

const fetchAllNotificationPagesShared = (
  initialUrl,
  options = {},
) => {
  const method = String(
    options?.method || "GET",
  ).toUpperCase();

  const {
    ttlMs,
    forceRefresh = false,
    ...requestOptions
  } = options || {};

  if (method !== "GET") {
    return fetchAllNotificationPages(
      initialUrl,
      requestOptions,
    );
  }

  const key = `${method}:${String(initialUrl)}`;

  /*
   * Notification rows themselves must stay fresh.
   * Related lookup/master datasets get a tiny cache only to collapse
   * duplicate event-driven reloads occurring within a few seconds.
   */
  const effectiveTtlMs =
    ttlMs !== undefined
      ? Number(ttlMs) || 0
      : String(initialUrl).includes("/notifications/")
        ? 0
        : NOTIFICATION_RELATED_LIST_CACHE_TTL_MS;

  if (!forceRefresh && effectiveTtlMs > 0) {
    const cached =
      notificationCompletedRequestCache.get(key);

    if (
      cached &&
      Date.now() - cached.createdAt <
        effectiveTtlMs
    ) {
      return Promise.resolve(cached.value);
    }
  }

  if (
    notificationInFlightRequests.has(key)
  ) {
    return notificationInFlightRequests.get(
      key,
    );
  }

  const request =
    fetchAllNotificationPages(
      initialUrl,
      requestOptions,
    )
      .then((rows) => {
        if (effectiveTtlMs > 0) {
          notificationCompletedRequestCache.set(
            key,
            {
              createdAt: Date.now(),
              value: rows,
            },
          );
        }

        return rows;
      })
      .finally(() => {
        notificationInFlightRequests.delete(
          key,
        );
      });

  notificationInFlightRequests.set(
    key,
    request,
  );

  return request;
};

const fetchNotificationDetailCached = async (
  url,
  options = {},
) => {
  const {
    ttlMs = NOTIFICATION_DETAIL_CACHE_TTL_MS,
    forceRefresh = false,
    ...requestOptions
  } = options || {};

  const resolvedUrl =
    resolveNotificationPageUrl(url);

  if (!resolvedUrl) {
    throw new Error(
      "Notification detail URL is missing.",
    );
  }

  const key = `GET:${resolvedUrl}`;

  if (!forceRefresh && ttlMs > 0) {
    const cached =
      notificationDetailCache.get(key);

    if (
      cached &&
      Date.now() - cached.createdAt < ttlMs
    ) {
      return cached.value;
    }
  }

  if (
    notificationDetailInFlightRequests.has(
      key,
    )
  ) {
    return notificationDetailInFlightRequests.get(
      key,
    );
  }

  const request =
    fetchAuthenticatedJson(
      resolvedUrl,
      requestOptions,
    )
      .then((value) => {
        if (ttlMs > 0) {
          notificationDetailCache.set(
            key,
            {
              createdAt: Date.now(),
              value,
            },
          );
        }

        return value;
      })
      .finally(() => {
        notificationDetailInFlightRequests.delete(
          key,
        );
      });

  notificationDetailInFlightRequests.set(
    key,
    request,
  );

  return request;
};

const invalidateNotificationLoadingCache = () => {
  notificationCompletedRequestCache.clear();
  notificationDetailCache.clear();
};

const toList = (payload) =>
  Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : [];

const normalizeStatus = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const formatStatus = (value) => {
  const status = normalizeStatus(value);

  if (status === "PENDING_MANAGEMENT") return "Pending Management";
  if (status === "MANAGEMENT_APPROVED" || status === "APPROVED") {
    return "Approved";
  }
  if (status === "MANAGEMENT_REJECTED") return "Management Rejected";

  return status
    ? status
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Pending Management";
};

const getRowReference = (row = {}) =>
  String(
    row?.material_request_number ||
      row?.materialRequestNumber ||
      row?.material_request ||
      row?.materialRequest ||
      row?.id ||
      "",
  ).trim();

const getComponentLabel = (row = {}) =>
  row?.component_name ||
  row?.componentName ||
  row?.product_name ||
  row?.productName ||
  row?.component ||
  "Component";

export default function ManagementNotifications() {
  const { user, activeRole } = useAuth();
  const role = String(
    activeRole || user?.active_role || user?.role || "",
  )
    .trim()
    .toLowerCase();

  const [notifications, setNotifications] = useState([]);
  const [salesRows, setSalesRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [processingId, setProcessingId] = useState("");
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState("");

  const loadData = useCallback(
    async (
      {
        showLoader = true,
        forceRefresh = false,
      } = {},
    ) => {
      if (showLoader) {
        setLoading(true);
      }

      setLoadError("");

      try {
        const [notificationPayload, outwardPayload] =
          await Promise.all([
            fetchAllNotificationPagesShared(
              `${config.baseURL}/notifications/?receiver=MANAGEMENT&category=SALES&page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
              {
                cache: "no-store",
                forceRefresh,
              },
            ),
            fetchAllNotificationPagesShared(
              `${config.baseURL}/outward/?outward_type=SALES&page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
              {
                cache: "no-store",
                forceRefresh,
              },
            ),
          ]);

      setNotifications(
        toList(notificationPayload).filter(
          (notification) =>
            normalizeStatus(notification?.category) === "SALES" &&
            normalizeStatus(notification?.receiver) === "MANAGEMENT",
        ),
      );

      setSalesRows(
        toList(outwardPayload).filter(
          (row) => normalizeStatus(row?.outward_type || row?.type) === "SALES",
        ),
      );
    } catch (error) {
      console.error("Failed to load Management Sales notifications:", error);
      setNotifications([]);
      setSalesRows([]);
      setLoadError(
        error?.message ||
          "Unable to load Management Sales notifications.",
      );
      } finally {
        if (showLoader) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    let refreshTimer = null;

    void loadData({ showLoader: true });

    const refresh = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(
        () =>
          void loadData({
            showLoader: false,
          }),
        150,
      );
    };

    window.addEventListener(
      "notificationsUpdated",
      refresh,
    );
    window.addEventListener(
      "salesUpdated",
      refresh,
    );

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      window.removeEventListener(
        "notificationsUpdated",
        refresh,
      );
      window.removeEventListener(
        "salesUpdated",
        refresh,
      );
    };
  }, [loadData]);

  const pendingItems = useMemo(() => {
    const salesById = new Map(
      salesRows.map((row) => [String(row.id), row]),
    );

    return notifications
      .filter(
        (notification) =>
          normalizeStatus(notification?.status) === "PENDING_MANAGEMENT" &&
          notification?.is_read !== true,
      )
      .map((notification) => {
        const firstRow = salesById.get(
          String(notification?.reference_id || ""),
        );

        if (!firstRow) {
          return null;
        }

        const reference = getRowReference(firstRow);
        const groupedRows = salesRows.filter(
          (row) => getRowReference(row) === reference,
        );

        return {
          notification,
          firstRow,
          rows: groupedRows.length ? groupedRows : [firstRow],
          reference,
        };
      })
      .filter(Boolean);
  }, [notifications, salesRows]);

  const runAction = async (item, action, reason = "") => {
    const outwardId = item?.firstRow?.id;

    if (!outwardId || processingId) {
      return false;
    }

    const actionKey = String(outwardId);
    const isApprove = action === "approve";

    setProcessingId(actionKey);
    setActionError("");

    try {
      const endpoint = isApprove
        ? "management-sales-approve"
        : "management-sales-reject";

      const response =
        await fetchAuthenticatedJson(
          `${config.baseURL}/outward/${encodeURIComponent(
            outwardId,
          )}/${endpoint}/`,
          {
            method: "POST",
            body: JSON.stringify(
              isApprove
                ? {}
                : {
                    reason,
                  },
            ),
          },
        );

      /*
       * The backend has already committed the decision at this point.
       *
       * Do not leave the row showing Pending Management while waiting for
       * notificationsUpdated/salesUpdated and another large GET. Update the
       * Management UI immediately.
       */
      const processedNotificationStatus =
        isApprove
          ? "MANAGEMENT_APPROVED"
          : "MANAGEMENT_REJECTED";

      const processedSalesStatus =
        isApprove
          ? "APPROVED"
          : "MANAGEMENT_REJECTED";

      const notificationId =
        item?.notification?.id;

      const groupedSalesIds = new Set(
        (item?.rows || [])
          .map((row) =>
            String(row?.id ?? ""),
          )
          .filter(Boolean),
      );

      /*
       * Remove this request from the pending Management queue immediately.
       * pendingItems only accepts PENDING_MANAGEMENT + unread, so either of
       * these fields is enough; applying both mirrors the backend.
       */
      setNotifications((previous) =>
        previous.map((notification) =>
          String(notification?.id ?? "") ===
          String(notificationId ?? "")
            ? {
                ...notification,
                status:
                  processedNotificationStatus,
                is_read: true,
              }
            : notification,
        ),
      );

      /*
       * Keep the local Sales rows consistent too. This prevents a stale
       * Outward list response from making the row look pending again.
       */
      setSalesRows((previous) =>
        previous.map((row) =>
          groupedSalesIds.has(
            String(row?.id ?? ""),
          )
            ? {
                ...row,
                status:
                  processedSalesStatus,
                approval_status:
                  processedSalesStatus,
                rejection_reason:
                  isApprove
                    ? null
                    : reason,
              }
            : row,
        ),
      );

      setRejecting(null);
      setRejectReason("");

      /*
       * Clear both the 5-second related list cache and the 15-second detail
       * cache before any event-driven reload starts.
       */
      invalidateNotificationLoadingCache();

      window.dispatchEvent(
        new Event("notificationsUpdated"),
      );

      window.dispatchEvent(
        new Event("salesUpdated"),
      );

      /*
       * Reconcile with authoritative backend state in the background.
       * Do not keep the Approve button blocked on this reload.
       */
      window.setTimeout(() => {
        invalidateNotificationLoadingCache();

        void loadData({
          showLoader: false,
          forceRefresh: true,
        }).catch((refreshError) => {
          console.warn(
            "Management Sales decision succeeded, but background refresh failed:",
            refreshError,
          );
        });
      }, 0);

      console.debug(
        "Management Sales decision completed:",
        {
          outwardId,
          action,
          response,
        },
      );

      return true;
    } catch (error) {
      const rawMessage = String(
        error?.message ||
          error?.detail ||
          "",
      ).trim();

      const errorStatus = Number(
        error?.status ||
          error?.statusCode ||
          error?.response?.status ||
          0,
      );

      const isUnauthorized =
        errorStatus === 401 ||
        /401|unauthorized|authentication\s+is\s+required|token.*(?:expired|invalid)/i.test(
          rawMessage,
        );

      setActionError(
        isUnauthorized
          ? "Your Management login session is not authenticated. Log in again, select Management as the active role, and retry."
          : (
              rawMessage ||
              `Unable to ${action} this Sales request.`
            ),
      );

      console.error(
        `Management Sales ${action} failed:`,
        error,
      );

      return false;
    } finally {
      setProcessingId("");
    }
  };

  if (!["management", "admin"].includes(role)) {
    return (
      <PageShell>
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Management access is required for Sales approvals.
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Management Notifications"
        subtitle="Review Sales requests submitted by Finance from Inventory → In Drone."
      />

      {actionError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {actionError}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-[1.15fr_2.2fr_1fr_1.1fr_1.5fr] bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <div>MR / Reference</div>
          <div>Sales Components</div>
          <div>Requested By</div>
          <div>Status</div>
          <div className="text-center">Action</div>
        </div>

        {loading ? (
          <div className="flex min-h-[180px] items-center justify-center border-t border-border/60">
            <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
              <Loader2 className="size-7 animate-spin text-primary" />
              <div>
                <p className="text-sm font-semibold">Loading Sales approvals...</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fetching the latest Finance → Management Sales requests.
                </p>
              </div>
            </div>
          </div>
        ) : loadError ? (
          <div className="flex min-h-[150px] items-center justify-center border-t border-red-200 bg-red-50 px-6 py-8 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {loadError}
          </div>
        ) : pendingItems.length === 0 ? (
          <div className="flex min-h-[150px] items-center justify-center border-t border-border/60 px-6 py-8 text-center text-sm text-muted-foreground">
            No Sales requests are waiting for Management approval.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {pendingItems.map((item) => {
              const busy = processingId === String(item.firstRow.id);
              const componentSummary = item.rows
                .map(
                  (row) =>
                    `${getComponentLabel(row)}-${Number(
                      row?.quantity || row?.qty || 0,
                    )}`,
                )
                .join(", ");

              return (
                <div
                  key={item.notification.id}
                  className="grid grid-cols-[1.15fr_2.2fr_1fr_1.1fr_1.5fr] items-center px-4 py-4 text-sm"
                >
                  <div className="font-semibold">
                    {item.firstRow.material_request_number ||
                      item.reference ||
                      item.firstRow.code ||
                      "-"}
                  </div>

                  <div>
                    <div className="font-medium">{componentSummary || "-"}</div>
                    {item.firstRow.remarks ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.firstRow.remarks}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    {item.notification.requested_by ||
                      item.firstRow.requested_by ||
                      "Finance"}
                  </div>

                  <div>
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                      {formatStatus(item.notification.status)}
                    </span>
                  </div>

                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runAction(item, "approve")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Check className="size-3.5" />
                      {busy ? "Processing..." : "Approve"}
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setActionError("");
                        setRejectReason("");
                        setRejecting(item);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <X className="size-3.5" />
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 className="text-lg font-semibold">Reject Sales Request</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {rejecting.firstRow.material_request_number || rejecting.reference}
            </p>

            <label className="mt-5 block text-sm font-medium">
              Rejection Reason *
            </label>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Enter the reason for rejecting this Sales request..."
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRejecting(null);
                  setRejectReason("");
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim() || Boolean(processingId)}
                onClick={() =>
                  void runAction(rejecting, "reject", rejectReason.trim())
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Reject Sales
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
