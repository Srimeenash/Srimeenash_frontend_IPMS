import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from "lucide-react";
import { useCostDetails } from "@/components/app/SerialCostDetails";

import { PageShell, PageHeader } from "@/components/app/PageShell";
import config from "@/config";
import { fetchAuthenticatedJson } from "@/api";
import { useAuth } from "@/AuthContext";

const PURPOSE_TABS = [
  ["FLIGHT_TEST", "Flight Test"],
  ["CUSTOMER_DEMO", "Demo/Trials"],
  ["QC_CHECK", "QC Check"],
  ["EVENT", "Event"],
  ["MISCELLANEOUS_USAGE", "Miscellaneous Usage"],
];

const RETURNABLE_COMPONENT_REQUEST_STATUSES = new Set([
  "PENDING",
  "REQUESTED",
  "PENDING_MANAGER",
  "MANAGER_APPROVED",
  "PROCUREMENT_PENDING",
  "INVENTORY_PENDING",
  "PO_RAISED",
  "PARTIALLY_DELIVERED",
  "PO_DELIVERED",
  "QC_CHECKED",
  "PROJECT_INVENTORY_READY",
  "INVENTORY_ISSUED",
  "MR_COMPLETED",
  "MANAGER_REJECTED",
  "REJECTED",
  "AWAITING_REPLACEMENT_APPROVAL",
  "REPLACEMENT_APPROVED",
  "AWAITING_REPLACEMENT_DELIVERY",
  "REPLACEMENT_PARTIALLY_RECEIVED",
  "REPLACEMENT_RECEIVED",
]);

const ISSUED_MR_STATUSES = new Set([
  "INVENTORY_ISSUED",
  "MR_COMPLETED",
  "ISSUED",
  "COMPLETED",
]);

const formatDate = (value) => {
  if (!value) return "-";

  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  return text;
};

const prettyStatus = (value) =>
  String(value || "PENDING")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatPurpose = (value) => {
  const purpose = String(value || "").trim().toUpperCase();

  return (
    {
      FLIGHT_TEST: "Flight Test",
      CUSTOMER_DEMO: "Demo/Trials",
      QC_CHECK: "QC Check",
      EVENT: "Event",
      MISCELLANEOUS_USAGE: "Miscellaneous Usage",
    }[purpose] || prettyStatus(purpose)
  );
};

const unwrapList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const normalizeStatus = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const normalizeMetadata = (value) => {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return (
      value.find(
        (item) =>
          item &&
          typeof item === "object" &&
          !Array.isArray(item),
      ) || {}
    );
  }

  return {};
};

const getMrNumber = (row = {}) =>
  String(
    row.material_request_number ||
      row.material_request_id ||
      row.request_id ||
      row.mr_id ||
      "",
  ).trim();

const getProjectDisplay = (
  row = {},
  projectByReference = new Map(),
) => {
  const projectObject =
    row?.project_details ||
    row?.projectDetails ||
    (
      row?.project &&
      typeof row.project === "object"
        ? row.project
        : null
    ) ||
    {};

  const directValue =
    row?.project_name ||
    row?.projectName ||
    projectObject?.name ||
    projectObject?.project_name ||
    projectObject?.projectName ||
    projectObject?.project_title ||
    projectObject?.projectTitle ||
    projectObject?.project_code ||
    projectObject?.projectCode ||
    "";

  if (directValue) {
    return String(directValue).trim();
  }

  const projectReference =
    row?.project_id ||
    row?.projectId ||
    projectObject?.id ||
    projectObject?.pk ||
    projectObject?.project_id ||
    row?.project ||
    "";

  if (
    projectReference !== undefined &&
    projectReference !== null &&
    String(projectReference).trim()
  ) {
    const key =
      String(projectReference)
        .trim()
        .toUpperCase();

    const matched =
      projectByReference.get(key);

    if (matched) {
      return String(
        matched?.project_name ||
          matched?.projectName ||
          matched?.name ||
          matched?.project_title ||
          matched?.projectTitle ||
          matched?.project_code ||
          matched?.projectCode ||
          matched?.code ||
          key,
      ).trim();
    }

    /*
     * If the MR already stores a readable project text (for example BHUMI),
     * show it even when the Projects endpoint is unavailable.
     * Numeric IDs are intentionally not shown as the Project name.
     */
    if (!/^\d+$/.test(key)) {
      return String(projectReference).trim();
    }
  }

  return "";
};

const getMrType = (row = {}) =>
  normalizeStatus(
    row.request_type ||
      row.material_request_type ||
      "",
  );

const getUsageMode = (row = {}) => {
  const requestType = getMrType(row);
  const purpose = normalizeStatus(row.purpose);

  if (
    requestType !== "RETURNABLE" &&
    ["FLIGHT_TEST", "CUSTOMER_DEMO", "EVENT"].includes(purpose)
  ) {
    return "DRONE";
  }

  return "COMPONENTS";
};

const getUsageMovementId = (row = {}) => {
  const issueDetails =
    row?.inventory_issue_details;

  const detailRows = Array.isArray(
    issueDetails,
  )
    ? issueDetails
    : issueDetails &&
        typeof issueDetails === "object"
      ? [issueDetails]
      : [];

  const movementId = String(
    row?.movement_id ||
      row?.movementId ||
      detailRows.find(
        (detail) =>
          detail &&
          typeof detail === "object" &&
          (
            detail.movement_id ||
            detail.movementId
          ),
      )?.movement_id ||
      detailRows.find(
        (detail) =>
          detail &&
          typeof detail === "object" &&
          detail.movementId,
      )?.movementId ||
      "",
  ).trim();

  if (movementId) {
    return movementId;
  }

  /*
   * Legacy fallback:
   * rows created by one direct Drone movement share the same
   * purpose/date/return-date/remarks. This keeps those component rows
   * together without multiplying the selected Drone Quantity.
   */
  return [
    normalizeStatus(row?.purpose),
    String(row?.requested_date || "").trim(),
    String(row?.return_due_date || "").trim(),
    String(row?.remarks || "").trim(),
  ].join("|");
};

const getDroneMovementQuantity = (
  items = [],
) => {
  const quantities = (
    Array.isArray(items) ? items : []
  )
    .map((item) =>
      Number(
        item?.drone_quantity ??
          item?.droneQuantity ??
          item?.quantity ??
          item?.issued_quantity ??
          item?.requested_quantity ??
          item?.qty ??
          0,
      ),
    )
    .filter(
      (value) =>
        Number.isFinite(value) &&
        value > 0,
    );

  /*
   * IMPORTANT:
   * move-from-in-drone creates one ComponentUsage row per component,
   * and every row carries the SAME selected drone quantity.
   *
   * Example: selected Drone Qty = 2 with an 8-component BOM gives
   * eight usage rows with quantity=2. The table must show 2, not 16.
   */
  return quantities.length
    ? Math.max(...quantities)
    : 0;
};

const getComponentLabel = (item = {}) => {
  const code =
    item.component_code ||
    item.componentCode ||
    item.component?.component_id ||
    "";

  const name =
    item.component_name ||
    item.name ||
    item.component?.name ||
    "Component";

  return code ? `${code} - ${name}` : name;
};

const getItemSerials = (item = {}) => {
  const values = [];

  const pushValues = (candidate) => {
    if (!Array.isArray(candidate)) return;

    candidate.forEach((value) => {
      const serial = String(value || "").trim();
      if (serial) values.push(serial);
    });
  };

  pushValues(item?.issued_serial_numbers);
  pushValues(item?.serial_numbers);
  pushValues(item?.selected_serials);

  const issueDetails = item?.inventory_issue_details;

  const detailRows = Array.isArray(issueDetails)
    ? issueDetails
    : issueDetails && typeof issueDetails === "object"
      ? [issueDetails]
      : [];

  detailRows.forEach((detail) => {
    if (!detail || typeof detail !== "object") return;

    pushValues(detail.serial_numbers);
    pushValues(detail.issued_serial_numbers);
    pushValues(detail.selected_serials);
    pushValues(detail.serials);

    /*
     * After return QC, the backend stores the exact per-unit result in
     * inventory_issue_details.return_qc_items. Use those serial numbers as
     * another audit source so View Details continues to show the serials even
     * after the movement becomes QC Failed / Pending Manager / Completed.
     */
    const qcItems = Array.isArray(
      detail.return_qc_items,
    )
      ? detail.return_qc_items
      : [];

    qcItems.forEach((qcItem) => {
      const serial = String(
        qcItem?.serial_number || "",
      ).trim();

      if (serial) {
        values.push(serial);
      }
    });
  });

  return Array.from(new Set(values));
};

