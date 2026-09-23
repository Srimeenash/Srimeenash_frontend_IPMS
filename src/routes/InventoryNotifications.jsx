import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import {
  fetchAuthenticatedJson,
} from "@/api";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/AuthContext";
import { canViewCosting } from "@/permissions";
import { useCostDetails } from "@/components/app/SerialCostDetails";


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

const SUPPORTED_STATUSES = [
  "MANAGER_APPROVED",
  "INVENTORY_PENDING",
  "QC_CHECKED",
  "PROJECT_INVENTORY_READY",
  "INVENTORY_ISSUED",
  "MR_COMPLETED",
];

const ACTIONABLE_STATUSES = [
  "MANAGER_APPROVED",
  "INVENTORY_PENDING",
  "QC_CHECKED",
  "PROJECT_INVENTORY_READY",
];

const toList = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
};

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeStatus = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const normalizeSerials = (value) => {
  const values = Array.isArray(value)
    ? value
    : value == null
      ? []
      : String(value).split(/[,;|\n]/);

  return Array.from(
    new Set(
      values
        .map((serial) => String(serial || "").trim())
        .filter(Boolean),
    ),
  );
};

const getRequestItems = (materialRequest) => {
  const requestType = normalizeStatus(
    materialRequest?.request_type,
  );

  if (requestType === "BOM") {
    return Array.isArray(materialRequest?.bom_items)
      ? materialRequest.bom_items
      : [];
  }

  return Array.isArray(materialRequest?.rd_items)
    ? materialRequest.rd_items
    : Array.isArray(materialRequest?.bom_items)
      ? materialRequest.bom_items
      : [];
};

