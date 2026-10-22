import { useRef, useState, useEffect } from "react";

import { useNavigate } from "react-router-dom";

import { PageShell, PageHeader } from "@/components/app/PageShell";

import { FormGrid, Field, Input, Select } from "@/components/app/FormShell";

import { useAuth } from "../AuthContext";

import config from "@/config";

import { fetchAuthenticatedJson } from "@/api";

import { Plus, Trash2, ArrowLeft, X, FileSpreadsheet, Download, AlertTriangle, CheckCircle2 } from "lucide-react";

import * as XLSX from "xlsx";

import { SearchableSelect } from "@/components/app/FormShell";

// Excel values are used as identifiers only after an exact component-master match.

const normalized = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const headerKey = (value) => normalized(value).replace(/[^a-z0-9]/g, "");

const valueText = (value) => String(value ?? "").trim();



const emptyBomRow = () => ({

  component: "", category: "", component_type: "", specifications: "",

  qty: 1, unit: "", remarks: "", hsnNo: "", componentText: "",

  rawComponentCode: "", matchIssue: "", importSource: "manual",

});



const masterFields = (component) => ({

  id: component.id,

  code: valueText(component.component_id || component.component_code || component.code),

  category: valueText(component.category || component.component_category || component.category_name || component.categoryName),

  type: valueText(component.component_type || component.componentType || component.type),

  specification: valueText(component.specifications || component.specification || component.component_specifications || component.componentSpecification),

  hsn: valueText(component.hsn_numbers || component.hsn_no || component.hsn),

  active: component.is_active !== false,

});



const hasRowDetails = (row) => Boolean(

  row.importSource === "excel" || row.component || row.componentText ||

  row.rawComponentCode || row.specifications || row.category ||

  row.component_type || row.unit || row.remarks || row.touched

);



const rowProblems = (row, catalog) => {

  if (!hasRowDetails(row)) return [];

  const problems = [];

  const master = catalog.find((item) => String(item.id) === String(row.component));

  if (!master) {

    problems.push(row.matchIssue || "Select a valid component from the IPMS Component Master.");

  } else {

    const m = masterFields(master);

    if (!m.active) problems.push("This component is inactive in the Component Master.");

    if (row.category && normalized(row.category) !== normalized(m.category))

      problems.push("Category does not match the selected component.");

    if (row.component_type && normalized(row.component_type) !== normalized(m.type))

      problems.push("Component Type does not match the selected component.");

    if (row.specifications && normalized(row.specifications) !== normalized(m.specification))

      problems.push("Specification does not match the selected component.");

  }

  const qty = Number(row.qty);

  if (String(row.qty ?? "").trim() === "" || !Number.isSafeInteger(qty) || qty <= 0)

    problems.push("Quantity must be a positive whole number.");

  return problems;

};



// Do not guess based on partial names or silently choose one of several matches.

const matchExcelComponent = (entry, catalog) => {

  const fields = catalog.map((raw) => ({ raw, ...masterFields(raw) }));

  const { code, category, type, specification } = entry;

  let candidates;

  if (code) {

    candidates = fields.filter((c) => normalized(c.code) === normalized(code));

    if (!candidates.length) return { matched: null, reason: `Component ID "${code}" was not found in the Component Master.` };

  } else if (specification) {

    candidates = fields.filter((c) => normalized(c.specification) === normalized(specification));

    if (!candidates.length) return { matched: null, reason: `Specification "${specification}" was not found in the Component Master.` };

  } else {

    return { matched: null, reason: "Component ID or Specifications is required for matching." };

  }

  const narrowed = candidates.filter((c) =>

    (!category || normalized(c.category) === normalized(category)) &&

    (!type || normalized(c.type) === normalized(type)) &&

    (!specification || normalized(c.specification) === normalized(specification))

  );

  if (!narrowed.length) {

    return { matched: null, reason: "The Category, Component Type, or Specifications differ from the Component Master. Verify the Excel values." };

  }

  if (narrowed.length > 1) {

    return { matched: null, reason: "More than one component matches. Select the correct Component ID manually." };

  }

  if (!narrowed[0].active) {

    return { matched: null, reason: "Matched component is inactive in the Component Master." };

  }

  return { matched: narrowed[0], reason: "" };

};



const EXCEL_COLUMNS = {

  code: ["Component ID", "Component Code", "Item Code", "Code"],

  category: ["Category", "Component Category"],

  type: ["Component Type", "Type", "Component Name"],

  specification: ["Specifications", "Specification", "Specs", "Description"],

  qty: ["Qty", "Quantity", "Required Quantity", "Required Qty"],

  unit: ["UOM", "Unit", "Unit of Measurement", "Units"],

  remarks: ["Remarks", "Remark", "Notes"],

};



