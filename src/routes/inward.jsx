import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { DataTable, StatusBadge } from "@/components/app/DataTable";
import { inward } from "@/lib/mock-data";
import { Loader2, Plus } from "lucide-react";

/*
 * Older frontend versions permanently hid deleted Inward database
 * IDs in localStorage. After a database reset, MySQL can reuse those
 * numeric IDs and valid new PO deliveries disappear from this page.
 *
 * Backend deletion is authoritative now, so the legacy browser list
 * is cleared and is never used for filtering.
 */
const LEGACY_HIDDEN_INWARD_IDS_STORAGE_KEY =
  "dream-to-life-hidden-inward-inward-ids";

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormGrid, Field, Input, Select, Textarea } from "@/components/app/FormShell";
import config from "@/config";
import { fetchJson, fetchAuthenticatedJson } from "@/api";
import { useAuth } from "@/AuthContext";
import { canWork } from "@/permissions";
function getSavedQcRows(entry, type) {
  const candidates =
    type === "passed"
      ? [
          entry?.passedRows,
          entry?.passed_rows,
          entry?.qc_passed_rows,
          entry?.qcPassedRows,
          entry?.qc_results?.passedRows,
          entry?.qc_results?.passed_rows,
          entry?.qc?.passedRows,
          entry?.qc?.passed_rows,
        ]
      : [
          entry?.failedRows,
          entry?.failed_rows,
          entry?.qc_failed_rows,
          entry?.qcFailedRows,
          entry?.qc_results?.failedRows,
          entry?.qc_results?.failed_rows,
          entry?.qc?.failedRows,
          entry?.qc?.failed_rows,
        ];

  const rows = candidates.find(Array.isArray);

  return Array.isArray(rows)
    ? rows.filter(
        (row) =>
          row &&
          typeof row === "object"
      )
    : [];
}

function getSavedQcCount(entry, type) {
  return getSavedQcRows(
    entry,
    type
  ).reduce((total, row) => {
    const value = Number(
      row.qty ??
        row.quantity ??
        row.passed_quantity ??
        row.failed_quantity ??
        1
    );

    return (
      total +
      (Number.isFinite(value)
        ? value
        : 1)
    );
  }, 0);
}

function getQcInspectionState(entry) {
  const passCount =
    getSavedQcCount(entry, "passed");

  const failCount =
    getSavedQcCount(entry, "failed");

  const inspectedCount =
    passCount + failCount;

  const receivedQuantity = Math.max(
    Number(
      entry?.items ??
        entry?.quantity_received ??
        entry?.quantity ??
        0,
    ) || 0,
    0,
  );

  if (
    receivedQuantity > 0 &&
    inspectedCount >= receivedQuantity
  ) {
    return {
      status: "COMPLETED",
      passCount,
      failCount,
      inspectedCount,
      remainingCount: 0,
      completed: true,
    };
  }

  if (inspectedCount > 0) {
    return {
      status: "PARTIALLY_INSPECTED",
      passCount,
      failCount,
      inspectedCount,
      remainingCount: Math.max(
        receivedQuantity - inspectedCount,
        0,
      ),
      completed: false,
    };
  }

  const backendStatus = String(
    entry?.qc_status ||
      entry?.inspection_status ||
      entry?.qcStatus ||
      entry?.status ||
      "PENDING",
  )
    .trim()
    .toUpperCase();

  return {
    status:
      backendStatus === "PARTIALLY_INSPECTED"
        ? "PARTIALLY_INSPECTED"
        : "PENDING",
    passCount,
    failCount,
    inspectedCount,
    remainingCount: receivedQuantity,
    completed: false,
  };
}

function isQcCompleted(entry) {
  return getQcInspectionState(entry).completed;
}

