import { CostLineItems } from "@/components/app/SerialCostDetails";
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { FormGrid, Field, Input, Textarea } from "@/components/app/FormShell";
import { ArrowLeft } from "lucide-react";
import config from "@/config";
import { fetchAuthenticatedJson } from "@/api";
import { useAuth } from "@/AuthContext";
import { canViewCosting, canWork } from "@/permissions";

export default function InwardDetailPage() {
  const { grnId } = useParams();
  const navigate = useNavigate();
  const { user, activeRole } = useAuth();

  const canManageInward =
    canWork(
      user,
      "inward",
      activeRole,
    );

  const canSeeCosting =
    canViewCosting(
      user,
      activeRole,
    );
  const [loading, setLoading] = useState(true);
  const [inwardEntry, setInwardEntry] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [components, setComponents] = useState([]);
  const [editingLocation, setEditingLocation] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationDraft, setLocationDraft] = useState({ rack_no: "", box_no: "" });

  useEffect(() => {
    loadData();
  }, [grnId]);
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
async function loadData() {
  try {
    setLoading(true);

    const [
      vendorData,
      poData,
      compData,
    ] = await Promise.all([
      fetchAuthenticatedJson(
        `${config.baseURL}/vendors/`
      ),
      fetchAuthenticatedJson(
        `${config.baseURL}/procurement/purchase-orders/`
      ),
      fetchAuthenticatedJson(
        `${config.baseURL}/components/components/`
      ),
    ]);

    const vendorList = Array.isArray(vendorData)
      ? vendorData
      : vendorData?.results || [];

    const poList = Array.isArray(poData)
      ? poData
      : poData?.results || [];

    const compList = Array.isArray(compData)
      ? compData
      : compData?.results || [];

    setVendors(vendorList);
    setPurchaseOrders(poList);
    setComponents(compList);

    await loadInwardEntry(
      vendorList,
      poList,
      compList,
      false
    );
  } catch (err) {
    console.error(
      "Error loading inward page data:",
      err
    );

    setInwardEntry(null);
    setLineItems([
      {
        id: 1,
        specification: "",
        invoiceNo: "",
        invoiceDate: "",
        totalQty: "",
        quantity: "",
        unitPrice: "",
        gst: "",
        grandTotal: "",
      },
    ]);
  } finally {
    setLoading(false);
  }
}

