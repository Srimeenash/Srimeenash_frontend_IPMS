import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { DataTable } from "@/components/app/DataTable";
import { PaginationControls } from "@/components/app/PaginationControls";
import config from "@/config";
import { fetchAuthenticatedJson } from "@/api";
import { useAuth } from "@/AuthContext";

const PAGE_SIZE = 50;
const TABS = [
  { id: "product", label: "Product BOM" },
  { id: "project", label: "Project BOM" },
  { id: "master", label: "Master BOM" },
];
const EDITABLE = [
  "quantity", "uom", "vendor", "unit_price", "discount", "gst_percent",
  "freight_cost", "freight_gst_percent",
];
const PRICING_FIELDS = [
  { key: "quantity", label: "Qty", step: "0.001" },
  { key: "uom", label: "UOM" },
  { key: "vendor", label: "Vendor" },
  { key: "unit_price", label: "Unit Price (₹)", step: "0.01" },
  { key: "discount", label: "Discount (₹)", step: "0.01" },
  { key: "gst_percent", label: "GST % / Amount", step: "0.01" },
  { key: "freight_cost", label: "Freight Cost (₹)", step: "0.01" },
  { key: "freight_gst_percent", label: "Freight GST % / Amount", step: "0.01" },
];
const statusLabel = (value) => ({
  PENDING_MANAGER: "Pending Manager",
  APPROVED: "Approved",
  MANAGER_REJECTED: "Sent for Modification",
  MODIFIED: "Modified",
  PROCUREMENT_PENDING: "Procurement Pending",
  INVENTORY_PENDING: "Inventory Pending",
  MANAGER_APPROVED: "Manager Approved",
})[String(value || "").toUpperCase()] || String(value || "-").replaceAll("_", " ");
const statusClass = (value) => ({
  APPROVED: "bg-green-100 text-green-800",
  MANAGER_APPROVED: "bg-green-100 text-green-800",
  MANAGER_REJECTED: "bg-orange-100 text-orange-800",
  MODIFIED: "bg-blue-100 text-blue-800",
  DELETED: "bg-red-100 text-red-800",
  EDITED: "bg-amber-100 text-amber-800",
  NEW: "bg-sky-100 text-sky-800",
})[String(value || "").toUpperCase()] || "bg-yellow-100 text-yellow-800";
const badge = (status) => (
  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>
    {statusLabel(status)}
  </span>
);
const listFrom = (value) => Array.isArray(value) ? value : value?.results || [];
const dateOf = (value) => value ? new Date(value).toLocaleDateString("en-IN") : "-";
const money = (value) => value === "" || value == null ? "" : Number(value).toFixed(2);
const pricingDraft = (row) => Object.fromEntries(
  EDITABLE.map((key) => [key, row[key] ?? ""]),
);
const hasNumber = (value) => value !== "" && value != null && Number.isFinite(Number(value));
const calculatePricing = (values) => {
  const hasBase = hasNumber(values.quantity) && hasNumber(values.unit_price);
  const base = hasBase
    ? Number(values.quantity) * Number(values.unit_price) - Number(values.discount || 0)
    : 0;
  const gst = hasBase && hasNumber(values.gst_percent)
    ? base * Number(values.gst_percent) / 100
    : null;
  const hasFreightGst = hasNumber(values.freight_cost) && hasNumber(values.freight_gst_percent);
  const freightGst = hasFreightGst
    ? Number(values.freight_cost) * Number(values.freight_gst_percent) / 100
    : null;
  return {
    gst: gst === null ? "" : money(gst),
    freightGst: freightGst === null ? "" : money(freightGst),
    total: hasBase
      ? money(base + (gst || 0) + Number(values.freight_cost || 0) + (freightGst || 0))
      : "",
  };
};

function BOMTable({ rows, columns, loading, page, setPage, count, setCount, selection }) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  return (
    <>
      <DataTable
        enableColumnTools
        columns={columns}
        rows={rows}
        loading={loading}
        page={page}
        pageSize={PAGE_SIZE}
        onFilteredRowCountChange={setCount}
        {...selection}
      />
      <PaginationControls
        page={page}
        totalCount={count}
        pageSize={PAGE_SIZE}
        hasPreviousPage={page > 1}
        hasNextPage={page < pages}
        loading={loading}
        onPrevious={() => setPage(Math.max(1, page - 1))}
        onNext={() => setPage(Math.min(pages, page + 1))}
      />
    </>
  );
}

