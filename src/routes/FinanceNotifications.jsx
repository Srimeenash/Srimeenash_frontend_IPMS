import { useEffect, useRef, useState } from "react";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import config from "@/config";
import { fetchAuthenticatedJson } from "@/api";
import { getAccessToken } from "@/authStore";
import { Loader2 } from "lucide-react";


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

export default function FinanceNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [scrapNotifications, setScrapNotifications] = useState([]);
  const [returnableNotifications, setReturnableNotifications] = useState([]);
  const [qcFailedNotifications, setQcFailedNotifications] = useState([]);
  const [processingQcFailedId, setProcessingQcFailedId] = useState(null);
  const [activeTab, setActiveTab] = useState("PO");
  const [loading, setLoading] = useState(true);

  const [showRejectPopup, setShowRejectPopup] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedPO, setSelectedPO] = useState(null);

  // Professional detail popups
  const [showPODetailsPopup, setShowPODetailsPopup] = useState(false);
  const [selectedPODetails, setSelectedPODetails] = useState(null);

  const [showMRDetailsPopup, setShowMRDetailsPopup] = useState(false);
  const [selectedMRDetails, setSelectedMRDetails] = useState(null);
  const [mrDetailsLoading, setMrDetailsLoading] = useState(false);
  const [mrDetailsError, setMrDetailsError] = useState("");

  // Tracks the PO currently being approved/rejected.
  // The ref blocks rapid double-clicks before React has time to re-render.
  const [processingPOId, setProcessingPOId] = useState(null);
  const processingPOsRef = useRef(new Set());

  // Scrap Finance workflow state.
  const [processingScrapId, setProcessingScrapId] = useState(null);
  const processingScrapsRef = useRef(new Set());
  const [showScrapRejectPopup, setShowScrapRejectPopup] = useState(false);
  const [scrapRejectReason, setScrapRejectReason] = useState("");
  const [selectedScrapId, setSelectedScrapId] = useState(null);

  // Scrap Qty serial-number popup.
  // The Scrap table no longer needs a separate Serial Number(s) column.
  const [
    scrapSerialPopup,
    setScrapSerialPopup,
  ] = useState(null);

  useEffect(() => {
    let refreshTimer = null;

    const handleNotificationsUpdated = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(
        () => {
          void loadNotifications({
            showLoader: false,
          });
        },
        150,
      );
    };

    void loadNotifications({
      showLoader: true,
    });

    const financeRefreshEvents = [
      "notificationsUpdated",
      "outwardUpdated",
      "procurementUpdated",
      "materialRequestsUpdated",
    ];

    financeRefreshEvents.forEach(
      (eventName) =>
        window.addEventListener(
          eventName,
          handleNotificationsUpdated,
        ),
    );

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      financeRefreshEvents.forEach(
        (eventName) =>
          window.removeEventListener(
            eventName,
            handleNotificationsUpdated,
          ),
      );
    };
  }, []);

  const getHeaders = () => {
    const token = getAccessToken();

    return {
      "Content-Type": "application/json",
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
    };
  };

  const calculatePOTotal = (po) => {
    const directTotal =
      po?.grand_total ??
      po?.total_amount ??
      po?.order_total ??
      po?.total ??
      po?.net_total;

    if (
      directTotal !== undefined &&
      directTotal !== null &&
      directTotal !== ""
    ) {
      return Number(directTotal);
    }

    const items = Array.isArray(po?.items) ? po.items : [];

    return items.reduce((sum, item) => {
      const quantity = Number(item.quantity || item.qty || 0);

      const unitPrice = Number(
        item.unit_price ??
          item.unitPrice ??
          item.price ??
          item.rate ??
          0
      );

      const gst = Number(
        item.gst_percentage ??
          item.gst ??
          item.tax ??
          item.tax_percentage ??
          0
      );

      const baseAmount = quantity * unitPrice;
      const gstAmount = (baseAmount * gst) / 100;

      return sum + baseAmount + gstAmount;
    }, 0);
  };

  const getComponentName = (item) => {
    const componentObject =
      item.component_details ||
      item.component_data ||
      item.component_obj ||
      (typeof item.component === "object" ? item.component : null);

    const code =
      item.component_code ||
      item.code ||
      componentObject?.component_code ||
      componentObject?.code ||
      "";

    const name =
      item.component_name ||
      item.name ||
      item.product_name ||
      componentObject?.component_name ||
      componentObject?.name ||
      componentObject?.product_name ||
      "";

    if (code && name) {
      return `${code} - ${name}`;
    }

    const componentFallback =
      item.component && typeof item.component === "object"
        ? item.component.component_id ||
          item.component.component_code ||
          item.component.code ||
          item.component.name ||
          ""
        : item.component;

    return (
      name ||
      code ||
      componentFallback ||
      item.component_id ||
      "Unknown component"
    );
  };

  const getTotalQuantity = (po) => {
    const items = Array.isArray(po?.items) ? po.items : [];

    return items.reduce(
      (sum, item) =>
        sum + Number(item.quantity || item.qty || 0),
      0
    );
  };


  const formatMoney = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatDate = (value) => {
    if (!value) return "-";

    const textValue = String(value).trim();

    // Keep plain YYYY-MM-DD values stable and readable.
    const directMatch = textValue.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

    if (directMatch) {
      return `${directMatch[3]}/${directMatch[2]}/${directMatch[1]}`;
    }

    const date = new Date(textValue);

    if (Number.isNaN(date.getTime())) {
      return textValue;
    }

    return date.toLocaleDateString("en-IN");
  };

  const getPOSourceMRNumber = (po = {}) =>
    String(
      po.source_mr_number ||
        po.material_request_id ||
        po.request_id ||
        po.mr_number ||
        ""
    ).trim();

  const getPOStatus = (po = {}, notification = {}) =>
    String(
      po.approval_status ||
        po.status ||
        notification.status ||
        ""
    )
      .trim()
      .toUpperCase();

  const getPOItemUnitPrice = (item = {}) =>
    Number(
      item.unit_price ??
        item.unitPrice ??
        item.price ??
        item.rate ??
        0
    );

  const getPOItemGST = (item = {}) =>
    Number(
      item.gst_percentage ??
        item.gst ??
        item.tax ??
        item.tax_percentage ??
        0
    );

  const getPOItemLineTotal = (item = {}) => {
    const quantity = Number(
      item.quantity || item.qty || 0
    );

    const unitPrice = getPOItemUnitPrice(item);
    const gst = getPOItemGST(item);
    const baseAmount = quantity * unitPrice;

    return baseAmount + (baseAmount * gst) / 100;
  };

  const openPODetails = (notification) => {
    setSelectedPODetails({
      notification,
      po: notification?.poDetails || {},
    });
    setShowPODetailsPopup(true);
  };

  const closePODetails = () => {
    setShowPODetailsPopup(false);
    setSelectedPODetails(null);
  };

  const unwrapList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  };

  const getMRReference = (mr = {}) =>
    String(
      mr.material_request_id ||
        mr.request_id ||
        mr.mr_number ||
        mr.id ||
        ""
    ).trim();

  const getMRInventorySnapshot = (item = {}) => {
    const value =
      item.creation_inventory_quantity ??
      item.created_inventory_quantity ??
      item.inventory_snapshot_quantity ??
      item.inventory_quantity ??
      item.inventoryQuantity ??
      item.inventory_qty ??
      item.inventoryQty ??
      0;

    const quantity = Number(value);

    return Number.isFinite(quantity)
      ? Math.max(quantity, 0)
      : 0;
  };

  const getMRItems = (mr = {}) => {
    const rows = [];

    const appendRows = (items, sourceType) => {
      if (!Array.isArray(items)) return;

      items.forEach((item) => {
        rows.push({
          ...item,
          __sourceType: sourceType,
        });
      });
    };

    appendRows(mr.bom_items, "BOM");
    appendRows(mr.custom_bom_items, "Custom BOM");
    appendRows(mr.rd_items, "R&D");
    appendRows(mr.request_items, "Request Items");

    if (
      rows.length === 0 &&
      Array.isArray(mr.items)
    ) {
      appendRows(mr.items, "Items");
    }

    return rows;
  };

  const getMRComponentName = (item = {}) => {
    const componentObject =
      item.component_details ||
      item.component_data ||
      item.component_obj ||
      (typeof item.component === "object"
        ? item.component
        : null);

    const code =
      item.component_code ||
      item.componentCode ||
      componentObject?.component_id ||
      componentObject?.component_code ||
      componentObject?.code ||
      "";

    const name =
      item.component_name ||
      item.componentName ||
      item.name ||
      componentObject?.name ||
      componentObject?.component_name ||
      "";

    if (code && name) {
      return `${code} - ${name}`;
    }

    const componentFallback =
      item.component && typeof item.component === "object"
        ? item.component.component_id ||
          item.component.component_code ||
          item.component.code ||
          item.component.name ||
          ""
        : item.component;

    return (
      name ||
      code ||
      componentFallback ||
      item.component_id ||
      "Unknown component"
    );
  };

  const closeMRDetails = () => {
    setShowMRDetailsPopup(false);
    setSelectedMRDetails(null);
    setMrDetailsLoading(false);
    setMrDetailsError("");
  };

  const openMRDetails = async (sourceMRNumber) => {
    const requestedReference = String(
      sourceMRNumber || ""
    ).trim();

    if (!requestedReference) {
      return;
    }

    setShowMRDetailsPopup(true);
    setSelectedMRDetails(null);
    setMrDetailsError("");
    setMrDetailsLoading(true);

    try {
      /*
       * PO.source_mr_number normally stores the visible MR number,
       * while the Material Request detail endpoint requires the DB id.
       * Resolve the exact MR first, then load its full detail payload.
       */
      const requests =
        await fetchAllNotificationPagesShared(
          `${config.baseURL}/materialrequest/material-requests/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
          {
            cache: "no-store",
          },
        );

      const normalizedReference =
        requestedReference.toLowerCase();

      const matchedRequest = requests.find(
        (request) => {
          const candidates = [
            request.id,
            request.pk,
            request.material_request_id,
            request.request_id,
            request.mr_number,
          ]
            .filter(
              (value) =>
                value !== undefined &&
                value !== null &&
                value !== ""
            )
            .map((value) =>
              String(value).trim().toLowerCase()
            );

          return candidates.includes(
            normalizedReference
          );
        }
      );

      if (!matchedRequest) {
        throw new Error(
          `Material Request ${requestedReference} was not found.`
        );
      }

      const requestDatabaseId =
        matchedRequest.id ??
        matchedRequest.pk;

      let fullRequest = matchedRequest;

      if (
        requestDatabaseId !== undefined &&
        requestDatabaseId !== null &&
        requestDatabaseId !== ""
      ) {
        fullRequest =
          await fetchNotificationDetailCached(
            `${config.baseURL}/materialrequest/material-requests/${encodeURIComponent(
              requestDatabaseId
            )}/`,
            {
              headers: getHeaders(),
              cache: "no-store",
            },
          ).catch(() => matchedRequest);
      }

      setSelectedMRDetails(fullRequest);
    } catch (error) {
      console.error(
        "Failed to load MR details:",
        error
      );

      setMrDetailsError(
        error?.message ||
          "Unable to load Material Request details."
      );
    } finally {
      setMrDetailsLoading(false);
    }
  };

  const getRefundFailedRows = (
    inward = {},
  ) =>
    (
      Array.isArray(
        inward?.qc_failed_rows,
      )
        ? inward.qc_failed_rows
        : Array.isArray(
            inward?.failedRows,
          )
          ? inward.failedRows
          : []
    ).filter(
      (row) =>
        row &&
        typeof row ===
          "object",
    );

  const getRefundFailedQuantity = (
    inward = {},
  ) =>
    getRefundFailedRows(
      inward,
    ).reduce(
      (sum, row) => {
        const value = Number(
          row?.qty ??
            row?.quantity ??
            row?.failed_quantity ??
            1,
        );

        return (
          sum +
          (
            Number.isFinite(
              value,
            ) &&
            value > 0
              ? value
              : 1
          )
        );
      },
      0,
    );

  const getRefundComponentLabel = (
    inward = {},
  ) => {
    const code = String(
      inward?.component_code ||
        inward?.componentCode ||
        inward?.component
          ?.component_id ||
        "",
    ).trim();

    const name = String(
      inward?.component_name ||
        inward?.componentName ||
        inward?.component?.name ||
        "",
    ).trim();

    return (
      (
        code &&
        name
      )
        ? `${code} - ${name}`
        : name ||
          code ||
          "Component"
    );
  };

  const processRefundFinanceApproval = async (
    notification,
    decision,
  ) => {
    const reference = String(
      notification?.reference_id ||
        notification?.referenceId ||
        "",
    ).trim();

    if (
      !reference
        .toUpperCase()
        .startsWith(
          "INWARD_REFUND:",
        )
    ) {
      return;
    }

    const inwardId =
      reference.split(
        ":",
        2,
      )[1];

    if (!inwardId) {
      return;
    }

    const processKey =
      String(
        notification?.id ||
          inwardId,
      );

    if (
      processingQcFailedId
    ) {
      return;
    }

    let reason = "";

    if (
      decision ===
      "REJECT"
    ) {
      reason = String(
        window.prompt(
          "Enter Finance rejection reason:",
        ) || "",
      ).trim();

      if (!reason) {
        return;
      }
    }

    try {
      setProcessingQcFailedId(
        processKey,
      );

      const endpoint =
        decision ===
        "APPROVE"
          ? "finance-approve-refund"
          : "finance-reject-refund";

      const response =
        await fetch(
          `${config.baseURL}/inward/${encodeURIComponent(
            inwardId,
          )}/${endpoint}/`,
          {
            method: "POST",
            headers:
              getHeaders(),
            body:
              JSON.stringify(
                decision ===
                  "REJECT"
                  ? {
                      reason,
                    }
                  : {},
              ),
          },
        );

      if (!response.ok) {
        throw new Error(
          await response.text(),
        );
      }

      /*
       * Backend succeeded. Remove this pending action immediately instead of
       * leaving a stale Finance Approve/Reject button on screen.
       */
      invalidateNotificationLoadingCache();

      setQcFailedNotifications(
        (previous) =>
          previous.filter(
            (item) =>
              String(item?.id || "") !==
              String(notification?.id || ""),
          ),
      );

      window.dispatchEvent(
        new Event(
          "notificationsUpdated",
        ),
      );

      window.dispatchEvent(
        new Event(
          "procurementUpdated",
        ),
      );

      await loadNotifications({
        showLoader: false,
      });
    } catch (error) {
      console.error(
        "Finance Refund approval failed:",
        error,
      );

      alert(
        error?.message ||
          "Unable to process the Refund request.",
      );
    } finally {
      setProcessingQcFailedId(
        null,
      );
    }
  };

  const loadNotifications = async (
    {
      showLoader = true,
      forceRefresh = false,
    } = {},
  ) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const notificationList =
        await fetchAllNotificationPagesShared(
          `${config.baseURL}/notifications/?receiver=FINANCE&page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
          {
            cache: "no-store",
          },
        );

      // ------------------------------------------------------------
      // FINANCE -> PO
      // ------------------------------------------------------------
      const financePOs = notificationList.filter(
        (notification) =>
          String(notification.category || "")
            .trim()
            .toUpperCase() === "PO" &&
          String(notification.receiver || "")
            .trim()
            .toUpperCase() === "FINANCE"
      );

      const uniqueFinancePOs = Array.from(
        new Map(
          financePOs.map((notification) => [
            String(
              notification.reference_id ||
                notification.referenceId ||
                notification.id
            ),
            notification,
          ])
        ).values()
      );

      const notificationsWithPODetails = await Promise.all(
        uniqueFinancePOs.map(async (notification) => {
          const poId =
            notification.reference_id ||
            notification.referenceId;

          if (!poId) {
            return {
              ...notification,
              poDetails: null,
              poLoadError: "PO reference ID is missing",
            };
          }

          try {
            const poDetails =
              await fetchNotificationDetailCached(
                `${config.baseURL}/procurement/purchase-orders/${encodeURIComponent(
                  poId
                )}/`,
                {
                  headers: getHeaders(),
                  cache: "no-store",
                },
              );

            const isDirectStandardPO =
              String(
                poDetails?.order_type ||
                  "STANDARD"
              )
                .trim()
                .toUpperCase() !==
                "REPLACEMENT" &&
              !String(
                poDetails?.source_mr_number ||
                  ""
              ).trim();

            const directStatus = String(
              poDetails?.status ||
                ""
            )
              .trim()
              .toUpperCase();

            /*
             * Direct PO is Manager-first.
             * Even if an old/stale Finance notification exists, do not
             * show the Direct PO to Finance before Manager approval.
             */
            if (
              isDirectStandardPO &&
              ![
                "PENDING_FINANCE",
                "FINANCE_APPROVED",
                "FINANCE_REJECTED",
              ].includes(directStatus)
            ) {
              return null;
            }

            return {
              ...notification,
              poDetails,
              poLoadError: "",
            };
          } catch (err) {
            return {
              ...notification,
              poDetails: null,
              poLoadError: err.message,
            };
          }
        })
      );

      // ------------------------------------------------------------
      // FINANCE -> SCRAP
      // ------------------------------------------------------------
      const financeScraps = notificationList.filter(
        (notification) =>
          String(notification.category || "")
            .trim()
            .toUpperCase() === "SCRAP" &&
          String(notification.receiver || "")
            .trim()
            .toUpperCase() === "FINANCE"
      );

      // Keep one Finance notification per OutwardEntry.
      const uniqueFinanceScraps = Array.from(
        new Map(
          financeScraps.map((notification) => [
            String(
              notification.reference_id ||
                notification.referenceId ||
                notification.id
            ),
            notification,
          ])
        ).values()
      );

      const notificationsWithScrapDetails = await Promise.all(
        uniqueFinanceScraps.map(async (notification) => {
          const outwardId =
            notification.reference_id ||
            notification.referenceId;

          if (!outwardId) {
            return {
              ...notification,
              scrapDetails: null,
              scrapLoadError: "Scrap reference ID is missing",
            };
          }

          try {
            const scrapDetails =
              await fetchNotificationDetailCached(
                `${config.baseURL}/outward/${encodeURIComponent(
                  outwardId
                )}/`,
                {
                  headers: getHeaders(),
                  cache: "no-store",
                  forceRefresh,
                },
              );

            return {
              ...notification,
              scrapDetails,
              scrapLoadError: "",
              status: String(
                scrapDetails?.approval_status ||
                  scrapDetails?.status ||
                  notification?.status ||
                  "PENDING_FINANCE"
              )
                .trim()
                .toUpperCase(),
            };
          } catch (err) {
            return {
              ...notification,
              scrapDetails: null,
              scrapLoadError: err.message,
            };
          }
        })
      );

      const financeReturnables = notificationList.filter(
        (notification) =>
          String(notification.category || "")
            .trim()
            .toUpperCase() === "CU" &&
          String(notification.receiver || "")
            .trim()
            .toUpperCase() === "FINANCE"
      );

      const uniqueFinanceReturnables = Array.from(
        new Map(
          financeReturnables.map((notification) => [
            String(
              notification.reference_id ||
                notification.referenceId ||
                notification.id
            ),
            notification,
          ])
        ).values()
      );

      const financeQcFailed =
        notificationList.filter(
          (notification) => {
            const category = String(
              notification.category ||
                "",
            )
              .trim()
              .toUpperCase();

            const receiver = String(
              notification.receiver ||
                "",
            )
              .trim()
              .toUpperCase();

            const notificationStatus =
              String(
                notification.status ||
                  notification.approval_status ||
                  "",
              )
                .trim()
                .toUpperCase();

            /*
             * The QC Failed Finance tab is an ACTION queue.
             * Once Finance approves/rejects, do not render the same row again.
             */
            return (
              category === "QC_FAILED" &&
              receiver === "FINANCE" &&
              notificationStatus ===
                "PENDING_FINANCE"
            );
          },
        );

      const uniqueFinanceQcFailed =
        Array.from(
          new Map(
            financeQcFailed.map(
              (notification) => [
                String(
                  notification
                    .reference_id ||
                    notification
                      .referenceId ||
                    notification.id,
                ),
                notification,
              ],
            ),
          ).values(),
        );

      const hydratedFinanceQcFailed =
        await Promise.all(
          uniqueFinanceQcFailed.map(
            async (
              notification,
            ) => {
              const reference =
                String(
                  notification
                    .reference_id ||
                    notification
                      .referenceId ||
                    "",
                ).trim();

              if (
                !reference
                  .toUpperCase()
                  .startsWith(
                    "INWARD_REFUND:",
                  )
              ) {
                return {
                  ...notification,
                  inwardDetails:
                    null,
                };
              }

              const inwardId =
                reference.split(
                  ":",
                  2,
                )[1];

              try {
                const inwardDetails =
                  await fetchNotificationDetailCached(
                    `${config.baseURL}/inward/${encodeURIComponent(
                      inwardId,
                    )}/`,
                    {
                      headers:
                        getHeaders(),
                      cache:
                        "no-store",
                    },
                  );

                return {
                  ...notification,
                  inwardDetails,
                  inwardLoadError:
                    "",
                };
              } catch (error) {
                return {
                  ...notification,
                  inwardDetails:
                    null,
                  inwardLoadError:
                    error?.message ||
                    "Unable to load Refund details.",
                };
              }
            },
          ),
        );

      setNotifications(
        notificationsWithPODetails.filter(Boolean)
      );
      setScrapNotifications(notificationsWithScrapDetails);
      setReturnableNotifications(uniqueFinanceReturnables);
      setQcFailedNotifications(
        hydratedFinanceQcFailed,
      );
    } catch (err) {
      console.error("Failed to load Finance notifications:", err);
      setNotifications([]);
      setScrapNotifications([]);
      setReturnableNotifications([]);
      setQcFailedNotifications([]);
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  };

  const removeNotification = async (notificationId) => {
    try {
      const res = await fetch(
        `${config.baseURL}/notifications/${notificationId}/`,
        {
          method: "DELETE",
          headers: getHeaders(),
        }
      );

      if (!res.ok) {
        console.error(await res.text());
        return;
      }

      setNotifications((previous) =>
        previous.filter(
          (notification) =>
            String(notification.id) !== String(notificationId)
        )
      );

      setScrapNotifications((previous) =>
        previous.filter(
          (notification) =>
            String(notification.id) !== String(notificationId)
        )
      );

      setReturnableNotifications((previous) =>
        previous.filter(
          (notification) =>
            String(notification.id) !== String(notificationId)
        )
      );

      window.dispatchEvent(
        new Event("notificationsUpdated")
      );
    } catch (err) {
      console.error("Failed to remove notification:", err);
    }
  };

  const updatePOStatus = async (
    id,
    action,
    rejectionReason = ""
  ) => {
    if (!id) {
      console.error("PO ID is missing");
      return false;
    }

    const poKey = String(id);

    if (
      processingPOsRef.current.has(
        poKey
      )
    ) {
      return false;
    }

    processingPOsRef.current.add(
      poKey
    );
    setProcessingPOId(poKey);

    const previousNotifications =
      notifications;

    const selectedNotification =
      previousNotifications.find(
        (item) =>
          String(
            item.reference_id ||
              item.referenceId
          ) === poKey
      );

    const selectedPO =
      selectedNotification
        ?.poDetails || {};

    const rawOrderType = String(
      selectedPO?.order_type ||
        selectedPO?.orderType ||
        ""
    )
      .trim()
      .toUpperCase();

    const rawStatus = String(
      selectedPO?.status ||
        selectedPO
          ?.approval_status ||
        selectedNotification
          ?.status ||
        ""
    )
      .trim()
      .toUpperCase();

    const isReplacementPO =
      rawOrderType ===
        "REPLACEMENT" ||
      rawStatus.startsWith(
        "REPLACEMENT_"
      );

    const approvalStatus =
      isReplacementPO
        ? (
            action === "APPROVED"
              ? "REPLACEMENT_FINANCE_APPROVED"
              : "REPLACEMENT_FINANCE_REJECTED"
          )
        : (
            action === "APPROVED"
              ? "FINANCE_APPROVED"
              : "FINANCE_REJECTED"
          );

    const displayPOStatus =
      isReplacementPO
        ? (
            action === "APPROVED"
              ? "REPLACEMENT_APPROVED"
              : "REPLACEMENT_FINANCE_REJECTED"
          )
        : approvalStatus;

    setNotifications(
      (previous) =>
        previous.map(
          (notification) => {
            const notificationPOId =
              notification.reference_id ||
              notification.referenceId;

            if (
              String(
                notificationPOId
              ) !== poKey
            ) {
              return notification;
            }

            return {
              ...notification,
              status:
                approvalStatus,
              is_read: true,
              poDetails: {
                ...(
                  notification
                    .poDetails ||
                  {}
                ),
                status:
                  displayPOStatus,
                approval_status:
                  approvalStatus,
                ...(
                  action ===
                  "REJECTED"
                    ? {
                        rejection_reason:
                          rejectionReason,
                        rejected_by:
                          "FINANCE",
                      }
                    : {}
                ),
              },
            };
          }
        )
    );

    try {
      let updatedPO = null;

      if (isReplacementPO) {
        /*
         * QC Failed Replacement / Returnable Restore:
         *
         * Procurement already approved and created this PO.
         * Finance MUST use the replacement workflow endpoint so
         * REPLACEMENT_PENDING_FINANCE becomes REPLACEMENT_APPROVED
         * after approval.
         */
        const endpoint =
          action === "APPROVED"
            ? "replacement-finance-approve"
            : "replacement-finance-reject";

        const payload =
          action === "APPROVED"
            ? {
                remarks: "",
              }
            : {
                reason:
                  rejectionReason,
              };

        const poRes =
          await fetch(
            `${config.baseURL}/procurement/purchase-orders/${encodeURIComponent(
              id
            )}/${endpoint}/`,
            {
              method: "POST",
              headers:
                getHeaders(),
              body:
                JSON.stringify(
                  payload
                ),
            }
          );

        if (!poRes.ok) {
          const errorText =
            await poRes.text();

          throw new Error(
            errorText ||
              `Unable to process Replacement PO (${poRes.status})`
          );
        }

        updatedPO =
          await poRes.json();
      } else {
        const poPayload = {
          status:
            approvalStatus,
          approval_status:
            approvalStatus,
        };

        if (
          action ===
          "REJECTED"
        ) {
          poPayload.rejection_reason =
            rejectionReason;

          poPayload.rejected_by =
            "FINANCE";
        }

        const poRes =
          await fetch(
            `${config.baseURL}/procurement/purchase-orders/${encodeURIComponent(
              id
            )}/`,
            {
              method: "PATCH",
              headers:
                getHeaders(),
              body:
                JSON.stringify(
                  poPayload
                ),
            }
          );

        if (!poRes.ok) {
          const errorText =
            await poRes.text();

          throw new Error(
            errorText ||
              `Unable to update Purchase Order (${poRes.status})`
          );
        }

        updatedPO =
          await poRes.json();
      }

      /*
       * Backend replacement endpoints already update the Finance
       * notification. This PATCH keeps the normal PO frontend behavior
       * idempotent and immediately consistent.
       */
      if (
        selectedNotification
      ) {
        const notificationPayload = {
          status:
            approvalStatus,
          is_read: true,
        };

        if (
          action ===
          "REJECTED"
        ) {
          notificationPayload.rejection_reason =
            rejectionReason;

          notificationPayload.rejected_by =
            "FINANCE";
        }

        const notificationRes =
          await fetch(
            `${config.baseURL}/notifications/${selectedNotification.id}/`,
            {
              method: "PATCH",
              headers:
                getHeaders(),
              body:
                JSON.stringify(
                  notificationPayload
                ),
            }
          );

        if (
          !notificationRes.ok
        ) {
          console.error(
            "PO updated, but notification update failed:",
            await notificationRes.text()
          );
        }
      }

      if (updatedPO) {
        setNotifications(
          (previous) =>
            previous.map(
              (notification) => {
                const notificationPOId =
                  notification.reference_id ||
                  notification.referenceId;

                if (
                  String(
                    notificationPOId
                  ) !== poKey
                ) {
                  return notification;
                }

                return {
                  ...notification,
                  status:
                    approvalStatus,
                  is_read: true,
                  poDetails: {
                    ...(
                      notification
                        .poDetails ||
                      {}
                    ),
                    ...updatedPO,
                  },
                };
              }
            )
        );
      }

      window.dispatchEvent(
        new Event(
          "procurementUpdated"
        )
      );

      window.dispatchEvent(
        new Event(
          "notificationsUpdated"
        )
      );

      return true;
    } catch (err) {
      console.error(
        "Failed to update PO:",
        err
      );

      setNotifications(
        previousNotifications
      );

      alert(
        err?.message ||
          "Unable to update the Purchase Order. Please try again."
      );

      return false;
    } finally {
      processingPOsRef.current.delete(
        poKey
      );

      setProcessingPOId(
        (current) =>
          String(current) ===
          poKey
            ? null
            : current
      );
    }
  };

  const getScrapStatus = (notification = {}) =>
    String(
      notification?.scrapDetails?.approval_status ||
        notification?.scrapDetails?.status ||
        notification?.status ||
        "PENDING_FINANCE"
    )
      .trim()
      .toUpperCase();

  const getScrapComponentLabel = (scrap = {}) => {
    const code = String(
      scrap.component_code ||
        scrap.componentCode ||
        scrap.component?.component_id ||
        scrap.component?.component_code ||
        ""
    ).trim();

    const name = String(
      scrap.component_name ||
        scrap.componentName ||
        scrap.component?.name ||
        scrap.product_name ||
        scrap.productName ||
        ""
    ).trim();

    if (code && name && !name.toLowerCase().startsWith(code.toLowerCase())) {
      return `${code} - ${name}`;
    }

    return name || code || "-";
  };

  const cleanScrapRequesterName = (value) => {
    let raw = String(value || "").trim();

    if (!raw) {
      return "";
    }

    /*
     * Prefer a person's actual display name.
     *
     * Legacy Scrap rows may contain:
     *   naveen.r@aero360.co.in
     * or:
     *   naveen.r
     *
     * In that case, do not show the mail/user-login value in Finance.
     * Display the human-readable first name:
     *   Naveen
     */
    if (raw.includes("@")) {
      raw = raw.split("@", 1)[0].trim();
    }

    if (
      !raw.includes(" ") &&
      raw.includes(".")
    ) {
      raw = raw.split(".", 1)[0].trim();
    }

    if (!raw) {
      return "";
    }

    return (
      raw.charAt(0).toUpperCase() +
      raw.slice(1)
    );
  };

  const getScrapRequestedBy = (
    scrap = {},
    notification = {}
  ) => {
    /*
     * Name fields are intentionally preferred before requested_by,
     * because requested_by in old Scrap rows can contain the login/email.
     */
    const candidates = [
      // Explicit human-readable names first.
      scrap.employee_name,
      scrap.employeeName,
      scrap.requested_by_name,
      scrap.requester_name,
      scrap.requestedByName,
      scrap.requesterName,

      notification.employee_name,
      notification.employeeName,
      notification.requester_name,
      notification.requesterName,
      notification.requested_by_name,
      notification.requestedByName,

      // Login/email-like values are fallback only.
      scrap.requested_by,
      scrap.requestedBy,
      notification.requested_by,
      notification.requestedBy,
    ];

    for (const candidate of candidates) {
      const name =
        cleanScrapRequesterName(
          candidate
        );

      if (name) {
        return name;
      }
    }

    return "-";
  };

  const getScrapSerialNumbers = (scrap = {}) => {
    const raw =
      scrap.serial_numbers ??
      scrap.serialNumbers ??
      scrap.serials ??
      [];

    if (Array.isArray(raw)) {
      return raw
        .map((value) => String(value || "").trim())
        .filter(Boolean);
    }

    if (raw === null || raw === undefined || raw === "") {
      return [];
    }

    return String(raw)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  };

  const getScrapMaterialRequest = (scrap = {}, notification = {}) => {
    const materialRequest = scrap.material_request;

    if (
      materialRequest &&
      typeof materialRequest === "object"
    ) {
      return String(
        materialRequest.material_request_id ||
          materialRequest.request_id ||
          materialRequest.mr_number ||
          materialRequest.id ||
          "-"
      ).trim();
    }

    return String(
      scrap.material_request_number ||
        scrap.materialRequestNumber ||
        scrap.material_request_id ||
        scrap.mr_number ||
        materialRequest ||
        notification.material_request_number ||
        notification.material_request_id ||
        "-"
    ).trim() || "-";
  };

  const updateScrapStatus = async (
    outwardId,
    action,
    rejectionReason = ""
  ) => {
    if (!outwardId) {
      alert("Scrap ID is missing.");
      return false;
    }

    const scrapKey = String(outwardId);

    if (
      processingScrapsRef.current.has(
        scrapKey
      )
    ) {
      return false;
    }

    processingScrapsRef.current.add(
      scrapKey
    );
    setProcessingScrapId(scrapKey);

    const isReject =
      action === "REJECTED";

    const endpoint = isReject
      ? "finance-reject"
      : "finance-approve";

    const finalStatus = isReject
      ? "FINANCE_REJECTED"
      : "APPROVED";

    /*
     * Update this row locally as soon as the backend confirms the action.
     * The Scrap table already renders every non-PENDING_FINANCE row with
     * the Remove button, so this gives:
     *
     *   Finance Approve -> Approved -> Remove
     *
     * without waiting for the full notification reload.
     */
    const applyProcessedScrapState = (
      statusValue = finalStatus
    ) => {
      const normalizedStatus =
        String(
          statusValue ||
            finalStatus
        )
          .trim()
          .toUpperCase();

      setScrapNotifications(
        (previous) =>
          previous.map(
            (notification) => {
              const notificationOutwardId =
                notification
                  ?.reference_id ||
                notification
                  ?.referenceId ||
                notification
                  ?.scrapDetails
                  ?.id;

              if (
                String(
                  notificationOutwardId ??
                    ""
                ) !== scrapKey
              ) {
                return notification;
              }

              return {
                ...notification,
                status:
                  normalizedStatus,
                approval_status:
                  normalizedStatus,
                is_read: true,
                scrapDetails: {
                  ...(
                    notification
                      ?.scrapDetails ||
                    {}
                  ),
                  status:
                    normalizedStatus,
                  approval_status:
                    normalizedStatus,
                },
              };
            },
          ),
      );
    };

    try {
      const response = await fetch(
        `${config.baseURL}/outward/${encodeURIComponent(
          outwardId
        )}/${endpoint}/`,
        {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(
            isReject
              ? {
                  rejection_reason:
                    String(
                      rejectionReason ||
                        ""
                    ).trim(),
                }
              : {}
          ),
        }
      );

      const responseText =
        await response.text();

      let responseData = {};

      if (responseText) {
        try {
          responseData =
            JSON.parse(
              responseText
            );
        } catch (_error) {
          responseData = {
            detail:
              responseText,
          };
        }
      }

      if (!response.ok) {
        const detail = String(
          responseData?.detail ||
            responseText ||
            ""
        ).trim();

        const normalizedDetail =
          detail.toUpperCase();

        /*
         * Idempotent recovery:
         *
         * A previous Finance click may already have changed the database to
         * APPROVED/FINANCE_REJECTED, while the 15-second frontend detail cache
         * kept the old PENDING_FINANCE row and showed the buttons again.
         *
         * In that situation the backend correctly returns HTTP 400:
         *   "This Scrap is no longer pending Finance approval.
         *    Current state: APPROVED."
         *
         * That is NOT a failed approval. Reconcile the UI to the authoritative
         * backend state and show Remove.
         */
        const alreadyProcessedMatch =
          normalizedDetail.match(
            /CURRENT\s+STATE\s*:\s*([A-Z_]+)/
          );

        const currentBackendStatus =
          alreadyProcessedMatch?.[1] ||
          "";

        const alreadyApproved =
          !isReject &&
          [
            "APPROVED",
            "FINANCE_APPROVED",
          ].includes(
            currentBackendStatus
          );

        const alreadyRejected =
          isReject &&
          [
            "REJECTED",
            "FINANCE_REJECTED",
          ].includes(
            currentBackendStatus
          );

        if (
          alreadyApproved ||
          alreadyRejected
        ) {
          applyProcessedScrapState(
            currentBackendStatus
          );

          invalidateNotificationLoadingCache();

          window.dispatchEvent(
            new Event(
              "notificationsUpdated"
            )
          );

          window.dispatchEvent(
            new Event(
              "outwardUpdated"
            )
          );

          /*
           * Force a fresh authoritative Scrap detail fetch. Do not let the
           * stale 15-second detail cache turn Approved back into Pending.
           */
          void loadNotifications({
            showLoader: false,
            forceRefresh: true,
          }).catch(
            (refreshError) => {
              console.warn(
                "Unable to reconcile already-processed Finance Scrap:",
                refreshError,
              );
            },
          );

          return true;
        }

        throw new Error(
          detail ||
            `Unable to ${
              isReject
                ? "reject"
                : "approve"
            } Scrap (${response.status})`
        );
      }

      /*
       * Authoritative POST succeeded.
       *
       * First update only this visible row. The action button changes to
       * Remove immediately because its status is no longer PENDING_FINANCE.
       */
      const backendStatus = String(
        responseData
          ?.approval_status ||
          responseData?.status ||
          finalStatus
      )
        .trim()
        .toUpperCase();

      applyProcessedScrapState(
        isReject
          ? (
              [
                "FINANCE_REJECTED",
                "REJECTED",
              ].includes(
                backendStatus
              )
                ? backendStatus
                : "FINANCE_REJECTED"
            )
          : (
              [
                "APPROVED",
                "FINANCE_APPROVED",
              ].includes(
                backendStatus
              )
                ? backendStatus
                : "APPROVED"
            )
      );

      /*
       * CRITICAL:
       * Clear Scrap detail cache BEFORE reloading. The old implementation
       * reloaded immediately while the cached /outward/<id>/ payload still
       * said PENDING_FINANCE, which restored Finance Approve/Reject.
       */
      invalidateNotificationLoadingCache();

      window.dispatchEvent(
        new Event(
          "notificationsUpdated"
        )
      );

      window.dispatchEvent(
        new Event(
          "outwardUpdated"
        )
      );

      window.dispatchEvent(
        new Event(
          "inventory:changed"
        )
      );

      /*
       * Reconcile in the background using fresh backend data. Do not block
       * the Remove button on this full page reload.
       */
      void loadNotifications({
        showLoader: false,
        forceRefresh: true,
      }).catch(
        (refreshError) => {
          console.warn(
            "Background Finance Scrap refresh failed:",
            refreshError,
          );
        },
      );

      return true;
    } catch (err) {
      console.error(
        "Failed to update Scrap Finance approval:",
        err
      );

      alert(
        err?.message ||
          "Unable to update Scrap Finance approval."
      );

      return false;
    } finally {
      processingScrapsRef.current.delete(
        scrapKey
      );

      setProcessingScrapId(
        (current) =>
          String(current) ===
          scrapKey
            ? null
            : current
      );
    }
  };

  const openScrapRejectPopup = (outwardId) => {
    setSelectedScrapId(outwardId);
    setScrapRejectReason("");
    setShowScrapRejectPopup(true);
  };

  const closeScrapRejectPopup = () => {
    setShowScrapRejectPopup(false);
    setSelectedScrapId(null);
    setScrapRejectReason("");
  };

  const submitScrapReject = async () => {
    const reason = String(scrapRejectReason || "").trim();

    if (!reason) {
      alert("Enter rejection remarks");
      return;
    }

    if (!selectedScrapId) {
      alert("Scrap was not selected");
      return;
    }

    const success = await updateScrapStatus(
      selectedScrapId,
      "REJECTED",
      reason
    );

    if (success) {
      closeScrapRejectPopup();
    }
  };

  const openRejectPopup = (poId) => {
    setSelectedPO(poId);
    setRejectReason("");
    setShowRejectPopup(true);
  };

  const closeRejectPopup = () => {
    setShowRejectPopup(false);
    setRejectReason("");
    setSelectedPO(null);
  };

  const submitReject = async () => {
    const reason = rejectReason.trim();

    if (!reason) {
      alert("Enter rejection remarks");
      return;
    }

    if (!selectedPO) {
      alert("Purchase Order was not selected");
      return;
    }

    const success = await updatePOStatus(
      selectedPO,
      "REJECTED",
      reason
    );

    if (success) {
      closeRejectPopup();
    }
  };

  const processReturnableFinanceApproval = async (notification, decision) => {
    const usageId = notification?.reference_id || notification?.referenceId;
    if (!usageId) return;

    let reason = "";
    if (decision === "REJECT") {
      reason = window.prompt("Enter Finance rejection reason:") || "";
      if (!reason.trim()) return;
    }

    try {
      await fetch(
        `${config.baseURL}/component-usage/${encodeURIComponent(usageId)}/return-approval/`,
        {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ decision, reason: reason.trim() }),
        },
      ).then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.detail || "Unable to process Returnable Finance approval.");
        }
        return body;
      });

      window.dispatchEvent(new Event("notificationsUpdated"));
      await loadNotifications();
    } catch (error) {
      console.error("Returnable Finance approval failed:", error);
      alert(error?.message || "Unable to process Returnable Finance approval.");
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Finance Notifications"
        subtitle="Review Purchase Orders, QC Failed Refunds, Returnable, and Scrap requests waiting for Finance approval"
      />

      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setActiveTab("PO")}
          className={`rounded-full border px-5 py-2 text-sm font-semibold transition ${
            activeTab === "PO"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          }`}
        >
          PO ({notifications.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("SCRAP")}
          className={`rounded-full border px-5 py-2 text-sm font-semibold transition ${
            activeTab === "SCRAP"
              ? "border-rose-600 bg-rose-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          }`}
        >
          Scrap ({scrapNotifications.length})
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab(
              "QC_FAILED",
            )
          }
          className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
            activeTab ===
            "QC_FAILED"
              ? "border-amber-600 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
              : "border-border bg-card text-muted-foreground hover:border-amber-500 hover:text-foreground"
          }`}
        >
          QC Failed ({qcFailedNotifications.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("CU")}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
            activeTab === "CU"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground"
          }`}
        >
          Returnable ({returnableNotifications.length})
        </button>
      </div>

      {activeTab === "PO" && (
        <>
      {/* ================= PURCHASE ORDER TABLE ================= */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm dark:border-slate-700 dark:bg-slate-950">
        <div className="overflow-x-auto">
          <div className="min-w-[1450px]">
            <div className="grid grid-cols-[1.05fr_1.15fr_1.15fr_1.6fr_.7fr_.95fr_.9fr_1fr_.95fr_1.35fr] items-center border-b border-slate-200 bg-slate-100 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <div className="text-center">PO ID</div>
              <div className="text-center">MR ID</div>
              <div className="text-center">Vendor</div>
              <div className="text-center">Components</div>
              <div className="text-center">Qty</div>
              <div className="text-center">Order Total</div>
              <div className="text-center">PO Date</div>
              <div className="text-center">Expected Delivery</div>
              <div className="text-center">Status</div>
              <div className="text-center">Action</div>
            </div>

            <div className="divide-y divide-border dark:divide-slate-800">
              {loading ? (
                <NotificationTableLoader
                  title="Loading Finance PO notifications..."
                  subtitle="Fetching the latest Purchase Orders waiting for Finance."
                />
              ) : notifications.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                  No Finance Notifications
                </div>
              ) : (
                notifications.map((notification) => {
                  const po =
                    notification.poDetails || {};

                  const status = getPOStatus(
                    po,
                    notification
                  );

                  const isReplacementPO =
                    String(
                      po?.order_type ||
                        po?.orderType ||
                        ""
                    )
                      .trim()
                      .toUpperCase() ===
                      "REPLACEMENT" ||
                    status.startsWith(
                      "REPLACEMENT_"
                    );

                  const isApproved =
                    [
                      "FINANCE_APPROVED",
                      "REPLACEMENT_FINANCE_APPROVED",
                      "REPLACEMENT_APPROVED",
                    ].includes(
                      status
                    );

                  const isRejected =
                    [
                      "FINANCE_REJECTED",
                      "REPLACEMENT_FINANCE_REJECTED",
                    ].includes(
                      status
                    );

                  const items = Array.isArray(
                    po.items
                  )
                    ? po.items
                    : [];

                  const poId =
                    notification.reference_id ||
                    notification.referenceId;

                  const poNumber =
                    po.po_number ||
                    po.po ||
                    notification.title
                      ?.replace(
                        "PO Approval Request - ",
                        ""
                      )
                      .trim() ||
                    "-";

                  const sourceMRNumber =
                    getPOSourceMRNumber(po);

                  return (
                    <div
                      key={notification.id}
                      className="grid grid-cols-[1.05fr_1.15fr_1.15fr_1.6fr_.7fr_.95fr_.9fr_1fr_.95fr_1.35fr] items-center px-6 py-4 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      {/* PO ID */}
                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() =>
                            openPODetails(
                              notification
                            )
                          }
                          className="font-semibold text-blue-600 hover:underline dark:text-blue-300"
                          title="View Purchase Order details"
                        >
                          {poNumber}
                        </button>
                      </div>

                      {/* MR ID */}
                      <div className="text-center">
                        {sourceMRNumber ? (
                          <button
                            type="button"
                            onClick={() =>
                              openMRDetails(
                                sourceMRNumber
                              )
                            }
                            className="font-semibold text-blue-600 hover:underline dark:text-blue-300"
                            title="View Material Request details"
                          >
                            {sourceMRNumber}
                          </button>
                        ) : (
                          <span className="font-medium text-slate-500 dark:text-slate-400">
                            Direct PO
                          </span>
                        )}
                      </div>

                      {/* Vendor */}
                      <div className="text-center text-slate-700 dark:text-slate-200">
                        {po.vendor_name ||
                          po.vendor?.name ||
                          po.vendor ||
                          "-"}
                      </div>

                      {/* Components */}
                      <div className="flex min-h-[40px] items-center justify-center px-2 text-center text-slate-700 dark:text-slate-200">
                        {items.length > 0 ? (
                          <div className="flex w-full flex-col items-center justify-center gap-1">
                            {items
                              .slice(0, 2)
                              .map(
                                (
                                  item,
                                  index
                                ) => (
                                  <div
                                    key={
                                      item.id ||
                                      item.component_id ||
                                      index
                                    }
                                    className="max-w-full truncate text-center"
                                    title={getComponentName(
                                      item
                                    )}
                                  >
                                    {getComponentName(
                                      item
                                    )}
                                  </div>
                                )
                              )}

                            {items.length > 2 && (
                              <button
                                type="button"
                                onClick={() =>
                                  openPODetails(
                                    notification
                                  )
                                }
                                className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-300"
                              >
                                +{items.length - 2} more
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">
                            {notification.poLoadError
                              ? "Unable to load"
                              : "-"}
                          </span>
                        )}
                      </div>

                      <div className="text-center font-semibold text-slate-800 dark:text-slate-100">
                        {getTotalQuantity(po)}
                      </div>

                      <div className="text-center font-semibold text-slate-800 dark:text-slate-100">
                        ₹{formatMoney(
                          calculatePOTotal(po)
                        )}
                      </div>

                      <div className="text-center text-slate-600 dark:text-slate-300">
                        {formatDate(
                          po.po_date ||
                            po.date ||
                            po.created_date
                        )}
                      </div>

                      <div className="text-center text-slate-600 dark:text-slate-300">
                        {formatDate(
                          po.expected_delivery_date ||
                            po.expected_date ||
                            po.delivery_date
                        )}
                      </div>

                      <div className="flex justify-center">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                            isApproved
                              ? "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : isRejected
                              ? "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
                              : "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          }`}
                        >
                          {isApproved
                            ? (
                                isReplacementPO
                                  ? "Replacement Finance Approved"
                                  : "Finance Approved"
                              )
                            : isRejected
                            ? (
                                isReplacementPO
                                  ? "Replacement Finance Rejected"
                                  : "Finance Rejected"
                              )
                            : (
                                isReplacementPO
                                  ? "Replacement - Pending Finance"
                                  : "Pending Finance"
                              )}
                        </span>
                      </div>

                      <div className="flex justify-center gap-2">
                        {isApproved ||
                        isRejected ? (
                          <button
                            type="button"
                            className="rounded-lg bg-slate-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600"
                            onClick={() =>
                              removeNotification(
                                notification.id
                              )
                            }
                          >
                            Remove
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={
                                String(processingPOId) === String(poId)
                              }
                              className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition ${
                                String(processingPOId) === String(poId)
                                  ? "cursor-not-allowed bg-emerald-400"
                                  : "bg-emerald-600 hover:bg-emerald-700"
                              }`}
                              onClick={() =>
                                updatePOStatus(poId, "APPROVED")
                              }
                            >
                              {String(processingPOId) === String(poId)
                                ? "Approving..."
                                : "Finance Approve"}
                            </button>

                            <button
                              type="button"
                              disabled={
                                String(processingPOId) === String(poId)
                              }
                              className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition ${
                                String(processingPOId) === String(poId)
                                  ? "cursor-not-allowed bg-rose-400"
                                  : "bg-rose-600 hover:bg-rose-700"
                              }`}
                              onClick={() => openRejectPopup(poId)}
                            >
                              Finance Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

        </>
      )}

      {activeTab === "QC_FAILED" && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[1.1fr_1.2fr_1.7fr_.7fr_1fr_1.4fr] items-center border-b border-border bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <div>Source PO</div>
            <div>Action</div>
            <div>Component</div>
            <div className="text-center">Failed Qty</div>
            <div className="text-center">Refund Amount</div>
            <div className="text-center">Finance Action</div>
          </div>

          <div className="divide-y divide-border">
            {loading ? (
              <NotificationTableLoader
                title="Loading QC Failed notifications..."
                subtitle="Fetching the latest QC Failed refund requests waiting for Finance."
              />
            ) : qcFailedNotifications.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No Direct PO QC Failed Refunds waiting for Finance.
              </div>
            ) : (
              qcFailedNotifications.map(
                (notification) => {
                  const inward =
                    notification?.inwardDetails ||
                    {};

                  const failedRows =
                    getRefundFailedRows(
                      inward,
                    );

                  const firstFailed =
                    failedRows[0] ||
                    {};

                  const refundAmount =
                    Number(
                      firstFailed
                        ?.refund_total ||
                        0,
                    );

                  const reference =
                    String(
                      notification
                        ?.reference_id ||
                        notification
                          ?.referenceId ||
                        "",
                    );

                  const inwardId =
                    reference
                      .toUpperCase()
                      .startsWith(
                        "INWARD_REFUND:",
                      )
                      ? reference.split(
                          ":",
                          2,
                        )[1]
                      : "";

                  const poNumber =
                    String(
                      inward
                        ?.purchase_order_number ||
                        inward?.po_number ||
                        notification
                          ?.title
                          ?.replace(
                            "Direct PO QC Refund Finance Approval - ",
                            "",
                          ) ||
                        "-",
                    ).trim();

                  const processKey =
                    String(
                      notification?.id ||
                        inwardId ||
                        "",
                    );

                  const processing =
                    String(
                      processingQcFailedId ||
                        "",
                    ) ===
                    processKey;

                  return (
                    <div
                      key={processKey}
                      className="grid grid-cols-[1.1fr_1.2fr_1.7fr_.7fr_1fr_1.4fr] items-center px-4 py-4 text-sm hover:bg-muted/20"
                    >
                      <div className="font-semibold">
                        {poNumber || "-"}
                      </div>

                      <div>
                        Direct PO Refund
                      </div>

                      <div className="break-words pr-2">
                        {getRefundComponentLabel(
                          inward,
                        )}
                      </div>

                      <div className="text-center font-bold">
                        {getRefundFailedQuantity(
                          inward,
                        )}
                      </div>

                      <div className="text-center font-semibold">
                        ₹{formatMoney(
                          refundAmount,
                        )}
                      </div>

                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() =>
                            void processRefundFinanceApproval(
                              notification,
                              "APPROVE",
                            )
                          }
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {processing
                            ? "Processing..."
                            : "Finance Approve"}
                        </button>

                        <button
                          type="button"
                          disabled={processing}
                          onClick={() =>
                            void processRefundFinanceApproval(
                              notification,
                              "REJECT",
                            )
                          }
                          className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                },
              )
            )}
          </div>
        </div>
      )}

      {activeTab === "CU" && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[1fr_2fr_1fr_1.3fr] bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <div>Reference</div>
            <div>Returnable Not OK</div>
            <div>Status</div>
            <div className="text-center">Action</div>
          </div>
          <div className="divide-y divide-border">
            {loading ? (
              <NotificationTableLoader
                title="Loading Returnable notifications..."
                subtitle="Fetching the latest Returnable requests waiting for Finance."
              />
            ) : returnableNotifications.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No Returnable Not OK requests waiting for Finance.
              </div>
            ) : (
              returnableNotifications.map((notification) => {
                const statusValue = String(notification.status || "").toUpperCase();
                const pending = statusValue === "PENDING_FINANCE";
                return (
                  <div key={notification.id} className="grid grid-cols-[1fr_2fr_1fr_1.3fr] items-center px-4 py-4 text-sm">
                    <div className="font-semibold">{notification.reference_id || "-"}</div>
                    <div>
                      <div className="font-medium">{notification.title || "Returnable Not OK"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{notification.message || "-"}</div>
                    </div>
                    <div>{statusValue.replaceAll("_", " ") || "PENDING"}</div>
                    <div className="flex justify-center gap-2">
                      {pending ? (
                        <>
                          <button type="button" onClick={() => void processReturnableFinanceApproval(notification, "APPROVE")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Finance Approve</button>
                          <button type="button" onClick={() => void processReturnableFinanceApproval(notification, "REJECT")} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white">Reject</button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Processed</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === "SCRAP" && (
        <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm dark:border-slate-700 dark:bg-slate-950">
          <div className="w-full">
            <div className="grid grid-cols-[0.72fr_1.15fr_0.45fr_1.15fr_0.45fr_0.58fr_0.85fr_0.68fr_1fr_0.7fr_1.55fr] items-center border-b border-slate-200 bg-slate-100 px-1.5 py-2.5 text-[10px] font-semibold uppercase text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <div className="text-center">Requested By</div>
              <div className="text-center">Scrap Component</div>
              <div className="text-center">Scrap Qty</div>
              <div className="text-center">Good Component</div>
              <div className="text-center">Good Qty</div>
              <div className="text-center">Source</div>
              <div className="text-center">Material Request</div>
              <div className="text-center">Date</div>
              <div className="text-center">Remarks</div>
              <div className="text-center">Status</div>
              <div className="text-center">Action</div>
            </div>

            <div className="divide-y divide-border dark:divide-slate-800">
              {loading ? (
                <NotificationTableLoader
                  title="Loading Scrap notifications..."
                  subtitle="Fetching the latest Scrap requests waiting for Finance."
                />
              ) : scrapNotifications.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                  No Manager-approved Scrap / Return-QC requests waiting for Finance.
                </div>
              ) : (
                scrapNotifications.map((notification) => {
                  const scrap =
                    notification.scrapDetails || {};
                  const scrapMetadata =
                    scrap.inventory_allocations &&
                    typeof scrap.inventory_allocations === "object"
                      ? scrap.inventory_allocations
                      : {};
                  const managerReorderDecision = String(
                    scrapMetadata.manager_disposition_decision ||
                      scrapMetadata.reorder_choice ||
                      ""
                  )
                    .trim()
                    .toUpperCase();

                  const scrapWorkflow = String(
                    scrapMetadata.workflow || ""
                  )
                    .trim()
                    .toUpperCase();

                  const damagedItems =
                    Array.isArray(
                      scrapMetadata.scrap_items
                    )
                      ? scrapMetadata.scrap_items
                      : [];

                  const explicitGoodItems =
                    Array.isArray(
                      scrapMetadata.good_items
                    )
                      ? scrapMetadata.good_items
                      : [];

                  const reorderItems =
                    Array.isArray(
                      scrapMetadata.reorder_items
                    )
                      ? scrapMetadata.reorder_items
                      : [];

                  const returnItems =
                    Array.isArray(
                      scrapMetadata.return_items
                    )
                      ? scrapMetadata.return_items
                      : [];

                  const legacySelectedItems =
                    Array.isArray(
                      scrapMetadata.selected_items
                    )
                      ? scrapMetadata.selected_items
                      : [];

                  /*
                   * good_items can legitimately be [] on older records even
                   * though selected_items/reorder_items contains the reusable
                   * serials. Do not treat an empty array as authoritative.
                   */
                  const reusableItems =
                    explicitGoodItems.length
                      ? explicitGoodItems
                      : reorderItems.length
                        ? reorderItems
                        : returnItems.length
                          ? returnItems
                          : legacySelectedItems;

                  const reusableQuantityForDecision =
                    reusableItems.reduce(
                      (sum, item) =>
                        sum +
                        Number(
                          item?.quantity ||
                            item?.serial_numbers?.length ||
                            0
                        ),
                      0
                    );

                  const managerDecisionLabel =
                    scrapWorkflow === "RETURNABLE_COMPONENT_QC_V1"
                      ? "Restore / Replace"
                      : scrapWorkflow === "RETURNABLE_DRONE_QC_V1"
                        ? "Rebuild Drone"
                        : managerReorderDecision === "YES"
                          ? (
                              (
                                String(
                                  scrapMetadata.scrap_mode || ""
                                )
                                  .trim()
                                  .toUpperCase() === "TOTAL"
                              ) ||
                              reusableQuantityForDecision <= 0
                            )
                            ? "Fully Reorder (FR)"
                            : "Partially Reorder (PR)"
                          : "Return to Store";

                  const componentNames = (items) =>
                    items
                      .map((item) => {
                        const name = item?.component_name || item?.label || item?.component_code || "Component";
                        const quantity = Number(item?.quantity || item?.serial_numbers?.length || 0);
                        return `${name}-${quantity}`;
                      })
                      .filter(Boolean)
                      .join(", ");
                  const componentQuantity = (items) =>
                    items.reduce(
                      (total, item) => total + Number(item?.quantity || item?.serial_numbers?.length || 0),
                      0
                    );
                  const scrapComponentNames = componentNames(damagedItems) || getScrapComponentLabel(scrap);
                  const scrapQuantity = componentQuantity(damagedItems) || Number(scrap.quantity ?? scrap.qty ?? 0);
                  const goodComponentNames = componentNames(reusableItems) || "-";
                  const goodQuantity = componentQuantity(reusableItems);
                  const goodSerialNumbers = Array.from(
                    new Set(
                      reusableItems.flatMap((item) =>
                        Array.isArray(item?.serial_numbers)
                          ? item.serial_numbers.map((serial) => String(serial || "").trim()).filter(Boolean)
                          : []
                      )
                    )
                  );
                  const serialDetailsFromItems = (items) =>
                    items.flatMap((item) => {
                      const componentName =
                        item?.component_name || item?.label || item?.component_code || "Component";
                      return Array.isArray(item?.serial_numbers)
                        ? item.serial_numbers
                            .map((serial) => String(serial || "").trim())
                            .filter(Boolean)
                            .map((serial) => ({ serial, componentName }))
                        : [];
                    });
                  const scrapSerialDetails = serialDetailsFromItems(damagedItems);
                  const goodSerialDetails = serialDetailsFromItems(reusableItems);

                  const outwardId =
                    notification.reference_id ||
                    notification.referenceId ||
                    scrap.id;

                  const status =
                    getScrapStatus(notification);

                  const isPending =
                    status === "PENDING_FINANCE";
                  const isRejected =
                    status === "FINANCE_REJECTED";
                  const isApproved =
                    status === "APPROVED" ||
                    status === "FINANCE_APPROVED";

                  const serials =
                    getScrapSerialNumbers(scrap);

                  const componentLabel =
                    getScrapComponentLabel(scrap);

                  return (
                    <div
                      key={
                        notification.id ||
                        `scrap-${outwardId}`
                      }
                      className="grid grid-cols-[0.72fr_1.15fr_0.45fr_1.15fr_0.45fr_0.58fr_0.85fr_0.68fr_1fr_0.7fr_1.55fr] items-center px-1.5 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <div className="px-1 text-center text-sm font-medium">
                        {cleanScrapRequesterName(
                          getScrapRequestedBy(
                            scrap,
                            notification
                          )
                        ) || "-"}
                      </div>

                      <div
                        className="break-words px-1 text-center text-[11px] font-medium leading-4 text-slate-800 dark:text-slate-100"
                        title={scrapComponentNames}
                      >
                        {scrapComponentNames}
                      </div>

                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() =>
                            setScrapSerialPopup({
                              title:
                                "Scrap Serial Numbers",
                              serialNumbers:
                                scrapSerialDetails.length ? scrapSerialDetails : serials,
                            })
                          }
                          className="inline-flex min-w-10 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-sm font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/50"
                          title="Click to view all serial numbers"
                        >
                          {scrapQuantity}
                        </button>
                      </div>

                      <div className="break-words px-1 text-center text-[11px] font-medium leading-4" title={goodComponentNames}>
                        {goodComponentNames}
                      </div>

                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() =>
                            setScrapSerialPopup({
                              title: "Good / Reusable Serial Numbers",
                              serialNumbers: goodSerialDetails.length
                                ? goodSerialDetails
                                : goodSerialNumbers,
                            })
                          }
                          className="inline-flex min-w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                          title="Click to view all good/reusable serial numbers"
                        >
                          {goodQuantity}
                        </button>
                      </div>

                      <div className="text-center text-xs font-medium">
                        {String(
                          scrap.source ||
                            notification.source ||
                            "DIRECT"
                        ).toUpperCase()}
                      </div>

                      <div className="break-words px-1 text-center text-xs font-medium">
                        {getScrapMaterialRequest(
                          scrap,
                          notification
                        )}
                      </div>

                      <div className="text-center text-xs">
                        {formatDate(
                          scrap.out_date ||
                            scrap.outDate ||
                            notification.created_at
                        )}
                      </div>

                      <div
                        className="break-words px-1 text-center text-xs text-slate-500 dark:text-slate-400"
                        title={
                          scrap.remarks ||
                          notification.remarks ||
                          ""
                        }
                      >
                        <div>
                          {scrap.remarks || notification.remarks || "-"}
                        </div>
                        <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          managerReorderDecision === "YES"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-blue-200 bg-blue-50 text-blue-700"
                        }`}>
                          {managerDecisionLabel} Decision: {managerReorderDecision === "YES" ? "YES" : "NO"}
                        </div>
                      </div>

                      <div className="flex justify-center">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-4 ${
                            isRejected
                              ? "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
                              : isApproved
                              ? "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          }`}
                        >
                          {isRejected
                            ? "Finance Rejected"
                            : isApproved
                            ? "Approved"
                            : status === "MANAGER_REJECTED"
                            ? "Manager Rejected"
                            : status === "PENDING_MANAGER"
                            ? "Pending Manager"
                            : status === "MANAGER_APPROVED"
                            ? "Manager Approved"
                            : "Pending Finance"}
                        </span>
                      </div>

                      <div className="flex flex-nowrap items-center justify-center gap-1 whitespace-nowrap px-1">
                        {isPending ? (
                          <>
                            <button
                              type="button"
                              disabled={
                                String(
                                  processingScrapId
                                ) ===
                                String(outwardId)
                              }
                              onClick={() =>
                                updateScrapStatus(
                                  outwardId,
                                  "APPROVED"
                                )
                              }
                              className={`whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium leading-4 text-white transition ${
                                String(
                                  processingScrapId
                                ) ===
                                String(outwardId)
                                  ? "cursor-not-allowed bg-emerald-400"
                                  : "bg-emerald-600 hover:bg-emerald-700"
                              }`}
                            >
                              {String(
                                processingScrapId
                              ) ===
                              String(outwardId)
                                ? "Processing..."
                                : "Finance Approve"}
                            </button>

                            <button
                              type="button"
                              disabled={
                                String(
                                  processingScrapId
                                ) ===
                                String(outwardId)
                              }
                              onClick={() =>
                                openScrapRejectPopup(
                                  outwardId
                                )
                              }
                              className="whitespace-nowrap rounded-md bg-rose-600 px-2 py-1 text-[10px] font-medium leading-4 text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Finance Reject
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              removeNotification(
                                notification.id
                              )
                            }
                            className="whitespace-nowrap rounded-md bg-slate-200 px-2 py-1 text-[10px] font-medium leading-4 text-slate-800 transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {scrapSerialPopup && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4 dark:bg-black/70">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">
                {scrapSerialPopup.title}
              </h2>

              <button
                type="button"
                onClick={() =>
                  setScrapSerialPopup(
                    null
                  )
                }
                className="rounded-lg px-3 py-1.5 text-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close serial numbers"
              >
                ×
              </button>
            </div>

            <div className="mt-4">
              {Array.isArray(
                scrapSerialPopup
                  .serialNumbers
              ) &&
              scrapSerialPopup
                .serialNumbers
                .length > 0 ? (
                <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                  {scrapSerialPopup
                    .serialNumbers
                    .map(
                      (
                        serial,
                        index
                      ) => (
                        <div
                          key={`${typeof serial === "object" ? serial?.serial : serial}-${index}`}
                          className="rounded-lg bg-white px-3 py-2 text-sm shadow-sm dark:bg-slate-800"
                        >
                          <div className="font-semibold">
                            {typeof serial === "object" ? serial?.serial : serial}
                          </div>
                          {typeof serial === "object" && serial?.componentName ? (
                            <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                              Component: {serial.componentName}
                            </div>
                          ) : null}
                        </div>
                      )
                    )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No serial numbers available.
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  setScrapSerialPopup(
                    null
                  )
                }
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= PO DETAILS POPUP ================= */}
      {showPODetailsPopup &&
        selectedPODetails && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4 dark:bg-black/70">
            <div className="max-h-[88vh] w-[1050px] max-w-[96vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">
              <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-700">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    Purchase Order Details
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Complete Finance review details for this Purchase Order.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closePODetails}
                  className="rounded-lg px-3 py-1.5 text-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  ×
                </button>
              </div>

              {(() => {
                const notification =
                  selectedPODetails.notification ||
                  {};

                const po =
                  selectedPODetails.po || {};

                const items = Array.isArray(
                  po.items
                )
                  ? po.items
                  : [];

                const sourceMRNumber =
                  getPOSourceMRNumber(po);

                const status = getPOStatus(
                  po,
                  notification
                );

                return (
                  <div className="max-h-[72vh] overflow-y-auto">
                    <div className="grid gap-4 border-b border-slate-200 p-6 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700">
                      {[
                        [
                          "PO Number",
                          po.po_number ||
                            po.po ||
                            "-",
                        ],
                        [
                          "Vendor",
                          po.vendor_name ||
                            po.vendor?.name ||
                            po.vendor ||
                            "-",
                        ],
                        [
                          "MR ID",
                          sourceMRNumber ||
                            "Direct PO",
                        ],
                        [
                          "PO Date",
                          formatDate(
                            po.po_date ||
                              po.created_date
                          ),
                        ],
                        [
                          "Expected Delivery",
                          formatDate(
                            po.expected_delivery_date ||
                              po.expected_date
                          ),
                        ],
                        [
                          "Status",
                          status ||
                            "PENDING_FINANCE",
                        ],
                        [
                          "Approval Status",
                          po.approval_status ||
                            "-",
                        ],
                        [
                          "Order Total",
                          `₹${formatMoney(
                            calculatePOTotal(po)
                          )}`,
                        ],
                      ].map(
                        ([label, value]) => (
                          <div
                            key={label}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"
                          >
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {label}
                            </div>
                            <div className="mt-2 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {value}
                            </div>
                          </div>
                        )
                      )}
                    </div>

                    <div className="p-6">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          PO Components
                        </h3>

                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          Total Qty:{" "}
                          {getTotalQuantity(
                            po
                          )}
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                        <table className="w-full min-w-[760px] text-sm">
                          <thead className="bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            <tr>
                              <th className="px-4 py-3 text-left">
                                Component
                              </th>
                              <th className="px-4 py-3 text-center">
                                Qty
                              </th>
                              <th className="px-4 py-3 text-right">
                                Unit Price
                              </th>
                              <th className="px-4 py-3 text-right">
                                GST %
                              </th>
                              <th className="px-4 py-3 text-right">
                                Line Total
                              </th>
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {items.length > 0 ? (
                              items.map(
                                (
                                  item,
                                  index
                                ) => (
                                  <tr
                                    key={
                                      item.id ||
                                      item.component_id ||
                                      index
                                    }
                                  >
                                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                                      {getComponentName(
                                        item
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {Number(
                                        item.quantity ||
                                          item.qty ||
                                          0
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      ₹
                                      {formatMoney(
                                        getPOItemUnitPrice(
                                          item
                                        )
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      {getPOItemGST(
                                        item
                                      )}
                                      %
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold">
                                      ₹
                                      {formatMoney(
                                        getPOItemLineTotal(
                                          item
                                        )
                                      )}
                                    </td>
                                  </tr>
                                )
                              )
                            ) : (
                              <tr>
                                <td
                                  colSpan={5}
                                  className="px-4 py-8 text-center text-slate-500"
                                >
                                  No PO components found.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {po.rejection_reason && (
                        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                          <strong>
                            Rejection Reason:
                          </strong>{" "}
                          {po.rejection_reason}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-end border-t border-slate-200 px-6 py-4 dark:border-slate-700">
                <button
                  type="button"
                  onClick={closePODetails}
                  className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      {/* ================= MR DETAILS POPUP ================= */}
      {showMRDetailsPopup && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4 dark:bg-black/70">
          <div className="max-h-[88vh] w-[1100px] max-w-[96vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-700">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Material Request Details
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Original Material Request information linked to this PO.
                </p>
              </div>

              <button
                type="button"
                onClick={closeMRDetails}
                className="rounded-lg px-3 py-1.5 text-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                ×
              </button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto">
              {mrDetailsLoading ? (
                <div className="p-12 text-center text-sm text-slate-500">
                  Loading Material Request details...
                </div>
              ) : mrDetailsError ? (
                <div className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                  {mrDetailsError}
                </div>
              ) : selectedMRDetails ? (
                <>
                  <div className="grid gap-4 border-b border-slate-200 p-6 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700">
                    {[
                      [
                        "MR ID",
                        getMRReference(
                          selectedMRDetails
                        ) || "-",
                      ],
                      [
                        "Requester",
                        selectedMRDetails.requester_name ||
                          selectedMRDetails.requester ||
                          selectedMRDetails.created_by ||
                          "-",
                      ],
                      [
                        "Project",
                        selectedMRDetails.project_name ||
                          selectedMRDetails.project ||
                          "-",
                      ],
                      [
                        "Request Type",
                        selectedMRDetails.request_type ||
                          "-",
                      ],
                      [
                        "Drone Qty",
                        selectedMRDetails.required_quantity ??
                          selectedMRDetails.drone_quantity ??
                          selectedMRDetails.quantity ??
                          "-",
                      ],
                      [
                        "Created Date",
                        formatDate(
                          selectedMRDetails.created_date ||
                            selectedMRDetails.date ||
                            selectedMRDetails.created_at
                        ),
                      ],
                      [
                        "Required Date",
                        formatDate(
                          selectedMRDetails.required_date ||
                            selectedMRDetails.requiredDate
                        ),
                      ],
                      [
                        "Status",
                        selectedMRDetails.approval_status ||
                          selectedMRDetails.status ||
                          "-",
                      ],
                    ].map(
                      ([label, value]) => (
                        <div
                          key={label}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"
                        >
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {label}
                          </div>
                          <div className="mt-2 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {String(
                              value ?? "-"
                            )}
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  {selectedMRDetails.remarks && (
                    <div className="px-6 pt-6">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Remarks
                        </div>
                        <div className="mt-2 text-sm text-slate-800 dark:text-slate-100">
                          {
                            selectedMRDetails.remarks
                          }
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="p-6">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Requested Components
                      </h3>

                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        Total items:{" "}
                        {getMRItems(
                          selectedMRDetails
                        ).length}
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead className="bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          <tr>
                            <th className="px-4 py-3 text-left">
                              Type
                            </th>
                            <th className="px-4 py-3 text-left">
                              Component
                            </th>
                            <th className="px-4 py-3 text-left">
                              Category
                            </th>
                            <th className="px-4 py-3 text-left">
                              Specification
                            </th>
                            <th className="px-4 py-3 text-center">
                              Requested Qty
                            </th>
                            <th className="px-4 py-3 text-center">
                              Inventory Qty at MR Creation
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {getMRItems(
                            selectedMRDetails
                          ).length > 0 ? (
                            getMRItems(
                              selectedMRDetails
                            ).map(
                              (
                                item,
                                index
                              ) => (
                                <tr
                                  key={
                                    item.id ||
                                    `${item.__sourceType}-${index}`
                                  }
                                >
                                  <td className="px-4 py-3">
                                    {
                                      item.__sourceType
                                    }
                                  </td>
                                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                                    {getMRComponentName(
                                      item
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    {typeof (item.category || item.category_name) ===
                                    "object"
                                      ? (item.category || item.category_name)?.name ||
                                        (item.category || item.category_name)?.component_type ||
                                        "-"
                                      : item.category ||
                                        item.category_name ||
                                        "-"}
                                  </td>
                                  <td className="px-4 py-3">
                                    {typeof (item.specification || item.specifications) ===
                                    "object"
                                      ? (item.specification || item.specifications)?.name ||
                                        "-"
                                      : item.specification ||
                                        item.specifications ||
                                        "-"}
                                  </td>
                                  <td className="px-4 py-3 text-center font-semibold">
                                    {Number(
                                      item.quantity ??
                                        item.qty ??
                                        item.quantity_requested ??
                                        0
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    {getMRInventorySnapshot(
                                      item
                                    )}
                                  </td>
                                </tr>
                              )
                            )
                          ) : (
                            <tr>
                              <td
                                colSpan={6}
                                className="px-4 py-8 text-center text-slate-500"
                              >
                                No Material Request components found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="flex justify-end border-t border-slate-200 px-6 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={closeMRDetails}
                className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= SCRAP FINANCE REJECT POPUP ================= */}
      {showScrapRejectPopup && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 px-4 dark:bg-black/70">
          <div className="w-[430px] max-w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Scrap Finance Rejection
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Enter the Finance rejection reason for this Scrap request.
              </p>
            </div>

            <textarea
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              rows={5}
              placeholder="Enter rejection remarks..."
              value={scrapRejectReason}
              onChange={(event) =>
                setScrapRejectReason(
                  event.target.value
                )
              }
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                onClick={closeScrapRejectPopup}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  selectedScrapId &&
                  String(processingScrapId) ===
                    String(selectedScrapId)
                }
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
                  selectedScrapId &&
                  String(processingScrapId) ===
                    String(selectedScrapId)
                    ? "cursor-not-allowed bg-rose-400"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
                onClick={submitScrapReject}
              >
                {selectedScrapId &&
                String(processingScrapId) ===
                  String(selectedScrapId)
                  ? "Rejecting..."
                  : "Finance Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= FINANCE REJECT POPUP ================= */}
      {showRejectPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 dark:bg-black/70">
          <div className="w-[430px] max-w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Finance Rejection
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Enter the reason for rejecting this Purchase Order.
              </p>
            </div>

            <textarea
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              rows={5}
              placeholder="Enter rejection remarks..."
              value={rejectReason}
              onChange={(event) =>
                setRejectReason(
                  event.target.value
                )
              }
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                onClick={closeRejectPopup}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  selectedPO &&
                  String(processingPOId) === String(selectedPO)
                }
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
                  selectedPO &&
                  String(processingPOId) === String(selectedPO)
                    ? "cursor-not-allowed bg-rose-400"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
                onClick={submitReject}
              >
                {selectedPO &&
                String(processingPOId) === String(selectedPO)
                  ? "Rejecting..."
                  : "Finance Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
