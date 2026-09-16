import { useCostDetails } from "@/components/app/SerialCostDetails";
import { useEffect, useState } from "react";
// Material Requests page, including From Scrap source project/BOM resolution.
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { DataTable } from "@/components/app/DataTable";
import { PaginationControls } from "@/components/app/PaginationControls";
import { Loader2, Plus } from "lucide-react";
import API, { fetchAuthenticatedJson } from "@/api";
import config from "@/config";
import { useAuth } from "@/AuthContext";
import { canViewCosting, canWork } from "@/permissions";

const MATERIAL_REQUESTS_PAGE_SIZE = 50;

const fetchAllPaginatedResults = async (
  initialUrl,
  options = {},
) => {
  const rows = [];
  const visitedUrls = new Set();
  let nextUrl = initialUrl;

  for (let pageIndex = 0; nextUrl && pageIndex < 100; pageIndex += 1) {
    if (visitedUrls.has(nextUrl)) {
      break;
    }

    visitedUrls.add(nextUrl);

    const payload = await fetchAuthenticatedJson(nextUrl, options);

    if (Array.isArray(payload)) {
      rows.push(...payload);
      break;
    }

    const pageRows = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.items)
        ? payload.items
        : [];

    rows.push(...pageRows);
    nextUrl = payload?.next || "";
  }

  return rows;
};


const MR_STATUS_PRESENTATION = {
  PENDING: {
    statusLabel: "Pending",
    statusClass:
      "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
    actionLabel: "Request Manager Approval",
    actionClass:
      "border-indigo-600 bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 dark:border-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600",
  },
  REQUESTED: {
    statusLabel: "Requested",
    statusClass:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
    actionLabel: "Request Manager Approval",
    actionClass:
      "border-indigo-600 bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 dark:border-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600",
  },
  PENDING_MANAGER: {
    statusLabel: "Pending Manager",
    statusClass:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    actionLabel: "Pending Manager",
    actionClass:
      "border-amber-600 bg-amber-600 text-white dark:border-amber-500 dark:bg-amber-500",
  },
  MANAGER_APPROVED: {
    statusLabel: "Manager Approved",
    statusClass:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    actionLabel: "Manager Approved",
    actionClass:
      "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500",
  },
  MANAGER_REJECTED: {
    statusLabel: "Manager Rejected",
    statusClass:
      "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
    actionLabel: "Manager Rejected",
    actionClass:
      "border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-500",
  },
  PROCUREMENT_PENDING: {
    statusLabel: "Procurement Pending",
    statusClass:
      "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
    actionLabel: "Sent to Procurement",
    actionClass:
      "border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500",
  },
  INVENTORY_PENDING: {
    statusLabel: "Inventory Check",
    statusClass:
      "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300",
    actionLabel: "Sent to Inventory",
    actionClass:
      "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-500 dark:bg-cyan-500",
  },
  PO_RAISED: {
    statusLabel: "PO Raised",
    statusClass:
      "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
    actionLabel: "PO Raised",
    actionClass:
      "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500",
  },
  PARTIALLY_DELIVERED: {
    statusLabel: "Partially Delivered",
    statusClass:
      "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
    actionLabel: "Partially Delivered",
    actionClass:
      "border-orange-600 bg-orange-600 text-white dark:border-orange-500 dark:bg-orange-500",
  },
  PO_DELIVERED: {
    statusLabel: "PO Delivered",
    statusClass:
      "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300",
    actionLabel: "PO Delivered",
    actionClass:
      "border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500",
  },
  QC_FAILED_ACTION_REQUIRED: {
    statusLabel: "QC Failed - Action Required",
    statusClass:
      "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
    actionLabel: "Choose Replacement or Return",
    actionClass:
      "border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-500",
  },
  AWAITING_REPLACEMENT_APPROVAL: {
    statusLabel: "Awaiting Replacement Approval",
    statusClass:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    actionLabel: "Replacement Approval Pending",
    actionClass:
      "border-amber-600 bg-amber-600 text-white dark:border-amber-500 dark:bg-amber-500",
  },
  REPLACEMENT_APPROVAL_REJECTED: {
    statusLabel: "Replacement Approval Rejected",
    statusClass:
      "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
    actionLabel: "Replacement Rejected",
    actionClass:
      "border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-500",
  },
  REPLACEMENT_APPROVED: {
    statusLabel: "Replacement Approved",
    statusClass:
      "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
    actionLabel: "Awaiting Replacement Order",
    actionClass:
      "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500",
  },
  AWAITING_REPLACEMENT_DELIVERY: {
    statusLabel: "Awaiting Replacement Delivery",
    statusClass:
      "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
    actionLabel: "Replacement Ordered",
    actionClass:
      "border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500",
  },
  REPLACEMENT_PARTIALLY_RECEIVED: {
    statusLabel: "Replacement Partially Received",
    statusClass:
      "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
    actionLabel: "Awaiting Remaining Replacement",
    actionClass:
      "border-orange-600 bg-orange-600 text-white dark:border-orange-500 dark:bg-orange-500",
  },
  REPLACEMENT_RECEIVED: {
    statusLabel: "Replacement Received - QC Pending",
    statusClass:
      "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300",
    actionLabel: "Replacement QC Pending",
    actionClass:
      "border-teal-600 bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-500",
  },
  QC_CHECKED: {
    statusLabel: "QC Checked",
    statusClass:
      "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300",
    actionLabel: "QC Passed",
    actionClass:
      "border-teal-600 bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-500",
  },
  PROJECT_INVENTORY_READY: {
    statusLabel: "Project Inventory Ready",
    statusClass:
      "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    actionLabel: "Project Inventory Ready",
    actionClass:
      "border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500",
  },
  INVENTORY_ISSUED: {
    statusLabel: "Inventory Issued",
    statusClass:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    actionLabel: "Inventory Issued",
    actionClass:
      "border-emerald-700 bg-emerald-700 text-white dark:border-emerald-600 dark:bg-emerald-600",
  },
  MR_COMPLETED: {
    statusLabel: "MR Completed",
    statusClass:
      "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300",
    actionLabel: "MR Completed",
    actionClass:
      "border-green-700 bg-green-700 text-white dark:border-green-600 dark:bg-green-600",
  },
  APPROVED: {
    statusLabel: "Approved",
    statusClass:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    actionLabel: "Approved",
    actionClass:
      "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500",
  },
  ORDERED: {
    statusLabel: "Ordered",
    statusClass:
      "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
    actionLabel: "Ordered",
    actionClass:
      "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500",
  },
  DELIVERED: {
    statusLabel: "PO Delivered",
    statusClass:
      "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300",
    actionLabel: "PO Delivered",
    actionClass:
      "border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500",
  },
};

const DEFAULT_MR_STATUS_PRESENTATION = {
  statusLabel: "Pending",
  statusClass:
    "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  actionLabel: "Pending",
  actionClass:
    "border-slate-500 bg-slate-600 text-white dark:border-slate-600 dark:bg-slate-700",
};

const getMrStatusPresentation = (status) => {
  const normalizedStatus = String(status ?? "")
    .trim()
    .toUpperCase();

  return (
    MR_STATUS_PRESENTATION[normalizedStatus] || {
      ...DEFAULT_MR_STATUS_PRESENTATION,
      statusLabel: normalizedStatus
        ? normalizedStatus.replaceAll("_", " ")
        : DEFAULT_MR_STATUS_PRESENTATION.statusLabel,
      actionLabel: normalizedStatus
        ? normalizedStatus.replaceAll("_", " ")
        : DEFAULT_MR_STATUS_PRESENTATION.actionLabel,
    }
  );
};

