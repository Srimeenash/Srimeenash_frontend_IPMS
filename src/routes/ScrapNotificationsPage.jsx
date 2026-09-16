import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { StatusBadge } from "@/components/app/DataTable";
import { useCostDetails } from "@/components/app/SerialCostDetails";
import config from "@/config";
import { fetchAuthenticatedJson } from "@/api";
import { Loader2 } from "lucide-react";
import { canViewCosting, getUserRole } from "@/permissions";


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

const NotificationTableLoader = ({
  title = "Loading notifications...",
  subtitle = "Fetching the latest notification and workflow details.",
}) => (
  <div className="flex min-h-[170px] w-full items-center justify-center border-t border-border/60 bg-background">
    <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <Loader2 className="size-7 animate-spin text-primary" />
      <div>
        <p className="text-sm font-semibold text-foreground">
          {title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {subtitle}
        </p>
      </div>
    </div>
  </div>
);

export default function ScrapNotificationsPage() {
  const { user, activeRole } = useAuth();
  const { openCostDetails, costDetailsPage } =
    useCostDetails();

  const role = useMemo(
    () => getUserRole(user, activeRole),
    [user, activeRole],
  );

  const isAdmin = role === "admin";

  const canSeeCosting =
    canViewCosting(
      user,
      activeRole,
    );
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [activeRejectNotification, setActiveRejectNotification] = useState(null);
  const [pendingRejectStatus, setPendingRejectStatus] = useState("");

  // One-click protection for approve/reject operations.
  const [processingNotificationId, setProcessingNotificationId] = useState(null);
  const processingNotificationsRef = useRef(new Set());

  useEffect(() => {
    loadNotifications();
  }, [isAdmin]);

  const loadNotifications = async () => {
    setLoading(true);

    try {
      const results =
        await fetchAllNotificationPagesShared(
          `/notifications/?category=SCRAP&page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
          { cache: "no-store" },
        );

      const scrapNotifications = await Promise.all(
        results
          .filter((n) => {
            if (n.category !== "SCRAP") return false;
            const status = String(n.status || "").toUpperCase();

            if (isAdmin) return status === "REQUESTED";
            return ["REQUESTED", "APPROVED", "REJECTED"].includes(status);
          })
          .map(async (n) => {
            let scrap = null;

            try {
              scrap =
                await fetchNotificationDetailCached(
                  `/outward/outward-entries/${encodeURIComponent(
                    n.reference_id,
                  )}/`,
                  { cache: "no-store" },
                );
            } catch (e) {
              console.error("Failed to fetch scrap details", e);
            }

            return {
              id: n.id,
              scrapId: scrap?.id || n.reference_id,
              code: scrap?.code || n.title || n.reference_id,
              status: String(n.status || "REQUESTED").toUpperCase(),
              remarks: scrap?.remarks || n.message || "",
              type: scrap?.outward_type || "SCRAP",
              date: scrap?.out_date || new Date().toISOString().split("T")[0],
              rejectedBy: scrap?.rejected_by || "",
              rejectionReason: scrap?.rejection_reason || "",
              scrapData: scrap,
            };
          })
      );

      setNotifications(scrapNotifications);
    } catch (err) {
      console.error("Failed to load scrap notifications", err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  // UPDATE STATUS
  const updateStatus = async (notificationId, scrapId, newStatus, reason = "") => {
    if (!notificationId || !scrapId) {
      console.error("Notification ID or Scrap ID is missing");
      return false;
    }

    const notificationKey = String(notificationId);

    // Ignore fast second/third clicks while the first request is running.
    if (processingNotificationsRef.current.has(notificationKey)) {
      return false;
    }

    processingNotificationsRef.current.add(notificationKey);
    setProcessingNotificationId(notificationKey);

    const approvalStatus = String(newStatus || "").toUpperCase();
    const previousNotifications = notifications;

    // Immediate visual response on the first click.
    // Admin normally only sees REQUESTED rows, so remove a completed row
    // immediately. Non-admin views keep the row and update its status.
    setNotifications((previous) =>
      isAdmin
        ? previous.filter(
            (item) => String(item.id) !== notificationKey
          )
        : previous.map((item) =>
            String(item.id) === notificationKey
              ? {
                  ...item,
                  status: approvalStatus,
                  rejectionReason:
                    approvalStatus === "REJECTED"
                      ? reason
                      : item.rejectionReason,
                  rejectedBy:
                    approvalStatus === "REJECTED"
                      ? "admin"
                      : item.rejectedBy,
                }
              : item
          )
    );

    try {
      const statusMapping = {
        approval_status: approvalStatus,
        status: approvalStatus,
      };

      const scrapPayload = { ...statusMapping };
      const notificationPayload = {
        status: approvalStatus,
        is_read: true,
      };

      if (approvalStatus === "REJECTED") {
        const trimmedReason = String(reason || "").trim();

        scrapPayload.rejection_reason = trimmedReason;
        notificationPayload.rejection_reason = trimmedReason;

        if (isAdmin) {
          scrapPayload.rejected_by = "admin";
          notificationPayload.rejected_by = "admin";
        }
      }

      // 1. Update scrap/outward entry.
      await fetchAuthenticatedJson(
        `/outward/outward-entries/${encodeURIComponent(
          scrapId,
        )}/`,
        {
          method: "PATCH",
          body: JSON.stringify(scrapPayload),
        },
      );

      // 2. Update notification. If this fails, the scrap entry itself has
      // already changed, so do not roll back the successful main action.
      try {
        await fetchAuthenticatedJson(
          `/notifications/${encodeURIComponent(
            notificationId,
          )}/`,
          {
            method: "PATCH",
            body: JSON.stringify(
              notificationPayload,
            ),
          },
        );
      } catch (notificationError) {
        console.error(
          "Scrap entry updated, but notification update failed:",
          notificationError,
        );
      }

      // No full reload here. This avoids stale data making the first click
      // appear unsuccessful.
      window.dispatchEvent(new Event("notificationsUpdated"));

      return true;
    } catch (err) {
      console.error("Failed to update scrap status:", err);

      // Main scrap PATCH failed, so put the row back exactly as it was.
      setNotifications(previousNotifications);

      alert(
        err?.message ||
          "Unable to update the scrap request. Please try again."
      );

      return false;
    } finally {
      processingNotificationsRef.current.delete(notificationKey);
      setProcessingNotificationId((current) =>
        String(current) === notificationKey ? null : current
      );
    }
  };

  const handleOpenRejectModal = (notification, status) => {
    setActiveRejectNotification(notification);
    setPendingRejectStatus(status);
    setRejectReason("");
    setShowRejectModal(true);
  };

  const handleCloseRejectModal = () => {
    setShowRejectModal(false);
    setActiveRejectNotification(null);
    setPendingRejectStatus("");
    setRejectReason("");
  };

  const handleConfirmReject = async () => {
    if (!activeRejectNotification) return;

    const success = await updateStatus(
      activeRejectNotification.id,
      activeRejectNotification.scrapId,
      pendingRejectStatus,
      rejectReason.trim()
    );

    if (success) {
      handleCloseRejectModal();
    }
  };

  const isViewingExistingReject = () =>
    activeRejectNotification?.status === "REJECTED";

  if (costDetailsPage) {
    return costDetailsPage;
  }

  return (
    <PageShell>
      <PageHeader
        title="Scrap Notifications"
        subtitle="Review and approve scrap entries"
      />

      {/* Notification count tab */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-primary bg-primary/10 px-5 py-2 text-sm font-semibold text-primary"
        >
          Scrap ({notifications.length})
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden dark:bg-slate-950 dark:border-slate-700">
        {/* HEADER */}
        <div
          className="grid bg-muted/40 text-xs font-semibold uppercase px-4 py-3 dark:bg-slate-800 dark:text-slate-200"
          style={{
            gridTemplateColumns: canSeeCosting
              ? "repeat(7, minmax(0, 1fr))"
              : "repeat(6, minmax(0, 1fr))",
          }}
        >
          <div className="text-center">Code</div>
          <div className="text-center">Type</div>
          <div className="text-center">Date</div>
          <div className="text-center">Remarks</div>
          {canSeeCosting && (
            <div className="text-center">
              Cost Details
            </div>
          )}
          <div className="text-center">Status</div>
          <div className="text-center">Action</div>
        </div>

        {/* LIST */}
        <div className="divide-y divide-border">
          {loading ? (
            <NotificationTableLoader
              title="Loading Scrap notifications..."
              subtitle="Fetching the latest Scrap approval requests."
            />
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No scrap approval requests yet
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className="grid px-4 py-3 items-center hover:bg-muted/50 transition-colors dark:hover:bg-slate-800"
                style={{
                  gridTemplateColumns: canSeeCosting
                    ? "repeat(7, minmax(0, 1fr))"
                    : "repeat(6, minmax(0, 1fr))",
                }}
              >
                {/* CODE */}
                <div className="text-center text-sm font-medium">{n.code}</div>

                {/* TYPE */}
                <div className="text-center text-sm">{n.type}</div>

                {/* DATE */}
                <div className="text-center text-sm">{n.date}</div>

                {/* REMARKS */}
                <div className="text-center text-sm text-muted-foreground max-w-xs overflow-hidden text-ellipsis">
                  {n.remarks || "-"}
                </div>

                {canSeeCosting && (
                  <div className="flex justify-center px-2">
                    <button
                      type="button"
                      className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10"
                      onClick={() =>
                        openCostDetails(
                          "outward",
                          n.scrapData || {
                            id: n.scrapId,
                          },
                        )
                      }
                    >
                      View Details
                    </button>
                  </div>
                )}

                {/* STATUS */}
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      const rejectContent = n.rejectionReason;
                      if (n.status === "REJECTED" && rejectContent) {
                        setActiveRejectNotification(n);
                        setPendingRejectStatus("REJECTED");
                        setRejectReason(rejectContent);
                        setShowRejectModal(true);
                      }
                    }}
                    className="rounded-full hover:opacity-80 transition"
                    style={{ outline: "none" }}
                  >
                    <StatusBadge status={n.status} rejectedBy={n.rejectedBy} />
                  </button>
                </div>

                {/* ACTION */}
                <div className="flex justify-center gap-2">
                  {n.status === "REQUESTED" && isAdmin && (
                    <>
                      <button
                        type="button"
                        disabled={
                          String(processingNotificationId) === String(n.id)
                        }
                        onClick={() =>
                          updateStatus(n.id, n.scrapId, "APPROVED")
                        }
                        className={`px-3 py-1.5 text-xs rounded-lg text-white font-medium transition ${
                          String(processingNotificationId) === String(n.id)
                            ? "cursor-not-allowed bg-green-400 dark:bg-emerald-500"
                            : "bg-green-600 hover:bg-green-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                        }`}
                      >
                        {String(processingNotificationId) === String(n.id)
                          ? "Approving..."
                          : "Approve"}
                      </button>

                      <button
                        type="button"
                        disabled={
                          String(processingNotificationId) === String(n.id)
                        }
                        onClick={() => handleOpenRejectModal(n, "REJECTED")}
                        className={`px-3 py-1.5 text-xs rounded-lg text-white font-medium transition ${
                          String(processingNotificationId) === String(n.id)
                            ? "cursor-not-allowed bg-red-400 dark:bg-rose-500"
                            : "bg-red-600 hover:bg-red-700 dark:bg-rose-600 dark:hover:bg-rose-700"
                        }`}
                      >
                        Reject
                      </button>
                    </>
                  )}

                  {(["APPROVED", "REJECTED"].includes(n.status)) && (
                    <span className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-800 font-medium dark:bg-slate-800 dark:text-slate-100">
                      {n.status === "APPROVED" ? "✓ Approved" : "✗ Rejected"}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* REJECT MODAL */}
      {showRejectModal && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-slate-100">
            {isViewingExistingReject() ? (
              <>
                <h2 className="text-lg font-semibold">Rejection Details</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {activeRejectNotification?.rejectedBy
                    ? `Rejected by ${activeRejectNotification.rejectedBy}`
                    : "Rejection details"}
                </p>
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700">
                  <div className="font-medium">Scrap Code: {activeRejectNotification?.code}</div>
                  <div className="mt-2 whitespace-pre-wrap">
                    {activeRejectNotification?.rejectionReason || "No rejection reason provided."}
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">Reject Scrap Entry</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Scrap Code: {activeRejectNotification?.code}
                </p>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter rejection reason..."
                  className="mt-4 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                  rows={4}
                />
              </>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseRejectModal}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Close
              </button>
              {!isViewingExistingReject() && (
                <button
                  type="button"
                  disabled={
                    activeRejectNotification &&
                    String(processingNotificationId) ===
                      String(activeRejectNotification.id)
                  }
                  onClick={handleConfirmReject}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition ${
                    activeRejectNotification &&
                    String(processingNotificationId) ===
                      String(activeRejectNotification.id)
                      ? "cursor-not-allowed bg-red-400 dark:bg-red-500"
                      : "bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                  }`}
                >
                  {activeRejectNotification &&
                  String(processingNotificationId) ===
                    String(activeRejectNotification.id)
                    ? "Rejecting..."
                    : "Confirm Rejection"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}