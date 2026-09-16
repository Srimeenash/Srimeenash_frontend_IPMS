import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useAuth } from "@/AuthContext";
import { canViewCosting, canWork } from "@/permissions";



export default function VendorDetailPage() {
  const { vendorId } = useParams();
  const navigate = useNavigate();
  const { user, activeRole } = useAuth();

  // Everyone with Vendor module access may VIEW this page.
  // Only Admin + Procurement may EDIT Vendor data.
  const canManageVendor =
    canWork(
      user,
      "vendor",
      activeRole,
    );

  const canSeeCosting =
    canViewCosting(
      user,
      activeRole,
    );

  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingIndex, setEditingIndex] = useState(null);
  const [isEditingVendorInfo, setIsEditingVendorInfo] = useState(false);
  const [originalVendorInfo, setOriginalVendorInfo] = useState(null);
  const [savingVendorField, setSavingVendorField] = useState(false);
  const [vendorFieldErrors, setVendorFieldErrors] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    loadVendor();
  }, [vendorId]);





  async function loadVendor() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`/api/vendors/${vendorId}/`);
      if (!res.ok) throw new Error("Failed to load vendor.");

      const data = await res.json();
      setVendor(data);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

 function addNewRow() {
  if (!canManageVendor) {
    return;
  }

  setVendor((prev) => {
    const updated = {
      ...prev,
      products: [
        ...(prev.products || []),
        {
          id: null, // IMPORTANT for backend to treat as new
          product: "",
          product_version: "",
          quantity: 1,
          unit: "",
          price: 0,
          gst: 0,
        },
      ],
    };

    setEditingIndex(updated.products.length - 1);
    return updated;
  });
}

  function sanitizeDecimalInput(value, maxIntegerDigits = 3, maxFractionDigits = 2) {
    const stringValue = String(value ?? "");
    const cleaned = stringValue.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    const integerPart = parts[0].slice(0, maxIntegerDigits);
    const fractionPart = parts[1] ? parts[1].slice(0, maxFractionDigits) : undefined;
    return fractionPart !== undefined ? `${integerPart}.${fractionPart}` : integerPart;
  }
function handleChange(index, field, value) {
    if (!canManageVendor) {
      return;
    }

    const updated = [...vendor.products];
    if (field === "price" || field === "gst") {
      value = sanitizeDecimalInput(value, field === "gst" ? 3 : 6, 2);
    }
    updated[index][field] = value;
    setVendor({ ...vendor, products: updated });
  }

  function handleEdit(index) {
    if (!canManageVendor) {
      return;
    }

    setEditingIndex(index);
  }

