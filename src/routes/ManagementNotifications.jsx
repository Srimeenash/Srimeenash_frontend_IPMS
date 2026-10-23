import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { PageHeader, PageShell } from "@/components/app/PageShell";
import { fetchAuthenticatedJson } from "@/api";
import config from "@/config";
import { useAuth } from "@/AuthContext";

// Management Sales view. The backend remains the authority for approval and
// inventory movements; the local updates below only keep its UI responsive.
const PAGE_SIZE = 200;
const HIDDEN_KEY = "management-sales-removed-requests-v2";
const normalize = (value) => String(value ?? "").trim().toUpperCase();
const asRows = (data) => Array.isArray(data)
  ? data
  : Array.isArray(data?.results) ? data.results
    : Array.isArray(data?.items) ? data.items : Array.isArray(data?.data) ? data.data : [];

async function fetchPages(path) {
  const values = [];
  const visited = new Set();
  let url = path;
  while (url && !visited.has(url)) {
    visited.add(url);
    const response = await fetchAuthenticatedJson(url, { cache: "no-store" });
    values.push(...asRows(response));
    if (Array.isArray(response)) break;
    url = response?.next || response?.links?.next || "";
  }
  return values;
}

const salesRef = (row = {}) => {
  const linked = row.material_request;
  return String(
    row.material_request_number || row.materialRequestNumber ||
    (linked && typeof linked === "object" ?
      (linked.material_request_id || linked.id) : linked) ||
    row.materialRequest || row.id || "",
  ).trim();
};
const componentName = (row = {}) =>
  row.component_name || row.componentName || row.product_name ||
  row.productName || row.component || "Component";
const invoiceRef = (row = {}) => String(
  row.invoice_number || row.invoiceNumber || row.invoice_no || "NO-INVOICE",
).trim().toUpperCase();
const displayStatus = (value) => {
  const status = normalize(value);
  if (["APPROVED", "MANAGEMENT_APPROVED", "SOLD"].includes(status)) return "Approved";
  if (["MANAGEMENT_REJECTED", "REJECTED"].includes(status)) return "Rejected";
  if (status === "PENDING_MANAGEMENT") return "Pending Management";
  return status ? status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Pending Management";
};
const isApproved = (status) => ["APPROVED", "MANAGEMENT_APPROVED", "SOLD"].includes(normalize(status));
const isRejected = (status) => ["MANAGEMENT_REJECTED", "REJECTED"].includes(normalize(status));

