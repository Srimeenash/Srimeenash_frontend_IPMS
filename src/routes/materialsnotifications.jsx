import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { StatusBadge } from "@/components/app/DataTable";
import config from "@/config";
import {
  fetchAuthenticatedJson,
} from "@/api";
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

export default function MaterialsNotificationsPage() {
  const {
  user,
  activeRole,
} = useAuth();

const role = useMemo(
  () =>
    String(
      activeRole ||
        user?.active_role ||
        user?.activeRole ||
        user?.role?.name ||
        user?.role ||
        user?.designation ||
        user?.department ||
        ""
    )
      .trim()
      .toLowerCase(),
  [user, activeRole]
);

  /*
   * Accept role values such as:
   * Procurement, PROCUREMENT, Procurement User,
   * Procurement Manager, or a nested role.name.
   */
  const isProcurement =
    role.includes("procurement");

  const isManager =
    !isProcurement &&
    role.includes("manager");

  const isAdmin =
    role.includes("admin");
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("MR");
  const [qcFailedNotifications, setQcFailedNotifications] = useState([]);
  const [qcProcessingId, setQcProcessingId] = useState(null);

  /*
   * QC Failed Procurement actions need a synchronous lock.
   * React state is asynchronous, so a fast second click can otherwise send
   * the same Restore / Replacement / Refund approval twice before the button
   * re-renders as disabled.
   */
  const qcActionLocksRef = useRef(new Set());

  const beginQcAction = (key) => {
    const value = String(key ?? "").trim();

    if (
      !value ||
      qcActionLocksRef.current.has(value)
    ) {
      return false;
    }

    qcActionLocksRef.current.add(value);
    setQcProcessingId(value);
    return true;
  };

  const endQcAction = (key) => {
    const value = String(key ?? "").trim();

    if (value) {
      qcActionLocksRef.current.delete(value);
    }

    setQcProcessingId((current) =>
      String(current ?? "") === value
        ? null
        : current,
    );
  };
  const [componentsMap, setComponentsMap] = useState({});
  const [componentsNormMap, setComponentsNormMap] = useState({});
  const [liveInventoryCounts, setLiveInventoryCounts] = useState({});
  const [showBomModal, setShowBomModal] = useState(false);
  const [bomDetails, setBomDetails] = useState(null);
  const [modalType, setModalType] = useState(null); // "BOM" | "RD"
  const [rdDetails, setRdDetails] = useState(null);
  const [hiddenIds, setHiddenIds] = useState([]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [activeRejectNotification, setActiveRejectNotification] = useState(null);
  const [pendingRejectStatus, setPendingRejectStatus] = useState("");
  const [showPoConfirmModal, setShowPoConfirmModal] = useState(false);
  const [selectedPoRequest, setSelectedPoRequest] = useState(null);
  const [showCreatePoModal, setShowCreatePoModal] = useState(false);
  const [poSubmitting, setPoSubmitting] = useState(false);

  /*
   * When 2 or more selected MR components use the same vendor,
   * Procurement must explicitly choose whether to create:
   *
   *   - one combined PO for that vendor, or
   *   - separate POs for each component/allocation.
   *
   * Nothing is created until the user makes this choice.
   */
  const [
    sameVendorPoChoice,
    setSameVendorPoChoice,
  ] = useState(null);
  const decisionLocksRef = useRef(new Set());
  const [processingDecisionIds, setProcessingDecisionIds] = useState([]);

  const beginDecision = (key) => {
    const value = String(key ?? "");
    if (!value || decisionLocksRef.current.has(value)) {
      return false;
    }

    decisionLocksRef.current.add(value);
    setProcessingDecisionIds((previous) =>
      previous.includes(value)
        ? previous
        : [...previous, value],
    );
    return true;
  };

  const endDecision = (key) => {
    const value = String(key ?? "");
    decisionLocksRef.current.delete(value);
    setProcessingDecisionIds((previous) =>
      previous.filter((item) => item !== value),
    );
  };

  const isDecisionProcessing = (key) =>
    processingDecisionIds.includes(String(key ?? ""));
  const [vendors, setVendors] = useState([]);
  const [poComponents, setPoComponents] = useState([]);

  /*
   * Existing POs are used to calculate what is STILL pending
   * for each Procurement MR component.
   */
  const [
    existingPurchaseOrders,
    setExistingPurchaseOrders,
  ] = useState([]);

const [poForm, setPoForm] = useState({
  items: [],
});
  const removeNotification = (id) => {
    const cleanId = String(id);

    setHiddenIds((prev) => {
      if (prev.includes(cleanId)) return prev;

      const updated = [...prev, cleanId];
      localStorage.setItem(
        `materialsNotificationsHidden:${role || "unknown"}`,
        JSON.stringify(updated)
      );
      return updated;
    });

    setNotifications((prev) =>
      prev.filter((n) => String(n.id || n.material_request_id) !== cleanId)
    );
  };

  useEffect(() => {
    let saved = [];

    try {
      saved = JSON.parse(
        localStorage.getItem(
          `materialsNotificationsHidden:${role || "unknown"}`
        ) || "[]"
      );
    } catch (err) {
      saved = [];
    }

    if (Array.isArray(saved)) {
      setHiddenIds(saved.map(String));
    }
  }, [role]);

const calculateTotals = (items) => {
  const totalPrice = items.reduce((s, i) => s + Number(i.price || 0), 0);

  const totalGST = items.reduce(
    (s, i) => s + (Number(i.price || 0) * Number(i.tax || 0)) / 100,
    0
  );

  return {
    totalPrice,
    totalGST,
    grandTotal: totalPrice + totalGST,
  };
};

const normalizeInventoryKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const addInventoryKeys = (
  keySet,
  value,
  visitedObjects = new WeakSet(),
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return;
  }

  /*
   * Component serializers may contain nested or circular objects,
   * for example component.component pointing back to the same object.
   * Do not visit the same object twice.
   */
  if (
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    if (visitedObjects.has(value)) {
      return;
    }

    visitedObjects.add(value);

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
      value.product_name,
      value.productName,
    ].forEach((candidate) =>
      addInventoryKeys(
        keySet,
        candidate,
        visitedObjects,
      ),
    );

    return;
  }

  const textValue =
    String(value).trim();

  if (!textValue) {
    return;
  }

  const normalized =
    normalizeInventoryKey(
      textValue,
    );

  if (normalized) {
    keySet.add(normalized);
  }

  const compact =
    normalized.replace(
      /[^a-z0-9]/g,
      "",
    );

  if (compact) {
    keySet.add(compact);
  }

  const parts = textValue
    .split(/\s*[—–-]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  /*
   * Recurse only when a compound value actually produced multiple
   * different parts.
   *
   * Old behaviour:
   *   "propeller" -> ["propeller"] -> recurse with "propeller"
   *   forever, causing Maximum call stack size exceeded.
   */
  if (parts.length > 1) {
    parts.forEach((part) => {
      if (
        normalizeInventoryKey(part) ===
        normalized
      ) {
        return;
      }

      addInventoryKeys(
        keySet,
        part,
        visitedObjects,
      );
    });
  }
};

const getInventoryKeys = (item = {}) => {
  const keys = new Set();
  const visitedObjects =
    new WeakSet();

  [
    item.component,
    item.component_pk,
    item.component_db_id,
    item.component_id,
    item.componentId,
    item.component_code,
    item.componentCode,
    item.component_name,
    item.componentName,
    item.code,
    item.name,
    item.label,
    item.component_details,
    item.component_obj,
    item.component_data,
  ].forEach((value) =>
    addInventoryKeys(
      keys,
      value,
      visitedObjects,
    ),
  );

  return Array.from(keys);
};

const getLiveInventoryQuantity = (
  item,
  counts = liveInventoryCounts,
) => {
  for (const key of getInventoryKeys(item)) {
    if (
      Object.prototype.hasOwnProperty.call(
        counts,
        key,
      )
    ) {
      const quantity = Number(
        counts[key],
      );

      return Number.isFinite(quantity)
        ? Math.max(quantity, 0)
        : 0;
    }
  }

  /*
   * Use the saved value only as a fallback. New and approved MRs should
   * normally match liveInventoryCounts.
   */
  const savedQuantity = Number(
    item?.reserved_store_quantity ??
      item?.inventory_quantity ??
      item?.inventoryQty ??
      0,
  );

  return Number.isFinite(savedQuantity)
    ? Math.max(savedQuantity, 0)
    : 0;
};

/*
 * Manager MR/BOM Details must show the Inventory Qty snapshot that was
 * saved inside the Material Request item when the MR was created.
 *
 * Do not use the current live Inventory here. Current stock may change after
 * the MR is created because of new Inward, Sales, Event or other stock moves.
 * An explicit saved value of 0 is valid and must remain 0.
 */
const getMrCreatedInventoryQuantity = (item = {}) => {
  const candidates = [
    item.inventory_quantity,
    item.inventoryQuantity,
    item.inventory_qty,
    item.inventoryQty,
  ];

  for (const candidate of candidates) {
    if (
      candidate === undefined ||
      candidate === null ||
      candidate === ""
    ) {
      continue;
    }

    const quantity = Number(candidate);

    return Number.isFinite(quantity)
      ? Math.max(quantity, 0)
      : 0;
  }

  return 0;
};

const loadLiveInventoryCounts = async () => {
  try {
    const [
      inventoryData,
      componentData,
    ] = await Promise.all([
      fetchAllNotificationPagesShared(
        `/inventory/inventory/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
        { cache: "no-store" },
      ),
      fetchAllNotificationPagesShared(
        `/components/components/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
        { cache: "no-store" },
      ).catch(() => []),
    ]);

    const inventoryRows = Array.isArray(inventoryData)
      ? inventoryData
      : inventoryData?.results ||
        inventoryData?.items ||
        inventoryData?.data ||
        [];

    const componentRows = Array.isArray(componentData)
      ? componentData
      : componentData?.results ||
        componentData?.items ||
        componentData?.data ||
        [];

    const componentsByKey = new Map();

    componentRows.forEach((component) => {
      getInventoryKeys(component).forEach((key) => {
        componentsByKey.set(key, component);
      });
    });

    const counts = {};

    inventoryRows.forEach((inventoryRow) => {
      if (
        inventoryRow.issued === true ||
        inventoryRow.issued === 1
      ) {
        return;
      }

      const quantity = Number(
        inventoryRow.available_quantity ??
          inventoryRow.remaining_quantity ??
          inventoryRow.in_store_quantity ??
          inventoryRow.stock_quantity ??
          inventoryRow.quantity ??
          inventoryRow.qty ??
          0,
      );

      if (
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        return;
      }

      const keys = new Set(
        getInventoryKeys(inventoryRow),
      );

      for (const key of Array.from(keys)) {
        const component =
          componentsByKey.get(key);

        if (component) {
          getInventoryKeys(component).forEach(
            (componentKey) =>
              keys.add(componentKey),
          );
        }
      }

      keys.forEach((key) => {
        counts[key] =
          Number(counts[key] || 0) +
          quantity;
      });
    });

    setLiveInventoryCounts(counts);
    return counts;
  } catch (error) {
    console.error(
      "Failed to load live Inventory quantities:",
      error,
    );

    setLiveInventoryCounts({});
    return {};
  }
};

/*
 * FROM-SCRAP PROCUREMENT RULE
 * ---------------------------
 *
 * A generated _PR/_FR Material Request clones the complete source BOM/R&D
 * structure, but GOOD/reusable serials are already fulfilled from Scrap.
 * Those serials are stored on the cloned component row as:
 *
 *   FROM_SCRAP_SERIALS:SERIAL-1|SERIAL-2
 *
 * Procurement must never treat those recovered units as a new shortage.
 *
 * Example:
 *   Source component qty = 1
 *   FROM_SCRAP_SERIALS = one GOOD serial
 *   => Routing required qty = 0
 *   => component must NOT appear in Procurement / Raise PO.
 *
 * If no recovered serial exists for that component:
 *   Source component qty = 1
 *   => Routing required qty = 1
 *   => In Store first, then Procurement only for the remaining shortage.
 */

const splitFromScrapSerials = (value) => {
  if (Array.isArray(value)) {
    return value
      .flatMap(splitFromScrapSerials)
      .filter(Boolean);
  }

  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return [];
  }

  return String(value)
    .split(/[|,;\n]/)
    .map((serial) => serial.trim())
    .filter(Boolean);
};

const getFromScrapRecoveredSerials = (
  item = {}
) => {
  const direct = [
    item?.from_scrap_serial_numbers,
    item?.fromScrapSerialNumbers,
    item?.recovered_serial_numbers,
    item?.recoveredSerialNumbers,
    item?.scrap_serial_numbers,
  ]
    .flatMap(splitFromScrapSerials)
    .filter(Boolean);

  if (direct.length) {
    return Array.from(new Set(direct));
  }

  const remarks = String(
    item?.remarks ||
      item?.remark ||
      item?.notes ||
      ""
  );

  const match = remarks.match(
    /FROM_SCRAP_SERIALS:([^\r\n]*)/i
  );

  if (!match) {
    return [];
  }

  return Array.from(
    new Set(
      splitFromScrapSerials(
        match[1]
      )
    )
  );
};

const getMaterialRequestItems = (
  request = {}
) =>
  [
    request?.bom_items,
    request?.custom_bom_items,
    request?.rd_items,
    request?.request_items,
    request?.items,
  ]
    .filter(Array.isArray)
    .flat()
    .filter(Boolean);

const isFromScrapProcurementRequest = (
  request = {}
) => {
  const mrNumber = String(
    request?.material_request_id ||
      request?.request_id ||
      request?.mr_number ||
      ""
  )
    .trim()
    .toUpperCase();

  const requestRemarks = String(
    request?.remarks || ""
  ).toUpperCase();

  const itemRemarks =
    getMaterialRequestItems(request)
      .map((item) =>
        String(item?.remarks || "")
      )
      .join("\n")
      .toUpperCase();

  return (
    mrNumber.endsWith("_PR") ||
    mrNumber.endsWith("_FR") ||
    requestRemarks.includes(
      "FROM SCRAP"
    ) ||
    itemRemarks.includes(
      "FROM_SCRAP_SERIALS:"
    ) ||
    itemRemarks.includes(
      "SOURCE_SCRAP:"
    )
  );
};

const getFromScrapRoutingQuantity = (
  item = {}
) => {
  const sourceRequestedQuantity =
    Math.max(
      Number(
        item?.quantity ??
          item?.qty ??
          item?.requested_quantity ??
          item?.required_quantity ??
          0
      ) || 0,
      0
    );

  const recoveredSerials =
    getFromScrapRecoveredSerials(
      item
    );

  return {
    sourceRequestedQuantity,
    recoveredSerials,
    recoveredQuantity:
      recoveredSerials.length,
    routingRequiredQuantity:
      Math.max(
        sourceRequestedQuantity -
          recoveredSerials.length,
        0
      ),
  };
};