const parseExcelBom = (sheet) => {

  // Preserve physical Excel row numbering, including blank rows between items.

  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: true });

  const firstSheetRow = XLSX.utils.decode_range(sheet["!ref"]).s.r;

  const getPosition = (header, aliases) => {

    const lookup = aliases.map(headerKey);

    return header.findIndex((cell) => lookup.includes(headerKey(cell)));

  };

  const headerIndex = matrix.findIndex((row) =>

    getPosition(row, EXCEL_COLUMNS.qty) !== -1 &&

    (getPosition(row, EXCEL_COLUMNS.specification) !== -1 || getPosition(row, EXCEL_COLUMNS.code) !== -1)

  );

  if (headerIndex === -1) {

    throw new Error("Excel header not found. Include Qty and either Specifications or Component ID.");

  }

  const header = matrix[headerIndex];

  const positions = Object.fromEntries(Object.entries(EXCEL_COLUMNS).map(

    ([field, aliases]) => [field, getPosition(header, aliases)]

  ));

  const result = [];

  for (let index = headerIndex + 1; index < matrix.length; index += 1) {

    const sourceRowIndex = firstSheetRow + index;

    if (sheet["!rows"]?.[sourceRowIndex]?.hidden) continue;

    const cells = matrix[index];

    const field = (name) => positions[name] >= 0 ? valueText(cells[positions[name]]) : "";

    const entry = {

      code: field("code"), category: field("category"), type: field("type"),

      specification: field("specification"), qty: field("qty"),

      unit: field("unit"), remarks: field("remarks"),

      excelRowNumber: firstSheetRow + index + 1,

    };

    if (!Object.values(entry).some((v, i) => i < 7 && v !== "")) continue;

    result.push(entry);

  }

  if (!result.length) throw new Error("No BOM component rows were found below the Excel header.");

  return result;

};



