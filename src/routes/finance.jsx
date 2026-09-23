import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";

import { PageShell, PageHeader } from "@/components/app/PageShell";
import { DataTable } from "@/components/app/DataTable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import config from "@/config";
import { DollarSign, TrendingUp, PieChart as PieChartIcon, ShieldCheck } from "lucide-react";
import { fetchAuthenticatedJson } from "@/api";
import { useAuth } from "@/AuthContext";


const FINANCE_PAGE_SIZE = 500;

const resolveFinanceApiUrl = (url) => {
  if (!url) return "";

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (typeof window !== "undefined") {
    try {
      if (url.startsWith("/")) {
        return new URL(url, window.location.origin).toString();
      }

      const configuredBase = new URL(
        config.baseURL,
        window.location.origin,
      );

      const baseHref = configuredBase.href.endsWith("/")
        ? configuredBase.href
        : `${configuredBase.href}/`;

      return new URL(url, baseHref).toString();
    } catch (_error) {
      // Fall through to the string fallback below.
    }
  }

  return url;
};

const fetchAllPaginatedResults = async (
  initialUrl,
  options = {},
) => {
  const rows = [];
  const visitedUrls = new Set();
  let nextUrl = initialUrl;

  while (nextUrl) {
    const resolvedUrl =
      resolveFinanceApiUrl(nextUrl);

    if (
      !resolvedUrl ||
      visitedUrls.has(resolvedUrl)
    ) {
      break;
    }

    visitedUrls.add(resolvedUrl);

    const payload =
      await fetchAuthenticatedJson(
        resolvedUrl,
        options,
      );

    if (!payload) {
      break;
    }

    if (Array.isArray(payload)) {
      rows.push(...payload);
      break;
    }

    const pageRows =
      Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

    rows.push(...pageRows);

    nextUrl =
      payload?.next ||
      payload?.links?.next ||
      "";
  }

  return rows;
};

