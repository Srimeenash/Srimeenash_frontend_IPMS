import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import {
  CalendarDays,
  CircleDollarSign,
  FileText,
  Package,
  ReceiptText,
  Store,
} from "lucide-react";

import {
  PageHeader,
  PageShell,
} from "@/components/app/PageShell";
import config from "@/config";
import API from "@/api";
import { getAccessToken } from "@/authStore";
import { useAuth } from "@/AuthContext";
import { canViewCosting, getUserRole } from "@/permissions";

const unwrapComponent = (item = {}) =>
  item.component_details ||
  item.component_data ||
  item.component_obj ||
  (typeof item.component === "object"
    ? item.component
    : null) ||
  {};

const getComponentName = (item = {}) => {
  const component = unwrapComponent(item);

  const code =
    item.component_code ||
    item.componentCode ||
    component.component_id ||
    component.component_code ||
    component.code ||
    "";

  const name =
    item.component_name ||
    item.componentName ||
    item.name ||
    component.name ||
    component.component_name ||
    "";

  if (code && name) {
    return `${code} — ${name}`;
  }

  return (
    name ||
    code ||
    item.component ||
    item.component_id ||
    "Unknown component"
  );
};

const getComponentHsn = (item = {}, componentList = []) => {
  const component = unwrapComponent(item);
  const references = [
    item.component,
    item.component_id,
    item.componentId,
    item.component_code,
    item.componentCode,
    component.id,
    component.component_id,
    component.code,
  ].filter((value) => value !== undefined && value !== null);
  const masterComponent = componentList.find((entry) =>
    [entry.id, entry.component_id, entry.component_code, entry.code]
      .some((value) => references.some((reference) => String(value) === String(reference))),
  );

  return (
    item.hsn_numbers ||
    item.hsn_no ||
    item.hsn ||
    component.hsn_numbers ||
    component.hsn_no ||
    component.hsn ||
    masterComponent?.hsn_numbers ||
    masterComponent?.hsn_no ||
    masterComponent?.hsn ||
    "-"
  );
};

const getQuantity = (item = {}) =>
  Number(
    item.quantity ??
      item.qty ??
      item.ordered_quantity ??
      0,
  ) || 0;

const getUnitPrice = (item = {}) =>
  Number(
    item.unit_price ??
      item.unitPrice ??
      item.price ??
      item.rate ??
      0,
  ) || 0;

const getGst = (item = {}) =>
  Number(
    item.gst_percentage ??
      item.gst ??
      item.tax ??
      item.tax_percentage ??
      0,
  ) || 0;

const getUom = (item = {}) =>
  String(item.uom ?? item.unit ?? "").trim();


const getDiscount = (item = {}) =>
  Number(item.discount ?? 0) || 0;

const getFreightCost = (item = {}) =>
  Number(item.freight_cost ?? 0) || 0;

const getFreightGst = (item = {}) =>
  Number(item.freight_gst_percentage ?? 0) || 0;

const getTaxableAmount = (item = {}) =>
  Math.max(
    getQuantity(item) * getUnitPrice(item) -
      getDiscount(item),
    0,
  );

const getGstAmount = (item = {}) =>
  Number(
    item.gst_amount ??
      (getTaxableAmount(item) * getGst(item)) / 100
  ) || 0;

const getFreightGstAmount = (item = {}) =>
  Number(
    item.freight_gst_amount ??
      (getFreightCost(item) * getFreightGst(item)) / 100
  ) || 0;

const getLineTotal = (item = {}) => {
  const apiTotal = Number(
    item.total_cost ?? item.line_total
  );

  if (Number.isFinite(apiTotal)) {
    return apiTotal;
  }

  return (
    getTaxableAmount(item) +
    getGstAmount(item) +
    getFreightCost(item) +
    getFreightGstAmount(item)
  );
};

const formatMoney = (value) =>
  Number(value || 0).toLocaleString(
    "en-IN",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  );