const getGroupStatus = (group) => {
  if (group.virtual) {
    return normalizeStatus(group.mrStatus || "PENDING");
  }

  const items = Array.isArray(group.items)
    ? group.items
    : [];

  if (!items.length) {
    return normalizeStatus(group.mrStatus || "PENDING");
  }

  const approvalStates = items.map((item) =>
    normalizeStatus(item.return_approval_status),
  );

  const conditions = items.map((item) =>
    normalizeStatus(item.return_condition),
  );

  const allReceived = items.every((item) =>
    Boolean(item.received_date),
  );

  const anyReceived = items.some((item) =>
    Boolean(item.received_date),
  );

  const allIssued = items.every((item) =>
    Boolean(item.issued_date),
  );

  const anyPendingManager =
    approvalStates.includes("PENDING_MANAGER");

  const anyPendingFinance =
    approvalStates.includes("PENDING_FINANCE");

  const anyRejected =
    approvalStates.includes("REJECTED");

  const allCompleted =
    approvalStates.length > 0 &&
    approvalStates.every(
      (value) => value === "COMPLETED",
    );

  const allOk =
    conditions.length > 0 &&
    conditions.every(
      (value) => value === "OK",
    );

  const anyNotOk =
    conditions.includes("NOT_OK");

  if (anyRejected) {
    return "REJECTED";
  }

  if (anyNotOk && anyPendingManager) {
    return "QC_FAILED_PENDING_MANAGER";
  }

  if (anyNotOk && anyPendingFinance) {
    return "QC_FAILED_PENDING_FINANCE";
  }

  if (anyNotOk) {
    const metadata =
      normalizeMetadata(items[0]?.inventory_issue_details);

    const restoreReady =
      metadata.procurement_restore_ready === true;

    const restoreStatus = normalizeStatus(
      metadata.restore_status ||
        metadata.procurement_restore_status ||
        "",
    );

    if (restoreStatus === "PENDING_PROCUREMENT") {
      return "RESTORE_PENDING_PROCUREMENT";
    }

    const restorePo =
      String(
        metadata.restore_po_number || "",
      ).trim();

    if (
      approvalStates.includes("APPROVED") &&
      restorePo
    ) {
      return "RESTORE_PO_RAISED";
    }

    if (
      approvalStates.includes("APPROVED") &&
      restoreReady
    ) {
      return "RESTORE_PENDING_PROCUREMENT";
    }

    if (allCompleted) {
      return group.mode === "DRONE"
        ? "DRONE_QC_DISPOSITION_COMPLETED"
        : "FINAL_SCRAP_COMPLETED";
    }

    return "QC_FAILED";
  }

  if (
    allCompleted &&
    allOk
  ) {
    return group.mode === "DRONE"
      ? "QC_PASSED_DRONE_READY"
      : "QC_PASSED_RETURNED_TO_STORE";
  }

  if (
    allReceived &&
    conditions.every((value) => !value)
  ) {
    return "RETURNED_QC_PENDING";
  }

  if (anyReceived) {
    return "RETURNED";
  }

  if (
    group.mode === "DRONE" &&
    approvalStates.every(
      (value) => value === "APPROVED",
    ) &&
    !allIssued
  ) {
    return "INVENTORY_PENDING";
  }

  if (
    group.mode === "DRONE" &&
    anyPendingManager
  ) {
    return "PENDING_MANAGER";
  }

  if (allIssued) {
    return "ISSUED_TO_ENGINEER";
  }

  return normalizeStatus(
    group.mrStatus || "PENDING",
  );
};

