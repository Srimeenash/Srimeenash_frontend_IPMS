import { useRef, useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { DataTable } from "@/components/app/DataTable";
import { FormGrid, Field, Input, Select, Textarea, SearchableSelect } from "@/components/app/FormShell";
import config from "@/config";

import {
  fetchAuthenticatedJson,
} from "@/api";
import { useAuth } from "@/AuthContext";
import { canWork } from "@/permissions";

const getMaterialRequestDatePart = (date = new Date()) => {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
};

const buildMaterialRequestId = (sequence = 1, date = new Date()) =>
  `MR-${getMaterialRequestDatePart(date)}-${String(sequence).padStart(5, "0")}`;


const RETURNABLE_PURPOSE_OPTIONS = [
  { value: "FLIGHT_TEST", label: "Flight Test" },
  { value: "CUSTOMER_DEMO", label: "Demo/Trials" },
  { value: "QC_CHECK", label: "QC Check" },
  { value: "EVENT", label: "Event" },
  { value: "MISCELLANEOUS_USAGE", label: "Miscellaneous Usage" },
];

const RETURNABLE_DRONE_OR_COMPONENT_PURPOSES = new Set([
  "FLIGHT_TEST",
  "CUSTOMER_DEMO",
  "EVENT",
]);

const RETURNABLE_FOUR_DAY_PURPOSES = new Set([
  "FLIGHT_TEST",
  "QC_CHECK",
  "MISCELLANEOUS_USAGE",
]);

const IN_DRONE_MR_STATUSES = new Set([
  "INVENTORY_ISSUED",
  "MR_COMPLETED",
  "ISSUED",
  "COMPLETED",
]);

const getExistingDroneRequestTypeLabel = (request = {}) => {
  const requestType = String(
    request?.request_type || request?.requestType || "",
  )
    .trim()
    .toUpperCase();

  const remarks = String(request?.remarks || "").toLowerCase();
  if (
    remarks.includes("automatically recreated from scrap") ||
    remarks.includes("automatically created from scrap")
  ) {
    return "From Scrap";
  }

  if (requestType === "BOM") {
    const customized =
      request?.customized_bom === true ||
      request?.customized_bom === 1 ||
      String(request?.customized_bom || "").toLowerCase() === "true";

    return customized ? "Custom BOM" : "BOM";
  }

  if (requestType === "R&D" || requestType === "RD") {
    return "R&D";
  }

  return requestType
    ? requestType
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "-";
};

const addDaysToIsoDate = (isoDate, days) => {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
};

const createEmptyRequestItem = () => ({
  component: "",
  category: "",
  component_type: "",
  specifications: "",
  qty: 1,
  unit: "",
  unit_price: 0,
  tax: 0,
  vendor: "",
  remarks: "",
});

function NewMaterialRequestPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const canManageMR =
    canWork(user, "material-request");
const [bomLabel, setBomLabel] = useState("");
const [projectOptions, setProjectOptions] = useState([]);
const [projectsLoading, setProjectsLoading] = useState(false);
  const [form, setForm] = useState({
    requester_name: "",
    date: new Date().toISOString().slice(0, 10),
    project: "",
    bom: "",
    required_quantity: 1,
    required_date: "",
    remarks: "",
    material_request_id: buildMaterialRequestId(1),
  });


const [selectedBom, setSelectedBom] = useState(null);
  const [bomOptions, setBomOptions] = useState([]);
  const [rows, setRows] = useState([]);
const [bomList, setBomList] = useState([]);
const [showComponentModal, setShowComponentModal] = useState(false);
const [componentsList, setComponentsList] = useState([]);
const [inventoryCounts, setInventoryCounts] = useState({});
const CATEGORY_CHOICES = [
  "ACCESSORIES",
  "AIRFRAMES",
  "COMMUNICATION",
  "ELECTRICALS",
  "ELECTRONICS",
  "PAYLOAD",
  "TOOLS",
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

const getComponentCode = (component = {}) =>
  String(
    component.component_id ||
      component.component_code ||
      component.code ||
      component.id ||
      component.pk ||
      "",
  ).trim();

const componentOptions = componentsList
  .map((c) => ({
  value: c.id ?? c.pk ?? c.component_id,
  component_id: getComponentCode(c),
  component_code: getComponentCode(c),
  label: `${getComponentCode(c) || c.id || c.pk || ""}`,
  category: c.category || "",
  component_type:
    c.component_type ||
    c.componentType ||
    c.type ||
    "",
  specifications: c.specification || c.specifications || c.component_specifications || "",
  hsnNo: c.hsn_no || c.hsn_numbers || c.hsn || "",
  unit: c.unit_of_measurements || c.unit || c.uom || "",
  unit_price: Number(c.unit_price || 0),
  }))
  .filter((option) => option.value !== undefined && option.value !== null);

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
  componentCode: option.component_code,
  category: option.category,
  component_type: option.component_type,
  specifications: option.specifications,
  hsnNo: option.hsnNo,
  unit_price: option.unit_price,
}));

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


const normalizeComponentIdentity = (
  value,
) =>
  String(value ?? "")
    .trim()
    .toLowerCase();


const getComponentObject = (
  item = {},
) =>
  (
    item.component &&
    typeof item.component === "object"
      ? item.component
      : null
  ) ||
  item.component_details ||
  item.component_obj ||
  item.component_data ||
  item.componentInfo ||
  item.component_info ||
  null;


const getExactComponentCodeReferences = (
  item = {},
) => {
  const componentObject =
    getComponentObject(item);

  const primitiveComponent =
    typeof item.component !== "object"
      ? String(
          item.component ?? "",
        ).trim()
      : "";

  return Array.from(
    new Set(
      [
        item.component_code,
        item.componentCode,
        item.component_code_display,
        item.component_id_display,
        componentObject?.component_id,
        componentObject?.component_code,
        componentObject?.code,

        /*
         * Accept primitive item.component as a code only when it
         * clearly looks like a component code. A value such as "2"
         * is a database ForeignKey and must not be treated as a code.
         */
        /^(?:CMP|AC|AF|CM|EL|EN|PL|TL)[-_]/i.test(
          primitiveComponent,
        )
          ? primitiveComponent
          : "",
      ]
        .map(
          normalizeComponentIdentity,
        )
        .filter(Boolean),
    ),
  );
};


const getExactComponentDatabaseReferences = (
  item = {},
) => {
  const componentObject =
    getComponentObject(item);

  const primitiveComponent =
    typeof item.component !== "object"
      ? String(
          item.component ?? "",
        ).trim()
      : "";

  return Array.from(
    new Set(
      [
        item.component_pk,
        item.component_db_id,
        item.componentDatabaseId,
        componentObject?.id,
        componentObject?.pk,

        /*
         * A numeric primitive component value is the actual
         * Component ForeignKey returned by DRF.
         */
        /^\d+$/.test(
          primitiveComponent,
        )
          ? primitiveComponent
          : "",
      ]
        .map(
          normalizeComponentIdentity,
        )
        .filter(Boolean),
    ),
  );
};


const getExactComponentNameReferences = (
  item = {},
) => {
  const componentObject =
    getComponentObject(item);

  return Array.from(
    new Set(
      [
        item.component_name,
        item.componentName,
        item.product_name,
        item.productName,
        item.name,
        componentObject?.name,
        componentObject?.component_name,
      ]
        .map(
          normalizeComponentIdentity,
        )
        .filter(Boolean),
    ),
  );
};


const resolveCanonicalComponent = (
  item = {},
  componentRows = componentsList,
) => {
  if (!Array.isArray(componentRows)) {
    return null;
  }

  /*
   * 1. Exact component code is the strongest identity.
   *
   * This protects a BOM row when an old/stale numeric component
   * field disagrees with its explicit CMP code.
   */
  const codeReferences =
    getExactComponentCodeReferences(item);

  if (codeReferences.length) {
    const codeMatch =
      componentRows.find(
        (component) => {
          const aliases = [
            component.component_id,
            component.component_code,
            component.code,
          ]
            .map(
              normalizeComponentIdentity,
            )
            .filter(Boolean);

          return codeReferences.some(
            (reference) =>
              aliases.includes(reference),
          );
        },
      );

    if (codeMatch) {
      return codeMatch;
    }
  }

  /*
   * 2. Match the actual Component database ForeignKey.
   */
  const databaseReferences =
    getExactComponentDatabaseReferences(
      item,
    );

  if (databaseReferences.length) {
    const databaseMatch =
      componentRows.find(
        (component) => {
          const aliases = [
            component.id,
            component.pk,
          ]
            .map(
              normalizeComponentIdentity,
            )
            .filter(Boolean);

          return databaseReferences.some(
            (reference) =>
              aliases.includes(reference),
          );
        },
      );

    if (databaseMatch) {
      return databaseMatch;
    }
  }

  /*
   * 3. Exact component-name fallback is allowed only when one
   * component master row has that name. Partial-name, digit and
   * inventory-code matching are deliberately not used.
   */
  const nameReferences =
    getExactComponentNameReferences(item);

  if (nameReferences.length) {
    const nameMatches =
      componentRows.filter(
        (component) => {
          const aliases = [
            component.name,
            component.component_name,
          ]
            .map(
              normalizeComponentIdentity,
            )
            .filter(Boolean);

          return nameReferences.some(
            (reference) =>
              aliases.includes(reference),
          );
        },
      );

    if (nameMatches.length === 1) {
      return nameMatches[0];
    }
  }

  return null;
};


const getCanonicalComponentKey = (
  item = {},
  componentRows = componentsList,
) => {
  const component =
    resolveCanonicalComponent(
      item,
      componentRows,
    );

  if (!component) {
    return "";
  }

  const databaseId =
    component.id ??
    component.pk;

  if (
    databaseId !== undefined &&
    databaseId !== null &&
    databaseId !== ""
  ) {
    return (
      "db:" +
      normalizeComponentIdentity(
        databaseId,
      )
    );
  }

  const componentCode =
    component.component_id ||
    component.component_code ||
    component.code ||
    "";

  return componentCode
    ? (
        "code:" +
        normalizeComponentIdentity(
          componentCode,
        )
      )
    : "";
};


const getInventoryQuantityForBomRow = (
  row,
) => {
  const canonicalKey =
    getCanonicalComponentKey(
      row,
      componentsList,
    );

  if (!canonicalKey) {
    return 0;
  }

  const quantity = Number(
    inventoryCounts[canonicalKey] || 0,
  );

  return Number.isFinite(quantity)
    ? Math.max(quantity, 0)
    : 0;
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
    const nestedCandidates = [
      value.rows,
      value.items,
      value.results,
      value.passedRows,
      value.passed_rows,
      value.passed,
    ];

    for (
      const candidate of
      nestedCandidates
    ) {
      const rows =
        collectQcRows(candidate);

      if (rows.length) {
        return rows;
      }
    }
  }

  return [];
};