function CreateBomPage() {

  const navigate = useNavigate();

  const { user } = useAuth();



  const loggedInUserName =

    user?.employee_name ||

    user?.name ||

    user?.full_name ||

    user?.fullName ||

    user?.username ||

    user?.email ||

    "";



  const [componentsList, setComponentsList] = useState([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitLockRef = useRef(false);

  const componentsSectionRef = useRef(null);

  const [componentError, setComponentError] = useState("");

  const [submissionError, setSubmissionError] = useState("");



 const [bomNumber, setBomNumber] =

  useState("BOM-00001");

  const [rows, setRows] = useState([emptyBomRow()]);

  const excelInputRef = useRef(null);

  const [isImporting, setIsImporting] = useState(false);

  const [importSummary, setImportSummary] = useState(null);

  const [showImportSummary, setShowImportSummary] = useState(false);

  const [catalogError, setCatalogError] = useState("");



const [form, setForm] = useState({

  bom_name: "",

  product_name: "",

  version: "",

  created_by: loggedInUserName,

  description: "",

});

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



const componentOptions = componentsList.map((component) => {

  const details = masterFields(component);

  return {

    value: details.id,

    label: details.code || String(details.id),

    component_id: details.code,

    category: details.category,

    component_type: details.type,

    specifications: details.specification,

    hsnNo: details.hsn,

  };

});



const specificationOptions = Array.from(new Set(

  componentOptions.map((option) => option.specifications).filter(Boolean)

)).map((specification) => ({ value: specification, label: specification }));



const updateRow = (index, patch) => {

  setComponentError("");

  setRows((current) => current.map((row, i) => i === index

    ? { ...row, ...patch, touched: true } : row));

};



const handleSpecificationChange = (index, text) => {

  const matches = componentsList.filter((c) => normalized(masterFields(c).specification) === normalized(text));

  if (matches.length === 1 && masterFields(matches[0]).active) {

    const info = masterFields(matches[0]);

    updateRow(index, {

      component: String(info.id), componentText: info.code, rawComponentCode: "",

      specifications: info.specification, category: info.category,

      component_type: info.type, hsnNo: info.hsn, matchIssue: "",

    });

  } else {

    updateRow(index, {

      component: "", componentText: "", specifications: text,

      category: "", component_type: "", hsnNo: "",

      matchIssue: matches.length > 1

        ? "Several components have this specification. Choose a Component ID."

        : "Specification is not matched. Select a valid component.",

    });

  }

};



const handleComponentChange = (index, text) => {

  const option = componentOptions.find((c) =>

    normalized(c.label) === normalized(text) || String(c.value) === String(text)

  );

  if (!option) {

    updateRow(index, {

      component: "", componentText: text, rawComponentCode: "",

      matchIssue: `Component ID "${text}" is not found in the Component Master.`,

    });

    return;

  }

  updateRow(index, {

    component: String(option.value), componentText: option.label,

    rawComponentCode: "", category: option.category,

    component_type: option.component_type, specifications: option.specifications,

    hsnNo: option.hsnNo, matchIssue: "",

  });

};



  const openComponentSpecificationModal = (row) => {

    const selectedComponent = componentOptions.find(

      (option) => String(option.value) === String(row?.component),

    );



    setComponentSpecificationModal({

      open: true,

      row: {

        ...row,

        category: row?.category || selectedComponent?.category || "-",

        component_type:

          row?.component_type || selectedComponent?.component_type || "-",

        specifications:

          row?.specifications || selectedComponent?.specifications || "-",

      },

    });

  };



  const closeComponentSpecificationModal = () =>

    setComponentSpecificationModal({ open: false, row: null });



const [showComponentModal, setShowComponentModal] = useState(false);

const [componentSpecificationModal, setComponentSpecificationModal] = useState({

  open: false,

  row: null,

});



const [componentForm, setComponentForm] = useState({

  component_id: "",

  version: "",

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

  const prefix = CATEGORY_PREFIXES[valueText(category).toUpperCase()];

  if (!prefix) throw new Error("Invalid component category.");

  const catalog = await fetchAllComponents();

  const highest = catalog.reduce((max, item) => {

    const match = masterFields(item).code.match(/^[A-Z]+_(\d{4})$/i);

    return match ? Math.max(max, Number(match[1])) : max;

  }, 0);

  return `${prefix}_${String(highest + 1).padStart(4, "0")}`;

};



const openComponentModal = async () => {

  let nextComponentId;

  try {

    nextComponentId = await generateNextComponentId("ACCESSORIES");

  } catch (error) {

    setComponentError(error.message || "Unable to generate component ID.");

    return;

  }



  setComponentForm({

    component_id: nextComponentId,

    version: "",

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



  if (componentForm.product_link?.length > 200) {

    alert("Product Link must not exceed 200 characters.");

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

    version: "",

    category: componentForm.category,

    component_type: String(componentForm.component_type || "").trim(),

    specifications: componentForm.specification,

    hsn_numbers: componentForm.hsn_no,

    sku_numbers: componentForm.sku_no,

    part_numbers: componentForm.part_no,

    tally_reference: componentForm.tally_reference,

    product_link: componentForm.product_link,

    date: new Date().toISOString().split("T")[0],

    is_active: true,

  };



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



    if(!response.ok){

        alert("Failed");

        return;

    }



    await response.json();



    await loadComponents();



    setShowComponentModal(false);



    setComponentForm({

      component_id: "",

      version: "",

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

  };

const fetchAllComponents = async () => {

  const firstUrl = new URL(`${config.baseURL}/components/components/?page_size=500`, window.location.href);

  let nextUrl = firstUrl.href;

  const seenUrls = new Set();

  const byId = new Map();

  while (nextUrl) {

    if (seenUrls.size >= 200 || seenUrls.has(nextUrl)) {

      throw new Error("Component Master pagination could not be completed safely.");

    }

    seenUrls.add(nextUrl);

    const response = await fetch(nextUrl, { cache: "no-store" });

    if (!response.ok) throw new Error(`Component Master request failed (${response.status}).`);

    const data = await response.json();

    const page = Array.isArray(data) ? data : data?.results;

    if (!Array.isArray(page)) throw new Error("Unexpected Component Master API response.");

    for (const component of page) {

      if (component.id != null) byId.set(String(component.id), component);

    }

    if (Array.isArray(data) || !data.next) {

      nextUrl = null;

    } else {

      const target = new URL(data.next, nextUrl);

      if (target.origin !== firstUrl.origin || !target.pathname.includes("/components/components/")) {

        throw new Error("Unexpected Component Master pagination URL.");

      }

      nextUrl = target.href;

    }

  }

  return Array.from(byId.values());

};



const loadComponents = async () => {

  try {

    const list = await fetchAllComponents();

    setComponentsList(list);

    setCatalogError("");

    return list;

  } catch (error) {

    console.error("Failed to load components:", error);

    setCatalogError(error.message || "Unable to load component master.");

    return [];

  }

};



const addRow = () => setRows((current) => [...current, emptyBomRow()]);



// Collapse repeated Excel rows for the same matched component and unit.
// Keep unmatched or invalid rows separate so the user can review every source row.
const mergeImportedBomRows = (rows) => {
  const mergedRows = [];
  const rowsByComponentAndUnit = new Map();

  rows.forEach((row) => {
    const quantity = Number(row.qty);
    if (!row.component || !Number.isSafeInteger(quantity) || quantity <= 0) {
      mergedRows.push(row);
      return;
    }

    const key = JSON.stringify([String(row.component), normalized(row.unit)]);
    const existing = rowsByComponentAndUnit.get(key);
    if (!existing) {
      const merged = {
        ...row,
        qty: quantity,
        excelRowNumbers: [row.excelRowNumber],
      };
      rowsByComponentAndUnit.set(key, merged);
      mergedRows.push(merged);
      return;
    }

    const totalQuantity = Number(existing.qty) + quantity;
    if (!Number.isSafeInteger(totalQuantity)) {
      mergedRows.push(row);
      return;
    }

    existing.qty = totalQuantity;
    existing.excelRowNumbers.push(row.excelRowNumber);
    existing.remarks = Array.from(
      new Set([existing.remarks, row.remarks].map(valueText).filter(Boolean)),
    ).join("; ");
  });

  return mergedRows;
};

const downloadBomTemplate = () => {

  const headers = ["S.No", "Category", "Component Type", "Specifications", "Qty", "UOM", "Remarks", "Component ID"];

  const sheet = XLSX.utils.aoa_to_sheet([headers]);

  sheet["!cols"] = [8, 18, 25, 48, 12, 15, 30, 20].map((wch) => ({ wch }));

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, sheet, "BOM Items");

  const notes = XLSX.utils.aoa_to_sheet([

    ["IPMS New BOM Excel Import Instructions"],

    ["Fill one BOM item per row under BOM Items."],

    ["Qty is required and must be a positive whole number."],

    ["Component ID or Specifications is required for matching."],

    ["Category and Component Type are optional, but must match IPMS if supplied."],

    ["UOM and Remarks are optional. You may remove the Remarks column."],

    ["The imported BOM is a draft; unknown components must be resolved before Submit."],

  ]);

  notes["!cols"] = [{ wch: 95 }];

  XLSX.utils.book_append_sheet(workbook, notes, "Instructions");

  XLSX.writeFile(workbook, "IPMS_BOM_Import_Template.xlsx");

};



const handleExcelImport = async (event) => {

  const file = event.target.files?.[0];

  event.target.value = "";

  if (!file) return;

  setIsImporting(true);

  try {

    if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("Upload an .xlsx or .xls file.");

    if (file.size > 10 * 1024 * 1024) throw new Error("Excel file exceeds the 10 MB limit.");

    const catalog = await fetchAllComponents();

    if (!catalog.length) throw new Error("Component Master is empty or unavailable; matching cannot continue.");

    setComponentsList(catalog);

    setCatalogError("");

    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellStyles: true });

    const sheet = workbook.Sheets["BOM Items"] || workbook.Sheets[workbook.SheetNames[0]];

    if (!sheet) throw new Error("Excel workbook does not contain a readable sheet.");

    const entries = parseExcelBom(sheet);

    const mappedRows = entries.map((entry) => {

      const { matched, reason } = matchExcelComponent(entry, catalog);

      const fields = matched ? masterFields(matched.raw) : null;

      return {

        ...emptyBomRow(), importSource: "excel", excelRowNumber: entry.excelRowNumber,

        component: fields ? String(fields.id) : "",

        componentText: fields?.code || "",

        rawComponentCode: fields ? "" : entry.code,

        category: fields?.category || entry.category,

        component_type: fields?.type || entry.type,

        specifications: fields?.specification || entry.specification,

        hsnNo: fields?.hsn || "",

        qty: entry.qty, unit: entry.unit, remarks: entry.remarks,

        matchIssue: reason,

      };

    });

    const imported = mergeImportedBomRows(mappedRows);
    const issues = imported.flatMap((row) => {

      const problems = rowProblems(row, catalog);

      return problems.length ? [{ row: row.excelRowNumber, message: problems.join(" ") }] : [];

    });

    // A later upload replaces earlier imported lines, while keeping manually entered lines.

    setRows((current) => [

      ...current.filter((row) => row.importSource !== "excel" && hasRowDetails(row)),

      ...imported,

    ]);

    setComponentError("");

    setImportSummary({ fileName: file.name, total: imported.length, sourceRows: entries.length,

      success: imported.length - issues.length, issues });

    setShowImportSummary(true);

  } catch (error) {

    setImportSummary({ fileName: file.name, total: 0, success: 0,

      issues: [{ row: "-", message: error?.message || "Import failed." }] });

    setShowImportSummary(true);

  } finally {

    setIsImporting(false);

  }

};



const loadNextBomNumber = async () => {

  try {

    const response = await fetch(

      `${config.baseURL}/bom/bom/?page_size=1000`,

      {

        cache: "no-store",

      }

    );



    if (!response.ok) {

      throw new Error(

        `Failed to load BOM numbers: ${response.status}`

      );

    }



    const data = await response.json();



    const bomList = Array.isArray(data)

      ? data

      : Array.isArray(data?.results)

      ? data.results

      : [];



    const highestBomNumber =

      bomList.reduce((highest, bom) => {

        const value = String(

          bom?.bom_number ||

            bom?.bomNumber ||

            ""

        ).trim();




        const match =

          value.match(/^BOM-(\d{5})$/i);



        if (!match) {

          return highest;

        }



        const numericValue =

          Number(match[1]);



        if (!Number.isFinite(numericValue)) {

          return highest;

        }



        return Math.max(

          highest,

          numericValue

        );

      }, 0);



    const nextNumber =

      highestBomNumber + 1;



    setBomNumber(

      `BOM-${String(nextNumber).padStart(

        5,

        "0"

      )}`

    );

  } catch (error) {

    console.error(

      "Failed to generate next BOM number:",

      error

    );



    setBomNumber("BOM-00001");

  }

};

  const handleFormChange = (e) => {

    const { name, value } = e.target;

    setForm((prev) => ({ ...prev, [name]: value }));

  };



  const deleteRow = (i) => {

    setRows((current) => {

      const remaining = current.filter((_, idx) => idx !== i);

      return remaining.length ? remaining : [emptyBomRow()];

    });

    setComponentError("");

  };

  const handleSubmit = async () => {

  if (!form.bom_name.trim() || !form.product_name.trim()) {

    setSubmissionError("BOM Name and Product Name are required.");

    return;

  }

  const activeRows = rows.filter(hasRowDetails);

  if (!activeRows.length) {

    setComponentError("Add at least one BOM component before submitting.");

    componentsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    return;

  }

  const invalidIndex = rows.findIndex((row) => rowProblems(row, componentsList).length > 0);

  if (invalidIndex !== -1) {

    const problems = rowProblems(rows[invalidIndex], componentsList);

    setComponentError(`BOM line ${invalidIndex + 1}: ${problems.join(" ")}`);

    componentsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    return;

  }

  const selectedRows = activeRows;



  setComponentError("");

  setSubmissionError("");




  if (submitLockRef.current) {

    return;

  }



  submitLockRef.current = true;

  setIsSubmitting(true);



  try {

const newBom = {

  bom_number: bomNumber,

  bom_name: form.bom_name,

  product_name: form.product_name,

  version: form.version || "v1",

  created_by: form.created_by,

  description: form.description,



  status: "PENDING_MANAGER",



  items: selectedRows.map((row) => ({



      component: Number(row.component),



      component_code:

        componentsList.find(

          (component) =>

            Number(component.id) ===

            Number(row.component)

        )?.component_id || "",



      category: row.category || "",

      specifications:

        row.specifications || "",



      quantity: Number(

        row.qty || 1

      ),



      unit: String(

        row.unit ||

        row.uom ||

        row.unit_of_measurements ||

        ""

      ).trim(),



      remarks: row.remarks || "",

    })),

};



    console.log("BOM PAYLOAD:", JSON.stringify(newBom, null, 2));



    let responseData;



    try {


      responseData = await fetchAuthenticatedJson(

        `${config.baseURL}/bom/bom/`,

        {

          method: "POST",

          body: JSON.stringify(newBom),

        }

      );

    } catch (saveError) {

      const errorMessage = String(

        saveError?.message ||

        saveError?.detail ||

        ""

      );



      const duplicateBomNumber =

        errorMessage

          .toLowerCase()

          .includes("bom_number") &&

        errorMessage

          .toLowerCase()

          .includes("already exists");



      if (duplicateBomNumber) {

        console.warn(

          "Duplicate BOM-number response ignored because this BOM already exists:",

          bomNumber

        );



        window.dispatchEvent(

          new Event("notificationsUpdated")

        );



        navigate("/bom");

        return;

      }



      throw saveError;

    }



    console.log(

      "BOM saved to backend:",

      responseData

    );



    window.dispatchEvent(

      new Event("notificationsUpdated")

    );



    navigate("/bom");



  } catch (backendError) {

    console.error(

      "Backend save failed:",

      backendError

    );

    setSubmissionError(backendError?.message || "Could not submit the BOM. Please try again.");

  } finally {

    submitLockRef.current = false;

    setIsSubmitting(false);

  }

};

useEffect(() => {

  setForm((previous) => ({

    ...previous,

    created_by: loggedInUserName,

  }));

}, [loggedInUserName]);



useEffect(() => {

  loadComponents();

  loadNextBomNumber();



  setRows((prev) =>

    prev.map((r) => ({

      ...r,

      component: String(

        r.component || ""

      ),

    }))

  );

}, []);

  return (

  <PageShell>

    <PageHeader

  title="Create Bill of Materials"

  subtitle="Define a new Bill of Materials with components and details."

  left={

    <button

      type="button"

      onClick={() => navigate(-1)}

      className="inline-flex items-center gap-2 text-sm font-medium text-red-500 hover:text-red-600"

    >

      <ArrowLeft className="h-4 w-4" />

      <span>Back</span>

    </button>

  }

/>

      <FormGrid>

        <Field label="BOM Number">

          <Input value={bomNumber} readOnly />

        </Field>

        <Field label="BOM Name" required>

          <Input name="bom_name" value={form.bom_name} onChange={handleFormChange} />

        </Field>

        <Field label="Product Name" required>

          <Input name="product_name" value={form.product_name} onChange={handleFormChange} />

        </Field>

        <Field label="Version">

          <Input name="version" value={form.version} onChange={handleFormChange} />

        </Field>

        {/* Project Type removed per request */}

        <Field label="Created By">

  <Input

    name="created_by"

    value={form.created_by}

    readOnly

  />

</Field>

      </FormGrid>



<section ref={componentsSectionRef} className="mt-8 scroll-mt-24">

  <div className="flex items-center justify-between mb-4">

    <h2 className="text-lg font-semibold">BOM Components <span className="text-red-600">*</span></h2>



    <div className="flex flex-wrap items-center gap-2">

      <input

        ref={excelInputRef}

        type="file"

        accept=".xlsx,.xls"

        className="hidden"

        onChange={handleExcelImport}

        aria-label="Upload BOM Excel file"

      />

      <button type="button"

        onClick={() => excelInputRef.current?.click()}

        disabled={isImporting || isSubmitting}

        className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950 dark:text-emerald-300"

      >

        <FileSpreadsheet className="h-4 w-4" /> {isImporting ? "Importing..." : "Import Excel"}

      </button>

      <button type="button" onClick={downloadBomTemplate}

        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"

      ><Download className="h-4 w-4" /> Download Format</button>

      <button

        type="button"

        onClick={addRow}

        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"

      >

        <Plus className="h-4 w-4" /> Add Item

      </button>



      <button

        type="button"

        onClick={() => openComponentModal()}

        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"

      >

         + New Component

      </button>

    </div>

  </div>



  {componentError && (

    <p role="alert" className="mb-3 text-sm text-red-600">{componentError}</p>

  )}

  {catalogError && <p role="alert" className="mb-3 text-sm text-amber-600">{catalogError}</p>}

  <p className="mb-3 text-xs text-muted-foreground">Imported rows are checked against the Component Master. Remarks are optional. Fix any highlighted row before Submit.</p>



  <div className="overflow-x-auto rounded-xl border border-border">

    <table className="w-full min-w-[1000px] border-collapse text-sm">

      <thead className="bg-muted/50">

        <tr>

          <th className="px-4 py-3 text-left text-xs font-semibold uppercase border-b">Specifications</th>

          <th className="px-4 py-3 text-left text-xs font-semibold uppercase border-b">Component ID</th>

          <th className="px-4 py-3 text-left text-xs font-semibold uppercase border-b">HSN No</th>

          <th className="px-4 py-3 text-left text-xs font-semibold uppercase border-b">Category</th>

          <th className="px-4 py-3 text-left text-xs font-semibold uppercase border-b">Component Type</th>

          <th className="px-4 py-3 text-center text-xs font-semibold uppercase border-b">Qty</th>

          <th className="px-4 py-3 text-center text-xs font-semibold uppercase border-b">UOM</th>

          <th className="px-4 py-3 text-center text-xs font-semibold uppercase border-b">Remarks</th>

          <th className="px-4 py-3 text-center text-xs font-semibold uppercase border-b">Action</th>

        </tr>

      </thead>



      <tbody>

        {rows.map((row, i) => (

          <tr key={i} className={`border-b transition-colors ${rowProblems(row, componentsList).length ? "bg-red-50/60 dark:bg-red-950/20" : "hover:bg-muted/30"}`}>



<td className="px-3 py-2 align-top min-w-[260px]">

  <SearchableSelect

    name={`specification-${i}`}

    value={row.specifications || ""}

    options={specificationOptions}

    placeholder="Search or type specification..."

    onChange={(e) => handleSpecificationChange(i, e.target.value)}

  />

  {row.importSource === "excel" && (

    <div className="mt-1 text-xs text-muted-foreground">Excel row {row.excelRowNumber}{row.excelRowNumbers?.length > 1 ? ` (+${row.excelRowNumbers.length - 1} source rows combined)` : ""}</div>

  )}

  {rowProblems(row, componentsList).length > 0 && (

    <div role="alert" className="mt-2 space-y-1 text-xs text-red-700 dark:text-red-300">

      {rowProblems(row, componentsList).map((message, number) => (

        <p key={number} className="flex items-start gap-1">

          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {message}

        </p>

      ))}

    </div>

  )}

</td>



<td className="px-3 py-2 align-top min-w-[160px]">

  <SearchableSelect

    name={`component-${i}`}

    value={componentOptions.find((c) => String(c.value) === String(row.component))?.label || row.componentText || row.rawComponentCode || ""}

    options={componentOptions}

    placeholder="Select Component ID..."

    onChange={(e) => handleComponentChange(i, e.target.value)}

  />

</td>



<td className="px-3 py-2">

  <Input

    value={

      componentOptions.find(

        (option) => String(option.value) === String(row.component),

      )?.hsnNo || row.hsnNo || "-"

    }

    readOnly

  />

</td>



<td className="px-3 py-2">

  <Input value={row.category ?? ""} readOnly />

</td>



<td className="px-3 py-2">

  <Input value={row.component_type ?? ""} readOnly />

</td>



            {/* QTY */}

            <td className="px-3 py-2 text-center">

              <Input

                type="number"

                value={row.qty}

onChange={(e) => updateRow(i, { qty: e.target.value })}

              />

            </td>



            {/* UOM */}

            <td className="px-3 py-2 text-center">

              <Input

                value={row.unit || ""}

                placeholder="e.g. NOS, MTR, KG"

                onChange={(e) =>

                  updateRow(i, {

                    unit: e.target.value,

                  })

                }

              />

            </td>



            <td className="px-3 py-2 text-right">

              <Input value={row.remarks ?? ""} onChange={(e) => updateRow(i, { remarks: e.target.value })} placeholder="Optional" />

            </td>

            <td className="px-3 py-2 text-center">

              <button type="button" onClick={() => deleteRow(i)} title="Remove BOM line"

                className="rounded-lg p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-950">

                <Trash2 className="h-4 w-4" />

              </button>

            </td>

          </tr>

        ))}

      </tbody>

    </table>

  </div>

</section>

      {submissionError && (

        <p role="alert" className="mt-4 text-sm text-red-600">{submissionError}</p>

      )}

      <div className="mt-8 flex justify-end gap-3">

  <button

    type="button"

    onClick={() => navigate("/bom")}

    className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium hover:bg-gray-100"

  >

    Cancel

  </button>



  <button

    type="button"

    onClick={handleSubmit}

    disabled={isSubmitting}

    className="rounded-lg px-5 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"

    style={{ backgroundColor: "#E85D75" }}

    onMouseEnter={(e) => {

      if (!isSubmitting) {

        e.currentTarget.style.backgroundColor =

          "#D94A65";

      }

    }}

    onMouseLeave={(e) => {

      e.currentTarget.style.backgroundColor =

        "#E85D75";

    }}

  >

    {isSubmitting

      ? "Submitting..."

      : "Submit"}

  </button>

</div>

{showImportSummary && importSummary && (

  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">

    <div role="dialog" aria-modal="true" aria-label="Excel Import Validation"

      className="w-full max-w-2xl rounded-xl border border-border bg-white p-6 shadow-2xl dark:bg-slate-900">

      <div className="flex items-center justify-between gap-3">

        <h2 className="text-xl font-semibold">Excel Import Validation</h2>

        <button type="button" aria-label="Close" onClick={() => setShowImportSummary(false)}><X className="h-5 w-5" /></button>

      </div>

      <p className="mt-2 break-all text-sm text-muted-foreground">{importSummary.fileName}</p>

      <div className="my-5 grid grid-cols-3 gap-3 text-center">

        <div className="rounded-lg bg-muted p-3"><div className="text-2xl font-semibold">{importSummary.total}</div><div className="text-xs">Imported</div></div>

        <div className="rounded-lg bg-green-50 p-3 text-green-700 dark:bg-green-950"><div className="text-2xl font-semibold">{importSummary.success}</div><div className="text-xs">Valid</div></div>

        <div className="rounded-lg bg-red-50 p-3 text-red-700 dark:bg-red-950"><div className="text-2xl font-semibold">{importSummary.issues.length}</div><div className="text-xs">Issues</div></div>

      </div>

      {importSummary.sourceRows > importSummary.total && (
        <p className="-mt-2 mb-4 text-sm text-muted-foreground">
          Combined {importSummary.sourceRows - importSummary.total} repeated Excel rows by component and summed their quantities.
        </p>
      )}

      {importSummary.issues.length === 0 ? (

        <p className="flex items-center gap-2 text-sm text-green-700"><CheckCircle2 className="h-5 w-5" /> All imported components matched successfully.</p>

      ) : (

        <div className="max-h-72 space-y-2 overflow-y-auto">

          {importSummary.issues.map((issue, idx) => (

            <div key={idx} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">

              <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>{issue.row === "-" ? "Import Error" : `Excel Row ${issue.row}`}</strong><p className="mt-1">{issue.message}</p></div></div>

            </div>

          ))}

        </div>

      )}

      <p className="mt-3 text-xs text-muted-foreground">All readable component rows remain in the draft, including invalid ones. Fix highlighted lines or remove them explicitly. Remarks are optional.</p>

      <div className="mt-5 flex justify-end"><button type="button" className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"

        onClick={() => {setShowImportSummary(false); componentsSectionRef.current?.scrollIntoView({behavior:"smooth", block:"start"});}}>

        Review BOM Items

      </button></div>

    </div>

  </div>

)}

{showComponentModal && (

  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">



    <div className="w-[700px] rounded-xl border border-border bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">



      <h2 className="mb-5 text-lg font-semibold text-slate-900 dark:text-slate-100">

        Add Component

      </h2>



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



        <Field label="Version">

          <Input

            value={componentForm.version || ""}

            onChange={(e) =>

              setComponentForm({

                ...componentForm,

                version: e.target.value,

              })

            }

          />

        </Field>



        <Field label="Category" required>

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

              try {

                const nextId = await generateNextComponentId(category);

                setComponentForm((previous) => ({

                  ...previous,

                  category,

                  component_id: nextId,

                }));

              } catch (error) {

                alert(error.message || "Unable to generate component ID.");

              }

            }}

            options={CATEGORY_OPTIONS}

          />

        </Field>



        <Field label="Component Type" required>

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

            onChange={(e)=>

              setComponentForm({

                ...componentForm,

                specification:e.target.value

              })

            }

          />

        </Field>



        <Field label="HSN.No">

          <Input

            value={componentForm.hsn_no}

            inputMode="numeric"

            pattern="\d{4,8}"

            minLength={4}

            maxLength={8}

            title="Enter 4 to 8 digits, or leave blank."

            onChange={(e)=>

              setComponentForm({

                ...componentForm,

                hsn_no:e.target.value

              })

            }

          />

        </Field>



        <Field label="SKU.No">

          <Input

            value={componentForm.sku_no}

            onChange={(e)=>

              setComponentForm({

                ...componentForm,

                sku_no:e.target.value

              })

            }

          />

        </Field>



        <Field label="Part.No">

          <Input

            value={componentForm.part_no}

            onChange={(e)=>

              setComponentForm({

                ...componentForm,

                part_no:e.target.value

              })

            }

          />

        </Field>



        <Field label="Tally Reference">

          <Input

            value={componentForm.tally_reference}

            onChange={(e)=>

              setComponentForm({

                ...componentForm,

                tally_reference:e.target.value

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

          onClick={()=>setShowComponentModal(false)}

          className="rounded border px-4 py-2"

        >

          Cancel

        </button>



        <button

          onClick={saveComponent}

          className="rounded bg-primary px-5 py-2 text-white"

        >

          Save

        </button>



      </div>



    </div>



  </div>

)}

    </PageShell>

  );

}



export default CreateBomPage;