const getStatusClass = (status) => {
  const value = normalizeStatus(status);

  if (
    value.includes("REJECTED") ||
    value.includes("FAILED")
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300";
  }

  if (
    value.includes("PASSED") ||
    value.includes("COMPLETED") ||
    value === "ISSUED_TO_ENGINEER" ||
    value === "MR_COMPLETED" ||
    value === "INVENTORY_ISSUED"
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300";
  }

  if (
    value.includes("PROCUREMENT") ||
    value.includes("PO_") ||
    value.includes("RESTORE")
  ) {
    return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300";
};

const getStatusLabel = (status) => {
  const value = normalizeStatus(status);

  const labels = {
    PENDING: "Pending",
    REQUESTED: "Requested",
    PENDING_MANAGER: "Pending Manager",
    MANAGER_APPROVED: "Manager Approved",
    MANAGER_REJECTED: "Manager Rejected",
    PROCUREMENT_PENDING: "Procurement Pending",
    INVENTORY_PENDING: "Inventory Pending",
    PO_RAISED: "PO Raised",
    PARTIALLY_DELIVERED: "Partially Delivered",
    PO_DELIVERED: "PO Delivered",
    QC_CHECKED: "QC Checked",
    PROJECT_INVENTORY_READY: "Project Inventory Ready",
    INVENTORY_ISSUED: "Inventory Issued",
    MR_COMPLETED: "MR Completed",
    ISSUED_TO_ENGINEER: "Issued to Engineer",
    RETURNED: "Returned",

    /*
     * Inventory-side Returnable workflow labels.
     *
     * IMPORTANT:
     * Engineer does not see these downstream statuses after hand-back.
     * Once Engineer returns the item, Engineer is permanently shown
     * "Returned". Inventory continues through the operational workflow.
     */
    RETURNED_QC_PENDING: "QC Pending",
    QC_FAILED_PENDING_MANAGER:
      "QC Checked - Pending Manager",
    QC_FAILED_PENDING_FINANCE:
      "QC Failed - Pending Finance Approval",
    QC_FAILED: "QC Failed",
    QC_PASSED_DRONE_READY:
      "QC Passed - Drone Ready",
    QC_PASSED_RETURNED_TO_STORE:
      "Moved to In Store",
    RESTORE_PENDING_PROCUREMENT:
      "Reorder Approved - Pending Procurement",
    RESTORE_PO_RAISED:
      "Reorder PO Raised - Pending Finance",
    DRONE_QC_DISPOSITION_COMPLETED:
      "QC Disposition Completed",
    FINAL_SCRAP_COMPLETED: "Scrapped",
    REJECTED: "Rejected - Workflow Stopped",
  };

  return labels[value] || prettyStatus(value);
};

export default function ReturnablePage() {
  const { openCostDetails, costDetailsPage } = useCostDetails();
  const { user, activeRole } = useAuth();
  const location = useLocation();

  const role = String(
    activeRole ||
      user?.active_role ||
      user?.activeRole ||
      user?.role?.name ||
      user?.role ||
      "",
  )
    .trim()
    .toLowerCase();

  const canInventoryAction = [
    "inventory",
    "admin",
  ].includes(role);

  /*
   * ---------------------------------------------------------------
   * ROLE-SPECIFIC RETURNABLE STATUS
   * ---------------------------------------------------------------
   *
   * Engineer workflow ENDS when Engineer hands the issued Returnable
   * item/drone back to Inventory.
   *
   * From that moment onward:
   *   Engineer  -> always sees "Returned"
   *   Inventory -> sees the real downstream workflow:
   *                QC Pending
   *                QC Checked - Pending Manager
   *                Reorder Approved - Pending Procurement
   *                Reorder PO Raised - Pending Finance
   *                Moved to In Store / Scrapped / etc.
   *
   * received_date is written by the engineer-return backend action and
   * remains on the ComponentUsage record during every later QC/approval
   * stage, so it is the stable boundary between Engineer and Inventory.
   */
  const hasEngineerReturned = (group) => {
    if (!group || group.virtual) {
      return false;
    }

    const items = Array.isArray(group.items)
      ? group.items
      : [];

    return items.some(
      (item) =>
        Boolean(item?.received_date) ||
        Boolean(item?.receivedDate),
    );
  };

  const getVisibleGroupStatus = (group) => {
    const actualStatus =
      getGroupStatus(group);

    if (
      role === "engineer" &&
      hasEngineerReturned(group)
    ) {
      return "RETURNED";
    }

    return actualStatus;
  };

  /*
   * Engineer/Admin hand-back permission.
   *
   * Inventory owns QC. Engineer/Admin only move an already-issued
   * Returnable movement back to Inventory -> Returned.
   */
  const canMoveToReturn = [
    "engineer",
    "admin",
  ].includes(role);

  const [usageRows, setUsageRows] =
    useState([]);

  const [materialRequests, setMaterialRequests] =
    useState([]);

  const [projectRows, setProjectRows] =
    useState([]);

  /*
   * ProjectInventory is the same MR-linked source used by Inventory/In Drone.
   * It is also an authoritative fallback for Project when an older
   * MaterialRequest/ComponentUsage response does not expose it correctly.
   */
  const [
    projectInventoryRows,
    setProjectInventoryRows,
  ] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState("");

  const [activePurpose, setActivePurpose] =
    useState("FLIGHT_TEST");

  const [tableSort, setTableSort] = useState({
    key: "",
    direction: "",
  });

  const [details, setDetails] =
    useState(null);

  const [processing, setProcessing] =
    useState(false);

  const [qcFailureDialog, setQcFailureDialog] =
    useState(null);

  const [qcFailureReason, setQcFailureReason] =
    useState("");

  const [goodSerialKeys, setGoodSerialKeys] =
    useState([]);

  const [moveReturnDialog, setMoveReturnDialog] =
    useState(null);
  const [moveReturnDate, setMoveReturnDate] =
    useState("");
  const [moveReturnRemarks, setMoveReturnRemarks] =
    useState("");
  const [moveReturnError, setMoveReturnError] =
    useState("");
  const [moveReturnProcessing, setMoveReturnProcessing] =
    useState(false);

  const [serialQcDialog, setSerialQcDialog] =
    useState(null);
  const [serialQcRows, setSerialQcRows] =
    useState([]);
  const [serialQcError, setSerialQcError] =
    useState("");
  const [serialQcLoading, setSerialQcLoading] =
    useState(false);

  useEffect(() => {
    const requestedPurpose = normalizeStatus(
      location.state?.openPurpose ||
        location.state?.activePurpose,
    );

    if (
      PURPOSE_TABS.some(
        ([value]) =>
          value === requestedPurpose,
      )
    ) {
      setActivePurpose(requestedPurpose);
    }
  }, [location.state]);

  const loadData = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const [
        mrPayload,
        usagePayload,
        projectPayload,
        projectInventoryPayload,
      ] = await Promise.all([
        fetchAuthenticatedJson(
          `${config.baseURL}/materialrequest/material-requests/?page_size=5000`,
          {
            cache: "no-store",
          },
        ),
        fetchAuthenticatedJson(
          `${config.baseURL}/component-usage/?page_size=5000`,
          {
            cache: "no-store",
          },
        ),
        fetchAuthenticatedJson(
          `${config.baseURL}/projects/projects/?page_size=5000`,
          {
            cache: "no-store",
          },
        ).catch(() => []),
        fetchAuthenticatedJson(
          `${config.baseURL}/inventory/project-inventory/?page_size=5000`,
          {
            cache: "no-store",
          },
        ).catch(() => []),
      ]);

      const mrList =
        unwrapList(mrPayload);

      let usages =
        unwrapList(usagePayload);

      /*
       * COMPONENT mode reaches this page before ComponentUsage exists.
       * Once Inventory has fully issued the Returnable MR, synchronize the
       * exact issued components/serials into ComponentUsage. This endpoint
       * is idempotent, so reloading is safe.
       */
      const issuedReturnableMrs =
        mrList.filter((mr) => {
          const requestType =
            normalizeStatus(
              mr?.request_type,
            );

          const mrStatus =
            normalizeStatus(
              mr?.status ||
                mr?.approval_status,
            );

          return (
            requestType === "RETURNABLE" &&
            ISSUED_MR_STATUSES.has(
              mrStatus,
            )
          );
        });

      if (issuedReturnableMrs.length) {
        await Promise.allSettled(
          issuedReturnableMrs.map((mr) =>
            fetchAuthenticatedJson(
              `${config.baseURL}/component-usage/sync-returnable-mr/`,
              {
                method: "POST",
                body: JSON.stringify({
                  material_request_id:
                    mr.material_request_id ||
                    mr.id,
                }),
              },
            ),
          ),
        );

        const refreshed =
          await fetchAuthenticatedJson(
            `${config.baseURL}/component-usage/?page_size=5000`,
            {
              cache: "no-store",
            },
          );

        usages =
          unwrapList(refreshed);
      }

      /*
       * Keep ALL Material Requests here.
       *
       * Flight Test / Demo / Event do not create a new RETURNABLE MR.
       * They reuse an existing In-Drone BOM/R&D MR, so we need that source
       * MR available in this page to fetch its Project.
       */
      setMaterialRequests(mrList);

      setProjectRows(
        unwrapList(projectPayload),
      );

      setProjectInventoryRows(
        unwrapList(projectInventoryPayload),
      );

      setUsageRows(usages);
    } catch (error) {
      console.error(
        "Failed to load Returnable workflow:",
        error,
      );

      setUsageRows([]);
      setMaterialRequests([]);
      setProjectRows([]);
      setProjectInventoryRows([]);

      setLoadError(
        error?.message ||
          "Unable to load Returnable workflow.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();

    const reload = () => {
      void loadData();
    };

    window.addEventListener(
      "notificationsUpdated",
      reload,
    );

    window.addEventListener(
      "inventory:changed",
      reload,
    );

    window.addEventListener(
      "inwardUpdated",
      reload,
    );

    return () => {
      window.removeEventListener(
        "notificationsUpdated",
        reload,
      );

      window.removeEventListener(
        "inventory:changed",
        reload,
      );

      window.removeEventListener(
        "inwardUpdated",
        reload,
      );
    };
  }, []);

  const groups = useMemo(() => {
    const map = new Map();

    const projectByReference = new Map();

    projectRows.forEach((project) => {
      [
        project?.id,
        project?.pk,
        project?.project_id,
        project?.projectId,
        project?.project_code,
        project?.projectCode,
        project?.name,
        project?.project_name,
        project?.projectName,
      ]
        .filter(
          (value) =>
            value !== undefined &&
            value !== null &&
            String(value).trim(),
        )
        .forEach((value) => {
          projectByReference.set(
            String(value)
              .trim()
              .toUpperCase(),
            project,
          );
        });
    });

    /*
     * Index every Material Request by both database id and visible MR number.
     * This is required for Flight Test / Demo / Event because their
     * ComponentUsage points back to the original In-Drone BOM/R&D MR.
     */
    const sourceMrByReference = new Map();

    materialRequests.forEach((mr) => {
      [
        mr?.id,
        mr?.material_request_id,
        mr?.material_request_number,
        mr?.request_id,
        mr?.mr_id,
      ]
        .filter(
          (value) =>
            value !== undefined &&
            value !== null &&
            String(value).trim() !== "",
        )
        .forEach((value) => {
          sourceMrByReference.set(
            String(value)
              .trim()
              .toUpperCase(),
            mr,
          );
        });
    });

    /*
     * Same source that powers Inventory -> In Drone.
     *
     * Key every ProjectInventory row by both database MR id and business
     * MR number. For a Flight Test / Demo / Event row this lets us recover
     * the exact Project even for older ComponentUsage rows.
     */
    const projectInventoryProjectByMr =
      new Map();

    projectInventoryRows.forEach((row) => {
      const projectValue =
        getProjectDisplay(
          row,
          projectByReference,
        );

      if (!projectValue) {
        return;
      }

      [
        row?.material_request,
        row?.material_request_id,
        row?.material_request_number,
        row?.source_mr_number,
        row?.request_id,
        row?.mr_id,
      ]
        .filter(
          (value) =>
            value !== undefined &&
            value !== null &&
            String(value).trim() !== "",
        )
        .forEach((value) => {
          projectInventoryProjectByMr.set(
            String(value)
              .trim()
              .toUpperCase(),
            projectValue,
          );
        });
    });

    /*
     * Real ComponentUsage rows.
     * This includes Drone-mode rows immediately and Component-mode rows after
     * Inventory has issued the component MR.
     */
    usageRows.forEach((row) => {
      const mrNumber =
        getMrNumber(row);

      const purpose =
        normalizeStatus(
          row?.purpose,
        );

      if (!mrNumber || !purpose) {
        return;
      }

      const mode =
        getUsageMode(row);

      const movementId =
        mode === "DRONE"
          ? getUsageMovementId(row)
          : "";

      const key =
        mode === "DRONE"
          ? `${mrNumber}|${purpose}|${movementId}`
          : `${mrNumber}|${purpose}`;

      const sourceMr =
        sourceMrByReference.get(
          String(mrNumber)
            .trim()
            .toUpperCase(),
        ) ||
        sourceMrByReference.get(
          String(
            row?.material_request ||
              "",
          )
            .trim()
            .toUpperCase(),
        ) ||
        null;

      const projectFromProjectInventory =
        projectInventoryProjectByMr.get(
          String(mrNumber)
            .trim()
            .toUpperCase(),
        ) ||
        projectInventoryProjectByMr.get(
          String(
            row?.material_request ||
              "",
          )
            .trim()
            .toUpperCase(),
        ) ||
        "";

      if (!map.has(key)) {
        map.set(key, {
          key,
          virtual: false,
          mrNumber,
          requester:
            row.employee_name || "-",
          purpose,
          requestedDate:
            row.requested_date,
          returnDate:
            row.return_due_date,
          mrStatus:
            row.material_request_status ||
            row.status ||
            "PENDING",
          approvalStatus:
            row.material_request_approval_status ||
            "",
          requestType:
            row.request_type || "",
          project:
            /*
             * Preferred order:
             * 1. ComponentUsage.project (directly serialized from linked MR)
             * 2. original MaterialRequest.project
             * 3. ProjectInventory.project
             */
            getProjectDisplay(
              row,
              projectByReference,
            ) ||
            getProjectDisplay(
              sourceMr,
              projectByReference,
            ) ||
            projectFromProjectInventory ||
            "",
          remarks:
            row.remarks || "",
          mode,
          droneQuantity: 0,
          items: [],
        });
      }

      const currentGroup =
        map.get(key);

      if (!currentGroup.project) {
        currentGroup.project =
          getProjectDisplay(
            row,
            projectByReference,
          ) ||
          getProjectDisplay(
            sourceMr,
            projectByReference,
          ) ||
          projectFromProjectInventory ||
          "";
      }

      currentGroup.items.push(row);

      if (currentGroup.mode === "DRONE") {
        currentGroup.droneQuantity =
          getDroneMovementQuantity(
            currentGroup.items,
          );
      }
    });

    /*
     * Virtual COMPONENT-mode groups keep Returnable visible through the full
     * MR workflow BEFORE ComponentUsage rows are created:
     * Manager -> Inventory/Procurement -> PO -> Inward/QC -> Inventory Issue.
     */
    materialRequests.forEach((mr) => {
      if (
        normalizeStatus(
          mr?.request_type,
        ) !== "RETURNABLE"
      ) {
        return;
      }

      const purpose =
        normalizeStatus(
          mr?.returnable_purpose,
        );

      if (!purpose) {
        return;
      }

      const mrNumber =
        getMrNumber(mr) ||
        String(mr?.id || "");

      if (!mrNumber) {
        return;
      }

      const key =
        `${mrNumber}|${purpose}`;

      if (map.has(key)) {
        const group = map.get(key);

        group.project =
          getProjectDisplay(mr, projectByReference) ||
          group.project ||
          "";

        group.mrStatus =
          mr.status ||
          group.mrStatus;

        group.approvalStatus =
          mr.approval_status ||
          group.approvalStatus;

        return;
      }

      const requestItems =
        Array.isArray(
          mr?.request_items,
        )
          ? mr.request_items
          : Array.isArray(mr?.items)
            ? mr.items
            : [];

      const mrStatus =
        normalizeStatus(
          mr?.status ||
            mr?.approval_status ||
            "PENDING",
        );

      if (
        !RETURNABLE_COMPONENT_REQUEST_STATUSES.has(
          mrStatus,
        )
      ) {
        return;
      }

      map.set(key, {
        key,
        virtual: true,
        mrNumber,
        requester:
          mr.requester_name ||
          mr.requester ||
          "-",
        purpose,
        requestedDate:
          mr.date,
        returnDate:
          mr.required_date,
        mrStatus,
        approvalStatus:
          mr.approval_status || "",
        requestType: "RETURNABLE",
        project:
          getProjectDisplay(mr, projectByReference),
        remarks:
          mr.remarks || "",
        mode: "COMPONENTS",
        items: requestItems.map(
          (item, index) => ({
            ...item,
            id:
              item.id ||
              `mr-${mr.id}-${index}`,
            status: mrStatus,
            component_name:
              item.component_name ||
              item.name ||
              item.component?.name ||
              "Component",
            component_code:
              item.component_code ||
              item.component?.component_id ||
              "",
            component_type:
              item.category ||
              item.component?.category ||
              "",
            quantity:
              Number(
                item.quantity ||
                  item.qty ||
                  0,
              ),
            uom:
              item.unit ||
              item.uom ||
              item.unit_of_measurements ||
              "",
            issued_serial_numbers: [],
          }),
        ),
      });
    });

    return Array.from(
      map.values(),
    )
      .filter(
        (group) =>
          group.purpose ===
          activePurpose,
      )
      .sort((a, b) =>
        String(
          b.requestedDate || "",
        ).localeCompare(
          String(
            a.requestedDate || "",
          ),
        ),
      );
  }, [
    usageRows,
    materialRequests,
    projectRows,
    projectInventoryRows,
    activePurpose,
  ]);

  const getReturnableSortValue = (
    group,
    key,
  ) => {
    switch (key) {
      case "mrNumber":
        return group?.mrNumber || "";

      case "requester":
        return group?.requester || "";

      case "project":
        return group?.project || "";

      case "mode":
        return group?.mode === "DRONE"
          ? "Drone"
          : "Components";

      case "droneQuantity":
        return Number(
          group?.droneQuantity ||
            getDroneMovementQuantity(
              group?.items || [],
            ) ||
            0,
        );

      case "requestedDate":
        return group?.requestedDate || "";

      case "returnDate":
        return group?.returnDate || "";

      case "summary":
        return group?.mode === "DRONE"
          ? "Existing In-Drone assembly"
          : (Array.isArray(group?.items)
              ? group.items
              : []
            )
              .map(
                (item) =>
                  `${getComponentLabel(
                    item,
                  )} ${Number(
                    item?.quantity || 0,
                  )}`,
              )
              .join(" ");

      case "status":
        return getStatusLabel(
          getVisibleGroupStatus(group),
        );

      default:
        return "";
    }
  };

  const sortedGroups = useMemo(() => {
    if (
      !tableSort.key ||
      !tableSort.direction
    ) {
      return groups;
    }

    return [...groups].sort(
      (left, right) => {
        const leftValue =
          getReturnableSortValue(
            left,
            tableSort.key,
          );

        const rightValue =
          getReturnableSortValue(
            right,
            tableSort.key,
          );

        let comparison = 0;

        if (
          Number.isFinite(
            Number(leftValue),
          ) &&
          Number.isFinite(
            Number(rightValue),
          ) &&
          String(leftValue).trim() !== "" &&
          String(rightValue).trim() !== ""
        ) {
          comparison =
            Number(leftValue) -
            Number(rightValue);
        } else {
          comparison = String(
            leftValue ?? "",
          ).localeCompare(
            String(rightValue ?? ""),
            undefined,
            {
              numeric: true,
              sensitivity: "base",
            },
          );
        }

        return tableSort.direction ===
          "asc"
          ? comparison
          : -comparison;
      },
    );
  }, [
    groups,
    tableSort,
    role,
  ]);

  const toggleReturnableSort = (key) => {
    setTableSort((previous) => {
      if (previous.key !== key) {
        return {
          key,
          direction: "asc",
        };
      }

      if (
        previous.direction === "asc"
      ) {
        return {
          key,
          direction: "desc",
        };
      }

      return {
        key: "",
        direction: "",
      };
    });
  };

  const ReturnableSortIcon = ({
    sortKey,
  }) => {
    if (tableSort.key !== sortKey) {
      return (
        <ArrowUpDown className="size-3.5 text-slate-400" />
      );
    }

    return tableSort.direction ===
      "asc" ? (
      <ArrowUp className="size-3.5 text-primary" />
    ) : (
      <ArrowDown className="size-3.5 text-primary" />
    );
  };

  useEffect(() => {
    if (!details) return;

    const updated =
      groups.find(
        (group) =>
          group.key ===
          details.key,
      );

    if (updated) {
      setDetails(updated);
    }
  }, [groups]);

  const getTodayIso = () => {
    const now = new Date();
    const local = new Date(
      now.getTime() -
        now.getTimezoneOffset() * 60 * 1000,
    );
    return local.toISOString().slice(0, 10);
  };

  const canEngineerMoveToReturn = (group) => {
    if (!canMoveToReturn || !group) {
      return false;
    }

    const status = normalizeStatus(
      getGroupStatus(group),
    );

    const issuedStatus = new Set([
      "ISSUED_TO_ENGINEER",
      "INVENTORY_ISSUED",
      "MR_COMPLETED",
      "ISSUED",
      "COMPLETED",
    ]).has(status);

    if (!issuedStatus) {
      return false;
    }

    const realItems = Array.isArray(group.items)
      ? group.items.filter(
          (item) =>
            item &&
            item.id !== undefined &&
            item.id !== null &&
            !String(item.id).startsWith("mr-"),
        )
      : [];

    /*
     * If the Component group is still virtual but MR status is
     * INVENTORY_ISSUED, allow the button. submitMoveToReturn()
     * first calls sync-returnable-mr and resolves the real usage row.
     */
    if (group.virtual) {
      return true;
    }

    return realItems.some(
      (item) =>
        Boolean(item.issued_date) &&
        !Boolean(item.received_date),
    );
  };

  const openMoveToReturn = (group) => {
    if (!canEngineerMoveToReturn(group)) {
      return;
    }

    setMoveReturnDialog(group);
    setMoveReturnDate(getTodayIso());
    setMoveReturnRemarks("");
    setMoveReturnError("");
  };

  const closeMoveToReturn = () => {
    if (moveReturnProcessing) {
      return;
    }

    setMoveReturnDialog(null);
    setMoveReturnDate("");
    setMoveReturnRemarks("");
    setMoveReturnError("");
  };

  const resolveReturnUsage = async (group) => {
    const realItems = Array.isArray(group?.items)
      ? group.items.filter(
          (item) =>
            item &&
            item.id !== undefined &&
            item.id !== null &&
            !String(item.id).startsWith("mr-"),
        )
      : [];

    const direct = realItems.find(
      (item) =>
        Boolean(item.issued_date) &&
        !Boolean(item.received_date),
    );

    if (direct) {
      return direct;
    }

    /*
     * Component-mode Returnable can still be represented by a virtual
     * MR row immediately after Inventory Issue. Synchronize it now so
     * Engineer/Admin can return it from this same screen.
     */
    const syncedPayload =
      await fetchAuthenticatedJson(
        `${config.baseURL}/component-usage/sync-returnable-mr/`,
        {
          method: "POST",
          body: JSON.stringify({
            material_request_id:
              group?.mrNumber,
          }),
        },
      );

    const syncedRows = unwrapList(
      syncedPayload,
    );

    const purpose =
      normalizeStatus(group?.purpose);

    return (
      syncedRows.find(
        (item) =>
          normalizeStatus(item?.purpose) ===
            purpose &&
          Boolean(item?.issued_date) &&
          !Boolean(item?.received_date),
      ) ||
      syncedRows.find(
        (item) =>
          Boolean(item?.issued_date) &&
          !Boolean(item?.received_date),
      ) ||
      null
    );
  };

  const submitMoveToReturn = async () => {
    const group = moveReturnDialog;

    if (
      !group ||
      moveReturnProcessing
    ) {
      return;
    }

    if (!moveReturnDate) {
      setMoveReturnError(
        "Return Date is required.",
      );
      return;
    }

    setMoveReturnProcessing(true);
    setMoveReturnError("");

    try {
      const usage =
        await resolveReturnUsage(group);

      if (!usage?.id) {
        throw new Error(
          "Issued Returnable usage record was not found. Refresh after Inventory Issue and try again.",
        );
      }

      await fetchAuthenticatedJson(
        `${config.baseURL}/component-usage/${encodeURIComponent(
          usage.id,
        )}/engineer-return/`,
        {
          method: "POST",
          body: JSON.stringify({
            return_date:
              moveReturnDate,
            remarks:
              String(
                moveReturnRemarks || "",
              ).trim(),
          }),
        },
      );

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
                "componentUsage",
            },
          },
        ),
      );

      setMoveReturnDialog(null);
      setMoveReturnDate("");
      setMoveReturnRemarks("");
      setMoveReturnError("");

      await loadData();
    } catch (error) {
      console.error(
        "Move to Return failed:",
        error,
      );

      setMoveReturnError(
        error?.message ||
          error?.detail ||
          "Unable to move this Returnable request to Inventory Returned.",
      );
    } finally {
      setMoveReturnProcessing(false);
    }
  };

  const openDetailsWithSerials = async (group) => {
    if (!group) return;

    /*
     * View Details must also hydrate exact issued serials.
     *
     * Previously only the QC Check button called hydrate-return-serials.
     * Therefore a record that had already moved to QC Failed - Pending
     * Manager opened with the stale group data and showed "-" under serials.
     */
    const firstUsage =
      Array.isArray(group?.items)
        ? group.items.find(
            (item) =>
              item?.id !== undefined &&
              item?.id !== null &&
              !String(item.id).startsWith("mr-"),
          )
        : null;

    if (
      group.virtual ||
      !firstUsage?.id
    ) {
      setDetails(group);
      return;
    }

    try {
      const payload =
        await fetchAuthenticatedJson(
          `${config.baseURL}/component-usage/${encodeURIComponent(
            firstUsage.id,
          )}/hydrate-return-serials/`,
          {
            method: "POST",
            body: JSON.stringify({}),
          },
        );

      const hydratedRows = Array.isArray(
        payload?.rows,
      )
        ? payload.rows
        : [];

      if (hydratedRows.length) {
        setDetails({
          ...group,
          items: hydratedRows,
        });
        return;
      }
    } catch (error) {
      console.warn(
        "Unable to hydrate serials for View Details:",
        error,
      );
    }

    setDetails(group);
  };

  const getComponentId = (item = {}) => {
    if (
      item?.component &&
      typeof item.component === "object"
    ) {
      return (
        item.component.id ??
        item.component.pk ??
        null
      );
    }

    return (
      item?.component ??
      item?.component_id ??
      null
    );
  };

  const buildSerialQcRows = (items = []) => {
    const output = [];

    (Array.isArray(items) ? items : []).forEach(
      (item) => {
        const serials =
          getItemSerials(item);

        const quantity = Math.max(
          Number(item?.quantity || 0),
          serials.length,
          1,
        );

        if (serials.length) {
          serials.forEach(
            (serial, index) => {
              output.push({
                key: `${item.id}::${serial}`,
                usage_id: item.id,
                component_id:
                  getComponentId(item),
                component_label:
                  getComponentLabel(item),
                serial_number: serial,
                unit_index: index + 1,
                condition: "",
                remarks: "",
              });
            },
          );

          return;
        }

        /*
         * No fake serial number is generated here. If the historical
         * movement has no serial recorded even after backend hydration,
         * keep the exact unit count visible and let Inventory identify
         * the data gap before QC submission.
         */
        for (
          let index = 0;
          index < quantity;
          index += 1
        ) {
          output.push({
            key: `${item.id}::unit-${index + 1}`,
            usage_id: item.id,
            component_id:
              getComponentId(item),
            component_label:
              getComponentLabel(item),
            serial_number: "",
            unit_index: index + 1,
            condition: "",
            remarks: "",
          });
        }
      },
    );

    return output;
  };

  const closeSerialQc = () => {
    if (serialQcLoading) return;

    setSerialQcDialog(null);
    setSerialQcRows([]);
    setSerialQcError("");
  };

  const openSerialQc = async (group) => {
    if (
      !canInventoryAction ||
      !group ||
      getGroupStatus(group) !==
        "RETURNED_QC_PENDING"
    ) {
      return;
    }

    const firstUsage =
      group?.items?.find(
        (item) =>
          item?.id !== undefined &&
          item?.id !== null,
      );

    if (!firstUsage?.id) {
      setSerialQcError(
        "Returned usage record was not found.",
      );
      return;
    }

    setSerialQcLoading(true);
    setSerialQcError("");

    try {
      /*
       * Repair legacy/missing serial mappings from the exact issued
       * ProjectInventory serials before opening QC. This makes older
       * returned records usable without creating fake serial numbers.
       */
      const hydratedPayload =
        await fetchAuthenticatedJson(
          `${config.baseURL}/component-usage/${encodeURIComponent(
            firstUsage.id,
          )}/hydrate-return-serials/`,
          {
            method: "POST",
            body: JSON.stringify({}),
          },
        );

      const hydratedItems = Array.isArray(
        hydratedPayload?.rows,
      )
        ? hydratedPayload.rows
        : Array.isArray(hydratedPayload)
          ? hydratedPayload
          : group.items;

      const hydratedGroup = {
        ...group,
        items: hydratedItems,
      };

      setSerialQcDialog(
        hydratedGroup,
      );
      setSerialQcRows(
        buildSerialQcRows(
          hydratedItems,
        ),
      );
    } catch (error) {
      console.error(
        "Unable to prepare serial QC:",
        error,
      );

      /*
       * Still open with the currently loaded rows so Inventory can see
       * exactly which serial data is missing.
       */
      setSerialQcDialog(group);
      setSerialQcRows(
        buildSerialQcRows(
          group.items,
        ),
      );
      setSerialQcError(
        error?.message ||
          error?.detail ||
          "Unable to refresh issued serial numbers.",
      );
    } finally {
      setSerialQcLoading(false);
    }
  };

  const updateSerialQcRow = (
    key,
    field,
    value,
  ) => {
    setSerialQcRows((previous) =>
      previous.map((row) => {
        if (row.key !== key) {
          return row;
        }

        if (
          field === "condition" &&
          value === "OK"
        ) {
          return {
            ...row,
            condition: "OK",
            remarks: "QC OK",
          };
        }

        if (
          field === "condition" &&
          value === "NOT_OK"
        ) {
          return {
            ...row,
            condition: "NOT_OK",
            remarks:
              row.condition === "NOT_OK"
                ? row.remarks
                : "",
          };
        }

        return {
          ...row,
          [field]: value,
        };
      }),
    );

    setSerialQcError("");
  };

  const applyQcResultToAll = (
    condition,
  ) => {
    if (
      !["OK", "NOT_OK"].includes(
        condition,
      )
    ) {
      return;
    }

    setSerialQcRows((previous) =>
      previous.map((row) => ({
        ...row,
        condition,
        remarks:
          condition === "OK"
            ? "QC OK"
            : "",
      })),
    );

    setSerialQcError("");
  };

  const clearQcResultFromAll = (
    condition,
  ) => {
    setSerialQcRows((previous) =>
      previous.map((row) =>
        row.condition === condition
          ? {
              ...row,
              condition: "",
              remarks: "",
            }
          : row,
      ),
    );

    setSerialQcError("");
  };

  const allSerialQcPassed =
    serialQcRows.length > 0 &&
    serialQcRows.every(
      (row) =>
        row.condition === "OK",
    );

  const allSerialQcFailed =
    serialQcRows.length > 0 &&
    serialQcRows.every(
      (row) =>
        row.condition === "NOT_OK",
    );

  const submitSerialQc = async () => {
    if (
      !serialQcDialog ||
      serialQcLoading
    ) {
      return;
    }

    if (!serialQcRows.length) {
      setSerialQcError(
        "No returned serial/component units were found for QC.",
      );
      return;
    }

    const missingResult =
      serialQcRows.find(
        (row) =>
          !["OK", "NOT_OK"].includes(
            String(
              row.condition || "",
            ).toUpperCase(),
          ),
      );

    if (missingResult) {
      setSerialQcError(
        `Select PASS or FAIL for ${
          missingResult.serial_number ||
          `${missingResult.component_label} Unit ${missingResult.unit_index}`
        }.`,
      );
      return;
    }

    const missingRemark =
      serialQcRows.find(
        (row) =>
          row.condition === "NOT_OK" &&
          !String(
            row.remarks || "",
          ).trim(),
      );

    if (missingRemark) {
      setSerialQcError(
        `Remarks are required for FAILED serial ${
          missingRemark.serial_number ||
          `${missingRemark.component_label} Unit ${missingRemark.unit_index}`
        }.`,
      );
      return;
    }

    const firstUsage =
      serialQcDialog?.items?.find(
        (item) =>
          item?.id !== undefined &&
          item?.id !== null,
      );

    if (!firstUsage?.id) {
      setSerialQcError(
        "Returned usage reference is missing.",
      );
      return;
    }

    setSerialQcLoading(true);
    setSerialQcError("");

    try {
      await fetchAuthenticatedJson(
        `${config.baseURL}/component-usage/${encodeURIComponent(
          firstUsage.id,
        )}/return-qc/`,
        {
          method: "POST",
          body: JSON.stringify({
            movement_id:
              serialQcDialog?.key || "",
            qc_items:
              serialQcRows.map(
                (row) => ({
                  usage_id:
                    row.usage_id,
                  component_id:
                    row.component_id,
                  serial_number:
                    row.serial_number,
                  unit_index:
                    row.unit_index,
                  condition:
                    row.condition,
                  remarks:
                    String(
                      row.remarks || "",
                    ).trim(),
                }),
              ),
          }),
        },
      );

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
                "componentUsage",
            },
          },
        ),
      );

      setSerialQcDialog(null);
      setSerialQcRows([]);
      setSerialQcError("");
      setDetails(null);

      await loadData();
    } catch (error) {
      console.error(
        "Serial-level return QC failed:",
        error,
      );

      setSerialQcError(
        error?.message ||
          error?.detail ||
          "Unable to submit return QC.",
      );
    } finally {
      setSerialQcLoading(false);
    }
  };

  const issueDrone = async (group) => {
    const usage =
      group?.items?.[0];

    if (
      !usage?.id ||
      processing
    ) {
      return;
    }

    setProcessing(true);

    try {
      await fetchAuthenticatedJson(
        `${config.baseURL}/component-usage/${encodeURIComponent(
          usage.id,
        )}/inventory-issue/`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );

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
              type: "componentUsage",
            },
          },
        ),
      );

      await loadData();
    } catch (error) {
      console.error(
        "Drone issue failed:",
        error,
      );

      alert(
        error?.message ||
          "Unable to issue this drone.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const markQcPassed = async (group) => {
    const usage =
      group?.items?.[0];

    if (
      !usage?.id ||
      processing
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        group.mode === "DRONE"
          ? "Confirm that the returned drone passed Inventory QC?"
          : "Confirm that all returned components passed Inventory QC and should return to In Store?",
      );

    if (!confirmed) {
      return;
    }

    setProcessing(true);

    try {
      await fetchAuthenticatedJson(
        `${config.baseURL}/component-usage/${encodeURIComponent(
          usage.id,
        )}/return-qc/`,
        {
          method: "POST",
          body: JSON.stringify({
            condition: "OK",
          }),
        },
      );

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
              type: "componentUsage",
            },
          },
        ),
      );

      setDetails(null);
      await loadData();
    } catch (error) {
      console.error(
        "Return QC Passed failed:",
        error,
      );

      alert(
        error?.message ||
          "Unable to save QC Passed.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const openQcFailure = (group) => {
    setQcFailureDialog(group);
    setQcFailureReason("");
    setGoodSerialKeys([]);
  };

  const toggleGoodSerial = (
    usageId,
    serial,
  ) => {
    const key =
      `${usageId}::${serial}`;

    setGoodSerialKeys(
      (previous) =>
        previous.includes(key)
          ? previous.filter(
              (value) =>
                value !== key,
            )
          : [
              ...previous,
              key,
            ],
    );
  };

  const submitQcFailure = async () => {
    const group =
      qcFailureDialog;

    const usage =
      group?.items?.[0];

    if (
      !group ||
      !usage?.id ||
      processing
    ) {
      return;
    }

    if (
      !qcFailureReason.trim()
    ) {
      alert(
        "QC failure reason is required.",
      );
      return;
    }

    const goodItems =
      group.mode === "DRONE"
        ? group.items
            .map((item) => {
              const serials =
                getItemSerials(item)
                  .filter((serial) =>
                    goodSerialKeys.includes(
                      `${item.id}::${serial}`,
                    ),
                  );

              return {
                component_id:
                  item.component,
                serial_numbers:
                  serials,
              };
            })
            .filter(
              (item) =>
                item.component_id &&
                item.serial_numbers.length >
                  0,
            )
        : [];

    if (
      group.mode === "DRONE"
    ) {
      const allSerialCount =
        group.items.reduce(
          (total, item) =>
            total +
            getItemSerials(
              item,
            ).length,
          0,
        );

      if (
        allSerialCount > 0 &&
        goodSerialKeys.length >=
          allSerialCount
      ) {
        alert(
          "QC Failed requires at least one component/serial to remain marked Bad.",
        );
        return;
      }
    }

    setProcessing(true);

    try {
      await fetchAuthenticatedJson(
        `${config.baseURL}/component-usage/${encodeURIComponent(
          usage.id,
        )}/return-qc/`,
        {
          method: "POST",
          body: JSON.stringify({
            condition: "NOT_OK",
            reason:
              qcFailureReason.trim(),
            good_items: goodItems,
          }),
        },
      );

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
              type: "componentUsage",
            },
          },
        ),
      );

      setQcFailureDialog(null);
      setQcFailureReason("");
      setGoodSerialKeys([]);
      setDetails(null);

      await loadData();
    } catch (error) {
      console.error(
        "Return QC Failed submission failed:",
        error,
      );

      alert(
        error?.message ||
          "Unable to submit QC Failed.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const canIssueDrone = (group) =>
    canInventoryAction &&
    !group.virtual &&
    group.mode === "DRONE" &&
    getGroupStatus(group) ===
      "INVENTORY_PENDING";

  const canPerformReturnQc = (group) =>
    canInventoryAction &&
    !group.virtual &&
    getGroupStatus(group) ===
      "RETURNED_QC_PENDING";

  /*
   * ==========================================================
   * RETURNABLE COMPONENT COST DETAILS
   * ==========================================================
   *
   * Returnable ComponentUsage rows contain the issued serials, but the
   * actual purchase/allocated cost belongs to the MR-linked
   * ProjectInventory row. Match the clicked component to that row and
   * reuse the common SerialCostDetails screen.
   */
  const normalizeCostMatchValue = (value) =>
    String(value ?? "")
      .trim()
      .toUpperCase();

  const getCostMatchValues = (row = {}) => {
    const component =
      row?.component &&
      typeof row.component === "object"
        ? row.component
        : {};

    return new Set(
      [
        row?.component,
        row?.component_id,
        row?.componentId,
        row?.component_code,
        row?.componentCode,
        row?.component_name,
        row?.componentName,
        row?.name,
        component?.id,
        component?.pk,
        component?.component_id,
        component?.component_code,
        component?.name,
      ]
        .filter(
          (value) =>
            value !== undefined &&
            value !== null &&
            typeof value !== "object" &&
            String(value).trim(),
        )
        .map(normalizeCostMatchValue),
    );
  };

  const isSameCostComponent = (
    left = {},
    right = {},
  ) => {
    const leftValues =
      getCostMatchValues(left);

    const rightValues =
      getCostMatchValues(right);

    for (const value of leftValues) {
      if (rightValues.has(value)) {
        return true;
      }
    }

    return false;
  };

  const isProjectRowForReturnable = (
    projectRow = {},
    group = {},
  ) => {
    const targetMr =
      normalizeCostMatchValue(
        group?.mrNumber,
      );

    if (!targetMr) {
      return true;
    }

    const references = [
      projectRow?.source_mr_number,
      projectRow?.sourceMrNumber,
      projectRow?.material_request_number,
      projectRow?.materialRequestNumber,
      projectRow?.material_request_id,
      projectRow?.materialRequestId,
      projectRow?.request_id,
      projectRow?.mr_id,
      projectRow?.material_request,
    ]
      .filter(
        (value) =>
          value !== undefined &&
          value !== null &&
          String(value).trim(),
      )
      .map(normalizeCostMatchValue);

    return references.includes(
      targetMr,
    );
  };

  const openReturnableComponentCost = (
    group,
    item,
  ) => {
    const matchingRows =
      projectInventoryRows.filter(
        (projectRow) =>
          isProjectRowForReturnable(
            projectRow,
            group,
          ) &&
          isSameCostComponent(
            projectRow,
            item,
          ),
      );

    /*
     * Prefer a ProjectInventory row that actually has issued/purchased
     * serial/cost information.
     */
    const costRow =
      matchingRows.find(
        (row) =>
          Number(
            row?.issued_purchased_quantity ??
              row?.issuedPurchasedQuantity ??
              0,
          ) > 0 ||
          Number(
            row?.purchased_quantity ??
              row?.purchasedQuantity ??
              0,
          ) > 0 ||
          Array.isArray(
            row?.cost_details,
          ) ||
          Array.isArray(
            row?.costDetails,
          ),
      ) ||
      matchingRows[0] ||
      null;

    if (!costRow) {
      alert(
        "Cost details are not available for this component yet. Please ensure the MR-linked Project Inventory / purchase cost data has loaded.",
      );
      return;
    }

    openCostDetails(
      "projectInventory",
      costRow,
    );
  };

  /*
   * SerialCostDetails is the same screen already used by Inventory.
   */
  if (costDetailsPage) {
    return costDetailsPage;
  }

  return (
    <PageShell>
      <PageHeader
        title="Returnable"
        subtitle="Track component and drone returnable workflows from request through return QC."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {PURPOSE_TABS.map(
          ([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                setActivePurpose(value)
              }
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                activePurpose ===
                value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ),
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-[0.9fr_0.85fr_0.95fr_0.62fr_0.58fr_0.68fr_0.68fr_1.45fr_1.05fr_0.78fr] bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {[
            ["mrNumber", "MR ID"],
            ["requester", "Requester"],
            ["project", "Project"],
            ["mode", "Mode"],
            ["droneQuantity", "Drone Qty"],
            ["requestedDate", "Request Date"],
            ["returnDate", "Return Date"],
            ["summary", "Components / Drone"],
            ["status", "Status"],
          ].map(([sortKey, label]) => (
            <button
              key={sortKey}
              type="button"
              onClick={() =>
                toggleReturnableSort(
                  sortKey,
                )
              }
              className={`flex items-center gap-1.5 text-left font-semibold uppercase tracking-wide transition hover:text-foreground ${
                sortKey ===
                "droneQuantity"
                  ? "justify-center text-center"
                  : ""
              }`}
              title={`Sort by ${label}`}
            >
              <span>{label}</span>
              <ReturnableSortIcon
                sortKey={sortKey}
              />
            </button>
          ))}

          <div className="text-center">
            Action
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[170px] items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="size-7 animate-spin text-primary" />
              <div>
                <div className="text-sm font-semibold">
                  Loading Returnable workflow...
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Checking MR, Inventory, Procurement, issue and return status.
                </div>
              </div>
            </div>
          </div>
        ) : loadError ? (
          <div className="px-6 py-10 text-center text-sm font-medium text-rose-700">
            {loadError}
          </div>
        ) : groups.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            No Returnable records found for {formatPurpose(activePurpose)}.
          </div>
        ) : (
          sortedGroups.map((group) => {
            /*
             * workflowStatus = authoritative backend workflow used by actions.
             * visibleStatus  = role-specific display status.
             *
             * For Engineer, visibleStatus freezes at RETURNED after hand-back.
             * For Inventory/Admin it continues to follow workflowStatus.
             */
            const workflowStatus =
              getGroupStatus(group);

            const visibleStatus =
              getVisibleGroupStatus(group);

            const summary =
              group.mode === "DRONE"
                ? "Existing In-Drone assembly"
                : group.items.length
                  ? group.items
                      .map(
                        (item) =>
                          `${getComponentLabel(
                            item,
                          )}-${Number(
                            item.quantity ||
                              0,
                          )}${
                            String(
                              item.uom ||
                                item.unit ||
                                "",
                            ).trim()
                              ? ` ${String(
                                  item.uom ||
                                    item.unit ||
                                    "",
                                ).trim()}`
                              : ""
                          }`,
                      )
                      .join(", ")
                  : "-";

            return (
              <div
                key={group.key}
                className="grid grid-cols-[0.9fr_0.85fr_0.95fr_0.62fr_0.58fr_0.68fr_0.68fr_1.45fr_1.05fr_0.78fr] items-center border-t border-border px-4 py-4 text-sm"
              >
                <div className="font-semibold">
                  {group.mrNumber}
                </div>

                <div>
                  {group.requester}
                </div>

                <div className="break-words pr-2 font-medium">
                  {group.project || "-"}
                </div>

                <div>
                  <span className="rounded-full border border-border bg-muted/30 px-2 py-1 text-xs font-semibold">
                    {group.mode ===
                    "DRONE"
                      ? "Drone"
                      : "Components"}
                  </span>
                </div>

                <div className="text-center">
                  {group.mode === "DRONE" ? (
                    <span className="inline-flex min-w-8 items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                      {Number(
                        group.droneQuantity ||
                          getDroneMovementQuantity(
                            group.items,
                          ) ||
                          0,
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      -
                    </span>
                  )}
                </div>

                <div>
                  {formatDate(
                    group.requestedDate,
                  )}
                </div>

                <div>
                  {formatDate(
                    group.returnDate,
                  )}
                </div>

                <div className="break-words text-xs leading-5">
                  {summary}
                </div>

                <div>
                  <span
                    className={`inline-flex max-w-[190px] items-center justify-center rounded-full border px-2.5 py-1 text-center text-[11px] font-semibold leading-4 ${getStatusClass(
                      visibleStatus,
                    )}`}
                  >
                    {getStatusLabel(
                      visibleStatus,
                    )}
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center gap-1.5">
                  {canEngineerMoveToReturn(
                    group,
                  ) && (
                    <button
                      type="button"
                      onClick={() =>
                        openMoveToReturn(
                          group,
                        )
                      }
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
                    >
                      Move to Return
                    </button>
                  )}

                  {canInventoryAction &&
                  workflowStatus ===
                    "RETURNED_QC_PENDING" ? (
                    <button
                      type="button"
                      disabled={
                        serialQcLoading
                      }
                      onClick={() =>
                        void openSerialQc(
                          group,
                        )
                      }
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50"
                    >
                      {serialQcLoading
                        ? "Loading..."
                        : "QC Check"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        void openDetailsWithSerials(
                          group,
                        )
                      }
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition hover:border-primary hover:text-primary"
                    >
                      View Details
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {moveReturnDialog && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="border-b border-border pb-4">
              <h2 className="text-xl font-semibold">
                Move to Return
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {moveReturnDialog.mrNumber}
                {" · "}
                {formatPurpose(
                  moveReturnDialog.purpose,
                )}
                {" · "}
                {moveReturnDialog.mode ===
                "DRONE"
                  ? "Drone"
                  : "Components"}
              </p>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  Return Date{" "}
                  <span className="text-rose-600">
                    *
                  </span>
                </label>

                <input
                  type="date"
                  max={getTodayIso()}
                  value={moveReturnDate}
                  onChange={(event) => {
                    setMoveReturnDate(
                      event.target.value,
                    );
                    setMoveReturnError("");
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  Remarks
                </label>

                <textarea
                  rows={4}
                  value={
                    moveReturnRemarks
                  }
                  onChange={(event) => {
                    setMoveReturnRemarks(
                      event.target.value,
                    );
                    setMoveReturnError("");
                  }}
                  placeholder="Enter return remarks"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
              </div>

              {moveReturnError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                  {moveReturnError}
                </div>
              )}

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                This hands the issued item back to Inventory. After submission, the Engineer status remains Returned and the Engineer workflow is complete. Inventory continues separately with QC Pending and all later QC / Manager / Procurement / Finance statuses.
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={
                  closeMoveToReturn
                }
                disabled={
                  moveReturnProcessing
                }
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() =>
                  void submitMoveToReturn()
                }
                disabled={
                  moveReturnProcessing ||
                  !moveReturnDate
                }
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {moveReturnProcessing
                  ? "Moving..."
                  : "Move to Return"}
              </button>
            </div>
          </div>
        </div>
      )}

      {details && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <h2 className="text-xl font-semibold">
                  Returnable Details
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  {details.mrNumber}
                  {" · "}
                  {formatPurpose(
                    details.purpose,
                  )}
                  {" · "}
                  {details.mode ===
                  "DRONE"
                    ? "Drone"
                    : "Components"}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setDetails(null)
                }
                className="rounded-lg border border-border px-3 py-1.5 text-sm"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border p-3">
                <div className="text-xs uppercase text-muted-foreground">
                  Workflow Status
                </div>

                <div className="mt-1 font-semibold">
                  {getStatusLabel(
                    getVisibleGroupStatus(
                      details,
                    ),
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border p-3">
                <div className="text-xs uppercase text-muted-foreground">
                  Requester
                </div>

                <div className="mt-1 font-semibold">
                  {details.requester}
                </div>
              </div>

              <div className="rounded-xl border border-border p-3">
                <div className="text-xs uppercase text-muted-foreground">
                  Returnable Date
                </div>

                <div className="mt-1 font-semibold">
                  {formatDate(
                    details.returnDate,
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border p-3">
                <div className="text-xs uppercase text-muted-foreground">
                  Project
                </div>

                <div className="mt-1 font-semibold">
                  {details.project ||
                    "-"}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-border p-4">
              <div className="text-xs uppercase text-muted-foreground">
                Remarks
              </div>

              <div className="mt-1 text-sm">
                {details.remarks ||
                  "-"}
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-border">
              <div className="grid grid-cols-[2fr_1fr_0.7fr_0.8fr] bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <div>Component</div>
                <div>Category</div>
                <div className="text-center">Qty</div>
                <div className="text-center">UOM</div>
              </div>

              {details.items.length ? (
                details.items.map(
                  (item) => {
                    const serials =
                      getItemSerials(
                        item,
                      );

                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-[2fr_1fr_0.7fr_0.8fr] items-center border-t border-border px-4 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              openReturnableComponentCost(
                                details,
                                item,
                              )
                            }
                            className="max-w-full break-words text-left font-semibold text-primary underline-offset-4 transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            title="Click to view serial numbers and cost details"
                          >
                            {getComponentLabel(
                              item,
                            )}
                          </button>

                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {serials.length
                              ? `${serials.length} tracked serial(s) · Click component for serial-wise cost`
                              : "Click component for available cost details"}
                          </div>
                        </div>

                        <div className="break-words">
                          {item.component_category ||
                            item.component_type ||
                            item.category ||
                            "-"}
                        </div>

                        <div className="text-center font-semibold">
                          {Number(
                            item.quantity ||
                              0,
                          )}
                        </div>

                        <div className="text-center">
                          {item.uom ||
                            item.unit ||
                            "-"}
                        </div>
                      </div>
                    );
                  },
                )
              ) : (
                <div className="border-t border-border px-4 py-5 text-sm text-muted-foreground">
                  Component details will appear after issue.
                </div>
              )}
            </div>

            {details.items.some((item) => {
              const metadataRows = Array.isArray(
                item?.inventory_issue_details,
              )
                ? item.inventory_issue_details
                : item?.inventory_issue_details &&
                    typeof item.inventory_issue_details === "object"
                  ? [item.inventory_issue_details]
                  : [];

              return metadataRows.some(
                (metadata) =>
                  Array.isArray(
                    metadata?.return_qc_items,
                  ) &&
                  metadata.return_qc_items.length >
                    0,
              );
            }) && (
              <div className="mt-5 overflow-hidden rounded-xl border border-border">
                <div className="bg-muted/40 px-4 py-3">
                  <div className="text-sm font-semibold">
                    Serial QC History
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Exact QC result recorded by Inventory for each returned serial/component unit.
                  </div>
                </div>

                <div className="grid grid-cols-[1.5fr_1.1fr_0.8fr_1.8fr] bg-muted/20 px-4 py-2.5 text-xs font-semibold uppercase text-muted-foreground">
                  <div>Component</div>
                  <div>Serial Number</div>
                  <div>QC Result</div>
                  <div>Remarks</div>
                </div>

                {details.items.flatMap(
                  (item) => {
                    const metadataRows =
                      Array.isArray(
                        item?.inventory_issue_details,
                      )
                        ? item.inventory_issue_details
                        : item?.inventory_issue_details &&
                            typeof item.inventory_issue_details === "object"
                          ? [
                              item.inventory_issue_details,
                            ]
                          : [];

                    const qcItems =
                      metadataRows.flatMap(
                        (metadata) =>
                          Array.isArray(
                            metadata?.return_qc_items,
                          )
                            ? metadata.return_qc_items
                            : [],
                      );

                    return qcItems.map(
                      (qcItem, index) => {
                        const condition =
                          normalizeStatus(
                            qcItem?.condition,
                          );

                        return (
                          <div
                            key={`${item.id}-qc-${index}`}
                            className="grid grid-cols-[1.5fr_1.1fr_0.8fr_1.8fr] items-center gap-3 border-t border-border px-4 py-3 text-sm"
                          >
                            <div className="font-medium">
                              {getComponentLabel(
                                item,
                              )}
                            </div>

                            <div className="font-mono text-xs font-semibold">
                              {String(
                                qcItem?.serial_number ||
                                  "",
                              ).trim() ||
                                `Unit ${
                                  qcItem?.unit_index ||
                                  index + 1
                                }`}
                            </div>

                            <div>
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                  condition === "OK"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-rose-200 bg-rose-50 text-rose-700"
                                }`}
                              >
                                {condition === "OK"
                                  ? "OK"
                                  : "NOT OK"}
                              </span>
                            </div>

                            <div className="text-sm">
                              {qcItem?.remarks ||
                                "-"}
                            </div>
                          </div>
                        );
                      },
                    );
                  },
                )}
              </div>
            )}

            {canEngineerMoveToReturn(
              details,
            ) && (
              <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="font-semibold">
                  Ready to Return
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Inventory has issued this Returnable item. Engineer/Admin can now move it back to Inventory Returned.
                </p>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setDetails(null);
                      openMoveToReturn(
                        details,
                      );
                    }}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    Move to Return
                  </button>
                </div>
              </div>
            )}

            {canIssueDrone(
              details,
            ) && (
              <div className="mt-6 rounded-xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-900 dark:bg-cyan-950/20">
                <div className="font-semibold text-cyan-900 dark:text-cyan-200">
                  Inventory Issue Required
                </div>

                <p className="mt-1 text-sm text-cyan-800 dark:text-cyan-300">
                  Manager has approved this existing drone usage. Issue the drone to Engineer now.
                </p>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={
                      processing
                    }
                    onClick={() =>
                      void issueDrone(
                        details,
                      )
                    }
                    className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {processing
                      ? "Issuing..."
                      : "Issue Drone"}
                  </button>
                </div>
              </div>
            )}

            {canPerformReturnQc(
              details,
            ) && (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                <div className="font-semibold text-amber-900 dark:text-amber-200">
                  Returned - Inventory QC Required
                </div>

                <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                  Check every returned serial number individually. Each serial must be marked PASS or FAIL. PASS automatically adds QC OK. FAIL requires remarks.
                </p>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={
                      serialQcLoading
                    }
                    onClick={() => {
                      setDetails(null);
                      void openSerialQc(
                        details,
                      );
                    }}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {serialQcLoading
                      ? "Loading..."
                      : "QC Check"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {serialQcDialog && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <h2 className="text-xl font-semibold">
                  Return QC Check
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  {serialQcDialog.mrNumber}
                  {" · "}
                  {formatPurpose(
                    serialQcDialog.purpose,
                  )}
                  {" · "}
                  {serialQcDialog.mode ===
                  "DRONE"
                    ? "Drone"
                    : "Components"}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeSerialQc
                }
                disabled={
                  serialQcLoading
                }
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">
                    Returned By
                  </div>
                  <div className="mt-1 font-semibold">
                    {serialQcDialog.requester ||
                      "-"}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase text-muted-foreground">
                    Return Date
                  </div>
                  <div className="mt-1 font-semibold">
                    {formatDate(
                      serialQcDialog.returnDate,
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase text-muted-foreground">
                    Status
                  </div>
                  <div className="mt-1 font-semibold text-amber-700">
                    Returned - QC Pending
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Apply QC Result to All
                  </div>

                  <div className="mt-1 text-xs text-muted-foreground">
                    PASS ALL marks every serial as PASS and automatically fills Remarks as
                    <strong> QC OK</strong>. FAIL ALL marks every serial as FAIL; remarks are mandatory before submission.
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                      allSerialQcPassed
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-500"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={
                        allSerialQcPassed
                      }
                      onChange={(event) => {
                        if (
                          event.target.checked
                        ) {
                          applyQcResultToAll(
                            "OK",
                          );
                        } else {
                          clearQcResultFromAll(
                            "OK",
                          );
                        }
                      }}
                      className="size-4"
                    />

                    PASS ALL
                  </label>

                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                      allSerialQcFailed
                        ? "border-rose-600 bg-rose-600 text-white"
                        : "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-500"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={
                        allSerialQcFailed
                      }
                      onChange={(event) => {
                        if (
                          event.target.checked
                        ) {
                          applyQcResultToAll(
                            "NOT_OK",
                          );
                        } else {
                          clearQcResultFromAll(
                            "NOT_OK",
                          );
                        }
                      }}
                      className="size-4"
                    />

                    FAIL ALL
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-border">
              <div className="grid grid-cols-[1.55fr_1.1fr_1.2fr_2fr] bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <div>Component</div>
                <div>Serial Number</div>
                <div>QC Result</div>
                <div>Remarks</div>
              </div>

              {serialQcRows.map(
                (row) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-[1.55fr_1.1fr_1.2fr_2fr] items-center gap-3 border-t border-border px-4 py-3 text-sm"
                  >
                    <div className="font-medium">
                      {row.component_label}
                    </div>

                    <div>
                      {row.serial_number ? (
                        <span className="inline-flex rounded-md border border-border bg-background px-2 py-1 font-mono text-xs font-semibold">
                          {row.serial_number}
                        </span>
                      ) : (
                        <div>
                          <span className="text-xs font-semibold text-rose-700">
                            Serial not recorded
                          </span>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            Unit {row.unit_index}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          row.condition === "OK"
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-500"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={
                            row.condition ===
                            "OK"
                          }
                          onChange={(event) => {
                            if (
                              event.target.checked
                            ) {
                              updateSerialQcRow(
                                row.key,
                                "condition",
                                "OK",
                              );
                            } else {
                              setSerialQcRows(
                                (previous) =>
                                  previous.map(
                                    (item) =>
                                      item.key ===
                                      row.key
                                        ? {
                                            ...item,
                                            condition:
                                              "",
                                            remarks:
                                              "",
                                          }
                                        : item,
                                  ),
                              );

                              setSerialQcError(
                                "",
                              );
                            }
                          }}
                          className="size-4"
                        />
                        PASS
                      </label>

                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          row.condition === "NOT_OK"
                            ? "border-rose-600 bg-rose-600 text-white"
                            : "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-500"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={
                            row.condition ===
                            "NOT_OK"
                          }
                          onChange={(event) => {
                            if (
                              event.target.checked
                            ) {
                              updateSerialQcRow(
                                row.key,
                                "condition",
                                "NOT_OK",
                              );
                            } else {
                              setSerialQcRows(
                                (previous) =>
                                  previous.map(
                                    (item) =>
                                      item.key ===
                                      row.key
                                        ? {
                                            ...item,
                                            condition:
                                              "",
                                            remarks:
                                              "",
                                          }
                                        : item,
                                  ),
                              );

                              setSerialQcError(
                                "",
                              );
                            }
                          }}
                          className="size-4"
                        />
                        FAIL
                      </label>
                    </div>

                    <div>
                      {row.condition ===
                        "NOT_OK" && (
                        <div className="mb-1 text-[11px] font-semibold text-rose-600">
                          Remarks *
                        </div>
                      )}

                      <input
                        type="text"
                        value={
                          row.remarks
                        }
                        onChange={(event) =>
                          updateSerialQcRow(
                            row.key,
                            "remarks",
                            event.target.value,
                          )
                        }
                        disabled={
                          row.condition ===
                            "OK" ||
                          !row.condition
                        }
                        required={
                          row.condition ===
                          "NOT_OK"
                        }
                        placeholder={
                          row.condition ===
                          "NOT_OK"
                            ? "Enter failure remarks (required)"
                            : row.condition ===
                                "OK"
                              ? "QC OK"
                              : "Select PASS or FAIL first"
                        }
                        className={`w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground ${
                          row.condition ===
                            "NOT_OK" &&
                          !String(
                            row.remarks || "",
                          ).trim()
                            ? "border-rose-400 focus:border-rose-600"
                            : "border-border focus:border-primary"
                        }`}
                      />
                    </div>
                  </div>
                ),
              )}
            </div>

            {serialQcRows.some(
              (row) =>
                !row.serial_number,
            ) && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                Some historical units do not have an issued serial saved. The backend automatically tries to recover the exact issued serials from Project Inventory when QC opens. No fake serial number is created.
              </div>
            )}

            {serialQcError && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">
                {serialQcError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                All serials/components must have PASS or FAIL selected. Remarks are mandatory for every FAIL.
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={
                    closeSerialQc
                  }
                  disabled={
                    serialQcLoading
                  }
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void submitSerialQc()
                  }
                  disabled={
                    serialQcLoading
                  }
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {serialQcLoading
                    ? "Submitting..."
                    : "Submit QC"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {qcFailureDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  Return QC Failed
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  {qcFailureDialog.mrNumber}
                  {" · "}
                  {formatPurpose(
                    qcFailureDialog.purpose,
                  )}
                </p>
              </div>

              <button
                type="button"
                disabled={
                  processing
                }
                onClick={() =>
                  setQcFailureDialog(
                    null,
                  )
                }
                className="rounded-lg border border-border px-3 py-1.5 text-sm"
              >
                Close
              </button>
            </div>

            {qcFailureDialog.mode ===
              "DRONE" && (
              <div className="mt-5">
                <div className="font-semibold">
                  Review Drone Components
                </div>

                <p className="mt-1 text-sm text-muted-foreground">
                  Mark every reusable serial as <strong>Good</strong>. Any unselected serial will be submitted as <strong>Bad / Scrap</strong>.
                </p>

                <div className="mt-4 space-y-3">
                  {qcFailureDialog.items.map(
                    (item) => {
                      const serials =
                        getItemSerials(
                          item,
                        );

                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border border-border p-4"
                        >
                          <div className="font-semibold">
                            {getComponentLabel(
                              item,
                            )}
                          </div>

                          {serials.length ? (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {serials.map(
                                (serial) => {
                                  const key =
                                    `${item.id}::${serial}`;

                                  const checked =
                                    goodSerialKeys.includes(
                                      key,
                                    );

                                  return (
                                    <label
                                      key={key}
                                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                                        checked
                                          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20"
                                          : "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/20"
                                      }`}
                                    >
                                      <span className="break-all font-medium">
                                        {serial}
                                      </span>

                                      <span className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={
                                            checked
                                          }
                                          onChange={() =>
                                            toggleGoodSerial(
                                              item.id,
                                              serial,
                                            )
                                          }
                                        />

                                        <span
                                          className={
                                            checked
                                              ? "text-emerald-700"
                                              : "text-rose-700"
                                          }
                                        >
                                          {checked
                                            ? "Good"
                                            : "Bad"}
                                        </span>
                                      </span>
                                    </label>
                                  );
                                },
                              )}
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-muted-foreground">
                              No tracked serial numbers. This component quantity will be treated as Bad.
                            </div>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            )}

            {qcFailureDialog.mode ===
              "COMPONENTS" && (
              <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">
                All returned component quantities in this request will be treated as QC Failed and sent to Manager approval.
              </div>
            )}

            <div className="mt-5">
              <label className="mb-1.5 block text-sm font-semibold">
                QC Failure Reason
                <span className="text-rose-600">
                  {" "}*
                </span>
              </label>

              <textarea
                rows={4}
                value={
                  qcFailureReason
                }
                onChange={(event) =>
                  setQcFailureReason(
                    event.target.value,
                  )
                }
                placeholder="Describe the damage / QC failure..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={
                  processing
                }
                onClick={() =>
                  setQcFailureDialog(
                    null,
                  )
                }
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  processing ||
                  !qcFailureReason.trim()
                }
                onClick={() =>
                  void submitQcFailure()
                }
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {processing
                  ? "Submitting..."
                  : "Submit QC Failed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
