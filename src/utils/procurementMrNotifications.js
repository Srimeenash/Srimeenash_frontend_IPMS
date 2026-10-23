/**
 * Repair missing Procurement notification records for approved MR requests.
 *
 * Why: some R&D requests advance to PROCUREMENT_PENDING successfully, but a
 * corresponding receiver=PROCUREMENT/category=MR notification is not created.
 * This helper never changes an MR's workflow status, inventory, or PO record.
 *
 * NOTE: The Django backend should ultimately own this creation atomically.
 * The client-side recovery below is a compatibility fix for existing records.
 */
import { fetchAuthenticatedJson } from "@/api";

const NOTIFICATION_PAGE_SIZE = 200;
const inFlightNotifications = new Map();
const normalize = (value) => String(value ?? "").trim().toUpperCase();
const blank = (value) => value === undefined || value === null || String(value).trim() === "";

const getMrDatabaseId = (request = {}) =>
  request?.id ?? request?.pk ?? request?.material_request_db_id ?? null;

const getMrNumber = (request = {}) =>
  String(
    request?.material_request_id ??
    request?.materialRequestId ??
    request?.request_id ??
    request?.requestId ??
    `MR-${getMrDatabaseId(request) ?? ""}`,
  ).trim();

const getWorkflowStatus = (request = {}) =>
  normalize(request?.status ?? request?.workflow_status ?? request?.workflowStatus);

/** R&D and RD are the two request-type spellings already in the project. */
export const isRdProcurementPendingMr = (request = {}) => {
  const type = normalize(request?.request_type ?? request?.requestType).replace(/\s+/g, "");
  return (type === "R&D" || type === "RD") &&
    getWorkflowStatus(request) === "PROCUREMENT_PENDING" &&
    !blank(getMrDatabaseId(request));
};

const notificationMatchesMr = (notification, request) => {
  if (normalize(notification?.category) !== "MR" ||
      normalize(notification?.receiver) !== "PROCUREMENT") return false;

  const reference = normalize(
    notification?.reference_id ?? notification?.referenceId ?? "",
  );
  const mrId = normalize(getMrDatabaseId(request));
  const mrNumber = normalize(getMrNumber(request));
  // Older notifications sometimes use the human-readable MR number as ref.
  return Boolean(reference && (reference === mrId || reference === mrNumber));
};

const resolveNextPageUrl = (nextUrl) => {
  const url = String(nextUrl || "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("/")) return url;
  return `/notifications/${url.replace(/^\/+/, "")}`;
};

/** Load the Procurement notification list WITHOUT hiding earlier pages. */
export const fetchProcurementMrNotifications = async () => {
  let url = `/notifications/?receiver=PROCUREMENT&page_size=${NOTIFICATION_PAGE_SIZE}`;
  const visited = new Set();
  const notifications = [];

  while (url && !visited.has(url)) {
    visited.add(url);
    const data = await fetchAuthenticatedJson(url, { cache: "no-store" });
    if (Array.isArray(data)) {
      notifications.push(...data);
      break;
    }
    const pageRows = Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.items)
          ? data.items
          : [];
    notifications.push(...pageRows);
    url = resolveNextPageUrl(data?.next ?? data?.links?.next);
  }

  return notifications;
};

const makeProcurementNotification = (request) => {
  const id = getMrDatabaseId(request);
  const number = getMrNumber(request);
  return {
    category: "MR",
    receiver: "PROCUREMENT",
    reference_id: String(id),
    title: `MR PROCUREMENT REQUEST - ${number}`,
    message: `Material Request ${number} needs Procurement processing.`,
    status: "PROCUREMENT_PENDING",
    is_read: false,
  };
};

/**
 * Returns true only if a missing notification was POSTed successfully.
 * The full list may be supplied by a caller doing bulk recovery (avoids N GETs).
 * Never POST if Procurement notifications cannot be read/verified.
 */
export const ensureProcurementNotificationForMr = async (
  request,
  existingNotifications = null,
) => {
  if (getWorkflowStatus(request) !== "PROCUREMENT_PENDING") return false;
  const id = getMrDatabaseId(request);
  if (blank(id)) return false;

  const key = String(id).trim();
  if (inFlightNotifications.has(key)) return inFlightNotifications.get(key);

  const task = (async () => {
    const current = Array.isArray(existingNotifications)
      ? existingNotifications
      : await fetchProcurementMrNotifications();

    if (current.some((notification) => notificationMatchesMr(notification, request))) {
      return false;
    }

    const payload = makeProcurementNotification(request);
    try {
      await fetchAuthenticatedJson("/notifications/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      // Keep the in-memory list current when reconciling many requests.
      if (Array.isArray(existingNotifications)) existingNotifications.push(payload);
      return true;
    } catch (error) {
      // Another tab/backend process may have created it between GET and POST.
      const refreshed = await fetchProcurementMrNotifications().catch(() => []);
      if (refreshed.some((notification) => notificationMatchesMr(notification, request))) {
        if (Array.isArray(existingNotifications)) existingNotifications.push(payload);
        return false;
      }
      throw error;
    }
  })();

  inFlightNotifications.set(key, task);
  try {
    return await task;
  } finally {
    inFlightNotifications.delete(key);
  }
};

/**
 * Compatibility recovery for already-approved R&D MRs (including old ones).
 * Intentionally only fixes missing R&D notices; the normal BOM path stays intact.
 */
export const repairMissingRdProcurementNotifications = async (requests = []) => {
  const eligible = (Array.isArray(requests) ? requests : []).filter(
    isRdProcurementPendingMr,
  );
  if (!eligible.length) return { checked: 0, created: 0, failed: 0 };

  const existing = await fetchProcurementMrNotifications();
  let created = 0;
  let failed = 0;
  const seen = new Set();

  for (const request of eligible) {
    const key = String(getMrDatabaseId(request));
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (await ensureProcurementNotificationForMr(request, existing)) created += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed to reconcile Procurement notification for ${getMrNumber(request)}`, error);
    }
  }

  return { checked: seen.size, created, failed };
};
