import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { DataTable, StatusBadge } from "@/components/app/DataTable";
import { PaginationControls } from "@/components/app/PaginationControls";
import { FormGrid, Field, Input, Select, Textarea } from "@/components/app/FormShell";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { purchaseOrders as mockPurchaseOrders } from "@/lib/mock-data";
import { Loader2, Plus } from "lucide-react";
import config from "@/config";
import API from "@/api";
import { fetchJson } from "@/api";
import { fetchAuthenticatedJson } from "@/api";
import { useAuth } from "@/AuthContext";
import { canWork } from "@/permissions";
import { getAccessToken } from "@/authStore";

const PURCHASE_ORDERS_PAGE_SIZE = 50;

const HIDDEN_PURCHASE_ORDER_IDS_STORAGE_KEY =
  "dream-to-life-hidden-purchase-order-ids";

function getHiddenPurchaseOrderIds() {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(
      HIDDEN_PURCHASE_ORDER_IDS_STORAGE_KEY,
    );

    const values = stored
      ? JSON.parse(stored)
      : [];

    return Array.isArray(values)
      ? values.map(String).filter(Boolean)
      : [];
  } catch (error) {
    console.warn(
      "Unable to read hidden Purchase Order IDs:",
      error,
    );
    return [];
  }
}

function persistHiddenPurchaseOrderIds(ids) {
  if (typeof window === "undefined") return;

  const unique = Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map(String)
        .filter(Boolean),
    ),
  );

  window.localStorage.setItem(
    HIDDEN_PURCHASE_ORDER_IDS_STORAGE_KEY,
    JSON.stringify(unique),
  );

  window.dispatchEvent(
    new CustomEvent("procurement:changed", {
      detail: {
        type: "poDeleted",
        hiddenIds: unique,
      },
    }),
  );
}

function filterVisiblePurchaseOrders(orders) {
  const hiddenIds = new Set(
    getHiddenPurchaseOrderIds(),
  );

  return (Array.isArray(orders) ? orders : []).filter(
    (order) => {
      const id = String(
        order?.id ??
          order?.purchase_order_id ??
          "",
      );

      return !id || !hiddenIds.has(id);
    },
  );
}

function Page() {
  const { user } = useAuth();

  // Sidebar/routes decide who can SEE Purchase Orders.
  // Only Admin + Procurement can CREATE / DELETE / CHANGE PO data.
  const canManagePO =
    canWork(user, "purchase-order");

  const activeRole = String(
    user?.active_role ||
      user?.activeRole ||
      user?.role ||
      ""
  )
    .trim()
    .toLowerCase();

  const isManagerRole =
    activeRole === "manager" ||
    activeRole === "admin";

  const isFinanceRole =
    activeRole === "finance" ||
    activeRole === "admin";

  const isProcurementRole =
    activeRole === "procurement" ||
    activeRole === "admin";

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseOrdersPage, setPurchaseOrdersPage] = useState(1);
  const [purchaseOrdersDisplayedCount, setPurchaseOrdersDisplayedCount] =
    useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [vendorsModalOpen, setVendorsModalOpen] = useState(false);
  const [componentsModalOpen, setComponentsModalOpen] = useState(false);

  // Purchase Order table component-details popup.
  // Keep component names out of the table; open them only on click.
  const [
    poComponentsPopup,
    setPoComponentsPopup,
  ] = useState(null);
  const [requestedPOs, setRequestedPOs] = useState([]);
  const [toast, setToast] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [showRejectPopup, setShowRejectPopup] = useState(false);
  const [rejectPopup, setRejectPopup] = useState({ reason: "", rejectedBy: "", title: "" });
  const [showBulkGenerateModal, setShowBulkGenerateModal] = useState(false);
  const [bulkGenerateVendor, setBulkGenerateVendor] = useState("");
  const [bulkGenerateSelected, setBulkGenerateSelected] = useState({});
const navigate = useNavigate();
const openPOComponentsPopup = (row) => {
  const items = Array.isArray(row?.items)
    ? row.items
    : [];

  setPoComponentsPopup({
    poNumber: row?.po || "-",
    items,
  });
};

const [vendors, setVendors] = useState([]);
const getFinancialYearCode = (
  date = new Date()
) => {
  const calendarYear =
    date.getFullYear();

  const monthIndex =
    date.getMonth();

  // April to March financial year
  const startYear =
    monthIndex >= 3
      ? calendarYear
      : calendarYear - 1;

  const endYear =
    startYear + 1;

  return `${String(startYear).slice(
    -2
  )}-${String(endYear).slice(-2)}`;
};

const getNextPurchaseOrderNumber =
  async () => {
    const financialYear =
      getFinancialYearCode();

    const response = await fetch(
      `${config.baseURL}/procurement/purchase-orders/?page_size=5000`,
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(
        "Unable to generate the next PO number."
      );
    }

    const data =
      await response.json();

    const purchaseOrders =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
        ? data.results
        : [];

    const highestSequence =
      purchaseOrders.reduce(
        (highest, order) => {
          const value = String(
            order?.po_number ||
              order?.po ||
              ""
          ).trim();

          /*
           * Accept:
           * 01/26-27
           * 02/26-27
           *
           * Ignore old PO timestamp formats.
           */
          const match = value.match(
            /^(\d+)\/(\d{2}-\d{2})$/
          );

          if (
            !match ||
            match[2] !==
              financialYear
          ) {
            return highest;
          }

          const sequence =
            Number(match[1]);

          return Number.isFinite(
            sequence
          )
            ? Math.max(
                highest,
                sequence
              )
            : highest;
        },
        0
      );

    return `${String(
      highestSequence + 1
    ).padStart(
      2,
      "0"
    )}/${financialYear}`;
  };
const [
  deliveryChoiceOpen,
  setDeliveryChoiceOpen,
] = useState(false);

const [
  deliveryFormOpen,
  setDeliveryFormOpen,
] = useState(false);

const [
  selectedDeliveryPO,
  setSelectedDeliveryPO,
] = useState(null);

const [
  deliveryMode,
  setDeliveryMode,
] = useState("");

const [
  deliverySaving,
  setDeliverySaving,
] = useState(false);

const [deliveryForm, setDeliveryForm] =
  useState({
    invoiceNumber: "",
    invoiceDate: "",
    batchNumber: "",
    receivedDate:
      new Date().toISOString().slice(0, 10),
    items: [],
  });
  const loadRejectDetails = async (row) => {
    const buildTitle = () => row.po || `PO-${row.id || ""}`;
    const buildActor = (details) =>
      details.rejected_by ||
      details.rejectedBy ||
      details.rejected_by_role ||
      details.rejectedByRole ||
      details.rejected_by_role_name ||
      details.rejectedByRoleName ||
      details.rejected_by_user ||
      details.rejectedByUser ||
      details.rejected_by_name ||
      details.rejectedByName ||
      details.rejected_by_fullname ||
      details.rejectedByFullName ||
      row.rejectedBy ||
      row.rejected_by ||
      "";
    const buildReason = (details) =>
      details.rejection_reason ||
      details.rejectionReason ||
      details.reject_reason ||
      details.rejectReason ||
      details.reject_note ||
      details.rejectNote ||
      details.rejection_notes ||
      details.rejectionNotes ||
      details.reject_notes ||
      details.rejectNotes ||
      details.rejection_remark ||
      details.rejectionRemark ||
      details.message ||
      details.note ||
      details.comment ||
      details.reason ||
      details.latest_approval?.reason ||
      details.latest_approval?.comment ||
      details.latest_approval?.note ||
      details.latest_approval?.remarks ||
      row.rejectionReason ||
      row.rejection_reason ||
      row.reject_reason ||
      row.rejectNote ||
      row.rejection_notes ||
      row.message ||
      row.note ||
      row.comment ||
      row.reason ||
      row.latest_approval?.reason ||
      row.latest_approval?.comment ||
      row.latest_approval?.note ||
      row.latest_approval?.remarks ||
      "";
    const buildStatus = (details) =>
      String(
        details.approval_status ||
          details.status ||
          row.approval_status ||
          row.status ||
          "REJECTED"
      ).toUpperCase();

    try {
      const res = await fetch(
        `${config.baseURL}/procurement/purchase-orders/${row.id}/`
      );
      if (!res.ok) throw new Error("Failed to load PO details");
      const details = await res.json();

      setRejectPopup({
        reason: buildReason(details) || buildReason(row) || "No rejection reason provided.",
        rejectedBy: buildActor(details) || buildActor(row),
        status: buildStatus(details) || buildStatus(row),
        title: buildTitle(),
      });
    } catch (err) {
      console.error("Failed to load reject details:", err);
      setRejectPopup({
        reason: buildReason(row) || "No rejection reason provided.",
        rejectedBy: buildActor(row),
        status: buildStatus(row),
        title: buildTitle(),
      });
    } finally {
      setShowRejectPopup(true);
    }
  };


const handleRequestApproval = async (r) => {
  if (!canManagePO) {
    return;
  }

  try {
    /*
     * IMPORTANT:
     * Do not create the Finance notification separately from React.
     *
     * The authenticated PO PATCH below is the single source of truth.
     * Django will:
     *   1. move the PO to PENDING_FINANCE,
     *   2. create/update the Finance notification,
     *   3. store the exact authenticated PO sender email,
     *   4. send the Finance approval-request email.
     *
     * Because API.patch() uses the shared JWT interceptor, request.user
     * is the real Procurement/Admin user who raised the PO. That identity
     * is later used to return Finance Approved/Rejected email to this
     * exact same user.
     */
    const response = await API.patch(
      `/procurement/purchase-orders/${r.id}/`,
      {
        status: "PENDING_FINANCE",
        approval_status: "PENDING_FINANCE",
      },
    );

    console.log(
      "PO sent to Finance:",
      response.data,
    );

    const updated = [
      ...requestedPOs,
      String(r.id),
    ];

    setRequestedPOs(
      Array.from(new Set(updated)),
    );

    setPurchaseOrders((prev) =>
      prev.map((po) =>
        String(po.id) === String(r.id)
          ? {
              ...po,
              status: "PENDING_FINANCE",
              approval_status:
                "PENDING_FINANCE",
            }
          : po,
      ),
    );

    // Reload authoritative backend state.
    await loadPurchaseOrders();
  } catch (err) {
    const message =
      err?.response?.data?.detail ||
      err?.response?.data?.message ||
      (typeof err?.response?.data ===
      "string"
        ? err.response.data
        : "") ||
      err?.message ||
      "Failed to request Finance approval.";

    console.error(
      "Failed to send PO to Finance:",
      err?.response?.data || err,
    );

    alert(
      "Failed to request approval: " +
        message,
    );
  }
};

const runReplacementAction = async (
  row,
  endpoint,
  options = {}
) => {
  if (!row?.id) return;

  const payload = {};

  if (options.requireReason) {
    const reason = window.prompt(
      options.reasonPrompt ||
        "Enter rejection reason:"
    );

    if (reason == null) return;

    if (!String(reason).trim()) {
      alert("Rejection reason is required.");
      return;
    }

    payload.reason = String(reason).trim();
  }

  try {
    const response = await API.post(
      `/procurement/purchase-orders/${row.id}/${endpoint}/`,
      payload
    );

    // =========================================================
    // REPLACEMENT ORDERED
    // =========================================================
    // Do not immediately reload the cached PO list.
    // The backend action already succeeded, therefore immediately
    // change the local row to REPLACEMENT_ORDERED.
    //
    // This makes:
    //
    // Mark Replacement Ordered
    //          ↓
    // Record Replacement Delivery
    //
    // happen immediately.
    // =========================================================
    if (endpoint === "replacement-mark-ordered") {
      const serverStatus = String(
        response?.data?.status ||
          "REPLACEMENT_ORDERED"
      )
        .trim()
        .toUpperCase();

      setPurchaseOrders((previous) =>
        previous.map((purchaseOrder) =>
          String(purchaseOrder.id) ===
          String(row.id)
            ? {
                ...purchaseOrder,
                status:
                  serverStatus ===
                  "REPLACEMENT_ORDERED"
                    ? serverStatus
                    : "REPLACEMENT_ORDERED",
              }
            : purchaseOrder
        )
      );

      window.dispatchEvent(
        new Event("procurementUpdated")
      );

      return;
    }

    window.dispatchEvent(
      new Event("procurementUpdated")
    );

    await loadPurchaseOrders();
  } catch (error) {
    const message =
      error?.response?.data?.detail ||
      error?.response?.data?.message ||
      error?.message ||
      "Replacement workflow action failed.";

    // =========================================================
    // STALE-LIST RECOVERY
    // =========================================================
    // The list may still say REPLACEMENT_APPROVED even though
    // the first click already changed the DB to
    // REPLACEMENT_ORDERED.
    // =========================================================
    if (
      endpoint === "replacement-mark-ordered"
    ) {
      try {
        const latestPo =
          await fetchAuthenticatedJson(
            `/procurement/purchase-orders/${encodeURIComponent(
              row.id
            )}/`,
            {
              cache: "no-store",
            }
          );

        const latestStatus = String(
          latestPo?.status || ""
        )
          .trim()
          .toUpperCase();

        if (
          [
            "REPLACEMENT_ORDERED",
            "REPLACEMENT_PARTIALLY_RECEIVED",
            "REPLACEMENT_RECEIVED",
          ].includes(latestStatus)
        ) {
          setPurchaseOrders((previous) =>
            previous.map((purchaseOrder) =>
              String(purchaseOrder.id) ===
              String(row.id)
                ? {
                    ...purchaseOrder,
                    status: latestStatus,
                  }
                : purchaseOrder
            )
          );

          return;
        }
      } catch (refreshError) {
        console.error(
          "Unable to recover latest Replacement PO status:",
          refreshError
        );
      }
    }

    console.error(
      "Replacement workflow action failed:",
      error?.response?.data || error
    );

    alert(message);
  }
};