async function loadInwardEntry(
  vendorList,
  poList,
  componentList,
  manageLoading = true
) {
  try {
    if (manageLoading) {
      setLoading(true);
    }

    const data = await fetchAuthenticatedJson(
      `${config.baseURL || ""}/inward/${grnId}/`,
      {
        cache: "no-store",
      }
    );

    const vendor = vendorList.find(
      (v) =>
        String(v.id) ===
        String(data.vendor)
    );

    const po = poList.find(
      (p) =>
        String(p.id) ===
        String(data.purchase_order)
    );

    const component = componentList.find(
      (c) =>
        String(c.id) ===
        String(data.component)
    );

    const mapped = {
      ...data,

      vendorName:
        vendor?.name ||
        vendor?.vendor_name ||
        "-",

      poNumber:
        po?.po ||
        po?.po_number ||
        "-",

      componentName: component
        ? `${component.component_id} - ${component.name}`
        : "-",

      date: data.received_date,
    };

    setInwardEntry(mapped);
    setLocationDraft({ rack_no: data.rack_no || "", box_no: data.box_no || "" });

    setLineItems(
      Array.isArray(data.line_items) &&
        data.line_items.length > 0
        ? data.line_items.map((item) => ({
            id: item.id || Date.now(),

            specification:
              item.specification ||
              component?.specifications ||
              "",

            invoiceNo:
              item.invoice_number ||
              item.invoice_no ||
              item.invoiceNo ||
              "",

            invoiceDate:
              item.invoice_date ||
              item.invoiceDate ||
              "",

            totalQty:
              item.total_quantity ||
              item.total_qty ||
              item.totalQty ||
              "",

            quantity:
              item.quantity || "",

            unitPrice:
              item.unit_price ||
              item.unitPrice ||
              "",

            gst:
              item.gst_percentage ||
              item.gst ||
              "",

            grandTotal:
              item.grand_total ||
              item.grandTotal ||
              "",
          }))
        : [
            {
              id: 1,
              specification:
                component?.specifications ||
                "",
              invoiceNo: "",
              invoiceDate: "",
              totalQty: "",
              quantity: "",
              unitPrice: "",
              gst: "",
              grandTotal: "",
            },
          ]
    );
  } catch (err) {
    console.error(
      "Error loading inward entry:",
      err
    );

    setInwardEntry(null);

    setLineItems([
      {
        id: 1,
        specification: "",
        invoiceNo: "",
        invoiceDate: "",
        totalQty: "",
        quantity: "",
        unitPrice: "",
        gst: "",
        grandTotal: "",
      },
    ]);
  } finally {
    if (manageLoading) {
      setLoading(false);
    }
  }
}

  function handleLineChange(idx, field, value) {
    if (!canManageInward) {
      return;
    }

    const updated = [...lineItems];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "totalQty") updated[idx].quantity = value;

    // Auto-calculate grandTotal if needed fields are present
    if (field === "quantity" || field === "totalQty" || field === "unitPrice" || field === "gst") {
const qty = Number(updated[idx].totalQty) || 0;
const price = Number(updated[idx].unitPrice) || 0;
const gst = Number(updated[idx].gst) || 0;

const subtotal = qty * price;
const gstAmount = subtotal * gst / 100;

updated[idx].grandTotal = (subtotal + gstAmount).toFixed(2);
    }

    setLineItems(updated);
    setSaved(false);
  }

  async function handleSave() {
    if (!canManageInward) {
      return;
    }

    if (!inwardEntry) return;

    setSaving(true);
    const payload = {
      ...inwardEntry,
      line_items: lineItems.map((item) => ({
        specification: item.specification,
        invoice_number: item.invoiceNo,
        invoice_date: item.invoiceDate,
        total_quantity: Number(item.totalQty || item.quantity || 0),
        quantity: Number(item.quantity || item.totalQty || 0),
        unit_price: Number(item.unitPrice || 0),
        gst_percentage: Number(item.gst || 0),
        grand_total: Number(item.grandTotal || 0),
      })),
    };

    try {
      const updatedEntry =
        await fetchAuthenticatedJson(
          `${config.baseURL || ""}/inward/${grnId}/`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        );

      await loadInwardEntry(
        vendors,
        purchaseOrders,
        components
      );
      setLineItems(
        Array.isArray(updatedEntry.line_items) && updatedEntry.line_items.length > 0
          ? updatedEntry.line_items.map((item) => ({
              id: item.id || Date.now(),
              specification: item.specification || "",
              invoiceNo: item.invoice_number || item.invoice_no || item.invoiceNo || "",
              invoiceDate: item.invoice_date || item.invoiceDate || "",
              totalQty: item.total_quantity || item.total_qty || item.totalQty || "",
              quantity: item.quantity || "",
              unitPrice: item.unit_price || item.unitPrice || "",
              gst: item.gst_percentage || item.gst || "",
              grandTotal: item.grand_total || item.grandTotal || "",
            }))
          : [{
              id: 1,
              specification: "",
              invoiceNo: "",
              invoiceDate: "",
              totalQty: "",
              quantity: "",
              unitPrice: "",
              gst: "",
              grandTotal: "",
            }]
      );

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Error saving inward entry:", err);
      alert(err.message || "Unable to save line items.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveLocation() {
    if (!canManageInward || !inwardEntry) return;
    setSavingLocation(true);
    setLocationError("");
    try {
      const updated = await fetchAuthenticatedJson(
        `${config.baseURL || ""}/inward/${grnId}/`,
        {
          method: "PATCH",
          body: JSON.stringify({
            rack_no: locationDraft.rack_no.trim(),
            box_no: locationDraft.box_no.trim(),
          }),
        }
      );
      setInwardEntry((previous) => ({ ...previous, ...updated }));
      setLocationDraft({ rack_no: updated.rack_no || "", box_no: updated.box_no || "" });
      setEditingLocation(false);
    } catch (error) {
      setLocationError(error.message || "Unable to save storage location.");
    } finally {
      setSavingLocation(false);
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div className="text-center text-muted-foreground">Loading inward entry...</div>
      </PageShell>
    );
  }

  if (!inwardEntry) {
    return (
      <PageShell>
        <div className="text-center text-muted-foreground">Inward entry not found</div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={`Inward Entry ${formatInwCode(inwardEntry.code, inwardEntry.id || grnId)}`}
        left={
          <Link to="/inward" className="inline-flex items-center gap-2 text-primary hover:underline">
            <ArrowLeft className="size-4" /> Back to Inward
          </Link>
        }
      />

      <div className="w-full space-y-6">
        <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            MR NUMBER
          </span>
          <strong className="mt-1 block break-words text-base">
            {inwardEntry.source_mr_number || "Direct inward / no MR"}
          </strong>
        </div>

        {canSeeCosting && (
          <CostLineItems
            groups={inwardEntry.cost_details || []}
          />
        )}
        <div className="rounded-[28px] border border-border bg-card p-7 shadow-sm">
          <h2 className="text-xl font-semibold mb-5">Inward Details</h2>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {[
  { label: "Vendor", value: inwardEntry.vendorName },
  { label: "PO Number", value: inwardEntry.poNumber },
  { label: "Component", value: inwardEntry.componentName },
  { label: "Received Date", value: inwardEntry.date },
].map((item) => (
              <div key={item.label} className="rounded-3xl border border-border/80 bg-background p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{item.label}</div>
                <div className="mt-2 text-sm font-medium text-foreground">{item.value || "-"}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-border pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Storage location</h3>
                <p className="mt-1 text-xs text-muted-foreground">Optional rack and box for this inward batch.</p>
              </div>
              {canManageInward && !editingLocation && (
                <button
                  type="button"
                  onClick={() => { setLocationError(""); setEditingLocation(true); }}
                  className="rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
                >
                  Edit location
                </button>
              )}
            </div>
            {editingLocation ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {[["rack_no", "Rack No"], ["box_no", "Box No"]].map(([field, label]) => (
                    <label key={field} className="text-sm font-medium text-foreground">
                      {label} <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                      <input
                        type="text"
                        maxLength={100}
                        value={locationDraft[field]}
                        onChange={(event) => setLocationDraft((previous) => ({ ...previous, [field]: event.target.value }))}
                        className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                        placeholder={`Enter ${label.toLowerCase()}`}
                      />
                    </label>
                  ))}
                </div>
                {locationError && <p className="text-sm text-red-600" role="alert">{locationError}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={handleSaveLocation} disabled={savingLocation} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                    {savingLocation ? "Saving..." : "Save location"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLocationDraft({ rack_no: inwardEntry.rack_no || "", box_no: inwardEntry.box_no || "" });
                      setEditingLocation(false);
                      setLocationError("");
                    }}
                    disabled={savingLocation}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {[["Rack No", inwardEntry.rack_no], ["Box No", inwardEntry.box_no]].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border bg-background p-4">
                    <div className="text-xs font-medium text-muted-foreground">{label}</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{value || "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-border bg-card p-7 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">Invoice Details</h2>
              <p className="text-sm text-muted-foreground">
                {canManageInward
                  ? "Enter invoice and quantity details for this inward entry."
                  : "View invoice and quantity details for this inward entry."}
              </p>
            </div>

            {canManageInward && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Details"}
              </button>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="bg-secondary/40 text-left text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Specification</th>
                  <th className="px-4 py-3">Invoice No</th>
                  <th className="px-4 py-3">Invoice Date</th>
                  <th className="px-4 py-3 text-center">Total Qty</th>
                  {canSeeCosting && (
                    <>
                      <th className="px-4 py-3 text-right">Unit Price</th>
                      <th className="px-4 py-3 text-center">GST %</th>
                      <th className="px-4 py-3 text-right">Grand Total</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lineItems.map((item, idx) => (
                  <tr key={idx} className="transition hover:bg-secondary/20">
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={item.specification}
                        disabled={!canManageInward}
                        onChange={(e) => handleLineChange(idx, "specification", e.target.value)}
                        className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Enter specification"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={item.invoiceNo}
                        disabled={!canManageInward}
                        onChange={(e) => handleLineChange(idx, "invoiceNo", e.target.value)}
                        className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Invoice #"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={item.invoiceDate}
                        disabled={!canManageInward}
                        onChange={(e) => handleLineChange(idx, "invoiceDate", e.target.value)}
                        className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        value={item.totalQty}
                        disabled={!canManageInward}
                        onChange={(e) => handleLineChange(idx, "totalQty", e.target.value)}
                        className="mx-auto w-24 rounded-2xl border border-border bg-background px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="0"
                      />
                    </td>
                    {canSeeCosting && (
                      <>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            value={item.unitPrice}
                            disabled={!canManageInward}
                            onChange={(e) => handleLineChange(idx, "unitPrice", e.target.value)}
                            className="ml-auto w-28 rounded-2xl border border-border bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            value={item.gst}
                            disabled={!canManageInward}
                            onChange={(e) => handleLineChange(idx, "gst", e.target.value)}
                            className="mx-auto w-20 rounded-2xl border border-border bg-background px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="0"
                            min="0"
                            max="100"
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          ₹{Number(item.grandTotal || 0).toLocaleString()}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {saved && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Saved successfully!</div>}
        </div>
      </div>
    </PageShell>
  );
}