const getQcPassedRows = (
  entry,
) => {
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


const isQcPassedInward = (
  entry,
) => {
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


const getAvailableQuantity = (
  item,
) => {
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

      /*
       * Store quantities by one canonical component identity only.
       *
       * Do not store quantity under component names, inventory codes,
       * partial labels, extracted digits or other aliases. Those broad
       * aliases caused stock from Wings to appear against Propeller.
       */
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

        const canonicalKey =
          getCanonicalComponentKey(
            item,
            componentRows,
          );

        if (!canonicalKey) {
          console.warn(
            "Skipping Inventory row with unresolved component:",
            item,
          );
          return;
        }

        counts[canonicalKey] =
          Number(
            counts[canonicalKey] || 0,
          ) + quantity;
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


const [componentForm, setComponentForm] = useState({
  component_id: "AC_0001",
  category: CATEGORY_CHOICES[0],
  component_type: "",
  specifications: "",
  hsn_no: "",
  sku_no: "",
  part_no: "",
  tally_reference: "",
  unit_of_measurements: "",
  product_link: "",
});
const [requestType, setRequestType] = useState("BOM");
const [customizedBom, setCustomizedBom] = useState(false);
const [returnablePurpose, setReturnablePurpose] = useState("");
const [returnableSource, setReturnableSource] = useState("");
const [selectedDroneMrId, setSelectedDroneMrId] = useState("");
const [selectedDroneQuantity, setSelectedDroneQuantity] = useState("");
const [inDroneRequests, setInDroneRequests] = useState([]);
const [requestRows, setRequestRows] = useState([createEmptyRequestItem()]);
const [rdRows, setRdRows] = useState([
{
  component: "",
  category: "",
  component_type: "",
  specifications: "",
  qty: 1,
  unit: "",
  unit_price: 0,
  tax: 0,
  vendor: "",
  remarks: "",
}
]);

const isDroneOrComponentPurpose =
  requestType === "RETURNABLE" &&
  RETURNABLE_DRONE_OR_COMPONENT_PURPOSES.has(returnablePurpose);

const isDirectDroneReturnable =
  isDroneOrComponentPurpose &&
  returnableSource === "DRONE";

const isComponentReturnable =
  requestType === "RETURNABLE" &&
  (
    !isDroneOrComponentPurpose ||
    returnableSource === "COMPONENTS"
  );

const inDroneMrOptions = inDroneRequests.map((request) => {
  const mrNumber = String(
    request?.material_request_id ||
      request?.request_id ||
      request?.mr_id ||
      "",
  ).trim();

  const project = String(
    request?.project ||
      request?.project_name ||
      "-",
  ).trim() || "-";

  const typeLabel =
    getExistingDroneRequestTypeLabel(request);

  const availableQuantity = Math.max(
    Number(
      request?._in_drone_available_quantity ??
        request?._in_drone_total_quantity ??
        request?.required_quantity ??
        request?.drone_quantity ??
        request?.drone_qty ??
        request?.quantity ??
        0,
    ) || 0,
    0,
  );

  return {
    value: mrNumber,
    label: `${mrNumber} | ${project} | ${typeLabel} | Available: ${availableQuantity}`,
    project,
    typeLabel,
    availableQuantity,
    request,
  };
});

const selectedDroneMrOption =
  inDroneMrOptions.find(
    (option) =>
      String(option.value) ===
      String(selectedDroneMrId),
  ) || null;

/*
 * Drone quantity available on the selected completed/In-Drone MR.
 *
 * required_quantity is the normal MR drone quantity. The extra fallbacks keep
 * older API responses compatible.
 */
const selectedDroneMrTotalQuantity = Math.max(
  Number(
    selectedDroneMrOption?.request?.required_quantity ??
      selectedDroneMrOption?.request?.drone_quantity ??
      selectedDroneMrOption?.request?.drone_qty ??
      selectedDroneMrOption?.request?.quantity ??
      0,
  ) || 0,
  0,
);

const selectedDroneMrSoldQuantity = Math.max(
  Number(
    selectedDroneMrOption?.request?._in_drone_sold_quantity ??
      0,
  ) || 0,
  0,
);

const selectedDroneMrAvailableQuantity = Math.max(
  Number(
    selectedDroneMrOption?.request?._in_drone_available_quantity ??
      (
        selectedDroneMrTotalQuantity -
        selectedDroneMrSoldQuantity
      ),
  ) || 0,
  0,
);

const selectedDroneMrUsageSummary =
  selectedDroneMrOption?.request?._in_drone_usage_summary ||
  {};

const selectedDroneMrIsSold =
  Boolean(
    selectedDroneMrOption?.request?._in_drone_is_sold,
  ) ||
  (
    selectedDroneMrTotalQuantity > 0 &&
    selectedDroneMrSoldQuantity >=
      selectedDroneMrTotalQuantity
  );

const returnableMaxDate =
  requestType === "RETURNABLE" &&
  RETURNABLE_FOUR_DAY_PURPOSES.has(returnablePurpose)
    ? addDaysToIsoDate(form.date, 4)
    : "";
  // Popup state
  const [errors, setErrors] = useState({});
  const [materialRequestIdLoading, setMaterialRequestIdLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);


  
async function handleComponentChange(e) {
  const { name, value } = e.target;

  if (name === "category") {
    setComponentForm((previous) => ({
      ...previous,
      category: value,
      component_id: "",
    }));

    const nextId = await getNextComponentIdForCategory(value);

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

const getNextComponentId = (componentRows = [], category = "ACCESSORIES") => {
  const cleanCategory = String(category || "").trim().toUpperCase();
  const prefix = CATEGORY_PREFIXES[cleanCategory];

  if (!prefix) {
    return "";
  }

  const idPattern = /^[A-Z]+_(\d{4})$/i;

  const highestSequence = componentRows.reduce((highest, component) => {
    const componentId = String(
      component?.component_id ||
        component?.component_code ||
        component?.code ||
        ""
    ).trim();

    const match = componentId.match(idPattern);

    if (!match) {
      return highest;
    }

    const sequence = Number(match[1]);

    return Number.isFinite(sequence)
      ? Math.max(highest, sequence)
      : highest;
  }, 0);

  return `${prefix}_${String(highestSequence + 1).padStart(4, "0")}`;
};

const getNextComponentIdForCategory = async (category) => {
  const cleanCategory = String(category || "").trim().toUpperCase();

  try {
    const data = await fetchAuthenticatedJson(
      `${config.baseURL}/components/components/?page_size=5000`
    );

    const componentRows = toApiList(data);
    setComponentsList(componentRows);

    return getNextComponentId(componentRows, cleanCategory);
  } catch (error) {
    console.error(
      "Failed to generate category Component ID:",
      error
    );

    const prefix = CATEGORY_PREFIXES[cleanCategory];
    return prefix ? `${prefix}_0001` : "";
  }
};

async function openAddComponentModal() {
  if (!canManageMR) {
    return;
  }

  let componentRows = componentsList;

  try {
    // Fetch the latest Component Master rows before generating the ID.
    // This prevents a stale MR page from reusing an already-created ID.
    const data = await fetchAuthenticatedJson(
      `${config.baseURL}/components/components/?page_size=5000`
    );

    componentRows = toApiList(data);
    setComponentsList(componentRows);
  } catch (error) {
    console.error(
      "Failed to refresh components before generating Component ID:",
      error
    );
  }

  setComponentForm({
    component_id: getNextComponentId(componentRows, CATEGORY_CHOICES[0]),
    category: CATEGORY_CHOICES[0],
    component_type: "",
    specifications: "",
    hsn_no: "",
    sku_no: "",
    part_no: "",
    tally_reference: "",
    unit_of_measurements: "",
    product_link: "",
  });

  setShowComponentModal(true);
}

async function loadNextMaterialRequestId() {
  const datePart = getMaterialRequestDatePart();
  const idPattern = new RegExp(`^MR-${datePart}-(\\d{5})$`, "i");

  setMaterialRequestIdLoading(true);

  try {
    const [
      data,
      outwardData,
      componentUsageData,
    ] = await Promise.all([
      fetchAuthenticatedJson(
        `${config.baseURL}/materialrequest/material-requests/?page_size=1000`,
        { timeoutMs: 5000 },
      ).catch((error) => {
        console.warn(
          "Unable to load existing MR IDs; backend will assign the final MR ID:",
          error,
        );
        return [];
      }),
      fetchAuthenticatedJson(
        `${config.baseURL}/outward/?page_size=5000`
      ).catch((error) => {
        console.warn(
          "Unable to load Sales status for In-Drone MR options:",
          error,
        );
        return [];
      }),
      fetchAuthenticatedJson(
        `${config.baseURL}/component-usage/?page_size=5000`
      ).catch((error) => {
        console.warn(
          "Unable to load Flight Test / Demo / Event allocations for In-Drone MR options:",
          error,
        );
        return [];
      }),
    ]);

    const requestList = Array.isArray(data)
      ? data
      : Array.isArray(data?.results)
      ? data.results
      : [];

    const outwardRows = Array.isArray(outwardData)
      ? outwardData
      : Array.isArray(outwardData?.results)
      ? outwardData.results
      : [];

    const componentUsageRows = Array.isArray(
      componentUsageData,
    )
      ? componentUsageData
      : Array.isArray(componentUsageData?.results)
        ? componentUsageData.results
        : [];

    /*
     * Build reserved + approved Sales quantity per MR from Outward -> SALES.
     *
     * One sale can create one outward row per component, all with the same
     * invoice and drone quantity. Group by MR + invoice and use MAX quantity
     * exactly like the Inventory -> In Drone page, otherwise a 1-drone sale
     * could be counted multiple times because of its BOM components.
     */
    const salesBatchByKey = new Map();

    outwardRows
      .filter((row) => {
        const outwardType = String(
          row?.outward_type ||
            row?.type ||
            "",
        )
          .trim()
          .toUpperCase();

        return outwardType === "SALES";
      })
      .forEach((row) => {
        const approvalStatus = String(
          row?.approval_status ||
            row?.status ||
            "",
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
          Number(
            row?.quantity ??
              row?.qty ??
              0,
          ) || 0,
          0,
        );

        references.forEach((reference) => {
          const batchKey = `${reference}|${invoice}`;
          const previous =
            salesBatchByKey.get(batchKey) || {
              reference,
              quantity: 0,
              status: "",
            };

          // One Sale creates one row per BOM component. Count drone qty once.
          previous.quantity = Math.max(
            previous.quantity,
            quantity,
          );
          previous.status =
            approvalStatus || previous.status;

          salesBatchByKey.set(batchKey, previous);
        });
      });

    const reservedSalesQtyByReference = new Map();
    const approvedSalesQtyByReference = new Map();

    Array.from(salesBatchByKey.values()).forEach((batch) => {
      const rejected = [
        "MANAGEMENT_REJECTED",
        "REJECTED",
        "FINANCE_REJECTED",
      ].includes(batch.status);

      if (rejected) return;

      reservedSalesQtyByReference.set(
        batch.reference,
        Number(
          reservedSalesQtyByReference.get(batch.reference) || 0,
        ) + Number(batch.quantity || 0),
      );

      if (
        [
          "APPROVED",
          "MANAGEMENT_APPROVED",
          "SOLD",
        ].includes(batch.status)
      ) {
        approvedSalesQtyByReference.set(
          batch.reference,
          Number(
            approvedSalesQtyByReference.get(batch.reference) || 0,
          ) + Number(batch.quantity || 0),
        );
      }
    });

    /*
     * Existing drone choices for Returnable -> Flight Test / Demo-Trials / Event.
     * These are already-issued MRs, so selecting one must reuse the SAME MR number.
     *
     * RETAIL_SALES and RETURNABLE component MRs are intentionally excluded:
     * this dropdown represents an existing drone, not a component-only request.
     *
     * Sold MRs are intentionally kept in the dropdown so the user can see the
     * historical MR, but they are marked SOLD and cannot be submitted again.
     */
    setInDroneRequests(
      requestList
        .filter((request) => {
          const status = String(
            request?.status ||
              request?.approval_status ||
              "",
          )
            .trim()
            .toUpperCase();

          const requestType = String(
            request?.request_type ||
              request?.requestType ||
              "",
          )
            .trim()
            .toUpperCase();

          const mrNumber = String(
            request?.material_request_id ||
              request?.request_id ||
              request?.mr_id ||
              "",
          ).trim();

          return (
            Boolean(mrNumber) &&
            IN_DRONE_MR_STATUSES.has(status) &&
            !["RETURNABLE", "RETAIL_SALES"].includes(requestType)
          );
        })
        .map((request) => {
          const references = [
            request?.id,
            request?.pk,
            request?.material_request_id,
            request?.request_id,
            request?.mr_id,
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

          const soldQuantity = Math.max(
            ...[
              0,
              ...references.map(
                (reference) =>
                  Number(
                    approvedSalesQtyByReference.get(
                      reference,
                    ) || 0,
                  ),
              ),
            ],
          );

          const reservedSalesQuantity = Math.max(
            ...[
              0,
              ...references.map(
                (reference) =>
                  Number(
                    reservedSalesQtyByReference.get(
                      reference,
                    ) || 0,
                  ),
              ),
            ],
          );

          const droneQuantity = Math.max(
            Number(
              request?.required_quantity ??
                request?.drone_quantity ??
                request?.drone_qty ??
                request?.quantity ??
                0,
            ) || 0,
            0,
          );

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
                references.includes(reference),
              );
            });

          const movementGroups = new Map();

          matchingUsageRows.forEach((usage) => {
            const purpose = String(
              usage?.purpose || usage?.usage_purpose || "",
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

            const rawDetails = usage?.inventory_issue_details;
            const details = Array.isArray(rawDetails)
              ? rawDetails
              : rawDetails && typeof rawDetails === "object"
                ? [rawDetails]
                : [];

            const movementId = String(
              details.find(
                (detail) =>
                  detail &&
                  typeof detail === "object" &&
                  detail.movement_id,
              )?.movement_id ||
                usage?.movement_id ||
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
          let activeReturnableQuantity = 0;

          Array.from(movementGroups.values()).forEach((group) => {
            const allRejected = group.rows.every(
              (usage) =>
                String(usage?.return_approval_status || "")
                  .trim()
                  .toUpperCase() === "REJECTED",
            );

            if (allRejected) return;

            const fullyReleased = group.rows.every((usage) => {
              const condition = String(
                usage?.return_condition || "",
              )
                .trim()
                .toUpperCase();
              const approval = String(
                usage?.return_approval_status || "",
              )
                .trim()
                .toUpperCase();

              return condition === "OK" && approval === "COMPLETED";
            });

            if (fullyReleased) return;

            activeReturnableQuantity += group.quantity;
            usageSummary[group.purpose] =
              Number(usageSummary[group.purpose] || 0) +
              group.quantity;
          });

          const availableQuantity = Math.max(
            droneQuantity -
              reservedSalesQuantity -
              activeReturnableQuantity,
            0,
          );

          return {
            ...request,
            _in_drone_total_quantity: droneQuantity,
            _in_drone_sold_quantity: soldQuantity,
            _in_drone_sales_reserved_quantity:
              reservedSalesQuantity,
            _in_drone_returnable_quantity:
              activeReturnableQuantity,
            _in_drone_available_quantity:
              availableQuantity,
            _in_drone_usage_summary: usageSummary,
            _in_drone_is_sold:
              droneQuantity > 0 && soldQuantity >= droneQuantity,
          };
        }),
    );

    /*
     * Daily MR numbering:
     * MR-YYMMDD-00001, MR-YYMMDD-00002, ...
     *
     * Use the smallest unused sequence. Therefore an old invalid jump
     * such as MR-260911-00304 will not make the next ID 00305.
     */
    const usedSequences = new Set();

    requestList.forEach((request) => {
      const requestId = String(
        request?.material_request_id ||
          request?.request_id ||
          request?.mr_id ||
          ""
      ).trim();

      const match = requestId.match(idPattern);
      if (!match) return;

      const sequence = Number(match[1]);

      if (
        Number.isInteger(sequence) &&
        sequence > 0
      ) {
        usedSequences.add(sequence);
      }
    });

    let nextSequence = 1;

    while (usedSequences.has(nextSequence)) {
      nextSequence += 1;
    }

    setForm((previous) => ({
      ...previous,
      material_request_id:
        buildMaterialRequestId(nextSequence),
    }));
  } catch (error) {
    console.error(
      "Failed to generate the next Material Request ID:",
      error,
    );

    // Never use Date.now() as an MR sequence.
    // Backend assigns the authoritative final ID on POST.
    setForm((previous) => ({
      ...previous,
      material_request_id:
        buildMaterialRequestId(1),
    }));
  } finally {
    setMaterialRequestIdLoading(false);
  }
}

async function loadProjects() {
  setProjectsLoading(true);

  try {
    /*
     * Project must always come from the Project Master page/backend.
     * Do not keep a hard-coded project list in Material Request.
     */
    const data = await fetchAuthenticatedJson(
      `${config.baseURL}/projects/projects/?page_size=5000`
    );

    const projectRows = toApiList(data);

    /*
     * Show every currently available project that has a project name.
     * The Material Request stores the selected PROJECT NAME so the
     * existing backend payload remains unchanged.
     */
    const uniqueProjects = new Map();

    projectRows.forEach((project) => {
      if (!project || project.is_active === false) {
        return;
      }

      /*
       * CANCELLED projects must never be available for a new
       * Material Request. Project status is controlled from the
       * Projects page, so the MR dropdown always follows Project Master.
       */
      const projectStatus = String(
        project.status ||
          project.project_status ||
          ""
      )
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

      if (projectStatus === "CANCELLED") {
        return;
      }

      const projectName = String(
        project.name ||
          project.project_name ||
          ""
      ).trim();

      if (!projectName) {
        return;
      }

      const normalizedName =
        projectName.toLowerCase();

      if (!uniqueProjects.has(normalizedName)) {
        uniqueProjects.set(
          normalizedName,
          {
            value: projectName,
            label: projectName,
            project_code:
              project.project_code ||
              project.code ||
              "",
            status: projectStatus,
            id: project.id,
          }
        );
      }
    });

    const options = Array.from(
      uniqueProjects.values()
    ).sort((left, right) =>
      left.label.localeCompare(
        right.label,
        undefined,
        { sensitivity: "base" }
      )
    );

    setProjectOptions(options);

    /*
     * If an old/manual value is no longer present in Project Master,
     * clear it so a new MR cannot silently submit an invalid project.
     */
    setForm((previous) => {
      if (!previous.project) {
        return previous;
      }

      const exists = options.some(
        (option) =>
          String(option.value) ===
          String(previous.project)
      );

      return exists
        ? previous
        : {
            ...previous,
            project: "",
          };
    });
  } catch (error) {
    console.error(
      "Failed to load projects for Material Request:",
      error
    );
    setProjectOptions([]);
  } finally {
    setProjectsLoading(false);
  }
}


async function loadComponents() {
  try {
    const data = await fetchAuthenticatedJson(
      `${config.baseURL}/components/components/?page_size=5000`,
    );

    const list = toApiList(data);

    setComponentsList(list);
  } catch (err) {
    console.error("Failed to load components for Material Request:", err);
    setComponentsList([]);
  }
}
async function saveComponent() {
  if (!canManageMR) {
    return;
  }

  const payload = {
    component_id: componentForm.component_id,
    category: componentForm.category,
    component_type: String(
      componentForm.component_type || ""
    ).trim(),
    specifications: componentForm.specifications,
    unit_of_measurements: componentForm.unit_of_measurements,
    hsn_numbers: componentForm.hsn_no,
    sku_numbers: componentForm.sku_no,
    part_numbers: componentForm.part_no,
    product_link: componentForm.product_link,
    tally_reference: componentForm.tally_reference,
    ordering_id: null,
    unit_price: 0,
    stock_quantity: 0,
    reorder_level: 0,
    is_active: true,
  };

  try {
    const res = await fetch(`${config.baseURL}/components/components/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      console.log(err);
      alert("Unable to save component");
      return;
    }

    const newComponent = await res.json();

    alert("Component Added Successfully");
await loadComponents();
    setShowComponentModal(false);

    // reset form
    setComponentForm({
      component_id: getNextComponentId([...componentsList, newComponent]),
      category: CATEGORY_CHOICES[0],
      component_type: "",
      specifications: "",
      hsn_no: "",
      sku_no: "",
      part_no: "",
      tally_reference: "",
      unit_of_measurements: "",
      product_link: "",
    });

    // optional:
    // reload components here if your dropdown uses components

  } catch (err) {
    console.error(err);
    alert("Server error");
  }
}
async function addRow() {
  if (!canManageMR) {
    return;
  }

  if (!selectedBom?.id) return;

  const updatedItems = [...rows, newItem];

  const payload = {
    ...selectedBom,
    items: updatedItems,
  };

  try {
    const res = await fetch(
      `${`${config.baseURL}/bom/bom/`}${selectedBom.id}/`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    // 🔥 IMPORTANT: DO NOT assume JSON always
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("Backend returned HTML/error:", text);
      throw new Error("Server crashed (check backend logs)");
    }

    if (!res.ok) {
      console.error("Backend error:", data);
      throw new Error("Failed to update BOM");
    }

    setSelectedBom(data);
    setRows(mapBomRows(data));

    setShowModal(false);

    setNewItem({
      component_code: "",
      category: "",
      specifications: "",
      quantity: 1,
      unit_price: 0,
      price: 0,
      tax: 0,
    });

  } catch (err) {
    console.error(err);
    alert("BOM update failed — check backend");
  }
}
async function loadBomItems(
  bomId,
  droneQuantity = form.required_quantity,
) {
  try {
    const res = await fetch(
      `${`${config.baseURL}/bom/bom/`}${bomId}/`
    );
    const data = await res.json();

    setSelectedBom(data);

    /*
     * mapBomRows() uses the current form quantity, but React state updates
     * are asynchronous. When BOM is newly selected, pass the desired
     * multiplier explicitly by rebuilding rows from the original BOM data.
     */
    const multiplier =
      getDroneQuantityMultiplier(
        droneQuantity,
      );

    const mappedRows =
      (data?.items || data?.bom_items || []).map(
        (item) => {
          const baseQuantity = Math.max(
            Number(
              item.base_quantity ??
                item.baseQuantity ??
                item.bom_quantity ??
                item.bomQuantity ??
                item.quantity ??
                item.qty ??
                0,
            ) || 0,
            0,
          );

          const mapped = mapBomRows({
            items: [
              {
                ...item,
                base_quantity:
                  baseQuantity,
              },
            ],
          })[0];

          return computeBomRow({
            ...mapped,
            base_quantity:
              baseQuantity,
            quantity:
              baseQuantity *
              multiplier,
          });
        },
      );

    setRows(mappedRows);
  } catch (err) {
    console.error(err);
  }
}

useEffect(() => {
  if (user) {
    setForm((prev) => ({
      ...prev,
      requester_name:
        user.employee_name ||
        user.full_name ||
        user.username ||
        user.name ||
        user.email ||
        "",
    }));
  }
}, [user]);

useEffect(() => {
  async function fetchBoms() {
    try {
      const res = await fetch(`${config.baseURL}/bom/bom/`);
      if (!res.ok) throw new Error("Failed to fetch BOMs");
      const data = await res.json();

      const bomListData = Array.isArray(data) ? data : data.results;

      setBomList(bomListData);

      const options = bomListData.map((bom) => ({
        value: bom.id,
        label: `${bom.product_name} - ${bom.bom_name}`,
      }));

      setBomOptions(options);
    } catch (err) {
      console.error("Error fetching BOMs:", err);
    }
  }

  fetchBoms();
  loadProjects();
  loadComponents();
  loadInventoryCounts();
  loadNextMaterialRequestId();
}, []);

useEffect(() => {
  if (
    !selectedBom?.id ||
    componentsList.length === 0
  ) {
    return;
  }

  setRows(mapBomRows(selectedBom));
}, [selectedBom, componentsList]);


useEffect(() => {
  if (!componentsList.length) {
    return;
  }

  void loadInventoryCounts();
}, [componentsList.length]);

function handleChange(e) {
  const { name, value } = e.target;

  setForm((prev) => ({
    ...prev,
    [name]:
      name === "required_quantity"
        ? value.replace(/\D/g, "")
        : value,
  }));
}

const getDroneQuantityMultiplier = (
  value = form.required_quantity,
) => {
  const quantity = Number(value);

  return Number.isFinite(quantity) &&
    quantity > 0
    ? quantity
    : 1;
};

/*
 * Apply Drone Qty to BOM rows for BOTH:
 *   Customized BOM = No
 *   Customized BOM = Yes
 *
 * base_quantity is always the component requirement for ONE drone.
 * quantity is always the final MR requirement:
 *
 *   quantity = base_quantity × drone quantity
 */
const applyDroneQuantityToBomRows = (
  droneQuantity,
) => {
  const multiplier =
    getDroneQuantityMultiplier(
      droneQuantity,
    );

  setRows((previousRows) =>
    previousRows.map((row) => {
      const baseQuantity = Math.max(
        Number(
          row.base_quantity ??
            row.baseQuantity ??
            row.bom_quantity ??
            row.bomQuantity ??
            row.quantity ??
            0,
        ) || 0,
        0,
      );

      return computeBomRow({
        ...row,
        base_quantity:
          baseQuantity,
        quantity:
          baseQuantity *
          multiplier,
      });
    }),
  );
};


const updateBomRow = (i, patch) =>
  setRows((prev) =>
    prev.map((row, idx) =>
      idx === i ? { ...row, ...patch } : row
    )
  );




const computeBomRow = (row) => {
  const qty = Number(row.quantity || 0);
  const unitPrice = Number(row.unit_price || 0);
  const tax = Number(row.tax || 0);

  const price = qty * unitPrice;
  const total = price + (price * tax) / 100;

  return {
    ...row,
    price,
    total,
  };
};

const mapBomRows = (bomData) =>
  (bomData?.items || bomData?.bom_items || []).map((item) => {
    /*
     * BOM item quantity is the quantity required for ONE drone.
     *
     * Example:
     *   BOM Qty = 1, Drone Qty = 3 -> Required Qty = 3
     *   BOM Qty = 2, Drone Qty = 3 -> Required Qty = 6
     */
    const baseQty = Math.max(
      Number(
        item.base_quantity ??
          item.baseQuantity ??
          item.bom_quantity ??
          item.bomQuantity ??
          item.quantity ??
          item.qty ??
          0,
      ) || 0,
      0,
    );

    const droneQty =
      getDroneQuantityMultiplier();

    const qty =
      baseQty * droneQty;

    const unitPrice = Number(
      item.unit_price ?? item.unitPrice ??
        (qty ? Number(item.price ?? 0) / qty : 0) ??
        0,
    );
    const price = Number(item.price ?? item.price ?? qty * unitPrice ?? 0);
    const tax = Number(item.tax ?? item.gst ?? 0);
    const total = Number(item.total ?? item.total_price ?? price + (price * tax) / 100);

    const matchedComponent =
      resolveCanonicalComponent(
        item,
        componentsList,
      );
    const resolvedCategory =
      matchedComponent?.category ||
      item.category ||
      "";

    const resolvedComponentType =
      matchedComponent?.component_type ||
      matchedComponent?.componentType ||
      item.component_type ||
      item.componentType ||
      "";

    const resolvedSpecifications =
        matchedComponent?.specifications ??
        matchedComponent?.specification ??
        item.specifications ??
        item.specification ??
        "";
    const resolvedComponentCode =
      matchedComponent?.component_id ||
      matchedComponent?.component_code ||
      matchedComponent?.code ||
      matchedComponent?.id ||
      item.component_code ||
      item.component ||
      item.component_id ||
      "";

    const explicitComponentName =
      item.component_name ||
      item.name ||
      item.component ||
      item.component_code ||
      "";
    const fallbackComponentName =
      resolveComponentLabel(item.component_code || item.component || explicitComponentName) ||
      explicitComponentName ||
      "";

    return {
      ...item,
      component:
        matchedComponent?.id ??
        matchedComponent?.pk ??
        item.component ??
        null,
      component_code: resolvedComponentCode,
      component_name:
        matchedComponent?.component_id || matchedComponent?.id
          ? `${matchedComponent.component_id || matchedComponent.id} — ${matchedComponent.name || matchedComponent.component_name || ""}`
          : fallbackComponentName,
      category: resolvedCategory,
      component_type: resolvedComponentType,
      specifications: resolvedSpecifications,
      specification: resolvedSpecifications,
      hsn_no:
        matchedComponent?.hsn_no ||
        matchedComponent?.hsn_numbers ||
        matchedComponent?.hsn ||
        item.hsn_no ||
        item.hsn_numbers ||
        item.hsn ||
        "",
      /*
       * base_quantity stays unchanged and represents the BOM Qty
       * for ONE drone. quantity is the total MR requirement.
       */
      base_quantity: baseQty,
      quantity: qty,
      // UOM comes from the BOM item snapshot, NOT Component Master.
      unit:
        item.unit ||
        item.uom ||
        item.unit_of_measurements ||
        "",
      unit_price: unitPrice,
      price,
      tax,
      total,
    };
  });

const resolveComponentLabel = (componentCode) => {
  const value = String(componentCode || "").trim();
  const normalized = value.toLowerCase();
  const match = componentOptions.find((opt) => {
    const optLabel = String(opt.label || "").trim();
    const optCode = String(opt.component_code || "").trim();
    const optValue = String(opt.value || "").trim();
    return (
      optLabel.toLowerCase() === normalized ||
      optCode.toLowerCase() === normalized ||
      optValue.toLowerCase() === normalized ||
      (optLabel && normalized && optLabel.toLowerCase().includes(normalized))
    );
  });
  return match?.label || value;
};

const resolveComponentCode = (componentCodeOrLabel) => {
  const value = String(componentCodeOrLabel || "").trim();
  const normalized = value.toLowerCase();
  const match = componentOptions.find((opt) => {
    const optLabel = String(opt.label || "").trim();
    const optCode = String(opt.component_code || "").trim();
    const optValue = String(opt.value || "").trim();
    return (
      optLabel.toLowerCase() === normalized ||
      optCode.toLowerCase() === normalized ||
      optValue.toLowerCase() === normalized ||
      (optLabel && normalized && optLabel.toLowerCase().includes(normalized))
    );
  });

  if (match?.component_code) return match.component_code;
  if (match?.value) return String(match.value);
  if (value.includes(" — ")) return value.split(" — ")[0].trim();
  return value;
};
const resolveComponentOption = (row) => {
  return (
    componentOptions.find(
      (c) =>
        String(c.value) === String(row.component) ||
        String(c.id) === String(row.component) ||
        String(c.component_id) === String(row.component) ||
        String(c.code) === String(row.component_code) ||
        String(c.component_code) === String(row.component_code)
    ) || null
  );
};
const buildBomItemPayload = (row) => {
  const option = resolveComponentOption(row);
  const inventoryQuantity = Number(getInventoryQuantityForBomRow(row) || 0);
  /*
   * row.quantity is already:
   *
   *   BOM Qty per drone × Drone Quantity
   *
   * This TOTAL quantity is what the MR backend must receive.
   */
  const quantity = Number(
    row.quantity || 0
  );

  return {
    component:
      option?.value ??
      row.component ??
      null,

    component_code:
      option?.component_code ||
      row.component_code,

    component_name:
      option?.label ||
      row.component_name,

    category:
      option?.category ||
      row.category,

    component_type:
      option?.component_type ||
      row.component_type ||
      "",

    specification:
      option?.specifications ||
      row.specifications ||
      row.specification,

    hsn_no:
      option?.hsnNo ||
      row.hsn_no ||
      row.hsn_numbers ||
      "",

    quantity,
    inventory_quantity: inventoryQuantity,

    unit: String(
      row.unit ||
      row.uom ||
      row.unit_of_measurements ||
      ""
    ).trim(),

    unit_price: Number(row.unit_price || 0),

    price: Number(row.price || 0),

    tax: Number(row.tax || 0),

    total_price: Number(row.total || 0),

    vendor: row.vendor || "",

    remarks: row.remarks || "",
  };
};

const addBomRow = () => {
  setRows((prev) => [
    ...prev,
    {
      component: "",
      component_code: "",
      component_name: "",
      category: "",
      component_type: "",
      specifications: "",
      quantity: 1,
      unit: "",
      unit_price: 0,
      price: 0,
      tax: 0,
      total: 0,
      remarks: "",
    },
  ]);
};

const deleteBomRow = (i) =>
  setRows((prev) =>
    prev.filter((_, idx) => idx !== i)
  );

const updateRdRow = (i, patch) =>
  setRdRows((prev) =>
    prev.map((row, idx) =>
      idx === i ? { ...row, ...patch } : row
    )
  );
const addRdRow = () => {
  setRdRows((prev) => [
    ...prev,
{
  component: "",
  category: "",
  component_type: "",
  specifications: "",
  qty: 1,
  unit: "",
  unit_price: 0,
  tax: 0,
  vendor: "",
  remarks: "",
}
  ]);
};

const deleteRdRow = (i) =>
  setRdRows((rows) =>
    rows.filter((_, idx) => idx !== i)
  );


const updateRequestRow = (index, patch) =>
  setRequestRows((previous) =>
    previous.map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...patch } : row,
    ),
  );

const addRequestRow = () =>
  setRequestRows((previous) => [
    ...previous,
    createEmptyRequestItem(),
  ]);

const deleteRequestRow = (index) =>
  setRequestRows((previous) =>
    previous.filter((_, rowIndex) => rowIndex !== index),
  );

const buildRequestItemPayload = (row) => {
  const option = resolveComponentOption(row);
  const quantity = Number(row.qty || 0);
  const inventoryQuantity = Number(
    getInventoryQuantityForBomRow(row) || 0,
  );

  return {
    component: Number(row.component),
    category: row.category || "",
    component_type: row.component_type || "",
    specifications: row.specifications || "",
    hsn_no: option?.hsnNo || row.hsn_no || row.hsn_numbers || "",
    quantity,
    inventory_quantity: inventoryQuantity,
    unit: String(
      row.unit ||
      row.uom ||
      row.unit_of_measurements ||
      ""
    ).trim(),
    vendor: row.vendor?.trim() || "N/A",
    remarks: row.remarks || "",
  };
};
async function saveBom() {
  if (!canManageMR) {
    return;
  }

  if (!selectedBom?.id) return;

  const payload = {
    ...selectedBom,
    items: rows.map(buildBomItemPayload),
  };

  const res = await fetch(
    `${`${config.baseURL}/bom/bom/`}${selectedBom.id}/`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    console.log(await res.json());
    alert("Failed to save BOM");
    return;
  }

  const updated = await res.json();

  setSelectedBom(updated);
  setRows(mapBomRows(updated));
}
async function handleSubmit(e) {
  e.preventDefault();

  if (
    !canManageMR ||
    submitLockRef.current
  ) {
    return;
  }

  // Client-side validation
  setErrors({});
  const newErrors = {};

  const needsProject = requestType === "BOM" || requestType === "R&D";
  const needsGeneralItems =
    requestType === "RETAIL_SALES" ||
    isComponentReturnable;

  if (!isDirectDroneReturnable && !form.material_request_id) {
    newErrors.material_request_id =
      "Material Request ID could not be generated.";
  }
  if (!form.requester_name) {
    newErrors.requester_name = "Please enter requester name.";
  }
  if (!form.date) {
    newErrors.date = "Please enter date.";
  }

  if (needsProject) {
    if (!form.project) {
      newErrors.project = "Please select a project.";
    } else if (
      !projectOptions.some(
        (option) => String(option.value) === String(form.project),
      )
    ) {
      newErrors.project =
        "Please select a project from Project Master.";
    }
  }

  if (!form.required_date) {
    newErrors.required_date =
      requestType === "RETURNABLE"
        ? "Please enter the returnable date."
        : "Please enter required date.";
  }

  if (requestType === "RETURNABLE") {
    if (!returnablePurpose) {
      newErrors.returnable_purpose = "Please select a purpose.";
    }

    if (
      RETURNABLE_DRONE_OR_COMPONENT_PURPOSES.has(returnablePurpose) &&
      !returnableSource
    ) {
      newErrors.returnable_source =
        "Please choose Drone or Components.";
    }

    if (
      isDirectDroneReturnable &&
      !selectedDroneMrId
    ) {
      newErrors.drone_mr =
        "Please select an existing In-Drone MR.";
    }

    if (isDirectDroneReturnable) {
      const droneQuantity =
        Number(selectedDroneQuantity);

      if (selectedDroneMrAvailableQuantity <= 0) {
        newErrors.drone_quantity =
          "No drone quantity is currently available on the selected MR.";
      } else if (
        !Number.isInteger(droneQuantity) ||
        droneQuantity < 1
      ) {
        newErrors.drone_quantity =
          "Please select a Drone Quantity of at least 1.";
      } else if (
        droneQuantity > selectedDroneMrAvailableQuantity
      ) {
        newErrors.drone_quantity =
          `Only ${selectedDroneMrAvailableQuantity} drone(s) are currently available on the selected MR.`;
      }
    }

    if (!String(form.remarks || "").trim()) {
      newErrors.remarks = "Remarks are mandatory for Returnable requests.";
    }

    if (
      form.required_date &&
      form.date &&
      form.required_date < form.date
    ) {
      newErrors.required_date =
        "Returnable date cannot be before the request date.";
    }

    if (
      returnableMaxDate &&
      form.required_date &&
      form.required_date > returnableMaxDate
    ) {
      newErrors.required_date =
        "This purpose allows a maximum return period of 4 days.";
    }
  }

  if (requestType === "BOM") {
    if (!form.bom) newErrors.bom = "Please select a BOM.";
    if (
      !Number(
        form.required_quantity
      ) ||
      Number(
        form.required_quantity
      ) < 1
    ) {
      newErrors.required_quantity =
        "Drone Quantity must be at least 1.";
    }
    if (!rows || rows.length === 0) {
      newErrors.rows = "Add at least one BOM item.";
    }
    (rows || []).forEach((row, index) => {
      if (!row.component_code && !row.component_name) {
        newErrors[`row_${index}`] =
          `Select component for row ${index + 1}`;
      }
      if (!row.quantity || Number(row.quantity) <= 0) {
        newErrors[`row_qty_${index}`] =
          `Enter quantity for row ${index + 1}`;
      }
    });
  }

  if (requestType === "R&D") {
    const invalidRow = rdRows.some(
      (row) => !row.component || !row.qty || Number(row.qty) <= 0,
    );
    if (invalidRow) {
      newErrors.rd_rows =
        "Fill component and quantity for all R&D rows.";
    }
  }

  if (needsGeneralItems) {
    const validRows = requestRows.filter(
      (row) => row.component || Number(row.qty || 0) > 0,
    );

    if (!validRows.length) {
      newErrors.request_rows = "Add at least one component.";
    }

    const invalidRow = validRows.some(
      (row) => !row.component || !row.qty || Number(row.qty) <= 0,
    );
    if (invalidRow) {
      newErrors.request_rows =
        "Select a component and valid quantity for every item.";
    }
  }

  if (Object.keys(newErrors).length) {
    setErrors(newErrors);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  /*
   * DRONE MODE:
   * Flight Test / Demo-Trials / Event can reuse an EXISTING In-Drone MR.
   * No new MaterialRequest is created. The existing MR number is sent to
   * componentusage, which creates Returnable usage rows against that same MR.
   */
  if (isDirectDroneReturnable) {
    submitLockRef.current = true;
    setIsSubmitting(true);

    try {
      await fetchAuthenticatedJson(
        `${config.baseURL}/component-usage/move-from-in-drone/`,
        {
          method: "POST",
          body: JSON.stringify({
            material_request_id: selectedDroneMrId,
            purpose: returnablePurpose,
            quantity: Number(selectedDroneQuantity),
            return_due_date: form.required_date,
            remarks: String(form.remarks || "").trim(),
            source: "NEW_MATERIAL_REQUEST_PAGE",
          }),
        },
      );

      window.dispatchEvent(
        new Event("notificationsUpdated"),
      );
      window.dispatchEvent(
        new Event("inventory:changed"),
      );

      navigate("/component-usage", {
        state: {
          openPurpose: returnablePurpose,
          materialRequestId: selectedDroneMrId,
          refresh: Date.now(),
        },
      });

      return;
    } catch (err) {
      console.error(
        "Unable to send existing drone to Returnable:",
        err,
      );

      alert(
        err?.message ||
          err?.detail ||
          "Unable to send the selected drone to Returnable.",
      );

      return;
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  const bomItemsForPayload =
    requestType === "BOM"
      ? rows.map(buildBomItemPayload)
      : [];

  const rdItemsForPayload =
    requestType === "R&D"
      ? rdRows
          .filter((row) => row.component && Number(row.qty) > 0)
          .map((row) => {
            const componentOption = resolveComponentOption(row);
            const qty = Number(row.qty || 0);
            const inventoryQty = Number(
              getInventoryQuantityForBomRow(row) || 0,
            );
            const unitPrice = Number(row.unit_price || 0);
            const tax = Number(row.tax || 0);
            const price = qty * unitPrice;
            const totalPrice = price + (price * tax) / 100;

            return {
              component: Number(row.component),
              category: row.category || "",
              component_name: componentOption?.component_name || componentOption?.label || "",
              specifications: row.specifications || "",
              hsn_no: componentOption?.hsnNo || row.hsn_no || row.hsn_numbers || "",
              quantity: qty,
              inventory_quantity: inventoryQty,
              unit: String(
      row.unit ||
      row.uom ||
      row.unit_of_measurements ||
      ""
    ).trim(),
              unit_price: unitPrice,
              price,
              tax,
              total_price: totalPrice,
              vendor: row.vendor?.trim() || "N/A",
              remarks: row.remarks || "",
            };
          })
      : [];

  const requestItemsForPayload = needsGeneralItems
    ? requestRows
        .filter((row) => row.component && Number(row.qty) > 0)
        .map(buildRequestItemPayload)
    : [];

  const totalGeneralQuantity = requestItemsForPayload.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0,
  );

  const payload = {
    material_request_id: form.material_request_id,
    requester_name: form.requester_name,
    date: form.date,
    project: needsProject ? form.project : "",

    request_type: requestType,
    returnable_purpose:
      requestType === "RETURNABLE" ? returnablePurpose : "",

    customized_bom: requestType === "BOM" ? customizedBom : false,
    bom: requestType === "BOM" ? form.bom : "",

    required_quantity:
      requestType === "BOM"
        ? Math.max(
            Number(
              form.required_quantity
            ) || 1,
            1,
          )
        : requestType === "R&D"
          ? rdItemsForPayload.reduce(
              (total, item) => total + Number(item.quantity || 0),
              0,
            ) || 1
          : totalGeneralQuantity || 1,
    required_date: form.required_date,
    remarks: form.remarks,

    bom_items: bomItemsForPayload,
    rd_items: rdItemsForPayload,
    request_items: requestItemsForPayload,

    approval_status: "PENDING_MANAGER",
    status: "PENDING_MANAGER",
  };

  /*
   * Lock immediately before the first network request.
   * This prevents double-clicks even before React can re-render.
   */
  submitLockRef.current = true;
  setIsSubmitting(true);

  try {
    /*
     * IMPORTANT:
     * MaterialRequestViewSet now uses request.user to store the actual
     * requester. Therefore this POST MUST include the logged-in user's
     * authentication token.
     *
     * fetchAuthenticatedJson() already reads the saved access token and
     * sends the authenticated request. A plain fetch() makes Django see
     * request.user as AnonymousUser.
     */
    const data = await fetchAuthenticatedJson(
      `${config.baseURL}/materialrequest/material-requests/`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );

    console.log(
      "Material Request created successfully:",
      data
    );

    /*
     * Every newly-created MR is already submitted as PENDING_MANAGER.
     * Therefore a Manager notification must exist immediately.
     *
     * Previously only the MaterialRequest row was created here. The
     * Material Requests list creates a notification only when its separate
     * "Request Manager Approval" action is clicked, but a newly-created row
     * is already PENDING_MANAGER, so that action is never available. This
     * left Manager -> Returnable at 0.
     */
    const createdRequest =
      data?.data &&
      typeof data.data === "object"
        ? data.data
        : data || {};

    const createdRequestDbId =
      createdRequest?.id ??
      createdRequest?.pk ??
      null;

    const createdRequestNumber = String(
      createdRequest?.material_request_id ||
        createdRequest?.request_id ||
        form.material_request_id ||
        (
          createdRequestDbId !== null
            ? `MR-${createdRequestDbId}`
            : "Material Request"
        ),
    ).trim();

    if (createdRequestDbId !== null) {
      try {
        const notificationPayload =
          await fetchAuthenticatedJson(
            `${config.baseURL}/notifications/?page_size=200`,
            {
              cache: "no-store",
            },
          );

        const notificationRows = Array.isArray(
          notificationPayload,
        )
          ? notificationPayload
          : Array.isArray(
                notificationPayload?.results,
              )
            ? notificationPayload.results
            : [];

        const managerNotificationExists =
          notificationRows.some(
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
                .toUpperCase() === "MANAGER" &&
              String(
                notification?.reference_id ??
                  notification?.referenceId ??
                  "",
              ).trim() ===
                String(
                  createdRequestDbId,
                ).trim() &&
              [
                "REQUESTED",
                "PENDING",
                "PENDING_MANAGER",
              ].includes(
                String(
                  notification?.status ||
                    "",
                )
                  .trim()
                  .toUpperCase(),
              ),
          );

        if (!managerNotificationExists) {
          await fetchAuthenticatedJson(
            `${config.baseURL}/notifications/`,
            {
              method: "POST",
              body: JSON.stringify({
                category: "MR",
                title:
                  `MR APPROVAL REQUEST - ${createdRequestNumber}`,
                message:
                  `Material Request ${createdRequestNumber} requires Manager approval.`,
                reference_id:
                  String(
                    createdRequestDbId,
                  ),
                status:
                  "PENDING_MANAGER",
                receiver:
                  "MANAGER",
                is_read:
                  false,
              }),
            },
          );
        }
      } catch (notificationError) {
        /*
         * Do not delete/duplicate the already-created MR if notification
         * persistence has a temporary failure. Manager Notifications and
         * Topbar now also contain an authoritative PENDING_MANAGER MR
         * fallback, so the request remains visible and actionable.
         */
        console.error(
          "Material Request was created, but Manager notification creation failed:",
          notificationError,
        );
      }
    }

    window.dispatchEvent(
      new Event("notificationsUpdated")
    );

    navigate(
      "/material-requests",
      {
        state: {
          refresh: Date.now(),
        },
      }
    );

  } catch (err) {
    const errorMessage = String(
      err?.message ||
      err?.detail ||
      "Error submitting request"
    );

    const isDuplicateMaterialRequestId =
      errorMessage
        .toLowerCase()
        .includes("material_request_id") &&
      errorMessage
        .toLowerCase()
        .includes("already exists");

    /*
     * In the current flow the MR can already have been created when a
     * repeated/stale submit reaches the backend with the same generated ID.
     * Do not show the confusing duplicate-ID alert to the user.
     *
     * We still log it for debugging and return to the MR list, where the
     * successfully created request is visible.
     */
    if (isDuplicateMaterialRequestId) {
      console.warn(
        "Duplicate Material Request ID response ignored because the MR already exists:",
        errorMessage
      );

      window.dispatchEvent(
        new Event("notificationsUpdated")
      );

      navigate(
        "/material-requests",
        {
          state: {
            refresh: Date.now(),
          },
        }
      );

      return;
    }

    console.error(
      "Material Request submit failed:",
      err
    );

    // Keep genuine backend/validation errors visible.
    alert(errorMessage);
  } finally {
    submitLockRef.current = false;
    setIsSubmitting(false);
  }
}

  if (!canManageMR) {
    return (
      <Navigate
        to="/material-requests"
        replace
      />
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="New Material Request"
        subtitle="Create BOM, R&D, Returnable, or Retail Sales material requests."
      />

      <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-foreground">
          Request Type
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            ["BOM", "BOM"],
            ["R&D", "R & D"],
            ["RETURNABLE", "Returnable"],
            ["RETAIL_SALES", "Retail Sales"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setRequestType(value);
                setErrors({});

                if (value !== "RETURNABLE") {
                  setReturnablePurpose("");
                  setReturnableSource("");
                  setSelectedDroneMrId("");
                  setSelectedDroneQuantity("");
                } else {
                  setReturnableSource("");
                  setSelectedDroneMrId("");
                  setSelectedDroneQuantity("");
                }

                if (value !== "BOM") {
                  setForm((previous) => ({
                    ...previous,
                    bom: "",
                    required_quantity:
                      value === "BOM"
                        ? 1
                        : value === "R&D"
                          ? previous.required_quantity
                          : 0,
                  }));

                  // BOM-only state must not leak into R&D / Returnable / Retail Sales.
                  setSelectedBom(null);
                  setBomLabel("");
                  setCustomizedBom(false);
                  setRows([]);
                }
              }}
              className={`rounded-lg border px-5 py-2.5 text-sm font-semibold transition ${
                requestType === value
                  ? "border-[#E85D75] bg-[#E85D75] text-white shadow-sm"
                  : "border-border bg-background text-foreground hover:border-[#E85D75] hover:text-[#E85D75]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-gray-200 bg-white p-8 text-gray-900 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      >
        <h2 className="mb-4 text-lg font-semibold">Request Details</h2>

        <FormGrid>
          {!isDirectDroneReturnable && (
            <Field label="Material Request ID" required>
              <Input
                type="text"
                value={form.material_request_id}
                readOnly
              />
              {errors.material_request_id && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.material_request_id}
                </p>
              )}
            </Field>
          )}

          <Field label="Requester Name" required>
            <Input
              type="text"
              name="requester_name"
              value={form.requester_name}
              readOnly
            />
            {errors.requester_name && (
              <p className="mt-1 text-sm text-red-600">
                {errors.requester_name}
              </p>
            )}
          </Field>

          <Field label="Date" required>
            <Input
              type="date"
              name="date"
              value={form.date}
              onChange={(event) => {
                handleChange(event);
                if (
                  requestType === "RETURNABLE" &&
                  returnableMaxDate &&
                  form.required_date > addDaysToIsoDate(event.target.value, 4)
                ) {
                  setForm((previous) => ({
                    ...previous,
                    date: event.target.value,
                    required_date: "",
                  }));
                }
              }}
            />
            {errors.date && (
              <p className="mt-1 text-sm text-red-600">{errors.date}</p>
            )}
          </Field>

          {(requestType === "BOM" || requestType === "R&D") && (
            <Field label="Project" required>
              <SearchableSelect
                name="project"
                value={form.project}
                options={projectOptions}
                placeholder={
                  projectsLoading
                    ? "Loading projects..."
                    : projectOptions.length
                      ? "Search or select project..."
                      : "No projects available"
                }
                disabled={projectsLoading}
                onChange={(event) => {
                  const selectedText = event.target.value;
                  const selectedProject = projectOptions.find(
                    (option) =>
                      String(option.label) === String(selectedText) ||
                      String(option.value) === String(selectedText),
                  );

                  setForm((previous) => ({
                    ...previous,
                    project: selectedProject?.value || selectedText,
                  }));

                  if (errors.project) {
                    setErrors((previous) => ({
                      ...previous,
                      project: "",
                    }));
                  }
                }}
              />
              {errors.project && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.project}
                </p>
              )}
            </Field>
          )}

          {requestType === "RETURNABLE" && (
            <Field label="Purpose" required>
              <Select
                name="returnable_purpose"
                value={returnablePurpose}
                onChange={(event) => {
                  const nextPurpose = event.target.value;
                  setReturnablePurpose(nextPurpose);

                  const nextNeedsChoice =
                    RETURNABLE_DRONE_OR_COMPONENT_PURPOSES.has(
                      nextPurpose,
                    );

                  setReturnableSource(
                    nextNeedsChoice ? "" : "COMPONENTS",
                  );
                  setSelectedDroneMrId("");
                  setSelectedDroneQuantity("");

                  setErrors((previous) => ({
                    ...previous,
                    returnable_purpose: "",
                    required_date: "",
                  }));

                  if (
                    RETURNABLE_FOUR_DAY_PURPOSES.has(nextPurpose) &&
                    form.required_date &&
                    form.required_date > addDaysToIsoDate(form.date, 4)
                  ) {
                    setForm((previous) => ({
                      ...previous,
                      required_date: "",
                    }));
                  }
                }}
                options={[
                  { value: "", label: "— Select Purpose —" },
                  ...RETURNABLE_PURPOSE_OPTIONS,
                ]}
              />
              {errors.returnable_purpose && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.returnable_purpose}
                </p>
              )}
            </Field>
          )}

          {requestType === "RETURNABLE" &&
            isDroneOrComponentPurpose && (
              <Field label="Request For" required>
                <Select
                  name="returnable_source"
                  value={returnableSource}
                  onChange={(event) => {
                    const value = event.target.value;
                    setReturnableSource(value);
                    setSelectedDroneMrId("");
                    setSelectedDroneQuantity("");
                    setErrors((previous) => ({
                      ...previous,
                      returnable_source: "",
                      drone_mr: "",
                      request_rows: "",
                    }));
                  }}
                  options={[
                    { value: "", label: "— Select Drone or Components —" },
                    { value: "DRONE", label: "Drone" },
                    { value: "COMPONENTS", label: "Components" },
                  ]}
                />
                {errors.returnable_source && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.returnable_source}
                  </p>
                )}
              </Field>
            )}

          {requestType === "RETURNABLE" &&
            isDirectDroneReturnable && (
              <Field label="Existing Drone / MR" required>
                <SearchableSelect
                  name="existing_drone_mr"
                  options={inDroneMrOptions}
                  value={selectedDroneMrOption?.label || ""}
                  placeholder="Search MR number / project / type..."
                  onChange={(event) => {
                    const rawValue = String(
                      event.target.value || "",
                    );

                    const selected =
                      inDroneMrOptions.find(
                        (option) =>
                          option.label === rawValue ||
                          String(option.value) === rawValue,
                      );

                    setSelectedDroneMrId(
                      selected?.value || "",
                    );
                    setSelectedDroneQuantity("");

                    setErrors((previous) => ({
                      ...previous,
                      drone_mr: "",
                    }));
                  }}
                />

                {inDroneMrOptions.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    No currently issued In-Drone MR is available.
                  </p>
                )}

                {selectedDroneMrOption && (
                  <div className="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {selectedDroneMrOption.value}
                    </span>
                    {" · "}
                    Project: {selectedDroneMrOption.project}
                    {" · "}
                    Type: {selectedDroneMrOption.typeLabel}
                    {" · "}
                    Available Drone Qty:{" "}
                    <span className="font-semibold text-foreground">
                      {selectedDroneMrAvailableQuantity}
                    </span>
                  </div>
                )}

                {errors.drone_mr && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.drone_mr}
                  </p>
                )}
              </Field>
            )}

          {requestType === "RETURNABLE" &&
            isDirectDroneReturnable &&
            selectedDroneMrOption && (
              <Field label="Drone Quantity" required>
                <Input
                  type="number"
                  min="1"
                  max={
                    selectedDroneMrAvailableQuantity > 0
                      ? selectedDroneMrAvailableQuantity
                      : undefined
                  }
                  step="1"
                  value={selectedDroneQuantity}
                  disabled={selectedDroneMrAvailableQuantity <= 0}
                  placeholder={
                    selectedDroneMrAvailableQuantity > 0
                      ? `Select 1 to ${selectedDroneMrAvailableQuantity}`
                      : "No Drone Quantity Available"
                  }
                  onChange={(event) => {
                    const rawValue = String(
                      event.target.value || "",
                    ).replace(/\D/g, "");

                    setSelectedDroneQuantity(rawValue);

                    setErrors((previous) => ({
                      ...previous,
                      drone_quantity: "",
                    }));
                  }}
                />

                {selectedDroneMrTotalQuantity > 0 && (
                  <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                    <p>
                      Total Drone Qty:{" "}
                      <span className="font-semibold text-foreground">
                        {selectedDroneMrTotalQuantity}
                      </span>
                      {" · "}
                      Available:{" "}
                      <span className="font-semibold text-emerald-600">
                        {selectedDroneMrAvailableQuantity}
                      </span>
                    </p>

                    {Number(selectedDroneMrUsageSummary?.FLIGHT_TEST || 0) > 0 && (
                      <p>
                        Flight Test:{" "}
                        <span className="font-semibold text-blue-600">
                          {Number(selectedDroneMrUsageSummary?.FLIGHT_TEST || 0)}
                        </span>
                      </p>
                    )}

                    {Number(selectedDroneMrUsageSummary?.CUSTOMER_DEMO || 0) > 0 && (
                      <p>
                        Demo/Trials:{" "}
                        <span className="font-semibold text-violet-600">
                          {Number(selectedDroneMrUsageSummary?.CUSTOMER_DEMO || 0)}
                        </span>
                      </p>
                    )}

                    {Number(selectedDroneMrUsageSummary?.EVENT || 0) > 0 && (
                      <p>
                        Event:{" "}
                        <span className="font-semibold text-orange-600">
                          {Number(selectedDroneMrUsageSummary?.EVENT || 0)}
                        </span>
                      </p>
                    )}

                    {selectedDroneMrSoldQuantity > 0 && (
                      <p>
                        Sold:{" "}
                        <span className="font-semibold text-emerald-600">
                          {selectedDroneMrSoldQuantity}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {errors.drone_quantity && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.drone_quantity}
                  </p>
                )}
              </Field>
            )}

          {requestType === "BOM" && (
            <>
              {/* BOM must be selected immediately after Project. */}
              <Field label="Select BOM" required>
                <SearchableSelect
                  name="bom"
                  options={bomOptions}
                  value={bomLabel}
                  placeholder="Search BOM..."
                  onChange={async (event) => {
                    const label = event.target.value;
                    setBomLabel(label);

                    const selectedOption = bomOptions.find(
                      (bom) => bom.label === label,
                    );

                    /*
                     * A typed/non-selected value is not a valid BOM.
                     * Clear the previous BOM so Customized BOM stays hidden
                     * until the user selects a real BOM again.
                     */
                    if (!selectedOption) {
                      setSelectedBom(null);
                      setCustomizedBom(false);
                      setRows([]);
                      setForm((previous) => ({
                        ...previous,
                        bom: "",
                      }));
                      return;
                    }

                    const fullBom = bomList.find(
                      (bom) => bom.id === selectedOption.value,
                    );

                    if (!fullBom) {
                      setSelectedBom(null);
                      setCustomizedBom(false);
                      setRows([]);
                      setForm((previous) => ({
                        ...previous,
                        bom: "",
                      }));
                      return;
                    }

                    setSelectedBom(fullBom);
                    setCustomizedBom(false);
                    /*
                     * A newly-selected BOM always starts with ONE drone.
                     * The BOM row Qty therefore initially stays equal to
                     * the original BOM quantity.
                     */
                    setForm((previous) => ({
                      ...previous,
                      bom: fullBom.id,
                      required_quantity: 1,
                    }));

                    await loadBomItems(
                      fullBom.id,
                      1,
                    );
                  }}
                />
                {errors.bom && (
                  <p className="mt-1 text-sm text-red-600">{errors.bom}</p>
                )}
              </Field>

              {/* Show Customized BOM only after a valid BOM is selected. */}
              {Boolean(form.bom && selectedBom?.id) && (
                <Field label="Customized BOM" required>
                  <Select
                    name="customized_bom"
                    value={customizedBom ? "true" : "false"}
                    onChange={(event) => {
                      const nextValue = event.target.value === "true";
                      setCustomizedBom(nextValue);

                      if (!nextValue && selectedBom?.id) {
                        setRows(mapBomRows(selectedBom));
                      }
                    }}
                    options={[
                      { value: "false", label: "No" },
                      { value: "true", label: "Yes" },
                    ]}
                  />
                </Field>
              )}

              <Field label="Drone Quantity" required>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  name="required_quantity"
                  value={form.required_quantity}
                  onChange={(event) => {
                    const rawValue =
                      String(
                        event.target.value ||
                          ""
                      ).replace(/\D/g, "");

                    /*
                     * Do not allow the BOM request to sit at 0.
                     * Empty while typing is tolerated, but the displayed
                     * BOM calculation falls back to 1.
                     */
                    const nextValue =
                      rawValue === ""
                        ? ""
                        : String(
                            Math.max(
                              Number(
                                rawValue
                              ) || 1,
                              1,
                            )
                          );

                    setForm(
                      (previous) => ({
                        ...previous,
                        required_quantity:
                          nextValue,
                      })
                    );

                    applyDroneQuantityToBomRows(
                      nextValue || 1,
                    );

                    if (
                      errors.required_quantity
                    ) {
                      setErrors(
                        (previous) => ({
                          ...previous,
                          required_quantity:
                            "",
                        })
                      );
                    }
                  }}
                  onBlur={() => {
                    if (
                      !Number(
                        form.required_quantity
                      ) ||
                      Number(
                        form.required_quantity
                      ) < 1
                    ) {
                      setForm(
                        (previous) => ({
                          ...previous,
                          required_quantity:
                            1,
                        })
                      );

                      applyDroneQuantityToBomRows(
                        1
                      );
                    }
                  }}
                />
                {errors.required_quantity && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.required_quantity}
                  </p>
                )}
              </Field>
            </>
          )}

          <Field
            label={requestType === "RETURNABLE" ? "Returnable Date" : "Required Date"}
            required
          >
            <Input
              type="date"
              name="required_date"
              min={requestType === "RETURNABLE" ? form.date : undefined}
              max={returnableMaxDate || undefined}
              value={form.required_date}
              onChange={handleChange}
            />
            {requestType === "RETURNABLE" && returnableMaxDate && (
              <p className="mt-1 text-xs text-muted-foreground">
                Maximum 4 days for this purpose. Latest date: {returnableMaxDate}
              </p>
            )}
            {requestType === "RETURNABLE" && !returnableMaxDate && returnablePurpose && (
              <p className="mt-1 text-xs text-muted-foreground">
                Demo/Trials and Event have no 4-day maximum. Flight Test, QC Check, and Miscellaneous Usage allow a maximum of 4 days.
              </p>
            )}
            {errors.required_date && (
              <p className="mt-1 text-sm text-red-600">
                {errors.required_date}
              </p>
            )}
          </Field>
        </FormGrid>

        <Field label="Remarks" required={requestType === "RETURNABLE"}>
          <Textarea
            name="remarks"
            value={form.remarks}
            onChange={handleChange}
            placeholder="Reason / context for this request…"
          />
          {errors.remarks && (
            <p className="mt-1 text-sm text-red-600">{errors.remarks}</p>
          )}
        </Field>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate("/material-requests")}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              (!isDirectDroneReturnable && materialRequestIdLoading) ||
              isSubmitting
            }
            className="rounded-lg px-4 py-2 text-sm text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "#E85D75" }}
          >
            {!isDirectDroneReturnable && materialRequestIdLoading
              ? "Generating ID..."
              : isSubmitting
                ? "Submitting..."
                : isDirectDroneReturnable
                  ? "Send to Returnable"
                  : "Submit Request"}
          </button>
        </div>
      </form>