const formatDate = (value) => {
  if (!value) return "—";

  const text = String(value).trim();
  const direct = text.match(
    /^(\d{4})-(\d{2})-(\d{2})$/,
  );

  if (direct) {
    return `${direct[3]}/${direct[2]}/${direct[1]}`;
  }

  const date = new Date(text);

  return Number.isNaN(date.getTime())
    ? text
    : date.toLocaleDateString("en-IN");
};

const getItemExpectedDelivery = (
  item = {},
  po = {},
) =>
  item.expected_delivery_date ||
  item.expectedDeliveryDate ||
  item.expected_date ||
  item.expectedDate ||
  po.expected_delivery_date ||
  po.expected_date ||
  "";


const normalizeStatus = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const statusClass = (status) => {
  const value = normalizeStatus(status);

  if (value === "FINANCE_APPROVED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value === "FINANCE_REJECTED") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (value === "PENDING_FINANCE") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (
    value === "ORDERED" ||
    value === "DELIVERED" ||
    value === "PARTIALLY_DELIVERED"
  ) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
};

function InfoCard({
  icon: Icon,
  label,
  value,
}) {
  return (
    <div className="rounded-2xl border border-border bg-background px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Icon className="size-4" />
        </div>

        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </div>

          <div className="mt-1 break-words text-sm font-semibold text-foreground">
            {value ?? "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PurchaseOrderDetailPage() {
  const { poId } = useParams();
  const location = useLocation();
  const { user, activeRole } = useAuth();

  const canSeeCosting =
    canViewCosting(
      user,
      activeRole,
    );

  const isManagement =
    getUserRole(
      user,
      activeRole,
    ) === "management";

  const [po, setPo] = useState(null);
  const [componentList, setComponentList] = useState([]);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    const loadComponents = async () => {
      try {
        const response = await API.get(
          "/components/components/?page_size=5000",
        );

        const data = response?.data ?? [];

        if (!cancelled) {
          setComponentList(
            Array.isArray(data)
              ? data
              : data?.results || [],
          );
        }
      } catch (componentError) {
        console.error(
          "Component lookup load failed:",
          componentError,
        );

        if (!cancelled) {
          setComponentList([]);
        }
      }
    };

    void loadComponents();

    return () => {
      cancelled = true;
    };
  }, []);

  const [
    selectedItemIds,
    setSelectedItemIds,
  ] = useState([]);

  const [
    generatingPdf,
    setGeneratingPdf,
  ] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadPO = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await API.get(
          `/procurement/purchase-orders/${encodeURIComponent(
            poId,
          )}/`,
        );

        const data = response?.data ?? null;

        if (!cancelled) {
          setPo(data);
        }
      } catch (loadError) {
        console.error(
          "Purchase Order detail load failed:",
          loadError,
        );

        if (!cancelled) {
          setPo(null);
          setError(
            loadError?.response?.data?.detail ||
              loadError?.response?.data?.message ||
              loadError?.message ||
              "Unable to load Purchase Order details.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (poId) {
      void loadPO();
    } else {
      setError(
        "Purchase Order ID is missing from the route.",
      );
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [poId]);

  const items = useMemo(
    () =>
      Array.isArray(po?.items)
        ? po.items
        : Array.isArray(po?.line_items)
          ? po.line_items
          : [],
    [po],
  );

  const itemExpectedDeliveryDates =
    useMemo(
      () =>
        Array.from(
          new Set(
            items
              .map((item) =>
                String(
                  item?.expected_delivery_date ||
                    item?.expectedDeliveryDate ||
                    item?.expected_date ||
                    item?.expectedDate ||
                    ""
                ).trim()
              )
              .filter(Boolean)
          )
        ),
      [items],
    );

  const headerExpectedDelivery =
    itemExpectedDeliveryDates.length > 1
      ? "Multiple Dates"
      : formatDate(
          itemExpectedDeliveryDates[0] ||
            po?.expected_delivery_date ||
            po?.expected_date,
        );


  const selectableItemIds = useMemo(
    () =>
      items
        .map((item) =>
          item?.id ??
          item?.po_item_id ??
          item?.poItemId ??
          null
        )
        .filter(
          (value) =>
            value !== null &&
            value !== undefined &&
            value !== ""
        )
        .map(String),
    [items],
  );

  useEffect(() => {
    setSelectedItemIds((previous) =>
      previous.filter((id) =>
        selectableItemIds.includes(
          String(id)
        )
      )
    );
  }, [selectableItemIds]);

  const allItemsSelected =
    selectableItemIds.length > 0 &&
    selectableItemIds.every((id) =>
      selectedItemIds.includes(
        String(id)
      )
    );

  const toggleLineItem = (itemId) => {
    const value = String(
      itemId ?? ""
    );

    if (!value) {
      return;
    }

    setSelectedItemIds((previous) =>
      previous.includes(value)
        ? previous.filter(
            (id) => id !== value
          )
        : [...previous, value]
    );
  };

  const toggleAllLineItems = () => {
    setSelectedItemIds(
      allItemsSelected
        ? []
        : [...selectableItemIds]
    );
  };

  const generateSelectedPurchaseOrderPdf =
    async () => {
      if (
        selectedItemIds.length === 0 ||
        generatingPdf
      ) {
        return;
      }

      try {
        setGeneratingPdf(true);

        const query =
          new URLSearchParams({
            item_ids:
              selectedItemIds.join(","),
          });

        const response = await API.get(
          `/procurement/purchase-orders/${encodeURIComponent(
            poId,
          )}/pdf/?${query.toString()}`,
          {
            responseType: "blob",
          },
        );

        const pdfBlob = response?.data;

        const blobUrl =
          window.URL.createObjectURL(
            pdfBlob,
          );

        const link =
          document.createElement("a");

        const voucherNumber =
          response?.headers?.["x-po-voucher-number"] ||
          response?.headers?.["X-PO-Voucher-Number"] ||
          "";

        const safePdfNumber =
          String(
            voucherNumber ||
              poNumber ||
              `PO-${poId}`,
          )
            .replace(/\//g, "-")
            .replace(/\\/g, "-");

        link.href = blobUrl;
        link.download =
          `PO_${safePdfNumber}.pdf`;

        document.body.appendChild(
          link,
        );

        link.click();
        link.remove();

        window.URL.revokeObjectURL(
          blobUrl,
        );
      } catch (pdfError) {
        let backendMessage =
          pdfError?.response?.data?.detail ||
          pdfError?.response?.data?.message ||
          pdfError?.message ||
          "Unable to generate Purchase Order PDF.";

        const responseData =
          pdfError?.response?.data;

        if (
          responseData instanceof Blob
        ) {
          try {
            const errorText =
              await responseData.text();

            try {
              const parsed =
                JSON.parse(errorText);

              backendMessage =
                parsed?.detail ||
                parsed?.message ||
                errorText ||
                backendMessage;
            } catch {
              backendMessage =
                errorText ||
                backendMessage;
            }
          } catch {
            // Keep the best message already resolved above.
          }
        }

        console.error(
          "Purchase Order PDF generation failed:",
          backendMessage,
          pdfError,
        );

        alert(backendMessage);
      } finally {
        setGeneratingPdf(false);
      }
    };

  const basicSubtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + getQuantity(item) * getUnitPrice(item),
        0,
      ),
    [items],
  );

  const discountTotal = useMemo(
    () => items.reduce((sum, item) => sum + getDiscount(item), 0),
    [items],
  );

  const gstTotal = useMemo(
    () => items.reduce((sum, item) => sum + getGstAmount(item), 0),
    [items],
  );

  const freightTotal = useMemo(
    () => items.reduce((sum, item) => sum + getFreightCost(item), 0),
    [items],
  );

  const freightGstTotal = useMemo(
    () => items.reduce((sum, item) => sum + getFreightGstAmount(item), 0),
    [items],
  );

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + getLineTotal(item), 0),
    [items],
  );

  const roundOff = Number(po?.round_off || 0) || 0;

  const grandTotal =
    Number(
      po?.grand_total ??
        po?.total_amount ??
        po?.order_total,
    ) ||
    subtotal + roundOff;

  const poNumber =
    po?.po_number ||
    po?.po ||
    po?.purchase_order_number ||
    po?.code ||
    (po?.id
      ? `PO-${po.id}`
      : "Purchase Order");

  const mrReference =
    po?.source_mr_number ||
    po?.material_request_id ||
    po?.request_id ||
    po?.mr_number ||
    "";

  if (loading) {
    return (
      <PageShell>
        <PageHeader
          title="Purchase Order Details"
          subtitle="Loading purchase order..."
          backTo={
            location.state?.from ||
            "/purchase-orders"
          }
        />

        <div className="rounded-2xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Loading Purchase Order details...
        </div>
      </PageShell>
    );
  }

  if (!po) {
    return (
      <PageShell>
        <PageHeader
          title="Purchase Order Details"
          subtitle="Unable to open the selected Purchase Order."
          backTo={
            location.state?.from ||
            "/purchase-orders"
          }
        />

        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error ||
            "Purchase Order was not found."}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={`Purchase Order ${poNumber}`}
        subtitle="Complete Purchase Order, vendor, source MR and financial details."
        backTo={
          location.state?.from ||
          "/purchase-orders"
        }
      />

      <div className="po-detail-layout space-y-5">
        <style>{"\n.po-new-layout,.po-detail-layout{width:100%;max-width:100%;min-width:0;}\n.po-new-layout *,.po-detail-layout *{box-sizing:border-box;}\n.po-new-layout{padding:12px 0 24px;}\n.po-header-fields{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1fr);gap:24px;}\n.po-header-fields>div{min-width:0;}\n.po-header-fields input,.po-header-fields button{width:100%;min-width:0;min-height:44px;}\n.po-items{display:table;width:100%;max-width:100%;min-width:0;table-layout:fixed;border-collapse:collapse;font-size:12px;}\n.po-items thead{display:table-header-group;background:#f8fafc;color:#475569;}\n.po-items tbody{display:table-row-group;}\n.po-items tr{display:table-row;border-bottom:1px solid #e2e8f0;}\n.po-items tbody tr:last-child{border-bottom:0;}\n.po-items th,.po-items td{display:table-cell;min-width:0;padding:14px 7px;vertical-align:top;white-space:normal;overflow-wrap:anywhere;}\n.po-items th{font-size:10px;line-height:1.5;font-weight:600;letter-spacing:.025em;text-transform:uppercase;vertical-align:middle;}\n.po-items td{line-height:1.5;}\n.po-items td::before,.po-items th::after{content:none;}\n.po-items tbody tr:hover{background:#f8fafc;}\n.po-items td input:not([type=checkbox]){width:100%;min-width:0;height:38px;padding:7px 5px;border:1px solid #dbe3ee;border-radius:6px;background:#fff;color:#0f172a;font-size:12px;}\n.po-items input:focus{outline:2px solid #f6c0cd;outline-offset:1px;}\n.po-items input[type=number]{appearance:textfield;-moz-appearance:textfield;}\n.po-items input::-webkit-inner-spin-button,.po-items input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}\n.po-items input[type=checkbox]{width:16px;height:16px;}\n.po-new-items th:nth-child(1){width:26%;}\n.po-new-items th:nth-child(2),.po-new-items th:nth-child(3){width:6%;}\n.po-new-items th:nth-child(4){width:10%;}\n.po-new-items th:nth-child(5),.po-new-items th:nth-child(6){width:9%;}\n.po-new-items th:nth-child(7),.po-new-items th:nth-child(8){width:10%;}\n.po-new-items th:nth-child(9){width:9%;}\n.po-new-items th:nth-child(10){width:5%;}\n.po-new-items td:nth-last-child(2){font-weight:700;color:#0f172a;padding-top:23px;}\n.po-new-items td:last-child button{font-size:11px;margin-top:9px;}\n.po-detail-items th:nth-child(1){width:3%;}\n.po-detail-items th:nth-child(2){width:23%;}\n.po-detail-items th:nth-child(3){width:10%;}\n.po-detail-items th:nth-child(4),.po-detail-items th:nth-child(5){width:5%;}\n.po-detail-items th:nth-child(6){width:9%;}\n.po-detail-items th:nth-child(7){width:8%;}\n.po-detail-items th:nth-child(8),.po-detail-items th:nth-child(9),.po-detail-items th:nth-child(10){width:9%;}\n.po-detail-items th:nth-child(11){width:10%;}\n.po-detail-items td:nth-child(2){font-weight:600;line-height:1.65;}\n.po-detail-items td:last-child{font-weight:700;}\n.po-detail-items td span{max-width:100%;white-space:normal;}\n.po-detail-layout section,.po-detail-layout section>div{min-width:0;overflow-wrap:anywhere;}\n.po-component-search{position:relative;width:100%;min-width:0;}\n.po-component-search:focus-within{z-index:60;}\n.po-component-options{position:absolute;top:44px;left:0;width:min(440px,calc(100vw - 72px));min-width:100%;z-index:100;max-height:260px;overflow-y:auto;padding:6px;background:#fff;color:#0f172a;border:1px solid #dbe3ee;border-radius:8px;box-shadow:0 10px 24px rgba(15,23,42,.16);}\n.po-component-options button{display:block;width:100%;height:auto;min-height:38px;padding:10px;text-align:left;white-space:normal;overflow-wrap:anywhere;font-size:13px;line-height:1.5;border:0;border-radius:5px;background:#fff;color:#0f172a;cursor:pointer;}\n.po-component-options button:hover,.po-component-options button[aria-selected=true]{background:#fff1f4;color:#9f1239;}\n.po-component-value{margin-top:7px;white-space:normal;overflow-wrap:anywhere;font-size:11px;line-height:1.6;color:#475569;}\n.dark .po-items thead,.dark .po-items tbody tr:hover{background:#1e293b;color:#cbd5e1;}\n.dark .po-items tr{border-color:#334155;}\n.dark .po-items td input:not([type=checkbox]),.dark .po-component-options,.dark .po-component-options button{background:#0f172a;color:#f1f5f9;border-color:#334155;}\n.dark .po-component-options button:hover,.dark .po-component-options button[aria-selected=true]{background:#334155;}\n.dark .po-component-value{color:#cbd5e1;}\n.dark .po-new-items td:nth-last-child(2){color:#f1f5f9;}\n@media(max-width:900px){.po-header-fields{grid-template-columns:repeat(2,minmax(0,1fr));}.po-header-fields>div:first-child{grid-column:1/-1;}.po-items th,.po-items td{padding:10px 4px;}.po-items,.po-items td input:not([type=checkbox]){font-size:11px;}.po-items th{font-size:9px;}}\n@media(max-width:520px){.po-header-fields{grid-template-columns:minmax(0,1fr);gap:16px;}.po-items th,.po-items td{padding:8px 2px;}.po-items td input:not([type=checkbox]){padding:5px 2px;}}\n"}</style>
        <style>{`\n          .po-detail-items:has(th:first-child input[type="checkbox"]) th:nth-child(1){width:3%;}\n          .po-detail-items:has(th:first-child input[type="checkbox"]) th:nth-child(2){width:20%;}\n          .po-detail-items:has(th:first-child input[type="checkbox"]) th:nth-child(3){width:7%;}\n          .po-detail-items:has(th:first-child input[type="checkbox"]) th:nth-child(4){width:8%;}\n          .po-detail-items:has(th:first-child input[type="checkbox"]) th:nth-child(5){width:5%;}\n          .po-detail-items:has(th:first-child input[type="checkbox"]) th:nth-child(6){width:6%;}\n          .po-detail-items:has(th:first-child input[type="checkbox"]) th:nth-child(7){width:8%;}\n          .po-detail-items:has(th:first-child input[type="checkbox"]) th:nth-child(8){width:7%;}\n          .po-detail-items:has(th:first-child input[type="checkbox"]) th:nth-child(9){width:8%;}\n          .po-detail-items:has(th:first-child input[type="checkbox"]) th:nth-child(10){width:7%;}\n          .po-detail-items:has(th:first-child input[type="checkbox"]) th:nth-child(11){width:9%;}\n          .po-detail-items:has(th:first-child input[type="checkbox"]) th:nth-child(12){width:12%;}\n          .po-detail-items:has(th:first-child input[type="checkbox"]) td[data-label="Line Total"]{white-space:nowrap;}\n        `}</style>
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  Purchase Order
                </div>

                <h1 className="mt-1 text-2xl font-bold tracking-tight">
                  {poNumber}
                </h1>


              </div>

              <span
                className={`inline-flex w-fit rounded-full border px-4 py-2 text-xs font-semibold ${statusClass(
                  po.approval_status ||
                    po.status,
                )}`}
              >
                {normalizeStatus(
                  po.approval_status ||
                    po.status ||
                    "PENDING",
                ).replaceAll("_", " ")}
              </span>
            </div>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCard
              icon={Store}
              label="Vendor"
              value={
                po.vendor_name ||
                po.vendor?.name ||
                po.vendor ||
                "—"
              }
            />

            <InfoCard
              icon={FileText}
              label="MR ID"
              value={
                mrReference ||
                "Direct PO"
              }
            />

            <InfoCard
              icon={CalendarDays}
              label="PO Date"
              value={formatDate(
                po.po_date ||
                  po.date,
              )}
            />

            <InfoCard
              icon={CalendarDays}
              label="Expected Delivery"
              value={
                headerExpectedDelivery
              }
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Package className="size-4" />
              </div>

              <div>
                <h2 className="text-lg font-semibold">
                  Line Items
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isManagement
                    ? "View Purchase Order components and approved costing."
                    : "Select one or more components, then generate one Purchase Order PDF."}
                </p>
              </div>
            </div>

            {!isManagement && (
              <button
                type="button"
                onClick={() =>
                  void generateSelectedPurchaseOrderPdf()
                }
                disabled={
                  selectedItemIds.length === 0 ||
                  generatingPdf
                }
                className="inline-flex min-w-[150px] items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generatingPdf
                  ? "Generating..."
                  : `Generate PO${
                      selectedItemIds.length
                        ? ` (${selectedItemIds.length})`
                        : ""
                    }`}
              </button>
            )}
          </div>

          <div className="rounded-xl border border-border">
            <table className="po-items po-detail-items text-sm">
              <thead className="bg-secondary/60 text-muted-foreground">
                <tr>
                  {!isManagement && (
                    <th className="w-[56px] px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={
                          allItemsSelected
                        }
                        onChange={
                          toggleAllLineItems
                        }
                        disabled={
                          selectableItemIds.length ===
                          0
                        }
                        className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Select all Purchase Order line items"
                      />
                    </th>
                  )}

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Component</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">HSN No</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Expected Delivery</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Qty</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">UOM</th>
                  {canSeeCosting && (
                    <>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Unit Price</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Discount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">GST % / Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Freight Cost</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Freight GST % / Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ minWidth: "96px", whiteSpace: "nowrap" }}>Line Total</th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {items.length > 0 ? (
                  items.map(
                    (item, index) => (
                      <tr
                        key={
                          item.id ||
                          index
                        }
                        className="hover:bg-secondary/30"
                      >
                        {!isManagement && (
                          <td data-label="Select component" className="px-4 py-3 text-center">
                            {(() => {
                              const itemId =
                                item?.id ??
                                item?.po_item_id ??
                                item?.poItemId ??
                                null;

                              const selectable =
                                itemId !== null &&
                                itemId !== undefined &&
                                itemId !== "";

                              return (
                                <input
                                  type="checkbox"
                                  checked={
                                    selectable &&
                                    selectedItemIds.includes(
                                      String(
                                        itemId
                                      )
                                    )
                                  }
                                  onChange={() =>
                                    toggleLineItem(
                                      itemId
                                    )
                                  }
                                  disabled={
                                    !selectable
                                  }
                                  className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                                  aria-label={`Select ${getComponentName(
                                    item,
                                  )}`}
                                />
                              );
                            })()}
                          </td>
                        )}

                        <td data-label="Component" className="px-4 py-3 font-medium">
                          {getComponentName(item)}
                        </td>

                        <td data-label="HSN No" className="px-4 py-3 text-center">
                          {getComponentHsn(item, componentList)}
                        </td>

                        <td data-label="Expected Delivery" className="px-4 py-3 text-center">
                          <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                            {formatDate(
                              getItemExpectedDelivery(
                                item,
                                po,
                              ),
                            )}
                          </span>
                        </td>

                        <td data-label="Qty" className="px-4 py-3 text-center font-semibold">
                          {getQuantity(item)}
                        </td>

                        <td data-label="UOM" className="px-4 py-3 text-center">
                          {getUom(item) || "—"}
                        </td>

                        {canSeeCosting && (
                          <>
                            <td data-label="Unit Price" className="px-4 py-3 text-right">
                              ₹{formatMoney(getUnitPrice(item))}
                            </td>

                            <td data-label="Discount" className="px-4 py-3 text-right">
                              ₹{formatMoney(getDiscount(item))}
                            </td>

                            <td data-label="GST % / Amount" className="px-4 py-3 text-center">
                              <div>{getGst(item).toFixed(2)}%</div>
                              <div className="text-[11px] text-muted-foreground">
                                ₹{formatMoney(getGstAmount(item))}
                              </div>
                            </td>

                            <td data-label="Freight Cost" className="px-4 py-3 text-right">
                              ₹{formatMoney(getFreightCost(item))}
                            </td>

                            <td data-label="Freight GST % / Amount" className="px-4 py-3 text-center">
                              <div>{getFreightGst(item).toFixed(2)}%</div>
                              <div className="text-[11px] text-muted-foreground">
                                ₹{formatMoney(getFreightGstAmount(item))}
                              </div>
                            </td>

                            <td data-label="Line Total" className="px-4 py-3 text-right font-semibold" style={{ minWidth: "96px", whiteSpace: "nowrap" }}>
                              ₹{formatMoney(getLineTotal(item))}
                            </td>
                          </>
                        )}
                      </tr>
                    ),
                  )
                ) : (
                  <tr>
                    <td
                      colSpan={(isManagement ? 4 : 5) + (canSeeCosting ? 6 : 0)}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No Purchase Order line items found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {canSeeCosting && (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard icon={ReceiptText} label="Basic Amount" value={`₹${formatMoney(basicSubtotal)}`} />
            <InfoCard icon={CircleDollarSign} label="Discount" value={`₹${formatMoney(discountTotal)}`} />
            <InfoCard icon={CircleDollarSign} label="GST Total" value={`₹${formatMoney(gstTotal)}`} />
            <InfoCard icon={CircleDollarSign} label="Freight Cost" value={`₹${formatMoney(freightTotal)}`} />
            <InfoCard icon={CircleDollarSign} label="Freight GST" value={`₹${formatMoney(freightGstTotal)}`} />
            <InfoCard icon={ReceiptText} label="Subtotal" value={`₹${formatMoney(subtotal)}`} />
            <InfoCard icon={ReceiptText} label="Round-Off" value={`₹${formatMoney(roundOff)}`} />

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700">
                  <CircleDollarSign className="size-4" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    Grand Total
                  </div>
                  <div className="mt-1 text-xl font-bold text-emerald-950">
                    ₹{formatMoney(grandTotal)}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}