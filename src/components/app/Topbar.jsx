import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import config from "@/config";
import {
  fetchAuthenticatedJson,
} from "@/api";
import {
  Bell,
  Menu,
  Search,
  ChevronDown,
  LogOut,
  Sun,
  Moon,
  Trash2,
  Edit3,
  X,
} from "lucide-react";

const normalizeRole = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const formatRoleLabel = (value) => {
  const normalized = normalizeRole(value);

  const labels = {
    admin: "Admin",
    manager: "Manager",
    management: "Management",
    procurement: "Procurement",
    inventory: "Inventory",
    finance: "Finance",
    engineer: "Engineer",
  };

  return labels[normalized] || value || "User";
};

const getRoleHome = (value) => {
  switch (normalizeRole(value)) {
    case "admin":
    case "manager":
      return "/dashboard";
    case "procurement":
      return "/procurement";
    case "inventory":
      return "/inventory";
    case "finance":
      return "/finance";
    case "management":
      return "/management-notifications";
    case "engineer":
      return "/engineer";
    default:
      return "/dashboard";
  }
};

export function Topbar() {
  const navigate = useNavigate();
  const {
    user,
    logout,
    setUser,
    updateUser,
    activeRole,
    roles = [],
    login,
  } = useAuth();

  const [userState, setUserState] = useState(user);
  const [notifications, setNotifications] = useState([]);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const [roleSwitching, setRoleSwitching] = useState("");
  const [roleSwitchError, setRoleSwitchError] = useState("");

  /*
   * Prevent overlapping Topbar API polling.
   * The previous 5-second interval could start another full MR request
   * while the previous large request was still running.
   */
  const notificationLoadRef = useRef(false);

  /*
   * MULTI-ROLE SUPPORT
   *
   * Use activeRole for the module currently being operated.
   * user.role is only the employee's primary role and remains
   * as a fallback for older sessions.
   */
  const role = normalizeRole(
    activeRole ||
      userState?.active_role ||
      userState?.role ||
      "guest",
  );


  const profileRoles = useMemo(() => {
    const values = [];

    const appendRole = (value) => {
      const normalized = normalizeRole(value);

      if (
        normalized &&
        normalized !== "guest" &&
        !values.includes(normalized)
      ) {
        values.push(normalized);
      }
    };

    (Array.isArray(roles) ? roles : []).forEach(appendRole);
    (Array.isArray(userState?.roles) ? userState.roles : []).forEach(appendRole);

    appendRole(userState?.role);

    (
      Array.isArray(userState?.additional_roles)
        ? userState.additional_roles
        : []
    ).forEach(appendRole);

    appendRole(role);

    return values;
  }, [
    roles,
    userState?.roles,
    userState?.role,
    userState?.additional_roles,
    role,
  ]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    let active = true;

    fetchAuthenticatedJson("/auth/profile/")
      .then((profile) => {
        if (active && profile?.id) {
          updateUser(profile);
        }
      })
      .catch(() => {
        // Keep the cached session when the profile refresh is unavailable.
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  const allowedNotificationRoles = [
    "admin",
    "manager",
    "procurement",
    "inventory",
    "finance",
    "management",
  ];

  const canViewNotifications = useMemo(
    () => allowedNotificationRoles.includes(role),
    [role],
  );

  const isManager = role === "manager";
  const isAdmin = role === "admin";
  const isProcurement = role === "procurement";
  const isInventoryUser = role === "inventory";
  const isFinance = role === "finance";
  const isManagement = role === "management";

const isUnreadNotification = (notification) => {
  const value = notification?.is_read;
  const normalized = String(value ?? "").trim().toLowerCase();

  // Treat missing is_read as unread for compatibility with old records.
  return (
    value === undefined ||
    value === null ||
    value === false ||
    value === 0 ||
    normalized === "" ||
    normalized === "false" ||
    normalized === "0"
  );
};

const isPoRaisedValue = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();

  return (
    value === true ||
    value === 1 ||
    normalized === "true" ||
    normalized === "1"
  );
};

/*
 * FINANCE ACTIONABLE NOTIFICATIONS
 * --------------------------------
 * Bell count represents Finance work still requiring action.
 *
 * Do not depend only on is_read. A Finance user may open/read the
 * notification while it is still awaiting Approve/Reject. It must remain
 * in the bell count until its workflow status is no longer pending.
 */
const isFinanceActionPendingNotification = (notification = {}) => {
  const category = String(
    notification?.category || "",
  )
    .trim()
    .toUpperCase();

  const receiver = String(
    notification?.receiver || "",
  )
    .trim()
    .toUpperCase();

  const status = String(
    notification?.status ||
      notification?.approval_status ||
      "",
  )
    .trim()
    .toUpperCase();

  if (receiver !== "FINANCE") {
    return false;
  }

  if (category === "PO") {
    return [
      "PENDING_FINANCE",
      "REPLACEMENT_PENDING_FINANCE",
    ].includes(status);
  }

  if (category === "SCRAP") {
    return status === "PENDING_FINANCE";
  }

  if (category === "QC_FAILED") {
    return status === "PENDING_FINANCE";
  }

  return false;
};
// Consolidated procurement notifications (PO + MR) for the topbar dropdown
// We dedupe by resource (category + reference_id) so a single PO only counts once
const procurementNotifications = (notifications || []).filter((n) => {
  const cat = String(n.category || "").toUpperCase();

if (
  ![
    "MR",
    "PO",
    "BOM",
    "SCRAP",
    "SALES",
    "QC_FAILED",
  ].includes(cat)
) {
  return false;
}

  /*
   * Normal roles use unread notifications.
   * Finance pending approvals are ACTION items, so they remain counted until
   * Finance actually approves/rejects them even if the row was already read.
   */
  if (
    !isUnreadNotification(n) &&
    !isFinanceActionPendingNotification(n)
  ) {
    return false;
  }

  const status = String(
    n.status || n.approval_status || ""
  ).toUpperCase();
  // Match the same client-side approval-request signature used in NotificationsPage
  const title = String(n.title || "").toUpperCase();
  const message = String(n.message || "").toUpperCase();
const isClientApprovalRequest =
  title.startsWith("PO APPROVAL REQUEST") ||
  title.startsWith("MR APPROVAL REQUEST") ||
  title.startsWith("BOM APPROVAL REQUEST") ||
  title.startsWith("MODIFIED BOM APPROVAL") ||
  message.includes(
    "APPROVAL REQUESTED FOR PO"
  ) ||
  message.includes(
    "APPROVAL REQUESTED FOR MATERIAL REQUEST"
  ) ||
  message.includes(
    "REQUIRES MANAGER APPROVAL"
  ) ||
  message.includes(
    "REQUIRES APPROVAL AGAIN"
  );
  const isProcurementRequest =
    cat === "MR" &&
    (
      status === "PROCUREMENT_PENDING" ||
      (
        ["PENDING", "REQUESTED"].includes(
          status,
        ) &&
        (
          title.startsWith(
            "PROCUREMENT REQUIRED",
          ) ||
          message.includes(
            "PROCUREMENT REQUIRED",
          ) ||
          message.includes(
            "LESS THAN REQUIRED QUANTITY",
          )
        )
      )
    );

  const receiver = String(n.receiver || "").toUpperCase();
const isInventoryMrNotification =
  isInventoryUser &&
  cat === "MR" &&
  receiver === "INVENTORY" &&
  [
    "MANAGER_APPROVED",
    "INVENTORY_PENDING",
    "INVENTORY_CHECK_PENDING",
    "QC_CHECKED",
    "PROJECT_INVENTORY_READY",
    "INVENTORY_ISSUED",
    "MR_COMPLETED",
  ].includes(status);

  if (isAdmin) {
    return (
      receiver === "ADMIN" &&
      ["PENDING_ADMIN", "REQUESTED"].includes(status) &&
      (isClientApprovalRequest || isProcurementRequest)
    );
  }

if (isManager) {
  if (receiver !== "MANAGER") {
    return false;
  }

  /*
   * MANAGER BELL COUNT
   *
   * Count only items that still require Manager action.
   * Approved / Rejected items are intentionally excluded.
   */

  // Material Request approvals
  if (cat === "MR") {
    return [
      "REQUESTED",
      "PENDING",
      "PENDING_MANAGER",
    ].includes(status);
  }

  // BOM approvals / modified BOM re-approval
  if (cat === "BOM") {
    return [
      "REQUESTED",
      "PENDING",
      "PENDING_MANAGER",
      "MODIFIED",
    ].includes(status);
  }

  // Scrap approval
  if (cat === "SCRAP") {
    return [
      "REQUESTED",
      "PENDING_MANAGER",
    ].includes(status);
  }

  // Preserve any existing Manager PO approval flow.
  if (cat === "PO") {
    return [
      "REQUESTED",
      "PENDING",
      "PENDING_MANAGER",
    ].includes(status);
  }

  return false;
}

  if (isInventoryUser) {
    return isInventoryMrNotification;
  }

if (isFinance) {
  /*
   * FINANCE BELL COUNT
   * ------------------
   * Standard PO:
   *   PENDING_FINANCE
   *
   * QC Failed Replacement / Returnable Restore PO:
   *   REPLACEMENT_PENDING_FINANCE
   *
   * Finance Notifications already shows both kinds of PO. The Topbar must
   * use the same actionable-status rule; otherwise Replacement R1/R2 POs
   * appear inside Finance Notifications but contribute 0 to the bell count.
   */
  const isFinancePendingPO =
    cat === "PO" &&
    receiver === "FINANCE" &&
    [
      "PENDING_FINANCE",
      "REPLACEMENT_PENDING_FINANCE",
    ].includes(status);

  const isFinancePendingQcFailed =
    cat === "QC_FAILED" &&
    receiver === "FINANCE" &&
    status === "PENDING_FINANCE";

  /*
   * Manager-approved Engineer Scrap / Partial Reorder awaiting Finance.
   *
   * This is the missing case that caused:
   *   Finance Notifications -> Scrap row visible
   *   Topbar bell           -> count 0
   */
  const isFinancePendingScrap =
    cat === "SCRAP" &&
    receiver === "FINANCE" &&
    status === "PENDING_FINANCE";

  return (
    isFinancePendingPO ||
    isFinancePendingQcFailed ||
    isFinancePendingScrap
  );
}

if (isManagement) {
  return (
    cat === "SALES" &&
    receiver === "MANAGEMENT" &&
    status === "PENDING_MANAGEMENT"
  );
}

if (isProcurement) {
  return (
    (
      cat === "MR" &&
      receiver === "PROCUREMENT" &&
      isProcurementRequest
    ) ||
    (
      cat === "QC_FAILED" &&
      receiver === "PROCUREMENT" &&
      status === "PENDING_PROCUREMENT"
    )
  );
}

return false;
});
const normalizeNotificationRef = (value) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  const mrMatch = str.match(/^(?:MR[-_ ]?)?(\d+)$/i);
  if (mrMatch) return mrMatch[1];
  const poMatch = str.match(/^(?:PO[-_ ]?)?(\d+)$/i);
  if (poMatch) return poMatch[1];
  const digits = str.match(/(\d+)/);
  return digits ? digits[1] : str;
};

// Helper: extract a stable resource reference (category-specific id) from notification fields
const extractResourceRef = (n) => {
  const referenceId =
    n.reference_id ||
    n.referenceId ||
    n.material_request_id ||
    n.request_id ||
    n.poId ||
    null;
  const normalized = normalizeNotificationRef(referenceId);
  if (normalized) return normalized;

  const text = `${String(n.title || "").trim()} ${String(n.message || "").trim()}`.toUpperCase();

  const poMatch = text.match(/PO[-_ ]?(\d+)/i);
  if (poMatch) return poMatch[1];

  const mrMatch = text.match(/MR[-_ ]?(\d+)/i);
  if (mrMatch) return mrMatch[1];

  return null;
};

const groupedProcurement = useMemo(() => {
  const byCategory = new Map();
  procurementNotifications.forEach((n) => {
    const cat = (n.category || "MR").toUpperCase();
    const refId = extractResourceRef(n);
const title =
  cat === "PO"
    ? "Purchase Orders"
    : cat === "BOM"
    ? "BOM Approvals"
    : cat === "SCRAP"
    ? "Scrap Approvals"
    : cat === "QC_FAILED"
    ? "QC Failed Refund Approvals"
    : "Material Requests";

    if (!byCategory.has(cat)) {
      byCategory.set(cat, { id: cat, title, category: cat, refs: new Set(), status: n.status });
    }

    const bucket = byCategory.get(cat);

    const countKey =
      refId ||
      n.reference_id ||
      n.referenceId ||
      n.id;

    if (
      countKey !== undefined &&
      countKey !== null &&
      countKey !== ""
    ) {
      bucket.refs.add(String(countKey));
    }

    bucket.status = n.status || bucket.status;
  });

  const grouped = Array.from(byCategory.values()).map((b) => ({ id: b.id, title: b.title, category: b.category, count: b.refs.size, status: b.status }));

  return grouped;
}, [procurementNotifications]);

// total unique resources across categories
const totalNotifications = groupedProcurement.reduce(
  (sum, item) => sum + (item.count || 0),
  0
);

const [showProfileDropdown, setShowProfileDropdown] = useState(false);

const unreadCount = totalNotifications;
  
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [profileImage, setProfileImage] = useState(
    user?.profile_image ||
      user?.profileImage ||
      "",
  );
  const [profileFile, setProfileFile] = useState(null);
  const [removeProfileImage, setRemoveProfileImage] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");

const [isDarkMode, setIsDarkMode] = useState(() => {
  if (typeof window === "undefined") return true;
  const storedTheme = window.localStorage.getItem("theme");
  if (storedTheme === "light") return false;
  if (storedTheme === "dark") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
});


  const [editName, setEditName] = useState("");


// Loader for notifications — extracted so other event handlers can call it
const loadNotifications = async () => {
  if (notificationLoadRef.current) {
    return;
  }

  notificationLoadRef.current = true;

  try {
    /*
     * Load ONLY the active role's notifications.
     *
     * The old Topbar called /notifications/ without a receiver filter.
     * That endpoint is paginated, so a Finance QC_FAILED row could exist on
     * the Finance page but be absent from the first Topbar page.
     */
    const notificationReceiver =
      isManager
        ? "MANAGER"
        : isProcurement
          ? "PROCUREMENT"
          : isInventoryUser
            ? "INVENTORY"
            : isFinance
              ? "FINANCE"
              : isManagement
                ? "MANAGEMENT"
                : isAdmin
                  ? "ADMIN"
                  : "";

    const notificationUrl = notificationReceiver
      ? `${config.baseURL}/notifications/?receiver=${encodeURIComponent(
          notificationReceiver,
        )}&page_size=200`
      : `${config.baseURL}/notifications/?page_size=200`;

    /*
     * Finance does not need the large Material Request fallback request.
     * Skipping it also removes the unrelated MR 401 seen in the Finance console.
     */
    const shouldLoadMaterialRequests =
      isManager ||
      isAdmin ||
      isProcurement ||
      isInventoryUser;

    const [
      notificationResult,
      materialRequestResult,
      purchaseOrderResult,
    ] = await Promise.allSettled([
      fetchAuthenticatedJson(
        notificationUrl,
        {
          cache: "no-store",
        },
      ),
      shouldLoadMaterialRequests
        ? fetchAuthenticatedJson(
            `${config.baseURL}/materialrequest/material-requests/?page_size=100`,
            {
              cache: "no-store",
            },
          )
        : Promise.resolve([]),
      isManager
        ? fetchAuthenticatedJson(
            `${config.baseURL}/procurement/purchase-orders/?page_size=200`,
            { cache: "no-store" },
          )
        : Promise.resolve([]),
    ]);

    const notificationData =
      notificationResult.status === "fulfilled"
        ? notificationResult.value
        : [];

    const materialRequestData =
      materialRequestResult.status === "fulfilled"
        ? materialRequestResult.value
        : [];

    const purchaseOrderData =
      purchaseOrderResult.status === "fulfilled"
        ? purchaseOrderResult.value
        : [];

    if (notificationResult.status === "rejected") {
      console.warn(
        "Topbar notifications request failed:",
        notificationResult.reason,
      );
    }

    if (materialRequestResult.status === "rejected") {
      console.warn(
        "Topbar Material Request fallback request failed:",
        materialRequestResult.reason,
      );
    }

    const notificationList =
      Array.isArray(notificationData)
        ? notificationData
        : notificationData?.results || [];

    const materialRequestList =
      Array.isArray(materialRequestData)
        ? materialRequestData
        : materialRequestData?.results || [];

    const purchaseOrderList =
      Array.isArray(purchaseOrderData)
        ? purchaseOrderData
        : purchaseOrderData?.results || [];

    const notificationPOIds = new Set(
      notificationList
        .filter(
          (notification) =>
            isManager &&
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

    const managerPOFallbacks = isManager
      ? purchaseOrderList
          .filter((po) => {
            const poId = String(po?.id || po?.purchase_order_id || "");
            const approvalStatus = String(
              po?.status || po?.approval_status || "",
            ).toUpperCase();
            const orderType = String(
              po?.order_type || "STANDARD",
            ).toUpperCase();

            return (
              poId &&
              !notificationPOIds.has(poId) &&
              orderType !== "REPLACEMENT" &&
              !String(po?.source_mr_number || "").trim() &&
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
            is_read: false,
            title: `PO APPROVAL REQUEST - ${po.po_number || po.po || po.id}`,
            message: `Approval requested for Purchase Order ${po.po_number || po.po || po.id}`,
          }))
      : [];

    /*
     * Track MRs that have already completed procurement.
     * These must not remain in the bell.
     */
    const poRaisedMrReferences =
      new Set();

    materialRequestList
      .filter((request) =>
        isPoRaisedValue(
          request.po_raised,
        ),
      )
      .forEach((request) => {
        [
          request.id,
          request.material_request_id,
          request.request_id,
        ].forEach((reference) => {
          const normalized =
            normalizeNotificationRef(
              reference,
            );

          if (normalized) {
            poRaisedMrReferences.add(
              String(normalized),
            );
          }
        });
      });

    /*
     * The backend may update the MR workflow to
     * PROCUREMENT_PENDING without creating a separate
     * notification row. Build a temporary notification
     * from the authoritative MR record so Procurement
     * still sees the bell item.
     */
    const procurementMrFallbacks =
      materialRequestList
        .filter((request) => {
          const workflowStatus = String(
            request.status ||
              request.workflow_status ||
              "",
          )
            .trim()
            .toUpperCase();

          return (
            workflowStatus ===
              "PROCUREMENT_PENDING" &&
            !isPoRaisedValue(
              request.po_raised,
            )
          );
        })
        .map((request) => {
          const reference =
            request.id ??
            request.material_request_id ??
            request.request_id;

          const requestLabel = String(
            request.material_request_id ||
              request.request_id ||
              reference ||
              "Material Request",
          );

          return {
            id:
              `procurement-mr-${String(
                reference ||
                  requestLabel,
              )}`,
            category: "MR",
            receiver: "PROCUREMENT",
            status:
              "PROCUREMENT_PENDING",
            approval_status:
              request.approval_status ||
              "MANAGER_APPROVED",
            is_read: false,
            reference_id: reference,
            material_request_id:
              request.material_request_id ||
              request.request_id ||
              reference,
            title:
              `PROCUREMENT REQUIRED - ${requestLabel}`,
            message:
              `Material Request ${requestLabel} has a quantity shortage and is ready for procurement.`,
            source:
              "material-request-fallback",
          };
        });

    const inventoryMrFallbacks =
      materialRequestList
        .filter((request) => {
          const workflowStatus = String(
            request.status ||
              request.workflow_status ||
              "",
          )
            .trim()
            .toUpperCase();

          return [
            "MANAGER_APPROVED",
            "INVENTORY_PENDING",
            "QC_CHECKED",
            "PROJECT_INVENTORY_READY",
          ].includes(workflowStatus);
        })
        .map((request) => {
          const reference =
            request.id ??
            request.material_request_id ??
            request.request_id;

          const requestLabel = String(
            request.material_request_id ||
              request.request_id ||
              reference ||
              "Material Request",
          );

          const workflowStatus = String(
            request.status || "",
          )
            .trim()
            .toUpperCase();

          return {
            id:
              `inventory-mr-${String(
                reference ||
                  requestLabel,
              )}`,
            category: "MR",
            receiver: "INVENTORY",
            status: workflowStatus,
            is_read: false,
            reference_id: reference,
            material_request_id:
              request.material_request_id ||
              request.request_id ||
              reference,
            title:
              workflowStatus ===
              "QC_CHECKED"
                ? `QC PASSED COMPONENTS - ${requestLabel}`
                : `INVENTORY ACTION REQUIRED - ${requestLabel}`,
            message:
              workflowStatus ===
              "QC_CHECKED"
                ? `QC is completed for ${requestLabel}. Provide QC-passed components to Project Inventory.`
                : `Material Request ${requestLabel} is ready for Inventory processing.`,
            source:
              "material-request-fallback",
          };
        });

    /*
     * Manager MR fallback:
     * New/legacy MRs can already be PENDING_MANAGER even when a Notification
     * row is missing. Keep the Manager bell count authoritative by deriving a
     * temporary MR notification from MaterialRequest.
     */
    const managerMrNotificationRefs =
      new Set(
        notificationList
          .filter(
            (notification) =>
              String(
                notification?.category ||
                  "",
              )
                .trim()
                .toUpperCase() === "MR" &&
              String(
                notification?.receiver ||
                  "",
              )
                .trim()
                .toUpperCase() === "MANAGER",
          )
          .map((notification) =>
            String(
              notification?.reference_id ??
                notification?.referenceId ??
                "",
            ).trim(),
          )
          .filter(Boolean),
      );

    const managerMrFallbacks =
      isManager
        ? materialRequestList
            .filter((request) => {
              const workflowStatus =
                String(
                  request?.status ||
                    request?.workflow_status ||
                    request?.approval_status ||
                    "",
                )
                  .trim()
                  .toUpperCase();

              const requestDbId =
                request?.id ??
                request?.pk ??
                null;

              return (
                workflowStatus ===
                  "PENDING_MANAGER" &&
                requestDbId !== null &&
                !managerMrNotificationRefs.has(
                  String(
                    requestDbId,
                  ).trim(),
                )
              );
            })
            .map((request) => {
              const reference =
                request?.id ??
                request?.pk;

              const requestLabel =
                String(
                  request?.material_request_id ||
                    request?.request_id ||
                    `MR-${reference}`,
                ).trim();

              return {
                id:
                  `manager-mr-${String(
                    reference,
                  )}`,
                category:
                  "MR",
                receiver:
                  "MANAGER",
                reference_id:
                  String(reference),
                material_request_id:
                  requestLabel,
                status:
                  "PENDING_MANAGER",
                approval_status:
                  "PENDING_MANAGER",
                is_read:
                  false,
                title:
                  `MR APPROVAL REQUEST - ${requestLabel}`,
                message:
                  `Material Request ${requestLabel} requires Manager approval.`,
                request_type:
                  request?.request_type ||
                  request?.requestType ||
                  "",
                returnable_purpose:
                  request?.returnable_purpose ||
                  request?.returnablePurpose ||
                  "",
                source:
                  "material-request-manager-fallback",
              };
            })
        : [];

    const mergedNotifications = [
      ...notificationList,
      ...managerPOFallbacks,
      ...managerMrFallbacks,
      ...procurementMrFallbacks,
      ...inventoryMrFallbacks,
    ];

    const seen = new Set();
    const deduped = [];

    for (
      const notification of
      mergedNotifications
    ) {
      if (
        !isUnreadNotification(
          notification,
        ) &&
        !isFinanceActionPendingNotification(
          notification,
        )
      ) {
        continue;
      }

      const category = String(
        notification.category || "",
      )
        .trim()
        .toUpperCase();

      const receiver = String(
        notification.receiver || "",
      )
        .trim()
        .toUpperCase();

      const status = String(
        notification.status ||
          notification.approval_status ||
          "",
      )
        .trim()
        .toUpperCase();

      const resourceReference =
        extractResourceRef(
          notification,
        );

      const text =
        `${notification.title || ""} ${
          notification.message || ""
        }`.toUpperCase();

      const isProcurementMrNotification =
        category === "MR" &&
        (
          receiver ===
            "PROCUREMENT" ||
          status ===
            "PROCUREMENT_PENDING" ||
          text.includes(
            "PROCUREMENT REQUIRED",
          ) ||
          text.includes(
            "LESS THAN REQUIRED QUANTITY",
          )
        );

      if (
        isProcurementMrNotification &&
        resourceReference &&
        poRaisedMrReferences.has(
          String(resourceReference),
        )
      ) {
        continue;
      }

      const rawReference =
        notification.reference_id ||
        notification.referenceId ||
        notification
          .material_request_id ||
        notification.request_id ||
        notification.poId ||
        notification.id ||
        "";

      const normalizedReference =
        resourceReference ||
        normalizeNotificationRef(
          rawReference,
        ) ||
        String(rawReference);

      /*
       * For Procurement MR entries, ignore status in
       * the dedupe key. A legacy REQUESTED notification
       * and a PROCUREMENT_PENDING MR refer to the same
       * work item and must count only once.
       */
      const key =
        category === "MR" &&
        [
          "PROCUREMENT",
          "INVENTORY",
        ].includes(receiver)
          ? `${category}|${normalizedReference}|${receiver}`
          : `${category}|${normalizedReference}|${receiver}|${status}`;

      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(notification);
      }
    }

    setNotifications(deduped);
  } catch (err) {
    console.error(
      "Failed to load Topbar notifications:",
      err,
    );

    setNotifications([]);
  } finally {
    notificationLoadRef.current = false;
  }
};

useEffect(() => {
  // Clear the previous role's bell items immediately, then
  // load notifications for the newly active role.
  setNotifications([]);
  void loadNotifications();

  /*
   * Custom browser events update immediately in the
   * same tab. Periodic reload also catches Manager
   * approvals made from another browser/session.
   */
  const reloadNotifications = () => {
    void loadNotifications();
  };

  const intervalId =
    window.setInterval(
      reloadNotifications,
      30000,
    );

  window.addEventListener(
    "procurementUpdated",
    reloadNotifications,
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
    "outwardUpdated",
    reloadNotifications,
  );

  window.addEventListener(
    "scrapUpdated",
    reloadNotifications,
  );

  return () => {
    window.clearInterval(intervalId);

    window.removeEventListener(
      "procurementUpdated",
      reloadNotifications,
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
      "outwardUpdated",
      reloadNotifications,
    );

    window.removeEventListener(
      "scrapUpdated",
      reloadNotifications,
    );
  };
}, [role]);

  // LOAD USER
  useEffect(() => {
    setUserState(user);
    setEditName(user?.employee_name || "");
    setProfileImage(
      user?.profile_image ||
        user?.profileImage ||
        "",
    );
    setProfileFile(null);
    setRemoveProfileImage(false);
  }, [user]);

  // THEME
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      window.localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      window.localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode((prev) => !prev);
  };

  const persistUpdatedUser = (updatedUser) => {
    const storageKeys = [
      "user",
      "authUser",
      "currentUser",
    ];

    for (const storage of [
      window.localStorage,
      window.sessionStorage,
    ]) {
      for (const key of storageKeys) {
        const existing = storage.getItem(key);
        if (!existing) continue;

        try {
          const parsed = JSON.parse(existing);
          storage.setItem(
            key,
            JSON.stringify({
              ...parsed,
              ...updatedUser,
            }),
          );
        } catch {
          // Ignore non-JSON legacy values.
        }
      }
    }

    window.dispatchEvent(
      new CustomEvent("auth:user-updated", {
        detail: updatedUser,
      }),
    );
  };

  // IMAGE UPLOAD
 const handleImageUpload = (event) => {
  const file = event.target.files?.[0];

  if (!file) return;

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  // Validate image type
  if (!allowedTypes.includes(file.type)) {
    setProfileError(
      "Only JPG, JPEG, PNG, and WEBP images are allowed."
    );

    event.target.value = "";
    setProfileFile(null);
    return;
  }

  // Maximum 5 MB
  if (file.size > 5 * 1024 * 1024) {
    setProfileError(
      "Profile image must be 5 MB or smaller."
    );

    event.target.value = "";
    setProfileFile(null);
    return;
  }

  setProfileError("");
  setProfileFile(file);
  setRemoveProfileImage(false);

  const reader = new FileReader();

  reader.onload = () => {
    setProfileImage(
      String(reader.result || "")
    );
  };

  reader.onerror = () => {
    setProfileError(
      "Unable to read this image. Please select another image."
    );

    setProfileFile(null);
    event.target.value = "";
  };

  reader.readAsDataURL(file);
};

  // REMOVE IMAGE
  const removeProfilePhoto = () => {
    setProfileImage("");
    setProfileFile(null);
    setRemoveProfileImage(true);
    setProfileError("");
  };

  // SAVE PROFILE TO DJANGO
  const saveProfile = async () => {
    if (!editName.trim()) {
      setProfileError(
        "Employee name is required.",
      );
      return;
    }

    try {
      setProfileSaving(true);
      setProfileError("");

      const formData = new FormData();

      formData.append(
        "employee_name",
        editName.trim(),
      );

      if (profileFile) {
        formData.append(
          "profile_image",
          profileFile,
        );
      }

      if (removeProfileImage) {
        formData.append(
          "remove_profile_image",
          "true",
        );
      }

      /*
       * Use the same shared authentication helper as
       * the Roles page. It reads the token from auth_state,
       * handles FormData correctly, and refreshes an expired
       * access token when configured in api.js.
       */
      const payload =
        await fetchAuthenticatedJson(
          "/auth/profile/",
          {
            method: "PATCH",
            body: formData,
          },
        );

      const updatedUser = {
        ...userState,
        ...payload,
        name:
          payload?.employee_name ||
          payload?.name ||
          payload?.email ||
          editName.trim(),
      };

      setUserState(updatedUser);

      setEditName(
        payload?.employee_name ||
          editName.trim(),
      );

      setProfileImage(
        payload?.profile_image || "",
      );

      setProfileFile(null);
      setRemoveProfileImage(false);

      if (
        typeof updateUser === "function"
      ) {
        updateUser(updatedUser);
      } else if (
        typeof setUser === "function"
      ) {
        setUser(updatedUser);
      }

      persistUpdatedUser(updatedUser);
      setShowProfileModal(false);
    } catch (error) {
      console.error(
        "Failed to save profile:",
        error,
      );

      setProfileError(
        error?.message ||
          "Profile update failed.",
      );
    } finally {
      setProfileSaving(false);
    }
  };



  const handleRoleAccess = async (nextRole) => {
    const requestedRole = normalizeRole(nextRole);

    if (!requestedRole) {
      return;
    }

    if (!profileRoles.includes(requestedRole)) {
      setRoleSwitchError(
        `${formatRoleLabel(requestedRole)} role is not assigned to this account.`,
      );
      return;
    }

    if (requestedRole === role) {
      setRoleSwitchError("");
      setShowNotificationDropdown(false);
      setShowProfileDropdown(false);
      return;
    }

    if (roleSwitching) {
      return;
    }

    try {
      setRoleSwitching(requestedRole);
      setRoleSwitchError("");
      setShowNotificationDropdown(false);

      const session = await fetchAuthenticatedJson(
        "/auth/switch-role/",
        {
          method: "POST",
          body: JSON.stringify({
            role: requestedRole,
          }),
        },
      );

      if (
        !session?.access ||
        !session?.refresh ||
        !session?.user
      ) {
        throw new Error(
          "The server did not return a valid role session.",
        );
      }

      if (typeof login !== "function") {
        throw new Error(
          "Authentication session updater is unavailable.",
        );
      }

      const returnedActiveRole = normalizeRole(
        session?.user?.active_role ||
          session?.user?.activeRole ||
          session?.active_role ||
          requestedRole,
      );

      if (returnedActiveRole !== requestedRole) {
        throw new Error(
          `Server returned ${formatRoleLabel(
            returnedActiveRole || "unknown",
          )} instead of ${formatRoleLabel(requestedRole)}.`,
        );
      }

      /*
       * IMPORTANT:
       * Update the authenticated session first.
       *
       * Do NOT call logout() and do NOT navigate before AuthContext has had
       * one render turn to commit the new active role. Navigating immediately
       * can make ProtectedRoute evaluate with the OLD Manager role and send
       * the user away from the Management route.
       */
      login({
        access: session.access,
        refresh: session.refresh,
        user: {
          ...session.user,
          active_role: requestedRole,
          activeRole: requestedRole,
        },
      });

      setUserState({
        ...session.user,
        active_role: requestedRole,
        activeRole: requestedRole,
      });

      setProfileImage(
        session.user?.profile_image ||
          session.user?.profileImage ||
          "",
      );

      setNotifications([]);
      setShowProfileDropdown(false);
      setShowProfileModal(false);

      window.dispatchEvent(
        new CustomEvent("ipms:role-switched", {
          detail: {
            role: requestedRole,
          },
        }),
      );

      /*
       * Let the AuthContext state update commit before ProtectedRoute checks
       * the destination. This prevents Manager -> Management from looking
       * like a logout.
       */
      window.setTimeout(() => {
        navigate(
          getRoleHome(requestedRole),
          {
            replace: true,
          },
        );
      }, 0);
    } catch (error) {
      console.error(
        "Failed to switch active role:",
        error,
      );

      setRoleSwitchError(
        error?.message ||
          `Unable to switch to ${formatRoleLabel(requestedRole)}.`,
      );

      setShowProfileDropdown(true);
    } finally {
      setRoleSwitching("");
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const displayName =
    userState?.employee_name ||
    userState?.full_name ||
    userState?.fullName ||
    userState?.name ||
    userState?.username ||
    userState?.email ||
    "User";

  const displayRole = formatRoleLabel(role);
  return (
    <>
      {/* TOPBAR */}
      <header className="sticky top-0 z-[100] flex items-center gap-4 bg-card/95 backdrop-blur border-b border-border px-6 py-3">
        <button className="md:hidden p-2 rounded-md hover:bg-muted">
          <Menu className="size-5" />
        </button>



        {/* RIGHT SIDE */}
        <div className="ml-auto flex items-center gap-2">
          {canViewNotifications && (
            <div className="relative">
              <button
                className="relative p-2 rounded-full hover:bg-muted"
                onClick={() =>
                  setShowNotificationDropdown(!showNotificationDropdown)
                }
              >
                <Bell className="size-5" />

                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 size-5 rounded-full text-white text-[10px] flex items-center justify-center"
                    style={{ backgroundColor: "#E85D75" }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotificationDropdown && (
                <div className="absolute right-0 mt-3 w-96 rounded-2xl border border-white/10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold">Notifications</h3>
                    {totalNotifications > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {totalNotifications} unread
                      </span>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto px-2 pb-2 space-y-2">
                    {groupedProcurement.length === 0 ? (
                      <div className="text-center py-10 text-sm text-gray-400 bg-white dark:bg-gray-900">
                        No notifications yet
                      </div>
                    ) : (
                      groupedProcurement.map((n) => (
                          <div
                          key={n.id}
                          className="flex items-start gap-3 p-3 rounded-xl cursor-pointer bg-white dark:bg-gray-800 hover:shadow-md hover:scale-[1.01] transition-all border border-gray-100 dark:border-gray-700"
onClick={() => {
  if (isInventoryUser) {
    navigate("/inventory-notifications");
  } else if (isFinance) {
    navigate("/finance/notifications");
  } else if (isManagement) {
    navigate("/management-notifications");
  } else if (isAdmin || isManager) {
    navigate("/notifications");
  } else {
    navigate("/materialsnotifications");
  }

  setShowNotificationDropdown(false);
}}
                        >
                          <div
                            className={`mt-1 w-2 h-2 rounded-full ${
                              [
                                "APPROVED",
                                "MANAGER_APPROVED",
                              ].includes(
                                String(
                                  n.status || "",
                                ).toUpperCase(),
                              )
                                ? "bg-green-500"
                                : [
                                    "REJECTED",
                                    "MANAGER_REJECTED",
                                  ].includes(
                                    String(
                                      n.status || "",
                                    ).toUpperCase(),
                                  )
                                ? "bg-red-500"
                                : "bg-yellow-500"
                            }`}
                          />

                          <div className="flex-1">
                            <div className="text-sm font-medium">
                              {n.title || "Material Request"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                            {n.count} pending request
{n.count === 1 ? "" : "s"}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* THEME */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full border border-border"
          >
            {isDarkMode ? (
              <Sun className="size-5" />
            ) : (
              <Moon className="size-5" />
            )}
          </button>

          {/* USER */}
          <div className="relative">
            <button
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
              className="flex items-center gap-3"
            >
              {profileImage ? (
                <img
                  src={profileImage}
                  alt="profile"
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
<div
  className="w-10 h-10 rounded-full text-white flex items-center justify-center font-bold"
  style={{ backgroundColor: "#E85D75" }}
>
  {displayName?.charAt(0)?.toUpperCase()}
</div>
              )}

              <div className="hidden sm:block text-left">
                <div className="font-semibold text-sm">{displayName}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {displayRole}
                </div>
              </div>

              <ChevronDown className="size-4" />
            </button>

            {/* PROFILE DROPDOWN */}
            {showProfileDropdown && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl border border-border bg-card shadow-2xl z-[1000] overflow-hidden">
                <div className="p-4 border-b border-border">
                  <p className="font-semibold">{displayName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Active Role:{" "}
                    <span className="font-semibold text-foreground">
                      {displayRole}
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowNotificationDropdown(false);
                    setShowProfileDropdown(false);
                    setRoleSwitchError("");
                    setShowProfileModal(true);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted transition-colors"
                >
                  <Edit3 className="size-4" />
                  Profile Settings
                </button>

                <div className="border-t border-border px-3 py-3">
                  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Roles
                  </p>

                  <div className="space-y-1">
                    {profileRoles.map((assignedRole) => {
                      const isCurrent = assignedRole === role;
                      const isThisSwitching =
                        roleSwitching === assignedRole;

                      return (
                        <button
                          key={assignedRole}
                          type="button"
                          disabled={
                            isCurrent ||
                            Boolean(roleSwitching)
                          }
                          onClick={() =>
                            void handleRoleAccess(
                              assignedRole,
                            )
                          }
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            isCurrent
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted text-foreground"
                          } disabled:cursor-default`}
                        >
                          <span className="font-medium">
                            {formatRoleLabel(assignedRole)}
                          </span>

                          <span
                            className={`text-[11px] ${
                              isCurrent
                                ? "font-semibold text-primary"
                                : "text-muted-foreground"
                            }`}
                          >
                            {isCurrent
                              ? "Active"
                              : isThisSwitching
                                ? "Switching..."
                                : "Switch"}
                          </span>
                        </button>
                      );
                    })}

                    {profileRoles.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                        No assigned roles found.
                      </div>
                    ) : null}
                  </div>

                  {roleSwitchError ? (
                    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                      {roleSwitchError}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={Boolean(roleSwitching)}
                  className="w-full flex items-center gap-2 border-t border-border px-4 py-3 hover:bg-muted text-red-500 transition-colors disabled:opacity-50"
                >
                  <LogOut className="size-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* PROFILE MODAL */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 py-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-[420px] max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="text-lg font-semibold">Profile Settings</h2>
              <button onClick={() => setShowProfileModal(false)}>
                <X className="size-5" />
              </button>
            </div>

            <div className="p-4">
              {/* PROFILE IMAGE */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt="Profile"
                      className="w-20 h-20 rounded-full object-cover border-[3px] border-primary shadow-md"
                    />
                  ) : (
<div
  className="w-20 h-20 rounded-full text-white text-2xl font-bold flex items-center justify-center shadow-md"
  style={{ backgroundColor: "#E85D75" }}
>
  {displayName?.charAt(0)?.toUpperCase()}
</div>
                  )}

                  <label
                    htmlFor="profile-upload"
                    className="absolute bottom-0 right-0 bg-primary text-white p-1.5 rounded-full shadow-md cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" />
                  </label>

                  <input
                    id="profile-upload"
                    type="file"
                   accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    hidden
                    onChange={handleImageUpload}
                  />
                </div>

                <h3 className="mt-2 text-base font-semibold">
                  {displayName}
                </h3>
                <p className="text-xs text-muted-foreground capitalize">
                  {displayRole}
                </p>
              </div>

              {/* INPUT */}
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Employee Name
                  </label>
                  <input
                    type="text"
                    autoComplete="name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Active Role
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={displayRole}
                    disabled
                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-muted text-sm"
                  />
                </div>

              </div>

              {profileError ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {profileError}
                </div>
              ) : null}

              {/* ACTIONS */}
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={profileSaving}
                  className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-60"
                >
                  {profileSaving
                    ? "Saving..."
                    : "Save Changes"}
                </button>

                <button
                  type="button"
                  onClick={removeProfilePhoto}
                  disabled={profileSaving}
                  className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm flex items-center gap-2 disabled:opacity-60"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove Image
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}