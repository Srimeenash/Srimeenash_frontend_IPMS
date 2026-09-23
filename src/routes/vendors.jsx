import { useEffect, useState } from "react";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { DataTable, StatusBadge } from "@/components/app/DataTable";
import { PaginationControls } from "@/components/app/PaginationControls";
import { Loader2, Plus, Star } from "lucide-react";
import config from "@/config";
import { Link, useNavigate } from "react-router-dom";
import { fetchJson, fetchAuthenticatedJson } from "@/api";
import { useAuth } from "@/AuthContext";
import { canWork } from "@/permissions";

const VENDORS_PAGE_SIZE = 50;

function VendorsPage() {
  const { user } = useAuth();

  // Existing Sidebar/routes decide who can SEE Vendors.
  // Only Admin + Procurement can CHANGE Vendor data.
  const canManageVendor =
    canWork(user, "vendor");

  const [vendors, setVendors] = useState([]);
  const [page, setPage] = useState(1);
  const [displayedVendorCount, setDisplayedVendorCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    product: "",
    product_version: "",
    contact_person: "",
    phone: "",
    gst_number: "",
    terms_and_conditions: "",
    additional_notes: "",
    is_active: true,
  });
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [statusConfirmState, setStatusConfirmState] = useState(null);
  const [componentModalVendor, setComponentModalVendor] = useState(null);

  const handleDeleteMode = () => {
    if (!canManageVendor) {
      return;
    }

    setSelectedRowKeys([]);
    setSelectionMode(true);
  };

  const openComponentModal = (vendor) => {
    setComponentModalVendor(vendor);
  };

  const closeComponentModal = () => {
    setComponentModalVendor(null);
  };

  const handleCancelDeleteMode = () => {
    setSelectedRowKeys([]);
    setSelectionMode(false);
  };

