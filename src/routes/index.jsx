import React, { useState, useEffect } from "react";
import { useAuth } from "@/AuthContext";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import {
  Box,
  Bell,
  DollarSign,
  ClipboardList,
  Users,
  ArrowUpRight,
  AlertTriangle,
  Boxes,
  Plane,
  Trash2,
  ShoppingCart,
  Plus,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import config from "@/config"; // ✅ your API endpoints
import { fetchAuthenticatedJson } from "@/api";

const HIDDEN_PURCHASE_ORDER_IDS_STORAGE_KEY =
  "dream-to-life-hidden-purchase-order-ids";

function getHiddenPurchaseOrderIds() {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(
      HIDDEN_PURCHASE_ORDER_IDS_STORAGE_KEY,
    );

    const values = stored
      ? JSON.parse(stored)
      : [];

    return Array.isArray(values)
      ? values.map(String).filter(Boolean)
      : [];
  } catch (error) {
    console.warn(
      "Unable to read hidden Purchase Order IDs:",
      error,
    );
    return [];
  }
}

function filterVisiblePurchaseOrders(orders) {
  const hiddenIds = new Set(
    getHiddenPurchaseOrderIds(),
  );

  return (Array.isArray(orders) ? orders : []).filter(
    (order) => {
      const id = String(
        order?.id ??
          order?.purchase_order_id ??
          "",
      );

      return !id || !hiddenIds.has(id);
    },
  );
}


const KPI_CONFIG = [
  { icon: "dollar", tone: "success", label: "Expenditure" },
  { icon: "box", tone: "violet", label: "Inventory Value" },
  { icon: "clipboard", tone: "info", label: "Active Projects" },
  { icon: "bell", tone: "warning", label: "Low Stock Alerts" },
];

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function normalizeLowStockItem(item) {
  if (!item || typeof item !== "object") return null;
  const component_name =
    item.component_name || item.name || item.component || item.item_name || "Component";
  const stock = Number(
    item.stock ?? item.quantity ?? item.current_stock ?? item.qty ?? item.stock_quantity ?? item.quantity_available ?? 0,
  );
  if (Number.isNaN(stock)) return null;
  const id = item.id ?? item.component_id ?? item.component ?? component_name;
  return {
    id,
    component_name,
    stock,
    source: item.source || "computed",
  };
}

function mergeLowStockItems(...lists) {
  const merged = new Map();

  lists.flatMap((list) => (Array.isArray(list) ? list : [])).forEach((item) => {
    const normalized = normalizeLowStockItem(item);
    if (!normalized) return;
    const key = String((normalized.component_name || normalized.id || "").toLowerCase());
    if (!merged.has(key)) {
      merged.set(key, normalized);
    }
  });

  return Array.from(merged.values()).sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
}

const iconMap = {
  box: Box,
  dollar: DollarSign,
  clipboard: ClipboardList,
  bell: Bell,
  alert: AlertTriangle,
  users: Users,
  boxes: Boxes,
  plane: Plane,
  trash: Trash2,
  cart: ShoppingCart,
};
const toneMap = {
  info: { bg: "bg-info/10", fg: "text-info" },
  success: { bg: "bg-success/10", fg: "text-success" },
  warning: { bg: "bg-warning/15 dark:bg-warning/30", fg: "text-warning" },
  violet: { bg: "bg-chart-5/10", fg: "text-chart-5" },
};
const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--info)",
];

