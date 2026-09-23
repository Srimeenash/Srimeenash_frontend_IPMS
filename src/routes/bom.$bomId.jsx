import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { DataTable } from "@/components/app/DataTable";
import config from "@/config";
import { FormGrid, Field, Input, Select, SearchableSelect } from "@/components/app/FormShell";
import { ArrowLeft } from "lucide-react";
import { fetchJson, fetchAuthenticatedJson } from "@/api";
import { useAuth } from "@/AuthContext";
import { getUserRole } from "@/permissions";

export default function BOMDetailPage() {
  const { bomId } = useParams();
  const { user, activeRole } = useAuth();

  const [newRows, setNewRows] = useState([]);
  const [bom, setBom] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [componentsList, setComponentsList] = useState([]);
  const [inventoryCounts, setInventoryCounts] = useState({});

  const userRole =
    getUserRole(
      user,
      activeRole,
    ).toUpperCase();

  const isManager =
    userRole === "MANAGER";

  const isEngineer =
    userRole === "ENGINEER";

  const isAdmin =
    userRole === "ADMIN";

const bomStatus = String(
  bom?.status || ""
).toUpperCase();

/*
 * Pending Manager is editable by the engineer.
 * Approved is locked.
 * Manager Rejected and Modified are editable.
 */
const canEngineerEdit =
  (isEngineer || isAdmin) &&
  [
    "PENDING_MANAGER",
    "MANAGER_REJECTED",
    "MODIFIED",
  ].includes(bomStatus);

const canManagerReview =
  isManager &&
  [
    "PENDING_MANAGER",
    "MODIFIED",
  ].includes(bomStatus);

const [
  managerRejectOpen,
  setManagerRejectOpen,
] = useState(false);

const [
  managerRejectRemarks,
  setManagerRejectRemarks,
] = useState("");
const toApiList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;

  if (data && typeof data === "object") {
    const arrays = Object.values(data).filter(
      Array.isArray,
    );

    if (arrays.length) {
      return arrays.flat();
    }
  }

  return [];
};


const addNormalizedMatchKey = (
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
      value.code,
      value.inventory_code,
      value.component_name,
      value.componentName,
      value.name,
      value.product_name,
      value.productName,
      value.label,
      value.display_name,
    ].forEach((candidate) =>
      addNormalizedMatchKey(
        keySet,
        candidate,
      ),
    );

    return;
  }

  const text = String(value).trim();

  if (!text) return;

  const normalized =
    text.toLowerCase();

  keySet.add(normalized);

  const compact =
    normalized.replace(
      /[^a-z0-9]/g,
      "",
    );

  if (compact) {
    keySet.add(compact);
  }

  const parts = text
    .split(/\s*[—–-]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 1) {
    parts.forEach((part) =>
      addNormalizedMatchKey(
        keySet,
        part,
      ),
    );
  }

  const digitGroups =
    text.match(/\d+/g);

  if (digitGroups?.length) {
    const digits =
      digitGroups.join("");

    keySet.add(digits);
    keySet.add(`cmp-${digits}`);
    keySet.add(`cmp${digits}`);
  }
};


const extractInventoryMatchKeys = (
  item = {},
) => {
  const keys = new Set();

  [
    item.component,
    item.component_pk,
    item.component_db_id,
    item.component_code,
    item.component_id,
    item.componentCode,
    item.componentId,
    item.code,
    item.inventory_code,
    item.grn,
    item.inward_code,
    item.component_code_display,
    item.component_id_display,
    item.component_label,
    item.componentLabel,
    item.label,
    item.display_name,
    item.displayName,
    item.component_name,
    item.componentName,
    item.product_name,
    item.productName,
    item.name,
    item.component_details,
    item.component_obj,
    item.component_data,
    item.componentInfo,
    item.component_info,
  ].forEach((value) =>
    addNormalizedMatchKey(keys, value),
  );

  return Array.from(keys);
};


const getBomRowMatchKeys = (
  row = {},
) => {
  const keys = new Set();

  [
    row.component,
    row.component_pk,
    row.component_db_id,
    row.component_id,
    row.componentId,
    row.component_code,
    row.componentCode,
    row.component_name,
    row.componentName,
    row.component_label,
    row.componentLabel,
    row.label,
    row.name,
    row.component_details,
    row.component_obj,
    row.component_data,
  ].forEach((value) =>
    addNormalizedMatchKey(keys, value),
  );

  const matchingComponent =
    componentsList.find((component) => {
      const componentKeys =
        extractInventoryMatchKeys(
          component,
        );

      for (const key of keys) {
        if (
          componentKeys.includes(key)
        ) {
          return true;
        }
      }

      return false;
    });

  if (matchingComponent) {
    extractInventoryMatchKeys(
      matchingComponent,
    ).forEach((key) =>
      keys.add(key),
    );
  }

  return Array.from(keys);
};