const getRequestShortageRows = (
  request,
  counts = liveInventoryCounts,
) => {
  const itemSources = [
    request?.bom_items,
    request?.custom_bom_items,
    request?.rd_items,
    request?.request_items,
    request?.items,
  ];
  const seenComponents = new Set();
  const items = itemSources
    .filter(Array.isArray)
    .flat()
    .filter((item) => {
      const key = [
        item?.component_id,
        item?.component_code,
        item?.component,
        item?.component_name,
        item?.name,
      ]
        .filter((value) => value !== undefined && value !== null && String(value).trim())
        .map((value) => String(value).trim().toLowerCase())
        .join("|");

      if (!key || seenComponents.has(key)) return false;
      seenComponents.add(key);
      return true;
    });

  return items
    .map((item) => {
      const sourceRequestedQty =
        Math.max(
          Number(
            item.quantity ??
              item.qty ??
              item.requested_quantity ??
              item.required_quantity ??
              0
          ) || 0,
          0
        );

      const fromScrap =
        isFromScrapProcurementRequest(
          request
        );

      const fromScrapRouting =
        fromScrap
          ? getFromScrapRoutingQuantity(
              item
            )
          : {
              sourceRequestedQuantity:
                sourceRequestedQty,
              recoveredSerials: [],
              recoveredQuantity: 0,
              routingRequiredQuantity:
                sourceRequestedQty,
            };

      /*
       * For normal MRs this is the original requested qty.
       * For From-Scrap _PR/_FR this is:
       *
       *   source qty - GOOD/reusable recovered serials
       *
       * Therefore fully recovered GOOD components become zero here and are
       * automatically excluded from Procurement.
       */
      const requestedQty =
        fromScrapRouting
          .routingRequiredQuantity;

      const rawSavedShortage =
        item.procurement_shortage_quantity ??
        item.procurementShortageQuantity ??
        item.shortage_quantity ??
        item.shortageQuantity;

      const rawReservedStore =
        item.reserved_store_quantity ??
        item.reservedStoreQuantity ??
        item.inventory_quantity ??
        item.inventoryQuantity ??
        item.inventory_qty ??
        item.inventoryQty;

      const hasSavedShortageValue =
        rawSavedShortage !== undefined &&
        rawSavedShortage !== null &&
        rawSavedShortage !== "";

      const hasReservedStoreValue =
        rawReservedStore !== undefined &&
        rawReservedStore !== null &&
        rawReservedStore !== "";

      const savedShortage =
        Number(rawSavedShortage);

      const savedReservedStore =
        Number(rawReservedStore);

      /*
       * Procurement shortage must be resolved carefully.
       *
       * Some MR serializer rows return procurement_shortage_quantity = 0
       * even when the actual reservation/snapshot shows that only part of
       * the requested quantity is available. Treating that zero as final
       * incorrectly hides a newly-routed Procurement MR from this page.
       *
       * Priority:
       * 1. A positive saved Procurement shortage is authoritative.
       * 2. Otherwise use the saved reserved / MR-creation Inventory qty.
       * 3. Only if neither exists, fall back to current live Inventory.
       */
      let inventoryQty = 0;
      let shortageQty = 0;

      if (
        fromScrap &&
        requestedQty <= 0
      ) {
        /*
         * Fully recovered from GOOD Scrap serials.
         * Ignore any stale shortage/reservation snapshot left on an older
         * cloned MR row. This component requires neither Store nor PO.
         */
        inventoryQty = 0;
        shortageQty = 0;
      } else if (
        hasSavedShortageValue &&
        Number.isFinite(savedShortage) &&
        savedShortage > 0
      ) {
        shortageQty =
          Math.max(
            savedShortage,
            0
          );

        inventoryQty =
          Math.max(
            requestedQty -
              shortageQty,
            0
          );
      } else if (
        hasReservedStoreValue &&
        Number.isFinite(
          savedReservedStore
        )
      ) {
        inventoryQty =
          Math.min(
            Math.max(
              savedReservedStore,
              0
            ),
            requestedQty
          );

        shortageQty =
          Math.max(
            requestedQty -
              inventoryQty,
            0
          );
      } else {
        inventoryQty =
          getLiveInventoryQuantity(
            item,
            counts,
          );

        shortageQty =
          Math.max(
            requestedQty -
              inventoryQty,
            0
          );
      }

      const compCodeRaw =
        item.component_code ||
        item.code ||
        item.component_code_raw ||
        item.component_id ||
        item.componentId ||
        item.component ||
        "";

      const details =
        item.component_details ||
        item.component_obj ||
        item.component_data ||
        item.componentInfo ||
        item.component_info ||
        null;

      const lookupKey = String(
        item.component_code ||
          item.code ||
          item.component_id ||
          item.component ||
          "",
      );

      let compName =
        item.component_name ||
        item.componentName ||
        item.product_name ||
        item.productName ||
        item.name ||
        (details &&
          (
            details.component_name ||
            details.name ||
            details.product_name
          )) ||
        "";

      if (!compName) {
        compName =
          componentsMap[lookupKey] ||
          componentsMap[`CMP-${lookupKey}`] ||
          componentsNormMap[
            lookupKey
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "")
          ] ||
          "";
      }

      const displayCode = compCodeRaw
        ? (
            String(compCodeRaw).startsWith("CMP-")
              ? String(compCodeRaw)
              : `CMP-${compCodeRaw}`
          )
        : "";

      const componentDisplay = compName
        ? (
            displayCode
              ? `${displayCode} - ${compName}`
              : compName
          )
        : displayCode || "Unknown component";

      return {
        component_pk:
          item.component_pk ??
          item.component_db_id ??
          details?.id ??
          (
            typeof item.component === "object"
              ? item.component?.id
              : item.component
          ),
        component_code: compCodeRaw,
        component_name: compName,
        component_display: componentDisplay,
        category:
          item.category ||
          item.category_name ||
          item.component_category ||
          "",
        /*
         * requestedQty is intentionally the quantity still requiring normal
         * routing, not the full source-BOM quantity, for From-Scrap MRs.
         */
        requestedQty,
        sourceRequestedQty,
        recoveredFromScrapQty:
          fromScrapRouting
            .recoveredQuantity,
        recoveredFromScrapSerials:
          fromScrapRouting
            .recoveredSerials,
        isFromScrap: fromScrap,
        inventoryQty,
        shortageQty,
      };
    })
    .filter(
      (row) =>
        row.shortageQty > 0,
    );
};


const handleRdClick = async (id) => {
  try {
    const data = await fetchNotificationDetailCached(
      `/materialrequest/material-requests/${encodeURIComponent(
        id,
      )}/`,
      {
        cache: "no-store",
      },
    );

    setRdDetails(data);
    setBomDetails(null);
    setModalType("RD");
    setShowBomModal(true);
  } catch (err) {
    console.error("Failed to load R&D details", err);
  }
};
const clearProcurementBellNotifications = async (request) => {
  const requestReferences = new Set(
    [
      request?.id,
      request?.material_request_id,
      request?.request_id,
    ]
      .filter((value) => value !== undefined && value !== null && value !== "")
      .map(String)
  );

  try {
    const list =
      await fetchAllNotificationPagesShared(
        `/notifications/?receiver=PROCUREMENT&category=MR&page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
        {
          cache: "no-store",
        },
      );

    const matchingNotifications = list.filter((notification) => {
      const receiver = String(notification.receiver || "")
        .trim()
        .toUpperCase();

      const category = String(notification.category || "")
        .trim()
        .toUpperCase();

      const referenceId = String(notification.reference_id ?? "");

      const isUnread =
        notification.is_read === false ||
        notification.is_read === 0 ||
        String(notification.is_read ?? "").toLowerCase() === "false";

      return (
        receiver === "PROCUREMENT" &&
        category === "MR" &&
        isUnread &&
        requestReferences.has(referenceId)
      );
    });

    await Promise.all(
      matchingNotifications.map((notification) =>
        fetchAuthenticatedJson(
          `/notifications/${encodeURIComponent(
            notification.id
          )}/`,
          {
            method: "PATCH",
            body: JSON.stringify({
              is_read: true,
            }),
          },
        )
      )
    );

    window.dispatchEvent(
      new CustomEvent("notificationsUpdated", {
        detail: {
          receiver: "PROCUREMENT",
          reason: "MR_PO_RAISED",
        },
      })
    );

    return true;
  } catch (err) {
    console.error("Failed to clear procurement notification", err);
    return false;
  }
};
const getQcFailedRowQuantity = (rows = []) =>
  (Array.isArray(rows) ? rows : []).reduce(
    (sum, row) => {
      const raw = Number(
        row?.qty ??
          row?.quantity ??
          row?.failed_quantity ??
          1,
      );

      return (
        sum +
        (
          Number.isFinite(raw) &&
          raw > 0
            ? raw
            : 1
        )
      );
    },
    0,
  );

const getQcFailedComponentLabel = (
  payload = {},
) => {
  const code = String(
    payload?.component_code ||
      payload?.componentCode ||
      payload?.component
        ?.component_id ||
      "",
  ).trim();

  const name = String(
    payload?.component_name ||
      payload?.componentName ||
      payload?.component?.name ||
      payload?.product_name ||
      payload?.productName ||
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

const hydrateQcFailedNotification = async (
  notification,
) => {
  const reference = String(
    notification?.reference_id ||
      notification?.referenceId ||
      "",
  ).trim();

  if (!reference) {
    return {
      ...notification,
      sourceType: "",
      sourceId: "",
      componentLabel: "-",
      failedQty: 0,
      mrNumber: "-",
      poNumber: "-",
    };
  }

  if (
    reference
      .toUpperCase()
      .startsWith(
        "INWARD_REFUND:"
      )
  ) {
    const inwardId =
      reference.split(
        ":",
        2,
      )[1];

    const inward =
      await fetchNotificationDetailCached(
        `/inward/${encodeURIComponent(
          inwardId,
        )}/`,
        {
          cache: "no-store",
        },
      ).catch(() => null);

    const failedRows =
      inward?.failedRows ||
      inward?.qc_failed_rows ||
      inward?.failed_rows ||
      [];

    const firstFailed =
      Array.isArray(
        failedRows,
      )
        ? failedRows.find(
            (row) =>
              row &&
              typeof row ===
                "object",
          ) || {}
        : {};

    return {
      ...notification,
      sourceType:
        "DIRECT_REFUND",
      sourceId:
        inwardId,
      sourcePayload:
        inward,
      requestLabel:
        "Refund",
      componentLabel:
        getQcFailedComponentLabel(
          inward || {},
        ),
      failedQty:
        getQcFailedRowQuantity(
          failedRows,
        ),
      mrNumber:
        "Direct PO",
      poNumber:
        String(
          inward
            ?.purchase_order_number ||
            inward?.po_number ||
            "",
        ).trim() ||
        "-",
      refundAmount:
        Number(
          firstFailed
            ?.refund_total ||
            0,
        ),
      status:
        String(
          notification?.status ||
            firstFailed
              ?.refund_status ||
            "PENDING_PROCUREMENT",
        )
          .trim()
          .toUpperCase(),
    };
  }

  if (
    reference
      .toUpperCase()
      .startsWith("INWARD:")
  ) {
    const inwardId =
      reference.split(":", 2)[1];

    const inward =
      await fetchNotificationDetailCached(
        `/inward/${encodeURIComponent(
          inwardId,
        )}/`,
        {
          cache: "no-store",
        },
      ).catch(() => null);

    const failedRows =
      inward?.failedRows ||
      inward?.qc_failed_rows ||
      inward?.failed_rows ||
      [];

    return {
      ...notification,
      sourceType:
        "INWARD_REPLACEMENT",
      sourceId:
        inwardId,
      sourcePayload:
        inward,
      requestLabel:
        "Replacement",
      componentLabel:
        getQcFailedComponentLabel(
          inward || {},
        ),
      failedQty:
        getQcFailedRowQuantity(
          failedRows,
        ),
      mrNumber:
        String(
          inward?.source_mr_number ||
            "",
        ).trim() ||
        "Direct PO",
      poNumber:
        String(
          inward
            ?.purchase_order_number ||
            inward?.po_number ||
            "",
        ).trim() ||
        "-",
      status:
        String(
          notification?.status ||
            "PENDING_PROCUREMENT",
        )
          .trim()
          .toUpperCase(),
    };
  }

  if (
    reference
      .toUpperCase()
      .startsWith("OUTWARD:")
  ) {
    const outwardId =
      reference.split(":", 2)[1];

    const outward =
      await fetchNotificationDetailCached(
        `/outward/${encodeURIComponent(
          outwardId,
        )}/`,
        {
          cache: "no-store",
        },
      ).catch(() => null);

    const metadata =
      outward?.inventory_allocations &&
      typeof outward
        .inventory_allocations ===
        "object" &&
      !Array.isArray(
        outward.inventory_allocations
      )
        ? outward.inventory_allocations
        : {};

    const failedItems =
      Array.isArray(
        metadata?.scrap_items,
      )
        ? metadata.scrap_items
        : Array.isArray(
            metadata?.failed_items,
          )
          ? metadata.failed_items
          : [];

    const componentLabel =
      failedItems
        .map((item) => {
          const name =
            item?.component_name ||
            item?.label ||
            item?.component_code ||
            "Component";

          const qty = Number(
            item?.quantity ||
              item?.serial_numbers
                ?.length ||
              0,
          );

          return `${name} - ${qty}`;
        })
        .join(", ") ||
      getQcFailedComponentLabel(
        outward || {},
      );

    const failedQty =
      failedItems.reduce(
        (sum, item) =>
          sum +
          Number(
            item?.quantity ||
              item?.serial_numbers
                ?.length ||
              0,
          ),
        0,
      ) ||
      Number(
        outward?.quantity ||
          outward?.qty ||
          0,
      );

    return {
      ...notification,
      sourceType:
        "RETURNABLE_RESTORE",
      sourceId:
        outwardId,
      sourcePayload:
        outward,
      requestLabel:
        "Restore",
      componentLabel,
      failedQty,
      mrNumber:
        String(
          metadata
            ?.source_mr_number ||
            outward
              ?.material_request_number ||
            "",
        ).trim() ||
        "-",
      poNumber:
        "Auto from source PO",
      status:
        String(
          notification?.status ||
            metadata
              ?.procurement_restore_status ||
            "PENDING_PROCUREMENT",
        )
          .trim()
          .toUpperCase(),
    };
  }

  return {
    ...notification,
    sourceType: "",
    sourceId: "",
    requestLabel: "QC Failed",
    componentLabel: "-",
    failedQty: 0,
    mrNumber: "-",
    poNumber: "-",
  };
};

const getQcFailedActionErrorMessage = (
  error,
  fallback,
) => {
  const responseData =
    error?.response?.data;

  if (
    responseData &&
    typeof responseData === "object"
  ) {
    return (
      responseData.detail ||
      responseData.message ||
      fallback
    );
  }

  return (
    error?.detail ||
    error?.message ||
    fallback
  );
};

const approveQcFailedNotification = async (
  row,
) => {
  const key = String(
    row?.id ||
      row?.sourceId ||
      "",
  ).trim();

  if (!beginQcAction(key)) {
    return;
  }

  try {
    let responseData = null;

    if (
      row?.sourceType ===
      "INWARD_REPLACEMENT"
    ) {
      responseData =
        await fetchAuthenticatedJson(
          `${config.baseURL}/inward/${encodeURIComponent(
            row.sourceId,
          )}/procurement-approve-replacement/`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({}),
          },
        );
    } else if (
      row?.sourceType ===
      "DIRECT_REFUND"
    ) {
      responseData =
        await fetchAuthenticatedJson(
          `${config.baseURL}/inward/${encodeURIComponent(
            row.sourceId,
          )}/procurement-approve-refund/`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({}),
          },
        );
    } else if (
      row?.sourceType ===
      "RETURNABLE_RESTORE"
    ) {
      /*
       * Returnable QC Failed -> Restore
       *
       * This endpoint performs the authoritative restore/PO action.
       * Once THIS request succeeds, do not keep the button blocked while the
       * whole Procurement page reloads all MRs, POs and QC Failed details.
       */
      responseData =
        await fetchAuthenticatedJson(
          `${config.baseURL}/outward/${encodeURIComponent(
            row.sourceId,
          )}/raise-returnable-restore-po/`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({}),
          },
        );
    } else {
      throw new Error(
        "Unknown QC Failed request type.",
      );
    }

    /*
     * IMMEDIATE UI UPDATE
     * -------------------
     * Backend approval has succeeded. Change only this visible row now:
     *
     *   Pending Procurement / Approve Restore
     *                    ->
     *   Approved / Remove
     *
     * No full page reload is required before the user sees the result.
     */
    setQcFailedNotifications(
      (previous) =>
        previous.map((item) => {
          const sameNotification =
            String(item?.id ?? "") ===
            String(row?.id ?? "");

          const sameSource =
            String(
              item?.sourceType ?? "",
            ) ===
              String(
                row?.sourceType ?? "",
              ) &&
            String(
              item?.sourceId ?? "",
            ) ===
              String(
                row?.sourceId ?? "",
              );

          if (
            !sameNotification &&
            !sameSource
          ) {
            return item;
          }

          return {
            ...item,
            status:
              "PROCUREMENT_APPROVED",
            procurementApproved:
              true,
            actionCompleted:
              true,
          };
        }),
    );

    /*
     * Invalidate old related/detail cache entries BEFORE global events.
     * Other pages can then retrieve the new status instead of a 5/15-second
     * stale snapshot.
     */
    invalidateNotificationLoadingCache();

    window.dispatchEvent(
      new CustomEvent(
        "notificationsUpdated",
        {
          detail: {
            receiver:
              "PROCUREMENT",
            reason:
              row?.sourceType ===
              "RETURNABLE_RESTORE"
                ? "RETURNABLE_RESTORE_APPROVED"
                : "QC_FAILED_APPROVED",
            notificationId:
              row?.id,
            sourceId:
              row?.sourceId,
          },
        },
      ),
    );

    window.dispatchEvent(
      new CustomEvent(
        "procurementUpdated",
        {
          detail: {
            reason:
              row?.sourceType ===
              "RETURNABLE_RESTORE"
                ? "RETURNABLE_RESTORE_APPROVED"
                : "QC_FAILED_APPROVED",
            notificationId:
              row?.id,
            sourceId:
              row?.sourceId,
          },
        },
      ),
    );

    console.debug(
      "QC Failed Procurement approval completed:",
      {
        sourceType:
          row?.sourceType,
        notificationId:
          row?.id,
        sourceId:
          row?.sourceId,
        responseData,
      },
    );

    /*
     * IMPORTANT:
     * Do NOT await loadNotifications() here.
     *
     * The old code kept "Processing..." visible until a large reload
     * completed. Reconcile quietly after React has already rendered
     * Approved / Remove.
     */
    window.setTimeout(() => {
      invalidateNotificationLoadingCache();

      void loadNotifications(
        liveInventoryCounts,
        {
          forceRefresh: true,
        },
      ).catch((refreshError) => {
        console.warn(
          "Background refresh after QC Failed approval failed:",
          refreshError,
        );
      });
    }, 0);
  } catch (error) {
    console.error(
      "QC Failed Procurement approval failed:",
      error,
    );

    alert(
      getQcFailedActionErrorMessage(
        error,
        row?.sourceType ===
        "RETURNABLE_RESTORE"
          ? "Unable to approve Returnable Restore request."
          : "Unable to approve QC Failed request.",
      ),
    );
  } finally {
    /*
     * Release immediately after the authoritative POST / local update.
     * Background page reconciliation is intentionally not part of the
     * button's Processing state.
     */
    endQcAction(key);
  }
};

const rejectQcFailedReplacement = async (
  row,
) => {
  if (
    row?.sourceType !==
    "INWARD_REPLACEMENT"
  ) {
    return;
  }

  const key = String(
    row?.id ||
      row?.sourceId ||
      "",
  );

  if (
    !key ||
    qcProcessingId
  ) {
    return;
  }

  const reason = String(
    window.prompt(
      "Enter reason for rejecting this Replacement request:",
      "",
    ) || "",
  ).trim();

  if (!reason) {
    return;
  }

  setQcProcessingId(
    key,
  );

  try {
    await fetchAuthenticatedJson(
      `${config.baseURL}/inward/${encodeURIComponent(
        row.sourceId,
      )}/procurement-reject-replacement/`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify({
            reason,
          }),
      },
    );

    setQcFailedNotifications(
      (previous) =>
        previous.map((item) =>
          String(item?.id) ===
          String(row?.id)
            ? {
                ...item,
                status:
                  "PROCUREMENT_REJECTED",
                rejectionReason:
                  reason,
              }
            : item,
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

    await loadNotifications();
  } catch (error) {
    console.error(
      "Replacement Procurement rejection failed:",
      error,
    );

    alert(
      getQcFailedActionErrorMessage(
        error,
        "Unable to reject Replacement request.",
      ),
    );
  } finally {
    setQcProcessingId(
      null,
    );
  }
};

const removeQcFailedNotification = async (
  row,
) => {
  const notificationId =
    row?.id;

  const statusValue =
    String(
      row?.status || "",
    )
      .trim()
      .toUpperCase();

  if (
    !notificationId ||
    qcProcessingId
  ) {
    return;
  }

  if (
    ![
      "PROCUREMENT_APPROVED",
      "PROCUREMENT_REJECTED",
    ].includes(statusValue)
  ) {
    alert(
      "Approve or reject this request before removing the notification.",
    );
    return;
  }

  const key = String(
    notificationId,
  );

  setQcProcessingId(
    key,
  );

  try {
    await fetchAuthenticatedJson(
      `${config.baseURL}/notifications/${encodeURIComponent(
        notificationId,
      )}/`,
      {
        method: "DELETE",
      },
    );

    setQcFailedNotifications(
      (previous) =>
        previous.filter(
          (item) =>
            String(item?.id) !==
            String(notificationId),
        ),
    );

    window.dispatchEvent(
      new Event(
        "notificationsUpdated",
      ),
    );
  } catch (error) {
    console.error(
      "QC Failed notification remove failed:",
      error,
    );

    alert(
      getQcFailedActionErrorMessage(
        error,
        "Unable to remove notification.",
      ),
    );
  } finally {
    setQcProcessingId(
      null,
    );
  }
};

const loadNotifications = async (
  inventoryCountsOverride =
    liveInventoryCounts,
  {
    forceRefresh = false,
  } = {},
) => {
  try {
    const [
      requestData,
      notificationData,
      purchaseOrderData,
    ] = await Promise.all([
      fetchAllNotificationPagesShared(
        `/materialrequest/material-requests/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
        {
          cache: "no-store",
          forceRefresh,
        },
      ),

      fetchAllNotificationPagesShared(
        `/notifications/?receiver=PROCUREMENT&page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
        {
          cache: "no-store",
          forceRefresh,
        },
      ).catch(() => []),

      fetchAllNotificationPagesShared(
        `/procurement/purchase-orders/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
        {
          cache: "no-store",
          forceRefresh,
        },
      ).catch(() => []),
    ]);

    const list = Array.isArray(requestData)
      ? requestData
      : requestData?.results || [];

    const notificationList =
      Array.isArray(notificationData)
        ? notificationData
        : notificationData?.results || [];

    const purchaseOrderList =
      Array.isArray(purchaseOrderData)
        ? purchaseOrderData
        : purchaseOrderData?.results || [];

    setExistingPurchaseOrders(
      purchaseOrderList,
    );

    if (isProcurement) {
      const pendingQcFailed =
        notificationList.filter(
          (notification) => {
            const receiver = String(
              notification?.receiver ||
                "",
            )
              .trim()
              .toUpperCase();

            const category = String(
              notification?.category ||
                "",
            )
              .trim()
              .toUpperCase();

            const notificationStatus =
              String(
                notification?.status ||
                  "",
              )
                .trim()
                .toUpperCase();

            return (
              receiver ===
                "PROCUREMENT" &&
              category ===
                "QC_FAILED" &&
              [
                "PENDING_PROCUREMENT",
                "PROCUREMENT_APPROVED",
                "PROCUREMENT_REJECTED",
              ].includes(
                notificationStatus,
              )
            );
          },
        );

      const hydratedQcFailed =
        await Promise.all(
          pendingQcFailed.map(
            hydrateQcFailedNotification,
          ),
        );

      setQcFailedNotifications(
        hydratedQcFailed,
      );
    } else {
      setQcFailedNotifications(
        [],
      );
    }

    const procurementReferences =
      new Set();

    notificationList.forEach(
      (notification) => {
        const receiver = String(
          notification.receiver || "",
        )
          .trim()
          .toUpperCase();

        const category = String(
          notification.category || "",
        )
          .trim()
          .toUpperCase();

        const notificationStatus =
          String(
            notification.status || "",
          )
            .trim()
            .toUpperCase();

        if (
          receiver === "PROCUREMENT" &&
          category === "MR" &&
          [
            "PROCUREMENT_PENDING",
            "REQUESTED",
            "MANAGER_APPROVED",
          ].includes(notificationStatus)
        ) {
          procurementReferences.add(
            String(
              notification.reference_id ??
                notification.referenceId ??
                "",
            ),
          );
        }
      },
    );

    const filtered = list
      .map((item) => ({
        ...item,
        approval_status: String(
          item.approval_status || "",
        )
          .trim()
          .toUpperCase(),
        status: String(
          item.status || "",
        )
          .trim()
          .toUpperCase(),
        rejectionReason:
          item.rejection_reason ||
          item.rejectionReason ||
          item.reject_reason ||
          item.rejectReason ||
          item.reject_note ||
          item.rejectNote ||
          item.message ||
          item.note ||
          item.comment ||
          item.reason ||
          "",
      }))
      .filter((item) => {
        const approvalStatus = String(
          item.approval_status || "",
        )
          .trim()
          .toUpperCase();

        const workflowStatus = String(
          item.status || "",
        )
          .trim()
          .toUpperCase();

        const hasShortage =
          (
            isProcurement
              ? getRemainingPoShortageRows(
                  item,
                  purchaseOrderList,
                )
              : getRequestShortageRows(
                  item,
                  inventoryCountsOverride,
                )
          ).length > 0;

        const isPoRaised =
          item.po_raised === true ||
          item.po_raised === 1 ||
          String(
            item.po_raised || "",
          )
            .trim()
            .toLowerCase() === "true";

        if (isPoRaised) {
          return false;
        }

        if (isAdmin) {
          return false;
        }

        if (isManager) {
          return [
            "PENDING_MANAGER",
            "MANAGER_REJECTED",
          ].includes(approvalStatus);
        }

        if (isProcurement) {
          const requestReferences = [
            item.id,
            item.material_request_id,
            item.request_id,
          ]
            .filter(
              (value) =>
                value !== undefined &&
                value !== null &&
                value !== "",
            )
            .map(String);

          const hasProcurementNotification =
            requestReferences.some(
              (reference) =>
                procurementReferences.has(
                  reference,
                ),
            );

          /*
           * MaterialRequest status is the primary source.
           * The Notification row is a fallback for older
           * records whose status was not refreshed.
           */
          return (
            workflowStatus ===
              "PROCUREMENT_PENDING" ||
            (
              hasProcurementNotification &&
              ![
                "INVENTORY_PENDING",
                "INVENTORY_ISSUED",
                "MR_COMPLETED",
              ].includes(workflowStatus)
            )
          );
        }

        return false;
      });

    // Remove duplicate MR rows.
    const uniqueNotifications =
      filtered.reduce(
        (acc, current) => {
          const key = String(
            current.material_request_id ||
              current.request_id ||
              current.id,
          );

          const existing = acc.find(
            (item) =>
              String(
                item.material_request_id ||
                  item.request_id ||
                  item.id,
              ) === key,
          );

          if (!existing) {
            acc.push(current);
          } else {
            const priority = {
              MANAGER_APPROVED: 5,
              MANAGER_REJECTED: 5,
              PENDING_MANAGER: 4,
              REQUESTED: 3,
              APPROVED: 2,
              REJECTED: 1,
            };

            if (
              (
                priority[
                  current.approval_status
                ] || 0
              ) >
              (
                priority[
                  existing.approval_status
                ] || 0
              )
            ) {
              acc[
                acc.indexOf(existing)
              ] = current;
            }
          }

          return acc;
        },
        [],
      );

    setNotifications(
      uniqueNotifications,
    );

    // Resolve missing component names after loading.
    void resolveMissingComponentNames(
      uniqueNotifications,
    );
  } catch (err) {
    console.error(
      "Failed to load material notifications:",
      err,
    );
  } finally {
    setLoading(false);
  }
};

