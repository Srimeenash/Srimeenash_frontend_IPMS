import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { StatusBadge } from "@/components/app/DataTable";
import config from "@/config";
import { fetchAuthenticatedJson } from "@/api";
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

export default function NotificationsPage() {
  const { user, access } = useAuth();
 const role = String(
  user?.active_role ||
  user?.activeRole ||
  user?.role?.name ||
  user?.role ||
  user?.designation ||
  user?.department ||
  ""
).toLowerCase();


const isAdmin = role.includes("admin");
const isManager = role.includes("manager");
const isInventory = role.includes("inventory");

/*
 * Scrap approval is the first Outward action that explicitly
 * requires request.user on the Django side.
 *
 * The current project stores JWT data in auth_state, but some
 * api.js/authStore versions may look for a different token key.
 * Prefer the token already held by AuthContext, then fall back
 * to the known storage formats used by this project.
 */
const getUserDisplayName = (
  value = "",
) => {
  const raw = String(
    value || "",
  ).trim();

  if (!raw) {
    return "";
  }

  /*
   * Never show an email address in the UI.
   * If an older rejection stored an email, show only
   * the username part before "@".
   */
  if (raw.includes("@")) {
    return (
      raw.split("@")[0]
        ?.trim() ||
      "Manager"
    );
  }

  return raw;
};

const cleanScrapRequesterName = (
  value,
) => {
  let raw = String(
    value || "",
  ).trim();

  if (!raw) {
    return "";
  }

  /*
   * Keep Manager Scrap Requested By identical to Finance Scrap.
   *
   * naveen.r@aero360.co.in -> Naveen
   * naveen.r                -> Naveen
   */
  if (raw.includes("@")) {
    raw = raw
      .split("@", 1)[0]
      .trim();
  }

  if (
    !raw.includes(" ") &&
    raw.includes(".")
  ) {
    raw = raw
      .split(".", 1)[0]
      .trim();
  }

  if (!raw) {
    return "";
  }

  return (
    raw.charAt(0).toUpperCase() +
    raw.slice(1)
  );
};

const getScrapRequesterName = (
  outward = {},
  notification = {},
) => {
  const candidates = [
    // Explicit human-readable employee/display names first.
    outward?.employee_name,
    outward?.employeeName,
    outward?.requested_by_name,
    outward?.requester_name,
    outward?.requestedByName,
    outward?.requesterName,

    notification?.employee_name,
    notification?.employeeName,
    notification?.requester_name,
    notification?.requesterName,
    notification?.requested_by_name,
    notification?.requestedByName,

    // Login/email values are fallback only.
    outward?.requested_by,
    outward?.requestedBy,
    notification?.requested_by,
    notification?.requestedBy,
  ];

  for (const candidate of candidates) {
    const name =
      cleanScrapRequesterName(
        candidate,
      );

    if (name) {
      return name;
    }
  }

  const title = String(
    notification?.title || "",
  ).trim();

  if (
    title &&
    !/^OUT-/i.test(title)
  ) {
    return (
      cleanScrapRequesterName(
        title,
      ) || "-"
    );
  }

  return "-";
};


const getLoggedInUserName = () => {
  const directName =
    user?.employee_name ||
    user?.employeeName ||
    user?.full_name ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    [
      user?.first_name,
      user?.last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  return (
    getUserDisplayName(
      directName,
    ) ||
    "Manager"
  );
};

const getCurrentAccessToken = () => {
  if (access) {
    return String(access).trim();
  }

  try {
    const authState = JSON.parse(
      window.localStorage.getItem("auth_state") ||
        "{}",
    );

    if (authState?.access) {
      return String(authState.access).trim();
    }
  } catch (error) {
    console.warn(
      "Unable to read auth_state:",
      error,
    );
  }

  return (
    window.localStorage.getItem("ipms_access") ||
    window.localStorage.getItem("access") ||
    window.localStorage.getItem("access_token") ||
    window.localStorage.getItem("accessToken") ||
    window.sessionStorage.getItem("access") ||
    window.sessionStorage.getItem("access_token") ||
    window.sessionStorage.getItem("accessToken") ||
    ""
  ).trim();
};

  const [rawNotifications, setRawNotifications] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedPoDetails, setSelectedPoDetails] = useState(null);
  const [showPoDetailsModal, setShowPoDetailsModal] = useState(false);
  const [poDetailsLoading, setPoDetailsLoading] = useState(false);
  const [
    processingScrapId,
    setProcessingScrapId,
  ] = useState(null);

  // Scrap Qty serial-number popup.
  // Serial numbers are no longer shown as a separate Scrap table column.
  const [
    scrapSerialPopup,
    setScrapSerialPopup,
  ] = useState(null);

  // Returnable Components popup.
  // Keep serial numbers out of the table and show them only on click.
  const [
    returnableSerialPopup,
    setReturnableSerialPopup,
  ] = useState(null);

  /*
   * Manager Returnable -> Components / Qty popup.
   *
   * One click on the table cell shows the COMPLETE component list for that
   * Returnable request instead of opening one component/serial popup at a time.
   */
  const [
    returnableComponentsPopup,
    setReturnableComponentsPopup,
  ] = useState(null);
  /*
   * Refs lock synchronously. React state alone can be one render late,
   * which is enough for a fast second click to send another request.
   */
  const processingScrapLockRef = useRef(new Set());
  const actionLocksRef = useRef(new Set());
  const [processingActionKeys, setProcessingActionKeys] = useState([]);
  const [scrapDispositionPopup, setScrapDispositionPopup] = useState(null);

  const beginNotificationAction = (key) => {
    const value = String(key ?? "");
    if (!value || actionLocksRef.current.has(value)) {
      return false;
    }

    actionLocksRef.current.add(value);
    setProcessingActionKeys((previous) =>
      previous.includes(value)
        ? previous
        : [...previous, value],
    );
    return true;
  };

  const endNotificationAction = (key) => {
    const value = String(key ?? "");
    actionLocksRef.current.delete(value);
    setProcessingActionKeys((previous) =>
      previous.filter((item) => item !== value),
    );
  };

  const isNotificationActionProcessing = (key) =>
    processingActionKeys.includes(String(key ?? ""));
const isFinance = role.includes("finance");

const [currentTab, setCurrentTab] = useState(
    isFinance ? "PO" : "MR"
);
  const [mrData, setMrData] = useState([]);
  const [bomData, setBomData] = useState([]);
  const [
  showBomDetailsModal,
  setShowBomDetailsModal,
] = useState(false);

const [
  selectedBomDetails,
  setSelectedBomDetails,
] = useState(null);

const [
  bomDetailsLoading,
  setBomDetailsLoading,
] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [activeRejectNotification, setActiveRejectNotification] = useState(null);

  const [pendingRejectStatus, setPendingRejectStatus] = useState("");
  const [pendingRejectResourceType, setPendingRejectResourceType] = useState("");
const [showBomModal, setShowBomModal] = useState(false);
const [selectedMr, setSelectedMr] = useState(null);

const [
  managerInventoryCounts,
  setManagerInventoryCounts,
] = useState({});
  useEffect(() => {
    setLoading(true);
    loadNotifications();
  }, [isManager, isAdmin, isInventory]);

  useEffect(() => {
    let refreshTimer = null;

    const handleNotificationsUpdated = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(
        () => {
          void loadNotifications();
        },
        150,
      );
    };

    window.addEventListener(
      "notificationsUpdated",
      handleNotificationsUpdated,
    );

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      window.removeEventListener(
        "notificationsUpdated",
        handleNotificationsUpdated,
      );
    };
  }, []);

/*
 * Manager MR Type must match the Material Requests page.
 *
 * BOM + customized_bom=true  -> Custom BOM
 * BOM + customized_bom=false -> BOM
 * R&D / RD                   -> R & D
 *
 * Other request types keep their existing labels.
 */
const getManagerMrTypeLabel = (request = {}) => {
  const requestType = String(
    request?.request_type ||
      request?.requestType ||
      ""
  )
    .trim()
    .toUpperCase();

  const rawCustomizedBom =
    request?.customized_bom ??
    request?.customizedBom ??
    false;

  const isCustomizedBom =
    rawCustomizedBom === true ||
    rawCustomizedBom === 1 ||
    String(rawCustomizedBom)
      .trim()
      .toLowerCase() === "true" ||
    String(rawCustomizedBom).trim() === "1";

  if (requestType === "BOM") {
    return isCustomizedBom
      ? "Custom BOM"
      : "BOM";
  }

  if (
    requestType === "R&D" ||
    requestType === "RD"
  ) {
    return "R & D";
  }

  if (requestType === "RETURNABLE") {
    return String(
      request?.returnable_purpose ||
        request?.returnablePurpose ||
        "Returnable"
    )
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(
        /\b\w/g,
        (letter) => letter.toUpperCase()
      );
  }

  if (requestType === "RETAIL_SALES") {
    return "Retail Sales";
  }

  return (
    request?.request_type ||
    request?.requestType ||
    "-"
  );
};


const normalizeRequestStatus = (item) => {
  let rawStatus = String(
    item.approval_status || item.status || "NOT_REQUESTED"
  )
    .trim()
    .toUpperCase();

  if (rawStatus === "MANAGER_REJECTED") {
    return "MANAGER_REJECTED";
  }

  if (rawStatus === "REJECTED") {
    return "REJECTED";
  }

  if (rawStatus === "NOT_REQUESTED") {
    return "PENDING";
  }

  return rawStatus;
};

const unwrapManagerApiList = (
  payload,
) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
};


const normalizeManagerInventoryKey = (
  value,
) =>
  String(value ?? "")
    .trim()
    .toLowerCase();


const compactManagerInventoryKey = (
  value,
) =>
  normalizeManagerInventoryKey(value)
    .replace(/[^a-z0-9]/g, "");


const getManagerComponentKeys = (
  row = {},
) => {
  const keys = new Set();

  const addValue = (value) => {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return;
    }

    if (
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      [
        value.id,
        value.pk,
        value.component,
        value.component_id,
        value.component_code,
        value.code,
        value.name,
        value.component_name,
      ].forEach(addValue);

      return;
    }

    const normalized =
      normalizeManagerInventoryKey(value);

    const compact =
      compactManagerInventoryKey(value);

    if (normalized) {
      keys.add(normalized);
    }

    if (compact) {
      keys.add(compact);
    }

    const digits = String(value)
      .match(/\d+/g)
      ?.join("");

    if (digits) {
      keys.add(digits);
    }
  };

  [
    row.component,
    row.component_id,
    row.componentId,
    row.component_code,
    row.componentCode,
    row.code,
    row.component_name,
    row.componentName,
    row.name,
    row.product_name,
    row.item_name,
  ].forEach(addValue);

  return Array.from(keys);
};


const getManagerQuantity = (
  row = {},
) => {
  if (
    row.issued === true ||
    row.issued === 1
  ) {
    return 0;
  }

  const value =
    row.available_quantity ??
    row.remaining_quantity ??
    row.in_store_quantity ??
    row.stock_quantity ??
    row.quantity ??
    row.qty ??
    row.passed_quantity ??
    row.quantity_received ??
    row.total_quantity ??
    0;

  const quantity = Number(value);

  return Number.isFinite(quantity)
    ? Math.max(quantity, 0)
    : 0;
};


const isManagerProjectInventory = (
  row = {},
) => {
  const source = String(
    row.source ||
      row.inventory_source ||
      row.stock_source ||
      row.inventory_scope ||
      "",
  )
    .trim()
    .toLowerCase();

  return Boolean(
    row.project_inventory_record ||
    row.project_inventory ||
    row.project_inventory_id ||
    row.material_request ||
    row.material_request_id ||
    row.source_mr_number ||
    row.material_request_number ||
    source.includes("project")
  );
};


const isManagerInwardGeneratedInventory = (
  row = {},
) => {
  const source = String(
    row.source ||
      row.inventory_source ||
      row.stock_source ||
      "",
  )
    .trim()
    .toLowerCase();

  const inventoryCode = String(
    row.inventory_code ||
      row.code ||
      "",
  ).trim();

  const serialText = [
    row.serial_number,
    row.serialNumber,
    ...(Array.isArray(row.serials)
      ? row.serials
      : []),
    ...(Array.isArray(row.serials_list)
      ? row.serials_list
      : []),
  ]
    .filter(Boolean)
    .join(",");

  return Boolean(
    row.inward ||
    row.inward_id ||
    row.inward_entry ||
    row.inward_entry_id ||
    row.grn ||
    row.grn_id ||
    row.inward_code ||
    source === "inward" ||
    /^INW[-_ ]?/i.test(inventoryCode) ||
    /C_\d+S\d+/i.test(serialText)
  );
};


const getManagerQcPassedRows = (
  inward = {},
) => {
  const candidates = [
    inward.passedRows,
    inward.qc_passed_rows,
    inward.passed_rows,
    inward.qcPassedRows,
    inward.qc_results?.passedRows,
    inward.qc_results?.passed_rows,
    inward.qc_results?.passed,
    inward.qc?.passedRows,
    inward.qc?.passed_rows,
    inward.qc?.passed,
  ];

  return (
    candidates.find(Array.isArray) ||
    []
  );
};


const getManagerQcPassedQuantity = (
  inward = {},
) => {
  const rows =
    getManagerQcPassedRows(inward);

  if (rows.length) {
    return rows.reduce(
      (sum, row) => {
        const value =
          row?.qty ??
          row?.quantity ??
          row?.passed_quantity ??
          1;

        const quantity = Number(value);

        return (
          sum +
          (
            Number.isFinite(quantity)
              ? Math.max(quantity, 0)
              : 0
          )
        );
      },
      0,
    );
  }

  const explicitCount = Number(
    inward.qc_passed_count ??
      inward.passed_count ??
      inward.pass_count ??
      inward.passed_quantity,
  );

  if (
    Number.isFinite(explicitCount)
  ) {
    return Math.max(
      explicitCount,
      0,
    );
  }

  const status = String(
    inward.qc_status ||
      inward.qcStatus ||
      inward.inspection_status ||
      "",
  )
    .trim()
    .toUpperCase();

  if (
    [
      "PASS",
      "PASSED",
      "COMPLETED",
      "QC_CHECKED",
    ].includes(status)
  ) {
    return getManagerQuantity(inward);
  }

  return 0;
};


const loadManagerInventoryCounts =
  async () => {
    const fetchJson = async (url) => {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Request failed: ${response.status}`,
        );
      }

      return response.json();
    };

    const [
      componentResult,
      inwardResult,
      purchaseOrderResult,
    ] = await Promise.all([
      fetchAllNotificationPagesShared(
        `/components/components/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
        { cache: "no-store" },
      ).catch(() => []),

      fetchAllNotificationPagesShared(
        `/inward/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
        { cache: "no-store" },
      ).catch(() => []),

      fetchAllNotificationPagesShared(
        `/procurement/purchase-orders/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
        { cache: "no-store" },
      ).catch(() => []),
    ]);

    const components =
      unwrapManagerApiList(
        componentResult,
      );

    const inwards =
      unwrapManagerApiList(
        inwardResult,
      );

    const purchaseOrders =
      unwrapManagerApiList(
        purchaseOrderResult,
      );

    const componentByKey =
      new Map();

    components.forEach((component) => {
      getManagerComponentKeys(
        component,
      ).forEach((key) => {
        componentByKey.set(
          key,
          component,
        );
      });
    });

    const purchaseOrderById =
      new Map();

    purchaseOrders.forEach(
      (purchaseOrder) => {
        [
          purchaseOrder.id,
          purchaseOrder.pk,
          purchaseOrder.po_number,
          purchaseOrder.po,
        ]
          .filter(
            (value) =>
              value !== undefined &&
              value !== null &&
              value !== "",
          )
          .forEach((value) => {
            purchaseOrderById.set(
              String(value),
              purchaseOrder,
            );
          });
      },
    );

    const getExpandedKeys = (
      row,
    ) => {
      const keys = new Set(
        getManagerComponentKeys(row),
      );

      let matchedComponent = null;

      for (const key of keys) {
        if (
          componentByKey.has(key)
        ) {
          matchedComponent =
            componentByKey.get(key);
          break;
        }
      }

      if (matchedComponent) {
        getManagerComponentKeys(
          matchedComponent,
        ).forEach((key) =>
          keys.add(key),
        );
      }

      return Array.from(keys);
    };

    let inventoryRows = [];

    const inventoryEndpoints = [
      `/inventory/inventory/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
      `/inventory/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
      `${config.baseURL}/inventory/inventory/`,
      `${config.baseURL}/inventory/`,
    ];

    for (
      const endpoint of
      inventoryEndpoints
    ) {
      try {
        const rows =
          await fetchAllNotificationPagesShared(
            endpoint,
            { cache: "no-store" },
          );

        if (rows.length) {
          inventoryRows = rows;
          break;
        }
      } catch {
        // Try the next supported endpoint.
      }
    }

    /*
     * Inventory API count contains only manual/free stock.
     * Rows generated from Inward are counted from /inward/
     * below so INW-0004 and INW-0005 are not duplicated.
     */
    const manualCounts = {};

    inventoryRows.forEach((row) => {
      if (
        isManagerProjectInventory(row) ||
        isManagerInwardGeneratedInventory(
          row,
        )
      ) {
        return;
      }

      const quantity =
        getManagerQuantity(row);

      if (quantity <= 0) {
        return;
      }

      getExpandedKeys(row).forEach(
        (key) => {
          manualCounts[key] =
            Number(
              manualCounts[key] || 0,
            ) + quantity;
        },
      );
    });

    const inwardCounts = {};

    inwards.forEach((inward) => {
      if (
        inward.removed_from_inventory ===
          true ||
        inward.removed_from_inventory ===
          1 ||
        inward.issued === true ||
        inward.issued === 1
      ) {
        return;
      }

      const rawPurchaseOrder =
        inward.purchase_order ??
        inward.purchaseOrder ??
        inward.purchase_order_id ??
        inward.po_id;

      const purchaseOrderId =
        typeof rawPurchaseOrder ===
        "object"
          ? rawPurchaseOrder.id ??
            rawPurchaseOrder.pk
          : rawPurchaseOrder;

      const purchaseOrder =
        (
          typeof rawPurchaseOrder ===
          "object"
            ? rawPurchaseOrder
            : null
        ) ||
        purchaseOrderById.get(
          String(
            purchaseOrderId ?? "",
          ),
        );

      const sourceMrNumber = String(
        inward.source_mr_number ||
          inward.material_request_id ||
          inward.mr_number ||
          purchaseOrder?.source_mr_number ||
          purchaseOrder?.material_request_id ||
          purchaseOrder?.mr_number ||
          "",
      ).trim();

      /*
       * MR-linked procurement stock belongs to Project
       * Inventory and is not free In Store stock.
       */
      if (sourceMrNumber) {
        return;
      }

      const passedQuantity =
        getManagerQcPassedQuantity(
          inward,
        );

      if (passedQuantity <= 0) {
        return;
      }

      getExpandedKeys(inward).forEach(
        (key) => {
          inwardCounts[key] =
            Number(
              inwardCounts[key] || 0,
            ) + passedQuantity;
        },
      );
    });

    const totalCounts = {
      ...manualCounts,
    };

    Object.entries(
      inwardCounts,
    ).forEach(
      ([key, quantity]) => {
        totalCounts[key] =
          Number(
            totalCounts[key] || 0,
          ) +
          Number(quantity || 0);
      },
    );

    console.debug(
      "Manager live In Store counts:",
      {
        manualInventory:
          manualCounts,
        directInward:
          inwardCounts,
        total:
          totalCounts,
      },
    );

    setManagerInventoryCounts(
      totalCounts,
    );

    return totalCounts;
  };


const getManagerInventoryQuantity = (
  item = {},
) => {
  const keys =
    getManagerComponentKeys(item);

  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(
        managerInventoryCounts,
        key,
      )
    ) {
      const quantity = Number(
        managerInventoryCounts[key],
      );

      return Number.isFinite(quantity)
        ? Math.max(quantity, 0)
        : 0;
    }

    const component =
      managerInventoryCounts[
        compactManagerInventoryKey(key)
      ];

    if (
      component !== undefined
    ) {
      const quantity = Number(component);

      return Number.isFinite(quantity)
        ? Math.max(quantity, 0)
        : 0;
    }
  }

  const backendQuantity = Number(
    item.available_inventory_quantity ??
      item.availableInventoryQuantity ??
      item.physical_inventory_quantity ??
      item.physicalInventoryQuantity ??
      item.inventory_quantity ??
      item.inventoryQuantity ??
      0,
  );

  return Number.isFinite(
    backendQuantity,
  )
    ? Math.max(backendQuantity, 0)
    : 0;
};


/*
 * MR notification details must show only the values saved in the
 * Material Request. Do not load current Inventory for this popup.
 */


/*
 * Inventory Qty shown in the Manager MR popup is the immutable value
 * stored in that Material Request item when the MR was created.
 *
 * Never read managerInventoryCounts or current In Store stock here.
 * An explicit value of 0 is valid and must remain 0.
 */
const getMrStoredInventoryQuantity = (item = {}) => {
  const rawQuantity =
    item?.creation_inventory_quantity ??
    item?.created_inventory_quantity ??
    item?.inventory_snapshot_quantity ??
    item?.inventory_quantity ??
    item?.inventoryQuantity ??
    item?.inventory_qty ??
    item?.inventoryQty ??
    0;

  const quantity = Number(rawQuantity);

  return Number.isFinite(quantity)
    ? Math.max(quantity, 0)
    : 0;
};


const normalizeManagerMrComponentKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const getManagerMrComponentKeys = (row = {}) => {
  const keys = new Set();

  const addValue = (value) => {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return;
    }

    if (
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      [
        value.id,
        value.pk,
        value.component,
        value.component_id,
        value.componentId,
        value.component_code,
        value.componentCode,
        value.code,
        value.name,
        value.component_name,
        value.componentName,
      ].forEach(addValue);

      return;
    }

    const normalized =
      normalizeManagerMrComponentKey(value);

    if (!normalized) {
      return;
    }

    keys.add(normalized);

    const compact =
      normalized.replace(/[^a-z0-9]/g, "");

    if (compact) {
      keys.add(compact);
    }
  };

  [
    row.component,
    row.component_id,
    row.componentId,
    row.component_pk,
    row.component_db_id,
    row.component_code,
    row.componentCode,
    row.code,
    row.component_name,
    row.componentName,
    row.name,
    row.product_name,
    row.productName,
    row.component_details,
    row.component_obj,
    row.component_data,
  ].forEach(addValue);

  return Array.from(keys);
};

const getManagerMrProjectRows = (request = {}) =>
  Array.isArray(request?.project_inventory_rows)
    ? request.project_inventory_rows
    : [];

const getManagerMrProjectRow = (
  item = {},
  request = {},
) => {
  const itemKeys = new Set(
    getManagerMrComponentKeys(item),
  );

  if (!itemKeys.size) {
    return null;
  }

  return (
    getManagerMrProjectRows(request).find(
      (row) =>
        getManagerMrComponentKeys(row).some(
          (key) => itemKeys.has(key),
        ),
    ) || null
  );
};

const getManagerMrIssuedQuantity = (
  item = {},
  request = {},
) => {
  const projectRow =
    getManagerMrProjectRow(item, request);

  if (!projectRow) {
    return 0;
  }

  const directIssued = Number(
    projectRow.issued_quantity ??
      projectRow.calculated_issued_quantity,
  );

  if (Number.isFinite(directIssued)) {
    return Math.max(directIssued, 0);
  }

  return (
    Math.max(
      Number(
        projectRow.issued_store_quantity || 0,
      ) || 0,
      0,
    ) +
    Math.max(
      Number(
        projectRow.issued_purchased_quantity || 0,
      ) || 0,
      0,
    )
  );
};

const getManagerMrRemainingQuantity = (
  item = {},
  request = {},
) =>
  Math.max(
    Number(
      item?.quantity ??
        item?.qty ??
        item?.required_quantity ??
        0,
    ) -
      getManagerMrIssuedQuantity(
        item,
        request,
      ),
    0,
  );

const getManagerMrReservedByOtherQuantity = (
  item = {},
) => {
  const quantity = Number(
    item?.reserved_by_other_mrs ??
      item?.reservedByOtherMrs ??
      0,
  );

  return Number.isFinite(quantity)
    ? Math.max(quantity, 0)
    : 0;
};