const updatePOStatus = async (poId, newStatus) => {
  if (!canManagePO) {
    return;
  }

  const previousPurchaseOrders = purchaseOrders;

  try {
    console.log("updatePOStatus called", { poId, newStatus });
    const normalizedStatus = String(newStatus || "").toUpperCase();

    if (normalizedStatus === "ORDERED") {
      const latestPo = await fetchAuthenticatedJson(
        `/procurement/purchase-orders/${encodeURIComponent(poId)}/`,
        { cache: "no-store" },
      );

      const latestApprovalStatuses = [
        latestPo?.approval_status,
        latestPo?.status,
      ].map((value) => String(value || "").trim().toUpperCase());

      if (
        !latestApprovalStatuses.some((value) =>
          ["FINANCE_APPROVED", "APPROVED"].includes(value),
        )
      ) {
        await loadPurchaseOrders();
        alert(
          "Finance approval is required before this Direct PO can be marked Ordered.",
        );
        return;
      }
    }

const approvalStatusMap = {
  PENDING: "PENDING",
  PENDING_FINANCE: "PENDING_FINANCE",
  APPROVED: "FINANCE_APPROVED",
  FINANCE_APPROVED: "FINANCE_APPROVED",
  FINANCE_REJECTED: "FINANCE_REJECTED",
  ORDERED: "FINANCE_APPROVED",
  PARTIALLY_DELIVERED: "FINANCE_APPROVED",
  DELIVERED: "FINANCE_APPROVED",
};
    const isPostApprovalStatus = [
      "ORDERED",
      "PARTIALLY_DELIVERED",
      "DELIVERED",
    ].includes(normalizedStatus);

    /*
     * Once Finance has approved, ORDERED / delivery transitions should
     * change only PurchaseOrder.status.
     *
     * Do not resend approval_status=FINANCE_APPROVED because the backend
     * could interpret that as another Finance approval transition.
     */
    const payload = isPostApprovalStatus
      ? {
          status: normalizedStatus,
          ...(normalizedStatus === "ORDERED"
            ? { approval_status: "FINANCE_APPROVED" }
            : {}),
        }
      : {
          status: normalizedStatus,
          approval_status:
            approvalStatusMap[normalizedStatus] ||
            "PENDING",
        };

    // Optimistic UI update
    setPurchaseOrders((prevList) =>
      prevList.map((po) =>
        po.id === poId
          ? {
              ...po,
              status: normalizedStatus,
              ...(payload.approval_status
                ? {
                    approval_status:
                      payload.approval_status,
                  }
                : {}),
            }
          : po
      )
    );

    console.log("PATCH payload", payload);

    const json = await fetchAuthenticatedJson(
      `/procurement/purchase-orders/${encodeURIComponent(poId)}/`,
      {
        method: "PATCH",
        timeoutMs: 60000,
        body: JSON.stringify(payload),
      },
    );
    console.log("PATCH response", { ok: true, body: json });

    // Reload authoritative state
    await loadPurchaseOrders();
  } catch (err) {
    console.error(
      "Failed to update PO status:",
      err
    );

    // Revert the optimistic update when the server rejects or times out.
    setPurchaseOrders(previousPurchaseOrders);

    // The backend is authoritative; refresh in case another workflow action
    // changed this PO while the table was open.
    await loadPurchaseOrders();

    alert(
      "Failed to update PO status: " +
        (err?.message || err)
    );
  }
};

async function loadRequestedPOs() {
  try {
    const res = await fetch(
      `${config.baseURL}/notifications/`
    );

    const data = await res.json();
    const notifications = data.results || data;

    const requested = notifications
      .filter(
        (n) =>
          n.category === "PO" &&
          n.reference_id != null &&
          [
    "PENDING_FINANCE",
    "FINANCE_APPROVED",
    "FINANCE_REJECTED"
          ].includes(String(n.status).toUpperCase())
      )
      .map((n) => String(n.reference_id));

    setRequestedPOs(requested);

  } catch (err) {
    console.error(err);
  }
}
  const handleEnableSelectionMode = () => {
    if (!canManagePO) {
      return;
    }

    setSelectedRowKeys([]);
    setSelectionMode(true);
  };

  const handleCancelSelectionMode = () => {
    setSelectedRowKeys([]);
    setSelectionMode(false);
  };
const PO_ACTION_PRESENTATION = {
  REPLACEMENT_PENDING_MANAGER: {
    label: "Pending Procurement Approval",
    actionClass:
      "border-amber-600 bg-amber-600 text-white dark:border-amber-500 dark:bg-amber-500",
  },

  REPLACEMENT_PENDING_FINANCE: {
    label: "Pending Finance",
    actionClass:
      "border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500",
  },

  REPLACEMENT_APPROVED: {
    label: "Mark Replacement Ordered",
    actionClass:
      "border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-700",
  },

  REPLACEMENT_ORDERED: {
    label: "Record Replacement Delivery",
    actionClass:
      "border-orange-600 bg-orange-600 text-white shadow-sm hover:bg-orange-700",
  },

  REPLACEMENT_PARTIALLY_RECEIVED: {
    label: "Record Next Replacement Receipt",
    actionClass:
      "border-violet-600 bg-violet-600 text-white shadow-sm hover:bg-violet-700",
  },

  REPLACEMENT_RECEIVED: {
    label: "Replacement Received - QC Pending",
    actionClass:
      "border-teal-600 bg-teal-600 text-white",
  },

  REPLACEMENT_MANAGER_REJECTED: {
    label: "Manager Rejected",
    actionClass:
      "border-rose-600 bg-rose-600 text-white",
  },

  REPLACEMENT_FINANCE_REJECTED: {
    label: "Finance Rejected",
    actionClass:
      "border-rose-600 bg-rose-600 text-white",
  },

  FINANCE_REJECTED: {
    label: "Finance Rejected",
    actionClass:
      "border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-500",
  },

  PENDING_FINANCE: {
    label: "Pending Finance",
    actionClass:
      "border-amber-600 bg-amber-600 text-white dark:border-amber-500 dark:bg-amber-500",
  },

  APPROVED: {
    label: "Approved",
    actionClass:
      "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500",
  },

  FINANCE_APPROVED: {
    label: "Mark as Ordered",
    actionClass:
      "border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600",
  },

  ORDERED: {
    label: "Mark Delivery",
    actionClass:
      "border-orange-600 bg-orange-600 text-white shadow-sm hover:bg-orange-700 dark:border-orange-500 dark:bg-orange-500 dark:hover:bg-orange-600",
  },

  PARTIALLY_DELIVERED: {
    label: "Record Next Delivery",
    actionClass:
      "border-violet-600 bg-violet-600 text-white shadow-sm hover:bg-violet-700 dark:border-violet-500 dark:bg-violet-500 dark:hover:bg-violet-600",
  },

  DELIVERED: {
    label: "Delivered",
    actionClass:
      "border-teal-600 bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-500",
  },
};

const DEFAULT_PO_ACTION_PRESENTATION = {
  label: "Pending Finance",
  actionClass:
    "border-slate-500 bg-slate-600 text-white dark:border-slate-600 dark:bg-slate-700",
};

const REPLACEMENT_STATUS_LABELS = {
  REPLACEMENT_PENDING_MANAGER:
    "Replacement - Pending Procurement Approval",
  REPLACEMENT_PENDING_FINANCE:
    "Replacement - Pending Finance Approval",
  REPLACEMENT_MANAGER_REJECTED:
    "Replacement - Manager Rejected",
  REPLACEMENT_FINANCE_REJECTED:
    "Replacement - Finance Rejected",
  REPLACEMENT_APPROVED:
    "Replacement Approved",
  REPLACEMENT_ORDERED:
    "Replacement Ordered",
  REPLACEMENT_PARTIALLY_RECEIVED:
    "Replacement Partially Received",
  REPLACEMENT_RECEIVED:
    "Replacement Received",
};
  const vendorGroups = useMemo(() => {
    const groups = new Map();

    purchaseOrders.forEach((order) => {
      const vendorName = String(order?.vendor || "").trim();

      if (!vendorName) {
        return;
      }

      const items = (Array.isArray(order?.items) ? order.items : []).filter((item) => {
        const status = String(order?.status || "").toUpperCase();
        const remaining = Number(item?.remaining_quantity ?? (Number(item?.quantity || 0) - Number(item?.received_quantity || 0)));
        return !["DELIVERED", "REPLACEMENT_RECEIVED", "REPLACEMENT_RECEIVED_INVENTORY_ISSUED", "REPLACEMENT_DELIVERY_INVENTORY_ISSUED"].includes(status) && remaining > 0;
      });

      if (!groups.has(vendorName)) {
        groups.set(vendorName, []);
      }

      groups.get(vendorName).push({
        ...order,
        items,
      });
    });

    return Array.from(groups.entries()).map(([vendor, rows]) => ({
      vendor,
      rows,
    }));
  }, [purchaseOrders]);

  const bulkGenerateCandidateVendorOptions = useMemo(
    () => vendorGroups.map(({ vendor }) => vendor),
    [vendorGroups],
  );

  const bulkGenerateVendorRows = useMemo(() => {
    if (!bulkGenerateVendor) {
      return [];
    }

    return (
      vendorGroups.find(({ vendor }) => vendor === bulkGenerateVendor)?.rows || []
    );
  }, [bulkGenerateVendor, vendorGroups]);

  const openBulkGenerateModal = () => {
    if (!canManagePO) {
      return;
    }

    setBulkGenerateVendor(
      bulkGenerateCandidateVendorOptions[0] || "",
    );
    setBulkGenerateSelected({});
    setShowBulkGenerateModal(true);
  };

  const toggleBulkGenerateItem = (poId, itemId) => {
    const targetId = String(itemId || "");
    const key = String(poId || "");

    if (!targetId || !key) {
      return;
    }

    setBulkGenerateSelected((previous) => {
      const current = previous[key] || [];
      const next = current.includes(targetId)
        ? current.filter((value) => value !== targetId)
        : [...current, targetId];

      return {
        ...previous,
        [key]: next,
      };
    });
  };

  const getBulkGenerateSelectedCount = () =>
    Object.values(bulkGenerateSelected).reduce(
      (count, selectedIds) => count + (Array.isArray(selectedIds) ? selectedIds.length : 0),
      0,
    );

  const handleBulkGeneratePdf = async () => {
    if (!bulkGenerateVendor) {
      alert("Please select a vendor first.");
      return;
    }

    const groupedSelections = Object.entries(
      bulkGenerateSelected,
    ).filter(
      ([, selectedIds]) =>
        Array.isArray(selectedIds) &&
        selectedIds.length > 0,
    );

    if (!groupedSelections.length) {
      alert(
        "Please select at least one component before generating the PO PDF.",
      );
      return;
    }

    /*
     * Send the PO ID + selected item IDs together. The backend validates
     * that every PO belongs to the currently selected vendor and generates
     * ONE consolidated PDF with ONE vendor voucher number.
     */
    const selections = groupedSelections
      .map(([poId, selectedIds]) => {
        const poRow = purchaseOrders.find(
          (row) => String(row.id) === String(poId),
        );

        const rowVendor = String(
          poRow?.vendor || "",
        ).trim();

        if (
          !poRow ||
          rowVendor.toLowerCase() !==
            String(bulkGenerateVendor)
              .trim()
              .toLowerCase()
        ) {
          return null;
        }

        return {
          po_id: poId,
          item_ids: Array.from(
            new Set(
              (selectedIds || [])
                .map(String)
                .filter(Boolean),
            ),
          ),
        };
      })
      .filter(
        (selection) =>
          selection &&
          selection.item_ids.length > 0,
      );

    if (!selections.length) {
      alert(
        "No selected components belong to the selected vendor.",
      );
      return;
    }

    const token = getAccessToken();

    try {
      const response = await fetch(
        `${config.baseURL}/procurement/purchase-orders/vendor-pdf/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token
              ? {
                  Authorization: `Bearer ${token}`,
                }
              : {}),
          },
          body: JSON.stringify({
            vendor_name: bulkGenerateVendor,
            selections,
          }),
        },
      );

      if (!response.ok) {
        const responseText =
          await response.text();

        throw new Error(
          responseText ||
            "Unable to generate the consolidated vendor PO PDF.",
        );
      }

      const pdfBlob = await response.blob();
      const blobUrl =
        window.URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");

      const voucherNumber =
        response.headers.get(
          "X-PO-Voucher-Number",
        ) || "";

      const fallbackName = String(
        bulkGenerateVendor || "Vendor",
      )
        .replace(/[^A-Za-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const safePdfNumber = String(
        voucherNumber || fallbackName || "Vendor-PO",
      ).replace(/[\\/]/g, "-");

      link.href = blobUrl;
      link.download = `PO_${safePdfNumber}.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);

      setShowBulkGenerateModal(false);
      setBulkGenerateVendor("");
      setBulkGenerateSelected({});
    } catch (error) {
      console.error(
        "Consolidated vendor PO PDF generation failed:",
        error,
      );

      alert(
        error?.message ||
          "Failed to generate the selected vendor PO PDF.",
      );
    }
  };

  const handleDeleteSelected = async () => {
    if (!canManagePO) {
      return;
    }

    if (!selectedRowKeys.length) return;

    try {
      await Promise.all(
        selectedRowKeys.map((id) =>
          API.delete(
            `/procurement/purchase-orders/${encodeURIComponent(id)}/`
          ),
        ),
      );

      /*
       * Persist frontend-deleted PO IDs so stale backend rows do not return
       * to this page or contribute to Dashboard calculations.
       */
      const hiddenIds = Array.from(
        new Set([
          ...getHiddenPurchaseOrderIds(),
          ...selectedRowKeys.map(String),
        ]),
      );

      persistHiddenPurchaseOrderIds(
        hiddenIds,
      );

      setPurchaseOrders((prev) =>
        prev.filter(
          (row) =>
            !selectedRowKeys.includes(
              String(row.id),
            ),
        ),
      );

      setSelectedRowKeys([]);
      setSelectionMode(false);
    } catch (err) {
      console.error("Failed to delete selected purchase orders:", err);
      alert("Unable to delete selected purchase orders. Please try again.");
    }
  };

  const [vendorForm, setVendorForm] = useState({
    name: "",
    contact_person: "",
    phone_number: "",
    email: "",
    gst_number: "",
    address: "",
    city: "",
    state: "",
    state_code: "",
    pincode: "",
    payment_terms: "",
    shipping_terms: "",
    additional_notes: "",
    is_active: true,
  });

  const [vendorProducts, setVendorProducts] = useState([
    {
      product: "",
      product_version: "",
      quantity: 1,
      unit_price: 0,
      price: 0,
      gst: 0,
    },
  ]);

  const vendorGrandTotal = vendorProducts.reduce(
    (sum, item) => {
      const price = Number(item.price || 0);
      const gst = Number(item.gst || 0);

      return (
        sum +
        price +
        (price * gst) / 100
      );
    },
    0
  );

  const CATEGORY_PREFIXES = {
    ACCESSORIES: "AC",
    AIRFRAMES: "AF",
    COMMUNICATION: "CM",
    ELECTRICALS: "EL",
    ELECTRONICS: "EN",
    PAYLOAD: "PL",
    TOOLS: "TL",
  };

  const [componentForm, setComponentForm] = useState({
    component_id: "AC_0001",
    name: "",
    category: "ACCESSORIES",
    component_type: "",
    specifications: "",
    hsn_no: "",
    sku_no: "",
    part_no: "",
    tally_reference: "",
    unit_of_measurements: "",
    product_link: "",
  });

  // Generate category-wise Component IDs.
  const generateNextComponentId = async (category) => {
    try {
      const cleanCategory = String(category || "").trim().toUpperCase();
      const prefix = CATEGORY_PREFIXES[cleanCategory];
      if (!prefix) throw new Error("Invalid component category.");

      const response = await fetch(
        `${config.baseURL}/components/components/?page_size=5000`,
        { cache: "no-store" }
      );

      if (!response.ok) throw new Error("Unable to generate Component ID.");

      const data = await response.json();
      const componentList = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
          ? data.results
          : [];

      const pattern = /^[A-Z]+_(\d{4})$/i;

      const highestNumber = componentList.reduce((highest, component) => {
        const value = String(
          component?.component_id ||
          component?.component_code ||
          component?.code ||
          ""
        ).trim();

        const match = value.match(pattern);
        if (!match) return highest;

        const number = Number(match[1]);
        return Number.isFinite(number)
          ? Math.max(highest, number)
          : highest;
      }, 0);

      return `${prefix}_${String(highestNumber + 1).padStart(4, "0")}`;
    } catch (error) {
      console.error("Unable to generate next Component ID:", error);
      const prefix = CATEGORY_PREFIXES[String(category || "").trim().toUpperCase()];
      return prefix ? `${prefix}_00001` : "";
    }
  };

  const handleComponentDialogOpenChange = async (open) => {
    setComponentsModalOpen(open);

    if (!open) {
      return;
    }

    const nextComponentId =
      await generateNextComponentId(componentForm.category || "ACCESSORIES");

    setComponentForm((previous) => ({
      ...previous,
      component_id: nextComponentId,
    }));
  };

  const [savingVendor, setSavingVendor] = useState(false);
  const [savingComponent, setSavingComponent] = useState(false);

