import { useCostDetails } from "@/components/app/SerialCostDetails";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { DataTable, StatusBadge } from "@/components/app/DataTable";
import { PaginationControls } from "@/components/app/PaginationControls";
import config from "@/config";
import { fetchAuthenticatedJson } from "@/api";
import { useAuth } from "@/AuthContext";
import { canWork } from "@/permissions";
import { Boxes, Plane, Trash2, Search, Plus, X, ShoppingCart, CalendarDays, Eye, RotateCcw, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import CreatableSelect from "react-select/creatable";

const INVENTORY_PAGE_SIZE = 50;

// These styles apply only to the In Drone list and its MR details dialog.
const IN_DRONE_TABLE_CSS = `
.in-drone-table{width:100%;max-width:100%;min-width:0;}
.in-drone-table table{width:100%!important;min-width:0!important;max-width:100%;table-layout:fixed;}
.in-drone-table th,.in-drone-table td{min-width:0!important;padding:14px 12px!important;white-space:normal!important;overflow-wrap:anywhere;vertical-align:middle!important;text-align:center!important;}
.in-drone-table th{line-height:1.4;}
.in-drone-table .in-drone-id-column{width:22%;}
.in-drone-table .in-drone-components-column{width:18%;}
.in-drone-table .in-drone-quantity-column{width:12%;}
.in-drone-table .in-drone-cost-column{width:14%;}
.in-drone-table td>div{min-width:0;max-width:100%;}
.in-drone-mr-link{display:block;width:100%;padding:0;border:0;background:transparent;text-align:center;font:inherit;font-weight:600;line-height:1.5;overflow-wrap:anywhere;cursor:pointer;}
.in-drone-mr-link:hover{text-decoration:underline;text-underline-offset:3px;}
.in-drone-mr-link:focus-visible{outline:2px solid currentColor;outline-offset:4px;border-radius:3px;}
.in-drone-actions{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:100%;min-width:0;max-width:100%;}
.in-drone-statuses{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;width:100%;min-width:0;}
.in-drone-statuses>span{max-width:100%;white-space:normal;text-align:center;overflow-wrap:anywhere;line-height:1.4;}
.in-drone-sale-button{max-width:100%;min-height:32px;white-space:normal;}
.in-drone-request-dialog{width:calc(100vw - 32px);max-width:880px;max-height:90vh;margin:auto;padding:0;overflow-y:auto;overscroll-behavior:contain;}
.in-drone-request-dialog::backdrop{background:rgba(15,23,42,.45);}
.in-drone-request-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 24px;}
.in-drone-request-meta>div{min-width:0;}
.in-drone-request-meta dt{font-size:12px;line-height:1.4;}
.in-drone-request-meta dd{margin:5px 0 0;font-size:14px;font-weight:500;line-height:1.6;overflow-wrap:anywhere;}
.in-drone-request-remarks{grid-column:1/-1;}
@media(max-width:900px){.in-drone-table th,.in-drone-table td{padding:12px 8px!important;}}
@media(max-width:600px){.in-drone-table th,.in-drone-table td{padding:10px 5px!important;font-size:11px;}.in-drone-request-meta{grid-template-columns:minmax(0,1fr);}}
`;

function InDroneRequestDialog({ children, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="in-drone-request-dialog rounded-[20px] border border-border bg-white text-foreground shadow-2xl dark:border-slate-700 dark:bg-slate-950"
      aria-labelledby="in-drone-request-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

const CATEGORIES = [
  "All",
  "ACCESSORIES",
  "AIRFRAMES",
  "COMMUNICATION",
  "ELECTRICALS",
  "ELECTRONICS",
  "PAYLOAD",
  "TOOLS",
];

const OUTWARD_SUBTABS = [
  { id: "scrap", label: "Scrap" },
  { id: "failedQc", label: "Failed QC" },
];

const today = new Date().toISOString().split("T")[0];

const emptyInventoryItem = {
  inventory: "",
  component: "",
  componentCode: "",
  componentName: "",
  specifications: "",
  category: "",
  componentType: "",
  uom: "",
  vendor: "",
  qty: "",
  po: "",
  date: "",

  // Add Stock financial details
  unitPrice: "",
  discount: "",
  gstPercent: "",
  freightCost: "",
  freightGstPercent: "",
  roundOff: "",

  // Compatibility with the older form.
  price: "",
};

const toInventoryMoneyNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clampInventoryPercent = (value) =>
  Math.min(
    100,
    Math.max(
      0,
      toInventoryMoneyNumber(value),
    ),
  );

const calculateInventoryStockCost = (form = {}) => {
  const qty = Math.max(
    0,
    toInventoryMoneyNumber(form.qty),
  );

  const unitPrice = Math.max(
    0,
    toInventoryMoneyNumber(form.unitPrice),
  );

  const basicAmount = Number(
    (qty * unitPrice).toFixed(2),
  );

  const discount = Math.min(
    basicAmount,
    Math.max(
      0,
      toInventoryMoneyNumber(form.discount),
    ),
  );

  const taxableAmount = Number(
    Math.max(
      basicAmount - discount,
      0,
    ).toFixed(2),
  );

  const gstPercent =
    clampInventoryPercent(
      form.gstPercent,
    );

  const gstAmount = Number(
    (
      taxableAmount *
      gstPercent /
      100
    ).toFixed(2),
  );

  const freightCost = Math.max(
    0,
    toInventoryMoneyNumber(
      form.freightCost,
    ),
  );

  const freightGstPercent =
    clampInventoryPercent(
      form.freightGstPercent,
    );

  const freightGstAmount = Number(
    (
      freightCost *
      freightGstPercent /
      100
    ).toFixed(2),
  );

  const roundOff =
    toInventoryMoneyNumber(
      form.roundOff,
    );

  const grandTotal = Number(
    Math.max(
      taxableAmount +
        gstAmount +
        freightCost +
        freightGstAmount +
        roundOff,
      0,
    ).toFixed(2),
  );

  return {
    qty,
    unitPrice,
    basicAmount,
    discount,
    taxableAmount,
    gstPercent,
    gstAmount,
    freightCost,
    freightGstPercent,
    freightGstAmount,
    roundOff,
    grandTotal,
  };
};

const buildManualInventorySerials = (qty) =>
  Array.from({ length: Math.max(0, Number(qty) || 0) }, (_, index) => {
    const serialNo = String(index).padStart(3, "0");
    return `CINV_${serialNo}_${index + 1}`;
  });

const SCRAP_ENTRIES_STORAGE_KEY = "dream-to-life-scrap-entries";

const createEmptyOutwardItem = () => ({
  itemType: "COMPONENT",
  component: "",
  droneName: "",
  qty: 1,
  selectedSerials: [],
});

const getReadableApiError = (error, fallback) => {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }

  const payload =
    error?.data ||
    error?.responseData ||
    error?.body ||
    error?.detail ||
    error;

  try {
    if (typeof payload === "string") return payload;
    const serialized = JSON.stringify(payload, null, 2);
    return serialized && serialized !== "{}" ? serialized : fallback;
  } catch (_error) {
    return fallback;
  }
};

const emptyScrapItem = {
  component: "",
  qty: "",
  items: [createEmptyOutwardItem()],
  date: today,
  reason: "Scrap",
  typeOfOutward: "Scrap",
  invoiceNumber: "",
  client: "",
  deliverables: "",
  eventName: "",
  attendeeName: "",
  noOfComponents: "",
  returnDate: "",
  eventComponents: "",
  approvedBy: "Inventory Team",
};

const INVENTORY_REMOVED_KEYS_STORAGE_KEY = "dream-to-life-inventory-removed-keys";
const INVENTORY_ISSUED_KEYS_STORAGE_KEY = "dream-to-life-inventory-issued-keys";
const INVENTORY_ISSUE_METADATA_STORAGE_KEY = "dream-to-life-inventory-issue-metadata";

const INVENTORY_ISSUED_QTY_STORAGE_KEY = "dream-to-life-inventory-issued-qty";

function getStoredRemovedInventoryKeys() {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(INVENTORY_REMOVED_KEYS_STORAGE_KEY);
    const keys = stored ? JSON.parse(stored) : [];
    return Array.isArray(keys) ? keys.filter((k) => !String(k).includes("|")) : [];
  } catch (err) {
    console.warn("Unable to read removed inventory keys:", err);
    return [];
  }
}

function getStoredScrapEntries() {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(SCRAP_ENTRIES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.warn("Unable to read saved scrap entries:", err);
    return [];
  }
}

function persistRemovedInventoryKeys(keys) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(INVENTORY_REMOVED_KEYS_STORAGE_KEY, JSON.stringify(keys));
    try {
      window.dispatchEvent(new CustomEvent("inventory:changed", { detail: { type: "removedKeys" } }));
    } catch (e) {}
  } catch (err) {
    console.warn("Unable to save removed inventory keys:", err);
  }
}

function getStoredIssuedInventoryKeys() {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(INVENTORY_ISSUED_KEYS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.warn("Unable to read issued inventory keys:", err);
    return [];
  }
}

function persistIssuedInventoryKeys(keys) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(INVENTORY_ISSUED_KEYS_STORAGE_KEY, JSON.stringify(keys));
    try {
      window.dispatchEvent(new CustomEvent("inventory:changed", { detail: { type: "issuedKeys" } }));
    } catch (e) {}
  } catch (err) {
    console.warn("Unable to save issued inventory keys:", err);
  }
}

function getStoredIssuedInventoryQty() {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(INVENTORY_ISSUED_QTY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (err) {
    console.warn("Unable to read issued inventory quantities:", err);
    return {};
  }
}

function persistIssuedInventoryQty(map) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(INVENTORY_ISSUED_QTY_STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent("inventory:changed", { detail: { type: "issuedQty" } }));
  } catch (err) {
    console.warn("Unable to save issued inventory quantities:", err);
  }
}

function getStoredIssuedInventoryMetadata() {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(INVENTORY_ISSUE_METADATA_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (err) {
    console.warn("Unable to read issued inventory metadata:", err);
    return {};
  }
}

function persistIssuedInventoryMetadata(map) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(INVENTORY_ISSUE_METADATA_STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent("inventory:changed", { detail: { type: "issuedMetadata" } }));
  } catch (err) {
    console.warn("Unable to save issued inventory metadata:", err);
  }
}

const isFromScrapRequest = (request = {}) => {
  const requestType = String(
    request?.request_type ||
      request?.requestType ||
      "",
  )
    .trim()
    .toUpperCase();

  const requestNumber = String(
    request?.material_request_id ||
      request?.request_id ||
      request?.mr_id ||
      "",
  )
    .trim()
    .toUpperCase();

  if (
    ["SCRAP", "SCRAP_ONLY"].includes(requestType) ||
    requestNumber.endsWith("_FR") ||
    requestNumber.endsWith("_PR") ||
    requestNumber.endsWith("_FS")
  ) {
    return true;
  }

  const remarks = String(request?.remarks || "")
    .trim()
    .toLowerCase();

  return (
    remarks.includes("automatically recreated from scrap") ||
    remarks.includes("automatically created from scrap")
  );
};

const isAllowedInDroneRequest = (request = {}) => {
  if (isFromScrapRequest(request)) return true;

  const requestType = String(
    request?.request_type ||
      request?.requestType ||
      request?.type ||
      "",
  )
    .trim()
    .toUpperCase();

  if (["BOM", "R&D", "RD", "RETAIL_SALES"].includes(requestType)) {
    return true;
  }

  // Legacy completed BOM records may not contain request_type.
  return Boolean(
    request?.bom ||
      request?.bom_number ||
      request?.bom_code,
  );
};

export default function InventoryPage() {
  const { openCostDetails, costDetailsPage } = useCostDetails();

  const { user, activeRole } = useAuth();

  const currentRole = String(
    activeRole ||
      user?.active_role ||
      user?.role ||
      "",
  )
    .trim()
    .toLowerCase();

  const canMoveInDroneToReturnable = [
    "inventory",
    "admin",
  ].includes(currentRole);

  const canStartInDroneSale = [
    "finance",
    "admin",
  ].includes(currentRole);
  const navigate = useNavigate();

  /*
   * Module visibility is handled by your existing Sidebar/routes.
   * This flag controls only WORK vs VIEW-ONLY.
   *
   * Inventory WORK users:
   * - admin
   * - procurement
   * - inventory
   */
  const canManageInventory =
    canWork(user, "inventory");

  // Return QC is owned only by Inventory (Admin may act as system override).
  const canPerformReturnedQc = [
    "inventory",
    "admin",
  ].includes(currentRole);

  const [tab, setTab] = useState("overall");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [inventoryTablePages, setInventoryTablePages] = useState({
    overall: 1,
    inStore: 1,
    project: 1,
    outward: 1,
  });
  const [inventoryTableCounts, setInventoryTableCounts] = useState({
    overall: 0,
    inStore: 0,
    project: 0,
    outward: 0,
  });

  /*
   * Page-level loading state.
   * This prevents temporary "0" quantities/costs from looking like real data
   * while Inventory, Material Requests, Project Inventory and Outward are loading.
   */
  const [initialPageLoading, setInitialPageLoading] = useState(true);
    const [vendors, setVendors] = useState([]);
  const [components, setComponents] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [qcInventory, setQcInventory] = useState([]);
  const [scrapEntries, setScrapEntries] = useState(() => getStoredScrapEntries());
  const [approvedRequests, setApprovedRequests] = useState([]);

  // Professional audit queue for drones/components returned by Engineer.
  // Source of truth is ComponentUsage.received_date + return QC fields.
  const [returnedRequests, setReturnedRequests] = useState([]);
  const [returnedQcModal, setReturnedQcModal] = useState({
    open: false,
    row: null,
    qcRows: [],
    saving: false,
    error: "",
  });
  const [showNewInventory, setShowNewInventory] = useState(false);
  const [showNewScrap, setShowNewScrap] = useState(false);
  const [savingInventory, setSavingInventory] = useState(false);
  const [savingOutward, setSavingOutward] = useState(false);
  const inventorySubmitLockRef = useRef(false);
  const outwardSubmitLockRef = useRef(false);

  /*
   * Deduplicate only requests that are currently in flight.
   *
   * The Inventory page starts multiple independent loaders together. Several
   * of them need the same supporting datasets (MR, ProjectInventory, Inward,
   * Inventory, PO, Component, Outward). Sharing only the active Promise keeps
   * the initial load from downloading the same dataset twice while still
   * allowing every later refresh to fetch fresh backend data.
   */
  const pendingPaginatedRequestsRef = useRef(new Map());
  const [newInventory, setNewInventory] = useState(emptyInventoryItem);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [newScrap, setNewScrap] = useState(emptyScrapItem);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);

  const [
    fromScrapInventoryDetails,
    setFromScrapInventoryDetails,
  ] = useState({
    loading: false,
    data: null,
    error: "",
  });
  const [openInDroneActionId, setOpenInDroneActionId] = useState("");
  const [salesProcessingId, setSalesProcessingId] = useState("");
  const [salesActionError, setSalesActionError] = useState("");

  const [inDroneSalesModal, setInDroneSalesModal] = useState({
    open: false,
    row: null,
    quantity: 1,
    client: "",
    invoiceNumber: "",
    remarks: "",
    error: "",
  });
  const [returnableMove, setReturnableMove] = useState({
    open: false,
    row: null,
    purpose: "",
    quantity: 1,
    returnDate: "",
    remarks: "",
    saving: false,
    error: "",
  });
  const [removedInventoryKeys, setRemovedInventoryKeys] = useState(() => getStoredRemovedInventoryKeys());
  const [issuedInventoryKeys, setIssuedInventoryKeys] = useState(() => getStoredIssuedInventoryKeys());
  const [issuedInventoryQty, setIssuedInventoryQty] = useState(() => getStoredIssuedInventoryQty());
  const [issuedInventoryMetadata, setIssuedInventoryMetadata] = useState(() => getStoredIssuedInventoryMetadata());
  const [issueDetailsRow, setIssueDetailsRow] = useState(null);
  const [purchaseHistoryModal, setPurchaseHistoryModal] = useState({
    open: false,
    component: null,
  });
  const [bomDetails, setBomDetails] = useState(null);
  const [rdDetails, setRdDetails] = useState(null);
  const [generatedInventoryCode, setGeneratedInventoryCode] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [confirmIssueRow, setConfirmIssueRow] = useState(null);
  const [issueQty, setIssueQty] = useState(1);
  const [issueMaterialRequestId, setIssueMaterialRequestId] = useState("");
  const [issueIssuedTo, setIssueIssuedTo] = useState("");
  const [selectedOutwardTab, setSelectedOutwardTab] = useState("scrap");
  const [outwardData, setOutwardData] = useState([]);
  const [scrapRejectDetails, setScrapRejectDetails] = useState(null);

  // MR-linked Engineer Scrap details shown when Component is clicked.
  const [scrapComponentDetails, setScrapComponentDetails] = useState(null);

  const [projectInventory, setProjectInventory] = useState([]);
  const [projectInventoryLoading, setProjectInventoryLoading] = useState(false);
  const [outwardLoading, setOutwardLoading] = useState(false);
  const [eventActionModal, setEventActionModal] = useState({
    open: false,
    row: null,
    droneName: "",
    attendeeName: "",
    noOfComponents: "",
    returned: false,
    componentInstances: [],
  });
  const [eventComponentModal, setEventComponentModal] = useState({
    open: false,
    row: null,
    componentInstances: [],
  });

  const [serialModal, setSerialModal] = useState({ open: false, row: null, serials: [], selected: [] });
  const [componentSpecificationModal, setComponentSpecificationModal] = useState({
    open: false,
    row: null,
    mode: "instore",
    details: [],
  });
  const [projectQcSerialModal, setProjectQcSerialModal] = useState({
    open: false,
    row: null,
    serials: [],
    expectedQuantity: 0,
  });
  const [serialSelectionMap, setSerialSelectionMap] = useState({});

  const splitInventorySerials = (
    value,
  ) => {
    if (Array.isArray(value)) {
      return value
        .flatMap((item) =>
          splitInventorySerials(item),
        )
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
      .map((serial) => serial.trim())
      .filter(
        (serial) =>
          serial &&
          serial !== "-",
      );
  };


  /*
   * ProjectInventory keeps PO/QC serials in dedicated backend fields.
   * Keep these separate from normal In-Store serial handling.
   */
  const getProjectPurchasedSerialsFromRow = (row = {}) =>
    Array.from(
      new Set(
        [
          ...splitInventorySerials(
            row.purchased_serial_numbers,
          ),
          ...splitInventorySerials(
            row.purchasedSerialNumbers,
          ),
          ...splitInventorySerials(
            row.available_purchased_serials,
          ),
          ...splitInventorySerials(
            row.availablePurchasedSerials,
          ),
          ...splitInventorySerials(
            row.issued_purchased_serials,
          ),
          ...splitInventorySerials(
            row.issuedPurchasedSerials,
          ),
          ...splitInventorySerials(
            row.qc_passed_serials,
          ),
          ...splitInventorySerials(
            row.qcPassedSerials,
          ),
          /*
           * QC Inward fallback rows store their QC serials in these
           * normalized display fields until the ProjectInventory row
           * is available from the backend.
           */
          ...splitInventorySerials(
            row.serials,
          ),
          ...splitInventorySerials(
            row.serials_list,
          ),
          ...splitInventorySerials(
            row.serialNumber,
          ),
        ]
          .map((serial) =>
            String(serial || "").trim(),
          )
          .filter(Boolean),
      ),
    );

  const getProjectIssuedPurchasedSerialsFromRow = (
    row = {},
  ) => {
    const issued = Array.from(
      new Set([
        ...splitInventorySerials(
          row.issued_purchased_serials,
        ),
        ...splitInventorySerials(
          row.issuedPurchasedSerials,
        ),
        ...splitInventorySerials(
          row.purchased_issued_serials,
        ),
        ...splitInventorySerials(
          row.purchasedIssuedSerials,
        ),
      ]),
    );

    if (issued.length > 0) {
      return issued;
    }

    /*
     * Compatibility fallback for older ProjectInventory responses.
     * New/current backend rows return issued_purchased_serials directly.
     */
    const issuedQuantity = Math.max(
      Number(
        row.issued_purchased_quantity ??
          row.issuedPurchasedQuantity ??
          0,
      ) || 0,
      0,
    );

    if (issuedQuantity <= 0) {
      return [];
    }

    return getProjectPurchasedSerialsFromRow(
      row,
    ).slice(0, issuedQuantity);
  };

  const openProjectQcSerials = (row) => openCostDetails("projectInventory", row);

  const closeProjectQcSerials = () => {
    setProjectQcSerialModal({
      open: false,
      row: null,
      serials: [],
      expectedQuantity: 0,
    });
  };


  const getSerialsFromInventoryItem = (
    item,
  ) => {
    if (!item) return [];

    return Array.from(
      new Set(
        [
          ...splitInventorySerials(
            item.serialNumber,
          ),
          ...splitInventorySerials(
            item.serial_number,
          ),
          ...splitInventorySerials(
            item.serials,
          ),
          ...splitInventorySerials(
            item.serials_list,
          ),
          ...splitInventorySerials(
            item.serial_numbers,
          ),
          ...splitInventorySerials(
            item.available_serial_numbers,
          ),
        ],
      ),
    );
  };


  const getPassedRowsFromInward = (
    inward,
  ) => {
    const candidates = [
      inward?.passedRows,
      inward?.qc_passed_rows,
      inward?.passed_rows,
      inward?.qcPassedRows,
      inward?.qc_results?.passedRows,
      inward?.qc_results?.passed_rows,
      inward?.qc_results?.passed,
      inward?.qc?.passedRows,
      inward?.qc?.passed_rows,
      inward?.qc?.passed,
    ];

    return (
      candidates.find(
        Array.isArray,
      ) || []
    );
  };


  const generateInwardSerials = (
    inward,
  ) => {
    const count = Number(
      inward?.quantity_received ||
        inward?.quantity ||
        inward?.items ||
        inward?.total_quantity ||
        0,
    );

    if (
      !Number.isFinite(count) ||
      count <= 0
    ) {
      return [];
    }

    /*
     * Use the Inward/batch identity as the serial prefix.
     * This keeps two batches of the same component unique:
     * INW-0004 -> C_00004S00001...
     * INW-0005 -> C_00005S00001...
     */
    const batchValue =
      inward?.code ||
      inward?.grn ||
      inward?.inward_code ||
      inward?.id ||
      "";

    let batchDigits = (
      String(batchValue).match(/\d+/g) ||
      []
    ).join("");

    if (!batchDigits) {
      const componentValue =
        inward?.component ||
        inward?.component_id ||
        inward?.component_name ||
        "";

      batchDigits = (
        String(
          typeof componentValue ===
            "object"
            ? componentValue.component_id ||
                componentValue.id ||
                ""
            : componentValue,
        ).match(/\d+/g) || []
      ).join("");
    }

    batchDigits = batchDigits
      .padStart(5, "0")
      .slice(-5);

    return Array.from(
      { length: count },
      (_, index) => {
        const rowDigits = String(
          index + 1,
        ).padStart(5, "0");

        return (
          `C_${batchDigits}` +
          `S${rowDigits}`
        );
      },
    );
  };


  const loadInwardSerials = async (
    inwardId,
  ) => {
    try {
      const inward =
        await fetchAuthenticatedJson(
          `${config.baseURL}/inward/${encodeURIComponent(
            inwardId,
          )}/`,
        );

      const passedRows =
        getPassedRowsFromInward(
          inward,
        );

      const savedSerials =
        passedRows
          .flatMap((row) =>
            splitInventorySerials(
              row?.serialNumber ||
                row?.serial_number ||
                row?.serial,
            ),
          )
          .filter(Boolean);

      return savedSerials.length
        ? savedSerials
        : generateInwardSerials(
            inward,
          );
    } catch (error) {
      console.warn(
        `Failed to load serials for Inward ${inwardId}:`,
        error,
      );

      return [];
    }
  };


  const openSerialsModal = (row) => openCostDetails("inventory", row);

  const buildInventorySpecificationDetail = (item = {}) => {
    const componentMaster =
      findInventoryComponentMaster(
        item,
        components,
      );

    return {
      componentId:
        resolveInventoryComponentCode(
          item,
          components,
        ) ||
        componentMaster?.component_id ||
        componentMaster?.component_code ||
        componentMaster?.code ||
        componentMaster?.id ||
        "-",
      componentName:
        resolveInventoryComponentName(
          item,
          components,
        ) ||
        componentMaster?.name ||
        componentMaster?.component_name ||
        "-",
      specification:
        resolveInventorySpecifications(
          item,
          components,
        ) ||
        componentMaster?.specifications ||
        componentMaster?.specification ||
        "-",
      category:
        resolveInventoryCategory(
          item,
          components,
        ) ||
        componentMaster?.category ||
        "-",
      hsnNo:
        resolveInventoryHsn(item) ||
        "-",
    };
  };

  /*
   * IN STORE:
   * Keep the existing Component Details popup exactly as requested.
   */
  const openComponentSpecificationModal = (row) => {
    const componentMaster =
      findInventoryComponentMaster(
        row,
        components,
      );

    setComponentSpecificationModal({
      open: true,
      mode: "instore",
      details: [],
      row: {
        ...row,
        component_name:
          row?.component_name ||
          resolveInventoryComponentName(
            row,
            components,
          ) ||
          componentMaster?.name ||
          componentMaster?.component_name ||
          "-",
        category:
          resolveInventoryCategory(
            row,
            components,
          ) ||
          componentMaster?.category ||
          "-",
        component_type:
          resolveInventoryComponentType(
            row,
            components,
          ) ||
          componentMaster?.component_type ||
          componentMaster?.componentType ||
          "-",
        specifications:
          resolveInventorySpecifications(
            row,
            components,
          ) ||
          "-",
      },
    });
  };

  /*
   * OVERALL INVENTORY:
   * Specification is the entry point. The popup contains:
   * Component ID, Specification, Category and HSN No.
   *
   * An In-Drone Overall row can contain several components, so use the
   * MR-linked ProjectInventory component rows when available.
   */
  const openOverallInventorySpecificationModal = (row) => {
    const sourceRow =
      row?.raw || row;

    const location = String(
      row?.location || "",
    )
      .trim()
      .toLowerCase();

    const sourceRows =
      location === "in drone"
        ? getRequestProjectRows(
            sourceRow,
          )
        : [sourceRow];

    const normalizedSourceRows =
      sourceRows.length
        ? sourceRows
        : [sourceRow];

    const details = [];
    const seen = new Set();

    normalizedSourceRows.forEach((item) => {
      const detail =
        buildInventorySpecificationDetail(
          item,
        );

      const key = [
        detail.componentId,
        detail.componentName,
        detail.specification,
        detail.category,
        detail.hsnNo,
      ]
        .map((value) =>
          String(value || "")
            .trim()
            .toLowerCase(),
        )
        .join("|");

      if (!seen.has(key)) {
        seen.add(key);
        details.push(detail);
      }
    });

    setComponentSpecificationModal({
      open: true,
      mode: "overall",
      row,
      details,
    });
  };

  /*
   * PROJECT INVENTORY:
   * Keep Component / HSN / Specification / Category out of the main table.
   * Show all four when Specification is clicked.
   */
  const openProjectInventorySpecificationModal = (row) => {
    setComponentSpecificationModal({
      open: true,
      mode: "project",
      row,
      details: [
        buildInventorySpecificationDetail(
          row,
        ),
      ],
    });
  };

  const closeComponentSpecificationModal = () =>
    setComponentSpecificationModal({
      open: false,
      row: null,
      mode: "instore",
      details: [],
    });


  const closeSerialsModal = () => setSerialModal({ open: false, row: null, serials: [], selected: [] });

  const getIssuedSerialsForRow = (row) => {
    const issueQtyKey = getInventoryIssueQtyKey(row);
    const history = Array.isArray(issuedInventoryMetadata[issueQtyKey]) ? issuedInventoryMetadata[issueQtyKey] : [];
    return Array.from(
      new Set(
        history.flatMap((record) => (Array.isArray(record.selected_serials) ? record.selected_serials : [])),
      ),
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
        currentRequest?.mr_id ||
        requestLike?.material_request_id ||
        requestLike?.request_id ||
        requestLike?.mr_id ||
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

    const sourceScrapMatch =
      requestRemarks.match(
        /(?:Source\s+Scrap\s*:\s*|Scrap\s+)(OUT-[A-Za-z0-9-]+)/i,
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

    const recoveredMetadataItems = [
      ...(Array.isArray(
        metadata?.good_items,
      )
        ? metadata.good_items
        : []),

      ...(Array.isArray(
        metadata?.selected_items,
      )
        ? metadata.selected_items
        : []),

      ...(Array.isArray(
        metadata?.reorder_items,
      )
        ? metadata.reorder_items
        : []),

      ...markerRecoveredItems,
    ];

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

          missing_quantity:
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


  useEffect(() => {
    let cancelled = false;
    const loadRequestDetails = async () => {
      if (!selectedRequest) return;

      setFromScrapInventoryDetails({
        loading: false,
        data: null,
        error: "",
      });

      if (isFromScrapRequest(selectedRequest)) {
        setBomDetails(null);
        setRdDetails(null);
        setFromScrapInventoryDetails({
          loading: true,
          data: null,
          error: "",
        });

        try {
          const details =
            await loadFromScrapDisplayDetails(
              selectedRequest,
            );
          if (cancelled) return;

          setFromScrapInventoryDetails({
            loading: false,
            data: details,
            error: "",
          });
        } catch (error) {
          if (cancelled) return;
          console.error(
            "Failed to load In-Drone From-Scrap details:",
            error,
          );

          setFromScrapInventoryDetails({
            loading: false,
            data: null,
            error:
              error?.message ||
              "Unable to load From-Scrap In-Drone details.",
          });
        }

        return;
      }

      const rawType = String(selectedRequest.request_type || selectedRequest.type || "").trim().toUpperCase();
      const normalizedType = rawType.replace(/[^A-Z0-9]/g, "");
      const bomId =
        selectedRequest.bom ||
        selectedRequest.bom_number ||
        selectedRequest.bom_id ||
        selectedRequest.bomId;
      const isBomRequest = normalizedType === "BOM" || Boolean(bomId);

      if (isBomRequest) {
        const id = bomId || selectedRequest.bom || selectedRequest.bom_number || selectedRequest.bom_code;
        if (!id) {
          setBomDetails(null);
          return;
        }

        try {
          const url = `${config.baseURL}/bom/bom/${id}/`;
          const data = await fetchAuthenticatedJson(url);
          if (cancelled) return;
          setBomDetails(data);
          setRdDetails(null);
        } catch (err) {
          if (cancelled) return;
          console.error("Failed to load BOM details", err);
          setBomDetails(null);
        }
        return;
      }

      try {
        const url = `${config.baseURL}/materialrequest/material-requests/${selectedRequest.id}/`;
        const data = await fetchAuthenticatedJson(url);
        if (cancelled) return;
        setRdDetails(data);
        setBomDetails(null);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load R&D details", err);
        setRdDetails(null);
      }
    };

    loadRequestDetails();
    return () => { cancelled = true; };
  }, [selectedRequest]);

  const isEventActionValid =
    eventActionModal.componentInstances.length > 0 &&
    eventActionModal.componentInstances.every(
      (item) => item.checked || String(item.remarks || "").trim().length > 0,
    );

  const getRequestComponentCount = (request) => {
    const items =
      Array.isArray(request?.bom_items) ? request.bom_items :
      Array.isArray(request?.rd_items) ? request.rd_items :
      Array.isArray(request?.request_items) ? request.request_items :
      Array.isArray(request?.items) ? request.items :
      [];

    if (items.length > 0) {
      return items.length;
    }

    // Completed Retail Sales can be rendered from ProjectInventory even
    // when the MaterialRequest list serializer does not embed request_items.
    const projectRows = getRequestProjectRows(request);
    if (projectRows.length > 0) {
      return new Set(
        projectRows.map((row) =>
          String(
            row?.component ??
              row?.component_id ??
              row?.component_code ??
              row?.component_name ??
              row?.id,
          ),
        ),
      ).size;
    }

    return 0;
  };

  const getRequestTypeLabel = (request) => {
    if (isFromScrapRequest(request)) {
      return "From Scrap";
    }

    const requestType = String(
      request?.request_type ||
        request?.type ||
        "",
    )
      .trim()
      .toUpperCase();

    if (requestType === "RETAIL_SALES") {
      return "Retail Sales";
    }

    if (requestType === "R&D" || requestType === "RD") {
      return "R&D";
    }

    if (
      requestType === "BOM" ||
      request?.bom ||
      request?.bom_number ||
      request?.bom_code
    ) {
      return request?.customized_bom === true ||
        String(request?.customized_bom || "").toLowerCase() === "true"
        ? "Customized BOM"
        : "BOM";
    }

    return "-";
  };

  const openInDroneRequestDetails = (request) => {
    setBomDetails(null);
    setRdDetails(null);
    setFromScrapInventoryDetails({ loading: false, data: null, error: "" });
    setSelectedRequest(request);
    void loadProjectInventoryData();
  };

  const closeInDroneRequestDetails = () => {
    setSelectedRequest(null);
    setBomDetails(null);
    setRdDetails(null);
    setFromScrapInventoryDetails({ loading: false, data: null, error: "" });
  };

  const getRequestComponentDisplay = (request) => {
    if (getRequestTypeLabel(request) !== "Retail Sales") {
      return getRequestComponentCount(request);
    }

    const requestItems =
      Array.isArray(request?.request_items)
        ? request.request_items
        : Array.isArray(request?.items)
        ? request.items
        : [];

    const displayItems =
      requestItems.length > 0
        ? requestItems
        : getRequestProjectRows(request);

    if (!displayItems.length) {
      return 0;
    }

    return displayItems
      .map((item) => {
        const componentName = String(
          item?.component_name ||
            item?.componentName ||
            item?.name ||
            item?.product_name ||
            item?.productName ||
            item?.component_code ||
            item?.componentCode ||
            (typeof item?.component === "string"
              ? item.component
              : "Component"),
        ).trim();

        const quantity = Math.max(
          Number(
            item?.requested_quantity ??
              item?.required_quantity ??
              item?.quantity ??
              item?.qty ??
              0,
          ) || 0,
          0,
        );

        return `${componentName || "Component"}-${quantity}`;
      })
      .join(", ");
  };

  const normalizeRequestId = (value) =>
    String(value ?? "").trim().toUpperCase();

  const getRequestIds = (request) => {
    if (!request) return [];

    const normalized = [
      request?.material_request_id,
      request?.request_id,
      request?.mr_id,
      request?.materialRequestId,
      request?.material_request_number,
      request?.materialRequestNumber,
      request?.source_mr_number,
      request?.sourceMrNumber,
      request?.id,
    ]
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
      .map(normalizeRequestId);

    if (request?.id) {
      normalized.push(normalizeRequestId(`MR-${request.id}`));
    }

    return Array.from(new Set(normalized));
  };

  const getRequestProjectRows = (request) => {
    const requestIds = getRequestIds(request);
    if (!requestIds.length) return [];
    return projectInventory.filter((row) => {
      const rowIds = [
        row.material_request_id,
        row.request_id,
        row.mr_id,
        row.materialRequestId,
        row.material_request_number,
        row.materialRequestNumber,
        row.source_mr_number,
        row.sourceMrNumber,
      ]
        .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
        .map(normalizeRequestId);
      return rowIds.some((id) => requestIds.includes(id));
    });
  };


  /*
   * Complete component-level details for the In-Drone popup.
   *
   * ProjectInventory is authoritative after Inventory issue because it
   * contains the actual Store / Purchased issue quantities and serials.
   * For older records without ProjectInventory, fall back to the component
   * rows embedded in the MaterialRequest.
   */
  const getInDroneComponentDetailRows = (
    request = {},
  ) => {
    const physicalAllocations = Array.isArray(
      request?.droneInstanceAllocations || request?.component_allocations,
    )
      ? (request?.droneInstanceAllocations || request?.component_allocations)
      : [];

    if (physicalAllocations.length > 0) {
      return physicalAllocations.map((allocation, index) => {
        const source =
          allocation?.source_details && typeof allocation.source_details === "object"
            ? allocation.source_details
            : {};
        const assignedSerials = Array.from(
          new Set(splitInventorySerials(allocation?.serial_numbers || [])),
        );
        const storeSerials = Array.from(
          new Set(splitInventorySerials(source?.store_serials || [])),
        );
        const purchasedSerials = Array.from(
          new Set(splitInventorySerials(source?.purchased_serials || [])),
        );
        const fromScrapSerials = Array.from(
          new Set(splitInventorySerials(source?.from_scrap_serials || [])),
        );
        const quantity = Math.max(Number(allocation?.quantity || 0) || 0, 0);
        const sourceLabels = [];
        if (fromScrapSerials.length) sourceLabels.push("Reused Scrap");
        if (storeSerials.length) sourceLabels.push("In Store");
        if (purchasedSerials.length) sourceLabels.push("PO / QC Passed");

        return {
          key: allocation?.id || `${request?.droneInstanceId || "drone"}-${index}`,
          componentCode: allocation?.component_code || "-",
          componentName: allocation?.component_name || "-",
          specification: allocation?.specification || "-",
          category: allocation?.category || "-",
          hsnNo: allocation?.hsn_no || "-",
          uom: allocation?.uom || "-",
          requestedQty: quantity,
          issuedStoreQty: storeSerials.length,
          storeSerials,
          issuedPurchasedQty: Math.max(purchasedSerials.length + fromScrapSerials.length, 0),
          purchasedSerials: [...fromScrapSerials, ...purchasedSerials],
          assignedSerials,
          totalIssued: quantity,
          remainingQty: 0,
          source: sourceLabels.join(" + ") || "Assigned to Drone",
          workflowStatus: "Issued",
        };
      });
    }

    const projectRows =
      getRequestProjectRows(request);

    const requestItems =
      Array.isArray(request?.bom_items)
        ? request.bom_items
        : Array.isArray(request?.rd_items)
          ? request.rd_items
          : Array.isArray(
                request?.request_items,
              )
            ? request.request_items
            : Array.isArray(
                  request?.items,
                )
              ? request.items
              : Array.isArray(
                    request?.bom_details
                      ?.items,
                  )
                ? request.bom_details.items
                : [];

    const sourceRows =
      projectRows.length > 0
        ? projectRows
        : requestItems;

    return sourceRows.map(
      (row, index) => {
        const requestedQty =
          Math.max(
            Number(
              row?.requested_quantity ??
                row?.requestedQuantity ??
                row?.required_quantity ??
                row?.requiredQuantity ??
                row?.quantity ??
                row?.qty ??
                0,
            ) || 0,
            0,
          );

        const issuedStoreQty =
          Math.max(
            Number(
              row?.issued_store_quantity ??
                row?.issuedStoreQuantity ??
                row?.store_issued_quantity ??
                row?.storeIssuedQuantity ??
                0,
            ) || 0,
            0,
          );

        const issuedPurchasedQty =
          Math.max(
            Number(
              row?.issued_purchased_quantity ??
                row?.issuedPurchasedQuantity ??
                row?.purchased_issued_quantity ??
                row?.purchasedIssuedQuantity ??
                0,
            ) || 0,
            0,
          );

        const storeSerials =
          Array.from(
            new Set(
              [
                row?.issued_store_serials,
                row?.issuedStoreSerials,
                row?.store_issued_serials,
                row?.storeIssuedSerials,
              ]
                .flatMap(
                  splitInventorySerials,
                )
                .filter(Boolean),
            ),
          );

        const purchasedSerials =
          Array.from(
            new Set(
              [
                row?.issued_purchased_serials,
                row?.issuedPurchasedSerials,
                row?.purchased_serial_numbers,
                row?.purchasedSerialNumbers,
                row?.qc_passed_serials,
                row?.qcPassedSerials,
              ]
                .flatMap(
                  splitInventorySerials,
                )
                .filter(Boolean),
            ),
          );

        const totalIssued =
          issuedStoreQty +
          issuedPurchasedQty;

        const remainingQty =
          Math.max(
            requestedQty -
              totalIssued,
            0,
          );

        const sourceParts = [];

        if (
          issuedStoreQty > 0 ||
          storeSerials.length > 0
        ) {
          sourceParts.push(
            "In Store",
          );
        }

        if (
          issuedPurchasedQty > 0 ||
          purchasedSerials.length > 0
        ) {
          sourceParts.push(
            "PO / QC Passed",
          );
        }

        const componentCode =
          resolveInventoryComponentCode(
            row,
            components,
          ) ||
          row?.component_code ||
          row?.componentCode ||
          (
            typeof row?.component ===
            "string"
              ? row.component
              : ""
          ) ||
          "-";

        const componentName =
          resolveInventoryComponentName(
            row,
            components,
          ) ||
          row?.component_name ||
          row?.componentName ||
          row?.name ||
          "-";

        const specification =
          resolveInventorySpecifications(
            row,
            components,
          ) ||
          "-";

        const category =
          resolveInventoryCategory(
            row,
            components,
          ) ||
          row?.category ||
          row?.component_category ||
          "-";

        const uom =
          row?.uom ||
          row?.unit ||
          row?.unit_of_measurements ||
          row?.unitOfMeasurements ||
          row?.component?.uom ||
          row?.component
            ?.unit_of_measurements ||
          "-";

        const workflowStatus =
          requestedQty > 0 &&
          remainingQty <= 0
            ? "Issued"
            : totalIssued > 0
              ? "Partially Issued"
              : "Pending";

        return {
          key:
            row?.id ||
            row?.pk ||
            `${componentCode}-${index}`,

          componentCode,
          componentName,
          specification,
          category,
          hsnNo:
            resolveInventoryHsn(
              row,
            ) || "-",
          uom,
          requestedQty,
          issuedStoreQty,
          storeSerials,
          issuedPurchasedQty,
          purchasedSerials,
          totalIssued,
          remainingQty,
          source:
            sourceParts.length > 0
              ? sourceParts.join(
                  " + ",
                )
              : "Pending",
          workflowStatus,
        };
      },
    );
  };


  const getRequestRequiredQuantity = (
    request,
  ) => {
    if (!request) {
      return 0;
    }

    /*
     * ProjectInventory is authoritative after Manager approval.
     *
     * It records the actual requested component quantity for both:
     * - reserved In-Store fulfillment;
     * - PO / QC-passed purchased fulfillment.
     *
     * The MaterialRequest list serializer can still return the
     * top-level required_quantity as 1 for a PO-routed request, so
     * never prefer that value while ProjectInventory quantities exist.
     */
    const projectRows =
      getRequestProjectRows(request);

    const projectRequestedQuantity =
      projectRows.reduce(
        (total, row) => {
          const quantity = Number(
            row?.requested_quantity ??
              row?.requestedQuantity ??
              0,
          );

          return (
            total +
            (
              Number.isFinite(quantity)
                ? Math.max(quantity, 0)
                : 0
            )
          );
        },
        0,
      );

    if (projectRequestedQuantity > 0) {
      return projectRequestedQuantity;
    }

    /*
     * Before/while ProjectInventory refreshes, use the exact BOM or
     * R&D component quantities included with the Material Request.
     */
    const requestItems =
      Array.isArray(request?.bom_items)
        ? request.bom_items
        : Array.isArray(request?.rd_items)
        ? request.rd_items
        : Array.isArray(request?.request_items)
        ? request.request_items
        : Array.isArray(request?.items)
        ? request.items
        : Array.isArray(request?.bom_details?.items)
        ? request.bom_details.items
        : [];

    const itemRequestedQuantity =
      requestItems.reduce(
        (total, item) => {
          const quantity = Number(
            item?.requested_quantity ??
              item?.required_quantity ??
              item?.quantity ??
              item?.qty ??
              0,
          );

          return (
            total +
            (
              Number.isFinite(quantity)
                ? Math.max(quantity, 0)
                : 0
            )
          );
        },
        0,
      );

    if (itemRequestedQuantity > 0) {
      return itemRequestedQuantity;
    }

    /*
     * Last compatibility fallback for old request records that do not
     * have ProjectInventory rows or nested component items.
     */
    const directQuantity = Number(
      request?.required_quantity ??
        request?.requiredQuantity ??
        request?.drone_quantity ??
        request?.droneQuantity ??
        request?.quantity ??
        0,
    );

    return Number.isFinite(directQuantity)
      ? Math.max(directQuantity, 0)
      : 0;
  };

  const getInDroneTotalDroneQuantity = (request) => {
    if (!request) return 0;

    // In the physical In-Drone table every _01/_02 child is exactly one drone.
    if (request?.droneInstanceId || request?.drone_instance_id) {
      return 1;
    }

    const requestType = String(
      request?.request_type ||
        request?.requestType ||
        request?.type ||
        "",
    )
      .trim()
      .toUpperCase();

    if (["R&D", "RD"].includes(requestType)) {
      const rdDroneQuantity = Number(
        request?.drone_quantity ??
          request?.droneQuantity ??
          0,
      );

      return Number.isFinite(rdDroneQuantity) && rdDroneQuantity > 0
        ? Math.floor(rdDroneQuantity)
        : 0;
    }

    const directQuantity = Number(
      request?.drone_quantity ??
        request?.droneQuantity ??
        request?.required_quantity ??
        request?.requiredQuantity ??
        request?.assembly_quantity ??
        request?.assemblyQuantity ??
        request?.quantity ??
        0,
    );

    if (Number.isFinite(directQuantity) && directQuantity > 0) {
      return Math.max(Math.floor(directQuantity), 0);
    }

    return Math.max(
      Math.floor(Number(getRequestRequiredQuantity(request) || 0)),
      0,
    );
  };


  const getRequestSerialsBySource = (request, source) => {
    const rows =
      getRequestProjectRows(request);

    if (source === "STORE") {
      const fields = [
        "issued_store_serials",
        "issuedStoreSerials",
        "store_issued_serials",
        "storeIssuedSerials",
      ];

      return Array.from(
        new Set(
          rows.flatMap((row) =>
            fields.flatMap((field) =>
              splitInventorySerials(
                row[field],
              ),
            ),
          ),
        ),
      );
    }

    /*
     * PO / QC-passed issue path.
     *
     * Current backend returns issued_purchased_serials.
     * For an older row where that array was not serialized, fall back to
     * the same purchased serial pool using issued_purchased_quantity.
     */
    return Array.from(
      new Set(
        rows.flatMap((row) =>
          getProjectIssuedPurchasedSerialsFromRow(
            row,
          ),
        ),
      ),
    );
  };

  /*
   * In Drone serial display:
   * show the component name beside every issued serial so the user can
   * immediately identify which component each serial belongs to.
   *
   * Example:
   * C_00011S00001 - Wings
   */
  const getRequestSerialDisplayBySource = (
    request,
    source,
  ) => {
    const rows =
      getRequestProjectRows(request);

    const displayRows = [];

    rows.forEach((row) => {
      let componentName = String(
        row?.component_name ||
          row?.componentName ||
          row?.name ||
          row?.product_name ||
          row?.productName ||
          "",
      ).trim();

      /*
       * Project Inventory display labels can be:
       * "CMP-1786000787937 - Wings"
       *
       * Only remove a display separator containing spaces. Never split
       * normal CMP codes on their internal hyphens.
       */
      if (!componentName) {
        const componentLabel = String(
          row?.component || "",
        ).trim();

        const displayParts =
          componentLabel.split(
            /\s+[—–-]\s+/,
          );

        componentName =
          displayParts.length > 1
            ? displayParts
                .slice(1)
                .join(" - ")
                .trim()
            : componentLabel;
      }

      if (!componentName) {
        componentName =
          row?.component_code ||
          row?.componentCode ||
          "Component";
      }

      const serials =
        source === "STORE"
          ? Array.from(
              new Set([
                ...splitInventorySerials(
                  row.issued_store_serials,
                ),
                ...splitInventorySerials(
                  row.issuedStoreSerials,
                ),
                ...splitInventorySerials(
                  row.store_issued_serials,
                ),
                ...splitInventorySerials(
                  row.storeIssuedSerials,
                ),
              ]),
            )
          : getProjectIssuedPurchasedSerialsFromRow(
              row,
            );

      serials.forEach((serial) => {
        displayRows.push({
          serial: String(serial).trim(),
          componentName,
        });
      });
    });

    const seen = new Set();

    return displayRows
      .filter((item) => {
        if (!item.serial) return false;

        const key =
          `${item.serial}|${item.componentName}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .map(
        (item) =>
          `${item.serial} - ${item.componentName}`,
      );
  };


  const getRequestSerialsFromInventory = (request) =>
    Array.from(
      new Set([
        ...getRequestSerialsBySource(request, "STORE"),
        ...getRequestSerialsBySource(request, "PURCHASED"),
      ]),
    );

  const getRequestSerialsFromIssueHistory = (request) => {
    const requestIds = getRequestIds(request);
    if (!requestIds.length) return [];

    return Array.from(
      new Set(
        Object.values(issuedInventoryMetadata)
          .flatMap((history) => (Array.isArray(history) ? history : []))
          .filter((record) => {
            const recordId = normalizeRequestId(
              record?.material_request_id ||
                record?.request_id ||
                record?.mr_id ||
                record?.materialRequestId ||
                "",
            );
            return requestIds.includes(recordId);
          })
          .flatMap((record) =>
            Array.isArray(record?.selected_serials)
              ? record.selected_serials
              : [],
          )
          .map((serial) => String(serial || "").trim())
          .filter(Boolean),
      ),
    );
  };

  const getRequestSerials = (request) => {
    if (!request) return [];
    return Array.from(
      new Set([
        ...getRequestSerialsFromInventory(request),
        ...getRequestSerialsFromIssueHistory(request),
      ]),
    );
  };

  const getRequestIssueHistory = (request) => {
    if (!request) return [];

    const requestIds = getRequestIds(request);
    if (!requestIds.length) return [];

    return Object.values(issuedInventoryMetadata)
      .flatMap((history) => (Array.isArray(history) ? history : []))
      .filter((record) => {
        const recordRequestId = normalizeRequestId(
          record?.material_request_id ||
            record?.request_id ||
            record?.mr_id ||
            record?.materialRequestId ||
            "",
        );
        return requestIds.includes(recordRequestId);
      });
  };

  const selectedRequestInventorySerials = useMemo(
    () => getRequestSerialsFromInventory(selectedRequest),
    [selectedRequest, projectInventory],
  );

  const selectedRequestStoreSerials = useMemo(
    () =>
      getRequestSerialDisplayBySource(
        selectedRequest,
        "STORE",
      ),
    [selectedRequest, projectInventory],
  );

  const selectedRequestPurchasedSerials = useMemo(
    () =>
      getRequestSerialDisplayBySource(
        selectedRequest,
        "PURCHASED",
      ),
    [selectedRequest, projectInventory],
  );

  const selectedRequestIssueSerials = useMemo(
    () => getRequestSerialsFromIssueHistory(selectedRequest),
    [selectedRequest, issuedInventoryMetadata],
  );

  const selectedRequestSerials = useMemo(
    () => getRequestSerials(selectedRequest),
    [selectedRequest, issuedInventoryMetadata, qcInventory, projectInventory],
  );

  const selectedRequestIssueHistory = useMemo(
    () => getRequestIssueHistory(selectedRequest),
    [selectedRequest, issuedInventoryMetadata],
  );

  const normalizeInventoryText = (value) => String(value ?? "").trim().toLowerCase();

  const resolveInventoryComponentValue = (value) => {
    if (value == null) return "";
    if (typeof value === "object") {
      return String(value.name || value.component_name || value.component || value.label || "").trim();
    }
    return String(value).trim();
  };

  const getInventoryComponentDetails = (
    item,
  ) =>
    item?.component_details ||
    item?.component_obj ||
    item?.component_data ||
    item?.componentInfo ||
    item?.component_info ||
    (
      item?.component &&
      typeof item.component === "object"
        ? item.component
        : null
    ) ||
    null;

  const getInventoryComponentReferences = (
    item,
  ) => {
    const details =
      getInventoryComponentDetails(item);

    return [
      item?.component_pk,
      item?.component_db_id,
      item?.componentDatabaseId,
      item?.component,
      item?.component_id,
      item?.componentId,
      item?.component_code,
      item?.componentCode,
      item?.component_name,
      item?.componentName,
      details?.id,
      details?.pk,
      details?.component_id,
      details?.component_code,
      details?.code,
      details?.name,
      details?.component_name,
    ]
      .filter(
        (value) =>
          value !== undefined &&
          value !== null &&
          value !== "" &&
          typeof value !== "object",
      )
      .map((value) =>
        normalizeInventoryText(value),
      )
      .filter(Boolean);
  };

  const findInventoryComponentMaster = (
    item,
    componentList = [],
  ) => {
    if (!Array.isArray(componentList)) {
      return null;
    }

    const references =
      getInventoryComponentReferences(item);

    if (!references.length) {
      return null;
    }

    return (
      componentList.find((component) => {
        const aliases = [
          component?.id,
          component?.pk,
          component?.component_id,
          component?.component_code,
          component?.code,
          component?.name,
          component?.component_name,
        ]
          .filter(
            (value) =>
              value !== undefined &&
              value !== null &&
              value !== "",
          )
          .map((value) =>
            normalizeInventoryText(value),
          );

        return references.some(
          (reference) =>
            aliases.includes(reference),
        );
      }) || null
    );
  };

  const resolveInventoryComponentCode = (
    item,
    componentList = [],
  ) => {
    const componentMaster =
      findInventoryComponentMaster(
        item,
        componentList,
      );

    if (componentMaster) {
      return String(
        componentMaster.component_id ||
          componentMaster.component_code ||
          componentMaster.code ||
          componentMaster.id ||
          "",
      ).trim();
    }

    const details =
      getInventoryComponentDetails(item);

    const candidates = [
      item?.component_code,
      item?.componentCode,
      item?.component_code_display,
      item?.component_id_display,
      details?.component_id,
      details?.component_code,
      details?.code,
    ];

    for (const candidate of candidates) {
      const resolved =
        resolveInventoryComponentValue(
          candidate,
        );

      /*
       * A plain numeric value is normally the Component database FK,
       * not the human-readable CMP code.
       */
      if (
        resolved &&
        !/^\d+$/.test(resolved)
      ) {
        return resolved;
      }
    }

    return "";
  };

  const normalizeComponentNameForGrouping = (value, code = "") => {
    const text = String(value ?? "").trim();
    if (!text) return "";

    const normalizedCode = String(code ?? "").trim();
    const parts = text
      .split(/\s*-\s*/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length > 1) {
      const [firstPart, ...restParts] = parts;
      if (!normalizedCode || firstPart === normalizedCode || firstPart.toLowerCase() === normalizedCode.toLowerCase()) {
        return restParts.join(" - ");
      }
    }

    return text;
  };

  const resolveInventoryHsn = (item = {}) => {
    /*
     * HSN is Component Master data.
     *
     * MR / BOM / ProjectInventory rows do not always embed hsn_no and may
     * contain only a component DB id, component code, or component name.
     * Use the same robust Component Master matcher that the Inventory page
     * already uses for component name/code/category/specification.
     */
    const componentMaster =
      findInventoryComponentMaster(
        item,
        components,
      );

    const componentDetails =
      getInventoryComponentDetails(item);

    const rawComponent =
      item?.component &&
      typeof item.component === "object"
        ? item.component
        : {};

    const candidates = [
      componentMaster?.hsn_numbers,
      componentMaster?.hsn_no,
      componentMaster?.hsn,
      componentMaster?.hsn_code,
      componentMaster?.hsnCode,

      rawComponent?.hsn_numbers,
      rawComponent?.hsn_no,
      rawComponent?.hsn,
      rawComponent?.hsn_code,
      rawComponent?.hsnCode,

      componentDetails?.hsn_numbers,
      componentDetails?.hsn_no,
      componentDetails?.hsn,
      componentDetails?.hsn_code,
      componentDetails?.hsnCode,

      item?.hsn_numbers,
      item?.hsn_no,
      item?.hsn,
      item?.hsn_code,
      item?.hsnCode,
    ];

    const resolved = candidates.find(
      (value) =>
        value !== undefined &&
        value !== null &&
        String(value).trim() !== "" &&
        String(value).trim() !== "-",
    );

    return resolved !== undefined
      ? String(resolved).trim()
      : "-";
  };

  const resolveInventoryComponentName = (
    item,
    componentList = [],
  ) => {
    const componentMaster =
      findInventoryComponentMaster(
        item,
        componentList,
      );

    if (componentMaster) {
      return String(
        componentMaster.name ||
          componentMaster.component_name ||
          componentMaster.component_id ||
          componentMaster.id ||
          "",
      ).trim();
    }

    const details =
      getInventoryComponentDetails(item);

    const candidates = [
      item?.component_label,
      item?.componentLabel,
      item?.label,
      item?.display_name,
      item?.displayName,
      item?.component_name,
      item?.componentName,
      item?.product_name,
      item?.productName,
      item?.name,
      item?.item_name,
      details?.component_name,
      details?.name,
      details?.component,
      details?.label,
      details?.display_name,
    ];

    for (const candidate of candidates) {
      const resolved =
        resolveInventoryComponentValue(
          candidate,
        );

      if (
        resolved &&
        !/^\d+$/.test(resolved)
      ) {
        return resolved;
      }
    }

    /*
     * Use primitive item.component only when it is already a real name.
     * Values such as 2 are Component database IDs and must not be shown.
     */
    const primitiveComponent =
      typeof item?.component !== "object"
        ? String(
            item?.component || "",
          ).trim()
        : "";

    if (
      primitiveComponent &&
      !/^\d+$/.test(
        primitiveComponent,
      )
    ) {
      return primitiveComponent;
    }

    return "";
  };

  const resolveInventorySpecifications = (item, components = []) => {
    const componentDetails = item.component_details || item.component_obj || item.component_data || item.componentInfo || item.component_info || null;
    const candidates = [
      item.specifications,
      item.specification,
      item.component_specifications,
      item.componentSpecification,
      item.specs,
      item.spec,
      componentDetails?.specifications,
      componentDetails?.specification,
      componentDetails?.specs,
      componentDetails?.spec,
    ];

    for (const candidate of candidates) {
      const resolved = resolveInventoryComponentValue(candidate);
      if (resolved) return resolved;
    }

    const componentId = item.component_id || item.componentId || item.component_code || item.componentCode || item.component || item.id;
    if (componentId && Array.isArray(components)) {
      const match = components.find(
        (component) =>
          String(component.id) === String(componentId) ||
          String(component.component_id) === String(componentId) ||
          String(component.name) === String(componentId) ||
          String(component.component_name) === String(componentId),
      );

      if (match) {
        return resolveInventoryComponentValue(match.specifications || match.specification || match.specs || match.spec);
      }
    }

    return "";
  };

  const resolveInventoryCategory = (item, components = []) => {
    const componentDetails = item.component_details || item.component_obj || item.component_data || item.componentInfo || item.component_info || null;
    const candidates = [
      item.category,
      item.component_category,
      item.category_name,
      item.categoryName,
      componentDetails?.category,
      componentDetails?.component_category,
    ];

    for (const candidate of candidates) {
      const resolved = resolveInventoryComponentValue(candidate);
      if (resolved) return resolved;
    }

    /*
     * Use the same robust Component-master matcher already used for
     * Component Name / Component Code. This covers ProjectInventory and
     * MaterialRequest rows that contain only component id/code/name.
     */
    const componentMaster =
      findInventoryComponentMaster(
        item,
        components,
      );

    if (componentMaster) {
      const resolved =
        resolveInventoryComponentValue(
          componentMaster.category ||
            componentMaster.component_category ||
            componentMaster.category_name ||
            componentMaster.categoryName,
        );

      if (resolved) {
        return resolved;
      }
    }

    const componentId =
      item.component_id ||
      item.componentId ||
      item.component_code ||
      item.componentCode ||
      item.component;

    if (
      componentId &&
      Array.isArray(components)
    ) {
      const match = components.find(
        (component) =>
          String(component.id) ===
            String(componentId) ||
          String(component.component_id) ===
            String(componentId) ||
          String(component.name) ===
            String(componentId) ||
          String(component.component_name) ===
            String(componentId),
      );

      if (match) {
        return (
          resolveInventoryComponentValue(
            match.category ||
              match.component_category ||
              match.category_name ||
              match.categoryName,
          ) || "-"
        );
      }
    }

    return "-";
  };

  const resolveInventoryComponentType = (item, components = []) => {
    const componentDetails =
      item.component_details ||
      item.component_obj ||
      item.component_data ||
      item.componentInfo ||
      item.component_info ||
      null;

    const candidates = [
      item.component_type,
      item.componentType,
      componentDetails?.component_type,
      componentDetails?.componentType,
    ];

    for (const candidate of candidates) {
      const resolved = resolveInventoryComponentValue(candidate);
      if (resolved) return resolved;
    }

    const componentMaster = findInventoryComponentMaster(item, components);
    if (componentMaster) {
      return resolveInventoryComponentValue(
        componentMaster.component_type || componentMaster.componentType,
      ) || "-";
    }

    return "-";
  };

  const buildInventoryGroupKey = (item, fallbackComponentName = "") => {
    const rawComponentCode = resolveInventoryComponentCode(item, components) || "";
    const rawComponentName = resolveInventoryComponentName(item, components) || fallbackComponentName || "-";

    const componentName = String(
      normalizeComponentNameForGrouping(rawComponentName, rawComponentCode),
    ).trim().toLowerCase();
    const category = normalizeInventoryText(resolveInventoryCategory(item, components));
  const specifications =
  normalizeInventoryText(
    resolveInventorySpecifications(
      item,
      components
    )
  );

const sourceMrNumber = String(
  item.source_mr_number ||
  item.sourceMrNumber ||
  ""
)
  .trim()
  .toLowerCase();

const inventoryScope =
  sourceMrNumber
    ? "project"
    : "store";

return [
  inventoryScope,
  sourceMrNumber,
  componentName,
  category,
  specifications,
].join("|");
};

  const extractGroupedSerials = (
    item,
  ) => {
    if (!item) return [];

    const values = [
      item.serialNumber,
      item.serial_number,
      item.serials,
      item.serials_list,
    ];

    return Array.from(
      new Set(
        values
          .flatMap((value) => {
            if (Array.isArray(value)) {
              return value;
            }

            if (
              value === undefined ||
              value === null
            ) {
              return [];
            }

            return String(value).split(
              /[,;|\n]/,
            );
          })
          .map((value) =>
            String(value).trim(),
          )
          .filter(
            (value) =>
              value &&
              value !== "-",
          ),
      ),
    );
  };


  const normalizeInventoryItems = (items, components = []) => {
  if (!Array.isArray(items)) return [];

  const grouped = items.reduce((acc, item) => {
    const qty = Number(item.qty ?? item.quantity ?? item.passed_quantity ?? 1);
    const unitPrice = Number(item.price ?? item.unit_price ?? 0);
    const rawTotalPrice = Number(item.totalPrice ?? item.total_price ?? 0);
    const totalPrice = rawTotalPrice || (unitPrice * qty);

    const componentName =
      resolveInventoryComponentName(
        item,
        components,
      ) || "Unknown component";

    // Display every In-Store component as:
    // CMP-CODE - Component Name
    let componentLabel =
      componentName;

    const resolvedCode =
      resolveInventoryComponentCode(
        item,
        components,
      ) || "";

    const resolvedName =
      resolveInventoryComponentName(
        item,
        components,
      ) ||
      componentName ||
      "";

    try {
      const compMatch =
        findInventoryComponentMaster(
          item,
          components,
        ) ||
        (
          Array.isArray(components)
            ? components.find((component) =>
                [
                  component.component_id,
                  component.id,
                  component.code,
                  component.name,
                  component.component_name,
                ]
                  .filter(Boolean)
                  .some(
                    (value) =>
                      String(value) ===
                        String(resolvedCode) ||
                      String(value) ===
                        String(resolvedName),
                  ),
              )
            : null
        );

      if (compMatch) {
        const code = compMatch.component_id ?? compMatch.id ?? compMatch.code ?? "";
        const name = compMatch.name ?? compMatch.component_name ?? "";
        if (code && name) componentLabel = `${code} - ${name}`;
        else if (name) componentLabel = name;
        else if (code) componentLabel = String(code);
      } else if (resolvedCode && resolvedName) {
        componentLabel = `${resolvedCode} - ${resolvedName}`;
      }
    } catch (e) {
      /* ignore formatting errors */
    }

    const category = resolveInventoryCategory(item, components);
    const componentType = resolveInventoryComponentType(item, components);
    const vendor = item.vendor || item.vendor_name || "-";
    const po = item.po || item.purchase_order || item.po_number || "-";
    const date = item.date || item.received_date || item.created_at || "-";
    const specifications = resolveInventorySpecifications(item, components) || "-";

    const uom = String(
      item?.uom ||
        item?.unit ||
        item?.unit_of_measurements ||
        item?.unitOfMeasurements ||
        "",
    ).trim() || "-";

    const groupKey = buildInventoryGroupKey(item, componentName);

    if (!acc[groupKey]) {
      acc[groupKey] = {
        ...item,
        backendId: item.backendId ?? item.id ?? item.pk ?? item.inventory_id ?? null,
        backendIds: Array.from(
          new Set(
            [
              item.backendId,
              item.id,
              item.pk,
              item.inventory_id,
            ]
              .filter((value) => value != null && value !== "")
              .map(String),
          ),
        ),
        inwardIds: Array.from(
          new Set(
            [
              item.inwardId,
              item.inward_id,
              item.backendId,
            ]
              .filter((value) => value != null && value !== "")
              .map(String),
          ),
        ),
        material_request_id:
          item.material_request_id ||
          item.request_id ||
          item.mr_id ||
          item.materialRequestId ||
          "",

        issued_to:
          item.issued_to ||
          item.issuedTo ||
          item.issued_by ||
          item.issuedBy ||
          "",

        last_issued_qty:
          item.last_issued_qty ||
          item.issued_qty ||
          item.issuedQty ||
          item.lastIssuedQty ||
          null,

        id: groupKey,

        /*
         * IMPORTANT:
         * `item.component` from the Inventory API is normally the numeric
         * ForeignKey, for example 2. Assign the resolved display label
         * after `...item` so the numeric value cannot overwrite it.
         */
        component: componentLabel,

        component_code:
          resolvedCode ||
          item.component_code ||
          item.componentCode ||
          "",

        component_name:
          resolvedName ||
          item.component_name ||
          item.componentName ||
          componentName ||
          "",

        code:
          item.code ||
          item.inventory_code ||
          item.grn ||
          item.inward_code ||
          "-",
        /*
         * Keep a real serial array. The old grouping
         * retained only the first Inward record's
         * serialNumber string.
         */
        serials:
          extractGroupedSerials(item),
        serials_list:
          extractGroupedSerials(item),
        serialNumber:
          extractGroupedSerials(
            item,
          ).join(", ") || "-",
        specifications,
        category,
        component_type: componentType,
        uom,
        vendor,
        po,
        date,
        qty: 0,
        price: unitPrice,
        totalPrice: 0,
      };
    }

    acc[groupKey].qty += qty;
    acc[groupKey].totalPrice += totalPrice;

    const additionalBackendIds = [
      item.backendId,
      item.id,
      item.pk,
      item.inventory_id,
    ]
      .filter((value) => value != null && value !== "")
      .map(String);

    const additionalInwardIds = [
      item.inwardId,
      item.inward_id,
      item.backendId,
    ]
      .filter((value) => value != null && value !== "")
      .map(String);

    acc[groupKey].backendIds = Array.from(
      new Set([
        ...(Array.isArray(acc[groupKey].backendIds)
          ? acc[groupKey].backendIds
          : []),
        ...additionalBackendIds,
      ]),
    );

    acc[groupKey].inwardIds = Array.from(
      new Set([
        ...(Array.isArray(acc[groupKey].inwardIds)
          ? acc[groupKey].inwardIds
          : []),
        ...additionalInwardIds,
      ]),
    );

    const mergedSerials =
      Array.from(
        new Set([
          ...(Array.isArray(
            acc[groupKey].serials,
          )
            ? acc[groupKey].serials
            : []),
          ...extractGroupedSerials(
            item,
          ),
        ]),
      );

    acc[groupKey].serials =
      mergedSerials;

    acc[groupKey].serials_list =
      mergedSerials;

    acc[groupKey].serialNumber =
      mergedSerials.join(", ") ||
      "-";

    if ((!acc[groupKey].component_type || acc[groupKey].component_type === "-") && componentType && componentType !== "-") {
      acc[groupKey].component_type = componentType;
    }

    if (!acc[groupKey].price && unitPrice) {
      acc[groupKey].price = unitPrice;
    }

    return acc;
  }, {});

  return Object.values(grouped).map((item) => {
    const qty = Number(item.qty || 0);
    const totalPrice = Number(item.totalPrice || 0);
    const price = qty > 0 ? totalPrice / qty : Number(item.price || 0);
    return {
      ...item,
      qty,
      price,
      totalPrice,
    };
  });
};

  const collectQcRows = (value) => {
    if (Array.isArray(value)) {
      return value.filter((item) => item && typeof item === "object");
    }

    if (!value || typeof value !== "object") {
      return [];
    }

    const nestedKeys = ["passedRows", "passed_rows", "passed", "failedRows", "failed_rows", "failed", "results", "rows", "items", "data"];
    for (const key of nestedKeys) {
      const nested = collectQcRows(value[key]);
      if (nested.length) {
        return nested;
      }
    }

    return [];
  };

  const buildInventoryPersistenceKey = (item) => {
    const rawComponentCode = resolveInventoryComponentCode(item, components) || "";
    const rawComponentName = resolveInventoryComponentName(item, components) || item.component || item.name || "-";

    const componentCode = String(rawComponentCode).trim().toLowerCase();
    const componentName = String(
      normalizeComponentNameForGrouping(rawComponentName, rawComponentCode),
    ).trim().toLowerCase();

    const componentIdentity = [componentCode, componentName].filter(Boolean).join("|");
    const category = normalizeInventoryText(resolveInventoryCategory(item, components));
    const specifications = normalizeInventoryText(resolveInventorySpecifications(item, components));

 const sourceMrNumber = String(
  item.source_mr_number ||
  item.sourceMrNumber ||
  ""
)
  .trim()
  .toLowerCase();

const inventoryScope =
  sourceMrNumber
    ? "project"
    : "store";

return [
  inventoryScope,
  sourceMrNumber,
  componentIdentity,
  category,
  specifications,
].join("|");
  };

  const getQcRows = (entry, type) => {
    const candidates =
      type === "passed"
        ? [
            entry?.passedRows,
            entry?.qc_passed_rows,
            entry?.passed_rows,
            entry?.qcPassedRows,
            entry?.qc_passed,
            entry?.qc_results?.passedRows,
            entry?.qc_results?.passed_rows,
            entry?.qc_results?.passed,
            entry?.qc_results?.results,
            entry?.qc?.passedRows,
            entry?.qc?.passed_rows,
            entry?.qc?.passed,
            entry?.qc?.results,
          ]
        : [
            entry?.failedRows,
            entry?.qc_failed_rows,
            entry?.failed_rows,
            entry?.qcFailedRows,
            entry?.qc_failed,
            entry?.qc_results?.failedRows,
            entry?.qc_results?.failed_rows,
            entry?.qc_results?.failed,
            entry?.qc_results?.results,
            entry?.qc?.failedRows,
            entry?.qc?.failed_rows,
            entry?.qc?.failed,
            entry?.qc?.results,
          ];

    const rows = candidates.map((value) => collectQcRows(value)).find((value) => value.length > 0);
    return Array.isArray(rows) ? rows : [];
  };

  const shouldShowInInventory = (entry) => {
    const status = String(
      entry?.qc_status ||
        entry?.inspection_status ||
        entry?.qcStatus ||
        entry?.status ||
        entry?.qc_results?.status ||
        entry?.qc?.status ||
        ""
    )
      .trim()
      .toUpperCase();

    if (["PASS", "PASSED", "QC PASS", "QC PASSED", "APPROVED", "COMPLETED", "QC COMPLETED", "QC_DONE", "DONE"].includes(status)) {
      return true;
    }

    if (["FAIL", "FAILED", "QC FAIL", "QC FAILED", "REJECTED", "REJECT"].includes(status)) {
      return false;
    }

    const passedRows = getQcRows(entry, "passed");
    if (passedRows.length > 0) {
      return true;
    }

    const hasExplicitQcFlag =
      entry?.qc_passed === true ||
      entry?.qcPassed === true ||
      entry?.is_qc_passed === true ||
      entry?.qc_status === "PASS" ||
      entry?.qc_status === "PASSED" ||
      entry?.qc_status === "QC PASS" ||
      entry?.qc_status === "QC PASSED";

    return hasExplicitQcFlag;
  };

  const isQcFailedItem = (item) => {
    const status = String(item.status || item.status_of_outward || "")
      .trim()
      .toLowerCase();
    const remarks = String(item.remarks || item.reason || "")
      .trim()
      .toLowerCase();
    const customer = String(item.customer || item.client || "")
      .trim()
      .toLowerCase();
    return (
      status === "failed" ||
      remarks.includes("qc failed") ||
      remarks.includes("failed qc") ||
      customer.includes("qc scrap") ||
      customer.includes("failed qc")
    );
  };

  const getQcFailedRows = (entry) => {
    if (!entry || typeof entry !== "object") return [];
    return (
      (Array.isArray(entry.failedRows) && entry.failedRows) ||
      (Array.isArray(entry.qc_failed_rows) && entry.qc_failed_rows) ||
      (Array.isArray(entry.failed_rows) && entry.failed_rows) ||
      (Array.isArray(entry.qc_failed) && entry.qc_failed) ||
      (Array.isArray(entry.qc_results?.failedRows) && entry.qc_results.failedRows) ||
      (Array.isArray(entry.qc_results?.failed_rows) && entry.qc_results.failed_rows) ||
      (Array.isArray(entry.qc?.failedRows) && entry.qc.failedRows) ||
      (Array.isArray(entry.qc?.failed_rows) && entry.qc.failed_rows) ||
      []
    );
  };

  const normalizeOutwardType = (value) => {
    if (!value) return "";
    const normalized = String(value).trim().toLowerCase();
    if (
      normalized === "failed qc" ||
      normalized === "failedqc" ||
      normalized === "failed_qc" ||
      normalized === "qc failed"
    ) {
      return "failedQc";
    }
    if (normalized === "sales") return "sales";
    if (normalized === "event") return "event";
    if (normalized === "scrap" || normalized === "defect") return "scrap";
    return normalized;
  };

  const getBackendOutwardType = (type) => {
    if (type === "sales") return "SALES";
    if (type === "event") return "EVENT";

    // FAILED QC is represented by a SCRAP outward row with QC-failure remarks.
    return "SCRAP";
  };

  const getCurrentTimeString = () => {
    const now = new Date();
    return now.toTimeString().slice(0, 8);
  };

  const formatInwCode = (code, id) => {
    try {
      const key = "dream-to-life-inw-overrides";
      if (typeof window !== "undefined") {
        const overrides = JSON.parse(window.localStorage.getItem(key) || "{}");
        if (overrides && overrides[String(id)]) return overrides[String(id)];
      }

      if (typeof code === "string") {
        const m = code.match(/INW[-_ ]?(\d+)/i);
        if (m) {
          const n = Number(m[1]);
          if (Number.isFinite(n) && n <= 9999) return `INW-${String(n).padStart(4, "0")}`;
        }
      }

      if (id != null && !Number.isNaN(Number(id))) {
        return `INW-${String(Number(id)).padStart(4, "0")}`;
      }

      return code || "";
    } catch (e) {
      return code || "";
    }
  };

const formatDate = (date) => {
  if (!date) return "";

  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  return d.toLocaleDateString("en-GB"); // DD/MM/YYYY
};
  const normalizeOutwardItem = (item) => {
    const rawType =
      item.typeOfOutward ||
      item.outward_type ||
      item.type_of_outward ||
      item.type ||
      item.status_of_outward ||
      item.status ||
      "";
    const type = normalizeOutwardType(rawType);
    const failed = isQcFailedItem(item);
    const finalType = failed ? "failedQc" : type;
    const typeLabel =
      finalType === "failedQc"
        ? "Failed QC"
        : finalType === "sales"
        ? "Sales"
        : finalType === "event"
        ? "Event"
        : "Scrap";

    const componentName =
      item.productName ||
      item.product_name ||
      item.component ||
      item.component_name ||
      item.serialNumber ||
      item.serial_number ||
      "";

    const eventComponents = item.eventComponents || item.event_components || item.deliverables || "";
    const attendeeName = item.attendeeName || item.attendee_name || "";

    const typeOfOutward = normalizeOutwardType(
      item.typeOfOutward || item.type || item.type_of_outward || item.status || item.status_of_outward || item.reason || typeLabel,
    );

    const normalizedItemType = String(
      item.itemType ||
        item.item_type ||
        (item.component ? "COMPONENT" : "DRONE"),
    )
      .trim()
      .toUpperCase();

    const normalizedStatus = String(
      item.approval_status ||
        item.approvalStatus ||
        item.status ||
        "",
    ).trim();

    const actionStatus = normalizedStatus ||
      (item.is_returned || item.returned ? "RETURNED" : "PENDING");

    return {
      ...item,
      backendId: item.id ?? item.pk ?? item.outward_id ?? item.outwardId ?? null,
      id: item.id ?? item.code ?? item.grn ?? `outward-${Math.random().toString(36).slice(2)}`,
      component: componentName || "-",
      productName: componentName || "-",
      qty: Number(item.qty || item.quantity || item.noOfComponents || item.no_of_components || 1),
      outDate: item.outDate || item.date || item.out_date || item.received_date || item.out_date || "",
      date: item.date || item.outDate || item.out_date || item.received_date || "",
      reason: item.reason || item.remarks || "",
      remarks: item.remarks || item.reason || "",
      invoiceNumber:
        item.invoiceNumber || item.invoice_no || item.invoice_number || item.code || "",
      customer: item.customer || item.client || "",
      client: item.client || item.customer || "",
      deliverables: item.deliverables || item.reason || item.serialNumber || "",
      eventName: item.eventName || item.event_name || item.event || "",
      noOfComponents: item.noOfComponents || item.no_of_components || item.quantity || item.qty || "",
      returnDate: item.returnDate || item.return_date || "",
      attendeeName,
      eventComponents,
      droneName: item.droneName || item.drone_name || "",
      drone_name: item.drone_name || item.droneName || "",
      itemType: normalizedItemType,
      item_type: normalizedItemType,
      componentId:
        item.component_id ||
        (typeof item.component === "number" ? item.component : null),
      serialNumbers:
        item.serialNumbers ||
        item.serial_numbers ||
        [],
      serial_numbers:
        item.serial_numbers ||
        item.serialNumbers ||
        [],
      returnedQuantity: Number(
        item.returnedQuantity ??
          item.returned_quantity ??
          0,
      ),
      returned_quantity: Number(
        item.returned_quantity ??
          item.returnedQuantity ??
          0,
      ),
      returnedSerialNumbers:
        item.returnedSerialNumbers ||
        item.returned_serial_numbers ||
        [],
      returned_serial_numbers:
        item.returned_serial_numbers ||
        item.returnedSerialNumbers ||
        [],
      inventoryAllocations:
        item.inventoryAllocations ||
        item.inventory_allocations ||
        [],
      returned: Boolean(item.is_returned ?? item.returned ?? false),
      is_returned: Boolean(item.is_returned ?? item.returned ?? false),
      movedToInventory: Boolean(
        item.moved_to_inventory ||
          item.movedToInventory ||
          item.inventory_allocations?.disposition_processed,
      ),
      moved_to_inventory: Boolean(
        item.moved_to_inventory ||
          item.movedToInventory ||
          item.inventory_allocations?.disposition_processed,
      ),
      movedAt: item.moved_at || item.movedAt || "",
      moved_at: item.moved_at || item.movedAt || "",
      actionStatus,
      approvalStatus:
        item.approval_status ||
        item.approvalStatus ||
        normalizedStatus ||
        "",
      approval_status:
        item.approval_status ||
        item.approvalStatus ||
        normalizedStatus ||
        "",
      rejectionReason:
        item.rejection_reason ||
        item.rejectionReason ||
        "",
      rejection_reason:
        item.rejection_reason ||
        item.rejectionReason ||
        "",
      rejectedBy:
        item.rejected_by ||
        item.rejectedBy ||
        "",
      rejected_by:
        item.rejected_by ||
        item.rejectedBy ||
        "",
      typeOfOutward: typeOfOutward || typeLabel,
      status: normalizedStatus || actionStatus,
      type: finalType || "scrap",
      typeLabel,
    };
  };

  const normalizeBackendOutward = (rows) => {
    const array = Array.isArray(rows)
      ? rows
      : Array.isArray(rows?.results)
      ? rows.results
      : [];
    return array.map(normalizeOutwardItem);
  };

  const normalizeQcFailedItems = (entries) => {
    const inwardEntries = Array.isArray(entries)
      ? entries
      : Array.isArray(entries?.results)
      ? entries.results
      : [];

    return inwardEntries.flatMap((entry) => {
      const failedRows = getQcFailedRows(entry);
      const receivedDate = entry.received_date || entry.date || entry.created_at || "";
      if (!failedRows.length) return [];
      return failedRows.map((row, index) =>
        normalizeOutwardItem({
          id: `qc-failed-${entry.id}-${index}`,
          outDate: row.outDate || row.date || receivedDate,
          productName:
            row.serialNumber || row.serial_number || entry.component || entry.component_name || "",
          type: "failedQc",
          typeOfOutward: "Failed QC",
          status: "Failed",
          remarks: row.remarks || row.reason || "QC Failed",
          invoiceNumber: entry.code || entry.grn || "",
          customer: "QC Scrap",
          reason: row.remarks || row.reason || "QC Failed",
          qty: 1,
        }),
      );
    });
  };

  const normalizeManualScrapEntry = (entry) => {
    const rawType = entry.typeOfOutward || entry.type || entry.type_of_outward || "";
    const type = normalizeOutwardType(rawType) || "scrap";
    const typeLabel =
      type === "failedQc"
        ? "Failed QC"
        : type === "sales"
        ? "Sales"
        : type === "event"
        ? "Event"
        : "Scrap";

    const actionStatus = entry.is_returned || entry.returned || String(entry.status || "").trim().toUpperCase() === "RETURNED"
      ? "Returned"
      : "Pending";

    return {
      ...entry,
      id: entry.id ?? `manual-scrap-${Math.random().toString(36).slice(2)}`,
      component: entry.component || "-",
      productName: entry.component || "-",
      qty: Number(entry.qty || 1),
      outDate: entry.date || entry.outDate || today,
      date: entry.date || entry.outDate || today,
      type,
      typeLabel,
      typeOfOutward: entry.typeOfOutward || typeLabel,
      reason: entry.reason || entry.remarks || "",
      remarks: entry.remarks || entry.reason || "",
      invoiceNumber: entry.invoiceNumber || entry.invoice_no || "",
      customer: entry.customer || entry.client || "",
      client: entry.client || entry.customer || "",
      deliverables: entry.deliverables || "",
      eventName: entry.eventName || entry.event_name || "",
      attendeeName: entry.attendeeName || entry.attendee_name || "",
      eventComponents: entry.eventComponents || entry.event_components || "",
      noOfComponents: entry.noOfComponents || entry.no_of_components || entry.qty || "",
      returnDate: entry.returnDate || entry.return_date || "",
      droneName: entry.droneName || entry.drone_name || "",
      returned: Boolean(entry.is_returned ?? entry.returned ?? false),
      is_returned: Boolean(entry.is_returned ?? entry.returned ?? false),
      actionStatus,
      status: entry.status || (type === "scrap" ? "Scrapped" : actionStatus === "Returned" ? "RETURNED" : "PENDING"),
    };
  };

  const loadOutwardData = async () => {
    setOutwardLoading(true);

    try {
      const [backendOutward, inwardEntries] = await Promise.all([
        fetchSharedPaginatedList(
          "outward",
          `${config.baseURL}/outward/?page_size=500`,
          { cache: "no-store" },
        ).catch((error) => {
          console.warn("Outward API unavailable:", error);
          return [];
        }),

        fetchSharedPaginatedList(
          "inward",
          `${config.baseURL}/inward/?page_size=500`,
          { cache: "no-store" },
        ).catch((error) => {
          console.warn(
            "Inward API unavailable for QC failures:",
            error,
          );
          return [];
        }),
      ]);

      const normalized = normalizeBackendOutward(backendOutward);
      const qcFailed = normalizeQcFailedItems(inwardEntries);

      setOutwardData([
        ...normalized,
        ...qcFailed,
      ]);
    } catch (err) {
      console.error("Error loading outward data:", err);
      setOutwardData([]);
    } finally {
      setOutwardLoading(false);
    }
  };

const loadManualInventory = async (
  vendors,
  components,
  purchaseOrders
) => {
  try {
    const list = await fetchSharedPaginatedList(
      "inventory",
      `${config.baseURL}/inventory/inventory/?page_size=500`,
      {
        cache: "no-store",
        timeoutMs: 60000,
      },
    );

/*
 * This loader must load only stock created using
 * the "Add Stocks" form.
 *
 * Inward QC-passed stock is already loaded separately
 * through normalizedInward.
 */
const manualOnlyList = list.filter((item) => {
  const source = String(
    item.source ||
    item.inventory_source ||
    item.stock_source ||
    ""
  )
    .trim()
    .toLowerCase();

  const inventoryCode = String(
    item.inventory_code ||
    item.code ||
    ""
  ).trim();

  const serialValues = [
    item.serial_number,
    item.serialNumber,

    ...(Array.isArray(item.serials)
      ? item.serials
      : []),

    ...(Array.isArray(item.serials_list)
      ? item.serials_list
      : []),
  ]
    .filter(Boolean)
    .map(String);

  const serialText =
    serialValues.join(",");

  /*
   * QC Inward records normally contain an Inward/GRN
   * reference or QC serial such as C_00001S00001.
   */
  const isInwardGenerated = Boolean(
    item.inward ||
    item.inward_id ||
    item.inward_entry ||
    item.inward_entry_id ||
    item.grn ||
    item.grn_id ||
    item.inward_code ||
    source === "inward" ||
    /^INW[-_ ]?/i.test(inventoryCode) ||
    /C_\d+S\d+/i.test(serialText)
  );

  /*
   * Add Stocks records use CINV serial numbers
   * or are explicitly marked manual.
   */
  const isManuallyAdded = Boolean(
    item.manual === true ||
    item.is_manual === true ||
    source === "manual" ||
    /CINV_/i.test(serialText)
  );

  if (isInwardGenerated) {
    return false;
  }

  if (isManuallyAdded) {
    return true;
  }

  /*
   * Compatibility for older Add Stocks records.
   */
  return /^INV[-_]/i.test(inventoryCode);
});

return manualOnlyList.map((item) => {
      const quantity = Number(item.quantity || item.qty || 1);
      const baseCode = item.inventory_code || item.code || `MANUAL-${item.id}`;
      const manualSerials = Array.isArray(item.serials_list)
  ? item.serials_list
  : Array.isArray(item.serials)
  ? item.serials
  : String(item.serial_number || item.serialNumber || "")
      .split(/[,;|\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

const serialNumber = manualSerials.length
  ? manualSerials.join(", ")
  : buildManualInventorySerials(quantity).join(", ");
      const componentName =
        item.component_name ||
        components?.find((c) => String(c.id) === String(item.component))?.name ||
        "-";
      const category = item.category || "-";
      const vendorName = item.vendor || "-";
      const poLabel = item.purchase_order || "-";
      const date = item.received_date || item.date || "";
      const totalPrice = Number(item.total_price || 0);
      const unitPrice = quantity > 0 ? totalPrice / quantity : Number(item.price || 0);

    return {
  id: `manual-${item.id}`,
  code: baseCode,
  source_mr_number: "",
inventory_scope: "store",
  serialNumber,
serials: manualSerials.length ? manualSerials : buildManualInventorySerials(quantity),
serials_list: manualSerials.length ? manualSerials : buildManualInventorySerials(quantity),
  component: componentName,
  category,
  specifications:
    item.specifications ||
    components?.find((c) => String(c.id) === String(item.component))?.specifications ||
    "-",
  vendor: vendorName,
  po: poLabel,
  qty: quantity,
  date,
  price: unitPrice,
  totalPrice: totalPrice || unitPrice * quantity,
  issued: item.issued || false,
  status: "Manual",
  manual: true,
  source: "manual",
};
    });
  } catch (err) {
    console.error(err);
    return [];
  }
};

  const asApiRows = (response) => {
    if (Array.isArray(response)) {
      return response;
    }

    const directCandidates = [
      response?.results,
      response?.items,
      response?.data,
      response?.rows,
      response?.components,
    ];

    const directList =
      directCandidates.find(
        Array.isArray,
      );

    if (directList) {
      return directList;
    }

    const nestedCandidates = [
      response?.data?.results,
      response?.data?.items,
      response?.data?.rows,
      response?.data?.components,
    ];

    return (
      nestedCandidates.find(
        Array.isArray,
      ) || []
    );
  };

  const normalizeProjectText = (value) =>
    String(value ?? "").trim().toLowerCase();

  const getProjectMrNumber = (item) =>
    String(
      item?.source_mr_number ||
        item?.sourceMrNumber ||
        item?.material_request_number ||
        item?.materialRequestNumber ||
        item?.material_request_id ||
        item?.materialRequestId ||
        "",
    ).trim();

  const getInwardPurchaseOrder = (
    entry,
    purchaseOrders = [],
  ) => {
    const rawPurchaseOrder =
      entry?.purchase_order ??
      entry?.purchaseOrder ??
      entry?.purchase_order_id ??
      entry?.purchaseOrderId ??
      entry?.po_number ??
      entry?.po ??
      null;

    if (
      rawPurchaseOrder &&
      typeof rawPurchaseOrder === "object"
    ) {
      return rawPurchaseOrder;
    }

    const normalizedReference =
      normalizeProjectText(
        rawPurchaseOrder,
      );

    if (!normalizedReference) {
      return null;
    }

    return (
      purchaseOrders.find(
        (purchaseOrder) => {
          const references = [
            purchaseOrder?.id,
            purchaseOrder?.pk,
            purchaseOrder?.po_number,
            purchaseOrder?.po,
            purchaseOrder?.code,
            purchaseOrder?.purchase_order_number,
          ]
            .filter(
              (value) =>
                value !== undefined &&
                value !== null &&
                value !== "",
            )
            .map(
              normalizeProjectText,
            );

          return references.includes(
            normalizedReference,
          );
        },
      ) || null
    );
  };

  const getInwardMrNumber = (
    entry,
    purchaseOrders = [],
  ) => {
    const linkedPurchaseOrder =
      getInwardPurchaseOrder(
        entry,
        purchaseOrders,
      );

    return String(
      entry?.source_mr_number ||
        entry?.sourceMrNumber ||
        entry?.material_request_id ||
        entry?.materialRequestId ||
        linkedPurchaseOrder?.source_mr_number ||
        linkedPurchaseOrder?.sourceMrNumber ||
        linkedPurchaseOrder?.material_request_id ||
        linkedPurchaseOrder?.materialRequestId ||
        "",
    ).trim();
  };

  const getComponentIdentityValues = (item) => {
    const values = [
      item?.component,
      item?.component_id,
      item?.componentId,
      item?.component_code,
      item?.componentCode,
      item?.component_name,
      item?.componentName,
      item?.name,
      item?.product_name,
      item?.productName,
      item?.component?.id,
      item?.component?.component_id,
      item?.component?.name,
    ];

    const normalized = new Set();

    values
      .filter(
        (value) =>
          value != null &&
          value !== "" &&
          typeof value !== "object",
      )
      .forEach((value) => {
        const textValue = normalizeProjectText(
          value,
        );

        if (!textValue) return;

        normalized.add(textValue);

        textValue
          .split(/\s*-\s*/)
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach((part) =>
            normalized.add(part),
          );
      });

    return normalized;
  };

  const projectComponentsMatch = (
    first,
    second,
  ) => {
    const firstValues =
      getComponentIdentityValues(first);

    const secondValues =
      getComponentIdentityValues(second);

    return Array.from(firstValues).some(
      (value) => secondValues.has(value),
    );
  };

  const collectProjectQcRows = (
    value,
  ) => {
    if (Array.isArray(value)) {
      return value.filter(
        (row) =>
          row &&
          typeof row === "object",
      );
    }

    if (
      value &&
      typeof value === "object"
    ) {
      const candidates = [
        value.rows,
        value.items,
        value.results,
        value.passedRows,
        value.passed_rows,
        value.passed,
        value.qc_passed_rows,
        value.qcPassedRows,
      ];

      for (const candidate of candidates) {
        const rows =
          collectProjectQcRows(
            candidate,
          );

        if (rows.length > 0) {
          return rows;
        }
      }
    }

    return [];
  };


  const getProjectQcRows = (entry) => {
    const candidates = [
      entry?.passedRows,
      entry?.qc_passed_rows,
      entry?.passed_rows,
      entry?.qcPassedRows,
      entry?.qc_passed,
      entry?.passed,
      entry?.qc_results?.passedRows,
      entry?.qc_results?.passed_rows,
      entry?.qc_results?.passed,
      entry?.qc_results?.results,
      entry?.qc?.passedRows,
      entry?.qc?.passed_rows,
      entry?.qc?.passed,
      entry?.qc?.results,
    ];

    for (const candidate of candidates) {
      const rows =
        collectProjectQcRows(
          candidate,
        );

      if (rows.length > 0) {
        return rows;
      }
    }

    return [];
  };


  const normalizeProjectQcStatus = (
    entry,
  ) =>
    String(
      entry?.qc_status ||
        entry?.qcStatus ||
        entry?.inspection_status ||
        entry?.inspectionStatus ||
        entry?.qc_results?.status ||
        entry?.qc?.status ||
        entry?.status ||
        "",
    )
      .trim()
      .toUpperCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");


  const isProjectQcPassed = (
    entry,
  ) => {
    const status =
      normalizeProjectQcStatus(
        entry,
      );

    if (
      [
        "FAIL",
        "FAILED",
        "QC FAIL",
        "QC FAILED",
        "REJECT",
        "REJECTED",
      ].includes(status)
    ) {
      return false;
    }

    if (
      [
        "PASS",
        "PASSED",
        "QC PASS",
        "QC PASSED",
        "APPROVED",
        "COMPLETED",
        "QC COMPLETED",
        "QC CHECKED",
        "QC DONE",
        "DONE",
      ].includes(status)
    ) {
      return true;
    }

    if (
      getProjectQcRows(entry).length > 0
    ) {
      return true;
    }

    return (
      entry?.qc_passed === true ||
      entry?.qcPassed === true ||
      entry?.is_qc_passed === true ||
      entry?.isQcPassed === true
    );
  };


  const getProjectQcSerials = (entry) => {
    const rows = getProjectQcRows(entry);

    if (rows.length > 0) {
      const serials = [];
      const seen = new Set();
      let rowNumber = 0;

      const batchValue =
        entry?.code ||
        entry?.inward_code ||
        entry?.grn ||
        entry?.id ||
        "INWARD";

      const batchDigits = (
        (
          String(batchValue).match(
            /\d+/g,
          ) || []
        ).join("")
      )
        .padStart(5, "0")
        .slice(-5);

      rows.forEach((row) => {
        const quantity = Math.max(
          Number(
            row?.qty ??
              row?.quantity ??
              row?.passed_quantity ??
              row?.accepted_quantity ??
              1,
          ) || 0,
          0,
        );

        const rawSerial = String(
          row?.serialNumber ||
            row?.serial_number ||
            row?.serial ||
            "",
        ).trim();

        for (
          let offset = 0;
          offset < quantity;
          offset += 1
        ) {
          rowNumber += 1;

          let serial = rawSerial;

          /*
           * Match backend ProjectInventory serial generation:
           * one QC row with qty 10 becomes 10 serial identities.
           */
          if (
            quantity > 1 &&
            rawSerial
          ) {
            serial =
              `${rawSerial}-${offset + 1}`;
          }

          if (!serial) {
            serial =
              `C_${batchDigits}` +
              `S${String(rowNumber).padStart(
                5,
                "0",
              )}`;
          }

          if (!seen.has(serial)) {
            seen.add(serial);
            serials.push(serial);
          }
        }
      });

      if (serials.length > 0) {
        return serials;
      }
    }

    return Array.from(
      new Set([
        ...splitInventorySerials(
          entry?.purchased_serial_numbers,
        ),
        ...splitInventorySerials(
          entry?.available_purchased_serials,
        ),
        ...splitInventorySerials(
          entry?.issued_purchased_serials,
        ),
        ...splitInventorySerials(
          entry?.serials,
        ),
        ...splitInventorySerials(
          entry?.serials_list,
        ),
        ...splitInventorySerials(
          entry?.serialNumber,
        ),
      ]),
    );
  };


  const getProjectQcPassedQuantity = (
    entry,
  ) => {
    const rows =
      getProjectQcRows(entry);

    if (rows.length > 0) {
      const rowQuantity =
        rows.reduce(
          (sum, row) => {
            const quantity = Number(
              row?.qty ??
                row?.quantity ??
                row?.passed_quantity ??
                row?.accepted_quantity ??
                1,
            );

            return (
              sum +
              (
                Number.isFinite(quantity)
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

      if (rowQuantity > 0) {
        return rowQuantity;
      }
    }

    const explicitPassedQuantity =
      Number(
        entry?.qc_passed_quantity ??
          entry?.qcPassedQuantity ??
          entry?.passed_quantity ??
          entry?.passedQuantity ??
          entry?.accepted_quantity ??
          entry?.acceptedQuantity ??
          0,
      );

    if (
      Number.isFinite(
        explicitPassedQuantity,
      ) &&
      explicitPassedQuantity > 0
    ) {
      return explicitPassedQuantity;
    }

    if (isProjectQcPassed(entry)) {
      const receivedQuantity = Number(
        entry?.quantity_received ??
          entry?.quantityReceived ??
          entry?.quantity ??
          entry?.items ??
          entry?.total_quantity ??
          0,
      );

      return Number.isFinite(
        receivedQuantity,
      )
        ? Math.max(
            receivedQuantity,
            0,
          )
        : 0;
    }

    return 0;
  };


  const getInwardPassedAmount = (entry) => {
    const passedQuantity =
      getProjectQcPassedQuantity(entry);

    if (passedQuantity <= 0) {
      return 0;
    }

    const lineItems = Array.isArray(
      entry?.line_items,
    )
      ? entry.line_items
      : [];

    const receivedQuantity = Math.max(
      Number(
        entry?.quantity_received ??
          entry?.quantity ??
          entry?.items ??
          lineItems.reduce(
            (sum, line) =>
              sum +
              Number(
                line?.quantity ??
                  line?.total_quantity ??
                  0,
              ),
            0,
          ) ??
          0,
      ) || 0,
      0,
    );

    const lineGrandTotal = lineItems.reduce(
      (sum, line) =>
        sum +
        Math.max(
          Number(
            line?.grand_total ??
              line?.grandTotal ??
              0,
          ) || 0,
          0,
        ),
      0,
    );

    if (
      lineGrandTotal > 0 &&
      receivedQuantity > 0
    ) {
      return (
        lineGrandTotal /
        receivedQuantity *
        passedQuantity
      );
    }

    const firstLine = lineItems[0] || {};

    const unitPrice = Math.max(
      Number(
        firstLine?.unit_price ??
          firstLine?.unitPrice ??
          entry?.unit_price ??
          entry?.price ??
          0,
      ) || 0,
      0,
    );

    const gstPercentage = Math.max(
      Number(
        firstLine?.gst_percentage ??
          firstLine?.gst ??
          entry?.gst_percentage ??
          entry?.gst ??
          0,
      ) || 0,
      0,
    );

    return (
      passedQuantity *
      unitPrice *
      (1 + gstPercentage / 100)
    );
  };

  const getStoreUnitCost = (
    item,
    inventoryRows,
  ) => {
    const matchingRows = inventoryRows.filter(
      (inventoryItem) =>
        projectComponentsMatch(
          item,
          inventoryItem,
        ) &&
        Number(
          inventoryItem?.quantity ??
            inventoryItem?.qty ??
            0,
        ) > 0,
    );

    const totals = matchingRows.reduce(
      (result, inventoryItem) => {
        const quantity = Math.max(
          Number(
            inventoryItem?.quantity ??
              inventoryItem?.qty ??
              0,
          ) || 0,
          0,
        );

        const totalPrice = Math.max(
          Number(
            inventoryItem?.total_price ??
              inventoryItem?.totalPrice ??
              0,
          ) || 0,
          0,
        );

        const unitPrice = Math.max(
          Number(
            inventoryItem?.price ??
              inventoryItem?.unit_price ??
              0,
          ) || 0,
          0,
        );

        result.quantity += quantity;
        result.amount +=
          totalPrice > 0
            ? totalPrice
            : unitPrice * quantity;

        return result;
      },
      {
        quantity: 0,
        amount: 0,
      },
    );

    return totals.quantity > 0
      ? totals.amount / totals.quantity
      : 0;
  };

  const getProjectInventoryStatusInfo = (
    row,
  ) => {
    const mrStatus = String(
      row?.material_request_status ||
        row?.mr_status ||
        row?.materialRequestStatus ||
        "",
    )
      .trim()
      .toUpperCase();

    const projectStatus = String(
      row?.status || "",
    )
      .trim()
      .toUpperCase();

    const requestedQuantity = Math.max(
      Number(
        row?.requested_quantity ??
          row?.requestedQuantity ??
          0,
      ) || 0,
      0,
    );

    const storeQuantity = Math.max(
      Number(row?.store_quantity || 0) || 0,
      0,
    );

    const purchasedQuantity = Math.max(
      Number(
        row?.purchased_quantity || 0,
      ) || 0,
      0,
    );

    const readyQuantity =
      storeQuantity + purchasedQuantity;

    const issuedQuantity = Math.max(
      Number(
        row?.issued_quantity ??
          row?.calculated_issued_quantity ??
          (
            Number(
              row?.issued_store_quantity || 0,
            ) +
            Number(
              row?.issued_purchased_quantity ||
                0,
            )
          ) ??
          0,
      ) || 0,
      0,
    );

    const remainingQuantity = Math.max(
      Number.isFinite(
        Number(row?.remaining_quantity),
      )
        ? Number(row.remaining_quantity)
        : requestedQuantity - issuedQuantity,
      0,
    );

    const isIssued =
      [
        "INVENTORY_ISSUED",
        "MR_COMPLETED",
      ].includes(mrStatus) ||
      [
        "ISSUED",
        "COMPLETED",
      ].includes(projectStatus) ||
      row?.is_fulfilled === true;

    if (isIssued) {
      return {
        label: "Issued",
        className:
          "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700",
      };
    }

    if (
      issuedQuantity > 0 &&
      remainingQuantity > 0
    ) {
      return {
        label: "Partially Provided",
        className:
          "inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700",
      };
    }

    if (
      requestedQuantity > 0 &&
      readyQuantity >= requestedQuantity
    ) {
      return {
        label: "Ready",
        className:
          "inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700",
      };
    }

    if (readyQuantity > 0) {
      return {
        label: "Partially Ready",
        className:
          "inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700",
      };
    }

    return {
      label: "Pending",
      className:
        "inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700",
    };
  };

  const loadProjectInventoryData = async () => {
    setProjectInventoryLoading(true);

    try {
      const [
        projectRows,
        inwardRows,
        inventoryRows,
        materialRequestRows,
        purchaseOrderRows,
        componentRows,
      ] = await Promise.all([
        fetchSharedPaginatedList(
          "project-inventory",
          `${config.baseURL}/inventory/project-inventory/?page_size=500`,
          { cache: "no-store" },
        ).catch(() => []),

        fetchSharedPaginatedList(
          "inward",
          `${config.baseURL}/inward/?page_size=500`,
          { cache: "no-store" },
        ).catch(() => []),

        fetchSharedPaginatedList(
          "inventory",
          `${config.baseURL}/inventory/inventory/?page_size=500`,
          {
            cache: "no-store",
            timeoutMs: 60000,
          },
        ).catch(() => []),

        fetchSharedPaginatedList(
          "material-requests",
          `${config.baseURL}/materialrequest/material-requests/?page_size=500`,
          { cache: "no-store" },
        ).catch(() => []),

        fetchSharedPaginatedList(
          "purchase-orders",
          `${config.baseURL}/procurement/purchase-orders/?page_size=500`,
          { cache: "no-store" },
        ).catch(() => []),

        fetchSharedPaginatedList(
          "components",
          `${config.baseURL}/components/components/?page_size=500`,
          { cache: "no-store" },
        ).catch(() => []),
      ]);

      const materialRequestByReference =
        new Map();

      materialRequestRows.forEach((request) => {
        [
          request?.id,
          request?.material_request_id,
          request?.materialRequestId,
          request?.request_id,
          request?.mr_id,
          request?.source_mr_number,
        ]
          .filter(
            (value) =>
              value !== undefined &&
              value !== null &&
              value !== "",
          )
          .forEach((value) => {
            const reference =
              String(value).trim();

            materialRequestByReference.set(
              reference,
              request,
            );

            materialRequestByReference.set(
              reference.toUpperCase(),
              request,
            );
          });
      });

      const resolveMaterialRequest = (
        projectItem,
      ) => {
        const references = [
          getProjectMrNumber(projectItem),
          projectItem?.material_request,
          projectItem?.materialRequest,
          projectItem?.material_request_id,
          projectItem?.materialRequestId,
        ]
          .filter(
            (value) =>
              value !== undefined &&
              value !== null &&
              value !== "",
          )
          .map((value) =>
            String(value).trim(),
          );

        for (const reference of references) {
          const match =
            materialRequestByReference.get(
              reference,
            );

          if (match) {
            return match;
          }
        }

        return null;
      };

      const getResolvedMrNumber = (
        item,
      ) => {
        const directMrNumber =
          getProjectMrNumber(item);

        if (
          directMrNumber &&
          directMrNumber.startsWith("MR-")
        ) {
          return directMrNumber;
        }

        const linkedRequest =
          resolveMaterialRequest(item);

        return String(
          linkedRequest?.material_request_id ||
            linkedRequest?.materialRequestId ||
            linkedRequest?.request_id ||
            directMrNumber ||
            "",
        ).trim();
      };

      const getRawComponentReferences = (
        item,
      ) => {
        const componentObject =
          item?.component &&
          typeof item.component ===
            "object"
            ? item.component
            : null;

        return [
          item?.component_pk,
          item?.component_db_id,
          item?.componentDatabaseId,
          componentObject?.id,
          componentObject?.pk,

          /*
           * Inward and ProjectInventory serializers commonly return
           * the component ForeignKey directly as a numeric value.
           */
          typeof item?.component !==
            "object"
            ? item?.component
            : null,

          item?.componentId,
          item?.component_id,
        ]
          .filter(
            (value) =>
              value !== undefined &&
              value !== null &&
              value !== "",
          )
          .map((value) =>
            String(value).trim(),
          );
      };

      const resolveComponent = (item) => {
        const rawReferences =
          getRawComponentReferences(
            item,
          );

        /*
         * First resolve the actual ForeignKey database ID.
         *
         * Example:
         *   Inward.component = 1
         *   Component.id      = 1
         *   Component.component_id =
         *     CMP-1785923284098
         */
        const databaseMatch =
          componentRows.find(
            (component) => {
              const databaseIds = [
                component?.id,
                component?.pk,
              ]
                .filter(
                  (value) =>
                    value !== undefined &&
                    value !== null &&
                    value !== "",
                )
                .map((value) =>
                  String(value).trim(),
                );

              return rawReferences.some(
                (reference) =>
                  databaseIds.includes(
                    reference,
                  ),
              );
            },
          );

        if (databaseMatch) {
          return databaseMatch;
        }

        /*
         * Then resolve component code or name aliases.
         */
        const aliasMatch =
          componentRows.find(
            (component) => {
              const componentAliases = [
                component?.component_id,
                component?.component_code,
                component?.code,
                component?.name,
                component?.component_name,
              ]
                .filter(Boolean)
                .map((value) =>
                  normalizeProjectText(
                    value,
                  ),
                );

              const itemAliases = [
                item?.component_code,
                item?.componentCode,
                item?.component_name,
                item?.componentName,
                item?.name,
                item?.product_name,
                item?.productName,
              ]
                .filter(Boolean)
                .map((value) =>
                  normalizeProjectText(
                    value,
                  ),
                );

              return itemAliases.some(
                (alias) =>
                  componentAliases.includes(
                    alias,
                  ),
              );
            },
          );

        if (aliasMatch) {
          return aliasMatch;
        }

        return (
          componentRows.find(
            (component) =>
              projectComponentsMatch(
                component,
                item,
              ),
          ) || null
        );
      };

      /*
       * Project Inventory can be returned from two sources:
       *
       * 1. the real ProjectInventory backend row;
       * 2. a temporary MR-linked QC Inward fallback.
       *
       * One source may identify the component as database ID "1",
       * while the other identifies it as
       * "CMP-1785923284098 - propeller".
       *
       * Resolve both through the Components API and use the same
       * database identity so they become one row.
       */
      const getCanonicalProjectComponentKey = (
        item,
      ) => {
        const resolvedComponent =
          resolveComponent(item);

        const databaseId =
          resolvedComponent?.id ??
          resolvedComponent?.pk ??
          item?.component_pk ??
          item?.component_db_id ??
          (
            typeof item?.component ===
              "object"
              ? item.component?.id ??
                item.component?.pk
              : null
          );

        if (
          databaseId !== undefined &&
          databaseId !== null &&
          databaseId !== ""
        ) {
          return (
            "db:" +
            String(databaseId)
              .trim()
              .toLowerCase()
          );
        }

        const componentCode =
          resolvedComponent?.component_id ||
          resolvedComponent?.component_code ||
          resolvedComponent?.code ||
          item?.component_code ||
          item?.componentCode ||
          "";

        if (componentCode) {
          return (
            "code:" +
            normalizeProjectText(
              componentCode,
            ).replace(
              /[^a-z0-9]/g,
              "",
            )
          );
        }

        const componentName =
          resolvedComponent?.name ||
          resolvedComponent?.component_name ||
          item?.component_name ||
          item?.componentName ||
          item?.name ||
          (
            typeof item?.component !==
              "object"
              ? item?.component
              : ""
          ) ||
          "";

        return (
          "name:" +
          normalizeProjectText(
            componentName,
          ).replace(
            /[^a-z0-9]/g,
            "",
          )
        );
      };

      const getProjectInventoryRowKey = (
        item,
      ) => {
        const mrNumber = String(
          item?.source_mr_number ||
            item?.material_request_id ||
            getProjectMrNumber(item) ||
            "",
        )
          .trim()
          .toUpperCase();

        return (
          `${mrNumber}|` +
          getCanonicalProjectComponentKey(
            item,
          )
        );
      };

      const normalizedBackendRows =
        projectRows.map((item) => {
          const linkedMaterialRequest =
            resolveMaterialRequest(item);

          const mrNumber =
            getResolvedMrNumber(item);

          const materialRequestStatus =
            item.material_request_status ||
            item.mr_status ||
            linkedMaterialRequest?.status ||
            "";

          const matchingInwards =
            inwardRows.filter((entry) => {
              const inwardMrNumber =
                getInwardMrNumber(
                  entry,
                  purchaseOrderRows,
                );

              return (
                inwardMrNumber === mrNumber &&
                projectComponentsMatch(
                  item,
                  entry,
                )
              );
            });

          const qcPassedFromInward =
            matchingInwards.reduce(
              (total, entry) =>
                total +
                getProjectQcPassedQuantity(
                  entry,
                ),
              0,
            );

          const purchasedAmount =
            matchingInwards.reduce(
              (sum, entry) =>
                sum +
                getInwardPassedAmount(entry),
              0,
            );

          const storeQuantity = Math.max(
            Number(
              item.store_quantity || 0,
            ) || 0,
            0,
          );

          /*
           * Project Qty is MR-linked purchased stock that has
           * passed QC. Prefer backend ProjectInventory values, but
           * also accept the confirmed QC-passed Inward total.
           */
          const purchasedQuantity = Math.max(
            Number(
              item.purchased_quantity || 0,
            ) || 0,

            Number(
              item.qc_passed_quantity || 0,
            ) || 0,

            qcPassedFromInward,

            0,
          );

          const storeUnitCost =
            getStoreUnitCost(
              item,
              inventoryRows,
            );

          const storeAmount =
            storeQuantity * storeUnitCost;

          const directAmount = Math.max(
            Number(
              item.total_amount ??
                item.totalPrice ??
                item.total_price ??
                item.amount ??
                0,
            ) || 0,
            0,
          );

          const totalPrice =
            directAmount > 0
              ? directAmount
              : purchasedAmount +
                storeAmount;

          const componentDetails =
            resolveComponent(item);

          const componentCode =
            item.component_code ||
            componentDetails?.component_id ||
            componentDetails?.component_code ||
            componentDetails?.code ||
            "";

          const componentName =
            item.component_name ||
            componentDetails?.name ||
            componentDetails?.component_name ||
            "";

          const componentLabel = [
            componentCode,
            componentName,
          ]
            .filter(Boolean)
            .join(" - ");

          const purchasedSerialNumbers =
            Array.from(
              new Set([
                ...splitInventorySerials(
                  item.purchased_serial_numbers,
                ),
                ...splitInventorySerials(
                  item.purchasedSerialNumbers,
                ),
                ...matchingInwards.flatMap(
                  getProjectQcSerials,
                ),
              ]),
            );

          const issuedPurchasedSerials =
            Array.from(
              new Set([
                ...splitInventorySerials(
                  item.issued_purchased_serials,
                ),
                ...splitInventorySerials(
                  item.issuedPurchasedSerials,
                ),
              ]),
            );

          const availablePurchasedSerials =
            Array.from(
              new Set([
                ...splitInventorySerials(
                  item.available_purchased_serials,
                ),
                ...splitInventorySerials(
                  item.availablePurchasedSerials,
                ),
                ...purchasedSerialNumbers.filter(
                  (serial) =>
                    !issuedPurchasedSerials.includes(
                      serial,
                    ),
                ),
              ]),
            );

          const backendSerials =
            purchasedSerialNumbers.length > 0
              ? purchasedSerialNumbers
              : extractGroupedSerials(item);

          return {
            ...item,

            id: `project-${item.id}`,
            backendId: item.id,

            source: "project-inventory",
            source_mr_number: mrNumber,
            material_request_id: mrNumber,
            material_request_status:
              materialRequestStatus,
            inventory_scope: "project",

            serials: backendSerials,
            serials_list: backendSerials,
            serialNumber: backendSerials.join(", ") || "-",

            purchased_serial_numbers:
              purchasedSerialNumbers,
            available_purchased_serials:
              availablePurchasedSerials,
            issued_purchased_serials:
              issuedPurchasedSerials,

            component:
              componentLabel ||
              componentName ||
              componentCode ||
              item.component ||
              "-",

            component_code:
              componentCode,

            component_name:
              componentName,

            category:
              item.category ||
              componentDetails?.category ||
              "-",

            specifications:
              item.specifications ||
              item.specification ||
              componentDetails?.specifications ||
              componentDetails?.specification ||
              "-",

            code:
              item.inward_codes?.join?.(", ") ||
              item.po_numbers?.join?.(", ") ||
              matchingInwards
                .map(
                  (entry) =>
                    entry.code ||
                    entry.inward_code ||
                    entry.grn,
                )
                .filter(Boolean)
                .join(", ") ||
              `PROJECT-${item.id}`,

            qty: purchasedQuantity,
            quantity: purchasedQuantity,

            has_project_procurement_stock:
              Boolean(mrNumber) &&
              purchasedQuantity > 0,

            date:
              item.updated_at ||
              item.created_at ||
              matchingInwards[0]
                ?.received_date ||
              matchingInwards[0]
                ?.date ||
              "",

            status:
              item.status ||
              (
                item.is_fulfilled
                  ? "COMPLETED"
                  : "QC PASSED"
              ),

            issued:
              [
                "INVENTORY_ISSUED",
                "MR_COMPLETED",
              ].includes(
                String(
                  materialRequestStatus,
                ).toUpperCase(),
              ) ||
              [
                "ISSUED",
                "COMPLETED",
              ].includes(
                String(
                  item.status || "",
                ).toUpperCase(),
              ),

            project_inventory_record: true,

            store_quantity:
              storeQuantity,

            purchased_quantity:
              purchasedQuantity,

            qc_passed_quantity:
              Math.max(
                Number(
                  item.qc_passed_quantity ||
                    0,
                ) || 0,
                qcPassedFromInward,
              ),

            requested_quantity: Number(
              item.requested_quantity || 0,
            ),

            issued_store_quantity: Number(
              item.issued_store_quantity || 0,
            ),

            issued_purchased_quantity:
              Number(
                item
                  .issued_purchased_quantity ||
                  0,
              ),

            issued_quantity: Number(
              item.issued_quantity ||
                item.calculated_issued_quantity ||
                0,
            ),

            remaining_quantity: Number(
              item.remaining_quantity || 0,
            ),

            purchasedAmount,
            storeAmount,

            /*
             * Use purchasedQuantity. The previous code referenced
             * an undefined variable named `quantity`, which caused
             * the complete Project Inventory load to fail.
             */
            price:
              purchasedQuantity > 0
                ? totalPrice /
                  purchasedQuantity
                : 0,

            totalPrice,
            total_price: totalPrice,
          };
        });

      /*
       * Fallback for completed MR-linked QC rows when the backend
       * ProjectInventory row has not yet appeared in the API.
       *
       * Direct PO and Direct Inward entries are excluded because
       * getInwardMrNumber() returns an empty string for them.
       */
      const qcFallbackByKey =
        new Map();

      inwardRows.forEach((entry) => {
        const mrNumber =
          getInwardMrNumber(
            entry,
            purchaseOrderRows,
          );

        const passedQuantity =
          getProjectQcPassedQuantity(
            entry,
          );

        if (
          !mrNumber ||
          passedQuantity <= 0
        ) {
          return;
        }

        const linkedMaterialRequest =
          materialRequestByReference.get(
            mrNumber,
          ) ||
          materialRequestByReference.get(
            String(mrNumber).toUpperCase(),
          ) ||
          null;

        const componentDetails =
          resolveComponent(entry);

        const componentCode =
          entry.component_code ||
          componentDetails?.component_id ||
          componentDetails?.component_code ||
          componentDetails?.code ||
          String(
            entry.component_id ||
              entry.component ||
              "",
          );

        const componentName =
          entry.component_name ||
          componentDetails?.name ||
          componentDetails?.component_name ||
          "";

        const componentKey =
          getCanonicalProjectComponentKey(
            entry,
          );

        const groupKey =
          `${String(mrNumber)
            .trim()
            .toUpperCase()}|${componentKey}`;

        const purchaseOrder =
          getInwardPurchaseOrder(
            entry,
            purchaseOrderRows,
          );

        const existing =
          qcFallbackByKey.get(
            groupKey,
          ) || {
            id:
              `project-qc-${mrNumber}-${componentKey}`,

            backendId: null,
            source: "mr-qc-inward-fallback",
            source_mr_number: mrNumber,
            material_request_id: mrNumber,
            material_request_status:
              linkedMaterialRequest?.status ||
              "QC_CHECKED",
            inventory_scope: "project",

            component: [
              componentCode,
              componentName,
            ]
              .filter(Boolean)
              .join(" - ") ||
              componentName ||
              componentCode ||
              "-",

            component_code:
              componentCode,

            component_name:
              componentName,

            category:
              entry.category ||
              componentDetails?.category ||
              "-",

            specifications:
              entry.specifications ||
              componentDetails?.specifications ||
              componentDetails?.specification ||
              "-",

            code: "",
            po_numbers: [],
            inward_codes: [],

            qty: 0,
            quantity: 0,
            purchased_quantity: 0,
            qc_passed_quantity: 0,
            store_quantity: 0,

            requested_quantity: 0,
            issued_store_quantity: 0,
            issued_purchased_quantity: 0,
            issued_quantity: 0,
            remaining_quantity: 0,

            purchasedAmount: 0,
            storeAmount: 0,
            totalPrice: 0,
            total_price: 0,
            price: 0,

            date:
              entry.received_date ||
              entry.date ||
              entry.updated_at ||
              entry.created_at ||
              "",

            status: "QC PASSED",
            issued: false,
            is_fulfilled: false,

            project_inventory_record: true,
            has_project_procurement_stock:
              true,

            serials: getProjectQcSerials(entry),
            serials_list: getProjectQcSerials(entry),
            serialNumber:
              getProjectQcSerials(entry).join(", ") || "-",
          };

        existing.qty += passedQuantity;
        existing.quantity +=
          passedQuantity;
        existing.purchased_quantity +=
          passedQuantity;
        existing.qc_passed_quantity +=
          passedQuantity;

        const passedAmount =
          getInwardPassedAmount(entry);

        existing.purchasedAmount +=
          passedAmount;
        existing.totalPrice +=
          passedAmount;
        existing.total_price =
          existing.totalPrice;

        existing.price =
          existing.purchased_quantity > 0
            ? existing.totalPrice /
              existing.purchased_quantity
            : 0;

        const inwardCode =
          entry.code ||
          entry.inward_code ||
          entry.grn ||
          "";

        if (
          inwardCode &&
          !existing.inward_codes.includes(
            inwardCode,
          )
        ) {
          existing.inward_codes.push(
            inwardCode,
          );
        }

        const poNumber =
          purchaseOrder?.po_number ||
          purchaseOrder?.po ||
          "";

        if (
          poNumber &&
          !existing.po_numbers.includes(
            poNumber,
          )
        ) {
          existing.po_numbers.push(
            poNumber,
          );
        }

        existing.code =
          existing.inward_codes.join(", ") ||
          existing.po_numbers.join(", ") ||
          existing.code;

        existing.serials = Array.from(
          new Set([
            ...(Array.isArray(existing.serials) ? existing.serials : []),
            ...getProjectQcSerials(entry),
          ]),
        );

        existing.serials_list = existing.serials;
        existing.serialNumber = existing.serials.join(", ") || "-";

        qcFallbackByKey.set(
          groupKey,
          existing,
        );
      });

      /*
       * Deduplicate using:
       *
       *   MR number + canonical component database identity
       *
       * The actual backend ProjectInventory row always has priority.
       * The QC Inward fallback only fills missing quantity, amount,
       * inward code or PO information while the backend is refreshing.
       */
      const projectRowsByKey =
        new Map();

      const mergeProjectInventoryRows = (
        primaryRow,
        secondaryRow,
      ) => {
        const primaryPurchased =
          Math.max(
            Number(
              primaryRow
                ?.purchased_quantity ||
                primaryRow
                  ?.qc_passed_quantity ||
                primaryRow?.qty ||
                0,
            ) || 0,
            0,
          );

        const secondaryPurchased =
          Math.max(
            Number(
              secondaryRow
                ?.purchased_quantity ||
                secondaryRow
                  ?.qc_passed_quantity ||
                secondaryRow?.qty ||
                0,
            ) || 0,
            0,
          );

        /*
         * Both rows represent the same physical QC-passed stock,
         * therefore use MAX instead of SUM.
         */
        const purchasedQuantity =
          Math.max(
            primaryPurchased,
            secondaryPurchased,
          );

        const primaryAmount =
          Math.max(
            Number(
              primaryRow?.totalPrice ??
                primaryRow?.total_price ??
                primaryRow
                  ?.purchasedAmount ??
                0,
            ) || 0,
            0,
          );

        const secondaryAmount =
          Math.max(
            Number(
              secondaryRow?.totalPrice ??
                secondaryRow?.total_price ??
                secondaryRow
                  ?.purchasedAmount ??
                0,
            ) || 0,
            0,
          );

        const totalPrice =
          Math.max(
            primaryAmount,
            secondaryAmount,
          );

        const inwardCodes = Array.from(
          new Set([
            ...(
              Array.isArray(
                primaryRow?.inward_codes,
              )
                ? primaryRow.inward_codes
                : []
            ),
            ...(
              Array.isArray(
                secondaryRow?.inward_codes,
              )
                ? secondaryRow.inward_codes
                : []
            ),
          ].filter(Boolean)),
        );

        const poNumbers = Array.from(
          new Set([
            ...(
              Array.isArray(
                primaryRow?.po_numbers,
              )
                ? primaryRow.po_numbers
                : []
            ),
            ...(
              Array.isArray(
                secondaryRow?.po_numbers,
              )
                ? secondaryRow.po_numbers
                : []
            ),
          ].filter(Boolean)),
        );

        const purchasedSerialNumbers =
          Array.from(
            new Set([
              ...getProjectPurchasedSerialsFromRow(
                primaryRow,
              ),
              ...getProjectPurchasedSerialsFromRow(
                secondaryRow,
              ),
            ]),
          );

        const issuedPurchasedSerials =
          Array.from(
            new Set([
              ...getProjectIssuedPurchasedSerialsFromRow(
                primaryRow,
              ),
              ...getProjectIssuedPurchasedSerialsFromRow(
                secondaryRow,
              ),
            ]),
          );

        const issuedPurchasedSet =
          new Set(
            issuedPurchasedSerials.map(
              String,
            ),
          );

        const availablePurchasedSerials =
          Array.from(
            new Set([
              ...splitInventorySerials(
                primaryRow
                  ?.available_purchased_serials,
              ),
              ...splitInventorySerials(
                secondaryRow
                  ?.available_purchased_serials,
              ),
              ...purchasedSerialNumbers.filter(
                (serial) =>
                  !issuedPurchasedSet.has(
                    String(serial),
                  ),
              ),
            ]),
          );

        const primaryComponent =
          String(
            primaryRow?.component || "",
          ).trim();

        const secondaryComponent =
          String(
            secondaryRow?.component || "",
          ).trim();

        const primaryComponentIsRawId =
          /^\d+$/.test(
            primaryComponent,
          );

        return {
          ...secondaryRow,
          ...primaryRow,

          /*
           * Prefer the descriptive backend/component-master label.
           */
          component:
            (
              primaryComponent &&
              !primaryComponentIsRawId
            )
              ? primaryComponent
              : secondaryComponent ||
                primaryComponent ||
                "-",

          component_code:
            primaryRow?.component_code ||
            secondaryRow?.component_code ||
            "",

          component_name:
            primaryRow?.component_name ||
            secondaryRow?.component_name ||
            "",

          category:
            (
              primaryRow?.category &&
              primaryRow.category !== "-"
            )
              ? primaryRow.category
              : secondaryRow?.category ||
                "-",

          specifications:
            (
              primaryRow?.specifications &&
              primaryRow.specifications !==
                "-"
            )
              ? primaryRow.specifications
              : secondaryRow
                  ?.specifications ||
                "-",

          qty: purchasedQuantity,
          quantity:
            purchasedQuantity,
          purchased_quantity:
            purchasedQuantity,
          qc_passed_quantity:
            Math.max(
              Number(
                primaryRow
                  ?.qc_passed_quantity ||
                  0,
              ) || 0,
              Number(
                secondaryRow
                  ?.qc_passed_quantity ||
                  0,
              ) || 0,
              purchasedQuantity,
            ),

          totalPrice,
          total_price: totalPrice,
          purchasedAmount:
            totalPrice,

          price:
            purchasedQuantity > 0
              ? totalPrice /
                purchasedQuantity
              : 0,

          inward_codes:
            inwardCodes,

          po_numbers:
            poNumbers,

          code:
            primaryRow?.code &&
            !String(
              primaryRow.code,
            ).startsWith("PROJECT-")
              ? primaryRow.code
              : inwardCodes.join(", ") ||
                poNumbers.join(", ") ||
                secondaryRow?.code ||
                primaryRow?.code ||
                "",

          date:
            primaryRow?.date ||
            secondaryRow?.date ||
            "",

          has_project_procurement_stock:
            Boolean(
              primaryRow
                ?.source_mr_number ||
              primaryRow
                ?.material_request_id ||
              secondaryRow
                ?.source_mr_number ||
              secondaryRow
                ?.material_request_id,
            ) &&
            purchasedQuantity > 0,

          purchased_serial_numbers:
            purchasedSerialNumbers,
          available_purchased_serials:
            availablePurchasedSerials,
          issued_purchased_serials:
            issuedPurchasedSerials,
          serials:
            purchasedSerialNumbers,
          serials_list:
            purchasedSerialNumbers,
          serialNumber:
            purchasedSerialNumbers.join(", ") ||
            "-",
        };
      };

      /*
       * Load real backend rows first.
       */
      normalizedBackendRows.forEach(
        (backendRow) => {
          const rowKey =
            getProjectInventoryRowKey(
              backendRow,
            );

          const existing =
            projectRowsByKey.get(
              rowKey,
            );

          projectRowsByKey.set(
            rowKey,
            existing
              ? mergeProjectInventoryRows(
                  existing,
                  backendRow,
                )
              : backendRow,
          );
        },
      );

      /*
       * Merge fallback data into the real backend row instead of
       * adding another visible row.
       */
      Array.from(
        qcFallbackByKey.values(),
      ).forEach((fallbackRow) => {
        const rowKey =
          getProjectInventoryRowKey(
            fallbackRow,
          );

        const backendRow =
          projectRowsByKey.get(
            rowKey,
          );

        projectRowsByKey.set(
          rowKey,
          backendRow
            ? mergeProjectInventoryRows(
                backendRow,
                fallbackRow,
              )
            : fallbackRow,
        );
      });

      /*
       * Keep every real MR-linked ProjectInventory row in memory.
       *
       * This state is used by two different screens:
       *
       * 1. Project Inventory tab:
       *    visibleProjectInventory still shows only purchased/QC stock.
       *
       * 2. In Drone Eye popup:
       *    store-only rows are also required because they contain
       *    issued_store_serials.
       *
       * The previous purchasedQuantity > 0 rule removed store-only rows,
       * so the In Drone popup could never find their issued serials.
       */
      const strictProjectRows =
        Array.from(
          projectRowsByKey.values(),
        ).filter((row) => {
          const mrNumber = String(
            row.source_mr_number ||
              row.material_request_id ||
              "",
          ).trim();

          const purchasedQuantity =
            Math.max(
              Number(
                row.purchased_quantity ||
                  row.qc_passed_quantity ||
                  0,
              ) || 0,
              0,
            );

          const storeQuantity =
            Math.max(
              Number(
                row.store_quantity ||
                  row.reserved_store_quantity ||
                  0,
              ) || 0,
              0,
            );

          const issuedStoreQuantity =
            Math.max(
              Number(
                row.issued_store_quantity ||
                  0,
              ) || 0,
              0,
            );

          const issuedPurchasedQuantity =
            Math.max(
              Number(
                row.issued_purchased_quantity ||
                  0,
              ) || 0,
              0,
            );

          const issuedStoreSerials =
            Array.from(
              new Set([
                ...splitInventorySerials(
                  row.issued_store_serials,
                ),
                ...splitInventorySerials(
                  row.issuedStoreSerials,
                ),
              ]),
            );

          const issuedPurchasedSerials =
            Array.from(
              new Set([
                ...splitInventorySerials(
                  row.issued_purchased_serials,
                ),
                ...splitInventorySerials(
                  row.issuedPurchasedSerials,
                ),
              ]),
            );

          return (
            Boolean(mrNumber) &&
            (
              purchasedQuantity > 0 ||
              storeQuantity > 0 ||
              issuedStoreQuantity > 0 ||
              issuedPurchasedQuantity > 0 ||
              issuedStoreSerials.length > 0 ||
              issuedPurchasedSerials.length > 0
            )
          );
        });

      /*
       * Final defensive deduplication:
       *
       * Resolve every row again after normalization. This protects
       * against an API response where one row arrives as component
       * database ID "1" and another arrives as a formatted label.
       */
      const finalRowsByKey =
        new Map();

      strictProjectRows.forEach((row) => {
        const rowKey =
          getProjectInventoryRowKey(
            row,
          );

        const existing =
          finalRowsByKey.get(rowKey);

        finalRowsByKey.set(
          rowKey,
          existing
            ? mergeProjectInventoryRows(
                existing,
                row,
              )
            : row,
        );
      });

      const projectQcRows =
        Array.from(
          finalRowsByKey.values(),
        );

      console.debug(
        "MR-linked QC Inward fallback rows:",
        Array.from(
          qcFallbackByKey.values(),
        ).map((row) => ({
          mr:
            row.source_mr_number ||
            row.material_request_id,
          component:
            row.component,
          qcPassed:
            row.qc_passed_quantity,
          status:
            row.status,
        })),
      );

      console.debug(
        "MR-linked QC Project Inventory:",
        projectQcRows.map((row) => ({
          mr:
            row.source_mr_number ||
            row.material_request_id,
          component: row.component,
          qcPassed:
            row.purchased_quantity,
          dedupeKey:
            getProjectInventoryRowKey(
              row,
            ),
          rawComponentReferences:
            getRawComponentReferences(
              row,
            ),
          resolvedComponentId:
            resolveComponent(row)?.id ??
            resolveComponent(row)?.pk ??
            null,
        })),
      );

      setProjectInventory(
        projectQcRows,
      );
    } catch (error) {
      console.error(
        "Failed to load Project Inventory:",
        error,
      );

      setProjectInventory([]);
    } finally {
      setProjectInventoryLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    setQcInventory([]);
    setInitialPageLoading(true);

    (async () => {
      try {
        /*
         * IMPORTANT:
         * Do not load MR -> In Store -> Project -> Outward sequentially.
         * With a large Material Request table, that made In Store wait for
         * unrelated modules before its own request even started.
         *
         * Start every inventory source immediately and let each loader
         * handle its own failure independently.
         */
        const results = await Promise.allSettled([
          loadInventoryData(),
          loadApprovedMaterialRequests(),
          loadProjectInventoryData(),
          loadOutwardData(),
        ]);

        results.forEach((result, index) => {
          if (result.status !== "rejected") {
            return;
          }

          const labels = [
            "In Store",
            "Material Requests / In Drone",
            "Project Inventory",
            "Outward / Scrap",
          ];

          console.error(
            `${labels[index]} initial load failed:`,
            result.reason,
          );
        });
      } finally {
        if (mounted) {
          setInitialPageLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * Refresh the correct inventory source after stock movement.
   *
   * STORE issues and Direct QC refresh In Store.
   * MR-linked QC refreshes Project Inventory.
   */
  useEffect(() => {
    let refreshTimer = null;

    const handleInventoryChange = (
      event,
    ) => {
      const changeType =
        event?.detail?.type || "";

      if (
        ![
          "storeIssued",
          "storeQcPassed",
          "projectInventoryQcPassed",
          "projectInventory",
          "purchasedIssued",
          "componentUsage",
        ].includes(changeType)
      ) {
        return;
      }

      if (refreshTimer) {
        window.clearTimeout(
          refreshTimer,
        );
      }

      refreshTimer =
        window.setTimeout(() => {
          if (
            changeType ===
              "projectInventoryQcPassed" ||
            changeType ===
              "projectInventory" ||
            changeType ===
              "purchasedIssued"
          ) {
            /*
             * A PO/QC issue changes ProjectInventory.issued_purchased_serials.
             * Reload both Project Inventory and In Drone MR data so the Eye
             * popup immediately receives the exact issued QC serials.
             */
            void Promise.all([
              loadProjectInventoryData(),
              loadApprovedMaterialRequests(),
            ]);
            return;
          }

          if (
            changeType ===
            "storeIssued"
          ) {
            /*
             * A STORE issue changes both:
             *
             * - central Inventory balance;
             * - ProjectInventory.issued_store_serials.
             *
             * Reload both sources so the In Drone Eye popup immediately
             * receives the exact serial numbers issued from In Store.
             */
            void Promise.all([
              loadInventoryData(),
              loadProjectInventoryData(),
              loadApprovedMaterialRequests(),
            ]);

            return;
          }

          /*
           * componentUsage reaches this branch after both ISSUE and RETURN.
           * The backend has already changed Inventory.quantity,
           * serial_numbers and issued_serial_numbers, so reload In Store.
           */
          void loadInventoryData();
        }, 100);
    };

    window.addEventListener(
      "inventory:changed",
      handleInventoryChange,
    );

    return () => {
      if (refreshTimer) {
        window.clearTimeout(
          refreshTimer,
        );
      }

      window.removeEventListener(
        "inventory:changed",
        handleInventoryChange,
      );
    };
  }, []);

  /*
   * Reload MR and ProjectInventory data whenever the user opens In Drone.
   *
   * This also covers navigation from Inventory Notifications where the
   * inventory:changed event may have fired before this page mounted.
   */
  useEffect(() => {
    if (tab !== "in-drone") {
      return;
    }

    void Promise.all([
      loadApprovedMaterialRequests(),
      loadProjectInventoryData(),
    ]);
  }, [tab]);

  /*
   * IMPORTANT:
   *
   * Do not subscribe this page to the global inventory:changed or
   * notificationsUpdated events.
   *
   * Other mounted components can emit those events repeatedly. When
   * this page listens to them, every event downloads Inventory,
   * Project Inventory, Material Requests and the large Inward payload
   * again.
   *
   * This page already refreshes explicitly after its create, issue,
   * provide and delete actions. The initial useEffect above loads the
   * page once.
   */

  const getInventoryRemovalKeys = (item) => {
    const keys = [];
    if (item?.id != null && !String(item.id).includes("|")) keys.push(String(item.id));
    if (item?.serialNumber) keys.push(`serial-${String(item.serialNumber)}`);
    if (!item?.id && !item?.serialNumber && item?.code) {
      keys.push(String(item.code));
    }
    return keys;
  };

  const filterRemovedInventory = (items) => {
    const removed = new Set(removedInventoryKeys);
    return (Array.isArray(items) ? items : []).filter((item) => {
      const itemKeys = getInventoryRemovalKeys(item);
      return !itemKeys.some((key) => removed.has(key));
    });
  };

  const getManualInventoryId = (row) => {
    if (row?.backendId && row.source === "manual") {
      return String(row.backendId);
    }
    const rawId = String(row?.id || "");
    if (!rawId.startsWith("manual-")) return null;
    const withoutPrefix = rawId.replace(/^manual-/, "");
    const parts = withoutPrefix.split("-");
    if (parts.length >= 2) {
      parts.pop();
      return parts.join("-");
    }
    return withoutPrefix;
  };

  const getInventoryBackendIds = (row) => {
    const values = [
      ...(Array.isArray(row?.backendIds)
        ? row.backendIds
        : []),
      ...(Array.isArray(row?.inwardIds)
        ? row.inwardIds
        : []),
      row?.inwardId,
      row?.inward_id,
      row?.backendId,
    ];

    if (row?.source === "manual") {
      values.push(getManualInventoryId(row));
    }

    return Array.from(
      new Set(
        values
          .filter(
            (value) =>
              value != null &&
              value !== "" &&
              !String(value).includes("|"),
          )
          .map(String),
      ),
    );
  };

  const deleteInventoryRowFromBackend = async (row) => {
    if (!canManageInventory) {
      throw new Error("You have view-only access to Inventory.");
    }

    if (!row) {
      throw new Error("Inventory row was not found.");
    }

    const backendIds = getInventoryBackendIds(row);

    if (backendIds.length === 0) {
      throw new Error(
        `Backend record ID is missing for ${
          row.component || "the selected component"
        }.`,
      );
    }

    const endpointPrefix =
      row.source === "inward"
        ? `${config.baseURL}/inward`
        : `${config.baseURL}/inventory/inventory`;

    for (const backendId of backendIds) {
      await fetchAuthenticatedJson(
        `${endpointPrefix}/${encodeURIComponent(
          backendId,
        )}/`,
        {
          method: "DELETE",
        },
      );
    }

    return backendIds;
  };

  const removeInventoryRowsFromState = (rows) => {
    const rowList = Array.isArray(rows)
      ? rows
      : [rows];

    const selectedIds = new Set(
      rowList.map((row) => String(row.id)),
    );

    setQcInventory((previous) =>
      previous.filter(
        (row) =>
          !selectedIds.has(String(row.id)),
      ),
    );
  };

  const removeInventoryLocally = (rows) => {
    const rowList = Array.isArray(rows) ? rows : [rows];
    const removalKeys = rowList.flatMap((row) => getInventoryRemovalKeys(row));
    // Debug: log which keys are being removed locally
    try {
      console.debug("removeInventoryLocally -> removalKeys:", removalKeys);
      console.debug("removeInventoryLocally -> before removedInventoryKeys:", getStoredRemovedInventoryKeys());
    } catch (e) {}

    setRemovedInventoryKeys((prev) => {
      const nextKeys = [...new Set([...prev, ...removalKeys])];
      persistRemovedInventoryKeys(nextKeys);
      return nextKeys;
    });
    // Also clear any issued keys for removed rows to keep storage consistent
    setIssuedInventoryKeys((prev) => prev.filter((k) => !removalKeys.includes(k)));
    setQcInventory((prev) =>
      prev.filter((item) => {
        if (!rowList.length) return true;

        const matchesSelected = rowList.some((row) => {
          // Exact-match by id when available
          if (row?.id && item?.id && String(row.id) === String(item.id)) return true;

          // Exact-match by serialNumber when available
          if (row?.serialNumber && item?.serialNumber && String(row.serialNumber) === String(item.serialNumber)) return true;

          // Fallback: match by code exact equality
          if (row?.code && item?.code && String(row.code) === String(item.code)) return true;

          return false;
        });

        return !matchesSelected;
      })
    );
  };


  const getInventoryIssueQtyKey = (item) => {
    return [
      item.source || "",
      buildInventoryPersistenceKey(item),
      item.component || "",
      item.category || "",
      item.vendor || "",
      item.po || "",
    ].join("|");
  };

  const persistInventory = (items) => {
    let filteredItems = filterRemovedInventory(items);

    if (
      Array.isArray(items) &&
      items.length > 0 &&
      filteredItems.length === 0 &&
      removedInventoryKeys.length > Math.max(50, items.length * 3)
    ) {
      console.warn(
        "persistInventory: removedInventoryKeys filtered out all items; ignoring removal filter to restore inventory view.",
      );
      filteredItems = Array.isArray(items) ? items : [];
    }

   const aggregatedInventory = filteredItems.reduce((acc, item) => {
      const identity = buildInventoryPersistenceKey(item);
      const existing = acc.get(identity);
      const qty = Number(item.qty ?? item.quantity ?? item.passed_quantity ?? 1);
      const unitPrice = Number(item.price ?? item.unit_price ?? 0);
      const rawTotalPrice = Number(item.totalPrice ?? item.total_price ?? 0);
      const totalPrice = rawTotalPrice || (unitPrice * qty);

      if (!existing) {
        acc.set(identity, {
          ...item,
          qty,
          quantity: qty,
          price: unitPrice,
          totalPrice,
        });
        return acc;
      }

      existing.qty = Number(existing.qty ?? existing.quantity ?? 0) + qty;
      existing.quantity = existing.qty;
      existing.totalPrice = Number(existing.totalPrice ?? 0) + totalPrice;
      existing.price = existing.qty > 0 ? existing.totalPrice / existing.qty : unitPrice || existing.price;

      if (!existing.component && item.component) existing.component = item.component;
      if (!existing.category && item.category) existing.category = item.category;
      if (!existing.specifications && item.specifications) existing.specifications = item.specifications;
      if (!existing.vendor && item.vendor) existing.vendor = item.vendor;
      if (!existing.po && item.po) existing.po = item.po;
      if (!existing.date && item.date) existing.date = item.date;

      return acc;
    }, new Map());

    const uniqueInventory = Array.from(aggregatedInventory.values());

    /*
     * Central Inventory is the authoritative In-Store balance.
     *
     * Do NOT subtract browser-local "issued" quantities here.
     * Inventory Notification / MR issue updates the backend quantity and
     * serial numbers; QC/Inward/returns add stock back in the backend.
     * This page simply renders that current backend balance.
     */
    const currentInventory = uniqueInventory
      .map((item) => {
        const quantity = Math.max(
          Number(
            item.qty ??
              item.quantity ??
              item.available_quantity ??
              item.remaining_quantity ??
              0,
          ) || 0,
          0,
        );

        return {
          ...item,
          qty: quantity,
          quantity,
        };
      })
      .filter(
        (item) =>
          Number(
            item.qty ??
              item.quantity ??
              0,
          ) > 0,
      );

    setQcInventory(currentInventory);

    /*
     * Do not dispatch inventory:changed here.
     *
     * persistInventory() is called by loadInventoryData().
     * Dispatching the refresh event from this function causes:
     *
     * loadInventoryData()
     * → persistInventory()
     * → inventory:changed
     * → loadInventoryData()
     * → infinite API request loop.
     *
     * inventory:changed must be dispatched only after an actual
     * create, update, issue, or delete action.
     */
  };
const getPurchaseOrderFromInward = (
  entry,
  purchaseOrderList = []
) => {
  const rawPurchaseOrder =
    entry?.purchase_order ??
    entry?.purchaseOrder ??
    entry?.purchaseOrderId ??
    entry?.po_id;

  const purchaseOrderId =
    typeof rawPurchaseOrder === "object"
      ? rawPurchaseOrder?.id ??
        rawPurchaseOrder?.pk
      : rawPurchaseOrder;

  const matchedPurchaseOrder =
    purchaseOrderList.find(
      (purchaseOrder) =>
        String(purchaseOrder.id) ===
        String(purchaseOrderId)
    );

  if (matchedPurchaseOrder) {
    return matchedPurchaseOrder;
  }

  return typeof rawPurchaseOrder === "object"
    ? rawPurchaseOrder
    : null;
};

const getSourceMrNumber = (
  entry,
  purchaseOrderList = []
) => {
  const purchaseOrder =
    getPurchaseOrderFromInward(
      entry,
      purchaseOrderList
    );

  return String(
    purchaseOrder?.source_mr_number ||
    purchaseOrder?.sourceMrNumber ||
    purchaseOrder?.mr_number ||
    entry?.source_mr_number ||
    entry?.sourceMrNumber ||
    ""
  ).trim();
};
async function loadInventoryData(
  vendorList = [],
  componentList = [],
  poList = []
) {
    try {
      /*
       * Load supporting masters independently.
       *
       * Previously one 401 from Purchase Orders rejected Promise.all()
       * and loadInventoryData() never even requested the Inventory API.
       */
      const [
        vendorResult,
        componentResult,
        poResult,
      ] = await Promise.allSettled([
        fetchSharedPaginatedList(
          "vendors",
          `${config.baseURL}/vendors/?page_size=500`,
          { cache: "no-store" },
        ),
        fetchSharedPaginatedList(
          "components",
          `${config.baseURL}/components/components/?page_size=500`,
          { cache: "no-store" },
        ),
        fetchSharedPaginatedList(
          "purchase-orders",
          `${config.baseURL}/procurement/purchase-orders/?page_size=500`,
          { cache: "no-store" },
        ),
      ]);

      const vendors =
        vendorResult.status === "fulfilled"
          ? asApiRows(vendorResult.value)
          : asApiRows(vendorList);

      const components =
        componentResult.status === "fulfilled"
          ? asApiRows(componentResult.value)
          : asApiRows(componentList);

      const purchaseOrders =
        poResult.status === "fulfilled"
          ? asApiRows(poResult.value)
          : asApiRows(poList);

      if (vendorResult.status === "rejected") {
        console.warn(
          "Vendor master load failed; continuing with Inventory:",
          vendorResult.reason,
        );
      }

      if (componentResult.status === "rejected") {
        console.warn(
          "Component master load failed; continuing with Inventory:",
          componentResult.reason,
        );
      }

      if (poResult.status === "rejected") {
        console.warn(
          "Purchase Order load failed; continuing with Inventory:",
          poResult.reason,
        );
      }

      setVendors(vendors);
      setComponents(components);
      setPurchaseOrders(purchaseOrders);

      console.log("Components Loaded:", components);

      /*
       * Central Inventory is the authoritative current In-Store balance.
       *
       * Direct PO / Direct Inward QC stock is synchronized into this
       * table. When Inventory Notifications provides a STORE allocation,
       * the backend reduces Inventory.quantity. Historical Inward QC
       * quantities must not be used to rebuild that deducted balance.
       */
      let inventoryList = [];
      let inventoryEndpointSucceeded = false;

      /*
       * There is one registered Inventory route:
       *   /api/inventory/inventory/
       *
       * Do not retry several invalid/duplicate route variants after a 500.
       * One backend error used to create several extra expensive requests.
       */
      try {
        inventoryList =
          await fetchSharedPaginatedList(
            "inventory",
            `${config.baseURL}/inventory/inventory/?page_size=500`,
            {
              cache: "no-store",
              timeoutMs: 60000,
            },
          );

        inventoryEndpointSucceeded = true;
      } catch (error) {
        console.error(
          "Central Inventory API failed. Falling back to Inward stock:",
          error,
        );
      }

      /*
       * A successful Inventory API response is authoritative even when
       * the returned list is empty. Empty means the available balance
       * is zero.
       */
      if (inventoryEndpointSucceeded) {
        const activeInventoryRows =
          inventoryList
            .filter((item) => {
              const sourceMrNumber = String(
                item.source_mr_number ||
                  item.sourceMrNumber ||
                  item.material_request_number ||
                  item.material_request_id ||
                  "",
              ).trim();

              /*
               * MR-linked purchased stock belongs only to
               * Project Inventory.
               */
              if (sourceMrNumber) {
                return false;
              }

              const quantity = Number(
                item.available_quantity ??
                  item.remaining_quantity ??
                  item.quantity ??
                  item.qty ??
                  0,
              );

              const issued =
                item.issued === true ||
                item.issued === 1;

              return (
                Number.isFinite(quantity) &&
                quantity > 0 &&
                !issued
              );
            })
            .map((item) => {
              const currentQuantity = Number(
                item.available_quantity ??
                  item.remaining_quantity ??
                  item.quantity ??
                  item.qty ??
                  0,
              );

              return {
                ...item,

                /*
                 * Keep the central Inventory record ID so all later
                 * issue/delete actions target Inventory, not Inward.
                 */
                backendId:
                  item.backendId ??
                  item.id ??
                  item.pk ??
                  item.inventory_id ??
                  null,

                source: "inventory",
                inventory_scope: "store",
                source_mr_number: "",

                code:
                  item.inventory_code ||
                  item.code ||
                  `INV-${item.id}`,

                qty: currentQuantity,
                quantity: currentQuantity,
              };
            });

        const normalizedInventory =
          normalizeInventoryItems(
            activeInventoryRows,
            components,
          );

        console.debug(
          "Current In-Store balance:",
          normalizedInventory.map(
            (item) => ({
              code: item.code,
              component: item.component,
              qty: item.qty,
            }),
          ),
        );

        persistInventory(
          normalizedInventory,
        );

        return;
      }

      /*
       * Emergency fallback only when every central Inventory endpoint
       * is unavailable. This fallback is never used after a successful
       * Inventory API response.
       */
      {
        const inward = await fetchSharedPaginatedList(
          "inward",
          `${config.baseURL}/inward/?page_size=500`,
          { cache: "no-store" },
        ).catch(() => null);
        const list = (
          Array.isArray(inward)
            ? inward
            : []
        ).filter(
          (entry) =>
            entry.removed_from_inventory == null ||
            entry.removed_from_inventory === false
        );

        const items = list.flatMap((entry) => {
          if (!shouldShowInInventory(entry)) {
            return [];
          }

          const passedRows = getQcRows(entry, "passed").filter(Boolean);
          const quantityValue = Math.max(
            Number(entry.quantity_received || entry.quantity || entry.items || entry.total_quantity || 0),
            1,
          );
          const hasPassedRows = passedRows.length > 0;

          if (!hasPassedRows && quantityValue <= 0) {
            return [];
          }

          const componentId = entry.component;
          const vendorId = entry.vendor;
          const poId =
            entry.purchase_order ??
            entry.purchaseOrder ??
            entry.purchaseOrderId;

          const componentObj = components.find(
            (c) =>
              String(c.id) === String(componentId) ||
              String(c.component_id) === String(componentId) ||
              String(c.name) === String(entry.component_name || entry.component || "") ||
              String(c.component_name) === String(entry.component_name || entry.component || "")
          );

          const vendorObj = vendors.find(
            (v) => String(v.id) === String(vendorId)
          );

          const poObj = purchaseOrders.find(
            (p) => String(p.id) === String(poId)
          );
const sourceMrNumber =
  getSourceMrNumber(
    entry,
    purchaseOrders
  );

const inventoryScope =
  sourceMrNumber
    ? "project"
    : "store";

/*
 * MR-linked Inward belongs to Project Inventory and cannot be used
 * as free In-Store stock.
 */
if (sourceMrNumber) {
  return [];
}

          const compLabel = componentObj
            ? [componentObj.component_id || componentObj.id, componentObj.name || componentObj.component_name || componentObj.component_id || componentObj.id]
                .filter(Boolean)
                .join(" - ")
            : "-";

          const vendorLabel =
            vendorObj?.name ||
            vendorObj?.vendor_name ||
            "-";

          const poLabel =
            poObj?.po ||
            poObj?.po_number ||
            "-";
          const firstLine = entry.line_items?.[0];

          const perUnit = Number(
            firstLine?.unit_price ??
            entry.unit_price ??
            entry.price ??
            0
          );

          const entryTotalPrice = Number(
            firstLine?.grand_total ??
            entry.total_price ??
            entry.totalPrice ??
            0
          );

          const totalQty = Math.max(
            quantityValue,
            passedRows.length + (Array.isArray(entry.failedRows) ? entry.failedRows.length : 0),
            1
          );

          const rowPrice = entryTotalPrice > 0 && totalQty > 0
            ? entryTotalPrice / totalQty
            : perUnit;

          const passedQty = hasPassedRows
            ? passedRows.reduce((sum, row) => {
                return sum + Number(row?.qty || row?.quantity || row?.passed_quantity || 1);
              }, 0)
            : quantityValue;

          const serials = passedRows
            .map((row) => String(row?.serialNumber || row?.serial_number || "").trim())
            .filter(Boolean);

const componentName = compLabel ||
  entry.component_name ||
  entry.component ||
  entry.productName ||
  entry.product_name ||
  "-";

const inventoryCode =
  entry.code ||
  entry.grn ||
  entry.batch_number ||
  componentObj?.component_id ||
  `inward-${entry.id}`;

return [
  {
    id: `inward-${entry.id}-${componentId || componentName}`,
    backendId: entry.id,
    inwardId: entry.id,
    source: "inward",
    code: inventoryCode,
    issued: entry.issued || false,
    category: componentObj?.category || entry.category || "",
    component: componentName,
    specifications: componentObj?.specifications || entry.specifications || "-",
    vendor: vendorLabel,
    po: poLabel,
    qty: passedQty,
    date: entry.received_date || entry.date || "",
    price: rowPrice,
    cost_details: entry.cost_details,
    totalPrice: entry.cost_details?.[0]?.serials?.filter(row => row.status === "QC passed" && row.cost_available).reduce((total,row) => total + Math.round(Number(row.allocated_cost) * 100), 0) / 100 || rowPrice * passedQty,
status: "Passed",

serialNumber:
  serials.join(", "),

source_mr_number:
  sourceMrNumber,

material_request_id:
  sourceMrNumber,

inventory_scope:
  inventoryScope,

issued_to:
  entry.issued_to ||
  entry.issuedTo ||
  entry.issued_by ||
  entry.issuedBy ||
  "",


    last_issued_qty: entry.last_issued_qty || entry.issued_qty || entry.issuedQty || null,
  },
];
        });

        const normalized = normalizeInventoryItems(items, components);

        const manualInventory = await loadManualInventory(
          vendors,
          components,
          purchaseOrders
        );

        persistInventory([
  ...normalized,
  ...manualInventory,
]);
        return;
      }

    } catch (err) {
      console.error("Failed to load inventory:", err);
      persistInventory([]);
    }
  }

  const getInDroneAvailableQuantity = (row) => {
    const explicit = Number(
      row?.inDroneAvailableQuantity,
    );

    if (Number.isFinite(explicit)) {
      return Math.max(explicit, 0);
    }

    return Math.max(
      Number(getInDroneTotalDroneQuantity(row) || 0),
      0,
    );
  };

  const openReturnableMove = (row, purpose) => {
    const availableQuantity =
      getInDroneAvailableQuantity(row);

    if (availableQuantity <= 0) {
      setSalesActionError(
        "No In-Drone quantity is currently available for this action.",
      );
      return;
    }

    setReturnableMove({
      open: true,
      row,
      purpose,

      // Only the selected number of drones is allocated.
      quantity: 1,

      returnDate: "",
      remarks: "",
      saving: false,
      error: "",
    });
  };

  const closeReturnableMove = () => {
    if (returnableMove.saving) return;

    setReturnableMove({
      open: false,
      row: null,
      purpose: "",
      quantity: 1,
      returnDate: "",
      remarks: "",
      saving: false,
      error: "",
    });
  };

  const getReturnablePurposeLabel = (purpose) => {
    switch (String(purpose || "").toUpperCase()) {
      case "FLIGHT_TEST":
        return "Flight Test";
      case "EVENT":
        return "Event";
      case "CUSTOMER_DEMO":
        return "Demo/Trials";
      default:
        return "Returnable";
    }
  };

  const getFlightTestMaxDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 4);
    return date.toISOString().split("T")[0];
  };

  const submitReturnableMove = async () => {
    const row = returnableMove.row;
    if (!row || returnableMove.saving) return;

    const availableQuantity =
      getInDroneAvailableQuantity(row);

    const requestedQuantity =
      Math.max(
        Math.floor(Number(returnableMove.quantity || 0)),
        0,
      );

    if (requestedQuantity <= 0) {
      setReturnableMove((previous) => ({
        ...previous,
        error:
          "No In-Drone quantity is currently available for this action.",
      }));
      return;
    }

    if (requestedQuantity > availableQuantity) {
      setReturnableMove((previous) => ({
        ...previous,
        error: `Quantity cannot exceed the available drone quantity (${availableQuantity}).`,
      }));
      return;
    }

    if (!returnableMove.returnDate) {
      setReturnableMove((previous) => ({
        ...previous,
        error: "Returnable Date is required.",
      }));
      return;
    }

    if (
      returnableMove.purpose === "FLIGHT_TEST" &&
      returnableMove.returnDate > getFlightTestMaxDate()
    ) {
      setReturnableMove((previous) => ({
        ...previous,
        error: "Flight Test return date cannot exceed 4 days from today.",
      }));
      return;
    }

    setReturnableMove((previous) => ({
      ...previous,
      saving: true,
      error: "",
    }));

    try {
      const materialRequestReference =
        row.material_request_id ||
        row.request_id ||
        row.mr_id ||
        row.material_request_number ||
        row.id;

      await fetchAuthenticatedJson(
        `${config.baseURL}/component-usage/move-from-in-drone/`,
        {
          method: "POST",
          body: JSON.stringify({
            material_request_id: materialRequestReference,
            drone_instance_id: row?.droneInstanceId || undefined,
            purpose: returnableMove.purpose,
            quantity: row?.droneInstanceId ? 1 : requestedQuantity,
            return_due_date: returnableMove.returnDate,
            remarks: returnableMove.remarks.trim(),
          }),
        },
      );

      window.dispatchEvent(
        new Event("notificationsUpdated"),
      );

      const purpose = returnableMove.purpose;
      const mrNumber =
        row.material_request_id ||
        row.request_id ||
        row.mr_id ||
        row.id;

      setReturnableMove({
        open: false,
        row: null,
        purpose: "",
        quantity: 1,
        returnDate: "",
        remarks: "",
        saving: false,
        error: "",
      });

      await loadApprovedMaterialRequests();

      navigate("/component-usage", {
        state: {
          openPurpose: purpose,
          source: "in-drone",
          materialRequestId: mrNumber,
        },
      });
    } catch (error) {
      setReturnableMove((previous) => ({
        ...previous,
        saving: false,
        error:
          error?.message ||
          error?.detail ||
          "Unable to submit this In-Drone usage for Manager approval.",
      }));
    }
  };

  const openInDroneSalesModal = (row) => {
    if (!row || !canStartInDroneSale) return;

    if (!row?.droneInstanceId && row?.inDroneScrapSaleBlocked) {
      setSalesActionError(
        row?.inDroneScrapReorderChoice === "YES"
          ? "The original MR has a Scrap/Reorder history. Select an AVAILABLE _01/_02 physical drone instance for Sales."
          : "This Material Request has been moved to Scrap and cannot be sold.",
      );
      return;
    }

    if (row?.droneInstanceId && String(row?.droneInstanceStatus || "").toUpperCase() !== "AVAILABLE") {
      setSalesActionError(
        `${row?.droneInstanceDisplay || row?.droneInstanceCode || "This drone"} is not available for Sales.`,
      );
      return;
    }

    setSalesActionError("");
    setOpenInDroneActionId("");

    const availableQuantity =
      getInDroneAvailableQuantity(row);

    if (availableQuantity <= 0) {
      setSalesActionError(
        "No In-Drone quantity is currently available for Sales.",
      );
      return;
    }

    const salesStatus = String(
      row?.salesApprovalStatus || "",
    )
      .trim()
      .toUpperCase();
    const isRejectedResubmit =
      salesStatus === "MANAGEMENT_REJECTED";

    setInDroneSalesModal({
      open: true,
      row,
      quantity: 1,
      client: isRejectedResubmit
        ? row?.salesClient || ""
        : "",
      invoiceNumber: isRejectedResubmit
        ? row?.salesInvoiceNumber || ""
        : "",
      remarks: isRejectedResubmit
        ? row?.salesRemarks || ""
        : "",
      error: "",
    });
  };

  const closeInDroneSalesModal = () => {
    if (salesProcessingId) return;

    setInDroneSalesModal({
      open: false,
      row: null,
      quantity: 1,
      client: "",
      invoiceNumber: "",
      remarks: "",
      error: "",
    });
  };

  const startInDroneSales = async (row, salesDetails = {}) => {
    if (!row || !canStartInDroneSale || salesProcessingId) {
      return;
    }

    /*
     * Sales backend resolves MaterialRequest from this value.
     * Prefer the real MR number (including _PR/_FR) instead of the React/API
     * database id so the exact rebuilt MR is submitted for Sales.
     */
    const reference =
      row.material_request_id ||
      row.request_id ||
      row.mr_id ||
      row.id;

    if (!reference) {
      setInDroneSalesModal((previous) => ({
        ...previous,
        error: "Material Request reference is missing.",
      }));
      return;
    }

    const client = String(
      salesDetails?.client || "",
    ).trim();

    const invoiceNumber = String(
      salesDetails?.invoiceNumber || "",
    ).trim();

    const remarks = String(
      salesDetails?.remarks || "",
    ).trim();

    const availableQuantity =
      getInDroneAvailableQuantity(row);
    const requestedQuantity = Math.max(
      Number(salesDetails?.quantity || 0),
      0,
    );

    if (
      !Number.isInteger(requestedQuantity) ||
      requestedQuantity <= 0
    ) {
      setInDroneSalesModal((previous) => ({
        ...previous,
        error: "Sales quantity must be at least 1.",
      }));
      return;
    }

    if (requestedQuantity > availableQuantity) {
      setInDroneSalesModal((previous) => ({
        ...previous,
        error: `Only ${availableQuantity} unit(s) are currently available in In Drone.`,
      }));
      return;
    }

    if (!client) {
      setInDroneSalesModal((previous) => ({
        ...previous,
        error: "Customer / Client Name is required.",
      }));
      return;
    }

    if (!invoiceNumber) {
      setInDroneSalesModal((previous) => ({
        ...previous,
        error: "Invoice Number is required.",
      }));
      return;
    }

    if (!remarks) {
      setInDroneSalesModal((previous) => ({
        ...previous,
        error: "Remarks are required.",
      }));
      return;
    }

    const actionId = String(reference);
    setSalesProcessingId(actionId);
    setSalesActionError("");
    setOpenInDroneActionId("");

    try {
      const response = await fetchAuthenticatedJson(
        `${config.baseURL}/outward/in-drone-sales/`,
        {
          method: "POST",
          body: JSON.stringify({
            material_request_id: reference,
            drone_instance_id: row?.droneInstanceId || undefined,
            quantity: row?.droneInstanceId ? 1 : requestedQuantity,
            client,
            invoice_number: invoiceNumber,
            remarks,
          }),
        },
      );

      window.dispatchEvent(new Event("notificationsUpdated"));
      window.dispatchEvent(new Event("salesUpdated"));

      setInDroneSalesModal({
        open: false,
        row: null,
        quantity: 1,
        client: "",
        invoiceNumber: "",
        remarks: "",
        error: "",
      });

      await loadApprovedMaterialRequests();

      /*
       * Stay on In Drone after Finance/Admin submits the Sale.
       * The Action cell immediately changes to:
       *   Pending Management Approval
       *
       * Only after Management approves will it show:
       *   Sold
       */
      setTab("in-drone");
      setSuccessMessage(
        "Sale sent for Management approval.",
      );

      window.setTimeout(
        () => setSuccessMessage(""),
        3000,
      );
    } catch (error) {
      const errorStatus = Number(
        error?.status ||
          error?.statusCode ||
          error?.response?.status ||
          0,
      );

      const rawMessage = String(
        error?.message ||
          error?.detail ||
          "",
      ).trim();

      const isUnauthorized =
        errorStatus === 401 ||
        /401|unauthorized|authentication\s+is\s+required|token.*(?:expired|invalid)/i.test(
          rawMessage,
        );

      setInDroneSalesModal((previous) => ({
        ...previous,
        error: isUnauthorized
          ? "Your login session is not authenticated for this request. Sign in again, keep Finance/Admin as the active role, then retry Sale."
          : (
              rawMessage ||
              "Unable to send this In-Drone request to Sales."
            ),
      }));
    } finally {
      setSalesProcessingId("");
    }
  };

  const submitInDroneSales = async () => {
    if (!inDroneSalesModal.row || salesProcessingId) {
      return;
    }

    await startInDroneSales(
      inDroneSalesModal.row,
      {
        quantity: inDroneSalesModal.quantity,
        client: inDroneSalesModal.client,
        invoiceNumber:
          inDroneSalesModal.invoiceNumber,
        remarks: inDroneSalesModal.remarks,
      },
    );
  };


  const getUsageMetadata = (usage) => {
    const details = usage?.inventory_issue_details;

    if (Array.isArray(details)) {
      return details.reduce((merged, detail) =>
        detail && typeof detail === "object" && !Array.isArray(detail)
          ? { ...merged, ...detail }
          : merged, {});
    }

    return details && typeof details === "object"
      ? details
      : {};
  };

  const getReturnedMovementId = (usage) => {
    const metadata = getUsageMetadata(usage);
    return String(
      metadata?.movement_id ||
        metadata?.movementId ||
        "",
    ).trim();
  };

  const buildReturnedQcRows = (returnedRow) => {
    const result = [];

    (Array.isArray(returnedRow?.items) ? returnedRow.items : []).forEach((usage) => {
      const metadata = getUsageMetadata(usage);
      const savedQc = Array.isArray(metadata?.return_qc_items)
        ? metadata.return_qc_items
        : [];

      const issuedSerials = Array.isArray(usage?.issued_serial_numbers)
        ? usage.issued_serial_numbers
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        : [];

      const quantity = Math.max(Number(usage?.quantity || 0) || 0, 1);
      const units = issuedSerials.length
        ? issuedSerials.map((serialNumber, index) => ({ serialNumber, unitIndex: index + 1 }))
        : Array.from({ length: quantity }, (_, index) => ({
            serialNumber: "",
            unitIndex: index + 1,
          }));

      units.forEach(({ serialNumber, unitIndex }) => {
        const saved = savedQc.find((entry) => {
          if (!entry || typeof entry !== "object") return false;
          const savedSerial = String(entry.serial_number || entry.serialNumber || "").trim();
          const savedUnit = Number(entry.unit_index || entry.unitIndex || 0);
          return serialNumber
            ? savedSerial === serialNumber
            : savedUnit === unitIndex;
        });

        result.push({
          key: `${usage.id}::${serialNumber || `UNIT-${unitIndex}`}`,
          usageId: usage.id,
          componentId: usage.component || null,
          componentName:
            usage.component_name ||
            usage.component_code ||
            "Component",
          serialNumber,
          unitIndex,
          result: String(saved?.condition || saved?.result || "").toUpperCase(),
          remarks: saved?.remarks || "",
        });
      });
    });

    return result;
  };

  const openReturnedQc = (row) => {
    setReturnedQcModal({
      open: true,
      row,
      qcRows: buildReturnedQcRows(row),
      saving: false,
      error: "",
    });
  };

  const closeReturnedQc = () => {
    if (returnedQcModal.saving) return;
    setReturnedQcModal({
      open: false,
      row: null,
      qcRows: [],
      saving: false,
      error: "",
    });
  };

  const updateReturnedQcRow = (key, patch) => {
    setReturnedQcModal((previous) => ({
      ...previous,
      error: "",
      qcRows: previous.qcRows.map((item) =>
        item.key === key ? { ...item, ...patch } : item,
      ),
    }));
  };

  const submitReturnedQc = async () => {
    const row = returnedQcModal.row;
    const qcRows = returnedQcModal.qcRows;
    if (!row || returnedQcModal.saving || !canPerformReturnedQc) return;

    if (!qcRows.length) {
      setReturnedQcModal((previous) => ({
        ...previous,
        error: "No returned serial/component units were found for QC.",
      }));
      return;
    }

    const incomplete = qcRows.find((item) =>
      !["OK", "NOT_OK"].includes(String(item.result || "").toUpperCase()),
    );
    if (incomplete) {
      setReturnedQcModal((previous) => ({
        ...previous,
        error: "Choose OK or NOT OK for every returned serial/component.",
      }));
      return;
    }

    const missingReason = qcRows.find((item) =>
      String(item.result || "").toUpperCase() === "NOT_OK" &&
      !String(item.remarks || "").trim(),
    );
    if (missingReason) {
      setReturnedQcModal((previous) => ({
        ...previous,
        error: `Remarks are required for NOT OK item ${missingReason.serialNumber || missingReason.componentName}.`,
      }));
      return;
    }

    const firstUsageId = row?.items?.[0]?.id;
    if (!firstUsageId) {
      setReturnedQcModal((previous) => ({
        ...previous,
        error: "Returned usage reference is missing.",
      }));
      return;
    }

    setReturnedQcModal((previous) => ({
      ...previous,
      saving: true,
      error: "",
    }));

    try {
      await fetchAuthenticatedJson(
        `${config.baseURL}/component-usage/${encodeURIComponent(firstUsageId)}/return-qc/`,
        {
          method: "POST",
          body: JSON.stringify({
            movement_id: row.movement_id || "",
            qc_items: qcRows.map((item) => ({
              usage_id: item.usageId,
              component_id: item.componentId,
              serial_number: item.serialNumber,
              unit_index: item.unitIndex,
              condition: item.result,
              remarks: String(item.remarks || "").trim(),
            })),
          }),
        },
      );

      window.dispatchEvent(new Event("notificationsUpdated"));
      window.dispatchEvent(
        new CustomEvent("inventory:changed", {
          detail: { type: "componentUsage" },
        }),
      );

      setReturnedQcModal({
        open: false,
        row: null,
        qcRows: [],
        saving: false,
        error: "",
      });

      await loadApprovedMaterialRequests();
    } catch (error) {
      setReturnedQcModal((previous) => ({
        ...previous,
        saving: false,
        error:
          error?.message ||
          error?.detail ||
          "Unable to submit return QC.",
      }));
    }
  };

  const loadApprovedMaterialRequests = async () => {
    setLoadingRequests(true);

    try {
      const [
        list,
        projectRows,
        componentUsageRows,
        outwardRows,
        droneInstances,
      ] = await Promise.all([
        fetchSharedPaginatedList(
          "material-requests",
          `${config.baseURL}/materialrequest/material-requests/?page_size=500`,
          { cache: "no-store" },
        ).catch(() => []),

        fetchSharedPaginatedList(
          "project-inventory",
          `${config.baseURL}/inventory/project-inventory/?page_size=500`,
          { cache: "no-store" },
        ).catch(() => []),

        fetchSharedPaginatedList(
          "component-usage",
          `${config.baseURL}/component-usage/?page_size=500`,
          { cache: "no-store" },
        ).catch(() => []),

        fetchSharedPaginatedList(
          "outward",
          `${config.baseURL}/outward/?page_size=500`,
          { cache: "no-store" },
        ).catch(() => []),

        fetchAuthenticatedJson(
          `${config.baseURL}/inventory/project-inventory/drone-instances/`,
          { cache: "no-store" },
        ).then((payload) =>
          Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.results)
              ? payload.results
              : [],
        ).catch(() => []),
      ]);

      /*
       * ----------------------------------------------------------
       * RETURNED TAB
       * ----------------------------------------------------------
       * Engineer return does not create another MR.
       * Group ComponentUsage rows by SAME MR + Returnable purpose and show
       * them as an auditable Returned queue.
       */
      const materialRequestByNumber = new Map();

      list.forEach((request) => {
        const mrNumber = String(
          request?.material_request_id ||
            request?.request_id ||
            request?.mr_id ||
            "",
        ).trim();

        if (mrNumber) {
          materialRequestByNumber.set(
            mrNumber.toUpperCase(),
            request,
          );
        }
      });

      const returnedGroupMap = new Map();

      /*
       * ----------------------------------------------------------
       * STRICT ENGINEER RETURN BOUNDARY
       * ----------------------------------------------------------
       *
       * A Returnable movement must NOT appear in Inventory -> Returned
       * merely because it was created, issued, or is waiting with Engineer.
       *
       * It becomes eligible ONLY after the engineer-return action writes
       * ComponentUsage.received_date.
       *
       * The backend may store one ComponentUsage row per component for the
       * same drone/component movement. Therefore:
       *
       * 1. first identify movements having at least one real received_date;
       * 2. then include every ComponentUsage row belonging to that movement.
       *
       * This prevents a partially displayed returned drone when the backend
       * return action marks one representative usage row for the movement.
       */
      const getReturnedGroupKey = (usage = {}) => {
        const mrNumber = String(
          usage?.material_request_number ||
            usage?.material_request_id ||
            usage?.request_id ||
            usage?.mr_id ||
            "",
        ).trim();

        const purpose = String(
          usage?.purpose || "",
        )
          .trim()
          .toUpperCase();

        if (!mrNumber || !purpose) {
          return "";
        }

        const movementId =
          getReturnedMovementId(usage);

        const fallbackMovement = [
          usage?.requested_date || "",
          usage?.return_due_date || "",
          usage?.remarks || "",
        ].join("|");

        return (
          `${mrNumber.toUpperCase()}|` +
          `${purpose}|` +
          `${movementId || fallbackMovement}`
        );
      };

      const engineerReturnedMovementKeys =
        new Set(
          componentUsageRows
            .filter((usage) =>
              Boolean(
                usage?.received_date ||
                  usage?.receivedDate,
              ),
            )
            .map(getReturnedGroupKey)
            .filter(Boolean),
        );

      componentUsageRows
        .filter((usage) => {
          const groupKey =
            getReturnedGroupKey(usage);

          return (
            Boolean(groupKey) &&
            engineerReturnedMovementKeys.has(
              groupKey,
            )
          );
        })
        .forEach((usage) => {
          const mrNumber = String(
            usage?.material_request_number ||
              usage?.material_request_id ||
              usage?.request_id ||
              usage?.mr_id ||
              "",
          ).trim();

          if (!mrNumber) return;

          const purpose = String(
            usage?.purpose || "",
          )
            .trim()
            .toUpperCase();

          const movementId =
            getReturnedMovementId(usage);

          const groupKey =
            getReturnedGroupKey(usage);

          if (!groupKey) return;

          const request =
            materialRequestByNumber.get(
              mrNumber.toUpperCase(),
            ) || {};

          const metadata =
            getUsageMetadata(usage);

          if (!returnedGroupMap.has(groupKey)) {
            const requestType = String(
              request?.request_type ||
                usage?.request_type ||
                "",
            )
              .trim()
              .toUpperCase();

            const isDrone =
              requestType !== "RETURNABLE" &&
              [
                "FLIGHT_TEST",
                "CUSTOMER_DEMO",
                "EVENT",
              ].includes(purpose);

            returnedGroupMap.set(groupKey, {
              id: `returned-${groupKey}`,
              movement_id: movementId,
              material_request_id: mrNumber,
              project: request?.project || "-",
              requester_name:
                request?.requester_name ||
                usage?.employee_name ||
                "-",
              request_type: requestType,
              mode: isDrone
                ? "DRONE"
                : "COMPONENT",
              returnable_purpose: purpose,
              returned_from:
                getReturnablePurposeLabel(
                  purpose,
                ),

              /*
               * Initial state after Engineer -> Move to Return.
               * Inventory has received it, but QC has not started yet.
               */
              qc_status: "Returned",

              returned_by: "-",
              returned_date: "",
              remarks: "",
              items: [],
            });
          }

          const group =
            returnedGroupMap.get(groupKey);

          group.items.push(usage);

          /*
           * Only a row carrying received_date is allowed to populate the
           * Engineer Return metadata. This is the actual hand-back marker.
           */
          if (
            usage?.received_date ||
            usage?.receivedDate
          ) {
            group.returned_date =
              usage?.received_date ||
              usage?.receivedDate ||
              group.returned_date;

            group.returned_by =
              metadata?.returned_by ||
              metadata?.returnedBy ||
              usage?.returned_by ||
              usage?.returnedBy ||
              group.returned_by ||
              "-";

            group.remarks =
              metadata?.return_remarks ||
              metadata?.returnRemarks ||
              usage?.return_reason ||
              usage?.returnReason ||
              usage?.remarks ||
              group.remarks ||
              "";
          }
        });

      const returned = Array.from(returnedGroupMap.values()).map((group) => {
        const conditions = group.items.map((usage) =>
          String(usage?.return_condition || "").trim().toUpperCase(),
        );
        const approvals = group.items.map((usage) =>
          String(usage?.return_approval_status || "").trim().toUpperCase(),
        );
        const metadataRows = group.items.map(getUsageMetadata);

        const anyNotOk = conditions.includes("NOT_OK");
        const allOk =
          conditions.length > 0 &&
          conditions.every((value) => value === "OK");
        const allCompleted =
          approvals.length > 0 &&
          approvals.every((value) => value === "COMPLETED");

        if (anyNotOk && approvals.includes("PENDING_MANAGER")) {
          group.qc_status = "QC Failed - Pending Manager";
        } else if (anyNotOk && approvals.includes("PENDING_FINANCE")) {
          group.qc_status = "QC Failed - Pending Finance";
        } else if (anyNotOk && approvals.includes("REJECTED")) {
          group.qc_status = "Rejected - Workflow Stopped";
        } else if (anyNotOk && approvals.includes("APPROVED")) {
          const restorePo = metadataRows
            .map((meta) => meta?.restore_po_number)
            .find(Boolean);
          const restoreReady = metadataRows.some(
            (meta) => meta?.procurement_restore_ready === true,
          );
          group.qc_status = restorePo
            ? `Restore PO ${restorePo} Raised`
            : restoreReady
              ? "Finance Approved - Restore Pending Procurement"
              : "Finance Approved";
        } else if (anyNotOk && allCompleted) {
          group.qc_status = "QC Failed - Disposition Completed";
        } else if (allOk && allCompleted) {
          group.qc_status =
            group.mode === "DRONE"
              ? "QC Passed - Drone Ready"
              : "QC Passed - In Store";
        } else if (conditions.every((value) => !value)) {
          /*
           * Engineer has handed the movement back to Inventory.
           * QC has not been submitted yet, so display the workflow boundary
           * exactly as "Returned".
           */
          group.qc_status = "Returned";
        } else if (anyNotOk) {
          group.qc_status = "QC Failed";
        }

        return group;
      });

      setReturnedRequests(
        returned.sort((left, right) =>
          String(right.returned_date || "").localeCompare(
            String(left.returned_date || ""),
          ),
        ),
      );

      const salesStatusByReference = new Map();
      const salesDetailsByReference = new Map();
      const salesAllocationByReference = new Map();

      const salesBatchMap = new Map();

      outwardRows
        .filter(
          (row) =>
            String(row?.outward_type || row?.type || "")
              .trim()
              .toUpperCase() === "SALES",
        )
        .forEach((row) => {
          const status = String(
            row?.approval_status || row?.status || "",
          )
            .trim()
            .toUpperCase();

          const references = [
            row?.material_request,
            row?.material_request_number,
            row?.materialRequestNumber,
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

          if (!references.length) return;

          const invoice = String(
            row?.invoice_number ||
              row?.invoiceNumber ||
              row?.invoice_no ||
              row?.id ||
              "SALES",
          )
            .trim()
            .toUpperCase();

          const quantity = Math.max(
            Number(row?.quantity || row?.qty || 0) || 0,
            0,
          );

          references.forEach((reference) => {
            const batchKey = `${reference}|${invoice}`;
            const existing = salesBatchMap.get(batchKey) || {
              reference,
              invoice,
              quantity: 0,
              status: "",
              client: "",
              remarks: "",
            };

            // One Sales batch has one row per component. Quantity is the
            // assembly/drone quantity, so use MAX instead of SUM.
            existing.quantity = Math.max(
              existing.quantity,
              quantity,
            );
            existing.status = status || existing.status;
            existing.client =
              row?.client ||
              row?.customer ||
              existing.client;
            existing.remarks =
              row?.remarks ||
              row?.reason ||
              existing.remarks;

            salesBatchMap.set(batchKey, existing);
          });
        });

      Array.from(salesBatchMap.values()).forEach((batch) => {
        const rejected = [
          "MANAGEMENT_REJECTED",
          "REJECTED",
          "FINANCE_REJECTED",
        ].includes(batch.status);

        const previousAllocation =
          salesAllocationByReference.get(batch.reference) || {
            reserved: 0,
            approved: 0,
            pending: 0,
            rejected: 0,
          };

        if (rejected) {
          previousAllocation.rejected += batch.quantity;
        } else {
          previousAllocation.reserved += batch.quantity;
          if (batch.status === "APPROVED") {
            previousAllocation.approved += batch.quantity;
          } else {
            previousAllocation.pending += batch.quantity;
          }
        }

        salesAllocationByReference.set(
          batch.reference,
          previousAllocation,
        );

        const previousStatus =
          salesStatusByReference.get(batch.reference) || "";

        if (
          batch.status === "PENDING_MANAGEMENT" ||
          !previousStatus ||
          previousStatus === "APPROVED"
        ) {
          salesStatusByReference.set(
            batch.reference,
            batch.status,
          );
        }

        salesDetailsByReference.set(batch.reference, {
          client: batch.client,
          invoiceNumber: batch.invoice,
          remarks: batch.remarks,
        });
      });

      const activeReturnableReferences = new Set();

      componentUsageRows.forEach((usage) => {
        const materialRequestNumber = String(
          usage?.material_request_number || "",
        ).trim();
        const materialRequestId = usage?.material_request;

        if (!materialRequestNumber && !materialRequestId) {
          return;
        }

        const condition = String(
          usage?.return_condition || "",
        )
          .trim()
          .toUpperCase();
        const approvalStatus = String(
          usage?.return_approval_status || "",
        )
          .trim()
          .toUpperCase();

        const completedOk =
          condition === "OK" &&
          approvalStatus === "COMPLETED";

        if (completedOk) return;

        if (materialRequestNumber) {
          activeReturnableReferences.add(
            materialRequestNumber.toUpperCase(),
          );
        }

        if (
          materialRequestId !== undefined &&
          materialRequestId !== null &&
          String(materialRequestId).trim() !== ""
        ) {
          activeReturnableReferences.add(
            String(materialRequestId).trim().toUpperCase(),
          );
        }
      });

      const inDroneStatuses = new Set([
        "INVENTORY_ISSUED",
        "MR_COMPLETED",
        "ISSUED",
        "COMPLETED",
      ]);

      const normalizeReference = (value) =>
        String(value ?? "")
          .trim()
          .toUpperCase();

      const getMatchingProjectRows = (
        materialRequest,
      ) => {
        const references = new Set(
          [
            materialRequest?.id,
            materialRequest?.material_request_id,
            materialRequest?.request_id,
            materialRequest?.mr_id,
            materialRequest?.source_mr_number,
          ]
            .filter(
              (value) =>
                value !== undefined &&
                value !== null &&
                String(value).trim() !== "",
            )
            .map(normalizeReference),
        );

        return projectRows.filter((row) => {
          const rowReferences = [
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
            .map(normalizeReference);

          return rowReferences.some((value) =>
            references.has(value),
          );
        });
      };

      const isProjectRowFulfilled = (row) => {
        if (
          row?.is_fulfilled === true ||
          ["ISSUED", "COMPLETED"].includes(
            String(row?.status || "")
              .trim()
              .toUpperCase(),
          )
        ) {
          return true;
        }

        const requested = Math.max(
          Number(
            row?.requested_quantity ??
              row?.requestedQuantity ??
              0,
          ) || 0,
          0,
        );

        const issuedDirect = Number(
          row?.issued_quantity ??
            row?.calculated_issued_quantity,
        );

        const issued = Number.isFinite(
          issuedDirect,
        )
          ? Math.max(issuedDirect, 0)
          : (
              Math.max(
                Number(
                  row?.issued_store_quantity || 0,
                ) || 0,
                0,
              ) +
              Math.max(
                Number(
                  row?.issued_purchased_quantity || 0,
                ) || 0,
                0,
              )
            );

        return (
          requested > 0 &&
          issued >= requested
        );
      };

      /*
       * ----------------------------------------------------------
       * IN-DRONE <-> ENGINEER SCRAP LIFECYCLE
       * ----------------------------------------------------------
       *
       * The original MR remains visible in In Drone as audit/history after
       * Scrap, but it is no longer an active sellable drone.
       *
       * Rules:
       *   normal completed MR
       *     -> Sale
       *
       *   Engineer Scrap pending approval
       *     -> Scrap Pending (Sale blocked)
       *
       *   PARTIAL + NO reorder
       *     -> Partially Scrapped (Sale blocked)
       *
       *   TOTAL + NO reorder
       *     -> Fully Scrapped (Sale blocked)
       *
       *   PARTIAL + YES
       *     -> Scrapped & Reordered
       *     -> link/display the generated _PR once it is fully issued
       *
       *   TOTAL + YES
       *     -> Fully Scrapped & Reordered
       *     -> link/display the generated _FR once it is fully issued
       *
       * The generated _PR/_FR MR is a new active In-Drone assembly. Once its
       * own components are completely issued, its own row is allowed to show
       * Sale (unless that replacement MR is itself later scrapped).
       */

      const parseInDroneScrapMetadata = (row = {}) => {
        const raw =
          row?.inventory_allocations ??
          row?.inventoryAllocations ??
          {};

        if (
          raw &&
          typeof raw === "object" &&
          !Array.isArray(raw)
        ) {
          return raw;
        }

        if (typeof raw === "string") {
          try {
            const parsed = JSON.parse(raw);

            if (
              parsed &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              return parsed;
            }
          } catch (_error) {
            // Keep an empty metadata object for malformed legacy rows.
          }
        }

        return {};
      };

      const addInDroneReference = (
        target,
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
          value &&
          typeof value === "object"
        ) {
          [
            value?.id,
            value?.pk,
            value?.material_request_id,
            value?.request_id,
            value?.mr_id,
            value?.material_request_number,
          ].forEach((candidate) =>
            addInDroneReference(
              target,
              candidate,
            ),
          );

          return;
        }

        const normalized =
          normalizeReference(value);

        if (normalized) {
          target.add(normalized);
        }
      };

      const getEngineerScrapReferences = (
        row = {},
      ) => {
        const metadata =
          parseInDroneScrapMetadata(row);

        const references = new Set();

        [
          row?.material_request,
          row?.material_request_id,
          row?.materialRequestId,
          row?.material_request_number,
          row?.materialRequestNumber,
          row?.request_id,
          row?.mr_id,
          metadata?.source_mr_id,
          metadata?.source_mr_number,
        ].forEach((value) =>
          addInDroneReference(
            references,
            value,
          ),
        );

        return references;
      };

      const rejectedEngineerScrapStatuses =
        new Set([
          "REJECTED",
          "MANAGER_REJECTED",
          "FINANCE_REJECTED",
          "CANCELLED",
          "CANCELED",
        ]);

      const pendingEngineerScrapStatuses =
        new Set([
          "REQUESTED",
          "PENDING_MANAGER",
          "MANAGER_APPROVED",
          "PENDING_FINANCE",
        ]);

      const engineerMrScrapRows =
        outwardRows.filter((row) => {
          const outwardType =
            normalizeReference(
              row?.outward_type ||
                row?.type_of_outward ||
                row?.type ||
                "",
            );

          if (outwardType !== "SCRAP") {
            return false;
          }

          const metadata =
            parseInDroneScrapMetadata(
              row,
            );

          const workflow =
            normalizeReference(
              metadata?.workflow || "",
            );

          /*
           * Returnable-QC Scrap is a different workflow. It must not mark the
           * source In-Drone MR as Engineer Scrap here.
           */
          if (
            workflow ===
              "RETURNABLE_DRONE_QC_V1" ||
            workflow ===
              "RETURNABLE_COMPONENT_QC_V1"
          ) {
            return false;
          }

          const source =
            normalizeReference(
              row?.source ||
                row?.scrap_source ||
                "",
            );

          const scrapOrigin =
            normalizeReference(
              row?.scrap_origin ||
                row?.scrapOrigin ||
                "",
            );

          return (
            workflow ===
              "ENGINEER_MR_SCRAP_DISPOSITION_V1" ||
            (
              source === "ENGINEER" &&
              scrapOrigin === "MR"
            )
          );
        });

      const getEngineerScrapStateForMr = (
        materialRequest,
        requestReferences = [],
      ) => {
        const references = new Set(
          requestReferences
            .map(normalizeReference)
            .filter(Boolean),
        );

        [
          materialRequest?.id,
          materialRequest?.pk,
          materialRequest?.material_request_id,
          materialRequest?.request_id,
          materialRequest?.mr_id,
        ].forEach((value) =>
          addInDroneReference(
            references,
            value,
          ),
        );

        const matchingScraps =
          engineerMrScrapRows
            .filter((scrapRow) => {
              const scrapReferences =
                getEngineerScrapReferences(
                  scrapRow,
                );

              return Array.from(
                references,
              ).some((reference) =>
                scrapReferences.has(
                  reference,
                ),
              );
            })
            /*
             * If a Scrap request was rejected, it is not an active Scrap
             * disposition and must not permanently remove Sale.
             */
            .filter((scrapRow) => {
              const status =
                normalizeReference(
                  scrapRow?.approval_status ||
                    scrapRow?.approvalStatus ||
                    scrapRow?.status ||
                    "",
                );

              return (
                !rejectedEngineerScrapStatuses.has(
                  status,
                )
              );
            })
            .sort((left, right) => {
              const leftTime =
                new Date(
                  left?.updated_at ||
                    left?.created_at ||
                    left?.out_date ||
                    0,
                ).getTime() || 0;

              const rightTime =
                new Date(
                  right?.updated_at ||
                    right?.created_at ||
                    right?.out_date ||
                    0,
                ).getTime() || 0;

              if (leftTime !== rightTime) {
                return rightTime - leftTime;
              }

              return (
                Number(right?.id || 0) -
                Number(left?.id || 0)
              );
            });

        const scrapRow =
          matchingScraps[0] || null;

        if (!scrapRow) {
          return {
            hasScrap: false,
            saleBlocked: false,
            pending: false,
            label: "",
            scrapMode: "",
            reorderChoice: "",
            replacementMrNumber: "",
            replacementType: "",
            replacementCompleted: false,
            scrapRow: null,
          };
        }

        const metadata =
          parseInDroneScrapMetadata(
            scrapRow,
          );

        const approvalStatus =
          normalizeReference(
            scrapRow?.approval_status ||
              scrapRow?.approvalStatus ||
              scrapRow?.status ||
              "",
          );

        const scrapMode =
          normalizeReference(
            metadata?.scrap_mode ||
              metadata?.scrapMode ||
              "PARTIAL",
          );

        const reorderChoice =
          normalizeReference(
            metadata?.reorder_choice ||
              metadata?.reorderChoice ||
              metadata
                ?.manager_disposition_decision ||
              "",
          );

        const replacementMrNumber =
          String(
            metadata?.replacement_mr_number ||
              metadata?.replacementMrNumber ||
              "",
          ).trim();

        const replacementType =
          replacementMrNumber
            .toUpperCase()
            .endsWith("_PR")
            ? "PR"
            : replacementMrNumber
                .toUpperCase()
                .endsWith("_FR")
              ? "FR"
              : normalizeReference(
                  metadata?.reorder_type ||
                    metadata
                      ?.returnable_reorder_type ||
                    "",
                ) ===
                  "PARTIAL_REORDER"
                ? "PR"
                : normalizeReference(
                    metadata?.reorder_type ||
                      metadata
                        ?.returnable_reorder_type ||
                      "",
                  ) ===
                    "FULL_REORDER"
                  ? "FR"
                  : "";

        let replacementCompleted = false;

        if (replacementMrNumber) {
          const replacementRequest =
            materialRequestByNumber.get(
              replacementMrNumber
                .toUpperCase(),
            );

          if (replacementRequest) {
            const replacementStatus =
              normalizeReference(
                replacementRequest?.status ||
                  replacementRequest
                    ?.material_request_status ||
                  replacementRequest
                    ?.mr_status ||
                  replacementRequest
                    ?.approval_status ||
                  "",
              );

            const replacementRows =
              getMatchingProjectRows(
                replacementRequest,
              );

            replacementCompleted =
              inDroneStatuses.has(
                replacementStatus,
              ) &&
              (
                replacementRows.length === 0 ||
                replacementRows.every(
                  isProjectRowFulfilled,
                )
              );
          }
        }

        const pending =
          pendingEngineerScrapStatuses.has(
            approvalStatus,
          );

        let label = "Scrapped";

        if (pending) {
          label = "Scrap Pending";
        } else if (
          reorderChoice === "YES"
        ) {
          label =
            scrapMode === "TOTAL"
              ? "Fully Scrapped • Reordered"
              : "Scrapped • Reordered";
        } else if (
          scrapMode === "TOTAL"
        ) {
          label = "Fully Scrapped";
        } else {
          label = "Partially Scrapped";
        }

        return {
          hasScrap: true,

          /*
           * From the moment an Engineer Scrap workflow exists, the old drone
           * must not be sellable. If the Scrap is rejected, it is filtered out
           * above and Sale becomes available again.
           */
          saleBlocked: true,
          pending,
          label,
          scrapMode,
          reorderChoice,
          replacementMrNumber,
          replacementType,
          replacementCompleted,
          scrapRow,
        };
      };

      const approved = list.filter((item) => {
        const status = String(
          item.status ||
            item.material_request_status ||
            item.mr_status ||
            item.approval_status ||
            "",
        )
          .trim()
          .toUpperCase();

        if (!inDroneStatuses.has(status)) {
          return false;
        }

        // In Drone intentionally excludes Returnable. It contains only
        // BOM, Customized BOM, R&D, From Scrap and Retail Sales.
        if (!isAllowedInDroneRequest(item)) {
          return false;
        }

        const itemReferences = [
          item?.id,
          item?.material_request_id,
          item?.request_id,
          item?.mr_id,
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

        const engineerScrapState =
          getEngineerScrapStateForMr(
            item,
            itemReferences,
          );

        item.inDroneHasEngineerScrap =
          engineerScrapState.hasScrap;

        item.inDroneScrapSaleBlocked =
          engineerScrapState.saleBlocked;

        item.inDroneScrapPending =
          engineerScrapState.pending;

        item.inDroneScrapLabel =
          engineerScrapState.label;

        item.inDroneScrapMode =
          engineerScrapState.scrapMode;

        item.inDroneScrapReorderChoice =
          engineerScrapState.reorderChoice;

        item.inDroneReplacementMrNumber =
          engineerScrapState
            .replacementMrNumber;

        item.inDroneReplacementType =
          engineerScrapState
            .replacementType;

        item.inDroneReplacementCompleted =
          engineerScrapState
            .replacementCompleted;

        /*
         * Flight Test / Demo-Trials / Event are temporary drone usages.
         * The original MR MUST remain visible in In Drone while the same
         * MR is also shown in Returnable. Do not filter it out here.
         */

        const salesStatus = itemReferences
          .map((reference) =>
            salesStatusByReference.get(reference),
          )
          .find(Boolean) || "";

        /*
         * IMPORTANT:
         * A completed Sale is still retained in the In Drone table as
         * history/audit data. Do not remove the MR after Management approval.
         * The Action column will show "Sold".
         */
        item.salesApprovalStatus = salesStatus;

        const salesDetails = itemReferences
          .map((reference) =>
            salesDetailsByReference.get(reference),
          )
          .find(Boolean) || {};

        item.salesClient =
          salesDetails.client || "";
        item.salesInvoiceNumber =
          salesDetails.invoiceNumber || "";
        item.salesRemarks =
          salesDetails.remarks || "";

        /*
         * In-Drone allocation summary.
         *
         * New backend movements create one ComponentUsage row per component.
         * They all carry the same movement_id. Group them so a movement of 2
         * shows as "Flight Test: 2" instead of 2 x component-count.
         *
         * Once a movement is returned, it disappears from its purpose line.
         * Returned-but-not-QC-completed quantity remains unavailable until the
         * good return is completed.
         */
        const matchingUsageRows =
          componentUsageRows.filter((usage) => {
            const usageReferences = [
              usage?.material_request,
              usage?.material_request_id,
              usage?.material_request_number,
              usage?.request_id,
              usage?.mr_id,
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

            return usageReferences.some((reference) =>
              itemReferences.includes(reference),
            );
          });

        const movementGroups = new Map();

        matchingUsageRows.forEach((usage) => {
          const purpose = String(
            usage?.purpose ||
              usage?.usage_purpose ||
              "",
          )
            .trim()
            .toUpperCase();

          if (
            ![
              "FLIGHT_TEST",
              "CUSTOMER_DEMO",
              "EVENT",
            ].includes(purpose)
          ) {
            return;
          }

          const details = Array.isArray(
            usage?.inventory_issue_details,
          )
            ? usage.inventory_issue_details
            : [];

          const movementId = String(
            details.find(
              (detail) =>
                detail &&
                typeof detail === "object" &&
                detail.movement_id,
            )?.movement_id ||
              [
                purpose,
                usage?.requested_date || "",
                usage?.return_due_date || "",
                usage?.remarks || "",
              ].join("|"),
          );

          const groupKey = `${purpose}|${movementId}`;
          const group = movementGroups.get(groupKey) || {
            purpose,
            quantity: 0,
            rows: [],
          };

          group.quantity = Math.max(
            group.quantity,
            Math.max(
              Number(
                usage?.quantity ??
                  usage?.issued_quantity ??
                  usage?.requested_quantity ??
                  usage?.qty ??
                  0,
              ) || 0,
              0,
            ),
          );
          group.rows.push(usage);
          movementGroups.set(groupKey, group);
        });

        const usageSummary = {};

        /*
         * Current allocation summary used for quantity calculations.
         * A Flight Test / Demo / Event movement owns its selected drone qty
         * until that exact movement is successfully returned with QC OK.
         */
        const actionUsageSummary = {};

        /*
         * Historical drone-level lifecycle shown in the In-Drone Action cell.
         *
         * Returnable already keeps the full per-component audit. In Drone only
         * needs the concise assembly history, for example:
         *
         *   Flight Test: 1
         *   Flight Test Completed • QC Passed: 1
         *   Flight Test Completed • QC Failed • Pending Manager: 1
         *   Flight Test Completed • QC Failed • Reordering: 1
         *   Flight Test Completed • QC Failed • Partial Reorder Completed: 1
         *
         * This history does NOT consume an additional quantity. Quantity is
         * still controlled only by unavailableUsageQuantity below.
         */
        const returnableHistory = [];

        const purposeLabel = (purpose) => {
          switch (String(purpose || "").toUpperCase()) {
            case "FLIGHT_TEST":
              return "Flight Test";
            case "CUSTOMER_DEMO":
              return "Demo/Trials";
            case "EVENT":
              return "Event";
            default:
              return "Returnable";
          }
        };

        const originalMrNumber = String(
          item?.material_request_id ||
            item?.request_id ||
            item?.mr_id ||
            "",
        )
          .trim()
          .toUpperCase();

        const partialReorderMr =
          originalMrNumber
            ? materialRequestByNumber.get(
                `${originalMrNumber}_PR`,
              )
            : null;

        const fullReorderMr =
          originalMrNumber
            ? materialRequestByNumber.get(
                `${originalMrNumber}_FR`,
              )
            : null;

        const completedMrStatuses =
          new Set([
            "INVENTORY_ISSUED",
            "MR_COMPLETED",
            "ISSUED",
            "COMPLETED",
          ]);

        const getReplacementState = (
          replacementMr,
        ) => {
          if (!replacementMr) {
            return {
              exists: false,
              completed: false,
            };
          }

          const replacementStatus =
            String(
              replacementMr?.status ||
                replacementMr?.workflow_status ||
                replacementMr?.approval_status ||
                "",
            )
              .trim()
              .toUpperCase();

          const replacementRows =
            getMatchingProjectRows(
              replacementMr,
            );

          return {
            exists: true,
            completed:
              completedMrStatuses.has(
                replacementStatus,
              ) &&
              (
                replacementRows.length === 0 ||
                replacementRows.every(
                  isProjectRowFulfilled,
                )
              ),
          };
        };

        const partialReorderState =
          getReplacementState(
            partialReorderMr,
          );

        const fullReorderState =
          getReplacementState(
            fullReorderMr,
          );

        let unavailableUsageQuantity = 0;

        Array.from(
          movementGroups.values(),
        ).forEach((group) => {
          const approvalStates =
            group.rows.map((usage) =>
              String(
                usage?.return_approval_status ||
                  "",
              )
                .trim()
                .toUpperCase(),
            );

          const conditions =
            group.rows.map((usage) =>
              String(
                usage?.return_condition ||
                  "",
              )
                .trim()
                .toUpperCase(),
            );

          const metadataRows =
            group.rows.map(
              getUsageMetadata,
            );

          const allRejected =
            approvalStates.length > 0 &&
            approvalStates.every(
              (value) =>
                value === "REJECTED",
            );

          const anyIssued =
            group.rows.some(
              (usage) =>
                Boolean(
                  usage?.issued_date ||
                    usage?.issuedDate,
                ),
            );

          /*
           * A movement rejected BEFORE issue never left In Drone.
           * A QC-failed movement rejected AFTER issue remains unavailable:
           * rejection must not magically return a failed drone to stock.
           */
          if (
            allRejected &&
            !anyIssued
          ) {
            return;
          }

          const hasReturned =
            group.rows.every(
              (usage) =>
                Boolean(
                  usage?.received_date ||
                    usage?.receivedDate,
                ),
            );

          const anyNotOk =
            conditions.includes(
              "NOT_OK",
            );

          const allOk =
            conditions.length > 0 &&
            conditions.every(
              (value) =>
                value === "OK",
            );

          const allCompleted =
            approvalStates.length > 0 &&
            approvalStates.every(
              (value) =>
                value === "COMPLETED",
            );

          const fullyReleased =
            hasReturned &&
            allOk &&
            allCompleted;

          const restorePo =
            metadataRows
              .map(
                (metadata) =>
                  metadata?.restore_po_number ||
                  metadata?.restorePoNumber ||
                  "",
              )
              .find(Boolean);

          const restoreReady =
            metadataRows.some(
              (metadata) =>
                metadata
                  ?.procurement_restore_ready ===
                  true,
            );

          const restoreStatus =
            metadataRows
              .map((metadata) =>
                String(
                  metadata
                    ?.procurement_restore_status ||
                    metadata?.restore_status ||
                    "",
                )
                  .trim()
                  .toUpperCase(),
              )
              .find(Boolean) || "";

          const labelPrefix =
            purposeLabel(
              group.purpose,
            );

          let historyLabel =
            `${labelPrefix}: ${group.quantity}`;

          let historyTone =
            "ACTIVE";

          if (hasReturned) {
            if (anyNotOk) {
              historyTone =
                "QC_FAILED";

              if (
                partialReorderState
                  .completed
              ) {
                historyLabel =
                  `${labelPrefix} Completed • QC Failed • Partial Reorder Completed: ${group.quantity}`;
                historyTone =
                  "REORDER_COMPLETED";
              } else if (
                fullReorderState
                  .completed
              ) {
                historyLabel =
                  `${labelPrefix} Completed • QC Failed • Full Reorder Completed: ${group.quantity}`;
                historyTone =
                  "REORDER_COMPLETED";
              } else if (
                partialReorderState
                  .exists
              ) {
                historyLabel =
                  `${labelPrefix} Completed • QC Failed • Partial Reorder In Progress: ${group.quantity}`;
                historyTone =
                  "REORDERING";
              } else if (
                fullReorderState
                  .exists
              ) {
                historyLabel =
                  `${labelPrefix} Completed • QC Failed • Full Reorder In Progress: ${group.quantity}`;
                historyTone =
                  "REORDERING";
              } else if (
                approvalStates.includes(
                  "PENDING_MANAGER",
                )
              ) {
                historyLabel =
                  `${labelPrefix} Completed • QC Failed • Pending Manager: ${group.quantity}`;
              } else if (
                approvalStates.includes(
                  "PENDING_FINANCE",
                )
              ) {
                historyLabel =
                  `${labelPrefix} Completed • QC Failed • Pending Finance: ${group.quantity}`;
              } else if (
                restorePo ||
                restoreReady ||
                restoreStatus ===
                  "PENDING_PROCUREMENT" ||
                approvalStates.includes(
                  "APPROVED",
                )
              ) {
                historyLabel =
                  `${labelPrefix} Completed • QC Failed • Reordering: ${group.quantity}`;
                historyTone =
                  "REORDERING";
              } else if (
                allRejected
              ) {
                historyLabel =
                  `${labelPrefix} Completed • QC Failed • Workflow Rejected: ${group.quantity}`;
              } else if (
                allCompleted
              ) {
                historyLabel =
                  `${labelPrefix} Completed • QC Failed • Disposition Completed: ${group.quantity}`;
              } else {
                historyLabel =
                  `${labelPrefix} Completed • QC Failed: ${group.quantity}`;
              }
            } else if (
              fullyReleased
            ) {
              historyLabel =
                `${labelPrefix} Completed • QC Passed: ${group.quantity}`;
              historyTone =
                "QC_PASSED";
            } else {
              historyLabel =
                `${labelPrefix} Completed • QC Pending: ${group.quantity}`;
              historyTone =
                "PENDING";
            }
          }

          returnableHistory.push({
            key:
              `${group.purpose}|${historyLabel}`,
            purpose:
              group.purpose,
            quantity:
              group.quantity,
            label:
              historyLabel,
            tone:
              historyTone,
          });

          /*
           * QC OK + COMPLETED returns the exact moved quantity back into the
           * original MR and makes it usable again.
           *
           * Every other issued movement remains unavailable, including:
           * - active Flight/Demo/Event
           * - returned QC pending
           * - QC failed
           * - QC failed and being reordered
           * - QC failed and reorder completed
           */
          if (fullyReleased) {
            return;
          }

          actionUsageSummary[
            group.purpose
          ] =
            Number(
              actionUsageSummary[
                group.purpose
              ] || 0,
            ) + group.quantity;

          unavailableUsageQuantity +=
            group.quantity;

          /*
           * Keep the old current-purpose summary for dashboard breakdowns.
           * Once physically returned, it becomes historical rather than an
           * active Flight/Demo/Event movement.
           */
          if (!hasReturned) {
            usageSummary[
              group.purpose
            ] =
              Number(
                usageSummary[
                  group.purpose
                ] || 0,
              ) + group.quantity;
          }
        });

        item.inDroneUsageSummary =
          usageSummary;

        item.inDroneActionUsageSummary =
          actionUsageSummary;

        item.inDroneReturnableHistory =
          returnableHistory;

        const salesAllocation = itemReferences
          .map((reference) =>
            salesAllocationByReference.get(reference),
          )
          .find(Boolean) || {
            reserved: 0,
            approved: 0,
            pending: 0,
            rejected: 0,
          };

        item.inDroneSalesQuantity =
          Number(salesAllocation.reserved || 0);
        item.inDroneApprovedSalesQuantity =
          Number(salesAllocation.approved || 0);
        item.inDronePendingSalesQuantity =
          Number(salesAllocation.pending || 0);

        const totalInDroneQuantity = getInDroneTotalDroneQuantity(item);

        item.inDroneAvailableQuantity =
          item.inDroneScrapSaleBlocked
            ? 0
            : Math.max(
                totalInDroneQuantity -
                  unavailableUsageQuantity -
                  item.inDroneSalesQuantity,
                0,
              );

        const matchingRows =
          getMatchingProjectRows(item);

        /*
         * For current MR workflows, In Drone is reached only after every
         * requested component has been issued.
         *
         * Keep the no-row fallback only for legacy completed records that
         * existed before ProjectInventory tracking was introduced.
         */
        if (!matchingRows.length) {
          return true;
        }

        return matchingRows.every(
          isProjectRowFulfilled,
        );
      });

      /*
       * PHYSICAL DRONE ROWS
       * -------------------
       * An MR with Drone Qty 2 is displayed as two independent rows:
       *   MR-... / _01
       *   MR-... / _02
       * There is no aggregate parent row in In Drone.
       */
      const instancesByMr = new Map();
      (Array.isArray(droneInstances) ? droneInstances : []).forEach((instance) => {
        const keys = [
          instance?.material_request,
          instance?.material_request_number,
        ]
          .filter((value) => value !== undefined && value !== null && String(value).trim())
          .map((value) => String(value).trim().toUpperCase());
        keys.forEach((key) => {
          const rows = instancesByMr.get(key) || [];
          rows.push(instance);
          instancesByMr.set(key, rows);
        });
      });

      const physicalRows = approved.flatMap((item) => {
        const keys = [item?.id, item?.material_request_id, item?.request_id, item?.mr_id]
          .filter((value) => value !== undefined && value !== null && String(value).trim())
          .map((value) => String(value).trim().toUpperCase());
        const instanceMap = new Map();
        keys.forEach((key) => {
          (instancesByMr.get(key) || []).forEach((instance) =>
            instanceMap.set(String(instance.id), instance),
          );
        });
        const instances = Array.from(instanceMap.values()).sort(
          (left, right) => Number(left?.sequence || 0) - Number(right?.sequence || 0),
        );
        if (!instances.length) return [item];

        return instances.map((instance) => {
          const instanceStatus = String(instance?.status || "AVAILABLE").toUpperCase();
          const suffix = instance?.suffix || `_${String(instance?.sequence || 1).padStart(2, "0")}`;
          const baseMr = item?.material_request_id || item?.request_id || item?.mr_id || `MR-${item?.id || ""}`;
          const isScrap = ["SCRAP_PENDING", "SCRAPPED", "SCRAPPED_REORDERED"].includes(instanceStatus);
          const returnableLabels = {
            RETURNABLE_PENDING: "Returnable Pending",
            RETURNABLE_ACTIVE: "Returnable Active",
            RETURN_QC_PENDING: "Return QC Pending",
            QC_FAILED: "QC Failed",
          };
          const returnableLabel = returnableLabels[instanceStatus];
          return {
            ...item,
            id: `drone-instance-${instance.id}`,
            materialRequestDbId: item?.id,
            droneInstanceParentQuantity: Math.max(getInDroneTotalDroneQuantity(item), 1),
            droneInstanceId: instance.id,
            drone_instance_id: instance.id,
            droneInstanceCode: instance?.instance_code || `${baseMr}${suffix}`,
            droneInstanceSuffix: suffix,
            droneInstanceDisplay: `${baseMr} / ${suffix}`,
            droneInstanceStatus: instanceStatus,
            droneInstanceStatusLabel: instance?.status_label || instanceStatus.replaceAll("_", " "),
            droneInstanceWorkflow: instance?.workflow_metadata || {},
            droneInstanceReplacementMrNumber: instance?.replacement_mr_number || "",
            droneInstanceAllocations: Array.isArray(instance?.component_allocations)
              ? instance.component_allocations
              : [],
            droneInstanceSerials: (Array.isArray(instance?.component_allocations)
              ? instance.component_allocations
              : []
            ).flatMap((allocation) => Array.isArray(allocation?.serial_numbers) ? allocation.serial_numbers : []),
            inDroneAvailableQuantity: instanceStatus === "AVAILABLE" ? 1 : 0,
            inDroneHasEngineerScrap: isScrap,
            inDroneScrapSaleBlocked: isScrap,
            inDroneScrapPending: instanceStatus === "SCRAP_PENDING",
            inDroneScrapReorderChoice: instanceStatus === "SCRAPPED_REORDERED" ? "YES" : "",
            inDroneScrapLabel: ["SCRAP_PENDING", "SCRAPPED", "SCRAPPED_REORDERED"].includes(instanceStatus)
              ? (instance?.status_label || instanceStatus.replaceAll("_", " "))
              : "",
            inDroneApprovedSalesQuantity: instanceStatus === "SOLD" ? 1 : 0,
            inDronePendingSalesQuantity: instanceStatus === "SALE_PENDING" ? 1 : 0,
            inDroneSalesQuantity: ["SOLD", "SALE_PENDING"].includes(instanceStatus) ? 1 : 0,
            inDroneActionUsageSummary: returnableLabel && instance?.workflow_metadata?.purpose
              ? { [String(instance.workflow_metadata.purpose).toUpperCase()]: 1 }
              : {},
            inDroneUsageSummary: returnableLabel && instance?.workflow_metadata?.purpose
              ? { [String(instance.workflow_metadata.purpose).toUpperCase()]: 1 }
              : {},
            inDroneReturnableHistory: returnableLabel
              ? [{
                  key: `instance-${instance.id}-${instanceStatus}`,
                  label: `${returnableLabel}: 1`,
                  tone: instanceStatus === "QC_FAILED" ? "QC_FAILED" : "PENDING",
                  quantity: 1,
                }]
              : [],
            inDroneReplacementCompleted: Boolean(instance?.replacement_mr_number),
            inDroneReplacementMrNumber: instance?.replacement_mr_number || "",
            inDroneReplacementType: String(instance?.replacement_mr_number || "").toUpperCase().endsWith("_FR")
              ? "FR"
              : String(instance?.replacement_mr_number || "").toUpperCase().endsWith("_PR")
                ? "PR"
                : "",
          };
        });
      });

      setApprovedRequests(physicalRows);

      // total components is derived from inventory quantity, not component request count
    } catch (error) {
      console.error(
        "Failed to load material requests:",
        error,
      );
      setApprovedRequests([]);
      setReturnedRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

const visibleInventory = useMemo(() => {
let filtered = qcInventory.filter(
  (item) => {
    const sourceMrNumber = String(
      item.source_mr_number ||
      item.sourceMrNumber ||
      ""
    ).trim();

    const inventoryScope = String(
      item.inventory_scope ||
      item.inventoryScope ||
      ""
    )
      .trim()
      .toLowerCase();

    const isProjectInventory =
      Boolean(sourceMrNumber) ||
      inventoryScope === "project";

    /*
     * Project stock must never appear in In Store.
     */
    return !isProjectInventory;
  }
);

  // Category Filter
  if (selectedCategory !== "All") {
    filtered = filtered.filter(
      (item) =>
        String(item.category || "").toUpperCase() === selectedCategory
    );
  }

  // Search Filter
  const q = search.trim().toLowerCase();

  if (!q) return filtered;

  return filtered.filter((item) =>
    [item.code, item.component, item.vendor]
      .filter(Boolean)
      .some((value) =>
        String(value).toLowerCase().includes(q)
      )
  );
}, [qcInventory, search, selectedCategory]);

const outwardInventoryComponentOptions = useMemo(() => {
  const physicalByComponent = new Map();
  const reservedByComponent = new Map();

  const resolveMaster = (row) => {
    const rowCode = String(
      row.component_code ||
        row.componentCode ||
        "",
    ).trim();
    const rowDatabaseId =
      row.component_db_id ||
      row.componentDatabaseId ||
      row.component_pk ||
      null;

    return (
      components.find(
        (component) =>
          rowCode &&
          String(
            component.component_id ||
              component.component_code ||
              component.code ||
              "",
          )
            .trim()
            .toLowerCase() === rowCode.toLowerCase(),
      ) ||
      components.find(
        (component) =>
          rowDatabaseId &&
          String(component.id || component.pk || "") ===
            String(rowDatabaseId),
      ) ||
      findInventoryComponentMaster(row, components)
    );
  };

  (Array.isArray(projectInventory) ? projectInventory : []).forEach((row) => {
    const componentMaster = resolveMaster(row);
    const componentDatabaseId =
      componentMaster?.id ?? componentMaster?.pk;

    if (
      componentDatabaseId === undefined ||
      componentDatabaseId === null ||
      componentDatabaseId === ""
    ) {
      return;
    }

    const remainingReserved = Math.max(
      Number(
        row.remaining_store_quantity ??
          row.remainingStoreQuantity ??
          Math.max(
            Number(row.store_quantity || 0) -
              Number(row.issued_store_quantity || 0),
            0,
          ),
      ) || 0,
      0,
    );

    const key = String(componentDatabaseId);
    reservedByComponent.set(
      key,
      Number(reservedByComponent.get(key) || 0) +
        remainingReserved,
    );
  });

  (Array.isArray(qcInventory) ? qcInventory : []).forEach((row) => {
    const sourceMrNumber = String(
      row.source_mr_number ||
        row.sourceMrNumber ||
        "",
    ).trim();
    const inventoryScope = String(
      row.inventory_scope ||
        row.inventoryScope ||
        "",
    )
      .trim()
      .toLowerCase();

    if (sourceMrNumber || inventoryScope === "project") {
      return;
    }

    const physicalQuantity = Math.max(
      Number(row.qty ?? row.quantity ?? 0) || 0,
      0,
    );
    if (physicalQuantity <= 0) return;

    const componentMaster = resolveMaster(row);
    const componentDatabaseId =
      componentMaster?.id ?? componentMaster?.pk;

    if (
      componentDatabaseId === undefined ||
      componentDatabaseId === null ||
      componentDatabaseId === ""
    ) {
      return;
    }

    const key = String(componentDatabaseId);
    const code = String(
      componentMaster?.component_id ||
        componentMaster?.component_code ||
        componentMaster?.code ||
        row.component_code ||
        "",
    ).trim();
    const name = String(
      componentMaster?.name ||
        componentMaster?.component_name ||
        row.component_name ||
        row.componentName ||
        row.component ||
        "Unnamed Component",
    ).trim();

    const current = physicalByComponent.get(key) || {
      value: key,
      componentId: componentDatabaseId,
      code,
      name,
      label: [code, name].filter(Boolean).join(" - ") || name,
      physicalQty: 0,
      reservedQty: 0,
      availableQty: 0,
      availableSerials: [],
    };

    current.physicalQty += physicalQuantity;

    const rowSerials = getSerialsFromInventoryItem(row);
    current.availableSerials = Array.from(
      new Set([
        ...(Array.isArray(current.availableSerials)
          ? current.availableSerials
          : []),
        ...rowSerials,
      ]),
    );

    physicalByComponent.set(key, current);
  });

  return Array.from(physicalByComponent.values())
    .map((option) => {
      const reservedQty = Number(
        reservedByComponent.get(String(option.value)) || 0,
      );

      const availableQty = Math.max(
        Number(option.physicalQty || 0) - reservedQty,
        0,
      );

      return {
        ...option,
        reservedQty,
        availableQty,
        availableSerials: Array.from(
          new Set(
            Array.isArray(option.availableSerials)
              ? option.availableSerials
              : [],
          ),
        ).slice(0, availableQty),
      };
    })
    .filter((option) => option.availableQty > 0)
    .sort((left, right) => left.label.localeCompare(right.label));
}, [qcInventory, projectInventory, components]);

const getOutwardInventoryComponentOption = (value) =>
  outwardInventoryComponentOptions.find(
    (option) => String(option.value) === String(value),
  ) || null;

const visibleProjectInventory =
  useMemo(() => {
    /*
     * PROJECT INVENTORY RULE
     * ----------------------
     * Show ONLY components for which a quantity was actually raised through
     * an MR-linked Purchase Order.
     *
     * Example:
     *   MR Component A: requested 3, In Store 3, PO 0 -> DO NOT SHOW.
     *   MR Component B: requested 2, In Store 1, PO 1 -> SHOW PO QTY 1.
     *   MR Component C: requested 4, In Store 0, PO 4 -> SHOW PO QTY 4.
     *
     * Purchase Orders are the authoritative source for deciding whether a
     * component belongs in this table. ProjectInventory rows are used only
     * for the MR/component identity, QC/issued state, serials, etc.
     *
     * Replacement POs are excluded so the same originally purchased shortage
     * is not counted again.
     */
    const rejectedStatuses = new Set([
      "REJECTED",
      "MANAGER_REJECTED",
      "FINANCE_REJECTED",
      "CANCELLED",
      "CANCELED",
      "REPLACEMENT_MANAGER_REJECTED",
      "REPLACEMENT_FINANCE_REJECTED",
    ]);

    const poComponentRows = (
      Array.isArray(purchaseOrders)
        ? purchaseOrders
        : []
    ).flatMap((purchaseOrder) => {
      const sourceMrNumber = String(
        purchaseOrder?.source_mr_number ||
          purchaseOrder?.sourceMrNumber ||
          purchaseOrder?.material_request_number ||
          purchaseOrder?.materialRequestNumber ||
          purchaseOrder?.material_request_id ||
          purchaseOrder?.materialRequestId ||
          "",
      ).trim();

      // Direct PO: not part of an MR Project Inventory flow.
      if (!sourceMrNumber) {
        return [];
      }

      const poStatus = String(
        purchaseOrder?.status ||
          purchaseOrder?.approval_status ||
          purchaseOrder?.approvalStatus ||
          "",
      )
        .trim()
        .toUpperCase();

      if (rejectedStatuses.has(poStatus)) {
        return [];
      }

      const orderType = String(
        purchaseOrder?.order_type ||
          purchaseOrder?.orderType ||
          "",
      )
        .trim()
        .toUpperCase();

      const isReplacement =
        orderType === "REPLACEMENT" ||
        Boolean(
          purchaseOrder?.is_replacement ||
            purchaseOrder?.isReplacement ||
            purchaseOrder?.replacement_for ||
            purchaseOrder?.replacement_for_po ||
            purchaseOrder?.replacement_for_po_number,
        ) ||
        poStatus.startsWith("REPLACEMENT_");

      if (isReplacement) {
        return [];
      }

      const items =
        [
          purchaseOrder?.items,
          purchaseOrder?.line_items,
          purchaseOrder?.lineItems,
          purchaseOrder?.po_items,
          purchaseOrder?.purchase_order_items,
          purchaseOrder?.purchaseOrderItems,
          purchaseOrder?.components,
        ].find(Array.isArray) || [];

      const poNumber = String(
        purchaseOrder?.po_number ||
          purchaseOrder?.po ||
          purchaseOrder?.purchase_order_number ||
          purchaseOrder?.code ||
          purchaseOrder?.id ||
          "",
      ).trim();

      return items
        .map((item) => {
          const quantity = Math.max(
            Number(
              item?.quantity ??
                item?.qty ??
                item?.ordered_quantity ??
                item?.orderedQuantity ??
                0,
            ) || 0,
            0,
          );

          if (quantity <= 0) {
            return null;
          }

          const unitPrice = Math.max(
            Number(
              item?.unit_price ??
                item?.unitPrice ??
                item?.price ??
                item?.rate ??
                0,
            ) || 0,
            0,
          );

          const gstPercent = Math.max(
            Number(
              item?.gst_percentage ??
                item?.gstPercent ??
                item?.gst ??
                item?.tax_percentage ??
                item?.taxPercent ??
                0,
            ) || 0,
            0,
          );

          const explicitLineAmount = [
            item?.total_price,
            item?.totalPrice,
            item?.total_amount,
            item?.totalAmount,
            item?.line_total,
            item?.lineTotal,
            item?.amount,
          ]
            .map((value) => Number(value))
            .find(
              (value) =>
                Number.isFinite(value) &&
                value > 0,
            );

          const basicAmount =
            quantity * unitPrice;

          const calculatedLineAmount =
            basicAmount +
            (basicAmount * gstPercent) / 100;

          return {
            ...item,
            __source_mr_number:
              sourceMrNumber,
            __po_number: poNumber,
            __po_status: poStatus,
            __po_raised_quantity:
              quantity,
            __po_unit_price:
              unitPrice,
            __po_line_amount:
              explicitLineAmount ||
              calculatedLineAmount,
          };
        })
        .filter(Boolean);
    });

    let filtered = (
      Array.isArray(projectInventory)
        ? projectInventory
        : []
    )
      .map((item) => {
        const mrNumber = String(
          item?.source_mr_number ||
            item?.sourceMrNumber ||
            item?.material_request_number ||
            item?.materialRequestNumber ||
            item?.material_request_id ||
            item?.materialRequestId ||
            "",
        ).trim();

        if (!mrNumber) {
          return null;
        }

        const matchingPoItems =
          poComponentRows.filter(
            (poItem) =>
              String(
                poItem.__source_mr_number ||
                  "",
              )
                .trim()
                .toUpperCase() ===
                mrNumber.toUpperCase() &&
              projectComponentsMatch(
                item,
                poItem,
              ),
          );

        if (!matchingPoItems.length) {
          // No actual PO line for this MR component -> In-Store-only row.
          return null;
        }

        const poRaisedQuantity =
          matchingPoItems.reduce(
            (sum, poItem) =>
              sum +
              Math.max(
                Number(
                  poItem
                    .__po_raised_quantity ||
                    0,
                ) || 0,
                0,
              ),
            0,
          );

        if (poRaisedQuantity <= 0) {
          return null;
        }

        const poRaisedAmount =
          matchingPoItems.reduce(
            (sum, poItem) =>
              sum +
              Math.max(
                Number(
                  poItem.__po_line_amount ||
                    0,
                ) || 0,
                0,
              ),
            0,
          );

        const basicPoValue =
          matchingPoItems.reduce(
            (sum, poItem) =>
              sum +
              Math.max(
                Number(
                  poItem
                    .__po_raised_quantity ||
                    0,
                ) || 0,
                0,
              ) *
                Math.max(
                  Number(
                    poItem
                      .__po_unit_price ||
                      0,
                  ) || 0,
                  0,
                ),
            0,
          );

        const poUnitPrice =
          poRaisedQuantity > 0
            ? basicPoValue /
              poRaisedQuantity
            : 0;

        const poNumbers =
          Array.from(
            new Set(
              matchingPoItems
                .map(
                  (poItem) =>
                    String(
                      poItem.__po_number ||
                        "",
                    ).trim(),
                )
                .filter(Boolean),
            ),
          );

        return {
          ...item,

          /*
           * These fields are table-specific authoritative values.
           * Do not overwrite requested/store/QC quantities because those are
           * still used elsewhere for workflow and serial calculations.
           */
          project_po_raised_quantity:
            poRaisedQuantity,
          po_raised_quantity:
            poRaisedQuantity,
          project_po_unit_price:
            poUnitPrice,
          project_po_raised_amount:
            poRaisedAmount,
          project_po_numbers:
            poNumbers,
        };
      })
      .filter(Boolean);

    if (selectedCategory !== "All") {
      filtered = filtered.filter(
        (item) =>
          String(
            resolveInventoryCategory(
              item,
              components,
            ) ||
              item.category ||
              "",
          ).toUpperCase() ===
          selectedCategory,
      );
    }

    const query =
      search.trim().toLowerCase();

    if (!query) {
      return filtered;
    }

    return filtered.filter((item) =>
      [
        item.source_mr_number,
        item.sourceMrNumber,
        item.material_request_id,
        item.component,
        item.component_name,
        item.component_code,
        ...(Array.isArray(
          item.project_po_numbers,
        )
          ? item.project_po_numbers
          : []),
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(query),
        ),
    );
  }, [
    projectInventory,
    purchaseOrders,
    components,
    search,
    selectedCategory,
  ]);

const activeOutwardType = tab === "sales" || tab === "event" ? tab : selectedOutwardTab;

  const visibleScrap = useMemo(() => {
    const filteredByTab = outwardData.filter((item) => {
      if (activeOutwardType === "scrap") {
        return item.type === "scrap" && !isQcFailedItem(item);
      }
      if (activeOutwardType === "failedQc") {
        return item.type === "failedQc" || (item.type === "scrap" && isQcFailedItem(item));
      }
      return item.type === activeOutwardType;
    });

    const q = search.trim().toLowerCase();
    if (!q) return filteredByTab;

    return filteredByTab.filter((item) =>
      [
        item.component,
        item.productName,
        item.reason,
        item.remarks,
        item.status,
        item.date,
        item.outDate,
        item.typeLabel,
        item.typeOfOutward,
        item.invoiceNumber,
        item.client,
        item.customer,
        item.deliverables,
        item.eventName,
        item.returnDate,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [outwardData, activeOutwardType, search]);

  const scrapCount = useMemo(() => {
    /*
     * Scrap Items must represent ONLY real Scrap outward records.
     * Failed-QC rows are shown in their own Scrap sub-tab and must not
     * increase the dashboard Scrap count.
     */
    return (Array.isArray(outwardData) ? outwardData : [])
      .filter(
        (item) =>
          String(item?.type || "")
            .trim()
            .toLowerCase() === "scrap" &&
          !isQcFailedItem(item),
      )
      .reduce((sum, item) => {
        const quantity = Number(
          item?.qty ??
            item?.quantity ??
            item?.noOfComponents ??
            item?.no_of_components ??
            1,
        );

        return (
          sum +
          (Number.isFinite(quantity)
            ? Math.max(quantity, 0)
            : 0)
        );
      }, 0);
  }, [outwardData]);

  const visibleScrapCount = useMemo(() => {
    return visibleScrap.reduce((s, it) => s + (Number(it.qty) || 1), 0);
  }, [visibleScrap]);

  const resolveInventoryPaginationUrl = (value) => {
    const raw = String(value || "").trim();

    if (!raw) {
      return "";
    }

    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }

    const base = String(config.baseURL || "")
      .trim()
      .replace(/\/+$/, "");

    /*
     * DRF normally returns absolute next links, but some deployments return
     * /api/... or another relative URL. Resolve those safely without creating
     * /api/api/... paths.
     */
    if (typeof window !== "undefined") {
      try {
        const baseUrl = new URL(
          `${base}/`,
          window.location.origin,
        );

        return new URL(raw, baseUrl).toString();
      } catch (_error) {
        // Fall through to string resolution below.
      }
    }

    if (raw.startsWith("/")) {
      if (base.startsWith("/") && raw.startsWith(`${base}/`)) {
        return raw;
      }

      return `${base}${raw}`;
    }

    return `${base}/${raw.replace(/^\/+/, "")}`;
  };

  async function fetchPaginatedList(
    initialUrl,
    options = {},
  ) {
    const allItems = [];
    const visitedUrls = new Set();
    let nextUrl = resolveInventoryPaginationUrl(initialUrl);

    while (nextUrl) {
      if (visitedUrls.has(nextUrl)) {
        console.warn(
          "Inventory pagination loop stopped:",
          nextUrl,
        );
        break;
      }

      visitedUrls.add(nextUrl);

      const pageData = await fetchAuthenticatedJson(
        nextUrl,
        options,
      );

      if (!pageData) {
        break;
      }

      if (Array.isArray(pageData)) {
        allItems.push(...pageData);
        break;
      }

      const pageItems = [
        pageData?.results,
        pageData?.items,
        pageData?.data,
        pageData?.rows,
        pageData?.components,
        pageData?.data?.results,
        pageData?.data?.items,
        pageData?.data?.rows,
        pageData?.data?.components,
      ].find(Array.isArray) || [];

      if (pageItems.length) {
        allItems.push(...pageItems);
      }

      const pageNext =
        pageData?.next ||
        pageData?.["stock-in"] ||
        pageData?.data?.next ||
        "";

      nextUrl = resolveInventoryPaginationUrl(
        pageNext,
      );
    }

    return allItems;
  }

  async function fetchSharedPaginatedList(
    key,
    url,
    options = {},
  ) {
    const requestKey = String(key || url);
    const pending =
      pendingPaginatedRequestsRef.current.get(
        requestKey,
      );

    if (pending) {
      return pending;
    }

    const request = fetchPaginatedList(
      url,
      options,
    );

    pendingPaginatedRequestsRef.current.set(
      requestKey,
      request,
    );

    try {
      return await request;
    } finally {
      if (
        pendingPaginatedRequestsRef.current.get(
          requestKey,
        ) === request
      ) {
        pendingPaginatedRequestsRef.current.delete(
          requestKey,
        );
      }
    }
  }

  const getScrapApprovalStatus = (row) => {
    const status = String(
      row?.approval_status ||
        row?.approvalStatus ||
        row?.status ||
        ""
    )
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");

    if (status === "PENDING_FINANCE") {
      return "PENDING_FINANCE";
    }

    if (
      status === "REQUESTED" ||
      status === "PENDING_MANAGER"
    ) {
      return "PENDING_MANAGER";
    }

    if (status === "APPROVED") {
      return "APPROVED";
    }

    // Legacy/intermediate Manager-approved rows are waiting for Finance.
    if (status === "MANAGER_APPROVED") {
      return "PENDING_FINANCE";
    }

    if (status === "FINANCE_REJECTED") {
      return "FINANCE_REJECTED";
    }

    if (
      status === "REJECTED" ||
      status === "MANAGER_REJECTED"
    ) {
      return "MANAGER_REJECTED";
    }

    /*
     * Keep historical Scrap rows visible without changing their old status.
     */
    if (status === "SCRAPPED") {
      return "SCRAPPED";
    }

    /*
     * New Scrap records are Manager-first. If an old/empty row has no
     * recognizable state, show it as Pending Manager by default.
     */
    return status || "PENDING_MANAGER";
  };

  const cleanScrapUserName = (value) => {
    const raw = String(
      value || "",
    ).trim();

    if (!raw) {
      return "Approver";
    }

    if (raw.includes("@")) {
      return (
        raw.split("@")[0]?.trim() ||
        "Manager"
      );
    }

    return raw;
  };

  const openScrapRejectDetails = async (row) => {
    const backendId =
      row?.backendId ??
      row?.id ??
      row?.outward_id ??
      row?.outwardId;

    let source = row || {};

    if (
      backendId !== undefined &&
      backendId !== null &&
      backendId !== "" &&
      !String(backendId).startsWith(
        "qc-failed-",
      )
    ) {
      try {
        source =
          await fetchAuthenticatedJson(
            `${config.baseURL}/outward/${encodeURIComponent(
              backendId,
            )}/`,
          );
      } catch (error) {
        console.error(
          "Unable to load Scrap rejection details:",
          error,
        );
      }
    }

    setScrapRejectDetails({
      rejectedBy:
        cleanScrapUserName(
          source?.rejected_by ||
          source?.rejectedBy ||
          row?.rejected_by ||
          row?.rejectedBy ||
          "Approver",
        ),
      reason:
        source?.rejection_reason ||
        source?.rejectionReason ||
        row?.rejection_reason ||
        row?.rejectionReason ||
        "No rejection reason was provided.",
    });
  };

  const getScrapApprovalLabel = (row) => {
    const status =
      getScrapApprovalStatus(row);

    if (status === "PENDING_FINANCE") {
      return "Pending Finance";
    }

    if (status === "PENDING_MANAGER") {
      return "Pending Manager";
    }

    if (status === "APPROVED") {
      return row?.movedToInventory || row?.moved_to_inventory
        ? "Scrap Moved"
        : "Finance Approved";
    }

    if (status === "FINANCE_REJECTED") {
      return "Finance Rejected";
    }

    if (status === "MANAGER_REJECTED") {
      return "Manager Rejected";
    }

    if (status === "SCRAPPED") {
      return "Scrapped";
    }

    return status
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) =>
        letter.toUpperCase(),
      );
  };

  const getScrapSelectedSerials = (row = {}) => {
    return Array.from(
      new Set([
        ...splitInventorySerials(
          row?.serial_numbers,
        ),
        ...splitInventorySerials(
          row?.serialNumbers,
        ),
      ]),
    );
  };


  const getScrapRequestedBy = (row = {}) => {
    const value =
      row?.requested_by ||
      row?.requestedBy ||
      row?.requested_by_name ||
      row?.requester_name ||
      row?.created_by_name ||
      "";

    const text = String(value || "").trim();

    if (!text) {
      return "-";
    }

    return text.includes("@")
      ? text.split("@")[0]?.trim() || "-"
      : text;
  };


  const getScrapMaterialRequestDisplay = (row = {}) => {
    const materialRequest =
      row?.material_request;

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
      row?.material_request_number ||
        row?.materialRequestNumber ||
        row?.material_request_id ||
        row?.materialRequestId ||
        materialRequest ||
        "-"
    ).trim() || "-";
  };


  const getScrapSourceDisplay = (row = {}) => {
    const source = String(
      row?.source ||
        row?.scrap_source ||
        row?.scrapSource ||
        "DIRECT",
    )
      .trim()
      .toUpperCase();

    if (source === "ENGINEER") {
      return "Engineer";
    }

    if (source === "DIRECT") {
      return "Direct";
    }

    return source
      ? source
          .toLowerCase()
          .replace(/\b\w/g, (letter) =>
            letter.toUpperCase(),
          )
      : "-";
  };


  const isMrLinkedEngineerScrap = (row = {}) => {
    const scrapOrigin = String(
      row?.scrap_origin ||
        row?.scrapOrigin ||
        "",
    )
      .trim()
      .toUpperCase();

    const materialRequest =
      row?.material_request_number ||
      row?.materialRequestNumber ||
      row?.material_request_id ||
      row?.materialRequestId ||
      row?.material_request ||
      "";

    return (
      scrapOrigin === "MR" ||
      Boolean(
        String(
          materialRequest || "",
        ).trim(),
      )
    );
  };


  const openScrapComponentDetails = (row) => openCostDetails("outward", row);


  const getScrapComponentDisplay = (row) => {
    const rowCode = String(
      row?.component_code ||
        row?.componentCode ||
        (
          typeof row?.component === "object"
            ? row.component?.component_id ||
              row.component?.component_code ||
              row.component?.code ||
              ""
            : ""
        ) ||
        "",
    ).trim();

    const rawName = String(
      row?.component_name ||
        row?.componentName ||
        (
          typeof row?.component === "object"
            ? row.component?.name ||
              row.component?.component_name ||
              ""
            : ""
        ) ||
        row?.productName ||
        row?.product_name ||
        (
          typeof row?.component === "string"
            ? row.component
            : ""
        ) ||
        "",
    ).trim();

    /*
     * New Engineer Scrap already stores:
     * "CMP-xxxx - component name".
     *
     * If the row already contains the code, do not prefix it again.
     */
    if (
      rowCode &&
      rawName &&
      rawName
        .toLowerCase()
        .startsWith(
          rowCode.toLowerCase(),
        )
    ) {
      return rawName;
    }

    if (rowCode && rawName) {
      return `${rowCode} - ${rawName}`;
    }

    /*
     * Older Inventory/Outward Scrap rows may have stored only the
     * component name. Resolve that name against the Components API
     * so existing rows can also display:
     *
     * CMP-123 - propeller
     */
    const normalizedName =
      rawName.toLowerCase();

    const matchedComponent =
      components.find(
        (component) => {
          const componentName =
            String(
              component?.name ||
                component?.component_name ||
                "",
            )
              .trim()
              .toLowerCase();

          return (
            normalizedName &&
            componentName ===
              normalizedName
          );
        },
      );

    if (matchedComponent) {
      const code = String(
        matchedComponent
          ?.component_id ||
          matchedComponent
            ?.component_code ||
          matchedComponent?.code ||
          "",
      ).trim();

      const name = String(
        matchedComponent?.name ||
          matchedComponent
            ?.component_name ||
          rawName,
      ).trim();

      if (code && name) {
        return `${code} - ${name}`;
      }

      return name || code || "-";
    }

    return rawName || rowCode || "-";
  };

  const scrapTableColumns = useMemo(() => {
    const baseColumns = [
      {
        key: "sno",
        header: "S.No",
        render: (_, index) => index + 1,
      },
      {
        key: "outDate",
        header: "Out Date",
        render: (row) => row.outDate || row.date || "",
      },
      {
        key: "productName",
        header: "Component Name",
        render: (row) => {
          const label =
            getScrapComponentDisplay(
              row,
            );

          if (
            activeOutwardType === "scrap" &&
            isMrLinkedEngineerScrap(
              row,
            )
          ) {
            return (
              <button
                type="button"
                onClick={() =>
                  void openScrapComponentDetails(
                    row,
                  )
                }
                className="font-semibold text-foreground transition hover:text-primary hover:underline"
                title="Click to view MR ID, selected serial number and quantity"
              >
                {label}
              </button>
            );
          }

          return label;
        },
      },
      {
        key: "typeOfOutward",
        header: "Type of Outward",
        render: (row) => row.typeOfOutward || row.typeLabel || row.type || "-",
      },
    ];

    if (activeOutwardType === "failedQc") {
      return [
        ...baseColumns,
        {
          key: "remarks",
          header: "Remarks",
          render: (row) =>
            row.remarks ||
            row.reason ||
            "-",
        },
        {
          key: "status",
          header: "Status",
          className: "text-center",
          render: (row) => (
            <StatusBadge
              status={
                row.status ||
                "Failed"
              }
            />
          ),
        },
      ];
    }

    if (activeOutwardType === "scrap") {
      return [
        {
          key: "requestedBy",
          header: "Requested By",
          className: "text-center text-sm",
          render: (row) => (
            <span className="text-sm font-semibold">
              {getScrapRequestedBy(row)}
            </span>
          ),
        },
        {
          key: "productName",
          header: "Component",
          className: "text-center text-sm",
          render: (row) => {
            const label =
              getScrapComponentDisplay(
                row,
              );

            return (
              <span
                className="inline-block max-w-[230px] break-words text-center text-[14px] font-semibold leading-5 text-foreground"
                title={label}
              >
                {label}
              </span>
            );
          },
        },
        {
          key: "qty",
          header: "Qty",
          className: "text-center text-sm",
          render: (row) => (
            <span className="text-sm font-semibold">
              {Number(
                row?.qty ??
                  row?.quantity ??
                  0,
              )}
            </span>
          ),
        },


        {
          key: "materialRequest",
          header: "Material Request",
          className: "text-center text-sm",
          render: (row) => (
            <span className="break-words text-[14px] font-medium leading-5">
              {getScrapMaterialRequestDisplay(
                row,
              )}
            </span>
          ),
        },
        {
          key: "outDate",
          header: "Date",
          className: "text-center text-sm",
          render: (row) => (
            <span className="text-[14px] font-medium">
              {formatDate(
                row?.outDate ||
                  row?.date ||
                  row?.out_date,
              ) || "-"}
            </span>
          ),
        },
        {
          key: "remarks",
          header: "Remarks",
          className: "text-center text-sm",
          render: (row) => (
            <span
              className="inline-block max-w-[200px] break-words text-center text-[14px] font-medium leading-5 text-muted-foreground"
              title={
                row?.remarks ||
                row?.reason ||
                ""
              }
            >
              {row?.remarks ||
                row?.reason ||
                "-"}
            </span>
          ),
        },
        {
          key: "status",
          header: "Status",
          className: "text-center",
          render: (row) => {
            const status =
              getScrapApprovalStatus(row);

            const label =
              getScrapApprovalLabel(row);

            const isRejected =
              [
                "FINANCE_REJECTED",
                "MANAGER_REJECTED",
              ].includes(status);

            const className =
              status === "APPROVED"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : isRejected
                  ? "border-red-200 bg-red-50 text-red-700"
                  : status === "SCRAPPED"
                    ? "border-slate-200 bg-slate-100 text-slate-700"
                    : "border-amber-200 bg-amber-50 text-amber-700";

            if (isRejected) {
              return (
                <button
                  type="button"
                  onClick={() =>
                    openScrapRejectDetails(
                      row,
                    )
                  }
                  className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 transition hover:opacity-80 ${className}`}
                  title="Click to view rejection reason"
                >
                  {label}
                </button>
              );
            }

            return (
              <span
                className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 ${className}`}
              >
                {label}
              </span>
            );
          },
        },
        {
          key: "action",
          header: "Action",
          className: "text-center",
          render: (row) => (
            <button
              type="button"
              onClick={() =>
                void openScrapComponentDetails(
                  row,
                )
              }
              className="whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1 text-[12px] font-semibold text-foreground transition hover:border-primary hover:text-primary"
            >
              View Details
            </button>
          ),
        },
      ];
    }

    if (activeOutwardType === "sales") {
      return [
        baseColumns[0],
        baseColumns[1],
        {
          key: "invoiceNumber",
          header: "Invoice Number",
          render: (row) => row.invoiceNumber || "-",
        },
        baseColumns[2],
        {
          key: "itemType",
          header: "Item Type",
          render: (row) =>
            String(row.itemType || row.item_type || "COMPONENT")
              .trim()
              .toUpperCase() === "DRONE"
              ? "Drone"
              : "Component",
        },
        {
          key: "qty",
          header: "Qty",
          render: (row) => (
            <button
              type="button"
              onClick={() => openEventComponentsModal(row)}
              className="inline-flex items-center justify-center rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary"
            >
              {row.qty || row.quantity || 1}
            </button>
          ),
          className: "text-center",
        },
        {
          key: "client",
          header: "Client",
          render: (row) => row.client || row.customer || "-",
        },
        {
          key: "deliverables",
          header: "List of Deliverable",
          render: (row) => row.deliverables || "-",
        },
        
        {
          key: "remarks",
          header: "Remarks",
          render: (row) => row.remarks || row.reason || "-",
        },
      ];
    }

    if (activeOutwardType === "event") {
      return [
        baseColumns[0],
        baseColumns[1],
        {
          key: "eventName",
          header: "Event Name",
          render: (row) => row.eventName || "-",
          className: "text-center",
        },
        {
          key: "itemType",
          header: "Item Type",
          render: (row) =>
            String(row.itemType || row.item_type || "COMPONENT")
              .trim()
              .toUpperCase() === "DRONE"
              ? "Drone"
              : "Component",
          className: "text-center",
        },
        {
          key: "noOfComponents",
          header: "Qty",
          render: (row) => (
            <button
              type="button"
              onClick={() => openEventComponentsModal(row)}
              className="inline-flex items-center justify-center rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary"
            >
              {row.noOfComponents || row.qty || "-"}
            </button>
          ),
          className: "text-center",
        },
{
  key: "returnDate",
  header: "Return Date",
  render: (row) => (
    <input
      type="date"
      value={row.returnDate || row.return_date || ""}
      onChange={(e) => handleUpdateEventReturnDate(row, e.target.value)}
      disabled={!canManageInventory}
      className={`w-full rounded-2xl border border-border px-3 py-2 text-sm outline-none ${
        canManageInventory
          ? "bg-card focus:border-primary"
          : "cursor-default bg-muted/40 text-muted-foreground"
      }`}
      style={{ minWidth: "170px" }}
    />
  ),
  className: "text-center",
},
        {
          key: "status",
          header: "Status",
          render: (row) => {
            const statusText = String(row.status || row.actionStatus || "Pending").trim();
            const isReturned = statusText.toUpperCase() === "RETURNED";
            return (
              <span className={isReturned ? "inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700" : "text-sm text-slate-700"}>
                {statusText}
              </span>
            );
          },
          className: "text-center",
        },
        {
          key: "action",
          header: "Action",
          className: "text-center",
          render: (row) => (
            <button
              type="button"
              onClick={() => openEventActionModal(row)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary"
            >
              {canManageInventory
                ? row.returned
                  ? "View Return"
                  : "Update Return"
                : "View Return"}
            </button>
          ),
        },
      ];
    }

    return [
      ...baseColumns,
      {
        key: "remarks",
        header: "Remarks",
        render: (row) => row.remarks || row.reason || "-",
      },
    ];
  }, [
    activeOutwardType,
    canManageInventory,
    components,
  ]);

  const scrapModalConfig = {
    scrap: {
      title: "Add Scrap Entry",
      subtitle: "Create a scrap record for failed QC components.",
      actionLabel: "Save Scrap Entry",
      typeLabel: "Scrap",
      showSaleFields: false,
      showEventFields: false,
    },
    failedQc: {
      title: "Add Failed / Defect Item",
      subtitle: "Record a defect item directly into the failed QC outward list.",
      actionLabel: "Save Scrap Item",
      typeLabel: "Failed QC",
      showSaleFields: false,
      showEventFields: false,
    },
    sales: {
      title: "Add Sales Item",
      subtitle: "Record a sales outward item with invoice and customer details.",
      actionLabel: "Save Sales Item",
      typeLabel: "Sales",
      showSaleFields: true,
      showEventFields: false,
    },
    event: {
      title: "Add Event Item",
      subtitle: "Record an event outward item with return date.",
      actionLabel: "Save Event Item",
      typeLabel: "Event",
      showSaleFields: false,
      showEventFields: true,
    },
  }[activeOutwardType] || {
      title: "Add Scrap Entry",
      subtitle: "Create a scrap record for failed QC components.",
      actionLabel: "Save Scrap Entry",
      typeLabel: "Scrap",
      showSaleFields: false,
      showEventFields: false,
    };

  /*
   * ============================================================
   * INVENTORY DASHBOARD SUMMARY / COST / EXCEL
   * ============================================================
   *
   * Overall Inventory represents inventory that still belongs to
   * the company and is physically/accountingly present in:
   *
   *   - In Store
   *   - Project Inventory
   *   - In Drone
   *   - Flight Test
   *   - Event
   *   - Demo / Trials
   *
   * Flight Test / Event / Demo are usage states INSIDE In Drone,
   * so they are shown in the breakdown but are NOT added a second
   * time to Overall Inventory.
   *
   * DEDUCTIONS / EXCLUSIONS:
   *   - Approved Sales
   *   - Scrap
   *   - QC Failed
   *
   * This prevents double counting and keeps Overall Inventory as
   * the value of stock that is still owned/present.
   */

  const safeNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const positiveNumber = (value) =>
    Math.max(safeNumber(value), 0);

  const formatCurrency = (value) =>
    `₹${positiveNumber(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const getInventoryRowQuantity = (row = {}) =>
    positiveNumber(
      row?.qty ??
        row?.quantity ??
        row?.stock_quantity ??
        row?.available_quantity ??
        0,
    );

  const getCostDetailsTotal = (row = {}) => {
    /*
     * The backend SerialCostDetails serializer exposes component totals as:
     *
     *   cost_details: [
     *     {
     *       totals: {
     *         allocated_cost: "123.45"
     *       }
     *     }
     *   ]
     *
     * Some receipt-style rows use receipt_totals instead.
     *
     * IMPORTANT:
     * Scrap "View Details" uses this exact backend cost_details data.
     * The dashboard must therefore read the group totals first instead of
     * relying only on top-level amount / unit_price fields.
     */
    const costDetailsCandidates = [
      row?.cost_details,
      row?.costDetails,
      row?.serial_cost_details,
      row?.serialCostDetails,
    ];

    for (const candidate of costDetailsCandidates) {
      if (!candidate) continue;

      const details = Array.isArray(candidate)
        ? candidate
        : [candidate];

      /*
       * Primary source: group totals returned by the cost serializer.
       */
      const groupTotal = details.reduce((sum, detail) => {
        const totals =
          detail?.receipt_totals ||
          detail?.receiptTotals ||
          detail?.totals ||
          detail?.total ||
          {};

        const allocatedCost =
          positiveNumber(
            totals?.allocated_cost ??
              totals?.allocatedCost ??
              detail?.allocated_cost ??
              detail?.allocatedCost ??
              0,
          );

        return sum + allocatedCost;
      }, 0);

      if (groupTotal > 0) {
        return groupTotal;
      }

      /*
       * Secondary source: serial-level allocated costs.
       * This keeps compatibility with older cost_details responses.
       */
      const serialRows = details.flatMap((detail) => {
        if (Array.isArray(detail?.serials)) return detail.serials;
        if (Array.isArray(detail?.items)) return detail.items;
        if (Array.isArray(detail?.rows)) return detail.rows;
        return [];
      });

      if (!serialRows.length) continue;

      const serialTotal = serialRows.reduce((sum, serial) => {
        const amount =
          positiveNumber(
            serial?.allocated_cost ??
              serial?.allocatedCost ??
              serial?.total_cost ??
              serial?.totalCost ??
              serial?.amount ??
              0,
          );

        return sum + amount;
      }, 0);

      if (serialTotal > 0) {
        return serialTotal;
      }
    }

    return 0;
  };

  const getGenericRowUnitCost = (
    row = {},
    quantityOverride = null,
  ) => {
    const directUnitCost = [
      row?.unit_price,
      row?.unitPrice,
      row?.price,
      row?.purchase_unit_price,
      row?.purchaseUnitPrice,
      row?.allocated_unit_cost,
      row?.allocatedUnitCost,
      row?.average_unit_cost,
      row?.averageUnitCost,
    ]
      .map(safeNumber)
      .find((value) => value > 0);

    if (directUnitCost) {
      return directUnitCost;
    }

    const quantity =
      quantityOverride === null
        ? getInventoryRowQuantity(row)
        : positiveNumber(quantityOverride);

    const directTotal = [
      row?.total_price,
      row?.totalPrice,
      row?.total_cost,
      row?.totalCost,
      row?.amount,
      row?.grand_total,
      row?.grandTotal,
      row?.inventory_value,
      row?.inventoryValue,
    ]
      .map(safeNumber)
      .find((value) => value > 0);

    if (directTotal && quantity > 0) {
      return directTotal / quantity;
    }

    const componentMaster =
      findInventoryComponentMaster(
        row,
        components,
      );

    return positiveNumber(
      componentMaster?.unit_price ??
        componentMaster?.unitPrice ??
        componentMaster?.price ??
        0,
    );
  };

  const getInventoryRowTotalCost = (row = {}) => {
    const quantity =
      getInventoryRowQuantity(row);

    const serialCost =
      getCostDetailsTotal(row);

    if (serialCost > 0) {
      /*
       * Current In Store rows are already normalized to their live
       * quantity. Their serial-cost rows represent that live stock.
       */
      return serialCost;
    }

    const explicitTotal = [
      row?.totalPrice,
      row?.total_price,
      row?.totalCost,
      row?.total_cost,
      row?.inventory_value,
      row?.inventoryValue,
      row?.amount,
    ]
      .map(safeNumber)
      .find((value) => value > 0);

    if (explicitTotal) {
      return explicitTotal;
    }

    return (
      getGenericRowUnitCost(
        row,
        quantity,
      ) * quantity
    );
  };

  const getProjectRemainingPurchasedQuantity = (
    row = {},
  ) => {
    const directRemaining = Number(
      row?.remaining_purchased_quantity ??
        row?.remainingPurchasedQuantity,
    );

    if (Number.isFinite(directRemaining)) {
      return Math.max(
        directRemaining,
        0,
      );
    }

    const purchasedQuantity =
      positiveNumber(
        row?.purchased_quantity ??
          row?.purchasedQuantity ??
          row?.qc_passed_quantity ??
          row?.qcPassedQuantity ??
          0,
      );

    const issuedPurchasedQuantity =
      positiveNumber(
        row?.issued_purchased_quantity ??
          row?.issuedPurchasedQuantity ??
          0,
      );

    return Math.max(
      purchasedQuantity -
        issuedPurchasedQuantity,
      0,
    );
  };

  const getProjectPurchasedBaseQuantity = (
    row = {},
  ) =>
    positiveNumber(
      row?.purchased_quantity ??
        row?.purchasedQuantity ??
        row?.qc_passed_quantity ??
        row?.qcPassedQuantity ??
        row?.quantity ??
        row?.qty ??
        0,
    );

  const getProjectRowUnitCost = (
    row = {},
  ) => {
    const purchasedQuantity =
      getProjectPurchasedBaseQuantity(
        row,
      );

    const directUnit =
      getGenericRowUnitCost(
        row,
        purchasedQuantity,
      );

    if (directUnit > 0) {
      return directUnit;
    }

    const serialCost =
      getCostDetailsTotal(row);

    if (
      serialCost > 0 &&
      purchasedQuantity > 0
    ) {
      return (
        serialCost /
        purchasedQuantity
      );
    }

    /*
     * ProjectInventory can be linked to an In Store component whose
     * current row still carries the actual purchase price.
     */
    const matchingStoreRow =
      (Array.isArray(qcInventory)
        ? qcInventory
        : []
      ).find((inventoryRow) =>
        projectComponentsMatch(
          row,
          inventoryRow,
        ),
      );

    if (matchingStoreRow) {
      return getGenericRowUnitCost(
        matchingStoreRow,
      );
    }

    return 0;
  };

  const getProjectRowCurrentCost = (
    row = {},
  ) =>
    getProjectRemainingPurchasedQuantity(
      row,
    ) *
    getProjectRowUnitCost(row);

  const getProjectIssuedQuantity = (
    row = {},
  ) =>
    positiveNumber(
      row?.issued_store_quantity ??
        row?.issuedStoreQuantity ??
        0,
    ) +
    positiveNumber(
      row?.issued_purchased_quantity ??
        row?.issuedPurchasedQuantity ??
        0,
    );

  const getProjectIssuedCost = (
    row = {},
  ) => {
    const issuedQuantity =
      getProjectIssuedQuantity(row);

    if (issuedQuantity <= 0) {
      return 0;
    }

    return (
      issuedQuantity *
      getProjectRowUnitCost(row)
    );
  };

  const getApprovedSalesQuantity = (
    row = {},
  ) =>
    positiveNumber(
      row?.inDroneApprovedSalesQuantity ??
        row?.approved_sales_quantity ??
        row?.approvedSalesQuantity ??
        0,
    );

  const getInDroneOwnedQuantity = (
    row = {},
  ) => {
    const total =
      positiveNumber(
        getInDroneTotalDroneQuantity(
          row,
        ),
      );

    /*
     * Approved Sales is no longer company inventory.
     * Pending Sales remains inventory until Management approves it.
     */
    return Math.max(
      total -
        getApprovedSalesQuantity(
          row,
        ),
      0,
    );
  };

  const getInDroneRowGrossCost = (
    row = {},
  ) => {
    const directTotal = [
      row?.inventory_cost,
      row?.inventoryCost,
      row?.total_cost,
      row?.totalCost,
      row?.amount,
    ]
      .map(safeNumber)
      .find((value) => value > 0);

    if (directTotal) {
      return row?.droneInstanceId
        ? directTotal / Math.max(Number(row?.droneInstanceParentQuantity || 1), 1)
        : directTotal;
    }

    const projectRows =
      getRequestProjectRows(row);

    const issuedCost =
      projectRows.reduce(
        (sum, projectRow) =>
          sum +
          getProjectIssuedCost(
            projectRow,
          ),
        0,
      );

    if (issuedCost > 0) {
      return row?.droneInstanceId
        ? issuedCost / Math.max(Number(row?.droneInstanceParentQuantity || 1), 1)
        : issuedCost;
    }

    /*
     * Legacy fallback: use all project component quantities if the
     * issued quantity fields were not serialized.
     */
    const fallbackGrossCost = projectRows.reduce(
      (sum, projectRow) => {
        const quantity =
          positiveNumber(
            projectRow?.requested_quantity ??
              projectRow?.requestedQuantity ??
              projectRow?.quantity ??
              projectRow?.qty ??
              0,
          );

        return (
          sum +
          quantity *
            getProjectRowUnitCost(
              projectRow,
            )
        );
      },
      0,
    );


    return row?.droneInstanceId
      ? fallbackGrossCost / Math.max(Number(row?.droneInstanceParentQuantity || 1), 1)
      : fallbackGrossCost;  };

  const getInDroneRowCurrentCost = (
    row = {},
  ) => {
    const totalQuantity =
      positiveNumber(
        getInDroneTotalDroneQuantity(
          row,
        ),
      );

    const ownedQuantity =
      getInDroneOwnedQuantity(row);

    const grossCost =
      getInDroneRowGrossCost(row);

    if (
      grossCost <= 0 ||
      totalQuantity <= 0
    ) {
      return grossCost;
    }

    /*
     * Remove the proportional cost of APPROVED Sales.
     * Flight Test / Event / Demo remain owned inventory.
     */
    return (
      grossCost *
      (ownedQuantity / totalQuantity)
    );
  };

  const getInDroneUsageQuantity = (
    row = {},
    purpose,
  ) => {
    const usage =
      row?.inDroneActionUsageSummary ||
      row?.inDroneUsageSummary ||
      {};

    return positiveNumber(
      usage?.[purpose] || 0,
    );
  };

  const getInDroneUsageCost = (
    row = {},
    purpose,
  ) => {
    const usageQty =
      getInDroneUsageQuantity(
        row,
        purpose,
      );

    const ownedQuantity =
      getInDroneOwnedQuantity(row);

    const ownedCost =
      getInDroneRowCurrentCost(row);

    if (
      usageQty <= 0 ||
      ownedQuantity <= 0 ||
      ownedCost <= 0
    ) {
      return 0;
    }

    return (
      ownedCost *
      (
        Math.min(
          usageQty,
          ownedQuantity,
        ) /
        ownedQuantity
      )
    );
  };

  const inStoreQuantity = useMemo(
    () =>
      (Array.isArray(qcInventory)
        ? qcInventory
        : []
      )
        .filter((item) => {
          const sourceMrNumber = String(
            item?.source_mr_number ||
              item?.sourceMrNumber ||
              "",
          ).trim();

          const inventoryScope = String(
            item?.inventory_scope ||
              item?.inventoryScope ||
              "",
          )
            .trim()
            .toLowerCase();

          return (
            !sourceMrNumber &&
            inventoryScope !== "project"
          );
        })
        .reduce(
          (sum, item) =>
            sum +
            getInventoryRowQuantity(
              item,
            ),
          0,
        ),
    [qcInventory],
  );

  const inStoreCost = useMemo(
    () =>
      (Array.isArray(qcInventory)
        ? qcInventory
        : []
      )
        .filter((item) => {
          const sourceMrNumber = String(
            item?.source_mr_number ||
              item?.sourceMrNumber ||
              "",
          ).trim();

          const inventoryScope = String(
            item?.inventory_scope ||
              item?.inventoryScope ||
              "",
          )
            .trim()
            .toLowerCase();

          return (
            !sourceMrNumber &&
            inventoryScope !== "project"
          );
        })
        .reduce(
          (sum, item) =>
            sum +
            getInventoryRowTotalCost(
              item,
            ),
          0,
        ),
    [
      qcInventory,
      components,
    ],
  );

  const projectInventoryQuantity =
    useMemo(
      () =>
        (
          Array.isArray(projectInventory)
            ? projectInventory
            : []
        ).reduce(
          (sum, item) =>
            sum +
            getProjectRemainingPurchasedQuantity(
              item,
            ),
          0,
        ),
      [projectInventory],
    );

  const projectInventoryCost =
    useMemo(
      () =>
        (
          Array.isArray(projectInventory)
            ? projectInventory
            : []
        ).reduce(
          (sum, item) =>
            sum +
            getProjectRowCurrentCost(
              item,
            ),
          0,
        ),
      [
        projectInventory,
        qcInventory,
        components,
      ],
    );

  /*
   * PROJECT INVENTORY CARD - MR-LINKED PO RAISED QTY + PRICE
   *
   * This card is historical/PO-based, not remaining-balance based.
   * After Inventory issues a component, ProjectInventory.remaining_purchased_quantity
   * becomes 0. The card must still show the quantity and price raised through the
   * original MR-linked Purchase Order.
   *
   * Replacement POs are excluded because they replace already purchased stock and
   * must not double the Project Inventory quantity/value.
   */
  const projectInventoryPoRaisedStats =
    useMemo(() => {
      let quantity = 0;
      let cost = 0;

      const rejectedStatuses = new Set([
        "REJECTED",
        "MANAGER_REJECTED",
        "FINANCE_REJECTED",
        "CANCELLED",
        "CANCELED",
        "REPLACEMENT_MANAGER_REJECTED",
        "REPLACEMENT_FINANCE_REJECTED",
      ]);

      (
        Array.isArray(purchaseOrders)
          ? purchaseOrders
          : []
      ).forEach((purchaseOrder) => {
        const sourceMrNumber = String(
          purchaseOrder?.source_mr_number ||
            purchaseOrder?.sourceMrNumber ||
            purchaseOrder?.material_request_number ||
            purchaseOrder?.materialRequestNumber ||
            purchaseOrder?.material_request_id ||
            purchaseOrder?.materialRequestId ||
            "",
        ).trim();

        // Only MR-flow POs belong to the Project Inventory card.
        if (!sourceMrNumber) {
          return;
        }

        const poStatus = String(
          purchaseOrder?.status ||
            purchaseOrder?.approval_status ||
            purchaseOrder?.approvalStatus ||
            "",
        )
          .trim()
          .toUpperCase();

        if (rejectedStatuses.has(poStatus)) {
          return;
        }

        const orderType = String(
          purchaseOrder?.order_type ||
            purchaseOrder?.orderType ||
            "",
        )
          .trim()
          .toUpperCase();

        const isReplacement =
          orderType === "REPLACEMENT" ||
          Boolean(
            purchaseOrder?.is_replacement ||
              purchaseOrder?.isReplacement ||
              purchaseOrder?.replacement_for ||
              purchaseOrder?.replacement_for_po ||
              purchaseOrder?.replacement_for_po_number,
          ) ||
          poStatus.startsWith("REPLACEMENT_");

        if (isReplacement) {
          return;
        }

        const items =
          [
            purchaseOrder?.items,
            purchaseOrder?.line_items,
            purchaseOrder?.lineItems,
            purchaseOrder?.po_items,
            purchaseOrder?.purchase_order_items,
            purchaseOrder?.purchaseOrderItems,
            purchaseOrder?.components,
          ].find(Array.isArray) || [];

        const poQuantity = items.reduce(
          (sum, item) =>
            sum +
            Math.max(
              Number(
                item?.quantity ??
                  item?.qty ??
                  item?.ordered_quantity ??
                  item?.orderedQuantity ??
                  0,
              ) || 0,
              0,
            ),
          0,
        );

        if (poQuantity <= 0) {
          return;
        }

        quantity += poQuantity;

        // Use the same final/order total carried by the Purchase Order.
        const explicitPoTotal = [
          purchaseOrder?.grand_total,
          purchaseOrder?.grandTotal,
          purchaseOrder?.total_amount,
          purchaseOrder?.totalAmount,
          purchaseOrder?.order_total,
          purchaseOrder?.orderTotal,
          purchaseOrder?.net_total,
          purchaseOrder?.netTotal,
          purchaseOrder?.total,
          purchaseOrder?.amount,
        ]
          .map((value) => Number(value))
          .find(
            (value) =>
              Number.isFinite(value) &&
              value > 0,
          );

        if (explicitPoTotal) {
          cost += explicitPoTotal;
          return;
        }

        // Compatibility fallback if an old PO response has no final total.
        cost += items.reduce(
          (sum, item) => {
            const itemQuantity = Math.max(
              Number(
                item?.quantity ??
                  item?.qty ??
                  item?.ordered_quantity ??
                  item?.orderedQuantity ??
                  0,
              ) || 0,
              0,
            );

            const unitPrice = Math.max(
              Number(
                item?.unit_price ??
                  item?.unitPrice ??
                  item?.price ??
                  item?.rate ??
                  0,
              ) || 0,
              0,
            );

            const gstPercent = Math.max(
              Number(
                item?.gst_percentage ??
                  item?.gstPercent ??
                  item?.gst ??
                  item?.tax_percentage ??
                  item?.taxPercent ??
                  0,
              ) || 0,
              0,
            );

            const baseAmount =
              itemQuantity * unitPrice;

            return (
              sum +
              baseAmount +
              (baseAmount * gstPercent) / 100
            );
          },
          0,
        );
      });

      return {
        quantity,
        cost,
      };
    }, [purchaseOrders]);

  const inDroneQuantity = useMemo(
    () =>
      (
        Array.isArray(approvedRequests)
          ? approvedRequests
          : []
      )
        .filter(
          (row) =>
            row?.inDroneScrapSaleBlocked !==
            true,
        )
        .reduce(
          (sum, row) =>
            sum +
            getInDroneOwnedQuantity(
              row,
            ),
          0,
        ),
    [
      approvedRequests,
      projectInventory,
    ],
  );

  const inDroneCost = useMemo(
    () =>
      (
        Array.isArray(approvedRequests)
          ? approvedRequests
          : []
      )
        .filter(
          (row) =>
            row?.inDroneScrapSaleBlocked !==
            true,
        )
        .reduce(
          (sum, row) =>
            sum +
            getInDroneRowCurrentCost(
              row,
            ),
          0,
        ),
    [
      approvedRequests,
      projectInventory,
      qcInventory,
      components,
    ],
  );

  const flightTestQuantity = useMemo(
    () =>
      (
        Array.isArray(approvedRequests)
          ? approvedRequests
          : []
      ).reduce(
        (sum, row) =>
          sum +
          getInDroneUsageQuantity(
            row,
            "FLIGHT_TEST",
          ),
        0,
      ),
    [approvedRequests],
  );

  const flightTestCost = useMemo(
    () =>
      (
        Array.isArray(approvedRequests)
          ? approvedRequests
          : []
      ).reduce(
        (sum, row) =>
          sum +
          getInDroneUsageCost(
            row,
            "FLIGHT_TEST",
          ),
        0,
      ),
    [
      approvedRequests,
      projectInventory,
      qcInventory,
      components,
    ],
  );

  const eventQuantity = useMemo(
    () =>
      (
        Array.isArray(approvedRequests)
          ? approvedRequests
          : []
      ).reduce(
        (sum, row) =>
          sum +
          getInDroneUsageQuantity(
            row,
            "EVENT",
          ),
        0,
      ),
    [approvedRequests],
  );

  const eventCost = useMemo(
    () =>
      (
        Array.isArray(approvedRequests)
          ? approvedRequests
          : []
      ).reduce(
        (sum, row) =>
          sum +
          getInDroneUsageCost(
            row,
            "EVENT",
          ),
        0,
      ),
    [
      approvedRequests,
      projectInventory,
      qcInventory,
      components,
    ],
  );

  const demoQuantity = useMemo(
    () =>
      (
        Array.isArray(approvedRequests)
          ? approvedRequests
          : []
      ).reduce(
        (sum, row) =>
          sum +
          getInDroneUsageQuantity(
            row,
            "CUSTOMER_DEMO",
          ),
        0,
      ),
    [approvedRequests],
  );

  const demoCost = useMemo(
    () =>
      (
        Array.isArray(approvedRequests)
          ? approvedRequests
          : []
      ).reduce(
        (sum, row) =>
          sum +
          getInDroneUsageCost(
            row,
            "CUSTOMER_DEMO",
          ),
        0,
      ),
    [
      approvedRequests,
      projectInventory,
      qcInventory,
      components,
    ],
  );

  const scrapCost = useMemo(
    () =>
      (
        Array.isArray(outwardData)
          ? outwardData
          : []
      )
        .filter(
          (item) =>
            String(
              item?.type || "",
            )
              .trim()
              .toLowerCase() ===
              "scrap" &&
            !isQcFailedItem(item),
        )
        .reduce(
          (sum, item) => {
            const quantity =
              positiveNumber(
                item?.qty ??
                  item?.quantity ??
                  item?.noOfComponents ??
                  item?.no_of_components ??
                  1,
              );

            /*
             * Scrap cost must use the SAME backend cost details shown by
             * the "View Details" screen.
             */
            const costDetailsTotal =
              getCostDetailsTotal(item);

            if (costDetailsTotal > 0) {
              return (
                sum +
                costDetailsTotal
              );
            }

            const directTotal = [
              item?.total_cost,
              item?.totalCost,
              item?.total_price,
              item?.totalPrice,
              item?.amount,
              item?.inventory_value,
              item?.inventoryValue,
            ]
              .map(safeNumber)
              .find(
                (value) =>
                  value > 0,
              );

            if (directTotal) {
              return sum + directTotal;
            }

            return (
              sum +
              quantity *
                getGenericRowUnitCost(
                  item,
                  quantity,
                )
            );
          },
          0,
        ),
    [
      outwardData,
      components,
    ],
  );

  /*
   * IMPORTANT:
   * Flight Test / Event / Demo are already part of In Drone.
   * Do NOT add them again here.
   *
   * Sales, Scrap and Failed QC are excluded.
   */
  const overallInventoryQuantity =
    inStoreQuantity +
    projectInventoryQuantity +
    inDroneQuantity;

  const overallInventoryCost =
    inStoreCost +
    projectInventoryCost +
    inDroneCost;

  const inventoryStats = [
    {
      label: "Overall Inventory",
      value: overallInventoryQuantity,
      cost: overallInventoryCost,
      tone:
        "bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300",
      icon: Boxes,
      onClick: () =>
        setTab(
          "overall-inventory",
        ),
    },
    {
      label: "In Store Quantity",
      value: inStoreQuantity,
      cost: inStoreCost,
      tone:
        "bg-success/10 text-success",
      icon: Boxes,
      onClick: () =>
        setTab("overall"),
    },
    {
      label: "Project Inventory Quantity",
      value: projectInventoryPoRaisedStats.quantity,
      cost: projectInventoryPoRaisedStats.cost,
      tone:
        "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300",
      icon: Boxes,
      onClick: () =>
        setTab(
          "project-inventory",
        ),
    },
    {
      label: "In Drone",
      value: inDroneQuantity,
      cost: inDroneCost,
      tone:
        "bg-primary/10 text-primary",
      icon: Plane,
      onClick: () =>
        setTab("in-drone"),
    },
    {
      label: "Scrap Items",
      value: scrapCount,
      cost: scrapCost,
      tone:
        "bg-destructive/10 text-destructive",
      icon: Trash2,
      onClick: () => {
        setSelectedOutwardTab(
          "scrap",
        );
        setTab("scrap");
      },
    },
  ];

  const getOverallInventoryRows =
    () => {
      const rows = [];

      (
        Array.isArray(qcInventory)
          ? qcInventory
          : []
      ).forEach((item, index) => {
        const sourceMrNumber =
          String(
            item?.source_mr_number ||
              item?.sourceMrNumber ||
              "",
          ).trim();

        const inventoryScope =
          String(
            item?.inventory_scope ||
              item?.inventoryScope ||
              "",
          )
            .trim()
            .toLowerCase();

        if (
          sourceMrNumber ||
          inventoryScope ===
            "project"
        ) {
          return;
        }

        const quantity =
          getInventoryRowQuantity(
            item,
          );

        if (quantity <= 0) return;

        const totalCost =
          getInventoryRowTotalCost(
            item,
          );

        rows.push({
          id:
            `overall-store-${item?.id ?? index}`,
          location: "In Store",
          component:
            resolveInventoryComponentName(
              item,
              components,
            ) ||
            item?.component ||
            item?.component_name ||
            item?.name ||
            "-",
          componentCode:
            resolveInventoryComponentCode(
              item,
              components,
            ) ||
            item?.component_code ||
            item?.code ||
            "-",
          category:
            resolveInventoryCategory(
              item,
              components,
            ) ||
            "-",
          categoryValues: [
            resolveInventoryCategory(
              item,
              components,
            ),
          ].filter(
            (value) =>
              value &&
              value !== "-",
          ),
          specifications:
            item?.specifications ||
            item?.specification ||
            "-",
          quantity,
          unitCost:
            quantity > 0
              ? totalCost /
                quantity
              : 0,
          totalCost,
          project: "-",
          mrNumber: "-",
          status:
            item?.status ||
            "Available",
          usageBreakdown: "-",
          serials:
            getSerialsFromInventoryItem(
              item,
            ).join(", "),
          date:
            item?.date ||
            item?.received_date ||
            "",
          raw: item,
        });
      });

      (
        Array.isArray(projectInventory)
          ? projectInventory
          : []
      ).forEach((item, index) => {
        const quantity =
          getProjectRemainingPurchasedQuantity(
            item,
          );

        if (quantity <= 0) return;

        const unitCost =
          getProjectRowUnitCost(
            item,
          );

        rows.push({
          id:
            `overall-project-${item?.id ?? index}`,
          location:
            "Project Inventory",
          component:
            resolveInventoryComponentName(
              item,
              components,
            ) ||
            item?.component ||
            item?.component_name ||
            "-",
          componentCode:
            resolveInventoryComponentCode(
              item,
              components,
            ) ||
            item?.component_code ||
            "-",
          category:
            resolveInventoryCategory(
              item,
              components,
            ) ||
            "-",
          categoryValues: [
            resolveInventoryCategory(
              item,
              components,
            ),
          ].filter(
            (value) =>
              value &&
              value !== "-",
          ),
          specifications:
            item?.specifications ||
            item?.specification ||
            "-",
          quantity,
          unitCost,
          totalCost:
            unitCost *
            quantity,
          project:
            item?.project_name ||
            item?.project ||
            item?.projectName ||
            "-",
          mrNumber:
            item?.source_mr_number ||
            item?.sourceMrNumber ||
            item?.material_request_id ||
            "-",
          status:
            item?.status ||
            "Project Inventory",
          usageBreakdown: "-",
          serials:
            getProjectPurchasedSerialsFromRow(
              item,
            ).join(", "),
          date:
            item?.received_date ||
            item?.date ||
            "",
          raw: item,
        });
      });

      (
        Array.isArray(approvedRequests)
          ? approvedRequests
          : []
      ).forEach((item, index) => {
        const quantity =
          getInDroneOwnedQuantity(
            item,
          );

        if (quantity <= 0) return;

        const totalCost =
          getInDroneRowCurrentCost(
            item,
          );

        const flightQty =
          getInDroneUsageQuantity(
            item,
            "FLIGHT_TEST",
          );

        const eventQty =
          getInDroneUsageQuantity(
            item,
            "EVENT",
          );

        const demoQty =
          getInDroneUsageQuantity(
            item,
            "CUSTOMER_DEMO",
          );

        const usedQuantity =
          flightQty +
          eventQty +
          demoQty;

        const normalInDroneQty =
          Math.max(
            quantity -
              usedQuantity,
            0,
          );

        const projectRows =
          getRequestProjectRows(
            item,
          );

        const componentNames =
          Array.from(
            new Set(
              projectRows
                .map(
                  (row) =>
                    resolveInventoryComponentName(
                      row,
                      components,
                    ) ||
                    row?.component_name ||
                    row?.component ||
                    "",
                )
                .filter(Boolean),
            ),
          );

        const componentCodes =
          Array.from(
            new Set(
              projectRows
                .map(
                  (row) =>
                    resolveInventoryComponentCode(
                      row,
                      components,
                    ) ||
                    row?.component_code ||
                    "",
                )
                .filter(Boolean),
            ),
          );

        /*
         * Overall Inventory previously hard-coded In Drone category as "-".
         * Resolve the category from each ProjectInventory component row and
         * then from Component master when the row itself has no category.
         */
        const componentCategories =
          Array.from(
            new Set(
              projectRows
                .map((row) =>
                  resolveInventoryCategory(
                    row,
                    components,
                  ),
                )
                .map((value) =>
                  String(
                    value || "",
                  ).trim(),
                )
                .filter(
                  (value) =>
                    value &&
                    value !== "-",
                ),
            ),
          );

        /*
         * Older/legacy In Drone rows may not have a matching
         * ProjectInventory row. Try the request itself as a final fallback.
         */
        if (
          componentCategories.length ===
          0
        ) {
          const requestCategory =
            resolveInventoryCategory(
              item,
              components,
            );

          if (
            requestCategory &&
            requestCategory !== "-"
          ) {
            componentCategories.push(
              requestCategory,
            );
          }
        }

        const usageParts = [
          normalInDroneQty > 0
            ? `In Drone: ${normalInDroneQty}`
            : "",
          flightQty > 0
            ? `Flight Test: ${flightQty}`
            : "",
          eventQty > 0
            ? `Event: ${eventQty}`
            : "",
          demoQty > 0
            ? `Demo/Trials: ${demoQty}`
            : "",
        ].filter(Boolean);

        rows.push({
          id:
            `overall-drone-${item?.id ?? index}`,
          location: "In Drone",
          component:
            componentNames.join(
              ", ",
            ) ||
            getRequestComponentDisplay(
              item,
            ) ||
            "Drone / Components",
          componentCode:
            componentCodes.join(
              ", ",
            ) ||
            "-",
          category:
            componentCategories.join(
              ", ",
            ) || "-",
          categoryValues:
            componentCategories,
          specifications: "-",
          quantity,
          unitCost:
            quantity > 0
              ? totalCost /
                quantity
              : 0,
          totalCost,
          project:
            item?.project_name ||
            item?.project ||
            item?.projectName ||
            "-",
          mrNumber:
            item?.material_request_id ||
            item?.request_id ||
            item?.mr_id ||
            item?.id ||
            "-",
          status:
            "Company Inventory",
          usageBreakdown:
            usageParts.join(" | ") ||
            `In Drone: ${quantity}`,
          serials:
            [
              ...getRequestSerialsBySource(
                item,
                "STORE",
              ),
              ...getRequestSerialsBySource(
                item,
                "PURCHASED",
              ),
            ].join(", "),
          date:
            item?.date ||
            item?.required_date ||
            "",
          raw: item,
        });
      });

      return rows;
    };

  const overallInventoryRows =
    useMemo(
      () =>
        getOverallInventoryRows(),
      [
        qcInventory,
        projectInventory,
        approvedRequests,
        components,
        issuedInventoryMetadata,
      ],
    );

  const visibleOverallInventory =
    useMemo(() => {
      let rows =
        overallInventoryRows;

      if (
        selectedCategory !==
        "All"
      ) {
        rows = rows.filter(
          (row) => {
            const categoryValues =
              Array.isArray(
                row?.categoryValues,
              ) &&
              row.categoryValues.length
                ? row.categoryValues
                : String(
                    row?.category || "",
                  )
                    .split(",")
                    .map((value) =>
                      value.trim(),
                    )
                    .filter(Boolean);

            return categoryValues.some(
              (value) =>
                String(value)
                  .trim()
                  .toUpperCase() ===
                selectedCategory,
            );
          },
        );
      }

      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return rows;
      }

      return rows.filter((row) =>
        [
          row.location,
          row.component,
          row.componentCode,
          row.category,
          row.specifications,
          row.project,
          row.mrNumber,
          row.status,
          row.usageBreakdown,
          row.serials,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value)
              .toLowerCase()
              .includes(query),
          ),
      );
    }, [
      overallInventoryRows,
      search,
      selectedCategory,
    ]);

  const overallBreakdown = [
    {
      label: "In Store",
      quantity:
        inStoreQuantity,
      cost: inStoreCost,
    },
    {
      label:
        "Project Inventory",
      quantity:
        projectInventoryQuantity,
      cost:
        projectInventoryCost,
    },
    {
      label: "In Drone",
      quantity:
        inDroneQuantity,
      cost: inDroneCost,
    },
    {
      label: "Flight Test",
      quantity:
        flightTestQuantity,
      cost: flightTestCost,
      isInDroneBreakdown: true,
    },
    {
      label: "Event",
      quantity:
        eventQuantity,
      cost: eventCost,
      isInDroneBreakdown: true,
    },
    {
      label: "Demo / Trials",
      quantity:
        demoQuantity,
      cost: demoCost,
      isInDroneBreakdown: true,
    },
  ];

  const escapeSpreadsheetValue = (
    value,
  ) =>
    String(
      value ?? "",
    )
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const downloadExcelWorkbook = (
    fileName,
    sheetName,
    columns,
    rows,
  ) => {
    const safeRows =
      Array.isArray(rows)
        ? rows
        : [];

    const worksheetRows = [
      columns
        .map(
          (column) =>
            `<Cell><Data ss:Type="String">${escapeSpreadsheetValue(
              column.header,
            )}</Data></Cell>`,
        )
        .join(""),
      ...safeRows.map((row) =>
        columns
          .map((column) => {
            const value =
              typeof column.value ===
              "function"
                ? column.value(row)
                : row?.[
                    column.value
                  ];

            const isNumber =
              column.type ===
                "Number" &&
              Number.isFinite(
                Number(value),
              );

            return (
              `<Cell><Data ss:Type="${
                isNumber
                  ? "Number"
                  : "String"
              }">` +
              `${escapeSpreadsheetValue(
                isNumber
                  ? Number(value)
                  : value,
              )}` +
              `</Data></Cell>`
            );
          })
          .join(""),
      ),
    ]
      .map(
        (cells) =>
          `<Row>${cells}</Row>`,
      )
      .join("");

    const workbook =
      `<?xml version="1.0"?>` +
      `<?mso-application progid="Excel.Sheet"?>` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
      `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
      `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
      `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
      `<Worksheet ss:Name="${escapeSpreadsheetValue(
        String(sheetName || "Inventory").slice(
          0,
          31,
        ),
      )}">` +
      `<Table>${worksheetRows}</Table>` +
      `</Worksheet></Workbook>`;

    const blob = new Blob(
      [workbook],
      {
        type:
          "application/vnd.ms-excel;charset=utf-8;",
      },
    );

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement(
        "a",
      );

    anchor.href = url;
    anchor.download =
      `${fileName}.xls`;

    document.body.appendChild(
      anchor,
    );

    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  };

  const inventoryExportColumns = [
    {
      header: "Location",
      value: "location",
    },
    {
      header: "Component ID",
      value: "componentCode",
    },
    {
      header: "Component",
      value: "component",
    },
    {
      header: "Category",
      value: "category",
    },
    {
      header: "Specification",
      value:
        "specifications",
    },
    {
      header: "Quantity",
      type: "Number",
      value: "quantity",
    },
    {
      header: "Unit Cost",
      type: "Number",
      value: "unitCost",
    },
    {
      header: "Total Cost",
      type: "Number",
      value: "totalCost",
    },
    {
      header: "Project",
      value: "project",
    },
    {
      header: "MR ID",
      value: "mrNumber",
    },
    {
      header:
        "Location / Usage Breakdown",
      value:
        "usageBreakdown",
    },
    {
      header: "Status",
      value: "status",
    },
    {
      header:
        "Serial Numbers",
      value: "serials",
    },
    {
      header: "Date",
      value: "date",
    },
  ];

  const getInStoreExportRows =
    () =>
      (
        Array.isArray(qcInventory)
          ? qcInventory
          : []
      )
        .filter((item) => {
          const sourceMrNumber =
            String(
              item?.source_mr_number ||
                item?.sourceMrNumber ||
                "",
            ).trim();

          const inventoryScope =
            String(
              item?.inventory_scope ||
                item?.inventoryScope ||
                "",
            )
              .trim()
              .toLowerCase();

          return (
            !sourceMrNumber &&
            inventoryScope !==
              "project"
          );
        })
        .map((item) => {
          const quantity =
            getInventoryRowQuantity(
              item,
            );

          const totalCost =
            getInventoryRowTotalCost(
              item,
            );

          return {
            location: "In Store",
            componentCode:
              resolveInventoryComponentCode(
                item,
                components,
              ) ||
              item?.component_code ||
              item?.code ||
              "-",
            component:
              resolveInventoryComponentName(
                item,
                components,
              ) ||
              item?.component ||
              item?.component_name ||
              "-",
            category:
              item?.category ||
              "-",
            specifications:
              item?.specifications ||
              item?.specification ||
              "-",
            quantity,
            unitCost:
              quantity > 0
                ? totalCost /
                  quantity
                : 0,
            totalCost,
            project: "-",
            mrNumber: "-",
            usageBreakdown:
              "In Store",
            status:
              item?.status ||
              "Available",
            serials:
              getSerialsFromInventoryItem(
                item,
              ).join(", "),
            date:
              item?.date ||
              item?.received_date ||
              "",
          };
        });

  const getInDroneExportRows =
    () =>
      overallInventoryRows.filter(
        (row) =>
          row.location ===
          "In Drone",
      );

  const getScrapExportRows =
    () =>
      (
        Array.isArray(outwardData)
          ? outwardData
          : []
      )
        .filter(
          (item) =>
            String(
              item?.type || "",
            )
              .trim()
              .toLowerCase() ===
              "scrap" &&
            !isQcFailedItem(item),
        )
        .map((item) => {
          const quantity =
            positiveNumber(
              item?.qty ??
                item?.quantity ??
                item?.noOfComponents ??
                item?.no_of_components ??
                1,
            );

          const costDetailsTotal =
            getCostDetailsTotal(item);

          const explicitTotal = [
            item?.total_cost,
            item?.totalCost,
            item?.total_price,
            item?.totalPrice,
            item?.amount,
          ]
            .map(safeNumber)
            .find(
              (value) =>
                value > 0,
            );

          const totalCost =
            costDetailsTotal ||
            explicitTotal ||
            quantity *
              getGenericRowUnitCost(
                item,
                quantity,
              );

          return {
            location: "Scrap",
            componentCode:
              item?.component_code ||
              item?.componentCode ||
              item?.code ||
              "-",
            component:
              item?.component ||
              item?.component_name ||
              item?.productName ||
              item?.product_name ||
              "-",
            category:
              item?.category ||
              "-",
            specifications:
              item?.specifications ||
              item?.specification ||
              "-",
            quantity,
            unitCost:
              quantity > 0
                ? totalCost /
                  quantity
                : 0,
            totalCost,
            project:
              item?.project ||
              item?.project_name ||
              "-",
            mrNumber:
              item?.material_request_id ||
              item?.material_request_number ||
              item?.mr_id ||
              "-",
            usageBreakdown:
              "Deducted from Overall Inventory",
            status:
              item?.status ||
              "Scrap",
            serials:
              getOutwardRowSerials(
                item,
              ).join(", "),
            date:
              item?.date ||
              item?.outDate ||
              item?.created_at ||
              "",
          };
        });

  const getProjectInventoryExportRows =
    () =>
      visibleProjectInventory.map((item) => {
        const quantity =
          getProjectRemainingPurchasedQuantity(
            item,
          );

        const unitCost =
          getProjectRowUnitCost(item);

        const componentMaster =
          findInventoryComponentMaster(
            item,
            components,
          );

        return {
          location: "Project Inventory",
          componentCode:
            resolveInventoryComponentCode(
              item,
              components,
            ) ||
            item?.component_code ||
            "-",
          component:
            resolveInventoryComponentName(
              item,
              components,
            ) ||
            item?.component_name ||
            item?.component ||
            "-",
          category:
            item?.category ||
            componentMaster?.category ||
            "-",
          specifications:
            item?.specifications ||
            componentMaster?.specifications ||
            "-",
          quantity,
          unitCost,
          totalCost:
            quantity * unitCost,
          project:
            item?.project ||
            item?.project_name ||
            "-",
          mrNumber:
            item?.source_mr_number ||
            item?.material_request_number ||
            item?.material_request_id ||
            "-",
          usageBreakdown:
            "Project Inventory",
          status:
            getProjectInventoryStatusInfo(
              item,
            ).label,
          serials:
            getProjectPurchasedSerialsFromRow(
              item,
            ).join(", "),
          date:
            item?.received_date ||
            item?.date ||
            "",
        };
      });

  const handleInventoryExcelDownload =
    () => {
      const date =
        new Date()
          .toISOString()
          .slice(0, 10);

      if (
        tab ===
        "overall-inventory"
      ) {
        downloadExcelWorkbook(
          `Overall_Inventory_${date}`,
          "Overall Inventory",
          inventoryExportColumns,
          overallInventoryRows,
        );
        return;
      }

      if (tab === "overall") {
        downloadExcelWorkbook(
          `In_Store_Inventory_${date}`,
          "In Store",
          inventoryExportColumns,
          getInStoreExportRows(),
        );
        return;
      }

      if (tab === "project-inventory") {
        downloadExcelWorkbook(
          `Project_Inventory_${date}`,
          "Project Inventory",
          inventoryExportColumns,
          getProjectInventoryExportRows(),
        );
        return;
      }

      if (tab === "in-drone") {
        downloadExcelWorkbook(
          `In_Drone_Inventory_${date}`,
          "In Drone",
          inventoryExportColumns,
          getInDroneExportRows(),
        );
        return;
      }

      if (
        tab === "scrap" &&
        selectedOutwardTab ===
          "scrap"
      ) {
        downloadExcelWorkbook(
          `Scrap_Inventory_${date}`,
          "Scrap Items",
          inventoryExportColumns,
          getScrapExportRows(),
        );
      }
    };

  const canDownloadCurrentInventory =
    tab === "overall-inventory" ||
    tab === "overall" ||
    tab === "project-inventory" ||
    tab === "in-drone" ||
    (
      tab === "scrap" &&
      selectedOutwardTab ===
        "scrap"
    );

    const getPurchaseHistoryForComponent = (component) => {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 24);
      const componentIds = new Set(
        [component?.id, component?.component_id, component?.code]
          .filter((value) => value !== undefined && value !== null)
          .map((value) => String(value).trim().toUpperCase()),
      );

      return purchaseOrders
        .flatMap((order) => {
          const orderDate = order?.po_date || order?.date || order?.created_at;
          const parsedDate = orderDate ? new Date(orderDate) : null;
          if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate < cutoff) {
            return [];
          }

          const vendor = order?.vendor_name || order?.vendor?.name || order?.vendor || "-";
          const mrId =
            order?.source_mr_number ||
            order?.material_request_id ||
            order?.request_id ||
            order?.mr_number ||
            "";
          const items = Array.isArray(order?.items) ? order.items : [];

          return items.flatMap((item) => {
            const itemComponent = item?.component;
            const itemIds = [
              typeof itemComponent === "object" ? itemComponent?.id : itemComponent,
              item?.component_id,
              item?.componentId,
              typeof itemComponent === "object" ? itemComponent?.component_id : "",
              item?.component_code,
              item?.code,
            ]
              .filter((value) => value !== undefined && value !== null)
              .map((value) => String(value).trim().toUpperCase());

            if (!itemIds.some((value) => componentIds.has(value))) return [];

            const unitPrice = Number(
              item?.unit_price ?? item?.unitPrice ?? item?.price ?? item?.total_price ?? 0,
            );
            return [{
              id: `${order?.id || order?.po_number}-${item?.id || itemIds.join("-")}`,
              date: parsedDate,
              poNumber: order?.po_number || order?.po || "-",
              reference: mrId ? `MR: ${mrId}` : "Direct PO",
              vendor,
              unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
              quantity: Number(item?.quantity || 0),
            }];
          });
        })
        .sort((left, right) => right.date - left.date);
    };

    const getSortedPurchaseHistoryForComponent = (component) => {
      const filters = purchaseHistoryModal.filters || {};
      const records = getPurchaseHistoryForComponent(component).filter((record) => {
        const values = {
          date: record.date.toLocaleDateString("en-IN"),
          poNumber: record.poNumber,
          reference: record.reference,
          vendor: record.vendor,
          quantity: record.quantity,
          unitPrice: record.unitPrice,
        };

        return Object.entries(filters).every(([key, value]) =>
          !value || String(values[key] ?? "").toLowerCase().includes(String(value).toLowerCase()),
        );
      });
      const { sortKey = "date", sortDirection = "desc" } = purchaseHistoryModal;
      const direction = sortDirection === "asc" ? 1 : -1;

      return records.sort((left, right) => {
        if (sortKey === "date") {
          return (left.date - right.date) * direction;
        }

        if (sortKey === "unitPrice") {
          return (left.unitPrice - right.unitPrice) * direction;
        }

        if (sortKey === "quantity") {
          return (left.quantity - right.quantity) * direction;
        }

        return String(left[sortKey] || "").localeCompare(String(right[sortKey] || "")) * direction;
      });
    };

    const togglePurchaseHistorySort = (sortKey) => {
      setPurchaseHistoryModal((previous) => ({
        ...previous,
        sortKey,
        sortDirection:
          previous.sortKey === sortKey && previous.sortDirection === "asc"
            ? "desc"
            : "asc",
      }));
    };

const getNextInventoryCode = (value, usedCodes = []) => {
  const rawCode = String(value || "").trim().toUpperCase();
  const numberPart = rawCode.replace(/\D/g, "");
  let nextNumber = Number(numberPart || 0);

  if (nextNumber === 0) {
    nextNumber = 1;
  }

  const usedSet = new Set(usedCodes.map((code) => String(code || "").trim().toUpperCase()));
  let nextCode = `INV-${String(nextNumber).padStart(5, "0")}`;

  while (usedSet.has(nextCode)) {
    nextNumber += 1;
    nextCode = `INV-${String(nextNumber).padStart(5, "0")}`;
  }

  return nextCode;
};

const getExistingInventoryCodes = () => {
  return qcInventory
    .flatMap((item) => [item.inventory_code, item.code, item.serialNumber, item.inward_code, item.grn])
    .filter(Boolean)
    .map((code) => String(code).trim().toUpperCase());
};

const generateInventoryCode = async () => {
  setGeneratedInventoryCode("");

  const existingCodes = getExistingInventoryCodes();

  try {
    const response = await fetchAuthenticatedJson(
      `${config.baseURL}/inventory/inventory/next-code/`
    );

    setGeneratedInventoryCode(
      getNextInventoryCode(response?.inventory_code || "INV-00001", existingCodes),
    );
  } catch (err) {
    console.error(err);
    setGeneratedInventoryCode(getNextInventoryCode("INV-00001", existingCodes));
  }
};


 const handleSaveInventory = async (event) => {
  event.preventDefault();

  if (
    !canManageInventory ||
    inventorySubmitLockRef.current
  ) {
    return;
  }

  const selectedComponent =
    components.find(
      (component) =>
        String(component.id) ===
        String(newInventory.component),
    );

  if (!selectedComponent) {
    alert("Please select a Component.");
    return;
  }

  /*
   * Only Component is mandatory.
   *
   * If Qty is left empty, save one unit by default.
   * All other Add Stock fields are optional.
   */
  const qty = Math.max(
    1,
    Number(newInventory.qty) || 1,
  );

  const cost = calculateInventoryStockCost({
    ...newInventory,
    qty,
  });

  const unitPrice = cost.unitPrice;
  const totalPrice = cost.grandTotal;

  const uniqueInventoryCode =
    generatedInventoryCode &&
    generatedInventoryCode !== "INV-00001"
      ? generatedInventoryCode
      : `INV-${Date.now()}`;

  const payload = {
    inventory_code:
      uniqueInventoryCode,
    component: Number(
      newInventory.component,
    ),

    // Component snapshot fields.
    specifications:
      newInventory.specifications ||
      selectedComponent.specifications ||
      "",
    category:
      newInventory.category ||
      selectedComponent.category ||
      "",
    component_type:
      newInventory.componentType ||
      selectedComponent.component_type ||
      "",
    /*
     * UOM is intentionally manual.
     * Never copy Component.unit_of_measurements here.
     */
    uom: newInventory.uom || "",

    vendor: newInventory.vendor || "",
    purchase_order:
      newInventory.po || "",
    quantity: qty,
    unit_price: unitPrice,

    discount: cost.discount,
    gst_percentage: cost.gstPercent,
    gst_amount: cost.gstAmount,
    freight_cost: cost.freightCost,
    freight_gst_percentage:
      cost.freightGstPercent,
    freight_gst_amount:
      cost.freightGstAmount,
    round_off: cost.roundOff,

    received_date:
      newInventory.date || null,
    total_price: totalPrice,

    // Leave serial generation to the backend so each stock receipt gets
    // stable unique CINV serials and immediate Cost Details.
    serial_numbers: [],
  };

  const updatePurchaseHistoryFilter = (key, value) => {
    setPurchaseHistoryModal((previous) => ({
      ...previous,
      filters: {
        ...(previous.filters || {}),
        [key]: value,
      },
    }));
  };

  inventorySubmitLockRef.current = true;
  setSavingInventory(true);

  /*
   * Do not allow Save to remain in "Saving..." forever.
   * 30 seconds is more than enough for one Inventory POST.
   */
  const saveController =
    new AbortController();

  const saveTimeout = window.setTimeout(
    () => {
      saveController.abort();
    },
    30000,
  );

  try {
    const savedStock =
      await fetchAuthenticatedJson(
        `${config.baseURL}/inventory/inventory/`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          signal: saveController.signal,
        },
      );

    /*
     * IMPORTANT:
     * The old code waited for loadInventoryData() here.
     * That function also reloads Vendors, Components and Purchase
     * Orders. If one unrelated endpoint is slow/401, the modal stays
     * on "Saving..." even though the Inventory POST already succeeded.
     *
     * Close the modal immediately after the successful POST and refresh
     * Inventory in the background.
     */
    setTab("overall");
    setNewInventory(
      emptyInventoryItem,
    );
    setShowNewInventory(false);
    setSuccessMessage(
      "Stock added to In Store successfully.",
    );

    inventorySubmitLockRef.current = false;
    setSavingInventory(false);

    loadInventoryData().catch(
      (refreshError) => {
        console.warn(
          "Stock was saved, but the Inventory screen refresh failed:",
          refreshError,
        );
      },
    );

    window.dispatchEvent(
      new CustomEvent(
        "inventory:changed",
        {
          detail: {
            type: "created",
            quantity: qty,
            stock: savedStock || null,
          },
        },
      ),
    );

    window.setTimeout(() => {
      setSuccessMessage("");
    }, 3000);
  } catch (error) {
    console.error(
      "Unable to save inventory item:",
      error,
    );

    const aborted =
      error?.name === "AbortError";

    alert(
      aborted
        ? (
            "Inventory save request timed out after 30 seconds. " +
            "Please check the Django terminal / Network tab before retrying."
          )
        : getReadableApiError(
            error,
            "Unable to save the inventory item.",
          ),
    );
  } finally {
    window.clearTimeout(
      saveTimeout,
    );

    inventorySubmitLockRef.current = false;
    setSavingInventory(false);
  }
};

const addOutwardComponentRow = () => {
  if (!canManageInventory) {
    return;
  }

  setNewScrap((prev) => ({
    ...prev,
    items: [
      ...(prev.items || []),
      createEmptyOutwardItem(),
    ],
  }));
};

const parseEventComponentInstances = (rawValue, componentCount = 0, defaultChecked = false) => {
  const normalizeItem = (item, index) => {
    let label = "";
    let qty = 1;
    let remarks = "";

    if (typeof item === "string") {
      const trimmed = item.trim();
      const match = trimmed.match(/^(.*?)(?:\s*\((\d+)\)|\s*(?:x|×)\s*(\d+))?$/i);
      label = match?.[1]?.trim() || trimmed;
      qty = Number(match?.[2] || match?.[3] || 1);
    } else if (typeof item === "object" && item !== null) {
      label = String(item.component || item.label || item.name || item.productName || item.product_name || "").trim();
      qty = Math.max(1, Number(item.qty || item.quantity || 1));
      remarks = String(item.remarks || item.note || "").trim();
      const checkedValue = typeof item.checked === "boolean" ? item.checked : defaultChecked;

      if (!label) {
        label = `Component ${index + 1}`;
      }

      return Array.from({ length: Math.max(1, qty) }, (_, idx) => {
        const numberedLabel = qty > 1 ? `${label} ${idx + 1}` : label;
        return {
          id: `event-component-${index}-${idx}-${String(numberedLabel).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`,
          label: numberedLabel,
          checked: checkedValue,
          remarks: remarks,
        };
      });
    } else {
      label = String(item || "").trim();
    }

    if (!label) {
      label = `Component ${index + 1}`;
    }

    return Array.from({ length: Math.max(1, qty) }, (_, idx) => {
      const numberedLabel = qty > 1 ? `${label} ${idx + 1}` : label;
      return {
        id: `event-component-${index}-${idx}-${String(numberedLabel).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`,
        label: numberedLabel,
        checked: defaultChecked,
        remarks: remarks,
      };
    });
  };

  const items = [];

  if (Array.isArray(rawValue) && rawValue.length) {
    rawValue.forEach((item, index) => {
      items.push(...normalizeItem(item, index));
    });
  } else if (typeof rawValue === "string" && rawValue.trim()) {
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed) && parsed.length) {
        parsed.forEach((item, index) => {
          items.push(...normalizeItem(item, index));
        });
      }
    } catch (err) {
      const tokens = rawValue
        .split(/[,;|]/)
        .map((item) => item.trim())
        .filter(Boolean);

      tokens.forEach((token, index) => {
        items.push(...normalizeItem(token, index));
      });
    }
  }

  if (items.length) {
    return items;
  }

  return Array.from({ length: Math.max(0, Number(componentCount) || 0) }, (_, index) => normalizeItem(`Component ${index + 1}`, index)).flat();
};

const groupComponentInstances = (instances) => {
  if (!Array.isArray(instances) || !instances.length) return [];

  const groups = instances.reduce((acc, instance) => {
    const rawLabel = String(instance.label || instance.component || "").trim();
    const baseLabel = rawLabel.replace(/\s*\d+$/g, "").trim() || rawLabel;
    const key = baseLabel.toUpperCase();
    acc[key] = acc[key] || { label: baseLabel, count: 0 };
    acc[key].count += 1;
    return acc;
  }, {});

  return Object.values(groups).map((group) =>
    group.count > 1 ? `${group.label} (${group.count})` : group.label,
  );
};

const getOutwardRowSerials = (row) => {
  if (!row) return [];

  const allocations = Array.isArray(
    row.inventoryAllocations || row.inventory_allocations,
  )
    ? row.inventoryAllocations || row.inventory_allocations
    : [];

  return Array.from(
    new Set([
      ...splitInventorySerials(
        row.serialNumbers || row.serial_numbers,
      ),
      ...allocations.flatMap((allocation) =>
        splitInventorySerials(
          allocation?.serial_numbers ||
            allocation?.serialNumbers,
        ),
      ),
    ]),
  );
};

const openEventComponentsModal = (row) => {
  const componentInstances = parseEventComponentInstances(
    row.eventComponents || row.event_components || row.deliverables || row.productName || row.component,
    row.noOfComponents || row.no_of_components || row.qty || 0,
    Boolean(row.returned || row.is_returned || String(row.status || "").trim().toUpperCase() === "RETURNED"),
  );

  setEventComponentModal({
    open: true,
    row: {
      ...row,
      detailSerials: getOutwardRowSerials(row),
    },
    componentInstances,
  });
};

const closeEventComponentsModal = () => {
  setEventComponentModal({
    open: false,
    row: null,
    componentInstances: [],
  });
};

const openEventActionModal = (row) => {
  const componentInstances = parseEventComponentInstances(
    row.eventComponents || row.event_components || row.deliverables || row.productName || row.component,
    row.noOfComponents || row.no_of_components || row.qty || 0,
    Boolean(row.returned || row.is_returned || String(row.status || "").trim().toUpperCase() === "RETURNED"),
  );

  const allReturned = componentInstances.every(
    (instance) => instance.checked || String(instance.remarks || "").trim().length > 0,
  );

  setEventActionModal({
    open: true,
    row,
    attendeeName: row.attendeeName || row.attendee_name || "",
    droneName: row.droneName || row.drone_name || "",
    noOfComponents: row.noOfComponents || row.no_of_components || row.qty || "",
    returned: allReturned,
    componentInstances,
  });
};

const closeEventActionModal = () => {
  setEventActionModal({
    open: false,
    row: null,
    droneName: "",
    attendeeName: "",
    noOfComponents: "",
    returned: false,
    componentInstances: [],
  });
};

const handleSaveEventAction = async () => {
  if (!canManageInventory) {
    return;
  }

  const row = eventActionModal.row;
  if (!row) return;

  const noOfComponentsValue = Math.max(
    Number(
      eventActionModal.noOfComponents ||
        row.noOfComponents ||
        row.no_of_components ||
        row.qty ||
        1,
    ) || 1,
    1,
  );
  const droneName = String(
    eventActionModal.droneName || "",
  ).trim();
  const attendeeName = String(
    eventActionModal.attendeeName || "",
  ).trim();
  const returnDate =
    eventActionModal.row?.returnDate ||
    eventActionModal.row?.return_date ||
    row.returnDate ||
    row.return_date ||
    "";

  const componentInstances = eventActionModal.componentInstances.length
    ? eventActionModal.componentInstances
    : parseEventComponentInstances(
        row.eventComponents ||
          row.event_components ||
          row.deliverables ||
          row.productName ||
          row.component,
        noOfComponentsValue,
      );

  const eventComponents = JSON.stringify(
    componentInstances.map((instance) => ({
      component: instance.label,
      qty: 1,
      checked: Boolean(instance.checked),
      remarks: instance.remarks || "",
    })),
  );

  // Checked means returned in good condition and must go back to In Store.
  const returnedGoodQuantity = componentInstances.filter(
    (instance) => Boolean(instance.checked),
  ).length;

  // Every unchecked row requires remarks such as Damaged or Not Returned.
  const returnProcessed = componentInstances.every(
    (instance) =>
      instance.checked ||
      String(instance.remarks || "").trim().length > 0,
  );

  const itemId = String(
    row.backendId ?? row.id ?? "",
  );
  const isManual =
    !itemId ||
    itemId.startsWith("manual") ||
    itemId.startsWith("qc-failed");

  const movementStatus =
    returnedGoodQuantity >= noOfComponentsValue
      ? "RETURNED"
      : returnProcessed && returnedGoodQuantity > 0
      ? "PARTIALLY_RETURNED"
      : returnProcessed
      ? "CLOSED_NOT_RETURNED"
      : returnedGoodQuantity > 0
      ? "PARTIALLY_RETURNED"
      : "EVENT_OUT";

  const localUpdatedRow = {
    ...row,
    droneName,
    drone_name: droneName,
    attendeeName,
    attendee_name: attendeeName,
    eventComponents,
    event_components: eventComponents,
    noOfComponents: noOfComponentsValue,
    no_of_components: noOfComponentsValue,
    returnedQuantity: returnedGoodQuantity,
    returned_quantity: returnedGoodQuantity,
    returned: returnProcessed,
    is_returned: returnProcessed,
    actionStatus: movementStatus,
    status: movementStatus,
    returnDate,
    return_date: returnDate,
  };

  if (isManual) {
    setOutwardData((previous) =>
      previous.map((item) =>
        String(item.id) === String(row.id)
          ? localUpdatedRow
          : item,
      ),
    );

    const updatedScrapEntries = scrapEntries.map((item) =>
      String(item.id) === String(row.id)
        ? localUpdatedRow
        : item,
    );
    setScrapEntries(updatedScrapEntries);
    persistScrapEntries(updatedScrapEntries);
    closeEventActionModal();
    return;
  }

  try {
    const payload = {
      drone_name: droneName,
      attendee_name: attendeeName,
      event_components: eventComponents,
      returned_quantity: returnedGoodQuantity,
      is_returned: returnProcessed,
    };

    if (String(returnDate).trim()) {
      payload.return_date = returnDate;
    } else {
      payload.return_date = null;
    }

    const updated = await fetchAuthenticatedJson(
      `${config.baseURL}/outward/${encodeURIComponent(itemId)}/`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );

    const normalizedUpdated = normalizeOutwardItem(updated);
    setOutwardData((previous) =>
      previous.map((item) =>
        String(item.id) === String(row.id) ||
        String(item.backendId || "") === itemId
          ? normalizedUpdated
          : item,
      ),
    );

    await loadInventoryData();
    setSuccessMessage(
      returnedGoodQuantity > 0
        ? `${returnedGoodQuantity} returned item(s) restored to In Store.`
        : "Event return details saved.",
    );
    window.setTimeout(() => setSuccessMessage(""), 3000);
    closeEventActionModal();
  } catch (error) {
    console.error("Unable to save Event return:", error);
    alert(
      error?.message ||
        "Unable to save the Event return. No Inventory stock was changed.",
    );
  }
};

const updateOutwardComponentRow = (index, field, value) => {
  if (!canManageInventory) {
    return;
  }

  setNewScrap((prev) => {
    const rows = [
      ...(prev.items || [createEmptyOutwardItem()]),
    ];

    if (field === "itemType") {
      rows[index] = {
        ...rows[index],
        itemType: value,
        component: "",
        droneName: "",
        qty: 1,
        selectedSerials: [],
      };
    } else if (field === "component") {
      rows[index] = {
        ...rows[index],
        component: value,
        selectedSerials: [],
      };
    } else if (field === "qty") {
      const nextQuantity = Math.max(Number(value) || 0, 0);
      rows[index] = {
        ...rows[index],
        qty: value,
        selectedSerials: Array.isArray(rows[index].selectedSerials)
          ? rows[index].selectedSerials.slice(0, nextQuantity)
          : [],
      };
    } else {
      rows[index] = {
        ...rows[index],
        [field]: value,
      };
    }

    return { ...prev, items: rows };
  });
};

const removeOutwardComponentRow = (index) => {
  if (!canManageInventory) {
    return;
  }

  setNewScrap((prev) => {
    const rows = (prev.items || []).filter(
      (_, itemIndex) => itemIndex !== index,
    );

    return {
      ...prev,
      items: rows.length
        ? rows
        : [createEmptyOutwardItem()],
    };
  });
};


    const getScrapRequesterName = () => {
      const rawName =
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
          .trim() ||
        "";

      const normalized =
        String(rawName || "").trim();

      if (!normalized) {
        return "User";
      }

      // Never store/display an email as the requester name.
      if (normalized.includes("@")) {
        return (
          normalized.split("@")[0]?.trim() ||
          "User"
        );
      }

      return normalized;
    };


    const handleSaveScrap = async (event) => {
    event.preventDefault();

    if (
      !canManageInventory ||
      outwardSubmitLockRef.current
    ) {
      return;
    }

    const rawType = newScrap.typeOfOutward || "Scrap";
    const type = normalizeOutwardType(rawType);
    const backendOutwardType = getBackendOutwardType(type);
    const isSalesOrEvent = type === "sales" || type === "event";

    const typeLabel =
      type === "failedQc"
        ? "Failed QC"
        : type === "sales"
        ? "Sales"
        : type === "event"
        ? "Event"
        : "Scrap";

    const defaultRemarks =
      type === "failedQc"
        ? "QC Failed"
        : typeLabel === "Scrap"
        ? "Scrap"
        : "";
    const remarksValue =
      newScrap.reason?.trim() || defaultRemarks;

    let rows;

    if (isSalesOrEvent) {
      rows = (newScrap.items || []).map((row) => ({
        ...row,
        itemType: String(
          row.itemType || "COMPONENT",
        )
          .trim()
          .toUpperCase(),
      }));

      if (!rows.length) {
        alert("Please add at least one Component or Drone.");
        return;
      }

      for (const row of rows) {
        const quantity = Math.max(
          Number(row.qty) || 0,
          0,
        );

        if (quantity <= 0) {
          alert("Quantity must be greater than zero.");
          return;
        }

        if (
          row.itemType === "COMPONENT" &&
          !String(row.component || "").trim()
        ) {
          alert("Please select an In-Store component.");
          return;
        }

        if (
          row.itemType === "DRONE" &&
          !String(row.droneName || "").trim()
        ) {
          alert("Please enter the drone name.");
          return;
        }

        if (row.itemType === "COMPONENT") {
          const selectedSerials = Array.isArray(row.selectedSerials)
            ? row.selectedSerials
            : [];

          if (selectedSerials.length !== quantity) {
            alert(
              `Select exactly ${quantity} serial number(s) for the selected component.`,
            );
            return;
          }
        }
      }

      const requestedByComponent = new Map();
      rows
        .filter((row) => row.itemType === "COMPONENT")
        .forEach((row) => {
          const key = String(row.component);
          requestedByComponent.set(
            key,
            Number(requestedByComponent.get(key) || 0) +
              Number(row.qty || 0),
          );
        });

      for (const [componentId, requestedQuantity] of requestedByComponent) {
        const option = getOutwardInventoryComponentOption(componentId);
        const availableQuantity = Number(option?.availableQty || 0);

        if (requestedQuantity > availableQuantity) {
          alert(
            `${option?.label || "Selected component"} has only ` +
              `${availableQuantity} item(s) available in In Store.`,
          );
          return;
        }
      }
    } else {
      if (!String(newScrap.component || "").trim()) {
        alert("Please select a component.");
        return;
      }

      /*
       * Scrap must preserve the real Component FK.
       *
       * This is what makes the backend serializer return:
       * component_code + component_name
       * exactly like Engineer Scrap.
       */
      const selectedComponent =
        components.find(
          (component) =>
            String(
              component?.id ??
                component?.pk ??
                "",
            ) ===
              String(
                newScrap.component,
              ) ||
            String(
              component?.name ||
                component?.component_name ||
                "",
            ).trim() ===
              String(
                newScrap.component,
              ).trim(),
        ) || null;

      const componentDatabaseId =
        selectedComponent?.id ??
        selectedComponent?.pk ??
        null;

      const componentCode =
        String(
          selectedComponent
            ?.component_id ||
            selectedComponent
              ?.component_code ||
            selectedComponent?.code ||
            "",
        ).trim();

      const componentName =
        String(
          selectedComponent?.name ||
            selectedComponent
              ?.component_name ||
            (
              componentDatabaseId
                ? ""
                : newScrap.component
            ) ||
            "Unnamed Component",
        ).trim();

      const componentLabel =
        componentCode &&
        componentName
          ? `${componentCode} - ${componentName}`
          : componentName ||
            componentCode ||
            "Unnamed Component";

      rows = [
        {
          itemType:
            "COMPONENT",

          component:
            componentDatabaseId,

          componentName:
            componentLabel,

          qty:
            Math.max(
              Number(newScrap.qty) ||
                1,
              1,
            ),
        },
      ];
    }

    const commonPayload = {
      outward_type: backendOutwardType,

      /*
       * SCRAP approval status is owned by the backend:
       *
       * approval_status = PENDING_MANAGER
       * status          = PENDING_MANAGER
       *
       * Do not set approval/status from the browser.
       */
      out_date: newScrap.date || today,
      time: getCurrentTimeString(),
      invoice_number: newScrap.invoiceNumber || "",
      client: newScrap.client || "",
      deliverables: newScrap.deliverables || "",
      gate_pass: null,
      event_name: newScrap.eventName || "",
      return_date: newScrap.returnDate || null,
      attendee_name: newScrap.attendeeName || "",
      is_returned: false,
      remarks: remarksValue,
    };

    const payloadItems = rows.map((row) => {
      const quantity = Math.max(
        Number(row.qty) || 1,
        1,
      );
      const itemType = String(
        row.itemType || "COMPONENT",
      )
        .trim()
        .toUpperCase();

      if (itemType === "DRONE") {
        const droneName = String(
          row.droneName || "",
        ).trim();

        return {
          item_type: "DRONE",
          component: null,
          product_name: droneName,
          drone_name: droneName,
          quantity,
          no_of_components: quantity,
          event_components: JSON.stringify([
            {
              item_type: "DRONE",
              component: droneName,
              qty: quantity,
            },
          ]),
        };
      }

      if (isSalesOrEvent) {
        const option = getOutwardInventoryComponentOption(
          row.component,
        );

        return {
          item_type: "COMPONENT",
          component: option?.componentId || row.component,
          product_name: option?.label || "Selected Component",
          quantity,
          no_of_components: quantity,
          serial_numbers: Array.isArray(row.selectedSerials)
            ? row.selectedSerials
            : [],
          event_components: JSON.stringify([
            {
              item_type: "COMPONENT",
              component: option?.label || "Selected Component",
              qty: quantity,
            },
          ]),
        };
      }

      return {
        item_type: "COMPONENT",

        // Preserve the Component FK for Scrap.
        component:
          row.component ||
          null,

        // Keep the human-readable "ID - Name" label too.
        product_name:
          row.componentName ||
          newScrap.component ||
          "Unnamed Component",

        quantity,
        no_of_components: quantity,

        event_components:
          JSON.stringify([
            {
              item_type:
                "COMPONENT",
              component:
                row.componentName ||
                newScrap.component ||
                "Unnamed Component",
              qty: quantity,
            },
          ]),
      };
    });

    /*
     * All client-side validation is complete. Lock now so one click
     * can create only one backend Outward/Scrap request.
     */
    outwardSubmitLockRef.current = true;
    setSavingOutward(true);

    try {
      const createdEntries =
        await fetchAuthenticatedJson(
          `${config.baseURL}/outward/bulk-create/`,
          {
            method: "POST",
            body: JSON.stringify({
              ...commonPayload,
              items: payloadItems,
            }),
          },
        );

      /*
       * Scrap Manager-first notification/email is backend-owned.
       * Do not make a second notification POST from the browser.
       */
      if (type === "scrap") {
        window.dispatchEvent(
          new Event("notificationsUpdated"),
        );
      }

      /*
       * Give immediate UI feedback after the create POST succeeds.
       * Data refresh continues without keeping the modal/button blocked.
       */
      setNewScrap(emptyScrapItem);
      setShowNewScrap(false);
      setTab(
        type === "sales" || type === "event"
          ? type
          : "scrap",
      );

      void Promise.all([
        loadOutwardData(),
        loadInventoryData(),
      ]).catch((refreshError) => {
        console.warn(
          "Outward/Inventory background refresh failed:",
          refreshError,
        );
      });
      // setSuccessMessage(
      //   type === "sales"
      //     ? "Sales entry saved and component stock deducted."
      //     : type === "event"
      //     ? "Event entry saved and component stock moved out of In Store."
      //     : type === "scrap"
      //     ? "Scrap entry created. Status: Pending Manager."
      //     : "Outward entry saved.",
      // );
      window.setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      const errorMessage = getReadableApiError(
        error,
        "Unable to save the outward entry. No additional stock was changed.",
      );
      console.error("Unable to save outward items:", errorMessage, error);
      alert(errorMessage);
    } finally {
      outwardSubmitLockRef.current = false;
      setSavingOutward(false);
    }
  };

const handleEnableSelectionMode = () => {
  if (!canManageInventory) {
    return;
  }

  setSelectionMode(true);
  setSelectedRowKeys([]);
};

  const handleCancelSelectionMode = () => {
  setSelectionMode(false);
  setSelectedRowKeys([]);
};

const handleUpdateEventReturnDate = (row, value) => {
  if (!canManageInventory) {
    return;
  }

  /*
   * Keep the selected date in local state. It is saved together with the
   * Update Return action, so a component Event return uses one atomic PATCH
   * that restores stock and records the return date at the same time.
   */
  setOutwardData((previous) =>
    previous.map((item) =>
      String(item.id) === String(row.id) ||
      (
        item.backendId &&
        row.backendId &&
        String(item.backendId) === String(row.backendId)
      )
        ? {
            ...item,
            returnDate: value,
            return_date: value,
          }
        : item,
    ),
  );

  setEventActionModal((previous) => {
    if (
      !previous.open ||
      !previous.row ||
      (
        String(previous.row.id) !== String(row.id) &&
        String(previous.row.backendId || "") !==
          String(row.backendId || "")
      )
    ) {
      return previous;
    }

    return {
      ...previous,
      row: {
        ...previous.row,
        returnDate: value,
        return_date: value,
      },
    };
  });
};

const handleRemoveInventory = async (row) => {
  if (!canManageInventory) {
    return;
  }

  if (!row) return;

  const confirmed = window.confirm(
    `Delete ${
      row.component || "this inventory item"
    } permanently from Inventory and the backend?`,
  );

  if (!confirmed) return;

  try {
    await deleteInventoryRowFromBackend(row);

    removeInventoryRowsFromState(row);

    await loadInventoryData();

    setSuccessMessage(
      "Inventory item deleted from the backend successfully.",
    );

    window.dispatchEvent(
      new CustomEvent("inventory:changed", {
        detail: {
          type: "deleted",
          source: row.source,
        },
      }),
    );

    window.setTimeout(() => {
      setSuccessMessage("");
    }, 3000);
  } catch (err) {
    console.error(
      "Failed to delete Inventory backend record:",
      err,
    );

    alert(
      err?.message ||
        "The item was not deleted. Please check the backend response.",
    );
  }
};

const inputClass =
  "w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-700 outline-none transition-all duration-200 focus:border-[#E85D75] focus:ring-2 focus:ring-[#E85D75]/20";

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: "48px",
    height: "48px",
    borderRadius: "12px",
    border: state.isFocused
      ? "1px solid #E85D75"
      : "1px solid #CBD5E1",
    boxShadow: state.isFocused
      ? "0 0 0 3px rgba(232,93,117,.18)"
      : "none",
    backgroundColor: "#fff",
    "&:hover": {
      borderColor: "#E85D75",
    },
  }),

  valueContainer: (base) => ({
    ...base,
    height: "48px",
    padding: "0 14px",
  }),

  input: (base) => ({
    ...base,
    margin: 0,
    padding: 0,
  }),

  indicatorsContainer: (base) => ({
    ...base,
    height: "48px",
  }),

  placeholder: (base) => ({
    ...base,
    color: "#94A3B8",
    fontSize: "14px",
  }),

  singleValue: (base) => ({
    ...base,
    fontSize: "14px",
    color: "#334155",
  }),

  menu: (base) => ({
    ...base,
    borderRadius: "12px",
    overflow: "hidden",
    zIndex: 9999,
  }),
};

const getRowsForCurrentTab = () => {
  if (tab === "overall-inventory") return overallInventoryRows;
  if (tab === "overall") return qcInventory;
  if (tab === "project-inventory") return visibleProjectInventory;
  if (tab === "in-drone") return approvedRequests;
  if (tab === "returned") return returnedRequests;
  if (["sales", "event", "scrap"].includes(tab)) return visibleScrap;
  return [];
};
  const handleDeleteSelected = async () => {
    if (!canManageInventory) {
      return;
    }

    if (selectedRowKeys.length === 0) return;

    const currentRows = getRowsForCurrentTab();

    const selectedRows = selectedRowKeys
      .map((key) =>
        currentRows.find(
          (item) =>
            String(item.id) === String(key),
        ),
      )
      .filter(Boolean);

    if (selectedRows.length === 0) return;

    const confirmed = window.confirm(
      `Permanently delete ${selectedRows.length} selected record(s) from the page and backend?`,
    );

    if (!confirmed) return;

    try {
      if (tab === "overall-inventory") {
        for (const row of selectedRows) {
          const sourceRow =
            row?.raw || row;

          if (row?.location === "In Store") {
            await deleteInventoryRowFromBackend(
              sourceRow,
            );
            continue;
          }

          if (
            row?.location ===
            "Project Inventory"
          ) {
            const projectId =
              sourceRow?.id ||
              sourceRow?.pk;

            if (projectId) {
              await fetchAuthenticatedJson(
                `${config.baseURL}/inventory/project-inventory/${encodeURIComponent(
                  projectId,
                )}/`,
                { method: "DELETE" },
              );
            }
            continue;
          }

          if (row?.location === "In Drone") {
            const requestId =
              sourceRow?.id ||
              sourceRow?.request_id ||
              sourceRow?.material_request_id ||
              sourceRow?.mr_id;

            if (requestId) {
              await fetchAuthenticatedJson(
                `${config.baseURL}/materialrequest/material-requests/${encodeURIComponent(
                  requestId,
                )}/`,
                { method: "DELETE" },
              );
            }
          }
        }

        await Promise.all([
          loadInventoryData(),
          loadProjectInventoryData(),
          loadApprovedMaterialRequests(),
        ]);

        setSuccessMessage(
          `${selectedRows.length} Overall Inventory record(s) deleted successfully.`,
        );
      }

      if (tab === "project-inventory") {
        for (const row of selectedRows) {
          const projectId =
            row?.id || row?.pk;

          if (!projectId) continue;

          await fetchAuthenticatedJson(
            `${config.baseURL}/inventory/project-inventory/${encodeURIComponent(
              projectId,
            )}/`,
            { method: "DELETE" },
          );
        }

        await loadProjectInventoryData();

        setSuccessMessage(
          `${selectedRows.length} Project Inventory record(s) deleted successfully.`,
        );
      }

      if (tab === "overall") {
        /*
         * Delete every grouped backend record first.
         * The UI is updated only after every backend DELETE succeeds.
         */
        for (const row of selectedRows) {
          await deleteInventoryRowFromBackend(row);
        }

        removeInventoryRowsFromState(
          selectedRows,
        );

        await loadInventoryData();

        setSuccessMessage(
          `${selectedRows.length} inventory record(s) deleted from the backend successfully.`,
        );

        window.dispatchEvent(
          new CustomEvent("inventory:changed", {
            detail: {
              type: "deleted",
              count: selectedRows.length,
            },
          }),
        );
      }

      if (
        ["sales", "event", "scrap"].includes(
          tab,
        )
      ) {
        const selectedIds = new Set(
          selectedRows.map((row) =>
            String(row.id),
          ),
        );

        const backendRows = selectedRows.filter(
          (row) => {
            const id = String(row.id || "");

            return (
              id &&
              !id.startsWith("manual") &&
              !id.startsWith("qc-failed")
            );
          },
        );

        for (const row of backendRows) {
          await fetchAuthenticatedJson(
            `${config.baseURL}/outward/${encodeURIComponent(
              row.id,
            )}/`,
            {
              method: "DELETE",
            },
          );
        }

        setOutwardData((previous) =>
          previous.filter(
            (row) =>
              !selectedIds.has(String(row.id)),
          ),
        );

        const remainingScrapEntries =
          scrapEntries.filter(
            (row) =>
              !selectedIds.has(String(row.id)),
          );

        setScrapEntries(
          remainingScrapEntries,
        );
        persistScrapEntries(
          remainingScrapEntries,
        );
      }

      if (tab === "in-drone") {
        for (const row of selectedRows) {
          const id = String(
            row.id ||
              row.request_id ||
              row.requestId ||
              "",
          );

          if (!id) continue;

          await fetchAuthenticatedJson(
            `${config.baseURL}/materialrequest/material-requests/${encodeURIComponent(
              id,
            )}/`,
            {
              method: "DELETE",
            },
          );
        }

        await loadApprovedMaterialRequests();
      }

      setSelectionMode(false);
      setSelectedRowKeys([]);

      window.setTimeout(() => {
        setSuccessMessage("");
      }, 3000);
    } catch (err) {
      console.error(
        "Failed to delete selected backend records:",
        err,
      );

      /*
       * Do not hide failed rows locally. Reload the authoritative
       * backend state so the page remains consistent.
       */
      if (
        tab === "overall" ||
        tab === "overall-inventory"
      ) {
        await loadInventoryData().catch(
          () => undefined,
        );
      }

      alert(
        err?.message ||
          "One or more selected records could not be deleted from the backend.",
      );
    }
  };


  useEffect(() => {
    setSelectedRowKeys([]);
  }, [tab]);



  const inventoryPageCount = (rows) =>
    Math.max(
      1,
      Math.ceil(rows.length / INVENTORY_PAGE_SIZE),
    );

  const moveInventoryPage = (key, nextPage) => {
    setInventoryTablePages((previous) => ({
      ...previous,
      [key]: nextPage,
    }));
  };

  useEffect(() => {
    setInventoryTablePages((previous) => ({
      ...previous,
      overall: Math.min(
        previous.overall,
        inventoryPageCount(visibleOverallInventory),
      ),
      inStore: Math.min(
        previous.inStore,
        inventoryPageCount(visibleInventory),
      ),
      project: Math.min(
        previous.project,
        inventoryPageCount(visibleProjectInventory),
      ),
      outward: Math.min(
        previous.outward,
        inventoryPageCount(visibleScrap),
      ),
    }));
  }, [
    visibleOverallInventory.length,
    visibleInventory.length,
    visibleProjectInventory.length,
    visibleScrap.length,
  ]);

  if (costDetailsPage) return costDetailsPage;
  return (
    <PageShell>
      <PageHeader
        title="Inventory"
        subtitle="QC-approved stock, drone request approvals, and scrap management in one dashboard."
      />
      {successMessage && (
  <div
    className="fixed top-6 right-6 z-[9999] rounded-xl px-5 py-3 text-white shadow-lg"
    style={{
      backgroundColor: "#16A34A",
      minWidth: "280px",
    }}
  >
    {successMessage}
  </div>
)}

      {!canManageInventory && (
        <div className="mb-4 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          View-only access: you can view Inventory records and details, but only Admin, Procurement, and Inventory users can add, issue, return, edit, or delete Inventory data.
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative w-full xl:max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search inventory, component, category, MR, project..."
            className="w-full rounded-2xl border border-border bg-card py-3 pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {canDownloadCurrentInventory && (
            <button
              type="button"
              onClick={handleInventoryExcelDownload}
              disabled={initialPageLoading}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={
                initialPageLoading
                  ? "Please wait until Inventory loading completes"
                  : "Download the currently selected inventory view with cost details"
              }
            >
              <Download className="size-4" />
              Download Excel
            </button>
          )}

          <button
            type="button"
            onClick={() => setPurchaseHistoryModal({ open: true, component: null })}
            className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
            title="View component purchase history for the last 24 months"
          >
            <CalendarDays className="size-4" />
            Purchase History
          </button>

          {canManageInventory && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={
                    selectionMode
                      ? handleDeleteSelected
                      : handleEnableSelectionMode
                  }
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 disabled:opacity-50"
                  style={{
                    backgroundColor: "#E85D75",
                  }}
                  onMouseEnter={(event) =>
                    (event.currentTarget.style.backgroundColor =
                      "#D94D68")
                  }
                  onMouseLeave={(event) =>
                    (event.currentTarget.style.backgroundColor =
                      "#E85D75")
                  }
                  disabled={
                    selectionMode &&
                    selectedRowKeys.length === 0
                  }
                >
                  {selectionMode
                    ? `Delete Selected (${selectedRowKeys.length})`
                    : "Delete"}
                </button>

                {selectionMode && (
                  <button
                    type="button"
                    onClick={handleCancelSelectionMode}
                    className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <Link
                to="/component-requests"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                <Plus className="size-4" />
                Component Generation
              </Link>

              {[
                "overall-inventory",
                "overall",
                "project-inventory",
                "in-drone",
              ].includes(tab) && (
                <button
                  type="button"
                  onClick={() => {
                    setNewInventory(
                      emptyInventoryItem,
                    );
                    setShowNewInventory(true);
                    generateInventoryCode();
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  title="New stock is always saved into In Store and is automatically included in Overall Inventory"
                >
                  <Plus className="size-4" />
                  Add Stocks
                </button>
              )}

              {[
                "scrap",
                "sales",
                "event",
              ].includes(tab) && (
                <button
                  type="button"
                  onClick={() => {
                    setNewScrap({
                      ...emptyScrapItem,
                      date: today,
                      items: [
                        createEmptyOutwardItem(),
                      ],
                      typeOfOutward:
                        tab === "sales"
                          ? "Sales"
                          : tab === "event"
                            ? "Event"
                            : "Scrap",
                      reason:
                        activeOutwardType ===
                        "scrap"
                          ? "Scrap"
                          : "",
                    });
                    setShowNewScrap(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="size-4" />
                  {scrapModalConfig.actionLabel}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {inventoryStats.map((card) => {
          const Icon = card.icon;

          return (
            <button
              key={card.label}
              type="button"
              onClick={card.onClick}
              className={cn(
                "rounded-3xl border bg-card p-5 text-left shadow-sm transition-all",
                "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
                (
                  (card.label === "Overall Inventory" && tab === "overall-inventory") ||
                  (card.label === "In Store Quantity" && tab === "overall") ||
                  (card.label === "Project Inventory Quantity" && tab === "project-inventory") ||
                  (card.label === "In Drone" && tab === "in-drone") ||
                  (card.label === "Scrap Items" && tab === "scrap")
                )
                  ? "border-primary ring-2 ring-primary/10"
                  : "border-border",
              )}
            >
              <div
                className={cn(
                  "mb-4 inline-flex rounded-2xl p-3",
                  card.tone,
                )}
              >
                <Icon className="size-5" />
              </div>

              <div className="text-sm font-medium text-muted-foreground">
                {card.label}
              </div>

              <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Qty
                  </div>
                  <div className="text-3xl font-semibold tracking-tight text-foreground">
                    {card.value}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Cost
                  </div>
                  <div className="mt-1 text-base font-bold text-foreground">
                    {formatCurrency(card.cost)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>


      {!initialPageLoading && (
        <div className="mb-5 flex justify-end text-sm text-muted-foreground">
          {tab === "overall-inventory" &&
            `${visibleOverallInventory.length} active inventory location record(s)`}
          {tab === "overall" &&
            `${visibleInventory.length} item(s) in inventory`}
          {tab === "project-inventory" &&
            `${visibleProjectInventory.length} project inventory item(s)`}
          {tab === "in-drone" &&
            `${approvedRequests.length} approved drone request(s)`}
          {tab === "scrap" &&
            `${visibleScrap.length} ${
              selectedOutwardTab === "failedQc"
                ? "Failed QC"
                : "Scrap"
            } record(s)`}
        </div>
      )}

      {tab === "overall-inventory" && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-lg font-semibold text-foreground">
                  Overall Inventory
                </div>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                  Active company inventory only. In Store, Project Inventory and In Drone are included.
                  Flight Test, Event and Demo/Trials are shown as an In Drone breakdown and are not counted twice.
                  Approved Sales, Scrap and QC Failed are excluded from Overall Inventory.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {overallBreakdown.map((item) => (
              <div
                key={item.label}
                className={cn(
                  "rounded-2xl border border-border bg-card p-4 shadow-sm",
                  item.isInDroneBreakdown && "border-dashed bg-muted/20",
                )}
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-2 text-2xl font-bold text-foreground">
                  {item.quantity}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Cost:{" "}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(item.cost)}
                  </span>
                </div>
                {item.isInDroneBreakdown && (
                  <div className="mt-2 text-[10px] font-medium text-muted-foreground">
                    Included inside In Drone total
                  </div>
                )}
              </div>
            ))}
          </div>

          {(initialPageLoading || visibleOverallInventory.length > 0) ? (
            <div className="rounded-3xl border border-border bg-card p-0 shadow-sm">
              <DataTable
                columns={[
                  {
                    key: "location",
                    header: "Location",
                    render: (row) => (
                      <span className="inline-flex rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-semibold text-foreground">
                        {row.location}
                      </span>
                    ),
                  },
                  {
                    key: "specifications",
                    header: "Specification",
                    render: (row) => {
                      const sourceRow =
                        row?.raw || row;

                      const specification =
                        resolveInventorySpecifications(
                          sourceRow,
                          components,
                        ) ||
                        row?.specifications ||
                        "-";

                      return (
                        <button
                          type="button"
                          onClick={() =>
                            openOverallInventorySpecificationModal(
                              row,
                            )
                          }
                          className="max-w-[240px] text-left font-semibold text-primary underline-offset-2 hover:underline"
                          title="View component ID, specification, category and HSN"
                        >
                          {specification !== "-"
                            ? specification
                            : "View Details"}
                        </button>
                      );
                    },
                  },
                  {
                    key: "quantity",
                    header: "Qty",
                    className: "text-center",
                    render: (row) => (
                      <button
                        type="button"
                        onClick={() => {
                          const serials = Array.from(
                            new Set(
                              splitInventorySerials(
                                row?.serials || "",
                              ),
                            ),
                          );

                          setSerialModal({
                            open: true,
                            row,
                            serials,
                            selected: [],
                          });
                        }}
                        className="inline-flex min-w-[44px] items-center justify-center rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 font-bold text-primary transition hover:border-primary/40 hover:bg-primary/10 hover:underline"
                        title="Click to view serial numbers"
                      >
                        {row.quantity}
                      </button>
                    ),
                  },
                  {
                    key: "unitCost",
                    header: "Unit Cost",
                    className: "text-center",
                    render: (row) => (
                      <div className="w-full text-center font-medium text-foreground">
                        {formatCurrency(row.unitCost)}
                      </div>
                    ),
                  },
                  {
                    key: "totalCost",
                    header: "Total Cost",
                    className: "text-center",
                    render: (row) => (
                      <div className="w-full text-center font-bold text-foreground">
                        {formatCurrency(row.totalCost)}
                      </div>
                    ),
                  },
                  {
                    key: "serialPurchaseCosts",
                    header: "Cost Details",
                    className: "text-center",
                    disableColumnTools: true,
                    render: (row) => {
                      const sourceRow = row?.raw || row;
                      const location = String(row?.location || "")
                        .trim()
                        .toLowerCase();

                      const costDetailsType =
                        location === "project inventory"
                          ? "projectInventory"
                          : location === "in drone"
                            ? "inDrone"
                            : "inventory";

                      return (
                        <button
                          type="button"
                          className="serial-cost-component"
                          onClick={() =>
                            openCostDetails(
                              costDetailsType,
                              sourceRow,
                            )
                          }
                        >
                          View Details
                        </button>
                      );
                    },
                  },
                  {
                    key: "mrNumber",
                    header: "MR / Project",
                    filterValue: (row) => `${row.mrNumber || ""} ${row.project || ""}`,
                    sortValue: (row) => row.mrNumber || row.project || "",
                    render: (row) => (
                      <div className="min-w-[150px]">
                        <div>{row.mrNumber || "-"}</div>
                        {row.project && row.project !== "-" && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.project}
                          </div>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: "usageBreakdown",
                    header: "Current Usage",
                    render: (row) => (
                      <div className="max-w-[240px] whitespace-normal text-xs leading-5">
                        {row.usageBreakdown || row.status || "-"}
                      </div>
                    ),
                  },
                ]}
                rows={visibleOverallInventory}
                page={inventoryTablePages.overall}
                pageSize={INVENTORY_PAGE_SIZE}
                onFilteredRowCountChange={(count) =>
                  setInventoryTableCounts((previous) =>
                    previous.overall === count
                      ? previous
                      : { ...previous, overall: count },
                  )
                }
                loading={initialPageLoading}
                loadingTitle="Loading Overall Inventory..."
                loadingDescription="Fetching the latest inventory locations, quantities and cost details."
                enableColumnTools
                selectable={canManageInventory && selectionMode}
                selectedRowKeys={selectedRowKeys}
                onSelectedRowKeysChange={setSelectedRowKeys}
                keyField="id"
              />
              <PaginationControls
                page={inventoryTablePages.overall}
                totalCount={inventoryTableCounts.overall}
                pageSize={INVENTORY_PAGE_SIZE}
                hasPreviousPage={inventoryTablePages.overall > 1}
                hasNextPage={inventoryTablePages.overall < inventoryPageCount(visibleOverallInventory)}
                loading={initialPageLoading}
                onPrevious={() => moveInventoryPage("overall", Math.max(1, inventoryTablePages.overall - 1))}
                onNext={() => moveInventoryPage("overall", Math.min(inventoryPageCount(visibleOverallInventory), inventoryTablePages.overall + 1))}
              />
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No active Overall Inventory records found.
            </div>
          )}
        </div>
      )}

      {tab === "overall" && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  In Store Inventory
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Current physical component stock available in the In Store inventory.
                </p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>
                    Qty: <strong className="text-foreground">{inStoreQuantity}</strong>
                  </span>
                  <span>
                    Cost: <strong className="text-foreground">{formatCurrency(inStoreCost)}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {(initialPageLoading || visibleInventory.length > 0) ? (
<div className="rounded-3xl border border-border bg-card p-0 shadow-sm">              <DataTable
                columns={[...([
                 {
                   key: "component",
                   header: "Component",
                   render: (row) => row.component || row.component_name || row.name || row.productName || row.product_name || "-",
                 },
{
  key: "specifications",
  header: "Specification",
  render: (row) => {
    const specification =
      row.specifications ||
      row.specification ||
      row.component_specifications ||
      row.componentSpecification ||
      "-";

    return (
      <button
        type="button"
        onClick={() => openComponentSpecificationModal(row)}
        className="max-w-[240px] text-left text-primary underline-offset-2 hover:underline"
        title="View component details"
      >
        {specification}
      </button>
    );
  },
},
{
  key: "component_type",
  header: "Component Type",
  render: (row) => row.component_type || row.componentType || "-",
},
                  {
                    key: "qty",
                    header: "Qty",
                    render: (row) => (
                      <button
                        type="button"
                        onClick={() => openSerialsModal(row)}
                        className="inline-flex items-center justify-center rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary"
                      >
                        {row.qty ?? row.quantity ?? 1}
                      </button>
                    ),
                  },
                  {
                    key: "uom",
                    header: "UOM",
                    render: (row) =>
                      row.uom ||
                      row.unit_of_measurements ||
                      "-",
                  },
                  // { key: "po", header: "PO" },
                  { key: "date", header: "Received" },
                  {
                    key: "price",
                    header: "Unit Cost",
                    render: (row) => {
                      const unitCost = Number(
                        row.price ??
                          row.unit_price ??
                          0,
                      );

                      return formatCurrency(
                        unitCost,
                      );
                    },
                  },
                  {
  key: "totalPrice",
  header: "Amount",
  render: (row) => {
    const totalAmount =
      Number(row.totalPrice || row.total_price || 0) ||
      Number(row.price || 0) * Number(row.qty || row.quantity || 1);

    return `₹${totalAmount.toLocaleString()}`;
  },
},
                ]), {key:"serialPurchaseCosts",header:"Cost Details",render:(row)=><button type="button" className="serial-cost-component" onClick={()=>openCostDetails("inventory",row)}>View Details</button>}]}
                rows={visibleInventory}
                page={inventoryTablePages.inStore}
                pageSize={INVENTORY_PAGE_SIZE}
                onFilteredRowCountChange={(count) =>
                  setInventoryTableCounts((previous) =>
                    previous.inStore === count
                      ? previous
                      : { ...previous, inStore: count },
                  )
                }
      loading={initialPageLoading}
      loadingTitle="Loading In Store Inventory..."
      loadingDescription="Fetching the latest QC-passed inventory and component details."
      enableColumnTools
      selectable={canManageInventory && selectionMode}
      selectedRowKeys={selectedRowKeys}
      onSelectedRowKeysChange={setSelectedRowKeys}
      keyField="id"
              />
              <PaginationControls
                page={inventoryTablePages.inStore}
                totalCount={inventoryTableCounts.inStore}
                pageSize={INVENTORY_PAGE_SIZE}
                hasPreviousPage={inventoryTablePages.inStore > 1}
                hasNextPage={inventoryTablePages.inStore < inventoryPageCount(visibleInventory)}
                loading={initialPageLoading}
                onPrevious={() => moveInventoryPage("inStore", Math.max(1, inventoryTablePages.inStore - 1))}
                onNext={() => moveInventoryPage("inStore", Math.min(inventoryPageCount(visibleInventory), inventoryTablePages.inStore + 1))}
              />
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No QC-passed inventory items found. Add a new component to save it into inventory.
            </div>
          )}
        </div>
      )}

      {tab === "project-inventory" && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="text-sm font-semibold text-foreground">Project Inventory</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Only components with quantity actually raised through MR-linked Purchase Orders are shown. Components fulfilled fully from In Store are excluded.
            </p>
          </div>

{(initialPageLoading || projectInventoryLoading || visibleProjectInventory.length > 0) ? (
            <div className="rounded-3xl border border-border bg-card p-0 shadow-sm">
              <DataTable
               columns={[...([
  {
    key: "material_request_id",
    header: "MR Number",
    render: (row) =>
      row.source_mr_number ||
      row.sourceMrNumber ||
      row.material_request_id ||
      "-",
  },

  {
    key: "specifications",
    header: "Specification",
    render: (row) => {
      const specification =
        resolveInventorySpecifications(
          row,
          components,
        ) ||
        row?.specifications ||
        row?.specification ||
        row?.component_specifications ||
        row?.componentSpecification ||
        "-";

      return (
        <button
          type="button"
          onClick={() =>
            openProjectInventorySpecificationModal(
              row,
            )
          }
          className="max-w-[240px] text-left font-semibold text-primary underline-offset-2 hover:underline"
          title="View Component, HSN No, Specification and Category"
        >
          {specification !== "-"
            ? specification
            : "View Details"}
        </button>
      );
    },
  },

  {
    key: "po_raised_quantity",
    header: "PO Raised Qty",
    className: "text-center",
    render: (row) =>
      Number(
        row.project_po_raised_quantity ??
          row.po_raised_quantity ??
          0,
      ),
    sortValue: (row) =>
      Number(
        row.project_po_raised_quantity ??
          row.po_raised_quantity ??
          0,
      ),
  },


  {
    key: "uom",
    header: "UOM",
    render: (row) =>
      row?.uom ||
      row?.unit ||
      row?.unit_of_measurements ||
      "-",
  },

  {
    key: "unitCost",
    header: "PO Unit Price",
    render: (row) =>
      formatCurrency(
        Number(
          row.project_po_unit_price ??
            0,
        ),
      ),
    sortValue: (row) =>
      Number(
        row.project_po_unit_price ??
          0,
      ),
    filterValue: (row) =>
      Number(
        row.project_po_unit_price ??
          0,
      ),
  },

  {
    key: "date",
    header: "Received",
    render: (row) =>
      formatDate(row.date),
  },

  {
    key: "totalPrice",
    header: "PO Amount",
    render: (row) => {
      const totalAmount = Math.max(
        Number(
          row.project_po_raised_amount ??
            0,
        ) || 0,
        0,
      );

      return `₹${totalAmount.toLocaleString(
        "en-IN",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      )}`;
    },
    sortValue: (row) =>
      Number(
        row.project_po_raised_amount ??
          0,
      ),
  },

  {
    key: "action",
    header: "Status",
    className: "text-center",
    render: (row) => {
      const statusInfo =
        getProjectInventoryStatusInfo(row);

      return (
        <span
          className={statusInfo.className}
        >
          {statusInfo.label}
        </span>
      );
    },
  },
]), {key:"serialPurchaseCosts",header:"Cost Details",render:(row)=><button type="button" className="serial-cost-component" onClick={()=>openCostDetails("projectInventory",row)}>View Details</button>}]}
              rows={visibleProjectInventory}
                page={inventoryTablePages.project}
                pageSize={INVENTORY_PAGE_SIZE}
                onFilteredRowCountChange={(count) =>
                  setInventoryTableCounts((previous) =>
                    previous.project === count
                      ? previous
                      : { ...previous, project: count },
                  )
                }
                loading={initialPageLoading || projectInventoryLoading}
                loadingTitle="Loading Project Inventory..."
                loadingDescription="Fetching the latest MR-linked QC-passed project inventory details."
                enableColumnTools
                selectable={canManageInventory && selectionMode}
                selectedRowKeys={selectedRowKeys}
                onSelectedRowKeysChange={setSelectedRowKeys}
                keyField="id"
              />
              <PaginationControls
                page={inventoryTablePages.project}
                totalCount={inventoryTableCounts.project}
                pageSize={INVENTORY_PAGE_SIZE}
                hasPreviousPage={inventoryTablePages.project > 1}
                hasNextPage={inventoryTablePages.project < inventoryPageCount(visibleProjectInventory)}
                loading={initialPageLoading || projectInventoryLoading}
                onPrevious={() => moveInventoryPage("project", Math.max(1, inventoryTablePages.project - 1))}
                onNext={() => moveInventoryPage("project", Math.min(inventoryPageCount(visibleProjectInventory), inventoryTablePages.project + 1))}
              />
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No Project Inventory PO items found. Only MR components with an actual PO-raised quantity appear here.
            </div>
          )}
        </div>
      )}

      {tab === "returned" && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <RotateCcw className="size-4 text-primary" />
              Returned
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Returned drones and components are shown here for view-only audit history. Return QC and all workflow actions are handled only from the Returnable page.
            </p>
          </div>

          {(initialPageLoading || loadingRequests || returnedRequests.length > 0) ? (
            <DataTable
              enableColumnTools
              columns={[
                {
                  key: "material_request_id",
                  header: "MR ID",
                  render: (row) => (
                    <span className="font-semibold">
                      {row.material_request_id || "-"}
                    </span>
                  ),
                },
                {
                  key: "project",
                  header: "Project",
                  render: (row) => row.project || "-",
                },
                {
                  key: "returned_from",
                  header: "Returned From",
                  render: (row) => (
                    <span className="font-medium">
                      {row.returned_from || "-"}
                    </span>
                  ),
                },
                {
                  key: "returned_by",
                  header: "Returned By",
                  render: (row) => row.returned_by || "-",
                },
                {
                  key: "returned_date",
                  header: "Return Date",
                  render: (row) => row.returned_date || "-",
                },
                {
                  key: "components",
                  header: "Components",
                  render: (row) => {
                    const items = Array.isArray(row?.items)
                      ? row.items
                      : [];

                    const value = items
                      .map((item) => {
                        const name =
                          item?.component_name ||
                          item?.component_code ||
                          "Component";

                        return `${name}-${Number(item?.quantity || 0)}`;
                      })
                      .join(", ");

                    return (
                      <span className="text-xs leading-5">
                        {value || "-"}
                      </span>
                    );
                  },
                },
                {
                  key: "remarks",
                  header: "Return Remarks",
                  render: (row) => (
                    <span className="max-w-[220px] whitespace-normal text-xs leading-5 text-foreground">
                      {row.remarks || "-"}
                    </span>
                  ),
                },
                {
                  key: "qc_status",
                  header: "Status",
                  className: "text-center",
                  render: (row) => {
                    const value = String(
                      row?.qc_status ||
                        "Returned",
                    );
                    const lower = value.toLowerCase();

                    const className =
                      lower.includes("passed")
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : lower.includes("failed") ||
                            lower.includes("rejected")
                          ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
                          : lower === "returned"
                            ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
                            : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300";

                    return (
                      <span className={`inline-flex max-w-[190px] items-center justify-center rounded-full border px-2.5 py-1 text-center text-[11px] font-semibold leading-4 ${className}`}>
                        {value}
                      </span>
                    );
                  },
                },
                {
                  key: "view",
                  header: "View",
                  className: "text-center",
                  render: (row) => (
                    <button
                      type="button"
                      onClick={() => openReturnedQc(row)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition hover:border-primary hover:text-primary"
                      title="View returned details"
                    >
                      View Details
                    </button>
                  ),
                },
              ]}
              rows={returnedRequests}
              loading={initialPageLoading || loadingRequests}
              loadingTitle="Loading Returned Inventory..."
              loadingDescription="Fetching returned MR, drone, component and return-status details."
              keyField="id"
            />
          ) : (
            <div className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No returned requests yet. When Engineer clicks Move to Return, the same MR/drone/components will appear here for Inventory QC.
            </div>
          )}
        </div>
      )}

      {returnedQcModal.open && returnedQcModal.row && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Returned Details</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {returnedQcModal.row.material_request_id} · {returnedQcModal.row.mode === "DRONE" ? "Drone" : "Components"} · {returnedQcModal.row.returned_from}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReturnedQc}
                disabled={returnedQcModal.saving}
                className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                aria-label="Close returned details"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-auto p-6">
              <div className="mb-4 grid gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm sm:grid-cols-4">
                <div><span className="text-muted-foreground">Returned By:</span> <span className="font-semibold">{returnedQcModal.row.returned_by || "-"}</span></div>
                <div><span className="text-muted-foreground">Return Date:</span> <span className="font-semibold">{returnedQcModal.row.returned_date || "-"}</span></div>
                <div><span className="text-muted-foreground">Type:</span> <span className="font-semibold">{returnedQcModal.row.mode === "DRONE" ? "Drone" : "Component"}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <span className="font-semibold">{returnedQcModal.row.qc_status}</span></div>
              </div>
              <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                <span className="text-muted-foreground">Return Remarks:</span>{" "}
                <span className="font-medium text-foreground">{returnedQcModal.row.remarks || "-"}</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Component</th>
                      <th className="px-4 py-3">Serial Number</th>
                      <th className="px-4 py-3 text-center">QC Result</th>
                      <th className="px-4 py-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {returnedQcModal.qcRows.map((item) => {

                      return (
                        <tr key={item.key}>
                          <td className="px-4 py-3 font-medium text-foreground">{item.componentName}</td>
                          <td className="px-4 py-3 font-mono text-xs text-foreground">
                            {item.serialNumber || `No serial recorded · Unit ${item.unitIndex}`}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {item.result ? (
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                  item.result === "OK"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                                    : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
                                }`}
                              >
                                {item.result === "OK" ? "OK" : "NOT OK"}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="block min-w-[220px] whitespace-normal text-sm text-foreground">
                              {item.remarks || "-"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {returnedQcModal.error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {returnedQcModal.error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={() =>
                  navigate("/component-usage", {
                    state: {
                      openPurpose: returnedQcModal.row.returnable_purpose,
                      materialRequestId: returnedQcModal.row.material_request_id,
                    },
                  })
                }
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
              >
                View Returnable History
              </button>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeReturnedQc}
                  disabled={returnedQcModal.saving}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {componentSpecificationModal.open && componentSpecificationModal.row && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Component Details</h3>
                <p className="mt-1 text-sm text-muted-foreground">Specification information</p>
              </div>
              <button
                type="button"
                onClick={closeComponentSpecificationModal}
                className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground"
                aria-label="Close component details"
              >
                <X className="size-4" />
              </button>
            </div>
            {componentSpecificationModal.mode === "instore" ? (
              /*
               * IN STORE POPUP - intentionally unchanged.
               */
              <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
                {[
                  ["Component Name", componentSpecificationModal.row.component_name],
                  ["Category", componentSpecificationModal.row.category],
                  ["Component Type", componentSpecificationModal.row.component_type],
                  ["Specification", componentSpecificationModal.row.specifications],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="text-xs font-medium text-muted-foreground">{label}</div>
                    <div className="mt-1 break-words text-sm font-semibold text-foreground">{value || "-"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-5">
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-foreground">
                          {componentSpecificationModal.mode === "overall"
                            ? "Component ID"
                            : "Component"}
                        </th>
                        {componentSpecificationModal.mode === "overall" ? (
                          <>
                            <th className="px-4 py-3 text-left font-semibold text-foreground">
                              Specification
                            </th>
                            <th className="px-4 py-3 text-left font-semibold text-foreground">
                              Category
                            </th>
                            <th className="px-4 py-3 text-left font-semibold text-foreground">
                              HSN No
                            </th>
                          </>
                        ) : (
                          <>
                            <th className="px-4 py-3 text-left font-semibold text-foreground">
                              HSN No
                            </th>
                            <th className="px-4 py-3 text-left font-semibold text-foreground">
                              Specification
                            </th>
                            <th className="px-4 py-3 text-left font-semibold text-foreground">
                              Category
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(componentSpecificationModal.details || []).map(
                        (detail, index) => (
                          <tr key={`component-specification-${index}`}>
                            <td className="px-4 py-3 font-semibold text-foreground">
                              {componentSpecificationModal.mode === "overall"
                                ? detail.componentId
                                : detail.componentName}
                            </td>
                            {componentSpecificationModal.mode === "overall" ? (
                              <>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {detail.specification || "-"}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {detail.category || "-"}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {detail.hsnNo || "-"}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {detail.hsnNo || "-"}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {detail.specification || "-"}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {detail.category || "-"}
                                </td>
                              </>
                            )}
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "in-drone" && (
        <div className="space-y-4">
          <style>{IN_DRONE_TABLE_CSS}</style>
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">In Drone</div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>
                    Qty: <strong className="text-foreground">{inDroneQuantity}</strong>
                  </span>
                  <span>
                    Cost: <strong className="text-foreground">{formatCurrency(inDroneCost)}</strong>
                  </span>
                  <span>
                    Flight Test: <strong className="text-foreground">{flightTestQuantity}</strong>
                  </span>
                  <span>
                    Event: <strong className="text-foreground">{eventQuantity}</strong>
                  </span>
                  <span>
                    Demo/Trials: <strong className="text-foreground">{demoQuantity}</strong>
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Drone Qty shows the original drone quantity raised on each MR. Sales and Returnable actions still use the internally calculated remaining available quantity, while movement/QC/reorder history is retained in the Action column.
            </p>
          </div>

          {salesActionError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {salesActionError}
            </div>
          )}

          {(initialPageLoading || loadingRequests || approvedRequests.length > 0) ? (
            <div className="in-drone-table">
            <DataTable
              columns={[
                {
                  key: "material_request_id",
                  header: "MR ID",
                  className: "in-drone-id-column text-center",
                  render: (row) => {
                    const mrNumber = String(
                      row.material_request_id ||
                        row.request_id ||
                        row.mr_id ||
                        row.id ||
                        "-",
                    ).trim();

                    const displayMrNumber = row?.droneInstanceId
                      ? `${mrNumber} / ${row?.droneInstanceSuffix || "_01"}`
                      : mrNumber;

                    const ownReplacementType =
                      mrNumber
                        .toUpperCase()
                        .endsWith("_PR")
                        ? "PR"
                        : mrNumber
                            .toUpperCase()
                            .endsWith("_FR")
                          ? "FR"
                          : "";

                    return (
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <button
                          type="button"
                          className="in-drone-mr-link text-primary"
                          onClick={() =>
                            openInDroneRequestDetails(
                              row,
                            )
                          }
                          aria-haspopup="dialog"
                          title="View material request details"
                        >
                          {displayMrNumber}
                        </button>

                        {row.inDroneReplacementCompleted &&
                          row.inDroneReplacementMrNumber &&
                          (!row?.droneInstanceId || String(row?.droneInstanceStatus || "").startsWith("SCRAP")) && (
                            <span
                              className="inline-flex max-w-full items-center justify-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700"
                              title={`Replacement ${row.inDroneReplacementMrNumber} is fully issued and active in In Drone`}
                            >
                              {row.inDroneReplacementType ||
                                "Reorder"}{" "}
                              Completed:{" "}
                              {
                                row.inDroneReplacementMrNumber
                              }
                            </span>
                          )}

                        {!row.inDroneHasEngineerScrap &&
                          ownReplacementType && (
                            <span className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                              {ownReplacementType} Rebuilt
                            </span>
                          )}
                      </div>
                    );
                  },
                },
                {
                  key: "components",
                  header: "Components",
                  className: "in-drone-components-column text-center",
                  render: (row) => {
                    const display =
                      getRequestComponentDisplay(
                        row,
                      );

                    return (
                      <button
                        type="button"
                        className="inline-flex max-w-full items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-center text-xs font-semibold text-sky-700 hover:border-sky-300 hover:bg-sky-100"
                        onClick={() =>
                          openInDroneRequestDetails(
                            row,
                          )
                        }
                        title="View complete component, serial number and fulfillment details"
                      >
                        {display || 0}
                      </button>
                    );
                  },
                  filterValue: (row) =>
                    getRequestComponentDisplay(
                      row,
                    ),
                  sortValue: (row) =>
                    getRequestComponentDisplay(
                      row,
                    ),
                },
                {
                  key: "drone_quantity",
                  header: "Drone Qty",
                  className: "in-drone-quantity-column text-center",
                  render: (row) => {
                    /*
                     * Drone Qty = the ORIGINAL quantity raised on this MR.
                     *
                     * Example:
                     *   MR raised Drone Qty = 2
                     *   1 drone later goes to Flight Test / Sale / Scrap
                     *
                     * This column still displays 2.
                     *
                     * The separate internal available-quantity calculation is
                     * retained for Sale and Returnable validation/actions.
                     */
                    const droneQuantity =
                      getInDroneTotalDroneQuantity(
                        row,
                      );

                    return (
                      <span className="text-sm font-bold text-foreground">
                        {droneQuantity > 0
                          ? droneQuantity
                          : "-"}
                      </span>
                    );
                  },
                  filterValue: (row) =>
                    getInDroneTotalDroneQuantity(
                      row,
                    ),
                  sortValue: (row) =>
                    getInDroneTotalDroneQuantity(
                      row,
                    ),
                },
                {
                  key: "serialPurchaseCosts",
                  header: "Cost Details",
                  className: "in-drone-cost-column text-center",
                  render: (row) => (
                    <button
                      type="button"
                      className="serial-cost-component"
                      onClick={() => openCostDetails("inDrone", row)}
                    >
                      View Details
                    </button>
                  ),
                },
                {
                  key: "action",
                  header: "Action",
                  className: "in-drone-action-column text-center",
                  render: (row) => {
                    const actionRowId = String(
                      row.id ||
                        row.material_request_id ||
                        row.request_id ||
                        row.mr_id ||
                        "",
                    );

                    const availableQuantity =
                      getInDroneAvailableQuantity(row);

                    const totalDroneQuantity =
                      getInDroneTotalDroneQuantity(row);

                    const returnableHistory =
                      Array.isArray(
                        row?.inDroneReturnableHistory,
                      )
                        ? row.inDroneReturnableHistory
                        : [];
                    const soldQty = Math.max(
                      Number(
                        row?.inDroneApprovedSalesQuantity || 0,
                      ) || 0,
                      0,
                    );
                    const pendingSaleQty = Math.max(
                      Number(
                        row?.inDronePendingSalesQuantity || 0,
                      ) || 0,
                      0,
                    );

                    const isFullySold =
                      totalDroneQuantity > 0 &&
                      soldQty >= totalDroneQuantity;

                    const statusBadges = [
                      row?.inDroneHasEngineerScrap
                        ? {
                            label:
                              row?.inDroneScrapLabel ||
                              "Scrapped",
                            className:
                              row?.inDroneScrapPending
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : row?.inDroneScrapReorderChoice ===
                                    "YES"
                                  ? "border-violet-200 bg-violet-50 text-violet-700"
                                  : "border-rose-200 bg-rose-50 text-rose-700",
                          }
                        : null,
                      row?.droneInstanceId &&
                      !["AVAILABLE", "SOLD", "SALE_PENDING", "SCRAP_PENDING", "SCRAPPED", "SCRAPPED_REORDERED"].includes(
                        String(row?.droneInstanceStatus || "").toUpperCase(),
                      )
                        ? {
                            label: row?.droneInstanceStatusLabel || row?.droneInstanceStatus,
                            className:
                              String(row?.droneInstanceStatus || "").toUpperCase() === "QC_FAILED"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-blue-200 bg-blue-50 text-blue-700",
                          }
                        : null,
                      soldQty > 0
                        ? {
                            label: `Sold: ${soldQty}`,
                            className:
                              "border-emerald-200 bg-emerald-50 text-emerald-700",
                          }
                        : null,
                      pendingSaleQty > 0
                        ? {
                            label: `Sale Pending: ${pendingSaleQty}`,
                            className:
                              "border-amber-200 bg-amber-50 text-amber-700",
                          }
                        : null,
                      ...returnableHistory.map(
                        (history) => ({
                          label:
                            history?.label ||
                            "Returnable",
                          className:
                            history?.tone ===
                            "QC_FAILED"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : history?.tone ===
                                  "QC_PASSED"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : history?.tone ===
                                      "REORDER_COMPLETED"
                                  ? "border-violet-200 bg-violet-50 text-violet-700"
                                  : history?.tone ===
                                        "REORDERING"
                                    ? "border-violet-200 bg-violet-50 text-violet-700"
                                    : history?.tone ===
                                          "PENDING"
                                      ? "border-amber-200 bg-amber-50 text-amber-700"
                                      : history?.purpose ===
                                          "CUSTOMER_DEMO"
                                        ? "border-violet-200 bg-violet-50 text-violet-700"
                                        : history?.purpose ===
                                            "EVENT"
                                          ? "border-orange-200 bg-orange-50 text-orange-700"
                                          : "border-blue-200 bg-blue-50 text-blue-700",
                        }),
                      ),
                    ].filter(Boolean);

                    return (
                      <div className="in-drone-actions">
                        {statusBadges.length > 0 && (
                          <div className="in-drone-statuses">
                            {statusBadges.map((badge) => (
                              <span
                                key={badge.label}
                                className={`inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                            ))}
                          </div>
                        )}

                        {!row?.inDroneScrapSaleBlocked &&
                          !isFullySold &&
                          availableQuantity > 0 &&
                          canStartInDroneSale && (
                            <button
                              type="button"
                              disabled={
                                salesProcessingId ===
                                actionRowId
                              }
                              onClick={() =>
                                openInDroneSalesModal(row)
                              }
                              className="in-drone-sale-button rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                              title={`Sell from ${availableQuantity} available drone(s)`}
                            >
                              {salesProcessingId ===
                              actionRowId
                                ? "Sending..."
                                : "Sale"}
                            </button>
                          )}

                        {!row?.inDroneScrapSaleBlocked &&
                          !statusBadges.length &&
                          (!canStartInDroneSale ||
                            availableQuantity <= 0) && (
                            <span className="text-xs text-muted-foreground">
                              {availableQuantity <= 0
                                ? "Fully Allocated"
                                : "-"}
                            </span>
                          )}
                      </div>
                    );
                  },
                },
              ]}
               rows={approvedRequests}
  loading={initialPageLoading || loadingRequests}
  loadingTitle="Loading In Drone Inventory..."
  loadingDescription="Fetching approved material requests, allocation and drone workflow details."
  enableColumnTools
  selectable={canManageInventory && selectionMode}
  selectedRowKeys={selectedRowKeys}
  onSelectedRowKeysChange={setSelectedRowKeys}
  keyField="id"
            />
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No approved drone material requests found. Approved requests will appear here once
              they are processed.
            </div>
          )}
          {inDroneSalesModal.open && inDroneSalesModal.row && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
              <div className="w-full max-w-lg rounded-2xl border border-border bg-white p-6 shadow-2xl dark:bg-slate-950">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Sales Details
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Enter the customer and invoice details. Finance/Admin will submit this MR to Management for Sales approval.
                    </p>
                    <p className="mt-2 text-xs font-semibold text-muted-foreground">
                      MR:{" "}
                      {inDroneSalesModal.row.droneInstanceDisplay ||
                        inDroneSalesModal.row.material_request_id ||
                        inDroneSalesModal.row.request_id ||
                        inDroneSalesModal.row.mr_id ||
                        inDroneSalesModal.row.id}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeInDroneSalesModal}
                    disabled={Boolean(salesProcessingId)}
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    aria-label="Close sales details"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-foreground">
                      Drone Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={getInDroneAvailableQuantity(
                        inDroneSalesModal.row,
                      )}
                      value={inDroneSalesModal.quantity}
                      onChange={(event) =>
                        setInDroneSalesModal((previous) => ({
                          ...previous,
                          quantity: event.target.value,
                          error: "",
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Available Drone Qty: {getInDroneAvailableQuantity(
                        inDroneSalesModal.row,
                      )}
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-foreground">
                      Customer / Client Name{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={inDroneSalesModal.client}
                      onChange={(event) =>
                        setInDroneSalesModal((previous) => ({
                          ...previous,
                          client: event.target.value,
                          error: "",
                        }))
                      }
                      placeholder="Enter customer or client name"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-foreground">
                      Invoice Number{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={inDroneSalesModal.invoiceNumber}
                      onChange={(event) =>
                        setInDroneSalesModal((previous) => ({
                          ...previous,
                          invoiceNumber: event.target.value,
                          error: "",
                        }))
                      }
                      placeholder="Enter invoice number"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-foreground">
                      Remarks{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={inDroneSalesModal.remarks}
                      onChange={(event) =>
                        setInDroneSalesModal((previous) => ({
                          ...previous,
                          remarks: event.target.value,
                          error: "",
                        }))
                      }
                      placeholder="Enter sales remarks"
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </div>

                  {inDroneSalesModal.error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                      {inDroneSalesModal.error}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeInDroneSalesModal}
                    disabled={Boolean(salesProcessingId)}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => void submitInDroneSales()}
                    disabled={Boolean(salesProcessingId)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {salesProcessingId
                      ? "Sending..."
                      : "Send for Management Approval"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {returnableMove.open && returnableMove.row && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
              <div className="w-full max-w-lg rounded-2xl border border-border bg-white p-6 shadow-2xl dark:bg-slate-950">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Move to Returnable
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {returnableMove.row.material_request_id ||
                        returnableMove.row.request_id ||
                        returnableMove.row.mr_id ||
                        returnableMove.row.id} · {getReturnablePurposeLabel(returnableMove.purpose)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeReturnableMove}
                    disabled={returnableMove.saving}
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-foreground">
                      Drone Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={getInDroneAvailableQuantity(returnableMove.row)}
                      value={returnableMove.quantity}
                      onChange={(event) =>
                        setReturnableMove((previous) => ({
                          ...previous,
                          quantity: event.target.value,
                          error: "",
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Available Drone Qty: {getInDroneAvailableQuantity(returnableMove.row)}
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-foreground">
                      Returnable Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      min={today}
                      max={
                        returnableMove.purpose === "FLIGHT_TEST"
                          ? getFlightTestMaxDate()
                          : undefined
                      }
                      value={returnableMove.returnDate}
                      onChange={(event) =>
                        setReturnableMove((previous) => ({
                          ...previous,
                          returnDate: event.target.value,
                          error: "",
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                    {returnableMove.purpose === "FLIGHT_TEST" && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Flight Test can be scheduled for a maximum of 4 days.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-foreground">
                      Remarks
                    </label>
                    <textarea
                      rows={3}
                      value={returnableMove.remarks}
                      onChange={(event) =>
                        setReturnableMove((previous) => ({
                          ...previous,
                          remarks: event.target.value,
                          error: "",
                        }))
                      }
                      placeholder="Optional movement remarks"
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </div>

                  {returnableMove.error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                      {returnableMove.error}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeReturnableMove}
                    disabled={returnableMove.saving}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitReturnableMove}
                    disabled={returnableMove.saving}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {returnableMove.saving
                      ? "Moving..."
                      : "Move to Returnable"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedRequest && (
            <InDroneRequestDialog onClose={closeInDroneRequestDetails}>
              <div className="p-5 sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 id="in-drone-request-title" className="text-lg font-semibold text-foreground">
                      Material Request Details
                    </h3>
                    <p className="mt-1 break-words text-sm font-semibold text-primary">
                      {selectedRequest.material_request_id || selectedRequest.request_id || selectedRequest.mr_id || selectedRequest.id || "-"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeInDroneRequestDetails}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                    aria-label="Close material request details"
                    autoFocus
                  >
                    Close
                  </button>
                </div>

                <div className="space-y-6 text-sm">
                  <dl className="in-drone-request-meta rounded-2xl border border-border bg-muted/10 p-4">
                    <div>
                      <dt className="text-muted-foreground">Requester Name</dt>
                      <dd>{selectedRequest.requester_name || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Date</dt>
                      <dd>{formatDate(selectedRequest.date) || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Project</dt>
                      <dd>{typeof selectedRequest.project === "object"
                        ? selectedRequest.project?.name || selectedRequest.project?.project_name || "-"
                        : selectedRequest.project || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Request Type</dt>
                      <dd>{getRequestTypeLabel(selectedRequest)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Required Date</dt>
                      <dd>{formatDate(selectedRequest.required_date) || "-"}</dd>
                    </div>
                    {(selectedRequest.bom || selectedRequest.bom_number || selectedRequest.bom_code) && (
                      <div>
                        <dt className="text-muted-foreground">BOM</dt>
                        <dd>{selectedRequest.bom || selectedRequest.bom_number || selectedRequest.bom_code}</dd>
                      </div>
                    )}
                    <div className="in-drone-request-remarks">
                      <dt className="text-muted-foreground">Remarks</dt>
                      <dd className="whitespace-pre-wrap">{selectedRequest.remarks || "-"}</dd>
                    </div>
                  </dl>

                  {isFromScrapRequest(
                    selectedRequest,
                  ) && (
                    <div className="space-y-4">
                      {fromScrapInventoryDetails.loading ? (
                        <div className="rounded-2xl border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                          Loading complete From-Scrap component recovery, In-Store reservation/issue, Procurement/PO, Inward/QC and final In-Drone serial details...
                        </div>
                      ) : fromScrapInventoryDetails.error ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                          {fromScrapInventoryDetails.error}
                        </div>
                      ) : (
                        <>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-border bg-background p-3">
                              <div className="text-xs uppercase text-muted-foreground">
                                Current MR
                              </div>
                              <div className="mt-1 font-semibold">
                                {fromScrapInventoryDetails.data?.request?.material_request_id ||
                                  fromScrapInventoryDetails.data?.request?.request_id ||
                                  "-"}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-border bg-background p-3">
                              <div className="text-xs uppercase text-muted-foreground">
                                Original / Source MR
                              </div>
                              <div className="mt-1 font-semibold">
                                {fromScrapInventoryDetails.data?.originalMrNumber ||
                                  "-"}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-border bg-background p-3">
                              <div className="text-xs uppercase text-muted-foreground">
                                Project
                              </div>
                              <div className="mt-1 font-semibold">
                                {typeof fromScrapInventoryDetails.data?.project === "object"
                                  ? (
                                      fromScrapInventoryDetails.data.project?.name ||
                                      fromScrapInventoryDetails.data.project?.project_name ||
                                      fromScrapInventoryDetails.data.project?.projectName ||
                                      fromScrapInventoryDetails.data.project?.project_code ||
                                      "-"
                                    )
                                  : fromScrapInventoryDetails.data?.project || "-"}
                              </div>
                            </div>
                          </div>

                          <div className="overflow-x-auto rounded-2xl border border-border">
                            <table className="min-w-[2340px] w-full text-xs">
                    <thead className="sticky top-0 border-b border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      <tr>
                        <th className="sticky left-0 z-20 min-w-[190px] bg-slate-100 px-4 py-3 text-center dark:bg-slate-900">
                          Component
                        </th>
                        <th className="sticky left-[190px] z-20 min-w-[140px] bg-slate-100 px-4 py-3 text-center dark:bg-slate-900">
                          HSN No
                        </th>
                        <th className="sticky left-[330px] z-20 min-w-[170px] bg-slate-100 px-4 py-3 text-center dark:bg-slate-900">
                          Source BOM Requested Qty
                        </th>
                        <th className="min-w-[130px] px-4 py-3 text-center">
                          Recovered Qty
                        </th>
                        <th className="min-w-[130px] px-4 py-3 text-center">
                          Missing Qty
                        </th>
                        <th className="min-w-[300px] px-4 py-3 text-center">
                          Recovered Scrap Serials
                        </th>
                        <th className="min-w-[300px] px-4 py-3 text-center">
                          In Store
                        </th>
                        <th className="min-w-[320px] px-4 py-3 text-center">
                          Procurement / PO
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
                      {(fromScrapInventoryDetails.data?.items || []).length ? (
                        fromScrapInventoryDetails.data.items.map(
                          (item, index) => (
                            <tr
                              key={`in-drone-from-scrap-${index}`}
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

                              <td className="sticky left-[190px] z-10 bg-white px-4 py-4 text-center font-medium dark:bg-slate-950">
                                {resolveInventoryHsn(item)}
                              </td>

                              <td className="sticky left-[330px] z-10 bg-white px-4 py-4 text-center text-lg font-bold dark:bg-slate-950">
                                {Number(
                                  item?.source_bom_required_quantity ||
                                    item?.request_quantity ||
                                    0,
                                )}
                              </td>

                              <td className="px-4 py-4 text-center">
                                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-bold text-emerald-700">
                                  {Number(item?.recovered_quantity || 0)}
                                </span>
                              </td>

                              <td className="px-4 py-4 text-center">
                                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-bold text-amber-700">
                                  {Number(item?.missing_quantity || 0)}
                                </span>
                              </td>

                              <td className="px-4 py-4">
                                <div className="flex max-w-[300px] flex-wrap justify-center gap-1.5">
                                  {(item?.recovered_serial_numbers || []).length
                                    ? item.recovered_serial_numbers.map(
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
                            colSpan={11}
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
                    </div>
                  )}

                  {!isFromScrapRequest(
                    selectedRequest,
                  ) && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-3xl border border-border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                        Issued From In Store
                      </div>
                      {selectedRequestStoreSerials.length > 0 ? (
                        <div className="mt-3 max-h-40 overflow-y-auto whitespace-pre-line text-sm text-foreground dark:text-slate-100">
                          {selectedRequestStoreSerials.join("\n")}
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-muted-foreground dark:text-slate-400">
                          No In-Store serials were issued for this request.
                        </div>
                      )}
                    </div>

                    <div className="rounded-3xl border border-border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                        Issued From QC Passed PO
                      </div>
                      {selectedRequestPurchasedSerials.length > 0 ? (
                        <div className="mt-3 max-h-40 overflow-y-auto whitespace-pre-line text-sm text-foreground dark:text-slate-100">
                          {selectedRequestPurchasedSerials.join("\n")}
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-muted-foreground dark:text-slate-400">
                          No MR-linked QC serials were issued for this request.
                        </div>
                      )}
                    </div>
                  </div>
                  )}

                  {!isFromScrapRequest(
                    selectedRequest,
                  ) &&
                    getInDroneComponentDetailRows(
                      selectedRequest,
                    ).length > 0 && (
                      <div className="rounded-3xl border border-border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                        <div className="mb-3">
                          <div className="text-sm font-semibold text-foreground">
                            Complete Component Fulfillment Details
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Component master data, required quantity, exact In-Store / PO issue quantities, serial numbers, remaining quantity, source and issue status.
                          </p>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-border">
                          <table className="min-w-[1900px] w-full text-xs">
                            <thead className="border-b border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                              <tr>
                                <th className="min-w-[130px] px-3 py-3 text-center">
                                  Component ID
                                </th>
                                <th className="min-w-[180px] px-3 py-3 text-center">
                                  Component
                                </th>
                                <th className="min-w-[240px] px-3 py-3 text-center">
                                  Specification
                                </th>
                                <th className="min-w-[150px] px-3 py-3 text-center">
                                  Category
                                </th>
                                <th className="min-w-[110px] px-3 py-3 text-center">
                                  HSN No
                                </th>
                                <th className="min-w-[90px] px-3 py-3 text-center">
                                  UOM
                                </th>
                                <th className="min-w-[100px] px-3 py-3 text-center">
                                  Required
                                </th>
                                <th className="min-w-[250px] px-3 py-3 text-center">
                                  In Store Issue
                                </th>
                                <th className="min-w-[250px] px-3 py-3 text-center">
                                  PO / QC Issue
                                </th>
                                <th className="min-w-[100px] px-3 py-3 text-center">
                                  Total Issued
                                </th>
                                <th className="min-w-[100px] px-3 py-3 text-center">
                                  Remaining
                                </th>
                                <th className="min-w-[150px] px-3 py-3 text-center">
                                  Source
                                </th>
                                <th className="min-w-[130px] px-3 py-3 text-center">
                                  Status
                                </th>
                              </tr>
                            </thead>

                            <tbody className="divide-y divide-border">
                              {getInDroneComponentDetailRows(
                                selectedRequest,
                              ).map((item) => (
                                <tr
                                  key={item.key}
                                  className="align-top bg-white dark:bg-slate-950"
                                >
                                  <td className="px-3 py-3 text-center font-semibold text-primary">
                                    {item.componentCode}
                                  </td>

                                  <td className="px-3 py-3 text-center font-medium text-foreground">
                                    {item.componentName}
                                  </td>

                                  <td className="px-3 py-3 text-center text-muted-foreground">
                                    {item.specification}
                                  </td>

                                  <td className="px-3 py-3 text-center text-muted-foreground">
                                    {item.category}
                                  </td>

                                  <td className="px-3 py-3 text-center text-muted-foreground">
                                    {item.hsnNo}
                                  </td>

                                  <td className="px-3 py-3 text-center text-muted-foreground">
                                    {item.uom}
                                  </td>

                                  <td className="px-3 py-3 text-center font-bold">
                                    {item.requestedQty}
                                  </td>

                                  <td className="px-3 py-3">
                                    <div className="text-center">
                                      Issued:{" "}
                                      <strong>
                                        {item.issuedStoreQty}
                                      </strong>
                                    </div>

                                    <div className="mt-2 flex max-w-[250px] flex-wrap justify-center gap-1">
                                      {item.storeSerials.length > 0
                                        ? item.storeSerials.map(
                                            (serial) => (
                                              <span
                                                key={`complete-store-${item.key}-${serial}`}
                                                className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-700"
                                              >
                                                {serial}
                                              </span>
                                            ),
                                          )
                                        : (
                                            <span className="text-muted-foreground">
                                              -
                                            </span>
                                          )}
                                    </div>
                                  </td>

                                  <td className="px-3 py-3">
                                    <div className="text-center">
                                      Issued:{" "}
                                      <strong>
                                        {item.issuedPurchasedQty}
                                      </strong>
                                    </div>

                                    <div className="mt-2 flex max-w-[250px] flex-wrap justify-center gap-1">
                                      {item.purchasedSerials.length > 0
                                        ? item.purchasedSerials.map(
                                            (serial) => (
                                              <span
                                                key={`complete-po-${item.key}-${serial}`}
                                                className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700"
                                              >
                                                {serial}
                                              </span>
                                            ),
                                          )
                                        : (
                                            <span className="text-muted-foreground">
                                              -
                                            </span>
                                          )}
                                    </div>
                                  </td>

                                  <td className="px-3 py-3 text-center font-bold text-emerald-700">
                                    {item.totalIssued}
                                  </td>

                                  <td className="px-3 py-3 text-center font-bold text-amber-700">
                                    {item.remainingQty}
                                  </td>

                                  <td className="px-3 py-3 text-center text-muted-foreground">
                                    {item.source}
                                  </td>

                                  <td className="px-3 py-3 text-center">
                                    <span
                                      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                                        item.workflowStatus ===
                                        "Issued"
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                          : item.workflowStatus ===
                                              "Partially Issued"
                                            ? "border-amber-200 bg-amber-50 text-amber-700"
                                            : "border-slate-200 bg-slate-50 text-slate-600"
                                      }`}
                                    >
                                      {item.workflowStatus}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  {!isFromScrapRequest(selectedRequest) &&
                  selectedRequestInventorySerials.length === 0 &&
                  selectedRequestIssueSerials.length > 0 && (
                    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-950/20">
                      <div className="text-xs uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">
                        Legacy Browser Issue Serials
                      </div>
                      <div className="mt-3 max-h-40 overflow-y-auto whitespace-pre-line text-sm text-foreground dark:text-slate-100">
                        {selectedRequestIssueSerials.join("\n")}
                      </div>
                    </div>
                  )}

                  {!isFromScrapRequest(selectedRequest) &&
                  selectedRequestIssueHistory.length > 0 && (
                    <div className="rounded-3xl border border-border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                        MR Issue History
                      </div>
                      <div className="mt-3 space-y-4">
                        {selectedRequestIssueHistory.map((record, index) => (
                          <div key={index} className="rounded-3xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                                  Issue #{index + 1}
                                </div>
                                <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {record.issued_to || "Unknown recipient"}
                                </div>
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {record.issued_date || "Unknown date"}
                              </div>
                            </div>

                            <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm text-slate-700 dark:text-slate-300">
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                  Qty issued
                                </div>
                                <div className="mt-1 font-medium">
                                  {record.last_issued_qty ?? "-"}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                  Material Request
                                </div>
                                <div className="mt-1 font-medium">
                                  {record.material_request_id || record.request_id || record.mr_id || "-"}
                                </div>
                              </div>
                            </div>

                            {Array.isArray(record.selected_serials) && record.selected_serials.length > 0 && (
                              <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                  Selected Serials
                                </div>
                                <div className="mt-2 max-h-28 overflow-y-auto whitespace-pre-line">
                                  {record.selected_serials.join("\n")}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isFromScrapRequest(selectedRequest) &&
                  bomDetails && bomDetails.items && bomDetails.items.length > 0 ? (
                    <div className="overflow-x-auto rounded-3xl border border-border bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-100 text-left text-xs uppercase tracking-[0.15em] text-muted-foreground dark:bg-slate-800">
                          <tr>
                            <th className="p-3">Component</th>
                            <th className="p-3">HSN No</th>
                            <th className="p-3">Category</th>
                            <th className="p-3 text-right">Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {bomDetails.items.map((it, i) => (
                            <tr key={i} className="bg-white dark:bg-slate-900">
                              <td className="p-3 font-medium text-foreground dark:text-slate-100">
                                {it.component_name ||
                                  it.component_code ||
                                  it.component ||
                                  it.name ||
                                  "-"}
                              </td>
                              <td className="p-3 text-muted-foreground">
                                {resolveInventoryHsn(it)}
                              </td>
                              <td className="p-3 text-muted-foreground">
                                {it.category || it.component_category || "-"}
                              </td>
                              <td className="p-3 text-right text-foreground">
                                {it.quantity ?? it.qty ?? it.required_quantity ?? 1}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : rdDetails && (
                    (Array.isArray(rdDetails.request_items) && rdDetails.request_items.length > 0) ||
                    (Array.isArray(rdDetails.rd_items) && rdDetails.rd_items.length > 0)
                  ) ? (
                    <div className="overflow-x-auto rounded-3xl border border-border bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-100 text-left text-xs uppercase tracking-[0.15em] text-muted-foreground dark:bg-slate-800">
                          <tr>
                            <th className="p-3">Component</th>
                            <th className="p-3">HSN No</th>
                            <th className="p-3">Category</th>
                            <th className="p-3 text-right">Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(
                            Array.isArray(rdDetails.request_items) && rdDetails.request_items.length > 0
                              ? rdDetails.request_items
                              : rdDetails.rd_items
                          ).map((it, i) => {
                            const qty = Number(
                              it.requested_quantity ??
                                it.required_quantity ??
                                it.quantity ??
                                it.qty ??
                                0,
                            );

                            return (
                              <tr key={i} className="bg-white dark:bg-slate-900">
                                <td className="p-3 font-medium text-foreground dark:text-slate-100">
                                  {it.component_name || it.componentName || it.component_code || it.component || it.serialNumber || it.serial_number || "-"}
                                </td>
                                <td className="p-3 text-muted-foreground">
                                  {resolveInventoryHsn(it)}
                                </td>
                                <td className="p-3 text-muted-foreground">
                                  {it.category || it.component_category || "-"}
                                </td>
                                <td className="p-3 text-right text-foreground">
                                  {qty}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : isFromScrapRequest(selectedRequest) ? null : (
                    <div className="rounded-3xl border border-border bg-white p-6 text-center text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                      No details found for this request.
                    </div>
                  )}
                </div>
              </div>
            </InDroneRequestDialog>
          )}
        </div>
      )}

      {tab === "sales" && (
  <div className="space-y-4">
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="text-sm font-semibold text-foreground">
        Sales Inventory
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        View and manage all sales outward records.
      </p>
    </div>

    <DataTable
  columns={activeOutwardType === "scrap" ? scrapTableColumns : [...scrapTableColumns, {
    key: "serialCostDetails", header: "Cost Details", render: (row) => <button type="button" className="serial-cost-component" onClick={() => openCostDetails("outward", row)}>View Details</button>
  }]}
  rows={visibleScrap}
  page={inventoryTablePages.outward}
  pageSize={INVENTORY_PAGE_SIZE}
  onFilteredRowCountChange={(count) =>
    setInventoryTableCounts((previous) =>
      previous.outward === count
        ? previous
        : { ...previous, outward: count },
    )
  }
  loading={initialPageLoading || outwardLoading}
  loadingTitle="Loading Outward Inventory..."
  loadingDescription="Fetching the latest outward inventory and workflow details."
              enableColumnTools
  selectable={canManageInventory && selectionMode}
  selectedRowKeys={selectedRowKeys}
  onSelectedRowKeysChange={setSelectedRowKeys}
  keyField="id"
/>
  <PaginationControls
    page={inventoryTablePages.outward}
    totalCount={inventoryTableCounts.outward}
    pageSize={INVENTORY_PAGE_SIZE}
    hasPreviousPage={inventoryTablePages.outward > 1}
    hasNextPage={inventoryTablePages.outward < inventoryPageCount(visibleScrap)}
    loading={initialPageLoading || outwardLoading}
    onPrevious={() => moveInventoryPage("outward", Math.max(1, inventoryTablePages.outward - 1))}
    onNext={() => moveInventoryPage("outward", Math.min(inventoryPageCount(visibleScrap), inventoryTablePages.outward + 1))}
  />
  </div>
)}

{tab === "event" && (
  <div className="space-y-4">
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="text-sm font-semibold text-foreground">
        Event Inventory
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        View and manage all event outward records.
      </p>
    </div>

    <DataTable
  columns={activeOutwardType === "scrap" ? scrapTableColumns : [...scrapTableColumns, {
    key: "serialCostDetails", header: "Cost Details", render: (row) => <button type="button" className="serial-cost-component" onClick={() => openCostDetails("outward", row)}>View Details</button>
  }]}
  rows={visibleScrap}
  page={inventoryTablePages.outward}
  pageSize={INVENTORY_PAGE_SIZE}
  onFilteredRowCountChange={(count) =>
    setInventoryTableCounts((previous) =>
      previous.outward === count
        ? previous
        : { ...previous, outward: count },
    )
  }
  loading={initialPageLoading || outwardLoading}
  loadingTitle="Loading Outward Inventory..."
  loadingDescription="Fetching the latest outward inventory and workflow details."
              enableColumnTools
  selectable={canManageInventory && selectionMode}
  selectedRowKeys={selectedRowKeys}
  onSelectedRowKeysChange={setSelectedRowKeys}
  keyField="id"
/>
  <PaginationControls
    page={inventoryTablePages.outward}
    totalCount={inventoryTableCounts.outward}
    pageSize={INVENTORY_PAGE_SIZE}
    hasPreviousPage={inventoryTablePages.outward > 1}
    hasNextPage={inventoryTablePages.outward < inventoryPageCount(visibleScrap)}
    loading={initialPageLoading || outwardLoading}
    onPrevious={() => moveInventoryPage("outward", Math.max(1, inventoryTablePages.outward - 1))}
    onNext={() => moveInventoryPage("outward", Math.min(inventoryPageCount(visibleScrap), inventoryTablePages.outward + 1))}
  />
  </div>
)}

      {tab === "scrap" && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="text-sm font-semibold text-foreground">Scrap Inventory</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Track QC failed components, scrap records, and outward movements in one place.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {OUTWARD_SUBTABS.map((subtab) => (
              <button
                key={subtab.id}
                type="button"
                onClick={() => setSelectedOutwardTab(subtab.id)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition",
                  selectedOutwardTab === subtab.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground",
                )}
              >
                {subtab.label}
              </button>
            ))}
            
          </div>

          {!outwardLoading && (
            <div className="rounded-3xl border border-border bg-card p-4 text-sm text-muted-foreground">
              {`${visibleScrap.length} ${selectedOutwardTab === "failedQc" ? "Failed QC" : selectedOutwardTab === "sales" ? "Sales" : selectedOutwardTab === "event" ? "Event" : "Scrap"} record(s)`}
            </div>
          )}

          {(initialPageLoading || outwardLoading || visibleScrap.length > 0) ? (
            <div>
              <DataTable
              columns={activeOutwardType === "scrap" ? scrapTableColumns : [...scrapTableColumns, {
    key: "serialCostDetails", header: "Cost Details", render: (row) => <button type="button" className="serial-cost-component" onClick={() => openCostDetails("outward", row)}>View Details</button>
  }]}
              rows={visibleScrap}
              page={inventoryTablePages.outward}
              pageSize={INVENTORY_PAGE_SIZE}
              onFilteredRowCountChange={(count) =>
                setInventoryTableCounts((previous) =>
                  previous.outward === count
                    ? previous
                    : { ...previous, outward: count },
                )
              }
              loading={initialPageLoading || outwardLoading}
              loadingTitle={selectedOutwardTab === "failedQc" ? "Loading Failed QC Inventory..." : "Loading Scrap Inventory..."}
              loadingDescription={selectedOutwardTab === "failedQc" ? "Fetching the latest QC-failed component and outward details." : "Fetching the latest scrap inventory and outward details."}
              enableColumnTools
              selectable={canManageInventory && selectionMode}
              selectedRowKeys={selectedRowKeys}
              onSelectedRowKeysChange={setSelectedRowKeys}
              keyField="id"
              />
              <PaginationControls
              page={inventoryTablePages.outward}
              totalCount={inventoryTableCounts.outward}
              pageSize={INVENTORY_PAGE_SIZE}
              hasPreviousPage={inventoryTablePages.outward > 1}
              hasNextPage={inventoryTablePages.outward < inventoryPageCount(visibleScrap)}
              loading={initialPageLoading || outwardLoading}
              onPrevious={() => moveInventoryPage("outward", Math.max(1, inventoryTablePages.outward - 1))}
              onNext={() => moveInventoryPage("outward", Math.min(inventoryPageCount(visibleScrap), inventoryTablePages.outward + 1))}
              />
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No scrap entries yet. Use the button above to add a scrap record.
            </div>
          )}
        </div>
      )}

      {canManageInventory && showNewInventory && (() => {
        const stockCost =
          calculateInventoryStockCost(
            newInventory,
          );

        const money = (value) =>
          Number(value || 0).toLocaleString(
            "en-IN",
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            },
          );

        const compactInputClass =
          "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-4">
            <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
              {/* Compact header */}
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-3.5">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-foreground">
                    Add Inventory Item
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    New stock is saved into In Store and included in Overall Inventory automatically.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowNewInventory(false)
                  }
                  className="shrink-0 rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Close Add Inventory"
                >
                  <X className="size-5" />
                </button>
              </div>

              <form
                onSubmit={handleSaveInventory}
                className="flex min-h-0 flex-1 flex-col"
              >
                {/* Scrollable content keeps the popup inside the screen */}
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <div className="space-y-4">
                    {/* Component / stock information */}
                    <section className="rounded-2xl border border-border bg-muted/10 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">
                            Stock Information
                          </h3>
                          <p className="text-[11px] text-muted-foreground">
                            Only Component is required. All other stock and costing fields are optional.
                          </p>
                        </div>

                        <div className="rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-foreground">
                          {generatedInventoryCode}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="sm:col-span-2">
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            Specification <span className="text-rose-500">*</span>
                          </label>

                          <CreatableSelect
                            styles={selectStyles}
                            placeholder="Select Specification..."
                            options={Array.from(
                              new Set(
                                components
                                  .map((component) =>
                                    component.specification ||
                                    component.specifications ||
                                    component.component_specifications ||
                                    "",
                                  )
                                  .map((value) => String(value).trim())
                                  .filter(Boolean),
                              ),
                            ).map((specification) => ({
                              value: specification,
                              label: specification,
                            }))}
                            value={
                              newInventory.specifications
                                ? {
                                    value: newInventory.specifications,
                                    label: newInventory.specifications,
                                  }
                                : null
                            }
                            onChange={(option) =>
                              setNewInventory((previous) => ({
                                ...previous,
                                specifications: option?.value || "",
                                component: "",
                                componentCode: "",
                                componentName: "",
                                category: "",
                                componentType: "",
                                unitPrice: "",
                              }))
                            }
                            onCreateOption={(value) =>
                              setNewInventory((previous) => ({
                                ...previous,
                                specifications: value,
                                component: "",
                                componentCode: "",
                                componentName: "",
                              }))
                            }
                          />
                        </div>

                        <div className="lg:col-span-2">
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            Component ID / Name <span className="text-rose-500">*</span>
                          </label>

                          <CreatableSelect
                            styles={selectStyles}
                            placeholder={
                              newInventory.specifications
                                ? "Select Component ID / Name..."
                                : "Select Specification first..."
                            }
                            isDisabled={!newInventory.specifications}
                            options={components
                              .filter((component) =>
                                String(
                                  component.specification ||
                                    component.specifications ||
                                    component.component_specifications ||
                                    "",
                                ).trim() ===
                                String(newInventory.specifications || "").trim(),
                              )
                              .map(
                              (component) => ({
                                value: component.id,
                                label: `${component.component_id || component.component_code || component.code || component.id} / ${component.component_name || component.name || ""}`,
                              }),
                              )}
                            value={
                              components
                                .filter((component) =>
                                  String(
                                    component.specification ||
                                      component.specifications ||
                                      component.component_specifications ||
                                      "",
                                  ).trim() ===
                                  String(newInventory.specifications || "").trim(),
                                )
                                .map(
                                  (component) => ({
                                    value: component.id,
                                    label: `${component.component_id || component.component_code || component.code || component.id} / ${component.component_name || component.name || ""}`,
                                  }),
                                )
                                .find(
                                  (option) =>
                                    String(
                                      option.value,
                                    ) ===
                                    String(
                                      newInventory.component,
                                    ),
                                ) || null
                            }
                            onChange={(option) => {
                              const component =
                                components.find(
                                  (item) =>
                                    String(item.id) ===
                                    String(
                                      option?.value ||
                                        "",
                                    ),
                                );

                              setNewInventory(
                                (previous) => ({
                                  ...previous,
                                  component:
                                    option?.value ||
                                    "",
                                  componentCode:
                                    component?.component_id ||
                                    "",
                                  componentName:
                                    component?.component_name ||
                                    component?.name ||
                                    "",
                                  specifications:
                                    component?.specification ||
                                    component?.specifications ||
                                    component?.component_specifications ||
                                    "",
                                  category:
                                    component?.category ||
                                    "",
                                  componentType:
                                    component?.component_type ||
                                    "",
                                  /*
                                   * UOM is manual in Add Stock.
                                   * Clear it when changing Component so
                                   * the Inventory user types KG / NOS /
                                   * PCS / SET / etc.
                                   */
                                  uom: "",
                                  unitPrice:
                                    component?.unit_price ??
                                    previous.unitPrice ??
                                    "",
                                }),
                              );
                            }}
                            onCreateOption={() => {
                              alert(
                                "Please create new components from Component Generation.",
                              );
                            }}
                          />
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            Category
                          </label>

                          <select
                            value={newInventory.category}
                            onChange={(event) =>
                              setNewInventory(
                                (previous) => ({
                                  ...previous,
                                  category:
                                    event.target.value,
                                }),
                              )
                            }
                            className={`${compactInputClass} cursor-pointer`}
                            
                          >
                            <option value="">
                              Select Category...
                            </option>

                            {CATEGORIES
                              .filter(
                                (category) =>
                                  category !== "All",
                              )
                              .map(
                                (category) => (
                                  <option
                                    key={category}
                                    value={category}
                                  >
                                    {category}
                                  </option>
                                ),
                              )}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            Component Type
                          </label>
                          <input
                            type="text"
                            value={
                              newInventory.componentType
                            }
                            onChange={(event) =>
                              setNewInventory(
                                (previous) => ({
                                  ...previous,
                                  componentType:
                                    event.target
                                      .value,
                                }),
                              )
                            }
                            className={compactInputClass}
                            placeholder="Component type"
                          />
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            Vendor
                          </label>
                          <CreatableSelect
                            styles={selectStyles}
                            placeholder="Select Vendor..."
                            options={vendors.map(
                              (vendor) => ({
                                value:
                                  vendor.name ||
                                  vendor.vendor_name,
                                label:
                                  vendor.name ||
                                  vendor.vendor_name,
                              }),
                            )}
                            value={
                              vendors
                                .map(
                                  (vendor) => ({
                                    value:
                                      vendor.name ||
                                      vendor.vendor_name,
                                    label:
                                      vendor.name ||
                                      vendor.vendor_name,
                                  }),
                                )
                                .find(
                                  (option) =>
                                    option.value ===
                                    newInventory.vendor,
                                ) || null
                            }
                            onChange={(option) =>
                              setNewInventory(
                                (previous) => ({
                                  ...previous,
                                  vendor:
                                    option?.value ||
                                    "",
                                }),
                              )
                            }
                            onCreateOption={() => {
                              alert(
                                "Please create new vendors from the Vendors page.",
                              );
                            }}
                          />
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            PO
                          </label>
                          <CreatableSelect
                            styles={selectStyles}
                            placeholder="Select Purchase Order..."
                            options={purchaseOrders.map(
                              (po) => ({
                                value:
                                  po.po ||
                                  po.po_number,
                                label:
                                  po.po ||
                                  po.po_number,
                              }),
                            )}
                            value={
                              purchaseOrders
                                .map((po) => ({
                                  value:
                                    po.po ||
                                    po.po_number,
                                  label:
                                    po.po ||
                                    po.po_number,
                                }))
                                .find(
                                  (option) =>
                                    option.value ===
                                    newInventory.po,
                                ) || null
                            }
                            onChange={(option) =>
                              setNewInventory(
                                (previous) => ({
                                  ...previous,
                                  po:
                                    option?.value ||
                                    "",
                                }),
                              )
                            }
                            onCreateOption={() => {
                              alert(
                                "Please create Purchase Orders from the Procurement page.",
                              );
                            }}
                          />
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            Received
                          </label>
                          <input
                            type="date"
                            value={newInventory.date}
                            onChange={(event) =>
                              setNewInventory(
                                (previous) => ({
                                  ...previous,
                                  date:
                                    event.target
                                      .value,
                                }),
                              )
                            }
                            className={compactInputClass}
                            
                          />
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            Inventory Code
                          </label>
                          <input
                            type="text"
                            value={generatedInventoryCode}
                            disabled
                            className={`${compactInputClass} bg-muted/60 text-muted-foreground`}
                          />
                        </div>
                      </div>
                    </section>

                    {/* Financial information */}
                    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">
                            Costing
                          </h3>
                          <p className="text-[11px] text-muted-foreground">
                            GST and Freight GST amounts are calculated automatically.
                          </p>
                        </div>

                        <div className="text-right">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Grand Total
                          </div>
                          <div className="text-xl font-bold text-foreground">
                            ₹{money(stockCost.grandTotal)}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {/* Qty */}
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            Qty
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={newInventory.qty}
                            onChange={(event) =>
                              setNewInventory(
                                (previous) => ({
                                  ...previous,
                                  qty:
                                    event.target
                                      .value,
                                }),
                              )
                            }
                            className={compactInputClass}
                            
                          />
                        </div>

                        {/* UOM */}
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            UOM
                          </label>
                          <input
                            type="text"
                            value={newInventory.uom}
                            onChange={(event) =>
                              setNewInventory(
                                (previous) => ({
                                  ...previous,
                                  uom:
                                    event.target
                                      .value,
                                }),
                              )
                            }
                            className={compactInputClass}
                            placeholder="Type UOM manually (KG / NOS / PCS / SET)"
                          />
                        </div>

                        {/* Unit Price */}
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            Unit Price (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={
                              newInventory.unitPrice
                            }
                            onChange={(event) =>
                              setNewInventory(
                                (previous) => ({
                                  ...previous,
                                  unitPrice:
                                    event.target
                                      .value,
                                }),
                              )
                            }
                            className={compactInputClass}
                            placeholder="0.00"
                          />
                        </div>

                        {/* Discount */}
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            Discount (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            max={
                              stockCost.basicAmount ||
                              undefined
                            }
                            value={newInventory.discount}
                            onChange={(event) =>
                              setNewInventory(
                                (previous) => ({
                                  ...previous,
                                  discount:
                                    event.target
                                      .value,
                                }),
                              )
                            }
                            className={compactInputClass}
                            placeholder="0.00"
                          />
                        </div>

                        {/* GST % / Amount */}
                        <div className="sm:col-span-2">
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            GST % / Amount
                          </label>
                          <div className="grid grid-cols-[110px_1fr] gap-2">
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={
                                  newInventory.gstPercent
                                }
                                onChange={(event) =>
                                  setNewInventory(
                                    (previous) => ({
                                      ...previous,
                                      gstPercent:
                                        event.target
                                          .value,
                                    }),
                                  )
                                }
                                className={`${compactInputClass} pr-8`}
                                placeholder="0"
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                %
                              </span>
                            </div>

                            <div className="relative">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                ₹
                              </span>
                              <input
                                type="text"
                                value={money(
                                  stockCost.gstAmount,
                                )}
                                disabled
                                className={`${compactInputClass} bg-muted/60 pl-7 font-semibold text-foreground`}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Freight */}
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            Freight Cost (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={
                              newInventory.freightCost
                            }
                            onChange={(event) =>
                              setNewInventory(
                                (previous) => ({
                                  ...previous,
                                  freightCost:
                                    event.target
                                      .value,
                                }),
                              )
                            }
                            className={compactInputClass}
                            placeholder="0.00"
                          />
                        </div>

                        {/* Round Off */}
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            Round-Off (+ / -)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={
                              newInventory.roundOff
                            }
                            onChange={(event) =>
                              setNewInventory(
                                (previous) => ({
                                  ...previous,
                                  roundOff:
                                    event.target
                                      .value,
                                }),
                              )
                            }
                            className={compactInputClass}
                            placeholder="0.00"
                          />
                        </div>

                        {/* Freight GST % / Amount */}
                        <div className="sm:col-span-2">
                          <label className="mb-1.5 block text-xs font-semibold text-foreground">
                            Freight GST % / Amount
                          </label>
                          <div className="grid grid-cols-[110px_1fr] gap-2">
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={
                                  newInventory.freightGstPercent
                                }
                                onChange={(event) =>
                                  setNewInventory(
                                    (previous) => ({
                                      ...previous,
                                      freightGstPercent:
                                        event.target
                                          .value,
                                    }),
                                  )
                                }
                                className={`${compactInputClass} pr-8`}
                                placeholder="0"
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                %
                              </span>
                            </div>

                            <div className="relative">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                ₹
                              </span>
                              <input
                                type="text"
                                value={money(
                                  stockCost.freightGstAmount,
                                )}
                                disabled
                                className={`${compactInputClass} bg-muted/60 pl-7 font-semibold text-foreground`}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Compact calculation summary */}
                        <div className="sm:col-span-2 grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/25 p-3 text-xs lg:col-span-2">
                          <div>
                            <div className="text-muted-foreground">
                              Basic Amount
                            </div>
                            <div className="mt-0.5 font-semibold text-foreground">
                              ₹{money(stockCost.basicAmount)}
                            </div>
                          </div>

                          <div>
                            <div className="text-muted-foreground">
                              Taxable Amount
                            </div>
                            <div className="mt-0.5 font-semibold text-foreground">
                              ₹{money(stockCost.taxableAmount)}
                            </div>
                          </div>

                          <div>
                            <div className="text-muted-foreground">
                              GST Amount
                            </div>
                            <div className="mt-0.5 font-semibold text-foreground">
                              ₹{money(stockCost.gstAmount)}
                            </div>
                          </div>

                          <div>
                            <div className="text-muted-foreground">
                              Freight + GST
                            </div>
                            <div className="mt-0.5 font-semibold text-foreground">
                              ₹{money(
                                stockCost.freightCost +
                                  stockCost.freightGstAmount,
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>

                {/* Sticky footer remains visible while body scrolls */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-5 py-3">
                  <div className="hidden text-[11px] text-muted-foreground sm:block">
                    Cost Details are saved serial-wise for this stock receipt.
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setShowNewInventory(false)
                      }
                      className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={savingInventory}
                      className="rounded-full bg-[#E85D75] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#d94d68] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingInventory
                        ? "Saving..."
                        : `Save Stock · ₹${money(
                            stockCost.grandTotal,
                          )}`}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {canManageInventory && showNewScrap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-[28px] border border-border bg-card p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">{scrapModalConfig.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {scrapModalConfig.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewScrap(false)}
                className="rounded-full p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="size-5" />
              </button>
            </div>

            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSaveScrap}>
              <input type="hidden" value={scrapModalConfig.typeLabel} />

              <label className="space-y-2 text-sm">
                Out Date
                <input
                  type="date"
                  value={newScrap.date}
                  onChange={(e) => setNewScrap((prev) => ({ ...prev, date: e.target.value }))}
                  required
                  className="w-full rounded-2xl border border-border bg-card px-4 py-3 outline-none focus:border-primary"
                />
              </label>

              {activeOutwardType === "sales" || activeOutwardType === "event" ? (
  <div className="md:col-span-2 rounded-2xl border border-border bg-muted/20 p-4">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-foreground">Items</div>
        <div className="text-xs text-muted-foreground">
          Select Component or Drone for each {activeOutwardType === "sales" ? "sale" : "event"} item.
        </div>
      </div>

      <button
        type="button"
        onClick={addOutwardComponentRow}
        className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Add Item
      </button>
    </div>

    <div className="space-y-3">
      {(newScrap.items || [createEmptyOutwardItem()]).map((row, index) => {
        const selectedComponent =
          getOutwardInventoryComponentOption(row.component);
        const isDrone =
          String(row.itemType || "COMPONENT").toUpperCase() === "DRONE";
        const requestedQuantity = Math.max(Number(row.qty) || 1, 1);
        const availableSerials = Array.isArray(
          selectedComponent?.availableSerials,
        )
          ? selectedComponent.availableSerials
          : [];
        const selectedSerials = Array.isArray(row.selectedSerials)
          ? row.selectedSerials
          : [];

        return (
          <div
            key={index}
            className="grid gap-3 rounded-xl border border-border bg-card p-3 md:grid-cols-[150px_1fr_100px_1fr_auto]"
          >
            <label className="space-y-1 text-sm">
              Item Type
              <select
                value={row.itemType || "COMPONENT"}
                onChange={(event) =>
                  updateOutwardComponentRow(
                    index,
                    "itemType",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-border bg-card px-3 py-2 outline-none focus:border-primary"
              >
                <option value="COMPONENT">Component</option>
                <option value="DRONE">Drone</option>
              </select>
            </label>

            {isDrone ? (
              <label className="space-y-1 text-sm">
                Drone Name
                <input
                  type="text"
                  value={row.droneName || ""}
                  onChange={(event) =>
                    updateOutwardComponentRow(
                      index,
                      "droneName",
                      event.target.value,
                    )
                  }
                  placeholder="Enter drone name"
                  required
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 outline-none focus:border-primary"
                />
              </label>
            ) : (
              <label className="space-y-1 text-sm">
                Component
                <select
                  value={row.component || ""}
                  onChange={(event) =>
                    updateOutwardComponentRow(
                      index,
                      "component",
                      event.target.value,
                    )
                  }
                  required
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 outline-none focus:border-primary"
                >
                  <option value="">
                    {outwardInventoryComponentOptions.length
                      ? "Select In-Store component"
                      : "No component available in In Store"}
                  </option>
                  {outwardInventoryComponentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} — Available: {option.availableQty}
                    </option>
                  ))}
                </select>
                {selectedComponent && (
                  <div className="text-xs text-muted-foreground">
                    Available Qty: {selectedComponent.availableQty}
                  </div>
                )}
              </label>
            )}

            <label className="space-y-1 text-sm">
              Qty
              <input
                type="number"
                min="1"
                max={
                  !isDrone && selectedComponent
                    ? selectedComponent.availableQty
                    : undefined
                }
                value={row.qty}
                onChange={(event) =>
                  updateOutwardComponentRow(
                    index,
                    "qty",
                    event.target.value,
                  )
                }
                required
                className="w-full rounded-xl border border-border bg-card px-3 py-2 outline-none focus:border-primary"
              />
            </label>

            {isDrone ? (
              <div className="self-end rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                Serial selection is not required for a typed drone name.
              </div>
            ) : (
              <label className="space-y-1 text-sm">
                Serial Number
                {requestedQuantity === 1 ? (
                  <select
                    value={selectedSerials[0] || ""}
                    onChange={(event) =>
                      updateOutwardComponentRow(
                        index,
                        "selectedSerials",
                        event.target.value ? [event.target.value] : [],
                      )
                    }
                    disabled={!selectedComponent || !availableSerials.length}
                    required
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 outline-none focus:border-primary disabled:opacity-60"
                  >
                    <option value="">
                      {selectedComponent
                        ? availableSerials.length
                          ? "Select serial number"
                          : "No serial available"
                        : "Select component first"}
                    </option>
                    {availableSerials.map((serial) => (
                      <option key={serial} value={serial}>
                        {serial}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    multiple
                    value={selectedSerials}
                    onChange={(event) => {
                      const values = Array.from(
                        event.target.selectedOptions,
                        (option) => option.value,
                      ).slice(0, requestedQuantity);
                      updateOutwardComponentRow(
                        index,
                        "selectedSerials",
                        values,
                      );
                    }}
                    disabled={!selectedComponent || !availableSerials.length}
                    size={Math.min(Math.max(availableSerials.length, 3), 6)}
                    required
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 outline-none focus:border-primary disabled:opacity-60"
                  >
                    {availableSerials.map((serial) => (
                      <option key={serial} value={serial}>
                        {serial}
                      </option>
                    ))}
                  </select>
                )}
                <div className="text-xs text-muted-foreground">
                  Selected: {selectedSerials.length}/{requestedQuantity}
                  {requestedQuantity > 1 ? " (use Ctrl/Cmd to select multiple)" : ""}
                </div>
              </label>
            )}

            <button
              type="button"
              onClick={() => removeOutwardComponentRow(index)}
              disabled={(newScrap.items || []).length <= 1}
              className="self-end rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        );
      })}
    </div>
  </div>
) : (
  <label className="space-y-2 text-sm">
    Component Name
    {components.length > 0 ? (
      <select
        value={newScrap.component}
        onChange={(e) => setNewScrap((prev) => ({ ...prev, component: e.target.value }))}
        required
        className="w-full rounded-2xl border border-border bg-card px-4 py-3 outline-none focus:border-primary"
      >
        <option value="">Select component</option>
        {components.map((component) => {
          const componentName =
            component.name ||
            component.component_name ||
            "Unnamed Component";

          const componentCode =
            component.component_id ||
            component.component_code ||
            component.code ||
            "";

          const componentDatabaseId =
            component.id ??
            component.pk;

          const componentLabel =
            componentCode
              ? `${componentCode} - ${componentName}`
              : componentName;

          return (
            <option
              key={
                componentDatabaseId ??
                componentCode ??
                componentName
              }
              value={
                componentDatabaseId ??
                componentName
              }
            >
              {componentLabel}
            </option>
          );
        })}
      </select>
    ) : (
      <input
        type="text"
        value={newScrap.component}
        onChange={(e) => setNewScrap((prev) => ({ ...prev, component: e.target.value }))}
        required
        className="w-full rounded-2xl border border-border bg-card px-4 py-3 outline-none focus:border-primary"
      />
    )}
  </label>
)}

              {!scrapModalConfig.showSaleFields && !scrapModalConfig.showEventFields && (
                <label className="space-y-2 text-sm">
                  Quantity
                  <input
                    type="number"
                    min="1"
                    value={newScrap.qty || 1}
                    onChange={(e) => setNewScrap((prev) => ({ ...prev, qty: parseInt(e.target.value) || 1 }))}
                    required
                    className="w-full rounded-2xl border border-border bg-card px-4 py-3 outline-none focus:border-primary"
                  />
                </label>
              )}

              {scrapModalConfig.showSaleFields && (
                <>
                  <label className="space-y-2 text-sm">
                    Invoice Number     
                    <input
                      type="text"
                      value={newScrap.invoiceNumber}
                      onChange={(e) => setNewScrap((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
                      className="w-full rounded-2xl border border-border bg-card px-4 py-3 outline-none focus:border-primary"
                    />
                  </label>

                  <label className="space-y-2 text-sm">
                    Client
                    <input
                      type="text"
                      value={newScrap.client}
                      onChange={(e) => setNewScrap((prev) => ({ ...prev, client: e.target.value }))}
                      className="w-full rounded-2xl border border-border bg-card px-4 py-3 outline-none focus:border-primary"
                    />
                  </label>

                  <label className="space-y-2 text-sm">
                    List of Deliverable
                    <input
                      type="text"
                      value={newScrap.deliverables}
                      onChange={(e) => setNewScrap((prev) => ({ ...prev, deliverables: e.target.value }))}
                      className="w-full rounded-2xl border border-border bg-card px-4 py-3 outline-none focus:border-primary"
                    />
                  </label>

                  <label className="space-y-2 text-sm md:col-span-2">
                    Remarks
                    <textarea
                      value={newScrap.reason || ""}
                      onChange={(e) =>
                        setNewScrap((prev) => ({
                          ...prev,
                          reason: e.target.value,
                        }))
                      }
                      placeholder="Enter sales remarks..."
                      className="min-h-[100px] w-full rounded-2xl border border-border bg-card px-4 py-3 outline-none focus:border-primary"
                    />
                  </label>
                </>
              )}

              {scrapModalConfig.showEventFields && (
                <>
                  <label className="space-y-2 text-sm">
                    Event Name
                    <input
                      type="text"
                      value={newScrap.eventName}
                      onChange={(e) => setNewScrap((prev) => ({ ...prev, eventName: e.target.value }))}
                      className="w-full rounded-2xl border border-border bg-card px-4 py-3 outline-none focus:border-primary"
                    />
                  </label>

                  <label className="space-y-2 text-sm">
                    Name of Attendee
                    <input
                      type="text"
                      value={newScrap.attendeeName}
                      onChange={(e) => setNewScrap((prev) => ({ ...prev, attendeeName: e.target.value }))}
                      className="w-full rounded-2xl border border-border bg-card px-4 py-3 outline-none focus:border-primary"
                    />
                  </label>
                </>
              )}

              {!scrapModalConfig.showSaleFields && !scrapModalConfig.showEventFields && (
                <label className="sm:col-span-2 space-y-2 text-sm">
                  Remarks
                  <textarea
                    value={newScrap.reason || ""}
                    onChange={(e) => setNewScrap((prev) => ({ ...prev, reason: e.target.value }))}
                    placeholder="Enter remarks or reason for scrap..."
                    className="w-full min-h-[100px] rounded-2xl border border-border bg-card px-4 py-3 outline-none focus:border-primary"
                  />
                </label>
              )}



              <div className="sm:col-span-2 flex flex-wrap gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowNewScrap(false)}
                  className="rounded-full border border-border px-5 py-3 text-sm font-medium text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingOutward}
                  className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingOutward
                    ? "Saving..."
                    : scrapModalConfig.actionLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    
{issueDetailsRow && (
  <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/40 p-4">
    <div className="w-full max-w-2xl rounded-[28px] bg-white p-5 shadow-2xl dark:bg-slate-900 dark:border dark:border-slate-700">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Issued Details</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Review issued serials and history for this component.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIssueDetailsRow(null)}
          className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {issueDetailsRow.component || issueDetailsRow.code || "-"}
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Issue history for the selected item.
        </div>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {(issuedInventoryMetadata[getInventoryIssueQtyKey(issueDetailsRow)] || []).map((record, index) => (
            <div
              key={index}
              className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                    Issue #{index + 1}
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                    {record.issued_to || "Unknown recipient"}
                  </div>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(record.issued_date)}
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Qty issued
                  </div>
                  <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                    {record.last_issued_qty ?? "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Material Request
                  </div>
                  <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                    {record.material_request_id || "-"}
                  </div>
                </div>
              </div>

              {Array.isArray(record.selected_serials) && record.selected_serials.length > 0 && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Selected Serials
                  </div>
                  <div className="mt-2 max-h-36 overflow-y-auto whitespace-pre-line text-sm">
                    {record.selected_serials.join("\n")}
                  </div>
                </div>
              )}
            </div>
          ))}

          {!(issuedInventoryMetadata[getInventoryIssueQtyKey(issueDetailsRow)] || []).length && (
            <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              No issue history is available for this component.
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => setIssueDetailsRow(null)}
          className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}

{purchaseHistoryModal.open && (
  <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
    <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Component Purchase History</h3>
          <p className="mt-1 text-sm text-muted-foreground">Purchase records from the last 24 months.</p>
        </div>
        <button
          type="button"
          onClick={() => setPurchaseHistoryModal({ open: false, component: null })}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted"
          aria-label="Close purchase history"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-6 lg:grid-cols-[280px_1fr]">
        <div className="min-h-0 overflow-y-auto rounded-2xl border border-border bg-muted/20 p-2">
          {components.map((component) => (
            <button
              type="button"
              key={component?.id || component?.component_id || component?.code}
              onClick={() => setPurchaseHistoryModal((previous) => ({ ...previous, component }))}
              className={`mb-1 w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                purchaseHistoryModal.component === component
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {component?.component_id || component?.code || "-"} - {component?.component_name || component?.name || "Component"}
            </button>
          ))}
        </div>

        <div className="min-h-0 overflow-hidden rounded-2xl border border-border">
          {purchaseHistoryModal.component ? (
            <>
              <div className="border-b border-border bg-white px-4 py-3 text-sm font-semibold dark:bg-slate-900">
                {purchaseHistoryModal.component?.component_id || purchaseHistoryModal.component?.code || "-"} - {purchaseHistoryModal.component?.component_name || purchaseHistoryModal.component?.name || "Component"}
              </div>
              <DataTable
                enableColumnTools
                className="max-h-[calc(88vh-10rem)] rounded-none border-0 shadow-none"
                rows={getPurchaseHistoryForComponent(purchaseHistoryModal.component)}
                columns={[
                  {
                    key: "date",
                    header: "PO Date",
                    render: (record) => record.date.toLocaleDateString("en-IN"),
                    filterValue: (record) => record.date.toLocaleDateString("en-IN"),
                    sortValue: (record) => record.date.getTime(),
                  },
                  { key: "poNumber", header: "PO Number" },
                  { key: "reference", header: "Reference" },
                  { key: "vendor", header: "Vendor" },
                  { key: "quantity", header: "Qty", className: "text-center", sortValue: (record) => record.quantity },
                  {
                    key: "unitPrice",
                    header: "Unit Price",
                    className: "text-center",
                    render: (record) => (
                      <span className="flex w-full justify-center text-center">
                        ₹{record.unitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    ),
                    sortValue: (record) => record.unitPrice,
                  },
                ]}
                hideEmptyState={false}
              />
            </>
          ) : (
            <div className="flex h-full min-h-48 items-center justify-center p-8 text-center text-sm text-muted-foreground">Select a component to view all purchase history.</div>
          )}
        </div>
      </div>
    </div>
  </div>
)}

{eventActionModal.open && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-xl h-[90vh] max-h-[90vh] flex flex-col rounded-[24px] border border-border bg-card shadow-2xl overflow-hidden dark:bg-slate-950 dark:border-slate-700">
      <div className="border-b border-border p-6 dark:border-slate-800">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Event Return Details</h3>
            <p className="text-sm text-muted-foreground">
              Capture the attendee, drone, and returned component checklist.
            </p>
          </div>
          <button
            type="button"
            onClick={closeEventActionModal}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          Event Name
          <input
            type="text"
            value={eventActionModal.row?.eventName || eventActionModal.row?.event_name || ""}
            disabled
            className="w-full rounded-2xl border border-border bg-slate-100 text-slate-500 outline-none dark:bg-slate-900 dark:text-slate-300 px-4 py-3 text-sm"
          />
        </label>
<label className="space-y-2 text-sm">
  Out Date
  <input
    type="text"
    value={formatDate(eventActionModal.row?.outDate || eventActionModal.row?.date)}
    disabled
    className="w-full rounded-2xl border border-border bg-slate-100 text-slate-500 outline-none dark:bg-slate-900 dark:text-slate-300 px-4 py-3 text-sm"
  />
</label>
        <label className="space-y-2 text-sm">
          Name of Attendee
          <input
            type="text"
            value={eventActionModal.attendeeName}
            disabled={!canManageInventory}
            onChange={(e) =>
              setEventActionModal((prev) => ({ ...prev, attendeeName: e.target.value }))
            }
            className={`w-full rounded-2xl border border-border px-4 py-3 outline-none ${
              canManageInventory
                ? "bg-card focus:border-primary dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
                : "cursor-default bg-muted/40 text-muted-foreground dark:bg-slate-900 dark:text-slate-300"
            }`}
          />
        </label>



        <label className="space-y-2 text-sm">
          No. of Components
          <input
            type="number"
            min="1"
            value={eventActionModal.noOfComponents}
            disabled={!canManageInventory}
            onChange={(e) =>
              setEventActionModal((prev) => ({ ...prev, noOfComponents: e.target.value }))
            }
            className={`w-full rounded-2xl border border-border px-4 py-3 outline-none ${
              canManageInventory
                ? "bg-card focus:border-primary dark:bg-slate-900 dark:text-white"
                : "cursor-default bg-muted/40 text-muted-foreground dark:bg-slate-900 dark:text-slate-300"
            }`}
          />
        </label>

        <div className="sm:col-span-2">
          <div className="rounded-3xl border border-border bg-card p-4 shadow-sm dark:bg-slate-900">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-3xl border border-border bg-slate-50 p-4 text-sm dark:bg-slate-800">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="mt-2 text-2xl font-semibold text-foreground dark:text-slate-100">
                  {eventActionModal.componentInstances.length}
                </div>
              </div>
              <div className="rounded-3xl border border-border bg-slate-50 p-4 text-sm dark:bg-slate-800">
                <div className="text-xs text-muted-foreground">OK</div>
                <div className="mt-2 text-2xl font-semibold text-foreground dark:text-slate-100">
                  {eventActionModal.componentInstances.filter((item) => item.checked).length}
                </div>
              </div>
              <div className="rounded-3xl border border-border bg-slate-50 p-4 text-sm dark:bg-slate-800">
                <div className="text-xs text-muted-foreground">Not OK</div>
                <div className="mt-2 text-2xl font-semibold text-foreground dark:text-slate-100">
                  {eventActionModal.componentInstances.filter((item) => !item.checked).length}
                </div>
              </div>
              <div className="rounded-3xl border border-border bg-slate-50 p-4 text-sm dark:bg-slate-800">
                <div className="text-xs text-muted-foreground">Remarks</div>
                <div className="mt-2 text-2xl font-semibold text-foreground dark:text-slate-100">
                  {eventActionModal.componentInstances.filter((item) => !item.checked && String(item.remarks || "").trim().length > 0).length}
                </div>
              </div>
            </div>
            {eventActionModal.componentInstances.filter((item) => !item.checked && String(item.remarks || "").trim().length > 0).length > 0 && (
              <div className="mt-4 rounded-3xl border border-border bg-card p-4 text-sm dark:bg-slate-900">
                <div className="font-semibold text-foreground dark:text-slate-100">Not OK Remarks</div>
                <div className="mt-3 space-y-2">
                  {eventActionModal.componentInstances
                    .filter((item) => !item.checked && String(item.remarks || "").trim().length > 0)
                    .map((item) => (
                      <div key={item.id} className="rounded-2xl border border-border bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100">
                        <span className="font-medium">{item.label}</span>: {item.remarks}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">Components in Event</div>
                <div className="text-xs text-muted-foreground">Review each unit and add remarks for any component that is not OK.</div>
              </div>
              {canManageInventory && (
                <button
                  type="button"
                  onClick={() => {
                    const allChecked = eventActionModal.componentInstances.every((item) => item.checked);
                    setEventActionModal((prev) => ({
                      ...prev,
                      returned: !allChecked,
                      componentInstances: prev.componentInstances.map((item) => ({
                        ...item,
                        checked: !allChecked,
                      })),
                    }));
                  }}
                  className="inline-flex items-center justify-center rounded-full border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary dark:bg-slate-800 dark:text-slate-200"
                >
                  {eventActionModal.componentInstances.every((item) => item.checked) ? "Uncheck all" : "Check all"}
                </button>
              )}
            </div>

            <div className="mt-4 grid gap-3 max-h-[56vh] overflow-y-auto pr-1">
              {eventActionModal.componentInstances.length > 0 ? (
                eventActionModal.componentInstances.map((instance) => (
                  <div
                    key={instance.id}
                    className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[auto_1fr] sm:items-center dark:bg-slate-900"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={instance.checked}
                        disabled={!canManageInventory}
                        onChange={() => {
                          setEventActionModal((prev) => {
                            const updated = prev.componentInstances.map((item) =>
                              item.id === instance.id ? { ...item, checked: !item.checked } : item,
                            );
                            return {
                              ...prev,
                              componentInstances: updated,
                              returned: updated.every((item) => item.checked),
                            };
                          });
                        }}
                        className="h-4 w-4 rounded border border-border text-primary focus:ring-primary"
                      />
                      <span className="font-medium text-slate-900 dark:text-slate-100">{instance.label}</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        {instance.checked ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                            OK
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                            Not OK
                          </span>
                        )}
                      </div>
                      <label className="block text-sm">
                        Remarks{!instance.checked ? " if not OK" : ""}
                        <input
                          type="text"
                          value={instance.remarks || ""}
                          disabled={!canManageInventory}
                          onChange={(e) => {
                            const value = e.target.value;
                            setEventActionModal((prev) => {
                              const updated = prev.componentInstances.map((item) =>
                                item.id === instance.id ? { ...item, remarks: value } : item,
                              );
                              return {
                                ...prev,
                                componentInstances: updated,
                                returned: updated.every((item) => item.checked),
                              };
                            });
                          }}
                          className="mt-2 w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary dark:bg-slate-900 dark:text-white"
                          placeholder="Enter remarks for not OK"
                        />
                      </label>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No component details available.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

      <div className="border-t border-border px-6 py-4">
        <div className="flex flex-wrap items-center gap-3 justify-end">
          <button
            type="button"
            onClick={closeEventActionModal}
            className="rounded-full border border-border px-5 py-3 text-sm font-medium text-foreground hover:bg-muted"
          >
            {canManageInventory ? "Cancel" : "Close"}
          </button>

          {canManageInventory && (
            <button
              type="button"
              onClick={handleSaveEventAction}
              disabled={!isEventActionValid}
              className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
)}

{eventComponentModal.open && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-lg rounded-[24px] border border-border bg-card p-6 shadow-2xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {String(
              eventComponentModal.row?.type ||
                eventComponentModal.row?.typeOfOutward ||
                "",
            ).toLowerCase() === "sales"
              ? "Sales Item Details"
              : "Event Item Details"}
          </h3>
          <p className="text-sm text-muted-foreground">
            Component or drone details and the exact selected serial numbers.
          </p>
        </div>
        <button
          type="button"
          onClick={closeEventComponentsModal}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Item Type
            </div>
            <div className="mt-1 text-sm font-medium text-foreground">
              {String(
                eventComponentModal.row?.itemType ||
                  eventComponentModal.row?.item_type ||
                  "COMPONENT",
              ).toUpperCase() === "DRONE"
                ? "Drone"
                : "Component"}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Quantity
            </div>
            <div className="mt-1 text-sm font-medium text-foreground">
              {eventComponentModal.row?.qty ||
                eventComponentModal.row?.quantity ||
                eventComponentModal.row?.noOfComponents ||
                eventComponentModal.row?.no_of_components ||
                1}
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {String(
                eventComponentModal.row?.itemType ||
                  eventComponentModal.row?.item_type ||
                  "COMPONENT",
              ).toUpperCase() === "DRONE"
                ? "Drone Name"
                : "Component Name"}
            </div>
            <div className="mt-1 text-sm font-medium text-foreground">
              {eventComponentModal.row?.productName ||
                eventComponentModal.row?.product_name ||
                eventComponentModal.row?.component ||
                eventComponentModal.row?.droneName ||
                eventComponentModal.row?.drone_name ||
                "-"}
            </div>
          </div>
        </div>

        {String(
          eventComponentModal.row?.itemType ||
            eventComponentModal.row?.item_type ||
            "COMPONENT",
        ).toUpperCase() === "COMPONENT" ? (
          <div>
            <div className="mb-2 text-sm font-semibold text-foreground">
              Selected Serial Numbers
            </div>
            {Array.isArray(eventComponentModal.row?.detailSerials) &&
            eventComponentModal.row.detailSerials.length > 0 ? (
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-border bg-background p-3">
                <ul className="divide-y divide-border text-sm">
                  {eventComponentModal.row.detailSerials.map((serial, index) => (
                    <li
                      key={`${serial}-${index}`}
                      className="py-2 font-mono text-foreground"
                    >
                      {serial}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No serial number is stored for this outward item.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Serial-number selection is not required for a typed drone name.
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={closeEventComponentsModal}
          className="rounded-full border border-border px-5 py-3 text-sm font-medium text-foreground hover:bg-muted"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}

{projectQcSerialModal.open && (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-lg rounded-[24px] border border-border bg-card p-6 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            QC Passed Serial Numbers
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {projectQcSerialModal.row?.source_mr_number ||
              projectQcSerialModal.row?.material_request_id ||
              "MR"}
            {" · "}
            {projectQcSerialModal.row?.component ||
              projectQcSerialModal.row?.component_name ||
              "Component"}
          </p>
        </div>

        <button
          type="button"
          onClick={closeProjectQcSerials}
          className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          Close
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700">
          QC Passed Qty: {projectQcSerialModal.expectedQuantity}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
          Serials: {projectQcSerialModal.serials.length}
        </span>
      </div>

      {projectQcSerialModal.serials.length ===
      projectQcSerialModal.expectedQuantity ? (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          Serial count matches the QC-passed quantity.
        </div>
      ) : (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          Expected {projectQcSerialModal.expectedQuantity} serial(s), but {projectQcSerialModal.serials.length} were returned. Check the saved QC rows for this Inward if this is an older record.
        </div>
      )}

      <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border bg-background">
        {projectQcSerialModal.serials.length > 0 ? (
          <div className="divide-y divide-border">
            {projectQcSerialModal.serials.map(
              (serial, index) => (
                <div
                  key={`${serial}-${index}`}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {index + 1}
                  </span>
                  <span className="break-all font-mono text-sm text-foreground">
                    {serial}
                  </span>
                </div>
              ),
            )}
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No QC-passed serial numbers are available for this row.
          </div>
        )}
      </div>
    </div>
  </div>
)}





{scrapRejectDetails && (
  <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
    <div className="w-full max-w-lg rounded-[24px] border border-border bg-card p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-red-700 dark:text-red-300">
            Scrap Rejection Details
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Reason entered by the Manager.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setScrapRejectDetails(null)
          }
          className="rounded-full border border-border p-2 hover:bg-muted"
          aria-label="Close rejection details"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-5 rounded-xl bg-muted p-3">
        <p className="text-xs font-medium text-muted-foreground">
          Rejected By
        </p>
        <p className="mt-1 text-sm font-semibold">
          {scrapRejectDetails.rejectedBy ||
            "Manager"}
        </p>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Rejection Reason
        </p>
        <div className="min-h-[110px] whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
          {scrapRejectDetails.reason ||
            "No rejection reason was provided."}
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() =>
            setScrapRejectDetails(null)
          }
          className="rounded-full border border-border px-5 py-2 text-sm font-semibold hover:bg-muted"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}

{serialModal.open && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-md rounded-[24px] border border-border bg-card p-6 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">
            Serial Numbers
          </h3>

          {serialModal.row?.component && (
            <p className="mt-1 break-words text-sm font-semibold text-foreground">
              {serialModal.row.component}
            </p>
          )}

          {serialModal.row?.componentCode &&
            serialModal.row.componentCode !== "-" && (
              <p className="mt-0.5 break-words text-xs text-muted-foreground">
                {serialModal.row.componentCode}
              </p>
            )}

          <p className="mt-2 text-sm text-muted-foreground">
            {serialModal.row?.quantity !== undefined
              ? `Quantity: ${serialModal.row.quantity}`
              : "All serials for the selected inventory item."}
          </p>
        </div>

        <div className="shrink-0 rounded-full bg-muted px-3 py-1 text-sm font-semibold text-muted-foreground">
          {serialModal.serials.length} serial(s)
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-background p-3">
        {serialModal.serials.length ? (
          <ul className="divide-y divide-border text-sm">
            {serialModal.serials.map((s, i) => (
              <li key={i} className="py-2">
                <span className="block truncate">{s}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-muted-foreground">No serial numbers available for this item.</div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end">
        <button
          type="button"
          onClick={closeSerialsModal}
          className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}
    </PageShell>
  );
}