export default function BomPage() {
  const { user, activeRole } = useAuth();
  const role = String(activeRole || user?.active_role || user?.role?.name || user?.role || "").toLowerCase();
  const canDeleteProductBOM = role !== "engineer";
  const location = useLocation();
  const [tab, setTab] = useState("product");
  const [productBoms, setProductBoms] = useState([]);
  const [projectBoms, setProjectBoms] = useState([]);
  const [masterRows, setMasterRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [filteredCount, setFilteredCount] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [rejectionPopup, setRejectionPopup] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [masterDetail, setMasterDetail] = useState(null);
  const [masterDraft, setMasterDraft] = useState({});
  const [editingMaster, setEditingMaster] = useState(false);
  const [masterError, setMasterError] = useState("");
  const masterTriggerRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const endpoint = tab === "product" ? "bom/" : tab === "project" ? "project-boms/" : "master-bom/";
    fetchAuthenticatedJson(`${config.baseURL}/bom/${endpoint}`, { cache: "no-store" })
      .then((data) => {
        if (!active) return;
        const rows = listFrom(data);
        if (tab === "product") setProductBoms(rows);
        else if (tab === "project") setProjectBoms(rows);
        else setMasterRows(rows);
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || "Could not load BOM records.");
        if (tab === "product") setProductBoms([]);
        else if (tab === "project") setProjectBoms([]);
        else setMasterRows([]);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tab, location.key]);

  useEffect(() => { setPage(1); }, [tab, search, statusFilter, categoryFilter]);
  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))));
  }, [filteredCount]);
  useEffect(() => {
    if (!masterDetail) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [masterDetail]);

  const visibleRows = useMemo(() => {
    const rows = tab === "product" ? productBoms : tab === "project" ? projectBoms : masterRows;
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab === "product" && statusFilter !== "ALL" &&
          String(row.status || "").toUpperCase() !== statusFilter) return false;
      if (tab === "master" && categoryFilter !== "ALL" && row.category !== categoryFilter) return false;
      return !q || (tab === "product"
        ? [row.bom_number, row.bom_name, row.product_name, row.version, row.created_by]
        : tab === "project"
          ? [row.project_bom_number, row.bom_name, row.product_name, row.project, row.material_request_number, row.source_bom_number]
          : [row.component_code, row.specifications, row.hsn_no, row.category, row.component_type, row.vendor, row.source_bom_numbers?.join(" ")]
      ).some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [tab, productBoms, projectBoms, masterRows, search, statusFilter, categoryFilter]);

  const serial = (_row, index) => (page - 1) * PAGE_SIZE + index + 1;
  const commonSno = { key: "sno", header: "S.No", render: serial, disableColumnTools: true, className: "text-center" };
  const productColumns = [
    commonSno,
    { key: "bom_number", header: "BOM ID", render: (row) => <Link className="font-semibold text-[#E85D75] underline" to={`/bom/${encodeURIComponent(row.bom_number)}`}>{row.bom_number}</Link> },
    { key: "bom_name", header: "BOM Name" },
    { key: "product_name", header: "Product Name" },
    { key: "version", header: "Version" },
    { key: "items", header: "Number of Components", render: (row) => Array.isArray(row.items) ? row.items.length : row.component_count || 0 },
    { key: "created_by", header: "Created By" },
    { key: "created_at", header: "Created Date", render: (row) => dateOf(row.created_at) },
    { key: "status", header: "Status", render: (row) => row.status === "MANAGER_REJECTED"
      ? <button type="button" onClick={() => setRejectionPopup(row)}>{badge(row.status)}</button>
      : badge(row.status) },
  ];
  const projectColumns = [
    commonSno,
    { key: "project_bom_number", header: "Project BOM ID", render: (row) =>
      <button type="button" className="font-semibold text-[#E85D75] underline" onClick={() => setProjectDetail(row)}>{row.project_bom_number}</button> },
    { key: "bom_name", header: "BOM Name / Type", render: (row) =>
      <button type="button" className="font-medium underline" onClick={() => setProjectDetail(row)}>{row.bom_name}</button> },
    { key: "project", header: "Project" },
    { key: "product_name", header: "Product Name" },
    { key: "version", header: "Version" },
    { key: "component_count", header: "Number of Components" },
    { key: "material_request_number", header: "Source MR" },
    { key: "source_bom_number", header: "Product BOM" },
    { key: "created_by", header: "Created By" },
    { key: "created_at", header: "Created Date", render: (row) => dateOf(row.created_at) },
  ];

  const categories = [...new Set(masterRows.map((row) => row.category).filter(Boolean))].sort();
  const openMaster = (row, trigger) => {
    masterTriggerRef.current = trigger;
    setMasterDetail(row);
    setMasterDraft(pricingDraft(row));
    setMasterError("");
    setNotice("");
    setEditingMaster(false);
  };
  const masterIsDirty = masterDetail && EDITABLE.some(
    (key) => String(masterDraft[key] ?? "") !== String(masterDetail[key] ?? ""),
  );
  const closeMaster = () => {
    if (saving) return false;
    if (editingMaster && masterIsDirty && !window.confirm("Discard unsaved pricing changes?")) return false;
    setMasterDetail(null);
    setMasterError("");
    setEditingMaster(false);
    window.requestAnimationFrame(() => masterTriggerRef.current?.focus());
    return true;
  };
  const masterColumns = [
    commonSno,
    { key: "component_code", header: "Component ID", render: (row) =>
      <button type="button" className="font-semibold text-[#E85D75] underline underline-offset-2 hover:opacity-80" onClick={(event) => openMaster(row, event.currentTarget)}>
        {row.component_code}
      </button> },
    { key: "specifications", header: "Specifications" },
    { key: "hsn_no", header: "HSN No" },
    { key: "category", header: "Category" },
    { key: "component_type", header: "Component Type" },
    { key: "line_total", header: "Line Total (₹)", render: (row) =>
      row.line_total === "" || row.line_total == null ? "—" : `₹ ${money(row.line_total)}` },
  ];

  const deleteSelected = async () => {
    if (!selectedKeys.length || !window.confirm(`Delete ${selectedKeys.length} Product BOM(s)?`)) return;
    const target = productBoms.filter((row) => selectedKeys.includes(String(row.id)));
    setSaving(true);
    setError("");
    try {
      for (const row of target) {
        await fetchAuthenticatedJson(`${config.baseURL}/bom/bom/${row.id}/`, { method: "DELETE" });
      }
      setProductBoms((previous) => previous.filter((row) => !target.some((item) => item.id === row.id)));
      setSelectedKeys([]);
      setSelecting(false);
    } catch (err) {
      setError(err?.message || "A Product BOM could not be deleted. Reload the page to review it.");
    } finally { setSaving(false); }
  };
  const saveMaster = async (event) => {
    event.preventDefault();
    if (!masterDetail) return;
    if (!masterIsDirty) { setEditingMaster(false); return; }
    for (const field of PRICING_FIELDS.filter((item) => item.step)) {
      const value = masterDraft[field.key];
      if (value !== "" && value != null && (!Number.isFinite(Number(value)) || Number(value) < 0 ||
          ((field.key === "gst_percent" || field.key === "freight_gst_percent") && Number(value) > 100))) {
        setMasterError(`${field.label} must be a valid nonnegative value${field.key.includes("percent") ? " up to 100" : ""}.`);
        return;
      }
    }
    if (masterDraft.discount !== "" && masterDraft.quantity !== "" && masterDraft.unit_price !== "" &&
        Number(masterDraft.discount) > Number(masterDraft.quantity) * Number(masterDraft.unit_price)) {
      setMasterError("Discount cannot exceed Qty × Unit Price.");
      return;
    }
    setSaving(true);
    setMasterError("");
    try {
      const values = Object.fromEntries(EDITABLE.map((key) => [
        key, masterDraft[key] === "" ? (key === "uom" || key === "vendor" ? "" : null) : masterDraft[key],
      ]));
      const saved = await fetchAuthenticatedJson(
        `${config.baseURL}/bom/master-bom/${encodeURIComponent(masterDetail.component_code)}/`,
        { method: "PATCH", body: JSON.stringify(values) },
      );
      const updated = { ...masterDetail, ...saved };
      setMasterRows((previous) => previous.map((row) => row.component_code === masterDetail.component_code ? updated : row));
      setMasterDetail(updated);
      setMasterDraft(pricingDraft(updated));
      setEditingMaster(false);
      setNotice(`${masterDetail.component_code} pricing saved.`);
    } catch (err) {
      setMasterError(err?.message || "Could not save this component. Check its pricing and try again.");
    } finally { setSaving(false); }
  };
  const masterTotals = calculatePricing(editingMaster ? masterDraft : masterDetail || {});

  return (
    <PageShell>
      <PageHeader
        title="Bill of Materials"
        subtitle="Engineered drone builds with full component breakdown."
        right={tab === "product" && <div className="flex gap-2">
          {canDeleteProductBOM && <>
            <button type="button" disabled={saving || (selecting && !selectedKeys.length)}
              className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => selecting ? deleteSelected() : (setSelectedKeys([]), setSelecting(true))}>
              {selecting ? `Delete Selected (${selectedKeys.length})` : "Delete"}
            </button>
            {selecting && <button type="button" className="rounded-lg border px-3 py-2" onClick={() => { setSelecting(false); setSelectedKeys([]); }}>Cancel</button>}
          </>}
          <Link to="/bom/new" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            <Plus className="size-4" /> Create BOM
          </Link>
        </div>}
      />

      <div role="tablist" aria-label="BOM views" className="mb-5 flex flex-wrap gap-2 border-b border-border">
        {TABS.map((item) => <button type="button" role="tab" key={item.id}
          aria-selected={tab === item.id}
          className={`rounded-t-lg px-5 py-3 text-sm font-semibold ${tab === item.id ? "border-b-2 border-primary bg-muted text-primary" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => {
            if (masterDetail && !closeMaster()) return;
            setTab(item.id); setSearch(""); setStatusFilter("ALL"); setCategoryFilter("ALL"); setError(""); setNotice("");
          }}>{item.label}</button>)}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input aria-label={`Search ${tab} BOM`} value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder={tab === "master" ? "Search components..." : "Search BOMs..."}
          className="w-64 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        {tab === "master" && <select aria-label="Filter category" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="ALL">All Categories</option>
          {categories.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>}
        {tab === "product" && <select aria-label="Filter status" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="ALL">All Status</option>
          {["PENDING_MANAGER", "APPROVED", "MANAGER_REJECTED", "MODIFIED"].map((value) =>
            <option key={value} value={value}>{statusLabel(value)}</option>)}
        </select>}
      </div>
      {tab === "master" && <p className="mb-3 text-xs text-muted-foreground">One row per component across approved Product BOMs. Select a Component ID to view and edit its pricing.</p>}
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">{notice}</p>}
      <BOMTable
        key={tab}
        rows={visibleRows}
        columns={tab === "product" ? productColumns : tab === "project" ? projectColumns : masterColumns}
        loading={loading}
        page={page}
        setPage={setPage}
        count={filteredCount}
        setCount={setFilteredCount}
        selection={tab === "product" ? {
          selectable: canDeleteProductBOM && selecting,
          selectedRowKeys: selectedKeys,
          onSelectedRowKeysChange: setSelectedKeys,
        } : {}}
      />

      {rejectionPopup && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-lg rounded-xl bg-background p-6 text-foreground shadow-xl">
          <h2 className="text-lg font-semibold">Manager Rejection Remarks</h2>
          <p className="mt-2 text-sm">{rejectionPopup.bom_number}</p>
          <p className="mt-3 rounded-lg bg-muted p-3">{rejectionPopup.manager_rejection_reason || "No rejection remarks provided."}</p>
          <button type="button" className="mt-4 rounded-lg border px-4 py-2" onClick={() => setRejectionPopup(null)}>Close</button>
        </div>
      </div>}

      {projectDetail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setProjectDetail(null); }}>
        <div role="dialog" aria-modal="true" aria-label="Project BOM details" className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-xl bg-background p-6 text-foreground shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-lg font-semibold">{projectDetail.project_bom_number} · {projectDetail.bom_name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Project: {projectDetail.project} · MR: {projectDetail.material_request_number} · Product BOM: {projectDetail.source_bom_number}</p></div>
            <button type="button" aria-label="Close Project BOM details" className="rounded-lg border px-3 py-1" onClick={() => setProjectDetail(null)}>×</button>
          </div>
          <div className="mt-4 overflow-auto rounded-lg border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-muted"><tr>{["S.No", "Component ID", "Category", "Component Type", "Specification", "Qty", "UOM", "Change", "Remarks"].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2">{label}</th>)}</tr></thead>
              <tbody>{(projectDetail.items_snapshot || []).map((item, index) =>
                <tr key={`${item.source_bom_item_id || "new"}-${index}`} className={`border-t ${item.change_type === "DELETED" ? "bg-red-50" : item.change_type === "EDITED" ? "bg-amber-50" : ""}`}>
                  <td className="px-3 py-2">{index + 1}</td><td className="px-3 py-2">{item.component_code || "-"}</td>
                  <td className="px-3 py-2">{item.category || "-"}</td>
                  <td className="px-3 py-2">{item.component_type || "-"}</td><td className="px-3 py-2">{item.specifications || "-"}</td>
                  <td className="px-3 py-2">{item.quantity}</td><td className="px-3 py-2">{item.unit || "-"}</td>
                  <td className="px-3 py-2">{badge(item.change_type)}</td><td className="px-3 py-2">{item.remarks || "-"}</td>
                </tr>)}</tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end"><button type="button" className="rounded-lg border px-4 py-2" onClick={() => setProjectDetail(null)}>Close</button></div>
        </div>
      </div>}

      {masterDetail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6"
        onMouseDown={(event) => { if (event.target === event.currentTarget) closeMaster(); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="master-pricing-title"
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeMaster(); } }}
          className="flex max-h-[92vh] w-[96vw] max-w-[1600px] flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Master BOM · Pricing details</p>
              <h2 id="master-pricing-title" className="mt-1 text-xl font-semibold">{masterDetail.specifications || "Component pricing"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Edit pricing in the component line below.</p>
            </div>
            <button type="button" autoFocus aria-label="Close component pricing" disabled={saving}
              className="rounded-lg border border-border px-3 py-1.5 text-lg leading-none hover:bg-muted disabled:opacity-50" onClick={closeMaster}>×</button>
          </div>

          <form id="master-pricing-form" onSubmit={saveMaster} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-lg font-semibold">BOM Component</h3>
                <p className="mt-1 text-xs text-muted-foreground">Scroll the line item horizontally to see all pricing fields.</p></div>
              {!editingMaster && <button type="button" className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-muted"
                onClick={() => {
                  const draft = pricingDraft(masterDetail);
                  if (hasNumber(draft.unit_price) && !hasNumber(draft.quantity)) draft.quantity = "1";
                  setMasterError(""); setMasterDraft(draft); setEditingMaster(true);
                }}>Edit pricing</button>}
            </div>
            <div role="region" aria-label="Master BOM component line item" tabIndex={0}
              className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[1400px] border-collapse text-sm">
                <thead className="bg-muted/50"><tr>
                  {["Specifications", ...PRICING_FIELDS.map((field) => field.label), "Line Total (₹)"].map((label) =>
                    <th key={label} scope="col" className="whitespace-nowrap border-b border-border px-3 py-3 text-left text-xs font-semibold uppercase">{label}</th>)}
                </tr></thead>
                <tbody><tr className="border-b border-border transition-colors hover:bg-muted/30">
                  <td className="max-w-48 px-3 py-4 break-words">{masterDetail.specifications || "—"}</td>
                  {PRICING_FIELDS.map(({ key, label, step }) => <td key={key} className="px-3 py-4 align-top">
                    {editingMaster
                      ? <input aria-label={label} type={step ? "number" : "text"} min={step ? "0" : undefined} step={step}
                          value={masterDraft[key] ?? ""} disabled={saving}
                          onChange={(event) => {
                            const value = event.target.value;
                            setMasterDraft((current) => ({
                              ...current,
                              [key]: value,
                              ...(key === "unit_price" && value !== "" && !hasNumber(current.quantity)
                                ? { quantity: "1" } : {}),
                            }));
                            setMasterError("");
                          }}
                          placeholder="—"
                          className="w-28 rounded-lg border border-border bg-background px-2.5 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50" />
                      : <span className="block min-w-20 py-2">{masterDetail[key] === "" || masterDetail[key] == null ? "—" : masterDetail[key]}</span>}
                    {key === "gst_percent" && <span className="mt-1 block whitespace-nowrap text-xs text-muted-foreground">Amount: {masterTotals.gst ? `₹ ${masterTotals.gst}` : "—"}</span>}
                    {key === "freight_gst_percent" && <span className="mt-1 block whitespace-nowrap text-xs text-muted-foreground">Amount: {masterTotals.freightGst ? `₹ ${masterTotals.freightGst}` : "—"}</span>}
                  </td>)}
                  <td className="whitespace-nowrap px-3 py-4 font-semibold">{masterTotals.total ? `₹ ${masterTotals.total}` : "—"}</td>
                </tr></tbody>
              </table>
            </div>
            {masterError && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{masterError}</p>}
          </form>

          <div className="flex justify-end gap-3 border-t border-border px-5 py-4 sm:px-7">
            {editingMaster ? <>
              <button type="button" disabled={saving} className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
                onClick={() => { setMasterDraft(pricingDraft(masterDetail)); setEditingMaster(false); setMasterError(""); }}>Cancel</button>
              <button type="submit" form="master-pricing-form" disabled={saving || !masterIsDirty}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Saving..." : "Save changes"}</button>
            </> : <button type="button" className="rounded-lg border border-border px-5 py-2 text-sm font-medium" onClick={closeMaster}>Close</button>}
          </div>
        </div>
      </div>}
    </PageShell>
  );
}