useEffect(() => {
  loadPurchaseOrders();
  loadRequestedPOs();
}, []);
useEffect(() => {
  const loadVendors = async () => {
    try {
      const res = await fetch(
        `${config.baseURL}/vendors/`
      );

      if (!res.ok) {
        throw new Error(
          "Failed to load vendors"
        );
      }

      const data = await res.json();

      setVendors(
        Array.isArray(data)
          ? data
          : data.results || []
      );
    } catch (err) {
      console.error(
        "Failed to load vendors:",
        err
      );

      setVendors([]);
    }
  };

  loadVendors();
}, []);
// Listen for workflow updates made from Procurement / QC / Inventory pages.
useEffect(() => {
  const handler = () => {
    /*
     * Reload the PO lifecycle whenever another page changes:
     * - Refund / Replacement state
     * - QC state
     * - Project Inventory / Inventory Issue state
     */
    loadPurchaseOrders();
  };

  const events = [
    "procurementUpdated",
    "procurement:changed",
    "inwardUpdated",
    "notificationsUpdated",
    "materialRequestsUpdated",
    "projectInventoryUpdated",
    "inventoryUpdated",
  ];

  events.forEach((eventName) => {
    window.addEventListener(eventName, handler);
  });

  return () => {
    events.forEach((eventName) => {
      window.removeEventListener(eventName, handler);
    });
  };
}, []);

  async function loadPurchaseOrders() {
    try {
      setLoading(true);
      setLoadError("");

      /*
       * Replacement PO display needs two independent lifecycle sources:
       *
       * 1. Inward
       *    -> QC Pending / QC Passed / QC Failed
       *
       * 2. Project Inventory
       *    -> whether the QC-passed purchased quantity has been issued
       *
       * Do not derive QC/Inventory state only from PurchaseOrder.status.
       * REPLACEMENT_RECEIVED means only that the replacement material was
       * received; QC and Inventory continue after that.
       */
      let inwardRows = [];
      let projectInventoryRows = [];

      try {
        const [
          inwardResponse,
          projectInventoryResponse,
        ] = await Promise.all([
          API.get("/inward/?page_size=5000"),
          API.get(
            "/inventory/project-inventory/?page_size=5000"
          ),
        ]);

        const inwardPayload =
          inwardResponse?.data;

        inwardRows =
          Array.isArray(inwardPayload)
            ? inwardPayload
            : Array.isArray(
                inwardPayload?.results
              )
            ? inwardPayload.results
            : [];

        const projectInventoryPayload =
          projectInventoryResponse?.data;

        projectInventoryRows =
          Array.isArray(projectInventoryPayload)
            ? projectInventoryPayload
            : Array.isArray(
                projectInventoryPayload?.results
              )
            ? projectInventoryPayload.results
            : [];
      } catch (error) {
        console.error(
          "Unable to load Inward / Project Inventory lifecycle for Purchase Orders:",
          error
        );

        /*
         * Keep the page usable even when one of the related datasets cannot
         * be loaded. The PO list itself is still authoritative for normal
         * PO status.
         */
        try {
          const inwardResponse = await API.get(
            "/inward/?page_size=5000"
          );
          const inwardPayload =
            inwardResponse?.data;

          inwardRows =
            Array.isArray(inwardPayload)
              ? inwardPayload
              : Array.isArray(
                  inwardPayload?.results
                )
              ? inwardPayload.results
              : [];
        } catch (inwardError) {
          console.error(
            "Unable to load Inward QC status:",
            inwardError
          );
          inwardRows = [];
        }

        try {
          const projectInventoryResponse =
            await API.get(
              "/inventory/project-inventory/?page_size=5000"
            );
          const projectInventoryPayload =
            projectInventoryResponse?.data;

          projectInventoryRows =
            Array.isArray(projectInventoryPayload)
              ? projectInventoryPayload
              : Array.isArray(
                  projectInventoryPayload?.results
                )
              ? projectInventoryPayload.results
              : [];
        } catch (projectInventoryError) {
          console.error(
            "Unable to load Project Inventory issue status:",
            projectInventoryError
          );
          projectInventoryRows = [];
        }
      }

      const res = await fetch(
        `${config.baseURL}/procurement/purchase-orders/`,
        { headers: { "Content-Type": "application/json" } }
      );

      if (!res.ok) throw new Error("Failed to fetch");

      const data = await res.json();

      const backendOrders =
        Array.isArray(data)
          ? data
          : data?.results || [];

      /*
       * Keep the PO page identical to what Dashboard considers active.
       * Hidden/deleted IDs stay excluded even if the backend returns them.
       */
      const orders =
        filterVisiblePurchaseOrders(
          backendOrders,
        ).sort(
          (a, b) =>
            new Date(b.po_date) -
            new Date(a.po_date),
        );

      const normalized = orders.map((order) => {
        // Calculate total with GST from items
const items = (order.items || []).map(
  (item) => {
    const component =
      item.component ||
      item.component_obj ||
      item.component_details ||
      null;

const componentId =
  (typeof item.component === "object"
    ? item.component?.id
    : item.component) ??
  item.component_id ??
  item.componentId ??
  "";

    const componentCode =
      component?.component_id ??
      component?.code ??
      item.component_code ??
      item.code ??
      "";

    const componentName =
      component?.name ??
      component?.component_name ??
      item.component_name ??
      item.name ??
      "";

    const componentHsn =
      component?.hsn_numbers ||
      component?.hsn_no ||
      component?.hsn ||
      item.hsn_numbers ||
      item.hsn_no ||
      item.hsn ||
      "-";

    const componentType =
      component?.component_type ||
      component?.componentType ||
      item.component_type ||
      item.componentType ||
      "-";

    const orderedQuantity = Number(
      item.quantity || 0
    );

    const receivedQuantity = Number(
      item.received_quantity || 0
    );

    const remainingQuantity = Math.max(
      orderedQuantity - receivedQuantity,
      0
    );

    return {
      poItemId: item.id,
      componentId,
      componentName:
        componentCode && componentName
          ? `${componentCode} - ${componentName}`
          : componentName ||
            componentCode ||
            "Component",

          hsnNo: componentHsn,
          componentType,

      quantity: orderedQuantity,
      orderedQuantity,
      receivedQuantity,
      remainingQuantity,

      unitPrice: Number(
        item.unit_price || 0
      ),

      gstPercentage: Number(
        item.gst_percentage || 0
      ),

      // IMPORTANT:
      // For Replacement POs, keep the exact Expected Delivery Date
      // that came from the Replacement popup / backend PO item.
      expectedDelivery:
        item.expected_delivery_date ||
        item.expectedDeliveryDate ||
        item.expected_delivery ||
        item.expectedDate ||
        "",
    };
  }
);

        // Calculate subtotal and GST total from items
        let subtotal = 0;
        let gstTotal = 0;
        items.forEach((item) => {
          const lineSubtotal = item.quantity * item.unitPrice;
          const lineGst = lineSubtotal * (item.gstPercentage / 100);
          subtotal += lineSubtotal;
          gstTotal += lineGst;
        });
        const grandTotal = subtotal + gstTotal;
const totalOrderedQuantity = items.reduce(
  (sum, item) =>
    sum + Number(item.orderedQuantity || 0),
  0
);

const totalReceivedQuantity = items.reduce(
  (sum, item) =>
    sum + Number(item.receivedQuantity || 0),
  0
);

const totalRemainingQuantity = items.reduce(
  (sum, item) =>
    sum + Number(item.remainingQuantity || 0),
  0
);
const backendStatus = String(order.status || "").toUpperCase();
const approvalStatus = String(order.approval_status || "").toUpperCase();
const orderIsReplacement =
  String(
    order.order_type || "STANDARD"
  )
    .trim()
    .toUpperCase() ===
  "REPLACEMENT";

const relatedInwards =
  inwardRows.filter((inward) => {
    const inwardPoId =
      typeof inward?.purchase_order ===
      "object"
        ? inward?.purchase_order?.id
        : inward?.purchase_order ??
          inward?.purchase_order_id;

    return (
      String(inwardPoId || "") ===
      String(order.id || "")
    );
  });

const getQcRowsQuantity = (rows) =>
  Array.isArray(rows)
    ? rows.reduce(
        (sum, row) =>
          sum +
          Math.max(
            Number(
              row?.qty ??
                row?.quantity ??
                row?.passed_quantity ??
                row?.failed_quantity ??
                1
            ) || 0,
            0
          ),
        0
      )
    : 0;

const getInwardFailedQuantity = (inward) =>
  getQcRowsQuantity(
    inward?.qc_failed_rows ||
      inward?.failedRows ||
      inward?.failed_rows ||
      []
  );

const getInwardPassedQuantity = (inward) =>
  getQcRowsQuantity(
    inward?.qc_passed_rows ||
      inward?.passedRows ||
      inward?.passed_rows ||
      []
  );

const getInwardQcStatus = (inward) =>
  String(inward?.qc_status || "")
    .trim()
    .toUpperCase();

const replacementQcFailed =
  orderIsReplacement &&
  relatedInwards.some((inward) => {
    const qcStatus =
      getInwardQcStatus(inward);

    return (
      getInwardFailedQuantity(inward) > 0 ||
      qcStatus === "FAIL" ||
      qcStatus === "FAILED"
    );
  });

/*
 * A Replacement PO is QC PASSED only after every inward belonging to that
 * exact Replacement PO has completed QC without a failed row.
 *
 * In this backend qc_status can be COMPLETED for a completed QC operation,
 * so qc_failed_rows is checked first and passed rows are also considered.
 */
const replacementQcPassed =
  orderIsReplacement &&
  relatedInwards.length > 0 &&
  !replacementQcFailed &&
  relatedInwards.every((inward) => {
    const qcStatus =
      getInwardQcStatus(inward);

    const passedQuantity =
      getInwardPassedQuantity(inward);

    return (
      passedQuantity > 0 ||
      [
        "PASS",
        "PASSED",
        "QC_PASSED",
        "QC_CHECKED",
        "COMPLETED",
      ].includes(qcStatus)
    );
  });

const sourceMrNumber = String(
  order.source_mr_number ||
    order.material_request_id ||
    order.request_id ||
    order.mr_number ||
    ""
).trim();

const normalizedMrReference =
  sourceMrNumber.toUpperCase();

const getProjectRowMrReferences = (row) =>
  [
    row?.source_mr_number,
    row?.material_request,
    row?.material_request_id,
    row?.material_request_number,
    row?.request_id,
    row?.mr_id,
  ]
    .filter(
      (value) =>
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
    )
    .map((value) =>
      String(value).trim().toUpperCase()
    );

const getProjectRowComponentId = (row) => {
  const componentValue =
    row?.component;

  if (
    componentValue &&
    typeof componentValue === "object"
  ) {
    return String(
      componentValue.id ??
        componentValue.pk ??
        componentValue.component_id ??
        ""
    );
  }

  return String(
    componentValue ??
      row?.component_id ??
      row?.componentId ??
      ""
  );
};

const projectRowsForMr =
  normalizedMrReference
    ? projectInventoryRows.filter((row) =>
        getProjectRowMrReferences(
          row
        ).includes(normalizedMrReference)
      )
    : [];

/*
 * Inventory issue is tracked in ProjectInventory by MR + component.
 * Replacement POs are procurement material, therefore the purchased-side
 * issued quantity is the relevant quantity here.
 *
 * This keeps the lifecycle:
 *   Received -> QC Pending -> QC Passed -> Inventory Issued
 * and QC Failed always takes precedence.
 */
const replacementInventoryIssued =
  orderIsReplacement &&
  replacementQcPassed &&
  items.length > 0 &&
  items.every((item) => {
    const itemComponentId =
      String(item?.componentId ?? "");

    if (!itemComponentId) {
      return false;
    }

    const matchingProjectRow =
      projectRowsForMr.find(
        (row) =>
          getProjectRowComponentId(row) ===
          itemComponentId
      );

    if (!matchingProjectRow) {
      return false;
    }

    const issuedPurchasedQuantity =
      Math.max(
        Number(
          matchingProjectRow
            ?.issued_purchased_quantity ??
            matchingProjectRow
              ?.calculated_issued_purchased_quantity ??
            0
        ) || 0,
        0
      );

    const replacementItemQuantity =
      Math.max(
        Number(
          item?.orderedQuantity ??
            item?.quantity ??
            0
        ) || 0,
        0
      );

    return (
      replacementItemQuantity > 0 &&
      issuedPurchasedQuantity >=
        replacementItemQuantity
    );
  });

const replacementQcPending =
  orderIsReplacement &&
  backendStatus === "REPLACEMENT_RECEIVED" &&
  !replacementQcFailed &&
  !replacementQcPassed;

const effectiveStatus = backendStatus;

/*
 * EXPECTED DELIVERY DATE
 *
 * The Replacement popup in Outward already asks for this date.
 * Backend stores that date and uses it while creating the Replacement PO.
 *
 * DO NOT ask for another date in the PO page.
 *
 * Display priority:
 *   1. PurchaseOrder.expected_delivery_date
 *   2. First PurchaseOrderItem.expected_delivery_date
 *
 * The second fallback also supports already-created/legacy replacement rows
 * where the date exists only on the PO item.
 */
const rowExpectedDelivery =
  String(
    order.expected_delivery_date ||
      order.expectedDelivery ||
      ""
  ).trim() ||
  String(
    items.find(
      (item) =>
        String(
          item?.expectedDelivery || ""
        ).trim()
    )?.expectedDelivery ||
      ""
  ).trim();

        return {
          id: order.id,
          po: order.po_number,
          vendor: order.vendor_name,

          replacementQcFailed,
          replacementQcPassed,
          replacementQcPending,
          replacementInventoryIssued,
          sourceMrNumber,

          orderType: String(
            order.order_type || "STANDARD"
          ).toUpperCase(),
          isReplacement:
            String(
              order.order_type || "STANDARD"
            ).toUpperCase() === "REPLACEMENT",
          replacementForId:
            order.replacement_for || null,
          replacementForPoNumber:
            order.replacement_for_po_number ||
            "",
          replacementRound: Number(
            order.replacement_round || 0
          ),
          replacementSourceInwardId:
            order.replacement_source_inward_id ||
            null,

          quantity: totalOrderedQuantity,
          receivedQuantity: totalReceivedQuantity,
          remainingQuantity: totalRemainingQuantity,

          unitPrice: order.unit_price,
          subtotal: subtotal,
          gstTotal: gstTotal,
          /*
           * Always display the total calculated from the CURRENT PO items.
           * Refund reduces PurchaseOrderItem.quantity in Django, so this
           * immediately deducts the failed-QC component price + GST.
           */
          total: grandTotal,
          poDate: order.po_date,

          // This is the SAME date selected in the Outward Replacement popup.
          expectedDelivery:
            rowExpectedDelivery || "-",

          status: effectiveStatus,
          approval_status: approvalStatus,
          rejectedBy:
            order.rejected_by ||
            order.rejectedBy ||
            order.rejected_by_role ||
            order.rejectedByRole ||
            order.rejected_by_role_name ||
            order.rejectedByRoleName ||
            order.rejected_by_user ||
            order.rejectedByUser ||
            order.rejected_by_name ||
            order.rejectedByName ||
            order.rejected_by_fullname ||
            order.rejectedByFullName ||
            "",
          rejectionReason:
            order.rejection_reason ||
            order.rejectionReason ||
            order.reject_reason ||
            order.rejectReason ||
            order.reject_note ||
            order.rejectNote ||
            order.rejection_notes ||
            order.rejectionNotes ||
            order.reject_notes ||
            order.rejectNotes ||
            order.rejection_remark ||
            order.rejectionRemark ||
            order.approval_note ||
            order.approvalNote ||
            order.reason ||
            "",
          items: items,
          componentNames: items.map((it) => it.componentName).filter(Boolean).join(", "),
        };
      });

      setPurchaseOrders(normalized);
    } catch (err) {
      console.error(err);
      setPurchaseOrders([]);
      setLoadError(
        err?.message ||
          "Unable to load Purchase Orders. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

const STATUS_OPTIONS = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "ORDERED",
  "PARTIALLY_DELIVERED",
  "DELIVERED",
  "REJECTED",
];

const handleStatusChange = async (
  poId,
  newStatus
) => {
  const normalizedStatus = String(
    newStatus || ""
  )
    .trim()
    .toUpperCase();

  /*
   * Delivery statuses must never be applied by a plain PATCH.
   *
   * A delivery requires invoice, batch, received date,
   * received quantity and an Inward record. Route every
   * DELIVERED/PARTIALLY_DELIVERED request through the
   * delivery form instead.
   */
  if (
    [
      "DELIVERED",
      "PARTIALLY_DELIVERED",
    ].includes(normalizedStatus)
  ) {
    const purchaseOrder =
      purchaseOrders.find(
        (order) =>
          String(order.id) ===
          String(poId)
      );

    if (!purchaseOrder) {
      alert(
        "Purchase Order could not be loaded."
      );
      return;
    }

    openDeliveryChoice(
      purchaseOrder
    );
    return;
  }

  try {
    const res = await fetch(
      `${config.baseURL}/procurement/purchase-orders/${poId}/`,
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          status: normalizedStatus,
        }),
      }
    );

    if (!res.ok) {
      const errorText =
        await res.text();

      throw new Error(
        errorText ||
          "Failed to update PO status."
      );
    }

    await loadPurchaseOrders();
  } catch (err) {
    console.error(
      "Failed to update PO status:",
      err
    );

    alert(
      err.message ||
        "Failed to update PO status."
    );
  }
};
const openDeliveryChoice = async (purchaseOrder) => {
  if (!canManagePO) {
    return;
  }

  try {
    const latestPo = await fetchAuthenticatedJson(
      `/procurement/purchase-orders/${encodeURIComponent(
        purchaseOrder.id,
      )}/`,
      { cache: "no-store" },
    );

    const latestStatus = String(latestPo?.status || "")
      .trim()
      .toUpperCase();

    if (
      ![
        "ORDERED",
        "PARTIALLY_DELIVERED",
        "REPLACEMENT_ORDERED",
        "REPLACEMENT_PARTIALLY_RECEIVED",
      ].includes(latestStatus)
    ) {
      await loadPurchaseOrders();
      alert(
        "This Purchase Order is not ready for delivery. Standard PO must be Ordered/Partially Delivered; Replacement PO must be Replacement Ordered/Partially Received.",
      );
      return;
    }

    await loadPurchaseOrders();
    const refreshedPurchaseOrder = purchaseOrders.find(
      (order) => String(order.id) === String(purchaseOrder.id),
    );

    setSelectedDeliveryPO(refreshedPurchaseOrder || purchaseOrder);
  } catch (error) {
    console.error("Failed to verify PO delivery status:", error);
    await loadPurchaseOrders();
    alert(
      error?.message ||
        "Unable to verify whether this Purchase Order is ready for delivery.",
    );
    return;
  }

  setDeliveryChoiceOpen(true);
};