const getInventoryQuantityForBomRow = (
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

      return Number.isFinite(quantity)
        ? Math.max(quantity, 0)
        : 0;
    }
  }

  return 0;
};


const collectQcRows = (value) => {
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
    ];

    for (const candidate of candidates) {
      const rows =
        collectQcRows(candidate);

      if (rows.length) {
        return rows;
      }
    }
  }

  return [];
};


const getQcPassedRows = (entry) => {
  const candidates = [
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
  ];

  for (const candidate of candidates) {
    const rows =
      collectQcRows(candidate);

    if (rows.length) {
      return rows;
    }
  }

  return [];
};


const isQcPassedInward = (entry) => {
  const status = String(
    entry?.qc_status ||
      entry?.inspection_status ||
      entry?.qcStatus ||
      entry?.status ||
      entry?.qc_results?.status ||
      entry?.qc?.status ||
      "",
  )
    .trim()
    .toUpperCase();

  if (
    [
      "PASS",
      "PASSED",
      "QC PASS",
      "QC PASSED",
      "APPROVED",
      "COMPLETED",
      "QC COMPLETED",
      "QC_DONE",
      "DONE",
    ].includes(status)
  ) {
    return true;
  }

  if (
    [
      "FAIL",
      "FAILED",
      "QC FAIL",
      "QC FAILED",
      "REJECTED",
      "REJECT",
    ].includes(status)
  ) {
    return false;
  }

  if (
    getQcPassedRows(entry).length
  ) {
    return true;
  }

  return (
    entry?.qc_passed === true ||
    entry?.qcPassed === true ||
    entry?.is_qc_passed === true
  );
};


const getAvailableQuantity = (item) => {
  const rawQuantity =
    item.available_quantity ??
    item.availableQuantity ??
    item.remaining_quantity ??
    item.remainingQuantity ??
    item.in_store_quantity ??
    item.inStoreQuantity ??
    item.stock_quantity ??
    item.stockQuantity ??
    item.quantity ??
    item.qty ??
    item.passed_quantity ??
    item.quantity_received ??
    item.total_quantity ??
    0;

  const quantity = Number(
    rawQuantity,
  );

  return Number.isFinite(quantity)
    ? Math.max(quantity, 0)
    : 0;
};


const getPassedInwardQuantity = (
  entry,
) => {
  const passedRows =
    getQcPassedRows(entry);

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
            Number.isFinite(quantity)
              ? Math.max(quantity, 0)
              : 0
          )
        );
      },
      0,
    );
  }

  return getAvailableQuantity(entry);
};