const normalizeVendor = (vendor) => ({
  ...vendor,

  products: vendor.products ?? [],

  component_count:
    vendor.products?.length ?? 0,

  component_names:
    vendor.products?.length > 0
      ? vendor.products
          .map((p) => p.product)
          .join(", ")
      : "-",

  product_version:
    vendor.products?.length > 0
      ? vendor.products
          .map((p) => p.product_version)
          .join(", ")
      : "-",

  gst_number: vendor.gst_number ?? "",
  pan_number: vendor.pan_number ?? "",

  contact_person:
    vendor.contact_person ?? "",

  phone_number:
    vendor.phone_number ??
    vendor.phone ??
    "",

  email: vendor.email ?? "",

  address: vendor.address ?? "",
  city: vendor.city ?? "",
  state: vendor.state ?? "",
  state_code: vendor.state_code ?? "",
  pincode: vendor.pincode ?? "",

  terms_and_conditions:
    vendor.terms_and_conditions ?? "",

  additional_notes:
    vendor.additional_notes ?? "",
});

  const sortVendorsById = (vendorList) =>
    [...vendorList].sort((a, b) => Number(a.id) - Number(b.id));

  async function loadVendors() {
    try {
      setLoading(true);
      setLoadError("");
      setError("");

      const params = new URLSearchParams({
        page_size: "5000",
      });

      const res = await fetch(`/api/vendors/?${params.toString()}`);

      if (!res.ok) {
        throw new Error("Failed to load vendors.");
      }

      const data = await res.json();
      const rows = Array.isArray(data)
        ? data
        : data.results ?? [];

      const merged = rows.map(normalizeVendor);
      setVendors(sortVendorsById(merged));
    } catch (err) {
      console.error(err);
      setVendors([]);
      setDisplayedVendorCount(0);
      setLoadError(
        err?.message ||
          "Unable to load Vendors. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVendors();
  }, []);

  const vendorPageCount = Math.max(
    1,
    Math.ceil(displayedVendorCount / VENDORS_PAGE_SIZE),
  );

  useEffect(() => {
    setPage((currentPage) =>
      Math.min(currentPage, vendorPageCount),
    );
  }, [vendorPageCount]);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!canManageVendor) {
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        name: formData.name,
        product: formData.product,
        product_version: formData.product_version,
        contact_person: formData.contact_person,
        phone: formData.phone,
        gst_number: formData.gst_number,
        terms_and_conditions: formData.terms_and_conditions,
        additional_notes: formData.additional_notes,
        is_active: formData.is_active,
      };

      const localVendor = {
        id: Date.now(),
        product_name: formData.product,
        ...payload,
      };

      let res = await fetch("/api/vendors/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      // If backend rejects due to unique name, retry once with a small suffix to allow creation
      if (!res.ok) {
        let errorData = null;
        try {
          errorData = await res.json();
        } catch (e) {
          errorData = null;
        }

        const textErr = JSON.stringify(errorData || {}) || "";
        const nameConflict = /name|unique|already/i.test(textErr);

        if (nameConflict) {
          // append short timestamp suffix and retry once
          payload.name = `${payload.name} - ${Date.now().toString().slice(-5)}`;
          res = await fetch("/api/vendors/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
      }

      if (!res.ok) {
        let errorData = null;
        try {
          errorData = await res.json();
        } catch (e) {
          errorData = null;
        }
        console.error("Vendor save failed:", errorData || res.statusText);
        throw new Error((errorData && (errorData.detail || JSON.stringify(errorData))) || res.statusText || "Failed to save vendor.");
      }

      const createdVendor = await res.json();
      const normalizedVendor = normalizeVendor({
        ...localVendor,
        id: createdVendor.id ?? localVendor.id,
        ...createdVendor,
      });

      setVendors((prev) => sortVendorsById([normalizedVendor, ...prev]));
      setFormData({
        name: "",
        product: "",
        product_version: "",
        contact_person: "",
        phone: "",
        gst_number: "",
        terms_and_conditions: "",
        additional_notes: "",
        is_active: true,
      });

      setShowForm(false);
    } catch (err) {
      console.error(err);
      setError(err.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function saveVendorStatus(vendorId, isActive) {
    // TODO: Send PUT request to API to update vendor status
    // PUT /api/vendors/{vendorId}/ with { is_active: isActive }
  }

  function handleToggleStatus(vendor) {
    if (!canManageVendor) {
      return;
    }

    const nextStatus = vendor.is_active ? "Inactive" : "Active";
    setStatusConfirmState({ vendor, nextStatus });
  }

  function confirmToggleStatus() {
    if (!canManageVendor) {
      return;
    }

    if (!statusConfirmState) return;

    const { vendor } = statusConfirmState;
    setVendors((prev) =>
      prev.map((item) =>
        item.id === vendor.id ? { ...item, is_active: !vendor.is_active } : item,
      ),
    );
    saveVendorStatus(vendor.id, !vendor.is_active);
    setStatusConfirmState(null);
  }

  function cancelToggleStatus() {
    setStatusConfirmState(null);
  }

  const handleDeleteSelected = async () => {
    if (!canManageVendor) {
      return;
    }

    if (!selectedRowKeys.length) return;

    try {
      // Hard delete flow without confirmation dialogs or alerts: delete dependent inward entries first, then vendor
      const inwardData = await fetchAuthenticatedJson(`${config.baseURL}/inward/`);
      const inwardList = Array.isArray(inwardData) ? inwardData : inwardData.results || [];

      const failedDeletes = [];

      for (const id of selectedRowKeys) {
        const dependents = inwardList.filter((entry) => String(entry.vendor) === String(id) || (entry.vendor && String(entry.vendor.id) === String(id)));

        await Promise.all(
          dependents.map(async (d) => {
            try {
              await fetchAuthenticatedJson(`${config.baseURL}/inward/${d.id}/`, { method: "DELETE" });
              console.log("Deleted inward entry", d.id);
            } catch (e) {
              console.error("Failed to delete inward entry", d.id, e.message || e);
              failedDeletes.push({ type: "inward", id: d.id, error: e.message || String(e) });
            }
          }),
        );

        try {
          await fetchAuthenticatedJson(`${`${config.baseURL}/vendors/`}${id}/`, { method: "DELETE" });
          console.log("Deleted vendor", id);
        } catch (e) {
          console.error("Failed to delete vendor", id, e.message || e);
          failedDeletes.push({ type: "vendor", id, error: e.message || String(e) });
        }
      }

      if (failedDeletes.length > 0) {
        console.warn(`Some deletes failed:\n${failedDeletes.map((f) => `${f.type} ${f.id}: ${f.error}`).join("\n")}`);
      }
    } catch (err) {
      console.error("Failed to permanently delete selected vendors:", err);
    }

    setSelectedRowKeys([]);
    setSelectionMode(false);
    await loadVendors();
  };

  return (
    <PageShell>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers powering your procurement pipeline."
        right={
          canManageVendor ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectionMode ? handleDeleteSelected : handleDeleteMode}
                disabled={selectionMode && selectedRowKeys.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#d94a65] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: "#E85D75" }}
              >
                {selectionMode ? `Delete Selected (${selectedRowKeys.length})` : "Delete"}
              </button>

              {selectionMode && (
                <button
                  type="button"
                  onClick={handleCancelDeleteMode}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                >
                  Cancel
                </button>
              )}

              <button
                type="button"
                onClick={() => navigate("/vendors/new")}
                className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90"
              >
                <Plus className="size-4" />
                Add Vendor
              </button>
            </div>
          ) : null
        }
      />

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {canManageVendor && statusConfirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground">Confirm status change</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Change vendor "{statusConfirmState.vendor.name}" status to <strong>{statusConfirmState.nextStatus}</strong>?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={cancelToggleStatus} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">Cancel</button>
              <button type="button" onClick={confirmToggleStatus} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Confirm</button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg overflow-hidden bg-card p-4">
      <DataTable
          enableColumnTools
selectable={canManageVendor && selectionMode}
        selectedRowKeys={selectedRowKeys}
        onSelectedRowKeysChange={setSelectedRowKeys}
        selectionKey="id"
        columns={[
{
  key: "sno",
  header: "S.No",
  headerClassName: "text-center",
  className: "w-[5rem] text-center",
  disableColumnTools: true,
  render: (_row, index) =>
    (page - 1) * VENDORS_PAGE_SIZE +
    index +
    1,
},
{
  key: "vendor_id",
  header: "Vendor ID",
  headerClassName: "text-center",
  className: "text-center font-mono text-[15px] ",
  render: (row) => row.vendor_id || "-",
},
{
  key: "name",
  header: "Company Name",
  render: (r) => {
    const displayName = String(r.name || "").replace(/\s*-\s*\d+$/g, "");

    return (
      <Link
        to={`/vendors/${r.id}`}
        className="font-semibold text-[15px] underline"
        style={{ color: "#E85D75" }}
      >
        {displayName}
      </Link>
    );
  },
},

          {
            key: "component_count",
            header: "Components",
            render: (r) => (
              <button
                type="button"
                onClick={() => openComponentModal(r)}
                className="font-semibold text-primary underline"
                title={r.component_names}
              >
                {r.component_count}
              </button>
            ),
          },
        { key: "gst_number", header: "GSTIN" },
        { key: "phone_number", header: "Phone Number" },
        { key: "email", header: "Email" },
        {
          key: "address",
          header: "Address",
          render: (r) => (
            <div className="max-w-xs truncate" title={r.address}>
              {r.address || "-"}
            </div>
          ),
        },
       
          {
            key: "is_active",
            header: "Status",
            render: (r) =>
              canManageVendor ? (
                <button
                  type="button"
                  onClick={() => handleToggleStatus(r)}
                  className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-sm font-medium transition hover:bg-secondary"
                >
                  <StatusBadge status={r.is_active ? "Active" : "Inactive"} />
                </button>
              ) : (
                <span className="inline-flex items-center">
                  <StatusBadge status={r.is_active ? "Active" : "Inactive"} />
                </span>
              ),
          },
        ]}
        rows={vendors}
        page={page}
        pageSize={VENDORS_PAGE_SIZE}
        onFilteredRowCountChange={setDisplayedVendorCount}
        loading={loading}
        hideEmptyState={Boolean(loadError)}
      />

      {!loading && loadError && (
        <div className="flex min-h-[140px] w-full items-center justify-center border-t border-rose-200 bg-rose-50 px-6 py-8 text-center text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {loadError}
        </div>
      )}

      <PaginationControls
        page={page}
        totalCount={displayedVendorCount}
        pageSize={VENDORS_PAGE_SIZE}
        hasNextPage={page < vendorPageCount}
        hasPreviousPage={page > 1}
        loading={loading}
        onPrevious={() =>
          setPage((currentPage) =>
            Math.max(1, currentPage - 1),
          )
        }
        onNext={() =>
          setPage((currentPage) =>
            Math.min(vendorPageCount, currentPage + 1),
          )
        }
      />
      </div>

      {componentModalVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">Components for {componentModalVendor.name}</h2>
                <p className="text-sm text-muted-foreground">Showing {componentModalVendor.component_count} component{componentModalVendor.component_count === 1 ? "" : "s"}.</p>
              </div>
              <button
                type="button"
                onClick={closeComponentModal}
                className="rounded-full border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary"
              >
                Close
              </button>
            </div>
            <div className="overflow-x-auto p-6">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="px-4 py-3 text-center">S.No</th>
                    <th className="px-4 py-3">Component</th>
                    <th className="px-4 py-3">Version</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">GST %</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {componentModalVendor.products?.length > 0 ? (
                    componentModalVendor.products.map((product, index) => {
                      const unitPrice = Number(product.unit_price ?? product.price ?? 0);
                      const qty = Number(product.quantity ?? 0);
                      const gst = Number(product.gst ?? 0);
                      const total = qty * unitPrice * (1 + gst / 100);
                      return (
                        <tr key={index} className="border-b border-border last:border-none hover:bg-secondary/20">
                          <td className="px-4 py-3 text-center">{index + 1}</td>
                          <td className="px-4 py-3">{product.product || "-"}</td>
                          <td className="px-4 py-3">{product.product_version || "-"}</td>
                          <td className="px-4 py-3 text-right">{qty}</td>
                          <td className="px-4 py-3 text-right">₹{unitPrice.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right">{gst}%</td>
                          <td className="px-4 py-3 text-right">₹{total.toFixed(2)}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                        No component details available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

export default VendorsPage;