export default function Dashboard() {
  const { user } = useAuth();
  const [userName, setUserName] = useState("User");
  const [userRole, setUserRole] = useState("Employee");
  const [componentsList, setComponentsList] = useState([]);
  const [kpis, setKpis] = useState([]);
  const [procurementSeries, setProcurementSeries] = useState([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [backendLowStock, setBackendLowStock] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [showLowStockPopup, setShowLowStockPopup] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newLowStock, setNewLowStock] = useState({
    component_name: "",
    quantity: "",
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const wrapperRef = React.useRef(null);

  const INVENTORY_REMOVED_KEYS_STORAGE_KEY = "dream-to-life-inventory-removed-keys";
  const INVENTORY_ISSUED_KEYS_STORAGE_KEY = "dream-to-life-inventory-issued-keys";

  const computeInventoryValue = async () => {
    try {
      let totalValue = 0;

      // Load removed inventory keys from localStorage
      let removedKeys = [];
      try {
        const stored = localStorage.getItem("dream-to-life-inventory-removed-keys");
        removedKeys = stored ? JSON.parse(stored) : [];
      } catch (e) {
        removedKeys = [];
      }
      const removedSet = new Set(removedKeys.map(String));

      // Add up inventory/inventory/ items
      try {
        const url = `${config.baseURL}/inventory/inventory/?page_size=500`;
        const data = await fetchAuthenticatedJson(url).catch(() => null);
        const list = Array.isArray(data) ? data : data?.results || [];

        const value = list.reduce((sum, item) => {
          // Skip if this item was removed locally
          const itemId = String(item.id || item.inventory_code || item.code || "");
          if (itemId && removedSet.has(itemId)) return sum;

          const qty = Number(item.quantity ?? item.qty ?? item.quantity_received ?? 1) || 1;
          const total = Number(item.total_price ?? item.totalPrice ?? 0);
          const unit = Number(item.price ?? item.unit_price ?? 0);
          if (total > 0) return sum + total;
          return sum + qty * unit;
        }, 0);

        totalValue += value || 0;
      } catch (e) {
        // ignore inventory endpoint errors
      }

      // Add up QC passed rows from inward entries
      try {
        const inwardUrl = `${config.baseURL}/inward/?page_size=500`;
        const inwardData = await fetchAuthenticatedJson(inwardUrl).catch(() => null);
        const inwardList = Array.isArray(inwardData) ? inwardData : inwardData?.results || [];

        const inwardValue = inwardList.reduce((sum, entry) => {
          const passedRows = Array.isArray(entry.passedRows)
            ? entry.passedRows
            : Array.isArray(entry.qc_passed_rows)
              ? entry.qc_passed_rows
              : [];

          if (!passedRows.length) return sum;

          // Filter out removed QC rows by serial number
          const activeRows = passedRows.filter((row) => {
            const serial = String(row?.serialNumber || row?.serial_number || "");
            if (!serial) return true;
            return !removedSet.has(`serial-${serial}`) && !removedSet.has(serial);
          });

          if (!activeRows.length) return sum;

          const lineItems = Array.isArray(entry.line_items) ? entry.line_items : [];
          let grandTotal = 0;
          if (lineItems.length > 0) {
            grandTotal = lineItems.reduce((s, li) => s + (Number(li.grand_total ?? li.grandTotal ?? li.total ?? 0) || 0), 0);
          } else {
            grandTotal = Number(entry.grand_total ?? entry.grandTotal ?? entry.total_price ?? 0) || 0;
          }

          const qtyReceived = Number(entry.quantity_received || entry.quantity || 0) || 0;
          if (!qtyReceived || !grandTotal) return sum;

          const perUnit = grandTotal / qtyReceived;
          return sum + perUnit * activeRows.length;
        }, 0);

        totalValue += inwardValue || 0;
      } catch (e) {
        // ignore inward endpoint errors
      }

      return totalValue;
    } catch (e) {
      return 0;
    }
  };

  const handleStorageChange = async (ev) => {
    if (!ev) return;
    const isStorageEvent = ev?.type === "storage" && (ev.key === INVENTORY_REMOVED_KEYS_STORAGE_KEY || ev.key === INVENTORY_ISSUED_KEYS_STORAGE_KEY);
    const isCustomEvent = ev?.type === "inventory:changed";
    if (!isStorageEvent && !isCustomEvent) return;

    try {
      const value = await computeInventoryValue();
      setKpis((prev) => prev.map((kp) => (kp.label === "Inventory Value" ? { ...kp, value: formatCurrency(value) } : kp)));
    } catch (e) {
      // ignore
    }
  };

  const fetchManualLowStock = async () => {
    try {
      const raw = await fetchAuthenticatedJson(`${config.baseURL}/dashboard/manual-low-stock/`);
      const list = Array.isArray(raw) ? raw : raw?.results || [];
      const normalizedList = list.map((item) => normalizeLowStockItem({ ...item, source: "backend" })).filter(Boolean);
      setBackendLowStock(normalizedList);
      return normalizedList;
    } catch (err) {
      console.error("Unable to load manual low stock items", err);
      return [];
    }
  };

  const handleSaveLowStock = async () => {
    const componentName = newLowStock.component_name?.trim();
    const quantity = Number(newLowStock.quantity);

    if (!componentName || Number.isNaN(quantity) || quantity < 0) {
      return;
    }

    try {
      await fetchAuthenticatedJson(`${config.baseURL}/dashboard/manual-low-stock/`, {
        method: "POST",
        body: JSON.stringify({ component_name: componentName, quantity }),
      });

      await fetchManualLowStock();

      setNewLowStock({ component_name: "", quantity: "" });
      setShowDropdown(false);
      setShowLowStockPopup(false);
    } catch (error) {
      console.error("Unable to save low stock item", error);
      alert("Could not save low stock item. Please try again.");
    }
  };

  async function handleDeleteLowStock(item) {
    if (!item) return;

    if (item.source !== "backend") {
      return;
    }

    try {
      await fetchAuthenticatedJson(`${config.baseURL}/dashboard/manual-low-stock/${encodeURIComponent(item.id)}/`, {
        method: "DELETE",
      });
      await fetchManualLowStock();
    } catch (error) {
      console.error("Unable to delete low stock item", error);
      alert("Could not delete low stock item. Please try again.");
    }
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) return;

    setUserName(
      user.employee_name || user.full_name || user.username || user.name || user.email || "User",
    );
    setUserRole(
      user.role || user.designation || user.user_type || user.group || user.type || "Employee",
    );
  }, [user]);

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      setLoadError(null);

      const normalizeResponse = (data) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.results)) return data.results;
        return [];
      };

      try {
        const [purchaseResult, projectResult, componentResult] = await Promise.allSettled([
          fetchAuthenticatedJson(`${config.baseURL}/procurement/purchase-orders/`).catch((error) => {
            console.warn("Purchase orders unavailable:", error);
            return null;
          }),
          fetchAuthenticatedJson(`${config.baseURL}/projects/projects/`).catch((error) => {
            console.warn("Projects unavailable:", error);
            return null;
          }),
          fetchAuthenticatedJson(`${config.baseURL}/components/components/`).catch((error) => {
            console.warn("Components unavailable:", error);
            return null;
          }),
        ]);

        const backendOrders = normalizeResponse(
          purchaseResult.status === "fulfilled"
            ? purchaseResult.value
            : null,
        );

        /*
         * Use only POs that are still visible in the Purchase Orders page.
         * If the backend still returns an old/soft-deleted PO, its ID is
         * filtered here before any dashboard total is calculated.
         */
        const orders =
          filterVisiblePurchaseOrders(
            backendOrders,
          );
        const projects = normalizeResponse(
          projectResult.status === "fulfilled" ? projectResult.value : null,
        );
        const components = normalizeResponse(
          componentResult.status === "fulfilled" ? componentResult.value : null,
        );

        const backendLowStockItems = await fetchManualLowStock();

        setComponentsList(
          components.map((item) => ({
            id: item.id,
            name: item.name || item.component_name,
          })),
        );
        const totalSpend = orders.reduce(
          (sum, order) => sum + Number(order.total || order.amount || 0),
          0,
        );

        const inventoryValue = components.reduce((sum, item) => {
          const qty = Number(item.stock_quantity || item.quantity || 0);
          const unitPrice = Number(item.unit_price || item.price || 0);
          return sum + qty * unitPrice;
        }, 0);

        // If components endpoint doesn't provide inventory value, fallback to inward totals
        let fallbackInventoryValue = inventoryValue;
        if (!fallbackInventoryValue) {
          try {
            const inwardData = await fetchAuthenticatedJson(
              `${config.baseURL}/inward/`,
            );
            const inwardList = Array.isArray(inwardData) ? inwardData : inwardData?.results || [];

            const inwardValue = inwardList.reduce((sum, entry) => {
              const lineItems = Array.isArray(entry.line_items)
                ? entry.line_items
                : Array.isArray(entry.lineItems)
                  ? entry.lineItems
                  : [];
              let grandTotal = 0;
              if (lineItems.length > 0) {
                grandTotal = lineItems.reduce((s, li) => {
                  return s + (Number(li.grand_total ?? li.grandTotal ?? li.total ?? 0) || 0);
                }, 0);
              } else {
                grandTotal =
                  Number((entry.grand_total ?? entry.grandTotal ?? entry.total_price) || 0) || 0;
              }

              const qtyReceived = Number(entry.quantity_received || entry.quantity || 0) || 0;
              const passed = Array.isArray(entry.passedRows)
                ? entry.passedRows
                : Array.isArray(entry.qc_passed_rows)
                  ? entry.qc_passed_rows
                  : [];
              const passedCount = passed.length > 0 ? passed.length : qtyReceived;
              if (!qtyReceived || !grandTotal) return sum;
              const perUnit = grandTotal / qtyReceived;
              return sum + perUnit * passedCount;
            }, 0);

            fallbackInventoryValue = inwardValue;
          } catch (e) {
            // ignore fallback errors
          }
        }

        const activeProjectCount = projects.filter((project) =>
          ["PLANNED", "IN_PROGRESS", "ONGOING", "ACTIVE"].includes(
            String(project.status || "").toUpperCase(),
          ),
        ).length;

        const lowStockAlertCount = backendLowStockItems.length;
        const lowStockItems = backendLowStockItems.slice(0, 4);

        const spendByMonth = orders.reduce((acc, order) => {
          const date = new Date(order.po_date || order.date || order.created_at);
          if (!date || Number.isNaN(date.getTime())) return acc;
          const key = `${date.getFullYear()}-${date.getMonth()}`;
          acc[key] = (acc[key] || 0) + Number(order.total || order.amount || 0);
          return acc;
        }, {});

        const series = Array.from({ length: 8 }, (_, index) => {
          const date = new Date();
          date.setMonth(date.getMonth() - (7 - index));
          const key = `${date.getFullYear()}-${date.getMonth()}`;
          return {
            month: date.toLocaleString("default", { month: "short" }),
            cost: spendByMonth[key] || 0,
          };
        });

        const categoryMap = components.reduce((acc, item) => {
          const category = item.category || item.component_category || "Misc";
          acc[category] = (acc[category] || 0) + 1;
          return acc;
        }, {});

        setKpis([
          {
            icon: "dollar",
            tone: "success",
            label: "Expenditure",
            value: formatCurrency(totalSpend),
            delta: "",
          },
          {
            icon: "box",
            tone: "violet",
            label: "Inventory Value",
            value: formatCurrency(fallbackInventoryValue),
            delta: "",
          },
          {
            icon: "clipboard",
            tone: "info",
            label: "Active Projects",
            value: String(activeProjectCount),
            delta: "",
          },
          {
            icon: "alert",
            tone: "warning",
            label: "Low Stock Alerts",
            value: String(lowStockAlertCount),
            delta: "",
          },
        ]);

        // Update KPI using live inventory endpoint totals when available
        try {
          const liveValue = await computeInventoryValue();
          setKpis((prev) => prev.map((kp) => (kp.label === "Inventory Value" ? { ...kp, value: formatCurrency(liveValue) } : kp)));
        } catch (e) {
          // ignore
        }

        setProcurementSeries(series);
        setCategoryBreakdown(Object.entries(categoryMap).map(([name, value]) => ({ name, value })));

        setRecentActivity(
          orders
            .sort(
              (a, b) =>
                new Date(b.po_date || b.date || b.created_at) -
                new Date(a.po_date || a.date || a.created_at),
            )
            .slice(0, 4)
            .map((order) => ({
              id: order.id || order.po_number,
              // Keep status only in the badge on the right.
              // Do not repeat it inside the Recent Activity title.
              title: `PO ${order.po_number || order.id}`,
              description: `${order.vendor_name || order.vendor || "Vendor"} • ${
                order.total || order.amount
                  ? formatCurrency(order.total || order.amount)
                  : "No amount"
              }`,
              status: String(order.status || "Pending").toUpperCase(),
            })),
        );
      } catch (err) {
        console.error("Dashboard load failed", err);
        setLoadError(err?.message || "Unable to load dashboard data.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();

    // Listen to storage and custom inventory events so KPI updates when inventory is modified elsewhere in the app
    window.addEventListener(
      "storage",
      handleStorageChange,
    );
    window.addEventListener(
      "inventory:changed",
      handleStorageChange,
    );

    const handleProcurementChanged = () => {
      void loadDashboardData();
    };

    window.addEventListener(
      "procurement:changed",
      handleProcurementChanged,
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorageChange,
      );
      window.removeEventListener(
        "inventory:changed",
        handleStorageChange,
      );
      window.removeEventListener(
        "procurement:changed",
        handleProcurementChanged,
      );
    };
  }, []);

  useEffect(() => {
    const mergedLowStock = mergeLowStockItems(backendLowStock);
    setLowStock(mergedLowStock.slice(0, 4));
    setKpis((prev) =>
      prev.map((kp) =>
        kp.label === "Low Stock Alerts"
          ? { ...kp, value: String(mergedLowStock.length) }
          : kp,
      ),
    );
  }, [backendLowStock]);

  return (
    <PageShell>
      <PageHeader
        title={`Welcome back, ${userName}!`}
        subtitle={`Role: ${userRole} • Here's what's happening with your system today.`}
        right={
          <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80 flex items-center gap-2">
            {new Date().toLocaleDateString()}
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-2">
        {kpis.map((k) => {
          const Icon = iconMap[k.icon] || Box;
          const tone = toneMap[k.tone] || toneMap.info;
          return (
            <div
              key={k.label}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-4">
                <div className={cn("size-12 rounded-xl flex items-center justify-center", tone.bg)}>
                  <Icon className={cn("size-6", tone.fg)} />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground">{k.label}</div>
                  <div className="mt-1 text-2xl font-bold tracking-tight">{k.value}</div>
                  {k.delta && (
                    <div className="mt-2 text-xs flex items-center gap-1 text-success font-medium">
                      <ArrowUpRight className="size-3" /> {k.delta}
                      <span className="text-muted-foreground font-normal">from last month</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Procurement + Inventory */}
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Procurement Chart */}
        <div className="xl:col-span-2 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Monthly Procurement Cost</h3>
              <p className="text-xs text-muted-foreground">Spend trend across the last 8 months</p>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" /> Cost
              </span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={procurementSeries}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v / 1000}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="var(--chart-1)"
                  strokeWidth={2.5}
                  fill="url(#g1)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Inventory Pie */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-1">Inventory by Category</h3>
          <p className="text-xs text-muted-foreground mb-4">Component distribution</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryBreakdown}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {categoryBreakdown.map((_, i) => (
                    <Cell key={i} fill={chartColors[i % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity + Low Stock */}
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Recent Activity */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-1">Recent Activity</h3>
          <p className="text-xs text-muted-foreground mb-4">Latest material requests and updates</p>

          <div className="space-y-3">
            {recentActivity.length > 0 ? (
              recentActivity.map((item, index) => (
                <div
                  key={item.id || index}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div>
<div className="font-semibold text-[15px] text-foreground">
  {item.title ||
    item.name ||
    item.request_name ||
    `Request #${item.id}`}
</div>
<div className="text-xs text-muted-foreground">
  {item.description || item.created_at}
</div>
                  </div>

<span
  className={cn(
    "inline-flex min-w-[110px] justify-center rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wider shadow-sm",
    item.status === "DRAFT"
      ? "border-gray-500 bg-gray-100 text-gray-700 dark:border-gray-400 dark:bg-gray-500/20 dark:text-gray-300"
      : item.status === "PENDING"
      ? "border-amber-500 bg-amber-100 text-amber-700 dark:border-amber-400 dark:bg-amber-500/20 dark:text-amber-300"
      : item.status === "APPROVED"
      ? "border-blue-500 bg-blue-100 text-blue-700 dark:border-blue-400 dark:bg-blue-500/20 dark:text-blue-300"
      : item.status === "ORDERED"
      ? "border-purple-500 bg-purple-100 text-purple-700 dark:border-purple-400 dark:bg-purple-500/20 dark:text-purple-300"
      : item.status === "DELIVERED"
      ? "border-green-500 bg-green-100 text-green-700 dark:border-green-400 dark:bg-green-500/20 dark:text-green-300"
      : item.status === "REJECTED"
      ? "border-red-500 bg-red-100 text-red-700 dark:border-red-400 dark:bg-red-500/20 dark:text-red-300"
      : "border-gray-400 bg-gray-100 text-gray-700 dark:border-gray-500 dark:bg-gray-500/20 dark:text-gray-300"
  )}
>
  {item.status || "PENDING"}
</span>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No recent activity found.</div>
            )}
          </div>
        </div>

        {/* Low Stock Components */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-warning" />
              <h3 className="font-semibold">Low Stock Components</h3>
            </div>

            <button
              onClick={() => {
                setNewLowStock({ component_name: "", quantity: "" });
                setShowLowStockPopup(true);
              }}
              className="rounded-md bg-primary p-2 text-white hover:bg-primary/90"
              type="button"
            >
              <Plus size={16} />
            </button>
          </div>

          <p className="text-xs text-muted-foreground mb-4">Components nearing reorder level</p>

          <div className="space-y-3">
            {lowStock.length > 0 ? (
              lowStock.map((item, index) => (
                <div
                  key={item.id || index}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div>
                    <div className="font-medium">
                      {item.component_name || item.name || `Component ${index + 1}`}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Current Stock: {item.stock ?? item.quantity ?? item.current_stock ?? 0}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-warning px-3 py-1 text-xs font-semibold text-white border border-warning/70 shadow-sm dark:bg-warning dark:text-white dark:border-warning/70">
                      Low Stock
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteLowStock(item)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Delete ${item.component_name || item.name || `low stock item ${index + 1}`}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No low stock items found.</div>
            )}
          </div>
        </div>
      </div>

      {showLowStockPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Add Low Stock Component</h2>
                <p className="text-sm text-muted-foreground">
                  Select a component and enter the available quantity.
                </p>
              </div>

              <button
                onClick={() => setShowLowStockPopup(false)}
                className="rounded-full p-2 hover:bg-muted/50"
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Component</label>

                <input
                  type="text"
                  placeholder="Search Component..."
                  value={newLowStock.component_name}
                  onFocus={() => setShowDropdown(true)}
                  onChange={(e) => {
                    setNewLowStock({
                      ...newLowStock,
                      component_name: e.target.value,
                    });
                    setShowDropdown(true);
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />

                {showDropdown && (
                  <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-border bg-card shadow-sm">
                    {componentsList
                      .filter((item) =>
                        item.name?.toLowerCase().includes(newLowStock.component_name.toLowerCase()),
                      )
                      .map((item) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            setNewLowStock({
                              ...newLowStock,
                              component_name: item.name,
                            });
                            setShowDropdown(false);
                          }}
                          className="cursor-pointer border-b border-border px-3 py-2 hover:bg-muted/50"
                        >
                          {item.name}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Quantity</label>

                <input
                  type="number"
                  min="0"
                  placeholder="Enter Quantity"
                  value={newLowStock.quantity}
                  onChange={(e) =>
                    setNewLowStock({
                      ...newLowStock,
                      quantity: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t px-6 py-4">
              <button
                onClick={() => setShowLowStockPopup(false)}
                className="rounded-lg border px-5 py-2 font-medium hover:bg-gray-100"
                type="button"
              >
                Cancel
              </button>

<button
  className="rounded-lg px-5 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
  style={{ backgroundColor: "#E85D75" }}
  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#D94A65")}
  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#E85D75")}
  type="button"
  onClick={handleSaveLowStock}
  disabled={
    !newLowStock.component_name.trim() ||
    !newLowStock.quantity ||
    Number(newLowStock.quantity) < 0
  }
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