export default function ManagementNotifications() {
  const { user, activeRole } = useAuth();
  const role = String(activeRole || user?.active_role || user?.role?.name || user?.role || "")
    .trim().toLowerCase();
  const [notifications, setNotifications] = useState([]);
  const [salesRows, setSalesRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [processingId, setProcessingId] = useState("");
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [localDecisions, setLocalDecisions] = useState({});
  const [removedKeys, setRemovedKeys] = useState(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) || "[]");
      return Array.isArray(stored) ? stored.map(String) : [];
    } catch (_) { return []; }
  });
  const actionLock = useRef(false);

  const loadData = useCallback(async ({ showLoader = true } = {}) => {
    if (showLoader) setLoading(true);
    try {
      const [n, s] = await Promise.all([
        fetchPages(`${config.baseURL}/notifications/?receiver=MANAGEMENT&category=SALES&page_size=${PAGE_SIZE}`),
        fetchPages(`${config.baseURL}/outward/?outward_type=SALES&page_size=${PAGE_SIZE}`),
      ]);
      setNotifications(n.filter((row) => normalize(row?.receiver) === "MANAGEMENT" &&
        normalize(row?.category) === "SALES"));
      setSalesRows(s.filter((row) => normalize(row?.outward_type || row?.type) === "SALES"));
      setLoadError("");
    } catch (error) {
      // Preserve the previous successful list; do not erase a confirmed local
      // decision just because a background refresh failed.
      setLoadError(error?.message || "Unable to load Management Sales notifications.");
      console.error("Management Sales load failed:", error);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let timer;
    void loadData();
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void loadData({ showLoader: false }); }, 150);
    };
    window.addEventListener("notificationsUpdated", refresh);
    window.addEventListener("salesUpdated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("notificationsUpdated", refresh);
      window.removeEventListener("salesUpdated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [loadData]);

  const displayedItems = useMemo(() => {
    const bySale = new Map();
    for (const row of salesRows) {
      const reference = salesRef(row);
      const invoice = invoiceRef(row);
      const key = `${reference.toUpperCase()}|${invoice}`;
      const current = bySale.get(key) || { key, reference, rows: [] };
      current.rows.push(row);
      bySale.set(key, current);
    }
    const found = [];
    for (const group of bySale.values()) {
      if (removedKeys.includes(group.key)) continue;
      const related = notifications.find((n) => group.rows.some((row) =>
        String(n?.reference_id ?? n?.referenceId ?? "") === String(row.id)));
      const firstRow = group.rows[0];
      const localStatus = group.rows.map((row) => localDecisions[String(row.id)])
        .find(Boolean);
      const outwardStatuses = group.rows.map((row) => normalize(row?.approval_status || row?.status));
      const decidedByBackend = outwardStatuses.find((value) => isApproved(value) || isRejected(value));
      const serverStatus = String(decidedByBackend || related?.status ||
        outwardStatuses.find(Boolean) || "").trim();
      const status = localStatus || serverStatus;
      const approved = isApproved(status);
      const rejected = isRejected(status);
      const pending = normalize(status) === "PENDING_MANAGEMENT";
      if (!approved && !rejected && !pending) continue;
      if (pending && related?.is_read === true && !localStatus) continue;
      found.push({ ...group, notification: related || null, firstRow, status,
        outcome: approved ? "approved" : rejected ? "rejected" : "pending" });
    }
    return found.sort((a, b) => String(b.firstRow?.created_at || b.firstRow?.id || "")
      .localeCompare(String(a.firstRow?.created_at || a.firstRow?.id || "")));
  }, [notifications, salesRows, removedKeys, localDecisions]);

  const removeItem = (item) => {
    if (item.outcome === "pending") return;
    const updated = [...new Set([...removedKeys, item.key])];
    setRemovedKeys(updated);
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(updated));
    // Keep a server-side audit record. "Remove" hides this completed row for
    // this browser/role instead of deleting Outward/Sales financial history.
  };

  const runAction = async (item, action, reason = "") => {
    const outwardId = item?.firstRow?.id;
    if (!outwardId || actionLock.current) return false;
    actionLock.current = true;
    const key = String(outwardId);
    setProcessingId(key); // Immediate "Approving..." feedback on click.
    setActionError("");
    try {
      const isApprove = action === "approve";
      const endpoint = isApprove ? "management-sales-approve" : "management-sales-reject";
      await fetchAuthenticatedJson(
        `${config.baseURL}/outward/${encodeURIComponent(outwardId)}/${endpoint}/`,
        { method: "POST", body: JSON.stringify(isApprove ? {} : { reason }) },
      );

      // Only after the server confirms success: the same row switches directly
      // from "Approve" to "Remove", without waiting for any GET refresh.
      const decided = isApprove ? "APPROVED" : "MANAGEMENT_REJECTED";
      const ids = new Set(item.rows.map((row) => String(row.id)));
      setLocalDecisions((previous) => {
        const next = { ...previous };
        for (const id of ids) next[id] = decided;
        return next;
      });
      setSalesRows((previous) => previous.map((row) => ids.has(String(row.id))
        ? { ...row, status: decided, approval_status: decided } : row));
      if (item.notification) {
        setNotifications((previous) => previous.map((notification) =>
          String(notification.id) === String(item.notification.id)
            ? { ...notification, status: isApprove ? "MANAGEMENT_APPROVED" : "MANAGEMENT_REJECTED", is_read: true }
            : notification));
      }
      setRejecting(null);
      setRejectReason("");
      window.dispatchEvent(new Event("notificationsUpdated"));
      window.dispatchEvent(new Event("salesUpdated"));
      // Backend reconciliation never blocks the action state or the new Remove.
      window.setTimeout(() => { void loadData({ showLoader: false }); }, 0);
      return true;
    } catch (error) {
      const message = String(error?.message || error?.detail || "").trim();
      setActionError(message || `Could not ${action} Sales request.`);
      console.error("Management Sales decision failed:", error);
      return false;
    } finally {
      actionLock.current = false;
      setProcessingId("");
    }
  };

  if (!["management", "admin"].includes(role)) {
    return <PageShell><div className="rounded-xl border p-8 text-center text-muted-foreground">
      Management access is required for Sales approvals.
    </div></PageShell>;
  }

  return (
    <PageShell>
      <PageHeader title="Management Notifications"
        subtitle="Review Finance → Management Sales requests from Inventory → In Drone." />
      {actionError && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{actionError}</div>}
      {loadError && <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{loadError}</div>}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-3">S.No</th><th className="px-4 py-3">MR / Reference</th>
              <th className="px-4 py-3">Sales Components</th><th className="px-4 py-3">Requested By</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-center">Action</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? <tr><td colSpan={6} className="p-12 text-center"><Loader2 className="mx-auto mb-2 size-7 animate-spin" />Loading Sales approvals...</td></tr> :
             displayedItems.length === 0 ? <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">No Sales requests waiting for Management action.</td></tr> :
             displayedItems.map((item, index) => {
              const busy = processingId === String(item.firstRow.id);
              const summary = item.rows.map((row) => `${componentName(row)}-${Number(row?.quantity ?? row?.qty ?? 0)}`).join(", ");
              return <tr key={item.key}>
                <td className="px-4 py-4 text-center font-semibold">{index + 1}</td>
                <td className="px-4 py-4 font-semibold">{item.reference || "-"}</td>
                <td className="px-4 py-4">{summary || "-"}</td>
                <td className="px-4 py-4">{item.notification?.requested_by || item.firstRow.requested_by || "Finance"}</td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${item.outcome === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : item.outcome === "rejected" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                    {displayStatus(item.status)}
                  </span>
                </td>
                <td className="px-4 py-4">
                  {item.outcome === "pending" ? <div className="flex justify-center gap-2">
                    <button type="button" disabled={Boolean(processingId)} onClick={() => void runAction(item, "approve")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      {busy ? "Approving..." : "Approve"}
                    </button>
                    <button type="button" disabled={Boolean(processingId)} onClick={() => { setActionError(""); setRejectReason(""); setRejecting(item); }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"><X className="size-3.5" />Reject</button>
                  </div> : <div className="flex justify-center">
                    <button type="button" onClick={() => removeItem(item)}
                      className="rounded-lg bg-slate-600 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700">Remove</button>
                  </div>}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {rejecting && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
          <h2 className="text-lg font-semibold">Reject Sales Request</h2>
          <p className="mt-1 text-sm text-muted-foreground">{rejecting.reference}</p>
          <label className="mt-5 block text-sm font-medium">Rejection Reason *</label>
          <textarea rows={4} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Enter reason for rejecting..." className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" />
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => { setRejecting(null); setRejectReason(""); }}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">Cancel</button>
            <button type="button" disabled={!rejectReason.trim() || Boolean(processingId)}
              onClick={() => void runAction(rejecting, "reject", rejectReason.trim())}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{processingId ? "Rejecting..." : "Reject Sales"}</button>
          </div>
        </div>
      </div>}
    </PageShell>
  );
}