function FinancePage() {
  const { user, activeRole } = useAuth();

  const currentRole = String(
    activeRole ||
      user?.active_role ||
      user?.role ||
      "",
  )
    .trim()
    .toLowerCase();

  const canDeleteFinanceRecords = [
    "finance",
    "admin",
  ].includes(currentRole);

  const [projects, setProjects] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [projectLoading, setProjectLoading] = useState(true);
  const [purchaseLoading, setPurchaseLoading] = useState(true);
  const [projectError, setProjectError] = useState(null);
  const [purchaseError, setPurchaseError] = useState(null);
  const [activeTab, setActiveTab] = useState("approvedPOs");
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailMode, setDetailMode] = useState("project");
  const [detailItem, setDetailItem] = useState(null);

  const openDetailsDialog = async (mode, item) => {
    setDetailMode(mode);

    if (mode === "po" && item) {
      // try to enrich PO item with a proper contact person from vendor records
      let vendorContact =
        item.vendor_reference ||
        item.vendor_ref ||
        item.contact_person ||
        item.vendor_contact ||
        item.vendor_phone ||
        "";

      if (!vendorContact) {
        const targetVendorName = String(
          item.vendor ||
            item.vendor_name ||
            "",
        )
          .trim()
          .toLowerCase();

        const match = vendors.find((vendor) => {
          const vendorName = String(
            vendor?.name ||
              vendor?.vendor_name ||
              "",
          )
            .trim()
            .toLowerCase();

          return (
            Boolean(targetVendorName) &&
            vendorName === targetVendorName
          );
        });

        vendorContact =
          match?.contact_person ||
          match?.contact ||
          match?.phone ||
          match?.phone_number ||
          vendorContact;
      }

      setDetailItem({ ...item, vendor_reference: vendorContact });
      setDetailDialogOpen(true);
      return;
    }

    setDetailItem(item);
    setDetailDialogOpen(true);
  };

  const closeDetailsDialog = () => {
    setDetailDialogOpen(false);
    setDetailItem(null);
  };

  const renderDetailField = (label, value) =>
    _jsxs("div", {
      className: "grid gap-1",
      children: [
        _jsx("span", {
          className: "text-[11px] uppercase tracking-[0.24em] text-muted-foreground",
          children: label,
        }),
        _jsx("span", {
          className: "text-sm font-semibold text-foreground",
          children: value || "N/A",
        }),
      ],
    });

  const renderProjectDetails = (project) => {
    if (!project) {
      return _jsx("p", {
        className: "text-sm text-muted-foreground",
        children: "No project selected.",
      });
    }

    return _jsxs("div", {
      className: "grid gap-6",
      children: [
        _jsx("div", {
          className: "grid gap-4 sm:grid-cols-2",
          children: [
            _jsx("div", {
              className: "rounded-2xl border border-border bg-background p-6 shadow-sm",
              children: _jsxs("div", {
                className: "grid gap-4",
                children: [
                  renderDetailField("Project ID", project.project_code || project.projectCode || project.id),
                  renderDetailField("Project Name", project.name || project.project_name),
                  renderDetailField("Project Type", project.project_type || project.type),
                  renderDetailField("Department", project.department),
                ],
              }),
            }),
            _jsx("div", {
              className: "rounded-2xl border border-border bg-background p-6 shadow-sm",
              children: _jsxs("div", {
                className: "grid gap-4",
                children: [
                  renderDetailField("Status", project.status),
                  renderDetailField("Budget", formatCurrency(project.budget || project.project_budget)),
                  renderDetailField("Manager", project.manager || project.manager_name || project.managerName),
                  renderDetailField("Timeline", `${project.start_date || project.startDate || "N/A"} — ${project.end_date || project.endDate || "N/A"}`),
                ],
              }),
            }),
          ],
        }),
        _jsx("div", {
          className: "rounded-2xl border border-border bg-card p-6 shadow-sm",
          children: renderDetailField("Description", project.description || project.project_description || project.summary),
        }),
      ],
    });
  };

  const renderPoDetails = (po) => {
    if (!po) {
      return _jsx("p", {
        className: "text-sm text-muted-foreground",
        children: "No purchase order selected.",
      });
    }

    const lineItemsMarkup = po.items && po.items.length
      ? _jsx("div", {
          className: "grid gap-3 rounded-xl border border-border bg-background p-4",
          children: po.items.map((item, index) =>
            _jsxs(
              "div",
              {
                className: "grid gap-1 sm:grid-cols-4",
                children: [
                  renderDetailField("Component", item.componentName || item.name || item.component_name),
                  renderDetailField("Quantity", item.quantity),
                  renderDetailField("Unit Price", formatCurrency(item.unitPrice || item.unit_price)),
                  renderDetailField("Subtotal", formatCurrency(item.subtotal || item.total_cost)),
                ],
              },
              index,
            )
          ),
        })
      : _jsx("p", {
          className: "text-sm text-muted-foreground",
          children: "No line items available.",
        });

    return _jsxs("div", {
      className: "grid gap-6",
      children: [
        _jsx("div", {
          className: "grid gap-4 sm:grid-cols-2",
          children: [
            _jsx("div", {
              className: "rounded-2xl border border-border bg-background p-6 shadow-sm",
              children: _jsxs("div", {
                className: "grid gap-4",
                children: [
                  renderDetailField("PO Number", po.po || po.po_number || po.id),
                  renderDetailField("Vendor", po.vendor),
                  renderDetailField("Quantity", po.quantity || po.qty),
                  renderDetailField("Order Total", formatCurrency(po.total || po.grand_total || po.total_cost)),
                ],
              }),
            }),
            _jsx("div", {
              className: "rounded-2xl border border-border bg-background p-6 shadow-sm",
              children: _jsxs("div", {
                className: "grid gap-4",
                children: [
                  renderDetailField("PO Date", po.poDate || po.po_date || po.date),
                  renderDetailField("Expected Delivery", po.expectedDelivery || po.expected_delivery_date || po.expected_delivery),
                  renderDetailField("Status", po.status || po.approval_status),
                  renderDetailField(
                    "Contact Person",
                    po.vendor_reference || po.vendor_ref || po.vendor_contact || po.vendor_phone || "N/A"
                  ),
                ],
              }),
            }),
          ],
        }),
        _jsxs("div", {
          className: "space-y-4",
          children: [
            _jsx("span", {
              className: "text-[11px] uppercase tracking-[0.24em] text-muted-foreground",
              children: "Line Items",
            }),
            _jsx("div", {
              className: "rounded-2xl border border-border bg-card p-4 shadow-sm",
              children: lineItemsMarkup,
            }),
          ],
        }),
      ],
    });
  };

  useEffect(() => {
    async function loadProjects() {
      setProjectLoading(true);
      setProjectError(null);
      try {
        const list =
          await fetchAllPaginatedResults(
            `${config.baseURL}/projects/projects/?page_size=${FINANCE_PAGE_SIZE}`,
            { cache: "no-store" },
          );

        setProjects(list);
      } catch (err) {
        console.error("Finance project load failed", err);
        setProjects([]);
        setProjectError(err.message || "Unable to load projects");
      } finally {
        setProjectLoading(false);
      }
    }

const normalizeOrder = (order) => {
  const status = String(order.status || order.approval_status || "").toUpperCase();
  const totalValue = Number(order.total || order.grand_total || order.total_cost || 0);

  const vendorObject = typeof order.vendor === "object" && order.vendor !== null ? order.vendor : {};
  return {
    ...order,
    id: order.id,
    po: order.po_number || order.po || order.purchase_order || order.id,
    vendor: order.vendor_name || vendorObject.name || order.vendor || "Unknown",
    quantity: order.qty || order.quantity || order.total_quantity || 0,
    total: order.total || order.grand_total || order.total_cost || totalValue,
    poDate: order.po_date || order.date || order.created_at || order.poDate || "",
    expectedDelivery:
      order.expected_delivery_date || order.expected_delivery || order.expectedDelivery || "",
    vendor_reference:
      order.vendor_reference ||
      order.vendor_ref ||
      order.contact_person ||
      order.vendor_contact ||
      order.vendor_phone ||
      vendorObject.contact_person ||
      vendorObject.vendor_reference ||
      vendorObject.vendor_ref ||
      "",
    status,
    approval_status: String(order.approval_status || "").toUpperCase(),
    items: (order.items || []).map((item) => ({
      componentName: item.component?.name || item.component_name || "Component",
      quantity: item.quantity,
      unitPrice: Number(item.unit_price || 0),
      subtotal: Number(item.total_cost || item.subtotal || 0),
    })),
  };
};

    async function loadVendors() {
      try {
        const vendorRows =
          await fetchAllPaginatedResults(
            `${config.baseURL}/vendors/?page_size=${FINANCE_PAGE_SIZE}`,
            { cache: "no-store" },
          );

        setVendors(vendorRows);
      } catch (err) {
        console.error(
          "Finance vendor load failed",
          err,
        );
        setVendors([]);
      }
    }

    async function loadPurchaseOrders() {
      setPurchaseLoading(true);
      setPurchaseError(null);

      try {
        const allOrders =
          await fetchAllPaginatedResults(
            `${config.baseURL}/procurement/purchase-orders/?page_size=${FINANCE_PAGE_SIZE}`,
            { cache: "no-store" },
          );

        const normalizedOrders =
          allOrders
            .map(normalizeOrder)
            .sort(
              (a, b) =>
                new Date(b.poDate) -
                new Date(a.poDate),
            );
        setPurchaseOrders(normalizedOrders);
      } catch (err) {
        console.error("Finance PO load failed", err);
        setPurchaseOrders([]);
        setPurchaseError(err.message || "Unable to load purchase orders");
      } finally {
        setPurchaseLoading(false);
      }
    }

    loadProjects();
    loadPurchaseOrders();
    loadVendors();
  }, []);

  useEffect(() => {
    setSelectedRowKeys([]);
    setSelectionMode(false);
  }, [activeTab]);

  const handleEnableSelectionMode = () => {
    setSelectedRowKeys([]);
    setSelectionMode(true);
  };

  const handleCancelSelectionMode = () => {
    setSelectedRowKeys([]);
    setSelectionMode(false);
  };

  const handleDeleteSelected = async () => {
    if (!canDeleteFinanceRecords) {
      alert(
        "You do not have permission to delete Finance records.",
      );
      return;
    }

    if (!selectedRowKeys.length) return;

    try {
      const rows = activeTab === "projects" ? projects : purchaseOrders;
      const deletes = rows
        .filter((row) => selectedRowKeys.includes(String(row.id)))
        .map((row) => {
          const url =
            activeTab === "projects"
              ? `${`${config.baseURL}/projects/projects/`}${row.id}/`
              : `${`${config.baseURL}/procurement/purchase-orders/`}${row.id}/`;
          return fetchAuthenticatedJson(url, { method: "DELETE" });
        });

      await Promise.all(deletes);

      if (activeTab === "projects") {
        setProjects((prev) => prev.filter((row) => !selectedRowKeys.includes(String(row.id))));
      } else {
        setPurchaseOrders((prev) => prev.filter((row) => !selectedRowKeys.includes(String(row.id))));
      }
      setSelectedRowKeys([]);
      setSelectionMode(false);
    } catch (err) {
      console.error("Failed to delete selected finance records:", err);
      alert("Unable to delete selected records. Please try again.");
    }
  };

  const approvedPurchaseOrders = purchaseOrders.filter((po) =>
  ["APPROVED", "ORDERED", "DELIVERED"].includes(
    String(po.status || po.approval_status || "").toUpperCase()
  )
);