function parseFloatField(value) {
  const cleaned = String(value ?? "").replace(/[^0-9.]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isProductRowEmpty(product) {
  const hasName = String(product.product ?? "").trim() !== "";
  const hasVersion = String(product.product_version ?? "").trim() !== "";
  return !hasName && !hasVersion;
}

async function handleSave() {
  if (!canManageVendor) {
    return;
  }

  try {
    setLoading(true);
    setError("");

    const cleanedProducts = vendor.products
      .map((p) => ({
        id: p.id,
        product: String(p.product ?? "").trim(),
        product_version: String(p.product_version ?? "").trim(),
        quantity: parseFloatField(p.quantity),
        unit: String(p.unit ?? "").trim(),
        price: parseFloatField(p.price),
        gst: parseFloatField(p.gst),
      }))
      .filter((product) => !isProductRowEmpty(product));

    if (cleanedProducts.length < vendor.products.length) {
      setError("Empty component rows were removed before saving. Please fill all fields or remove unused rows.");
    }

    const payload = {
      ...vendor,
      products: cleanedProducts,
    };

    const res = await fetch(`/api/vendors/${vendorId}/`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log("Response:", data);

    if (!res.ok) {
      throw new Error(JSON.stringify(data));
    }

    setVendor(data);
    setEditingIndex(null);
  } catch (err) {
    console.error(err);
    setError(err.message);
  } finally {
    setLoading(false);
  }
}

function validateVendorInformation() {
  const errors = {};
  const phone = String(vendor?.phone_number ?? "").trim();
  const email = String(vendor?.email ?? "").trim();

  if (phone && !/^\d{10}$/.test(phone)) {
    errors.phone_number = "Enter a valid 10-digit phone number.";
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address, for example name@company.com.";
  }

  return errors;
}

function startVendorInformationEdit() {
  if (!canManageVendor) {
    return;
  }

  if (savingVendorField || !vendor) return;

setOriginalVendorInfo({
  name: vendor.name ?? "",
  contact_person: vendor.contact_person ?? "",
  phone_number: vendor.phone_number ?? "",
  email: vendor.email ?? "",

  gst_number: vendor.gst_number ?? "",

  address: vendor.address ?? "",
  city: vendor.city ?? "",
  state: vendor.state ?? "",
  state_code: vendor.state_code ?? "",
  pincode: vendor.pincode ?? "",

  terms_and_conditions: vendor.terms_and_conditions ?? "",
  additional_notes: vendor.additional_notes ?? "",
});
  setVendorFieldErrors({});
  setIsEditingVendorInfo(true);
}

function cancelVendorInformationEdit() {
  if (!isEditingVendorInfo || !originalVendorInfo) return;

  setVendor((previous) => ({
    ...previous,
    ...originalVendorInfo,
  }));
  setVendorFieldErrors({});
  setOriginalVendorInfo(null);
  setIsEditingVendorInfo(false);
}

function handleVendorFieldChange(fieldKey, rawValue) {
  if (!canManageVendor) {
    return;
  }

  const value =
    fieldKey === "phone_number"
      ? String(rawValue).replace(/\D/g, "").slice(0, 10)
      : rawValue;

  setVendor((previous) => ({
    ...previous,
    [fieldKey]: value,
  }));

  setVendorFieldErrors((previous) => ({
    ...previous,
    [fieldKey]: "",
  }));
}

async function handleVendorInformationSave() {
  if (!canManageVendor) {
    return;
  }

  if (!isEditingVendorInfo || savingVendorField) return;

  const validationErrors = validateVendorInformation();
  if (Object.keys(validationErrors).length > 0) {
    setVendorFieldErrors(validationErrors);
    return;
  }

  try {
    setSavingVendorField(true);
    setVendorFieldErrors({});

    const res = await fetch(`/api/vendors/${vendorId}/`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...vendor,
        products: Array.isArray(vendor?.products) ? vendor.products : [],
      }),
    });

    let responseData = null;
    try {
      responseData = await res.json();
    } catch (parseError) {
      responseData = null;
    }

    if (!res.ok) {
      const nextErrors = {};
const editableKeys = [
  "name",
  "contact_person",
  "phone_number",
  "email",

  "gst_number",

  "address",
  "city",
  "state",
  "state_code",
  "pincode",

  "terms_and_conditions",
  "additional_notes",
];

      editableKeys.forEach((key) => {
        const backendValue = responseData?.[key];
        if (backendValue) {
          nextErrors[key] = Array.isArray(backendValue)
            ? String(backendValue[0])
            : String(backendValue);
        }
      });

      if (Object.keys(nextErrors).length === 0) {
        nextErrors.general = String(
          responseData?.detail || "Failed to update vendor information."
        );
      }

      setVendorFieldErrors(nextErrors);
      return;
    }

    setVendor(responseData);
    setOriginalVendorInfo(null);
    setIsEditingVendorInfo(false);
    setVendorFieldErrors({});
  } catch (err) {
    console.error(err);
    setVendorFieldErrors({
      general: "Unable to connect to the server. Please try again.",
    });
  } finally {
    setSavingVendorField(false);
  }
}

  async function handleDelete(index) {
  if (!canManageVendor) {
    return;
  }

  try {
    const updatedProducts = [...vendor.products];
    updatedProducts.splice(index, 1);

    const payload = {
      ...vendor,
      products: updatedProducts.map((p) => ({
        id: p.id,
        product: p.product,
        product_version: p.product_version,
        quantity: Number(p.quantity),
        unit: p.unit,
        price: Number(p.price),
        gst: Number(p.gst),
      })),
    };

    const res = await fetch(`/api/vendors/${vendorId}/`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Failed to delete product.");

    const updatedVendor = await res.json();
    setVendor(updatedVendor);

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

  const grandTotal = useMemo(() => {
    if (!vendor?.products) return 0;
    return vendor.products.reduce((sum, item) => {
      const subtotal = Number(item.quantity) * Number(item.price);
      const gst = subtotal * Number(item.gst) / 100;
      return sum + subtotal + gst;
    }, 0);
  }, [vendor]);

  const productTableFields =
    canSeeCosting
      ? ["product", "product_version", "quantity", "price", "gst"]
      : ["product", "product_version", "quantity"];

  if (loading) {
    return (
      <PageShell>
        <PageHeader title="Vendor Details" backTo="/vendors" />
        <div className="p-6">Loading...</div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <PageHeader title="Vendor Details" backTo="/vendors" />
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-600">
          {error}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Vendor Details"
        subtitle="Vendor Information"
        backTo="/vendors"
      />

      <div className="mx-auto w-full rounded-2xl border border-gray-200 bg-white p-5 shadow-md dark:border-slate-700 dark:bg-slate-900">
        {/* Vendor Info */}
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Vendor Information
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {canManageVendor
                ? "Use the edit button to update vendor information, then save all changes together."
                : "View vendor information and component details."}
            </p>
          </div>

          {canManageVendor && (
            !isEditingVendorInfo ? (
              <button
                type="button"
                onClick={startVendorInformationEdit}
                disabled={savingVendorField}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-400"
              >
                <Pencil size={16} />
                Edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleVendorInformationSave}
                  disabled={savingVendorField}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Check size={16} />
                  {savingVendorField ? "Saving..." : "Save"}
                </button>

                <button
                  type="button"
                  onClick={cancelVendorInformationEdit}
                  disabled={savingVendorField}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <X size={16} />
                  Cancel
                </button>
              </div>
            )
          )}
        </div>

        {vendorFieldErrors.general && (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {vendorFieldErrors.general}
          </div>
        )}

        <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {[
  { label: "Company Name", key: "name" },
  { label: "Contact Person", key: "contact_person" },

  {
    label: "Phone Number",
    key: "phone_number",
    type: "tel",
  },

  {
    label: "Email",
    key: "email",
    type: "email",
  },

  { label: "Address", key: "address" },
  { label: "City", key: "city" },

  { label: "State", key: "state" },
  { label: "State Code", key: "state_code" },

  { label: "Pincode", key: "pincode" },

  { label: "GST Number", key: "gst_number" },

  {
    label: "Terms and Conditions",
    key: "terms_and_conditions",
    multiline: true,
    fullWidth: true,
  },

  {
    label: "Additional Notes",
    key: "additional_notes",
  },
].map((field) => {
            const rawValue = vendor?.[field.key] ?? "";
            const displayValue =
              field.key === "name" && !isEditingVendorInfo
                ? String(rawValue).replace(/\s*-\s*\d+$/g, "")
                : rawValue;
            const fieldError = vendorFieldErrors[field.key] || "";

            const commonProps = {
              name: field.key,
              value: displayValue,
              disabled: !canManageVendor || !isEditingVendorInfo || savingVendorField,
              onChange: (event) =>
                handleVendorFieldChange(field.key, event.target.value),
              className: `w-full rounded-lg border px-3 py-1.5 text-slate-900 outline-none transition dark:text-slate-100 ${
                fieldError
                  ? "border-red-500 bg-red-50 focus:ring-2 focus:ring-red-200 dark:bg-red-950/20"
                  : isEditingVendorInfo
                  ? "border-blue-500 bg-white focus:ring-2 focus:ring-blue-200 dark:bg-slate-800"
                  : "cursor-not-allowed border-gray-300 bg-gray-50 opacity-100 dark:border-slate-700 dark:bg-slate-950"
              }`,
            };

            return (
              <div
                key={field.key}
                className={field.fullWidth ? "md:col-span-2" : ""}
              >
                <label
                  htmlFor={`vendor-${field.key}`}
                  className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  {field.label}
                </label>

                {field.multiline ? (
                  <textarea
                    {...commonProps}
                    id={`vendor-${field.key}`}
                    rows={4}
                    className={`${commonProps.className} min-h-[100px] resize-y`}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        cancelVendorInformationEdit();
                      }
                    }}
                  />
                ) : (
                  <input
                    {...commonProps}
                    id={`vendor-${field.key}`}
                    type={field.type || "text"}
                    inputMode={field.key === "phone_number" ? "numeric" : undefined}
                    maxLength={field.key === "phone_number" ? 10 : undefined}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleVendorInformationSave();
                      }
                      if (event.key === "Escape") {
                        cancelVendorInformationEdit();
                      }
                    }}
                  />
                )}

                {fieldError && (
                  <p className="mt-1 text-xs font-medium text-red-600">
                    {fieldError}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Products Table */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Components</h2>
            {canManageVendor && (
              <button
                type="button"
                onClick={addNewRow}
                className="rounded-md px-3 py-1.5 text-sm text-white font-medium transition"
                style={{ backgroundColor: "#E85D75" }}
              >
                + Add Component
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
            <table className="w-full table-fixed border-collapse text-sm">
    <thead className="bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200">
  <tr className="border-b border-gray-200 dark:border-slate-700">
    <th className="w-[260px] px-4 py-2 text-left font-semibold">COMPONENT</th>
    <th className="w-[120px] px-4 py-2 text-center font-semibold">VERSION</th>
    <th className="w-[100px] px-4 py-2 text-center font-semibold">QTY</th>
    
    {canSeeCosting && (
      <>
        <th className="w-[150px] px-4 py-2 text-right font-semibold">UNIT PRICE</th>
        <th className="w-[120px] px-4 py-2 text-right font-semibold">GST %</th>
        <th className="w-[170px] px-4 py-2 text-right font-semibold">LINE TOTAL</th>
      </>
    )}
    {canManageVendor && (
      <th className="w-[120px] px-4 py-2 text-center font-semibold">ACTION</th>
    )}
  </tr>
</thead>


              <tbody>
                {vendor?.products?.length > 0 ? (
                  vendor.products.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                     {productTableFields.map((field, fIdx) => (
                        <td
  key={fIdx}
  className={`border-b border-gray-200 px-4 py-2 text-slate-900 dark:border-slate-700 dark:text-slate-100 ${
    field === "product"
      ? "text-left"
      : field === "product_version" ||
        field === "quantity" 
        
      ? "text-center"
      : "text-right"
  }`}
>
                          {editingIndex === index ? (
field === "product" ? (
  <input
    type="text"
    value={item.product}
    onChange={(e) =>
      handleChange(index, "product", e.target.value)
    }
    placeholder="Enter Component"
    className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-left text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
  />
) : (
  <input
    type={
      field === "quantity" ||
      field === "price" ||
      field === "gst"
        ? "text"
        : "text"
    }
    value={item[field]}
    onChange={(e) =>
      handleChange(index, field, e.target.value)
    }
    inputMode={field === "quantity" ? "numeric" : field === "price" || field === "gst" ? "decimal" : "text"}
    pattern={field === "gst" ? "^\\d{0,3}(\\.\\d{0,2})?$" : field === "price" ? "^\\d{0,6}(\\.\\d{0,2})?$" : undefined}
    className={`w-full rounded border border-gray-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100
${
  field === "product"
    ? "text-left"
    : field === "quantity" ||
      field === "product_version" ||
      field === "unit"
    ? "text-center"
    : "text-right"
}`}
  />
)
                          ) : field === "price" ? `₹${item[field]}` : field === "gst" ? `${item[field]}%` : item[field]}
                        </td>
                      ))}
                      {canSeeCosting && (
                        <td className="border-b px-4 py-2 text-right font-semibold whitespace-nowrap">
                          ₹{(
                            Number(item.quantity||0) *
                            Number(item.price||0) *
                            (1+Number(item.gst||0)/100)
                          ).toFixed(2)}
                        </td>
                      )}
                     {canManageVendor && (
                       <td className="border-b px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-3">
                            {editingIndex===index ? (
                              <button
                                type="button"
                                onClick={handleSave}
                                className="rounded bg-green-600 text-white px-3 py-1"
                              >
                                Save
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleEdit(index)}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <Pencil size={18}/>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDelete(index)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 size={18}/>
                            </button>
                          </div>
                        </td>
                     )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={
                        3 +
                        (canSeeCosting ? 3 : 0) +
                        (canManageVendor ? 1 : 0)
                      }
                      className="py-4 text-center text-gray-500 dark:text-gray-400"
                    >
                      No Components Found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Grand Total */}
          {canSeeCosting && (
            <div className="mt-3 border-t border-gray-200 pt-2 flex justify-end dark:border-slate-700">
              <div className="flex items-center gap-3 text-2xl font-bold text-slate-900 dark:text-slate-100">
                Grand Total :
                <span style={{ color: "#E85D75" }}>₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Back Button */}
        <div className="mt-2 flex justify-end">

        </div>
      </div>
    </PageShell>
  );
}