const openDeliveryForm = (mode) => {
  if (!canManagePO) {
    return;
  }

  if (!selectedDeliveryPO) return;

  const normalizedMode = String(
    mode || ""
  ).toUpperCase();

  const remainingItems = (
    selectedDeliveryPO.items || []
  )
    .filter(
      (item) =>
        Number(item.remainingQuantity) > 0
    )
    .map((item) => ({
      ...item,

      quantityReceived:
        normalizedMode === "DELIVERED"
          ? String(item.remainingQuantity)
          : "",
    }));

  if (remainingItems.length === 0) {
    alert(
      "All quantities for this PO have already been received."
    );
    return;
  }

  setDeliveryMode(normalizedMode);

  setDeliveryForm({
    invoiceNumber: "",
    invoiceDate: "",
    batchNumber: "",
    receivedDate: new Date()
      .toISOString()
      .slice(0, 10),
    items: remainingItems,
  });

  setDeliveryChoiceOpen(false);
  setDeliveryFormOpen(true);
};

const updateDeliveryQuantity = (
  index,
  value
) => {
  if (!canManagePO) {
    return;
  }

  setDeliveryForm((previous) => ({
    ...previous,

    items: previous.items.map(
      (item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        if (value === "") {
          return {
            ...item,
            quantityReceived: "",
          };
        }

        const enteredQuantity = Math.max(
          0,
          Number(value || 0)
        );

        const maximumQuantity = Number(
          item.remainingQuantity || 0
        );

        return {
          ...item,

          quantityReceived: String(
            Math.min(
              enteredQuantity,
              maximumQuantity
            )
          ),
        };
      }
    ),
  }));
};

const closeDeliveryPopups = (
  forceClose = false
) => {
  if (deliverySaving && !forceClose) {
    return;
  }

  setDeliveryChoiceOpen(false);
  setDeliveryFormOpen(false);
  setSelectedDeliveryPO(null);
  setDeliveryMode("");

  setDeliveryForm({
    invoiceNumber: "",
    invoiceDate: "",
    batchNumber: "",
    receivedDate: new Date()
      .toISOString()
      .slice(0, 10),
    items: [],
  });
};

const getNextInwardCode = async () => {
  try {
    /*
     * /inward/ is now JWT protected.
     * Use the shared API client so the access token is sent and
     * an expired access token is refreshed automatically.
     */
    const response = await API.get(
      "/inward/next-code/"
    );

    const data = response?.data || {};

    return (
      data.inward_code ||
      `INW-${String(Date.now()).slice(-6)}`
    );
  } catch (error) {
    console.error(
      "Failed to generate next inward number:",
      error
    );

    throw new Error(
      error?.response?.data?.detail ||
        error?.message ||
        "Unable to generate the next inward number."
    );
  }
};
const toTwoDecimalString = (value) => {
  const number = Number(value ?? 0);

  if (!Number.isFinite(number)) {
    return "0.00";
  }

  /*
   * Send decimal values as fixed two-decimal strings.
   * This avoids JavaScript floating-point values such as
   * 24888.000000000004 reaching Django DecimalField.
   */
  return number.toFixed(2);
};

const isCompleteDelivery =
  deliveryForm.items.every(
    (item) =>
      Number(item.quantityReceived || 0) ===
      Number(item.remainingQuantity || 0)
  );

const finalDeliveryType =
  isCompleteDelivery
    ? "DELIVERED"
    : "PARTIALLY_DELIVERED";
