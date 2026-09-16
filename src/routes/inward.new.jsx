import React, { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { FormShell, FormGrid, Field, Input, SearchableSelect } from "@/components/app/FormShell";
import { vendors as mockVendors, purchaseOrders as mockPOs, components as mockComponents } from "@/lib/mock-data";
import config from "@/config";
import { useAuth } from "@/AuthContext";
import { canWork } from "@/permissions";
import { getAutofillFromPO, getMatchingLineItemFromPO } from "./inwardAutofill.jsx";

export default function InwardNewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const canManageInward =
    canWork(user, "inward");
  const [loading, setLoading] = useState(false);
  const submitLockRef = useRef(false);
  const [vendors, setVendors] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [components, setComponents] = useState([]);

  const getPoStatus = (po) =>
    String(po?.status || po?.approval_status || po?.po_status || "")
      .trim()
      .toUpperCase();

  const isEligiblePurchaseOrder = (po) => {
    const status = getPoStatus(po);
    if (!status) return false;

    return (
      ["APPROVED", "DELIVERED", "ORDERED", "COMPLETED"].includes(status) ||
      status.includes("APPROVED") ||
      status.includes("DELIVERED")
    );
  };
  
const [formData, setFormData] = useState({
  vendor: "",
  poNumber: "",
  specification: "",
  component: "",
  quantityReceived: "",
  unitPrice: "",
  price: "",
  gstPercentage: "",
  totalPrice: "",
  batchNumber: "",
  invoiceNumber: "",
  invoiceDate: "",
  receivedDate: "",
});
  useEffect(() => {
    loadData();
  }, []);
useEffect(() => {
  const qty = Number(formData.quantityReceived) || 0;
  const unit = Number(formData.unitPrice) || 0;
  const gst = Number(formData.gstPercentage) || 0;

  const price = qty * unit;
  const total = price + (price * gst) / 100;

  setFormData((prev) => ({
    ...prev,
    price: price.toFixed(2),
    totalPrice: total.toFixed(2),
  }));
}, [
  formData.quantityReceived,
  formData.unitPrice,
  formData.gstPercentage,
]);

useEffect(() => {
  if (!formData.component) return;

  const selectedComponent = components.find(
    (c) => `${c.component_id || c.component_code || c.code || c.id} - ${c.component_name || c.name || ""}` === formData.component
  );

  const selectedPO = purchaseOrders.find(
    (po) =>
      String(po.id) === String(formData.poNumber) ||
      (po.po || po.po_number) === formData.poNumber,
  );

  const matchedLineItem = selectedPO
    ? getMatchingLineItemFromPO(selectedPO, selectedComponent)
    : null;

  const nextUnitPrice = Number(
    matchedLineItem?.unit_price ??
    matchedLineItem?.unitPrice ??
    matchedLineItem?.price ??
    matchedLineItem?.rate ??
    selectedComponent?.price ??
    selectedComponent?.unitPrice ??
    0
  );

  const nextGst = Number(
    matchedLineItem?.gst_percentage ??
    matchedLineItem?.gstPercentage ??
    matchedLineItem?.gst ??
    matchedLineItem?.tax ??
    0
  );

  const nextQuantity = Number(
    matchedLineItem?.quantity ??
    matchedLineItem?.qty ??
    matchedLineItem?.quantity_received ??
    (formData.quantityReceived || 0)
  );

  const qty = nextQuantity || Number(formData.quantityReceived) || 0;
  const unit = nextUnitPrice || Number(formData.unitPrice) || 0;
  const gst = nextGst || Number(formData.gstPercentage) || 0;
  const price = qty * unit;
  const total = price + (price * gst) / 100;

  setFormData((prev) => ({
    ...prev,
    unitPrice: nextUnitPrice ? String(nextUnitPrice) : prev.unitPrice,
    gstPercentage: nextGst ? String(nextGst) : prev.gstPercentage,
    quantityReceived: nextQuantity ? String(nextQuantity) : prev.quantityReceived,
    price: price.toFixed(2),
    totalPrice: total.toFixed(2),
  }));
}, [
  formData.component,
  formData.poNumber,
  formData.quantityReceived,
  formData.unitPrice,
  formData.gstPercentage,
  components,
  purchaseOrders,
]);
  async function loadData() {
    try {
      // Load vendors
      try {
        const res = await fetch(`${config.baseURL}/vendors/`);
        if (res.ok) {
          const data = await res.json();
          const remote = Array.isArray(data) ? data : data.results || [];
          setVendors(remote);
        } else {
          setVendors(mockVendors);
        }
      } catch {
        setVendors(mockVendors);
      }

      // Load purchase orders
// Load purchase orders
try {
  const res = await fetch(`${config.baseURL}/procurement/purchase-orders/`);

  console.log("STATUS:", res.status);

  if (!res.ok) {
    const text = await res.text();
    console.error("Purchase Order API Error:");
    console.error(text);

    setPurchaseOrders(mockPOs.filter(isEligiblePurchaseOrder));
    return;
  }

  const data = await res.json();

  console.log("Purchase Orders:", data);

  const remote = Array.isArray(data) ? data : data.results || [];

  setPurchaseOrders(remote.filter(isEligiblePurchaseOrder));
} catch (err) {
  console.error(err);
  setPurchaseOrders(mockPOs.filter(isEligiblePurchaseOrder));
}

      // Load components
      // Load components
try {
  const res = await fetch(`${config.baseURL}/components/components/`);

  if (!res.ok) {
    throw new Error("Failed to load components");
  }

  const data = await res.json();

  console.log("Components API:", data);

  setComponents(Array.isArray(data) ? data : data.results || []);
} catch (err) {
  console.error("Error loading components:", err);
  setComponents([]);
}
    } finally {
      submitLockRef.current = false;
      setLoading(false);
    }
  }

  function handleInputChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handlePoSelectionChange(e) {
    const { value } = e.target;
    const selectedPO = purchaseOrders.find(
      (po) => String(po.id) === String(value) || (po.po || po.po_number) === value
    );

      const autofill = getAutofillFromPO(selectedPO, components);

    const quantity = Number(autofill.quantityReceived || 0);
    const unit = Number(autofill.unitPrice || 0);
    const gst = Number(autofill.gstPercentage || 0);
    const price = quantity * unit;
    const total = price + (price * gst) / 100;

    setFormData((prev) => ({
      ...prev,
      poNumber: value,
      vendor: autofill.vendor || prev.vendor,
      component: autofill.component || prev.component,
      specification:
        components.find((component) =>
          `${component.component_id || component.component_code || component.code || component.id} - ${component.component_name || component.name || ""}` ===
            (autofill.component || prev.component),
        )?.specification ||
        components.find((component) =>
          `${component.component_id || component.component_code || component.code || component.id} - ${component.component_name || component.name || ""}` ===
            (autofill.component || prev.component),
        )?.specifications ||
        prev.specification,
      quantityReceived: autofill.quantityReceived || prev.quantityReceived,
      unitPrice: autofill.unitPrice || prev.unitPrice,
      gstPercentage: autofill.gstPercentage || prev.gstPercentage,
      price: price.toFixed(2),
      totalPrice: total.toFixed(2),
    }));
  }

  async function handleSubmit() {
    if (
      !canManageInward ||
      submitLockRef.current
    ) {
      return;
    }

    if (!formData.vendor || !formData.specification || !formData.component || !formData.quantityReceived || !formData.receivedDate) {
      alert("Please fill in all required fields");
      return;
    }

    submitLockRef.current = true;
    setLoading(true);

    try {
     const parseOptionId = (value) => {
  if (!value) return null;

  const match = String(value).match(/^(\d+)/);
  return match ? Number(match[1]) : null;
};


const selectedVendor = vendors.find(
  (v) => (v.name || v.vendor_name) === formData.vendor
);

const selectedPO = purchaseOrders.find(
  (po) =>
    String(po.id) === String(formData.poNumber) ||
    (po.po || po.po_number) === formData.poNumber,
);

const selectedComponent = components.find(
  (c) => `${c.component_id || c.component_code || c.code || c.id} - ${c.component_name || c.name || ""}` === formData.component
);

const matchedLineItem = selectedPO
  ? getMatchingLineItemFromPO(selectedPO, selectedComponent)
  : null;

const unitPrice = Number(
  matchedLineItem?.unitPrice ||
  matchedLineItem?.unit_price ||
  selectedComponent?.price ||
  selectedComponent?.unitPrice ||
  0
);


const quantity = Number(formData.quantityReceived) || 1;

    async function getNextInwCode() {
      try {
        const res = await fetch(`${config.baseURL}/inward/next-code/`);
        if (!res.ok) return `INW-${String(1).padStart(3, "0")}`;
        const data = await res.json();
        return data.inward_code || `INW-${String(1).padStart(3, "0")}`;
      } catch (err) {
        console.warn("Failed to compute next INW code, falling back:", err);
        return `INW-${String(1).padStart(3, "0")}`;
      }
    }

    const INWNumber = await getNextInwCode();
const inwardEntry = {
  code: INWNumber,
  vendor: selectedVendor?.id,
  purchase_order: selectedPO?.id || null,
  component: selectedComponent?.id,
  quantity_received: quantity,
  batch_number: formData.batchNumber,
  received_date: formData.receivedDate,
  qc_status: "PENDING",

  line_items: [
    {
      specification: formData.specification,
      invoice_number: formData.invoiceNumber,
      invoice_date: formData.invoiceDate,
      quantity: quantity,
      total_quantity: quantity,
      unit_price: Number(formData.unitPrice),
      gst_percentage: Number(formData.gstPercentage),
      grand_total: Number(formData.totalPrice),
    },
  ],
};
    

      // Save to API
      try {
       const res = await fetch(`${config.baseURL}/inward/`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(inwardEntry),
});

const data = await res.json();

console.log("Status:", res.status);
console.log("Payload:", inwardEntry);
console.log("Response:", data);

if (!res.ok) {
  alert(JSON.stringify(data, null, 2));
  return;
}

      // Try to persist our preferred INW format on the backend; if backend rejects it,
      // store a local override so the UI shows `INW-0001` style codes.
      try {
        await fetch(`${config.baseURL}/inward/${data.id}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: INWNumber }),
        });
      } catch (err) {
        try {
          const key = "dream-to-life-inw-overrides";
          const existing = JSON.parse(window.localStorage.getItem(key) || "{}");
          existing[String(data.id)] = INWNumber;
          window.localStorage.setItem(key, JSON.stringify(existing));
        } catch (e) {
          console.warn("Failed to persist local INW override:", e);
        }
      }
      } catch (err) {
        console.error("API save failed:", err);
        alert("Failed to save inward entry");
        return;
      }

      navigate("/inward");
    } catch (err) {
      console.error("Error:", err);
      alert("Failed to save inward entry");
    } finally {
      setLoading(false);
    }
  }

const vendorOptions = vendors.map((v) => ({
  value: String(v.id),
  label: v.name || v.vendor_name,
}));

const poOptions = purchaseOrders.map((po) => ({
  value: String(po.id),
  label: po.po || po.po_number,
}));

const componentOptions = components.map((c) => ({
  value: String(c.id),
  label: `${c.component_id || c.component_code || c.code || c.id} - ${c.component_name || c.name || ""}`,
}));

const specificationOptions = Array.from(
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
).map((value) => ({ value, label: value }));


  if (!canManageInward) {
    return (
      <Navigate
        to="/inward"
        replace
      />
    );
  }

  return (
    <FormShell
      title="Create Inward Entry"
      subtitle="Record components received from a vendor. Inventory will be updated only after QC passes."
      backTo="/inward"
      backLabel="Back to Inward"
      submitLabel={loading ? "Recording..." : "Record Inward"}
      onSubmit={handleSubmit}
      loading={loading}
    >
      <FormGrid>
        <Field label="Vendor" required>
          <SearchableSelect
            name="vendor"
            value={formData.vendor}
            onChange={handleInputChange}
            options={vendorOptions}
            placeholder="Search or type vendor..."
          />
        </Field>

        <Field label="PO Number">
          <SearchableSelect
            name="poNumber"
            value={formData.poNumber}
            onChange={handlePoSelectionChange}
            options={poOptions}
            placeholder="Search or type PO number..."
          />
        </Field>

        <Field label="Specification" required>
          <SearchableSelect
            name="specification"
            value={formData.specification}
            onChange={(event) => {
              const specification = event.target.value;
              const selectedComponent = components.find(
                (component) =>
                  String(
                    component.specification ||
                      component.specifications ||
                      component.component_specifications ||
                      "",
                  ).trim() === specification,
              );

              setFormData((previous) => ({
                ...previous,
                specification,
                component: selectedComponent
                  ? `${selectedComponent.component_id || selectedComponent.component_code || selectedComponent.code || selectedComponent.id} - ${selectedComponent.component_name || selectedComponent.name || ""}`
                  : previous.component,
              }));
            }}
            options={specificationOptions}
            placeholder="Search or select specification..."
          />
        </Field>

        <Field label="Component" required>
          <SearchableSelect
            name="component"
            value={formData.component}
            onChange={(event) => {
              const componentValue = event.target.value;
              const selectedComponent = components.find(
                (component) =>
                  String(component.id) === componentValue ||
                  `${component.component_id || component.component_code || component.code || component.id} - ${component.component_name || component.name || ""}` === componentValue,
              );

              setFormData((previous) => ({
                ...previous,
                component: componentValue,
                specification: selectedComponent
                  ? String(
                      selectedComponent.specification ||
                        selectedComponent.specifications ||
                        selectedComponent.component_specifications ||
                        "",
                    ).trim()
                  : previous.specification,
              }));
            }}
            options={componentOptions}
            placeholder="Search or type component..."
          />
        </Field>

        <Field label="Quantity Received" required>
          <Input
            type="number"
            name="quantityReceived"
            min="1"
            value={formData.quantityReceived}
            onChange={handleInputChange}
          />
        </Field>
<Field label="Unit Price">
  <Input
    type="number"
    name="unitPrice"
    value={formData.unitPrice}
    onChange={handleInputChange}
  />
</Field>

<Field label="Price">
  <Input
    name="price"
    value={formData.price}
    readOnly
  />
</Field>

<Field label="GST %">
  <Input
    type="number"
    name="gstPercentage"
    value={formData.gstPercentage}
    onChange={handleInputChange}
  />
</Field>

<Field label="Total Price">
  <Input
    name="totalPrice"
    value={formData.totalPrice}
    readOnly
  />
</Field>
<Field label="Invoice Number">
  <Input
    name="invoiceNumber"
    value={formData.invoiceNumber}
    onChange={handleInputChange}
    placeholder="INV-001"
  />
</Field>

<Field label="Invoice Date">
  <Input
    type="date"
    name="invoiceDate"
    value={formData.invoiceDate}
    onChange={handleInputChange}
  />
</Field>
        <Field label="Batch Number">
          <Input
            name="batchNumber"
            value={formData.batchNumber}
            onChange={handleInputChange}
            placeholder="BATCH-..."
          />
        </Field>

        <Field label="Received Date" required>
          <Input
            type="date"
            name="receivedDate"
            value={formData.receivedDate}
            onChange={handleInputChange}
          />
        </Field>
      </FormGrid>
    </FormShell>
  );
}