const addComponentIdentityKey = (keys, candidate) => {
  if (
    candidate === undefined ||
    candidate === null ||
    candidate === "" ||
    typeof candidate === "object"
  ) {
    return;
  }

  const text = normalizeText(candidate);

  if (!text) {
    return;
  }

  /*
   * IMPORTANT:
   * Never split a normal component code such as CMP-1786000723423 on
   * every hyphen. The old code produced the generic key "cmp" for every
   * component, so unrelated rows matched each other and the Provide
   * Components popup duplicated one component while hiding another.
   */
  keys.add(text);

  const compact = text.replace(/[^a-z0-9]/g, "");
  if (compact) {
    keys.add(compact);
  }

  /*
   * Support display values such as "CMP-001 — Propeller" or
   * "CMP-001 - Propeller" without breaking the hyphen inside CMP-001.
   */
  const displayParts = text
    .split(/\s*[—–]\s*|\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (displayParts.length > 1) {
    displayParts.forEach((part) => {
      keys.add(part);

      const compactPart = part.replace(/[^a-z0-9]/g, "");
      if (compactPart) {
        keys.add(compactPart);
      }
    });
  }
};

const getIdentityKeys = (value) => {
  const keys = new Set();

  if (!value || typeof value !== "object") {
    addComponentIdentityKey(keys, value);
    return keys;
  }

  const componentObject =
    value.component_details ||
    value.component_obj ||
    value.component_data ||
    (typeof value.component === "object"
      ? value.component
      : null) ||
    {};

  [
    value.component,
    value.component_id,
    value.componentId,
    value.component_pk,
    value.componentPk,
    value.component_db_id,
    value.component_code,
    value.componentCode,
    value.component_name,
    value.componentName,
    value.name,
    value.code,
    value.label,
    value.product_name,
    value.productName,
    componentObject.id,
    componentObject.pk,
    componentObject.component,
    componentObject.component_id,
    componentObject.componentId,
    componentObject.component_code,
    componentObject.componentCode,
    componentObject.name,
    componentObject.component_name,
    componentObject.componentName,
    componentObject.code,
  ].forEach((candidate) =>
    addComponentIdentityKey(keys, candidate),
  );

  return keys;
};

const rowsMatchComponent = (left, right) => {
  const leftKeys = getIdentityKeys(left);
  const rightKeys = getIdentityKeys(right);

  for (const key of leftKeys) {
    if (rightKeys.has(key)) {
      return true;
    }
  }

  return false;
};

const getProjectRowRequestedQuantity = (row = {}) =>
  Math.max(
    Number(
      row.requested_quantity ??
        row.requestedQuantity ??
        0,
    ) || 0,
    0,
  );

const getProjectRowIssuedQuantity = (row = {}) => {
  const direct = Number(
    row.issued_quantity ??
      row.calculated_issued_quantity,
  );

  if (Number.isFinite(direct)) {
    return Math.max(direct, 0);
  }

  return (
    Math.max(
      Number(row.issued_store_quantity || 0) || 0,
      0,
    ) +
    Math.max(
      Number(
        row.issued_purchased_quantity || 0,
      ) || 0,
      0,
    )
  );
};

const getProjectRowReadyRemainingQuantity = (row = {}) => {
  const explicitStore = Number(
    row.remaining_store_quantity,
  );
  const explicitPurchased = Number(
    row.remaining_purchased_quantity,
  );

  if (
    Number.isFinite(explicitStore) ||
    Number.isFinite(explicitPurchased)
  ) {
    return (
      Math.max(
        Number.isFinite(explicitStore)
          ? explicitStore
          : 0,
        0,
      ) +
      Math.max(
        Number.isFinite(explicitPurchased)
          ? explicitPurchased
          : 0,
        0,
      )
    );
  }

  const storeReady = Math.max(
    Number(row.store_quantity || 0) || 0,
    0,
  );
  const purchasedReady = Math.max(
    Number(row.purchased_quantity || 0) || 0,
    0,
  );
  const issued = getProjectRowIssuedQuantity(row);

  return Math.max(
    storeReady + purchasedReady - issued,
    0,
  );
};

const isProjectRowFulfilled = (row = {}) => {
  if (
    row.is_fulfilled === true ||
    normalizeStatus(row.status) === "ISSUED" ||
    normalizeStatus(row.status) === "COMPLETED"
  ) {
    return true;
  }

  const requested =
    getProjectRowRequestedQuantity(row);

  if (requested <= 0) {
    return false;
  }

  return (
    getProjectRowIssuedQuantity(row) >= requested
  );
};

const getMaterialRequestProjectRows = (
  materialRequest,
  projectInventoryRows,
) => {
  if (!materialRequest) return [];

  const references = new Set(
    [
      materialRequest.id,
      materialRequest.material_request_id,
      materialRequest.request_id,
      materialRequest.mr_id,
      materialRequest.source_mr_number,
    ]
      .filter(
        (value) =>
          value !== undefined &&
          value !== null &&
          String(value).trim() !== "",
      )
      .map((value) =>
        String(value).trim().toUpperCase(),
      ),
  );

  if (!references.size) {
    return [];
  }

  return projectInventoryRows.filter((row) => {
    const rowReferences = [
      row.material_request,
      row.material_request_id,
      row.material_request_number,
      row.source_mr_number,
      row.request_id,
      row.mr_id,
    ]
      .filter(
        (value) =>
          value !== undefined &&
          value !== null &&
          String(value).trim() !== "",
      )
      .map((value) =>
        String(value).trim().toUpperCase(),
      );

    return rowReferences.some((value) =>
      references.has(value),
    );
  });
};

const getMrInventoryLifecycle = (
  materialRequest,
  projectInventoryRows,
) => {
  const rows = getMaterialRequestProjectRows(
    materialRequest,
    projectInventoryRows,
  );

  const allComponentsIssued =
    rows.length > 0 &&
    rows.every(isProjectRowFulfilled);

  const anyIssued = rows.some(
    (row) =>
      getProjectRowIssuedQuantity(row) > 0,
  );

  const readyToIssueQuantity = rows.reduce(
    (total, row) =>
      total +
      Math.min(
        getProjectRowReadyRemainingQuantity(row),
        Math.max(
          getProjectRowRequestedQuantity(row) -
            getProjectRowIssuedQuantity(row),
          0,
        ),
      ),
    0,
  );

  return {
    rows,
    allComponentsIssued,
    anyIssued,
    readyToIssueQuantity,
    hasReadyToIssue:
      readyToIssueQuantity > 0,
  };
};


const getComponentName = (item) => {
  if (typeof item?.component === "object") {
    return (
      item.component.name ||
      item.component.component_name ||
      item.component.component_id ||
      "-"
    );
  }

  return (
    item?.component_name ||
    item?.componentName ||
    item?.name ||
    item?.component_code ||
    item?.component ||
    "-"
  );
};

const getComponentCode = (item) => {
  if (typeof item?.component === "object") {
    return (
      item.component.component_id ||
      item.component.component_code ||
      item.component.id ||
      ""
    );
  }

  return (
    item?.component_code ||
    item?.componentCode ||
    item?.component_id ||
    item?.component ||
    ""
  );
};


const getPoMrReference = (po = {}) =>
  String(
    po.source_mr_number ||
      po.material_request_id ||
      po.request_id ||
      po.mr_number ||
      "",
  ).trim();

const getPoNumber = (po = {}) =>
  po.po_number ||
  po.po ||
  po.purchase_order_number ||
  po.code ||
  (po.id ? `PO-${po.id}` : "-");

const getPoItems = (po = {}) =>
  Array.isArray(po.items)
    ? po.items
    : Array.isArray(po.line_items)
      ? po.line_items
      : [];

const getPoItemUnitPrice = (item = {}) =>
  Number(
    item.unit_price ??
      item.unitPrice ??
      item.price ??
      item.rate ??
      0,
  );

const getPoItemGst = (item = {}) =>
  Number(
    item.gst_percentage ??
      item.gst ??
      item.tax ??
      item.tax_percentage ??
      0,
  );

const getPoItemQuantity = (item = {}) =>
  Number(
    item.quantity ??
      item.qty ??
      item.ordered_quantity ??
      0,
  );

const getPoLineTotal = (item = {}) => {
  const quantity = getPoItemQuantity(item);
  const unitPrice = getPoItemUnitPrice(item);
  const gst = getPoItemGst(item);
  const base = quantity * unitPrice;

  return base + (base * gst) / 100;
};

const getPoTotal = (po = {}) => {
  const directTotal =
    po.grand_total ??
    po.total_amount ??
    po.order_total ??
    po.total ??
    po.net_total;

  if (
    directTotal !== undefined &&
    directTotal !== null &&
    directTotal !== ""
  ) {
    const parsed = Number(directTotal);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return getPoItems(po).reduce(
    (sum, item) => sum + getPoLineTotal(item),
    0,
  );
};

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getMrSnapshotInventoryQuantity = (item = {}) => {
  const rawValue =
    item.creation_inventory_quantity ??
    item.created_inventory_quantity ??
    item.inventory_snapshot_quantity ??
    item.inventory_quantity ??
    item.inventoryQuantity ??
    item.inventory_qty ??
    item.inventoryQty ??
    0;

  const quantity = Number(rawValue);

  return Number.isFinite(quantity)
    ? Math.max(quantity, 0)
    : 0;
};

const getMrReservedStoreQuantity = (item = {}) => {
  const quantity = Number(
    item.reserved_store_quantity ??
      item.reservedStoreQuantity ??
      0,
  );

  return Number.isFinite(quantity)
    ? Math.max(quantity, 0)
    : 0;
};

const getMaterialRequestDroneQuantity = (materialRequest = {}) => {
  /*
   * Material Requests store/display Drone Quantity primarily as
   * required_quantity. Keep compatibility with older field names.
   * An explicit 0 is valid and must display as 0.
   */
  const rawQuantity =
    materialRequest.required_quantity ??
    materialRequest.requiredQuantity ??
    materialRequest.quantity ??
    materialRequest.requested_quantity ??
    materialRequest.requestedQuantity ??
    materialRequest.drone_quantity ??
    materialRequest.droneQuantity ??
    materialRequest.drone_qty ??
    materialRequest.droneQty;

  if (
    rawQuantity === undefined ||
    rawQuantity === null ||
    rawQuantity === ""
  ) {
    return "-";
  }

  const quantity = Number(rawQuantity);

  return Number.isFinite(quantity)
    ? Math.max(quantity, 0)
    : rawQuantity;
};


const getMrRequestedQuantity = (item = {}) => {
  const quantity = Number(
    item.quantity ??
      item.qty ??
      item.required_quantity ??
      item.requested_quantity ??
      0,
  );

  return Number.isFinite(quantity)
    ? Math.max(quantity, 0)
    : 0;
};

const getMrShortageQuantity = (item = {}) => {
  const explicit = Number(
    item.procurement_shortage_quantity ??
      item.shortage_quantity ??
      item.shortageQuantity,
  );

  if (Number.isFinite(explicit)) {
    return Math.max(explicit, 0);
  }

  return Math.max(
    getMrRequestedQuantity(item) -
      getMrSnapshotInventoryQuantity(item),
    0,
  );
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

export default function InventoryNotifications() {
  const { user, activeRole } = useAuth();
  const { openCostDetails, costDetailsPage } =
    useCostDetails();

  const canSeeCosting =
    canViewCosting(
      user,
      activeRole,
    );

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState([]);
  /*
   * Notification-level issue lock. While one Provide Components request
   * is running for an MR notification, no second row/button can send
   * another issue POST.
   */
  const issueLocksRef = useRef(new Set());

  /*
   * Final-issued MR overrides.
   *
   * The Provide Components popup reads ProjectInventory for one MR using a
   * fresh source_mr_number query and can already show every row as Issued
   * 1/1. Immediately afterwards, global refresh events load the broad
   * notification/MR/ProjectInventory lists. If one of those aggregate GETs is
   * a render behind, it must not revert the main row to:
   *
   *   QC Passed / Ready from Store + Provide Components
   *
   * Keep an in-memory completion override until the broad backend reload also
   * confirms the MR as issued/completed.
   */
  const issuedMrOverridesRef = useRef(new Set());

  const getMaterialRequestReferenceKeys = (
    materialRequest = {},
    notification = {},
  ) =>
    Array.from(
      new Set(
        [
          materialRequest?.id,
          materialRequest?.pk,
          materialRequest?.material_request_id,
          materialRequest?.request_id,
          materialRequest?.mr_id,
          notification?.reference_id,
          notification?.referenceId,
        ]
          .filter(
            (value) =>
              value !== undefined &&
              value !== null &&
              String(value).trim() !== "",
          )
          .map((value) =>
            String(value).trim().toUpperCase(),
          ),
      ),
    );

  const markMaterialRequestIssuedOverride = (
    materialRequest = {},
    notification = {},
  ) => {
    getMaterialRequestReferenceKeys(
      materialRequest,
      notification,
    ).forEach((key) =>
      issuedMrOverridesRef.current.add(key),
    );
  };

  const hasMaterialRequestIssuedOverride = (
    materialRequest = {},
    notification = {},
  ) =>
    getMaterialRequestReferenceKeys(
      materialRequest,
      notification,
    ).some((key) =>
      issuedMrOverridesRef.current.has(key),
    );

  const [processingRowKey, setProcessingRowKey] = useState(null);
  const [removingIds, setRemovingIds] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [mrDetailsModal, setMrDetailsModal] = useState({
    open: false,
    loading: false,
    data: null,
    error: "",
  });

  const [poDetailsModal, setPoDetailsModal] = useState({
    open: false,
    loading: false,
    data: null,
    error: "",
  });

  const [provideModal, setProvideModal] = useState({
    open: false,
    notification: null,
    materialRequest: null,
    rows: [],
    loading: false,
    error: "",
  });

  const loadNotifications = useCallback(
    async (
      {
        showLoader = false,
        showError = false,
        forceRefresh = false,
      } = {},
    ) => {
      /*
       * Show the full-page Loading state only for the very first page load.
       * Timer/event refreshes run silently in the background so the table
       * does not keep flashing "Loading..." every few seconds.
       */
      if (showLoader) {
        setLoading(true);
      }

      if (showError) {
        setErrorMessage("");
      }

    try {
      const [
        notificationData,
        mrData,
        purchaseOrderData,
        projectInventoryData,
      ] = await Promise.all([
        fetchAllNotificationPagesShared(
          `/notifications/?receiver=INVENTORY&category=MR&page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
          { cache: "no-store" },
        ),
        fetchAllNotificationPagesShared(
          `/materialrequest/material-requests/?summary=1&page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
          {
            cache: "no-store",
            forceRefresh,
          },
        ),
        fetchAllNotificationPagesShared(
          `/procurement/purchase-orders/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
          {
            cache: "no-store",
            forceRefresh,
          },
        ).catch(() => []),
        fetchAllNotificationPagesShared(
          `/inventory/project-inventory/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
          {
            cache: "no-store",
            forceRefresh,
          },
        ).catch(() => []),
      ]);

      const notificationList =
        toList(notificationData);

      const mrList =
        toList(mrData);

      const purchaseOrderList =
        toList(purchaseOrderData);

      const projectInventoryList =
        toList(projectInventoryData);

      const mrByReference =
        new Map();

      mrList.forEach((materialRequest) => {
        [
          materialRequest.id,
          materialRequest
            .material_request_id,
          materialRequest.request_id,
        ]
          .filter(
            (value) =>
              value !== undefined &&
              value !== null &&
              value !== "",
          )
          .forEach((value) => {
            mrByReference.set(
              String(value),
              materialRequest,
            );
          });
      });

      /*
       * Load actual Inventory notifications first.
       *
       * Older workflow rows may have reached
       * INVENTORY_PENDING without a Notification database row.
       * Therefore the authoritative MaterialRequest status is
       * also used as a fallback below.
       */
      const actualNotifications =
        notificationList
          .filter((notification, index) => {
            return (
              normalizeStatus(
                notification.category,
              ) === "MR" &&
              normalizeStatus(
                notification.receiver,
              ) === "INVENTORY" &&
              SUPPORTED_STATUSES.includes(
                normalizeStatus(
                  notification.status,
                ),
              )
            );
          })
          .map((notification) => {
            const materialRequest =
              mrByReference.get(
                String(
                  notification.reference_id,
                ),
              ) || null;

            const lifecycle =
              getMrInventoryLifecycle(
                materialRequest,
                projectInventoryList,
              );

            const materialRequestStatus =
              normalizeStatus(
                materialRequest?.status ||
                  materialRequest?.workflow_status,
              );

            const materialRequestStatusConfirmsIssued =
              [
                "INVENTORY_ISSUED",
                "MR_COMPLETED",
                "ISSUED",
                "COMPLETED",
              ].includes(
                materialRequestStatus,
              );

            const localIssuedOverride =
              hasMaterialRequestIssuedOverride(
                materialRequest || {},
                notification,
              );

            /*
             * Completion has three valid authoritative signals:
             *
             * 1. every ProjectInventory row is fulfilled;
             * 2. the MaterialRequest workflow itself is already issued;
             * 3. this browser just successfully completed the final issue.
             *
             * Previously only #1 was used. Therefore a broad ProjectInventory
             * refresh that had not yet matched the just-issued rows could
             * restore the persisted notification's QC_CHECKED status and make
             * "Provide Components" appear again.
             */
            const completionConfirmed =
              lifecycle.allComponentsIssued ||
              materialRequestStatusConfirmsIssued ||
              localIssuedOverride;

            const displayStatus =
              completionConfirmed
                ? (
                    materialRequestStatus ===
                    "MR_COMPLETED" ||
                    materialRequestStatus ===
                    "COMPLETED"
                      ? "MR_COMPLETED"
                      : "INVENTORY_ISSUED"
                  )
                : normalizeStatus(
                    notification.status,
                  );

            /*
             * Once the broad backend datasets themselves confirm completion,
             * the local override is no longer needed.
             */
            if (
              lifecycle.allComponentsIssued ||
              materialRequestStatusConfirmsIssued
            ) {
              getMaterialRequestReferenceKeys(
                materialRequest || {},
                notification,
              ).forEach((key) =>
                issuedMrOverridesRef.current.delete(key),
              );
            }

            return {
              ...notification,
              /*
               * ProjectInventory is authoritative for completion.
               * A persisted Inventory notification can still carry
               * INVENTORY_PENDING after the final issue. Never let that
               * stale value turn an already-issued row back into
               * Ready from Store / Provide Components.
               */
              status: displayStatus,
              mr: materialRequest,
              projectInventoryRows:
                lifecycle.rows,
              allComponentsIssued:
                completionConfirmed,
              anyIssued:
                completionConfirmed ||
                lifecycle.anyIssued,
              readyToIssueQuantity:
                lifecycle.readyToIssueQuantity,
              hasReadyToIssue:
                lifecycle.hasReadyToIssue,
              source:
                notification.source ||
                "notification-record",
            };
          })
          .filter(
            (notification) =>
              notification.mr,
          );

      /*
       * A Material Request whose status is INVENTORY_PENDING
       * must always appear for Inventory, even when notification
       * creation failed or an old notification was deleted.
       */
      const inventoryFallbackStatuses = [
        "MANAGER_APPROVED",
        "INVENTORY_PENDING",
        "PARTIALLY_DELIVERED",
        "PO_DELIVERED",
        "QC_CHECKED",
        "PROJECT_INVENTORY_READY",
      ];

      /*
       * IMPORTANT:
       * Once Inventory has started processing an MR, keep that MR in this
       * queue until EVERY ProjectInventory component row is fulfilled.
       *
       * This means a partially-issued MR stays visible even while the next
       * component is still waiting for delivery/QC.
       */
      const fallbackNotifications =
        mrList
          .map((materialRequest) => {
            const workflowStatus =
              normalizeStatus(
                materialRequest.status ||
                  materialRequest.workflow_status,
              );

            const lifecycle =
              getMrInventoryLifecycle(
                materialRequest,
                projectInventoryList,
              );

            const materialRequestAlreadyIssued =
              [
                "INVENTORY_ISSUED",
                "MR_COMPLETED",
                "ISSUED",
                "COMPLETED",
              ].includes(
                workflowStatus,
              ) ||
              hasMaterialRequestIssuedOverride(
                materialRequest,
                {},
              );

            const shouldRemainInInventoryQueue =
              !lifecycle.allComponentsIssued &&
              !materialRequestAlreadyIssued &&
              (
                inventoryFallbackStatuses.includes(
                  workflowStatus,
                ) ||
                lifecycle.anyIssued ||
                lifecycle.hasReadyToIssue
              );

            if (!shouldRemainInInventoryQueue) {
              return null;
            }

            /*
             * Do not create an Inventory fallback merely because the MR is
             * in Procurement. There must be either:
             * - a normal Inventory workflow status,
             * - stock ready to issue, or
             * - quantity already issued from this MR.
             */
            const inventoryWorkflowStarted =
              [
                "MANAGER_APPROVED",
                "INVENTORY_PENDING",
                "QC_CHECKED",
                "PROJECT_INVENTORY_READY",
              ].includes(workflowStatus) ||
              lifecycle.anyIssued ||
              lifecycle.hasReadyToIssue;

            if (!inventoryWorkflowStarted) {
              return null;
            }

            const reference =
              materialRequest.id ??
              materialRequest.material_request_id ??
              materialRequest.request_id;

            const requestLabel =
              materialRequest.material_request_id ||
              materialRequest.request_id ||
              reference ||
              "Material Request";

            const displayStatus =
              lifecycle.hasReadyToIssue
                ? (
                    workflowStatus ===
                      "MANAGER_APPROVED" ||
                    workflowStatus ===
                      "INVENTORY_PENDING"
                      ? "INVENTORY_PENDING"
                      : "PROJECT_INVENTORY_READY"
                  )
                : "INVENTORY_PENDING";

            return {
              id: `inventory-mr-fallback-${String(
                reference || requestLabel,
              )}`,
              category: "MR",
              receiver: "INVENTORY",
              reference_id: reference,
              status: displayStatus,
              is_read: false,
              title:
                lifecycle.hasReadyToIssue
                  ? `INVENTORY ACTION REQUIRED - ${requestLabel}`
                  : `AWAITING REMAINING COMPONENTS - ${requestLabel}`,
              message:
                lifecycle.hasReadyToIssue
                  ? `Material Request ${requestLabel} has component quantities ready to provide.`
                  : `Material Request ${requestLabel} is partially issued. Keep this request open until every requested component is issued.`,
              mr: materialRequest,
              projectInventoryRows:
                lifecycle.rows,
              allComponentsIssued:
                lifecycle.allComponentsIssued,
              anyIssued:
                lifecycle.anyIssued,
              readyToIssueQuantity:
                lifecycle.readyToIssueQuantity,
              hasReadyToIssue:
                lifecycle.hasReadyToIssue,
              source:
                "material-request-fallback",
            };
          })
          .filter(Boolean);

      /*
       * Prefer the real Notification row when both real and
       * fallback records exist for the same Material Request.
       */
      const notificationByMaterialRequest =
        new Map();

      actualNotifications.forEach(
        (notification) => {
          const key = String(
            notification.mr?.id ??
              notification.reference_id ??
              notification.id,
          );

          notificationByMaterialRequest.set(
            key,
            notification,
          );
        },
      );

      fallbackNotifications.forEach(
        (notification) => {
          const key = String(
            notification.mr?.id ??
              notification.reference_id ??
              notification.id,
          );

          if (
            !notificationByMaterialRequest.has(
              key,
            )
          ) {
            notificationByMaterialRequest.set(
              key,
              notification,
            );
          }
        },
      );

      const finalData = Array.from(
        notificationByMaterialRequest.values(),
      )
        .map((notification) => {
          const materialRequest =
            notification.mr || {};

          const mrReferences = new Set(
            [
              materialRequest.material_request_id,
              materialRequest.request_id,
              materialRequest.mr_number,
              materialRequest.id,
            ]
              .filter(
                (value) =>
                  value !== undefined &&
                  value !== null &&
                  value !== "",
              )
              .map((value) =>
                String(value).trim(),
              ),
          );

          const linkedPurchaseOrders =
            purchaseOrderList.filter(
              (purchaseOrder) => {
                const sourceMrReference =
                  getPoMrReference(
                    purchaseOrder,
                  );

                return (
                  sourceMrReference &&
                  mrReferences.has(
                    sourceMrReference,
                  )
                );
              },
            );

          return {
            ...notification,
            purchaseOrders:
              linkedPurchaseOrders,
          };
        })
        .sort((left, right) => {
          const leftDate = new Date(
            left.created_at ||
              left.mr?.created_at ||
              0,
          ).getTime();

          const rightDate = new Date(
            right.created_at ||
              right.mr?.created_at ||
              0,
          ).getTime();

          return rightDate - leftDate;
        });

      console.debug(
        "Inventory notifications:",
        {
          actual:
            actualNotifications.length,
          fallback:
            fallbackNotifications.length,
          displayed: finalData.length,
        },
      );

      setNotifications(finalData);
      } catch (error) {
        console.error(
          "Failed to load Inventory notifications:",
          error,
        );

        /*
         * Do not wipe the already visible table during a silent background
         * refresh failure. Only the initial/manual visible load reports the
         * page-level error.
         */
        if (showError) {
          setErrorMessage(
            error?.message ||
              "Unable to load Inventory notifications.",
          );
        }
      } finally {
        if (showLoader) {
          setLoading(false);
        }
      }
    },
    [],
  );


  useEffect(() => {
    // Initial page entry: show Loading once.
    void loadNotifications({
      showLoader: true,
      showError: true,
    });

    // Timer/events: refresh silently without replacing the page with Loading.
    const reloadNotifications = () => {
      /*
       * Inventory issue events must reconcile against fresh ProjectInventory
       * immediately. Otherwise the 5-second related-list cache can restore
       * the old Ready from Store / Provide Components row.
       */
      invalidateNotificationLoadingCache();

      void loadNotifications({
        showLoader: false,
        showError: false,
        forceRefresh: true,
      });
    };

    const intervalId =
      window.setInterval(
        reloadNotifications,
        60000,
      );

    window.addEventListener(
      "notificationsUpdated",
      reloadNotifications,
    );

    window.addEventListener(
      "inventory:changed",
      reloadNotifications,
    );

    window.addEventListener(
      "materialRequestsUpdated",
      reloadNotifications,
    );

    return () => {
      window.clearInterval(
        intervalId,
      );

      window.removeEventListener(
        "notificationsUpdated",
        reloadNotifications,
      );

      window.removeEventListener(
        "inventory:changed",
        reloadNotifications,
      );

      window.removeEventListener(
        "materialRequestsUpdated",
        reloadNotifications,
      );
    };
  }, [loadNotifications]);



  const openMrDetails = async (notification) => {
    const materialRequest =
      notification?.mr;

    const materialRequestId =
      materialRequest?.id ??
      notification?.reference_id;

    setMrDetailsModal({
      open: true,
      loading: true,
      data: materialRequest || null,
      error: "",
    });

    if (
      materialRequestId === undefined ||
      materialRequestId === null ||
      materialRequestId === ""
    ) {
      setMrDetailsModal((previous) => ({
        ...previous,
        loading: false,
        error:
          "Material Request database ID was not found.",
      }));
      return;
    }

    try {
      const detail =
        await fetchNotificationDetailCached(
          `/materialrequest/material-requests/${encodeURIComponent(
            materialRequestId,
          )}/`,
        );

      setMrDetailsModal({
        open: true,
        loading: false,
        data: detail,
        error: "",
      });
    } catch (error) {
      console.error(
        "Failed to load Material Request details:",
        error,
      );

      setMrDetailsModal((previous) => ({
        ...previous,
        loading: false,
        error:
          error?.message ||
          "Unable to load Material Request details.",
      }));
    }
  };

  const closeMrDetails = () => {
    setMrDetailsModal({
      open: false,
      loading: false,
      data: null,
      error: "",
    });
  };

  const openPoDetails = async (purchaseOrder) => {
    const poId = purchaseOrder?.id;

    setPoDetailsModal({
      open: true,
      loading: true,
      data: purchaseOrder || null,
      error: "",
    });

    if (
      poId === undefined ||
      poId === null ||
      poId === ""
    ) {
      setPoDetailsModal((previous) => ({
        ...previous,
        loading: false,
        error:
          "Purchase Order database ID was not found.",
      }));
      return;
    }

    try {
      const detail =
        await fetchNotificationDetailCached(
          `/procurement/purchase-orders/${encodeURIComponent(
            poId,
          )}/`,
        );

      setPoDetailsModal({
        open: true,
        loading: false,
        data: detail,
        error: "",
      });
    } catch (error) {
      console.error(
        "Failed to load Purchase Order details:",
        error,
      );

      setPoDetailsModal((previous) => ({
        ...previous,
        loading: false,
        error:
          error?.message ||
          "Unable to load Purchase Order details.",
      }));
    }
  };

  const closePoDetails = () => {
    setPoDetailsModal({
      open: false,
      loading: false,
      data: null,
      error: "",
    });
  };


  const loadProvideRows = useCallback(
    async (notification) => {
      const materialRequest = notification?.mr;

      if (!materialRequest) {
        throw new Error(
          "Material Request details were not found.",
        );
      }

      const materialRequestId = materialRequest.id;
      const materialRequestReference =
        materialRequest.material_request_id ||
        materialRequest.id ||
        notification.reference_id;

      const [
        detail,
        projectData,
      ] = await Promise.all([
        fetchNotificationDetailCached(
          `/materialrequest/material-requests/${materialRequestId}/`,
        ),
fetchAuthenticatedJson(
  `/inventory/project-inventory/?source_mr_number=${encodeURIComponent(
    materialRequestReference,
  )}&_=${Date.now()}`,
  {
    cache: "no-store",
  },
).catch(() => []),
      ]);

      const projectRows = toList(projectData);
      const projectRowsWithSerials = await Promise.all(
  projectRows.map(async (projectRow) => {
    const projectRowId =
      projectRow?.id ??
      projectRow?.pk;

    if (!projectRowId) {
      return projectRow;
    }

    try {
      const serialData =
        await fetchAuthenticatedJson(
          `/inventory/project-inventory/${encodeURIComponent(
            projectRowId,
          )}/serial-options/?_=${Date.now()}`,
          {
            cache: "no-store",
          },
        );

      return {
        ...projectRow,
        ...(serialData || {}),
      };
    } catch (error) {
      console.error(
        "Unable to load Project Inventory serial options:",
        projectRowId,
        error,
      );

      return projectRow;
    }
  }),
);
      const requestItems = getRequestItems(detail);
      const routeStatus = normalizeStatus(notification.status);

const sourceRows =
  projectRowsWithSerials.length > 0
    ? projectRowsWithSerials
    : requestItems;

      /*
       * ProjectInventory is one row per MR + component. Keep the popup one
       * row per component as well. This also protects old/legacy data from
       * rendering the same component twice.
       */
      const uniqueSourceRows = [];

      sourceRows.forEach((sourceRow) => {
        const alreadyAdded = uniqueSourceRows.some(
          (existingRow) =>
            rowsMatchComponent(existingRow, sourceRow),
        );

        if (!alreadyAdded) {
          uniqueSourceRows.push(sourceRow);
        }
      });

      const rows = uniqueSourceRows.map((sourceRow, index) => {
        const matchingRequestItems = requestItems.filter(
          (requestItem) =>
            rowsMatchComponent(requestItem, sourceRow),
        );

const matchingProjectRow =
  projectRowsWithSerials.find((projectRow) =>
    rowsMatchComponent(projectRow, sourceRow),
  ) || null;

        const requestItem =
          matchingRequestItems[0] ||
          (
  projectRowsWithSerials.length === 0
    ? sourceRow
    : null
);

        const requestedFromItems = matchingRequestItems.reduce(
          (sum, item) =>
            sum +
            Math.max(
              Number(
                item.quantity ??
                  item.qty ??
                  item.required_quantity ??
                  0,
              ),
              0,
            ),
          0,
        );

        const requestedQuantity = Math.max(
          Number(
            matchingProjectRow?.requested_quantity ??
              sourceRow.requested_quantity ??
              requestedFromItems ??
              requestItem?.quantity ??
              0,
          ),
          0,
        );

        const reservedFromItems = matchingRequestItems.reduce(
          (sum, item) =>
            sum +
            Math.max(
              Number(
                item.reserved_store_quantity ??
                  item.inventory_quantity ??
                  0,
              ),
              0,
            ),
          0,
        );

        const reservedStoreQuantity = Math.max(
          Number(
            matchingProjectRow?.reserved_store_quantity ??
              matchingProjectRow?.store_quantity ??
              sourceRow.reserved_store_quantity ??
              sourceRow.store_quantity ??
              reservedFromItems ??
              0,
          ),
          0,
        );

        const qcPassedFromItems = matchingRequestItems.reduce(
          (sum, item) =>
            sum +
            Math.max(
              Number(
                item.qc_passed_quantity ??
                  item.qcPassedQuantity ??
                  0,
              ),
              0,
            ),
          0,
        );

        const procurementRequirement = Math.max(
          requestedQuantity - reservedStoreQuantity,
          0,
        );

        const purchasedReadyQuantity = Math.min(
          procurementRequirement,
          Math.max(
            Number(
              matchingProjectRow?.purchased_quantity ??
                sourceRow.purchased_quantity ??
                0,
            ),
            qcPassedFromItems,
          ),
        );

        const issuedStoreQuantity = Math.max(
          Number(
            matchingProjectRow?.issued_store_quantity ??
              sourceRow.issued_store_quantity ??
              requestItem?.issued_store_quantity ??
              0,
          ),
          0,
        );

        const issuedPurchasedQuantity = Math.max(
          Number(
            matchingProjectRow?.issued_purchased_quantity ??
              sourceRow.issued_purchased_quantity ??
              0,
          ),
          0,
        );

        const totalIssuedQuantity = Math.min(
          requestedQuantity,
          issuedStoreQuantity + issuedPurchasedQuantity,
        );

        const remainingStoreQuantity = Math.max(
          reservedStoreQuantity - issuedStoreQuantity,
          0,
        );

        const remainingPurchasedQuantity = Math.max(
          purchasedReadyQuantity -
            issuedPurchasedQuantity,
          0,
        );

        const remainingQuantity = Math.max(
          requestedQuantity - totalIssuedQuantity,
          0,
        );

        /*
         * For a mixed Procurement MR, offer QC-passed quantity first.
         * After it is provided and the modal refreshes, the reserved
         * In-Store quantity becomes the next default action.
         */
        const shouldProvidePurchasedFirst =
          [
            "QC_CHECKED",
            "PROJECT_INVENTORY_READY",
          ].includes(routeStatus) &&
          remainingPurchasedQuantity > 0;

        const defaultPurchasedQuantity =
          shouldProvidePurchasedFirst
            ? Math.min(
                remainingPurchasedQuantity,
                remainingQuantity,
              )
            : 0;

        const defaultStoreQuantity =
          !shouldProvidePurchasedFirst
            ? Math.min(
                remainingStoreQuantity,
                remainingQuantity,
              )
            : 0;

        const componentId =
          matchingProjectRow?.component ??
          sourceRow.component ??
          requestItem?.component ??
          requestItem?.component_id ??
          requestItem?.componentId ??
          "";

        const rowIdentity =
          componentId ||
          getComponentCode(matchingProjectRow || sourceRow) ||
          getComponentCode(requestItem) ||
          `component-${index}`;

        return {
          /*
           * id is a UI-only row identifier. It must be unique even if a
           * legacy API response accidentally repeats a database row ID.
           */
          id: `${String(rowIdentity)}::${String(
            matchingProjectRow?.id ??
              sourceRow.id ??
              index,
          )}::${index}`,
          projectRowId:
            matchingProjectRow?.id ??
            sourceRow.id ??
            null,
          componentId,
          componentCode:
            getComponentCode(matchingProjectRow || sourceRow) ||
            getComponentCode(requestItem),
          componentName:
            getComponentName(matchingProjectRow || sourceRow) ||
            getComponentName(requestItem),
          category:
            matchingProjectRow?.category ||
            sourceRow.category ||
            requestItem?.category ||
            "-",
          specification:
            matchingProjectRow?.specifications ||
            matchingProjectRow?.specification ||
            sourceRow.specifications ||
            sourceRow.specification ||
            requestItem?.specification ||
            requestItem?.specifications ||
            "-",
          requestedQuantity,
          reservedStoreQuantity,
          purchasedReadyQuantity,
          issuedStoreQuantity,
          issuedPurchasedQuantity,
          totalIssuedQuantity,
          remainingStoreQuantity,
          remainingPurchasedQuantity,
          remainingQuantity,
          availablePurchasedSerials: normalizeSerials(
            matchingProjectRow?.available_purchased_serials ||
              sourceRow.available_purchased_serials ||
              [],
          ),
          availableStoreSerials: normalizeSerials(
            matchingProjectRow?.available_store_serials ||
              sourceRow.available_store_serials ||
              [],
          ),
          selectedPurchasedSerials: normalizeSerials(
            matchingProjectRow?.available_purchased_serials ||
              sourceRow.available_purchased_serials ||
              [],
          ).slice(0, defaultPurchasedQuantity),
          selectedStoreSerials: normalizeSerials(
            matchingProjectRow?.available_store_serials ||
              sourceRow.available_store_serials ||
              [],
          ).slice(0, defaultStoreQuantity),
          providePurchasedQuantity:
            defaultPurchasedQuantity,
          provideStoreQuantity: defaultStoreQuantity,
          projectStatus: normalizeStatus(
            matchingProjectRow?.status ||
              sourceRow.status,
          ),
        };
      });

      return {
        materialRequest: detail,
        rows,
      };
    },
    [],
  );

  const openProvideComponents = async (notification) => {
    setErrorMessage("");
    setSuccessMessage("");

    setProvideModal({
      open: true,
      notification,
      materialRequest: notification.mr,
      rows: [],
      loading: true,
      error: "",
    });

    try {
      const result = await loadProvideRows(notification);

      setProvideModal((previous) => ({
        ...previous,
        materialRequest: result.materialRequest,
        rows: result.rows,
        loading: false,
        error: "",
      }));
    } catch (error) {
      console.error(
        "Failed to load components for providing:",
        error,
      );

      setProvideModal((previous) => ({
        ...previous,
        loading: false,
        error:
          error?.message ||
          "Unable to load components for this Material Request.",
      }));
    }
  };

  const closeProvideModal = () => {
    setProvideModal({
      open: false,
      notification: null,
      materialRequest: null,
      rows: [],
      loading: false,
      error: "",
    });
  };

  const updateProvideQuantity = (
    rowId,
    field,
    rawValue,
  ) => {
    setProvideModal((previous) => ({
      ...previous,
      rows: previous.rows.map((row) => {
        if (String(row.id) !== String(rowId)) {
          return row;
        }

        const requestedValue = Math.max(
          Number(rawValue || 0),
          0,
        );
        const isPurchased =
          field === "providePurchasedQuantity";
        const maximum = isPurchased
          ? Math.min(
              row.remainingPurchasedQuantity,
              row.remainingQuantity,
              row.availablePurchasedSerials.length,
            )
          : Math.min(
              row.remainingStoreQuantity,
              Math.max(
                row.remainingQuantity -
                  Number(row.providePurchasedQuantity || 0),
                0,
              ),
              row.availableStoreSerials.length,
            );
        const quantity = Math.min(requestedValue, maximum);
        const serialField = isPurchased
          ? "selectedPurchasedSerials"
          : "selectedStoreSerials";
        const availableField = isPurchased
          ? "availablePurchasedSerials"
          : "availableStoreSerials";
        const currentSelected = normalizeSerials(row[serialField])
          .filter((serial) => row[availableField].includes(serial));
        const selected = [...currentSelected];
        for (const serial of row[availableField]) {
          if (selected.length >= quantity) break;
          if (!selected.includes(serial)) selected.push(serial);
        }
        return {
          ...row,
          [field]: quantity,
          [serialField]: selected.slice(0, quantity),
        };
      }),
    }));
  };

  const toggleProvideSerial = (rowId, source, serial) => {
    setProvideModal((previous) => ({
      ...previous,
      rows: previous.rows.map((row) => {
        if (String(row.id) !== String(rowId)) return row;
        const purchased = source === "PURCHASED";
        const selectedField = purchased
          ? "selectedPurchasedSerials"
          : "selectedStoreSerials";
        const quantityField = purchased
          ? "providePurchasedQuantity"
          : "provideStoreQuantity";
        const current = normalizeSerials(row[selectedField]);
        const next = current.includes(serial)
          ? current.filter((item) => item !== serial)
          : [...current, serial];
        const maximum = purchased
          ? Math.min(row.remainingPurchasedQuantity, row.remainingQuantity)
          : Math.min(
              row.remainingStoreQuantity,
              Math.max(
                row.remainingQuantity -
                  Number(row.providePurchasedQuantity || 0),
                0,
              ),
            );
        const limited = next.slice(0, maximum);
        return {
          ...row,
          [selectedField]: limited,
          [quantityField]: limited.length,
        };
      }),
    }));
  };
const setProvideIssueError = (message) => {
  const value = String(
    message || "Unable to provide components.",
  );

  setErrorMessage(value);

  setProvideModal((previous) => ({
    ...previous,
    error: value,
  }));
};
  const syncProjectInventory = async (targetRow = null) => {
    const notification = provideModal.notification;
    const materialRequest =
      provideModal.materialRequest || notification?.mr;

    if (!notification || !materialRequest) {
      return;
    }

    const notificationId = String(notification.id);

    /*
     * React processingIds is visual state. The ref below is the immediate
     * synchronous lock that makes the first click the only click accepted.
     */
    if (issueLocksRef.current.has(notificationId)) {
      return;
    }

    const materialRequestReference =
      materialRequest.material_request_id ||
      materialRequest.id ||
      notification.reference_id;

    const rowsToSubmit = targetRow
      ? [targetRow]
      : provideModal.rows;

    const allocations = rowsToSubmit.flatMap((row) => {
      const componentAllocations = [];

      const purchasedQuantity = Math.max(
        Number(row.providePurchasedQuantity || 0),
        0,
      );

      const storeQuantity = Math.max(
        Number(row.provideStoreQuantity || 0),
        0,
      );

      if (purchasedQuantity > 0) {
        componentAllocations.push({
          component_id: row.componentId,
          source: "PURCHASED",
          quantity: purchasedQuantity,
          serial_numbers: normalizeSerials(
            row.selectedPurchasedSerials,
          ),
        });
      }

      if (storeQuantity > 0) {
        componentAllocations.push({
          component_id: row.componentId,
          source: "STORE",
          quantity: storeQuantity,
          serial_numbers: normalizeSerials(
            row.selectedStoreSerials,
          ),
        });
      }

      return componentAllocations;
    });

    /*
     * There must never be two allocations for the same component/source in
     * one submit. A duplicate here would cause the backend to issue the first
     * allocation and then validate the second against the reduced remainder.
     */
    const allocationKeys = new Set();
    const duplicateAllocation = allocations.find((allocation) => {
      const key = `${String(allocation.component_id)}|${normalizeStatus(
        allocation.source,
      )}`;

      if (allocationKeys.has(key)) {
        return true;
      }

      allocationKeys.add(key);
      return false;
    });

    if (duplicateAllocation) {
      setErrorMessage(
        "The same component source was added more than once. Close and reopen Provide Components, then try again.",
      );
      return;
    }

    const invalidAllocation = allocations.find(
      (allocation) =>
        normalizeSerials(allocation.serial_numbers).length !==
        Number(allocation.quantity || 0),
    );

    if (invalidAllocation) {
      setErrorMessage(
        "Select one serial number for every component quantity being provided.",
      );
      return;
    }

    if (allocations.length === 0) {
      setErrorMessage(
        "Enter at least one quantity from QC Passed or In Store.",
      );
      return;
    }

    /*
     * Calculate the expected final state from the SAME popup rows and
     * allocations the user is confirming.
     *
     * Example:
     *   Remaining before action = 1
     *   Confirmed allocation     = 1
     *   => remaining after action = 0
     *
     * When every popup row reaches zero, the main Inventory Notification
     * can safely switch to Issued / Remove immediately after the backend
     * confirms this POST succeeded, without waiting for a second GET.
     */
    const submittedQuantityByComponent =
      new Map();

    allocations.forEach((allocation) => {
      const key =
        String(
          allocation?.component_id ??
            "",
        ).trim();

      if (!key) {
        return;
      }

      submittedQuantityByComponent.set(
        key,
        (
          submittedQuantityByComponent.get(
            key,
          ) || 0
        ) +
          Math.max(
            Number(
              allocation?.quantity ||
                0,
            ),
            0,
          ),
      );
    });

    const allFulfilledAfterThisIssue =
      provideModal.rows.length > 0 &&
      provideModal.rows.every((row) => {
        const componentKey =
          String(
            row?.componentId ??
              "",
          ).trim();

        const submittedQuantity =
          submittedQuantityByComponent.get(
            componentKey,
          ) || 0;

        const remainingBeforeAction =
          Math.max(
            Number(
              row?.remainingQuantity ??
                Math.max(
                  Number(
                    row?.requestedQuantity ||
                      0,
                  ) -
                    Number(
                      row?.totalIssuedQuantity ||
                        0,
                    ),
                  0,
                ),
            ) || 0,
            0,
          );

        return (
          Math.max(
            remainingBeforeAction -
              submittedQuantity,
            0,
          ) === 0
        );
      });

    issueLocksRef.current.add(notificationId);

    setProcessingIds((previous) => [
      ...new Set([...previous, notificationId]),
    ]);
    setProcessingRowKey(
      targetRow ? String(targetRow.id) : null,
    );

    setErrorMessage("");
    setSuccessMessage("");

    try {
      const responseData =
        await fetchAuthenticatedJson(
          "/inventory/project-inventory/sync-mr/",
          {
            method: "POST",
            body: JSON.stringify({
              material_request_id:
                materialRequestReference,
              allocations,
            }),
          },
        );

      const updatedStatus = normalizeStatus(
        responseData?.mr_status,
      );

      const backendAllFulfilled =
        responseData?.all_fulfilled === true;

      /*
       * The backend flag is preferred, but some endpoint responses can report
       * the previous aggregate state even though this exact successful issue
       * consumed the final remaining quantity. The popup calculation above
       * already knows the final result of the confirmed allocation.
       */
      const allFulfilled =
        backendAllFulfilled ||
        allFulfilledAfterThisIssue;

      /*
       * IMPORTANT - IMMEDIATE FINAL MR UI UPDATE
       *
       * The sync-mr endpoint already tells us, in this same response, when
       * every ProjectInventory component for this MR is fulfilled.
       *
       * Do not wait for the notification / Material Request /
       * ProjectInventory background reload before changing the table.
       * Those related lists have a small cache and previously caused the
       * final "Provide Components" / "Waiting for Remaining" action to stay
       * visible for a few seconds after the last component was issued.
       *
       * As soon as the backend confirms all_fulfilled, update the current
       * notification row locally so:
       *   Status -> Issued
       *   Action -> Remove
       *
       * The normal background reload below still runs and reconciles the row
       * with the authoritative backend state.
       */
      const finalIssuedStatus =
        allFulfilled
          ? (
              updatedStatus === "MR_COMPLETED"
                ? "MR_COMPLETED"
                : "INVENTORY_ISSUED"
            )
          : updatedStatus;

      /*
       * Confirm that every STORE allocation was physically deducted
       * by the backend before showing an issued/success state.
       *
       * The backend response must report issued_store_quantity in
       * issue_summary for each STORE allocation.
       */
      const requestedStoreQuantity =
        allocations.reduce(
          (total, allocation) =>
            normalizeStatus(allocation.source) === "STORE"
              ? total + Math.max(
                  Number(allocation.quantity || 0),
                  0,
                )
              : total,
          0,
        );

      const issueSummary = Array.isArray(
        responseData?.issue_summary,
      )
        ? responseData.issue_summary
        : [];

      const deductedStoreQuantity =
        issueSummary.reduce(
          (total, item) =>
            total +
            Math.max(
              Number(
                item?.issued_store_quantity || 0,
              ),
              0,
            ),
          0,
        );

      if (
        requestedStoreQuantity > 0 &&
        deductedStoreQuantity <
          requestedStoreQuantity
      ) {
        throw new Error(
          `In-Store deduction failed. Requested ${requestedStoreQuantity}, ` +
            `but the backend deducted only ${deductedStoreQuantity}.`,
        );
      }

      /*
       * Only expose the final Issued / Remove state after the physical Store
       * deduction validation above has succeeded.
       */
      if (allFulfilled) {
        /*
         * Set this BEFORE dispatching any refresh event. The event handlers can
         * start loadNotifications() immediately, so the completion override
         * must already exist before those GET responses can update React state.
         */
        markMaterialRequestIssuedOverride(
          materialRequest,
          notification,
        );

        invalidateNotificationLoadingCache();

        setNotifications((previous) =>
          previous.map((item) => {
            const sameNotification =
              String(item?.id ?? "") ===
              String(notification?.id ?? "");

            const itemMrReferences =
              new Set(
                [
                  item?.mr?.id,
                  item?.mr?.material_request_id,
                  item?.mr?.request_id,
                  item?.reference_id,
                ]
                  .filter(
                    (value) =>
                      value !== undefined &&
                      value !== null &&
                      String(value).trim() !== "",
                  )
                  .map((value) =>
                    String(value).trim(),
                  ),
              );

            const currentMrReferences =
              [
                materialRequest?.id,
                materialRequest?.material_request_id,
                materialRequest?.request_id,
                notification?.reference_id,
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

            const sameMaterialRequest =
              currentMrReferences.some(
                (reference) =>
                  itemMrReferences.has(reference),
              );

            if (!sameNotification && !sameMaterialRequest) {
              return item;
            }

            return {
              ...item,
              status: finalIssuedStatus,
              allComponentsIssued: true,
              anyIssued: true,
              readyToIssueQuantity: 0,
              hasReadyToIssue: false,
              mr: {
                ...(item?.mr || {}),
                ...(materialRequest || {}),
                status: finalIssuedStatus,
                workflow_status: finalIssuedStatus,
              },
            };
          }),
        );
      }

      window.dispatchEvent(
        new CustomEvent("inventory:changed", {
          detail: {
            type:
              deductedStoreQuantity > 0
                ? "storeIssued"
                : "projectInventory",
            materialRequestId:
              materialRequest.material_request_id,
            requestedStoreQuantity,
            deductedStoreQuantity,
          },
        }),
      );

      window.dispatchEvent(
        new Event("notificationsUpdated"),
      );

      window.dispatchEvent(
        new Event("materialRequestsUpdated"),
      );

      if (allFulfilled) {
        setSuccessMessage(
          `${materialRequest.material_request_id}: all components are issued. Status is now Issued and the Inventory Notification action is immediately available as Remove.`,
        );
      } else {
        setSuccessMessage(
          `${materialRequest.material_request_id}: this component was issued successfully. Remaining component quantities are still available separately.`,
        );
      }

      /*
       * Keep the popup open after every row-level issue.
       * The refreshed row becomes disabled when it is fully issued, while
       * the remaining component rows stay independently actionable.
       */
      const refreshed = await loadProvideRows({
        ...notification,
        status:
          finalIssuedStatus ||
          notification.status,
        mr: {
          ...(notification.mr || {}),
          ...materialRequest,
          status:
            finalIssuedStatus ||
            materialRequest.status,
        },
      });

      /*
       * loadProvideRows uses the fresh per-MR ProjectInventory endpoint.
       * If every refreshed popup row is now Issued X/X (remaining = 0), that
       * is definitive proof that this MR is complete even when the aggregate
       * sync response or broad list reload was briefly stale.
       */
      const refreshedRowsAllIssued =
        Array.isArray(refreshed?.rows) &&
        refreshed.rows.length > 0 &&
        refreshed.rows.every((row) =>
          Math.max(
            Number(
              row?.remainingQuantity ??
                Math.max(
                  Number(row?.requestedQuantity || 0) -
                    Number(row?.totalIssuedQuantity || 0),
                  0,
                ),
            ) || 0,
            0,
          ) === 0
        );

      if (refreshedRowsAllIssued) {
        markMaterialRequestIssuedOverride(
          refreshed.materialRequest ||
            materialRequest,
          notification,
        );

        setNotifications((previous) =>
          previous.map((item) => {
            const itemKeys =
              getMaterialRequestReferenceKeys(
                item?.mr || {},
                item,
              );

            const completedKeys =
              new Set(
                getMaterialRequestReferenceKeys(
                  refreshed.materialRequest ||
                    materialRequest,
                  notification,
                ),
              );

            const sameMr =
              itemKeys.some((key) =>
                completedKeys.has(key),
              );

            if (!sameMr) {
              return item;
            }

            return {
              ...item,
              status: "INVENTORY_ISSUED",
              allComponentsIssued: true,
              anyIssued: true,
              readyToIssueQuantity: 0,
              hasReadyToIssue: false,
              mr: {
                ...(item?.mr || {}),
                ...(refreshed.materialRequest ||
                  materialRequest ||
                  {}),
                status: "INVENTORY_ISSUED",
                workflow_status:
                  "INVENTORY_ISSUED",
              },
            };
          }),
        );

        setSuccessMessage(
          `${materialRequest.material_request_id}: all components are issued. Status is Issued and the action is Remove.`,
        );
      }

      setProvideModal((previous) => ({
        ...previous,
        materialRequest: refreshed.materialRequest,
        rows: refreshed.rows,
        loading: false,
        error: "",
      }));

    } catch (error) {
      console.error(
        "Failed to provide components:",
        error,
      );

      setErrorMessage(
        error?.message ||
          "Unable to provide components.",
      );
    } finally {
      issueLocksRef.current.delete(notificationId);

      setProcessingIds((previous) =>
        previous.filter(
          (id) => id !== notificationId,
        ),
      );
      setProcessingRowKey(null);
    }
  };

  const removeNotification = async (notification) => {
    const notificationId = String(notification.id);

    setRemovingIds((previous) => [
      ...new Set([...previous, notificationId]),
    ]);

    setErrorMessage("");
    setSuccessMessage("");

    try {
      await fetchAuthenticatedJson(
        `/notifications/${notification.id}/`,
        {
          method: "DELETE",
        },
      );

      setNotifications((previous) =>
        previous.filter(
          (item) =>
            String(item.id) !== notificationId,
        ),
      );

      setSuccessMessage(
        `${notification.mr?.material_request_id || "MR"} notification removed.`,
      );

      window.dispatchEvent(
        new Event("notificationsUpdated"),
      );
    } catch (error) {
      console.error(
        "Failed to remove Inventory notification:",
        error,
      );

      setErrorMessage(
        error?.message ||
          "Unable to remove this notification.",
      );
    } finally {
      setRemovingIds((previous) =>
        previous.filter(
          (id) => id !== notificationId,
        ),
      );
    }
  };

  const getStatusBadge = (status) => {
    const value = normalizeStatus(status);

    if (
      value === "MANAGER_APPROVED" ||
      value === "INVENTORY_PENDING"
    ) {
      return (
        <span className="inline-flex px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
          Ready from Store
        </span>
      );
    }

    if (
      value === "QC_CHECKED" ||
      value === "PROJECT_INVENTORY_READY"
    ) {
      return (
        <span className="inline-flex px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-sm font-medium">
          QC Passed
        </span>
      );
    }

    if (value === "INVENTORY_ISSUED") {
      return (
        <span className="inline-flex px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">
          Issued
        </span>
      );
    }

    if (value === "MR_COMPLETED") {
      return (
        <span className="inline-flex px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
          MR Completed
        </span>
      );
    }

    return (
      <span className="inline-flex px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-sm">
        {value || "Unknown"}
      </span>
    );
  };

  const getNotificationDisplayStatus = (
    notification,
  ) => {
    const currentStatus =
      normalizeStatus(
        notification?.status,
      );

    const mrStatus =
      normalizeStatus(
        notification?.mr?.status ||
          notification?.mr?.workflow_status,
      );

    const attachedRows =
      Array.isArray(
        notification?.projectInventoryRows,
      )
        ? notification.projectInventoryRows
        : [];

    const completed =
      notification?.allComponentsIssued === true ||
      (
        attachedRows.length > 0 &&
        attachedRows.every(
          isProjectRowFulfilled,
        )
      ) ||
      [
        "INVENTORY_ISSUED",
        "MR_COMPLETED",
        "ISSUED",
        "COMPLETED",
      ].includes(mrStatus) ||
      hasMaterialRequestIssuedOverride(
        notification?.mr || {},
        notification || {},
      );

    if (!completed) {
      return currentStatus;
    }

    return (
      mrStatus === "MR_COMPLETED" ||
      mrStatus === "COMPLETED"
        ? "MR_COMPLETED"
        : "INVENTORY_ISSUED"
    );
  };

  const renderAction = (notification) => {
    const status = normalizeStatus(notification.status);
    const notificationId = String(notification.id);

    const attachedProjectRows =
      Array.isArray(
        notification?.projectInventoryRows,
      )
        ? notification.projectInventoryRows
        : [];

    const attachedRowsAllIssued =
      attachedProjectRows.length > 0 &&
      attachedProjectRows.every(
        isProjectRowFulfilled,
      );

    const materialRequestStatus =
      normalizeStatus(
        notification?.mr?.status ||
          notification?.mr?.workflow_status,
      );

    const completedForAction =
      notification.allComponentsIssued === true ||
      attachedRowsAllIssued ||
      [
        "INVENTORY_ISSUED",
        "MR_COMPLETED",
        "ISSUED",
        "COMPLETED",
      ].includes(materialRequestStatus) ||
      hasMaterialRequestIssuedOverride(
        notification?.mr || {},
        notification,
      );

    const isProcessing =
      processingIds.includes(notificationId);

    /*
     * After every component is issued, keep the completed notification
     * visible until the Inventory user explicitly removes only the
     * notification record from this page.
     */
    if (
      completedForAction ||
      status === "INVENTORY_ISSUED" ||
      status === "MR_COMPLETED"
    ) {
      const isRemoving =
        removingIds.includes(notificationId);

      return (
        <button
          type="button"
          disabled={isRemoving}
          onClick={() =>
            removeNotification(notification)
          }
          className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed text-white text-sm font-medium"
        >
          {isRemoving ? "Removing..." : "Remove"}
        </button>
      );
    }

    if (
      ACTIONABLE_STATUSES.includes(status) &&
      notification.hasReadyToIssue !== false
    ) {
      return (
        <button
          type="button"
          disabled={isProcessing}
          onClick={() =>
            openProvideComponents(notification)
          }
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white text-sm font-medium"
        >
          {isProcessing
            ? "Providing..."
            : "Provide Components"}
        </button>
      );
    }

    if (
      notification.anyIssued === true &&
      notification.hasReadyToIssue === false
    ) {
      return (
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => {
            console.debug(
              "Opening remaining component details:",
              notification?.mr?.material_request_id ||
                notification?.reference_id ||
                notification?.id,
            );
            openProvideComponents(notification);
          }}
          className="inline-flex items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
          title="View issued and remaining components"
        >
          {isProcessing
            ? "Opening..."
            : "Waiting for Remaining"}
        </button>
      );
    }

    return (
      <span className="text-sm text-slate-500">
        -
      </span>
    );
  };

  const modalTotals = useMemo(() => {
    return provideModal.rows.reduce(
      (result, row) => {
        result.requested += Number(
          row.requestedQuantity || 0,
        );

        result.issued += Number(
          row.totalIssuedQuantity || 0,
        );

        result.providePurchased += Number(
          row.providePurchasedQuantity || 0,
        );

        result.provideStore += Number(
          row.provideStoreQuantity || 0,
        );

        result.remaining += Number(
          row.remainingQuantity || 0,
        );

        return result;
      },
      {
        requested: 0,
        issued: 0,
        providePurchased: 0,
        provideStore: 0,
        remaining: 0,
      },
    );
  }, [provideModal.rows]);

  if (costDetailsPage) {
    return costDetailsPage;
  }

  return (
    <PageShell>
      <PageHeader
        title="Inventory Notifications"
        subtitle="Provide approved and QC-passed components for each Material Request"
      />

      {/* Notification count tab */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-primary bg-primary/10 px-5 py-2 text-sm font-semibold text-primary"
        >
          MR ({notifications.length})
        </button>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="min-w-[1500px]">
          <div
            className="grid items-center border-b border-slate-200 bg-slate-100 px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            style={{
              gridTemplateColumns: canSeeCosting
                ? "repeat(12, minmax(0, 1fr))"
                : "repeat(11, minmax(0, 1fr))",
            }}
          >
            <div className="text-center">
              S.No
            </div>
            <div className="text-center">
              MR ID
            </div>
            <div className="text-center">
              PO ID
            </div>
            <div className="text-center">
              Requester
            </div>
            <div className="text-center">
              Created Date
            </div>
            <div className="text-center">
              Project
            </div>
            <div className="text-center">
              Request Type
            </div>
            <div className="text-center">
              Drone Qty
            </div>
            <div className="text-center">
              Required Date
            </div>
            {canSeeCosting && (
              <div className="text-center">
                Cost Details
              </div>
            )}
            <div className="text-center">
              Status
            </div>
            <div className="text-center">
              Action
            </div>
          </div>

          {loading ? (
            <NotificationTableLoader
              title="Loading Inventory notifications..."
              subtitle="Fetching the latest inventory request and workflow details."
            />
          ) : notifications.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No Inventory Notifications
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {notifications.map(
                (notification) => {
                  const materialRequest =
                    notification.mr || {};

                  const linkedPurchaseOrders =
                    Array.isArray(
                      notification.purchaseOrders,
                    )
                      ? notification.purchaseOrders
                      : [];

                  return (
                    <div
                      key={notification.id}
                      className="grid items-center px-5 py-4 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900/70"
                      style={{
                        gridTemplateColumns: canSeeCosting
                          ? "repeat(12, minmax(0, 1fr))"
                          : "repeat(11, minmax(0, 1fr))",
                      }}
                    >
                      <div className="px-2 text-center font-semibold">{index + 1}</div>
                      <div className="flex justify-center px-2">
                        <button
                          type="button"
                          onClick={() =>
                            openMrDetails(
                              notification,
                            )
                          }
                          className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {materialRequest.material_request_id ||
                            materialRequest.request_id ||
                            materialRequest.id ||
                            "-"}
                        </button>
                      </div>

                      <div className="flex min-h-[36px] flex-col items-center justify-center gap-1 px-2">
                        {linkedPurchaseOrders.length >
                        0 ? (
                          linkedPurchaseOrders.map(
                            (purchaseOrder) => (
                              <button
                                type="button"
                                key={
                                  purchaseOrder.id ||
                                  getPoNumber(
                                    purchaseOrder,
                                  )
                                }
                                onClick={() =>
                                  openPoDetails(
                                    purchaseOrder,
                                  )
                                }
                                className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                              >
                                {getPoNumber(
                                  purchaseOrder,
                                )}
                              </button>
                            ),
                          )
                        ) : (
                          <span className="font-medium text-slate-400">
                            No PO
                          </span>
                        )}
                      </div>

                      <div className="px-2 text-center">
                        {materialRequest.requester_name ||
                          materialRequest.requester ||
                          "-"}
                      </div>

                      <div className="px-2 text-center">
                        {materialRequest.created_date ||
                          materialRequest.date ||
                          materialRequest.created_at
                            ?.slice?.(0, 10) ||
                          "-"}
                      </div>

                      <div className="px-2 text-center">
                        {materialRequest.project_name ||
                          materialRequest.project ||
                          "-"}
                      </div>

                      <div className="px-2 text-center font-medium">
                        {materialRequest.request_type ||
                          "-"}
                      </div>

                      <div className="px-2 text-center font-semibold">
                        {getMaterialRequestDroneQuantity(
                          materialRequest,
                        )}
                      </div>

                      <div className="px-2 text-center">
                        {materialRequest.required_date ||
                          "-"}
                      </div>

                      {canSeeCosting && (
                        <div className="flex justify-center px-2">
                          <button
                            type="button"
                            className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10"
                            onClick={() =>
                              openCostDetails(
                                "materialRequest",
                                {
                                  ...materialRequest,
                                  backendId:
                                    materialRequest.id ??
                                    materialRequest.pk ??
                                    materialRequest.material_request_id,
                                },
                              )
                            }
                          >
                            View Details
                          </button>
                        </div>
                      )}

                      <div className="flex justify-center px-2">
                        {getStatusBadge(
                          getNotificationDisplayStatus(
                            notification,
                          ),
                        )}
                      </div>

                      <div className="flex justify-center px-2">
                        {renderAction(
                          notification,
                        )}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </div>
      </div>

      {mrDetailsModal.open && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Material Request Details
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Complete Material Request information used by Inventory.
                </p>
              </div>

              <button
                type="button"
                onClick={closeMrDetails}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto p-6">
              {mrDetailsModal.loading ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Loading Material Request details...
                </div>
              ) : mrDetailsModal.error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {mrDetailsModal.error}
                </div>
              ) : (
                <>
                  {(() => {
                    const mr =
                      mrDetailsModal.data || {};

                    const mrItems =
                      getRequestItems(mr);

                    const totalRequested =
                      mrItems.reduce(
                        (sum, item) =>
                          sum +
                          getMrRequestedQuantity(
                            item,
                          ),
                        0,
                      );

                    const totalSnapshot =
                      mrItems.reduce(
                        (sum, item) =>
                          sum +
                          getMrSnapshotInventoryQuantity(
                            item,
                          ),
                        0,
                      );

                    const totalShortage =
                      mrItems.reduce(
                        (sum, item) =>
                          sum +
                          getMrShortageQuantity(
                            item,
                          ),
                        0,
                      );

                    return (
                      <>
                        <div className="grid gap-4 md:grid-cols-4">
                          {[
                            [
                              "MR ID",
                              mr.material_request_id ||
                                mr.request_id ||
                                mr.id ||
                                "-",
                            ],
                            [
                              "Requester",
                              mr.requester_name ||
                                mr.requester ||
                                "-",
                            ],
                            [
                              "Project",
                              mr.project_name ||
                                mr.project ||
                                "-",
                            ],
                            [
                              "Request Type",
                              mr.request_type ||
                                "-",
                            ],
                            [
                              "Drone Qty",
                              getMaterialRequestDroneQuantity(
                                mr,
                              ),
                            ],
                            [
                              "Created Date",
                              mr.created_date ||
                                mr.date ||
                                mr.created_at
                                  ?.slice?.(
                                    0,
                                    10,
                                  ) ||
                                "-",
                            ],
                            [
                              "Required Date",
                              mr.required_date ||
                                "-",
                            ],
                            [
                              "Status",
                              mr.status ||
                                mr.workflow_status ||
                                mr.approval_status ||
                                "-",
                            ],
                          ].map(
                            ([label, value]) => (
                              <div
                                key={label}
                                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900"
                              >
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  {label}
                                </div>
                                <div className="mt-2 break-words text-sm font-semibold text-slate-900 dark:text-white">
                                  {String(
                                    value,
                                  )}
                                </div>
                              </div>
                            ),
                          )}
                        </div>

                        <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Remarks
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                            {mr.remarks ||
                              mr.remark ||
                              "-"}
                          </div>
                        </div>

                        <div className="mt-6 grid gap-4 sm:grid-cols-3">
                          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                            <div className="text-xs font-semibold uppercase text-blue-600">
                              Requested
                            </div>
                            <div className="mt-1 text-2xl font-bold text-blue-900">
                              {totalRequested}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                            <div className="text-xs font-semibold uppercase text-emerald-600">
                              Inventory at MR Creation
                            </div>
                            <div className="mt-1 text-2xl font-bold text-emerald-900">
                              {totalSnapshot}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                            <div className="text-xs font-semibold uppercase text-amber-600">
                              Procurement Shortage
                            </div>
                            <div className="mt-1 text-2xl font-bold text-amber-900">
                              {totalShortage}
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                          <table className="w-full min-w-[1000px] text-sm">
                            <thead className="bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                              <tr>
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
                                  Requested
                                </th>
                                <th className="px-4 py-3 text-center">
                                  Inventory at MR Creation
                                </th>
                                <th className="px-4 py-3 text-center">
                                  Reserved Store
                                </th>
                                <th className="px-4 py-3 text-center">
                                  Shortage
                                </th>
                              </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {mrItems.length >
                              0 ? (
                                mrItems.map(
                                  (
                                    item,
                                    index,
                                  ) => (
                                    <tr
                                      key={
                                        item.id ||
                                        `${getComponentCode(
                                          item,
                                        )}-${index}`
                                      }
                                    >
                                      <td className="px-4 py-3 font-medium">
                                        {getComponentCode(
                                          item,
                                        )
                                          ? `${getComponentCode(
                                              item,
                                            )} — `
                                          : ""}
                                        {getComponentName(
                                          item,
                                        )}
                                      </td>
                                      <td className="px-4 py-3">
                                        {item.category ||
                                          item.category_name ||
                                          "-"}
                                      </td>
                                      <td className="px-4 py-3">
                                        {item.specification ||
                                          item.specifications ||
                                          "-"}
                                      </td>
                                      <td className="px-4 py-3 text-center font-semibold">
                                        {getMrRequestedQuantity(
                                          item,
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        {getMrSnapshotInventoryQuantity(
                                          item,
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        {getMrReservedStoreQuantity(
                                          item,
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        {getMrShortageQuantity(
                                          item,
                                        )}
                                      </td>
                                    </tr>
                                  ),
                                )
                              ) : (
                                <tr>
                                  <td
                                    colSpan={7}
                                    className="px-4 py-10 text-center text-slate-500"
                                  >
                                    No Material Request component rows were found.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {poDetailsModal.open && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Purchase Order Details
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Complete procurement information for this Purchase Order.
                </p>
              </div>

              <button
                type="button"
                onClick={closePoDetails}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto p-6">
              {poDetailsModal.loading ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Loading Purchase Order details...
                </div>
              ) : poDetailsModal.error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {poDetailsModal.error}
                </div>
              ) : (
                <>
                  {(() => {
                    const po =
                      poDetailsModal.data || {};

                    const items =
                      getPoItems(po);

                    const totalQuantity =
                      items.reduce(
                        (sum, item) =>
                          sum +
                          getPoItemQuantity(
                            item,
                          ),
                        0,
                      );

                    return (
                      <>
                        <div className="grid gap-4 md:grid-cols-4">
                          {[
                            [
                              "PO Number",
                              getPoNumber(po),
                            ],
                            [
                              "MR ID",
                              getPoMrReference(
                                po,
                              ) || "Direct PO",
                            ],
                            [
                              "Vendor",
                              po.vendor_name ||
                                po.vendor?.name ||
                                po.vendor ||
                                "-",
                            ],
                            [
                              "Status",
                              po.status || "-",
                            ],
                            [
                              "Approval Status",
                              po.approval_status ||
                                "-",
                            ],
                            [
                              "PO Date",
                              po.po_date ||
                                po.date ||
                                "-",
                            ],
                            [
                              "Expected Delivery",
                              po.expected_delivery_date ||
                                po.expected_date ||
                                "-",
                            ],
                            [
                              "Total Qty",
                              totalQuantity,
                            ],
                          ].map(
                            ([label, value]) => (
                              <div
                                key={label}
                                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900"
                              >
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  {label}
                                </div>
                                <div className="mt-2 break-words text-sm font-semibold text-slate-900 dark:text-white">
                                  {String(
                                    value,
                                  )}
                                </div>
                              </div>
                            ),
                          )}
                        </div>

                        {canSeeCosting && (
                          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                              PO Grand Total
                            </div>
                            <div className="mt-1 text-3xl font-bold text-emerald-900">
                              ₹
                              {formatCurrency(
                                getPoTotal(po),
                              )}
                            </div>
                          </div>
                        )}

                        {(po.remarks ||
                          po.remark ||
                          po.notes) && (
                          <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Remarks
                            </div>
                            <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                              {po.remarks ||
                                po.remark ||
                                po.notes}
                            </div>
                          </div>
                        )}

                        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                          <table className="w-full min-w-[900px] text-sm">
                            <thead className="bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                              <tr>
                                <th className="px-4 py-3 text-left">
                                  Component
                                </th>
                                <th className="px-4 py-3 text-center">
                                  Qty
                                </th>
                                {canSeeCosting && (
                                  <>
                                    <th className="px-4 py-3 text-right">
                                      Unit Price
                                    </th>
                                    <th className="px-4 py-3 text-center">
                                      GST %
                                    </th>
                                    <th className="px-4 py-3 text-right">
                                      Line Total
                                    </th>
                                  </>
                                )}
                              </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {items.length > 0 ? (
                                items.map(
                                  (
                                    item,
                                    index,
                                  ) => (
                                    <tr
                                      key={
                                        item.id ||
                                        index
                                      }
                                    >
                                      <td className="px-4 py-3 font-medium">
                                        {getComponentName(
                                          item,
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-center font-semibold">
                                        {getPoItemQuantity(
                                          item,
                                        )}
                                      </td>
                                      {canSeeCosting && (
                                        <>
                                          <td className="px-4 py-3 text-right">
                                            ₹
                                            {formatCurrency(
                                              getPoItemUnitPrice(
                                                item,
                                              ),
                                            )}
                                          </td>
                                          <td className="px-4 py-3 text-center">
                                            {getPoItemGst(
                                              item,
                                            ).toFixed(
                                              2,
                                            )}
                                            %
                                          </td>
                                          <td className="px-4 py-3 text-right font-semibold">
                                            ₹
                                            {formatCurrency(
                                              getPoLineTotal(
                                                item,
                                              ),
                                            )}
                                          </td>
                                        </>
                                      )}
                                    </tr>
                                  ),
                                )
                              ) : (
                                <tr>
                                  <td
                                    colSpan={canSeeCosting ? 5 : 2}
                                    className="px-4 py-10 text-center text-slate-500"
                                  >
                                    No Purchase Order line items were found.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {provideModal.open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4 border-b px-6 py-5 dark:border-slate-800">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Provide Components
                </h2>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {provideModal.materialRequest?.material_request_id ||
                    "-"}{" "}
                  —{" "}
                  Reserved In-Store and QC-passed component sources
                </p>
              </div>

              <button
                type="button"
                onClick={closeProvideModal}
                className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            {provideModal.error && (
              <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {provideModal.error}
              </div>
            )}

            {successMessage && (
              <div className="mx-6 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMessage}
              </div>
            )}

            <div className="max-h-[62vh] overflow-auto p-6">
              {provideModal.loading ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Loading component quantities...
                </div>
              ) : provideModal.rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  No component rows were found for this Material Request.
                </div>
              ) : (
                <table className="w-full min-w-[1450px] text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      <th className="border p-3 text-left">
                        Component
                      </th>
                      <th className="border p-3 text-center">
                        Requested
                      </th>
                      <th className="border p-3 text-center">
                        Reserved In Store
                      </th>
                      <th className="border p-3 text-center">
                        QC Ready
                      </th>

                      <th className="border p-3 text-center">
                        Provide QC
                      </th>
                      <th className="border p-3 text-center">
                        Provide In Store
                      </th>
                      <th className="border p-3 text-center">
                        Result
                      </th>
                      <th className="border p-3 text-center">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {provideModal.rows.map((row) => {
                      const proposedPurchased = Number(
                        row.providePurchasedQuantity || 0,
                      );

                      const proposedStore = Number(
                        row.provideStoreQuantity || 0,
                      );

                      const proposedTotal =
                        proposedPurchased + proposedStore;

                      const finalIssued =
                        row.totalIssuedQuantity +
                        proposedTotal;

                      const alreadyIssued =
                        row.remainingQuantity <= 0 ||
                        row.totalIssuedQuantity >=
                          row.requestedQuantity;

                      const willFulfill =
                        !alreadyIssued &&
                        proposedTotal > 0 &&
                        finalIssued >=
                          row.requestedQuantity;

                      const hasPartialIssue =
                        !alreadyIssued &&
                        (row.totalIssuedQuantity > 0 ||
                          proposedTotal > 0);

                      const notificationProcessing =
                        processingIds.includes(
                          String(
                            provideModal.notification?.id,
                          ),
                        );

                      const isRowProcessing =
                        processingRowKey ===
                        String(row.id);

                      const rowLocked =
                        alreadyIssued ||
                        notificationProcessing;

                      return (
                        <tr
                          key={row.id}
                          className={
                            alreadyIssued
                              ? "bg-emerald-50/60 dark:bg-emerald-950/10"
                              : ""
                          }
                        >
                          <td className="border p-3">
                            <div className="font-medium text-slate-900 dark:text-white">
                              {row.componentName}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {row.componentCode || "-"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {row.specification || "-"}
                            </div>
                          </td>

                          <td className="border p-3 text-center">
                            {row.requestedQuantity}
                          </td>

                          <td className="border p-3 text-center">
                            {row.reservedStoreQuantity}
                          </td>

                          <td className="border p-3 text-center">
                            {row.purchasedReadyQuantity}
                          </td>



                          <td className="border p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max={Math.min(
                                row.remainingPurchasedQuantity,
                                row.remainingQuantity,
                              )}
                              value={
                                row.providePurchasedQuantity
                              }
                              disabled={
                                rowLocked ||
                                row.remainingPurchasedQuantity <= 0 ||
                                row.remainingQuantity <= 0
                              }
                              onChange={(event) =>
                                updateProvideQuantity(
                                  row.id,
                                  "providePurchasedQuantity",
                                  event.target.value,
                                )
                              }
                              className="w-24 rounded-lg border px-3 py-2 text-center disabled:cursor-not-allowed disabled:bg-slate-100"
                            />
                            <div className="mt-1 text-[11px] text-slate-500">
                              Available:{" "}
                              {row.remainingPurchasedQuantity}
                            </div>
                            <details className="mt-2 text-left">
                              <summary className="cursor-pointer text-xs font-medium text-blue-600">
                                QC serials ({row.selectedPurchasedSerials.length} selected)
                              </summary>
                              <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-lg border p-2">
                                {row.availablePurchasedSerials.length ? (
                                  row.availablePurchasedSerials.map((serial) => (
                                    <label key={serial} className="flex items-center gap-2 text-xs">
                                      <input
                                        type="checkbox"
                                        checked={row.selectedPurchasedSerials.includes(serial)}
                                        disabled={
                                          rowLocked ||
                                          row.remainingPurchasedQuantity <= 0
                                        }
                                        onChange={() => toggleProvideSerial(row.id, "PURCHASED", serial)}
                                      />
                                      <span className="break-all">{serial}</span>
                                    </label>
                                  ))
                                ) : (
                                  <span className="text-xs text-red-600">No QC serials available.</span>
                                )}
                              </div>
                            </details>
                          </td>

                          <td className="border p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max={Math.min(
                                row.remainingStoreQuantity,
                                Math.max(
                                  row.remainingQuantity -
                                    proposedPurchased,
                                  0,
                                ),
                              )}
                              value={row.provideStoreQuantity}
                              disabled={
                                rowLocked ||
                                row.remainingStoreQuantity <= 0 ||
                                row.remainingQuantity <= 0
                              }
                              onChange={(event) =>
                                updateProvideQuantity(
                                  row.id,
                                  "provideStoreQuantity",
                                  event.target.value,
                                )
                              }
                              className="w-24 rounded-lg border px-3 py-2 text-center disabled:cursor-not-allowed disabled:bg-slate-100"
                            />
                            <div className="mt-1 text-[11px] text-slate-500">
                              Reserved left:{" "}
                              {row.remainingStoreQuantity}
                            </div>
                            <details className="mt-2 text-left">
                              <summary className="cursor-pointer text-xs font-medium text-blue-600">
                                In-Store serials ({row.selectedStoreSerials.length} selected)
                              </summary>
                              <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-lg border p-2">
                                {row.availableStoreSerials.length ? (
                                  row.availableStoreSerials.map((serial) => (
                                    <label key={serial} className="flex items-center gap-2 text-xs">
                                      <input
                                        type="checkbox"
                                        checked={row.selectedStoreSerials.includes(serial)}
                                        disabled={
                                          rowLocked ||
                                          row.remainingStoreQuantity <= 0
                                        }
                                        onChange={() => toggleProvideSerial(row.id, "STORE", serial)}
                                      />
                                      <span className="break-all">{serial}</span>
                                    </label>
                                  ))
                                ) : (
                                  <span className="text-xs text-red-600">No In-Store serials available.</span>
                                )}
                              </div>
                            </details>
                          </td>

                          <td className="border p-3 text-center">
                            <span
                              className={
                                alreadyIssued
                                  ? "inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"
                                  : willFulfill
                                    ? "inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700"
                                    : hasPartialIssue
                                      ? "inline-flex rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700"
                                      : "inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                              }
                            >
                              {alreadyIssued
                                ? "Issued"
                                : willFulfill
                                  ? "Ready to Complete"
                                  : hasPartialIssue
                                    ? "Partial Issue"
                                    : "Pending"}
                            </span>

                            {row.totalIssuedQuantity > 0 && (
                              <div className="mt-1 text-[11px] text-slate-500">
                                Issued:{" "}
                                {row.totalIssuedQuantity}
                                {" / "}
                                {row.requestedQuantity}
                              </div>
                            )}
                          </td>

                          <td className="border p-3 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                syncProjectInventory(row)
                              }
                              disabled={
                                rowLocked ||
                                proposedTotal <= 0
                              }
                              className={
                                alreadyIssued
                                  ? "min-w-[120px] rounded-lg bg-emerald-100 px-4 py-2 text-xs font-semibold text-emerald-700 cursor-not-allowed"
                                  : "min-w-[120px] rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                              }
                            >
                              {alreadyIssued
                                ? "Issued"
                                : isRowProcessing
                                  ? "Issuing..."
                                  : "Confirm & Issue"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t px-6 py-5 dark:border-slate-800">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Requested:{" "}
                <strong>{modalTotals.requested}</strong>
                {" · "}
                Already Issued:{" "}
                <strong>{modalTotals.issued}</strong>
                {" · "}
                Provide QC:{" "}
                <strong>
                  {modalTotals.providePurchased}
                </strong>
                {" · "}
                Provide In Store:{" "}
                <strong>{modalTotals.provideStore}</strong>
                {" · "}
                Remaining Before Action:{" "}
                <strong>{modalTotals.remaining}</strong>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeProvideModal}
                  disabled={
                    processingIds.includes(
                      String(
                        provideModal.notification?.id,
                      ),
                    )
                  }
                  className="rounded-lg border px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}