{requestType === "R&D" && (
  <section className="mt-8">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold">R & D Components</h2>

<div className="flex gap-2">
  <button
    type="button"
    onClick={openAddComponentModal}
    className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
  >
    + Add Component
  </button>

  <button
    type="button"
    onClick={addRdRow}
    className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
  >
    + Add Item
  </button>
</div>
</div>
<div className="overflow-x-auto rounded-xl border border-border">
  <table className="w-full min-w-[1000px] border-collapse text-sm">

    <thead className="bg-muted/50">
      <tr>
        <th className="px-4 py-3">Specification</th>
        <th className="px-4 py-3">Component ID</th>
        <th className="px-4 py-3">HSN No</th>
        <th className="px-4 py-3">Category</th>
        <th className="px-4 py-3">Component Type</th>
        <th className="px-4 py-3">Qty</th>
        <th className="px-4 py-3">UOM</th>
        <th className="px-4 py-3">Inventory Qty</th>
        <th className="px-4 py-3">Action</th>
      </tr>
    </thead>
    <tbody>
      {rdRows.map((row, i) => {
        return (
          <tr key={i} className="border-b">
            <td className="px-3 py-2">
              <SearchableSelect
                name={`rd-specification-${i}`}
                value={row.specifications || ""}
                options={specificationOptions}
                placeholder="Search specification..."
                onChange={(e) => {
                  const selected = specificationOptions.find((option) => option.label === e.target.value);
                  updateRdRow(i, {
                    component: selected?.componentValue ? Number(selected.componentValue) : row.component,
                    category: selected?.category || "",
                    component_type: selected?.component_type || "",
                    specifications: selected?.specifications || e.target.value,
                    hsn_no: selected?.hsnNo || "",
                    unit: row.unit || "",
                    unit_price: Number(selected?.unit_price || 0),
                  });
                }}
              />
            </td>
            <td className="px-3 py-2">
              <SearchableSelect
              name={`rd-component-${i}`}
              value={
            componentOptions.find(
              (opt) => String(opt.value) === String(row.component)
            )?.label || ""
          }
          options={componentOptions}
          placeholder="Search component..."
          onChange={(e) => {
            const selected = componentOptions.find(
              (opt) =>
                opt.label === e.target.value ||
                String(opt.value) === e.target.value
            );

            updateRdRow(i, {
              component: selected?.value ? Number(selected.value) : null,
              category: selected?.category || "",
              component_type: selected?.component_type || "",
              specifications: selected?.specifications || "",
              hsn_no: selected?.hsnNo || "",
              unit: row.unit || "",
              unit_price: Number(selected?.unit_price || 0),
            });
          }}
        />
      </td>

      <td className="px-3 py-2 text-center">
        {componentOptions.find((option) => String(option.value) === String(row.component))?.hsnNo || "-"}
      </td>

      {/* Category */}
      <td className="px-3 py-2">
        <Input value={row.category || ""} readOnly />
      </td>

      {/* Component Type */}
      <td className="px-3 py-2">
        <Input value={row.component_type || ""} readOnly />
      </td>

      {/* Qty */}
      <td className="px-3 py-2">
        <Input
          type="number"
          value={row.qty}
          onChange={(e) =>
            updateRdRow(i, {
              qty: Number(e.target.value),
            })
          }
        />
      </td>

      {/* UOM */}
      <td className="px-3 py-2">
        <Input
          value={row.unit || ""}
          placeholder="e.g. NOS, MTR, KG"
          onChange={(event) =>
            updateRdRow(i, {
              unit: event.target.value,
            })
          }
        />
      </td>

      {/* Inventory Qty */}
      <td className="px-3 py-2 text-center">
        {getInventoryQuantityForBomRow(row)}
      </td>

      {/* Delete */}
      <td className="px-3 py-2 text-center">
        <button
          type="button"
          className="text-red-500"
          onClick={() => deleteRdRow(i)}
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
  </section>
)}


      {(requestType === "RETAIL_SALES" || isComponentReturnable) && (
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Components</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add the components and quantities required for this request.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={openAddComponentModal}
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
              >
                + Add Component
              </button>
              <button
                type="button"
                onClick={addRequestRow}
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
              >
                + Add Item
              </button>
            </div>
          </div>

          {errors.request_rows && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errors.request_rows}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3">Specification</th>
                  <th className="px-4 py-3">Component ID</th>
                  <th className="px-4 py-3">HSN No</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Component Type</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">UOM</th>
                  <th className="px-4 py-3">Inventory Qty</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {requestRows.map((row, index) => (
                  <tr key={index} className="border-b">
                    <td className="px-3 py-2">
                      <SearchableSelect
                        name={`request-specification-${index}`}
                        value={row.specifications || ""}
                        options={specificationOptions}
                        placeholder="Search specification..."
                        onChange={(event) => {
                          const selected = specificationOptions.find((option) => option.label === event.target.value);
                          updateRequestRow(index, {
                            component: selected?.componentValue ? Number(selected.componentValue) : row.component,
                            category: selected?.category || "",
                            component_type: selected?.component_type || "",
                            specifications: selected?.specifications || event.target.value,
                            hsn_no: selected?.hsnNo || "",
                            unit: row.unit || "",
                            unit_price: Number(selected?.unit_price || 0),
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <SearchableSelect
                        name={`request-component-${index}`}
                        value={
                          componentOptions.find(
                            (option) => String(option.value) === String(row.component),
                          )?.label || ""
                        }
                        options={componentOptions}
                        placeholder="Search component..."
                        onChange={(event) => {
                          const selected = componentOptions.find(
                            (option) =>
                              option.label === event.target.value ||
                              String(option.value) === String(event.target.value),
                          );
                          updateRequestRow(index, {
                            component: selected?.value ? Number(selected.value) : null,
                            category: selected?.category || "",
                            component_type: selected?.component_type || "",
                            specifications: selected?.specifications || "",
                            hsn_no: selected?.hsnNo || "",
                            unit: row.unit || "",
                            unit_price: Number(selected?.unit_price || 0),
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {componentOptions.find((option) => String(option.value) === String(row.component))?.hsnNo || "-"}
                    </td>
                    <td className="px-3 py-2">
                      <Input value={row.category || ""} readOnly />
                    </td>
                    <td className="px-3 py-2">
                      <Input value={row.component_type || ""} readOnly />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="1"
                        value={row.qty}
                        onChange={(event) =>
                          updateRequestRow(index, {
                            qty: Number(event.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={row.unit || ""}
                        placeholder="e.g. NOS, MTR, KG"
                        onChange={(event) =>
                          updateRequestRow(index, {
                            unit: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {getInventoryQuantityForBomRow(row)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        className="text-red-500 disabled:opacity-40"
                        disabled={requestRows.length === 1}
                        onClick={() => deleteRequestRow(index)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {requestType === "BOM" && selectedBom?.id && (
  <div className="mt-8">
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-semibold">
        BOM Details: {selectedBom?.bom_name}
      </h3>

      {customizedBom && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openAddComponentModal}
            className="inline-flex items-center rounded-lg bg-primary px-3 py-2 text-white"
          >
            + Add Component
          </button>

          <button
            type="button"
            onClick={addBomRow}
            className="inline-flex items-center rounded-lg bg-primary px-3 py-2 text-white"
          >
            + Add Item
          </button>
        </div>
      )}
    </div>

    <div className="overflow-x-auto rounded-xl border border-border">
      {errors.rows && <div className="p-3 text-sm text-red-600">{errors.rows}</div>}
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2">Specification</th>
            <th className="px-3 py-2">Component ID</th>
            <th className="px-3 py-2">HSN No</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Component Type</th>
            <th className="px-3 py-2">Qty</th>
            <th className="px-3 py-2">UOM</th>
            <th className="px-3 py-2">Inventory Qty</th>
            {customizedBom && <th className="px-3 py-2">Action</th>}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, i) => {
            const rowComponentLabel =
              componentOptions.find(
                (opt) =>
                  String(opt.value) === String(row.component) ||
                  String(opt.value) === String(row.component_code) ||
                  String(opt.component_code) === String(row.component_code) ||
                    String(opt.component_code) === String(row.component)
                  )?.label || row.component_code || row.component || row.specifications || row.category || "";

            return (
              <tr key={i} className="border-b">
                <td className="px-3 py-2">
                  {customizedBom ? (
                    <SearchableSelect
                      name={`bom-specification-${i}`}
                      value={row.specifications || row.specification || ""}
                      options={specificationOptions}
                      placeholder="Search specification..."
                      onChange={(event) => {
                        const selected = specificationOptions.find((option) => option.label === event.target.value);
                        if (selected) {
                          updateBomRow(i, computeBomRow({
                            ...row,
                            component: selected.componentValue,
                            component_code: selected.componentCode,
                            category: selected.category || "",
                            component_type: selected.component_type || "",
                            specifications: selected.specifications,
                            hsn_no: selected.hsnNo || "",
                          }));
                        }
                      }}
                    />
                  ) : (
                    <Input value={row.specifications || row.specification || ""} readOnly />
                  )}
                </td>
                <td className="px-3 py-2">
                  {customizedBom ? (
<SearchableSelect
  name={`component-${i}`}
  value={row.component_code || row.component || ""}
  options={componentOptions}
  placeholder="Search component..."
  onChange={(e) => {
    const text = e.target.value;

    // allow typing
    updateBomRow(i, {
      ...row,
      component_code: text,
    });

    // if an option is selected from datalist
    const selected = componentOptions.find(
      (opt) => opt.label === text
    );

    if (selected) {
      updateBomRow(
        i,
        computeBomRow({
          ...row,
          component: selected.value,
          component_code: selected.component_code,
          category: selected.category,
          component_type: selected.component_type || "",
          specifications: selected.specifications,
          hsn_no: selected.hsnNo || "",
          unit: row.unit || "",
          unit_price: Number(selected.unit_price || 0),
        })
      );
    }
  }}
/>
                  ) : (
                    <Input value={rowComponentLabel} readOnly />
                  )}
                  {errors[`row_${i}`] && (
                    <div className="mt-1 text-xs text-red-600">{errors[`row_${i}`]}</div>
                  )}
                </td>

                <td className="px-3 py-2 text-center">
                  {componentOptions.find((option) => String(option.value) === String(row.component))?.hsnNo || "-"}
                </td>

                <td className="px-3 py-2">
                  <Input value={row.category || ""} readOnly />
                </td>

                <td className="px-3 py-2">
                  <Input value={row.component_type || ""} readOnly />
                </td>

                <td className="px-3 py-2">
                  {customizedBom ? (
                    <div className="space-y-1">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={
                          row.quantity ??
                          (
                            Number(
                              row.base_quantity ??
                                row.baseQuantity ??
                                0
                            ) *
                            getDroneQuantityMultiplier()
                          )
                        }
                        onChange={(e) => {
                          /*
                           * In Customized BOM mode the Qty shown here is the
                           * FINAL required component quantity for this MR.
                           *
                           * Example:
                           *   component per drone = 1
                           *   Drone Qty            = 2
                           *   displayed Qty        = 2
                           *
                           * If the engineer manually changes the customized
                           * total, retain the equivalent per-drone base qty so
                           * a later Drone Qty change can multiply it again.
                           */
                          const totalQuantity =
                            Math.max(
                              Number(
                                e.target.value
                              ) || 0,
                              0,
                            );

                          const droneMultiplier =
                            getDroneQuantityMultiplier();

                          const baseQuantity =
                            droneMultiplier > 0
                              ? (
                                  totalQuantity /
                                  droneMultiplier
                                )
                              : totalQuantity;

                          updateBomRow(
                            i,
                            computeBomRow({
                              ...row,
                              base_quantity:
                                baseQuantity,
                              quantity:
                                totalQuantity,
                            })
                          );
                        }}
                      />

                      <div className="text-center text-[10px] text-muted-foreground">
                        {Number(
                          row.base_quantity ??
                            row.baseQuantity ??
                            0
                        ) || 0}
                        {" × "}
                        {getDroneQuantityMultiplier()}
                        {" drone(s)"}
                      </div>
                    </div>
                  ) : (
                    <Input
                      value={row.quantity}
                      readOnly
                    />
                  )}
                </td>

                <td className="px-3 py-2">
                  <Input
                    value={row.unit || ""}
                    placeholder="e.g. NOS, MTR, KG"
                    readOnly={!customizedBom}
                    onChange={(event) => {
                      if (!customizedBom) return;

                      updateBomRow(i, {
                        ...row,
                        unit: event.target.value,
                      });
                    }}
                  />
                </td>

                <td className="px-3 py-2 text-center">
                  {getInventoryQuantityForBomRow(row)}
                </td>

                {customizedBom && (
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => deleteBomRow(i)}
                      className="text-red-500"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
)}

  
      {canManageMR && showComponentModal && (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 dark:bg-black/70 px-4">
    <div className="w-[700px] rounded-xl border border-border bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto dark:border-slate-700 dark:bg-slate-900">

      <h2 className="text-xl font-semibold mb-6 text-slate-900 dark:text-slate-100">
        Add New Component
      </h2>

      <FormGrid>

        <Field label="Component ID">
          <Input
            name="component_id"
            value={componentForm.component_id}
            readOnly
          />
        </Field>

        <Field label="Category">
          <Select
            name="category"
            value={componentForm.category}
            onChange={handleComponentChange}
            options={CATEGORY_CHOICES}
          />
        </Field>

        <Field label="Component Type">
          <Input
            name="component_type"
            value={componentForm.component_type}
            onChange={handleComponentChange}
            placeholder="Example: Flight Controller"
          />
        </Field>

        <Field label="Specification">
          <Input
            name="specifications"
            value={componentForm.specifications}
            onChange={handleComponentChange}
          />
        </Field>

        <Field label="HSN No">
          <Input
            name="hsn_no"
            value={componentForm.hsn_no}
            inputMode="numeric"
            pattern="\\d{4,8}"
            minLength={4}
            maxLength={8}
            title="Enter 4 to 8 digits, or leave blank."
            onChange={handleComponentChange}
          />
        </Field>

        <Field label="SKU No">
          <Input
            name="sku_no"
            value={componentForm.sku_no}
            onChange={handleComponentChange}
          />
        </Field>

        <Field label="Part No">
          <Input
            name="part_no"
            value={componentForm.part_no}
            onChange={handleComponentChange}
          />
        </Field>

        <Field label="Tally Reference">
          <Input
            name="tally_reference"
            value={componentForm.tally_reference}
            onChange={handleComponentChange}
          />
        </Field>

        <Field label="UOM">
          <Input
            name="unit_of_measurements"
            value={componentForm.unit_of_measurements}
            onChange={handleComponentChange}
          />
        </Field>

        <Field label="Product Link">
          <Input
            name="product_link"
            value={componentForm.product_link}
            onChange={handleComponentChange}
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
          className="rounded-lg bg-primary px-4 py-2 text-white"
        >
          Save Component
        </button>
      </div>

    </div>
  </div>
)}
    </PageShell>
  );
}

export default NewMaterialRequestPage;