export default function InwardPage() {
  const { user } = useAuth();

  // Existing Sidebar/routes decide who can SEE Inward.
  // Only Admin + Procurement can CREATE / EDIT / DELETE / RUN QC.
  const canManageInward =
    canWork(user, "inward");

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
  const [inwardEntries, setInwardEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [components, setComponents] = useState([]);
  const [vendorsModalOpen, setVendorsModalOpen] = useState(false);
  const [componentsModalOpen, setComponentsModalOpen] = useState(false);
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

  const vendorGrandTotal = vendorProducts.reduce((sum, item) => {
    const price = Number(item.price || 0);
    const gst = Number(item.gst || 0);
    return sum + price + (price * gst) / 100;
  }, 0);
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
    version: "",
    name: "",
    category: "",
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
      return prefix ? `${prefix}_0001` : "";
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
  const [failedQcDetails, setFailedQcDetails] = useState({
    open: false,
    inward: null,
    rows: [],
  });

useEffect(() => {
  /*
   * Remove stale IDs created by the old client-side deletion flow.
   * A newly created Inward must be displayed whenever it exists in
   * the backend.
   */
  try {
    window.localStorage.removeItem(
      LEGACY_HIDDEN_INWARD_IDS_STORAGE_KEY
    );
  } catch (error) {
    console.warn(
      "Unable to clear legacy Inward hidden IDs:",
      error
    );
  }

  void loadAllData();

  const handleInwardUpdated = () => {
    void loadAllData();
  };

  const handleWindowFocus = () => {
    void loadAllData();
  };

  const handleVisibilityChange = () => {
    if (
      document.visibilityState ===
      "visible"
    ) {
      void loadAllData();
    }
  };

  window.addEventListener(
    "inwardUpdated",
    handleInwardUpdated
  );

  window.addEventListener(
    "focus",
    handleWindowFocus
  );

  document.addEventListener(
    "visibilitychange",
    handleVisibilityChange
  );

  return () => {
    window.removeEventListener(
      "inwardUpdated",
      handleInwardUpdated
    );

    window.removeEventListener(
      "focus",
      handleWindowFocus
    );

    document.removeEventListener(
      "visibilitychange",
      handleVisibilityChange
    );
  };
}, []);

async function loadAllData() {
  setLoading(true);
  setLoadError("");

  try {
    const [
      vendorData,
      poData,
      compData,
      inwardData,
    ] = await Promise.all([
      fetchAuthenticatedJson(
        `${config.baseURL}/vendors/`
      ),
      fetchAuthenticatedJson(
        `${config.baseURL}/procurement/purchase-orders/?page_size=5000`
      ),
      fetchAuthenticatedJson(
        `${config.baseURL}/components/components/?page_size=5000`
      ),
      fetchAuthenticatedJson(
        `${config.baseURL}/inward/?page_size=5000`
      ),
    ]);

    const vendorList =
      Array.isArray(vendorData)
        ? vendorData
        : vendorData?.results || [];

    const poList =
      Array.isArray(poData)
        ? poData
        : poData?.results || [];

    const componentList =
      Array.isArray(compData)
        ? compData
        : compData?.results || [];

    const inwardList = (
      Array.isArray(inwardData)
        ? inwardData
        : inwardData?.results || []
    )
      .filter(
        (entry) =>
          entry.removed_from_inventory !==
          true
      )
      .sort(
        (left, right) =>
          Number(right.id || 0) -
          Number(left.id || 0)
      );

    setVendors(vendorList);
    setPurchaseOrders(poList);
    setComponents(componentList);

    setInwardEntries(
      inwardList.map((entry) => {
        const vendor = vendorList.find(
          (v) => String(v.id) === String(entry.vendor)
        );

        const po = poList.find(
          (p) => String(p.id) === String(entry.purchase_order)
        );

        const totalQty =
          entry.line_items?.reduce(
            (sum, item) =>
              sum +
              Number(
                item.quantity ||
                  item.total_quantity ||
                  0
              ),
            0
          ) ||
          Number(
            entry.quantity_received ||
              entry.quantity ||
              0
          );

        const entryComponentId =
          entry.component ||
          entry.component_id ||
          entry.componentCode ||
          entry.component_code ||
          entry.componentName ||
          entry.component_name;

        const entryComponent = componentList.find(
          (c) =>
            String(c.id) === String(entryComponentId) ||
            String(c.component_id) === String(entryComponentId) ||
            String(c.code) === String(entryComponentId) ||
            String(c.name) === String(entryComponentId) ||
            String(c.component_name) === String(entryComponentId)
        );

        const entryComponentCode =
          entryComponent?.component_id ||
          entryComponent?.component_code ||
          entryComponent?.code ||
          entry.component_code ||
          entry.componentCode ||
          "";

        const entryComponentName = entryComponent
          ? entryComponent.name || entryComponent.component_name || ""
          : entry.component_name ||
            entry.componentName ||
            entry.product_name ||
            entry.productName ||
            "";

        /*
         * INWARD TABLE - COMPONENT COLUMN
         * --------------------------------
         * The Component column must show COMPONENT TYPE.
         *
         * Examples:
         *   Flight Controller
         *   Motor
         *   Propeller
         *
         * Prefer the Component Master value. Keep backend Inward fields
         * and the old component name only as fallbacks for legacy rows.
         */
        const entryComponentType =
          entryComponent?.component_type ||
          entryComponent?.componentType ||
          entry.component_type ||
          entry.componentType ||
          entryComponentName ||
          "";

        const entryHsnNo =
          entryComponent?.hsn_numbers ||
          entryComponent?.hsn_no ||
          entryComponent?.hsn ||
          entry.hsn_numbers ||
          entry.hsn_no ||
          entry.hsn ||
          "-";

        const componentTypes = Array.isArray(entry.line_items)
          ? [
              ...new Set(
                entry.line_items.map((item) => {
                  const componentId =
                    item.component ||
                    item.component_id ||
                    item.componentId ||
                    item.component_code ||
                    item.componentCode;

                  const component = componentList.find(
                    (c) =>
                      String(c.id) === String(componentId) ||
                      String(c.component_id) === String(componentId) ||
                      String(c.code) === String(componentId) ||
                      String(c.name) === String(componentId) ||
                      String(c.component_name) === String(componentId)
                  );

                  return String(
                    component?.component_type ||
                      component?.componentType ||
                      item.component_type ||
                      item.componentType ||
                      component?.name ||
                      component?.component_name ||
                      item.component_name ||
                      item.componentName ||
                      item.product_name ||
                      item.productName ||
                      ""
                  ).trim();
                })
              ),
            ].filter(Boolean)
          : [];

const qcInspection =
  getQcInspectionState({
    ...entry,
    items: totalQty,
  });

return {
  ...entry,

  batchNumber: entry.batch_number,

  vendor:
    vendor?.name ||
    vendor?.vendor_name ||
    "-",

  po:
    po?.po ||
    po?.po_number ||
    "-",

  mrId:
    po?.source_mr_number ||
    po?.material_request_id ||
    po?.request_id ||
    po?.mr_number ||
    entry.source_mr_number ||
    entry.material_request_id ||
    entry.mr_number ||
    "",

  date: entry.received_date,

  items: totalQty,

  // Component column displays Component Type, not Component ID/name.
  componentName:
    String(entryComponentType || "").trim() ||
    componentTypes.join(", ") ||
    "-",

  hsnNo: entryHsnNo,

qc:
  qcInspection.status,

qcPassCount:
  qcInspection.passCount,

qcFailCount:
  qcInspection.failCount,

qcInspectedCount:
  qcInspection.inspectedCount,

qcRemainingCount:
  qcInspection.remainingCount,

qcCompleted:
  qcInspection.completed,
};
      })
    );
  } catch (err) {
    console.error(err);
    setInwardEntries([]);
    setLoadError(
      err?.message ||
        "Unable to load Inward records. Please try again."
    );
  } finally {
    setLoading(false);
  }
}

  function getQcBadgeStatus(status) {
    const normalized = String(status || "").trim().toUpperCase();

    if (
      normalized === "PASS" ||
      normalized === "FAIL" ||
      normalized === "COMPLETED"
    ) {
      return "COMPLETED";
    }

    if (
      normalized === "PARTIALLY_INSPECTED" ||
      normalized === "PARTIALLY INSPECTED"
    ) {
      return "PARTIALLY_INSPECTED";
    }

    if (
      normalized === "PENDING" ||
      normalized === "PENDING QC"
    ) {
      return "PENDING";
    }

    return normalized || "PENDING";
  }

  function normalizeFailedQcRow(row, index) {
    return {
      id: row?.id ?? `${index}`,
      serialNumber: String(
        row?.serialNumber ||
          row?.serial_number ||
          row?.serial ||
          row?.serial_no ||
          `Failed item ${index + 1}`
      ).trim(),
      remarks: String(
        row?.remarks ||
          row?.remark ||
          row?.reason ||
          row?.failure_reason ||
          row?.qc_remarks ||
          "No remarks entered"
      ).trim(),
    };
  }

  async function openFailedQcDetails(row) {
    if (!row || Number(row.qcFailCount || 0) <= 0) return;

    let sourceEntry = row;
    let failedRows = getSavedQcRows(sourceEntry, "failed");

    // Some inward list APIs return only counts. Fetch the full inward entry
    // so the popup can display each serial number and its QC remarks.
    if (!failedRows.length && row.id != null) {
      try {
        const fullEntry = await fetchAuthenticatedJson(
          `${config.baseURL}/inward/${row.id}/`
        );

        if (fullEntry) {
          sourceEntry = { ...row, ...fullEntry };
          failedRows = getSavedQcRows(sourceEntry, "failed");
        }
      } catch (error) {
        console.warn("Unable to load failed QC details:", error);
      }
    }

    setFailedQcDetails({
      open: true,
      inward: sourceEntry,
      rows: failedRows.map(normalizeFailedQcRow),
    });
  }
async function loadVendors() {
  const res = await fetch(`${config.baseURL}/vendors/`);
  const data = await res.json();
  setVendors(Array.isArray(data) ? data : data.results || []);
}

async function loadPurchaseOrders() {
  const res = await fetch(`${config.baseURL}/procurement/purchase-orders/`);
  const data = await res.json();
  setPurchaseOrders(Array.isArray(data) ? data : data.results || []);
}
  async function loadInwardEntries() {
    /*
     * Keep one authoritative loader and one endpoint path.
     * The previous function appended `/api/inward/` to a base URL
     * that already contains `/api`, producing an invalid duplicate
     * path in some environments.
     */
    await loadAllData();
  }

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

  function handleVendorProductChange(index, field, value) {
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
      previous.filter((_, itemIndex) => itemIndex !== index)
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

  if (
    !canManageInward ||
    savingVendor
  ) {
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

  const validProducts = vendorProducts
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
    .filter((item) => Boolean(item.product));

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
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
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

    products: validProducts.map((item) => ({
      product: item.product,
      product_version:
        item.product_version,
      quantity: item.quantity,
      price: item.price,
      gst: item.gst,
    })),
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

            body:
              JSON.stringify(payload),
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
        "Failed to create vendor"
      );
    }

    console.log(
      "Vendor created successfully:",
      responseData
    );

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

    /*
     * Reload vendors and related page data so the
     * newly-created vendor is available immediately.
     */
    await loadAllData();

  } catch (err) {
    console.error(
      "Error saving vendor:",
      err
    );

    alert(
      err?.message ||
        "Failed to save vendor"
    );

  } finally {
    setSavingVendor(false);
  }
}

  async function submitComponent(e) {
    e.preventDefault();

    if (!canManageInward || savingComponent) {
      return;
    }

    if (!componentForm.category) {
      alert("Category is required");
      return;
    }

    const componentType = String(
      componentForm.component_type || ""
    ).trim();

    if (!componentType) {
      alert("Component Type is required");
      return;
    }

    /*
     * HSN is optional, but when entered the backend requires 4-8 digits.
     * Strip accidental spaces/non-digits before validating/sending.
     */
    const hsnNumber = String(
      componentForm.hsn_no || ""
    )
      .replace(/\D/g, "")
      .slice(0, 8);

    if (
      hsnNumber &&
      !/^\d{4,8}$/.test(hsnNumber)
    ) {
      alert(
        "HSN.No must contain 4 to 8 digits, or leave it blank."
      );
      return;
    }

    let componentId = String(
      componentForm.component_id || ""
    )
      .trim()
      .toUpperCase();

    const selectedPrefix =
      CATEGORY_PREFIXES[componentForm.category];

    const expectedPattern =
      selectedPrefix
        ? new RegExp(`^${selectedPrefix}_\\d{4}$`, "i")
        : null;

    if (
      !expectedPattern ||
      !expectedPattern.test(componentId)
    ) {
      componentId =
        await generateNextComponentId(
          componentForm.category
        );

      setComponentForm((previous) => ({
        ...previous,
        component_id: componentId,
      }));
    }

    setSavingComponent(true);

    const payload = {
      request_id: `CR-${Date.now()}`,
      component_id: componentId,
      version: String(
        componentForm.version || ""
      ).trim(),
      category: componentForm.category,
      component_type: componentType,
      specifications: String(
        componentForm.specifications || ""
      ).trim(),
      sku_numbers: String(
        componentForm.sku_no || ""
      ).trim(),
      part_numbers: String(
        componentForm.part_no || ""
      ).trim(),
      tally_reference: String(
        componentForm.tally_reference || ""
      ).trim(),
      product_link: String(
        componentForm.product_link || ""
      ).trim(),
      date: new Date().toISOString().split("T")[0],
      is_active: true,
    };

    /*
     * Do not POST hsn_numbers: "" because the serializer rejects an empty
     * string. If an HSN was entered, send the normalized value explicitly.
     */
    if (hsnNumber) {
      payload.hsn_numbers = hsnNumber;
    }

    try {
      const result = await fetchAuthenticatedJson(
        `${config.baseURL}/components/components/`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      if (!result) {
        throw new Error("Failed to create component");
      }

      /*
       * Some Component create serializers return/create the record but may
       * omit an optional HSN during custom create handling. Verify the saved
       * record and PATCH the HSN once when necessary so the entered HSN is
       * guaranteed to persist in Component Master.
       */
      if (hsnNumber) {
        const createdPrimaryKey =
          result?.id ??
          result?.pk ??
          result?.component_pk ??
          null;

        const savedHsn = String(
          result?.hsn_numbers ??
          result?.hsn_no ??
          result?.hsn ??
          ""
        ).trim();

        if (
          createdPrimaryKey != null &&
          savedHsn !== hsnNumber
        ) {
          await fetchAuthenticatedJson(
            `${config.baseURL}/components/components/${encodeURIComponent(
              createdPrimaryKey
            )}/`,
            {
              method: "PATCH",
              body: JSON.stringify({
                hsn_numbers: hsnNumber,
              }),
            }
          );
        }
      }

      setComponentsModalOpen(false);

      // Reload Component Master so the new HSN appears immediately.
      await loadAllData();

      const nextComponentId =
        await generateNextComponentId("ACCESSORIES");

      setComponentForm({
        component_id: nextComponentId,
        version: "",
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

      alert(
        `Component ${componentId} saved successfully${
          hsnNumber ? ` with HSN ${hsnNumber}` : ""
        }.`
      );
    } catch (err) {
      console.error(
        "Error saving component:",
        err
      );

      alert(
        err?.message ||
        "Failed to save component"
      );
    } finally {
      setSavingComponent(false);
    }
  }

  const columns = [
{
  key: "sno",
  header: "S.No",
  className: "w-[5rem] text-center",
  disableColumnTools: true,
  render: (_row, index) => index + 1,
},
{
  key: "code",
  header: "INW",
  className: "text-center",
      render: (r) => (
    <Link
      to={`/inward/${r.id}`}
      style={{
        fontWeight: 700,
        fontSize: "15px",
        color: "#E85D75",
        textDecoration: "underline",
      }}
    >
      {formatInwCode(r.code, r.id)}
    </Link>
  ),
},
{
  key: "batchNumber",
  header: "Batch Number",
  className: "text-center",
},
{
  key: "componentName",
  header: "Component",
  className: "text-left",
  // Displays Component Master -> component_type.
},
{
  key: "hsnNo",
  header: "HSN No",
  className: "text-left",
},

{
  key: "vendor",
  header: "Vendor",
},

{
  key: "po",
  header: "PO",
  className:
    "text-center font-mono text-xs whitespace-nowrap",
},

{
  key: "mrId",
  header: "MR ID",

  /*
   * Long MR numbers such as MR-260915-00002_PR must wrap instead of
   * overlapping the Received column.
   */
  className:
    "text-center min-w-[150px] max-w-[170px] whitespace-normal",

  render: (r) => (
    <span
      className={
        r.mrId
          ? "inline-block max-w-[160px] whitespace-normal break-words [overflow-wrap:anywhere] text-center font-semibold leading-5 text-blue-600 dark:text-blue-400"
          : "inline-block max-w-[160px] whitespace-normal break-words [overflow-wrap:anywhere] text-center leading-5 text-slate-400"
      }
      title={r.mrId || "Direct Inward"}
    >
      {r.mrId || "Direct Inward"}
    </span>
  ),
},

{
  key: "date",
  header: "Received",
  className: "text-center",
},
  {
  key: "items",
  header: "Qty Received",
  className: "text-center",
},

{
  key: "qcPassCount",
  header: "Pass Count",
  className: "text-center",

  render: (r) =>
    Number(r.qcInspectedCount || 0) > 0 ? (
      <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-300">
        {r.qcPassCount ?? 0}
      </span>
    ) : (
      <span className="text-slate-400">
        -
      </span>
    ),
},

{
  key: "qcFailCount",
  header: "Fail Count",
  className: "text-center",

  render: (r) => {
    if (Number(r.qcInspectedCount || 0) <= 0) {
      return <span className="text-slate-400">-</span>;
    }

    const failCount = Number(r.qcFailCount || 0);

    return (
      <button
        type="button"
        disabled={failCount <= 0}
        onClick={() => openFailedQcDetails(r)}
        title={
          failCount > 0
            ? "View failed serial numbers and remarks"
            : "No failed components"
        }
        className={`inline-flex min-w-8 items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold transition ${
          failCount > 0
            ? "cursor-pointer bg-red-100 text-red-700 hover:bg-red-200 hover:ring-2 hover:ring-red-300 dark:bg-red-950/40 dark:text-red-300"
            : "cursor-default bg-red-50 text-red-500 dark:bg-red-950/20 dark:text-red-400"
        }`}
      >
        {failCount}
      </button>
    );
  },
},

{
  key: "qc",
  header: "Inspection",

  render: (r) => {
    const status = getQcBadgeStatus(r.qc);

    if (status === "PARTIALLY_INSPECTED") {
      return (
        <span className="inline-flex flex-col items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          <span>Partially Inspected</span>
          <span className="text-[10px] font-medium">
            {r.qcInspectedCount || 0}/{r.items || 0}
          </span>
        </span>
      );
    }

    return (
      <StatusBadge status={status} />
    );
  },
},
    {
      key: "action",
      header: "Action",
      className: "text-center",
      render: (r) => (
        <Link
          to={`/inward/${r.id}/qc`}
          className="inline-flex items-center justify-center rounded-full border border-border px-3 py-1 text-sm font-medium text-foreground transition hover:bg-secondary"
        >
          {!canManageInward
            ? "View QC"
            : r.qcCompleted
              ? "View QC"
              : String(r.qc || "").toUpperCase() ===
                  "PARTIALLY_INSPECTED"
                ? "Continue QC"
                : "QC"}
        </Link>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Inward Entries"
        subtitle="Receive components from vendors. Inward automatically updates inventory."
        right={
          canManageInward ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
             onClick={
  selectionMode
    ? async () => {
        if (!selectedRowKeys.length) return;

        try {
          await Promise.all(
            selectedRowKeys.map((id) =>
              fetchAuthenticatedJson(
                `${config.baseURL}/inward/${id}/`,
                {
                  method: "DELETE",
                }
              )
            )
          );

          const deletedIds =
            new Set(
              selectedRowKeys.map(
                (id) => String(id)
              )
            );

          setInwardEntries(
            (previous) =>
              previous.filter(
                (entry) =>
                  !deletedIds.has(
                    String(entry.id)
                  )
              )
          );

          setSelectedRowKeys([]);
          setSelectionMode(false);
        } catch (err) {
          console.error(
            "Failed to delete Inward entries:",
            err
          );

          alert(
            err?.message ||
              "Failed to delete Inward entries from the backend."
          );

          /*
           * Do not hide the row locally when backend deletion fails.
           */
          await loadAllData();
        }
      }
    : () => {
        setSelectedRowKeys([]);
        setSelectionMode(true);
      }
}
              disabled={selectionMode && selectedRowKeys.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#d94a65] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: "#E85D75" }}
            >
              {selectionMode ? `Delete Selected (${selectedRowKeys.length})` : "Delete"}
            </button>
            {selectionMode && (
              <button
                type="button"
                onClick={() => {
                  setSelectedRowKeys([]);
                  setSelectionMode(false);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
            )}
            <Link to="/inward/new" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90">
              <Plus className="size-4" /> Create Inward Entry
            </Link>

            <Dialog open={vendorsModalOpen} onOpenChange={setVendorsModalOpen}>
              <div>
                <DialogTrigger asChild>
                  <button className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary">
                    Add Vendor
                  </button>
                </DialogTrigger>

                <DialogContent className="max-w-6xl">
                  <form onSubmit={submitVendor}>
                    <DialogHeader>
                      <DialogTitle>Add Vendor</DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-2 xl:grid-cols-4">
                      <Field label="Company Name" required>
                        <Input
                          name="name"
                          value={vendorForm.name}
                          onChange={handleVendorChange}
                        />
                      </Field>

                      <Field label="Contact Person">
                        <Input
                          name="contact_person"
                          value={vendorForm.contact_person}
                          onChange={handleVendorChange}
                        />
                      </Field>

                      <Field label="Phone">
                        <Input
                          name="phone_number"
                          value={vendorForm.phone_number}
                          inputMode="numeric"
                          maxLength={10}
                          placeholder="10-digit phone"
                          onChange={(e) =>
                            setVendorForm((previous) => ({
                              ...previous,
                              phone_number:
                                e.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 10),
                            }))
                          }
                        />
                      </Field>

                      <Field label="Email">
                        <Input
                          type="email"
                          name="email"
                          value={vendorForm.email}
                          onChange={handleVendorChange}
                          placeholder="name@company.com"
                        />
                      </Field>

                      <Field label="Address">
                        <Input
                          name="address"
                          value={vendorForm.address}
                          onChange={handleVendorChange}
                        />
                      </Field>

                      <Field label="City">
                        <Input
                          name="city"
                          value={vendorForm.city}
                          onChange={handleVendorChange}
                        />
                      </Field>

                      <Field label="Pincode">
                        <Input
                          name="pincode"
                          value={vendorForm.pincode}
                          inputMode="numeric"
                          maxLength={6}
                          onChange={(e) =>
                            setVendorForm((previous) => ({
                              ...previous,
                              pincode:
                                e.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 6),
                            }))
                          }
                        />
                      </Field>

                      <Field label="State">
                        <Input
                          name="state"
                          value={vendorForm.state}
                          onChange={handleVendorChange}
                        />
                      </Field>

                      <Field label="State Code">
                        <Input
                          name="state_code"
                          value={vendorForm.state_code}
                          inputMode="numeric"
                          maxLength={2}
                          onChange={(e) =>
                            setVendorForm((previous) => ({
                              ...previous,
                              state_code:
                                e.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 2),
                            }))
                          }
                        />
                      </Field>

                      <Field label="GST Number">
                        <Input
                          name="gst_number"
                          value={vendorForm.gst_number}
                          onChange={handleVendorChange}
                        />
                      </Field>

                      <Field label="Payment Terms">
                        <Input
                          name="payment_terms"
                          value={vendorForm.payment_terms}
                          onChange={handleVendorChange}
                        />
                      </Field>

                      <Field label="Shipping Terms">
                        <Input
                          name="shipping_terms"
                          value={vendorForm.shipping_terms}
                          onChange={handleVendorChange}
                        />
                      </Field>

                      <Field label="Additional Notes">
                        <Input
                          name="additional_notes"
                          value={vendorForm.additional_notes}
                          onChange={handleVendorChange}
                        />
                      </Field>

                      <Field label="Status">
                        <Select
                          name="is_active"
                          value={vendorForm.is_active ? "true" : "false"}
                          onChange={handleVendorChange}
                          options={[
                            { value: "true", label: "Active" },
                            { value: "false", label: "Inactive" },
                          ]}
                        />
                      </Field>
                    </div>

                    <div className="mt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-semibold">
                          Components / Products
                        </h3>

                        <button
                          type="button"
                          onClick={addVendorProduct}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white"
                        >
                          + Add Components
                        </button>
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full min-w-[900px] border-collapse text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-2 py-2 text-left">Component</th>
                              <th className="px-2 py-2">Version</th>
                              <th className="px-2 py-2">Qty</th>
                              <th className="px-2 py-2">Unit Price</th>
                              <th className="px-2 py-2">Price</th>
                              <th className="px-2 py-2">GST %</th>
                              <th className="px-2 py-2">Total</th>
                              <th className="px-2 py-2">Delete</th>
                            </tr>
                          </thead>

                          <tbody>
                            {vendorProducts.map((item, index) => {
                              const price =
                                Number(item.price || 0);

                              const total =
                                price +
                                (price *
                                  Number(item.gst || 0)) /
                                  100;

                              return (
                                <tr
                                  key={index}
                                  className="border-t border-border"
                                >
                                  <td className="px-2 py-1.5">
                                    <Input
                                      value={item.product}
                                      placeholder="Component"
                                      onChange={(e) =>
                                        handleVendorProductChange(
                                          index,
                                          "product",
                                          e.target.value
                                        )
                                      }
                                    />
                                  </td>

                                  <td className="px-2 py-1.5">
                                    <Input
                                      value={item.product_version}
                                      onChange={(e) =>
                                        handleVendorProductChange(
                                          index,
                                          "product_version",
                                          e.target.value
                                        )
                                      }
                                    />
                                  </td>

                                  <td className="px-2 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      value={item.quantity}
                                      onChange={(e) =>
                                        handleVendorProductChange(
                                          index,
                                          "quantity",
                                          e.target.value
                                        )
                                      }
                                    />
                                  </td>

                                  <td className="px-2 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.unit_price}
                                      onChange={(e) =>
                                        handleVendorProductChange(
                                          index,
                                          "unit_price",
                                          e.target.value
                                        )
                                      }
                                    />
                                  </td>

                                  <td className="px-2 py-1.5">
                                    <Input
                                      value={price.toFixed(2)}
                                      readOnly
                                    />
                                  </td>

                                  <td className="px-2 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.gst}
                                      onChange={(e) =>
                                        handleVendorProductChange(
                                          index,
                                          "gst",
                                          e.target.value
                                        )
                                      }
                                    />
                                  </td>

                                  <td className="px-2 py-1.5 text-center font-semibold">
                                    ₹{total.toFixed(2)}
                                  </td>

                                  <td className="px-2 py-1.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeVendorProduct(index)
                                      }
                                      className="rounded-md px-2 py-1 text-red-600 hover:bg-red-50"
                                    >
                                      Delete
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-2 flex justify-end text-sm font-semibold">
                        Grand Total:
                        <span className="ml-2 text-primary">
                          ₹{vendorGrandTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <DialogFooter>
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-2"
                        onClick={() =>
                          setVendorsModalOpen(false)
                        }
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        disabled={savingVendor}
                        className="ml-2 rounded-lg bg-primary px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingVendor
                          ? "Saving..."
                          : "Save Vendor"}
                      </button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </div>
            </Dialog>

            <Dialog open={componentsModalOpen} onOpenChange={handleComponentDialogOpenChange}>
              <div>
                <DialogTrigger asChild>
                  <button className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary">+ New Component</button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <form onSubmit={submitComponent}>
                    <DialogHeader>
                      <DialogTitle>New Component</DialogTitle>
                    </DialogHeader>
                    <FormGrid>
                      <Field label="Component ID" required>
                        <Input
                          name="component_id"
                          value={componentForm.component_id}
                          readOnly
                          tabIndex={-1}
                          title="Component ID is generated automatically"
                          className="cursor-not-allowed bg-muted font-mono"
                        />
                      </Field>


                      <Field label="Version">
                        <Input
                          name="version"
                          value={componentForm.version || ""}
                          onChange={handleComponentChange}
                        />
                      </Field>

                      <Field label="Category" required>
                        <Select
                          name="category"
                          value={componentForm.category}
                          onChange={handleComponentChange}
                          options={[
                            { value: "ACCESSORIES", label: "Accessories" },
                            { value: "AIRFRAMES", label: "Airframes" },
                            { value: "COMMUNICATION", label: "Communication" },
                            { value: "ELECTRICALS", label: "Electricals" },
                            { value: "ELECTRONICS", label: "Electronics" },
                            { value: "PAYLOAD", label: "Payload" },
                            { value: "TOOLS", label: "Tools" },
                          ]}
                        />
                      </Field>

                      <Field label="Component Type" required>
                        <Input
                          name="component_type"
                          value={componentForm.component_type}
                          onChange={handleComponentChange}
                          placeholder="Example: Flight Controller"
                        />
                      </Field>

                      <Field label="Specification">
                        <Input name="specifications" value={componentForm.specifications} onChange={handleComponentChange} />
                      </Field>

                      <Field label="HSN.No">
                        <Input
                          name="hsn_no"
                          value={componentForm.hsn_no || ""}
                          inputMode="numeric"
                          pattern="\d{4,8}"
                          minLength={4}
                          maxLength={8}
                          title="Enter 4 to 8 digits, or leave blank."
                          placeholder="4 to 8 digits"
                          onChange={(event) =>
                            setComponentForm((previous) => ({
                              ...previous,
                              hsn_no: String(
                                event.target.value || ""
                              )
                                .replace(/\D/g, "")
                                .slice(0, 8),
                            }))
                          }
                        />
                      </Field>

                      <Field label="SKU.No">
                        <Input name="sku_no" value={componentForm.sku_no} onChange={handleComponentChange} />
                      </Field>

                      <Field label="Part.No">
                        <Input name="part_no" value={componentForm.part_no} onChange={handleComponentChange} />
                      </Field>

                      <Field label="Tally Reference">
                        <Input name="tally_reference" value={componentForm.tally_reference} onChange={handleComponentChange} />
                      </Field>
<Field label="Product Link">
                        <Input name="product_link" value={componentForm.product_link} onChange={handleComponentChange} placeholder="https://..." />
                      </Field>
                    </FormGrid>
                    <DialogFooter>
                      <button type="button" className="rounded-lg border px-3 py-2" onClick={() => setComponentsModalOpen(false)}>Cancel</button>
                      <button type="submit" disabled={savingComponent} className="rounded-lg bg-primary px-3 py-2 text-white ml-2 disabled:cursor-not-allowed disabled:opacity-50">{savingComponent ? "Saving..." : "Save Component"}</button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </div>
            </Dialog>
          </div>
          ) : null
        }
      />

      <Dialog
        open={failedQcDetails.open}
        onOpenChange={(open) =>
          setFailedQcDetails((previous) => ({
            ...previous,
            open,
            ...(open ? {} : { inward: null, rows: [] }),
          }))
        }
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Failed QC Details</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <div>
                <span className="font-semibold">INW:</span>{" "}
                {formatInwCode(
                  failedQcDetails.inward?.code,
                  failedQcDetails.inward?.id
                ) || "-"}
              </div>
              <div>
                <span className="font-semibold">Component:</span>{" "}
                {failedQcDetails.inward?.componentName || "-"}
              </div>
              <div>
                <span className="font-semibold">Failed count:</span>{" "}
                {failedQcDetails.rows.length}
              </div>
            </div>

            {failedQcDetails.rows.length > 0 ? (
              <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="border-b border-border px-4 py-3 text-left">
                        S.No
                      </th>
                      <th className="border-b border-border px-4 py-3 text-left">
                        Serial Number
                      </th>
                      <th className="border-b border-border px-4 py-3 text-left">
                        Remarks
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedQcDetails.rows.map((failedRow, index) => (
                      <tr key={`${failedRow.id}-${index}`} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-3">{index + 1}</td>
                        <td className="px-4 py-3 font-mono font-semibold">
                          {failedRow.serialNumber}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {failedRow.remarks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Failed count exists, but the backend did not return failed serial details or remarks.
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() =>
                setFailedQcDetails({ open: false, inward: null, rows: [] })
              }
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="inward-table-center rounded-lg overflow-hidden bg-card p-4">
        <style>{`
          .inward-table-center th,
          .inward-table-center td {
            text-align: center !important;
          }

          .inward-table-center th > div {
            justify-content: center !important;
            text-align: center !important;
          }
        `}</style>
        <DataTable
            enableColumnTools
columns={columns}
          rows={inwardEntries}
          loading={loading}
          hideEmptyState={Boolean(loadError)}
          selectable={canManageInward && selectionMode}
          selectedRowKeys={selectedRowKeys}
          onSelectedRowKeysChange={setSelectedRowKeys}
        />

        {!loading && loadError && (
          <div className="flex min-h-[140px] w-full items-center justify-center border-t border-rose-200 bg-rose-50 px-6 py-8 text-center text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {loadError}
          </div>
        )}
      </div>
    </PageShell>
  );
}