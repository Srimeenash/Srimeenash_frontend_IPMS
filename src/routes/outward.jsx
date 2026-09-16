import { useCostDetails } from "@/components/app/SerialCostDetails";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { DataTable, StatusBadge } from "@/components/app/DataTable";
import { PaginationControls } from "@/components/app/PaginationControls";
import { outward as mockOutward } from "@/lib/mock-data";
import { Loader2, Plus, X } from "lucide-react";
import config from "@/config";
import { fetchJson, fetchAuthenticatedJson } from "@/api";
import { useAuth } from "@/AuthContext";
import { canWork } from "@/permissions";

const OUTWARD_PAGE_SIZE = 50;
const TAB_CONFIG = [
  { id: "scrap", label: "Scrap" },
  { id: "failedQc", label: "Failed QC" },
  { id: "sales", label: "Sales" },
];

const OUTWARD_TYPE_LABELS = {
  scrap: "Scrap",
  defect: "Defect",
  failedQc: "Failed QC",
  sales: "Sales",
};  

const OUTWARD_TYPE_API = {
  scrap: "SCRAP",
  defect: "SCRAP",
  failedQc: "FAILED_QC",
  sales: "SALES",
};

const DELETED_OUTWARD_ROW_IDS_STORAGE_KEY = "dream-to-life-outward-deleted-ids";

function getDeletedOutwardRowIds() {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(DELETED_OUTWARD_ROW_IDS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.warn("Unable to read deleted outward row IDs:", err);
    return [];
  }
}

function persistDeletedOutwardRowIds(ids) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(DELETED_OUTWARD_ROW_IDS_STORAGE_KEY, JSON.stringify(ids));
  } catch (err) {
    console.warn("Unable to save deleted outward row IDs:", err);
  }
}

function normalizeTypeOfOutward(value) {
  if (!value) return "";

  const input = String(value)
    .trim()
    .toLowerCase();

  if (
    [
      "customer demo",
      "customer_demo",
      "customer-demo",
      "customer event",
      "customer_event",
      "customer-event",
    ].includes(input)
  ) {
    return "Demo/Trials";
  }

  const key =
    input === "failed qc" ||
    input === "failedqc" ||
    input === "failed_qc" ||
    input === "qc failed"
      ? "failedQc"
      : input;

  return OUTWARD_TYPE_LABELS[key] || String(value).trim();
}

function normalizeTypeOfOutwardApi(value) {
  if (!value) return "";
  const input = String(value).trim().toLowerCase();
  const key =
    input === "failed qc" || input === "failedqc" || input === "failed_qc" || input === "qc failed"
      ? "failedQc"
      : input;
  return OUTWARD_TYPE_API[key] || String(value).trim().toUpperCase();
}

function isQcFailedItem(item) {
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
}

function getQcFailedRows(entry) {
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
}

function normalizeOutwardTypeKey(value) {
  if (!value) return "";
  const key = String(value).trim().toLowerCase();
  if (key === "defect") return "scrap";
  if (key === "failed qc" || key === "failedqc" || key === "failed_qc" || key === "qc failed")
    return "failedQc";
  return Object.prototype.hasOwnProperty.call(OUTWARD_TYPE_LABELS, key) ? key : key;
}

const getSalesApprovalStatus = (row = {}) => {
  const status = String(
    row?.approval_status ||
      row?.approvalStatus ||
      row?.status ||
      "",
  )
    .trim()
    .toUpperCase();

  if (status === "PENDING_MANAGEMENT") {
    return {
      label: "Pending Management Approval",
      className:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
    };
  }

  if (status === "APPROVED" || status === "MANAGEMENT_APPROVED") {
    return {
      label: "Sold",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
    };
  }

  if (status === "MANAGEMENT_REJECTED") {
    return {
      label: "Management Rejected",
      className:
        "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
    };
  }

  return {
    label:
      status
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "New",
    className:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
  };
};