const totalExpenditure = approvedPurchaseOrders.reduce(
  (sum, po) => sum + Number(po.total || 0),
  0
);

const approvedPOs = approvedPurchaseOrders.length;
  const totalProjectBudget = projects.reduce(
    (sum, project) => sum + Number(project.budget || project.project_budget || 0),
    0
  );
  const openProjects = projects.filter((project) =>
    ["PLANNED", "IN_PROGRESS", "ONGOING", "ACTIVE"].includes(
      String(project.status || "").toUpperCase()
    )
  ).length;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  };

  const renderStatusPill = (status) => {
    const statusClass =
      status === "PLANNED"
        ? "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700"
        : status === "IN_PROGRESS"
        ? "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700"
        : status === "COMPLETED"
        ? "bg-green-100 text-green-700 border border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-700"
        : status === "ON_HOLD"
        ? "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700"
        : status === "CANCELLED"
        ? "bg-red-100 text-red-700 border border-red-200 dark:bg-red-900 dark:text-red-200 dark:border-red-700"
        : "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700";

    return _jsx("span", {
      className: `inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] ${statusClass}`,
      children: status || "N/A",
    });
  };

  return _jsxs(PageShell, {
    children: [
      _jsx(PageHeader, {
        title: "Finance Module",
        subtitle: "Track costs, review project budgets, and monitor financial health.",
        right: _jsxs("div", {
          className: "flex items-center gap-2",
          children: [
            canDeleteFinanceRecords &&
              _jsx("button", {
                type: "button",
                onClick: selectionMode
                  ? handleDeleteSelected
                  : handleEnableSelectionMode,
                disabled:
                  selectionMode &&
                  selectedRowKeys.length === 0,
                className: "inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50",
                style: { backgroundColor: "#E85D75" },
                children: selectionMode
                  ? `Delete Selected (${selectedRowKeys.length})`
                  : "Delete",
              }),
            canDeleteFinanceRecords &&
              selectionMode &&
              _jsx("button", {
                type: "button",
                onClick: handleCancelSelectionMode,
                className: "inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary",
                children: "Cancel",
              }),
          ],
        }),
      }),
      _jsx("div", {
        className: "grid grid-cols-1 xl:grid-cols-4 gap-5 mb-6",
        children: [
          _jsxs("div", {
            className: "rounded-3xl border border-border bg-card p-6 shadow-sm",
            children: [
              _jsx("div", {
                className: "flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success",
                children: _jsx(DollarSign, { className: "size-6" }),
              }),
              _jsx("p", { className: "mt-5 text-sm text-muted-foreground", children: "Total Expenditure" }),
              _jsx("p", { className: "mt-2 text-3xl font-semibold tracking-tight text-foreground", children: formatCurrency(totalExpenditure) }),
            ],
          }),
          _jsxs("div", {
            className: "rounded-3xl border border-border bg-card p-6 shadow-sm",
            children: [
              _jsx("div", {
                className: "flex h-12 w-12 items-center justify-center rounded-2xl bg-chart-1/10 text-chart-1",
                children: _jsx(TrendingUp, { className: "size-6" }),
              }),
              _jsx("p", { className: "mt-5 text-sm text-muted-foreground", children: "Total Project Budget" }),
              _jsx("p", { className: "mt-2 text-3xl font-semibold tracking-tight text-foreground", children: formatCurrency(totalProjectBudget) }),
            ],
          }),
          _jsxs("div", {
            className: "rounded-3xl border border-border bg-card p-6 shadow-sm",
            children: [
              _jsx("div", {
                className: "flex h-12 w-12 items-center justify-center rounded-2xl bg-info/10 text-info",
                children: _jsx(PieChartIcon, { className: "size-6" }),
              }),
              _jsx("p", { className: "mt-5 text-sm text-muted-foreground", children: "Open Projects" }),
              _jsx("p", { className: "mt-2 text-3xl font-semibold tracking-tight text-foreground", children: openProjects }),
            ],
          }),
          _jsxs("div", {
            className: "rounded-3xl border border-border bg-card p-6 shadow-sm",
            children: [
              _jsx("div", {
                className: "flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary",
                children: _jsx(ShieldCheck, { className: "size-6" }),
              }),
              _jsx("p", { className: "mt-5 text-sm text-muted-foreground", children: "Approved POs" }),
              _jsx("p", { className: "mt-2 text-3xl font-semibold tracking-tight text-foreground", children: approvedPOs }),
            ],
          }),
        ],
      }),
      _jsxs("div", {
        className: "grid grid-cols-1 gap-6",
        children: [
          _jsxs("section", {
            className: "rounded-3xl border border-border bg-card p-6 shadow-sm",
            children: [
              _jsxs("div", {
                className: "mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
                children: [
                  _jsxs("div", {
                    children: [
                      _jsx("p", {
                        className: "text-sm font-semibold text-foreground",
                        children: "Finance Workbench",
                      }),
                      _jsx("p", {
                        className: "text-sm text-muted-foreground max-w-2xl",
                        children: "Switch between approved purchase orders and project budget details.",
                      }),
                    ],
                  }),
                  _jsxs("div", {
                    className: "inline-flex flex-wrap items-center gap-2 rounded-full border border-border bg-muted/10 p-1",
                    children: [
                      _jsx("button", {
                        type: "button",
                        onClick: () => setActiveTab("projects"),
                        className: `rounded-full px-4 py-2 text-sm font-medium transition ${
                          activeTab === "projects"
                            ? "bg-primary text-card"
                            : "text-muted-foreground hover:bg-secondary/10"
                        }`,
                        children: `Projects (${projects.length})`,
                      }),
                      _jsx("button", {
                        type: "button",
                        onClick: () => setActiveTab("approvedPOs"),
                        className: `rounded-full px-4 py-2 text-sm font-medium transition ${
                          activeTab === "approvedPOs"
                            ? "bg-primary text-card"
                            : "text-muted-foreground hover:bg-secondary/10"
                        }`,
                        children: `Approved POs (${approvedPOs})`,
                      }),
                    ],
                  }),
                ],
              }),
              activeTab === "projects"
                ? projectError
                  ? _jsx("div", {
                      className: "rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive",
                      children: `Unable to load projects: ${projectError}`,
                    })
                  : _jsx(DataTable, {
                      className: "overflow-hidden",
                      columns: [
{
  key: "sno",
  header: "S.No",
  className: "w-[5rem] text-center",
  disableColumnTools: true,
  render: (_row, index) => index + 1,
},
{
  key: "project_code",
  header: "Project ID",
  className: "w-[10rem] text-center",
  render: (r) => {
    return _jsx(
      "button",
      {
        type: "button",
        onClick: () => openDetailsDialog("project", r),
        className: "font-semibold text-[15px] text-[#E85D75] underline",
        children: r.project_code || r.projectCode || r.id || "N/A",
      },
    );
  },
},
                        { key: "name", header: "Project Name", className: "w-[18rem] text-center font-medium" },
                        { key: "project_type", header: "Project Type", className: "w-[12rem] text-center" },
                        { key: "department", header: "Department", className: "w-[12rem] text-center" },
                        { key: "status", header: "Status", className: "w-[11rem] text-center" },
                        {
                          key: "budget",
                          header: "Budget",
                          className: "text-center w-[10rem]",
                          render: (row) => formatCurrency(row.budget),
                        },
                      ],
                      selectable: selectionMode,
                      selectedRowKeys: selectedRowKeys,
                      onSelectedRowKeysChange: setSelectedRowKeys,
                      rows: projects,
                      loading: projectLoading,
                    })
                : _jsx(DataTable, {
                    className: "overflow-hidden",
                      columns: [
{
  key: "sno",
  header: "S.No",
  className: "w-[5rem] text-center",
  disableColumnTools: true,
  render: (_row, index) => index + 1,
},
{
  key: "po",
  header: "PO Number",
  className: "w-[10rem] text-center",
  render: (r) =>
    _jsx("button", {
      type: "button",
      onClick: () => openDetailsDialog("po", r),
      className: "font-semibold text-[15px] text-[#E85D75] underline",
      children: r.po || r.id || "N/A",
    }),
},
                      { key: "vendor", header: "Vendor", className: "text-center font-medium" },
                      { key: "quantity", header: "Quantity", className: "text-center" , render: (r)=> r.quantity},
                      {
                        key: "total",
                        header: "Order Total",
                        className: "text-center",
                        render: (r) => formatCurrency(r.total),
                      },
                      { key: "poDate", header: "PO Date", className: "text-center" },
                      { key: "expectedDelivery", header: "Expected Delivery", className: "text-center" },
                      {
                        key: "status",
                        header: "Status",
                        className: "text-center",
                        render: (row) => renderStatusPill(row.status),
                      },
                    ],
                    rows: approvedPurchaseOrders,
                    loading: purchaseLoading,
                    selectable: selectionMode,
                    selectedRowKeys: selectedRowKeys,
                    onSelectedRowKeysChange: setSelectedRowKeys,
                  }),
            ],
          }),
        ],
      }),
      _jsx(Dialog, {
        open: detailDialogOpen,
        onOpenChange: setDetailDialogOpen,
        children: _jsxs(DialogContent, {
          className: "max-w-4xl",
          children: [
            _jsxs(DialogHeader, {
              children: [
                _jsx(DialogTitle, {
                  children:
                    detailMode === "project" ? "Project Details" : "Purchase Order Details",
                }),
                _jsx(DialogDescription, {
                  children:
                    detailMode === "project"
                      ? "View complete project information, status, and budget data in one polished overlay."
                      : "View purchase order details, delivery dates, and line item breakdown in a clean modal."
                }),
              ],
            }),
            detailMode === "project" ? renderProjectDetails(detailItem) : renderPoDetails(detailItem),
            _jsx(DialogFooter, {
              children: _jsx("button", {
                type: "button",
                onClick: closeDetailsDialog,
                className: "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90",
                children: "Close",
              }),
            }),
          ],
        }),
      }),
    ],
  });
}

export default FinancePage;