const fetchComponentById = async (id) => {
  try {
    const res = await fetch(`${config.baseURL}/components/components/${encodeURIComponent(id)}/`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
};

const fetchComponentBySearch = async (q) => {
  try {
    const res = await fetch(`${config.baseURL}/components/components/?search=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.results || [];
    return list[0] || null;
  } catch (err) {
    return null;
  }
};

const resolveMissingComponentNames = async (notifList) => {
  if (!Array.isArray(notifList)) return;
  const missing = new Set();

  notifList.forEach((n) => {
    const items = Array.isArray(n.bom_items) ? n.bom_items : Array.isArray(n.items) ? n.items : [];
    items.forEach((it) => {
      const code = it.component_code || it.component || it.code || it.component_id || it.componentId;
      if (!code) return;
      const key = String(code);
      const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
      const hasName = it.component_name || componentsMap[key] || componentsNormMap[normalized];
      if (!hasName) missing.add(key);
    });
  });

  if (missing.size === 0) return;

  const mapUpdates = {};
  const normUpdates = {};

  for (const key of missing) {
    // try direct fetch by id first
    let comp = await fetchComponentById(key);
    if (!comp) comp = await fetchComponentBySearch(key);
    if (!comp) {
      // try without CMP- prefix or with it
      const plain = String(key).replace(/^CMP-?/i, "");
      if (plain && plain !== key) {
        comp = await fetchComponentById(plain) || await fetchComponentBySearch(plain);
      }
    }

    if (comp) {
      const name = comp.name || comp.component_name || comp.product_name || "";
      mapUpdates[key] = name;
      const normalize = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      normUpdates[normalize(key)] = name;
      const cmpKey = normalize(key.startsWith("CMP-") ? key : `CMP-${key}`);
      normUpdates[cmpKey] = name;
    }
  }

  if (Object.keys(mapUpdates).length > 0) {
    setComponentsMap((prev) => ({ ...prev, ...mapUpdates }));
    setComponentsNormMap((prev) => ({ ...prev, ...normUpdates }));
  }
};

  useEffect(() => {
    // Redirect managers/admins to the consolidated Notifications page
    // which includes PO, MR and Scrap tabs. This page is MR-only.
    if (isManager || isAdmin) {
      navigate("/notifications");
      return;
    }

    const refreshProcurementRequests = async () => {
      setLoading(true);

      const counts =
        await loadLiveInventoryCounts();

      await loadNotifications(counts);
    };

    void refreshProcurementRequests();
  }, [isManager, isAdmin, isProcurement, navigate]);

  // Load components list once to resolve component names for display
  useEffect(() => {
    let mounted = true;
    const loadComponents = async () => {
      try {
        const list =
          await fetchAllNotificationPagesShared(
            `/components/components/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
            { cache: "no-store" },
          );

        const map = {};
        const norm = {};
        const normalize = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

        list.forEach((c) => {
          const name = c.name || c.component_name || c.product_name || "";
          const keys = [c.id, c.component_id, c.componentCode, c.component_code, c.code, c.component_id_display, c.component_code_display];
          keys.forEach((k) => {
            if (k !== undefined && k !== null) {
              const s = String(k);
              map[s] = name;
              const n = normalize(s);
              if (n) norm[n] = name;
              // also store cmp- prefixed normalized
              const cmpKey = normalize(s.startsWith("CMP-") ? s : `CMP-${s}`);
              if (cmpKey) norm[cmpKey] = name;
            }
          });
        });

        if (mounted) {
          setPoComponents(list);
          setComponentsMap(map);
          setComponentsNormMap(norm);
        }
      } catch (err) {
        // ignore
      }
    };

    loadComponents();
    return () => {
      mounted = false;
    };
  }, []);

  // Vendor list used by the PO creation popup.
  useEffect(() => {
    let mounted = true;

    const loadVendors = async () => {
      try {
        const list =
          await fetchAllNotificationPagesShared(
            `/vendors/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
            { cache: "no-store" },
          );

        if (mounted) setVendors(list);
      } catch (err) {
        console.error("Failed to load vendors for PO popup", err);
        if (mounted) setVendors([]);
      }
    };

    loadVendors();
    return () => {
      mounted = false;
    };
  }, []);



  // ✅ Accept / Reject Action
const updateStatus = async (
  id,
  nextStatus,
  reason = ""
) => {
  const decisionKey = `MR:${String(id ?? "")}`;

  /*
   * Synchronous lock: the first click owns this MR decision immediately.
   * Fast repeated clicks cannot send duplicate approval/rejection requests.
   */
  if (!beginDecision(decisionKey)) {
    return false;
  }

  try {
    const normalizedStatus =
      String(nextStatus || "")
        .trim()
        .toUpperCase();

    let payload = {};

    if (
      normalizedStatus ===
      "MANAGER_APPROVED"
    ) {
      payload = {
        status: "MANAGER_APPROVED",
        approval_status:
          "MANAGER_APPROVED",
      };
    } else if (
      normalizedStatus ===
        "REJECTED" ||
      normalizedStatus ===
        "MANAGER_REJECTED"
    ) {
      payload = {
        status: "MANAGER_REJECTED",
        approval_status:
          "MANAGER_REJECTED",
        rejection_reason:
          reason.trim(),
        rejected_by:
          user?.name ||
          user?.username ||
          user?.email ||
          "Manager",
      };
    } else {
      return;
    }

    await fetchAuthenticatedJson(
      `/materialrequest/material-requests/${encodeURIComponent(
        id,
      )}/`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );

    window.dispatchEvent(
      new Event("notificationsUpdated")
    );

    /*
     * Update the visible row immediately from authoritative backend data.
     * The full reload still runs, but the user does not need to click again.
     */
    await loadNotifications();
    return true;
  } catch (error) {
    console.error(
      "Failed to update Material Request:",
      error
    );

    alert(
      error.message ||
        "Failed to update Material Request."
    );
    return false;
  } finally {
    endDecision(decisionKey);
  }
};

  const handleOpenRejectModal = (notification, status) => {
    setActiveRejectNotification(notification);
    setPendingRejectStatus(status);
    const rejectContent =
      notification.rejectionReason ||
      notification.rejection_reason ||
      notification.rejectReason ||
      notification.reject_reason ||
      notification.reject_note ||
      notification.rejectNote ||
      notification.message ||
      notification.note ||
      notification.comment ||
      notification.reason ||
      notification.latest_approval?.reason ||
      notification.latest_approval?.comment ||
      notification.latest_approval?.note ||
      "";

    setRejectReason(status === "REJECTED" ? rejectContent : "");
    setShowRejectModal(true);
  };

  const getNotificationId = (notification) =>
    notification?.id || notification?.material_request_id || notification?.request_id || "";

  const normalizeComponentKey = (value) =>
    String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const getLocalDateString = () => {
    const now = new Date();
    const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return localTime.toISOString().split("T")[0];
  };
const getFinancialYearCode = (
  date = new Date()
) => {
  const year = date.getFullYear();
  const month = date.getMonth();

  // April to March financial year
  const financialYearStart =
    month >= 3 ? year : year - 1;

  const financialYearEnd =
    financialYearStart + 1;

  return (
    `${String(financialYearStart).slice(-2)}` +
    `-${String(financialYearEnd).slice(-2)}`
  );
};

const fetchAllPurchaseOrders = async () =>
  fetchAllNotificationPagesShared(
    `/procurement/purchase-orders/?page_size=${NOTIFICATION_FETCH_PAGE_SIZE}`,
    {
      cache: "no-store",
    },
  );

const fetchAuthoritativeMrShortageRows = async (
  request
) => {
  const sourceMrNumber =
    request?.material_request_id ||
    request?.request_id ||
    request?.mr_number ||
    "";

  if (!sourceMrNumber) {
    return [];
  }

  const data =
    await fetchAuthenticatedJson(
      `/procurement/purchase-orders/mr-shortage-summary/?mr=${encodeURIComponent(
        sourceMrNumber
      )}`,
      {
        cache: "no-store",
      },
    );

  const rows =
    Array.isArray(data?.components)
      ? data.components
      : [];

  const mappedRows = rows.map((row) => ({
    component_pk:
      row.component_id,

    component_code:
      row.component_code,

    component_name:
      row.component_name,

    component_display:
      row.component_code
        ? `${row.component_code} - ${row.component_name || "Component"}`
        : row.component_name ||
          "Component",

    category:
      row.category || "",

    requestedQty:
      Number(
        row.requested_quantity || 0
      ),

    inventoryQty:
      Number(
        row.reserved_store_quantity || 0
      ),

    originalShortageQuantity:
      Number(
        row.procurement_shortage_quantity ||
          0
      ),

    alreadyOrderedQuantity:
      Number(
        row.already_ordered_quantity ||
          0
      ),

    remainingShortageQuantity:
      Number(
        row.remaining_quantity || 0
      ),

    shortageQty:
      Number(
        row.remaining_quantity || 0
      ),
  }));

  if (
    !isFromScrapProcurementRequest(
      request
    )
  ) {
    return mappedRows;
  }

  /*
   * Safety overlay for generated From-Scrap MRs.
   *
   * mr-shortage-summary remains authoritative for Store / PO quantities.
   * We only remove rows that the generated MR itself proves are already
   * fulfilled by GOOD Scrap serials.
   */
  const routingRows =
    getRequestShortageRows(
      request
    );

  const routingKeys = new Set(
    routingRows.flatMap((row) =>
      [
        row?.component_pk,
        row?.component_code,
      ]
        .filter(
          (value) =>
            value !== undefined &&
            value !== null &&
            String(value).trim()
        )
        .map(
          (value) =>
            normalizeComponentKey(
              value
            )
        )
        .filter(Boolean)
    )
  );

  return mappedRows.filter((row) => {
    const rowKeys = [
      row?.component_pk,
      row?.component_code,
    ]
      .filter(
        (value) =>
          value !== undefined &&
          value !== null &&
          String(value).trim()
      )
      .map(
        (value) =>
          normalizeComponentKey(
            value
          )
      )
      .filter(Boolean);

    return rowKeys.some((key) =>
      routingKeys.has(key)
    );
  });
};


const getPurchaseOrderMrNumber = (order) =>
  String(
    order?.source_mr_number ||
      order?.material_request_id ||
      order?.request_id ||
      order?.mr_number ||
      ""
  ).trim();

const getComponentKeys = (...values) =>
  [
    ...new Set(
      values
        .flatMap((value) => {
          if (
            value &&
            typeof value === "object"
          ) {
            return [
              value.id,
              value.component_id,
              value.componentId,
              value.component_code,
              value.componentCode,
              value.code,
            ];
          }

          return [value];
        })
        .filter(
          (value) =>
            value !== undefined &&
            value !== null &&
            value !== ""
        )
        .map(normalizeComponentKey)
        .filter(Boolean)
    ),
  ];

const getPoItemComponentKeys = (item) =>
  getComponentKeys(
    item?.component,
    item?.component_id,
    item?.componentId,
    item?.component_code,
    item?.componentCode,
    item?.code,
    item?.component_obj,
    item?.component_details
  );

const getRequestRowComponentKeys = (row) =>
  getComponentKeys(
    resolvePoComponentId(row),
    row?.component_pk,
    row?.component_code,
    row?.componentCode,
    row?.component_id,
    row?.componentId
  );

const buildOrderedQuantityMap = (
  purchaseOrders,
  sourceMrNumber
) => {
  const orderedQuantityMap = new Map();

  purchaseOrders
    .filter(
      (order) =>
        getPurchaseOrderMrNumber(order) ===
        String(sourceMrNumber || "").trim()
    )
    .forEach((order) => {
      (order.items || []).forEach((item) => {
        const quantity = Number(
          item?.quantity ||
            item?.ordered_quantity ||
            0
        );

        getPoItemComponentKeys(item).forEach(
          (key) => {
            orderedQuantityMap.set(
              key,
              Number(
                orderedQuantityMap.get(key) || 0
              ) + quantity
            );
          }
        );
      });
    });

  return orderedQuantityMap;
};

const getRemainingPoShortageRows = (
  request,
  purchaseOrders
) => {
  const sourceMrNumber =
    request?.material_request_id ||
    request?.request_id ||
    request?.mr_number ||
    null;

  const orderedQuantityMap =
    buildOrderedQuantityMap(
      purchaseOrders,
      sourceMrNumber
    );

  return getRequestShortageRows(request)
    .map((row) => {
      const originalShortageQuantity =
        Math.max(
          0,
          Number(row.requestedQty || 0) -
            Number(row.inventoryQty || 0)
        );

      const alreadyOrderedQuantity =
        Math.max(
          0,
          ...getRequestRowComponentKeys(
            row
          ).map((key) =>
            Number(
              orderedQuantityMap.get(key) || 0
            )
          )
        );

      const remainingShortageQuantity =
        Math.max(
          0,
          originalShortageQuantity -
            alreadyOrderedQuantity
        );

      return {
        ...row,
        originalShortageQuantity,
        alreadyOrderedQuantity:
          Math.min(
            originalShortageQuantity,
            alreadyOrderedQuantity
          ),
        remainingShortageQuantity,
      };
    })
    .filter(
      (row) =>
        row.remainingShortageQuantity > 0
    );
};

const getNextMrPoBatchNumber = async (
  purchaseOrdersOverride = null
) => {
  const financialYear =
    getFinancialYearCode();

  const purchaseOrders =
    Array.isArray(purchaseOrdersOverride)
      ? purchaseOrdersOverride
      : await fetchAllPurchaseOrders();

  let highestFinancialYearNumber = 0;
  let hasNewMrBatchFormat = false;

  /*
   * Legacy timestamp groups are counted once.
   * PO-1785838975553-01 and
   * PO-1785838975553-02 are one legacy MR batch.
   */
  const legacyMrBatches = new Set();

  purchaseOrders.forEach((order) => {
    const poNumber = String(
      order?.po_number ||
        order?.po ||
        ""
    ).trim();

    const financialYearMatch =
      poNumber.match(
        /^(\d+)\/(\d{2}-\d{2})(?:_(\d{2}))?$/
      );

    if (
      financialYearMatch &&
      financialYearMatch[2] ===
        financialYear
    ) {
      const sequence = Number(
        financialYearMatch[1]
      );

      if (financialYearMatch[3]) {
        hasNewMrBatchFormat = true;
      }

      if (Number.isFinite(sequence)) {
        highestFinancialYearNumber =
          Math.max(
            highestFinancialYearNumber,
            sequence
          );
      }

      return;
    }

    const legacyMatch =
      poNumber.match(
        /^PO-(\d+)-\d{2}$/
      );

    if (legacyMatch) {
      legacyMrBatches.add(
        legacyMatch[1]
      );
    }
  });

  /*
   * Before the first new-format MR batch, reserve
   * one financial-year sequence for each legacy batch.
   * Once a new-format batch exists, the highest number
   * already includes those reserved positions.
   */
  const nextSequence =
    hasNewMrBatchFormat
      ? highestFinancialYearNumber + 1
      : highestFinancialYearNumber +
        legacyMrBatches.size +
        1;

  return (
    `${String(nextSequence).padStart(2, "0")}` +
    `/${financialYear}`
  );
};

const getMrPoNumberContext = async (
  sourceMrNumber
) => {
  const financialYear =
    getFinancialYearCode();

  const purchaseOrders =
    await fetchAllPurchaseOrders();

  const sameMrOrders =
    purchaseOrders.filter(
      (order) =>
        getPurchaseOrderMrNumber(order) ===
        String(sourceMrNumber || "").trim()
    );

  let existingBatchNumber = "";
  let highestSuffix = 0;

  sameMrOrders.forEach((order) => {
    const poNumber = String(
      order?.po_number ||
        order?.po ||
        ""
    ).trim();

    const match = poNumber.match(
      /^(\d+)\/(\d{2}-\d{2})_(\d{2})$/
    );

    if (
      !match ||
      match[2] !== financialYear
    ) {
      return;
    }

    existingBatchNumber =
      `${String(Number(match[1])).padStart(
        2,
        "0"
      )}/${match[2]}`;

    highestSuffix = Math.max(
      highestSuffix,
      Number(match[3])
    );
  });

  return {
    purchaseOrders,
    batchNumber:
      existingBatchNumber ||
      (await getNextMrPoBatchNumber(
        purchaseOrders
      )),
    nextSuffix:
      existingBatchNumber
        ? highestSuffix + 1
        : 1,
  };
};

  const resolvePoComponentId = (row) => {
    const candidates = [row.component_pk, row.component_code]
      .filter((value) => value !== undefined && value !== null && value !== "")
      .map(normalizeComponentKey);

    const match = poComponents.find((component) => {
      const componentKeys = [
        component.id,
        component.component_id,
        component.componentId,
        component.component_code,
        component.code,
      ]
        .filter((value) => value !== undefined && value !== null && value !== "")
        .map(normalizeComponentKey);

      return candidates.some((candidate) => componentKeys.includes(candidate));
    });

    if (match?.id !== undefined && match?.id !== null) return match.id;

    // Fallback only when the request already contains a numeric database ID.
    const numericPk = Number(row.component_pk);
    return Number.isFinite(numericPk) && numericPk > 0 ? numericPk : "";
  };

  const handleMarkPoRaised = async (notification) => {
    const id = getNotificationId(notification);
    if (!id) {
      console.error("Cannot mark PO raised: missing notification identifier", notification);
      return false;
    }

    try {
      await fetchAuthenticatedJson(
        `/materialrequest/material-requests/${encodeURIComponent(id)}/`,
        {
          method: "PATCH",
          body: JSON.stringify({
            po_raised: true,
          }),
        },
      );

      return true;
    } catch (err) {
      console.error("Failed to mark PO raised", err);
      return false;
    }
  };

  const updatePoItem = (index, field, value) => {
    setPoForm((previous) => ({
      ...previous,
      items: previous.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const createEmptyVendorAllocation = () => ({
    vendor: "",
    expectedDeliveryDate: "",
    quantity: "",
    uom: "",
    unitPrice: "",
    discount: "",
    gst: "",
    freightCost: "",
    freightGst: "",
    roundOff: "",
  });

  const getPoAllocationTotals = (allocation = {}) => {
    const quantity = Math.max(Number(allocation.quantity || 0), 0);
    const unitPrice = Math.max(Number(allocation.unitPrice || 0), 0);
    const basicAmount = quantity * unitPrice;
    const discount = Math.min(
      basicAmount,
      Math.max(Number(allocation.discount || 0), 0),
    );
    const taxableAmount = Math.max(basicAmount - discount, 0);
    const gst = Math.min(Math.max(Number(allocation.gst || 0), 0), 100);
    const freightCost = Math.max(Number(allocation.freightCost || 0), 0);
    const freightGst = Math.min(
      Math.max(Number(allocation.freightGst || 0), 0),
      100,
    );
    const roundOff = Number(allocation.roundOff || 0) || 0;

    return {
      basicAmount,
      discount,
      gstAmount: taxableAmount * gst / 100,
      freightCost,
      freightGstAmount: freightCost * freightGst / 100,
      lineTotal:
        taxableAmount +
        taxableAmount * gst / 100 +
        freightCost +
        freightCost * freightGst / 100 +
        roundOff,
    };
  };

  const getAllocatedQuantity = (item) =>
    (item.allocations || []).reduce(
      (sum, allocation) =>
        sum + Number(allocation.quantity || 0),
      0
    );

  const getRemainingQuantity = (item) =>
    Math.max(
      0,
      Number(item.shortageQuantity || 0) -
        getAllocatedQuantity(item)
    );

  /*
   * Opens the PO popup.
   * Each shortage component starts with one vendor row.
   */
  const confirmPoRaised = async () => {
    if (!selectedPoRequest) return;

    try {
      setPoSubmitting(true);

      /*
       * Use the backend as the single source of truth for:
       * - Procurement shortage
       * - Already PO
       * - PO Remaining
       *
       * This exactly matches the server validation used when the PO is
       * created, so the popup cannot offer a stale quantity.
       */
      const remainingShortageRows =
        (
          await fetchAuthoritativeMrShortageRows(
            selectedPoRequest
          )
        ).filter(
          (row) =>
            Number(
              row.remainingShortageQuantity ||
                0
            ) > 0
        );

      const shortageItems =
        await Promise.all(remainingShortageRows.map(async (row) => {
          const componentId = resolvePoComponentId(row);
          let previousPurchase = null;

          if (componentId) {
            previousPurchase = await fetchAuthenticatedJson(
              `/procurement/purchase-orders/last-unit-price/?component_id=${encodeURIComponent(componentId)}`,
              { cache: "no-store" },
            ).catch(() => null);
          }

          const purchaseRecord = Array.isArray(previousPurchase)
            ? previousPurchase[0]
            : previousPurchase?.data || previousPurchase;
          const purchaseOrder = purchaseRecord?.purchase_order || purchaseRecord?.po || {};
          const componentKeys = new Set(
            getComponentKeys(componentId, row.component_code),
          );
          const purchaseHistory = [];

          const purchaseOrders = await fetchAllPurchaseOrders().catch(() => []);
          purchaseOrders.forEach((order) => {
            const orderDate = order?.po_date || order?.date || order?.created_at || "";
            const vendorName = order?.vendor_name || order?.vendor?.name || order?.vendor || "";

            (Array.isArray(order?.items) ? order.items : []).forEach((item) => {
              if (!getPoItemComponentKeys(item).some((key) => componentKeys.has(key))) {
                return;
              }

              const price = Number(item?.unit_price ?? item?.unitPrice ?? item?.price ?? 0);
              if (Number.isFinite(price) && price > 0) {
                purchaseHistory.push({
                  price,
                  vendor: String(vendorName || "").trim(),
                  date: orderDate,
                });
              }
            });
          });

          const latestPurchase = purchaseHistory
            .slice()
            .sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0))[0];
          const lowestPurchase = purchaseHistory.reduce(
            (lowest, current) => (!lowest || current.price < lowest.price ? current : lowest),
            null,
          );
          const highestPurchase = purchaseHistory.reduce(
            (highest, current) => (!highest || current.price > highest.price ? current : highest),
            null,
          );
          const masterComponent = poComponents.find((component) =>
            getComponentKeys(component).some((key) => componentKeys.has(key)),
          );
          const previousAllocation = createEmptyVendorAllocation();
          const previousVendor = [
            purchaseRecord?.vendor_name,
            purchaseRecord?.vendorName,
            purchaseOrder?.vendor_name,
            purchaseOrder?.vendorName,
            purchaseRecord?.vendor?.name,
            purchaseRecord?.vendor?.vendor_name,
            typeof purchaseRecord?.vendor === "string"
              ? purchaseRecord.vendor
              : "",
          ].find((value) => typeof value === "string" && value.trim());
          previousAllocation.vendor = String(previousVendor || "").trim();
          previousAllocation.lastPurchaseVendor = previousAllocation.vendor;
          previousAllocation.lastPurchasePrice =
            purchaseRecord?.unit_price ??
            purchaseRecord?.unitPrice ??
            purchaseRecord?.last_purchase_price ??
            "";
          previousAllocation.lastPurchaseDate = [
            purchaseRecord?.purchase_date,
            purchaseRecord?.purchaseDate,
            purchaseRecord?.last_purchase_date,
            purchaseRecord?.po_date,
            purchaseRecord?.date,
            purchaseOrder?.purchase_date,
            purchaseOrder?.purchaseDate,
            purchaseOrder?.po_date,
            purchaseOrder?.date,
            purchaseOrder?.created_at,
            purchaseRecord?.created_at,
          ].find((value) => value) || "";
          previousAllocation.lastPurchaseVendor =
            previousAllocation.lastPurchaseVendor ||
            latestPurchase?.vendor ||
            "";
          previousAllocation.lastPurchasePrice =
            previousAllocation.lastPurchasePrice ||
            latestPurchase?.price ||
            "";
          previousAllocation.lastPurchaseDate =
            previousAllocation.lastPurchaseDate ||
            latestPurchase?.date ||
            "";
          previousAllocation.lowestPurchase = lowestPurchase;
          previousAllocation.highestPurchase = highestPurchase;
          previousAllocation.hsnNo =
            masterComponent?.hsn_numbers ||
            masterComponent?.hsn_no ||
            masterComponent?.hsn ||
            row?.hsn_no ||
            row?.hsn_numbers ||
            "";
          previousAllocation.unitPrice =
            previousAllocation.lastPurchasePrice ??
            "";

          return {
          componentId:
            componentId,

          componentCode:
            row.component_code,

          componentName:
            row.component_display,

          originalShortageQuantity:
            row.originalShortageQuantity,

          alreadyOrderedQuantity:
            row.alreadyOrderedQuantity,

          shortageQuantity:
            row.remainingShortageQuantity,

          allocations: [
            previousAllocation,
          ],
          };
        }));

      if (shortageItems.length === 0) {
        alert(
          "Purchase Orders have already been created for all shortage components in this Material Request."
        );

        setShowPoConfirmModal(false);
        setSelectedPoRequest(null);
        await loadNotifications();
        return;
      }

      setPoForm({
        items: shortageItems,
      });

      setShowPoConfirmModal(false);
      setShowCreatePoModal(true);
    } catch (error) {
      console.error(
        "Failed to load remaining PO components:",
        error
      );

      alert(
        error.message ||
          "Unable to load the remaining shortage components."
      );
    } finally {
      setPoSubmitting(false);
    }
  };

  /*
   * Update vendor, quantity, price, GST or date.
   *
   * Quantity is automatically limited so that the combined
   * vendor quantity cannot exceed the component shortage.
   */
  const updatePoAllocation = (
    itemIndex,
    allocationIndex,
    field,
    value
  ) => {
    setPoForm((previous) => ({
      ...previous,

      items: previous.items.map(
        (item, currentItemIndex) => {
          if (currentItemIndex !== itemIndex) {
            return item;
          }

          const allocations = [
            ...(item.allocations || []),
          ];

          let nextValue = value;

          if (
            field === "quantity" &&
            value !== ""
          ) {
            const quantityEntered = Math.max(
              0,
              Number(value || 0)
            );

            const allocatedInOtherRows =
              allocations.reduce(
                (
                  sum,
                  allocation,
                  currentAllocationIndex
                ) =>
                  currentAllocationIndex ===
                  allocationIndex
                    ? sum
                    : sum +
                      Number(
                        allocation.quantity || 0
                      ),
                0
              );

            const maximumAllowed = Math.max(
              0,
              Number(
                item.shortageQuantity || 0
              ) - allocatedInOtherRows
            );

            /*
             * Example:
             * Shortage = 1900
             * Vendor 1 = 900
             * Vendor 2 maximum = 1000
             */
            nextValue = String(
              Math.min(
                quantityEntered,
                maximumAllowed
              )
            );
          }

          allocations[allocationIndex] = {
            ...allocations[allocationIndex],
            [field]: nextValue,
          };

          return {
            ...item,
            allocations,
          };
        }
      ),
    }));
  };

  /*
   * Adds another vendor row for one component.
   */
  const addVendorAllocation = (itemIndex) => {
    setPoForm((previous) => ({
      ...previous,

      items: previous.items.map(
        (item, currentItemIndex) => {
          if (currentItemIndex !== itemIndex) {
            return item;
          }

          if (
            getRemainingQuantity(item) <= 0
          ) {
            return item;
          }

          return {
            ...item,

            allocations: [
              ...(item.allocations || []),
              createEmptyVendorAllocation(),
            ],
          };
        }
      ),
    }));
  };

  /*
   * Removes one vendor row.
   * At least one empty vendor row is always kept.
   */
  const removeVendorAllocation = (
    itemIndex,
    allocationIndex
  ) => {
    setPoForm((previous) => ({
      ...previous,

      items: previous.items.map(
        (item, currentItemIndex) => {
          if (currentItemIndex !== itemIndex) {
            return item;
          }

          const allocations = (
            item.allocations || []
          ).filter(
            (_, currentAllocationIndex) =>
              currentAllocationIndex !==
              allocationIndex
          );

          return {
            ...item,

            allocations:
              allocations.length > 0
                ? allocations
                : [
                    createEmptyVendorAllocation(),
                  ],
          };
        }
      ),
    }));
  };

  const closeCreatePoModal = () => {
    if (poSubmitting) return;

    setSameVendorPoChoice(null);
    setShowCreatePoModal(false);
    setSelectedPoRequest(null);

    setPoForm({
      items: [],
    });
  };

  /*
   * Creates POs only for components filled in now.
   * Completely blank components remain pending under
   * the same Material Request for a later submission.
   */
  const ensureFinanceNotificationForCreatedPO = async (
    createdPO,
    fallbackPoNumber,
  ) => {
    const poId =
      createdPO?.id ??
      createdPO?.pk;

    if (
      poId === undefined ||
      poId === null ||
      poId === ""
    ) {
      throw new Error(
        `PO ${fallbackPoNumber || ""} was created, but its database ID was not returned. Finance notification could not be linked.`,
      );
    }

    const poNumber =
      createdPO?.po_number ||
      createdPO?.po ||
      createdPO?.purchase_order_number ||
      fallbackPoNumber ||
      `PO-${poId}`;

    /*
     * Keep the Purchase Order itself authoritative.
     * This also protects against a create serializer/default that
     * accidentally returns PENDING / NOT_REQUESTED.
     */
    await fetchAuthenticatedJson(
      `/procurement/purchase-orders/${encodeURIComponent(
        poId,
      )}/`,
      {
        method: "PATCH",
        timeoutMs: 60000,
        body: JSON.stringify({
          status: "PENDING_FINANCE",
          approval_status: "PENDING_FINANCE",
        }),
      },
    );

    /*
     * FinanceNotifications does not build rows directly from all POs.
     * It first filters Notification records:
     *   category = PO
     *   receiver = FINANCE
     *
     * Therefore create one Finance notification for every PO raised
     * from this Material Request.
     */
    await fetchAuthenticatedJson(
      "/notifications/",
      {
        method: "POST",
        timeoutMs: 60000,
        body: JSON.stringify({
          category: "PO",
          title:
            `PO Approval Request - ${poNumber}`,
          message:
            `Finance approval is pending for PO ${poNumber}`,
          reference_id: String(poId),
          status: "PENDING_FINANCE",
          receiver: "FINANCE",
          is_read: false,
        }),
      },
    );

    window.dispatchEvent(
      new CustomEvent(
        "notificationsUpdated",
        {
          detail: {
            receiver: "FINANCE",
            reason: "MR_PO_RAISED",
            poId: String(poId),
          },
        },
      ),
    );

    window.dispatchEvent(
      new Event("procurementUpdated"),
    );

    return poId;
  };


  const submitPurchaseOrder = async (
    sameVendorMode = null
  ) => {
    if (!selectedPoRequest) return;

    /*
     * A component is selected for this submission only
     * when at least one field in its vendor row is filled.
     * Completely blank components remain pending.
     */
    const selectedItems = poForm.items.filter(
      (item) =>
        (item.allocations || []).some(
          (allocation) =>
            Boolean(allocation.vendor) ||
            Boolean(
              allocation.expectedDeliveryDate
            ) ||
            String(
              allocation.quantity ?? ""
            ).trim() !== "" ||
            String(
              allocation.unitPrice ?? ""
            ).trim() !== "" ||
            String(
              allocation.gst ?? ""
            ).trim() !== ""
        )
    );

    if (selectedItems.length === 0) {
      alert(
        "Enter vendor details for at least one component. Leave the other components blank to create their Purchase Orders later."
      );
      return;
    }

    const sourceMrNumber =
      selectedPoRequest.material_request_id ||
      selectedPoRequest.request_id ||
      selectedPoRequest.mr_number ||
      null;

    /*
     * Re-check the backend immediately before POST.
     * Another PO may have been created after this modal was opened.
     */
    let authoritativeRows = [];

    try {
      authoritativeRows =
        await fetchAuthoritativeMrShortageRows(
          selectedPoRequest
        );
    } catch (shortageError) {
      console.error(
        "Unable to refresh Procurement shortage:",
        shortageError
      );

      alert(
        shortageError?.message ||
          "Unable to refresh the latest Procurement shortage."
      );

      return;
    }

    const authoritativeByComponent =
      new Map(
        authoritativeRows.map(
          (row) => [
            String(
              row.component_pk
            ),
            row,
          ]
        )
      );

    const unresolvedComponent =
      selectedItems.find(
        (item) => !item.componentId
      );

    if (unresolvedComponent) {
      alert(
        `Could not resolve the database ID for ${unresolvedComponent.componentName}. ` +
          "Check that this component exists in the Components table."
      );
      return;
    }

    /*
     * Validate only the components being submitted now.
     * Blank components are intentionally skipped.
     */
    for (const item of selectedItems) {
      const allocatedQuantity =
        getAllocatedQuantity(item);

      const authoritativeRow =
        authoritativeByComponent.get(
          String(item.componentId)
        );

      const shortageQuantity =
        Number(
          authoritativeRow
            ?.remainingShortageQuantity ??
          item.shortageQuantity ??
          0
        );

      if (
        authoritativeRow &&
        shortageQuantity <= 0
      ) {
        alert(
          `${item.componentName}: this component is already fully covered by existing Purchase Order(s). No further PO quantity is required.`
        );

        /*
         * Refresh the modal so fully-covered components disappear.
         */
        const refreshedItems =
          authoritativeRows
            .filter(
              (row) =>
                Number(
                  row.remainingShortageQuantity ||
                    0
                ) > 0
            )
            .map((row) => ({
              componentId:
                resolvePoComponentId(
                  row
                ) ||
                row.component_pk,

              componentCode:
                row.component_code,

              componentName:
                row.component_display,

              originalShortageQuantity:
                row.originalShortageQuantity,

              alreadyOrderedQuantity:
                row.alreadyOrderedQuantity,

              shortageQuantity:
                row.remainingShortageQuantity,

              allocations: [
                createEmptyVendorAllocation(),
              ],
            }));

        setPoForm({
          items: refreshedItems,
        });

        return;
      }

      if (allocatedQuantity <= 0) {
        alert(
          `${item.componentName}: enter a PO quantity greater than 0.`
        );
        return;
      }

      if (allocatedQuantity > shortageQuantity) {
        alert(
          `${item.componentName}: only ${shortageQuantity} unit(s) are still pending for Procurement. ` +
            `You entered ${allocatedQuantity}. Please use the current PO Remaining quantity.`
        );

        setPoForm((previous) => ({
          ...previous,
          items: previous.items.map(
            (currentItem) =>
              String(
                currentItem.componentId
              ) ===
              String(
                item.componentId
              )
                ? {
                    ...currentItem,
                    alreadyOrderedQuantity:
                      Number(
                        authoritativeRow
                          ?.alreadyOrderedQuantity ||
                          0
                      ),
                    shortageQuantity,
                    allocations:
                      currentItem.allocations.map(
                        (
                          allocation,
                          allocationIndex
                        ) =>
                          allocationIndex === 0
                            ? {
                                ...allocation,
                                quantity:
                                  String(
                                    shortageQuantity
                                  ),
                              }
                            : {
                                ...allocation,
                                quantity:
                                  "",
                              }
                      ),
                  }
                : currentItem
          ),
        }));

        return;
      }

      const invalidAllocation = (
        item.allocations || []
      ).find(
        (allocation) =>
          !allocation.vendor ||
          !allocation.expectedDeliveryDate ||
          Number(allocation.quantity) <= 0 ||
          Number(allocation.unitPrice) <= 0 ||
          String(
            allocation.gst ?? ""
          ).trim() === "" ||
          Number(allocation.gst) < 0 ||
          Number(allocation.gst) > 100
      );

      if (invalidAllocation) {
        alert(
          `Complete Vendor, PO Qty, Unit Price, GST and Delivery Date for ${item.componentName}.`
        );
        return;
      }
    }

    /*
     * Flatten the selected component/vendor rows first.
     *
     * This makes the vendor decision deterministic and also allows the
     * SAME vendor to be handled in two different ways:
     *
     *   COMBINE  -> one PO containing all selected components for vendor
     *   SEPARATE -> one PO per component/vendor allocation
     */
    const allocationRows = [];

    selectedItems.forEach(
      (item, itemIndex) => {
        (item.allocations || []).forEach(
          (allocation, allocationIndex) => {
            allocationRows.push({
              vendorName:
                allocation.vendor,

              expectedDeliveryDate:
                allocation.expectedDeliveryDate,

              componentId: Number(
                item.componentId
              ),

              componentCode:
                item.componentCode ||
                item.component_code ||
                "",

              componentName:
                item.componentName ||
                "Component",

              quantity: Number(
                allocation.quantity
              ),

              unitPrice: Number(
                allocation.unitPrice
              ),

              gst: Math.min(
                100,
                Number(
                  allocation.gst || 0
                )
              ),
              discount: Math.max(Number(allocation.discount || 0), 0),
              freight_cost: Math.max(Number(allocation.freightCost || 0), 0),
              freight_gst_percentage: Math.min(
                100,
                Math.max(Number(allocation.freightGst || 0), 0),
              ),
              roundOff: Number(allocation.roundOff || 0) || 0,
              uom: String(allocation.uom || "").trim(),

              /*
               * Keep an allocation identity so "Separate POs"
               * never accidentally merges two rows.
               */
              allocationKey:
                `${itemIndex}|||${allocationIndex}`,
            });
          }
        );
      }
    );

    if (allocationRows.length === 0) {
      alert(
        "Add at least one vendor allocation."
      );
      return;
    }

    /*
     * Detect a repeated vendor ONLY when that vendor is used by
     * two or more DISTINCT components.
     *
     * Example:
     *   Motor     -> Aero360
     *   Propeller -> Aero360
     *
     * This is where we ask Procurement whether those components
     * should be in one PO or separate POs.
     */
    const vendorComponentMap =
      new Map();

    allocationRows.forEach((row) => {
      const vendorKey = String(
        row.vendorName || ""
      )
        .trim()
        .toLowerCase();

      if (!vendorKey) {
        return;
      }

      if (
        !vendorComponentMap.has(
          vendorKey
        )
      ) {
        vendorComponentMap.set(
          vendorKey,
          {
            vendorName:
              row.vendorName,
            components: new Map(),
          }
        );
      }

      const componentKey = String(
        row.componentId ||
          row.componentCode ||
          row.componentName
      );

      vendorComponentMap
        .get(vendorKey)
        .components.set(
          componentKey,
          {
            componentId:
              row.componentId,
            componentCode:
              row.componentCode,
            componentName:
              row.componentName,
          }
        );
    });

    const duplicateVendorGroups =
      Array.from(
        vendorComponentMap.values()
      )
        .map((group) => ({
          vendorName:
            group.vendorName,

          components:
            Array.from(
              group.components.values()
            ),
        }))
        .filter(
          (group) =>
            group.components.length > 1
        );

    /*
     * First Submit click:
     * if the same vendor is used by multiple components, stop here
     * and ask Procurement how the PO(s) should be created.
     */
    if (
      !sameVendorMode &&
      duplicateVendorGroups.length > 0
    ) {
      setSameVendorPoChoice({
        groups:
          duplicateVendorGroups,
      });

      return;
    }

    /*
     * Build the actual Purchase Orders.
     */
    const groupedPurchaseOrders =
      new Map();

    allocationRows.forEach(
      (row, rowIndex) => {
        let groupKey = "";

        if (
          sameVendorMode ===
          "SEPARATE"
        ) {
          /*
           * Explicit separate choice:
           * every component/vendor allocation gets its own PO.
           */
          groupKey =
            `SEPARATE|||${row.allocationKey}`;
        } else if (
          sameVendorMode ===
          "COMBINE"
        ) {
          /*
           * Explicit single-PO choice:
           * all rows for the same vendor are combined.
           */
          groupKey =
            `VENDOR|||${String(
              row.vendorName || ""
            )
              .trim()
              .toLowerCase()}`;
        } else {
          /*
           * No duplicate vendor exists.
           * Preserve the existing default grouping rule.
           */
          groupKey =
            `${row.vendorName}|||` +
            `${row.expectedDeliveryDate}`;
        }

        if (
          !groupedPurchaseOrders.has(
            groupKey
          )
        ) {
          groupedPurchaseOrders.set(
            groupKey,
            {
              vendorName:
                row.vendorName,

              expectedDeliveryDate:
                row.expectedDeliveryDate,

              items: [],
            }
          );
        }

        const group =
          groupedPurchaseOrders.get(
            groupKey
          );

        /*
         * PurchaseOrder still has one header-level Expected Delivery
         * for backward compatibility. If a combined same-vendor PO has
         * different line dates, keep the latest date at PO header level.
         *
         * IMPORTANT: every PurchaseOrderItem also stores its own exact
         * expected_delivery_date and the PO Details page shows it per line.
         */
        if (
          sameVendorMode ===
            "COMBINE" &&
          String(
            row.expectedDeliveryDate ||
              ""
          ) >
            String(
              group.expectedDeliveryDate ||
                ""
            )
        ) {
          group.expectedDeliveryDate =
            row.expectedDeliveryDate;
        }

        group.items.push({
          component_id:
            row.componentId,

          quantity:
            row.quantity,

          unit_price:
            row.unitPrice,

          gst_percentage:
            row.gst,

          discount:
            row.discount,

          freight_cost:
            row.freight_cost,

          freight_gst_percentage:
            row.freight_gst_percentage,

          uom:
            row.uom,

          // Preserve the delivery date for THIS component.
          // A combined same-vendor PO may contain components with
          // different expected delivery dates.
          expected_delivery_date:
            row.expectedDeliveryDate,
        });

        group.roundOff =
          (group.roundOff || 0) + (Number(row.roundOff || 0) || 0);
      }
    );

    const purchaseOrderGroups =
      Array.from(
        groupedPurchaseOrders.values()
      );

    if (
      purchaseOrderGroups.length === 0
    ) {
      alert(
        "Add at least one vendor allocation."
      );
      return;
    }

    /*
     * The choice has now been consumed.
     */
    setSameVendorPoChoice(null);
    setPoSubmitting(true);

    try {
      const today =
        getLocalDateString();

      /*
       * Existing POs for this MR reuse the same base.
       * Example:
       * First PO  -> 03/26-27_01
       * Next PO   -> 03/26-27_02
       */
      const poNumberContext =
        await getMrPoNumberContext(
          sourceMrNumber
        );

      const createdPoNumbers = [];

      for (
        let index = 0;
        index <
        purchaseOrderGroups.length;
        index += 1
      ) {
        const group =
          purchaseOrderGroups[index];

        const suffix =
          poNumberContext.nextSuffix +
          index;

        const poNumber =
          `${poNumberContext.batchNumber}_` +
          `${String(suffix).padStart(
            2,
            "0"
          )}`;

        const payload = {
          vendor_name:
            group.vendorName,

          po_number:
            poNumber,

          /*
           * MR-linked standard PO:
           * Manager approval has already happened at MR stage.
           * Finance is the only PO approval stage.
           */
          status: "PENDING_FINANCE",

          approval_status:
            "PENDING_FINANCE",

          po_date: today,

          expected_delivery_date:
            group.expectedDeliveryDate,

          source_mr_number:
            sourceMrNumber,

          items: group.items,
          round_off: group.roundOff || 0,
        };

        const responseData =
          await fetchAuthenticatedJson(
            "/procurement/purchase-orders/",
            {
              method: "POST",
              timeoutMs: 60000,
              body: JSON.stringify(
                payload
              ),
            },
          );

        const createdPoNumber =
          responseData?.po_number ||
          responseData?.po ||
          poNumber;

        createdPoNumbers.push(
          createdPoNumber
        );

        await ensureFinanceNotificationForCreatedPO(
          responseData,
          createdPoNumber,
        );
      }

      /*
       * Recheck the MR after this submission.
       * Only when every shortage component has a PO
       * is the complete MR marked as PO Raised.
       */
      const latestPurchaseOrders =
        await fetchAllPurchaseOrders();

      setExistingPurchaseOrders(
        latestPurchaseOrders
      );

      const remainingComponents =
        getRemainingPoShortageRows(
          selectedPoRequest,
          latestPurchaseOrders
        );

      if (
        remainingComponents.length === 0
      ) {
        const marked =
          await handleMarkPoRaised(
            selectedPoRequest
          );

        if (!marked) {
          alert(
            `Purchase Order(s) ${createdPoNumbers.join(
              ", "
            )} were created, but the Material Request could not be marked as PO raised.`
          );

          navigate(
            "/purchase-orders"
          );

          return;
        }

        await clearProcurementBellNotifications(
          selectedPoRequest
        );

        const raisedNotificationId = String(
          getNotificationId(selectedPoRequest),
        );
        setNotifications((previous) =>
          previous.map((notification) =>
            String(notification.id || notification.material_request_id) === raisedNotificationId
              ? { ...notification, po_raised: true }
              : notification,
          ),
        );

        setShowCreatePoModal(false);
        setSelectedPoRequest(null);

        setPoForm({
          items: [],
        });

        return;
      }

      /*
       * Some components still need POs.
       * Keep the MR notification active and do not set
       * the complete MR-level po_raised flag.
       */
      setShowCreatePoModal(false);
      setSelectedPoRequest(null);

      setPoForm({
        items: [],
      });

      await loadNotifications();

      const remainingPoQuantity =
        remainingComponents.reduce(
          (sum, row) =>
            sum +
            Number(
              row.remainingShortageQuantity ||
                0
            ),
          0
        );

      alert(
        `Purchase Order(s) ${createdPoNumbers.join(
          ", "
        )} created successfully. ` +
          `${remainingComponents.length} component(s), totaling ${remainingPoQuantity} unit(s), are still pending under MR ${sourceMrNumber}.`
      );
    } catch (err) {
      console.error(
        "Failed to create Purchase Orders",
        err
      );

      alert(
        `Error creating PO: ${err.message}`
      );
    } finally {
      setPoSubmitting(false);
    }
  };


  const handleCloseRejectModal = () => {
    setShowRejectModal(false);
    setActiveRejectNotification(null);
    setPendingRejectStatus("");
    setRejectReason("");
  };

  const handleConfirmReject = async () => {
    if (!activeRejectNotification) return;

    await updateStatus(
      activeRejectNotification.id,
      pendingRejectStatus,
      rejectReason.trim()
    );

    handleCloseRejectModal();
  };

  const isViewingExistingReject = () =>
    activeRejectNotification?.status === "REJECTED";


  // ✅ BOM click handler (same style as MaterialRequestsPage)
const handleBomClick = async (bomId) => {
  try {
    const res = await fetch(
      `${`${config.baseURL}/bom/bom/`}${bomId}/`
    );
    const data = await res.json();

    setBomDetails(data);
    setRdDetails(null);
    setModalType("BOM");
    setShowBomModal(true);
  } catch (err) {
    console.error(err);
  }
};


/*
 * Normalize only the data stored inside the Material Request detail.
 * Do not calculate or fetch current Inventory for the MR Details popup.
 */
const normalizeMrDetailsItem = (item = {}) => {
  const componentObject =
    item?.component && typeof item.component === "object"
      ? item.component
      : item?.component_details ||
        item?.component_obj ||
        item?.component_data ||
        {};

  /*
   * This is the immutable quantity captured when the MR was created.
   * An explicit value of 0 is valid and must stay 0.
   */
  const creationInventoryQuantity =
    item?.creation_inventory_quantity ??
    item?.created_inventory_quantity ??
    item?.inventory_snapshot_quantity ??
    item?.inventory_quantity ??
    item?.inventoryQuantity ??
    item?.inventory_qty ??
    item?.inventoryQty ??
    0;

  return {
    ...item,

    component_code:
      item?.component_code ||
      item?.componentCode ||
      componentObject?.component_id ||
      componentObject?.component_code ||
      "",

    component_name:
      item?.component_name ||
      item?.componentName ||
      componentObject?.name ||
      componentObject?.component_name ||
      "",

    category:
      item?.category ||
      item?.category_name ||
      componentObject?.category ||
      "",

    specification:
      item?.specification ||
      item?.specifications ||
      componentObject?.specification ||
      componentObject?.specifications ||
      "",

    quantity: Number(
      item?.quantity ??
      item?.qty ??
      item?.quantity_requested ??
      0
    ),

    /*
     * Force the popup to use the MR creation snapshot.
     * Later reservation/current-stock values must not replace it.
     */
    creation_inventory_quantity: creationInventoryQuantity,
    inventory_quantity: creationInventoryQuantity,
  };
};


// Open BOM / Custom BOM / R&D using the exact MR detail endpoint.
// This matches the Material Requests Details page and does not fetch Inventory.
const handleMrBomClick = async (request) => {
  const type = String(
    request?.request_type || ""
  )
    .trim()
    .toUpperCase();

  if (
    ![
      "BOM",
      "CUSTOM BOM",
      "R&D",
      "RD",
    ].includes(type)
  ) {
    return;
  }

  const requestDatabaseId =
    request?.id ??
    request?.pk;

  if (
    requestDatabaseId === undefined ||
    requestDatabaseId === null ||
    requestDatabaseId === ""
  ) {
    alert("Unable to open MR details because the Material Request database ID is missing.");
    return;
  }

  try {
    /*
     * Important:
     * Load only this Material Request. Do not call Inventory APIs here.
     */
    const requestDetails =
      await fetchAuthenticatedJson(
        `${config.baseURL}/materialrequest/material-requests/${encodeURIComponent(
          requestDatabaseId,
        )}/`,
      );

    const detailSources = [
      requestDetails?.bom_items,
      requestDetails?.custom_bom_items,
      requestDetails?.rd_items,
      requestDetails?.request_items,
      requestDetails?.items,
    ];
    const seenDetailComponents = new Set();
    const normalizedAllItems = detailSources
      .filter(Array.isArray)
      .flat()
      .filter((item) => {
        const key = [
          item?.component_id,
          item?.component_code,
          item?.component,
          item?.component_name,
          item?.name,
        ]
          .filter((value) => value !== undefined && value !== null && String(value).trim())
          .map((value) => String(value).trim().toLowerCase())
          .join("|");

        if (!key || seenDetailComponents.has(key)) return false;
        seenDetailComponents.add(key);
        return true;
      })
      .map(normalizeMrDetailsItem);

    const normalizedBomItems =
      type === "BOM" || type === "CUSTOM BOM"
        ? normalizedAllItems
        : [];
    const normalizedCustomBomItems = [];
    const normalizedRdItems =
      type === "R&D" || type === "RD"
        ? normalizedAllItems
        : [];
    const normalizedRequestItems = normalizedAllItems;

    setRdDetails({
      ...requestDetails,
      bom_items: normalizedBomItems,
      custom_bom_items: normalizedCustomBomItems,
      rd_items: normalizedRdItems,
      request_items: normalizedRequestItems,
    });

    setBomDetails(null);
    setModalType(
      type === "R&D" || type === "RD"
        ? "RD"
        : type,
    );
    setShowBomModal(true);
  } catch (error) {
    console.error(
      "Failed to load Material Request details:",
      error,
    );

    alert(
      error?.message ||
      "Unable to load Material Request details.",
    );
  }
};

  const activePoVendors = vendors.filter(
    (vendor) =>
      vendor.is_active ||
      String(vendor.status || "").toLowerCase() === "active"
  );

  const poTotals = poForm.items.reduce(
    (totals, item) =>
      (item.allocations || []).reduce(
        (allocationTotals, allocation) => {
          const line = getPoAllocationTotals(allocation);
          return {
            basic: allocationTotals.basic + line.basicAmount,
            discount: allocationTotals.discount + line.discount,
            gst: allocationTotals.gst + line.gstAmount,
            freight: allocationTotals.freight + line.freightCost,
            freightGst: allocationTotals.freightGst + line.freightGstAmount,
            total: allocationTotals.total + line.lineTotal,
          };
        },
        totals,
      ),
    {basic: 0, discount: 0, gst: 0, freight: 0, freightGst: 0, total: 0},
  );

  const poSubtotal = poTotals.basic - poTotals.discount + poTotals.gst + poTotals.freight + poTotals.freightGst;
  const poGstTotal = poTotals.gst;
  const poGrandTotal = poTotals.total;

  return (
    <PageShell>
      <PageHeader
        title="Material Request Notifications"
        subtitle="Approve or reject material requests and view BOM details"
      />

      {/* Notification tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            setActiveTab("MR")
          }
          className={`inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold transition ${
            activeTab === "MR"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          MR ({notifications.length})
        </button>

        {isProcurement && (
          <button
            type="button"
            onClick={() =>
              setActiveTab(
                "QC_FAILED",
              )
            }
            className={`inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold transition ${
              activeTab ===
              "QC_FAILED"
                ? "border-rose-600 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            QC Failed ({qcFailedNotifications.length})
          </button>
        )}
      </div>

      {activeTab === "MR" && (
        <>
      {/* TABLE */}
      <div className="bg-white dark:bg-gray-900 border rounded-xl overflow-hidden">

        {/* HEADER */}
        <div className="grid grid-cols-8 bg-slate-100 dark:bg-slate-900 text-xs uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 px-4 py-3 items-center">
          <div className="">Requester</div>
          <div className="">MR ID</div>
          <div className="">Date</div>
          <div className="">Project</div>
          <div className="text-center">Request type</div>
          <div className="text-center">Qty</div>
          <div className="text-center">Status</div>
          <div className="text-right">Action</div>
        </div>

        {/* ROWS */}
        <div className="divide-y">
{loading && (
  <NotificationTableLoader
    title="Loading material request notifications..."
    subtitle="Fetching the latest request and workflow details."
  />
)}
{!loading && notifications.length === 0 && (
  <div className="p-12 text-center text-slate-500 dark:text-slate-400">
    No pending material requests for this role.
  </div>
)}

{!loading && notifications
  .filter(
    (n) =>
      isProcurement ||
      !hiddenIds.includes(
        String(
          n.id ||
            n.material_request_id
        )
      )
  )
  .map((n) => {
 const approvalStatus = String(
  n.approval_status || ""
)
  .trim()
  .toUpperCase();

const workflowStatus = String(
  n.status || ""
)
  .trim()
  .toUpperCase();

const status = isProcurement
  ? workflowStatus
  : approvalStatus;
  const shortageRows =
    isProcurement
      ? getRemainingPoShortageRows(
          n,
          existingPurchaseOrders
        )
      : getRequestShortageRows(n);

  return (
    <React.Fragment key={n.id || n.material_request_id}>
      <div
        className="grid grid-cols-8 px-4 py-3 items-center hover:bg-slate-50 transition-colors dark:hover:bg-slate-800"
      >
      <div>{n.requester_name || "-"}</div>

      <div className="font-medium text-slate-700 dark:text-slate-200">
        {n.material_request_id || n.request_id || "-"}
      </div>

      <div>{n.date || "-"}</div>

      <div>{n.project || "-"}</div>

<div className="text-sm text-slate-700 dark:text-slate-200 text-center flex items-center justify-center">

  <button
    onClick={() => handleMrBomClick(n)}
    className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium hover:bg-blue-100 hover:text-blue-600 transition"
  >
    {isFromScrapProcurementRequest(n)
      ? "From Scrap"
      : n.request_type || "MR"}
  </button>

</div>

      <div className="text-center font-semibold text-slate-800 dark:text-slate-100">{n.required_quantity || "-"}</div>

      <div className="text-center">
        <button
          type="button"
          onClick={() => {
            const rejectContent =
              n.rejectionReason ||
              n.rejection_reason ||
              n.rejectReason ||
              n.reject_reason ||
              n.reject_note ||
              n.rejectNote ||
              n.remarks ||
              n.message ||
              n.note ||
              n.comment ||
              n.reason ||
              "";

           if (
  (status === "REJECTED" || status === "MANAGER_REJECTED")
  && rejectContent
) {
              setActiveRejectNotification(n);
              setPendingRejectStatus("REJECTED");
              setRejectReason(rejectContent);
              setShowRejectModal(true);
            }
          }}
          className="rounded-full"
          style={{ outline: "none" }}
        >
          <StatusBadge status={status} rejectedBy={n.rejectedBy} />
        </button>
      </div>

      <div className="flex justify-end gap-2">

        {(status === "REQUESTED" && isManager) && (
          <>
            <button
              disabled={isDecisionProcessing(`MR:${String(n.id ?? "")}`)}
              onClick={() => updateStatus(n.id, "MANAGER_APPROVED")}
              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              {isDecisionProcessing(`MR:${String(n.id ?? "")}`)
                ? "Approving..."
                : "Manager Approve"}
            </button>

            <button
              onClick={() => handleOpenRejectModal(n, "REJECTED")}
              className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 dark:bg-rose-600 dark:hover:bg-rose-700"
            >
              Manager Reject
            </button>
          </>
        )}
{(
  isProcurement &&
  workflowStatus ===
    "PROCUREMENT_PENDING" &&
  !n.po_raised
) && (
  <button
    type="button"
    onClick={() => {
      setSelectedPoRequest(n);
      setShowPoConfirmModal(true);
    }}
    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
  >
    Raise PO
  </button>
)}
        {n.po_raised && (
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded dark:bg-blue-900 dark:text-blue-200">
              PO Raised
            </span>
            <button
              type="button"
              onClick={() => removeNotification(n.id || n.material_request_id)}
              className="px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Remove
            </button>
          </div>
        )}

        {(status === "PENDING_MANAGER" && isManager) && (
          <>
            <button
              disabled={isDecisionProcessing(`MR:${String(n.id ?? "")}`)}
              onClick={() => updateStatus(n.id, "MANAGER_APPROVED")}
              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              {isDecisionProcessing(`MR:${String(n.id ?? "")}`)
                ? "Approving..."
                : "Manager Approve"}
            </button>

            <button
              onClick={() => handleOpenRejectModal(n, "REJECTED")}
              className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 dark:bg-rose-600 dark:hover:bg-rose-700"
            >
              Manager Reject
            </button>
          </>
        )}

        {/* Show status when approved or waiting for next level */}
        {(status === "MANAGER_APPROVED" && isAdmin) && (
          <span className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded dark:bg-blue-900 dark:text-blue-200">
            Awaiting Manager
          </span>
        )}

      {(["APPROVED", "REJECTED", "MANAGER_REJECTED"].includes(status)) && (
          <>
            <span className="px-3 py-1 text-xs bg-slate-100 text-slate-800 rounded dark:bg-slate-800 dark:text-slate-100">
            {
 status === "APPROVED"
 ? "✓ Approved"
 : "✗ Manager Rejected"
}
            </span>
            <button
              onClick={() => removeNotification(n.id)}
              className="px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Remove
            </button>
          </>
        )}

      </div>
    </div>
      {shortageRows.length > 0 && (
        <div className="col-span-8 px-4 pb-4 bg-slate-50 dark:bg-slate-900">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
            <table className="w-full text-sm">
                <thead className="bg-slate-100 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <tr>
                    <th className="px-4 py-3">Component</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-center">
                          {isProcurement ? "Required for Routing" : "Requested"}
                        </th>
                    <th className="px-4 py-3 text-center">Inventory</th>

                    {isProcurement && (
                      <>
                        <th className="px-4 py-3 text-center">
                          Already PO
                        </th>
                        <th className="px-4 py-3 text-center">
                          PO Remaining
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {shortageRows.map((item, idx) => (
                    <tr key={idx} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                        <div className="truncate text-sm">
                           {item.component_display || `${item.component_code} - ${item.component_name}`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{item.category || "-"}</td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-800 dark:text-slate-100">
                        {item.requestedQty}
                      </td>

                      <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-300">
                        {item.inventoryQty}
                      </td>

                      {isProcurement && (
                        <>
                          <td className="px-4 py-3 text-center font-medium text-blue-600 dark:text-blue-400">
                            {item.alreadyOrderedQuantity ?? 0}
                          </td>

                          <td className="px-4 py-3 text-center font-semibold text-amber-700 dark:text-amber-300">
                            {item.remainingShortageQuantity ??
                              item.shortageQty ??
                              0}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
            </table>
          </div>
        </div>
      )}
    </React.Fragment>
  );
})}
        </div>
      </div>

        </>
      )}

      {activeTab === "QC_FAILED" && isProcurement && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[0.8fr_1.05fr_1.05fr_1.6fr_0.65fr_1fr_1.65fr] items-center border-b border-border bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <div>Action Type</div>
            <div>MR ID</div>
            <div>Source PO</div>
            <div>Component</div>
            <div className="text-center">Failed Qty</div>
            <div className="text-center">Status</div>
            <div className="text-center">Action</div>
          </div>

          <div className="divide-y divide-border">
            {loading ? (
              <NotificationTableLoader
                title="Loading QC Failed notifications..."
                subtitle="Fetching the latest QC Failed requests for Procurement."
              />
            ) : qcFailedNotifications.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No QC Failed requests for Procurement.
              </div>
            ) : (
              qcFailedNotifications.map((row) => {
                const rowKey = String(
                  row?.id ||
                    row?.sourceId ||
                    "",
                );

                const processing =
                  String(
                    qcProcessingId ||
                      "",
                  ) === rowKey;

                const rowStatus =
                  String(
                    row?.status ||
                      "PENDING_PROCUREMENT",
                  )
                    .trim()
                    .toUpperCase();

                const isPending =
                  rowStatus ===
                  "PENDING_PROCUREMENT";

                const isApproved =
                  rowStatus ===
                  "PROCUREMENT_APPROVED";

                const isRejected =
                  rowStatus ===
                  "PROCUREMENT_REJECTED";

                const statusLabel =
                  isApproved
                    ? "Approved"
                    : isRejected
                      ? "Rejected"
                      : "Pending Procurement";

                const statusClass =
                  isApproved
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : isRejected
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-amber-200 bg-amber-50 text-amber-700";

                return (
                  <div
                    key={rowKey}
                    className="grid grid-cols-[0.8fr_1.05fr_1.05fr_1.6fr_0.65fr_1fr_1.65fr] items-center px-4 py-4 text-sm hover:bg-muted/20"
                  >
                    <div className="font-semibold">
                      {row?.requestLabel ||
                        "QC Failed"}
                    </div>

                    <div>
                      {row?.mrNumber ||
                        "-"}
                    </div>

                    <div>
                      {row?.poNumber ||
                        "-"}
                    </div>

                    <div className="break-words pr-2">
                      {row?.componentLabel ||
                        "-"}
                    </div>

                    <div className="text-center font-bold">
                      {Number(
                        row?.failedQty ||
                          0,
                      )}
                    </div>

                    <div className="text-center">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                        title={
                          isRejected
                            ? row?.rejectionReason ||
                              row?.rejection_reason ||
                              ""
                            : ""
                        }
                      >
                        {statusLabel}
                      </span>
                    </div>

                    <div className="flex flex-wrap justify-center gap-2">
                      {isPending ? (
                        <>
                          <button
                            type="button"
                            disabled={processing}
                            onClick={() =>
                              void approveQcFailedNotification(
                                row,
                              )
                            }
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {processing
                              ? "Processing..."
                              : row?.sourceType ===
                                  "RETURNABLE_RESTORE"
                                ? "Approve Restore"
                                : row?.sourceType ===
                                    "DIRECT_REFUND"
                                  ? "Approve Refund"
                                  : "Approve Replacement"}
                          </button>

                          {row?.sourceType ===
                            "INWARD_REPLACEMENT" && (
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() =>
                                void rejectQcFailedReplacement(
                                  row,
                                )
                              }
                              className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Reject Replacement
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() =>
                            void removeQcFailedNotification(
                              row,
                            )
                          }
                          className="rounded-lg bg-slate-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {processing
                            ? "Removing..."
                            : "Remove"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* BOM MODAL */}
{/* PROFESSIONAL MODAL (same style as MaterialRequestsPage) */}
{showBomModal && (
  <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center px-4">
    <div className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-2xl w-[1450px] max-w-[97vw] max-h-[85vh] overflow-hidden shadow-2xl border border-gray-200 dark:border-slate-700">

      {/* HEADER */}
      <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
         {
 modalType === "BOM"
 ? "BOM Details"
 : modalType === "CUSTOM BOM"
 ? "Custom BOM Details"
 : "R & D Details"
}
        </h2>

        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
{
 modalType === "BOM" || modalType === "CUSTOM BOM"
 ? rdDetails?.material_request_id
 : "R & D Components"
}
        </p>
      </div>

      {/* BODY */}
      <div className="overflow-auto max-h-[62vh] bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">

        <table className="min-w-[1450px] w-full text-sm">

          {/* ================= BOM ================= */}
{(modalType === "BOM" || modalType === "CUSTOM BOM") && rdDetails && (
<>
<thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
  <tr>
    <th className="px-5 py-3 text-left">Component Name</th>
    <th className="px-5 py-3 text-left">Category</th>
    <th className="px-5 py-3 text-left">Specification</th>
    <th className="px-5 py-3 text-center">Qty</th>
    <th className="px-5 py-3 text-center">Inventory Qty</th>
  </tr>
</thead>

<tbody>
{[
  ...(rdDetails.bom_items || []),
  ...(rdDetails.custom_bom_items || [])
].map((item, i) => {

  return (
    <tr
      key={i}
      className="border-b border-slate-200 dark:border-slate-800"
    >

      <td className="px-5 py-3 font-medium">
        {item.component_code || item.component_name || "-"}
        {item.component_name &&
          ` — ${item.component_name}`
        }
      </td>

      <td className="px-5 py-3">
        {item.category || "-"}
      </td>

      <td className="px-5 py-3">
        {item.specification || "-"}
      </td>

      <td className="px-5 py-3 text-center">
        {item.quantity || item.qty || 0}
      </td>

      <td className="px-5 py-3 text-center">
        {getMrCreatedInventoryQuantity(item)}
      </td>

    </tr>
  );
})}
</tbody>
</>
)}

          {/* ================= R&D ================= */}
          {modalType === "RD" && rdDetails && (
            <>
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                <tr>
                  <th className="px-5 py-3 text-center">Component ID</th>
                  <th className="px-5 py-3 text-center">Component Name</th>
                  <th className="px-5 py-3 text-center">Category</th>
                  <th className="px-5 py-3 text-center">Component Type</th>
                  <th className="px-5 py-3 text-center">Specification</th>
                  <th className="px-5 py-3 text-center">Requested Qty</th>
                  <th className="px-5 py-3 text-center">UOM</th>
                  <th className="px-5 py-3 text-center">Delivered</th>
                  <th className="px-5 py-3 text-center">QC Passed</th>
                  <th className="px-5 py-3 text-center">Issued to Engineer</th>
                  <th className="px-5 py-3 text-center">Remaining</th>
                  <th className="px-5 py-3 text-center">Component Status</th>
                  <th className="px-5 py-3 text-center">In Store at MR Creation</th>
                  <th className="px-5 py-3 text-center">Reserved by Other MR</th>
                  <th className="px-5 py-3 text-center">Available for this MR</th>
                  <th className="px-5 py-3 text-center">Stock Status</th>
                </tr>
              </thead>

              <tbody>
                {(
                  Array.isArray(rdDetails.rd_items) &&
                  rdDetails.rd_items.length > 0
                    ? rdDetails.rd_items
                    : rdDetails.request_items || []
                ).map((item, i) => {
                  const qty = Number(item.quantity || 0);
                  const delivered = Number(
                    item.delivered_quantity ??
                      item.quantity_received ??
                      0,
                  );
                  const qcPassed = Number(
                    item.qc_passed_quantity ??
                      item.qcPassedQuantity ??
                      0,
                  );
                  const issued = Number(
                    item.issued_quantity ??
                      (Number(item.issued_store_quantity || 0) +
                        Number(item.issued_purchased_quantity || 0)),
                  );
                  const remaining = Number(
                    item.remaining_quantity ??
                      Math.max(qty - issued, 0),
                  );
                  const inventoryQty = getMrCreatedInventoryQuantity(item);

                  return (
                    <tr key={i} className="border-b border-slate-200 dark:border-slate-800">
                      <td className="px-5 py-3 text-center font-medium">
                        {item.component_code || item.component_id || "-"}
                      </td>
                      <td className="px-5 py-3 text-center font-medium">
                        {item.component_display ||
                          [item.component_code, item.component_name]
                            .filter(Boolean)
                            .join(" - ") ||
                          item.component ||
                          "-"}
                      </td>
                      <td className="px-5 py-3 text-center">{item.category || "-"}</td>
                      <td className="px-5 py-3 text-center">{item.component_type || "-"}</td>
                      <td className="px-5 py-3 text-center">
                        {item.specifications || item.specification || "-"}
                      </td>
                      <td className="px-5 py-3 text-center">{qty}</td>
                      <td className="px-5 py-3 text-center">{item.unit || item.uom || "-"}</td>
                      <td className="px-5 py-3 text-center">{delivered}</td>
                      <td className="px-5 py-3 text-center">{qcPassed}</td>
                      <td className="px-5 py-3 text-center">{issued}</td>
                      <td className="px-5 py-3 text-center">{remaining}</td>
                      <td className="px-5 py-3 text-center">{item.status || item.workflow_status || "-"}</td>
                      <td className="px-5 py-3 text-center">{inventoryQty}</td>
                      <td className="px-5 py-3 text-center">{item.reserved_by_other_mrs || 0}</td>
                      <td className="px-5 py-3 text-center">{item.available_inventory_quantity ?? inventoryQty}</td>
                      <td className="px-5 py-3 text-center">
                        {inventoryQty > 0 ? "Available" : "Unavailable"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </>
          )}

        </table>
      </div>
{(modalType === "BOM" || modalType === "CUSTOM BOM") && rdDetails && (
<div className="px-6 py-4 border-t">
  <span>
    Total items: {
      [
        ...(rdDetails.bom_items || []),
        ...(rdDetails.custom_bom_items || [])
      ].length
    }
  </span>
</div>
)}

      {/* FOOTER (same style as your other page) */}
      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 flex justify-between items-center">

        <span className="text-xs text-gray-400 dark:text-slate-500">
Totals items:
{
 modalType === "BOM" || modalType === "CUSTOM BOM"
 ?
 (
   (rdDetails?.bom_items?.length || 0) +
   (rdDetails?.custom_bom_items?.length || 0)
 )
 :
 (
   Array.isArray(rdDetails?.rd_items) &&
   rdDetails.rd_items.length > 0
     ? rdDetails.rd_items.length
     : rdDetails?.request_items?.length || 0
 )
}
        </span>

        <button
          onClick={() => {
            setShowBomModal(false);
            setBomDetails(null);
            setRdDetails(null);
            setModalType(null);
          }}
          className="px-5 py-2 rounded-lg text-white"
          style={{ backgroundColor: "#E85D75" }}
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
              
              {/* MR ID */}
              <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Material Request ID</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {activeRejectNotification?.material_request_id || activeRejectNotification?.id || "-"}
                </p>
              </div>

              {/* Rejected By */}
              {activeRejectNotification?.rejectedBy && (
                <div className="mt-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Rejected By</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 capitalize">
                    {activeRejectNotification.rejectedBy}
                  </p>
                </div>
              )}

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
                Enter a reason for the rejection. This will be saved with the request and shown when the reject badge is clicked.
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={5}
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

    {showPoConfirmModal && selectedPoRequest && (
      <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center px-4" style={{ position: "fixed", inset: 0 }}>
        <div className="w-full max-w-[760px] rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900" style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>

      <h2 className="text-lg font-semibold mb-3">
        Purchase Order Confirmation
      </h2>

      <p className="text-slate-600 dark:text-slate-300 mb-4">
        Only components still requiring fulfillment after GOOD / reusable From-Scrap serials and In-Store reservation are shown below.
      </p>

      <div className="border rounded-lg overflow-x-auto mb-5">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2 text-left">Component</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-center">
                Required for PO
              </th>
              <th className="px-3 py-2 text-center">
                Available
              </th>
              <th className="px-3 py-2 text-center">
                Already PO
              </th>
              <th className="px-3 py-2 text-center">
                PO Remaining
              </th>
            </tr>
          </thead>

          <tbody>
            {getRemainingPoShortageRows(
              selectedPoRequest,
              existingPurchaseOrders
            ).map((item, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">
                  {item.component_display}
                </td>

                <td className="px-3 py-2">
                  {item.category || "-"}
                </td>

                <td className="px-3 py-2 text-center">
                  {item.requestedQty}
                </td>

                <td className="px-3 py-2 text-center text-red-600 font-semibold">
                  {item.inventoryQty}
                </td>

                <td className="px-3 py-2 text-center text-blue-600 font-semibold">
                  {item.alreadyOrderedQuantity ?? 0}
                </td>

                <td className="px-3 py-2 text-center text-amber-700 font-semibold">
                  {item.remainingShortageQuantity ??
                    item.shortageQty ??
                    0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-medium mb-5">
        Did you want to raise the Purchase Order?
      </p>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => {
            setShowPoConfirmModal(false);
            setSelectedPoRequest(null);
          }}
          className="px-4 py-2 border rounded-lg"
        >
          No
        </button>

        <button
          onClick={confirmPoRaised}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Yes
        </button>
      </div>

    </div>
  </div>
)}

    {sameVendorPoChoice && (
      <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/55 px-4">
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-6 py-5 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Same Vendor Selected
            </h2>

            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Multiple selected components use the same vendor. Choose how you want to create the Purchase Order.
            </p>
          </div>

          <div className="max-h-[55vh] overflow-y-auto p-6">
            <div className="space-y-4">
              {sameVendorPoChoice.groups.map(
                (group) => (
                  <div
                    key={group.vendorName}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Vendor
                        </p>

                        <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                          {group.vendorName}
                        </p>
                      </div>

                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        {group.components.length} Components
                      </span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {group.components.map(
                        (
                          component,
                          index
                        ) => (
                          <div
                            key={`${group.vendorName}-${component.componentId}-${index}`}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                          >
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {component.componentName}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
              <strong>Create Single PO:</strong>{" "}
              components using the same vendor will be combined into one PO.
              Each component keeps its own Expected Delivery Date and that date will be shown in the PO line items.
            </div>

            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <strong>Create Separate POs:</strong>{" "}
              each selected component/vendor allocation will receive its own PO number.
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
            <button
              type="button"
              onClick={() =>
                setSameVendorPoChoice(
                  null
                )
              }
              disabled={poSubmitting}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() =>
                void submitPurchaseOrder(
                  "SEPARATE"
                )
              }
              disabled={poSubmitting}
              className="rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:bg-slate-900 dark:text-blue-300"
            >
              Create Separate POs
            </button>

            <button
              type="button"
              onClick={() =>
                void submitPurchaseOrder(
                  "COMBINE"
                )
              }
              disabled={poSubmitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Create Single PO
            </button>
          </div>
        </div>
      </div>
    )}

    {showCreatePoModal &&
      selectedPoRequest && (
        <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center px-4" style={{ position: "fixed", inset: 0 }}>
        <div className="w-full max-w-[1200px] bg-white dark:bg-slate-900 rounded-2xl h-[92vh] max-h-[92vh] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col" style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>

            {/* Header */}
          <div className="shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold">
                Create Purchase Order
              </h2>

              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Material Request:{" "}
                {selectedPoRequest.material_request_id ||
                  selectedPoRequest.request_id ||
                  selectedPoRequest.id}
              </p>

              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                Fill only the components you want to
                order now. Leave the other components
                completely blank; they will remain pending
                under the same MR for a later PO.
              </p>
            </div>

            {/* Body */}
          <div className="flex-1 min-h-0 p-6 overflow-y-auto space-y-5">
              {poForm.items.map(
                (item, itemIndex) => {
                  const allocatedQuantity =
                    getAllocatedQuantity(
                      item
                    );

                  const remainingQuantity =
                    getRemainingQuantity(
                      item
                    );

                  return (
                    <section
                      key={`${item.componentCode}-${itemIndex}`}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                    >
                      {/* Component name at top */}
                      <div className="bg-slate-50 dark:bg-slate-800 px-5 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Component
                          </p>

                          <h3 className="text-base font-semibold mt-1">
                            {
                              item.componentName
                            }
                          </h3>

                          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            <p className="font-semibold text-slate-600 dark:text-slate-300">
                              Last purchase details
                            </p>
                            <p>
                              Vendor: {item.allocations?.[0]?.lastPurchaseVendor || "-"} | Price: {item.allocations?.[0]?.lastPurchasePrice !== "" && item.allocations?.[0]?.lastPurchasePrice != null ? `₹${Number(item.allocations[0].lastPurchasePrice).toFixed(2)}` : "-"} | Date: {item.allocations?.[0]?.lastPurchaseDate ? new Date(item.allocations[0].lastPurchaseDate).toLocaleDateString("en-IN") : "-"}
                            </p>
                            <p>
                              Lowest: {item.allocations?.[0]?.lowestPurchase ? `₹${Number(item.allocations[0].lowestPurchase.price).toFixed(2)} | ${item.allocations[0].lowestPurchase.vendor || "-"} | ${item.allocations[0].lowestPurchase.date ? new Date(item.allocations[0].lowestPurchase.date).toLocaleDateString("en-IN") : "-"}` : "-"}
                            </p>
                            <p>
                              Highest: {item.allocations?.[0]?.highestPurchase ? `₹${Number(item.allocations[0].highestPurchase.price).toFixed(2)} | ${item.allocations[0].highestPurchase.vendor || "-"} | ${item.allocations[0].highestPurchase.date ? new Date(item.allocations[0].highestPurchase.date).toLocaleDateString("en-IN") : "-"}` : "-"}
                            </p>
                            <p>HSN No: {item.allocations?.[0]?.hsnNo || "-"}</p>
                          </div>

                          {!item.componentId && (
                            <p className="text-xs text-red-600 mt-1">
                              Component database ID
                              not found
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 text-xs font-medium">
                          <span className="rounded-full bg-slate-200 px-3 py-1 dark:bg-slate-700">
                            Shortage:{" "}
                            {
                              item.shortageQuantity
                            }
                          </span>

                          <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700 dark:bg-blue-950 dark:text-blue-200">
                            Allocated:{" "}
                            {
                              allocatedQuantity
                            }
                          </span>

                          <span
                            className={
                              remainingQuantity ===
                              0
                                ? "rounded-full bg-green-100 px-3 py-1 text-green-700 dark:bg-green-950 dark:text-green-200"
                                : "rounded-full bg-amber-100 px-3 py-1 text-amber-700 dark:bg-amber-950 dark:text-amber-200"
                            }
                          >
                            Remaining:{" "}
                            {
                              remainingQuantity
                            }
                          </span>
                        </div>
                      </div>

                      {/* Vendor line items */}
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1750px] text-sm">
                          <thead className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                            <tr>
                              <th className="px-4 py-3 text-left">
                                Vendor *
                              </th>

                              <th className="px-4 py-3 text-center">
                                PO Qty *
                              </th>

                              <th className="px-4 py-3 text-left">
                                UOM
                              </th>

                              <th className="px-4 py-3 text-right">
                                Unit Price (₹) *
                              </th>

                              <th className="px-4 py-3 text-right">
                                Discount (₹)
                              </th>

                              <th className="px-4 py-3 text-right">
                                GST % *
                              </th>

                              <th className="px-4 py-3 text-right">
                                Freight Cost (₹)
                              </th>

                              <th className="px-4 py-3 text-right">
                                Freight GST % / Amount
                              </th>

                              <th className="px-4 py-3 text-right">
                                Round Off (₹)
                              </th>

                              <th className="px-4 py-3 text-left">
                                Expected Delivery *
                              </th>

                              <th className="px-4 py-3 text-right">
                                Total (₹)
                              </th>

                              <th className="px-4 py-3 text-center">
                                Action
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {(
                              item.allocations ||
                              []
                            ).map(
                              (
                                allocation,
                                allocationIndex
                              ) => {
                                const otherAllocatedQuantity =
                                  (
                                    item.allocations ||
                                    []
                                  ).reduce(
                                    (
                                      sum,
                                      currentAllocation,
                                      currentAllocationIndex
                                    ) =>
                                      currentAllocationIndex ===
                                      allocationIndex
                                        ? sum
                                        : sum +
                                          Number(
                                            currentAllocation.quantity ||
                                              0
                                          ),
                                    0
                                  );

                                const maximumQuantityForRow =
                                  Math.max(
                                    0,
                                    Number(
                                      item.shortageQuantity ||
                                        0
                                    ) -
                                      otherAllocatedQuantity
                                  );

                                const allocationTotals =
                                  getPoAllocationTotals(allocation);

                                return (
                                  <tr
                                    key={`${item.componentCode}-${allocationIndex}`}
                                    className="border-t border-slate-200 dark:border-slate-700"
                                  >
                                    {/* Vendor */}
                                    <td className="px-4 py-3">
                                      <select
                                        value={
                                          allocation.vendor
                                        }
                                        onChange={(
                                          event
                                        ) =>
                                          updatePoAllocation(
                                            itemIndex,
                                            allocationIndex,
                                            "vendor",
                                            event
                                              .target
                                              .value
                                          )
                                        }
                                        className="h-10 w-56 rounded-lg border border-slate-300 bg-white px-3 dark:bg-slate-950 dark:border-slate-700"
                                      >
                                        <option value="">
                                          Select
                                          vendor
                                        </option>

                                        {activePoVendors.map(
                                          (
                                            vendor
                                          ) => {
                                            const vendorName =
                                              vendor.name ||
                                              vendor.vendor_name ||
                                              "";

                                            return (
                                              <option
                                                key={
                                                  vendor.id ||
                                                  vendorName
                                                }
                                                value={
                                                  vendorName
                                                }
                                              >
                                                {
                                                  vendorName
                                                }
                                              </option>
                                            );
                                          }
                                        )}
                                      </select>
                                    </td>

                                    {/* Quantity */}
                                    <td className="px-4 py-3 text-center">
                                      <input
                                        type="number"
                                        min="0"
                                        max={
                                          maximumQuantityForRow
                                        }
                                        step="1"
                                        value={
                                          allocation.quantity
                                        }
                                        onChange={(
                                          event
                                        ) =>
                                          updatePoAllocation(
                                            itemIndex,
                                            allocationIndex,
                                            "quantity",
                                            event
                                              .target
                                              .value
                                          )
                                        }
                                        className="h-10 w-28 rounded-lg border border-slate-300 px-3 text-center dark:bg-slate-950 dark:border-slate-700"
                                      />
                                    </td>

                                    {/* UOM */}
                                    <td className="px-4 py-3">
                                      <input
                                        type="text"
                                        value={allocation.uom}
                                        placeholder="NOS"
                                        onChange={(event) =>
                                          updatePoAllocation(itemIndex, allocationIndex, "uom", event.target.value)
                                        }
                                        className="h-10 w-24 rounded-lg border border-slate-300 px-3 dark:bg-slate-950 dark:border-slate-700"
                                      />
                                    </td>

                                    {/* Unit price */}
                                    <td className="px-4 py-3 text-right">
                                      <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={
                                          allocation.unitPrice
                                        }
                                        onChange={(
                                          event
                                        ) =>
                                          updatePoAllocation(
                                            itemIndex,
                                            allocationIndex,
                                            "unitPrice",
                                            event
                                              .target
                                              .value
                                          )
                                        }
                                        className="h-10 w-32 rounded-lg border border-slate-300 px-3 text-right dark:bg-slate-950 dark:border-slate-700"
                                      />
                                    </td>

                                    {/* Discount */}
                                    <td className="px-4 py-3 text-right">
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={allocation.discount}
                                        onChange={(event) =>
                                          updatePoAllocation(itemIndex, allocationIndex, "discount", event.target.value)
                                        }
                                        className="h-10 w-28 rounded-lg border border-slate-300 px-3 text-right dark:bg-slate-950 dark:border-slate-700"
                                      />
                                    </td>

                                    {/* GST */}
                                    <td className="px-4 py-3 text-right">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={
                                          allocation.gst
                                        }
                                        onChange={(
                                          event
                                        ) =>
                                          updatePoAllocation(
                                            itemIndex,
                                            allocationIndex,
                                            "gst",
                                            event
                                              .target
                                              .value
                                          )
                                        }
                                        className="h-10 w-24 rounded-lg border border-slate-300 px-3 text-right dark:bg-slate-950 dark:border-slate-700"
                                      />
                                      <div className="mt-1 text-[11px] text-slate-500">
                                        ₹{allocationTotals.gstAmount.toFixed(2)}
                                      </div>
                                    </td>

                                    {/* Freight cost */}
                                    <td className="px-4 py-3 text-right">
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={allocation.freightCost}
                                        onChange={(event) =>
                                          updatePoAllocation(itemIndex, allocationIndex, "freightCost", event.target.value)
                                        }
                                        className="h-10 w-28 rounded-lg border border-slate-300 px-3 text-right dark:bg-slate-950 dark:border-slate-700"
                                      />
                                    </td>

                                    {/* Freight GST */}
                                    <td className="px-4 py-3 text-right">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={allocation.freightGst}
                                        onChange={(event) =>
                                          updatePoAllocation(itemIndex, allocationIndex, "freightGst", event.target.value)
                                        }
                                        className="h-10 w-28 rounded-lg border border-slate-300 px-3 text-right dark:bg-slate-950 dark:border-slate-700"
                                      />
                                      <div className="mt-1 text-[11px] text-slate-500">
                                        ₹{allocationTotals.freightGstAmount.toFixed(2)}
                                      </div>
                                    </td>

                                    {/* Round off */}
                                    <td className="px-4 py-3 text-right">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={allocation.roundOff}
                                        onChange={(event) =>
                                          updatePoAllocation(itemIndex, allocationIndex, "roundOff", event.target.value)
                                        }
                                        className="h-10 w-28 rounded-lg border border-slate-300 px-3 text-right dark:bg-slate-950 dark:border-slate-700"
                                      />
                                    </td>

                                    {/* Delivery date */}
                                    <td className="px-4 py-3">
                                      <input
                                        type="date"
                                        min={
                                          getLocalDateString()
                                        }
                                        value={
                                          allocation.expectedDeliveryDate
                                        }
                                        onChange={(
                                          event
                                        ) =>
                                          updatePoAllocation(
                                            itemIndex,
                                            allocationIndex,
                                            "expectedDeliveryDate",
                                            event
                                              .target
                                              .value
                                          )
                                        }
                                        className="h-10 w-44 rounded-lg border border-slate-300 bg-white px-3 dark:bg-slate-950 dark:border-slate-700"
                                      />
                                    </td>

                                    {/* Total */}
                                    <td className="px-4 py-3 text-right font-semibold">
                                      ₹
                                      {allocationTotals.lineTotal.toFixed(
                                        2
                                      )}
                                    </td>

                                    {/* Remove row */}
                                    <td className="px-4 py-3 text-center">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeVendorAllocation(
                                            itemIndex,
                                            allocationIndex
                                          )
                                        }
                                        disabled={
                                          poSubmitting
                                        }
                                        className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900"
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                );
                              }
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Add another vendor */}
                      <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Fill this component only when
                          creating its PO now. Entered vendor
                          quantities must equal{" "}
                          {
                            item.shortageQuantity
                          }
                          . Leave it completely blank to
                          create its PO later.
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            addVendorAllocation(
                              itemIndex
                            )
                          }
                          disabled={
                            poSubmitting ||
                            remainingQuantity <=
                              0
                          }
                          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-700"
                        >
                          + Add Vendor
                        </button>
                      </div>
                    </section>
                  );
                }
              )}

              {/* Grand totals */}
              <div className="flex justify-end">
                <div className="w-80 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex justify-between text-sm mb-2">
                    <span>
                      Subtotal
                    </span>

                    <span>
                      ₹
                      {poSubtotal.toFixed(
                        2
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm mb-3">
                    <span>GST</span>

                    <span>
                      ₹
                      {poGstTotal.toFixed(
                        2
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between font-bold border-t pt-3 dark:border-slate-700">
                    <span>Total</span>

                    <span>
                      ₹
                      {poGrandTotal.toFixed(
                        2
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
          {/* Footer - always visible */}
<div className="shrink-0 bg-white dark:bg-slate-900 px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
              <button
                type="button"
                onClick={
                  closeCreatePoModal
                }
                disabled={poSubmitting}
                className="px-4 py-2 border rounded-lg disabled:opacity-50"
              >
              Close
              </button>

              <button
                type="button"
                onClick={() =>
                  void submitPurchaseOrder()
                }
                disabled={poSubmitting}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {poSubmitting
                  ? "Creating Purchase Orders..."
                  : "Submit Selected Purchase Orders"}
              </button>
            </div>
          </div>BOM, MR and Scrap notifications for admin and manager users


        </div>
      )}
    </PageShell>
  );
}