const submitDeliveryReceipt = async () => {
  if (!canManagePO) {
    return;
  }

  if (!selectedDeliveryPO) return;

  if (!deliveryForm.invoiceNumber.trim()) {
    alert("Enter Invoice Number.");
    return;
  }

  if (!deliveryForm.invoiceDate) {
    alert("Select Invoice Date.");
    return;
  }

  if (!deliveryForm.batchNumber.trim()) {
    alert("Enter Batch Number.");
    return;
  }

  if (!deliveryForm.receivedDate) {
    alert("Select Received Date.");
    return;
  }

  const receivingItems = deliveryForm.items
    .map((item) => ({
      ...item,

      quantityReceived: Number(
        item.quantityReceived || 0
      ),
    }))
    .filter(
      (item) =>
        item.quantityReceived > 0
    );

  if (receivingItems.length === 0) {
    alert(
      "Enter at least one received quantity."
    );
    return;
  }

  const invalidItem = receivingItems.find(
    (item) =>
      item.quantityReceived <= 0 ||
      item.quantityReceived >
        Number(item.remainingQuantity)
  );

  if (invalidItem) {
    alert(
      `${invalidItem.componentName}: ` +
        `received quantity must be between 1 and ` +
        `${invalidItem.remainingQuantity}.`
    );

    return;
  }

  const vendor = vendors.find(
    (vendorItem) =>
      String(
        vendorItem.name ||
          vendorItem.vendor_name ||
          ""
      )
        .trim()
        .toLowerCase() ===
      String(
        selectedDeliveryPO.vendor || ""
      )
        .trim()
        .toLowerCase()
  );

  if (!vendor) {
    alert(
      `Vendor "${selectedDeliveryPO.vendor}" ` +
        "was not found in the Vendor table."
    );

    return;
  }

  setDeliverySaving(true);

const createdInwardIds = [];
let receiptCommitted = false;

try {
    const latestPo = await fetchAuthenticatedJson(
      `/procurement/purchase-orders/${encodeURIComponent(
        selectedDeliveryPO.id,
      )}/`,
      { cache: "no-store" },
    );

    const latestStatus = String(latestPo?.status || "")
      .trim()
      .toUpperCase();

    if (
      ![
        "ORDERED",
        "PARTIALLY_DELIVERED",
        "REPLACEMENT_ORDERED",
        "REPLACEMENT_PARTIALLY_RECEIVED",
      ].includes(latestStatus)
    ) {
      await loadPurchaseOrders();
      throw new Error(
        "Only an Ordered/Partially Delivered PO or Replacement Ordered/Partially Received PO can receive material.",
      );
    }

    /*
     * Your current inward backend accepts one
     * top-level component for every inward entry.
     * Therefore, create one inward entry for each
     * received PO component.
     */
    for (const item of receivingItems) {
      if (!item.poItemId) {
        throw new Error(
          `PO item ID is missing for ${item.componentName}.`
        );
      }

      if (!item.componentId) {
        throw new Error(
          `Component database ID is missing for ${item.componentName}.`
        );
      }

      const inwardCode =
        await getNextInwardCode();

      const quantity = Number(
        item.quantityReceived
      );

      const unitPrice = Number(
        item.unitPrice || 0
      );

      const gstPercentage = Number(
        item.gstPercentage || 0
      );

      /*
       * Round every monetary stage to two decimal places.
       * The values posted to Django are strings with exactly
       * two decimal places.
       */
      const basicPrice = Number(
        (quantity * unitPrice).toFixed(2)
      );

      const gstAmount = Number(
        (
          basicPrice *
          (gstPercentage / 100)
        ).toFixed(2)
      );

      const grandTotal = Number(
        (basicPrice + gstAmount).toFixed(2)
      );

      const inwardPayload = {
        code: inwardCode,

        vendor: vendor.id,

        purchase_order:
          selectedDeliveryPO.id,

        component: item.componentId,

        quantity_received: quantity,

        batch_number:
          deliveryForm.batchNumber.trim(),

        received_date:
          deliveryForm.receivedDate,

        qc_status: "PENDING",

line_items: [
  {
    specification: "",

    invoice_number:
      deliveryForm.invoiceNumber.trim(),

    invoice_date:
      deliveryForm.invoiceDate,

    quantity,

    total_quantity: quantity,

    unit_price:
      toTwoDecimalString(unitPrice),

    gst_percentage:
      toTwoDecimalString(gstPercentage),

    grand_total:
      toTwoDecimalString(grandTotal),
  },
],
      };

      let inwardData = null;

      try {
        const inwardResponse =
          await API.post(
            "/inward/",
            inwardPayload
          );

        inwardData =
          inwardResponse?.data || null;
      } catch (error) {
        const errorData =
          error?.response?.data;

        throw new Error(
          errorData?.detail ||
            errorData?.message ||
            (
              errorData
                ? JSON.stringify(errorData)
                : ""
            ) ||
            error?.message ||
            "Failed to create inward entry."
        );
      }

      if (!inwardData?.id) {
        throw new Error(
          `Inward was created for ${item.componentName}, ` +
            "but the backend did not return its database ID."
        );
      }

      createdInwardIds.push(
        inwardData.id
      );
    }

    if (
      createdInwardIds.length !==
      receivingItems.length
    ) {
      throw new Error(
        "PO delivery was not completed because all Inward " +
          "entries were not created."
      );
    }

    /*
     * Update received_quantity in PO items only after every
     * Inward entry has been created successfully.
     *
     * The backend decides whether the final status is
     * PARTIALLY_DELIVERED or DELIVERED.
     */
    let receiveData = null;

    try {
      const receiveResponse =
        await API.post(
          `/procurement/purchase-orders/${selectedDeliveryPO.id}/receive/`,
          {
            delivery_type:
              finalDeliveryType,

            items:
              receivingItems.map(
                (item) => ({
                  po_item_id:
                    item.poItemId,

                  quantity_received:
                    item.quantityReceived,
                })
              ),
          }
        );

      receiveData =
        receiveResponse?.data || null;
    } catch (error) {
      const errorData =
        error?.response?.data;

      throw new Error(
        errorData?.detail ||
          errorData?.message ||
          error?.message ||
          "Failed to update PO delivery."
      );
    }
    receiptCommitted = true;
    closeDeliveryPopups(true);

    await loadPurchaseOrders();

    navigate(
      "/inward",
      {
        state: {
          deliveredPurchaseOrderId:
            selectedDeliveryPO.id,
          createdInwardIds,
          refreshAt: Date.now(),
        },
      }
    );

    /*
     * Dispatch after navigation so an already-mounted Inward
     * route can reload the authoritative backend list.
     */
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(
          "inwardUpdated",
          {
            detail: {
              purchaseOrderId:
                selectedDeliveryPO.id,
              inwardIds:
                createdInwardIds,
            },
          }
        )
      );
    }, 0);
} catch (err) {
  /*
   * Delete already-created inward entries when the
   * complete delivery transaction was not committed.
   */
  if (
    !receiptCommitted &&
    createdInwardIds.length > 0
  ) {
    await Promise.allSettled(
      createdInwardIds.map((inwardId) =>
        API.delete(
          `/inward/${inwardId}/`
        )
      )
    );
  }

  console.error(
    "Delivery receipt failed:",
    err
  );

  alert(
    err.message ||
      "Failed to record delivery."
  );
} finally {
    setDeliverySaving(false);
  }
};
  function handleVendorChange(e) {
    const { name, value } = e.target;

    setVendorForm((previous) => ({
      ...previous,
      [name]:
        name === "is_active"
          ? value === "true"
          : value,
    }));
  }

  function handleVendorProductChange(
    index,
    field,
    value
  ) {
    setVendorProducts((previous) =>
      previous.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const updated = {
          ...item,
          [field]: value,
        };

        if (
          field === "quantity" ||
          field === "unit_price"
        ) {
          updated.price =
            Number(updated.quantity || 0) *
            Number(updated.unit_price || 0);
        }

        return updated;
      })
    );
  }

  function addVendorProduct() {
    setVendorProducts((previous) => [
      ...previous,
      {
        product: "",
        product_version: "",
        quantity: 1,
        unit_price: 0,
        price: 0,
        gst: 0,
      },
    ]);
  }

  function removeVendorProduct(index) {
    setVendorProducts((previous) =>
      previous.filter(
        (_, itemIndex) =>
          itemIndex !== index
      )
    );
  }

  async function handleComponentChange(e) {
    const { name, value } = e.target;

    if (name === "category") {
      setComponentForm((previous) => ({
        ...previous,
        category: value,
        component_id: "",
      }));

      const nextId =
        await generateNextComponentId(value);

      setComponentForm((previous) => ({
        ...previous,
        category: value,
        component_id: nextId,
      }));
      return;
    }

    setComponentForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

async function submitVendor(e) {
  e.preventDefault();

  if (!canManagePO || savingVendor) {
    return;
  }

  const vendorName = String(
    vendorForm.name || ""
  ).trim();

  const phoneNumber = String(
    vendorForm.phone_number || ""
  ).trim();

  const email = String(
    vendorForm.email || ""
  ).trim();

  const pincode = String(
    vendorForm.pincode || ""
  ).trim();

  const stateCode = String(
    vendorForm.state_code || ""
  ).trim();

  const validProducts =
    vendorProducts
      .map((item) => {
        const quantity = Math.max(
          Number(item.quantity || 0),
          0
        );

        const unitPrice = Math.max(
          Number(item.unit_price || 0),
          0
        );

        const price =
          quantity * unitPrice;

        return {
          product: String(
            item.product || ""
          ).trim(),

          product_version: String(
            item.product_version || ""
          ).trim(),

          quantity,
          unit_price: unitPrice,
          price,

          gst: Math.max(
            Number(item.gst || 0),
            0
          ),
        };
      })
      .filter(
        (item) =>
          Boolean(item.product)
      );

  if (!vendorName) {
    alert("Company Name is required.");
    return;
  }

  if (validProducts.length === 0) {
    alert(
      "Enter at least one Product / Component."
    );
    return;
  }

  if (
    phoneNumber &&
    !/^\d{10}$/.test(phoneNumber)
  ) {
    alert(
      "Enter a valid 10-digit phone number."
    );
    return;
  }

  if (
    email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(
      email
    )
  ) {
    alert(
      "Enter a valid email address."
    );
    return;
  }

  if (
    pincode &&
    !/^\d{6}$/.test(pincode)
  ) {
    alert(
      "Enter a valid 6-digit pincode."
    );
    return;
  }

  if (
    stateCode &&
    !/^\d{2}$/.test(stateCode)
  ) {
    alert(
      "Enter a valid 2-digit state code."
    );
    return;
  }

  setSavingVendor(true);

  const payload = {
    name: vendorName,

    contact_person: String(
      vendorForm.contact_person || ""
    ).trim(),

    phone_number: phoneNumber,
    email,

    gst_number: String(
      vendorForm.gst_number || ""
    ).trim(),

    address: String(
      vendorForm.address || ""
    ).trim(),

    city: String(
      vendorForm.city || ""
    ).trim(),

    state: String(
      vendorForm.state || ""
    ).trim(),

    state_code: stateCode,
    pincode,

    payment_terms: String(
      vendorForm.payment_terms || ""
    ).trim(),

    shipping_terms: String(
      vendorForm.shipping_terms || ""
    ).trim(),

    additional_notes: String(
      vendorForm.additional_notes || ""
    ).trim(),

    is_active:
      vendorForm.is_active !== false,

    // Same Vendor products structure used by Vendor New page.
    products: validProducts.map(
      (item) => ({
        product: item.product,
        product_version:
          item.product_version,
        quantity: item.quantity,
        price: item.price,
        gst: item.gst,
      })
    ),
  };

  try {
    let res = await fetch(
      `${config.baseURL}/vendors/`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    let responseData =
      await res
        .json()
        .catch(() => null);

    /*
     * Keep the same duplicate-name handling used by
     * the existing Vendor creation flow.
     */
    if (!res.ok) {
      const errorText =
        JSON.stringify(
          responseData || {}
        );

      const nameConflict =
        /name|unique|already/i.test(
          errorText
        );

      if (nameConflict) {
        payload.name =
          `${vendorName} - ` +
          Date.now()
            .toString()
            .slice(-5);

        res = await fetch(
          `${config.baseURL}/vendors/`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              payload
            ),
          }
        );

        responseData =
          await res
            .json()
            .catch(() => null);
      }
    }

    if (!res.ok) {
      throw new Error(
        responseData?.detail ||
        responseData?.message ||
        JSON.stringify(
          responseData || {}
        ) ||
        "Vendor save failed"
      );
    }

    console.log(
      "Vendor created successfully:",
      responseData
    );

    if (responseData?.id) {
      setVendors((previous) => {
        const filtered =
          previous.filter(
            (vendor) =>
              String(vendor.id) !==
              String(responseData.id)
          );

        return [
          ...filtered,
          responseData,
        ];
      });
    }

    setVendorsModalOpen(false);

    setVendorForm({
      name: "",
      contact_person: "",
      phone_number: "",
      email: "",
      gst_number: "",
      address: "",
      city: "",
      state: "",
      state_code: "",
      pincode: "",
      payment_terms: "",
      shipping_terms: "",
      additional_notes: "",
      is_active: true,
    });

    setVendorProducts([
      {
        product: "",
        product_version: "",
        quantity: 1,
        unit_price: 0,
        price: 0,
        gst: 0,
      },
    ]);

  } catch (err) {
    console.error(
      "Vendor save failed:",
      err
    );

    alert(
      err?.message ||
        "Vendor save failed"
    );

  } finally {
    setSavingVendor(false);
  }
}

  async function submitComponent(e) {
    e.preventDefault();

    if (!canManagePO) {
      return;
    }

    let normalizedComponentId =
      String(componentForm.component_id || "").trim().toUpperCase();

    const selectedPrefix =
      CATEGORY_PREFIXES[componentForm.category];

    const expectedPattern = selectedPrefix
      ? new RegExp(`^${selectedPrefix}_\\d{4}$`, "i")
      : null;

    if (
      !expectedPattern ||
      !expectedPattern.test(normalizedComponentId)
    ) {
      normalizedComponentId =
        await generateNextComponentId(
          componentForm.category
        );

      setComponentForm((previous) => ({
        ...previous,
        component_id: normalizedComponentId,
      }));
    }

    setSavingComponent(true);

    const payload = {
      component_id: normalizedComponentId,
      version: "",
      category: componentForm.category,
      component_type: String(
        componentForm.component_type || ""
      ).trim(),
      specifications: componentForm.specifications,
      hsn_numbers: componentForm.hsn_no,
      sku_numbers: componentForm.sku_no,
      part_numbers: componentForm.part_no,
      tally_reference: componentForm.tally_reference,
      product_link: componentForm.product_link,
      created_at: new Date().toISOString(),
      date: new Date().toISOString().split("T")[0],
      ordering_id: null,
      unit_price: 0,
      stock_quantity: 0,
      reorder_level: 0,
      is_active: true,
    };

    try {
      const res = await fetch(`${config.baseURL}/components/components/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const created = await res.json();
        // component request created on backend
      } else {
        throw new Error("Component save failed");
      }

      setComponentsModalOpen(false);

      const nextComponentId =
        await generateNextComponentId("ACCESSORIES");

      setComponentForm({
        component_id: nextComponentId,
        name: "",
        category: "ACCESSORIES",
        component_type: "",
        specifications: "",
        hsn_no: "",
        sku_no: "",
        part_no: "",
        tally_reference: "",
        unit_of_measurements: "",
        product_link: "",
      });
    } catch (err) {
      console.error("Component save failed", err);
      alert(err?.message || "Component save failed");
    } finally {
      setSavingComponent(false);
    }
  }


  const purchaseOrdersPageCount = Math.max(
    1,
    Math.ceil(
      purchaseOrdersDisplayedCount / PURCHASE_ORDERS_PAGE_SIZE,
    ),
  );

  useEffect(() => {
    setPurchaseOrdersPage((currentPage) =>
      Math.min(currentPage, purchaseOrdersPageCount),
    );
  }, [purchaseOrdersPageCount]);

  return _jsxs(PageShell, {
    
    children: [
      _jsx(PageHeader, {
        title: "Purchase Orders",
        subtitle: "Admin and Procurement can view and manage purchase orders here.",
        right: canManagePO ? _jsxs("div", {
          className: "flex flex-wrap items-center gap-2",
          children: [
            _jsxs("div", {
              className: "flex flex-wrap items-center gap-2",
              children: [
                _jsx("button", {
                  type: "button",
                  onClick: selectionMode ? handleDeleteSelected : handleEnableSelectionMode,
                  disabled: selectionMode && selectedRowKeys.length === 0,
                  className: "inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50",
                  style: { backgroundColor: "#E85D75" },
                  children: selectionMode ? `Delete Selected (${selectedRowKeys.length})` : "Delete",
                }),
                _jsx("button", {
                  type: "button",
                  onClick: openBulkGenerateModal,
                  className: "inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90",
                  children: "Generate PO",
                }),
                selectionMode &&
                  _jsx("button", {
                    type: "button",
                    onClick: handleCancelSelectionMode,
                    className: "inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary",
                    children: "Cancel",
                  }),
              ],
            }),
            // Add Vendor Dialog
            _jsxs(Dialog, {
              open: vendorsModalOpen,
              onOpenChange: setVendorsModalOpen,
              children: [
                _jsx(DialogTrigger, {
                  asChild: true,
                  children: _jsx("button", {
                    className: "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary",
                    children: "Add Vendor",
                  }),
                }),
                _jsx(DialogContent, {
                  className: "max-w-6xl",
                  children: _jsxs("form", {
                    onSubmit: submitVendor,
                    children: [
                      _jsx(DialogHeader, {
                        children: _jsx(DialogTitle, {
                          children: "Add Vendor",
                        }),
                      }),

                      _jsxs("div", {
                        className:
                          "grid grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-2 xl:grid-cols-4",
                        children: [
                          _jsx(Field, {
                            label: "Company Name",
                            required: true,
                            children: _jsx(Input, {
                              name: "name",
                              value: vendorForm.name,
                              onChange: handleVendorChange,
                            }),
                          }),

                          _jsx(Field, {
                            label: "Contact Person",
                            children: _jsx(Input, {
                              name: "contact_person",
                              value:
                                vendorForm.contact_person,
                              onChange:
                                handleVendorChange,
                            }),
                          }),

                          _jsx(Field, {
                            label: "Phone",
                            children: _jsx(Input, {
                              name: "phone_number",
                              value:
                                vendorForm.phone_number,
                              inputMode: "numeric",
                              maxLength: 10,
                              placeholder:
                                "10-digit phone",
                              onChange: (e) =>
                                setVendorForm(
                                  (previous) => ({
                                    ...previous,
                                    phone_number:
                                      e.target.value
                                        .replace(
                                          /\D/g,
                                          ""
                                        )
                                        .slice(
                                          0,
                                          10
                                        ),
                                  })
                                ),
                            }),
                          }),

                          _jsx(Field, {
                            label: "Email",
                            children: _jsx(Input, {
                              type: "email",
                              name: "email",
                              value: vendorForm.email,
                              onChange:
                                handleVendorChange,
                              placeholder:
                                "name@company.com",
                            }),
                          }),

                          _jsx(Field, {
                            label: "Address",
                            children: _jsx(Input, {
                              name: "address",
                              value:
                                vendorForm.address,
                              onChange:
                                handleVendorChange,
                            }),
                          }),

                          _jsx(Field, {
                            label: "City",
                            children: _jsx(Input, {
                              name: "city",
                              value: vendorForm.city,
                              onChange:
                                handleVendorChange,
                            }),
                          }),

                          _jsx(Field, {
                            label: "Pincode",
                            children: _jsx(Input, {
                              name: "pincode",
                              value:
                                vendorForm.pincode,
                              inputMode: "numeric",
                              maxLength: 6,
                              onChange: (e) =>
                                setVendorForm(
                                  (previous) => ({
                                    ...previous,
                                    pincode:
                                      e.target.value
                                        .replace(
                                          /\D/g,
                                          ""
                                        )
                                        .slice(
                                          0,
                                          6
                                        ),
                                  })
                                ),
                            }),
                          }),

                          _jsx(Field, {
                            label: "State",
                            children: _jsx(Input, {
                              name: "state",
                              value:
                                vendorForm.state,
                              onChange:
                                handleVendorChange,
                            }),
                          }),

                          _jsx(Field, {
                            label: "State Code",
                            children: _jsx(Input, {
                              name: "state_code",
                              value:
                                vendorForm.state_code,
                              inputMode: "numeric",
                              maxLength: 2,
                              onChange: (e) =>
                                setVendorForm(
                                  (previous) => ({
                                    ...previous,
                                    state_code:
                                      e.target.value
                                        .replace(
                                          /\D/g,
                                          ""
                                        )
                                        .slice(
                                          0,
                                          2
                                        ),
                                  })
                                ),
                            }),
                          }),

                          _jsx(Field, {
                            label: "GST Number",
                            children: _jsx(Input, {
                              name: "gst_number",
                              value:
                                vendorForm.gst_number,
                              onChange:
                                handleVendorChange,
                            }),
                          }),

                          _jsx(Field, {
                            label: "Payment Terms",
                            children: _jsx(Input, {
                              name: "payment_terms",
                              value:
                                vendorForm.payment_terms,
                              onChange:
                                handleVendorChange,
                            }),
                          }),

                          _jsx(Field, {
                            label: "Shipping Terms",
                            children: _jsx(Input, {
                              name: "shipping_terms",
                              value:
                                vendorForm.shipping_terms,
                              onChange:
                                handleVendorChange,
                            }),
                          }),

                          _jsx(Field, {
                            label: "Additional Notes",
                            children: _jsx(Input, {
                              name:
                                "additional_notes",
                              value:
                                vendorForm.additional_notes,
                              onChange:
                                handleVendorChange,
                            }),
                          }),

                          _jsx(Field, {
                            label: "Status",
                            children: _jsx(Select, {
                              name: "is_active",
                              value:
                                vendorForm.is_active
                                  ? "true"
                                  : "false",
                              onChange:
                                handleVendorChange,
                              options: [
                                {
                                  value: "true",
                                  label: "Active",
                                },
                                {
                                  value: "false",
                                  label: "Inactive",
                                },
                              ],
                            }),
                          }),
                        ],
                      }),

                      _jsxs("div", {
                        className: "mt-3",
                        children: [
                          _jsxs("div", {
                            className:
                              "mb-2 flex items-center justify-between",
                            children: [
                              _jsx("h3", {
                                className:
                                  "text-sm font-semibold",
                                children:
                                  "Components / Products",
                              }),

                              _jsx("button", {
                                type: "button",
                                onClick:
                                  addVendorProduct,
                                className:
                                  "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white",
                                children:
                                  "+ Add Components",
                              }),
                            ],
                          }),

                          _jsx("div", {
                            className:
                              "overflow-x-auto rounded-lg border border-border",
                            children: _jsxs(
                              "table",
                              {
                                className:
                                  "w-full min-w-[900px] border-collapse text-xs",
                                children: [
                                  _jsx("thead", {
                                    className:
                                      "bg-muted/50",
                                    children: _jsxs(
                                      "tr",
                                      {
                                        children: [
                                          _jsx(
                                            "th",
                                            {
                                              className:
                                                "px-2 py-2 text-left",
                                              children:
                                                "Component",
                                            }
                                          ),
                                          _jsx(
                                            "th",
                                            {
                                              className:
                                                "px-2 py-2",
                                              children:
                                                "Version",
                                            }
                                          ),
                                          _jsx(
                                            "th",
                                            {
                                              className:
                                                "px-2 py-2",
                                              children:
                                                "Qty",
                                            }
                                          ),
                                          _jsx(
                                            "th",
                                            {
                                              className:
                                                "px-2 py-2",
                                              children:
                                                "Unit Price",
                                            }
                                          ),
                                          _jsx(
                                            "th",
                                            {
                                              className:
                                                "px-2 py-2",
                                              children:
                                                "Price",
                                            }
                                          ),
                                          _jsx(
                                            "th",
                                            {
                                              className:
                                                "px-2 py-2",
                                              children:
                                                "GST %",
                                            }
                                          ),
                                          _jsx(
                                            "th",
                                            {
                                              className:
                                                "px-2 py-2",
                                              children:
                                                "Total",
                                            }
                                          ),
                                          _jsx(
                                            "th",
                                            {
                                              className:
                                                "px-2 py-2",
                                              children:
                                                "Delete",
                                            }
                                          ),
                                        ],
                                      }
                                    ),
                                  }),

                                  _jsx("tbody", {
                                    children:
                                      vendorProducts.map(
                                        (
                                          item,
                                          index
                                        ) => {
                                          const price =
                                            Number(
                                              item.price ||
                                                0
                                            );

                                          const total =
                                            price +
                                            (price *
                                              Number(
                                                item.gst ||
                                                  0
                                              )) /
                                              100;

                                          return _jsxs(
                                            "tr",
                                            {
                                              className:
                                                "border-t border-border",
                                              children: [
                                                _jsx(
                                                  "td",
                                                  {
                                                    className:
                                                      "px-2 py-1.5",
                                                    children:
                                                      _jsx(
                                                        Input,
                                                        {
                                                          value:
                                                            item.product,
                                                          placeholder:
                                                            "Component",
                                                          onChange:
                                                            (
                                                              e
                                                            ) =>
                                                              handleVendorProductChange(
                                                                index,
                                                                "product",
                                                                e
                                                                  .target
                                                                  .value
                                                              ),
                                                        }
                                                      ),
                                                  }
                                                ),

                                                _jsx(
                                                  "td",
                                                  {
                                                    className:
                                                      "px-2 py-1.5",
                                                    children:
                                                      _jsx(
                                                        Input,
                                                        {
                                                          value:
                                                            item.product_version,
                                                          onChange:
                                                            (
                                                              e
                                                            ) =>
                                                              handleVendorProductChange(
                                                                index,
                                                                "product_version",
                                                                e
                                                                  .target
                                                                  .value
                                                              ),
                                                        }
                                                      ),
                                                  }
                                                ),

                                                _jsx(
                                                  "td",
                                                  {
                                                    className:
                                                      "px-2 py-1.5",
                                                    children:
                                                      _jsx(
                                                        Input,
                                                        {
                                                          type: "number",
                                                          min: 0,
                                                          value:
                                                            item.quantity,
                                                          onChange:
                                                            (
                                                              e
                                                            ) =>
                                                              handleVendorProductChange(
                                                                index,
                                                                "quantity",
                                                                e
                                                                  .target
                                                                  .value
                                                              ),
                                                        }
                                                      ),
                                                  }
                                                ),

                                                _jsx(
                                                  "td",
                                                  {
                                                    className:
                                                      "px-2 py-1.5",
                                                    children:
                                                      _jsx(
                                                        Input,
                                                        {
                                                          type: "number",
                                                          min: 0,
                                                          step: "0.01",
                                                          value:
                                                            item.unit_price,
                                                          onChange:
                                                            (
                                                              e
                                                            ) =>
                                                              handleVendorProductChange(
                                                                index,
                                                                "unit_price",
                                                                e
                                                                  .target
                                                                  .value
                                                              ),
                                                        }
                                                      ),
                                                  }
                                                ),

                                                _jsx(
                                                  "td",
                                                  {
                                                    className:
                                                      "px-2 py-1.5",
                                                    children:
                                                      _jsx(
                                                        Input,
                                                        {
                                                          value:
                                                            price.toFixed(
                                                              2
                                                            ),
                                                          readOnly:
                                                            true,
                                                        }
                                                      ),
                                                  }
                                                ),

                                                _jsx(
                                                  "td",
                                                  {
                                                    className:
                                                      "px-2 py-1.5",
                                                    children:
                                                      _jsx(
                                                        Input,
                                                        {
                                                          type: "number",
                                                          min: 0,
                                                          step: "0.01",
                                                          value:
                                                            item.gst,
                                                          onChange:
                                                            (
                                                              e
                                                            ) =>
                                                              handleVendorProductChange(
                                                                index,
                                                                "gst",
                                                                e
                                                                  .target
                                                                  .value
                                                              ),
                                                        }
                                                      ),
                                                  }
                                                ),

                                                _jsx(
                                                  "td",
                                                  {
                                                    className:
                                                      "px-2 py-1.5 text-center font-semibold",
                                                    children:
                                                      `₹${total.toFixed(
                                                        2
                                                      )}`,
                                                  }
                                                ),

                                                _jsx(
                                                  "td",
                                                  {
                                                    className:
                                                      "px-2 py-1.5 text-center",
                                                    children:
                                                      _jsx(
                                                        "button",
                                                        {
                                                          type: "button",
                                                          onClick:
                                                            () =>
                                                              removeVendorProduct(
                                                                index
                                                              ),
                                                          className:
                                                            "rounded-md px-2 py-1 text-red-600 hover:bg-red-50",
                                                          children:
                                                            "Delete",
                                                        }
                                                      ),
                                                  }
                                                ),
                                              ],
                                            },
                                            item.id ??
                                            item.product_id ??
                                            `vendor-product-${index}`
                                          );
                                        }
                                      ),
                                  }),
                                ],
                              }
                            ),
                          }),

                          _jsxs("div", {
                            className:
                              "mt-2 flex justify-end text-sm font-semibold",
                            children: [
                              "Grand Total: ",
                              _jsx("span", {
                                className:
                                  "ml-2 text-primary",
                                children:
                                  `₹${vendorGrandTotal.toFixed(
                                    2
                                  )}`,
                              }),
                            ],
                          }),
                        ],
                      }),

                      _jsx(DialogFooter, {
                        children: _jsxs("div", {
                          className:
                            "flex justify-end gap-2",
                          children: [
                            _jsx("button", {
                              type: "button",
                              className:
                                "rounded-lg border px-3 py-2",
                              onClick: () =>
                                setVendorsModalOpen(
                                  false
                                ),
                              children: "Cancel",
                            }),

                            _jsx("button", {
                              type: "submit",
                              disabled:
                                savingVendor,
                              className:
                                "rounded-lg bg-primary px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60",
                              children:
                                savingVendor
                                  ? "Saving..."
                                  : "Save Vendor",
                            }),
                          ],
                        }),
                      }),
                    ],
                  }),
                }),
              ],
            }),

            // Add Component Dialog
            _jsxs(Dialog, {
              open: componentsModalOpen,
              onOpenChange: handleComponentDialogOpenChange,
              children: [
                _jsx(DialogTrigger, {
                  asChild: true,
                  children: _jsx("button", {
                    className: "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary",
                    children: "+ New Component",
                  }),
                }),
                _jsx(DialogContent, {
                  className: "max-w-2xl",
                  children: _jsxs("form", {
                    onSubmit: submitComponent,
                    children: [
                      _jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "New Component" }) }),
                      _jsxs(FormGrid, {
                        children: [
                          _jsx(Field, {
                            label: "Component ID",
                            required: true,
                            children: _jsx(Input, {
                              name: "component_id",
                              value: componentForm.component_id,
                              readOnly: true,
                              tabIndex: -1,
                              title: "Component ID is generated automatically",
                              className: "cursor-not-allowed bg-muted font-mono",
                            }),
                          }),
                          _jsx(Field, { label: "Version", children: _jsx(Input, { name: "version", value: componentForm.version || "", onChange: handleComponentChange }) }),
                          _jsx(Field, { label: "Category", required: true, children: _jsx(Select, { name: "category", value: componentForm.category, onChange: handleComponentChange, options: [
                            { value: "ACCESSORIES", label: "Accessories" },
                            { value: "AIRFRAMES", label: "Airframes" },
                            { value: "COMMUNICATION", label: "Communication" },
                            { value: "ELECTRICALS", label: "Electricals" },
                            { value: "ELECTRONICS", label: "Electronics" },
                            { value: "PAYLOAD", label: "Payload" },
                            { value: "TOOLS", label: "Tools" },
                          ] }) }),
                          _jsx(Field, {
                            label: "Component Type",
                            required: true,
                            children: _jsx(Input, {
                              name: "component_type",
                              value: componentForm.component_type,
                              onChange: handleComponentChange,
                              placeholder: "Example: Flight Controller",
                            }),
                          }),
                          _jsx(Field, { label: "Specification", children: _jsx(Input, { name: "specifications", value: componentForm.specifications, onChange: handleComponentChange }) }),
                          _jsx(Field, { label: "HSN.No", children: _jsx(Input, { name: "hsn_no", value: componentForm.hsn_no, onChange: handleComponentChange, inputMode: "numeric", pattern: "\\d{4,8}", minLength: 4, maxLength: 8, title: "Enter 4 to 8 digits, or leave blank." }) }),
                          _jsx(Field, { label: "SKU.No", children: _jsx(Input, { name: "sku_no", value: componentForm.sku_no, onChange: handleComponentChange }) }),
                          _jsx(Field, { label: "Part.No", children: _jsx(Input, { name: "part_no", value: componentForm.part_no, onChange: handleComponentChange }) }),
                          _jsx(Field, { label: "Tally Reference", children: _jsx(Input, { name: "tally_reference", value: componentForm.tally_reference, onChange: handleComponentChange }) }),
                          _jsx(Field, { label: "Product Link", children: _jsx(Input, { name: "product_link", value: componentForm.product_link, onChange: handleComponentChange, placeholder: "https://" }) }),
                        ],
                      }),
                      _jsx(DialogFooter, {
                        children: _jsxs("div", {
                          className: "flex justify-end gap-2",
                          children: [
                            _jsx("button", { type: "button", className: "rounded-lg border px-3 py-2", onClick: () => setComponentsModalOpen(false), children: "Cancel" }),
                            _jsx("button", { type: "submit", className: "rounded-lg bg-primary px-3 py-2 text-white", children: savingComponent ? "Saving..." : "Save Component" }),
                          ],
                        }),
                      }),
                    ],
                  }),
                }),
              ],
            }),

_jsx(Link, {
  to: "/purchase-orders/new",
  className:
    "inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90",
  children: _jsxs("span", {
    className: "inline-flex items-center gap-2",
    children: [
      _jsx(Plus, {
        className: "size-4",
      }),
      "Create PO",
    ],
  }),
}),
          ],
        }) : null,
      }),

      _jsx("div", {
        className: "rounded-lg overflow-hidden bg-card p-4",
        children: _jsxs("div", {
          className: "relative",
          children: [
            _jsx(DataTable, {
        enableColumnTools: true,
          columns: [
{
  key: "sno",
  header: "S.No",
  className: "w-[5rem] text-center",
  disableColumnTools: true,
  render: (_row, index) =>
    (purchaseOrdersPage - 1) *
      PURCHASE_ORDERS_PAGE_SIZE +
    index +
    1,
},
{
  key: "po",
  header: "PO Number",
  className: "text-center w-40 whitespace-nowrap",

  render: (r) => (
    <div className="flex flex-col items-center gap-1">
      <Link
        to={`/purchase-orders/${r.id}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          fontWeight: 700,
          fontSize: "16px",
          color: "#E85D75",
          textDecoration: "underline",
          whiteSpace: "nowrap",
        }}
      >
        {r.po}
      </Link>
      {r.isReplacement && (
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
          Replacement R{r.replacementRound || 1}
        </span>
      )}
    </div>
  ),
},
{
  key: "sourceMrNumber",
  header: "MR ID",
  className: "text-center min-w-[190px] whitespace-nowrap",
  render: (r) => (
    <span
      className={
        r.sourceMrNumber
          ? "font-semibold text-blue-600 dark:text-blue-400"
          : "text-slate-400"
      }
    >
      {r.sourceMrNumber || "Direct PO"}
    </span>
  ),
},
            { key: "vendor", header: "Vendor", className: "text-center" },
            {
              key: "components",
              header: "Components",
              className: "text-center min-w-[140px]",
              render: (r) => {
                const componentCount =
                  Array.isArray(r?.items)
                    ? r.items.length
                    : 0;

                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPOComponentsPopup(r);
                    }}
                    className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
                  >
                    {componentCount > 0
                      ? `Components (${componentCount})`
                      : "Components"}
                  </button>
                );
              },
            },
            { key: "quantity", header: "Quantity", className: "text-center", render: (r) => r.quantity },
            { 
              key: "total", 
              header: "Order Total", 
              className: "text-center font-semibold",
              render: (r) => {
                const subtotal = r.subtotal || 0;
                const gstTotal = r.gstTotal || 0;
                const total = r.total || (subtotal + gstTotal);
                return `₹${total.toLocaleString()}`;
              }
            },
           {
  key: "poDate",
  header: "PO Date",
  className: "text-center",
},

