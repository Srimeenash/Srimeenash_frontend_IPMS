import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { FormGrid, Field, Input, Select } from "@/components/app/FormShell";
import { components } from "@/lib/mock-data";
import { useAuth } from "../AuthContext";
import config from "@/config";
import { fetchAuthenticatedJson } from "@/api";
import { Plus, Trash2, ArrowLeft, X } from "lucide-react";
import { SearchableSelect } from "@/components/app/FormShell";
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

 const [bomNumber, setBomNumber] =
  useState("BOM-00001");
  const [rows, setRows] = useState([
{
  component: "",
  category: "",
  component_type: "",
  specifications: "",
  qty: 1,
  unit: "",
  remarks: "",
}
  ]);
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

const componentOptions = componentsList.map((c) => ({
  value: c.id, // Always store database primary key
  label: `${c.component_id || c.component_code || c.code || c.id}`,
  component_id: c.component_id || c.component_code || c.code,
  version: "",
  category:
    c.category ||
    c.component_category ||
    c.category_name ||
    c.categoryName ||
    "",
  component_type:
    c.component_type ||
    c.componentType ||
    c.type ||
    "",
  specifications:
    c.specifications ||
    c.specification ||
    c.component_specifications ||
    c.componentSpecification ||
    "",
  hsnNo: c.hsn_numbers || c.hsn_no || c.hsn || "",
}));

const specificationOptions = Array.from(
  new Map(
    componentOptions
      .filter((option) => String(option.specifications || "").trim())
      .map((option) => [
        String(option.specifications).trim(),
        {
          value: String(option.specifications).trim(),
          label: String(option.specifications).trim(),
          component_id: option.component_id,
          componentValue: option.value,
          componentLabel: option.label,
          category: option.category,
          component_type: option.component_type,
          specifications: option.specifications,
          hsnNo: option.hsnNo,
        },
      ]),
  ).values(),
);
  const updateRow = (i, patch) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

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

    // Keep the sequence global; only the category prefix changes.
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

    const created = await response.json();

    const loadedComponents = await loadComponents();

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
const loadComponents = async () => {
  try {
    const res = await fetch(`${config.baseURL}/components/components/`);
    const data = await res.json();

    const list = Array.isArray(data) ? data : data.results || [];
    setComponentsList(list);
    return list;
  } catch (err) {
    console.error("Failed to load components:", err);
    setComponentsList([]);
    return [];
  }
};
const addRow = () =>
  setRows((current) => [
    ...current,
    {
      component: "",
      category: "",
      component_type: "",
      specifications: "",
      qty: 1,
      unit: "",
      remarks: "",
    },
  ]);
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

        /*
         * Accept only the required five-digit format.
         * Legacy timestamp BOM numbers are ignored.
         */
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
    setRows((r) => r.filter((_, idx) => idx !== i));
  };
const computeRow = (row) => ({
  ...row,
  qty: Number(row.qty || 0),
});
  const handleSubmit = async () => {
  /*
   * Synchronous lock: React state updates are asynchronous, so two very
   * fast clicks can happen before isSubmitting re-renders the button.
   */
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

  items: rows
    .filter((row) => row.component)
    .map((row) => ({

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
      /*
       * IMPORTANT:
       * Use the authenticated API helper so Django receives request.user.
       * The backend stores the exact creator email in the BOM Manager
       * notification and uses it later for Approved/Rejected return mail.
       */
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

<section className="mt-8">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-lg font-semibold">BOM Components</h2>

    <div className="flex items-center gap-2">
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
        </tr>
      </thead>

      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b hover:bg-muted/30 transition-colors">

<td className="px-3 py-2">
  <SearchableSelect
    name="specification"
    value={row.specifications || ""}
    options={specificationOptions}
    placeholder="Search or type specification..."
    onChange={(e) => {
      const selectedSpecification = e.target.value;
      const selectedOption = specificationOptions.find(
        (option) => option.label === selectedSpecification,
      );
      const selectedComponent = componentOptions.find(
        (option) => option.value === selectedOption?.componentValue,
      );

      updateRow(i, {
        component: selectedOption?.componentValue || row.component || "",
        category: selectedOption?.category || selectedComponent?.category || "",
            hsnNo: selectedOption?.hsnNo || selectedComponent?.hsnNo || "",
        component_type:
          selectedOption?.component_type || selectedComponent?.component_type || "",
        specifications: selectedOption?.specifications || selectedSpecification,
        unit: row.unit || "",
      });
    }}
  />
</td>

<td className="px-3 py-2">
  <div className="flex items-center gap-2">

    <div className="flex-1">
<SearchableSelect
  name="component"
  value={
    componentOptions.find((opt) => String(opt.value) === String(row.component))?.label ||
    row.component ||
    ""
  }
  options={componentOptions}
  placeholder="Search or type component..."
  onChange={(e) => {
    const selectedLabel = e.target.value;
    const selectedOption = componentOptions.find(
      (opt) => opt.label === selectedLabel || String(opt.value) === selectedLabel
    );
   const selectedId = selectedOption?.value || "";

updateRow(i, {
  component: selectedId,
  category: selectedOption?.category || "",
  hsnNo: selectedOption?.hsnNo || "",
  component_type: selectedOption?.component_type || "",
  specifications: selectedOption?.specifications || "",
  // UOM is intentionally NOT copied from Component Master.
  // User types the UOM for this BOM item.
  unit: row.unit || "",
});
  }}
/>
    </div>



  </div>
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
onChange={(e) => {
  const updated = computeRow({
    ...row,
    qty: Number(e.target.value),
  });
  updateRow(i, updated);
}}
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
              <Input value={row.remarks ?? ""} onChange={(e) => updateRow(i, { remarks: e.target.value })} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</section>
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
            pattern="\\d{4,8}"
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