const getManagerMrAvailableQuantity = (
  item = {},
) => {
  const explicit = Number(
    item?.available_inventory_quantity ??
      item?.availableInventoryQuantity,
  );

  if (Number.isFinite(explicit)) {
    return Math.max(explicit, 0);
  }

  return Math.max(
    getMrStoredInventoryQuantity(item) -
      getManagerMrReservedByOtherQuantity(
        item,
      ),
    0,
  );
};

const getManagerMrReservationDetails = (
  item = {},
) =>
  Array.isArray(
    item?.reserved_by_other_mr_details,
  )
    ? item.reserved_by_other_mr_details
    : Array.isArray(
        item?.reservedByOtherMrDetails,
      )
      ? item.reservedByOtherMrDetails
      : [];

const renderManagerMrStockStatus = (
  item = {},
) => {
  const requestedQuantity = Math.max(
    Number(
      item?.quantity ??
        item?.qty ??
        item?.required_quantity ??
        0,
    ) || 0,
    0,
  );

  const availableQuantity =
    getManagerMrAvailableQuantity(item);

  const reservedQuantity =
    getManagerMrReservedByOtherQuantity(
      item,
    );

  const reservationDetails =
    getManagerMrReservationDetails(item);

  if (availableQuantity <= 0) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          Unavailable
        </span>

        {reservedQuantity > 0 && (
          <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
            {reservedQuantity} reserved by other MR
          </div>
        )}

        {reservationDetails.length > 0 && (
          <div className="max-w-[230px] text-center text-[11px] leading-4 text-slate-500 dark:text-slate-400">
            {reservationDetails.map(
              (reservation, index) => (
                <div
                  key={`manager-mr-reservation-${index}`}
                >
                  {reservation.material_request_id ||
                    "Other MR"}
                  {" · "}
                  {Number(
                    reservation.reserved_quantity ||
                      0,
                  )}{" "}
                  reserved
                </div>
              ),
            )}
          </div>
        )}
      </div>
    );
  }

  const isPartiallyAvailable =
    requestedQuantity > 0 &&
    availableQuantity < requestedQuantity;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span
        className={
          isPartiallyAvailable
            ? "inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
            : "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
        }
      >
        {isPartiallyAvailable
          ? "Partially Available"
          : "Available"}
      </span>

      {reservedQuantity > 0 && (
        <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
          {reservedQuantity} reserved by other MR
        </div>
      )}

      {reservationDetails.length > 0 && (
        <div className="max-w-[230px] text-center text-[11px] leading-4 text-slate-500 dark:text-slate-400">
          {reservationDetails.map(
            (reservation, index) => (
              <div
                key={`manager-mr-reservation-detail-${index}`}
              >
                {reservation.material_request_id ||
                  "Other MR"}
                {" · "}
                {Number(
                  reservation.reserved_quantity ||
                    0,
                )}{" "}
                reserved
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
};

const getManagerMrProjectQuantity = (
  item = {},
  request = {},
) => {
  const projectRow =
    getManagerMrProjectRow(item, request);

  const procurementShortage = Math.max(
    Number(
      item?.procurement_shortage_quantity ??
        item?.procurementShortageQuantity ??
        0,
    ) || 0,
    0,
  );

  const qcPassedQuantity = Math.max(
    Number(
      item?.qc_passed_quantity ??
        item?.qcPassedQuantity ??
        0,
    ) || 0,
    0,
  );

  const projectQuantity = projectRow
    ? Math.max(
        Number(
          projectRow.purchased_quantity || 0,
        ) || 0,
        Number(
          projectRow.qc_passed_quantity || 0,
        ) || 0,
        Number(
          projectRow.issued_purchased_quantity ||
            0,
        ) || 0,
      )
    : qcPassedQuantity;

  if (
    procurementShortage <= 0 &&
    projectQuantity <= 0
  ) {
    return 0;
  }

  return procurementShortage > 0
    ? Math.min(
        projectQuantity,
        procurementShortage,
      )
    : projectQuantity;
};

const getManagerMrComponentWorkflowStatus = (
  item = {},
  request = {},
) => {
  const requested = Math.max(
    Number(
      item?.quantity ??
        item?.qty ??
        item?.required_quantity ??
        0,
    ) || 0,
    0,
  );

  const poRaised = Math.max(
    Number(
      item?.po_raised_quantity || 0,
    ) || 0,
    0,
  );

  const delivered = Math.max(
    Number(
      item?.delivered_quantity || 0,
    ) || 0,
    0,
  );

  const qcPassed = Math.max(
    Number(
      item?.qc_passed_quantity || 0,
    ) || 0,
    0,
  );

  const qcFailed = Math.max(
    Number(
      item?.qc_failed_quantity || 0,
    ) || 0,
    0,
  );

  const shortage = Math.max(
    Number(
      item?.procurement_shortage_quantity ||
        0,
    ) || 0,
    0,
  );

  const issued =
    getManagerMrIssuedQuantity(
      item,
      request,
    );

  const projectRow =
    getManagerMrProjectRow(
      item,
      request,
    );

  const readyRemaining = projectRow
    ? Math.max(
        Number(
          projectRow.remaining_store_quantity ||
            0,
        ) || 0,
        0,
      ) +
      Math.max(
        Number(
          projectRow
            .remaining_purchased_quantity ||
            0,
        ) || 0,
        0,
      )
    : Math.max(qcPassed - issued, 0);

  if (
    requested > 0 &&
    issued >= requested
  ) {
    return {
      label: "Issued to Engineer",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (issued > 0) {
    return {
      label: "Partially Issued",
      className:
        "border-blue-200 bg-blue-50 text-blue-700",
    };
  }

  if (readyRemaining > 0) {
    return {
      label: "Ready to Issue",
      className:
        "border-sky-200 bg-sky-50 text-sky-700",
    };
  }

  if (
    qcFailed > 0 &&
    qcPassed <= 0 &&
    delivered > 0
  ) {
    return {
      label: "QC Failed",
      className:
        "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (
    delivered > 0 &&
    qcPassed < delivered
  ) {
    return {
      label:
        qcPassed > 0
          ? "Partial QC Passed"
          : "QC Pending",
      className:
        "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (
    delivered > 0 &&
    delivered <
      Math.max(
        poRaised,
        shortage,
        requested,
      )
  ) {
    return {
      label: "Partially Delivered",
      className:
        "border-orange-200 bg-orange-50 text-orange-700",
    };
  }

  if (
    poRaised > 0 &&
    delivered <= 0
  ) {
    return {
      label: "Awaiting Delivery",
      className:
        "border-violet-200 bg-violet-50 text-violet-700",
    };
  }

  if (shortage > 0) {
    return {
      label: "Procurement Pending",
      className:
        "border-slate-200 bg-slate-50 text-slate-700",
    };
  }

  if (
    Number(
      item?.reserved_store_quantity || 0,
    ) > 0
  ) {
    return {
      label: "Reserved In Store",
      className:
        "border-cyan-200 bg-cyan-50 text-cyan-700",
    };
  }

  return {
    label: "Pending",
    className:
      "border-slate-200 bg-slate-50 text-slate-700",
  };
};

const renderManagerMrComponentStatus = (
  item = {},
  request = {},
) => {
  const result =
    getManagerMrComponentWorkflowStatus(
      item,
      request,
    );

  return (
    <span
      className={`inline-flex max-w-full whitespace-normal rounded-full border px-2 py-1 text-center text-[11px] font-semibold leading-tight ${result.className}`}
    >
      {result.label}
    </span>
  );
};

const getManagerMrComponentDisplay = (
  item = {},
) => {
  const code = String(
    item?.component_code ||
      item?.componentCode ||
      "",
  ).trim();

  const name = String(
    item?.component_name ||
      item?.componentName ||
      item?.name ||
      item?.component?.name ||
      "",
  ).trim();

  if (code && name) {
    return `${code} — ${name}`;
  }

  return name || code || "Unknown component";
};


/*
 * Open the exact Material Request detail record.
 * This intentionally calls only the Material Request endpoint.
 * No Inventory endpoint is called for this popup.
 */
const openMrDetailsPopup = async (notification) => {
  const materialRequestDatabaseId =
    notification?.reference_id ??
    notification?.referenceId ??
    notification?.material_request_db_id ??
    notification?.materialRequestDbId;

  if (
    materialRequestDatabaseId === undefined ||
    materialRequestDatabaseId === null ||
    materialRequestDatabaseId === ""
  ) {
    alert(
      "Unable to open Material Request details because its database ID is missing.",
    );
    return;
  }

  try {
    const materialRequest =
      await fetchAuthenticatedJson(
        `${config.baseURL}/materialrequest/material-requests/${encodeURIComponent(
          materialRequestDatabaseId,
        )}/`,
        {
          cache: "no-store",
        },
      );

    const materialRequestReference = String(
      materialRequest?.material_request_id ||
        materialRequest?.request_id ||
        notification?.material_request_id ||
        "",
    ).trim();

    let projectInventoryRows = [];

    const projectInventoryEndpoints = [
      materialRequestReference
        ? `${config.baseURL}/inventory/project-inventory/?source_mr_number=${encodeURIComponent(
            materialRequestReference,
          )}&page_size=1000`
        : null,
      materialRequest?.id
        ? `${config.baseURL}/inventory/project-inventory/?material_request=${encodeURIComponent(
            materialRequest.id,
          )}&page_size=1000`
        : null,
    ].filter(Boolean);

    for (const endpoint of projectInventoryEndpoints) {
      try {
        const projectResponse =
          await fetch(endpoint, {
            cache: "no-store",
          });

        if (!projectResponse.ok) {
          continue;
        }

        const projectPayload =
          await projectResponse.json();

        projectInventoryRows =
          unwrapManagerApiList(
            projectPayload,
          );

        if (projectInventoryRows.length) {
          break;
        }
      } catch (projectError) {
        console.warn(
          "Unable to load MR Project Inventory details:",
          projectError,
        );
      }
    }

    setSelectedMr({
      ...notification,
      ...materialRequest,

      /*
       * Keep the notification ID separate from the MR database ID.
       */
      notification_id: notification?.id,
      material_request_db_id:
        materialRequest?.id ??
        materialRequestDatabaseId,

      material_request_id:
        materialRequest?.material_request_id ||
        materialRequest?.request_id ||
        notification?.material_request_id ||
        "-",

      bom_items: Array.isArray(
        materialRequest?.bom_items,
      )
        ? materialRequest.bom_items
        : [],

      custom_bom_items: Array.isArray(
        materialRequest?.custom_bom_items,
      )
        ? materialRequest.custom_bom_items
        : [],

      rd_items: Array.isArray(
        materialRequest?.rd_items,
      )
        ? materialRequest.rd_items
        : [],

      request_items: Array.isArray(
        materialRequest?.request_items,
      )
        ? materialRequest.request_items
        : [],

      returnable_purpose:
        materialRequest?.returnable_purpose ||
        notification?.returnable_purpose ||
        "",

      /*
       * Used only for delivered/QC/issued/project progress in this popup.
       * Creation-time Inventory Qty still comes only from the MR item.
       */
      project_inventory_rows:
        projectInventoryRows,
    });

    setShowBomModal(true);
  } catch (error) {
    console.error(
      "Failed to load exact Material Request details:",
      error,
    );

    alert(
      error?.message ||
      "Unable to load Material Request details.",
    );
  }
};


  const dedupeNotifications = (notifications) => {
    const seen = new Set();
    const results = [];

    for (const notification of notifications) {
      const key = `${String(notification.category || "").toUpperCase()}|${String(
        notification.reference_id || notification.referenceId || notification.material_request_id || notification.request_id || ""
      )}|${String(notification.receiver || "").toUpperCase()}|${String(notification.status || "").toUpperCase()}`;

      if (!seen.has(key)) {
        seen.add(key);
        results.push(notification);
      }
    }

    return results;
  };





const getPoItems = (po = {}) =>
  Array.isArray(po?.items) ? po.items : [];

const getPoItemComponentCode = (item = {}) =>
  String(
    item?.component?.component_id ||
      item?.component?.code ||
      item?.component_id ||
      ""
  ).trim();

const getPoItemComponentName = (item = {}) =>
  String(
    item?.component?.name ||
      item?.component?.component_name ||
      item?.component_name ||
      item?.name ||
      "Component"
  ).trim();

const getPoItemSubtotal = (item = {}) => {
  const backendValue = Number(item?.subtotal);
  if (Number.isFinite(backendValue)) {
    return backendValue;
  }
  return Number(item?.quantity || 0) * Number(item?.unit_price || 0);
};

const getPoItemGstAmount = (item = {}) => {
  const backendValue = Number(item?.gst_amount);
  if (Number.isFinite(backendValue)) {
    return backendValue;
  }
  return (
    getPoItemSubtotal(item) *
    Number(item?.gst_percentage || 0) /
    100
  );
};

const getPoItemTotal = (item = {}) => {
  const backendValue = Number(item?.total_cost);
  if (Number.isFinite(backendValue)) {
    return backendValue;
  }
  return getPoItemSubtotal(item) + getPoItemGstAmount(item);
};

const getPoTotals = (po = {}) => {
  const items = getPoItems(po);
  const subtotal = items.reduce(
    (sum, item) => sum + getPoItemSubtotal(item),
    0,
  );
  const gstTotal = items.reduce(
    (sum, item) => sum + getPoItemGstAmount(item),
    0,
  );
  const calculatedTotal = subtotal + gstTotal;
  const backendTotal = Number(po?.total);

  return {
    subtotal,
    gstTotal,
    grandTotal:
      Number.isFinite(backendTotal) && backendTotal > 0
        ? backendTotal
        : calculatedTotal,
    quantity: items.reduce(
      (sum, item) => sum + Number(item?.quantity || 0),
      0,
    ),
  };
};

const formatPoDate = (value) => {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-IN");
};

const normalizeVendorList = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
};

const getVendorDisplayName = (vendor = {}) =>
  String(
    vendor?.name ||
      vendor?.vendor_name ||
      vendor?.company_name ||
      ""
  )
    .trim()
    .toLowerCase();

const getVendorLocationDisplay = (vendor = {}) => {
  const directLocation = String(
    vendor?.location || ""
  ).trim();

  if (directLocation) {
    return directLocation;
  }

  return [
    vendor?.address,
    vendor?.city,
    vendor?.state,
    vendor?.pincode,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
};

const openPoDetailsPopup = async (notification) => {
  const poId =
    notification?.poId ||
    notification?.reference_id ||
    notification?.referenceId;

  if (!poId) {
    alert("Purchase Order ID is missing.");
    return;
  }

  setPoDetailsLoading(true);
  setShowPoDetailsModal(true);
  setSelectedPoDetails(null);

  try {
    const po = await fetchAuthenticatedJson(
      `${config.baseURL}/procurement/purchase-orders/${encodeURIComponent(
        poId,
      )}/`,
      {
        cache: "no-store",
      },
    );

    let vendor = null;

    try {
      const vendorPayload =
        await fetchAuthenticatedJson(
          `${config.baseURL}/vendors/`,
          {
            cache: "no-store",
          },
        );

      const vendorName = String(
        po?.vendor_name || ""
      )
        .trim()
        .toLowerCase();

      vendor =
        normalizeVendorList(
          vendorPayload,
        ).find(
          (row) =>
            getVendorDisplayName(row) ===
            vendorName,
        ) || null;
    } catch (vendorError) {
      console.warn(
        "Unable to load Vendor master details for PO popup:",
        vendorError,
      );
    }

    const vendorGstin = String(
      vendor?.gst_number ||
        vendor?.gstn ||
        vendor?.gstin ||
        po?.gstin ||
        ""
    ).trim();

    const vendorLocation =
      getVendorLocationDisplay(vendor) ||
      String(po?.location || "").trim();

    setSelectedPoDetails({
      ...po,

      // These two values come from Vendor master when available.
      vendorGstin:
        vendorGstin || "-",
      vendorLocation:
        vendorLocation || "-",

      notificationId: notification?.id,
      notificationStatus: String(
        notification?.status || po?.status || "",
      ).toUpperCase(),
      requestedBy:
        notification?.requested_by ||
        notification?.requestedBy ||
        po?.latest_approval?.requested_by ||
        "-",
    });
  } catch (error) {
    console.error("Unable to load PO details:", error);

    alert(
      error?.message ||
        "Unable to load Purchase Order details.",
    );

    setShowPoDetailsModal(false);
  } finally {
    setPoDetailsLoading(false);
  }
};

const closePoDetailsPopup = () => {
  setShowPoDetailsModal(false);
  setSelectedPoDetails(null);
  setPoDetailsLoading(false);
};

const loadNotifications = async () => {
  try {
    const receiver =
      isFinance
        ? "FINANCE"
        : isManager
          ? "MANAGER"
          : isInventory
            ? "INVENTORY"
            : "";

    const notificationUrl = receiver
      ? `/notifications/?receiver=${encodeURIComponent(
          receiver,
        )}&page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`
      : `/notifications/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`;

    let results =
      await fetchAllNotificationPagesShared(
        notificationUrl,
        {
          cache: "no-store",
        },
      );

    if (isManager) {
      try {
        const purchaseOrders =
          await fetchAllNotificationPagesShared(
            `${config.baseURL}/procurement/purchase-orders/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
            { cache: "no-store" },
          );

        const notificationPOIds = new Set(
          results
            .filter(
              (notification) =>
                String(notification?.category || "").toUpperCase() === "PO" &&
                String(notification?.receiver || "").toUpperCase() === "MANAGER",
            )
            .map((notification) =>
              String(
                notification?.reference_id ||
                  notification?.referenceId ||
                  "",
              ),
            ),
        );

        const missingManagerNotifications = purchaseOrders
          .filter((po) => {
            const poId = String(po?.id || po?.purchase_order_id || "");
            const orderType = String(po?.order_type || "STANDARD").toUpperCase();
            const sourceMrNumber = String(po?.source_mr_number || "").trim();
            const approvalStatus = String(
              po?.status || po?.approval_status || "",
            ).toUpperCase();

            return (
              poId &&
              !notificationPOIds.has(poId) &&
              orderType !== "REPLACEMENT" &&
              !sourceMrNumber &&
              ![
                "PENDING_FINANCE",
                "FINANCE_APPROVED",
                "APPROVED",
                "REJECTED",
                "MANAGER_REJECTED",
                "ORDERED",
                "DELIVERED",
                "CANCELLED",
              ].includes(approvalStatus)
            );
          })
          .map((po) => ({
            id: `PO-MANAGER-${po.id}`,
            category: "PO",
            receiver: "MANAGER",
            reference_id: String(po.id),
            status: "PENDING_MANAGER",
            title: `PO APPROVAL REQUEST - ${po.po_number || po.po || po.id}`,
            message: `Approval requested for Purchase Order ${po.po_number || po.po || po.id}`,
            is_read: false,
          }));

        results = [...results, ...missingManagerNotifications];
      } catch (purchaseOrderError) {
        console.warn(
          "Unable to recover pending Purchase Order manager notifications:",
          purchaseOrderError,
        );
      }
    }

    console.log("All Notifications:", results);

console.log(
  "Finance PO Notifications:",
  results.filter(
    (n) =>
      String(n.category).toUpperCase() === "PO" &&
      String(n.receiver).toUpperCase() === "FINANCE"
  )
);
    results =
      dedupeNotifications(
        results,
      );

    /*
     * SCRAP notifications contain only workflow metadata.
     * The real Scrap Code / Date / Remarks live in OutwardEntry.
     *
     * Enrich the notification from /outward/<reference_id>/ so
     * the Notification Scrap table is the same as the Scrap record.
     */
    let enrichedResults =
      await Promise.all(
        results.map(
          async (notification) => {
            const category =
              String(
                notification?.category ||
                  "",
              )
                .trim()
                .toUpperCase();

            if (
              category !==
              "SCRAP"
            ) {
              return notification;
            }

            const outwardId =
              notification?.reference_id ??
              notification?.referenceId;

            if (
              outwardId === undefined ||
              outwardId === null ||
              outwardId === ""
            ) {
              return notification;
            }

            try {
              const outward =
                await fetchNotificationDetailCached(
                  `${config.baseURL}/outward/${encodeURIComponent(
                    outwardId,
                  )}/`,
                  { cache: "no-store" },
                );

              const outwardStatus =
                String(
                  outward?.status ||
                    outward?.approval_status ||
                    notification?.status ||
                    "PENDING_MANAGER",
                )
                  .trim()
                  .toUpperCase();

              const scrapMetadata =
                outward?.inventory_allocations &&
                typeof outward.inventory_allocations === "object"
                  ? outward.inventory_allocations
                  : {};
              const damagedItems = Array.isArray(scrapMetadata.scrap_items)
                ? scrapMetadata.scrap_items
                : [];
              const reusableItems = Array.isArray(scrapMetadata.good_items)
                ? scrapMetadata.good_items
                : Array.isArray(scrapMetadata.selected_items)
                  ? scrapMetadata.selected_items
                  : [];
              const summarizeComponentNames = (items) =>
                items
                  .map((item) => {
                    const name = item?.component_name || item?.label || item?.component_code || "Component";
                    const quantity = Number(item?.quantity || item?.serial_numbers?.length || 0);
                    return `${name}-${quantity}`;
                  })
                  .filter(Boolean)
                  .join(", ");
              const summarizeQuantity = (items) =>
                items.reduce(
                  (total, item) => total + Number(item?.quantity || item?.serial_numbers?.length || 0),
                  0,
                );
              const reusableSerialNumbers = Array.from(
                new Set(
                  reusableItems.flatMap((item) =>
                    Array.isArray(item?.serial_numbers)
                      ? item.serial_numbers.map((serial) => String(serial || "").trim()).filter(Boolean)
                      : [],
                  ),
                ),
              );
              const buildSerialDetails = (items) =>
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

              return {
                ...notification,

                // Exact values from the Scrap / Outward row.
                requestedBy:
                  getScrapRequesterName(
                    outward,
                    notification,
                  ),

                // Complete Scrap details used by the Manager notification table.

                itemType:
                  outward?.item_type ||
                  outward?.itemType ||
                  "COMPONENT",

                componentCode:
                  outward?.component_code ||
                  "",

                componentName:
                  outward?.component_name ||
                  outward?.product_name ||
                  outward?.productName ||
                  "-",

                productName:
                  outward?.product_name ||
                  outward?.productName ||
                  "",

                quantity:
                  Number(
                    outward?.quantity ??
                    outward?.no_of_components ??
                    outward?.noOfComponents ??
                    0,
                  ) || 0,

                scrapComponentNames:
                  summarizeComponentNames(damagedItems) ||
                  outward?.component_name ||
                  outward?.product_name ||
                  "-",
                scrapQuantity: summarizeQuantity(damagedItems),
                goodComponentNames:
                  summarizeComponentNames(reusableItems) || "-",
                goodQuantity: summarizeQuantity(reusableItems),
                goodSerialNumbers: reusableSerialNumbers,
                scrapSerialDetails: buildSerialDetails(damagedItems),
                goodSerialDetails: buildSerialDetails(reusableItems),
                scrapMetadata,

                serialNumbers:
                  Array.isArray(
                    outward?.serial_numbers,
                  )
                    ? outward.serial_numbers
                    : Array.isArray(
                        outward?.serialNumbers,
                      )
                      ? outward.serialNumbers
                      : [],

                source:
                  outward?.source ||
                  "DIRECT",

                materialRequestNumber:
                  outward?.material_request_number ||
                  outward?.materialRequestNumber ||
                  "-",

                movedToInventory:
                  Boolean(
                    outward?.moved_to_inventory ??
                    outward?.movedToInventory ??
                    false,
                  ),

                outwardType:
                  outward?.outward_type ||
                  outward?.typeOfOutward ||
                  "SCRAP",

                scrapDate:
                  outward?.out_date ||
                  outward?.outDate ||
                  notification?.created_at ||
                  "",

                scrapRemarks:
                  outward?.remarks ||
                  (
                    /waiting for manager approval/i.test(
                      String(
                        notification?.message ||
                          "",
                      ),
                    )
                      ? ""
                      : notification?.message
                  ) ||
                  "",

                type:
                  outward?.outward_type ||
                  outward?.typeOfOutward ||
                  "SCRAP",

                date:
                  outward?.out_date ||
                  outward?.outDate ||
                  notification?.created_at ||
                  "",

                remarks:
                  outward?.remarks ||
                  "",

                /*
                 * OutwardEntry is authoritative for Scrap workflow status.
                 * Do not let an old PENDING_MANAGER notification keep
                 * Approve/Reject buttons visible after the Scrap is already
                 * APPROVED / MANAGER_APPROVED / REJECTED.
                 */
                status:
                  String(
                    outwardStatus ||
                      notification?.status ||
                      "PENDING_MANAGER",
                  )
                    .trim()
                    .toUpperCase(),

                rejectionReason:
                  outward?.rejection_reason ||
                  outward?.rejectionReason ||
                  "",

                rejectedBy:
                  getUserDisplayName(
                    outward?.rejected_by ||
                      outward?.rejectedBy ||
                      "",
                  ),
              };
            } catch (error) {
              console.error(
                `Unable to load Scrap ${outwardId} for notification:`,
                error,
              );

              return notification;
            }
          },
        ),
      );

    /*
     * RETURNABLE / CU notifications originally carried only ComponentUsage.id
     * in reference_id. Enrich them with the authoritative ComponentUsage
     * movement + original Material Request so Manager sees the real MR number,
     * project, purpose, dates, quantities, components, serials and remarks.
     */
    const managerCuNotifications = enrichedResults.filter(
      (notification) =>
        String(notification?.category || "").trim().toUpperCase() === "CU" &&
        String(notification?.receiver || "").trim().toUpperCase() === "MANAGER",
    );

    if (managerCuNotifications.length > 0) {
      try {
        const [usagePayload, materialRequestPayload] = await Promise.all([
          fetchAllNotificationPagesShared(
            `/component-usage/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
            { cache: "no-store" },
          ),
          fetchAllNotificationPagesShared(
            `/materialrequest/material-requests/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
            { cache: "no-store" },
          ),
        ]);

        const usageRows = Array.isArray(usagePayload)
          ? usagePayload
          : Array.isArray(usagePayload?.results)
            ? usagePayload.results
            : [];

        const materialRequestRows = Array.isArray(materialRequestPayload)
          ? materialRequestPayload
          : Array.isArray(materialRequestPayload?.results)
            ? materialRequestPayload.results
            : [];

        const usageById = new Map(
          usageRows.map((usage) => [String(usage?.id ?? ""), usage]),
        );

        const mrById = new Map(
          materialRequestRows.map((mr) => [String(mr?.id ?? ""), mr]),
        );

        const mrByNumber = new Map();
        materialRequestRows.forEach((mr) => {
          const mrNumber = String(
            mr?.material_request_id ||
              mr?.request_id ||
              mr?.mr_id ||
              "",
          ).trim();

          if (mrNumber) {
            mrByNumber.set(mrNumber.toUpperCase(), mr);
          }
        });

        const usageMovementId = (usage) => {
          const details = Array.isArray(usage?.inventory_issue_details)
            ? usage.inventory_issue_details
            : usage?.inventory_issue_details &&
                typeof usage.inventory_issue_details === "object"
              ? [usage.inventory_issue_details]
              : [];

          for (const detail of details) {
            const movementId = String(detail?.movement_id || "").trim();
            if (movementId) return movementId;
          }

          return "";
        };

        enrichedResults = enrichedResults.map((notification) => {
          const category = String(notification?.category || "")
            .trim()
            .toUpperCase();

          const receiver = String(notification?.receiver || "")
            .trim()
            .toUpperCase();

          if (category !== "CU" || receiver !== "MANAGER") {
            return notification;
          }

          const usageId = String(
            notification?.reference_id || notification?.referenceId || "",
          ).trim();

          const usage = usageById.get(usageId);
          if (!usage) {
            return notification;
          }

          const mrNumber = String(
            usage?.material_request_number ||
              usage?.materialRequestNumber ||
              "",
          ).trim();

          const materialRequest =
            mrById.get(String(usage?.material_request ?? "")) ||
            mrByNumber.get(mrNumber.toUpperCase()) ||
            {};

          const purpose = String(usage?.purpose || "")
            .trim()
            .toUpperCase();

          const movementId = usageMovementId(usage);

          const movementRows = usageRows.filter((candidate) => {
            const candidateMr = String(
              candidate?.material_request_number ||
                candidate?.materialRequestNumber ||
                "",
            ).trim();

            const candidatePurpose = String(candidate?.purpose || "")
              .trim()
              .toUpperCase();

            if (
              candidateMr.toUpperCase() !== mrNumber.toUpperCase() ||
              candidatePurpose !== purpose
            ) {
              return false;
            }

            if (movementId) {
              return usageMovementId(candidate) === movementId;
            }

            return (
              String(candidate?.requested_date || "") ===
                String(usage?.requested_date || "") &&
              String(candidate?.return_due_date || "") ===
                String(usage?.return_due_date || "")
            );
          });

          const requestType = String(
            materialRequest?.request_type || usage?.request_type || "",
          )
            .trim()
            .toUpperCase();

          const isDroneMode =
            requestType !== "RETURNABLE" &&
            ["FLIGHT_TEST", "CUSTOMER_DEMO", "EVENT"].includes(purpose);

          const items = movementRows.map((row) => ({
            usageId: row?.id,
            componentCode:
              row?.component_code || row?.componentCode || "",
            componentName:
              row?.component_name || row?.name || "Component",
            category:
              row?.component_category ||
              row?.component_type ||
              row?.category ||
              "-",
            quantity: Number(row?.quantity || 0),
            serialNumbers: Array.isArray(row?.issued_serial_numbers)
              ? row.issued_serial_numbers
              : [],
          }));

          return {
            ...notification,
            materialRequestNumber:
              mrNumber ||
              materialRequest?.material_request_id ||
              "-",
            requesterName:
              materialRequest?.requester_name ||
              materialRequest?.requester ||
              usage?.employee_name ||
              "-",
            project:
              materialRequest?.project_name ||
              materialRequest?.project ||
              "-",
            returnablePurpose: purpose,
            returnableMode: isDroneMode ? "Drone" : "Components",
            requestDate:
              usage?.requested_date || materialRequest?.date || "",
            returnDate:
              usage?.return_due_date || materialRequest?.required_date || "",
            remarks:
              usage?.remarks || materialRequest?.remarks || "",
            returnableItems: items,
            returnableTotalQuantity: isDroneMode
              ? Math.max(
                  0,
                  ...items.map((item) => Number(item?.quantity || 0)),
                )
              : items.reduce(
                  (total, item) => total + Number(item?.quantity || 0),
                  0,
                ),
            authoritativeReturnApprovalStatus: String(
              usage?.return_approval_status || "",
            )
              .trim()
              .toUpperCase(),
            usageStatus: String(usage?.status || "")
              .trim()
              .toUpperCase(),
            usageReceivedDate: usage?.received_date || "",
          };
        });
      } catch (error) {
        console.error(
          "Unable to enrich Returnable Manager notifications:",
          error,
        );
      }
    }

    setRawNotifications(
      enrichedResults,
    );






const poNotifications = (
  await Promise.all(
    results
      .filter((n) => {
        if (
          String(n.category || "").toUpperCase() !== "PO"
        ) {
          return false;
        }

        const receiver = String(
          n.receiver || ""
        ).toUpperCase();

        const status = String(
          n.status || ""
        ).toUpperCase();

        if (isFinance) {
          return (
            receiver === "FINANCE" &&
            [
              "PENDING",
              "PENDING_ADMIN",
              "PENDING_FINANCE",
              "APPROVED",
              "REJECTED",
              "FINANCE_APPROVED",
              "FINANCE_REJECTED",
            ].includes(status)
          );
        }

        if (isManager) {
          return (
            receiver === "MANAGER" &&
            [
              "PENDING",
              "REQUESTED",
              "PENDING_MANAGER",
              "APPROVED",
              "REJECTED",
            ].includes(status)
          );
        }

        return false;
      })
      .map(async (n) => {
        let po = null;

        try {
          po = await fetchAuthenticatedJson(
            `/procurement/purchase-orders/${encodeURIComponent(
              n.reference_id,
            )}/`,
            {
              cache: "no-store",
            },
          );
        } catch (e) {
          console.error(
            "Failed to fetch PO details",
            e,
          );
        }

        /*
         * Manager PO notifications are ONLY for Direct STANDARD POs.
         * Replacement POs are approved by Procurement in the PO table.
         */
        if (isManager) {
          const orderType = String(
            po?.order_type || "STANDARD"
          ).toUpperCase();

          const sourceMrNumber = String(
            po?.source_mr_number || ""
          ).trim();

          const isDirectStandardPo =
            orderType !== "REPLACEMENT" &&
            !sourceMrNumber;

          if (!isDirectStandardPo) {
            return null;
          }
        }

        return {
          id: n.id,
          poId: po?.id || n.reference_id,
          poNumber:
            po?.po_number ||
            n.title ||
            n.reference_id,
          vendor: po?.vendor_name || "-",
          status: String(
            n.status ||
            po?.status ||
            "PENDING"
          ).toUpperCase(),
          total: Number(po?.total || 0),
          qty:
            po?.qty ||
            po?.items?.reduce(
              (sum, item) =>
                sum +
                Number(item?.quantity || 0),
              0,
            ) ||
            po?.items?.length ||
            0,
          category: "PO",
          orderType: String(
            po?.order_type || "STANDARD"
          ).toUpperCase(),
          sourceMrNumber:
            po?.source_mr_number || "",
          gstin: po?.gstin || "-",
          location: po?.location || "-",
          poDate:
            po?.po_date ||
            po?.ordered_date ||
            po?.created_at ||
            "",
          expectedDelivery:
            po?.expected_delivery_date || "",
          remarks: po?.remarks || "-",
          financeRemarks:
            po?.finance_remarks || "-",
          requestedBy:
            n?.requested_by ||
            n?.requestedBy ||
            po?.latest_approval?.requested_by ||
            "-",
          componentSummary:
            Array.isArray(po?.items)
              ? po.items
                  .map((item) => {
                    const code =
                      getPoItemComponentCode(item);
                    const name =
                      getPoItemComponentName(item);
                    const quantity =
                      Number(item?.quantity || 0);

                    return `${code ? `${code} - ` : ""}${name} (${quantity})`;
                  })
                  .join(", ")
              : "-",
          poDetails: po,
          rejectedBy:
            po?.rejected_by ||
            po?.rejectedBy ||
            n.rejected_by ||
            n.rejectedBy ||
            "",
          rejectionReason:
            po?.rejection_reason ||
            po?.rejectionReason ||
            n.rejection_reason ||
            n.rejectionReason ||
            "",
        };
      })
  )
).filter(Boolean);

const rawMrNotifications = results.filter((n) => {
  if (n.category !== "MR") return false;

  const status = String(n.status || "").toUpperCase();
  const receiver = String(n.receiver || "").toUpperCase();

if (isManager) {
  return (
    receiver === "MANAGER" &&
    [
      "PENDING_MANAGER",
      "MANAGER_APPROVED",
      "MANAGER_REJECTED"
    ].includes(status)
  );
}
if (isInventory) {
  return (
    receiver === "INVENTORY" &&
    [
      "MANAGER_APPROVED",
      "INVENTORY_PENDING",
      "QC_CHECKED",
      "PROJECT_INVENTORY_READY",
      "INVENTORY_ISSUED",
      "MR_COMPLETED",
    ].includes(status)
  );
}

  if (isAdmin) {
    return false;
  }

  return false;
});

    const dedupedMrNotifications = [];
    const seenMrRefs = new Set();

    for (const n of rawMrNotifications) {
      const ref = String(
        n.reference_id ||
          n.referenceId ||
          n.material_request_id ||
          n.request_id ||
          n.id ||
          "",
      );

      if (!ref) continue;
      if (seenMrRefs.has(ref)) continue;

      seenMrRefs.add(ref);
      dedupedMrNotifications.push(n);
    }

    /*
     * Manager MR notifications can be old rows that contain only a numeric
     * notification reference. In that case the single-record endpoint may
     * no longer resolve the MR correctly, which previously caused
     * Created Date / Project / Drone Qty / Required Date to display "-".
     *
     * Load the current MR master once and use it as a safe fallback.
     */
    let allMaterialRequests = [];

    try {
      /*
       * Manager must load the MR master even when there are ZERO persisted
       * MR Notification rows. A new MR can already be PENDING_MANAGER while
       * an older frontend/backend path failed to create Notification.
       */
      if (
        dedupedMrNotifications.length > 0 ||
        isManager
      ) {
        allMaterialRequests =
          await fetchAllNotificationPagesShared(
            `/materialrequest/material-requests/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
            {
              cache: "no-store",
              forceRefresh: true,
            },
          );
      }
    } catch (mrListError) {
      console.warn(
        "Unable to load Material Request master for Manager notification enrichment:",
        mrListError,
      );

      allMaterialRequests = [];
    }

    /*
     * MANAGER MR FALLBACK
     * -------------------
     * The MaterialRequest row is authoritative for workflow status.
     * If it says PENDING_MANAGER but the Notification row is missing,
     * expose a synthetic Manager notification so:
     *   - Manager MR/Returnable counts are correct,
     *   - the row is visible immediately,
     *   - existing pending Returnable MRs are recovered without recreating.
     *
     * New submissions also create a real Notification row, so this is a
     * compatibility/recovery layer for existing data and transient failures.
     */
    if (isManager) {
      const existingManagerMrReferences =
        new Set(
          dedupedMrNotifications
            .map((notification) =>
              String(
                notification?.reference_id ??
                  notification?.referenceId ??
                  notification?.material_request_id ??
                  notification?.request_id ??
                  "",
              ).trim(),
            )
            .filter(Boolean),
        );

      for (const request of allMaterialRequests) {
        const workflowStatus = String(
          request?.status ||
            request?.workflow_status ||
            request?.approval_status ||
            "",
        )
          .trim()
          .toUpperCase();

        if (workflowStatus !== "PENDING_MANAGER") {
          continue;
        }

        const requestDbId =
          request?.id ??
          request?.pk ??
          null;

        if (requestDbId === null) {
          continue;
        }

        const reference =
          String(requestDbId).trim();

        if (
          existingManagerMrReferences.has(
            reference,
          )
        ) {
          continue;
        }

        const requestNumber = String(
          request?.material_request_id ||
            request?.request_id ||
            `MR-${reference}`,
        ).trim();

        dedupedMrNotifications.push({
          id:
            `MR-FALLBACK-${reference}`,
          category:
            "MR",
          receiver:
            "MANAGER",
          reference_id:
            reference,
          material_request_id:
            requestNumber,
          status:
            "PENDING_MANAGER",
          approval_status:
            "PENDING_MANAGER",
          is_read:
            false,
          title:
            `MR APPROVAL REQUEST - ${requestNumber}`,
          message:
            `Material Request ${requestNumber} requires Manager approval.`,
          request_type:
            request?.request_type ||
            request?.requestType ||
            "",
          customized_bom:
            request?.customized_bom ??
            request?.customizedBom ??
            false,
          returnable_purpose:
            request?.returnable_purpose ||
            request?.returnablePurpose ||
            "",
          source:
            "material-request-manager-fallback",
        });

        existingManagerMrReferences.add(
          reference,
        );
      }
    }

    const normalizeMrReference = (value) =>
      String(value ?? "")
        .trim()
        .toUpperCase();

    const getNotificationMrNumber = (
      notification = {},
    ) => {
      const directCandidates = [
        notification.material_request_id,
        notification.materialRequestId,
        notification.request_id,
        notification.requestId,
        notification.mr_number,
        notification.mrNumber,
      ]
        .map(normalizeMrReference)
        .filter(Boolean);

      const directMrNumber =
        directCandidates.find(
          (value) =>
            value.startsWith("MR-") ||
            value.startsWith("MR_"),
        );

      if (directMrNumber) {
        return directMrNumber;
      }

      const notificationText = [
        notification.title,
        notification.message,
        notification.remarks,
        notification.description,
      ]
        .filter(Boolean)
        .join(" ");

      const match =
        notificationText.match(
          /\bMR[-_][A-Z0-9_-]+\b/i,
        );

      return normalizeMrReference(
        match?.[0] || "",
      );
    };

    const findMaterialRequestFallback = (
      notification = {},
      referenceId = "",
    ) => {
      const normalizedReference =
        normalizeMrReference(
          referenceId,
        );

      const mrNumber =
        getNotificationMrNumber(
          notification,
        );

      return (
        allMaterialRequests.find(
          (candidate) => {
            const candidateDatabaseRefs = [
              candidate?.id,
              candidate?.pk,
              candidate?.material_request_db_id,
            ]
              .map(normalizeMrReference)
              .filter(Boolean);

            const candidateMrRefs = [
              candidate?.material_request_id,
              candidate?.materialRequestId,
              candidate?.request_id,
              candidate?.requestId,
              candidate?.mr_number,
              candidate?.mrNumber,
            ]
              .map(normalizeMrReference)
              .filter(Boolean);

            return Boolean(
              (
                normalizedReference &&
                (
                  candidateDatabaseRefs.includes(
                    normalizedReference,
                  ) ||
                  candidateMrRefs.includes(
                    normalizedReference,
                  )
                )
              ) ||
                (
                  mrNumber &&
                  candidateMrRefs.includes(
                    mrNumber,
                  )
                ),
            );
          },
        ) || null
      );
    };

    const getReadableProject = (
      request = {},
      notification = {},
    ) => {
      const projectObject =
        request?.project_details ||
        request?.projectDetails ||
        (
          request?.project &&
          typeof request.project ===
            "object"
            ? request.project
            : null
        ) ||
        {};

      const notificationProjectObject =
        notification?.project_details ||
        notification?.projectDetails ||
        (
          notification?.project &&
          typeof notification.project ===
            "object"
            ? notification.project
            : null
        ) ||
        {};

      const directRequestProject =
        request?.project &&
        typeof request.project !==
          "object"
          ? request.project
          : "";

      const directNotificationProject =
        notification?.project &&
        typeof notification.project !==
          "object"
          ? notification.project
          : "";

      return (
        request?.project_name ||
        request?.projectName ||
        projectObject?.name ||
        projectObject?.project_name ||
        projectObject?.projectName ||
        projectObject?.project_code ||
        projectObject?.projectCode ||
        directRequestProject ||
        notification?.project_name ||
        notification?.projectName ||
        notificationProjectObject?.name ||
        notificationProjectObject?.project_name ||
        notificationProjectObject?.projectName ||
        notificationProjectObject?.project_code ||
        notificationProjectObject?.projectCode ||
        directNotificationProject ||
        notification?.projectId ||
        ""
      );
    };

    const getReadableRequester = (
      request = {},
      notification = {},
      fallbackReference = "",
    ) => {
      const requestRequester =
        request?.requester &&
        typeof request.requester ===
          "object"
          ? request.requester
          : {};

      const notificationRequester =
        notification?.requester &&
        typeof notification.requester ===
          "object"
          ? notification.requester
          : {};

      const directRequestRequester =
        request?.requester &&
        typeof request.requester !==
          "object"
          ? request.requester
          : "";

      const directNotificationRequester =
        notification?.requester &&
        typeof notification.requester !==
          "object"
          ? notification.requester
          : "";

      return (
        request?.requester_name ||
        request?.requesterName ||
        request?.requested_by_name ||
        request?.requestedByName ||
        request?.employee_name ||
        request?.employeeName ||
        requestRequester?.name ||
        requestRequester?.full_name ||
        requestRequester?.employee_name ||
        directRequestRequester ||
        notification?.requester_name ||
        notification?.requesterName ||
        notification?.requested_by_name ||
        notification?.requestedByName ||
        notificationRequester?.name ||
        notificationRequester?.full_name ||
        directNotificationRequester ||
        notification?.requested_by ||
        notification?.requestedBy ||
        `MR ${fallbackReference}`
      );
    };

    const mrNotifications =
      await Promise.all(
        dedupedMrNotifications.map(
          async (n) => {
            const referenceId =
              String(
                n.reference_id ||
                  n.referenceId ||
                  n.material_request_id ||
                  n.request_id ||
                  n.id ||
                  "",
              ).trim();

            let mr = {};

            if (referenceId) {
              try {
                const detail =
                  await fetchAuthenticatedJson(
                    `${config.baseURL}/materialrequest/material-requests/${encodeURIComponent(
                      referenceId,
                    )}/`,
                    {
                      cache: "no-store",
                    },
                  );

                if (
                  detail &&
                  typeof detail ===
                    "object"
                ) {
                  mr = detail;
                }
              } catch (detailError) {
                console.warn(
                  `Unable to load MR detail directly for reference ${referenceId}; trying Material Request master fallback.`,
                  detailError,
                );
              }
            }

            /*
             * If the direct record is missing or too sparse, resolve the same
             * MR from the master list. Master data is authoritative for the
             * columns shown in the Manager MR notification table.
             */
            const fallbackMr =
              findMaterialRequestFallback(
                n,
                referenceId,
              );

            if (fallbackMr) {
              mr = {
                ...fallbackMr,
                ...mr,
              };
            }

            const requesterName =
              getReadableRequester(
                mr,
                n,
                referenceId,
              );

            const notificationMrNumber =
              getNotificationMrNumber(n);

            const requestId =
              mr.material_request_id ||
              mr.materialRequestId ||
              mr.request_id ||
              mr.requestId ||
              mr.mr_number ||
              mr.mrNumber ||
              n.material_request_id ||
              n.materialRequestId ||
              n.request_id ||
              n.requestId ||
              notificationMrNumber ||
              n.reference_id ||
              referenceId;

            const requestType =
              mr.request_type ||
              mr.requestType ||
              n.request_type ||
              n.requestType ||
              n.type ||
              "MR";

            const createdDate =
              mr.created_at ||
              mr.createdAt ||
              mr.created_date ||
              mr.createdDate ||
              mr.date ||
              mr.requested_date ||
              mr.requestedDate ||
              n.created_at ||
              n.createdAt ||
              n.created_date ||
              n.createdDate ||
              n.date ||
              n.timestamp ||
              "";

            const project =
              getReadableProject(
                mr,
                n,
              );

            const droneQuantity =
              mr.drone_quantity ??
              mr.droneQuantity ??
              mr.no_of_drones ??
              mr.noOfDrones ??
              mr.required_quantity ??
              mr.requiredQuantity ??
              mr.requested_quantity ??
              mr.requestedQuantity ??
              mr.quantity ??
              n.drone_quantity ??
              n.droneQuantity ??
              n.no_of_drones ??
              n.noOfDrones ??
              n.required_quantity ??
              n.requiredQuantity ??
              n.requested_quantity ??
              n.requestedQuantity ??
              n.quantity ??
              0;

            const requiredDate =
              mr.required_date ||
              mr.requiredDate ||
              mr.required_by_date ||
              mr.requiredByDate ||
              mr.required_by ||
              mr.need_by_date ||
              mr.needByDate ||
              mr.expected_date ||
              mr.expectedDate ||
              n.required_date ||
              n.requiredDate ||
              n.required_by_date ||
              n.requiredByDate ||
              n.required_by ||
              n.need_by_date ||
              n.needByDate ||
              "";

            const remarks =
              mr.remarks ||
              mr.message ||
              mr.description ||
              n.remarks ||
              n.message ||
              n.note ||
              n.comment ||
              "";

            return {
              ...n,
              id: n.id,

              /*
               * Keep the real backend MR database id available for the
               * existing detail popup / approval flow.
               */
              material_request_db_id:
                mr.id ??
                mr.pk ??
                n.reference_id ??
                referenceId,

              requester_name:
                requesterName,

              material_request_id:
                requestId,

              created_date:
                createdDate,

              project,

              request_type:
                requestType,

              customized_bom:
                mr.customized_bom ??
                mr.customizedBom ??
                n.customized_bom ??
                n.customizedBom ??
                false,

              drone_quantity:
                droneQuantity,

              required_date:
                requiredDate,

              remarks,

              bom_items:
                mr.bom_items ||
                n.bom_items ||
                [],

              custom_bom_items:
                mr.custom_bom_items ||
                n.custom_bom_items ||
                [],

              rd_items:
                mr.rd_items ||
                n.rd_items ||
                [],

              request_items:
                mr.request_items ||
                n.request_items ||
                [],

              returnable_purpose:
                mr.returnable_purpose ||
                mr.returnablePurpose ||
                n.returnable_purpose ||
                n.returnablePurpose ||
                "",
            };
          },
        ),
      );

const rawBomNotifications = results.filter(
  (notification) => {
    const category = String(
      notification.category || ""
    ).toUpperCase();

    const receiver = String(
      notification.receiver || ""
    ).toUpperCase();

    const status = String(
      notification.status || ""
    ).toUpperCase();

    if (!isManager) return false;

    return (
      category === "BOM" &&
      receiver === "MANAGER" &&
      [
        "PENDING_MANAGER",
        "APPROVED",
        "MANAGER_REJECTED",
        "MODIFIED",
      ].includes(status)
    );
  }
);

const uniqueBomNotifications = [];
const seenBomReferences = new Set();

for (const notification of rawBomNotifications) {
  const referenceId = String(
    notification.reference_id ||
      notification.referenceId ||
      ""
  ).trim();

  if (!referenceId) continue;
  if (seenBomReferences.has(referenceId)) continue;

  seenBomReferences.add(referenceId);
  uniqueBomNotifications.push(notification);
}

/*
 * Load the current BOM list once.
 * Old Notification rows may reference BOMs that were deleted. Those stale
 * records must not trigger GET /bom/bom/<old-id>/ requests on every reload.
 */
let realBomRows = [];

if (isManager && uniqueBomNotifications.length > 0) {
  try {
    const bomListPayload =
      await fetchAuthenticatedJson(
        `${config.baseURL}/bom/bom/`,
        {
          cache: "no-store",
        },
      );

    realBomRows = Array.isArray(bomListPayload)
      ? bomListPayload
      : Array.isArray(bomListPayload?.results)
        ? bomListPayload.results
        : [];
  } catch (error) {
    console.warn(
      "Unable to load current BOM list for Manager notifications:",
      error,
    );
    realBomRows = [];
  }
}

const bomByReference = new Map();

realBomRows.forEach((bom) => {
  const references = [
    bom?.id,
    bom?.bom_id,
    bom?.bomId,
    bom?.bom_number,
    bom?.bomNumber,
  ]
    .filter(
      (value) =>
        value !== undefined &&
        value !== null &&
        String(value).trim() !== "",
    )
    .map((value) =>
      String(value).trim(),
    );

  references.forEach((reference) => {
    if (!bomByReference.has(reference)) {
      bomByReference.set(reference, bom);
    }
  });
});

const loadedBomNotifications =
  uniqueBomNotifications
    .map((notification) => {
      const referenceId = String(
        notification.reference_id ||
          notification.referenceId ||
          "",
      ).trim();

      const bomDetails =
        bomByReference.get(referenceId) ||
        null;

      // Ignore stale BOM notification rows whose real BOM no longer exists.
      if (!bomDetails) {
        return null;
      }

      return {
        ...notification,

        notificationId:
          notification.id,

        bomId:
          bomDetails?.id ||
          notification.reference_id,

        bomNumber:
          bomDetails?.bom_number ||
          notification.title ||
          notification.reference_id,

        bomName:
          bomDetails?.bom_name ||
          "-",

        productName:
          bomDetails?.product_name ||
          "-",

        version:
          bomDetails?.version ||
          "-",

        createdBy:
          bomDetails?.created_by ||
          "-",

        createdDate:
          bomDetails?.created_at ||
          notification.created_at ||
          "",

        componentCount:
          Array.isArray(
            bomDetails?.items
          )
            ? bomDetails.items.length
            : 0,

        status: String(
          bomDetails?.status ||
            notification.status ||
            "PENDING_MANAGER"
        ).toUpperCase(),

        rejectionReason:
          bomDetails
            ?.manager_rejection_reason ||
          notification
            .rejection_reason ||
          notification.message ||
          "",

        rejectedBy:
          bomDetails
            ?.manager_rejected_by ||
          notification.rejected_by ||
          "",

        updatedDate:
          bomDetails?.updated_at || "",

        managerApprovedBy:
          bomDetails?.manager_approved_by || "",

        managerApprovedAt:
          bomDetails?.manager_approved_at || "",

        managerRejectedBy:
          bomDetails?.manager_rejected_by || "",

        managerRejectedAt:
          bomDetails?.manager_rejected_at || "",

        managerRejectionReason:
          bomDetails?.manager_rejection_reason || "",

        isActive:
          bomDetails?.is_active,

        items:
          Array.isArray(bomDetails?.items)
            ? bomDetails.items
            : [],

        bomDetails:
          bomDetails || null,
      };
    })
    .filter(Boolean);

setNotifications(poNotifications);

if (!isFinance) {
  setMrData(mrNotifications);
} else {
  setMrData([]);
}

if (isManager) {
  setBomData(loadedBomNotifications);
} else {
  setBomData([]);
}
  } catch (err) {
    console.error(err);
  } finally {
    setLoading(false);
  }
};

// const createInventoryNotification = async (referenceId) => {
//   const requestLabel = String(referenceId || "");
//   const payload = {
//     category: "MR",
//     title: `MR MANAGER APPROVED - ${requestLabel}`,
//     message: `Material Request ${requestLabel} has been approved by manager and is ready for inventory processing.`,
//     reference_id: requestLabel,
//     status: "MANAGER_APPROVED",
//     receiver: "INVENTORY",
//     is_read: false,
//   };

//   try {
//     const existing = await fetch(`${config.baseURL}/notifications/`);
//     const data = await existing.json();
//     const list = data.results || data || [];
//     const alreadyExists = list.some(
//       (n) =>
//         String(n.category || "").toUpperCase() === "MR" &&
//         String(n.reference_id) === requestLabel &&
//         String(n.receiver || "").toUpperCase() === "INVENTORY" &&
//         String(n.status || "").toUpperCase() === "MANAGER_APPROVED"
//     );

//     if (alreadyExists) return;

// const response = await fetch(`${config.baseURL}/notifications/`, {
//   method: "POST",
//   headers: {
//     "Content-Type": "application/json",
//   },
//   body: JSON.stringify(payload),
// });

// const result = await response.json().catch(() => ({}));

// console.log("Notification POST Status:", response.status);
// console.log("Notification POST Response:", result);

//     try {
//       window.dispatchEvent(new CustomEvent("notificationsUpdated", { detail: {} }));
//     } catch (err) {
//       // ignore if event dispatch is unavailable
//     }
//   } catch (err) {
//     console.error("Failed to create inventory notification:", err);
//   }
// };

const handleScrapDecision = async (
  notification,
  decision,
  reason = "",
  reorderChoice = "",
) => {
  if (!isManager) {
    alert(
      "Only Manager can approve or reject Scrap.",
    );
    return false;
  }

  const outwardId =
    notification?.reference_id ??
    notification?.referenceId;

  if (
    outwardId === undefined ||
    outwardId === null ||
    outwardId === ""
  ) {
    alert(
      "Scrap Outward ID is missing from this notification.",
    );
    return false;
  }

  /*
   * Prevent a fast second click from sending another Manager action
   * while the first request is still running.
   */
  const scrapLockKey =
    String(outwardId);

  if (
    processingScrapLockRef.current.has(
      scrapLockKey,
    )
  ) {
    return false;
  }

  const normalizedDecision =
    String(decision || "")
      .trim()
      .toUpperCase();

  if (
    ![
      "APPROVED",
      "REJECTED",
    ].includes(normalizedDecision)
  ) {
    return false;
  }

  if (
    normalizedDecision ===
      "REJECTED" &&
    !String(reason || "").trim()
  ) {
    alert(
      "Enter a rejection reason.",
    );
    return false;
  }

  const normalizedReorderChoice = String(reorderChoice || "")
    .trim()
    .toUpperCase();

  if (
    normalizedDecision === "APPROVED" &&
    !["YES", "NO"].includes(normalizedReorderChoice)
  ) {
    alert("Choose whether this Material Request should be rebuilt.");
    return false;
  }

  const actionPath =
    normalizedDecision ===
    "APPROVED"
      ? "manager-approve"
      : "manager-reject";

  const managerAccessToken =
    getCurrentAccessToken();

  if (!managerAccessToken) {
    alert(
      "Your Manager login token is missing. Please log out and log in again.",
    );

    console.error(
      "Scrap approval blocked: no access token found.",
    );

    return false;
  }

  processingScrapLockRef.current.add(
    scrapLockKey,
  );
  setProcessingScrapId(outwardId);

  try {
    /*
     * IMPORTANT FIX:
     * Read the REAL OutwardEntry immediately before Manager action.
     *
     * Notification status can be stale. If OutwardEntry is already:
     *   APPROVED
     *   MANAGER_APPROVED
     *   REJECTED
     * then do NOT call manager-approve / manager-reject again.
     */
    const latestOutward =
      await fetchAuthenticatedJson(
        `${config.baseURL}/outward/${encodeURIComponent(
          outwardId,
        )}/`,
        {
          cache: "no-store",
        },
      );

    const latestApprovalStatus =
      String(
        latestOutward?.approval_status ||
          "",
      )
        .trim()
        .toUpperCase();

    const latestStatus =
      String(
        latestOutward?.status ||
          "",
      )
        .trim()
        .toUpperCase();

    const canTakeManagerDecision =
      latestApprovalStatus === "PENDING_MANAGER" ||
      latestApprovalStatus === "REQUESTED" ||
      (
        !latestApprovalStatus &&
        latestStatus === "PENDING_MANAGER"
      );

    if (!canTakeManagerDecision) {
      console.info(
        "Scrap Manager action skipped because Scrap is already processed:",
        {
          outwardId,
          approvalStatus:
            latestApprovalStatus,
          status: latestStatus,
          requestedDecision:
            normalizedDecision,
        },
      );

      /*
       * Repair an older/stale Manager notification so future reloads
       * also show the real status.
       */
      const syncedNotificationStatus =
        latestApprovalStatus ===
          "MANAGER_APPROVED"
          ? "MANAGER_APPROVED"
          : latestApprovalStatus ===
              "REJECTED"
            ? "REJECTED"
            : latestApprovalStatus ===
                "APPROVED"
              ? "APPROVED"
              : latestStatus ||
                notification?.status ||
                "PENDING_MANAGER";

      if (notification?.id) {
        try {
          await fetchAuthenticatedJson(
            `${config.baseURL}/notifications/${encodeURIComponent(
              notification.id,
            )}/`,
            {
              method: "PATCH",
              body: JSON.stringify({
                status:
                  syncedNotificationStatus,
                is_read: true,
              }),
            },
          );
        } catch (syncError) {
          console.warn(
            "Scrap was already processed; notification status sync failed:",
            syncError,
          );
        }
      }

      await loadNotifications();

      window.dispatchEvent(
        new Event(
          "notificationsUpdated",
        ),
      );

      /*
       * Treat this as completed:
       * - no alert
       * - no invalid POST
       * - rejection modal closes if this came from Reject
       */
      return true;
    }

    /*
     * Only a genuinely pending Scrap reaches the Manager action.
     */
    await fetchAuthenticatedJson(
      `${config.baseURL}/outward/${encodeURIComponent(
        outwardId,
      )}/${actionPath}/`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${managerAccessToken}`,
        },
        body: JSON.stringify(
          normalizedDecision ===
            "REJECTED"
            ? {
                rejection_reason:
                  String(
                    reason,
                  ).trim(),
              }
            : {
                reorder_choice: normalizedReorderChoice,
              },
        ),
      },
    );

    /*
     * Backend is the approval authority and also updates the Manager
     * notification. Keep this compatibility PATCH so old deployments
     * and current UI state stay synchronized.
     */
    const notificationPayload = {
      status:
        normalizedDecision === "APPROVED"
          ? "MANAGER_APPROVED"
          : "MANAGER_REJECTED",
      is_read: true,
    };

    if (notification?.id) {
      try {
        await fetchAuthenticatedJson(
          `${config.baseURL}/notifications/${encodeURIComponent(
            notification.id,
          )}/`,
          {
            method: "PATCH",
            headers: {
              Authorization:
                `Bearer ${managerAccessToken}`,
            },
            body: JSON.stringify(
              notificationPayload,
            ),
          },
        );
      } catch (
        notificationError
      ) {
        console.warn(
          "Scrap decision succeeded, but notification refresh PATCH failed:",
          notificationError,
        );
      }
    }

    await loadNotifications();

    try {
      window.dispatchEvent(
        new Event(
          "notificationsUpdated",
        ),
      );

      window.dispatchEvent(
        new CustomEvent(
          "inventory:changed",
          {
            detail: {
              type:
                "scrapApproval",
            },
          },
        ),
      );
    } catch (_error) {
      // Ignore browser event errors.
    }

    return true;
  } catch (error) {
    const message = String(
      error?.message ||
        "Unable to update Scrap approval.",
    );

    const normalizedMessage =
      message
        .trim()
        .toLowerCase();

    /*
     * Last-resort protection for a race condition:
     * another click/session may approve the Scrap after our GET but
     * before our POST. Do not show the stale-state alert.
     */
    const isAlreadyProcessedScrap =
      normalizedMessage.includes(
        "this scrap is no longer pending manager approval",
      );

    if (isAlreadyProcessedScrap) {
      console.info(
        "Scrap Manager race-condition ignored because Scrap is already processed:",
        message,
      );

      await loadNotifications();

      window.dispatchEvent(
        new Event(
          "notificationsUpdated",
        ),
      );

      return true;
    }

    console.error(
      "Scrap Manager decision failed:",
      error,
    );

    /*
     * Keep genuine errors visible.
     */
    alert(message);

    return false;
  } finally {
    processingScrapLockRef.current.delete(
      scrapLockKey,
    );

    setProcessingScrapId(
      (current) =>
        String(current || "") ===
        String(outwardId)
          ? null
          : current,
    );
  }
};


  // UPDATE STATUS
const updateStatus = async (notificationId, resourceId, newStatus, resourceType, reason = "") => {
  const actionKey =
    `${String(resourceType || "RESOURCE").toUpperCase()}:${String(notificationId ?? "")}`;

  if (!beginNotificationAction(actionKey)) {
    return false;
  }

  try {
  const actor = isFinance ? "finance" : undefined;
    let statusMapping = {};
    const approvalStatus = newStatus.toUpperCase();

if (
  resourceType === "PO" &&
  approvalStatus === "APPROVED" &&
  isFinance
) {
  /*
   * Finance approval is a distinct backend transition.
   * This triggers the Direct PO -> Manager notification/email flow.
   */
  statusMapping = {
    approval_status: "FINANCE_APPROVED",
    status: "FINANCE_APPROVED",
  };
}
else if (approvalStatus === "APPROVED") {
  statusMapping = {
    approval_status: "APPROVED",
    status: "APPROVED",
  };
}
else if (
  resourceType === "MR" &&
  approvalStatus === "MANAGER_APPROVED"
) {
  /*
   * Only approve the request here.
   *
   * The backend checks live inventory and decides:
   * PROCUREMENT_PENDING or INVENTORY_PENDING.
   */
  statusMapping = {
    approval_status: "MANAGER_APPROVED",
  };
}
if (
  approvalStatus === "REJECTED" &&
  resourceType === "MR"
) {
  statusMapping = {
    approval_status: "MANAGER_REJECTED",
    status: "MANAGER_REJECTED",
  };
}

else if (approvalStatus === "REJECTED") {
  statusMapping = {
    approval_status: "REJECTED",
    status: "REJECTED",
  };
}

    const resourcePayload = statusMapping;
    const notificationPayload = {
      status:
        resourceType === "MR" && approvalStatus === "MANAGER_APPROVED"
          ? "MANAGER_APPROVED"
          : approvalStatus === "PENDING_MANAGER"
          ? "PENDING_MANAGER"
          : approvalStatus,
      is_read: true,
    };
    if (reason) {
      resourcePayload.rejection_reason = reason;
      notificationPayload.rejection_reason = reason;
    }

    if (actor) {
      resourcePayload.rejected_by = actor;
      notificationPayload.rejected_by = actor;
    }

    const resourceUrl =
      resourceType === "PO"
        ? `${config.baseURL}/procurement/purchase-orders/${resourceId}/`
        : resourceType === "MR"
        ? `${config.baseURL}/materialrequest/material-requests/${resourceId}/`
        : `${config.baseURL}/outward/outward-entries/${resourceId}/`;

const resourceResult =
  await fetchAuthenticatedJson(
    resourceUrl,
    {
      method: "PATCH",
      timeoutMs: 60000,
      body: JSON.stringify(
        resourcePayload,
      ),
    },
  );

console.log(
  "Manager resource response:",
  resourceResult,
);



const isManagerMrFallback =
  resourceType === "MR" &&
  String(
    notificationId || "",
  ).startsWith(
    "MR-FALLBACK-",
  );

let data = null;

if (!isManagerMrFallback) {
  data = await fetchAuthenticatedJson(
    `/notifications/${encodeURIComponent(
      notificationId,
    )}/`,
    {
      method: "PATCH",
      timeoutMs: 60000,
      body: JSON.stringify(
        notificationPayload,
      ),
    },
  );

  console.log(
    "Notification PATCH response:",
    data,
  );
} else {
  console.log(
    "Manager MR fallback processed from authoritative MaterialRequest:",
    resourceId,
  );
}

    await loadNotifications();
    return true;
  } catch (err) {
    console.error(err);
    return false;
  } finally {
    endNotificationAction(actionKey);
  }
};
const approveDirectPoFromManagerNotification = async (
  notification,
) => {
  const notificationId =
    notification?.id;

  const poId =
    notification?.poId ||
    notification?.reference_id ||
    notification?.referenceId;

  if (!poId) {
    alert("Purchase Order ID is missing.");
    return false;
  }

  const actionKey =
    `PO_MANAGER:${String(
      notificationId ?? poId
    )}`;

  if (!beginNotificationAction(actionKey)) {
    return false;
  }

  try {
    let latestPo = null;

    try {
      latestPo = await fetchAuthenticatedJson(
        `${config.baseURL}/procurement/purchase-orders/${encodeURIComponent(
          poId,
        )}/`,
        { cache: "no-store" },
      );
    } catch (loadError) {
      console.warn(
        "Unable to verify the latest Direct PO status before Manager approval:",
        loadError,
      );
    }

    if (latestPo) {
      const latestStatus = String(
        latestPo?.status || latestPo?.approval_status || "",
      )
        .trim()
        .toUpperCase();

      const managerPending = [
        "PENDING",
        "REQUESTED",
        "PENDING_MANAGER",
      ].includes(latestStatus);

      if (!managerPending) {
        await loadNotifications();
        window.dispatchEvent(new Event("notificationsUpdated"));
        return true;
      }
    }

    await fetchAuthenticatedJson(
      `${config.baseURL}/procurement/purchase-orders/${encodeURIComponent(
        poId,
      )}/direct-manager-approve/`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );

    /*
     * Backend marks the Manager notification APPROVED and moves the
     * Direct PO itself to PENDING_FINANCE, where Finance can act next.
     */
    await loadNotifications();

    window.dispatchEvent(
      new Event("notificationsUpdated"),
    );

    window.dispatchEvent(
      new Event("procurementUpdated"),
    );

    return true;
  } catch (error) {
    console.error(
      "Direct PO Manager approval failed:",
      error,
    );

    if (
      String(error?.message || "")
        .toLowerCase()
        .includes("not pending manager approval")
    ) {
      await loadNotifications();
      window.dispatchEvent(new Event("notificationsUpdated"));
      return true;
    }

    alert(
      error?.message ||
      "Unable to approve Direct Purchase Order.",
    );

    return false;
  } finally {
    endNotificationAction(actionKey);
  }
};

const rejectDirectPoFromManagerNotification = async (
  notification,
  reason,
) => {
  const poId =
    notification?.poId ||
    notification?.reference_id ||
    notification?.referenceId;

  if (!poId) {
    alert("Purchase Order ID is missing.");
    return false;
  }

  const trimmedReason = String(reason || "").trim();

  if (!trimmedReason) {
    alert("Enter Manager rejection remarks.");
    return false;
  }

  const actionKey =
    `PO_MANAGER:${String(notification?.id ?? poId)}`;

  if (!beginNotificationAction(actionKey)) {
    return false;
  }

  try {
    await fetchAuthenticatedJson(
      `${config.baseURL}/procurement/purchase-orders/${encodeURIComponent(
        poId,
      )}/direct-manager-reject/`,
      {
        method: "POST",
        body: JSON.stringify({
          reason: trimmedReason,
        }),
      },
    );

    await loadNotifications();

    window.dispatchEvent(
      new Event("notificationsUpdated"),
    );

    window.dispatchEvent(
      new Event("procurementUpdated"),
    );

    return true;
  } catch (error) {
    console.error(
      "Direct PO Manager rejection failed:",
      error,
    );

    alert(
      error?.message ||
        "Unable to reject Direct Purchase Order.",
    );

    return false;
  } finally {
    endNotificationAction(actionKey);
  }
};

const openDirectPoManagerRejectModal = (notification) => {
  setActiveRejectNotification(notification);
  setPendingRejectStatus("REJECTED");
  setPendingRejectResourceType("DIRECT_PO_MANAGER");
  setRejectReason("");
  setShowRejectModal(true);
};

const requestApproval = async (notificationId, poId) => {
  const actionKey =
    `PO:${String(notificationId ?? "")}`;

  if (!beginNotificationAction(actionKey)) {
    return false;
  }

  try {
    await fetchAuthenticatedJson(
      `/procurement/purchase-orders/${encodeURIComponent(
        poId,
      )}/`,
      {
        method: "PATCH",
        body: JSON.stringify({
          approval_status: "PENDING_FINANCE",
          status: "PENDING_FINANCE",
        }),
      },
    );

    await loadNotifications();
    return true;
  } catch (error) {
    console.error(error);
    return false;
  } finally {
    endNotificationAction(actionKey);
  }
};
const handleOpenRejectModal = (notification, status) => {
  setActiveRejectNotification(notification);
  setPendingRejectStatus(status);
  setPendingRejectResourceType(
    notification.category || currentTab || "PO"
  );
  setRejectReason("");
  setShowRejectModal(true);
};

/*
 * When an already-Rejected badge is clicked, show the saved reason.
 * For SCRAP the authoritative reason is stored in OutwardEntry, not
 * Notification, so fetch the Outward record first.
 */
const openExistingRejectDetails = async (
  notification,
) => {
  const category = String(
    notification?.category ||
      currentTab ||
      "",
  )
    .trim()
    .toUpperCase();

  let details = notification || {};
  let reason =
    details?.rejectionReason ||
    details?.rejection_reason ||
    details?.rejectReason ||
    details?.reject_reason ||
    details?.reject_note ||
    details?.rejectNote ||
    "";

  let rejectedBy =
    details?.rejectedBy ||
    details?.rejected_by ||
    details?.rejectedByRole ||
    details?.rejected_by_role ||
    "";

  if (category === "SCRAP") {
    const outwardId =
      notification?.reference_id ??
      notification?.referenceId;

    if (
      outwardId !== undefined &&
      outwardId !== null &&
      outwardId !== ""
    ) {
      try {
        const outward =
          await fetchAuthenticatedJson(
            `${config.baseURL}/outward/${encodeURIComponent(
              outwardId,
            )}/`,
          );

        reason =
          outward?.rejection_reason ||
          outward?.rejectionReason ||
          reason;

        rejectedBy =
          getUserDisplayName(
            outward?.rejected_by ||
              outward?.rejectedBy ||
              rejectedBy ||
              "",
          ) ||
          getLoggedInUserName();

        details = {
          ...notification,
          ...outward,
          title:
            notification?.title ||
            outward?.code ||
            `Scrap ${outwardId}`,
          category: "SCRAP",
          status: "REJECTED",
          rejectionReason:
            reason ||
            "No rejection reason was provided.",
          rejectedBy:
            getUserDisplayName(
              rejectedBy,
            ) ||
            getLoggedInUserName(),
        };
      } catch (error) {
        console.error(
          "Unable to load Scrap rejection details:",
          error,
        );
      }
    }
  }

  /*
   * Do not use notification.message as the rejection reason for Scrap.
   * Its message is normally:
   * "Scrap OUT-... is waiting for Manager approval."
   */
  if (!reason && category !== "SCRAP") {
    reason =
      details?.message ||
      details?.remarks ||
      details?.note ||
      details?.comment ||
      details?.reason ||
      "";
  }

  setActiveRejectNotification({
    ...details,
    status:
      details?.status ||
      "REJECTED",
    rejectionReason:
      reason ||
      "No rejection reason was provided.",
    rejectedBy:
      getUserDisplayName(
        rejectedBy ||
          details?.rejectedBy ||
          details?.rejected_by ||
          "",
      ) ||
      (
        category === "SCRAP"
          ? getLoggedInUserName()
          : ""
      ),
  });

  setPendingRejectStatus("REJECTED");
  setPendingRejectResourceType(
    category || "PO",
  );
  setRejectReason(
    reason ||
      "No rejection reason was provided.",
  );
  setShowRejectModal(true);
};
const openBomDetailsPopup = async (
  notification
) => {
  setShowBomDetailsModal(true);
  setSelectedBomDetails(notification);
  setBomDetailsLoading(true);

  try {
    const bomId =
      notification.bomId ||
      notification.reference_id;

    const response = await fetch(
      `${config.baseURL}/bom/bom/${bomId}/`
    );

    const responseText =
      await response.text();

    let details = null;

    try {
      details = responseText
        ? JSON.parse(responseText)
        : null;
    } catch {
      details = null;
    }

    if (!response.ok) {
      throw new Error(
        details?.detail ||
          `Failed to load BOM details: ${response.status}`
      );
    }

    setSelectedBomDetails({
      ...notification,
      ...details,

      bomId:
        details?.id ||
        notification.bomId,

      bomNumber:
        details?.bom_number ||
        notification.bomNumber,

      bomName:
        details?.bom_name ||
        notification.bomName ||
        "-",

      productName:
        details?.product_name ||
        notification.productName ||
        "-",

      createdBy:
        details?.created_by ||
        notification.createdBy ||
        "-",

      createdDate:
        details?.created_at ||
        notification.createdDate ||
        "",

      updatedDate:
        details?.updated_at ||
        notification.updatedDate ||
        "",

      status: String(
        details?.status ||
          notification.status ||
          ""
      ).toUpperCase(),

      description:
        details?.description ||
        notification.description ||
        "",

      managerApprovedBy:
        details?.manager_approved_by ||
        notification.managerApprovedBy ||
        "",

      managerApprovedAt:
        details?.manager_approved_at ||
        notification.managerApprovedAt ||
        "",

      managerRejectedBy:
        details?.manager_rejected_by ||
        notification.managerRejectedBy ||
        notification.rejectedBy ||
        "",

      managerRejectedAt:
        details?.manager_rejected_at ||
        notification.managerRejectedAt ||
        "",

      managerRejectionReason:
        details?.manager_rejection_reason ||
        notification
          .managerRejectionReason ||
        notification.rejectionReason ||
        "",

      items: Array.isArray(
        details?.items
      )
        ? details.items
        : notification.items || [],
    });
  } catch (error) {
    console.error(
      "Failed to open BOM details:",
      error
    );

    alert(
      error.message ||
        "Failed to load BOM details."
    );
  } finally {
    setBomDetailsLoading(false);
  }
};

const closeBomDetailsPopup = () => {
  setShowBomDetailsModal(false);
  setSelectedBomDetails(null);
  setBomDetailsLoading(false);
};
const getManagerDisplayName = () =>
  user?.name ||
  user?.username ||
  user?.email ||
  user?.employee_name ||
  "MANAGER";

const updateBomNotification = async (
  notification,
  action,
  reason = ""
) => {
  const isRejected =
    action === "MANAGER_REJECTED";

  const endpoint = isRejected
    ? "reject"
    : "approve";

  const payload = isRejected
    ? {
        remarks: reason,
        rejected_by:
          getManagerDisplayName(),
      }
    : {
        approved_by:
          getManagerDisplayName(),
      };

  const actionKey =
    `BOM:${String(
      notification?.id ??
        notification?.bomId ??
        notification?.reference_id ??
        notification?.referenceId ??
        "",
    )}`;

  if (!beginNotificationAction(actionKey)) {
    return false;
  }

  try {
    /*
     * IMPORTANT:
     * Always check the REAL BOM status from Django before sending the
     * approve/reject POST.
     *
     * The notification row can be stale. If the BOM was already
     * APPROVED / MANAGER_REJECTED, sending another action caused:
     *
     *   400 Only Pending Manager or Modified BOMs can be approved/rejected.
     *
     * By checking first, we avoid sending that invalid POST completely.
     */
    const bomId =
      notification?.bomId ||
      notification?.bomDetails?.id ||
      notification?.reference_id ||
      notification?.referenceId;

    const latestBom =
      await fetchAuthenticatedJson(
        `${config.baseURL}/bom/bom/${encodeURIComponent(
          bomId
        )}/`,
        {
          cache: "no-store",
        }
      );

    const latestStatus = String(
      latestBom?.status || ""
    )
      .trim()
      .toUpperCase();

    const canTakeManagerDecision = [
      "PENDING_MANAGER",
      "MODIFIED",
    ].includes(latestStatus);

    if (!canTakeManagerDecision) {
      console.info(
        "BOM manager action skipped because BOM is already processed:",
        {
          bomId,
          status: latestStatus,
          requestedAction: endpoint,
        }
      );

      await loadNotifications();

      window.dispatchEvent(
        new Event("notificationsUpdated")
      );

      /*
       * Return success so the reject modal closes normally.
       * No alert and, importantly, NO invalid POST /approve/ or /reject/.
       */
      return true;
    }

    /*
     * Only a genuinely actionable BOM reaches this POST.
     * Use the shared authenticated API helper.
     */
    const bomResult =
      await fetchAuthenticatedJson(
        `${config.baseURL}/bom/bom/${encodeURIComponent(
          bomId
        )}/${endpoint}/`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

    const notificationPayload = {
      status: isRejected
        ? "MANAGER_REJECTED"
        : "APPROVED",
      is_read: true,
    };

    if (isRejected) {
      notificationPayload.rejection_reason =
        reason;

      notificationPayload.rejected_by =
        getManagerDisplayName();
    }

    /*
     * The BOM backend already updates its Manager notification.
     * This PATCH is kept for compatibility with the current UI,
     * but now also uses authenticated API handling.
     */
    try {
      await fetchAuthenticatedJson(
        `${config.baseURL}/notifications/${encodeURIComponent(
          notification.id
        )}/`,
        {
          method: "PATCH",
          body: JSON.stringify(
            notificationPayload
          ),
        }
      );
    } catch (notificationError) {
      console.warn(
        "BOM decision succeeded, but notification refresh PATCH failed:",
        notificationError
      );
    }

    setBomData((previous) =>
      previous.filter(
        (item) =>
          String(item?.notificationId ?? item?.id) !==
            String(notification?.notificationId ?? notification?.id),
      ),
    );

    setRawNotifications((previous) =>
      previous.map((item) =>
        String(item?.id) === String(notification?.id)
          ? {
              ...item,
              status: notificationPayload.status,
              is_read: true,
            }
          : item,
      ),
    );

    void loadNotifications().catch((refreshError) => {
      console.warn(
        "BOM approval succeeded, but notification refresh failed:",
        refreshError,
      );
    });

    window.dispatchEvent(
      new Event("notificationsUpdated")
    );

    return true;
  } catch (error) {
    const message = String(
      error?.message ||
        "Unable to update BOM approval."
    );

    const normalizedMessage =
      message.trim().toLowerCase();

    /*
     * Last-resort protection for a race condition where another Manager
     * processes the BOM between the pre-check GET and decision POST.
     */
    const isAlreadyProcessedBom =
      normalizedMessage.includes(
        "only pending manager or modified boms can be rejected"
      ) ||
      normalizedMessage.includes(
        "only pending manager or modified boms can be approved"
      );

    if (isAlreadyProcessedBom) {
      console.info(
        "BOM action race-condition ignored because BOM is already processed:",
        message
      );

      await loadNotifications();

      window.dispatchEvent(
        new Event("notificationsUpdated")
      );

      return true;
    }

    console.error(
      "BOM approval action failed:",
      error
    );

    /*
     * Genuine errors remain visible.
     */
    alert(message);

    return false;
  } finally {
    endNotificationAction(actionKey);
  }
};

const handleCloseRejectModal = () => {
  setShowRejectModal(false);
  setActiveRejectNotification(null);
  setPendingRejectStatus("");
  setPendingRejectResourceType("");
  setRejectReason("");
};

const handleConfirmReject = async () => {
  if (!activeRejectNotification) return;
if (
  String(
    pendingRejectResourceType || ""
  ).toUpperCase() === "BOM"
) {
  if (!rejectReason.trim()) {
    alert("Enter rejection remarks.");
    return;
  }

const success =
  await updateBomNotification(
    activeRejectNotification,
    "MANAGER_REJECTED",
    rejectReason.trim()
  );

if (success) {
  handleCloseRejectModal();
}

return;
}
  if (
    String(
      pendingRejectResourceType ||
        "",
    ).toUpperCase() === "DIRECT_PO_MANAGER"
  ) {
    const success =
      await rejectDirectPoFromManagerNotification(
        activeRejectNotification,
        rejectReason.trim(),
      );

    if (success) {
      handleCloseRejectModal();
    }

    return;
  }

  if (
    String(
      pendingRejectResourceType ||
        "",
    ).toUpperCase() === "SCRAP"
  ) {
    const success =
      await handleScrapDecision(
        activeRejectNotification,
        "REJECTED",
        rejectReason.trim(),
      );

    if (success) {
      handleCloseRejectModal();
    }

    return;
  }

  const resourceId =
    activeRejectNotification.poId ||
    activeRejectNotification.reference_id ||
    activeRejectNotification.id;

  await updateStatus(
    activeRejectNotification.id,
    resourceId,
    pendingRejectStatus,
    pendingRejectResourceType,
    rejectReason.trim()
  );
  handleCloseRejectModal();
};

const isViewingExistingReject = () =>
  [
    "REJECTED",
    "MANAGER_REJECTED",
  ].includes(
    String(
      activeRejectNotification?.status ||
        ""
    ).toUpperCase()
  );

  // DELETE NOTIFICATION
const deleteNotification = async (id) => {
  const notificationId = String(id ?? "");

  if (!notificationId) {
    return;
  }

  const removeFromLocalState = () => {
    setRawNotifications((previous) =>
      previous.filter(
        (notification) =>
          String(notification.id) !==
          notificationId,
      ),
    );

    setNotifications((previous) =>
      previous.filter(
        (notification) =>
          String(notification.id) !==
          notificationId,
      ),
    );
  };

  // Hide it immediately; the API delete can be slow or already completed.
  removeFromLocalState();

  try {
    await fetchAuthenticatedJson(
      `${config.baseURL}/notifications/${notificationId}/`,
      {
        method: "DELETE",
        timeoutMs: 60000,
      },
    );

    window.dispatchEvent(
      new Event("notificationsUpdated"),
    );
  } catch (error) {
    const message = String(
      error?.message ||
        error?.detail ||
        "",
    ).toLowerCase();

    // A prior approval/rejection may already have removed the notification.
    if (
      message.includes("no notification matches") ||
      message.includes("not found") ||
      message.includes("does not exist")
    ) {
      return;
    }

    console.error(
      "Unable to remove notification:",
      error,
    );

    alert(
      error?.message ||
        "Unable to remove notification.",
    );
  }
};

  const getStatusStyle = (status) => {
    switch (status) {
      case "APPROVED":
        return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-700";
      case "REJECTED":
        return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-200 dark:border-red-700";
      case "PENDING":
      case "REQUESTED":
        return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700";
      case "PENDING_MANAGER":
        return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200";

      case "MODIFIED":
        return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-200";

      case "MANAGER_REJECTED":
        return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700";
    }
  };


const poNotifications = rawNotifications
  .filter((n) => {
    const category = String(
      n.category || ""
    ).toUpperCase();

    const receiver = String(
      n.receiver || ""
    ).toUpperCase();

    const status = String(
      n.status || ""
    ).toUpperCase();

    if (category !== "PO") {
      return false;
    }

    if (isFinance) {
      return (
        receiver === "FINANCE" &&
        [
          "PENDING_FINANCE",
          "APPROVED",
          "REJECTED",
          "FINANCE_APPROVED",
          "FINANCE_REJECTED",
        ].includes(status)
      );
    }

    if (isManager) {
      return (
        receiver === "MANAGER" &&
        [
          "PENDING",
          "REQUESTED",
          "PENDING_MANAGER",
          "APPROVED",
          "REJECTED",
        ].includes(status)
      );
    }

    return false;
  });
  const mrNotifications = (() => {
    const seen = new Set();
    const filtered = rawNotifications.filter((n) => n.category === "MR").filter((n) => {
      const status = String(n.status || "").toUpperCase();
      const receiver = String(n.receiver || "").toUpperCase();

      if (isManager) {
        return (
          receiver === "MANAGER" &&
          [
            "PENDING_MANAGER",
            "MANAGER_APPROVED",
            "MANAGER_REJECTED"
          ].includes(status)
        );
      }

if (isInventory) {
  return (
    receiver === "INVENTORY" &&
    [
      "MANAGER_APPROVED",
      "INVENTORY_PENDING",
      "QC_CHECKED",
      "PROJECT_INVENTORY_READY",
      "INVENTORY_ISSUED",
      "MR_COMPLETED",
    ].includes(status)
  );
}
      if (isAdmin) {
        return false;
      }

      return false;
    });

    return filtered.filter((n) => {
      const referenceId = String(
        n.reference_id || n.referenceId || n.material_request_id || n.request_id || n.id || ""
      );
      if (!referenceId) return true;
      if (seen.has(referenceId)) return false;
      seen.add(referenceId);
      return true;
    });
  })();

  const scrapNotifications =
    rawNotifications
      .filter(
        (notification) =>
          String(
            notification.category ||
              "",
          ).toUpperCase() ===
            "SCRAP" &&
          String(
            notification.receiver ||
              "",
          ).toUpperCase() ===
            "MANAGER",
      )
      .filter((notification) => {
        if (!isManager) {
          return false;
        }

        const status =
          String(
            notification.status ||
              "",
          ).toUpperCase();

        return [
          "REQUESTED",
          "PENDING_MANAGER",
          "PENDING_FINANCE",
          "MANAGER_APPROVED",
          "APPROVED",
          "REJECTED",
          "MANAGER_REJECTED",
        ].includes(status);
      });

  /*
   * RETURNABLE has two different Manager workflows:
   *
   * 1. Initial Returnable Material Request approval.
   *    Backend notification category is MR and reference_id is MaterialRequest.id.
   *
   * 2. Returned item marked NOT OK.
   *    Backend notification category is CU and reference_id is ComponentUsage.id.
   *
   * Keep both in the Returnable tab so newly-created Returnable MRs do not
   * disappear into the normal MR tab.
   */
  const returnableMrNotifications = isManager
    ? mrData.filter((mr) => {
        const requestType = String(
          mr?.request_type || mr?.requestType || ""
        )
          .trim()
          .toUpperCase();

        if (requestType !== "RETURNABLE") {
          return false;
        }

        /*
         * IMPORTANT:
         * Returnable purpose does NOT determine whether this is Drone mode
         * or Components mode.
         *
         * Flight Test / Demo-Trials / Event can use:
         *   - Drone mode      -> ComponentUsage (CU) notification
         *   - Components mode -> normal RETURNABLE MaterialRequest (MR)
         *
         * Therefore do not exclude a RETURNABLE MR merely because its purpose
         * is FLIGHT_TEST / CUSTOMER_DEMO / EVENT.
         */
        return mrNotifications.some((notification) => {
          const notificationRef = String(
            notification?.reference_id ||
              notification?.referenceId ||
              ""
          );

          const mrRef = String(
            mr?.reference_id ||
              mr?.referenceId ||
              ""
          );

          return (
            String(notification?.id) === String(mr?.id) ||
            (notificationRef &&
              mrRef &&
              notificationRef === mrRef)
          );
        });
      })
    : [];

  const returnableCuNotifications = rawNotifications.filter(
    (notification) => {
      if (!isManager) return false;

      return (
        String(
          notification?.category || ""
        ).toUpperCase() === "CU" &&
        String(
          notification?.receiver || ""
        ).toUpperCase() === "MANAGER"
      );
    }
  );

  /*
   * Normal Manager MR tab must not duplicate Returnable MRs.
   * Inventory users keep their existing MR behavior unchanged.
   */
  const standardMrData = isManager
    ? mrData.filter((mr) => {
        const requestType = String(
          mr?.request_type ||
            mr?.requestType ||
            ""
        )
          .trim()
          .toUpperCase();

        return ![
          "RETURNABLE",
          "RETAIL_SALES",
        ].includes(requestType);
      })
    : mrData;

  /*
   * RETAIL SALES is also created through the Material Request backend.
   * Its notification category remains MR, but Manager needs a dedicated
   * Retail Sales tab so the request is clearly visible and actionable.
   */
  const retailSalesMrNotifications = isManager
    ? mrData.filter((mr) => {
        const requestType = String(
          mr?.request_type || mr?.requestType || ""
        )
          .trim()
          .toUpperCase();

        return requestType === "RETAIL_SALES";
      })
    : [];

  const retailSalesTabCount =
    retailSalesMrNotifications.length;

  const standardMrNotifications = isManager
    ? mrNotifications.filter((notification) => {
        const notificationRef = String(
          notification?.reference_id ||
            notification?.referenceId ||
            ""
        );

        const belongsToSpecialMr = [
          ...returnableMrNotifications,
          ...retailSalesMrNotifications,
        ].some((mr) => {
          const mrRef = String(
            mr?.reference_id ||
              mr?.referenceId ||
              ""
          );

          return (
            String(notification?.id) ===
              String(mr?.id) ||
            (notificationRef &&
              mrRef &&
              notificationRef === mrRef)
          );
        });

        return !belongsToSpecialMr;
      })
    : mrNotifications;

  const returnableTabCount =
    returnableMrNotifications.length +
    returnableCuNotifications.length;

  useEffect(() => {
    const tabsWithNotifications = isFinance
      ? [
          ["PO", notifications.length],
          [
            "SCRAP",
            rawNotifications.filter(
              (notification) =>
                String(notification?.category || "").toUpperCase() ===
                  "SCRAP" &&
                String(notification?.receiver || "").toUpperCase() ===
                  "FINANCE",
            ).length,
          ],
        ]
      : [
          ...(isManager
            ? [["PO", notifications.length]]
            : []),
          ...((isManager || isInventory)
            ? [["MR", standardMrData.length]]
            : []),
          ...(isManager
            ? [
                ["BOM", bomData.length],
                ["SCRAP", scrapNotifications.length],
                ["CU", returnableTabCount],
                ["RETAIL_SALES", retailSalesTabCount],
              ]
            : []),
        ];

    const firstPendingTab = tabsWithNotifications.find(
      ([, count]) => Number(count) > 0,
    )?.[0];

    if (firstPendingTab) {
      setCurrentTab(firstPendingTab);
    }
  }, [
    isFinance,
    isManager,
    isInventory,
    notifications.length,
    rawNotifications,
    standardMrData.length,
    bomData.length,
    scrapNotifications.length,
    returnableTabCount,
    retailSalesTabCount,
  ]);

  const formatReturnablePurpose = (value) =>
    String(value || "Returnable")
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) =>
        letter.toUpperCase()
      );

  const getReturnableComponentSummary = (mr) => {
    const items = Array.isArray(mr?.request_items)
      ? mr.request_items
      : [];

    if (items.length === 0) {
      return "-";
    }

    return items
      .map((item) => {
        const name =
          item?.component_name ||
          item?.component_code ||
          "Component";

        const quantity = Number(
          item?.quantity || 0
        );

        return `${name}-${quantity}`;
      })
      .join(", ");
  };

  const processReturnableApproval = async (notification, decision) => {
    const usageId = notification?.reference_id || notification?.referenceId;
    if (!usageId) return;

    const title = String(notification?.title || "").trim();
    const isDroneUsageApproval =
      title.toLowerCase().startsWith("drone usage approval");

    let reason = "";
    if (decision === "REJECT") {
      reason =
        window.prompt(
          isDroneUsageApproval
            ? "Enter Manager rejection reason for this drone usage:"
            : "Enter Manager rejection reason:"
        ) || "";
      if (!reason.trim()) return;
    }

    const actionKey = `CU:${usageId}`;
    if (!beginNotificationAction(actionKey)) return;

    try {
      const endpoint = isDroneUsageApproval
        ? "usage-approval"
        : "return-approval";

      /*
       * Verify the authoritative ComponentUsage detail before POSTing.
       * This prevents a stale Manager notification from submitting an action
       * that another tab/session has already processed.
       */
      if (isDroneUsageApproval) {
        try {
          const latestUsage =
            await fetchAuthenticatedJson(
              `${config.baseURL}/component-usage/${encodeURIComponent(
                usageId,
              )}/`,
              {
                cache: "no-store",
              },
            );

          const latestApprovalState = String(
            latestUsage?.return_approval_status || "",
          )
            .trim()
            .toUpperCase();

          if (
            latestApprovalState &&
            latestApprovalState !== "PENDING_MANAGER"
          ) {
            invalidateNotificationLoadingCache();
            await loadNotifications();

            window.dispatchEvent(
              new Event("notificationsUpdated"),
            );
            window.dispatchEvent(
              new Event("inventory:changed"),
            );
            return;
          }
        } catch (precheckError) {
          console.warn(
            "Unable to pre-check Returnable Manager approval; backend will verify it:",
            precheckError,
          );
        }
      }

      await fetchAuthenticatedJson(
        `${config.baseURL}/component-usage/${encodeURIComponent(usageId)}/${endpoint}/`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            reason: reason.trim(),
          }),
        },
      );

      const processedStatus =
        decision === "APPROVE"
          ? "MANAGER_APPROVED"
          : "MANAGER_REJECTED";

      setRawNotifications((previous) =>
        previous.map((item) =>
          String(item?.id) === String(notification?.id)
            ? {
                ...item,
                status: processedStatus,
                is_read: true,
                authoritativeReturnApprovalStatus:
                  decision === "APPROVE"
                    ? "NOT_REQUIRED"
                    : "REJECTED",
              }
            : item,
        ),
      );

      invalidateNotificationLoadingCache();

      window.dispatchEvent(new Event("notificationsUpdated"));
      window.dispatchEvent(new Event("inventory:changed"));
      await loadNotifications();
    } catch (error) {
      const message = String(
        error?.message ||
          "Unable to process Returnable approval.",
      );

      const normalizedMessage =
        message.trim().toLowerCase();

      const alreadyProcessed =
        normalizedMessage.includes(
          "not pending manager approval anymore",
        ) ||
        normalizedMessage.includes(
          "not waiting for manager approval",
        ) ||
        normalizedMessage.includes(
          "already processed",
        );

      if (alreadyProcessed) {
        console.info(
          "Returnable Manager action was already processed; refreshing latest state:",
          message,
        );

        invalidateNotificationLoadingCache();
        await loadNotifications();

        window.dispatchEvent(
          new Event("notificationsUpdated"),
        );
        window.dispatchEvent(
          new Event("inventory:changed"),
        );
        return;
      }

      console.error(
        "Returnable Manager approval failed:",
        error,
      );
      alert(message);
    } finally {
      endNotificationAction(actionKey);
    }
  };

  const getReturnableScrapWorkflow = (row = {}) =>
    String(
      row?.scrapMetadata?.workflow ||
        row?.inventory_allocations?.workflow ||
        "",
    )
      .trim()
      .toUpperCase();

  const getManagerScrapSourceLabel = (row = {}) => {
    const workflow =
      getReturnableScrapWorkflow(row);

    if (
      [
        "RETURNABLE_COMPONENT_QC_V1",
        "RETURNABLE_DRONE_QC_V1",
      ].includes(workflow)
    ) {
      const purpose = String(
        row?.scrapMetadata
          ?.returnable_purpose_label ||
          row?.scrapMetadata
            ?.returnable_purpose ||
          "",
      ).trim();

      return purpose
        ? `Returnable - ${purpose.replaceAll(
            "_",
            " ",
          )}`
        : "Returnable QC";
    }

    return String(
      row?.source || "DIRECT",
    ).toUpperCase();
  };

  const getManagerScrapDecisionCopy = (
    row = {},
  ) => {
    const workflow =
      getReturnableScrapWorkflow(row);

    if (
      workflow ===
      "RETURNABLE_COMPONENT_QC_V1"
    ) {
      return {
        title:
          "Restore / Replace Failed Component?",
        description:
          "Inventory marked this returned component NOT OK. Choose Reorder YES or NO.",
        yesTitle:
          "YES — Restore / Replace",
        yesDescription:
          "Record REBUILD / REORDER for Finance approval. Only after Finance approves will the PR/FR be created. GOOD serials stay pre-fulfilled in that child MR; only missing quantity is checked against In Store, and Procurement receives only the remaining shortage.",
        noTitle:
          "NO — Final Scrap",
        noDescription:
          "Send the Scrap / Do Not Rebuild decision to Finance. After Finance approves, GOOD serials return to In Store and BAD serials remain in Failed QC with Restore action.",
      };
    }

    if (
      workflow ===
      "RETURNABLE_DRONE_QC_V1"
    ) {
      return {
        title:
          "Rebuild Returned Drone?",
        description:
          "Inventory found one or more NOT OK components in the returned drone. Choose whether the failed components must be reordered.",
        yesTitle:
          "YES — Reorder / Rebuild",
        yesDescription:
          "Send the REBUILD decision to Finance first. After Finance approves, create _PR when reusable GOOD parts exist or _FR when all parts failed. GOOD serials stay in the new MR; missing quantity checks In Store first and only shortage goes to Procurement.",
        noTitle:
          "NO — Final Scrap",
        noDescription:
          "Send the Scrap / Do Not Rebuild decision to Finance. No rebuild MR is created. After Finance approves, GOOD serials move back to In Store and BAD serials remain Failed QC with Restore action.",
      };
    }

    const scrapMode = String(
      row?.scrapMetadata?.scrap_mode ||
        row?.scrapMetadata?.scrapMode ||
        ""
    )
      .trim()
      .toUpperCase();

    const goodQuantity = Number(
      row?.goodQuantity ??
        row?.scrapMetadata?.good_quantity ??
        0
    ) || 0;

    const isFullReorder =
      scrapMode === "TOTAL" ||
      goodQuantity <= 0;

    return {
      title:
        "Reorder / Rebuild this MR?",
      description:
        "Record the disposition for Finance review. No inventory will move and no new MR will be created until Finance approves.",
      yesTitle:
        isFullReorder
          ? "YES — Fully Reorder (FR)"
          : "YES — Partially Reorder (PR)",
      yesDescription:
        isFullReorder
          ? "All components are Scrap. After Finance approval, recreate the full MR as <Original MR>_FR and source every required component through In Store or Procurement."
          : "Some components are GOOD / reusable. After Finance approval, create <Original MR>_PR, reuse the good serials, and source only damaged/missing quantities through In Store or Procurement.",
      noTitle:
        "NO — Return Good Items to Store",
      noDescription:
        "Do not create a new MR. After Finance approval, any GOOD / reusable serials return to In Store and damaged items remain Scrap.",
    };
  };

  const getReturnableItemComponentLabel = (
    item = {},
  ) => {
    const componentObject =
      item?.component &&
      typeof item.component === "object"
        ? item.component
        : {};

    const code = String(
      item?.componentCode ||
        item?.component_code ||
        item?.component_id ||
        componentObject?.component_id ||
        componentObject?.component_code ||
        componentObject?.code ||
        "",
    ).trim();

    const name = String(
      item?.componentName ||
        item?.component_name ||
        item?.name ||
        componentObject?.name ||
        componentObject?.component_name ||
        "Component",
    ).trim();

    return code && name
      ? `${code} - ${name}`
      : name || code || "Component";
  };

  const getReturnableItemSerialNumbers = (
    item = {},
  ) => {
    const candidates = [
      item?.serialNumbers,
      item?.serial_numbers,
      item?.issued_serial_numbers,
      item?.issuedSerialNumbers,
      item?.selected_serials,
      item?.selectedSerials,
      item?.serials,
      item?.serials_list,
    ];

    const serialSource =
      candidates.find(Array.isArray) ||
      [];

    return Array.from(
      new Set(
        serialSource
          .map((serial) => {
            if (
              serial &&
              typeof serial === "object"
            ) {
              return String(
                serial?.serial_number ||
                  serial?.serialNumber ||
                  serial?.serial ||
                  serial?.code ||
                  "",
              ).trim();
            }

            return String(
              serial || "",
            ).trim();
          })
          .filter(Boolean),
      ),
    );
  };

  const openReturnableSerialPopup = (
    item = {},
  ) => {
    setReturnableSerialPopup({
      component:
        getReturnableItemComponentLabel(
          item,
        ),
      quantity: Number(
        item?.quantity ??
          item?.qty ??
          item?.issued_quantity ??
          item?.requested_quantity ??
          0,
      ) || 0,
      serialNumbers:
        getReturnableItemSerialNumbers(
          item,
        ),
    });
  };


  const openReturnableComponentsPopup = ({
    title = "Returnable Components",
    mrNumber = "",
    purpose = "",
    mode = "Components",
    items = [],
  } = {}) => {
    const normalizedItems = (
      Array.isArray(items)
        ? items
        : []
    ).map((item, index) => ({
      key:
        item?.id ??
        item?.usageId ??
        item?.component_id ??
        item?.componentCode ??
        item?.component_code ??
        index,
      label:
        getReturnableItemComponentLabel(
          item,
        ),
      quantity:
        Number(
          item?.quantity ??
            item?.qty ??
            item?.issued_quantity ??
            item?.requested_quantity ??
            0,
        ) || 0,
      serialNumbers:
        getReturnableItemSerialNumbers(
          item,
        ),
    }));

    setReturnableComponentsPopup({
      title,
      mrNumber,
      purpose:
        formatReturnablePurpose(
          purpose,
        ),
      mode,
      items:
        normalizedItems,
      totalQuantity:
        normalizedItems.reduce(
          (total, item) =>
            total +
            Number(
              item?.quantity || 0,
            ),
          0,
        ),
    });
  };

  const renderTabButton = (tabId, label) => (
    <button
      type="button"
      onClick={() => setCurrentTab(tabId)}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
        currentTab === tabId
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-primary"
      }`}
    >
      {label}
    </button>
  );
  return (
  <PageShell>
    <PageHeader
      title="Notifications"
      subtitle="PO, BOM, MR, Returnable, and Scrap approval notifications"
    />

<div className="flex flex-wrap gap-2 mb-4">

{isFinance ? (
  <>
    {renderTabButton("PO", `PO (${notifications.length})`)}
    {renderTabButton(
      "SCRAP",
      `Scrap (${
        rawNotifications.filter(
          (notification) =>
            String(notification?.category || "").toUpperCase() === "SCRAP" &&
            String(notification?.receiver || "").toUpperCase() === "FINANCE",
        ).length
      })`,
    )}
  </>
) : (
  <>
    {isManager &&
      renderTabButton(
        "PO",
        `PO (${notifications.length})`,
      )}

    {(isManager || isInventory) &&
      renderTabButton("MR", `MR (${standardMrData.length})`)}

    {isManager &&
      renderTabButton("BOM", `BOM (${bomData.length})`)}

    {isManager &&
      renderTabButton(
        "SCRAP",
        `Scrap (${scrapNotifications.length})`,
      )}

    {isManager &&
      renderTabButton(
        "CU",
        `Returnable (${returnableTabCount})`,
      )}

    {isManager &&
      renderTabButton(
        "RETAIL_SALES",
        `Retail Sales (${retailSalesTabCount})`,
      )}
  </>
)}

</div>

    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden dark:bg-slate-950 dark:border-slate-700">

    {currentTab === "PO" && (isFinance || isManager) && (
      <div className="w-full">
        <div className="w-full">
          <div className="grid w-full grid-cols-[0.36fr_1.05fr_1.2fr_0.85fr_1fr_2fr_0.5fr_0.85fr_0.95fr_1.45fr] bg-muted/40 text-[13px] font-bold uppercase tracking-[0.04em] px-3 py-4 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <div className="text-center">S.No</div>
            <div className="text-center">PO #</div>
            <div className="text-center">Vendor</div>
            <div className="text-center">PO Date</div>
            <div className="text-center">Expected Delivery</div>
            <div className="text-center">Components</div>
            <div className="text-center">Qty</div>
            <div className="text-center">Total</div>
            <div className="text-center">Status</div>
            <div className="text-center">Action</div>
          </div>

          <div className="divide-y divide-border">
            {loading ? (
              <NotificationTableLoader
                title="Loading PO notifications..."
                subtitle="Fetching the latest Purchase Order approval requests."
              />
            ) : notifications.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                No purchase order approval requests yet
              </div>
            ) : (
              notifications.map((n, index) => (
                <div
                  key={n.id}
                  className="grid w-full grid-cols-[0.36fr_1.05fr_1.2fr_0.85fr_1fr_2fr_0.5fr_0.85fr_0.95fr_1.45fr] items-center px-3 py-5 text-[15px] leading-6 hover:bg-muted/30 transition-colors dark:hover:bg-slate-800"
                >
                  <div className="text-center font-semibold">{index + 1}</div>
                  <div className="text-center font-semibold text-[15px]">
                    <button
                      type="button"
                      onClick={() => openPoDetailsPopup(n)}
                      className="font-semibold text-blue-600 hover:underline dark:text-blue-300"
                    >
                      {n.poNumber}
                    </button>
                  </div>

                  <div className="px-2 text-center text-[15px]">
                    {n.vendor || "-"}
                  </div>


                  <div className="px-2 text-center text-[14px]">
                    {formatPoDate(n.poDate)}
                  </div>

                  <div className="px-2 text-center text-[14px]">
                    {formatPoDate(n.expectedDelivery)}
                  </div>

                  <div
                    className="flex items-center justify-center px-2 text-center text-[14px] leading-5"
                    title={n.componentSummary || "-"}
                  >
                    <span className="line-clamp-2 break-words text-center">
                      {n.componentSummary || "-"}
                    </span>
                  </div>

                  <div className="text-center text-[14px] font-semibold">
                    {Number(n.qty || 0)}
                  </div>

                  <div className="text-center text-[15px] font-semibold">
                    ₹{Number(n.total || 0).toFixed(2)}
                  </div>

                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          String(n.status || "").toUpperCase() ===
                          "REJECTED"
                        ) {
                          void openExistingRejectDetails(n);
                        }
                      }}
                      className="rounded-full"
                      style={{ outline: "none" }}
                    >
                      <StatusBadge
                        status={n.status}
                        rejectedBy={n.rejectedBy}
                      />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-1.5 px-1">
                    {n.status === "PENDING" && (
                      <button
                        onClick={() =>
                          requestApproval(n.id, n.poId)
                        }
                        className="rounded-lg bg-blue-600 px-3 py-2 text-[14px] font-semibold text-white hover:bg-blue-700"
                      >
                        Request Approval
                      </button>
                    )}

                    {n.status === "PENDING_FINANCE" && isFinance && (
                      <>
                        <button
                          disabled={isNotificationActionProcessing(
                            `PO:${String(n.id ?? "")}`,
                          )}
                          onClick={() =>
                            updateStatus(
                              n.id,
                              n.poId,
                              "APPROVED",
                              "PO",
                            )
                          }
                          className="rounded-lg bg-green-600 px-3 py-2 text-[14px] font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isNotificationActionProcessing(
                            `PO:${String(n.id ?? "")}`,
                          )
                            ? "Approving..."
                            : "Finance Approve"}
                        </button>

                        <button
                          onClick={() =>
                            handleOpenRejectModal(
                              n,
                              "REJECTED",
                            )
                          }
                          className="rounded-lg bg-red-600 px-3 py-2 text-[14px] font-semibold text-white hover:bg-red-700"
                        >
                          Finance Reject
                        </button>
                      </>
                    )}

                    {n.status === "PENDING_MANAGER" && isManager && (
                      <>
                        <button
                          disabled={isNotificationActionProcessing(
                            `PO_MANAGER:${String(
                              n.id ?? n.poId ?? "",
                            )}`,
                          )}
                          onClick={() =>
                            approveDirectPoFromManagerNotification(n)
                          }
                          className="rounded-lg bg-green-600 px-3 py-2 text-[14px] font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isNotificationActionProcessing(
                            `PO_MANAGER:${String(
                              n.id ?? n.poId ?? "",
                            )}`,
                          )
                            ? "Approving..."
                            : "Approve"}
                        </button>

                        <button
                          disabled={isNotificationActionProcessing(
                            `PO_MANAGER:${String(
                              n.id ?? n.poId ?? "",
                            )}`,
                          )}
                          onClick={() =>
                            openDirectPoManagerRejectModal(n)
                          }
                          className="rounded-lg bg-red-600 px-3 py-2 text-[14px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {["APPROVED", "REJECTED"].includes(
                      String(n.status || "").toUpperCase(),
                    ) && (
                      <button
                        type="button"
                        onClick={() =>
                          deleteNotification(n.id)
                        }
                        className="rounded-lg bg-gray-200 px-3 py-2 text-[14px] font-medium text-slate-800 hover:bg-gray-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )}

{currentTab === "BOM" &&
  isManager && (
    <>
      <div className="grid grid-cols-9 items-center bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-slate-700 dark:text-slate-300">
        <div className="text-center">
          S.No
        </div>

        <div className="text-center">
          BOM ID
        </div>

        <div className="text-center">
          BOM Name
        </div>

        <div className="text-center">
          Product
        </div>

        <div className="text-center">
          Version
        </div>

        <div className="text-center">
          Created By
        </div>

        <div className="text-center">
          Created Date
        </div>

        <div className="text-center">
          Status
        </div>

        <div className="text-center">
          Action
        </div>
      </div>

      <div className="divide-y divide-border">
        {loading ? (
          <NotificationTableLoader
            title="Loading BOM notifications..."
            subtitle="Fetching the latest BOM approval requests."
          />
        ) : bomData.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No BOM approval requests yet
          </div>
        ) : (
          bomData.map((notification, index) => {
            const status = String(
              notification.status || ""
            ).toUpperCase();

            const rejectionReason =
              notification
                .rejectionReason ||
              notification
                .rejection_reason ||
              notification.message ||
              "";

            return (
              <div
                key={notification.id}
                className="grid grid-cols-9 items-center px-6 py-5 text-[15px] leading-6 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
              >
                <div className="text-center font-semibold">{index + 1}</div>
<div className="text-center text-[14px] font-semibold">
  <button
    type="button"
    onClick={() =>
      openBomDetailsPopup(
        notification
      )
    }
    className="text-blue-600 font-semibold hover:underline dark:text-blue-300"
  >
    {notification.bomNumber}
  </button>
</div>

                <div className="text-center text-[14px]">
                  {
                    notification
                      .bomName
                  }
                </div>

                <div className="text-center text-[15px]">
                  {
                    notification
                      .productName
                  }
                </div>

                <div className="text-center text-[15px]">
                  {
                    notification
                      .version
                  }
                </div>

                <div className="text-center text-[15px]">
                  {
                    notification
                      .createdBy
                  }
                </div>

                <div className="text-center text-[15px]">
                  {notification
                    .createdDate
                    ? new Date(
                        notification
                          .createdDate
                      ).toLocaleDateString(
                        "en-IN"
                      )
                    : "-"}
                </div>

                <div className="flex justify-center">
                  <button
                    type="button"
                    className={`inline-flex rounded-full border px-3 py-1 text-[14px] font-semibold ${getStatusStyle(
                      status
                    )}`}
                    onClick={() => {
                      if (
                        status ===
                          "MANAGER_REJECTED" &&
                        rejectionReason
                      ) {
                        setActiveRejectNotification(
                          notification
                        );

                        setPendingRejectStatus(
                          "MANAGER_REJECTED"
                        );

                        setPendingRejectResourceType(
                          "BOM"
                        );

                        setRejectReason(
                          rejectionReason
                        );

                        setShowRejectModal(
                          true
                        );
                      }
                    }}
                  >
                    {
                      {
                        PENDING_MANAGER:
                          "Pending Manager",

                        APPROVED:
                          "Approved",

                        MANAGER_REJECTED:
                          "Manager Rejected",

                        MODIFIED:
                          "Modified",
                      }[status] ||
                      status
                    }
                  </button>
                </div>

                <div className="flex justify-center gap-2">
                  {[
                    "PENDING_MANAGER",
                    "MODIFIED",
                  ].includes(status) && (
                    <>
                      <button
                        type="button"
                        disabled={isNotificationActionProcessing(
                          `BOM:${String(
                            notification?.id ??
                              notification?.bomId ??
                              notification?.reference_id ??
                              "",
                          )}`,
                        )}
                        onClick={() =>
                          updateBomNotification(
                            notification,
                            "APPROVED"
                          )
                        }
                        className="rounded-lg bg-green-600 px-3 py-2 text-[14px] font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isNotificationActionProcessing(
                          `BOM:${String(
                            notification?.id ??
                              notification?.bomId ??
                              notification?.reference_id ??
                              "",
                          )}`,
                        )
                          ? "Approving..."
                          : "Manager Approve"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleOpenRejectModal(
                            notification,
                            "MANAGER_REJECTED"
                          )
                        }
                        className="rounded-lg bg-red-600 px-3 py-2 text-[14px] font-medium text-white hover:bg-red-700"
                      >
                        Manager Reject
                      </button>
                    </>
                  )}

                  {[
                    "APPROVED",
                    "MANAGER_REJECTED",
                  ].includes(status) && (
                    <button
                      type="button"
                      onClick={() =>
                        deleteNotification(
                          notification.id
                        )
                      }
                      className="rounded-lg bg-slate-200 px-3 py-2 text-[14px] font-medium hover:bg-slate-300 dark:bg-slate-700"
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
    </>
  )}
 {currentTab === "MR" && !isFinance && (
        <div className="w-full overflow-x-auto">
          <div className="min-w-[1450px]">
<div className="grid grid-cols-[0.36fr_1.05fr_1.05fr_1fr_1.15fr_1fr_0.72fr_1fr_1.55fr_1.35fr] items-center bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-slate-700 dark:text-slate-200">  <div className="text-center">S.No</div>
  <div className="text-center">Requester</div>
  <div className="text-center">MR ID</div>
  <div className="text-center">Created Date</div>
  <div className="text-center">Project</div>
  <div className="text-center">Request Type</div>
  <div className="text-center">Drone Qty</div>
  <div className="text-center">Required Date</div>
  <div className="text-center">Remarks</div>
  <div className="text-center">Action</div>
</div>
          <div className="divide-y divide-border">
          {loading ? (
            <NotificationTableLoader
              title="Loading MR notifications..."
              subtitle="Fetching the latest Material Request approval details."
            />
          ) : standardMrNotifications.filter((notification) =>
  standardMrData.some(
    (mr) =>
      mr.id === notification.id ||
      mr.reference_id === notification.reference_id
  )
).length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                No material request notifications yet
              </div>
           ) : (
  standardMrData
    .filter((mr) =>
      standardMrNotifications.some(
        (notification) =>
          notification.id === mr.id ||
          notification.reference_id === mr.reference_id
      )
    )
    .map((n, index) => {
                const status = String(n.status || "").toUpperCase();
                return (
<div
  key={n.id}
  className="
    grid grid-cols-[0.36fr_1.05fr_1.05fr_1fr_1.15fr_1fr_0.72fr_1fr_1.55fr_1.35fr]
    items-center
    px-5
    py-5
    text-[15px]
    border-b
    border-slate-200
    dark:border-slate-700
    hover:bg-slate-50
    dark:hover:bg-slate-900
    transition-all
    duration-200
  "
>
<div className="text-center font-semibold">{index + 1}</div>

<div className="px-2 text-center text-[15px] font-medium leading-6 text-slate-800 dark:text-slate-100">
  {n.requester_name || "-"}
</div>

<div
  style={{
    textAlign: "center",
    fontSize: "15px",
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "190px",
    margin: "0 auto",
  }}
>
  {n.material_request_id || "-"}
</div>

<div className="px-2 text-center text-[15px] font-medium leading-6 text-slate-800 dark:text-slate-100">
  {n.created_date ? formatPoDate(n.created_date) : "-"}
</div>

<div className="px-2 text-center text-[15px] font-medium leading-6 text-slate-800 dark:text-slate-100">
  {n.project || "-"}
</div>

<div className="text-center">
<button
  onClick={() =>
    openMrDetailsPopup(n)
  }
  className="text-[15px] font-semibold text-blue-600 hover:underline dark:text-blue-300"
>
  {getManagerMrTypeLabel(n)}
</button>
</div>

<div className="px-2 text-center text-[15px] font-medium leading-6 text-slate-800 dark:text-slate-100">
  {n.drone_quantity !== undefined &&
  n.drone_quantity !== null &&
  n.drone_quantity !== ""
    ? n.drone_quantity
    : "-"}
</div>

<div className="px-2 text-center text-[15px] font-medium leading-6 text-slate-800 dark:text-slate-100">
  {n.required_date ? formatPoDate(n.required_date) : "-"}
</div>
<div
  className="
    min-w-0
    px-3
    text-center
    text-[14px]
    font-medium
    leading-6
    text-slate-600
    dark:text-slate-300
    whitespace-normal
    break-words
  "
>
  {String(n.remarks || "").trim() || "-"}
</div>
                    <div className="flex justify-center gap-2">
                      {(status === "REQUESTED" && isManager) && (
                        <>
                          <button
                            disabled={isNotificationActionProcessing(`MR:${String(n.id ?? "")}`)}
                            onClick={() =>
                              updateStatus(n.id, n.reference_id, "MANAGER_APPROVED", "MR")
                            }
className="
px-4
py-2
rounded-lg
bg-emerald-600
hover:bg-emerald-700
disabled:cursor-not-allowed
disabled:opacity-60
text-white
text-sm
font-medium
transition-all
duration-200
shadow-sm
hover:shadow-md
"                          >
                            {isNotificationActionProcessing(`MR:${String(n.id ?? "")}`)
                              ? "Approving..."
                              : "Manager Approve"}
                          </button>
                          <button
                            onClick={() => handleOpenRejectModal(n, "REJECTED")}
className="
px-4
py-2
rounded-lg
bg-red-600
hover:bg-red-700
text-white
text-sm
font-medium
transition-all
duration-200
shadow-sm
hover:shadow-md
"                          >
                            Manager Reject
                          </button>
                        </>
                      )}

                      {(status === "PENDING_MANAGER" && isManager) && (
                        <>
                          <button
                            disabled={isNotificationActionProcessing(`MR:${String(n.id ?? "")}`)}
                            onClick={() =>
                              updateStatus(n.id, n.reference_id, "MANAGER_APPROVED", "MR")
                            }
                            className="rounded-lg bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                          >
                            {isNotificationActionProcessing(`MR:${String(n.id ?? "")}`)
                              ? "Approving..."
                              : "Manager Approve"}
                          </button>
                          <button
                            onClick={() => handleOpenRejectModal(n, "REJECTED")}
                            className="rounded-lg bg-red-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 dark:bg-rose-600 dark:hover:bg-rose-700"
                          >
                            Manager Reject
                          </button>
                        </>
                      )}

{(status === "MANAGER_APPROVED" ||
  status === "MANAGER_REJECTED" ||
  status === "APPROVED" ||
  status === "REJECTED") && (
  <>
    <button
      onClick={() => deleteNotification(n.id)}
className="
px-4
py-2
rounded-lg
bg-slate-200
hover:bg-slate-300
dark:bg-slate-700
dark:hover:bg-slate-600
text-sm
font-medium
transition-all
"    >
      Remove
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
      )}

      {currentTab === "CU" && isManager && (
        <div className="w-full overflow-x-auto">
          <div className="min-w-[1500px]">
            <div className="grid grid-cols-[0.36fr_1.05fr_0.9fr_1.1fr_1fr_1.8fr_0.75fr_0.75fr_1.3fr_1fr_1.25fr] bg-muted/40 px-3 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-slate-700 dark:text-slate-200">
              <div className="text-center">S.No</div>
              <div>MR ID</div>
              <div>Requester</div>
              <div>Purpose / Mode</div>
              <div>Project</div>
              <div>Components / Qty</div>
              <div>Request Date</div>
              <div>Return Date</div>
              <div>Remarks</div>
              <div>Status</div>
              <div className="text-center">Action</div>
            </div>

            <div className="divide-y divide-border">
              {loading ? (
                <NotificationTableLoader
                  title="Loading Returnable notifications..."
                  subtitle="Fetching the latest returnable approval requests."
                />
              ) : returnableTabCount === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No Returnable requests for Manager.
                </div>
              ) : (
                <>
                  {returnableMrNotifications.map((mr, index) => {
                    const statusValue = String(
                      mr?.status || "PENDING_MANAGER",
                    )
                      .trim()
                      .toUpperCase();

                    const pending =
                      statusValue === "PENDING_MANAGER" ||
                      statusValue === "REQUESTED";

                    const actionKey = `MR:${String(mr?.id ?? "")}`;
                    const items = Array.isArray(mr?.request_items)
                      ? mr.request_items
                      : [];
                    const totalQty = items.reduce(
                      (total, item) => total + Number(item?.quantity || 0),
                      0,
                    );

                    return (
                      <div
                        key={`returnable-mr-${mr.id}`}
                        className="grid grid-cols-[0.36fr_1.05fr_0.9fr_1.1fr_1fr_1.8fr_0.75fr_0.75fr_1.3fr_1fr_1.25fr] items-center px-3 py-5 text-[15px] leading-6"
                      >
                        <div className="text-center font-semibold">{index + 1}</div>
                        <div className="font-semibold">
                          {mr.material_request_id || mr.reference_id || "-"}
                        </div>

                        <div>{mr.requester_name || mr.requester || "-"}</div>

                        <div>
                          <div className="font-semibold">
                            {formatReturnablePurpose(mr.returnable_purpose)}
                          </div>
                          <div className="mt-1 text-[12px] text-muted-foreground">
                            Components
                          </div>
                        </div>

                        <div className="break-words">
                          {mr.project_name || mr.project || "-"}
                        </div>

                        <div className="pr-2">
                          {items.length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                openReturnableComponentsPopup({
                                  title:
                                    "Returnable Components / Qty",
                                  mrNumber:
                                    mr.material_request_id ||
                                    mr.reference_id ||
                                    "-",
                                  purpose:
                                    mr.returnable_purpose ||
                                    "",
                                  mode:
                                    "Components",
                                  items,
                                })
                              }
                              className="w-full rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-left font-semibold text-blue-700 transition hover:border-blue-400 hover:bg-blue-100 hover:underline dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/60"
                              title="Click to view all Returnable components and quantities"
                            >
                              <div>
                                Components ({items.length})
                              </div>
                              <div className="mt-1 text-[12px] font-semibold text-muted-foreground">
                                Total Qty: {totalQty}
                              </div>
                            </button>
                          ) : (
                            <span className="text-muted-foreground">
                              -
                            </span>
                          )}
                        </div>

                        <div>{formatPoDate(mr.created_date || mr.date)}</div>
                        <div>{formatPoDate(mr.required_date)}</div>
                        <div className="break-words pr-2">{mr.remarks || "-"}</div>

                        <div className="font-medium">
                          {String(statusValue || "PENDING_MANAGER").replaceAll("_", " ")}
                        </div>

                        <div className="flex flex-wrap justify-center gap-2">
                          {pending ? (
                            <>
                              <button
                                type="button"
                                disabled={isNotificationActionProcessing(actionKey)}
                                onClick={() =>
                                  updateStatus(
                                    mr.id,
                                    mr.reference_id,
                                    "MANAGER_APPROVED",
                                    "MR",
                                  )
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                              >
                                {isNotificationActionProcessing(actionKey)
                                  ? "Approving..."
                                  : "Manager Approve"}
                              </button>

                              <button
                                type="button"
                                disabled={isNotificationActionProcessing(actionKey)}
                                onClick={() => handleOpenRejectModal(mr, "REJECTED")}
                                className="rounded-lg bg-red-600 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                              >
                                Manager Reject
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => deleteNotification(mr.id)}
                              className="rounded-lg bg-slate-200 px-3 py-2 text-[13px] font-medium text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {returnableCuNotifications.map((notification, index) => {
                    const statusValue = String(notification?.status || "")
                      .trim()
                      .toUpperCase();

                    const approvalState = String(
                      notification?.authoritativeReturnApprovalStatus || "",
                    )
                      .trim()
                      .toUpperCase();

                    const pending =
                      statusValue === "PENDING_MANAGER" &&
                      (!approvalState || approvalState === "PENDING_MANAGER");

                    const actionKey = `CU:${notification.reference_id}`;
                    const items = Array.isArray(notification?.returnableItems)
                      ? notification.returnableItems
                      : [];

                    const componentDetails = items.length
                      ? (
                          <button
                            type="button"
                            onClick={() =>
                              openReturnableComponentsPopup({
                                title:
                                  "Returnable Components / Qty",
                                mrNumber:
                                  notification.materialRequestNumber ||
                                  "-",
                                purpose:
                                  notification.returnablePurpose ||
                                  "",
                                mode:
                                  notification.returnableMode ||
                                  "Drone",
                                items,
                              })
                            }
                            className="w-full rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-left font-semibold text-blue-700 transition hover:border-blue-400 hover:bg-blue-100 hover:underline dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/60"
                            title="Click to view all Returnable components and quantities"
                          >
                            Components ({items.length})
                          </button>
                        )
                      : <span>{notification.message || "-"}</span>;

                    return (
                      <div
                        key={`returnable-cu-${notification.id}`}
                        className="grid grid-cols-[0.36fr_1.05fr_0.9fr_1.1fr_1fr_1.8fr_0.75fr_0.75fr_1.3fr_1fr_1.25fr] items-center px-3 py-5 text-[15px] leading-6"
                      >
                        <div className="text-center font-semibold">{returnableMrNotifications.length + index + 1}</div>
                        <div className="font-semibold text-blue-700 dark:text-blue-300">
                          {notification.materialRequestNumber || "-"}
                        </div>

                        <div>{notification.requesterName || "-"}</div>

                        <div>
                          <div className="font-semibold">
                            {formatReturnablePurpose(notification.returnablePurpose)}
                          </div>
                          <div className="mt-1 text-[12px] text-muted-foreground">
                            {notification.returnableMode || "Returnable"}
                          </div>
                        </div>

                        <div className="break-words">
                          {notification.project || "-"}
                        </div>

                        <div className="pr-2 leading-5">
                          {componentDetails}
                          {Number(notification.returnableTotalQuantity || 0) > 0 && (
                            <div className="mt-1 text-[12px] font-semibold text-muted-foreground">
                              Total Qty: {Number(notification.returnableTotalQuantity || 0)}
                            </div>
                          )}
                        </div>

                        <div>{formatPoDate(notification.requestDate)}</div>
                        <div>{formatPoDate(notification.returnDate)}</div>
                        <div className="break-words pr-2">{notification.remarks || "-"}</div>

                        <div className="font-medium">
                          {String(statusValue || "PENDING").replaceAll("_", " ")}
                        </div>

                        <div className="flex flex-wrap justify-center gap-2">
                          {pending ? (
                            <>
                              <button
                                type="button"
                                disabled={isNotificationActionProcessing(actionKey)}
                                onClick={() =>
                                  void processReturnableApproval(notification, "APPROVE")
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                              >
                                {isNotificationActionProcessing(actionKey)
                                  ? "Approving..."
                                  : "Manager Approve"}
                              </button>

                              <button
                                type="button"
                                disabled={isNotificationActionProcessing(actionKey)}
                                onClick={() =>
                                  void processReturnableApproval(notification, "REJECT")
                                }
                                className="rounded-lg bg-red-600 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => deleteNotification(notification.id)}
                              className="rounded-lg bg-slate-200 px-3 py-2 text-[13px] font-medium text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {currentTab === "RETAIL_SALES" && isManager && (
        <div className="w-full overflow-x-auto">
          <div className="min-w-[1380px]">
            <div className="grid grid-cols-[0.36fr_1.05fr_1fr_1fr_0.85fr_0.85fr_2.2fr_0.55fr_1.5fr_0.95fr_1.35fr] bg-muted/40 px-3 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-slate-700 dark:text-slate-200">
              <div className="text-center">S.No</div>
              <div className="text-center">MR ID</div>
              <div className="text-center">Requester</div>
              <div className="text-center">Project</div>
              <div className="text-center">Request Date</div>
              <div className="text-center">Required Date</div>
              <div className="text-center">Components</div>
              <div className="text-center">Qty</div>
              <div className="text-center">Remarks</div>
              <div className="text-center">Status</div>
              <div className="text-center">Action</div>
            </div>

            <div className="divide-y divide-border">
              {loading ? (
                <NotificationTableLoader
                  title="Loading Retail Sales notifications..."
                  subtitle="Fetching the latest Retail Sales requests waiting for Manager."
                />
              ) : retailSalesMrNotifications.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No Retail Sales requests waiting for Manager.
                </div>
              ) : (
                retailSalesMrNotifications.map((mr, index) => {
                  const statusValue = String(
                    mr?.status || "PENDING_MANAGER",
                  )
                    .trim()
                    .toUpperCase();

                  const pending =
                    statusValue === "PENDING_MANAGER" ||
                    statusValue === "REQUESTED";

                  const actionKey =
                    `MR:${String(mr?.id ?? "")}`;

                  const items = Array.isArray(
                    mr?.request_items,
                  )
                    ? mr.request_items
                    : [];

                  const itemSummary =
                    items.length > 0
                      ? items
                          .map((item) => {
                            const code =
                              item?.component_code ||
                              item?.component?.component_id ||
                              "";

                            const name =
                              item?.component_name ||
                              item?.component?.name ||
                              item?.name ||
                              "Component";

                            const quantity = Number(
                              item?.quantity ||
                                item?.qty ||
                                0,
                            );

                            return `${[code, name]
                              .filter(Boolean)
                              .join(" - ")} (${quantity})`;
                          })
                          .join(", ")
                      : "-";

                  const totalQty =
                    items.length > 0
                      ? items.reduce(
                          (total, item) =>
                            total +
                            Number(
                              item?.quantity ||
                                item?.qty ||
                                0,
                            ),
                          0,
                        )
                      : Number(
                          mr?.required_quantity ||
                            mr?.drone_quantity ||
                            0,
                        );

                  const requester =
                    mr?.requester_name ||
                    mr?.requester ||
                    mr?.requested_by ||
                    "-";

                  const project =
                    mr?.project_name ||
                    mr?.project ||
                    "-";

                  const requestDate =
                    mr?.date ||
                    mr?.created_date ||
                    mr?.createdDate ||
                    "";

                  const requiredDate =
                    mr?.required_date ||
                    mr?.requiredDate ||
                    "";

                  return (
                    <div
                      key={`retail-sales-mr-${mr.id}`}
                      className="grid grid-cols-[0.36fr_1.05fr_1fr_1fr_0.85fr_0.85fr_2.2fr_0.55fr_1.5fr_0.95fr_1.35fr] items-center px-3 py-5 text-[15px] leading-6 hover:bg-muted/30"
                    >
                      <div className="text-center font-semibold">{index + 1}</div>
                      <div className="text-center font-semibold">
                        <button
                          type="button"
                          onClick={() =>
                            openMrDetailsPopup(mr)
                          }
                          className="font-semibold text-blue-600 hover:underline dark:text-blue-300"
                        >
                          {mr.material_request_id ||
                            mr.request_id ||
                            mr.reference_id ||
                            "-"}
                        </button>
                      </div>

                      <div className="px-1 text-center font-medium">
                        {requester}
                      </div>

                      <div className="px-1 text-center">
                        {project}
                      </div>

                      <div className="text-center">
                        {requestDate
                          ? formatPoDate(requestDate)
                          : "-"}
                      </div>

                      <div className="text-center">
                        {requiredDate
                          ? formatPoDate(requiredDate)
                          : "-"}
                      </div>

                      <div
                        className="px-2 text-center leading-5"
                        title={itemSummary}
                      >
                        {itemSummary}
                      </div>

                      <div className="text-center font-semibold">
                        {totalQty}
                      </div>

                      <div
                        className="px-2 text-center leading-5 text-muted-foreground"
                        title={String(
                          mr?.remarks || "",
                        )}
                      >
                        {mr?.remarks || "-"}
                      </div>

                      <div className="text-center">
                        {String(
                          statusValue ||
                            "PENDING_MANAGER",
                        ).replaceAll("_", " ")}
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {pending ? (
                          <>
                            <button
                              type="button"
                              disabled={
                                isNotificationActionProcessing(
                                  actionKey,
                                )
                              }
                              onClick={() =>
                                updateStatus(
                                  mr.id,
                                  mr.reference_id,
                                  "MANAGER_APPROVED",
                                  "MR",
                                )
                              }
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                            >
                              {isNotificationActionProcessing(
                                actionKey,
                              )
                                ? "Approving..."
                                : "Manager Approve"}
                            </button>

                            <button
                              type="button"
                              disabled={
                                isNotificationActionProcessing(
                                  actionKey,
                                )
                              }
                              onClick={() =>
                                handleOpenRejectModal(
                                  mr,
                                  "REJECTED",
                                )
                              }
                              className="rounded-lg bg-red-600 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                            >
                              Manager Reject
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              deleteNotification(
                                mr.id,
                              )
                            }
                            className="rounded-lg bg-slate-200 px-3 py-2 text-[12px] font-semibold text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100"
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

      {currentTab === "SCRAP" &&
        isManager && (
        <>
          <div className="w-full">
            <div className="w-full">
              <div className="grid grid-cols-[0.34fr_0.72fr_1.15fr_0.45fr_1.15fr_0.45fr_0.58fr_0.85fr_0.68fr_1fr_0.7fr_1.55fr] bg-muted/40 text-[13px] font-bold uppercase tracking-[0.04em] px-2 py-4 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <div className="text-center">S.No</div>
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

              <div className="divide-y divide-border">
                {loading ? (
                  <NotificationTableLoader
                    title="Loading Scrap notifications..."
                    subtitle="Fetching the latest Scrap approval requests."
                  />
                ) : scrapNotifications.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    No scrap approval requests yet
                  </div>
                ) : (
                  scrapNotifications.map((n, index) => {
                    const serials = Array.isArray(
                      n.serialNumbers,
                    )
                      ? n.serialNumbers
                      : [];

                    const componentLabel = [
                      n.componentCode,
                      n.componentName,
                    ]
                      .filter(Boolean)
                      .join(" — ");

                    return (
                      <div
                        key={n.id}
                        className="grid grid-cols-[0.34fr_0.72fr_1.15fr_0.45fr_1.15fr_0.45fr_0.58fr_0.85fr_0.68fr_1fr_0.7fr_1.55fr] px-2 py-5 items-center text-[15px] leading-6 hover:bg-muted/50 transition-colors dark:hover:bg-slate-800"
                      >
                        <div className="text-center font-semibold">{index + 1}</div>
                        <div className="text-center text-[15px] font-medium">
                          {cleanScrapRequesterName(
                            n.requestedBy ||
                              n.requested_by ||
                              n.requester_name ||
                              n.requested_by_name ||
                              "",
                          ) || "-"}
                        </div>

                        <div
                          className="text-center px-1 text-[14px] font-medium leading-4 text-slate-800 dark:text-slate-100 break-words"
                          title={n.scrapComponentNames || componentLabel || ""}
                        >
                          {n.scrapComponentNames || componentLabel ||
                            "-"}
                        </div>

                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() =>
                              setScrapSerialPopup({
                                title:
                                  "Scrap Serial Numbers",
                                serialNumbers:
                                  Array.isArray(n.scrapSerialDetails) && n.scrapSerialDetails.length
                                    ? n.scrapSerialDetails
                                    : serials,
                              })
                            }
                            className="inline-flex min-w-10 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[15px] font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/50"
                            title="Click to view all serial numbers"
                          >
                            {Number(n.scrapQuantity ?? n.quantity ?? 0)}
                          </button>
                        </div>

                        <div className="px-1 text-center text-[14px] font-medium leading-4 break-words" title={n.goodComponentNames || ""}>
                          {n.goodComponentNames || "-"}
                        </div>

                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() =>
                              setScrapSerialPopup({
                                title: "Good / Reusable Serial Numbers",
                                serialNumbers: Array.isArray(n.goodSerialDetails) && n.goodSerialDetails.length
                                  ? n.goodSerialDetails
                                  : Array.isArray(n.goodSerialNumbers)
                                    ? n.goodSerialNumbers
                                    : [],
                              })
                            }
                            className="inline-flex min-w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[15px] font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                            title="Click to view all good/reusable serial numbers"
                          >
                            {Number(n.goodQuantity || 0)}
                          </button>
                        </div>

                        <div className="text-center text-[14px] font-medium">
                          {getManagerScrapSourceLabel(
                            n,
                          )}
                        </div>

                        <div className="text-center text-[14px] font-medium">
                          {n.materialRequestNumber ||
                            "-"}
                        </div>

                        <div className="text-center text-[15px]">
                          {n.scrapDate ||
                          n.date ||
                          n.created_at
                            ? new Date(
                                n.scrapDate ||
                                  n.date ||
                                  n.created_at,
                              ).toLocaleDateString(
                                "en-IN",
                              )
                            : "-"}
                        </div>

                        <div
                          className="text-center text-[14px] text-muted-foreground px-1 break-words"
                          title={
                            n.scrapRemarks ||
                            n.remarks ||
                            ""
                          }
                        >
                          {n.scrapRemarks ||
                            n.remarks ||
                            (
                              /waiting for manager approval/i.test(
                                String(
                                  n.message ||
                                    "",
                                ),
                              )
                                ? ""
                                : n.message
                            ) ||
                            "-"}
                        </div>

                        <div className="text-center">
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                [
                                  "REJECTED",
                                  "MANAGER_REJECTED",
                                ].includes(
                                  String(
                                    n.status ||
                                      "",
                                  ).toUpperCase(),
                                )
                              ) {
                                void openExistingRejectDetails(
                                  n,
                                );
                              }
                            }}
                            className="rounded-full hover:opacity-80 transition"
                            style={{ outline: "none" }}
                          >
                            <span className="inline-flex scale-100 origin-center">
                              <StatusBadge
                                status={n.status}
                                rejectedBy={
                                  n.rejectedBy
                                }
                              />
                            </span>
                          </button>
                        </div>

                        <div className="flex items-center justify-center gap-1 whitespace-nowrap flex-nowrap px-1">
                          {(
                            [
                              "REQUESTED",
                              "PENDING_MANAGER",
                            ].includes(
                              String(
                                n.status ||
                                  "",
                              ).toUpperCase(),
                            ) &&
                            isManager
                          ) && (
                            <>
                              <button
                                onClick={() =>
                                  setScrapDispositionPopup(n)
                                }
                                disabled={
                                  String(
                                    processingScrapId ||
                                      "",
                                  ) ===
                                  String(
                                    n?.reference_id ??
                                      n?.referenceId ??
                                      "",
                                  )
                                }
                                className="px-2 py-1 text-[12px] leading-4 rounded-md bg-green-600 hover:bg-green-700 text-white font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                              >
                                {String(
                                  processingScrapId ||
                                    "",
                                ) ===
                                String(
                                  n?.reference_id ??
                                    n?.referenceId ??
                                    "",
                                )
                                  ? "Processing..."
                                  : "Manager Approve"}
                              </button>

                              <button
                                onClick={() =>
                                  handleOpenRejectModal(
                                    n,
                                    "REJECTED",
                                  )
                                }
                                className="px-2 py-1 text-[12px] leading-4 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium whitespace-nowrap dark:bg-rose-600 dark:hover:bg-rose-700"
                              >
                                Manager Reject
                              </button>
                            </>
                          )}

                          {[
                            "PENDING_FINANCE",
                            "MANAGER_APPROVED",
                            "APPROVED",
                            "REJECTED",
                            "MANAGER_REJECTED",
                          ].includes(
                            String(
                              n.status ||
                                "",
                            ).toUpperCase(),
                          ) && (
                            <button
                              type="button"
                              onClick={() =>
                                deleteNotification(
                                  n.id,
                                )
                              }
                              className="rounded-md bg-slate-200 px-2 py-1 text-[12px] leading-4 font-medium whitespace-nowrap text-slate-800 transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
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
        </>
      )}
    </div>

    {scrapDispositionPopup && (() => {
      const copy =
        getManagerScrapDecisionCopy(
          scrapDispositionPopup,
        );

      return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-white p-6 shadow-2xl dark:bg-slate-950">
            <h2 className="text-lg font-semibold">
              {copy.title}
            </h2>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {copy.description}
            </p>

            {getReturnableScrapWorkflow(
              scrapDispositionPopup,
            ) && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                <div>
                  <span className="font-semibold">
                    Source:
                  </span>{" "}
                  {getManagerScrapSourceLabel(
                    scrapDispositionPopup,
                  )}
                </div>
                <div>
                  <span className="font-semibold">
                    MR:
                  </span>{" "}
                  {scrapDispositionPopup
                    ?.materialRequestNumber ||
                    "-"}
                </div>
                <div className="mt-1">
                  <span className="font-semibold">
                    QC Remarks:
                  </span>{" "}
                  {scrapDispositionPopup
                    ?.scrapRemarks ||
                    scrapDispositionPopup
                      ?.remarks ||
                    "-"}
                </div>
              </div>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={async () => {
                  const current =
                    scrapDispositionPopup;
                  const completed =
                    await handleScrapDecision(
                      current,
                      "APPROVED",
                      "",
                      "YES",
                    );
                  if (completed) {
                    setScrapDispositionPopup(
                      null,
                    );
                  }
                }}
                className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-left transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30"
              >
                <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {copy.yesTitle}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {copy.yesDescription}
                </div>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const current =
                    scrapDispositionPopup;
                  const completed =
                    await handleScrapDecision(
                      current,
                      "APPROVED",
                      "",
                      "NO",
                    );
                  if (completed) {
                    setScrapDispositionPopup(
                      null,
                    );
                  }
                }}
                className="rounded-xl border border-blue-300 bg-blue-50 p-4 text-left transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30"
              >
                <div className="font-semibold text-blue-700 dark:text-blue-300">
                  {copy.noTitle}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {copy.noDescription}
                </div>
              </button>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  setScrapDispositionPopup(
                    null,
                  )
                }
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    {returnableComponentsPopup && (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 px-4">
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5 dark:border-slate-700">
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {returnableComponentsPopup.title ||
                  "Returnable Components / Qty"}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {returnableComponentsPopup.mrNumber || "-"}
                {" • "}
                {returnableComponentsPopup.purpose || "Returnable"}
                {" • "}
                {returnableComponentsPopup.mode || "Components"}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setReturnableComponentsPopup(
                  null,
                )
              }
              className="rounded-lg px-3 py-1.5 text-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Close Returnable components popup"
            >
              ×
            </button>
          </div>

          <div className="px-6 py-5">
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="grid grid-cols-[1fr_120px] bg-muted/50 px-4 py-3 text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
                <div>Component</div>
                <div className="text-center">
                  Qty
                </div>
              </div>

              <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
                {Array.isArray(
                  returnableComponentsPopup.items,
                ) &&
                returnableComponentsPopup.items.length > 0 ? (
                  returnableComponentsPopup.items.map(
                    (item, index) => (
                      <div
                        key={`returnable-component-popup-${String(
                          item?.key ??
                            index,
                        )}-${index}`}
                        className="grid grid-cols-[1fr_120px] items-center px-4 py-3"
                      >
                        <div className="break-words font-semibold text-blue-700 dark:text-blue-300">
                          {item?.label ||
                            "Component"}
                        </div>

                        <div className="text-center text-base font-bold text-foreground">
                          {Number(
                            item?.quantity ||
                              0,
                          )}
                        </div>
                      </div>
                    ),
                  )
                ) : (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No component details are available.
                  </div>
                )}
              </div>

              <div className="grid grid-cols-[1fr_120px] border-t border-border bg-muted/30 px-4 py-3 font-bold text-foreground">
                <div>Total Qty</div>
                <div className="text-center">
                  {Number(
                    returnableComponentsPopup.totalQuantity ||
                      0,
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-border px-6 py-4 dark:border-slate-700">
            <button
              type="button"
              onClick={() =>
                setReturnableComponentsPopup(
                  null,
                )
              }
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}

    {returnableSerialPopup && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5 dark:border-slate-700">
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Component Serial Numbers
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Returnable component issue details
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setReturnableSerialPopup(
                  null,
                )
              }
              className="rounded-lg px-3 py-1.5 text-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Close Returnable component serial numbers"
            >
              ×
            </button>
          </div>

          <div className="space-y-5 px-6 py-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  Component
                </div>
                <div className="mt-1 break-words text-[15px] font-bold text-foreground">
                  {returnableSerialPopup.component ||
                    "Component"}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4 text-center sm:min-w-[110px]">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  Quantity
                </div>
                <div className="mt-1 text-xl font-bold text-foreground">
                  {Number(
                    returnableSerialPopup.quantity ||
                      0,
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-foreground">
                  Serial Numbers
                </h3>

                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {Array.isArray(
                    returnableSerialPopup.serialNumbers,
                  )
                    ? returnableSerialPopup.serialNumbers.length
                    : 0}{" "}
                  serial(s)
                </span>
              </div>

              {Array.isArray(
                returnableSerialPopup.serialNumbers,
              ) &&
              returnableSerialPopup.serialNumbers.length > 0 ? (
                <div className="max-h-80 overflow-y-auto rounded-xl border border-border bg-background p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {returnableSerialPopup.serialNumbers.map(
                      (
                        serial,
                        index,
                      ) => (
                        <div
                          key={`${serial}-${index}`}
                          className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-center text-sm font-semibold text-foreground"
                        >
                          {serial}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm font-medium text-muted-foreground">
                  No serial numbers are available for this component.
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end border-t border-border px-6 py-4 dark:border-slate-700">
            <button
              type="button"
              onClick={() =>
                setReturnableSerialPopup(
                  null,
                )
              }
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}

    {scrapSerialPopup && (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
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
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border bg-background p-3">
                {scrapSerialPopup
                  .serialNumbers
                  .map(
                    (
                      serial,
                      index
                    ) => (
                      <div
                        key={`${typeof serial === "object" ? serial?.serial : serial}-${index}`}
                        className="rounded-lg bg-muted px-3 py-2 text-sm"
                      >
                        <div className="font-semibold">
                          {typeof serial === "object" ? serial?.serial : serial}
                        </div>
                        {typeof serial === "object" && serial?.componentName ? (
                          <div className="mt-1 text-xs font-medium text-muted-foreground">
                            Component: {serial.componentName}
                          </div>
                        ) : null}
                      </div>
                    )
                  )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
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
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}

    {showRejectModal && (
      <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-slate-100">
          {isViewingExistingReject() ? (
            <>
              <h2 className="text-lg font-semibold">Rejection Details</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Rejected status details.
              </p>
              
              {String(
                pendingRejectResourceType ||
                  activeRejectNotification
                    ?.category ||
                  ""
              ).toUpperCase() !== "SCRAP" && (
                <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                    {String(
                      pendingRejectResourceType ||
                        activeRejectNotification
                          ?.category ||
                        ""
                    ).toUpperCase() === "BOM"
                      ? "BOM Number"
                      : String(
                          pendingRejectResourceType ||
                            activeRejectNotification
                              ?.category ||
                            ""
                        ).toUpperCase() === "MR"
                      ? "Material Request Number"
                      : "Purchase Order Number"}
                  </p>

                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {activeRejectNotification?.bomNumber ||
                      activeRejectNotification?.poNumber ||
                      activeRejectNotification
                        ?.material_request_id ||
                      activeRejectNotification?.title ||
                      activeRejectNotification
                        ?.reference_id ||
                      activeRejectNotification?.poId ||
                      "-"}
                  </p>
                </div>
              )}

              {/* Rejected By */}
              <div className="mt-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                  Rejected By
                </p>

                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 capitalize">
                  {getUserDisplayName(
                    activeRejectNotification?.rejectedBy ||
                      activeRejectNotification?.rejected_by ||
                      "",
                  ) ||
                    (
                      String(
                        pendingRejectResourceType ||
                          activeRejectNotification
                            ?.category ||
                          "",
                      ).toUpperCase() ===
                      "SCRAP"
                        ? getLoggedInUserName()
                        : "Manager"
                    )}
                </p>
              </div>

              {/* Rejection Reason */}
              <div className="mt-3">
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-2">Rejection Reason</p>
                <textarea
                  value={rejectReason}
                  readOnly
                  rows={4}
                  className="w-full rounded-xl border border-border bg-slate-50 px-4 py-3 text-sm text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">Reject Reason</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Provide a reason for rejection. This reason will be saved to the backend and shown when the reject badge is clicked.
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={6}
                className="mt-4 w-full rounded-xl border border-border bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-slate-900 dark:text-slate-100"
                placeholder="Enter reject reason..."
              />
            </>
          )}
          
          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseRejectModal}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700"
            >
              Close
            </button>
            {!isViewingExistingReject() && (
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={!rejectReason.trim()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm Reject
              </button>
            )}
          </div>
        </div>
      </div>
    )}
    {showBomDetailsModal &&
  selectedBomDetails && (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4 py-8">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-950 dark:text-slate-100">

        {/* POPUP HEADER */}
        <div className="flex items-center justify-between border-b px-6 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-semibold">
              BOM Details
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Review the complete BOM before
              approval or rejection.
            </p>
          </div>

          <button
            type="button"
            onClick={
              closeBomDetailsPopup
            }
            className="rounded-lg px-3 py-2 text-xl text-gray-500 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {bomDetailsLoading ? (
          <div className="p-16 text-center text-muted-foreground">
            Loading BOM details...
          </div>
        ) : (
          <div className="overflow-y-auto p-6">

            {/* MAIN BOM INFORMATION */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border p-4 dark:border-slate-700">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  BOM Number
                </p>

                <p className="mt-1 font-semibold">
                  {
                    selectedBomDetails
                      .bomNumber ||
                    selectedBomDetails
                      .bom_number ||
                    "-"
                  }
                </p>
              </div>

              <div className="rounded-xl border p-4 dark:border-slate-700">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  BOM Name
                </p>

                <p className="mt-1 font-semibold">
                  {
                    selectedBomDetails
                      .bomName ||
                    selectedBomDetails
                      .bom_name ||
                    "-"
                  }
                </p>
              </div>

              <div className="rounded-xl border p-4 dark:border-slate-700">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Product Name
                </p>

                <p className="mt-1 font-semibold">
                  {
                    selectedBomDetails
                      .productName ||
                    selectedBomDetails
                      .product_name ||
                    "-"
                  }
                </p>
              </div>

              <div className="rounded-xl border p-4 dark:border-slate-700">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Version
                </p>

                <p className="mt-1 font-semibold">
                  {
                    selectedBomDetails
                      .version ||
                    "-"
                  }
                </p>
              </div>

              <div className="rounded-xl border p-4 dark:border-slate-700">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Created By
                </p>

                <p className="mt-1 font-semibold">
                  {
                    selectedBomDetails
                      .createdBy ||
                    selectedBomDetails
                      .created_by ||
                    "-"
                  }
                </p>
              </div>

              <div className="rounded-xl border p-4 dark:border-slate-700">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Created Date
                </p>

                <p className="mt-1 font-semibold">
                  {(
                    selectedBomDetails
                      .createdDate ||
                    selectedBomDetails
                      .created_at
                  )
                    ? new Date(
                        selectedBomDetails
                          .createdDate ||
                          selectedBomDetails
                            .created_at
                      ).toLocaleString(
                        "en-IN"
                      )
                    : "-"}
                </p>
              </div>

              <div className="rounded-xl border p-4 dark:border-slate-700">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Updated Date
                </p>

                <p className="mt-1 font-semibold">
                  {(
                    selectedBomDetails
                      .updatedDate ||
                    selectedBomDetails
                      .updated_at
                  )
                    ? new Date(
                        selectedBomDetails
                          .updatedDate ||
                          selectedBomDetails
                            .updated_at
                      ).toLocaleString(
                        "en-IN"
                      )
                    : "-"}
                </p>
              </div>

              <div className="rounded-xl border p-4 dark:border-slate-700">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Status
                </p>

                <span
                  className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusStyle(
                    String(
                      selectedBomDetails
                        .status || ""
                    ).toUpperCase()
                  )}`}
                >
                  {
                    {
                      PENDING_MANAGER:
                        "Pending Manager",

                      APPROVED:
                        "Approved",

                      MANAGER_REJECTED:
                        "Manager Rejected",

                      MODIFIED:
                        "Modified",
                    }[
                      String(
                        selectedBomDetails
                          .status || ""
                      ).toUpperCase()
                    ] ||
                    selectedBomDetails
                      .status ||
                    "-"
                  }
                </span>
              </div>
            </div>


            {/* APPROVAL INFORMATION */}
            {selectedBomDetails
              .managerApprovedBy ||
            selectedBomDetails
              .manager_approved_by ? (
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
                  <p className="text-xs font-medium uppercase text-green-700 dark:text-green-300">
                    Approved By
                  </p>

                  <p className="mt-1 font-semibold">
                    {
                      selectedBomDetails
                        .managerApprovedBy ||
                      selectedBomDetails
                        .manager_approved_by
                    }
                  </p>
                </div>

                <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
                  <p className="text-xs font-medium uppercase text-green-700 dark:text-green-300">
                    Approved At
                  </p>

                  <p className="mt-1 font-semibold">
                    {(
                      selectedBomDetails
                        .managerApprovedAt ||
                      selectedBomDetails
                        .manager_approved_at
                    )
                      ? new Date(
                          selectedBomDetails
                            .managerApprovedAt ||
                            selectedBomDetails
                              .manager_approved_at
                        ).toLocaleString(
                          "en-IN"
                        )
                      : "-"}
                  </p>
                </div>
              </div>
            ) : null}

            {/* REJECTION INFORMATION */}
            {String(
              selectedBomDetails.status ||
                ""
            ).toUpperCase() ===
              "MANAGER_REJECTED" && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
                <h3 className="font-semibold text-red-700 dark:text-red-300">
                  Manager Rejection Details
                </h3>

                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase text-red-600 dark:text-red-300">
                      Rejected By
                    </p>

                    <p className="mt-1 font-semibold">
                      {
                        selectedBomDetails
                          .managerRejectedBy ||
                        selectedBomDetails
                          .manager_rejected_by ||
                        selectedBomDetails
                          .rejectedBy ||
                        "-"
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase text-red-600 dark:text-red-300">
                      Rejected At
                    </p>

                    <p className="mt-1 font-semibold">
                      {(
                        selectedBomDetails
                          .managerRejectedAt ||
                        selectedBomDetails
                          .manager_rejected_at
                      )
                        ? new Date(
                            selectedBomDetails
                              .managerRejectedAt ||
                              selectedBomDetails
                                .manager_rejected_at
                          ).toLocaleString(
                            "en-IN"
                          )
                        : "-"}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-medium uppercase text-red-600 dark:text-red-300">
                    Rejection Remarks
                  </p>

                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm dark:bg-slate-900">
                    {
                      selectedBomDetails
                        .managerRejectionReason ||
                      selectedBomDetails
                        .manager_rejection_reason ||
                      selectedBomDetails
                        .rejectionReason ||
                      "No rejection remarks provided."
                    }
                  </p>
                </div>
              </div>
            )}

            {/* COMPONENT TABLE */}
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  BOM Components
                </h3>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold dark:bg-slate-800">
                  {
                    (
                      selectedBomDetails
                        .items || []
                    ).length
                  }{" "}
                  Components
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border dark:border-slate-700">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-800">
                    <tr>
                      <th className="p-3 text-left">
                        Component
                      </th>

                      <th className="p-3 text-left">
                        Category
                      </th>

                      <th className="p-3 text-left">
                        Specification
                      </th>

                      <th className="p-3 text-center">
                        Quantity
                      </th>


                      <th className="p-3 text-left">
                        Remarks
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {Array.isArray(
                      selectedBomDetails
                        .items
                    ) &&
                    selectedBomDetails.items
                      .length > 0 ? (
                      selectedBomDetails.items.map(
                        (item, index) => (
                          <tr
                            key={
                              item.id ||
                              index
                            }
                            className="border-t dark:border-slate-700"
                          >
                            <td className="p-3 font-medium">
                              {[
                                item.component_code,
                                item.component_name,
                              ]
                                .filter(
                                  Boolean
                                )
                                .join(" — ") ||
                                item.component ||
                                "-"}
                            </td>

                            <td className="p-3">
                              {
                                item.category ||
                                "-"
                              }
                            </td>

                            <td className="p-3">
                              {
                                item.specifications ||
                                item.specification ||
                                "-"
                              }
                            </td>

                            <td className="p-3 text-center font-semibold">
                              {
                                item.quantity ??
                                "-"
                              }
                            </td>

  

                            <td className="p-3">
                              {
                                item.remarks ||
                                "-"
                              }
                            </td>
                          </tr>
                        )
                      )
                    ) : (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-8 text-center text-muted-foreground"
                        >
                          No BOM components found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* POPUP FOOTER */}
        <div className="flex justify-end border-t px-6 py-4 dark:border-slate-700">
          <button
            type="button"
            onClick={
              closeBomDetailsPopup
            }
            className="rounded-lg border px-5 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )}
{showBomModal && selectedMr && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 dark:bg-black/70">
    <div className="w-[1480px] max-w-[98vw] max-h-[86vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">

      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {(() => {
              const type = String(selectedMr.request_type || "").toUpperCase();
              if (type === "R&D" || type === "RD") return "R & D Details";
              if (type === "RETURNABLE") {
                const purpose = String(selectedMr.returnable_purpose || "Returnable")
                  .replaceAll("_", " ")
                  .toLowerCase()
                  .replace(/\b\w/g, (letter) => letter.toUpperCase());
                return `${purpose} Details`;
              }
              if (type === "RETAIL_SALES") return "Retail Sales Details";
              return "BOM Details";
            })()}
          </h2>

          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>
              MR:{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                {selectedMr.material_request_id ||
                  "-"}
              </strong>
            </span>

            <span>
              Project:{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                {selectedMr.project || "-"}
              </strong>
            </span>

            <span>
              Requester:{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                {selectedMr.requester_name ||
                  selectedMr.requester ||
                  "-"}
              </strong>
            </span>

            <span>
              MR Status:{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                {String(
                  selectedMr.status || "-",
                ).replaceAll("_", " ")}
              </strong>
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowBomModal(false);
            setSelectedMr(null);
          }}
          className="text-xl text-slate-400 transition hover:text-red-500"
          aria-label="Close MR details"
        >
          ✕
        </button>
      </div>

      {(() => {
        const allItems = [
          ...(selectedMr.bom_items || []),
          ...(selectedMr.custom_bom_items ||
            []),
          ...(selectedMr.rd_items || []),
          ...(selectedMr.request_items || []),
        ];

        const showProjectQuantity =
          allItems.some(
            (item) =>
              getManagerMrProjectQuantity(
                item,
                selectedMr,
              ) > 0,
          );

        const renderItemRow = (
          item,
          key,
          isRd = false,
        ) => (
          <tr
            key={key}
            className="border-b border-slate-100 transition hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-900/60"
          >
            <td className="px-2 py-2 text-center font-medium">
              {getManagerMrComponentDisplay(
                item,
              )}
            </td>

            <td className="px-2 py-2 text-center">
              {item.category || "-"}
            </td>

            <td className="px-2 py-2 text-center">
              {item.specification ||
                item.specifications ||
                item.component?.specification ||
                item.component?.specifications ||
                "-"}
            </td>

            <td className="px-2 py-2 text-center font-semibold">
              {Number(
                item.quantity ??
                  item.qty ??
                  item.required_quantity ??
                  0,
              )}
            </td>

            <td className="px-2 py-2 text-center font-semibold">
              {Number(
                item.delivered_quantity || 0,
              )}
            </td>

            <td className="px-2 py-2 text-center font-semibold">
              {Number(
                item.qc_passed_quantity || 0,
              )}
            </td>

            <td className="px-2 py-2 text-center font-semibold text-blue-700 dark:text-blue-300">
              {getManagerMrIssuedQuantity(
                item,
                selectedMr,
              )}
            </td>

            <td className="px-2 py-2 text-center font-semibold">
              {getManagerMrRemainingQuantity(
                item,
                selectedMr,
              )}
            </td>

            <td className="px-2 py-2 text-center">
              {renderManagerMrComponentStatus(
                item,
                selectedMr,
              )}
            </td>

            <td className="px-2 py-2 text-center font-semibold">
              {getMrStoredInventoryQuantity(
                item,
              )}
            </td>

            <td className="px-2 py-2 text-center">
              {getManagerMrReservedByOtherQuantity(
                item,
              )}
            </td>

            <td className="px-2 py-2 text-center font-semibold">
              {getManagerMrAvailableQuantity(
                item,
              )}
            </td>

            <td className="px-2 py-2 text-center">
              {renderManagerMrStockStatus(
                item,
              )}
            </td>

            {showProjectQuantity && (
              <td className="px-2 py-2 text-center font-semibold">
                {getManagerMrProjectQuantity(
                  item,
                  selectedMr,
                ) || "-"}
              </td>
            )}
          </tr>
        );

        return (
          <>
            <div className="max-h-[62vh] overflow-y-auto overflow-x-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
              <table className="w-full table-fixed text-[11px] leading-tight [&_th]:break-words [&_td]:break-words [&_th]:align-middle [&_td]:align-middle">
                <colgroup>
                  <col className="w-[13%]" />
                  <col className="w-[7%]" />
                  <col className="w-[8%]" />
                  <col className="w-[6%]" />
                  <col className="w-[6%]" />
                  <col className="w-[6%]" />
                  <col className="w-[7%]" />
                  <col className="w-[6%]" />
                  <col className="w-[8%]" />
                  <col className="w-[7%]" />
                  <col className="w-[7%]" />
                  <col className="w-[7%]" />
                  <col className="w-[7%]" />
                  {showProjectQuantity && (
                    <col className="w-[5%]" />
                  )}
                </colgroup>
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 text-slate-700 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900 dark:text-slate-100">
                  <tr>
                    <th className="px-2 py-2 text-center">
                      Component Name
                    </th>
                    <th className="px-2 py-2 text-center">
                      Category
                    </th>
                    <th className="px-2 py-2 text-center">
                      Specification
                    </th>
                    <th className="px-2 py-2 text-center">
                      Requested Qty
                    </th>
                    <th className="px-2 py-2 text-center">
                      Delivered
                    </th>
                    <th className="px-2 py-2 text-center">
                      QC Passed
                    </th>
                    <th className="px-2 py-2 text-center">
                      Issued to Engineer
                    </th>
                    <th className="px-2 py-2 text-center">
                      Remaining
                    </th>
                    <th className="px-2 py-2 text-center">
                      Component Status
                    </th>
                    <th className="px-2 py-2 text-center">
                      In Store at MR Creation
                    </th>
                    <th className="px-2 py-2 text-center">
                      Reserved by Other MR
                    </th>
                    <th className="px-2 py-2 text-center">
                      Available for this MR
                    </th>
                    <th className="px-2 py-2 text-center">
                      Stock Status
                    </th>
                    {showProjectQuantity && (
                      <th className="px-2 py-2 text-center">
                        Project Qty
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {allItems.length > 0 ? (
                    <>
                      {(selectedMr.bom_items ||
                        []).map(
                        (item, index) =>
                          renderItemRow(
                            item,
                            `bom-${index}`,
                          ),
                      )}

                      {(selectedMr.custom_bom_items ||
                        []).map(
                        (item, index) =>
                          renderItemRow(
                            item,
                            `custom-${index}`,
                          ),
                      )}

                      {(selectedMr.rd_items ||
                        []).map(
                        (item, index) =>
                          renderItemRow(
                            item,
                            `rd-${index}`,
                            true,
                          ),
                      )}

                      {(selectedMr.request_items ||
                        []).map(
                        (item, index) =>
                          renderItemRow(
                            item,
                            `request-${index}`,
                            true,
                          ),
                      )}
                    </>
                  ) : (
                    <tr>
                      <td
                        colSpan={
                          showProjectQuantity
                            ? 14
                            : 13
                        }
                        className="px-6 py-10 text-center text-slate-500"
                      >
                        No items found for this Material Request.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-950">
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Total items: {allItems.length}
              </span>

              <button
                type="button"
                onClick={() => {
                  setShowBomModal(false);
                  setSelectedMr(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </>
        );
      })()}
    </div>
  </div>
)}

{showPoDetailsModal && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4">
    <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Purchase Order Details
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {selectedPoDetails?.po_number || "Loading Purchase Order..."}
          </p>
        </div>

        <button
          type="button"
          onClick={closePoDetailsPopup}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          Close
        </button>
      </div>

      {poDetailsLoading ? (
        <div className="p-12 text-center text-sm text-slate-500">
          Loading Purchase Order details...
        </div>
      ) : selectedPoDetails ? (
        (() => {
          const po = selectedPoDetails;
          const items = getPoItems(po);
          const totals = getPoTotals(po);
          const managerStatus = String(
            po.notificationStatus || po.status || "",
          ).toUpperCase();

          const detailCards = [
            ["PO Number", po.po_number || "-"],
            [
              "PO Type",
              String(po.order_type || "STANDARD").toUpperCase() ===
              "REPLACEMENT"
                ? "Replacement PO"
                : "Direct PO",
            ],
            ["Vendor", po.vendor_name || "-"],
            ["GSTIN", po.vendorGstin || "-"],
            ["Location", po.vendorLocation || "-"],
            [
              "PO Date",
              formatPoDate(
                po.po_date ||
                  po.ordered_date ||
                  po.created_at,
              ),
            ],
            [
              "Expected Delivery",
              formatPoDate(po.expected_delivery_date),
            ],
            [
              "Requested By",
              po.requestedBy ||
                po.latest_approval?.requested_by ||
                "-",
            ],
            ["Finance Status", "Finance Approved"],
            [
              "Manager Status",
              managerStatus === "PENDING_MANAGER"
                ? "Pending Manager"
                : managerStatus === "APPROVED"
                  ? "Approved"
                  : managerStatus === "REJECTED"
                    ? "Rejected"
                    : managerStatus || "-",
            ],
            ["Total Quantity", totals.quantity],
            [
              "Grand Total",
              `₹${totals.grandTotal.toFixed(2)}`,
            ],
          ];

          return (
            <div className="overflow-y-auto">
              <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50 p-5 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700 dark:bg-slate-900/60">
                {detailCards.map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {label}
                    </div>
                    <div className="mt-1 break-words text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Components / Line Items
                  </h3>
                  <span className="text-xs text-slate-500">
                    {items.length} item{items.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full table-fixed text-[10px] xl:text-xs">
                    <thead className="bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-200">
                      <tr>
                        <th className="px-2 py-3 text-center">Component ID</th>
                        <th className="px-2 py-3 text-left">Component Name</th>
                        <th className="px-2 py-3 text-center">Ordered Qty</th>
                        <th className="px-2 py-3 text-center">Received</th>
                        <th className="px-2 py-3 text-center">Remaining</th>
                        <th className="px-2 py-3 text-right">Unit Price</th>
                        <th className="px-3 py-3 text-center">GST %</th>
                        <th className="px-2 py-3 text-right">Subtotal</th>
                        <th className="px-2 py-3 text-right">GST</th>
                        <th className="px-2 py-3 text-right">Total</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {items.length ? (
                        items.map((item, index) => {
                          const quantity = Number(item?.quantity || 0);
                          const received = Number(
                            item?.received_quantity || 0,
                          );
                          const remaining = Number.isFinite(
                            Number(item?.remaining_quantity),
                          )
                            ? Number(item?.remaining_quantity)
                            : Math.max(quantity - received, 0);

                          return (
                            <tr key={item?.id || index}>
                              <td className="px-3 py-3 text-center font-semibold">
                                {getPoItemComponentCode(item) || "-"}
                              </td>
                              <td className="px-3 py-3">
                                {getPoItemComponentName(item)}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {quantity}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {received}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {remaining}
                              </td>
                              <td className="px-2 py-3 text-right">
                                ₹{Number(item?.unit_price || 0).toFixed(2)}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {Number(item?.gst_percentage || 0).toFixed(2)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                ₹{getPoItemSubtotal(item).toFixed(2)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                ₹{getPoItemGstAmount(item).toFixed(2)}
                              </td>
                              <td className="px-3 py-3 text-right font-semibold">
                                ₹{getPoItemTotal(item).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={10}
                            className="px-6 py-10 text-center text-slate-500"
                          >
                            No Purchase Order line items found.
                          </td>
                        </tr>
                      )}
                    </tbody>

                    <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold dark:border-slate-700 dark:bg-slate-900">
                      <tr>
                        <td colSpan={7} className="px-3 py-3 text-right">
                          Totals
                        </td>
                        <td className="px-3 py-3 text-right">
                          ₹{totals.subtotal.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          ₹{totals.gstTotal.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right text-sm">
                          ₹{totals.grandTotal.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          );
        })()
      ) : (
        <div className="p-12 text-center text-sm text-slate-500">
          Purchase Order details are unavailable.
        </div>
      )}
    </div>
  </div>
)}

  </PageShell>
);
}