function OutwardPage() {
  const { openCostDetails, costDetailsPage } = useCostDetails();

  const { user } = useAuth();
  const location = useLocation();

  const canManageOutward =
    canWork(user, "outward");

  const activeRole = String(
    user?.active_role ||
      user?.activeRole ||
      user?.role ||
      ""
  )
    .trim()
    .toLowerCase();

  const canRequestReplacement =
    activeRole === "inventory" ||
    activeRole === "admin";

  /*
   * Engineer Scrap endpoint is intentionally restricted by the backend
   * to Engineer/Admin. Do not call it for Management, Finance, Manager,
   * Procurement, or Inventory because that produces a valid but noisy 403.
   */
  const canLoadEngineerScrap =
    activeRole === "engineer" ||
    activeRole === "admin";

  /*
   * Management uses Outward only for Sales approval/result visibility.
   * It does not need Inward/QC data.
   */
  const shouldLoadInwardQc =
    activeRole !== "management";
  const [outwardData, setOutwardData] = useState([]);
  const [outwardPage, setOutwardPage] = useState(1);
  const [outwardDisplayedCount, setOutwardDisplayedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTab, setSelectedTab] = useState(
    activeRole === "management" ? "sales" : "scrap"
  );

  useEffect(() => {
    const refreshSales = () => {
      void loadOutwardData();
    };

    window.addEventListener("salesUpdated", refreshSales);
    window.addEventListener("notificationsUpdated", refreshSales);
    window.addEventListener("procurementUpdated", refreshSales);
    window.addEventListener("procurement:changed", refreshSales);
    window.addEventListener("inwardUpdated", refreshSales);

    return () => {
      window.removeEventListener("salesUpdated", refreshSales);
      window.removeEventListener("notificationsUpdated", refreshSales);
      window.removeEventListener("procurementUpdated", refreshSales);
      window.removeEventListener("procurement:changed", refreshSales);
      window.removeEventListener("inwardUpdated", refreshSales);
    };
  }, []);

  useEffect(() => {
    const requestedTab = String(
      location.state?.openTab ||
        location.state?.activeTab ||
        "",
    )
      .trim()
      .toLowerCase();

    if (requestedTab === "sales") {
      setSelectedTab("sales");
    }
  }, [location.state]);
  const [showScrapForm, setShowScrapForm] = useState(false);
  const [components, setComponents] = useState([]);
  const [scrapForm, setScrapForm] = useState({
    outDate: "",
    productName: "",
    typeOfOutward: OUTWARD_TYPE_LABELS.scrap,
    remarks: "",
  });
  const [formError, setFormError] = useState("");
  const [savingScrap, setSavingScrap] = useState(false);
  const [replacementSavingId, setReplacementSavingId] = useState(null);

  const [replacementDialogRow, setReplacementDialogRow] = useState(null);
  const [replacementExpectedDelivery, setReplacementExpectedDelivery] = useState("");
  const [replacementDialogError, setReplacementDialogError] = useState("");

  const [refundDialogRow, setRefundDialogRow] = useState(null);
  const [refundSavingId, setRefundSavingId] = useState(null);
  const [refundDialogError, setRefundDialogError] = useState("");

  const [restoreSavingId, setRestoreSavingId] = useState(null);

  const scrapSubmitLockRef = useRef(false);
  const [scrapRejectDetails, setScrapRejectDetails] = useState(null);

  // MR-linked Engineer Scrap details shown when Component is clicked.
  const [scrapComponentDetails, setScrapComponentDetails] = useState(null);

  function getComponentDisplayLabel(
    component,
  ) {
    if (!component) {
      return "";
    }

    const code = String(
      component?.component_id ||
        component?.component_code ||
        component?.code ||
        "",
    ).trim();

    const name = String(
      component?.name ||
        component?.component_name ||
        "",
    ).trim();

    if (code && name) {
      return `${code} - ${name}`;
    }

    return name || code;
  }

  function getOutwardComponentDisplay(
    row,
  ) {
    const rowCode = String(
      row?.component_code ||
        row?.componentCode ||
        (
          typeof row?.component ===
          "object"
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
          typeof row?.component ===
          "object"
            ? row.component?.name ||
              row.component?.component_name ||
              ""
            : ""
        ) ||
        row?.productName ||
        row?.product_name ||
        (
          typeof row?.component ===
          "string"
            ? row.component
            : ""
        ) ||
        "",
    ).trim();

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
     * Existing old Scrap rows can have only "propeller".
     * Resolve by component name so they also display ID + Name.
     */
    const normalizedName =
      rawName.toLowerCase();

    const matchedComponent =
      components.find(
        (component) =>
          String(
            component?.name ||
              component?.component_name ||
              "",
          )
            .trim()
            .toLowerCase() ===
          normalizedName,
      );

    if (matchedComponent) {
      return (
        getComponentDisplayLabel(
          matchedComponent,
        ) ||
        rawName
      );
    }

    return rawName || rowCode || "-";
  }

  function getComponentHsn(row) {
    const rawComponent = row?.component;
    const references = [
      row?.component_id,
      row?.componentId,
      row?.component_code,
      row?.componentCode,
      typeof rawComponent === "object" ? rawComponent?.id : rawComponent,
      typeof rawComponent === "object" ? rawComponent?.component_id : "",
    ].filter((value) => value !== undefined && value !== null);
    const match = components.find((component) =>
      [
        component?.id,
        component?.component_id,
        component?.component_code,
        component?.code,
        component?.name,
        component?.component_name,
      ].some((value) => references.some((reference) => String(value) === String(reference))),
    );

    return (
      match?.hsn_numbers ||
      match?.hsn_no ||
      match?.hsn ||
      row?.hsn_numbers ||
      row?.hsn_no ||
      row?.hsn ||
      "-"
    );
  }

  function getScrapComponentNameOnly(
    row = {},
  ) {
    const isMrScrapSummary = (value) =>
      /(?:\d+\s+)?scrap\s+item\(s\)\s+from\s+mr[-\s:]/i.test(
        String(value || "").trim(),
      );

    const cleanName = (value) => {
      const text = String(value || "").trim();

      if (!text || text === "-" || isMrScrapSummary(text)) {
        return "";
      }

      // Component labels can be stored as "CMP-001 - Propeller".
      // The Scrap table and popup must show only "Propeller".
      const separator = " - ";
      const separatorIndex = text.indexOf(separator);

      return separatorIndex >= 0
        ? text.slice(separatorIndex + separator.length).trim() || text
        : text;
    };

    /*
     * Do not use Engineer-Scrap summary product_name as the component name.
     * Example of the summary we intentionally reject:
     * "7 Scrap item(s) from MR-260812-00005".
     *
     * Resolve the actual component FK/code from the component master first.
     */
    const rawComponent = row?.component;

    const identifiers = [
      row?.componentId,
      row?.component_id,
      row?.component_code,
      row?.componentCode,
      typeof rawComponent === "object"
        ? rawComponent?.id ?? rawComponent?.pk
        : rawComponent,
      typeof rawComponent === "object"
        ? rawComponent?.component_id ||
          rawComponent?.component_code ||
          rawComponent?.code
        : "",
    ]
      .filter(
        (value) =>
          value !== undefined &&
          value !== null &&
          String(value).trim() !== "" &&
          !isMrScrapSummary(value),
      )
      .map((value) => String(value).trim().toLowerCase());

    const matchedComponent = components.find((component) => {
      const candidateValues = [
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
            String(value).trim() !== "",
        )
        .map((value) => String(value).trim().toLowerCase());

      return identifiers.some((identifier) =>
        candidateValues.includes(identifier),
      );
    });

    if (matchedComponent) {
      const masterName = cleanName(
        matchedComponent?.name ||
          matchedComponent?.component_name,
      );

      if (masterName) {
        return masterName;
      }
    }

    const directName = cleanName(
      row?.component_name ||
        row?.componentName ||
        (typeof rawComponent === "object"
          ? rawComponent?.name || rawComponent?.component_name
          : ""),
    );

    if (directName) {
      return directName;
    }

    if (
      typeof rawComponent === "string" &&
      !/^\d+$/.test(rawComponent.trim())
    ) {
      const componentText = cleanName(rawComponent);
      if (componentText) {
        return componentText;
      }
    }

    const productName = cleanName(
      row?.productName || row?.product_name,
    );

    return productName || "-";
  }



  function getScrapDispositionMetadata(
    row = {},
  ) {
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
        const parsed =
          JSON.parse(raw);

        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          return parsed;
        }
      } catch (_error) {
        // Ignore invalid legacy metadata.
      }
    }

    return {};
  }


  function getScrapItemComponentName(
    item = {},
    fallbackRow = {},
  ) {
    const isSummary = (value) =>
      /(?:\d+\s+)?scrap\s+item\(s\)(?:\s+from)?\s+mr[-\s:]/i.test(
        String(value || "").trim(),
      );

    const cleanName = (value) => {
      const text =
        String(value || "").trim();

      if (
        !text ||
        text === "-" ||
        isSummary(text) ||
        /^component\s+\d+$/i.test(
          text,
        )
      ) {
        return "";
      }

      const separator = " - ";
      const separatorIndex =
        text.indexOf(separator);

      return separatorIndex >= 0
        ? text
            .slice(
              separatorIndex +
                separator.length,
            )
            .trim() || text
        : text;
    };

    const rawComponent =
      item?.component;

    const directName = cleanName(
      item?.component_name ||
        item?.componentName ||
        item?.name ||
        item?.label ||
        (
          rawComponent &&
          typeof rawComponent ===
            "object"
            ? rawComponent?.name ||
              rawComponent
                ?.component_name
            : ""
        ),
    );

    if (directName) {
      return directName;
    }

    const identifiers = [
      item?.component_id,
      item?.componentId,
      item?.component_code,
      item?.componentCode,
      typeof rawComponent ===
      "object"
        ? rawComponent?.id ??
          rawComponent?.pk
        : rawComponent,
      typeof rawComponent ===
      "object"
        ? rawComponent
            ?.component_id ||
          rawComponent
            ?.component_code ||
          rawComponent?.code
        : "",
    ]
      .filter(
        (value) =>
          value !== undefined &&
          value !== null &&
          String(value).trim() !== "",
      )
      .map((value) =>
        String(value)
          .trim()
          .toLowerCase(),
      );

    const matchedComponent =
      components.find(
        (component) => {
          const values = [
            component?.id,
            component?.pk,
            component?.component_id,
            component?.component_code,
            component?.code,
          ]
            .filter(
              (value) =>
                value !== undefined &&
                value !== null &&
                String(value).trim() !== "",
            )
            .map((value) =>
              String(value)
                .trim()
                .toLowerCase(),
            );

          return identifiers.some(
            (identifier) =>
              values.includes(
                identifier,
              ),
          );
        },
      );

    if (matchedComponent) {
      const name = cleanName(
        matchedComponent?.name ||
          matchedComponent
            ?.component_name,
      );

      if (name) {
        return name;
      }
    }

    return getScrapComponentNameOnly(
      fallbackRow,
    );
  }


  function getScrapComponentGroups(
    row = {},
  ) {
    const metadata =
      getScrapDispositionMetadata(row);

    const scrapItems =
      Array.isArray(
        metadata?.scrap_items,
      )
        ? metadata.scrap_items
        : Array.isArray(
            metadata?.scrapItems,
          )
        ? metadata.scrapItems
        : [];

    const groups = new Map();

    scrapItems.forEach(
      (item, index) => {
        const componentName =
          getScrapItemComponentName(
            item,
            row,
          );

        const serialNumbers =
          normalizeScrapSerials(
            item?.serial_numbers ??
              item?.serialNumbers ??
              [],
          );

        const quantity =
          serialNumbers.length ||
          Math.max(
            Number(
              item?.quantity ??
                item?.qty ??
                0,
            ) || 0,
            0,
          );

        const componentReference =
          item?.component_id ??
          item?.componentId ??
          (
            typeof item?.component ===
            "object"
              ? item.component?.id ??
                item.component?.pk ??
                item.component
                  ?.component_id ??
                item.component
                  ?.component_code
              : item?.component
          );

        const key = String(
          componentReference ||
            componentName ||
            `component-${index}`,
        )
          .trim()
          .toLowerCase();

        const existing =
          groups.get(key) || {
            componentName:
              componentName || "-",
            quantity: 0,
            serialNumbers: [],
          };

        existing.quantity += quantity;
        existing.serialNumbers =
          Array.from(
            new Set([
              ...existing.serialNumbers,
              ...serialNumbers,
            ]),
          );

        if (
          (!existing.componentName ||
            existing.componentName ===
              "-") &&
          componentName
        ) {
          existing.componentName =
            componentName;
        }

        groups.set(key, existing);
      },
    );

    if (groups.size > 0) {
      return Array.from(
        groups.values(),
      );
    }

    const fallbackSerials =
      normalizeScrapSerials(
        row?.serial_numbers ??
          row?.serialNumbers ??
          [],
      );

    return [
      {
        componentName:
          getScrapComponentNameOnly(
            row,
          ),
        quantity:
          fallbackSerials.length ||
          Math.max(
            Number(
              row?.qty ??
                row?.quantity ??
                row?.no_of_components ??
                row?.noOfComponents ??
                0,
            ) || 0,
            0,
          ),
        serialNumbers:
          fallbackSerials,
      },
    ];
  }


  function getScrapSerialRows(
    row = {},
  ) {
    return getScrapComponentGroups(
      row,
    ).flatMap((group) =>
      group.serialNumbers.map(
        (serial) => ({
          serial,
          componentName:
            group.componentName ||
            "-",
        }),
      ),
    );
  }


  function renderScrapComponentWithQty(
    row,
  ) {
    const groups =
      getScrapComponentGroups(row);

    const summary = groups
      .filter(
        (group) =>
          group &&
          String(
            group.componentName || "",
          ).trim() &&
          String(
            group.componentName || "",
          ).trim() !== "-",
      )
      .map(
        (group) =>
          `${String(
            group.componentName || "-",
          ).trim()}-${Number(
            group.quantity ?? 0,
          ) || 0}`,
      )
      .join(", ");

    return (
      <span
        className="inline-block max-w-[300px] break-words text-center text-[14px] font-semibold leading-5 text-foreground"
        title={summary || "-"}
      >
        {summary || "-"}
      </span>
    );
  }




  function normalizeScrapSerials(value) {
    if (
      value === undefined ||
      value === null
    ) {
      return [];
    }

    if (Array.isArray(value)) {
      return Array.from(
        new Set(
          value
            .flatMap(
              normalizeScrapSerials,
            )
            .map((serial) =>
              String(
                serial || "",
              ).trim(),
            )
            .filter(Boolean),
        ),
      );
    }

    if (
      typeof value === "string"
    ) {
      const raw =
        value.trim();

      if (!raw) {
        return [];
      }

      try {
        const parsed =
          JSON.parse(raw);

        if (Array.isArray(parsed)) {
          return normalizeScrapSerials(
            parsed,
          );
        }
      } catch (_error) {
        // Fall back to delimited text.
      }

      return raw
        .split(/[,;|\n]/)
        .map((serial) =>
          serial.trim(),
        )
        .filter(Boolean);
    }

    return [
      String(value).trim(),
    ].filter(Boolean);
  }


  function getScrapRequestedBy(row = {}) {
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
  }


  function getScrapMaterialRequestDisplay(row = {}) {
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
  }


  function getScrapSourceDisplay(row = {}) {
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
  }


  function isMrLinkedEngineerScrap(
    row = {},
  ) {
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
  }


  function openScrapComponentDetails(row) {
    if (row) openCostDetails("outward", row);
  }


  function normalizeOutwardItem(item) {
    const rawTypeOfOutward =
  item.typeOfOutward ||
  item.outward_type ||
  item.type ||
  (item.status === "Failed" || item.customer === "Scrap"
    ? OUTWARD_TYPE_LABELS.scrap
    : OUTWARD_TYPE_LABELS.failedQc);
    const typeOfOutward = normalizeTypeOfOutward(rawTypeOfOutward);
    const type = normalizeOutwardTypeKey(
  item.type ||
  item.outward_type ||
  item.typeOfOutward ||
  typeOfOutward
);

    return {
      ...item,
      outDate: item.outDate || item.date || item.out_date || "",
      time: item.time || "",
      gatePass: item.gatePass || item.gate_pass || item.code || "",
      productName:
        (
          item.component_code &&
          item.component_name
            ? `${item.component_code} - ${item.component_name}`
            : item.productName ||
              item.product_name ||
              item.component_name ||
              item.component ||
              ""
        ),
      client: item.client || item.customer || "",
      deliverables: item.deliverables || item.reason || item.serialNumber || "",
      typeOfOutward,
      remarks: item.remarks || item.reason || "",
      invoiceNumber: item.invoiceNumber || item.invoice_no || item.invoice_number || "",
      eventName: item.eventName || item.event_name || "",
      noOfComponents: item.noOfComponents || item.no_of_components || item.quantity || "",
      returnDate: item.returnDate || item.return_date || "",

      serialNumbers:
        item.serialNumbers ||
        item.serial_numbers ||
        [],

      serial_numbers:
        item.serial_numbers ||
        item.serialNumbers ||
        [],

      materialRequestNumber:
        item.materialRequestNumber ||
        item.material_request_number ||
        "",

      material_request_number:
        item.material_request_number ||
        item.materialRequestNumber ||
        "",

      scrapOrigin:
        item.scrapOrigin ||
        item.scrap_origin ||
        "",

      scrap_origin:
        item.scrap_origin ||
        item.scrapOrigin ||
        "",

      approvalStatus:
        item.approval_status ||
        item.approvalStatus ||
        "",
      status:
        item.status ||
        item.approval_status ||
        item.approvalStatus ||
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
      type: isQcFailedItem(item) ? "failedQc" : type,
    };
  }

  useEffect(() => {
  loadOutwardData();
  loadComponents();
}, []);

  function normalizeBackendOutward(rows) {
    const array = Array.isArray(rows) ? rows : Array.isArray(rows?.results) ? rows.results : [];
    return array.map(normalizeOutwardItem);
  }

  function normalizeQcFailedItems(entries) {
    const inwardEntries = Array.isArray(entries)
      ? entries
      : Array.isArray(entries?.results)
        ? entries.results
        : [];

    /*
     * One Failed-QC table row represents one Inward component, not one
     * serial number. This gives Procurement one clear replacement action
     * for the exact failed quantity and prevents duplicate replacement POs.
     */
    return inwardEntries.flatMap((entry) => {
      const failedRows = getQcFailedRows(entry);
      if (!failedRows.length) return [];

      const receivedDate =
        entry.received_date ||
        entry.date ||
        entry.created_at ||
        "";

      const componentCode = String(
        entry.component_code ||
          entry.componentCode ||
          entry.component?.component_id ||
          ""
      ).trim();

      const componentName = String(
        entry.component_name ||
          entry.componentName ||
          entry.component?.name ||
          ""
      ).trim();

      const componentLabel =
        componentCode && componentName
          ? `${componentCode} - ${componentName}`
          : componentName ||
            componentCode ||
            "Component";

      const failedQty = failedRows.reduce(
        (total, row) => {
          const raw = Number(
            row?.qty ??
              row?.quantity ??
              row?.failed_quantity ??
              1
          );
          return total +
            (Number.isFinite(raw) && raw > 0
              ? raw
              : 1);
        },
        0
      );

      const serialNumbers = failedRows
        .map((row) =>
          String(
            row?.serialNumber ||
              row?.serial_number ||
              row?.serial ||
              ""
          ).trim()
        )
        .filter(Boolean);

      const inwardLineItems =
        Array.isArray(entry?.line_items)
          ? entry.line_items
          : Array.isArray(entry?.lineItems)
            ? entry.lineItems
            : [];

      const sourceLineItem =
        inwardLineItems[0] || {};

      const failedUnitPrice = Number(
        sourceLineItem?.unit_price ??
          sourceLineItem?.unitPrice ??
          entry?.unit_price ??
          entry?.unitPrice ??
          0
      );

      const failedGstPercentage = Number(
        sourceLineItem?.gst_percentage ??
          sourceLineItem?.gst ??
          entry?.gst_percentage ??
          entry?.gstPercentage ??
          entry?.gst ??
          0
      );

      const failedSubtotal =
        failedQty * failedUnitPrice;

      const failedGstAmount =
        failedSubtotal *
        (failedGstPercentage / 100);

      const failedRefundTotal =
        failedSubtotal +
        failedGstAmount;

      const remarks = Array.from(
        new Set(
          failedRows
            .map((row) =>
              String(
                row?.remarks ||
                  row?.reason ||
                  row?.result ||
                  "QC Failed"
              ).trim()
            )
            .filter(Boolean)
        )
      ).join("; ");

      return [
        normalizeOutwardItem({
          id: `qc-failed-${entry.id}`,
          inwardEntryId: entry.id,
          purchaseOrderId:
            entry.purchase_order?.id ||
            entry.purchase_order ||
            null,
          purchaseOrderNumber:
            entry.purchase_order_number ||
            entry.po_number ||
            "",
          sourceMrNumber:
            entry.source_mr_number ||
            entry.material_request_number ||
            "",
          qcFailedAction:
            entry.qc_failed_action ||
            "NONE",
          refundWorkflowStatus:
            String(
              failedRows.find(
                (failedRow) =>
                  failedRow &&
                  typeof failedRow ===
                    "object" &&
                  failedRow
                    ?.refund_status,
              )?.refund_status ||
                "",
            )
              .trim()
              .toUpperCase(),
          replacementPurchaseOrderId:
            entry.replacement_purchase_order?.id ||
            entry.replacement_purchase_order ||
            null,
          replacementPurchaseOrderNumber:
            entry.replacement_purchase_order_number ||
            "",
          replacementPurchaseOrderStatus:
            entry.replacement_purchase_order_status ||
            "",
          outDate: receivedDate,
          productName: componentLabel,
          component_code: componentCode,
          component_name: componentName,
          typeOfOutward: "Failed QC",
          type: "failedQc",
          status: "Failed",
          failedQty,
          quantity: failedQty,
          qty: failedQty,
          serialNumbers,
          unitPrice: failedUnitPrice,
          gstPercentage:
            failedGstPercentage,
          refundSubtotal:
            failedSubtotal,
          refundGstAmount:
            failedGstAmount,
          refundTotal:
            failedRefundTotal,
          remarks: remarks || "QC Failed",
          invoiceNumber: entry.code || entry.grn || "",
          gatePass: entry.code || entry.grn || "",
          client: "QC Failed",
          deliverables: componentLabel,
          returnDate: "",
        }),
      ];
    });
  }

  function isReturnedReturnableQcFailure(
    row = {},
  ) {
    const metadata =
      row?.inventory_allocations &&
      typeof row.inventory_allocations ===
        "object" &&
      !Array.isArray(
        row.inventory_allocations
      )
        ? row.inventory_allocations
        : {};

    return (
      String(
        metadata?.workflow || ""
      )
        .trim()
        .toUpperCase() ===
      "RETURNABLE_COMPONENT_QC_V1"
    );
  }

  function getReturnableRestoreStatus(
    row = {},
  ) {
    const metadata =
      row?.inventory_allocations &&
      typeof row.inventory_allocations ===
        "object" &&
      !Array.isArray(
        row.inventory_allocations
      )
        ? row.inventory_allocations
        : {};

    return String(
      metadata
        ?.procurement_restore_status ||
        ""
    )
      .trim()
      .toUpperCase();
  }

  function getFailedQcWorkflowLabel(row) {
    if (
      isReturnedReturnableQcFailure(
        row
      )
    ) {
      const restoreStatus =
        getReturnableRestoreStatus(
          row
        );

      const restoreLabels = {
        ACTION_REQUIRED:
          "Return QC Failed - Restore Required",
        PENDING_PROCUREMENT:
          "Restore - Pending Procurement",
        PROCUREMENT_APPROVED:
          "Restore - Procurement Approved",
        PENDING_FINANCE:
          "Restore - Pending Finance",
        FINANCE_APPROVED:
          "Restore - Finance Approved",
        PO_RAISED:
          "Restore PO Raised",
        ORDERED:
          "Restore Ordered",
        PARTIALLY_RESTORED:
          "Restore Partially Returned to Store",
        RESTORE_QC_FAILED:
          "Restore Delivery QC Failed",
        COMPLETED_IN_STORE:
          "Restored to In Store",
      };

      return (
        restoreLabels[
          restoreStatus
        ] ||
        "Return QC Failed - Restore Required"
      );
    }

    const refundWorkflowStatus =
      String(
        row?.refundWorkflowStatus ||
          row?.refund_workflow_status ||
          "",
      )
        .trim()
        .toUpperCase();

    const refundLabels = {
      PENDING_PROCUREMENT:
        "Refund - Pending Procurement",
      PROCUREMENT_APPROVED:
        "Refund - Procurement Approved",
      PENDING_FINANCE:
        "Refund - Pending Finance",
      FINANCE_REJECTED:
        "Refund - Finance Rejected",
      REFUNDED:
        "Refund Completed",
    };

    if (
      refundWorkflowStatus &&
      refundLabels[
        refundWorkflowStatus
      ]
    ) {
      return refundLabels[
        refundWorkflowStatus
      ];
    }

    const replacementStatus = String(
      row?.replacementPurchaseOrderStatus ||
        row?.replacement_purchase_order_status ||
        ""
    )
      .trim()
      .toUpperCase();

    const action = String(
      row?.qcFailedAction ||
        row?.qc_failed_action ||
        "NONE"
    )
      .trim()
      .toUpperCase();

    const labels = {
      REPLACEMENT_PENDING_MANAGER:
        "Replacement - Pending Procurement Approval",
      REPLACEMENT_PENDING_FINANCE:
        "Replacement - Pending Finance",
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
      // REPLACEMENT_RECEIVED means the full replacement PO quantity has
      // already been delivered/received. The original Failed-QC row is
      // therefore resolved and must no longer show QC Pending.
      REPLACEMENT_RECEIVED:
        "Replacement Completed",
    };

    if (replacementStatus && labels[replacementStatus]) {
      return labels[replacementStatus];
    }

    if (action === "REPLACEMENT_REQUESTED") {
      return "Replacement Requested";
    }

    if (action === "RETURN_REQUESTED") {
      return "Refund Completed";
    }

    return "QC Failed - Action Required";
  }

  function getTodayDateInputValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(
      now.getMonth() + 1
    ).padStart(2, "0");
    const day = String(
      now.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function handleRequestReplacement(row) {
    const inwardEntryId = row?.inwardEntryId;

    if (!inwardEntryId || !canRequestReplacement) {
      return;
    }

    if (
      replacementSavingId ===
      String(inwardEntryId)
    ) {
      return;
    }

    setReplacementDialogRow(row);
    setReplacementExpectedDelivery("");
    setReplacementDialogError("");
  }

  function closeReplacementDialog() {
    if (replacementSavingId) {
      return;
    }

    setReplacementDialogRow(null);
    setReplacementExpectedDelivery("");
    setReplacementDialogError("");
  }

  async function confirmRequestReplacement() {
    const row = replacementDialogRow;
    const inwardEntryId = row?.inwardEntryId;

    if (!row || !inwardEntryId) {
      return;
    }

    const expectedDeliveryDate =
      String(
        replacementExpectedDelivery || ""
      ).trim();

    if (!expectedDeliveryDate) {
      setReplacementDialogError(
        "Expected delivery date is required."
      );
      return;
    }

    if (
      expectedDeliveryDate <
      getTodayDateInputValue()
    ) {
      setReplacementDialogError(
        "Expected delivery date cannot be earlier than today."
      );
      return;
    }

    try {
      setReplacementDialogError("");
      setReplacementSavingId(
        String(inwardEntryId)
      );

      await fetchAuthenticatedJson(
        `${config.baseURL}/inward/${inwardEntryId}/request-replacement/`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            expected_delivery_date:
              expectedDeliveryDate,
          }),
        }
      );

      setReplacementDialogRow(null);
      setReplacementExpectedDelivery("");
      setReplacementDialogError("");

      await loadOutwardData();
    } catch (error) {
      console.error(
        "Failed to request QC replacement:",
        error
      );

      setReplacementDialogError(
        error?.message ||
          "Failed to send the Replacement request to Procurement."
      );
    } finally {
      setReplacementSavingId(null);
    }
  }

  function handleRequestRefund(row) {
    const inwardEntryId =
      row?.inwardEntryId;

    const hasMr = Boolean(
      String(
        row?.sourceMrNumber || ""
      ).trim()
    );

    if (
      !inwardEntryId ||
      hasMr ||
      !canRequestReplacement
    ) {
      return;
    }

    setRefundDialogRow(row);
    setRefundDialogError("");
  }

  async function handleRequestRestore(row) {
    const outwardId =
      row?.id ??
      row?.backendId ??
      row?.pk;

    if (
      !outwardId ||
      !canRequestReplacement ||
      !isReturnedReturnableQcFailure(
        row
      )
    ) {
      return;
    }

    if (
      restoreSavingId ===
      String(outwardId)
    ) {
      return;
    }

    try {
      setRestoreSavingId(
        String(outwardId)
      );

      await fetchAuthenticatedJson(
        `${config.baseURL}/outward/${encodeURIComponent(
          outwardId
        )}/request-returnable-restore/`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      setOutwardData(
        (previous) =>
          previous.map(
            (item) => {
              const itemId =
                item?.id ??
                item?.backendId ??
                item?.pk;

              if (
                String(itemId) !==
                String(outwardId)
              ) {
                return item;
              }

              const metadata =
                item
                  ?.inventory_allocations &&
                typeof item
                  .inventory_allocations ===
                  "object" &&
                !Array.isArray(
                  item.inventory_allocations
                )
                  ? {
                      ...item.inventory_allocations,
                    }
                  : {};

              metadata.procurement_restore_status =
                "PENDING_PROCUREMENT";

              return {
                ...item,
                inventory_allocations:
                  metadata,
                restoreRequested:
                  true,
              };
            }
          )
      );

      await loadOutwardData();

      window.dispatchEvent(
        new Event(
          "notificationsUpdated"
        )
      );

      window.dispatchEvent(
        new Event(
          "procurementUpdated"
        )
      );
    } catch (error) {
      console.error(
        "Failed to request Restore:",
        error
      );

      alert(
        error?.message ||
          "Failed to send Restore to Procurement."
      );
    } finally {
      setRestoreSavingId(null);
    }
  }

  function closeRefundDialog() {
    if (refundSavingId) {
      return;
    }

    setRefundDialogRow(null);
    setRefundDialogError("");
  }

  async function confirmRequestRefund() {
    const row = refundDialogRow;
    const inwardEntryId =
      row?.inwardEntryId;

    if (
      !row ||
      !inwardEntryId
    ) {
      return;
    }

    try {
      setRefundDialogError("");
      setRefundSavingId(
        String(inwardEntryId)
      );

      const result =
        await fetchAuthenticatedJson(
          `${config.baseURL}/inward/${inwardEntryId}/request-refund/`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({}),
          }
        );

      /*
       * Refund request is NOT financially completed here.
       *
       * Inventory -> Refund
       * -> Procurement approval
       * -> Finance approval
       * -> only then Direct PO quantity/value is deducted.
       */
      setOutwardData((previous) =>
        previous.map((item) => {
          if (
            String(
              item?.inwardEntryId || ""
            ) !==
            String(inwardEntryId)
          ) {
            return item;
          }

          return {
            ...item,
            refundWorkflowStatus:
              "PENDING_PROCUREMENT",
            refund_workflow_status:
              "PENDING_PROCUREMENT",
            refundCompleted: false,
            refundResult:
              result?.refund || null,
          };
        })
      );

      setRefundDialogRow(null);
      setRefundDialogError("");

      // Reload authoritative Inward/QC state.
      await loadOutwardData();

      // Tell an already-open Purchase Order page to fetch the
      // reduced quantity and recalculated total immediately.
      window.dispatchEvent(
        new Event(
          "procurementUpdated"
        )
      );

      window.dispatchEvent(
        new CustomEvent(
          "procurement:changed",
          {
            detail: {
              type:
                "directPoRefund",
            },
          }
        )
      );
    } catch (error) {
      console.error(
        "Failed to process Direct PO refund:",
        error
      );

      setRefundDialogError(
        error?.message ||
          "Failed to process the refund."
      );
    } finally {
      setRefundSavingId(null);
    }
  }

 async function loadComponents() {
  try {
    const response = await fetchAuthenticatedJson(
      `${config.baseURL}/components/components/`
    );

    console.log("Components:", response);

    const data = Array.isArray(response)
      ? response
      : response.results || [];

    setComponents(data);
  } catch (err) {
    console.error("Error loading components:", err);
  }
}


  async function loadOutwardData() {
    setLoading(true);
    setLoadError("");

    try {
      const [
        backendOutward,
        inwardEntries,
        engineerScrapRows,
      ] = await Promise.all([
        fetchAuthenticatedJson(
          `${config.baseURL}/outward/`,
        ).catch((error) => {
          console.warn(
            "Outward API unavailable:",
            error,
          );
          return null;
        }),
        shouldLoadInwardQc
          ? fetchAuthenticatedJson(
              `${config.baseURL}/inward/`,
            ).catch((error) => {
              console.warn(
                "Inward API unavailable for QC failures:",
                error,
              );
              return [];
            })
          : Promise.resolve([]),

        /*
         * IMPORTANT:
         * /outward/engineer-scrap/ is restricted to Engineer/Admin.
         * Call it only for those roles. Other roles receive an expected
         * 403, which is unnecessary for the normal Outward/Sales screen.
         */
        canLoadEngineerScrap
          ? fetchAuthenticatedJson(
              `${config.baseURL}/outward/engineer-scrap/`,
            ).catch((error) => {
              console.warn(
                "Engineer Scrap detail API unavailable:",
                error,
              );
              return [];
            })
          : Promise.resolve([]),
      ]);

      const serverOutward =
        normalizeBackendOutward(
          backendOutward,
        );

      const engineerOutward =
        normalizeBackendOutward(
          engineerScrapRows,
        );

      const engineerById =
        new Map(
          engineerOutward
            .map((item) => [
              String(
                item?.id ??
                  item?.pk ??
                  item?.backendId ??
                  "",
              ),
              item,
            ])
            .filter(
              ([key]) => key,
            ),
        );

      const mergedServerOutward =
        serverOutward.map(
          (item) => {
            const key = String(
              item?.id ??
                item?.pk ??
                item?.backendId ??
                "",
            );

            const engineerDetail =
              engineerById.get(key);

            return engineerDetail
              ? {
                  ...item,
                  ...engineerDetail,
                  type:
                    engineerDetail
                      ?.type ||
                    item?.type,
                  typeOfOutward:
                    engineerDetail
                      ?.typeOfOutward ||
                    item?.typeOfOutward,
                }
              : item;
          },
        );

      const mergedIds =
        new Set(
          mergedServerOutward
            .map((item) =>
              String(
                item?.id ??
                  item?.pk ??
                  item?.backendId ??
                  "",
              ),
            )
            .filter(Boolean),
        );

      const engineerOnlyRows =
        engineerOutward.filter(
          (item) => {
            const key = String(
              item?.id ??
                item?.pk ??
                item?.backendId ??
                "",
            );

            return (
              key &&
              !mergedIds.has(key)
            );
          },
        );

      console.log(
        "Server Outward:",
        mergedServerOutward,
      );

      const qcScrap =
        normalizeQcFailedItems(
          inwardEntries,
        );

      const normalizedMock =
        Array.isArray(mockOutward)
          ? mockOutward.map(
              normalizeOutwardItem,
            )
          : [];

      const deletedIds =
        new Set(
          getDeletedOutwardRowIds()
            .map(String),
        );

      const authoritativeRows = [
        ...mergedServerOutward,
        ...engineerOnlyRows,
      ];

      const mergedRows = [
        ...(qcScrap || []),
        ...(authoritativeRows.length
          ? authoritativeRows
          : normalizedMock),
      ];

      setOutwardData(
        mergedRows.filter(
          (row) =>
            !deletedIds.has(
              String(row.id),
            ),
        ),
      );
    } catch (err) {
      console.error(
        "Error loading outward data:",
        err,
      );

      const defaultRows =
        Array.isArray(mockOutward)
          ? mockOutward.map(
              normalizeOutwardItem,
            )
          : [];

      setOutwardData(defaultRows);
      setLoadError(
        err?.message ||
          "Unable to load Outward records. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function getScrapApprovalStatus(row) {
    const rawStatus = String(
      row?.approvalStatus ||
      row?.approval_status ||
      row?.status ||
      "",
    )
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");

    if (rawStatus === "PENDING_FINANCE") {
      return "PENDING_FINANCE";
    }

    if (
      rawStatus === "REQUESTED" ||
      rawStatus === "PENDING_MANAGER"
    ) {
      return "PENDING_MANAGER";
    }

    if (rawStatus === "MANAGER_APPROVED") {
      return "MANAGER_APPROVED";
    }

    if (rawStatus === "APPROVED") {
      return "APPROVED";
    }

    if (rawStatus === "FINANCE_REJECTED") {
      return "FINANCE_REJECTED";
    }

    if (
      rawStatus === "REJECTED" ||
      rawStatus === "MANAGER_REJECTED"
    ) {
      return "MANAGER_REJECTED";
    }

    return rawStatus || "PENDING_MANAGER";
  }

  function cleanScrapUserName(value) {
    const raw = String(
      value || "",
    ).trim();

    if (!raw) {
      return "Manager";
    }

    if (raw.includes("@")) {
      return (
        raw.split("@")[0]?.trim() ||
        "Manager"
      );
    }

    return raw;
  }

  async function openScrapRejectDetails(row) {
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
          "Manager",
        ),
      reason:
        source?.rejection_reason ||
        source?.rejectionReason ||
        row?.rejection_reason ||
        row?.rejectionReason ||
        "No rejection reason was provided.",
    });
  }

  function getScrapApprovalLabel(row) {
    const status =
      getScrapApprovalStatus(row);

    if (status === "PENDING_FINANCE") {
      return "Pending Finance";
    }

    if (status === "PENDING_MANAGER") {
      return "Pending Manager";
    }

    if (status === "MANAGER_APPROVED") {
      return "Manager Approved";
    }

    if (status === "APPROVED") {
      return row?.movedToInventory || row?.moved_to_inventory
        ? "Scrap Moved"
        : "Approved";
    }

    if (status === "FINANCE_REJECTED") {
      return "Finance Rejected";
    }

    if (status === "MANAGER_REJECTED") {
      return "Manager Rejected";
    }

    return status
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) =>
        letter.toUpperCase(),
      );
  }


  function getScrapRequesterName() {
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
  }


  async function createOutwardRecord(payload) {
    const result = await fetchAuthenticatedJson(`${config.baseURL}/outward/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (result === null || result === undefined) {
      return normalizeOutwardItem({
        ...payload,
        id: Date.now(),
      });
    }

    const created = Array.isArray(result)
      ? result[0]
      : Array.isArray(result.results)
        ? result.results[0]
        : result;

    return normalizeOutwardItem({
      ...payload,
      ...created,
      id: created?.id ?? payload.id ?? Date.now(),
    });
  }

  const scrapItems = outwardData.filter((item) => item.type === "scrap" && !isQcFailedItem(item));
  const failedQcItems = outwardData.filter(
    (item) => item.type === "failedQc" || (item.type === "scrap" && isQcFailedItem(item)),
  );
  const getSalesMrNumber = (row = {}) =>
    String(
      row?.materialRequestNumber ||
        row?.material_request_number ||
        row?.material_request_id ||
        row?.materialRequestId ||
        (
          typeof row?.material_request === "object"
            ? row.material_request?.material_request_id ||
              row.material_request?.request_id ||
              row.material_request?.id
            : row?.material_request
        ) ||
        ""
    ).trim();

  const getSalesComponentName = (row = {}) => {
    const label =
      getOutwardComponentDisplay(row);

    return String(label || "")
      .trim() || "Component";
  };

  const groupSalesRowsByMr = (rows = []) => {
    const groups = new Map();

    rows.forEach((row) => {
      const mrNumber =
        getSalesMrNumber(row);

      /*
       * One MR can contain several component OutwardEntry records.
       * Those backend rows are intentionally retained for exact serial /
       * component traceability, but the Sales page must show the Sale
       * as ONE MR-level line.
       *
       * Keep invoice in the key so a future partial/second Sale against
       * the same MR remains a separate legitimate sales transaction.
       */
      const invoice = String(
        row?.invoiceNumber ||
          row?.invoice_number ||
          row?.invoice_no ||
          ""
      ).trim();

      const groupKey = [
        mrNumber || `OUT-${row?.id || ""}`,
        invoice,
      ].join("|");

      const current =
        groups.get(groupKey) || {
          ...row,
          id:
            `sales-${mrNumber || row?.id || "row"}-${invoice || "batch"}`,
          materialRequestNumber:
            mrNumber || "-",
          material_request_number:
            mrNumber || "-",
          componentRows: [],
          componentNames: [],
          componentCount: 0,
          quantity: 0,
          qty: 0,
        };

      current.componentRows.push(row);

      const componentName =
        getSalesComponentName(row);

      if (
        componentName &&
        !current.componentNames.includes(
          componentName
        )
      ) {
        current.componentNames.push(
          componentName
        );
      }

      current.componentCount =
        current.componentNames.length;

      /*
       * Every component row in one Sales batch carries the DRONE / assembly
       * sale quantity. Therefore use MAX, not SUM.
       *
       * Example:
       *   MR has Battery, Display, Motherboard
       *   Sale Qty = 1
       *
       * Backend: 3 component rows each Qty 1
       * UI:      ONE MR row Qty 1
       */
      current.quantity = Math.max(
        Number(current.quantity || 0),
        Number(
          row?.quantity ||
            row?.qty ||
            row?.noOfComponents ||
            row?.no_of_components ||
            0
        ) || 0,
      );
      current.qty =
        current.quantity;

      current.productName =
        current.componentCount === 1
          ? current.componentNames[0]
          : `${current.componentCount} Components`;

      current.componentSummary =
        current.componentNames.join(", ");

      const rowStatus = String(
        row?.approval_status ||
          row?.approvalStatus ||
          row?.status ||
          ""
      )
        .trim()
        .toUpperCase();

      /*
       * All lines from one approval batch should share a status.
       * Prefer the strongest/final state if mixed legacy rows exist.
       */
      const statusPriority = {
        APPROVED: 4,
        MANAGEMENT_APPROVED: 4,
        SOLD: 4,
        PENDING_MANAGEMENT: 3,
        MANAGEMENT_REJECTED: 2,
        REJECTED: 2,
      };

      const currentStatus = String(
        current?.approval_status ||
          current?.approvalStatus ||
          current?.status ||
          ""
      )
        .trim()
        .toUpperCase();

      if (
        Number(
          statusPriority[rowStatus] || 0
        ) >=
        Number(
          statusPriority[currentStatus] || 0
        )
      ) {
        current.approval_status =
          rowStatus;
        current.approvalStatus =
          rowStatus;
        current.status =
          rowStatus;
      }

      groups.set(
        groupKey,
        current,
      );
    });

    return Array.from(
      groups.values(),
    );
  };

  const rawSalesItems = outwardData.filter(
    (item) =>
      item.type === "sales" ||
      String(
        item.outward_type || ""
      )
        .trim()
        .toUpperCase() === "SALES",
  );

  /*
   * OUTWARD -> SALES is the completed sales register.
   * Pending requests are handled in Management Notifications and In Drone.
   * Therefore only Management-approved / Sold transactions appear here.
   */
  const salesItems =
    groupSalesRowsByMr(
      rawSalesItems,
    ).filter((item) =>
      [
        "APPROVED",
        "MANAGEMENT_APPROVED",
        "SOLD",
      ].includes(
        String(
          item?.approval_status ||
            item?.approvalStatus ||
            item?.status ||
            ""
        )
          .trim()
          .toUpperCase(),
      ),
    );


  function updateForm(e, setter) {
    const { name, value } = e.target;
    setter((prev) => ({ ...prev, [name]: value }));
    setFormError("");
  }

  async function saveScrapItem(e) {
    e.preventDefault();

    if (
      !canManageOutward ||
      scrapSubmitLockRef.current
    ) {
      return;
    }

    if (!scrapForm.outDate || !scrapForm.productName) {
      setFormError("Please fill in Out Date and Product Name.");
      return;
    }

    const selectedComponent =
      components.find(
        (component) => {
          const label =
            getComponentDisplayLabel(
              component,
            );

          const name = String(
            component?.name ||
              component?.component_name ||
              "",
          ).trim();

          return (
            label ===
              scrapForm.productName ||
            name ===
              scrapForm.productName ||
            String(
              component?.id ??
                component?.pk ??
                "",
            ) ===
              String(
                scrapForm.productName,
              )
          );
        },
      ) || null;

    const selectedComponentLabel =
      getComponentDisplayLabel(
        selectedComponent,
      ) ||
      scrapForm.productName;

    const payload = {
      outDate: scrapForm.outDate,
      out_date: scrapForm.outDate,
      date: scrapForm.outDate,
      // Preserve the Component FK and the same ID + Name label
      // used by Engineer Scrap.
      component:
        selectedComponent?.id ??
        selectedComponent?.pk ??
        null,

      product_name:
        selectedComponentLabel,

      productName:
        selectedComponentLabel,
      typeOfOutward: normalizeTypeOfOutwardApi(scrapForm.typeOfOutward),
      type: normalizeTypeOfOutwardApi(scrapForm.typeOfOutward),

      /*
       * IMPORTANT:
       * For SCRAP, do not send status from React.
       *
       * Backend creates:
       * approval_status = PENDING_MANAGER
       * status          = PENDING_MANAGER
       *
       * Manager acts first from Notifications. After Manager approval,
       * the backend advances the Scrap to PENDING_FINANCE.
       */
      ...(selectedTab === "failedQc"
        ? { status: "Failed" }
        : {}),

      remarks: scrapForm.remarks,
      customer:
        selectedTab === "scrap"
          ? "Scrap"
          : scrapForm.typeOfOutward === OUTWARD_TYPE_LABELS.defect
            ? "Defect"
            : "QC Scrap",
    };

    scrapSubmitLockRef.current = true;
    setSavingScrap(true);

    try {
      const created =
        await createOutwardRecord(
          payload,
        );

      /*
       * Manager-first Scrap notification + email are backend-owned.
       * Avoid an extra browser notification request here.
       */
      if (selectedTab === "scrap") {
        window.dispatchEvent(
          new Event("notificationsUpdated"),
        );
      }

      /*
       * Use the backend response immediately.
       * It should already contain:
       * approval_status = PENDING_MANAGER
       * status          = PENDING_MANAGER
       */
      setOutwardData(
        (prev) => [
          created,
          ...prev,
        ],
      );

      setShowScrapForm(false);
      setScrapForm({
        outDate: "",
        productName: "",
        typeOfOutward: OUTWARD_TYPE_LABELS.scrap,
        remarks: "",
      });
    } catch (err) {
      console.error("Error saving scrap item:", err);
      setFormError(err.message || "Failed to save scrap item.");
    } finally {
      scrapSubmitLockRef.current = false;
      setSavingScrap(false);
    }
  }

  const activeItems =
    selectedTab === "scrap"
      ? scrapItems
      : selectedTab === "sales"
        ? salesItems
        : failedQcItems;

  useEffect(() => {
    setSelectedRowKeys([]);
  }, [selectedTab]);

  const displayRows = activeItems.map((item, index) => ({
    ...item,
    sNo: index + 1,
  }));

const columns =
  selectedTab === "scrap"
    ? [
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
          render: (row) =>
            renderScrapComponentWithQty(
              row,
            ),
        },
        {
          key: "hsnNo",
          header: "HSN No",
          className: "text-center text-sm",
          render: (row) => getComponentHsn(row),
          filterValue: (row) => getComponentHsn(row),
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
              {row?.outDate ||
                row?.date ||
                row?.out_date ||
                "-"}
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
            const approvalStatus =
              getScrapApprovalStatus(row);

            const label =
              getScrapApprovalLabel(row);

            const isRejected =
              [
                "FINANCE_REJECTED",
                "MANAGER_REJECTED",
              ].includes(
                approvalStatus,
              );

            const className =
              approvalStatus === "APPROVED"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : isRejected
                ? "border-red-200 bg-red-50 text-red-700"
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
      ]
    : selectedTab === "sales"
      ? [
          { key: "outDate", header: "Out Date", className: "text-center" },
          {
            key: "materialRequestNumber",
            header: "MR ID",
            className: "text-center",
            render: (row) =>
              row?.materialRequestNumber ||
              row?.material_request_number ||
              row?.material_request ||
              "-",
          },
          {
            key: "productName",
            header: "Sale Details",
            className: "text-center",
            render: (row) => (
              <div className="mx-auto max-w-[260px] text-center">
                <div className="text-sm font-semibold text-foreground">
                  {row?.componentCount > 1
                    ? `${row.componentCount} Components`
                    : row?.productName || "1 Component"}
                </div>

                {row?.componentSummary && (
                  <div
                    className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground"
                    title={row.componentSummary}
                  >
                    {row.componentSummary}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: "hsnNo",
            header: "HSN No",
            className: "text-center",
            render: (row) => getComponentHsn(row),
            filterValue: (row) => getComponentHsn(row),
          },
          {
            key: "quantity",
            header: "Qty",
            className: "text-center",
            render: (row) => Number(row?.quantity || row?.noOfComponents || row?.qty || 0),
          },
          {
            key: "client",
            header: "Customer / Client",
            className: "text-center",
            render: (row) => row?.client || row?.customer || "-",
          },
          {
            key: "invoiceNumber",
            header: "Invoice",
            className: "text-center",
            render: (row) => row?.invoiceNumber || row?.invoice_number || "-",
          },
          {
            key: "remarks",
            header: "Remarks",
            className: "text-center",
            render: (row) => row?.remarks || "-",
          },
          {
            key: "status",
            header: "Status",
            className: "text-center",
            render: (row) => {
              const statusInfo = getSalesApprovalStatus(row);

              return (
                <span
                  className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusInfo.className}`}
                >
                  {statusInfo.label}
                </span>
              );
            },
          },
        ]
      : [
        {
          key: "outDate",
          header: "Date",
          className: "text-center text-sm",
        },
        {
          key: "productName",
          header: "Component",
          className: "text-center min-w-[170px]",
          render: (row) => (
            <span className="inline-block max-w-[210px] break-words text-[14px] font-semibold leading-5">
              {getOutwardComponentDisplay(row)}
            </span>
          ),
        },
        {
          key: "failedQty",
          header: "Failed Qty",
          className: "text-center",
          render: (row) => (
            <span className="text-[14px] font-semibold">
              {Number(row?.failedQty || row?.qty || 0)}
            </span>
          ),
        },
        {
          key: "sourceMrNumber",
          header: "MR ID",
          className: "text-center",
          render: (row) => (
            <span className="text-[13px] font-medium">
              {row?.sourceMrNumber || "Direct PO"}
            </span>
          ),
        },
        {
          key: "purchaseOrderNumber",
          header: "Source PO",
          className: "text-center",
          render: (row) => (
            <span className="text-[13px] font-medium">
              {row?.purchaseOrderNumber || "-"}
            </span>
          ),
        },
        {
          key: "remarks",
          header: "QC Remarks",
          className: "text-center",
          render: (row) => (
            <span
              className="inline-block max-w-[180px] break-words text-[13px] leading-5 text-muted-foreground"
              title={row?.remarks || ""}
            >
              {row?.remarks || "-"}
            </span>
          ),
        },
        {
          key: "status",
          header: "Status",
          className: "text-center min-w-[170px]",
          render: (row) => (
            <span className="inline-flex max-w-[190px] items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-center text-[11px] font-semibold leading-4 text-amber-800">
              {getFailedQcWorkflowLabel(row)}
            </span>
          ),
        },
        {
          key: "action",
          header: "Action",
          className: "text-center min-w-[210px]",
          render: (row) => {
            const hasMr = Boolean(
              String(
                row?.sourceMrNumber ||
                  ""
              ).trim()
            );

            const isReturnedReturnable =
              isReturnedReturnableQcFailure(
                row
              );

            const action = String(
              row?.qcFailedAction ||
                row?.qc_failed_action ||
                "NONE"
            )
              .trim()
              .toUpperCase();

            const replacementStatus = String(
              row?.replacementPurchaseOrderStatus ||
                row?.replacement_purchase_order_status ||
                ""
            )
              .trim()
              .toUpperCase();

            const replacementCompleted =
              replacementStatus ===
                "REPLACEMENT_RECEIVED";

            const replacementAlreadyRequested =
              action ===
                "REPLACEMENT_REQUESTED" ||
              Boolean(
                row
                  ?.replacementPurchaseOrderId
              );

            const refundWorkflowStatus =
              String(
                row?.refundWorkflowStatus ||
                  row?.refund_workflow_status ||
                  "",
              )
                .trim()
                .toUpperCase();

            const refundCompleted =
              action ===
                "RETURN_REQUESTED" ||
              refundWorkflowStatus ===
                "REFUNDED";

            const refundPending =
              [
                "PENDING_PROCUREMENT",
                "PROCUREMENT_APPROVED",
                "PENDING_FINANCE",
              ].includes(
                refundWorkflowStatus,
              );

            const restoreStatus =
              getReturnableRestoreStatus(
                row
              );

            const restoreRequested =
              [
                "PENDING_PROCUREMENT",
                "PROCUREMENT_APPROVED",
                "PENDING_FINANCE",
                "FINANCE_APPROVED",
                "PO_RAISED",
                "ORDERED",
                "PARTIALLY_RESTORED",
                "COMPLETED_IN_STORE",
              ].includes(
                restoreStatus
              );

            const actionAlreadyChosen =
              replacementAlreadyRequested ||
              refundCompleted ||
              refundPending ||
              restoreRequested;

            const isReplacementSaving =
              replacementSavingId ===
              String(
                row?.inwardEntryId ||
                  ""
              );

            const isRefundSaving =
              refundSavingId ===
              String(
                row?.inwardEntryId ||
                  ""
              );

            const restoreRowId =
              row?.id ??
              row?.backendId ??
              row?.pk ??
              "";

            const isRestoreSaving =
              restoreSavingId ===
              String(
                restoreRowId
              );

            /*
             * FINAL ACTION MATRIX
             *
             * 1. MR-linked Purchase Order QC fail
             *    BOM / Custom BOM / R&D / From Scrap / Returnable MR
             *    BEFORE Engineer handover:
             *        Replacement ONLY
             *
             * 2. Direct standard PO QC fail:
             *        Replacement + Refund
             *
             * 3. Returnable component AFTER Engineer returned it
             *    and Inventory Return QC failed:
             *        Restore ONLY
             */
            if (
              isReturnedReturnable
            ) {
              return (
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      void handleRequestRestore(
                        row
                      )
                    }
                    disabled={
                      !canRequestReplacement ||
                      restoreRequested ||
                      restoreStatus ===
                        "COMPLETED_IN_STORE" ||
                      Boolean(
                        isRestoreSaving
                      )
                    }
                    className="whitespace-nowrap rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
                    title={
                      restoreStatus ===
                      "COMPLETED_IN_STORE"
                        ? "This restored component has been returned to In Store."
                        : restoreRequested
                          ? "Restore is already in Procurement / Finance / PO processing."
                          : "Send only the returned QC-failed component to Procurement for Restore."
                    }
                  >
                    {isRestoreSaving
                      ? "Sending..."
                      : restoreStatus ===
                          "COMPLETED_IN_STORE"
                        ? "Restored to In Store"
                        : restoreRequested
                          ? "Restore Requested"
                          : "Restore"}
                  </button>
                </div>
              );
            }

            return (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {/* MR-linked and Direct PO both support Replacement. */}
                <button
                  type="button"
                  onClick={() =>
                    void handleRequestReplacement(
                      row
                    )
                  }
                  disabled={
                    !canRequestReplacement ||
                    actionAlreadyChosen
                  }
                  className="whitespace-nowrap rounded-md border border-blue-600 bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
                  title={
                    refundCompleted
                      ? "Refund already completed."
                      : replacementCompleted
                        ? "Replacement has been fully delivered and completed."
                        : replacementAlreadyRequested
                          ? "Replacement already requested."
                          : "Send Replacement to Procurement. PO is created after Procurement approval and then requires Finance approval."
                  }
                >
                  {isReplacementSaving
                    ? "Requesting..."
                    : replacementCompleted
                      ? "Replacement Completed"
                      : replacementAlreadyRequested
                        ? "Replacement Requested"
                        : "Replacement"}
                </button>

                {/* Refund is Direct standard PO only. */}
                {!hasMr && (
                  <button
                    type="button"
                    onClick={() =>
                      void handleRequestRefund(
                        row
                      )
                    }
                    disabled={
                      !canRequestReplacement ||
                      actionAlreadyChosen
                    }
                    className="whitespace-nowrap rounded-md border border-rose-600 bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
                    title={
                      replacementAlreadyRequested
                        ? "Replacement already requested."
                        : refundCompleted
                          ? "Refund already completed."
                          : refundPending
                            ? "Refund is waiting for Procurement / Finance approval."
                            : "Send the Direct PO QC-failed Refund to Procurement. Finance approval is required before PO quantity/value is deducted."
                    }
                  >
                    {isRefundSaving
                      ? "Sending..."
                      : refundCompleted
                        ? "Refund Completed"
                        : refundPending
                          ? "Refund Requested"
                          : "Refund"}
                  </button>
                )}
              </div>
            );
          },
        },
      ];


  const handleEnableSelectionMode = () => {
    if (!canManageOutward) {
      return;
    }

    setSelectedRowKeys([]);
    setSelectionMode(true);
  };

  const handleCancelSelectionMode = () => {
    setSelectedRowKeys([]);
    setSelectionMode(false);
  };

  const handleDeleteSelected = async () => {
    if (!canManageOutward) {
      return;
    }

    if (!selectedRowKeys.length) return;

    const nextDeletedIds = Array.from(
      new Set([...getDeletedOutwardRowIds(), ...selectedRowKeys.map(String)]),
    );
    persistDeletedOutwardRowIds(nextDeletedIds);

    const remaining = outwardData.filter((row) => !selectedRowKeys.includes(String(row.id)));
    setOutwardData(remaining);
    setSelectedRowKeys([]);
    setSelectionMode(false);
  };

  const outwardPageCount = Math.max(
    1,
    Math.ceil(outwardDisplayedCount / OUTWARD_PAGE_SIZE),
  );

  useEffect(() => {
    setOutwardPage(1);
  }, [selectedTab]);

  useEffect(() => {
    setOutwardPage((currentPage) =>
      Math.min(currentPage, outwardPageCount),
    );
  }, [outwardPageCount]);

  if (costDetailsPage) return costDetailsPage;
  return (
    <PageShell>
      <PageHeader
        title="Outward Entries"
        subtitle="Track Scrap, Failed QC, and Sales outward records."
right={
  canManageOutward ? (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={
          selectionMode
            ? handleDeleteSelected
            : handleEnableSelectionMode
        }
        disabled={
          selectionMode &&
          selectedRowKeys.length === 0
        }
        className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          backgroundColor: "#E85D75",
        }}
      >
        {selectionMode
          ? `Delete Selected (${selectedRowKeys.length})`
          : "Delete"}
      </button>

      {selectionMode && (
        <button
          type="button"
          onClick={
            handleCancelSelectionMode
          }
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
        >
          Cancel
        </button>
      )}
    </div>
  ) : null
}
      />

      <div className="space-y-6">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Outward workflow</p>
              <p className="text-sm text-muted-foreground">
                Choose Scrap, Failed QC, or Sales. Sales shows one completed line per MR sales transaction.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {TAB_CONFIG.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedTab(tab.id)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    selectedTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-foreground hover:bg-secondary"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {selectedTab === "scrap" && (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground max-w-2xl">
                Scrap records are captured here. New Scrap entries stay Pending Manager until the Manager approves or rejects them from Notifications.
              </p>
{canManageOutward && (
  <button
    type="button"
    onClick={() =>
      setShowScrapForm(true)
    }
    className="inline-flex items-center justify-center rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/90"
  >
    Add Scrap Item
  </button>
)}
            </div>
          )}

          {selectedTab === "failedQc" && (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground max-w-2xl">
                Failed QC shows failed QC items and defect entries. Use the button to add additional
                Failed QC or defect items manually.
              </p>

            </div>
          )}


         
        </div>

      {canManageOutward &&
  showScrapForm && (selectedTab === "failedQc" || selectedTab === "scrap") && (
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {selectedTab === "scrap" ? "Add Scrap Item" : "Add Failed / Defect Item"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedTab === "scrap"
                    ? "Record a scrap item directly into the scrap outward list."
                    : "Record a defect item directly into the failed QC outward list."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowScrapForm(false);
                  setFormError("");
                }}
                className="rounded-full border border-border px-4 py-2 text-sm text-foreground hover:bg-secondary"
              >
                Close
              </button>
            </div>

            <form onSubmit={saveScrapItem} className="mt-5 grid gap-4 lg:grid-cols-2">
              <input
                name="outDate"
                type="date"
                value={scrapForm.outDate}
                onChange={(e) => updateForm(e, setScrapForm)}
                className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Out Date"
                required
              />

              <select
  name="productName"
  value={scrapForm.productName}
  onChange={(e) => updateForm(e, setScrapForm)}
  className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
  required
>
  <option value="">Select Component</option>

  {components.map((component) => {
    const label =
      getComponentDisplayLabel(
        component,
      );

    return (
      <option
        key={
          component.id ??
          component.pk ??
          component.component_id ??
          label
        }
        value={label}
      >
        {label}
      </option>
    );
  })}
</select>

              <select
                name="typeOfOutward"
                value={scrapForm.typeOfOutward}
                onChange={(e) => updateForm(e, setScrapForm)}
                className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value={OUTWARD_TYPE_LABELS.scrap}>Scrap</option>
                <option value={OUTWARD_TYPE_LABELS.defect}>Defect</option>
              </select>

              <textarea
                name="remarks"
                value={scrapForm.remarks}
                onChange={(e) => updateForm(e, setScrapForm)}
                className="col-span-full min-h-[120px] rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Remarks"
              />

              {formError && (
                <div className="col-span-full rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {formError}
                </div>
              )}

              <div className="col-span-full flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowScrapForm(false);
                    setFormError("");
                  }}
                  className="rounded-2xl border border-border px-4 py-3 text-sm font-medium hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingScrap}
                  className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingScrap
                    ? "Saving..."
                    : "Save Scrap Item"}
                </button>
              </div>
            </form>
          </div>
        )}


        


        {refundDialogRow && (
          <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-foreground">
                Confirm Direct PO Refund
              </h3>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The QC-failed quantity will be deducted from the original
                Direct PO. The PO quantity and price will recalculate
                automatically.
              </p>

              <div className="mt-5 grid gap-3 rounded-2xl border border-border bg-muted/30 p-4 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">
                    Source PO
                  </span>
                  <span className="text-right font-semibold text-foreground">
                    {refundDialogRow?.purchaseOrderNumber || "-"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">
                    Component
                  </span>
                  <span className="max-w-[68%] text-right font-semibold text-foreground">
                    {refundDialogRow?.productName ||
                      refundDialogRow?.deliverables ||
                      "-"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">
                    Failed QC Serial No.
                  </span>
                  <span className="max-w-[68%] text-right font-semibold text-foreground">
                    {Array.isArray(
                      refundDialogRow?.serialNumbers
                    ) &&
                    refundDialogRow.serialNumbers.length
                      ? refundDialogRow.serialNumbers.join(", ")
                      : "-"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">
                    Failed Qty
                  </span>
                  <span className="text-right font-semibold text-foreground">
                    {Number(
                      refundDialogRow?.failedQty ||
                        refundDialogRow?.qty ||
                        0
                    )}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">
                    Unit Price
                  </span>
                  <span className="text-right font-semibold text-foreground">
                    ₹{Number(
                      refundDialogRow?.unitPrice ||
                        0
                    ).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">
                    Subtotal
                  </span>
                  <span className="text-right font-semibold text-foreground">
                    ₹{Number(
                      refundDialogRow?.refundSubtotal ||
                        0
                    ).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">
                    GST
                    {Number(
                      refundDialogRow?.gstPercentage ||
                        0
                    ) > 0
                      ? ` (${Number(
                          refundDialogRow?.gstPercentage ||
                            0
                        ).toFixed(2)}%)`
                      : ""}
                  </span>
                  <span className="text-right font-semibold text-foreground">
                    ₹{Number(
                      refundDialogRow?.refundGstAmount ||
                        0
                    ).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-4 border-t border-border pt-3">
                  <span className="font-semibold text-foreground">
                    Refund Amount
                  </span>
                  <span className="text-right text-base font-bold text-rose-600">
                    ₹{Number(
                      refundDialogRow?.refundTotal ||
                        0
                    ).toFixed(2)}
                  </span>
                </div>
              </div>

              {refundDialogError && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                  {refundDialogError}
                </div>
              )}

              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Click OK to send the Refund request to Procurement.
                Finance approval is required before the failed quantity and value
                are deducted from the Direct PO.
              </p>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeRefundDialog}
                  disabled={Boolean(
                    refundSavingId
                  )}
                  className="rounded-full border border-border px-5 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void confirmRequestRefund()
                  }
                  disabled={Boolean(
                    refundSavingId
                  )}
                  className="rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {refundSavingId
                    ? "Processing..."
                    : "OK"}
                </button>
              </div>
            </div>
          </div>
        )}

        {replacementDialogRow && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-foreground">
                Request Replacement
              </h3>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {replacementDialogRow?.sourceMrNumber
                  ? "A Replacement PO will be raised for the failed component against the same Material Request."
                  : "A Replacement PO will be raised for the failed component against this Direct PO."}
              </p>

              <div className="mt-5 grid gap-3 rounded-2xl border border-border bg-muted/30 p-4 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">
                    MR ID
                  </span>
                  <span className="text-right font-semibold text-foreground">
                    {replacementDialogRow?.sourceMrNumber || "Direct PO"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">
                    Source PO
                  </span>
                  <span className="text-right font-semibold text-foreground">
                    {replacementDialogRow?.purchaseOrderNumber || "-"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">
                    Component
                  </span>
                  <span className="max-w-[65%] text-right font-semibold text-foreground">
                    {replacementDialogRow?.productName ||
                      replacementDialogRow?.deliverables ||
                      "-"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">
                    Replacement Qty
                  </span>
                  <span className="text-right font-semibold text-foreground">
                    {Number(
                      replacementDialogRow?.failedQty ||
                        replacementDialogRow?.qty ||
                        replacementDialogRow?.quantity ||
                        0
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-5">
                <label
                  htmlFor="replacement-expected-delivery"
                  className="mb-2 block text-sm font-semibold text-foreground"
                >
                  Expected Delivery Date
                  <span className="ml-1 text-red-500">
                    *
                  </span>
                </label>

                <input
                  id="replacement-expected-delivery"
                  type="date"
                  min={getTodayDateInputValue()}
                  value={replacementExpectedDelivery}
                  onChange={(event) => {
                    setReplacementExpectedDelivery(
                      event.target.value
                    );
                    setReplacementDialogError("");
                  }}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {replacementDialogError && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                  {replacementDialogError}
                </div>
              )}

              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Click OK to send the Replacement request to Procurement.
                The Replacement PO is created automatically only after Procurement approves,
                then Finance approval is required.
              </p>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeReplacementDialog}
                  disabled={Boolean(
                    replacementSavingId
                  )}
                  className="rounded-full border border-border px-5 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void confirmRequestReplacement()
                  }
                  disabled={Boolean(
                    replacementSavingId
                  )}
                  className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {replacementSavingId
                    ? "Creating..."
                    : "OK"}
                </button>
              </div>
            </div>
          </div>
        )}

        {scrapRejectDetails && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
            <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-red-700 dark:text-red-300">
                Scrap Rejection Details
              </h3>

              <p className="mt-1 text-sm text-muted-foreground">
                Reason entered by the Manager.
              </p>

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

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <DataTable
              enableColumnTools
columns={selectedTab === "scrap" ? columns : [...columns, {key:"serialPurchaseCosts",header:"Cost Details",render:(row)=><button type="button" className="serial-cost-component" onClick={()=>openCostDetails("outward",row)}>View Details</button>}]}
            rows={displayRows}
            page={outwardPage}
            pageSize={OUTWARD_PAGE_SIZE}
            onFilteredRowCountChange={setOutwardDisplayedCount}
            loading={loading}
            hideEmptyState={Boolean(loadError)}
            selectable={
              canManageOutward &&
              selectionMode
            }
            selectedRowKeys={selectedRowKeys}
            onSelectedRowKeysChange={setSelectedRowKeys}
          />

          <PaginationControls
            page={outwardPage}
            totalCount={outwardDisplayedCount}
            pageSize={OUTWARD_PAGE_SIZE}
            hasPreviousPage={outwardPage > 1}
            hasNextPage={outwardPage < outwardPageCount}
            loading={loading}
            onPrevious={() => setOutwardPage((currentPage) => Math.max(1, currentPage - 1))}
            onNext={() => setOutwardPage((currentPage) => Math.min(outwardPageCount, currentPage + 1))}
          />

          {!loading && loadError && (
            <div className="flex min-h-[140px] w-full items-center justify-center border-t border-rose-200 bg-rose-50 px-6 py-8 text-center text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
              {loadError}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

export default OutwardPage;