{
  key: "expectedDelivery",
  header: "Expected Delivery",
  className: "text-center",
},

{
  key: "status",
  header: "Status",
  className: "text-center",

  render: (r) => {
    // Display the actual status field, not approval_status
    const status = r.status || "PENDING";
    const normalizedStatus = String(status)
      .trim()
      .toUpperCase();

    const isDirectPO =
      !r.isReplacement &&
      !String(r.sourceMrNumber || "").trim();

    if (
      isDirectPO &&
      normalizedStatus === "PENDING"
    ) {
      return (
        <span className="inline-flex max-w-[190px] items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-center text-[11px] font-semibold leading-4 text-amber-700">
          Pending Manager Approval
        </span>
      );
    }

    if (
      isDirectPO &&
      normalizedStatus === "PENDING_FINANCE"
    ) {
      return (
        <span className="inline-flex max-w-[190px] items-center justify-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-center text-[11px] font-semibold leading-4 text-violet-700">
          Pending Finance Approval
        </span>
      );
    }

    if (
      isDirectPO &&
      normalizedStatus === "FINANCE_APPROVED"
    ) {
      return (
        <span className="inline-flex max-w-[190px] items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-center text-[11px] font-semibold leading-4 text-emerald-700">
          Finance Approved
        </span>
      );
    }

    if (r.isReplacement) {
      let label =
        REPLACEMENT_STATUS_LABELS[
          normalizedStatus
        ] ||
        normalizedStatus.replaceAll(
          "_",
          " "
        );

      let lifecycleClass =
        "border-blue-200 bg-blue-50 text-blue-700";

      /*
       * REPLACEMENT_RECEIVED is only the delivery state.
       * Show the latest downstream state from QC / Inventory.
       *
       * Priority is important:
       *   QC Failed
       *      > Inventory Issued
       *      > QC Passed
       *      > QC Pending
       */
      if (
        normalizedStatus ===
        "REPLACEMENT_RECEIVED"
      ) {
        if (r.replacementQcFailed) {
          label =
            "Replacement Received - QC Failed";
          lifecycleClass =
            "border-rose-200 bg-rose-50 text-rose-700";
        } else if (
          r.replacementInventoryIssued
        ) {
          label =
            "Replacement Received - Inventory Issued";
          lifecycleClass =
            "border-indigo-200 bg-indigo-50 text-indigo-700";
        } else if (r.replacementQcPassed) {
          label =
            "Replacement Received - QC Passed";
          lifecycleClass =
            "border-emerald-200 bg-emerald-50 text-emerald-700";
        } else {
          label =
            "Replacement Received - QC Pending";
          lifecycleClass =
            "border-amber-200 bg-amber-50 text-amber-700";
        }
      }

      const rejected = [
        "REPLACEMENT_MANAGER_REJECTED",
        "REPLACEMENT_FINANCE_REJECTED",
      ].includes(normalizedStatus);

      return (
        <button
          type="button"
          onClick={() => {
            if (rejected) loadRejectDetails(r);
          }}
          disabled={!rejected}
          className={`inline-flex max-w-[190px] items-center justify-center rounded-full border px-2.5 py-1 text-center text-[11px] font-semibold leading-4 ${
            rejected
              ? "border-rose-200 bg-rose-50 text-rose-700 hover:opacity-80"
              : lifecycleClass
          }`}
        >
          {label}
        </button>
      );
    }
    
    // For APPROVED, ORDERED, DELIVERED - make them clickable transitions
 if (status === "APPROVED" && canManagePO) {
      return (
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            await updatePOStatus(r.id, "ORDERED");
          }}
          className="rounded-full hover:opacity-80 transition"
          style={{ outline: "none" }}
        >
          <StatusBadge status={status} rejectedBy={r.rejectedBy || r.rejected_by} />
        </button>
      );
} else if (
  String(status).toUpperCase() ===
    "ORDERED" ||
  String(status).toUpperCase() ===
    "PARTIALLY_DELIVERED"
) {
  return (
    <StatusBadge
      status={status}
      rejectedBy={
        r.rejectedBy ||
        r.rejected_by
      }
    />
  );
   } else if (
  String(status).toUpperCase() === "REJECTED" ||
  String(status).toUpperCase() === "FINANCE_REJECTED"
) {
      return (
        <button
          type="button"
          onClick={() => {
            loadRejectDetails(r);
          }}
          className="rounded-full hover:opacity-80 transition"
          style={{ outline: "none" }}
        >
          <StatusBadge status={status} rejectedBy={r.rejectedBy || r.rejected_by} />
        </button>
      );
    } else {
      return (
        <button
          type="button"
          className="rounded-full cursor-default"
          style={{ outline: "none" }}
        >
          <StatusBadge status={status} rejectedBy={r.rejectedBy || r.rejected_by} />
        </button>
      );
    }
  },
},
{
  key: "approval",
  header: "Approval",
  className: "text-center",

  render: (r) => {
    const normalizedStatus = String(
      r?.status || ""
    )
      .trim()
      .toUpperCase();

    const normalizedApprovalStatus = String(
      r?.approval_status || ""
    )
      .trim()
      .toUpperCase();

    // ------------------------------------------
    // QC replacement approval / receipt cycle
    // ------------------------------------------
    if (r.isReplacement) {
      let presentation =
        PO_ACTION_PRESENTATION[
          normalizedStatus
        ] ||
        DEFAULT_PO_ACTION_PRESENTATION;

      /*
       * Once the replacement is received, the Approval column becomes a
       * lifecycle indicator for QC and Inventory.
       */
      if (
        normalizedStatus ===
        "REPLACEMENT_RECEIVED"
      ) {
        if (r.replacementQcFailed) {
          presentation = {
            label:
              "Replacement Received - QC Failed",
            actionClass:
              "border-rose-600 bg-rose-600 text-white",
          };
        } else if (
          r.replacementInventoryIssued
        ) {
          presentation = {
            label:
              "Replacement Received - Inventory Issued",
            actionClass:
              "border-indigo-600 bg-indigo-600 text-white",
          };
        } else if (r.replacementQcPassed) {
          presentation = {
            label:
              "Replacement Received - QC Passed",
            actionClass:
              "border-emerald-600 bg-emerald-600 text-white",
          };
        } else {
          presentation = {
            label:
              "Replacement Received - QC Pending",
            actionClass:
              "border-amber-500 bg-amber-500 text-white",
          };
        }
      }

      if (
        normalizedStatus ===
          "REPLACEMENT_PENDING_MANAGER" &&
        isProcurementRole
      ) {
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void runReplacementAction(
                r,
                "replacement-procurement-approve"
              );
            }}
            className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
          >
            Approve
          </button>
        );
      }

      if (
        normalizedStatus === "REPLACEMENT_APPROVED" &&
        canManagePO
      ) {
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void runReplacementAction(
                r,
                "replacement-mark-ordered"
              );
            }}
            className={[
              "inline-flex w-full max-w-[170px] items-center justify-center",
              "rounded-lg border px-3 py-1.5",
              "text-center text-[11px] font-semibold leading-4",
              presentation.actionClass,
            ].join(" ")}
          >
            {presentation.label}
          </button>
        );
      }

      if (
        [
          "REPLACEMENT_ORDERED",
          "REPLACEMENT_PARTIALLY_RECEIVED",
        ].includes(normalizedStatus) &&
        canManagePO
      ) {
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openDeliveryChoice(r);
            }}
            className={[
              "inline-flex w-full max-w-[180px] items-center justify-center",
              "rounded-lg border px-3 py-1.5",
              "text-center text-[11px] font-semibold leading-4",
              presentation.actionClass,
            ].join(" ")}
          >
            {presentation.label}
          </button>
        );
      }

      return (
        <span
          className={[
            "inline-flex w-full max-w-[180px] items-center justify-center",
            "rounded-lg border px-3 py-1.5",
            "text-center text-[11px] font-semibold leading-4 shadow-sm",
            presentation.actionClass,
          ].join(" ")}
        >
          {presentation.label}
        </span>
      );
    }

    const isDirectPO =
      !r.isReplacement &&
      !String(r.sourceMrNumber || "").trim();

    // Direct PO:
    // Manager is the FIRST approver and acts ONLY from Notifications.
    if (
      isDirectPO &&
      normalizedStatus === "PENDING"
    ) {
      return (
        <span className="inline-flex w-full max-w-[170px] items-center justify-center rounded-lg border border-amber-500 bg-amber-50 px-3 py-1.5 text-center text-[11px] font-semibold leading-4 text-amber-700">
          Pending Manager Approval
        </span>
      );
    }

    // Manager approved. Finance is now the ONLY pending approval.
    if (
      isDirectPO &&
      normalizedStatus === "PENDING_FINANCE"
    ) {
      return (
        <span className="inline-flex w-full max-w-[170px] items-center justify-center rounded-lg border border-violet-500 bg-violet-50 px-3 py-1.5 text-center text-[11px] font-semibold leading-4 text-violet-700">
          Pending Finance Approval
        </span>
      );
    }

    // Finance approval is final. Procurement can now place the Direct PO.
    if (
      isDirectPO &&
      normalizedStatus === "FINANCE_APPROVED" &&
      canManagePO
    ) {
      return (
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();

            await updatePOStatus(
              r.id,
              "ORDERED"
            );
          }}
          className="inline-flex w-full max-w-[170px] items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-center text-[11px] font-semibold leading-4 text-white hover:bg-blue-700"
        >
          Mark as Ordered
        </button>
      );
    }

    // ------------------------------------------
    // Decide which action/status should display
    // ------------------------------------------

    let visibleActionStatus = "PENDING_FINANCE";

    if (
      normalizedStatus === "REJECTED" ||
      normalizedStatus === "FINANCE_REJECTED" ||
      normalizedApprovalStatus === "REJECTED" ||
      normalizedApprovalStatus === "FINANCE_REJECTED"
    ) {
      visibleActionStatus = "FINANCE_REJECTED";
    }

    else if (
      normalizedStatus === "DELIVERED"
    ) {
      visibleActionStatus = "DELIVERED";
    }

    else if (
      normalizedStatus === "PARTIALLY_DELIVERED"
    ) {
      visibleActionStatus = "PARTIALLY_DELIVERED";
    }

    else if (
      normalizedStatus === "ORDERED"
    ) {
      visibleActionStatus = "ORDERED";
    }

    else if (
      normalizedStatus === "FINANCE_APPROVED"
    ) {
      visibleActionStatus = "FINANCE_APPROVED";
    }

    else if (
      normalizedStatus === "APPROVED"
    ) {
      visibleActionStatus = "APPROVED";
    }

    else if (
      normalizedStatus === "PENDING_FINANCE" ||
      normalizedApprovalStatus === "PENDING_FINANCE" ||
      normalizedStatus === "PENDING" ||
      normalizedApprovalStatus === "NOT_REQUESTED"
    ) {
      visibleActionStatus = "PENDING_FINANCE";
    }

    // ------------------------------------------
    // Get presentation
    // ------------------------------------------

    const presentation =
      PO_ACTION_PRESENTATION[
        visibleActionStatus
      ] ||
      DEFAULT_PO_ACTION_PRESENTATION;

    // ------------------------------------------
    // MARK AS ORDERED
    // Clickable
    // ------------------------------------------

    if (
      canManagePO &&
      !isDirectPO &&
      visibleActionStatus ===
      "FINANCE_APPROVED"
    ) {
      return (
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();

            await updatePOStatus(
              r.id,
              "ORDERED"
            );
          }}
          className={[
            "inline-flex w-full max-w-[156px] items-center justify-center",
            "rounded-lg border px-3 py-1.5",
            "whitespace-normal text-center text-[11px] font-semibold leading-4 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2",
            presentation.actionClass,
          ].join(" ")}
        >
          {presentation.label}
        </button>
      );
    }

    // ------------------------------------------
    // MARK DELIVERY
    // Clickable
    // ------------------------------------------

    if (
      canManagePO &&
      visibleActionStatus === "ORDERED"
    ) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openDeliveryChoice(r);
          }}
          className={[
            "inline-flex w-full max-w-[156px] items-center justify-center",
            "rounded-lg border px-3 py-1.5",
            "whitespace-normal text-center text-[11px] font-semibold leading-4 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2",
            presentation.actionClass,
          ].join(" ")}
        >
          {presentation.label}
        </button>
      );
    }

    // ------------------------------------------
    // RECORD NEXT DELIVERY
    // Clickable
    // ------------------------------------------

    if (
      canManagePO &&
      visibleActionStatus ===
      "PARTIALLY_DELIVERED"
    ) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openDeliveryChoice(r);
          }}
          className={[
            "inline-flex w-full max-w-[156px] items-center justify-center",
            "rounded-lg border px-3 py-1.5",
            "whitespace-normal text-center text-[11px] font-semibold leading-4 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2",
            presentation.actionClass,
          ].join(" ")}
        >
          {presentation.label}
        </button>
      );
    }

    // ------------------------------------------
    // NON-CLICKABLE ACTION STATES
    //
    // Pending Finance
    // Approved
    // Delivered
    // Finance Rejected
    //
    // Same style as MR page
    // ------------------------------------------

    return (
      <span
        className={[
          "inline-flex w-full max-w-[156px] items-center justify-center",
          "rounded-lg border px-3 py-1.5",
          "whitespace-normal text-center text-[11px] font-semibold leading-4 shadow-sm",
          presentation.actionClass,
        ].join(" ")}
      >
        {presentation.label}
      </span>
    );
  },
},
          ],
          selectable: canManagePO && selectionMode,
          selectedRowKeys: selectedRowKeys,
          onSelectedRowKeysChange: setSelectedRowKeys,
          rows: purchaseOrders,
          page: purchaseOrdersPage,
          pageSize: PURCHASE_ORDERS_PAGE_SIZE,
          onFilteredRowCountChange: setPurchaseOrdersDisplayedCount,
          loading: loading,
          hideEmptyState: Boolean(loadError),
        }),

        _jsx(PaginationControls, {
          page: purchaseOrdersPage,
          totalCount: purchaseOrdersDisplayedCount,
          pageSize: PURCHASE_ORDERS_PAGE_SIZE,
          hasPreviousPage: purchaseOrdersPage > 1,
          hasNextPage: purchaseOrdersPage < purchaseOrdersPageCount,
          loading: loading,
          onPrevious: () => setPurchaseOrdersPage((currentPage) => Math.max(1, currentPage - 1)),
          onNext: () => setPurchaseOrdersPage((currentPage) => Math.min(purchaseOrdersPageCount, currentPage + 1)),
        }),

        !loading &&
          loadError &&
          _jsx("div", {
            className:
              "flex min-h-[140px] w-full items-center justify-center border-t border-rose-200 bg-rose-50 px-6 py-8 text-center text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300",
            children: loadError,
          }),
      ],
    }),
      }),
      canManagePO &&
      showBulkGenerateModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-6xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-white">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Generate PO by Vendor</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Select a vendor, then choose the exact components to include in the generated PO PDF.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBulkGenerateModal(false);
                  setBulkGenerateVendor("");
                  setBulkGenerateSelected({});
                }}
                className="rounded-lg border px-3 py-2 text-sm font-medium"
              >
                Close
              </button>
            </div>

            {!bulkGenerateVendor ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {bulkGenerateCandidateVendorOptions.map((vendor) => (
                  <button
                    key={vendor}
                    type="button"
                    onClick={() => setBulkGenerateVendor(vendor)}
                    className="rounded-xl border border-border bg-slate-50 p-4 text-left transition hover:border-primary hover:bg-primary/5 dark:bg-slate-900"
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Vendor
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                      {vendor}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-slate-50 p-3 dark:bg-slate-900">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Selected Vendor
                    </div>
                    <div className="text-lg font-semibold text-slate-900 dark:text-white">
                      {bulkGenerateVendor}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setBulkGenerateVendor("")}
                    className="rounded-lg border px-3 py-2 text-sm font-medium"
                  >
                    Change Vendor
                  </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-border">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <tr>
                        <th className="px-3 py-3 text-left">PO</th>
                        <th className="px-3 py-3 text-left">Component</th>
                        <th className="px-3 py-3 text-center">Qty</th>
                        <th className="px-3 py-3 text-center">Expected Delivery</th>
                        <th className="px-3 py-3 text-right">Unit Price</th>
                        <th className="px-3 py-3 text-center">GST %</th>
                        <th className="px-3 py-3 text-right">Total</th>
                        <th className="px-3 py-3 text-center">Select</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkGenerateVendorRows.flatMap((poRow) =>
                        (Array.isArray(poRow.items) ? poRow.items : []).map((item, index) => {
                          const itemId = String(item?.id ?? item?.poItemId ?? item?.po_item_id ?? `${poRow.id}-${index}`);
                          const selected = (bulkGenerateSelected[String(poRow.id)] || []).includes(itemId);
                          const expectedDelivery =
                            item?.expectedDelivery ||
                            item?.expected_delivery_date ||
                            item?.expectedDeliveryDate ||
                            item?.expectedDate ||
                            item?.expected_delivery ||
                            poRow?.expectedDelivery ||
                            poRow?.expected_delivery_date ||
                            "-";
                          const unitPrice = Number(item?.unitPrice ?? item?.unit_price ?? item?.price ?? 0);
                          const gstPercentage = Number(item?.gstPercentage ?? item?.gst_percentage ?? item?.gst ?? 0);
                          const quantity = Number(item?.quantity ?? item?.orderedQuantity ?? 0);
                          const total = quantity * unitPrice + (quantity * unitPrice * gstPercentage) / 100;

                          return (
                            <tr key={`${poRow.id}-${itemId}`} className="border-t border-border dark:border-slate-800">
                              <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-100">
                                {poRow.po || poRow.id}
                              </td>
                              <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                                {item.componentName || item.component_name || item.name || "Component"}
                              </td>
                              <td className="px-3 py-3 text-center text-slate-700 dark:text-slate-200">
                                {quantity}
                              </td>
                              <td className="px-3 py-3 text-center text-slate-700 dark:text-slate-200">
                                {expectedDelivery}
                              </td>
                              <td className="px-3 py-3 text-right text-slate-700 dark:text-slate-200">
                                ₹{unitPrice.toLocaleString()}
                              </td>
                              <td className="px-3 py-3 text-center text-slate-700 dark:text-slate-200">
                                {gstPercentage}%
                              </td>
                              <td className="px-3 py-3 text-right text-slate-700 dark:text-slate-200">
                                ₹{total.toLocaleString()}
                              </td>
                              <td className="px-3 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleBulkGenerateItem(poRow.id, itemId)}
                                  className="size-4 cursor-pointer accent-primary"
                                />
                              </td>
                            </tr>
                          );
                        }),
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    {getBulkGenerateSelectedCount()} component(s) selected
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowBulkGenerateModal(false);
                        setBulkGenerateVendor("");
                        setBulkGenerateSelected({});
                      }}
                      className="rounded-lg border px-4 py-2 text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBulkGeneratePdf()}
                      disabled={getBulkGenerateSelectedCount() === 0}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Generate PDF
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ),

      canManagePO &&
  deliveryChoiceOpen &&
  selectedDeliveryPO && (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-white">
        <h2 className="text-xl font-semibold">
          Record PO Delivery
        </h2>

        <p className="mt-2 text-sm text-slate-500">
          PO Number:{" "}
          <strong>
            {selectedDeliveryPO.po}
          </strong>
        </p>

        <p className="mt-1 text-sm text-slate-500">
          Vendor:{" "}
          <strong>
            {selectedDeliveryPO.vendor}
          </strong>
        </p>

        {selectedDeliveryPO.sourceMrNumber && (
          <p className="mt-1 text-sm font-semibold text-blue-600">
            MR Number:{" "}
            {
              selectedDeliveryPO
                .sourceMrNumber
            }
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            className="rounded-lg bg-orange-500 px-4 py-3 font-medium text-white hover:bg-orange-600"
            onClick={() =>
              openDeliveryForm(
                "PARTIALLY_DELIVERED"
              )
            }
          >
            Partial Delivered
          </button>

          <button
            type="button"
            className="rounded-lg bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700"
            onClick={() =>
              openDeliveryForm(
                "DELIVERED"
              )
            }
          >
            Delivered
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="rounded-lg border px-4 py-2"
            onClick={() =>
              closeDeliveryPopups()
            }
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  ),

  canManagePO &&
  deliveryFormOpen &&
  selectedDeliveryPO && (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-8">
      <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-white">
        <h2 className="text-xl font-semibold">
          {deliveryMode ===
          "PARTIALLY_DELIVERED"
            ? "Partial Delivery Inward Entry"
            : "Complete Delivery Inward Entry"}
        </h2>

        <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300">
          <span>
            PO:{" "}
            <strong>
              {selectedDeliveryPO.po}
            </strong>
          </span>

          <span>
            Vendor:{" "}
            <strong>
              {selectedDeliveryPO.vendor}
            </strong>
          </span>

          {selectedDeliveryPO
            .sourceMrNumber && (
            <span>
              MR:{" "}
              <strong>
                {
                  selectedDeliveryPO
                    .sourceMrNumber
                }
              </strong>
            </span>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <label>
            <span className="mb-1 block text-sm font-medium">
              Invoice Number
            </span>

            <input
              type="text"
              className="w-full rounded-lg border p-2 dark:bg-slate-900"
              placeholder="INV-001"
              value={
                deliveryForm.invoiceNumber
              }
              onChange={(e) =>
                setDeliveryForm(
                  (previous) => ({
                    ...previous,
                    invoiceNumber:
                      e.target.value,
                  })
                )
              }
            />
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium">
              Invoice Date
            </span>

            <input
              type="date"
              className="w-full rounded-lg border p-2 dark:bg-slate-900"
              value={
                deliveryForm.invoiceDate
              }
              onChange={(e) =>
                setDeliveryForm(
                  (previous) => ({
                    ...previous,
                    invoiceDate:
                      e.target.value,
                  })
                )
              }
            />
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium">
              Batch Number
            </span>

            <input
              type="text"
              className="w-full rounded-lg border p-2 dark:bg-slate-900"
              placeholder="BATCH-001"
              value={
                deliveryForm.batchNumber
              }
              onChange={(e) =>
                setDeliveryForm(
                  (previous) => ({
                    ...previous,
                    batchNumber:
                      e.target.value,
                  })
                )
              }
            />
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium">
              Received Date
            </span>

            <input
              type="date"
              className="w-full rounded-lg border p-2 dark:bg-slate-900"
              value={
                deliveryForm.receivedDate
              }
              onChange={(e) =>
                setDeliveryForm(
                  (previous) => ({
                    ...previous,
                    receivedDate:
                      e.target.value,
                  })
                )
              }
            />
          </label>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900">
                <th className="border p-3 text-left">
                  Component
                </th>

                <th className="border p-3 text-center">
                  Ordered
                </th>

                <th className="border p-3 text-center">
                  Previously Received
                </th>

                <th className="border p-3 text-center">
                  Balance
                </th>

                <th className="border p-3 text-center">
                  Receiving Now
                </th>
              </tr>
            </thead>

            <tbody>
              {deliveryForm.items.map(
                (item, index) => (
                  <tr
                    key={
                      item.poItemId ||
                      index
                    }
                  >
                    <td className="border p-3">
                      {item.componentName}
                    </td>

                    <td className="border p-3 text-center">
                      {
                        item.orderedQuantity
                      }
                    </td>

                    <td className="border p-3 text-center">
                      {
                        item.receivedQuantity
                      }
                    </td>

                    <td className="border p-3 text-center font-semibold">
                      {
                        item.remainingQuantity
                      }
                    </td>

                    <td className="border p-3 text-center">
                     <input
  type="number"
  min="0"
  max={item.remainingQuantity}
  step="1"
  className="w-32 rounded-lg border p-2 text-center dark:bg-slate-900"
  value={item.quantityReceived}
  onChange={(e) =>
    updateDeliveryQuantity(
      index,
      e.target.value
    )
  }
/>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={deliverySaving}
            className="rounded-lg border px-4 py-2 disabled:opacity-50"
            onClick={() =>
              closeDeliveryPopups()
            }
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={deliverySaving}
            className="rounded-lg bg-green-600 px-5 py-2 text-white hover:bg-green-700 disabled:opacity-50"
            onClick={
              submitDeliveryReceipt
            }
          >
            {deliverySaving
              ? "Recording..."
              : "Create Inward Entry"}
          </button>
        </div>
      </div>
    </div>
  ),
      poComponentsPopup && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-slate-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Components
                </h2>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  PO {poComponentsPopup.poNumber}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setPoComponentsPopup(null)
                }
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <div className="mt-5 max-h-[55vh] overflow-y-auto rounded-xl border border-border">
              {Array.isArray(
                poComponentsPopup.items
              ) &&
              poComponentsPopup.items.length >
                0 ? (
                <div className="divide-y divide-border">
                  {poComponentsPopup.items.map(
                    (item, index) => (
                      <div
                        key={
                          item.poItemId ||
                          item.id ||
                          index
                        }
                        className="flex items-center justify-between gap-4 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="break-words text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.componentName ||
                              "Component"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Type: {item.componentType || "-"}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            HSN: {item.hsnNo || "-"}
                          </div>
                        </div>

                        <div className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          Qty {Number(
                            item.quantity || 0
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  No components available.
                </div>
              )}
            </div>
          </div>
        </div>
      ),

      showRejectPopup && _jsx("div", {
        className: "fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4",
        children: _jsxs("div", {
          className: "w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-slate-100",
          children: [
            _jsx("h2", { className: "text-lg font-semibold", children: "Rejection Details" }),
            _jsx("p", { className: "mt-2 text-sm text-slate-600 dark:text-slate-400", children: rejectPopup.rejectedBy ? `Rejected by ${rejectPopup.rejectedBy}` : "Rejected status details." }),
            _jsxs("div", {
              className: "mt-4 rounded-2xl border border-border bg-slate-50 p-4 text-sm text-slate-900 dark:bg-slate-900 dark:text-slate-100",
              children: [
                _jsx("div", { className: "font-medium", children: rejectPopup.title }),
                _jsx("div", { className: "mt-2 whitespace-pre-wrap", children: rejectPopup.reason || "No rejection reason provided." }),
              ],
            }),
            _jsx("div", {
              className: "mt-4 flex justify-end",
              children: _jsx("button", {
                type: "button",
                onClick: () => setShowRejectPopup(false),
                className: "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700",
                children: "Close",
              }),
            }),
          ],
        }),
      }),

    ],
  });
  
}

export default Page;