const cleanRequesterDisplayName = (
  value,
) => {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  if (
    typeof value === "object"
  ) {
    return "";
  }

  let raw = String(value).trim();

  if (!raw) {
    return "";
  }

  /*
   * Same display rule used by Finance Scrap:
   *
   * naveen.r@aero360.co.in -> Naveen
   * naveen.r                -> Naveen
   *
   * Actual employee/display names such as "Naveen Kumar"
   * remain unchanged.
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

const getRequesterDisplayName = (
  request = {},
) => {
  const requesterObject =
    (
      request?.requester &&
      typeof request.requester ===
        "object"
    )
      ? request.requester
      : request?.requester_details ||
        request?.requesterDetails ||
        {};

  const candidates = [
    requesterObject?.employee_name,
    requesterObject?.employeeName,
    requesterObject?.full_name,
    requesterObject?.fullName,
    requesterObject?.name,
    [
      requesterObject?.first_name,
      requesterObject?.last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim(),

    request?.requester_display_name,
    request?.requesterDisplayName,
    request?.employee_name,
    request?.employeeName,
    request?.requested_by_name,
    request?.requestedByName,
    request?.requester_name,
    request?.requesterName,
    request?.requested_by,
    request?.requestedBy,
    request?.requester,
  ];

  for (const candidate of candidates) {
    const displayName =
      cleanRequesterDisplayName(
        candidate
      );

    if (displayName) {
      return displayName;
    }
  }

  return "-";
};


const isReturnableQcReorderRequest = (request = {}) => {
  const remarks = String(
    request?.remarks || "",
  )
    .trim()
    .toUpperCase();

  return remarks.includes(
    "RETURNABLE_QC_REORDER",
  );
};

const getReturnableQcReorderSourceMr = (
  request = {},
) => {
  const remarks = String(
    request?.remarks || "",
  );

  const match = remarks.match(
    /SOURCE_MR\s*:\s*(MR-[A-Za-z0-9_-]+)/i,
  );

  if (match?.[1]) {
    return String(match[1]).trim();
  }

  const mrNumber = String(
    request?.material_request_id ||
      request?.request_id ||
      "",
  ).trim();

  return mrNumber.replace(
    /_(PR|FR)$/i,
    "",
  );
};

const getReturnableQcReorderType = (
  request = {},
) => {
  const mrNumber = String(
    request?.material_request_id ||
      request?.request_id ||
      "",
  )
    .trim()
    .toUpperCase();

  if (mrNumber.endsWith("_FR")) {
    return "FR";
  }

  if (mrNumber.endsWith("_PR")) {
    return "PR";
  }

  const remarks = String(
    request?.remarks || "",
  ).toUpperCase();

  const match = remarks.match(
    /REORDER_TYPE\s*:\s*(PR|FR)/,
  );

  return match?.[1] || "";
};

const getReturnableQcReorderLabel = (
  request = {},
) =>
  getReturnableQcReorderType(request) ===
  "FR"
    ? "Fully Reordered"
    : "Partially Reordered";

const isFromScrapRequest = (request = {}) => {
  // PR/FR is also used by Returnable Drone QC reorder tracking.
  // Do not classify those rows as Engineer From-Scrap MRs.
  if (isReturnableQcReorderRequest(request)) {
    return false;
  }

  const requestType = String(
    request?.request_type ||
      request?.requestType ||
      ""
  )
    .trim()
    .toUpperCase();

  const requestNumber = String(
    request?.material_request_id ||
      request?.request_id ||
      ""
  )
    .trim()
    .toUpperCase();

  if (
    requestType === "SCRAP" ||
    requestNumber.endsWith("_FR") ||
    requestNumber.endsWith("_PR") ||
    requestNumber.endsWith("_FS")
  ) {
    return true;
  }

  // Backward compatibility for derived MRs already created by the
  // previous backend, where request_type was copied as BOM/R&D.
  const remarks = String(
    request?.remarks || ""
  )
    .trim()
    .toLowerCase();

  return (
    remarks.includes(
      "automatically recreated from scrap"
    ) ||
    remarks.includes(
      "automatically created from scrap"
    )
  );
};


const normalizeMrReference = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const getFromScrapSourceMrNumber = (
  request = {},
  sourceMetadata = {},
) => {
  const directCandidates = [
    request?.from_scrap_source_mr_number,
    request?.source_mr_number,
    request?.sourceMrNumber,
    request?.original_mr_number,
    request?.originalMrNumber,
    sourceMetadata?.source_mr_number,
    sourceMetadata?.sourceMrNumber,
  ];

  for (const candidate of directCandidates) {
    const value = String(
      candidate || "",
    ).trim();

    if (value) {
      return value;
    }
  }

  const requestItems = [
    ...(Array.isArray(request?.bom_items)
      ? request.bom_items
      : []),
    ...(Array.isArray(request?.rd_items)
      ? request.rd_items
      : []),
    ...(Array.isArray(request?.request_items)
      ? request.request_items
      : []),
    ...(Array.isArray(request?.items)
      ? request.items
      : []),
  ];

  const searchableText = [
    request?.remarks,
    ...requestItems.map(
      (item) => item?.remarks,
    ),
  ]
    .filter(Boolean)
    .join("\n");

  const patterns = [
    /SOURCE_MR\s*:\s*(MR-[A-Za-z0-9_-]+)/i,
    /Original\s+MR\s*:\s*(MR-[A-Za-z0-9_-]+)/i,
    /From\s+Scrap\s+for\s+(MR-[A-Za-z0-9_-]+)/i,
    /Automatically\s+(?:created|recreated)\s+From\s+Scrap\s+for\s+(MR-[A-Za-z0-9_-]+)/i,
  ];

  for (const pattern of patterns) {
    const match =
      searchableText.match(pattern);

    if (match?.[1]) {
      return String(
        match[1],
      ).trim();
    }
  }

  return "";
};

const getProjectDisplayValue = (
  value,
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "";
  }

  if (
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return String(
      value?.name ||
        value?.project_name ||
        value?.projectName ||
        value?.project_code ||
        value?.projectCode ||
        value?.code ||
        "",
    ).trim();
  }

  return String(value).trim();
};

const firstNonEmptyValue = (...values) =>
  values.find((value) => {
    if (value === undefined || value === null) return false;

    if (typeof value === "object" && !Array.isArray(value)) {
      return Boolean(getProjectDisplayValue(value));
    }

    return String(value).trim() !== "";
  });

const getFromScrapRowProject = (
  request = {},
) =>
  getProjectDisplayValue(
    firstNonEmptyValue(
      request?.from_scrap_source_project,
      request?.source_project_name,
      request?.sourceProjectName,
      request?.project_name,
      request?.projectName,
      request?.project,
    ),
  ) || "-";

const getFromScrapRowDroneQty = (
  request = {},
) => {
  const value = Number(
    request?.from_scrap_source_drone_quantity ??
      request?.source_drone_quantity ??
      request?.sourceDroneQuantity ??
      request?.required_quantity ??
      request?.drone_quantity ??
      request?.droneQuantity ??
      0,
  );

  return Number.isFinite(value) &&
    value > 0
    ? value
    : "-";
};

const parseFromScrapSerials = (item = {}) => {
  const direct =
    item?.scrap_serial_numbers ||
    item?.selected_serial_numbers ||
    item?.serial_numbers ||
    item?.serialNumbers;

  if (Array.isArray(direct)) {
    return Array.from(
      new Set(
        direct
          .map((value) =>
            String(value || "").trim()
          )
          .filter(Boolean)
      )
    );
  }

  const remarks = String(
    item?.remarks || ""
  );

  const marker =
    "FROM_SCRAP_SERIALS:";

  const markerIndex =
    remarks.indexOf(marker);

  if (markerIndex < 0) {
    return [];
  }

  const serialText = remarks
    .slice(
      markerIndex +
        marker.length
    )
    .split("\n")[0]
    .trim();

  return Array.from(
    new Set(
      serialText
        .split(/[|,;]/)
        .map((value) =>
          value.trim()
        )
        .filter(Boolean)
    )
  );
};

function MaterialRequestsPage() {
  const { openCostDetails, costDetailsPage } = useCostDetails();

  const { user, activeRole } = useAuth();

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

  const canSeeCosting = canViewCosting(user, activeRole);

  // Only Engineer can hand an issued Returnable item/drone back to Inventory.
  // Admin can view the workflow but must not see the Engineer return action.
  const canReturnIssuedReturnable =
    role === "engineer";

  // Existing Sidebar/module access decides who can SEE MR.
  // Only Admin + Engineer can CREATE / DELETE / CHANGE MR data.
  const canManageMR =
    canWork(user, "material-request");
  const canAdministerMR =
    canManageMR && role !== "engineer";

  const [rows, setRows] = useState([]);
  const [materialRequestsPage, setMaterialRequestsPage] = useState(1);
  const [materialRequestsTotalCount, setMaterialRequestsTotalCount] =
    useState(0);
  const [materialRequestsHasNextPage, setMaterialRequestsHasNextPage] =
    useState(false);
  const [materialRequestsHasPreviousPage, setMaterialRequestsHasPreviousPage] =
    useState(false);
  const [materialRequestsOrdering, setMaterialRequestsOrdering] =
    useState("-date");
  const [materialRequestsColumnFilters, setMaterialRequestsColumnFilters] =
    useState({});
  const [debouncedMaterialRequestsColumnFilters, setDebouncedMaterialRequestsColumnFilters] =
    useState({});
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBOM, setSelectedBOM] = useState(null);
  const [showBomModal, setShowBomModal] = useState(false);
  const [bomDetails, setBomDetails] = useState(null);
  const [rdDetails, setRdDetails] = useState(null);

  // Dedicated FROM-SCRAP MR popup.
  const [showScrapMrModal, setShowScrapMrModal] = useState(false);
  const [scrapMrDetails, setScrapMrDetails] = useState(null);
  const [scrapMrLoading, setScrapMrLoading] = useState(false);

  const [bomMap, setBomMap] = useState({});
  const [componentsMap, setComponentsMap] = useState({});
  const [inventoryCounts, setInventoryCounts] = useState({});
  const [projectInventoryCounts, setProjectInventoryCounts] = useState({});
  const [projectInventoryDetails, setProjectInventoryDetails] = useState({});
  const [projectInventoryLoading, setProjectInventoryLoading] = useState(false);

  const [approvalRequestedIds, setApprovalRequestedIds] = useState([]);

  // Same-MR Returnable usage that has been issued to Engineer and has not
  // yet been moved back to Inventory.
  const [
    engineerReturnUsageByMr,
    setEngineerReturnUsageByMr,
  ] = useState({});

  const [
    returningUsageId,
    setReturningUsageId,
  ] = useState("");
  const [engineerReturnDialog, setEngineerReturnDialog] = useState({
    open: false,
    usage: null,
    returnDate: new Date().toISOString().slice(0, 10),
    remarks: "",
    error: "",
  });
  const [showRejectPopup, setShowRejectPopup] = useState(false);
  const [rejectPopup, setRejectPopup] = useState({
    reason: "",
    rejectedBy: "",
    status: "",
    title: "",
  });
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMaterialRequestsPage(1);
      setDebouncedMaterialRequestsColumnFilters(
        materialRequestsColumnFilters,
      );
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [materialRequestsColumnFilters]);

  const handleMaterialRequestsSortChange = ({
    key,
    direction,
  } = {}) => {
    setMaterialRequestsPage(1);

    if (!key || !direction) {
      setMaterialRequestsOrdering("");
      return;
    }

    setMaterialRequestsOrdering(
      direction === "desc" ? `-${key}` : key,
    );
  };

  const handleMaterialRequestsFilterChange = (nextFilters = {}) => {
    setMaterialRequestsColumnFilters(nextFilters || {});
  };

  const normalizeMatchKey = (value) => String(value ?? "").trim().toLowerCase();

  const getVisibleApprovalStatus = (row) => {
    const workflowStatus = String(row?.status || "")
      .trim()
      .toUpperCase();

    const approvalStatus = String(row?.approval_status || "")
      .trim()
      .toUpperCase();

    /*
     * The MR workflow status must take priority after Manager approval.
     * approval_status normally remains MANAGER_APPROVED while the MR moves
     * through PO, delivery, QC and Project Inventory.
     */
    const downstreamStatuses = [
      "PROCUREMENT_PENDING",
      "INVENTORY_PENDING",
      "PO_RAISED",
      "PARTIALLY_DELIVERED",
      "PO_DELIVERED",
      "QC_FAILED_ACTION_REQUIRED",
      "AWAITING_REPLACEMENT_APPROVAL",
      "REPLACEMENT_APPROVAL_REJECTED",
      "REPLACEMENT_APPROVED",
      "AWAITING_REPLACEMENT_DELIVERY",
      "REPLACEMENT_PARTIALLY_RECEIVED",
      "REPLACEMENT_RECEIVED",
      "QC_CHECKED",
      "PROJECT_INVENTORY_READY",
      "INVENTORY_ISSUED",
      "MR_COMPLETED",
    ];

    if (downstreamStatuses.includes(workflowStatus)) {
      return workflowStatus;
    }

    // Temporary support for records created with the old status name.
    if (workflowStatus === "ORDER_DELIVERED") {
      return "PO_DELIVERED";
    }

    if (
      workflowStatus === "MANAGER_REJECTED" ||
      workflowStatus === "REJECTED" ||
      approvalStatus === "MANAGER_REJECTED" ||
      approvalStatus === "REJECTED"
    ) {
      return "MANAGER_REJECTED";
    }

    if (
      workflowStatus === "PENDING_MANAGER" ||
      approvalStatus === "PENDING_MANAGER"
    ) {
      return "PENDING_MANAGER";
    }

    if (
      workflowStatus === "MANAGER_APPROVED" ||
      approvalStatus === "MANAGER_APPROVED"
    ) {
      return "MANAGER_APPROVED";
    }

    if (
      workflowStatus === "APPROVED" ||
      approvalStatus === "APPROVED"
    ) {
      return "APPROVED";
    }

    if (workflowStatus === "ORDERED") {
      return "ORDERED";
    }

    if (
      approvalStatus === "NOT_REQUESTED" ||
      workflowStatus === "NOT_REQUESTED"
    ) {
      return "PENDING";
    }

    if (
      approvalStatus === "REQUESTED" ||
      workflowStatus === "REQUESTED"
    ) {
      return "REQUESTED";
    }

    if (
      approvalStatus === "PENDING" ||
      workflowStatus === "PENDING"
    ) {
      return "PENDING";
    }

    return workflowStatus || approvalStatus || "PENDING";
  };

  const addInventoryMatchValue = (
    keySet,
    value,
  ) => {
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
        value.component_id_display,
        value.component_code_display,
        value.code,
        value.inventory_code,
        value.name,
        value.component_name,
        value.componentName,
        value.product_name,
        value.productName,
        value.label,
        value.component_label,
        value.componentLabel,
      ].forEach((candidate) =>
        addInventoryMatchValue(
          keySet,
          candidate,
        ),
      );

      return;
    }

    const textValue = String(value).trim();

    if (!textValue) {
      return;
    }

    const lowerValue =
      textValue.toLowerCase();

    const compactValue =
      lowerValue.replace(
        /[^a-z0-9]/g,
        "",
      );

    keySet.add(lowerValue);

    if (compactValue) {
      keySet.add(compactValue);
    }

    const parts = textValue
      .split(/\s*[—–-]\s*/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length > 1) {
      parts.forEach((part) =>
        addInventoryMatchValue(
          keySet,
          part,
        ),
      );

      keySet.add(
        parts
          .join(" - ")
          .toLowerCase(),
      );
    }

    const digitGroups =
      textValue.match(/\d+/g);

    if (digitGroups?.length) {
      const digits =
        digitGroups.join("");

      keySet.add(digits);
      keySet.add(`cmp-${digits}`);
      keySet.add(`cmp${digits}`);
    }
  };


  const getBomRowMatchKeys = (
    row = {},
  ) => {
    const keys = new Set();

    const details =
      row.component_details ||
      row.component_obj ||
      row.component_data ||
      row.componentInfo ||
      row.component_info ||
      null;

    [
      row.id,
      row.component_pk,
      row.component_db_id,
      row.component_code,
      row.componentCode,
      row.component_id,
      row.componentId,
      row.component_name,
      row.componentName,
      row.componentLabel,
      row.component_label,
      row.component,
      row.code,
      row.name,
      row.label,
      row.inventory_code,
      row.product_name,
      row.productName,
      row.component_id_display,
      row.component_code_display,
      details,
    ].forEach((value) =>
      addInventoryMatchValue(
        keys,
        value,
      ),
    );

    return Array.from(keys);
  };


  const findLiveInventoryQuantity = (
    row,
  ) => {
    const keys =
      getBomRowMatchKeys(row);

    for (const key of keys) {
      if (
        Object.prototype.hasOwnProperty.call(
          inventoryCounts,
          key,
        )
      ) {
        const quantity = Number(
          inventoryCounts[key],
        );

        return {
          found: true,
          quantity:
            Number.isFinite(quantity)
              ? Math.max(quantity, 0)
              : 0,
        };
      }
    }

    return {
      found: false,
      quantity: 0,
    };
  };


  const getInventoryQuantityForBomRow = (
    row,
  ) => {
    return findLiveInventoryQuantity(
      row,
    ).quantity;
  };


  const getInventoryQuantityForRequestItem = (
    item,
  ) => {
    /*
     * Show the Inventory Qty captured when this MR item was created.
     * This value must remain unchanged until the MR workflow ends.
     */
    const rawCreationSnapshot =
      item?.creation_inventory_quantity ??
      item?.created_inventory_quantity ??
      item?.inventory_snapshot_quantity ??
      item?.inventory_quantity ??
      item?.inventoryQuantity ??
      item?.inventory_qty;

    const hasCreationSnapshot =
      rawCreationSnapshot !== undefined &&
      rawCreationSnapshot !== null &&
      rawCreationSnapshot !== "";

    if (hasCreationSnapshot) {
      const snapshotQuantity = Number(
        rawCreationSnapshot,
      );

      return Number.isFinite(
        snapshotQuantity,
      )
        ? Math.max(
            snapshotQuantity,
            0,
          )
        : 0;
    }

    /*
     * Legacy fallback only for requests created before the
     * creation-time snapshot was saved.
     */
    const liveInventory =
      findLiveInventoryQuantity(item);

    return liveInventory.found
      ? liveInventory.quantity
      : 0;
  };


  const getMaterialRequestReference = (request) =>
    String(
      request?.material_request_id ||
        request?.request_id ||
        request?.id ||
        "",
    ).trim();

  const getProjectInventoryKey = (requestReference, componentKey) =>
    `${String(requestReference || "").trim().toLowerCase()}|${String(
      componentKey || "",
    )
      .trim()
      .toLowerCase()}`;

  const getProjectInventoryDetailForRequestItem = (
    item,
    request,
  ) => {
    const requestReference =
      getMaterialRequestReference(request);

    if (!requestReference) {
      return null;
    }

    const componentKeys =
      getBomRowMatchKeys(item);

    for (const componentKey of componentKeys) {
      const lookupKey =
        getProjectInventoryKey(
          requestReference,
          componentKey,
        );

      if (
        Object.prototype.hasOwnProperty.call(
          projectInventoryDetails,
          lookupKey,
        )
      ) {
        return projectInventoryDetails[
          lookupKey
        ];
      }
    }

    return null;
  };

  const getIssuedToEngineerQuantity = (
    item,
    request,
  ) => {
    const projectRow =
      getProjectInventoryDetailForRequestItem(
        item,
        request,
      );

    if (!projectRow) {
      return 0;
    }

    const direct = Number(
      projectRow.issued_quantity ??
        projectRow.calculated_issued_quantity,
    );

    if (Number.isFinite(direct)) {
      return Math.max(direct, 0);
    }

    return Math.max(
      Number(
        projectRow.issued_store_quantity || 0,
      ) || 0,
      0,
    ) + Math.max(
      Number(
        projectRow.issued_purchased_quantity || 0,
      ) || 0,
      0,
    );
  };

  const getComponentRemainingQuantity = (
    item,
    request,
  ) =>
    Math.max(
      Number(item?.quantity || 0) -
        getIssuedToEngineerQuantity(
          item,
          request,
        ),
      0,
    );

  const getComponentWorkflowStatus = (
    item,
    request,
  ) => {
    const requested = Math.max(
      Number(item?.quantity || 0) || 0,
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
      getIssuedToEngineerQuantity(
        item,
        request,
      );

    const projectRow =
      getProjectInventoryDetailForRequestItem(
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
      : Math.max(
          qcPassed - issued,
          0,
        );

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
      delivered < Math.max(
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

  const renderComponentWorkflowStatus = (
    item,
    request,
  ) => {
    const result =
      getComponentWorkflowStatus(
        item,
        request,
      );

    return (
      <span
        className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${result.className}`}
      >
        {result.label}
      </span>
    );
  };


  const getProjectQuantityForRequestItem = (item, request) => {
    const requestReference = getMaterialRequestReference(request);
    let apiProjectQuantity = 0;

    if (requestReference) {
      const componentKeys = getBomRowMatchKeys(item);

      for (const componentKey of componentKeys) {
        const lookupKey = getProjectInventoryKey(
          requestReference,
          componentKey,
        );

        if (
          Object.prototype.hasOwnProperty.call(
            projectInventoryCounts,
            lookupKey,
          )
        ) {
          const value = Number(
            projectInventoryCounts[lookupKey] || 0,
          );

          apiProjectQuantity = Number.isFinite(value)
            ? Math.max(value, 0)
            : 0;
          break;
        }
      }
    }

    const procurementShortageQuantity = Math.max(
      Number(
        item?.procurement_shortage_quantity ??
          item?.procurementShortageQuantity ??
          0,
      ) || 0,
      0,
    );

    const poRaisedQuantity = Math.max(
      Number(
        item?.po_raised_quantity ??
          item?.poRaisedQuantity ??
          0,
      ) || 0,
      0,
    );

    const deliveredQuantity = Math.max(
      Number(
        item?.delivered_quantity ??
          item?.deliveredQuantity ??
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

    const issuedPurchasedQuantity = Math.max(
      Number(
        item?.issued_purchased_quantity ??
          item?.issuedPurchasedQuantity ??
          0,
      ) || 0,
      0,
    );

    /*
     * Project Qty is only MR-linked procurement stock that passed QC.
     * project_inventory_quantity cannot be used here because the backend
     * also uses that field for quantities issued from In Store.
     */
    const hasProcurementFlow =
      procurementShortageQuantity > 0 ||
      poRaisedQuantity > 0 ||
      deliveredQuantity > 0 ||
      qcPassedQuantity > 0 ||
      issuedPurchasedQuantity > 0 ||
      apiProjectQuantity > 0;

    const hasQcPassedProjectStock =
      qcPassedQuantity > 0 ||
      issuedPurchasedQuantity > 0 ||
      apiProjectQuantity > 0;

    if (!hasProcurementFlow || !hasQcPassedProjectStock) {
      return 0;
    }

    const projectQuantity = Math.max(
      apiProjectQuantity,
      qcPassedQuantity,
      issuedPurchasedQuantity,
    );

    return procurementShortageQuantity > 0
      ? Math.min(
          projectQuantity,
          procurementShortageQuantity,
        )
      : projectQuantity;
  };

  const shouldShowProjectQuantityColumn = (items, request) =>
    Array.isArray(items) &&
    items.some(
      (item) =>
        getProjectQuantityForRequestItem(
          item,
          request,
        ) > 0,
    );

  const renderProjectQuantity = (item, request) => {
    const quantity = getProjectQuantityForRequestItem(
      item,
      request,
    );

    return quantity > 0 ? quantity : "-";
  };

  const loadProjectInventoryForRequest = async (request) => {
    const requestReference = getMaterialRequestReference(request);

    if (!requestReference) {
      return;
    }

    setProjectInventoryLoading(true);

    try {
      const isDatabaseId =
        !request?.material_request_id &&
        !request?.request_id &&
        Boolean(request?.id);

      const queryName = isDatabaseId
        ? "material_request"
        : "source_mr_number";

      const endpoint =
        `${config.baseURL}/inventory/project-inventory/` +
        `?${queryName}=${encodeURIComponent(requestReference)}`;

      const data = await fetchAuthenticatedJson(endpoint);

      const projectItems = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
          ? data.results
          : [];

      const nextCounts = {};
      const nextDetails = {};

      projectItems.forEach((projectItem) => {
        const purchasedQuantity = Math.max(
          Number(projectItem.purchased_quantity || 0) || 0,
          0,
        );

        const qcPassedQuantity = Math.max(
          Number(projectItem.qc_passed_quantity || 0) || 0,
          0,
        );

        const issuedPurchasedQuantity = Math.max(
          Number(
            projectItem.issued_purchased_quantity || 0,
          ) || 0,
          0,
        );

        const quantity = Math.max(
          purchasedQuantity,
          qcPassedQuantity,
          issuedPurchasedQuantity,
        );

        /*
         * Keep every ProjectInventory row in projectInventoryDetails,
         * including Store-only and already-issued rows. The quantity-only
         * map below still records purchased/QC project quantity separately.
         */
        const itemRequestReference = String(
          projectItem.source_mr_number ||
            projectItem.material_request_number ||
            projectItem.material_request_id ||
            requestReference,
        ).trim();

        const componentKeys = extractInventoryMatchKeys(projectItem);

        componentKeys.forEach((componentKey) => {
          const key = getProjectInventoryKey(
            itemRequestReference,
            componentKey,
          );

          nextDetails[key] = projectItem;

          if (quantity > 0) {
            nextCounts[key] = quantity;
          }
        });
      });

      setProjectInventoryCounts((previous) => {
        const requestReferences = [
          requestReference,
          request?.id,
          request?.material_request_id,
          request?.request_id,
        ]
          .filter(
            (value) =>
              value !== undefined &&
              value !== null &&
              value !== "",
          )
          .map((value) =>
            `${String(value).trim().toLowerCase()}|`,
          );

        const withoutOldRequestValues = Object.fromEntries(
          Object.entries(previous).filter(
            ([key]) =>
              !requestReferences.some((prefix) =>
                String(key).startsWith(prefix),
              ),
          ),
        );

        return {
          ...withoutOldRequestValues,
          ...nextCounts,
        };
      });

      setProjectInventoryDetails((previous) => {
        const requestReferences = [
          requestReference,
          request?.id,
          request?.material_request_id,
          request?.request_id,
        ]
          .filter(
            (value) =>
              value !== undefined &&
              value !== null &&
              value !== "",
          )
          .map((value) =>
            `${String(value).trim().toLowerCase()}|`,
          );

        const withoutOldRequestValues =
          Object.fromEntries(
            Object.entries(previous).filter(
              ([key]) =>
                !requestReferences.some(
                  (prefix) =>
                    String(key).startsWith(
                      prefix,
                    ),
                ),
            ),
          );

        return {
          ...withoutOldRequestValues,
          ...nextDetails,
        };
      });
    } catch (error) {
      console.error(
        "Failed to load Project Inventory for MR:",
        requestReference,
        error,
      );
    } finally {
      setProjectInventoryLoading(false);
    }
  };



  const extractInventoryMatchKeys = (item) => {
    const keys = new Set();
    const candidates = [
      item.component_code,
      item.component_id,
      item.component_name,
      item.componentLabel,
      item.component_label,
      item.component,
      item.code,
      item.name,
      item.label,
      item.inventory_code,
      item.product_name,
      item.productName,
      item.component_id_display,
      item.component_code_display,
    ];

    const details = item.component_details || item.component_obj || item.component_data || item.componentInfo || item.component_info;
    if (details) {
      candidates.push(
        details.component_id,
        details.component_code,
        details.component_name,
        details.componentLabel,
        details.component_label,
        details.code,
        details.name,
        details.label,
        details.inventory_code,
        details.product_name,
        details.productName,
      );
    }

    candidates.forEach((value) => {
      if (!value) return;
      const text = String(value).trim();
      if (!text) return;
      keys.add(text.toLowerCase());
      const parts = text.split(/\s*[—–-]\s*/).map((part) => part.trim()).filter(Boolean);
      if (parts.length > 1) {
        parts.forEach((part) => keys.add(part.toLowerCase()));
        keys.add(parts.join(" - ").toLowerCase());
      }
    });

    return Array.from(keys);
  };

  const unwrapApiList = (
    data,
  ) => {
    if (Array.isArray(data)) {
      return data;
    }

    if (Array.isArray(data?.results)) {
      return data.results;
    }

    if (Array.isArray(data?.items)) {
      return data.items;
    }

    if (Array.isArray(data?.data)) {
      return data.data;
    }

    return [];
  };


  const getInventoryItemQuantity = (
    item,
  ) => {
    const rawQuantity =
      item.available_quantity ??
      item.availableQuantity ??
      item.remaining_quantity ??
      item.remainingQuantity ??
      item.balance_quantity ??
      item.balanceQuantity ??
      item.in_store_quantity ??
      item.inStoreQuantity ??
      item.on_hand_quantity ??
      item.onHandQuantity ??
      item.stock_quantity ??
      item.stockQuantity ??
      item.qty ??
      item.quantity ??
      item.passed_quantity ??
      item.passedQuantity ??
      item.received_quantity ??
      item.quantity_received ??
      0;

    const quantity = Number(
      rawQuantity,
    );

    return Number.isFinite(quantity)
      ? Math.max(quantity, 0)
      : 0;
  };


  const isProjectInventoryItem = (
    item,
  ) => {
    const scope = String(
      item.inventory_scope ||
      item.scope ||
      "",
    )
      .trim()
      .toLowerCase();

    const sourceMr = String(
      item.source_mr_number ||
      item.sourceMrNumber ||
      item.material_request_number ||
      item.material_request_id ||
      item.request_id ||
      "",
    ).trim();

    return (
      scope === "project" ||
      Boolean(sourceMr)
    );
  };


  const isInwardGeneratedInventoryItem = (
    item,
  ) => {
    const source = String(
      item?.source ||
        item?.inventory_source ||
        item?.stock_source ||
        "",
    )
      .trim()
      .toLowerCase();

    const inventoryCode = String(
      item?.inventory_code ||
        item?.code ||
        "",
    ).trim();

    const serialText = [
      item?.serial_number,
      item?.serialNumber,
      ...(Array.isArray(item?.serials)
        ? item.serials
        : []),
      ...(Array.isArray(
        item?.serials_list,
      )
        ? item.serials_list
        : []),
    ]
      .filter(Boolean)
      .join(",");

    return Boolean(
      item?.inward ||
      item?.inward_id ||
      item?.inward_entry ||
      item?.inward_entry_id ||
      item?.grn ||
      item?.grn_id ||
      item?.inward_code ||
      source === "inward" ||
      /^INW[-_ ]?/i.test(
        inventoryCode,
      ) ||
      /C_\d+S\d+/i.test(
        serialText,
      )
    );
  };


  const getQcPassedRows = (
    inward,
  ) => {
    const candidates = [
      inward.qc_passed_rows,
      inward.passedRows,
      inward.passed_rows,
      inward.qc?.passedRows,
      inward.qc?.passed_rows,
      inward.qc_results
        ?.passedRows,
      inward.qc_results
        ?.passed_rows,
    ];

    return (
      candidates.find(
        Array.isArray,
      ) || []
    );
  };


  const getQcPassedQuantity = (
    inward,
  ) => {
    const passedRows =
      getQcPassedRows(inward);

    if (passedRows.length) {
      return passedRows.reduce(
        (total, row) => {
          const quantity = Number(
            row?.qty ??
            row?.quantity ??
            row?.passed_quantity ??
            1,
          );

          return (
            total +
            (
              Number.isFinite(
                quantity,
              )
                ? Math.max(
                    quantity,
                    0,
                  )
                : 0
            )
          );
        },
        0,
      );
    }

    const qcStatus = String(
      inward.qc_status ||
      inward.qcStatus ||
      inward.status ||
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
      ].includes(qcStatus)
    ) {
      return getInventoryItemQuantity(
        inward,
      );
    }

    return 0;
  };


  const loadInventoryCounts =
    async () => {
      const inventoryEndpoints = [
        `${config.baseURL}/inventory/inventory/?page_size=5000`,
        `${config.baseURL}/inventory/?page_size=5000`,
        `${config.baseURL}/inventory/inventory/`,
        `${config.baseURL}/inventory/`,
      ];

      const [
        componentResult,
        purchaseOrderResult,
        inwardResult,
      ] = await Promise.all([
        fetchAuthenticatedJson(
          `${config.baseURL}/components/components/?page_size=5000`,
        ).catch(() => []),

        fetchAuthenticatedJson(
          `${config.baseURL}/procurement/purchase-orders/?page_size=5000`,
        ).catch(() => []),

        fetchAuthenticatedJson(
          `${config.baseURL}/inward/?page_size=5000`,
        ).catch(() => []),
      ]);

      const components =
        unwrapApiList(
          componentResult,
        );

      /*
       * Build aliases using both the database component ID and the
       * human-readable component code/name. This prevents an MR item
       * with component=12 from failing to match an Inventory row whose
       * serializer exposes component_code="CMP-...".
       */
      const nextComponentsMap = {};

      components.forEach((component) => {
        const descriptor = {
          id: component.id ?? component.pk ?? null,
          code:
            component.component_id ||
            component.component_code ||
            component.code ||
            "",
          name:
            component.component_name ||
            component.name ||
            component.product_name ||
            "",
          category: component.category || "",
          component_type:
            component.component_type ||
            component.componentType ||
            component.type ||
            "",
          specification:
            component.specification ||
            component.specifications ||
            "",
          hsn_no:
            component.hsn_no ||
            component.hsn_numbers ||
            component.hsn_number ||
            component.hsnNumber ||
            component.hsn ||
            "",
        };

        const rawAliases = [
          component.id,
          component.pk,
          component.component_id,
          component.component_code,
          component.code,
          component.name,
          component.component_name,
        ];

        rawAliases
          .filter(
            (value) =>
              value !== undefined &&
              value !== null &&
              value !== "",
          )
          .forEach((value) => {
            nextComponentsMap[String(value)] = descriptor;
            nextComponentsMap[
              String(value).trim().toLowerCase()
            ] = descriptor;
          });

        getBomRowMatchKeys(component).forEach((key) => {
          nextComponentsMap[key] = descriptor;
        });
      });

      setComponentsMap(nextComponentsMap);

      const purchaseOrders =
        unwrapApiList(
          purchaseOrderResult,
        );

      const inwardEntries =
        unwrapApiList(
          inwardResult,
        );

      const componentByKey =
        new Map();

      components.forEach(
        (component) => {
          getBomRowMatchKeys(
            component,
          ).forEach((key) => {
            componentByKey.set(
              key,
              component,
            );
          });
        },
      );

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

      const resolveComponent =
        (item) => {
          for (
            const key of
            getBomRowMatchKeys(item)
          ) {
            if (
              componentByKey.has(key)
            ) {
              return componentByKey.get(
                key,
              );
            }
          }

          return null;
        };

      const getCombinedKeys = (
        item,
      ) => {
        const keys = new Set(
          getBomRowMatchKeys(item),
        );

        const component =
          resolveComponent(item);

        if (component) {
          getBomRowMatchKeys(
            component,
          ).forEach((key) =>
            keys.add(key),
          );
        }

        return Array.from(keys);
      };

      let inventoryItems = [];

      for (
        const endpoint of
        inventoryEndpoints
      ) {
        try {
          const data =
            await fetchAuthenticatedJson(
              endpoint,
            );

          const list =
            unwrapApiList(data);

          if (list.length) {
            inventoryItems = list;
            break;
          }
        } catch {
          // Try the next supported endpoint.
        }
      }

      const apiCounts = {};

      inventoryItems.forEach(
        (item) => {
          /*
           * Inventory Qty in the MR means free In Store
           * stock. MR-linked Project Inventory must not
           * be added to this column.
           */
          if (
            isProjectInventoryItem(
              item,
            ) ||
            isInwardGeneratedInventoryItem(
              item,
            )
          ) {
            return;
          }

          const quantity =
            getInventoryItemQuantity(
              item,
            );

          if (quantity <= 0) {
            return;
          }

          getCombinedKeys(item).forEach(
            (key) => {
              apiCounts[key] =
                (
                  apiCounts[key] ||
                  0
                ) + quantity;
            },
          );
        },
      );

      const inwardFallbackCounts = {};

      inwardEntries.forEach(
        (inward) => {
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
            inward.purchaseOrderId ??
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
            ) ||
            null;

          const sourceMrNumber =
            inward.source_mr_number ||
            inward.sourceMrNumber ||
            purchaseOrder
              ?.source_mr_number ||
            purchaseOrder
              ?.sourceMrNumber ||
            purchaseOrder?.mr_number ||
            "";

          /*
           * QC-passed stock purchased for an MR belongs
           * to Project Inventory. Do not show it as free
           * In Store quantity.
           */
          if (
            String(
              sourceMrNumber,
            ).trim()
          ) {
            return;
          }

          const quantity =
            getQcPassedQuantity(
              inward,
            );

          if (quantity <= 0) {
            return;
          }

          getCombinedKeys(
            inward,
          ).forEach((key) => {
            inwardFallbackCounts[key] =
              (
                inwardFallbackCounts[
                  key
                ] || 0
              ) + quantity;
          });
        },
      );

      /*
       * apiCounts contains only manually added
       * In Store stock.
       *
       * inwardFallbackCounts contains every available
       * QC-passed direct Inward batch.
       *
       * INW-0004 = 10
       * INW-0005 = 10
       * Total In Store = 20
       */
      const finalCounts = {
        ...apiCounts,
      };

      Object.entries(
        inwardFallbackCounts,
      ).forEach(
        ([key, quantity]) => {
          finalCounts[key] =
            Number(
              finalCounts[key] || 0,
            ) +
            Number(quantity || 0);
        },
      );

      console.debug(
        "MR live In Store counts:",
        {
          manualInventory:
            apiCounts,
          qcPassedInward:
            inwardFallbackCounts,
          total:
            finalCounts,
        },
      );

      setInventoryCounts(
        finalCounts,
      );

      return finalCounts;
    };


  const loadRejectDetails = async (row) => {
    const buildTitle = () => row.material_request_id || row.request_id || `MR-${row.id || ""}`;
    const buildActor = (details) =>
      details.rejected_by ||
      details.rejectedBy ||
      details.rejected_by_role ||
      details.rejectedByRole ||
      details.rejected_by_role_name ||
      details.rejectedByRoleName ||
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
      details.approval_note ||
      details.approvalNote ||
      details.message ||
      details.note ||
      details.comment ||
      details.reason ||
      details.latest_approval?.rejection_reason ||
      details.latest_approval?.rejectionReason ||
      details.latest_approval?.reject_reason ||
      details.latest_approval?.rejectReason ||
      details.latest_approval?.reject_note ||
      details.latest_approval?.rejectNote ||
      details.latest_approval?.approval_note ||
      details.latest_approval?.approvalNote ||
      details.latest_approval?.reason ||
      details.latest_approval?.comment ||
      details.latest_approval?.note ||
      details.latest_approval?.remarks ||
      row.rejectionReason ||
      row.rejection_reason ||
      row.reject_reason ||
      row.rejectNote ||
      row.rejection_notes ||
      row.approval_note ||
      row.approvalNote ||
      row.message ||
      row.note ||
      row.comment ||
      row.reason ||
      row.latest_approval?.rejection_reason ||
      row.latest_approval?.rejectionReason ||
      row.latest_approval?.reject_reason ||
      row.latest_approval?.rejectReason ||
      row.latest_approval?.reject_note ||
      row.latest_approval?.rejectNote ||
      row.latest_approval?.approval_note ||
      row.latest_approval?.approvalNote ||
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
          "REJECTED",
      ).toUpperCase();

    try {
      const details = await fetchAuthenticatedJson(
        `${`${config.baseURL}/materialrequest/material-requests/`}${row.id}/`,
      );

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

  async function handleRequestApproval(id) {
    if (!canAdministerMR) {
      return;
    }

    try {
      const requestData = await fetchAuthenticatedJson(
        `${`${config.baseURL}/materialrequest/material-requests/`}${id}/`,
      ).catch(() => null);

      const requestIdLabel = (requestData && (requestData.material_request_id || requestData.request_id)) || `MR-${id}`;

      const notificationPayload = {
        category: "MR",
        title: `MR APPROVAL REQUEST - ${requestIdLabel}`,
        message: `Approval requested for Material Request ${requestIdLabel}`,
        reference_id: String(id),
        status: "REQUESTED",
        receiver: "MANAGER",
        is_read: false,
      };

      try {
        const existing = await fetchAuthenticatedJson(`${config.baseURL}/notifications/`);
        const notifications = existing.results || existing || [];

        const alreadyExists = notifications.some(
          (n) =>
            String(n.category).toUpperCase() === "MR" &&
            String(n.reference_id) === String(id) &&
            String(n.receiver).toUpperCase() === "MANAGER" &&
            String(n.status).toUpperCase() === "REQUESTED"
        );

        if (!alreadyExists) {
          await API.post("/notifications/", notificationPayload);
        }
      } catch (err) {
        console.error("Failed to create MR notification:", err?.response?.data || err.message || err);
      }

      setApprovalRequestedIds((prev) => [...new Set([...prev, String(id)])]);

      const data = await fetchAuthenticatedJson(
        `${config.baseURL}/materialrequest/material-requests/${id}/`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "PENDING_MANAGER",
            approval_status: "PENDING_MANAGER",
          }),
        },
      );

      console.log(
        "handleRequestApproval response",
        data,
      );

      await loadRequests();
      const refreshed = await fetchAuthenticatedJson(`${config.baseURL}/materialrequest/material-requests/${id}/`).catch(() => null);
      if (refreshed) {
        setRows((prev) => prev.map((row) => {
          if (String(row.id) !== String(id)) return row;
          const merged = { ...row, ...refreshed };
          return {
            ...merged,
            approval_status: getVisibleApprovalStatus(merged),
            status: refreshed.status || merged.status || row.status,
          };
        }));
      }
    } catch (err) {
      console.error("Request approval failed:", err);
    }
  }

  const normalizeRequestItem = (item) => {
    const rawComponent = item?.component;

    const componentObject =
      rawComponent &&
      typeof rawComponent === "object" &&
      !Array.isArray(rawComponent)
        ? rawComponent
        : item?.component_details ||
          item?.component_obj ||
          item?.component_data ||
          {};

    const rawComponentId =
      item?.component_pk ??
      item?.component_db_id ??
      item?.component_id ??
      componentObject?.id ??
      componentObject?.pk ??
      (typeof rawComponent !== "object"
        ? rawComponent
        : null);

    const code =
      item?.component_code ||
      componentObject?.component_id ||
      componentObject?.component_code ||
      componentObject?.code ||
      rawComponentId ||
      "";

    const componentInfo =
      componentsMap[String(rawComponentId ?? "")] ||
      componentsMap[String(code)] ||
      componentsMap[
        String(code).trim().toLowerCase()
      ] ||
      {};

    const name =
      componentInfo.name ||
      item?.component_name ||
      componentObject?.component_name ||
      componentObject?.name ||
      "Unknown Component";

    const category =
      componentInfo.category ||
      item?.category ||
      item?.category_name ||
      componentObject?.category ||
      "";

    const specification =
      componentInfo.specification ||
      item?.specification ||
      item?.specifications ||
      item?.component_specifications ||
      item?.componentSpecification ||
      item?.specs ||
      item?.spec ||
      componentObject?.specification ||
      componentObject?.specifications ||
      "";

    const quantity = Number(
      item?.quantity ??
        item?.qty ??
        item?.quantity_requested ??
        0,
    );

    const rawPrice = Number(
      item?.price ??
        item?.total_price ??
        item?.totalPrice ??
        item?.line_total ??
        item?.amount ??
        item?.rate ??
        0,
    );

    const unitPrice = Number(
      item?.unit_price ??
        item?.unitPrice ??
        item?.rate ??
        (quantity ? rawPrice / quantity : 0) ??
        0,
    );

    const price = rawPrice || quantity * unitPrice;
    const tax = Number(
      item?.tax ??
        item?.gst ??
        item?.tax_percent ??
        0,
    );

    const total = Number(
      item?.total ??
        item?.grand_total ??
        item?.totalPrice ??
        price + (price * tax) / 100,
    );

    return {
      ...item,

      /*
       * Keep every component identity. The old normalizer removed the
       * component database ID, so the popup could not match the MR row
       * with the Inventory row and displayed 0.
       */
      component:
        rawComponentId ??
        rawComponent ??
        null,
      component_id:
        rawComponentId,
      component_pk:
        item?.component_pk ??
        componentObject?.id ??
        rawComponentId,
      component_details:
        componentObject,

      component_code: String(componentInfo.code || code || ""),
      component_name:
        componentInfo.name ||
        name ||
        "Unknown Component",
      category:
        componentInfo.category ||
        category,
      component_type:
        componentInfo.component_type ||
        item?.component_type ||
        componentObject?.component_type ||
        componentObject?.componentType ||
        "",
      specification:
        componentInfo.specification ||
        specification,
      specifications:
        componentInfo.specification ||
        specification,
      hsn_no:
        componentInfo.hsn_no ||
        item?.hsn_no ||
        item?.hsn_numbers ||
        item?.hsn_number ||
        item?.hsnNumber ||
        componentObject?.hsn_no ||
        componentObject?.hsn_numbers ||
        componentObject?.hsn_number ||
        componentObject?.hsnNumber ||
        componentObject?.hsn ||
        "",
      quantity,
      unit:
        item?.unit ||
        item?.uom ||
        componentObject?.unit ||
        "pc",
      unit_price: unitPrice,
      price,
      tax,
      total,
      remarks:
        item?.remarks ||
        item?.note ||
        "",

      /*
       * inventory_quantity is the immutable creation-time snapshot.
       * reserved_store_quantity is the later Manager allocation and
       * must not replace the snapshot shown in MR BOM Details.
       */
      inventory_quantity:
        item?.creation_inventory_quantity ??
        item?.created_inventory_quantity ??
        item?.inventory_snapshot_quantity ??
        item?.inventory_quantity ??
        item?.inventoryQuantity ??
        item?.inventory_qty ??
        null,
      reserved_store_quantity:
        item?.reserved_store_quantity ??
        item?.reservedStoreQuantity ??
        0,
      physical_inventory_quantity: Number(
        item?.physical_inventory_quantity ??
          item?.physicalInventoryQuantity ??
          0,
      ),
      // Preserve a missing value instead of forcing it to 0.
      // This allows getAvailableForRequestQuantity() to calculate:
      // In Store at MR Creation - Reserved by Other MR.
      available_inventory_quantity:
        item?.available_inventory_quantity ??
        item?.availableInventoryQuantity,
      reserved_by_other_mrs: Number(
        item?.reserved_by_other_mrs ??
          item?.reservedByOtherMrs ??
          0,
      ),
      reserved_by_other_mr_details:
        Array.isArray(
          item?.reserved_by_other_mr_details,
        )
          ? item.reserved_by_other_mr_details
          : Array.isArray(
              item?.reservedByOtherMrDetails,
            )
            ? item.reservedByOtherMrDetails
            : [],
      procurement_shortage_quantity: Number(
        item?.procurement_shortage_quantity ??
          0,
      ),
      po_raised_quantity: Number(
        item?.po_raised_quantity ??
          0,
      ),
      delivered_quantity: Number(
        item?.delivered_quantity ??
          0,
      ),
      qc_passed_quantity: Number(
        item?.qc_passed_quantity ??
          0,
      ),
      qc_failed_quantity: Number(
        item?.qc_failed_quantity ??
          0,
      ),
      project_inventory_quantity: Number(
        item?.project_inventory_quantity ??
          0,
      ),
    };
  };


  const getReservedByOtherMrQuantity = (item = {}) => {
    const value = Number(
      item?.reserved_by_other_mrs ??
        item?.reservedByOtherMrs ??
        0,
    );

    return Number.isFinite(value)
      ? Math.max(value, 0)
      : 0;
  };

  const getAvailableForRequestQuantity = (item = {}) => {
    const rawExplicit =
      item?.available_inventory_quantity ??
      item?.availableInventoryQuantity;

    // Only use the backend value when it actually exists.
    // Number(null) is 0, so checking the raw value first is important.
    if (
      rawExplicit !== undefined &&
      rawExplicit !== null &&
      rawExplicit !== ""
    ) {
      const explicit = Number(rawExplicit);

      if (Number.isFinite(explicit)) {
        return Math.max(explicit, 0);
      }
    }

    return Math.max(
      getInventoryQuantityForRequestItem(item) -
        getReservedByOtherMrQuantity(item),
      0,
    );
  };

  const getReservationDetails = (item = {}) =>
    Array.isArray(
      item?.reserved_by_other_mr_details,
    )
      ? item.reserved_by_other_mr_details
      : Array.isArray(
          item?.reservedByOtherMrDetails,
        )
        ? item.reservedByOtherMrDetails
        : [];

  const renderReservationInfo = (item = {}) => {
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
      getAvailableForRequestQuantity(item);

    const reservedQuantity =
      getReservedByOtherMrQuantity(item);

    const reservationDetails =
      getReservationDetails(item);

    // Match the Manager Notification MR popup:
    // even when stock is unavailable, still show which other MRs
    // have reserved the component and how much each one reserved.
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
                    key={`material-mr-reservation-${index}`}
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
                  key={`material-mr-reservation-detail-${index}`}
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



  const loadFromScrapDisplayDetails = async (requestLike) => {
    if (!requestLike?.id) {
      return {
        request: requestLike || null,
        sourceScrap: null,
        originalRequest: null,
        originalMrNumber: "",
        project: "",
        items: [],
      };
    }

    const normalizeKey = (value) =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    const asList = (payload) =>
      Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.results)
          ? payload.results
          : [];

    const splitSerials = (value) => {
      if (Array.isArray(value)) {
        return value
          .flatMap(splitSerials)
          .filter(Boolean);
      }

      if (
        value === undefined ||
        value === null
      ) {
        return [];
      }

      return String(value)
        .split(/[,;|\n]/)
        .map((serial) =>
          serial.trim()
        )
        .filter(
          (serial) =>
            serial &&
            serial !== "-",
        );
    };

    const uniqueSerials = (values) =>
      Array.from(
        new Set(
          (Array.isArray(values)
            ? values
            : []
          )
            .flatMap(splitSerials)
            .map((serial) =>
              String(serial || "")
                .trim()
            )
            .filter(Boolean),
        ),
      );

    const getItems = (request = {}) => {
      const candidates = [
        request?.bom_items,
        request?.rd_items,
        request?.request_items,
        request?.items,
        request?.bom_details?.items,
      ];

      return candidates
        .filter(Array.isArray)
        .flat()
        .filter(Boolean);
    };

    const getQuantity = (item = {}) =>
      Math.max(
        Number(
          item?.requested_quantity ??
            item?.required_quantity ??
            item?.quantity ??
            item?.qty ??
            item?.requested_qty ??
            0,
        ) || 0,
        0,
      );

    const getItemKeys = (item = {}) => {
      const componentObject =
        item?.component &&
        typeof item.component ===
          "object"
          ? item.component
          : {};

      const values = [
        item?.component,
        item?.component_id,
        item?.componentId,
        item?.component_code,
        item?.componentCode,
        item?.component_name,
        item?.componentName,
        item?.name,
        item?.label,

        item?.component_pk,
        item?.component_db_id,

        componentObject?.id,
        componentObject?.pk,
        componentObject?.component_id,
        componentObject?.component_code,
        componentObject?.name,
      ];

      return new Set(
        values
          .filter(
            (value) =>
              value !== undefined &&
              value !== null &&
              typeof value !== "object" &&
              String(value).trim(),
          )
          .flatMap((value) => {
            const raw = String(value)
              .trim()
              .toLowerCase();

            const compact =
              normalizeKey(value);

            return (
              compact &&
              compact !== raw
            )
              ? [raw, compact]
              : [raw];
          }),
      );
    };

    const rowsMatch = (
      left,
      right,
    ) => {
      const leftKeys =
        getItemKeys(left);

      const rightKeys =
        getItemKeys(right);

      for (const key of leftKeys) {
        if (rightKeys.has(key)) {
          return true;
        }
      }

      return false;
    };

    const parseRecoveredSerialsFromItem = (
      item = {},
    ) => {
      const direct = uniqueSerials([
        item?.scrap_serial_numbers,
        item?.selected_serial_numbers,
        item?.from_scrap_serial_numbers,
        item?.recovered_serial_numbers,
      ]);

      if (direct.length) {
        return direct;
      }

      const remarks = String(
        item?.remarks || "",
      );

      const match = remarks.match(
        /FROM_SCRAP_SERIALS:([^\r\n]*)/i,
      );

      return match?.[1]
        ? uniqueSerials(
            match[1],
          )
        : [];
    };

    const currentRequest =
      await fetchAuthenticatedJson(
        `${config.baseURL}/materialrequest/material-requests/${encodeURIComponent(
          requestLike.id,
        )}/`,
        {
          cache: "no-store",
        },
      );

    const currentMrNumber = String(
      currentRequest?.material_request_id ||
        currentRequest?.request_id ||
        requestLike?.material_request_id ||
        requestLike?.request_id ||
        "",
    ).trim();

    const [
      outwardPayload,
      allMrPayload,
      projectPayload,
      poPayload,
      inwardPayload,
    ] = await Promise.all([
      fetchAuthenticatedJson(
        `${config.baseURL}/outward/?page_size=5000`,
        {
          cache: "no-store",
        },
      ).catch(() => []),

      fetchAuthenticatedJson(
        `${config.baseURL}/materialrequest/material-requests/?page_size=5000`,
        {
          cache: "no-store",
        },
      ).catch(() => []),

      fetchAuthenticatedJson(
        `${config.baseURL}/inventory/project-inventory/?source_mr_number=${encodeURIComponent(
          currentMrNumber,
        )}&page_size=5000`,
        {
          cache: "no-store",
        },
      ).catch(() => []),

      fetchAuthenticatedJson(
        `${config.baseURL}/procurement/purchase-orders/?page_size=5000`,
        {
          cache: "no-store",
        },
      ).catch(() => []),

      fetchAuthenticatedJson(
        `${config.baseURL}/inward/?page_size=5000`,
        {
          cache: "no-store",
        },
      ).catch(() => []),
    ]);

    const outwardRows =
      asList(outwardPayload);

    const allMrs =
      asList(allMrPayload);

    const projectRows =
      asList(projectPayload);

    const purchaseOrders =
      asList(poPayload);

    const inwardRows =
      asList(inwardPayload);

    const requestRemarks = String(
      currentRequest?.remarks ||
        requestLike?.remarks ||
        "",
    );

    /*
     * The generated From-Scrap MR stores SOURCE_SCRAP on each cloned
     * component row. Use that marker as the strongest link back to the exact
     * Engineer Scrap record. The top-level MR remarks normally contain only
     * "Automatically created From Scrap for <MR>", so relying on them alone
     * can leave sourceScrap null and hide all GOOD / reusable serials.
     */
    const sourceScrapSearchText = [
      requestRemarks,
      ...getItems(currentRequest).map(
        (item) => item?.remarks,
      ),
    ]
      .filter(Boolean)
      .join("\n");

    const sourceScrapMatch =
      sourceScrapSearchText.match(
        /(?:SOURCE[_\s]+SCRAP\s*:\s*|Scrap\s+)(OUT-[A-Za-z0-9-]+)/i,
      );

    const sourceScrapCode =
      sourceScrapMatch?.[1] ||
      "";

    const sourceScrap =
      outwardRows.find((entry) => {
        const metadata =
          entry?.inventory_allocations &&
          typeof entry.inventory_allocations ===
            "object"
            ? entry.inventory_allocations
            : {};

        return (
          (
            sourceScrapCode &&
            String(
              entry?.code || "",
            ).trim() ===
              sourceScrapCode
          ) ||
          String(
            metadata?.replacement_mr_id ||
              "",
          ) ===
            String(
              currentRequest?.id || "",
            ) ||
          String(
            metadata?.replacement_mr_number ||
              "",
          )
            .trim()
            .toUpperCase() ===
            currentMrNumber
              .toUpperCase()
        );
      }) || null;

    const metadata =
      sourceScrap
        ?.inventory_allocations &&
      typeof sourceScrap
        .inventory_allocations ===
        "object"
        ? sourceScrap
            .inventory_allocations
        : {};

    const currentRequestItems =
      getItems(currentRequest);

    const originalMrText = [
      requestRemarks,
      currentRequest?.remarks,
      ...currentRequestItems.map(
        (item) =>
          item?.remarks,
      ),
    ]
      .filter(Boolean)
      .join("\n");

    const originalMrMatch =
      originalMrText.match(
        /(?:Original\s+MR\s*:\s*|From\s+Scrap\s+for\s+|SOURCE_MR\s*:\s*)(MR-[A-Za-z0-9_-]+)/i,
      );

    const originalMrNumber =
      String(
        originalMrMatch?.[1] ||
          metadata?.source_mr_number ||
          sourceScrap
            ?.material_request_number ||
          sourceScrap
            ?.materialRequestNumber ||
          "",
      ).trim();

    const originalSummary =
      allMrs.find((request) => {
        const references = [
          request
            ?.material_request_id,
          request?.request_id,
          request?.mr_id,
          request?.id,
        ]
          .filter(
            (value) =>
              value !== undefined &&
              value !== null &&
              String(value).trim(),
          )
          .map((value) =>
            String(value)
              .trim()
              .toUpperCase(),
          );

        return references.includes(
          originalMrNumber
            .toUpperCase(),
        );
      }) ||
      allMrs.find(
        (request) =>
          metadata?.source_mr_id &&
          String(
            request?.id || "",
          ) ===
            String(
              metadata.source_mr_id,
            ),
      ) ||
      null;

    let originalRequest =
      originalSummary;

    if (originalSummary?.id) {
      try {
        originalRequest =
          await fetchAuthenticatedJson(
            `${config.baseURL}/materialrequest/material-requests/${encodeURIComponent(
              originalSummary.id,
            )}/`,
            {
              cache:
                "no-store",
            },
          );
      } catch (_error) {
        originalRequest =
          originalSummary;
      }
    }

    const originalItems =
      getItems(
        originalRequest || {},
      );

    /*
     * Recovered serials are stored in BOTH:
     * 1. Scrap workflow metadata, and
     * 2. FROM_SCRAP_SERIALS marker on the cloned MR item.
     *
     * Merge both. This keeps old and current From-Scrap records readable.
     */
    const markerRecoveredItems =
      currentRequestItems
        .map((item) => {
          const serials =
            parseRecoveredSerialsFromItem(
              item,
            );

          if (!serials.length) {
            return null;
          }

          return {
            ...item,
            serial_numbers:
              serials,
            recovered_serial_numbers:
              serials,
            source:
              "FROM_SCRAP_MARKER",
          };
        })
        .filter(Boolean);

    /*
     * GOOD / reusable serials are authoritative for From-Scrap recovery.
     *
     * IMPORTANT:
     *   good_items / selected_items = GOOD / REUSABLE
     *   scrap_items / reorder_items = DAMAGED / MISSING
     *
     * Never merge reorder_items into recovered serials. Doing that makes the
     * popup (and potentially old UI calculations) treat damaged components as
     * reusable components.
     *
     * Priority:
     *   1. explicit good_items from Scrap workflow metadata
     *   2. FROM_SCRAP_SERIALS marker on the generated MR item
     *   3. selected_items for backward compatibility
     */
    const explicitGoodItems =
      Array.isArray(metadata?.good_items) &&
      metadata.good_items.length
        ? metadata.good_items
        : [];

    const legacyGoodItems =
      Array.isArray(metadata?.selected_items) &&
      metadata.selected_items.length
        ? metadata.selected_items
        : [];

    const recoveredMetadataItems =
      explicitGoodItems.length
        ? explicitGoodItems
        : markerRecoveredItems.length
          ? markerRecoveredItems
          : legacyGoodItems;

    /*
     * ProjectInventory is the backend source of truth for the current
     * From-Scrap MR after Finance routes it through:
     *
     *   Recovered Scrap
     *   + In Store reservation / issue
     *   + Procurement / PO / Inward / QC
     */
    const relevantProjectRows =
      projectRows.filter(
        (projectRow) => {
          const references = [
            projectRow
              ?.source_mr_number,
            projectRow
              ?.material_request_number,
            projectRow
              ?.material_request_id,
            projectRow
              ?.request_id,
            projectRow?.mr_id,
            projectRow
              ?.material_request,
          ]
            .filter(
              (value) =>
                value !== undefined &&
                value !== null &&
                String(value).trim(),
            )
            .map((value) =>
              String(value)
                .trim()
                .toUpperCase(),
            );

          return (
            references.includes(
              currentMrNumber
                .toUpperCase(),
            ) ||
            (
              currentRequest?.id &&
              references.includes(
                String(
                  currentRequest.id,
                )
                  .trim()
                  .toUpperCase(),
              )
            )
          );
        },
      );

    const getPoItems = (
      purchaseOrder = {},
    ) => {
      const candidates = [
        purchaseOrder?.items,
        purchaseOrder?.po_items,
        purchaseOrder
          ?.purchase_order_items,
        purchaseOrder
          ?.purchaseOrderItems,
        purchaseOrder
          ?.components,
      ];

      return (
        candidates.find(
          Array.isArray,
        ) || []
      );
    };

    const activePoStatuses = new Set([
      "PENDING",
      "PENDING_MANAGER",
      "PENDING_FINANCE",
      "FINANCE_APPROVED",
      "APPROVED",
      "ORDERED",
      "PARTIALLY_DELIVERED",
      "DELIVERED",
      "PO_DELIVERED",
      "QC_CHECKED",
      "REPLACEMENT_APPROVED",
      "AWAITING_REPLACEMENT_DELIVERY",
      "REPLACEMENT_PARTIALLY_RECEIVED",
      "REPLACEMENT_RECEIVED",
    ]);

    const relatedPurchaseOrders =
      purchaseOrders.filter(
        (purchaseOrder) => {
          const sourceMr =
            String(
              purchaseOrder
                ?.source_mr_number ||
                purchaseOrder
                  ?.sourceMrNumber ||
                "",
            )
              .trim()
              .toUpperCase();

          if (
            sourceMr !==
            currentMrNumber
              .toUpperCase()
          ) {
            return false;
          }

          const poStatus =
            String(
              purchaseOrder?.status ||
                purchaseOrder
                  ?.approval_status ||
                "",
            )
              .trim()
              .toUpperCase();

          return (
            !poStatus ||
            activePoStatuses.has(
              poStatus,
            )
          );
        },
      );

    const poComponentRows =
      relatedPurchaseOrders.flatMap(
        (purchaseOrder) => {
          const poNumber = String(
            purchaseOrder
              ?.po_number ||
              purchaseOrder?.po ||
              purchaseOrder
                ?.purchase_order_number ||
              purchaseOrder?.id ||
              "",
          ).trim();

          const poStatus = String(
            purchaseOrder?.status ||
              purchaseOrder
                ?.approval_status ||
              "",
          )
            .trim()
            .toUpperCase();

          const poItems =
            getPoItems(
              purchaseOrder,
            );

          return poItems.map(
            (poItem) => ({
              ...poItem,

              __po_id:
                purchaseOrder?.id,

              __po_number:
                poNumber,

              __po_status:
                poStatus,

              __po_expected_delivery:
                poItem
                  ?.expected_delivery_date ||
                purchaseOrder
                  ?.expected_delivery_date ||
                "",
            }),
          );
        },
      );

    const relatedPoIds =
      new Set(
        relatedPurchaseOrders
          .flatMap(
            (purchaseOrder) => [
              purchaseOrder?.id,
              purchaseOrder
                ?.po_number,
              purchaseOrder?.po,
            ],
          )
          .filter(
            (value) =>
              value !== undefined &&
              value !== null &&
              String(value).trim(),
          )
          .map((value) =>
            String(value).trim(),
          ),
      );

    const relatedInwardRows =
      inwardRows.filter(
        (inward) => {
          const references = [
            inward
              ?.purchase_order,
            inward
              ?.purchase_order_id,
            inward
              ?.purchaseOrder,
            inward?.po_number,
            inward?.po,
          ]
            .filter(
              (value) =>
                value !== undefined &&
                value !== null &&
                String(value).trim(),
            )
            .map((value) =>
              String(value).trim(),
            );

          return (
            references.some(
              (value) =>
                relatedPoIds.has(
                  value,
                ),
            ) ||
            String(
              inward
                ?.source_mr_number ||
                inward
                  ?.material_request_number ||
                "",
            )
              .trim()
              .toUpperCase() ===
              currentMrNumber
                .toUpperCase()
          );
        },
      );

    const getInwardPassedRows = (
      inward = {},
    ) => {
      const candidates = [
        inward?.qc_passed_rows,
        inward?.passedRows,
        inward?.passed_rows,
        inward?.qcPassedRows,
        inward?.qc_results
          ?.passedRows,
        inward?.qc_results
          ?.passed_rows,
        inward?.qc?.passedRows,
        inward?.qc?.passed_rows,
      ];

      return (
        candidates.find(
          Array.isArray,
        ) || []
      );
    };

    const getExplicitInwardPassedSerials = (
      inward = {},
    ) =>
      uniqueSerials(
        getInwardPassedRows(
          inward,
        ).flatMap(
          (row) => [
            row?.serialNumber,
            row?.serial_number,
            row?.serial,
          ],
        ),
      );

    /*
     * Use the current MR component rows as the primary group seeds.
     * This guarantees EVERY component in the From-Scrap MR appears,
     * even when it has not yet reached Inventory or Procurement.
     */
    const unionRows = [
      ...currentRequestItems,
      ...originalItems,
      ...recoveredMetadataItems,
      ...relevantProjectRows,
      ...poComponentRows,
      ...relatedInwardRows,
    ];

    const groups = [];

    unionRows.forEach(
      (candidate) => {
        if (!candidate) {
          return;
        }

        const existing =
          groups.find((group) =>
            rowsMatch(
              group.seed,
              candidate,
            ),
          );

        if (existing) {
          existing.rows.push(
            candidate,
          );
        } else {
          groups.push({
            seed:
              candidate,
            rows: [
              candidate,
            ],
          });
        }
      },
    );

    const maxNumeric = (
      rows,
      selectors,
    ) => {
      let maximum = 0;

      rows.forEach((row) => {
        selectors.forEach(
          (selector) => {
            const value =
              typeof selector ===
                "function"
                ? selector(row)
                : row?.[
                    selector
                  ];

            const numeric =
              Number(value);

            if (
              Number.isFinite(
                numeric,
              )
            ) {
              maximum =
                Math.max(
                  maximum,
                  numeric,
                );
            }
          },
        );
      });

      return Math.max(
        maximum,
        0,
      );
    };

    const resultItems =
      groups.map((group) => {
        const originalMatches =
          originalItems.filter(
            (item) =>
              rowsMatch(
                item,
                group.seed,
              ),
          );

        const requestMatches =
          currentRequestItems.filter(
            (item) =>
              rowsMatch(
                item,
                group.seed,
              ),
          );

        const recoveredMatches =
          recoveredMetadataItems.filter(
            (item) =>
              rowsMatch(
                item,
                group.seed,
              ),
          );

        const projectMatches =
          relevantProjectRows.filter(
            (item) =>
              rowsMatch(
                item,
                group.seed,
              ),
          );

        const poMatches =
          poComponentRows.filter(
            (item) =>
              rowsMatch(
                item,
                group.seed,
              ),
          );

        const inwardMatches =
          relatedInwardRows.filter(
            (item) =>
              rowsMatch(
                item,
                group.seed,
              ),
          );

        const allMatches = [
          ...requestMatches,
          ...originalMatches,
          ...recoveredMatches,
          ...projectMatches,
          ...poMatches,
          ...inwardMatches,
          ...group.rows,
        ];

        const componentObject =
          allMatches.find(
            (item) =>
              item?.component &&
              typeof item.component ===
                "object",
          )?.component || {};

        const componentCode =
          String(
            allMatches
              .map(
                (item) =>
                  item
                    ?.component_code ||
                  item
                    ?.componentCode ||
                  item
                    ?.component
                    ?.component_id ||
                  (
                    typeof item
                      ?.component ===
                      "string" &&
                    /^CMP-/i.test(
                      item.component,
                    )
                      ? item.component
                      : ""
                  ),
              )
              .find(Boolean) ||
              componentObject
                ?.component_id ||
              "",
          ).trim();

        const componentName =
          String(
            allMatches
              .map(
                (item) =>
                  item
                    ?.component_name ||
                  item
                    ?.componentName ||
                  item?.name ||
                  item?.label ||
                  item?.component
                    ?.name,
              )
              .find(Boolean) ||
              componentObject?.name ||
              "Component",
          ).trim();

        const category =
          String(
            allMatches
              .map(
                (item) =>
                  item?.category ||
                  item
                    ?.component_category ||
                  item?.component
                    ?.category,
              )
              .find(Boolean) ||
              "",
          ).trim();

        const sourceBomRequiredQty =
          originalMatches.reduce(
            (total, item) =>
              total +
              getQuantity(item),
            0,
          );

        const requestQtyFromItems =
          requestMatches.reduce(
            (total, item) =>
              total +
              getQuantity(item),
            0,
          );

        const requestQtyFromProject =
          maxNumeric(
            projectMatches,
            [
              "requested_quantity",
              "requestedQuantity",
            ],
          );

        /*
         * Source BOM/R&D quantity is authoritative.
         *
         * Example:
         *   Source BOM Requested = 10
         *   Legacy derived row   = 6 recovered
         *
         * The popup must still show Required = 10.
         */
        const requestQty =
          sourceBomRequiredQty ||
          requestQtyFromItems ||
          requestQtyFromProject ||
          0;

        const recoveredSerials =
          uniqueSerials(
            recoveredMatches.flatMap(
              (item) => [
                item
                  ?.recovered_serial_numbers,
                item?.serial_numbers,
                item?.serials,
                item
                  ?.selected_serials,
                item
                  ?.issued_serial_numbers,
              ],
            ),
          );

        const recoveredSet =
          new Set(
            recoveredSerials.map(
              (serial) =>
                String(
                  serial,
                ).trim(),
            ),
          );

        const rawIssuedStoreSerials =
          uniqueSerials(
            projectMatches.flatMap(
              (item) => [
                item
                  ?.issued_store_serials,
                item
                  ?.issuedStoreSerials,
                item
                  ?.store_issued_serials,
                item
                  ?.storeIssuedSerials,
              ],
            ),
          );

        /*
         * Recovered Scrap serials are already shown in their own column.
         * If the backend also records them under issued_store_serials,
         * do not repeat them as "New In Store".
         */
        const issuedStoreSerials =
          rawIssuedStoreSerials
            .filter(
              (serial) =>
                !recoveredSet.has(
                  String(
                    serial,
                  ).trim(),
                ),
            );

        const reservedStoreTotal =
          Math.max(
            maxNumeric(
              projectMatches,
              [
                "reserved_store_quantity",
                "store_quantity",
              ],
            ),
            maxNumeric(
              requestMatches,
              [
                "reserved_store_quantity",
                "reservedStoreQuantity",
              ],
            ),
          );

        /*
         * Backend reservation contains ONLY the additional Central
         * In-Store quantity needed after Scrap recovery.
         */
        const additionalStoreReservedQuantity =
          Math.max(
            reservedStoreTotal,
            0,
          );

        const rawIssuedStoreQuantity =
          maxNumeric(
            projectMatches,
            [
              "issued_store_quantity",
              "issuedStoreQuantity",
            ],
          );

        const additionalStoreIssuedQuantity =
          Math.max(
            issuedStoreSerials.length,
            rawIssuedStoreQuantity -
              recoveredSerials.length,
            0,
          );

        const procurementShortageQuantity =
          Math.max(
            maxNumeric(
              projectMatches,
              [
                "procurement_shortage_quantity",
                "procurementShortageQuantity",
              ],
            ),
            maxNumeric(
              requestMatches,
              [
                "procurement_shortage_quantity",
                "procurementShortageQuantity",
              ],
            ),
          );

        const poDetailsMap =
          new Map();

        poMatches.forEach(
          (item) => {
            const poNumber =
              String(
                item
                  ?.__po_number ||
                  "",
              ).trim();

            if (!poNumber) {
              return;
            }

            const status =
              String(
                item
                  ?.__po_status ||
                  "",
              )
                .trim()
                .toUpperCase();

            const expectedDelivery =
              String(
                item
                  ?.__po_expected_delivery ||
                  "",
              ).trim();

            const quantity =
              Math.max(
                Number(
                  item?.quantity ??
                    item?.qty ??
                    0,
                ) || 0,
                0,
              );

            const existing =
              poDetailsMap.get(
                poNumber,
              ) || {
                po_number:
                  poNumber,
                status,
                expected_delivery_date:
                  expectedDelivery,
                quantity: 0,
              };

            existing.quantity +=
              quantity;

            if (status) {
              existing.status =
                status;
            }

            if (
              expectedDelivery
            ) {
              existing
                .expected_delivery_date =
                expectedDelivery;
            }

            poDetailsMap.set(
              poNumber,
              existing,
            );
          },
        );

        projectMatches.forEach(
          (item) => {
            const poNumbers =
              Array.isArray(
                item?.po_numbers,
              )
                ? item.po_numbers
                : splitSerials(
                    item?.po_numbers,
                  );

            poNumbers.forEach(
              (poNumber) => {
                const normalized =
                  String(
                    poNumber || "",
                  ).trim();

                if (
                  normalized &&
                  !poDetailsMap.has(
                    normalized,
                  )
                ) {
                  poDetailsMap.set(
                    normalized,
                    {
                      po_number:
                        normalized,
                      status: "",
                      expected_delivery_date:
                        "",
                      quantity: 0,
                    },
                  );
                }
              },
            );
          },
        );

        const poDetails =
          Array.from(
            poDetailsMap.values(),
          );

        const poNumbers =
          poDetails.map(
            (item) =>
              item.po_number,
          );

        const poRaisedQuantity =
          Math.max(
            poDetails.reduce(
              (total, item) =>
                total +
                Math.max(
                  Number(
                    item.quantity ||
                      0,
                  ) || 0,
                  0,
                ),
              0,
            ),
            maxNumeric(
              requestMatches,
              [
                "po_raised_quantity",
                "poRaisedQuantity",
              ],
            ),
          );

        const inwardCodes =
          uniqueSerials([
            ...projectMatches.flatMap(
              (item) => [
                item
                  ?.inward_codes,
              ],
            ),
            ...inwardMatches.map(
              (item) =>
                item?.code ||
                item
                  ?.inward_code ||
                item?.grn ||
                "",
            ),
          ]);

        const purchasedSerials =
          uniqueSerials([
            ...projectMatches.flatMap(
              (item) => [
                item
                  ?.purchased_serial_numbers,
                item
                  ?.available_purchased_serials,
                item
                  ?.issued_purchased_serials,
              ],
            ),
            ...inwardMatches.flatMap(
              (item) =>
                getExplicitInwardPassedSerials(
                  item,
                ),
            ),
          ]);

        const issuedPurchasedSerials =
          uniqueSerials(
            projectMatches.flatMap(
              (item) => [
                item
                  ?.issued_purchased_serials,
                item
                  ?.issuedPurchasedSerials,
                item
                  ?.purchased_issued_serials,
                item
                  ?.purchasedIssuedSerials,
              ],
            ),
          );

        const qcPassedQuantity =
          Math.max(
            maxNumeric(
              projectMatches,
              [
                "qc_passed_quantity",
                "purchased_quantity",
              ],
            ),
            purchasedSerials.length,
          );

        const qcFailedQuantity =
          maxNumeric(
            projectMatches,
            [
              "qc_failed_quantity",
            ],
          );

        const issuedPurchasedQuantity =
          Math.max(
            maxNumeric(
              projectMatches,
              [
                "issued_purchased_quantity",
                "issuedPurchasedQuantity",
              ],
            ),
            issuedPurchasedSerials.length,
          );

        const allInDroneSerials =
          uniqueSerials([
            ...recoveredSerials,
            ...issuedStoreSerials,
            ...issuedPurchasedSerials,
          ]);

        const fulfilledQuantity =
          recoveredSerials.length +
          additionalStoreIssuedQuantity +
          issuedPurchasedQuantity;

        const sourceParts = [];

        if (
          recoveredSerials.length
        ) {
          sourceParts.push(
            "Recovered Scrap",
          );
        }

        if (
          additionalStoreReservedQuantity >
            0 ||
          additionalStoreIssuedQuantity >
            0
        ) {
          sourceParts.push(
            "In Store",
          );
        }

        if (
          procurementShortageQuantity >
            0 ||
          poNumbers.length > 0 ||
          qcPassedQuantity > 0
        ) {
          sourceParts.push(
            "Procurement / PO",
          );
        }

        const missingQuantity =
          Math.max(
            requestQty -
              recoveredSerials.length,
            0,
          );

        let workflowStatus =
          "Pending";

        if (
          requestQty > 0 &&
          fulfilledQuantity >=
            requestQty
        ) {
          workflowStatus =
            "All Components Issued";
        } else if (
          fulfilledQuantity > 0
        ) {
          workflowStatus =
            "Partially Issued";
        } else if (
          qcPassedQuantity >
          issuedPurchasedQuantity
        ) {
          workflowStatus =
            "QC Passed - Inventory Issue Pending";
        } else if (
          poNumbers.length > 0
        ) {
          const normalizedStatuses =
            poDetails
              .map((item) =>
                String(
                  item.status ||
                    "",
                )
                  .trim()
                  .toUpperCase(),
              )
              .filter(Boolean);

          if (
            normalizedStatuses.some(
              (value) =>
                [
                  "DELIVERED",
                  "PO_DELIVERED",
                  "QC_CHECKED",
                ].includes(
                  value,
                ),
            )
          ) {
            workflowStatus =
              "PO Delivered / QC";
          } else if (
            normalizedStatuses.some(
              (value) =>
                value ===
                "ORDERED",
            )
          ) {
            workflowStatus =
              "PO Ordered";
          } else {
            workflowStatus =
              "PO Raised";
          }
        } else if (
          procurementShortageQuantity >
          0
        ) {
          workflowStatus =
            "Procurement Pending";
        } else if (
          additionalStoreReservedQuantity >
          additionalStoreIssuedQuantity
        ) {
          workflowStatus =
            "Inventory Check / Reserved In Store";
        } else if (
          missingQuantity > 0 &&
          additionalStoreReservedQuantity <= 0 &&
          procurementShortageQuantity <= 0 &&
          poNumbers.length <= 0
        ) {
          workflowStatus =
            "Missing Qty - Routing Required";
        } else if (
          recoveredSerials.length >
          0
        ) {
          workflowStatus =
            "Recovered From Scrap";
        }

        return {
          component_id:
            allMatches
              .map(
                (item) =>
                  item?.component_id ||
                  item?.componentId ||
                  (
                    typeof item
                      ?.component ===
                      "object"
                      ? item.component
                          ?.id
                      : item
                          ?.component
                  ),
              )
              .find(
                (value) =>
                  value !== undefined &&
                  value !== null &&
                  String(value).trim(),
              ) || "",

          component_code:
            componentCode,

          component_name:
            componentName,

          category,

          source_bom_required_quantity:
            sourceBomRequiredQty,

          request_quantity:
            requestQty,

          recovered_quantity:
            recoveredSerials.length,

          recovered_serial_numbers:
            recoveredSerials,

          /*
           * GOOD / reusable quantity is fulfilled immediately from Scrap.
           * Only remaining_quantity is allowed to enter normal In Store /
           * Procurement routing.
           */
          good_reusable_quantity:
            recoveredSerials.length,

          good_reusable_serial_numbers:
            recoveredSerials,

          missing_quantity:
            Math.max(
              requestQty -
                recoveredSerials.length,
              0,
            ),

          remaining_quantity:
            Math.max(
              requestQty -
                recoveredSerials.length,
              0,
            ),

          reserved_store_quantity:
            additionalStoreReservedQuantity,

          issued_store_quantity:
            additionalStoreIssuedQuantity,

          issued_store_serials:
            issuedStoreSerials,

          procurement_shortage_quantity:
            procurementShortageQuantity,

          po_raised_quantity:
            poRaisedQuantity,

          po_numbers:
            poNumbers,

          po_details:
            poDetails,

          inward_codes:
            inwardCodes,

          qc_passed_quantity:
            qcPassedQuantity,

          qc_failed_quantity:
            qcFailedQuantity,

          purchased_serial_numbers:
            purchasedSerials,

          issued_purchased_quantity:
            issuedPurchasedQuantity,

          issued_purchased_serials:
            issuedPurchasedSerials,

          all_in_drone_serials:
            allInDroneSerials,

          source:
            sourceParts.length
              ? sourceParts.join(
                  " + ",
                )
              : "Pending",

          workflow_status:
            workflowStatus,
        };
      });

    return {
      request:
        currentRequest,

      sourceScrap,

      originalRequest,

      originalMrNumber,

      project:
        currentRequest
          ?.project_name ||
        currentRequest
          ?.projectName ||
        currentRequest?.project ||
        originalRequest
          ?.project_name ||
        originalRequest
          ?.projectName ||
        originalRequest?.project ||
        "",

      items:
        resultItems,
    };
  };


  const loadPhysicalDroneInstances = async (requestLike = {}) => {
    const mrNumber = String(
      requestLike?.material_request_id ||
        requestLike?.request_id ||
        requestLike?.mr_id ||
        "",
    ).trim();

    if (!mrNumber) return [];

    try {
      const payload = await fetchAuthenticatedJson(
        `${config.baseURL}/inventory/project-inventory/drone-instances/?material_request=${encodeURIComponent(mrNumber)}`,
        { cache: "no-store" },
      );
      return Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.results)
          ? payload.results
          : [];
    } catch (error) {
      // Physical instances are created only after an MR is fully issued.
      return [];
    }
  };

  const renderPhysicalDroneInstances = (instances = []) => {
    if (!Array.isArray(instances) || instances.length === 0) return null;

    return (
      <div className="border-b border-gray-100 px-6 py-4 dark:border-slate-800">
        <div className="mb-3">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Physical Drone Instances
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Each _01 / _02 row is one physical drone under this MR. Component serials are permanently separated per drone.
          </p>
        </div>

        <div className="space-y-3">
          {instances.map((instance) => {
            const allocations = Array.isArray(instance?.component_allocations)
              ? instance.component_allocations
              : [];
            return (
              <details
                key={instance?.id || instance?.instance_code}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="font-semibold text-primary">
                    {instance?.material_request_number || "MR"} / {instance?.suffix || `_${String(instance?.sequence || 1).padStart(2, "0")}`}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      Drone Qty: 1
                    </span>
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                      {instance?.status_label || instance?.status || "Available"}
                    </span>
                  </div>
                </summary>

                <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-700">
                  <table className="min-w-[1100px] w-full text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-900">
                      <tr>
                        <th className="px-3 py-3 text-center">Component ID</th>
                        <th className="px-3 py-3 text-center">Component</th>
                        <th className="px-3 py-3 text-center">Specification</th>
                        <th className="px-3 py-3 text-center">Category</th>
                        <th className="px-3 py-3 text-center">Qty</th>
                        <th className="px-3 py-3 text-center">UOM</th>
                        <th className="px-3 py-3 text-center">Exact Serial(s)</th>
                        <th className="px-3 py-3 text-center">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {allocations.map((allocation) => {
                        const source = allocation?.source_details || {};
                        const sources = [];
                        if ((source?.from_scrap_serials || []).length) sources.push("Reused Scrap");
                        if ((source?.store_serials || []).length) sources.push("In Store");
                        if ((source?.purchased_serials || []).length) sources.push("PO / QC Passed");
                        return (
                          <tr key={allocation?.id || allocation?.component}>
                            <td className="px-3 py-3 text-center font-semibold text-primary">{allocation?.component_code || "-"}</td>
                            <td className="px-3 py-3 text-center">{allocation?.component_name || "-"}</td>
                            <td className="px-3 py-3 text-center">{allocation?.specification || "-"}</td>
                            <td className="px-3 py-3 text-center">{allocation?.category || "-"}</td>
                            <td className="px-3 py-3 text-center font-bold">{Number(allocation?.quantity || 0)}</td>
                            <td className="px-3 py-3 text-center">{allocation?.uom || "-"}</td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap justify-center gap-1">
                                {(allocation?.serial_numbers || []).length
                                  ? allocation.serial_numbers.map((serial) => (
                                      <span key={serial} className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 font-semibold text-sky-700">
                                        {serial}
                                      </span>
                                    ))
                                  : "-"}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center">{sources.join(" + ") || "Assigned"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    );
  };

  async function handleFromScrapClick(row) {
    if (!row?.id) {
      return;
    }

    setScrapMrLoading(true);
    setScrapMrDetails(null);
    setShowScrapMrModal(true);

    try {
      const details =
        await loadFromScrapDisplayDetails(
          row,
        );

      const droneInstances = await loadPhysicalDroneInstances(
        details?.request || row,
      );

      setScrapMrDetails({
        ...details,
        drone_instances: droneInstances,
      });
    } catch (error) {
      console.error(
        "Failed to load From Scrap MR details:",
        error,
      );

      setScrapMrDetails({
        request: row,
        sourceScrap: null,
        originalRequest: null,
        originalMrNumber: "",
        items: [],
        error:
          error?.message ||
          "Unable to load From Scrap details.",
      });
    } finally {
      setScrapMrLoading(false);
    }
  }

  async function handleBomClick(row) {
    try {
      await loadInventoryCounts();

      const requestData = await fetchAuthenticatedJson(
        `${`${config.baseURL}/materialrequest/material-requests/`}${row.id}/`,
      );

      await loadProjectInventoryForRequest(requestData);

      const requestItems = Array.isArray(requestData?.bom_items)
        ? requestData.bom_items
        : Array.isArray(requestData?.items)
        ? requestData.items
        : [];

      if (requestItems.length) {
        const normalizedItems = requestItems.map((item) => normalizeRequestItem(item));

        setBomDetails({
          bom_name:
            row?.bom_name ||
            row?.bom ||
            requestData.bom_name ||
            requestData.name ||
            "BOM Details",
          items: normalizedItems,
          // Attach the full request payload so modal can evaluate approval conditions
          request: requestData,
        });
        setShowBomModal(true);
        return;
      }

      const bomId = row?.bom || row?.bom_id || row?.bom_code || row?.bom_number;
      const res = await fetch(`${`${config.baseURL}/bom/bom/`}${bomId}/`);

      if (!res.ok) throw new Error("Failed to load BOM details");

      const data = await res.json();
      const items = Array.isArray(data?.bom_items)
        ? data.bom_items
        : Array.isArray(data?.items)
        ? data.items
        : [];

      const normalizedItems = items.map((item) => {
        const code =
          item.component_code || item.component || item.component_id || item.item_code || "";
        const name =
          item.component_name ||
          item.name ||
          item.component ||
          item.component_code ||
          "";
        const quantity = Number(item.quantity ?? item.qty ?? 0);
        const price = Number(
          item.price ?? item.total_price ?? item.totalPrice ?? item.line_total ?? 0,
        );
        const unit_price = Number(
          item.unit_price ?? item.unitPrice ??
            (quantity ? price / quantity : 0) ??
            0,
        );
        const finalPrice = price || quantity * unit_price;
        const tax = Number(item.tax ?? item.gst ?? 0);
        const total = Number(
          item.total ?? item.grand_total ?? finalPrice + (finalPrice * tax) / 100,
        );
        const componentLookup = componentsMap[String(code)] || {};

      return {
          component_code: String(code),
          component_name: componentLookup.name || name || "Unknown Component",
          category: componentLookup.category || item.category || "",
          specification:
              componentLookup.specification ||
              item.specification ||
              item.specifications ||
              "",
          quantity,
          unit: item.unit || item.uom || "pc",
          unit_price,
          price: finalPrice,
          tax,
          total,
          remarks: item.remarks || "",
        };
      });

      setBomDetails({
        bom_name: data.bom_name || data.name || "BOM Details",
        items: normalizedItems,
        request: row,
      });
      setShowBomModal(true);
    } catch (err) {
      console.error("Failed to load BOM details", err);
    }
  }

  const getRequestDetailItems = (request = {}) => {
    const itemCollections = [
      request?.bom_items,
      request?.custom_bom_items,
      request?.rd_items,
      request?.request_items,
      request?.items,
    ];

    return itemCollections
      .filter(Array.isArray)
      .flat()
      .filter(Boolean)
      .map((item) => normalizeRequestItem(item));
  };

  async function handleRequestDetailsClick(row) {
    /*
     * From-Scrap has its own fulfillment popup because it must show the
     * three-way split:
     *
     *   GOOD / reusable Scrap
     *   + Central In Store reservation/issue
     *   + Procurement / PO shortage
     *
     * Do not open the generic BOM popup for this request type.
     */
    if (isFromScrapRequest(row)) {
      await handleFromScrapClick(row);
      return;
    }

    try {
      const requestId = row?.id;

      if (!requestId) {
        return;
      }

      await loadInventoryCounts();

      const requestData = await fetchAuthenticatedJson(
        `${`${config.baseURL}/materialrequest/material-requests/`}${requestId}/`,
      );

      await loadProjectInventoryForRequest(requestData);

      const droneInstances = await loadPhysicalDroneInstances(requestData);

      const normalizedItems = getRequestDetailItems(requestData);
      const derivedType = String(
        requestData?.request_type || row?.request_type || "",
      )
        .trim()
        .toUpperCase();

      const isCustomBom =
        derivedType === "BOM" &&
        (
          requestData?.customized_bom === true ||
          requestData?.customized_bom === "true" ||
          requestData?.customized_bom === 1 ||
          requestData?.customized_bom === "1" ||
          row?.customized_bom === true ||
          row?.customized_bom === "true" ||
          row?.customized_bom === 1 ||
          row?.customized_bom === "1"
        );

      const typeTitle =
        derivedType === "R&D" || derivedType === "RD"
          ? "R & D Details"
          : isCustomBom
            ? "Custom BOM Details"
          : derivedType === "RETURNABLE"
            ? `${String(
                requestData?.returnable_purpose ||
                  row?.returnable_purpose ||
                  "Returnable",
              )
                .replaceAll("_", " ")
                .toLowerCase()
                .replace(/\b\w/g, (character) => character.toUpperCase())} Details`
            : derivedType === "RETAIL_SALES"
              ? "Retail Sales Details"
              : derivedType === "BOM"
                ? "BOM Details"
                : `${requestData?.request_type || row?.request_type || "Request"} Details`;

      setBomDetails({
        bom_name:
          requestData?.bom_name ||
          row?.bom_name ||
          requestData?.name ||
          typeTitle,
        items: normalizedItems,
        request: requestData,
        title: typeTitle,
        drone_instances: droneInstances,
      });
      setRdDetails(null);
      setShowBomModal(true);
    } catch (err) {
      console.error("Failed to load MR details", err);
    }
  }

  async function handleRdClick(id) {
    try {
      await loadInventoryCounts();

      const data = await fetchAuthenticatedJson(
        `${`${config.baseURL}/materialrequest/material-requests/`}${id}/`,
      );

      await loadProjectInventoryForRequest(data);

      const items = Array.isArray(data?.rd_items)
        ? data.rd_items
        : Array.isArray(data?.bom_items)
          ? data.bom_items
          : Array.isArray(data?.items)
            ? data.items
            : [];

      const normalizedItems = items.map((item) => normalizeRequestItem(item));

      setRdDetails({
        ...data,
        rd_items: normalizedItems,
      });
      setShowBomModal(true);
    } catch (err) {
      console.error("Failed to load R&D details", err);
    }
  }

  const handleDeleteSelected = async () => {
    if (!canAdministerMR) {
      return;
    }

    if (!selectedRowKeys.length) return;

    const confirmed = window.confirm(
      `Delete ${selectedRowKeys.length} selected Material Request(s)?`
    );

    if (!confirmed) return;

    const results = await Promise.all(
      selectedRowKeys.map(async (id) => {
        try {
          const responseData =
            await fetchAuthenticatedJson(
              `${config.baseURL}/materialrequest/material-requests/${encodeURIComponent(
                id
              )}/`,
              {
                method: "DELETE",
              },
            );

          return {
            id: String(id),
            success: true,
            status: 200,
            message:
              responseData?.detail ||
              "Deleted successfully.",
          };
        } catch (error) {
          return {
            id: String(id),
            success: false,
            status: 0,
            message:
              error?.message ||
              "Unable to reach the backend.",
          };
        }
      })
    );

    const successfulResults = results.filter(
      (result) => result.success
    );

    const failedResults = results.filter(
      (result) => !result.success
    );

    if (successfulResults.length) {
      window.dispatchEvent(
        new Event("notificationsUpdated")
      );
    }

    await loadRequests();

    if (failedResults.length) {
      const failedIds = failedResults.map(
        (result) => result.id
      );

      setSelectedRowKeys(failedIds);
      setSelectionMode(true);

      const failureMessage = failedResults
        .map(
          (result) =>
            `MR database ID ${result.id}: ${result.message}`
        )
        .join("\\n");

      alert(
        `${successfulResults.length} request(s) deleted. ` +
          `${failedResults.length} request(s) could not be deleted.\\n\\n` +
          failureMessage
      );

      console.error(
        "Material Request deletion failures:",
        failedResults
      );

      return;
    }

    setSelectedRowKeys([]);
    setSelectionMode(false);

    alert(
      `${successfulResults.length} Material Request(s) deleted successfully.`
    );
  };

  const handleDeleteMode = () => {
    if (!canManageMR) {
      return;
    }

    setSelectedRowKeys([]);
    setSelectionMode(true);
  };

  const handleCancelDeleteMode = () => {
    setSelectedRowKeys([]);
    setSelectionMode(false);
  };

  useEffect(() => {
    void loadRequests();
  }, [
    location.state,
    materialRequestsPage,
    materialRequestsOrdering,
    debouncedMaterialRequestsColumnFilters,
  ]);

  const loadRequests = async () => {
    setRequestsLoading(true);
    setRequestsError("");

    try {
      const params = new URLSearchParams({
        summary: "1",
        paginate: "1",
        page: String(materialRequestsPage),
        page_size: String(MATERIAL_REQUESTS_PAGE_SIZE),
        hide_drone_returnable_source: "1",
      });

      if (materialRequestsOrdering) {
        params.set("ordering", materialRequestsOrdering);
      }

      Object.entries(
        debouncedMaterialRequestsColumnFilters || {},
      ).forEach(([key, rawValue]) => {
        const value = String(rawValue ?? "").trim();

        if (value) {
          params.set(`filter_${key}`, value);
        }
      });

      const data = await fetchAuthenticatedJson(
        `${config.baseURL}/materialrequest/material-requests/?${params.toString()}`,
        { cache: "no-store" },
      );

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
          ? data.results
          : [];
      if (Array.isArray(data)) {
        setMaterialRequestsTotalCount(list.length);
        setMaterialRequestsHasNextPage(false);
        setMaterialRequestsHasPreviousPage(false);
      } else {
        setMaterialRequestsTotalCount(Number(data?.count || 0));
        setMaterialRequestsHasNextPage(Boolean(data?.next));
        setMaterialRequestsHasPreviousPage(Boolean(data?.previous));
      }

      const detailedRequests = list;
      const hasFromScrapRows = detailedRequests.some((request) =>
        isFromScrapRequest(request),
      );

      let projectMasterPayload = [];
      let bomMasterPayload = [];

      /*
       * Project/BOM masters are needed only for From-Scrap display.
       */
      if (hasFromScrapRows) {
        [projectMasterPayload, bomMasterPayload] = await Promise.all([
          fetchAllPaginatedResults(
            `${config.baseURL}/projects/projects/`,
            { cache: "no-store" },
          ).catch((error) => {
            console.warn(
              "Unable to load Project Master for From Scrap rows:",
              error,
            );
            return [];
          }),
          fetchAllPaginatedResults(
            `${config.baseURL}/bom/bom/?summary=1`,
            { cache: "no-store" },
          ).catch((error) => {
            console.warn(
              "Unable to load BOM Master for From Scrap rows:",
              error,
            );
            return [];
          }),
        ]);
      }

const toMasterList = (payload) =>
  Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : [];

const projectNameByReference = new Map();
toMasterList(projectMasterPayload).forEach((project) => {
  const projectName = getProjectDisplayValue(project);
  if (!projectName) return;

  [
    project?.id,
    project?.pk,
    project?.project_id,
    project?.project_code,
    project?.code,
    projectName,
  ]
    .filter((value) => value !== undefined && value !== null && String(value).trim())
    .forEach((value) => {
      projectNameByReference.set(normalizeMrReference(value), projectName);
    });
});

const bomNameByReference = new Map();
toMasterList(bomMasterPayload).forEach((bom) => {
  const bomName = String(
    bom?.bom_name || bom?.name || bom?.title || "",
  ).trim();
  if (!bomName) return;

  [
    bom?.id,
    bom?.pk,
    bom?.bom_id,
    bom?.bom_number,
    bom?.code,
    bomName,
  ]
    .filter((value) => value !== undefined && value !== null && String(value).trim())
    .forEach((value) => {
      bomNameByReference.set(normalizeMrReference(value), bomName);
    });
});

const resolveProjectName = (value) => {
  const displayValue = getProjectDisplayValue(value);
  if (!displayValue) return "";

  return (
    projectNameByReference.get(normalizeMrReference(displayValue)) ||
    displayValue
  );
};

const resolveBomName = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const objectName = String(
      value?.bom_name || value?.name || value?.title || "",
    ).trim();
    if (objectName) return objectName;

    value = value?.id ?? value?.pk ?? value?.bom_number ?? value?.code;
  }

  const reference = String(value ?? "").trim();
  if (!reference) return "";

  return (
    bomNameByReference.get(normalizeMrReference(reference)) ||
    (/^\d+$/.test(reference) ? "" : reference)
  );
};

/*
 * FROM-SCRAP ROW DISPLAY
 * ----------------------
 * A From-Scrap MR is a rebuild of the original MR. The table row must
 * therefore keep the ORIGINAL/SOURCE MR project and drone quantity.
 *
 * Some old/new records expose SOURCE_MR in remarks, while current Scrap
 * workflow metadata can expose replacement_mr_number -> source_mr_number.
 * Resolve both so _PR / _FR / legacy _FS rows all display correctly.
 */
let outwardRowsForSourceLookup = [];

if (hasFromScrapRows) {
  try {
    outwardRowsForSourceLookup = await fetchAllPaginatedResults(
      `${config.baseURL}/outward/?from_scrap=1`,
      { cache: "no-store" },
    );
  } catch (sourceLookupError) {
    console.warn(
      "Unable to load Scrap source metadata for MR row display:",
      sourceLookupError,
    );
  }
}

const requestByReference =
  new Map();

detailedRequests.forEach(
  (request) => {
    [
      request?.id,
      request?.pk,
      request?.material_request_id,
      request?.request_id,
      request?.mr_id,
      request?.mr_number,
    ]
      .filter(
        (value) =>
          value !== undefined &&
          value !== null &&
          String(value).trim(),
      )
      .forEach(
        (value) => {
          requestByReference.set(
            normalizeMrReference(
              value,
            ),
            request,
          );
        },
      );
  },
);

const sourceMetadataByReplacementMr =
  new Map();

outwardRowsForSourceLookup.forEach(
  (entry) => {
    const metadata =
      entry?.inventory_allocations &&
      typeof entry.inventory_allocations ===
        "object" &&
      !Array.isArray(
        entry.inventory_allocations,
      )
        ? entry.inventory_allocations
        : {};

    const replacementReferences = [
      metadata?.replacement_mr_number,
      metadata?.replacementMrNumber,
      metadata?.replacement_mr_id,
      metadata?.replacementMrId,
    ]
      .filter(
        (value) =>
          value !== undefined &&
          value !== null &&
          String(value).trim(),
      );

    replacementReferences.forEach(
      (value) => {
        sourceMetadataByReplacementMr.set(
          normalizeMrReference(
            value,
          ),
          metadata,
        );
      },
    );
  },
);

const displayReadyRequests =
  await Promise.all(
    detailedRequests.map(
    async (request) => {
      if (
        !isFromScrapRequest(
          request,
        )
      ) {
        return request;
      }

      const currentReferences = [
        request?.material_request_id,
        request?.request_id,
        request?.id,
        request?.pk,
      ]
        .filter(
          (value) =>
            value !== undefined &&
            value !== null &&
            String(value).trim(),
        )
        .map(
          normalizeMrReference,
        );

      let sourceMetadata = {};

      for (
        const reference of
        currentReferences
      ) {
        if (
          sourceMetadataByReplacementMr.has(
            reference,
          )
        ) {
          sourceMetadata =
            sourceMetadataByReplacementMr.get(
              reference,
            ) || {};
          break;
        }
      }

      const sourceMrNumber =
        getFromScrapSourceMrNumber(
          request,
          sourceMetadata,
        );

      let sourceRequest =
        requestByReference.get(
          normalizeMrReference(
            sourceMrNumber,
          ),
        ) || null;

      if (!sourceRequest && sourceMrNumber) {
        try {
          const sourceParams = new URLSearchParams({
            summary: "1",
            paginate: "1",
            page: "1",
            page_size: "5",
            search: sourceMrNumber,
          });

          const sourcePayload = await fetchAuthenticatedJson(
            `${config.baseURL}/materialrequest/material-requests/?${sourceParams.toString()}`,
            { cache: "no-store" },
          );

          const sourceRows = Array.isArray(sourcePayload)
            ? sourcePayload
            : Array.isArray(sourcePayload?.results)
              ? sourcePayload.results
              : [];

          sourceRequest = sourceRows.find(
            (candidate) =>
              normalizeMrReference(
                candidate?.material_request_id || candidate?.request_id,
              ) === normalizeMrReference(sourceMrNumber),
          ) || null;
        } catch (sourceSearchError) {
          console.warn(
            `Unable to search source MR ${sourceMrNumber}:`,
            sourceSearchError,
          );
        }
      }

      /*
       * A processed Scrap/Outward row may no longer be present in the normal
       * MR list response. In that case, load its original MR directly using
       * source_mr_id stored in inventory_allocations.
       */
      const sourceMrDatabaseId =
        sourceMetadata?.source_mr_id ??
        sourceMetadata?.sourceMrId ??
        null;

      if (!sourceRequest && sourceMrDatabaseId) {
        try {
          sourceRequest = await fetchAuthenticatedJson(
            `${config.baseURL}/materialrequest/material-requests/${encodeURIComponent(
              sourceMrDatabaseId,
            )}/`,
            {
              cache: "no-store",
            },
          );

          if (sourceRequest) {
            [
              sourceRequest?.id,
              sourceRequest?.pk,
              sourceRequest?.material_request_id,
              sourceRequest?.request_id,
            ]
              .filter(
                (value) =>
                  value !== undefined &&
                  value !== null &&
                  String(value).trim(),
              )
              .forEach((value) => {
                requestByReference.set(
                  normalizeMrReference(value),
                  sourceRequest,
                );
              });
          }
        } catch (sourceRequestError) {
          console.warn(
            `Unable to load source MR ${sourceMrDatabaseId}:`,
            sourceRequestError,
          );
        }
      }

      const sourceProject =
        resolveProjectName(
          firstNonEmptyValue(
            sourceRequest?.project_name,
            sourceRequest?.projectName,
            sourceRequest?.project,
            sourceMetadata?.source_mr_project_name,
            sourceMetadata?.source_project_name,
            request?.project_name,
            request?.projectName,
            request?.project,
          ),
        );

      const sourceDroneQty = Number(
        sourceRequest?.required_quantity ??
          sourceRequest?.drone_quantity ??
          sourceRequest?.droneQuantity ??
          sourceMetadata?.source_mr_required_quantity ??
          sourceMetadata?.source_drone_quantity ??
          request?.required_quantity ??
          request?.drone_quantity ??
          0,
      );

      const sourceRequestType = String(
        sourceRequest?.request_type ||
          sourceMetadata?.source_mr_request_type ||
          "",
      )
        .trim()
        .toUpperCase();

      const sourceBomName =
        sourceRequestType === "R&D" ||
        sourceRequestType === "RD"
          ? ""
          : resolveBomName(
              firstNonEmptyValue(
                sourceRequest?.bom_name,
                sourceRequest?.bom,
                sourceMetadata?.source_mr_bom_name,
                sourceMetadata?.source_mr_bom,
                request?.bom_name,
                request?.bom,
              ),
            );

      return {
        ...request,

        from_scrap_source_mr_number:
          sourceMrNumber,

        from_scrap_source_project:
          sourceProject,

        from_scrap_source_drone_quantity:
          (
            Number.isFinite(
              sourceDroneQty,
            ) &&
            sourceDroneQty > 0
          )
            ? sourceDroneQty
            : null,

        from_scrap_source_request_type:
          sourceRequestType,

        from_scrap_source_bom:
          sourceBomName,
      };
    },
  ));

    const normalized = displayReadyRequests.map((item) => ({
        ...item,
        visible_status: getVisibleApprovalStatus(item),
        rejectedBy:
          item.rejected_by ||
          item.rejectedBy ||
          item.rejected_by_role ||
          item.rejectedByRole ||
          item.rejected_by_role_name ||
          item.rejectedByRoleName ||
          item.rejected_by_user ||
          item.rejectedByUser ||
          item.rejected_by_name ||
          item.rejectedByName ||
          item.rejected_by_fullname ||
          item.rejectedByFullName ||
          "",
        rejectionReason:
          item.rejection_reason ||
          item.rejectionReason ||
          item.reject_reason ||
          item.rejectReason ||
          item.reject_note ||
          item.rejectNote ||
          item.rejection_notes ||
          item.rejectionNotes ||
          item.reject_notes ||
          item.rejectNotes ||
          item.rejection_remark ||
          item.rejectionRemark ||
          item.approval_note ||
          item.approvalNote ||
          item.reason ||
          "",
      }));



      /*
       * DRONE Returnable source visibility is already handled by Django
       * before Material Request pagination.
       */
      const visibleRequests = normalized;
      setRows(visibleRequests);

      /*
       * Engineer is the only role that needs the Move to Return action.
       * Synchronize completed Returnable MRs before fetching active usage.
       */
      if (canReturnIssuedReturnable) {
        const issuedReturnableMrs = visibleRequests.filter((request) => {
          const requestType = String(request?.request_type || "")
            .trim()
            .toUpperCase();
          const workflowStatus = String(
            request?.status || request?.approval_status || "",
          )
            .trim()
            .toUpperCase();

          return (
            requestType === "RETURNABLE" &&
            [
              "INVENTORY_ISSUED",
              "MR_COMPLETED",
              "ISSUED",
              "COMPLETED",
            ].includes(workflowStatus)
          );
        });

        if (issuedReturnableMrs.length) {
          await Promise.allSettled(
            issuedReturnableMrs.map((request) =>
              fetchAuthenticatedJson(
                `${config.baseURL}/component-usage/sync-returnable-mr/`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    material_request_id:
                      request.material_request_id || request.id,
                  }),
                },
              ),
            ),
          );
        }

        try {
          const usageList = await fetchAllPaginatedResults(
            `${config.baseURL}/component-usage/?active_return=1`,
            { cache: "no-store" },
          );
          const activeByMr = {};

          usageList.forEach((usage) => {
            const mrNumber = String(
              usage?.material_request_number ||
                usage?.material_request_id ||
                "",
            ).trim();

            if (!mrNumber) return;

            const approval = String(
              usage?.return_approval_status || "",
            )
              .trim()
              .toUpperCase();

            if (
              !usage?.issued_date ||
              usage?.received_date ||
              approval === "REJECTED" ||
              approval === "COMPLETED"
            ) {
              return;
            }

            const key = mrNumber.toUpperCase();
            if (!activeByMr[key]) {
              activeByMr[key] = usage;
            }
          });

          setEngineerReturnUsageByMr(activeByMr);
        } catch (usageError) {
          console.error(
            "Unable to load Engineer Returnable actions:",
            usageError,
          );
          setEngineerReturnUsageByMr({});
        }
      } else {
        setEngineerReturnUsageByMr({});
      }
    } catch (err) {
      console.error("Failed to load requests:", err);
      setRows([]);
      setEngineerReturnUsageByMr({});
      setRequestsError(
        err?.message ||
          "Unable to load Material Requests. Please try again."
      );
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    if (!showBomModal) {
      return undefined;
    }

    const refreshOpenRequest = () => {
      const bomRequest = bomDetails?.request;

      if (bomRequest?.id) {
        handleBomClick(bomRequest);
        return;
      }

      if (rdDetails?.id) {
        handleRdClick(rdDetails.id);
      }
    };

    const intervalId = window.setInterval(
      refreshOpenRequest,
      5000,
    );

    window.addEventListener(
      "inwardUpdated",
      refreshOpenRequest,
    );

    window.addEventListener(
      "inventory:changed",
      refreshOpenRequest,
    );

    window.addEventListener(
      "notificationsUpdated",
      refreshOpenRequest,
    );

    return () => {
      window.clearInterval(intervalId);

      window.removeEventListener(
        "inwardUpdated",
        refreshOpenRequest,
      );

      window.removeEventListener(
        "inventory:changed",
        refreshOpenRequest,
      );

      window.removeEventListener(
        "notificationsUpdated",
        refreshOpenRequest,
      );
    };
  }, [
    showBomModal,
    bomDetails?.request?.id,
    rdDetails?.id,
  ]);

const openEngineerReturnDialog = (usage) => {
  if (!usage?.id || !canReturnIssuedReturnable) return;

  setEngineerReturnDialog({
    open: true,
    usage,
    returnDate: new Date().toISOString().slice(0, 10),
    remarks: "",
    error: "",
  });
};

const closeEngineerReturnDialog = () => {
  if (returningUsageId) return;

  setEngineerReturnDialog({
    open: false,
    usage: null,
    returnDate: new Date().toISOString().slice(0, 10),
    remarks: "",
    error: "",
  });
};

const moveIssuedReturnableToInventory = async () => {
  const usage = engineerReturnDialog.usage;
  const usageId = usage?.id;

  if (
    !usageId ||
    !canReturnIssuedReturnable ||
    returningUsageId
  ) {
    return;
  }

  if (!engineerReturnDialog.returnDate) {
    setEngineerReturnDialog((previous) => ({
      ...previous,
      error: "Return Date is required.",
    }));
    return;
  }

  const todayValue = new Date().toISOString().slice(0, 10);
  if (engineerReturnDialog.returnDate > todayValue) {
    setEngineerReturnDialog((previous) => ({
      ...previous,
      error: "Return Date cannot be in the future.",
    }));
    return;
  }

  const mrNumber =
    usage?.material_request_number ||
    "this Material Request";

  setReturningUsageId(String(usageId));

  try {
    await fetchAuthenticatedJson(
      `${config.baseURL}/component-usage/${encodeURIComponent(
        usageId,
      )}/engineer-return/`,
      {
        method: "POST",
        body: JSON.stringify({
          return_date: engineerReturnDialog.returnDate,
          remarks: engineerReturnDialog.remarks.trim(),
        }),
      },
    );

    window.dispatchEvent(new Event("notificationsUpdated"));
    window.dispatchEvent(
      new CustomEvent("inventory:changed", {
        detail: {
          type: "componentUsage",
        },
      }),
    );

    setEngineerReturnDialog({
      open: false,
      usage: null,
      returnDate: new Date().toISOString().slice(0, 10),
      remarks: "",
      error: "",
    });

    alert(
      `${mrNumber} moved to Inventory Returned. Inventory QC is pending.`,
    );

    await loadRequests();
  } catch (error) {
    console.error("Engineer return failed:", error);

    setEngineerReturnDialog((previous) => ({
      ...previous,
      error:
        error?.message ||
        error?.detail ||
        "Unable to move this Returnable request to Inventory Returned.",
    }));
  } finally {
    setReturningUsageId("");
  }
};

const canRequestApproval = (request) => {
  const items =
    request.bom_items ||
    request.rd_items ||
    request.items ||
    [];

  if (!items.length) return false;

  return items.every((item) => {
    const required = Number(
      item.quantity ||
      item.qty ||
      item.required_quantity ||
      0
    );

    const available = getInventoryQuantityForBomRow(item);

    return available >= required;
  });
};


  const materialRequestsPageCount = Math.max(
    1,
    Math.ceil(
      materialRequestsTotalCount / MATERIAL_REQUESTS_PAGE_SIZE,
    ),
  );

  useEffect(() => {
    if (materialRequestsPage > materialRequestsPageCount) {
      setMaterialRequestsPage(materialRequestsPageCount);
    }
  }, [materialRequestsPage, materialRequestsPageCount]);

  if (costDetailsPage && canSeeCosting) return costDetailsPage;
  return (
    <PageShell>
      <PageHeader
        title="Material Requests"
        subtitle="Engineer → Admin approval workflow for component procurement."
        right={
          canManageMR ? (
            <div className="flex items-center gap-2">
              {canAdministerMR && <button
                type="button"
                onClick={selectionMode ? handleDeleteSelected : handleDeleteMode}
                disabled={selectionMode && selectedRowKeys.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#d94a65] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: "#E85D75" }}
              >
                {selectionMode ? `Delete Selected (${selectedRowKeys.length})` : "Delete"}
              </button>}

              {selectionMode && (
                <button
                  type="button"
                  onClick={handleCancelDeleteMode}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                >
                  Cancel
                </button>
              )}

              <Link
                to="/material-requests/new"
                className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90"
              >
                <Plus className="size-4" />
                New Material Request
              </Link>
            </div>
          ) : null
        }
      />
      <div className="mr-table-fit w-full max-w-full overflow-hidden rounded-2xl">
        <style>{`
          .mr-table-fit {
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
          }

          .mr-table-fit [class*="overflow-x-auto"],
          .mr-table-fit [class*="overflow-auto"] {
            overflow-x: hidden !important;
          }

          .mr-table-fit table {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            table-layout: fixed !important;
          }

          .mr-table-fit th,
          .mr-table-fit td {
            min-width: 0 !important;
            max-width: none !important;
            padding-left: 0.45rem !important;
            padding-right: 0.45rem !important;
            white-space: normal !important;
            overflow-wrap: anywhere;
            word-break: break-word;
            vertical-align: middle;
            text-align: center !important;
          }

          .mr-table-fit th > div {
            justify-content: center !important;
            text-align: center !important;
          }

          .mr-table-fit th {
              font-size: 14px !important;
              line-height: 1.25rem;
              font-weight: 700;
          }

          .mr-table-fit td {
              font-size: 14px !important;
              line-height: 1.25rem;
          }

          .mr-table-fit th:nth-last-child(2),
          .mr-table-fit td:nth-last-child(2) {
            width: 9.5rem;
          }

          .mr-table-fit th:last-child,
          .mr-table-fit td:last-child {
            width: 10.25rem;
          }

          .mr-table-fit button,
          .mr-table-fit span {
            max-width: 100%;
          }

        @media (max-width: 1450px) {
            .mr-table-fit th,
            .mr-table-fit td {
                padding-left: 0.3rem !important;
                padding-right: 0.3rem !important;
            }

            .mr-table-fit th {
                font-size: 14px !important;
            }

            .mr-table-fit td {
                font-size: 14px !important;
            }

            .mr-table-fit th:nth-last-child(2),
            .mr-table-fit td:nth-last-child(2) {
                width: 8.5rem;
            }

            .mr-table-fit th:last-child,
            .mr-table-fit td:last-child {
                width: 9rem;
            }
        }

            .mr-table-fit th:nth-last-child(2),
            .mr-table-fit td:nth-last-child(2) {
              width: 8.5rem;
            }

            .mr-table-fit th:last-child,
            .mr-table-fit td:last-child {
              width: 9rem;
            }
          }
        `}</style>

        <div className="relative">
        <DataTable
          enableColumnTools
columns={[...([
          {
            key: "requester_name",
            header: "Requester",
            render: (r) => (
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {getRequesterDisplayName(r)}
              </span>
            ),
          },
          {
            key: "material_request_id",
            header: "MR ID",
            render: (r) => {
              const mrId =
                r.material_request_id ||
                r.request_id ||
                `MR-${r.id || ""}`;

              if (
                isReturnableQcReorderRequest(r)
              ) {
                const reorderType =
                  getReturnableQcReorderType(r);
                const sourceMr =
                  getReturnableQcReorderSourceMr(r);

                return (
                  <div className="flex flex-col items-center gap-1 text-center">
                    <button
                      type="button"
                      onClick={() =>
                        handleRequestDetailsClick(r)
                      }
                      className="font-semibold text-primary underline-offset-2 hover:underline"
                      title="View complete Material Request details"
                    >
                      {mrId}
                    </button>

                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        reorderType === "FR"
                          ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
                          : "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300"
                      }`}
                    >
                      {getReturnableQcReorderLabel(r)}
                    </span>

                    {sourceMr && (
                      <span className="text-[10px] font-medium text-cyan-700 dark:text-cyan-300">
                        ↳ Returnable: {sourceMr}
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <button
                  type="button"
                  onClick={() =>
                    handleRequestDetailsClick(r)
                  }
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                  title="View complete Material Request details"
                >
                  {mrId}
                </button>
              );
            },
          },
          { key: "date", header: "Created" },
          {
            key: "project",
            header: "Project",
            render: (r) => (
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {isFromScrapRequest(r)
                  ? getFromScrapRowProject(r)
                  : getProjectDisplayValue(
                      r?.project_name ??
                        r?.projectName ??
                        r?.project,
                    ) || "-"}
              </span>
            ),
          },

          {
            key: "request_type",
            header: "Type",
            render: (r) => {
              const fromScrap =
                isFromScrapRequest(r);

              const returnableQcReorder =
                isReturnableQcReorderRequest(r);

              const normalizedType =
                String(
                  r?.request_type ||
                    ""
                )
                  .trim()
                  .toUpperCase();

              const typeLabel =
                returnableQcReorder
                  ? "Returnable Reorder"
                  : fromScrap
                    ? "From Scrap"
                    : normalizedType ===
                      "BOM" &&
                    (
                      r.customized_bom ===
                        true ||
                      r.customized_bom ===
                        "true" ||
                      r.customized_bom ===
                        1 ||
                      r.customized_bom ===
                        "1"
                    )
                    ? "Custom BOM"
                    : normalizedType === "RETURNABLE"
                      ? ({
                          FLIGHT_TEST: "Flight Test",
                          CUSTOMER_DEMO: "Demo/Trials",
                          QC_CHECK: "QC Check",
                          EVENT: "Event",
                          MISCELLANEOUS_USAGE: "Miscellaneous Usage",
                        }[
                          String(
                            r?.returnable_purpose || ""
                          ).toUpperCase()
                        ] || "Returnable")
                      : normalizedType === "RETAIL_SALES"
                        ? "Retail Sales"
                        : r.request_type;

              const canOpenTypeDetails =
                fromScrap ||
                (
                  !returnableQcReorder &&
                  (
                    normalizedType === "BOM" ||
                    normalizedType === "R&D" ||
                    normalizedType === "RD"
                  )
                );

              return (
                <div className="flex flex-col items-center gap-1">
                  {canOpenTypeDetails ? (
                    <button
                      type="button"
                      onClick={() =>
                        fromScrap
                          ? handleFromScrapClick(r)
                          : handleRequestDetailsClick(r)
                      }
                      className="font-bold text-[15px] text-[#E85D75] underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-[#E85D75]/30 rounded"
                      title={`View ${typeLabel} component, quantity, availability and reservation details`}
                    >
                      {typeLabel}
                    </button>
                  ) : (
                    <span className="font-bold text-[15px] text-[#E85D75]">
                      {typeLabel}
                    </span>
                  )}

                  {fromScrap &&
                    r?.from_scrap_source_bom && (
                      <span
                        className="max-w-full break-words text-center text-[10px] font-medium text-muted-foreground"
                        title={`Source BOM: ${r.from_scrap_source_bom}`}
                      >
                        Source BOM:{" "}
                        {String(
                          r.from_scrap_source_bom,
                        )}
                      </span>
                    )}
                </div>
              );
            },
          },
          {
            key: "required_quantity",
            header: "Drone Qty",
            render: (r) => {
              const normalizedType = String(
                r?.request_type || ""
              )
                .trim()
                .toUpperCase();

              /*
               * From-Scrap is a rebuild of the source MR.
               * Therefore its row must show the SOURCE/ORIGINAL BOM
               * drone quantity instead of "-".
               */
              if (
                isFromScrapRequest(r)
              ) {
                return (
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {getFromScrapRowDroneQty(
                      r,
                    )}
                  </span>
                );
              }

              if (
                normalizedType !== "BOM"
              ) {
                return "-";
              }

              const droneQty = Number(
                r?.required_quantity ?? 0
              );

              return Number.isFinite(droneQty) &&
                droneQty > 0
                ? droneQty
                : "-";
            },
          },
          { key: "required_date", header: "Requested" },
          {
            key: "remarks",
            header: "Remarks",
            render: (r) => {
              if (
                isReturnableQcReorderRequest(r)
              ) {
                return (
                  <div className="max-w-[220px] whitespace-normal break-words text-center text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {getReturnableQcReorderLabel(r)}
                    </span>
                    <div className="mt-1 text-muted-foreground">
                      Returnable QC failed items from {" "}
                      {getReturnableQcReorderSourceMr(r)}
                    </div>
                  </div>
                );
              }

              return r?.remarks || "-";
            },
          },

          {
            key: "status",
            header: "MR Status",
            render: (r) => {
              const mrNumber = String(
                r?.material_request_id ||
                  r?.request_id ||
                  r?.mr_id ||
                  "",
              )
                .trim()
                .toUpperCase();

              const activeReturnableUsage =
                engineerReturnUsageByMr[
                  mrNumber
                ];

              if (
                canReturnIssuedReturnable &&
                activeReturnableUsage
              ) {
                const isReturning =
                  returningUsageId ===
                  String(
                    activeReturnableUsage.id,
                  );

                return (
                  <button
                    type="button"
                    disabled={isReturning}
                    onClick={() =>
                      openEngineerReturnDialog(
                        activeReturnableUsage,
                      )
                    }
                    className="inline-flex w-full max-w-[156px] items-center justify-center rounded-lg border border-cyan-600 bg-cyan-600 px-3 py-1.5 text-center text-[11px] font-semibold leading-4 text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Move the issued item/drone to Inventory Returned"
                  >
                    {isReturning
                      ? "Moving..."
                      : "Move to Return"}
                  </button>
                );
              }

              const visibleStatus =
                getVisibleApprovalStatus(r);

              const presentation =
                getMrStatusPresentation(
                  visibleStatus,
                );

              const isRejected =
                visibleStatus ===
                "MANAGER_REJECTED";

              const statusBadge = (
                <span
                  className={[
                    "inline-flex w-full max-w-[132px] items-center justify-center",
                    "rounded-full border px-3 py-1.5",
                    "whitespace-normal text-center text-[11px] font-semibold leading-4 tracking-wide",
                    presentation.statusClass,
                  ].join(" ")}
                >
                  {presentation.statusLabel}
                </span>
              );

              if (!isRejected) {
                return statusBadge;
              }

              return (
                <button
                  type="button"
                  onClick={() =>
                    loadRejectDetails(r)
                  }
                  className="rounded-full focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2"
                  title="View rejection details"
                >
                  {statusBadge}
                </button>
              );
            },
          },

          {
            key: "action",
            header: "Action",
            render: (r) => {
              const visibleStatus =
                getVisibleApprovalStatus(r);

              const presentation =
                getMrStatusPresentation(
                  visibleStatus,
                );

              const isApprovalAction = [
                "PENDING",
                "REQUESTED",
              ].includes(visibleStatus);

              if (
                isApprovalAction &&
                canManageMR
              ) {
                return (
                  <button
                    type="button"
                    onClick={() =>
                      handleRequestApproval(r.id)
                    }
                    className={[
                      "inline-flex w-full max-w-[156px] items-center justify-center",
                      "rounded-lg border px-3 py-1.5",
                      "whitespace-normal text-center text-[11px] font-semibold leading-4 transition-colors",
                      "focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2",
                      presentation.actionClass,
                    ].join(" ")}
                  >
                    {
                      presentation.actionLabel
                    }
                  </button>
                );
              }

              // View-only users still see the current MR workflow/status,
              // but cannot trigger any action.
              return (
                <span
                  className={[
                    "inline-flex w-full max-w-[156px] items-center justify-center",
                    "rounded-lg border px-3 py-1.5",
                    "whitespace-normal text-center text-[11px] font-semibold leading-4 shadow-sm",
                    presentation.actionClass,
                  ].join(" ")}
                >
                  {presentation.actionLabel}
                </span>
              );
            },
          },
        ]), ...(canSeeCosting ? [{key:"serialPurchaseCosts",header:"Cost Details",render:(row)=><button type="button" className="serial-cost-component" onClick={()=>openCostDetails("materialRequest",row)}>View Details</button>}] : [])]}
        selectable={canAdministerMR && selectionMode}
        selectedRowKeys={selectedRowKeys}
        onSelectedRowKeysChange={setSelectedRowKeys}
        selectionKey="id"
        rows={rows}
        serverSide
        onSortChange={handleMaterialRequestsSortChange}
        onFilterChange={handleMaterialRequestsFilterChange}
        loading={requestsLoading}
        loadingTitle="Loading Material Request records..."
        loadingDescription="Fetching the latest Material Request and workflow details."
        hideEmptyState={Boolean(requestsError)}
        />

        {(materialRequestsTotalCount > MATERIAL_REQUESTS_PAGE_SIZE || materialRequestsPage > 1) ? (
          <PaginationControls
            page={materialRequestsPage}
            totalCount={materialRequestsTotalCount}
            pageSize={MATERIAL_REQUESTS_PAGE_SIZE}
            hasPreviousPage={materialRequestsHasPreviousPage}
            hasNextPage={materialRequestsHasNextPage}
            loading={requestsLoading}
            onPrevious={() =>
              setMaterialRequestsPage((currentPage) =>
                Math.max(1, currentPage - 1),
              )
            }
            onNext={() => {
              if (!materialRequestsHasNextPage) {
                return;
              }

              setMaterialRequestsPage((currentPage) => currentPage + 1);
            }}
          />
        ) : null}

        {!requestsLoading && requestsError && (
          <div className="flex min-h-[140px] w-full items-center justify-center border-t border-rose-200 bg-rose-50 px-6 py-8 text-center text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {requestsError}
          </div>
        )}
        </div>
      </div>
      {engineerReturnDialog.open && engineerReturnDialog.usage && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-white p-6 shadow-2xl dark:bg-slate-950">
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-foreground">
                Move to Return
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Engineer only moves the issued item/drone back to Inventory. QC is performed by Inventory after this step.
              </p>
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                MR: {engineerReturnDialog.usage.material_request_number || "-"}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-foreground">
                  Return Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={engineerReturnDialog.returnDate}
                  onChange={(event) =>
                    setEngineerReturnDialog((previous) => ({
                      ...previous,
                      returnDate: event.target.value,
                      error: "",
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-foreground">
                  Remarks
                </label>
                <textarea
                  rows={3}
                  value={engineerReturnDialog.remarks}
                  onChange={(event) =>
                    setEngineerReturnDialog((previous) => ({
                      ...previous,
                      remarks: event.target.value,
                      error: "",
                    }))
                  }
                  placeholder="Enter return remarks"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                />
              </div>

              {engineerReturnDialog.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {engineerReturnDialog.error}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeEngineerReturnDialog}
                disabled={Boolean(returningUsageId)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void moveIssuedReturnableToInventory()}
                disabled={Boolean(returningUsageId)}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {returningUsageId ? "Moving..." : "Move to Return"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRejectPopup && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-slate-100">
            <h2 className="text-lg font-semibold">
             {["REJECTED", "MANAGER_REJECTED"].includes(rejectPopup.status)
  ? "Rejection Details"
  : "Status Details"}
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {rejectPopup.rejectedBy
                ? `Rejected by ${rejectPopup.rejectedBy}`
                : "Rejected status details."}
            </p>
            <div className="mt-4 rounded-2xl border border-border bg-slate-50 p-4 text-sm text-slate-900 dark:bg-slate-900 dark:text-slate-100">
              <div className="font-medium">{rejectPopup.title}</div>
              <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {rejectPopup.rejectedBy
                  ? `Rejected by ${rejectPopup.rejectedBy}`
                  : "Rejected status details."}
              </div>
              <div className="mt-2 whitespace-pre-wrap">
                {rejectPopup.reason || "No rejection reason provided."}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRejectPopup(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showScrapMrModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 px-4 dark:bg-black/70">
          <div className="flex max-h-[85vh] w-[1050px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">
            <div className="border-b border-gray-100 px-6 py-4 dark:border-slate-700">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                From Scrap Details
              </h2>

              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                Shows the complete From-Scrap fulfillment: GOOD / reusable Scrap components are reused first;
                only the remaining quantity is reserved from In Store, and any balance is routed to Procurement / PO.
              </p>
            </div>

            {scrapMrLoading ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Loading complete From-Scrap Inventory and Procurement details...
              </div>
            ) : (
              <>
                <div className="grid gap-3 border-b border-gray-100 bg-slate-50/60 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      MR ID
                    </div>
                    <div className="mt-1 font-semibold">
                      {scrapMrDetails?.request
                        ?.material_request_id ||
                        scrapMrDetails?.request
                          ?.request_id ||
                        "-"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Source / Original Type
                    </div>
                    <div className="mt-1 font-semibold text-rose-600">
                      From Scrap - {scrapMrDetails?.sourceScrap?.inventory_allocations?.source_mr_customized_bom
                        ? "Custom BOM"
                        : scrapMrDetails?.sourceScrap?.inventory_allocations?.source_mr_request_type ||
                          scrapMrDetails?.request?.request_type ||
                          "BOM / R&D"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Original MR
                    </div>
                    <div className="mt-1 font-semibold">
                      {scrapMrDetails?.originalMrNumber ||
                        scrapMrDetails?.sourceScrap?.inventory_allocations?.source_mr_number ||
                        scrapMrDetails?.sourceScrap?.material_request_number ||
                        scrapMrDetails?.sourceScrap?.materialRequestNumber ||
                        "-"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Project
                    </div>
                    <div className="mt-1 font-semibold">
                      {typeof scrapMrDetails?.project === "object"
                        ? (
                            scrapMrDetails.project?.name ||
                            scrapMrDetails.project?.project_name ||
                            scrapMrDetails.project?.projectName ||
                            scrapMrDetails.project?.project_code ||
                            scrapMrDetails.project?.projectCode ||
                            "-"
                          )
                        : scrapMrDetails?.project || "-"}
                    </div>
                  </div>
                </div>

                {renderPhysicalDroneInstances(
                  scrapMrDetails?.drone_instances || [],
                )}

                {(scrapMrDetails?.items || []).length > 0 && (() => {
                  const totals = scrapMrDetails.items.reduce(
                    (summary, item) => {
                      const required = Math.max(
                        Number(
                          item?.request_quantity ??
                            item?.source_bom_required_quantity ??
                            0,
                        ) || 0,
                        0,
                      );

                      const good = Math.max(
                        Number(
                          item?.good_reusable_quantity ??
                            item?.recovered_quantity ??
                            0,
                        ) || 0,
                        0,
                      );

                      const remaining = Math.max(
                        Number(
                          item?.remaining_quantity ??
                            item?.missing_quantity ??
                            required - good,
                        ) || 0,
                        0,
                      );

                      summary.required += required;
                      summary.good += good;
                      summary.remaining += remaining;
                      summary.storeReserved += Math.max(
                        Number(item?.reserved_store_quantity || 0) || 0,
                        0,
                      );
                      summary.procurement += Math.max(
                        Number(item?.procurement_shortage_quantity || 0) || 0,
                        0,
                      );

                      return summary;
                    },
                    {
                      required: 0,
                      good: 0,
                      remaining: 0,
                      storeReserved: 0,
                      procurement: 0,
                    },
                  );

                  return (
                    <div className="grid gap-3 border-b border-gray-100 px-6 py-4 sm:grid-cols-2 lg:grid-cols-5 dark:border-slate-800">
                      {[
                        ["Total Required", totals.required],
                        ["Good / Reusable", totals.good],
                        ["Remaining Required", totals.remaining],
                        ["Reserved In Store", totals.storeReserved],
                        ["Procurement Shortage", totals.procurement],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-xl border border-border bg-background p-3 text-center"
                        >
                          <div className="text-[11px] font-medium uppercase text-muted-foreground">
                            {label}
                          </div>
                          <div className="mt-1 text-xl font-bold">
                            {Number(value || 0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <div className="overflow-auto">
                  <table className="min-w-[2200px] w-full text-sm">
                    <thead className="sticky top-0 border-b border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      <tr>
                        <th className="sticky left-0 z-20 min-w-[190px] bg-slate-100 px-4 py-3 text-center dark:bg-slate-900">
                          Component
                        </th>
                        <th className="sticky left-[190px] z-20 min-w-[170px] bg-slate-100 px-4 py-3 text-center dark:bg-slate-900">
                          Source BOM Requested Qty
                        </th>
                        <th className="min-w-[130px] px-4 py-3 text-center">
                          Good / Reusable Qty
                        </th>
                        <th className="min-w-[130px] px-4 py-3 text-center">
                          Remaining Required Qty
                        </th>
                        <th className="min-w-[300px] px-4 py-3 text-center">
                          Good / Reusable Serial Nos
                        </th>
                        <th className="min-w-[300px] px-4 py-3 text-center">
                          In Store Reserved / Issued
                        </th>
                        <th className="min-w-[320px] px-4 py-3 text-center">
                          Remaining → Procurement / PO
                        </th>
                        <th className="min-w-[300px] px-4 py-3 text-center">
                          QC Passed PO
                        </th>
                        <th className="min-w-[340px] px-4 py-3 text-center">
                          All In-Drone Serials
                        </th>
                        <th className="min-w-[220px] px-4 py-3 text-center">
                          Current Status
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {(scrapMrDetails?.items || []).length ? (
                        scrapMrDetails.items.map(
                          (item, index) => (
                            <tr
                              key={`from-scrap-item-${index}`}
                              className="border-b border-slate-100 align-top dark:border-slate-800"
                            >
                              <td className="sticky left-0 z-10 bg-white px-4 py-4 text-center dark:bg-slate-950">
                                <div className="font-semibold">
                                  {item?.component_name || "Component"}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {item?.component_code ||
                                    item?.component_id ||
                                    "-"}
                                </div>
                              </td>

                              <td className="sticky left-[190px] z-10 bg-white px-4 py-4 text-center text-lg font-bold dark:bg-slate-950">
                                {Number(
                                  item?.source_bom_required_quantity ||
                                    item?.request_quantity ||
                                    0,
                                )}
                              </td>

                              <td className="px-4 py-4 text-center">
                                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-bold text-emerald-700">
                                  {Number(
                                    item?.good_reusable_quantity ??
                                      item?.recovered_quantity ??
                                      0,
                                  )}
                                </span>
                              </td>

                              <td className="px-4 py-4 text-center">
                                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-bold text-amber-700">
                                  {Number(
                                    item?.remaining_quantity ??
                                      item?.missing_quantity ??
                                      0,
                                  )}
                                </span>
                              </td>

                              <td className="px-4 py-4">
                                <div className="flex max-w-[300px] flex-wrap justify-center gap-1.5">
                                  {(
                                    item?.good_reusable_serial_numbers ||
                                    item?.recovered_serial_numbers ||
                                    []
                                  ).length
                                    ? (
                                        item?.good_reusable_serial_numbers ||
                                        item?.recovered_serial_numbers ||
                                        []
                                      ).map(
                                        (serial) => (
                                          <span
                                            key={`recovered-${serial}`}
                                            className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                                          >
                                            {serial}
                                          </span>
                                        ),
                                      )
                                    : "-"}
                                </div>
                              </td>

                              <td className="px-4 py-4">
                                <div className="space-y-1 text-center text-xs">
                                  <div>
                                    Reserved:{" "}
                                    <strong>{Number(item?.reserved_store_quantity || 0)}</strong>
                                  </div>
                                  <div>
                                    Issued:{" "}
                                    <strong>{Number(item?.issued_store_quantity || 0)}</strong>
                                  </div>
                                </div>

                                <div className="mt-2 flex max-w-[280px] flex-wrap justify-center gap-1.5">
                                  {(item?.issued_store_serials || []).length
                                    ? item.issued_store_serials.map(
                                        (serial) => (
                                          <span
                                            key={`store-${serial}`}
                                            className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700"
                                          >
                                            {serial}
                                          </span>
                                        ),
                                      )
                                    : (
                                      <span className="text-xs text-muted-foreground">
                                        {Number(item?.reserved_store_quantity || 0) > 0
                                          ? "Reserved - Inventory issue pending"
                                          : "-"}
                                      </span>
                                    )}
                                </div>
                              </td>

                              <td className="px-4 py-4">
                                <div className="space-y-1 text-center text-xs">
                                  <div>
                                    Shortage:{" "}
                                    <strong>{Number(item?.procurement_shortage_quantity || 0)}</strong>
                                  </div>
                                  <div>
                                    PO Qty:{" "}
                                    <strong>{Number(item?.po_raised_quantity || 0)}</strong>
                                  </div>
                                </div>

                                <div className="mt-2 space-y-1.5">
                                  {(item?.po_details || []).length
                                    ? item.po_details.map(
                                        (po) => (
                                          <div
                                            key={`po-${po.po_number}`}
                                            className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 text-center text-xs text-violet-800"
                                          >
                                            <div className="font-semibold">
                                              {po.po_number}
                                            </div>
                                            <div>
                                              {String(po.status || "PO Raised").replaceAll("_", " ")}
                                            </div>
                                          </div>
                                        ),
                                      )
                                    : (
                                      <div className="text-center text-xs text-muted-foreground">
                                        {Number(item?.procurement_shortage_quantity || 0) > 0
                                          ? "Waiting for Procurement / PO"
                                          : "-"}
                                      </div>
                                    )}
                                </div>
                              </td>

                              <td className="px-4 py-4">
                                <div className="text-center text-xs">
                                  QC Passed: <strong>{Number(item?.qc_passed_quantity || 0)}</strong>
                                </div>

                                {(item?.inward_codes || []).length > 0 && (
                                  <div className="mt-1 text-center text-[11px] text-muted-foreground">
                                    Inward: {item.inward_codes.join(", ")}
                                  </div>
                                )}

                                <div className="mt-2 flex max-w-[300px] flex-wrap justify-center gap-1.5">
                                  {(item?.purchased_serial_numbers || []).length
                                    ? item.purchased_serial_numbers.map(
                                        (serial) => (
                                          <span
                                            key={`qc-${serial}`}
                                            className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700"
                                          >
                                            {serial}
                                          </span>
                                        ),
                                      )
                                    : "-"}
                                </div>
                              </td>

                              <td className="px-4 py-4">
                                <div className="flex max-w-[340px] flex-wrap justify-center gap-1.5">
                                  {(item?.all_in_drone_serials || []).length
                                    ? item.all_in_drone_serials.map(
                                        (serial) => (
                                          <span
                                            key={`all-${serial}`}
                                            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                          >
                                            {serial}
                                          </span>
                                        ),
                                      )
                                    : "No serial issued yet"}
                                </div>
                              </td>

                              <td className="px-4 py-4 text-center">
                                <div className="inline-flex rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs font-semibold">
                                  {item?.workflow_status || "Pending"}
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground">
                                  {item?.source || "Pending"}
                                </div>
                              </td>
                            </tr>
                          ),
                        )
                      ) : (
                        <tr>
                          <td
                            colSpan={10}
                            className="px-5 py-10 text-center text-sm text-muted-foreground"
                          >
                            No From-Scrap component details found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-950">
              <span className="text-xs text-gray-400 dark:text-slate-500">
                Normal In Store reservation and Procurement shortage routing applies
              </span>

              <button
                type="button"
                onClick={() => {
                  setShowScrapMrModal(
                    false
                  );
                  setScrapMrDetails(
                    null
                  );
                }}
                className="rounded-lg bg-rose-500 px-5 py-2 text-white transition-colors hover:bg-rose-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showBomModal && (
        <div className="fixed inset-0 z-[9999] bg-black/50 dark:bg-black/70 flex items-center justify-center px-4">
          <div className="bg-white dark:bg-slate-950 rounded-2xl w-[1450px] max-w-[97vw] max-h-[85vh] overflow-hidden shadow-2xl border border-gray-200 dark:border-slate-700">
            {/* HEADER */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {bomDetails?.title || (bomDetails ? "BOM Details" : "R & D Details")}
              </h2>

              <p className="text-sm text-gray-500 mt-1 dark:text-slate-400">
                {bomDetails?.bom_name || "R & D Components"}
              </p>
            </div>

            {bomDetails?.request && (
              <div className="grid gap-3 border-b border-gray-100 bg-slate-50/70 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700 dark:bg-slate-900/40">
                {[
                  ["MR ID", bomDetails.request.material_request_id || bomDetails.request.request_id || "-"],
                  ["Requester", bomDetails.request.requester_name || bomDetails.request.requester || bomDetails.request.created_by || "-"],
                  ["Request Type", bomDetails.request.request_type || "-"],
                  ["Project", getProjectDisplayValue(bomDetails.request.project_name || bomDetails.request.project) || "-"],
                  ["Created", bomDetails.request.date || bomDetails.request.created_at || "-"],
                  ["Required Date", bomDetails.request.required_date || bomDetails.request.requiredDate || "-"],
                  ["Status", bomDetails.request.status || bomDetails.request.approval_status || "-"],
                  ["Remarks", bomDetails.request.remarks || bomDetails.request.description || "-"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
                    <div className="mt-1 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">{value || "-"}</div>
                  </div>
                ))}
              </div>
            )}

            {renderPhysicalDroneInstances(
              bomDetails?.drone_instances || rdDetails?.drone_instances || [],
            )}

            <div className="overflow-auto max-h-[62vh] bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
              <table className="w-full text-sm">
                {/* ================= BOM ================= */}
                {bomDetails ? (
                  <>
                    <thead className="sticky top-0 bg-gradient-to-b from-slate-50 to-slate-100 text-slate-700 border-b border-slate-200 dark:from-slate-800 dark:to-slate-900 dark:text-slate-100 dark:border-slate-700">
                      <tr>
                        <th className="px-5 py-3 text-center">Component ID</th>
                        <th className="px-5 py-3 text-center">Component Name</th>
                        <th className="px-5 py-3 text-center">Category</th>
                        <th className="px-5 py-3 text-center">Component Type</th>
                        <th className="px-5 py-3 text-center">Specification</th>
                        <th className="px-5 py-3 text-center">HSN No</th>
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
                        {shouldShowProjectQuantityColumn(
                          bomDetails?.items,
                          bomDetails?.request,
                        ) && (
                          <th className="px-5 py-3 text-center">Project Qty</th>
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {bomDetails.items?.map((item, i) => (
                        <tr key={i}>
                          <td className="px-5 py-3 text-center font-medium">
                            {item.component_code || item.component_id || "-"}
                          </td>
                          <td className="px-5 py-3 text-center font-medium">
                            {item.component_name || "Unknown component"}
                          </td>
                          <td className="px-5 py-3 text-center">{item.category || "-"}</td>
                          <td className="px-5 py-3 text-center">
                            {item.component_type || item.component?.component_type || "-"}
                          </td>
                          <td className="px-5 py-3 text-center">
                            {item.specification || item.specifications || item.component?.specifications || item.component?.specification || "-"}
                          </td>
                          <td className="px-5 py-3 text-center">
                            {item.hsn_no || item.hsn_numbers || item.component?.hsn_no || "-"}
                          </td>
                          <td className="px-5 py-3 text-center">
                            {item.quantity}
                          </td>
                          <td className="px-5 py-3 text-center">
                            {item.unit || item.uom || "-"}
                          </td>
                          <td className="px-5 py-3 text-center font-semibold">
                            {Number(item.delivered_quantity || 0)}
                          </td>
                          <td className="px-5 py-3 text-center font-semibold">
                            {Number(item.qc_passed_quantity || 0)}
                          </td>
                          <td className="px-5 py-3 text-center font-semibold text-blue-700">
                            {getIssuedToEngineerQuantity(
                              item,
                              bomDetails?.request,
                            )}
                          </td>
                          <td className="px-5 py-3 text-center">
                            {getComponentRemainingQuantity(
                              item,
                              bomDetails?.request,
                            )}
                          </td>
                          <td className="px-5 py-3 text-center">
                            {renderComponentWorkflowStatus(
                              item,
                              bomDetails?.request,
                            )}
                          </td>
                          <td className="px-5 py-3 text-center font-semibold">
                            {getInventoryQuantityForRequestItem(item)}
                          </td>
                          <td className="px-5 py-3 text-center">
                            {getReservedByOtherMrQuantity(item)}
                          </td>
                          <td className="px-5 py-3 text-center font-semibold">
                            {getAvailableForRequestQuantity(item)}
                          </td>
                          <td className="px-5 py-3 text-center">
                            {renderReservationInfo(item)}
                          </td>
                          {shouldShowProjectQuantityColumn(
                            bomDetails?.items,
                            bomDetails?.request,
                          ) && (
                            <td className="px-5 py-3 text-center">
                              {projectInventoryLoading
                                ? "Loading..."
                                : renderProjectQuantity(
                                    item,
                                    bomDetails?.request,
                                  )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </>
                ) : (
                  <>
                    {/* ================= R&D ================= */}

                    <thead className="sticky top-0 bg-gradient-to-b from-slate-50 to-slate-100 text-slate-700 border-b border-slate-200 dark:from-slate-800 dark:to-slate-900 dark:text-slate-100 dark:border-slate-700">
                      <tr>
                        <th className="px-5 py-3 text-center">Component ID</th>
                        <th className="px-5 py-3 text-center">Component</th>
                        <th className="px-5 py-3 text-center">Category</th>
                        <th className="px-5 py-3 text-center">Component Type</th>
                        <th className="px-5 py-3 text-center">Specification</th>
                        <th className="px-5 py-3 text-center">HSN No</th>
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
                        {shouldShowProjectQuantityColumn(
                          rdDetails?.rd_items,
                          rdDetails,
                        ) && (
                          <th className="px-5 py-3 text-center">Project Qty</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {rdDetails?.rd_items?.map((item, i) => {
                        const qty = Number(item.quantity || 0);

                        return (
                          <tr key={i}>
                            <td className="px-5 py-3 text-center font-medium">
                              {item.component_code || item.component_id || "-"}
                            </td>
                            <td className="px-5 py-3 text-center font-medium">
                              {item.component_name || item.component || "Unknown component"}
                            </td>
                            <td className="px-5 py-3 text-center">{item.category || "-"}</td>
                            <td className="px-5 py-3 text-center">
                              {item.component_type || item.component?.component_type || "-"}
                            </td>
                            <td className="px-5 py-3 text-center">
                              {item.specification || item.specifications || item.component?.specifications || item.component?.specification || "-"}
                            </td>
                            <td className="px-5 py-3 text-center">
                              {item.hsn_no || item.hsn_numbers || item.component?.hsn_no || "-"}
                            </td>
                            <td className="px-5 py-3 text-center">
                              {qty}
                            </td>
                            <td className="px-5 py-3 text-center">
                              {item.unit || item.uom || "-"}
                            </td>
                            <td className="px-5 py-3 text-center font-semibold">
                              {Number(item.delivered_quantity || 0)}
                            </td>
                            <td className="px-5 py-3 text-center font-semibold">
                              {Number(item.qc_passed_quantity || 0)}
                            </td>
                            <td className="px-5 py-3 text-center font-semibold text-blue-700">
                              {getIssuedToEngineerQuantity(
                                item,
                                rdDetails,
                              )}
                            </td>
                            <td className="px-5 py-3 text-center">
                              {getComponentRemainingQuantity(
                                item,
                                rdDetails,
                              )}
                            </td>
                            <td className="px-5 py-3 text-center">
                              {renderComponentWorkflowStatus(
                                item,
                                rdDetails,
                              )}
                            </td>
                            <td className="px-5 py-3 text-center font-semibold">
                              {getInventoryQuantityForRequestItem(item)}
                            </td>
                            <td className="px-5 py-3 text-center">
                              {getReservedByOtherMrQuantity(item)}
                            </td>
                            <td className="px-5 py-3 text-center font-semibold">
                              {getAvailableForRequestQuantity(item)}
                            </td>
                            <td className="px-5 py-3 text-center">
                              {renderReservationInfo(item)}
                            </td>
                            {shouldShowProjectQuantityColumn(
                              rdDetails?.rd_items,
                              rdDetails,
                            ) && (
                              <td className="px-5 py-3 text-center">
                                {projectInventoryLoading
                                  ? "Loading..."
                                  : renderProjectQuantity(
                                      item,
                                      rdDetails,
                                    )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </>
                )}
              </table>
            </div>
            <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950">
              <span className="text-xs text-gray-400 dark:text-slate-500">
                Total items: {bomDetails ? bomDetails.items?.length : rdDetails?.rd_items?.length}
              </span>

              {/* Modal-level Request Approval for MR-linked BOM/R&D details */}
              {(() => {
                const requestObj = bomDetails?.request
                  ? { ...bomDetails.request, bom_items: bomDetails.items }
                  : rdDetails
                  ? rdDetails
                  : null;

                const modalRequestId = requestObj?.id || null;

                const status = requestObj
                  ? getVisibleApprovalStatus(requestObj)
                  : "";

                const isRequested = status === "REQUESTED";
                const isAdminApproved = ["PENDING_MANAGER", "ADMIN_APPROVED", "PENDING_ADMIN"].includes(status);
                const isFinal = [
                  "APPROVED",
                  "REJECTED",
                  "MANAGER_REJECTED",
                  "PO_RAISED",
                  "PARTIALLY_DELIVERED",
                  "PO_DELIVERED",
                  "QC_CHECKED",
                  "PROJECT_INVENTORY_READY",
                  "INVENTORY_ISSUED",
                  "MR_COMPLETED",
                ].includes(status);

                const inventoryReady = requestObj
                  ? canRequestApproval(requestObj)
                  : false;

                const disabled =
                  isRequested ||
                  isAdminApproved ||
                  isFinal ||
                  !inventoryReady;

                return (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowBomModal(false);
                        setBomDetails(null);
                        setRdDetails(null);
                      }}
                      className="px-5 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors dark:bg-rose-500 dark:hover:bg-rose-600"
                    >
                      Close
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {/* Modal for BOM details can stay here */}
    </PageShell>
  );
}

export default MaterialRequestsPage;