const isInwardGeneratedInventoryRow = (
  item,
) => {
  const source = String(
    item.source ||
      item.inventory_source ||
      item.stock_source ||
      "",
  )
    .trim()
    .toLowerCase();

  const inventoryCode = String(
    item.inventory_code ||
      item.code ||
      "",
  ).trim();

  const serialText = [
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
    .join(",");

  return Boolean(
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
};


const loadComponents = async () => {
  try {
    const data =
      await fetchAuthenticatedJson(
        `${config.baseURL}/components/components/?page_size=5000`,
      );

    const list =
      toApiList(data);

    setComponentsList(list);

    return list;
  } catch (error) {
    console.error(
      "Failed to load components:",
      error,
    );

    setComponentsList([]);
    return [];
  }
};


const loadInventoryCounts =
  async () => {
    try {
      const [componentData, inventoryData] =
        await Promise.all([
          fetchAuthenticatedJson(
            `${config.baseURL}/components/components/?page_size=5000`,
          ).catch(() => []),
          fetchAuthenticatedJson(
            `${config.baseURL}/inventory/inventory/?page_size=5000`,
          ).catch(() => []),
        ]);

      const componentRows =
        toApiList(componentData);

      const inventoryRows =
        toApiList(inventoryData);

      setComponentsList(componentRows);

      const componentByKey = new Map();

      componentRows.forEach((component) => {
        extractInventoryMatchKeys(
          component,
        ).forEach((key) => {
          componentByKey.set(
            key,
            component,
          );
        });
      });

      const getCombinedKeys = (item) => {
        const keys = new Set(
          extractInventoryMatchKeys(item),
        );

        for (
          const key of
          extractInventoryMatchKeys(item)
        ) {
          const component =
            componentByKey.get(key);

          if (component) {
            extractInventoryMatchKeys(
              component,
            ).forEach((componentKey) =>
              keys.add(componentKey),
            );
            break;
          }
        }

        return Array.from(keys);
      };

      const counts = {};

      inventoryRows.forEach((item) => {
        if (
          item.issued === true ||
          item.issued === 1
        ) {
          return;
        }

        const inventoryScope = String(
          item.inventory_scope ||
            item.inventoryScope ||
            "",
        )
          .trim()
          .toLowerCase();

        const sourceMrNumber = String(
          item.source_mr_number ||
            item.sourceMrNumber ||
            item.material_request_number ||
            item.material_request_id ||
            item.request_id ||
            "",
        ).trim();

        if (
          inventoryScope === "project" ||
          sourceMrNumber
        ) {
          return;
        }

        const quantity =
          getAvailableQuantity(item);

        if (
          !Number.isFinite(quantity) ||
          quantity <= 0
        ) {
          return;
        }

        getCombinedKeys(item).forEach(
          (key) => {
            counts[key] =
              Number(counts[key] || 0) +
              quantity;
          },
        );
      });

      console.debug(
        "Current central In-Store counts:",
        counts,
      );

      setInventoryCounts(counts);
      return counts;
    } catch (error) {
      console.error(
        "Failed to load current In-Store quantities:",
        error,
      );
      setInventoryCounts({});
      return {};
    }
  };


useEffect(() => {
  void loadInventoryCounts();
}, [bomId]);


const CATEGORY_OPTIONS = [
  { value: "ACCESSORIES", label: "Accessories" },
  { value: "AIRFRAMES", label: "Airframes" },
  { value: "COMMUNICATION", label: "Communication" },
  { value: "ELECTRICALS", label: "Electricals" },
  { value: "ELECTRONICS", label: "Electronics" },
  { value: "PAYLOAD", label: "Payload" },
  { value: "TOOLS", label: "Tools" },
];

const CATEGORY_PREFIXES = {
  ACCESSORIES: "AC",
  AIRFRAMES: "AF",
  COMMUNICATION: "CM",
  ELECTRICALS: "EL",
  ELECTRONICS: "EN",
  PAYLOAD: "PL",
  TOOLS: "TL",
};

const componentOptions = componentsList.map((component) => ({
  value: `${component.component_id} — ${component.name}`,
  label: `${component.component_id} — ${component.name}`,

  // Important: database primary key
  id: component.id,

  component_id: component.component_id,
  category: component.category,
  component_type:
    component.component_type || component.componentType || "",
  specifications:
    component.specifications || component.specification || "",
  hsnNo:
    component.hsn_numbers ||
    component.hsn_no ||
    component.hsn ||
    "",
  uom:
    component.unit_of_measurements ||
    component.unit_of_measurement ||
    component.uom ||
    component.unit ||
    "",
}));

const specificationOptions = Array.from(
  new Map(
    componentOptions
      .filter((option) => String(option.specifications || "").trim())
      .map((option) => [String(option.specifications).trim(), option]),
  ).values(),
).map((option) => ({
  value: String(option.specifications).trim(),
  label: String(option.specifications).trim(),
  componentValue: option.value,
  componentId: option.id,
  component_id: option.component_id,
  category: option.category,
  component_type: option.component_type,
  specifications: option.specifications,
}));

const [showComponentModal, setShowComponentModal] = useState(false);
const [componentForm, setComponentForm] = useState({
  component_id: "",
  category: "",
  component_type: "",
  specification: "",
  hsn_no: "",
  sku_no: "",
  part_no: "",
  tally_reference: "",
  unit_of_measurements: "",
  product_link: "",
});

const generateNextComponentId = async (category) => {
  try {
    const cleanCategory = String(category || "").trim().toUpperCase();
    const prefix = CATEGORY_PREFIXES[cleanCategory];
    if (!prefix) throw new Error("Invalid component category.");

    const response = await fetch(
      `${config.baseURL}/components/components/?category=${encodeURIComponent(cleanCategory)}&page_size=5000`,
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

const openComponentModal = async () => {
  const nextComponentId = await generateNextComponentId("ACCESSORIES");

  setComponentForm({
    component_id: nextComponentId,
    category: "ACCESSORIES",
    component_type: "",
    specification: "",
    hsn_no: "",
    sku_no: "",
    part_no: "",
    tally_reference: "",
    unit_of_measurements: "",
    product_link: "",
  });

  setShowComponentModal(true);
};

const saveComponent = async () => {
  const validCategoryValues = CATEGORY_OPTIONS.map((option) => option.value);
  const isValidUrl = (url) => {
    if (!url) return true;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  if (!validCategoryValues.includes(componentForm.category)) {
    alert("Please select a valid category from the dropdown.");
    return;
  }

  if (!isValidUrl(componentForm.product_link)) {
    alert("Product Link must be a valid URL, including https:// or http://.");
    return;
  }

  const selectedPrefix = CATEGORY_PREFIXES[componentForm.category];
  const componentIdPattern = selectedPrefix
    ? new RegExp(`^${selectedPrefix}_\\d{4}$`, "i")
    : null;

  if (
    !componentIdPattern ||
    !componentIdPattern.test(componentForm.component_id.trim())
  ) {
    const nextId = await generateNextComponentId(componentForm.category);
    setComponentForm((previous) => ({
      ...previous,
      component_id: nextId,
    }));
    alert(`Component ID refreshed to ${nextId}. Please save again.`);
    return;
  }

  const payload = {
    request_id: `CR-${Date.now()}`,
    component_id: componentForm.component_id.trim(),
    category: componentForm.category,
    component_type: String(componentForm.component_type || "").trim(),
    specifications: componentForm.specification,
    unit_of_measurements: componentForm.unit_of_measurements,
    hsn_numbers: componentForm.hsn_no,
    sku_numbers: componentForm.sku_no,
    part_numbers: componentForm.part_no,
    tally_reference: componentForm.tally_reference,
    product_link: componentForm.product_link,
    date: new Date().toISOString().split("T")[0],
    is_active: true,
  };

  try {
    const response = await fetch(
      `${config.baseURL}/components/components/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      alert("Failed to save component.");
      return;
    }

    const created = await response.json();
    await loadComponents();

    setNewRows((prev) => [
      ...prev,
      {
        component_code:
          created.component_id || created.id || created.code || created.name || "",
        category: created.category || componentForm.category || "",
        component_type:
          created.component_type || componentForm.component_type || "",
        specifications:
          created.specifications || created.specification || componentForm.specification || "",
        unit:
          created.unit_of_measurements ||
          created.unit_of_measurement ||
          componentForm.unit_of_measurements ||
          "",
        quantity: 1,
      },
    ]);

    setShowComponentModal(false);
  } catch (err) {
    console.error(err);
    alert("Failed to save component.");
  }
};

const getComponentTypeForBomRow = (row = {}) => {
  const directType =
    row.component_type ||
    row.componentType ||
    row.component?.component_type ||
    row.component?.componentType ||
    "";

  if (String(directType).trim()) {
    return String(directType).trim();
  }

  const matched = componentsList.find((component) =>
    Number(component?.id) === Number(row?.component) ||
    String(component?.component_id || "") ===
      String(row?.component_code || "") ||
    String(component?.component_id || "") ===
      String(row?.component_id || "")
  );

  return String(
    matched?.component_type ||
    matched?.componentType ||
    ""
  ).trim();
};

const getUomForBomRow = (row = {}) => {
  return String(
    row.unit ||
    row.uom ||
    row.unit_of_measurements ||
    row.unit_of_measurement ||
    ""
  ).trim();
};

const [editingIndex, setEditingIndex] = useState(null);
const [editRow, setEditRow] = useState(null);
const computeRow = (row) => ({
  ...row,
  quantity: Number(row.quantity || 0),
});
const addRow = () => {
  setNewRows((prev) => [
    ...prev,
    {
      component: null,
      component_code: "",
      category: "",
      component_type: "",
      specifications: "",
      unit: "",
      quantity: 1,
      remarks: "",
    },
  ]);
};

const updateNewRow = (index, patch) => {
  setNewRows((prev) =>
    prev.map((row, i) =>
      i === index ? computeRow({ ...row, ...patch }) : row
    )
  );
};

const deleteRow = (index) => {
  setNewRows((prev) => prev.filter((_, i) => i !== index));
};


  useEffect(() => {
    loadBOMDetail();
  }, [bomId]);

  const loadBOMDetail = async () => {
    setLoading(true);
    setError(null);

    try {
      const bomData = await fetchJson(
        `${config.baseURL}/bom/bom/?bom_number=${encodeURIComponent(bomId)}`
      );

      const bomList = Array.isArray(bomData)
        ? bomData
        : bomData.results || [];

      const currentBom = bomList.find((b) => b.bom_number === bomId);

      if (!currentBom) throw new Error("BOM not found");

      setBom(currentBom);

      try {
const normalized = (currentBom.items || []).map((item) => ({
  ...item,
  quantity: Number(item.quantity || 0),
}));

setItems(normalized);
      } catch {
        setItems(currentBom.items || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(Number(value) || 0);

  const handleDeleteItem = async (index) => {
  try {
    const item = items[index];

    await fetch(
      `${config.baseURL}/bom/bom-items/${item.id}/`,
      {
        method: "DELETE",
      }
    );

const updatedItems = items.filter(
  (_, i) => i !== index
);

setItems(updatedItems);

await loadBOMDetail();
  } catch (err) {
    console.error(err);
    alert(err.message || "Failed to delete component");
  }
};

const handleEditItem = (index) => {
  setEditingIndex(index);
  setEditRow({ ...items[index] });
};
const handleSaveEdit = async () => {
  try {
    const quantity = Number(editRow.quantity || 0);

    const updatedItem = await fetchAuthenticatedJson(
      `${config.baseURL}/bom/bom-items/${editRow.id}/`,
      {
        method: "PUT",
        body: JSON.stringify({
          bom: Number(bom.id),
          component_code: editRow.component_code,
          category: editRow.category,
          specifications: editRow.specifications,
          quantity: quantity,
          unit: String(
            editRow.unit ||
            editRow.unit_of_measurements ||
            ""
          ).trim(),
          remarks: editRow.remarks || "",
        }),
      }
    );
    const normalizedItem = {
      ...updatedItem,
      quantity: Number(updatedItem.quantity || 0),
    };

    const updated = [...items];
    updated[editingIndex] = normalizedItem;

setItems(updated);
setEditingIndex(null);
setEditRow(null);

await loadBOMDetail();
  } catch (err) {
    console.error(err);
    alert("Failed to update component");
  }
};
const handleCancelEdit = () => {
  setEditingIndex(null);
  setEditRow(null);
};
const handleAddItem = async () => {
  try {
    if (!newRows.length) {
      alert("Please add at least one component.");
      return;
    }

    for (const row of newRows) {
      const quantity = Number(row.quantity || 0);

      if (!row.component) {
        alert("Please select a valid component for every row.");
        return;
      }

      if (quantity <= 0) {
        alert("Quantity must be greater than 0.");
        return;
      }

      const payload = {
        bom: Number(bom.id),

        // IMPORTANT
        component: Number(row.component),

        category: row.category || "",
        specifications: row.specifications || "",
        quantity: quantity,
        unit: String(
          row.unit ||
          row.unit_of_measurements ||
          ""
        ).trim(),
        remarks: row.remarks || "",
      };

      console.log("BOM ITEM PAYLOAD:", payload);

      await fetchAuthenticatedJson(
        `${config.baseURL}/bom/bom-items/`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
    }

    await loadBOMDetail();
setNewRows([]);

  } catch (err) {
    console.error("Failed to save BOM item:", err);
    alert("Failed to save components");
  }
};

const allItems = [...items, ...newRows];

// totalCost removed — pricing is no longer displayed for BOM items
const approveBOM = async () => {
  if (!bom?.id) {
    alert("BOM ID is missing.");
    return;
  }

  try {
    const response = await fetch(
      `${config.baseURL}/bom/bom/${bom.id}/approve/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          approved_by:
            loggedUser.name ||
            loggedUser.username ||
            loggedUser.email ||
            "MANAGER",
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.detail ||
          "Failed to approve BOM."
      );
    }

    setBom(data);
    await loadBOMDetail();
  } catch (error) {
    console.error(
      "Failed to approve BOM:",
      error
    );

    alert(
      error.message ||
        "Failed to approve BOM."
    );
  }
};

const rejectBOM = async () => {
  if (!managerRejectRemarks.trim()) {
    alert("Enter manager rejection remarks.");
    return;
  }

  if (!bom?.id) {
    alert("BOM ID is missing.");
    return;
  }

  try {
    const response = await fetch(
      `${config.baseURL}/bom/bom/${bom.id}/reject/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          remarks:
            managerRejectRemarks.trim(),

          rejected_by:
            loggedUser.name ||
            loggedUser.username ||
            loggedUser.email ||
            "MANAGER",
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.detail ||
          data?.remarks?.[0] ||
          "Failed to reject BOM."
      );
    }

    setBom(data);
    setManagerRejectOpen(false);
    setManagerRejectRemarks("");

    await loadBOMDetail();
  } catch (error) {
    console.error(
      "Failed to reject BOM:",
      error
    );

    alert(
      error.message ||
        "Failed to reject BOM."
    );
  }
};
  if (loading) {
    return (
      <PageShell>
        <PageHeader title="Loading..." subtitle="Fetching BOM details" />
      </PageShell>
    );
  }

  if (error || !bom) {
    return (
      <PageShell>
        <PageHeader title="BOM Not Found" subtitle={error} />
      </PageShell>
    );
  }

  return (
    <PageShell>
<PageHeader
  title={`BOM: ${
    bom.bom_name ||
    bom.bom_number
  }`}
  subtitle={`Product: ${
    bom.product_name || "N/A"
  } | Version: ${
    bom.version || "N/A"
  }`}
  left={
    <Link
      to="/bom"
      className="inline-flex items-center gap-2 text-sm font-medium text-red-500 hover:text-red-600"
    >
      <ArrowLeft className="h-4 w-4" />
      <span>Back to BOM</span>
    </Link>
  }
  right={
    canManagerReview ? (
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          onClick={approveBOM}
        >
          Approve
        </button>

        <button
          type="button"
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          onClick={() => {
            setManagerRejectRemarks("");
            setManagerRejectOpen(true);
          }}
        >
          Reject
        </button>
      </div>
    ) : null
  }
/>
      {/* Header Info */}
<FormGrid>
  <Field label="BOM Number">
    <Input value={bom.bom_number || ""} readOnly />
  </Field>

  <Field label="BOM Name">
    <Input value={bom.bom_name || ""} readOnly />
  </Field>

  <Field label="Version">
    <Input value={bom.version || ""} readOnly />
  </Field>

  <Field label="Created By">
    <Input value={bom.created_by || ""} readOnly />
  </Field>

  <Field label="Created Date">
    <Input
      value={
        bom.created_at
          ? new Date(bom.created_at).toLocaleDateString("en-IN")
          : ""
      }
      readOnly
    />
  </Field>
<Field label="Status">
  <Input
    value={
      {
        PENDING_MANAGER:
          "Pending Manager",

        APPROVED:
          "Approved",

        MANAGER_REJECTED:
          "Manager Rejected",

        MODIFIED:
          "Modified",
      }[bomStatus] ||
      bom.status ||
      ""
    }
    readOnly
  />
</Field>

{bomStatus === "MANAGER_REJECTED" && (
  <Field label="Manager Rejection Remarks">
    <Input
      value={
        bom.manager_rejection_reason ||
        ""
      }
      readOnly
    />
  </Field>
)}
  {/* Total cost removed as pricing is no longer shown */}
</FormGrid>

      {/* ITEMS */}
<section className="mt-8">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-lg font-semibold">BOM Components</h2>

{canEngineerEdit && (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={addRow}
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    >
      <Plus className="h-4 w-4" />
      Add Item
    </button>

    <button
      type="button"
      onClick={openComponentModal}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
    >
      <Plus className="h-4 w-4" />
      Add Component
    </button>
  </div>
)}
  </div>

  <div className="overflow-x-auto rounded-xl border border-border">
    <table className="w-full min-w-[1000px] border-collapse text-sm">
      {/* HEADER */}
      <thead className="bg-muted/50">
        <tr>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase border-b">Specifications</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase border-b">Component ID</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase border-b">HSN No</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase border-b">Category</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase border-b">Component Type</th>
          <th className="px-4 py-3 text-center text-xs font-semibold uppercase border-b">Qty</th>
          <th className="px-4 py-3 text-center text-xs font-semibold uppercase border-b">UOM</th>
          <th className="px-4 py-3 text-center text-xs font-semibold uppercase border-b">Inventory Qty</th>
          <th className="px-4 py-3 text-right text-xs font-semibold uppercase border-b">Remarks</th>
          <th className="px-4 py-3 text-center text-xs font-semibold uppercase border-b">Action</th>
        </tr>
      </thead>

      <tbody>
        {items.map((row, i) => (
          <tr key={row.id} className="border-b hover:bg-muted/30 transition-colors">
            <td className="px-4 py-3 text-left">
              {row.specifications || "-"}
            </td>
            <td className="px-4 py-3 text-left">
  {row.component_code || row.component || "N/A"}
</td>
            <td className="px-4 py-3 text-left">
              {(() => {
                const comp = componentsList.find(
                  (c) =>
                    String(c.component_id) === String(row.component_code) ||
                    String(c.id) === String(row.component) ||
                    String(c.code) === String(row.component_code),
                );
                return comp?.hsn_numbers || comp?.hsn_no || comp?.hsn || row.hsn_no || "-";
              })()}
            </td>
            <td className="px-4 py-3 text-left">{row.category}</td>
            <td className="px-4 py-3 text-left">
              {getComponentTypeForBomRow(row) || "-"}
            </td>
            {/* QTY */}
            <td className="px-4 py-3 text-center">
              {editingIndex === i ? (
                <Input
                  type="number"
                  value={editRow?.quantity || 0}
                  onChange={(e) =>
                    setEditRow({
                      ...editRow,
                      quantity: Number(e.target.value),
                    })
                  }
                />
              ) : (
                row.quantity
              )}
            </td>

            {/* UOM */}
            <td className="px-4 py-3 text-center">
              {editingIndex === i ? (
                <Input
                  value={editRow?.unit || ""}
                  placeholder="e.g. NOS, MTR, KG"
                  onChange={(e) =>
                    setEditRow({
                      ...editRow,
                      unit: e.target.value,
                    })
                  }
                />
              ) : (
                getUomForBomRow(row) || "-"
              )}
            </td>

            {/* INVENTORY QTY */}
            <td className="px-4 py-3 text-center">
              {getInventoryQuantityForBomRow(row)}
            </td>

            <td className="px-4 py-3 text-right">
              {editingIndex === i ? (
                <Input
                  value={editRow?.remarks || ""}
                  onChange={(e) => setEditRow({ ...editRow, remarks: e.target.value })}
                />
              ) : (
                row.remarks || ""
              )}
            </td>

            {/* ACTION */}
{/* ACTION */}
<td className="px-4 py-3 text-center">
  {canEngineerEdit ? (
    <div className="flex items-center justify-center gap-2">
      {editingIndex === i ? (
        <>
          <button
            type="button"
            onClick={handleSaveEdit}
            className="text-green-600 text-xs"
          >
            Save
          </button>

          <button
            type="button"
            onClick={handleCancelEdit}
            className="text-gray-500 text-xs"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() =>
              handleEditItem(i)
            }
            className="text-blue-500 hover:text-blue-600"
          >
            <Edit2 className="size-4" />
          </button>

          <button
            type="button"
            onClick={() =>
              handleDeleteItem(i)
            }
            className="text-red-500 hover:text-red-600"
          >
            <Trash2 className="size-4" />
          </button>
        </>
      )}
    </div>
  ) : (
    <span className="text-xs text-muted-foreground">
      Locked
    </span>
  )}
</td>
          </tr>
        ))}

       {canEngineerEdit &&
  newRows.map((row, i) => (
          <tr
            key={`new-${i}`}
            className="border-b hover:bg-muted/30 transition-colors"
          >
            <td className="px-4 py-3 text-left">
              <SearchableSelect
                name={`specification-${i}`}
                value={row.specifications || ""}
                options={specificationOptions}
                placeholder="Search or type specification..."
                onChange={(e) => {
                  const value = e.target.value;
                  const selected = specificationOptions.find(
                    (option) => option.label === value,
                  );

                  updateNewRow(i, {
                    component: selected?.componentId || row.component || null,
                    component_code: selected?.component_id || row.component_code || "",
                    category: selected?.category || "",
                    component_type: selected?.component_type || "",
                    specifications: selected?.specifications || value,
                    unit: row.unit || "",
                  });
                }}
              />
            </td>
            <td className="px-4 py-3 text-left">
              <SearchableSelect
                name={`component-${i}`}
                value={
                  componentOptions.find(
                    (opt) => opt.component_id === row.component_code
                  )?.label || row.component_code || ""
                }
                options={componentOptions}
                placeholder="Search or type component..."
                onChange={(e) => {
  const value = e.target.value;

  const selected = componentOptions.find(
    (opt) => opt.label === value || opt.value === value
  );

  updateNewRow(i, {
    // Keep the display code
    component_code: selected?.component_id || value,

    // Store the actual Component database ID
    component: selected?.id || selected?.value || null,

    category: selected?.category || "",
    component_type: selected?.component_type || "",
    specifications: selected?.specifications || "",
    unit: row.unit || "",
  });
}}
              />
            </td>

            <td className="px-4 py-3 text-left">
              {(() => {
                const selected = componentOptions.find(
                  (option) => option.component_id === row.component_code,
                );
                return selected?.hsnNo || "-";
              })()}
            </td>

            <td className="px-4 py-3 text-left">
              <Input value={row.category} readOnly />
            </td>

            <td className="px-4 py-3 text-left">
              <Input value={row.component_type || ""} readOnly />
            </td>

            {/* QTY */}
            <td className="px-4 py-3">
              <Input
                type="number"
                value={row.quantity}
                onChange={(e) =>
                  updateNewRow(i, { quantity: Number(e.target.value) })
                }
              />
            </td>

            {/* UOM */}
            <td className="px-4 py-3 text-center">
              <Input
                value={row.unit || ""}
                placeholder="e.g. NOS, MTR, KG"
                onChange={(e) =>
                  updateNewRow(i, {
                    unit: e.target.value,
                  })
                }
              />
            </td>

            {/* INVENTORY QTY */}
            <td className="px-4 py-3 text-center">
              {getInventoryQuantityForBomRow(row)}
            </td>

            
            <td className="px-4 py-3 text-right">
              <Input
                value={row.remarks || ""}
                onChange={(e) => updateNewRow(i, { remarks: e.target.value })}
              />
            </td>

            {/* ACTION */}
            <td className="px-4 py-3 text-center">
              <button
                onClick={() => deleteRow(i)}
                className="text-red-500 hover:text-red-600"
              >
                <Trash2 className="size-4" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>


{canEngineerEdit && (
  <div className="flex justify-end mt-4">
    <button
      type="button"
      onClick={handleAddItem}
      className="rounded-lg bg-primary px-5 py-2 text-white"
    >
      Save Components
    </button>
  </div>
)}
</section>

{canEngineerEdit &&
  showComponentModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 px-4">
    <div className="w-full max-w-3xl rounded-xl border border-border bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <h2 className="mb-5 text-lg font-semibold text-slate-900 dark:text-slate-100">+ New Component</h2>

      <FormGrid>
        <Field label="Component ID">
          <Input
            value={componentForm.component_id}
            readOnly
            tabIndex={-1}
            title="Component ID is generated automatically"
            className="cursor-not-allowed bg-muted font-mono"
          />
        </Field>

        <Field label="Category">
          <Select
            name="category"
            value={componentForm.category}
            onChange={async (e) => {
              const category = e.target.value;
              setComponentForm((previous) => ({
                ...previous,
                category,
                component_id: "",
              }));
              const nextId = await generateNextComponentId(category);
              setComponentForm((previous) => ({
                ...previous,
                category,
                component_id: nextId,
              }));
            }}
            options={CATEGORY_OPTIONS}
          />
        </Field>

        <Field label="Component Type">
          <Input
            value={componentForm.component_type}
            placeholder="Example: Flight Controller"
            onChange={(e) =>
              setComponentForm({
                ...componentForm,
                component_type: e.target.value,
              })
            }
          />
        </Field>

        <Field label="Specification">
          <Input
            value={componentForm.specification}
            onChange={(e) =>
              setComponentForm({
                ...componentForm,
                specification: e.target.value,
              })
            }
          />
        </Field>

        <Field label="HSN">
          <Input
            value={componentForm.hsn_no}
            inputMode="numeric"
            pattern="\\d{4,8}"
            minLength={4}
            maxLength={8}
            title="Enter 4 to 8 digits, or leave blank."
            onChange={(e) =>
              setComponentForm({
                ...componentForm,
                hsn_no: e.target.value,
              })
            }
          />
        </Field>

        <Field label="SKU">
          <Input
            value={componentForm.sku_no}
            onChange={(e) =>
              setComponentForm({
                ...componentForm,
                sku_no: e.target.value,
              })
            }
          />
        </Field>

        <Field label="Part No">
          <Input
            value={componentForm.part_no}
            onChange={(e) =>
              setComponentForm({
                ...componentForm,
                part_no: e.target.value,
              })
            }
          />
        </Field>

        <Field label="Tally Reference">
          <Input
            value={componentForm.tally_reference}
            onChange={(e) =>
              setComponentForm({
                ...componentForm,
                tally_reference: e.target.value,
              })
            }
          />
        </Field>

        <Field label="UOM">
          <Input
            value={componentForm.unit_of_measurements}
            onChange={(e) =>
              setComponentForm({
                ...componentForm,
                unit_of_measurements: e.target.value,
              })
            }
          />
        </Field>

        <Field label="Product Link">
          <Input
            type="url"
            value={componentForm.product_link}
            placeholder="https://example.com"
            maxLength={200}
            onChange={(e) =>
              setComponentForm({
                ...componentForm,
                product_link: e.target.value,
              })
            }
          />
        </Field>
      </FormGrid>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => setShowComponentModal(false)}
          className="rounded-lg border px-4 py-2"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={saveComponent}
          className="rounded-lg bg-primary px-5 py-2 text-white"
        >
          Save
        </button>
      </div>
    </div>
  </div>
)}
{managerRejectOpen && (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-white">
      <h2 className="text-lg font-semibold">
        Reject BOM
      </h2>

      <p className="mt-2 text-sm text-muted-foreground">
        {bom.bom_number}
      </p>

      <textarea
        rows={5}
        className="mt-4 w-full rounded-lg border p-3 dark:bg-slate-900"
        placeholder="Enter rejection remarks..."
        value={managerRejectRemarks}
        onChange={(event) =>
          setManagerRejectRemarks(
            event.target.value
          )
        }
      />

      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          className="rounded-lg border px-4 py-2"
          onClick={() => {
            setManagerRejectOpen(false);
            setManagerRejectRemarks("");
          }}
        >
          Cancel
        </button>

        <button
          type="button"
          className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          onClick={rejectBOM}
        >
          Reject BOM
        </button>
      </div>
    </div>
  </div>
)}
    </PageShell>
  );
}