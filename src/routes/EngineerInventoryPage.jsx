import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, RefreshCw } from "lucide-react";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { DataTable } from "@/components/app/DataTable";
import config from "@/config";
import { fetchAuthenticatedJson } from "@/api";

const getRows = (payload) => {
  if (Array.isArray(payload)) return payload;
  return (
    [
      payload?.results,
      payload?.data?.results,
      payload?.items,
      payload?.data,
      payload?.rows,
      payload?.components,
      payload?.data?.items,
      payload?.data?.rows,
      payload?.data?.components,
    ].find(Array.isArray) || []
  );
};

const resolveNextUrl = (next, currentUrl) => {
  if (!next) return "";
  try {
    return new URL(next, currentUrl).toString();
  } catch {
    return String(next);
  }
};

async function fetchPaginatedRows(initialUrl) {
  let url = initialUrl;
  const visited = new Set();
  const rows = [];

  while (url && !visited.has(url)) {
    visited.add(url);
    const payload = await fetchAuthenticatedJson(url, { cache: "no-store" });
    rows.push(...getRows(payload));
    url = resolveNextUrl(payload?.next || payload?.data?.next, url);
  }

  return rows;
}

async function fetchEngineerStoreRows() {
  const base = String(config.baseURL || "").replace(/\/+$/, "");
  if (!base) throw new Error("The API base URL is not configured.");

  const [inventoryResult, componentResult] = await Promise.allSettled([
    fetchPaginatedRows(`${base}/inventory/inventory/?page_size=500`),
    fetchPaginatedRows(`${base}/components/components/?page_size=500`),
  ]);

  if (inventoryResult.status === "rejected") {
    throw inventoryResult.reason;
  }

  const inventoryRows = inventoryResult.value;
  const components = componentResult.status === "fulfilled" ? componentResult.value : [];
  const normalizedComponents = Array.isArray(components) ? components : [];
  const inStoreRows = inventoryRows.filter((row) => {
    const sourceMrNumber = String(
      row.source_mr_number ||
        row.sourceMrNumber ||
        row.material_request_number ||
        row.material_request_id ||
        "",
    ).trim();
    const quantity = Number(
      row.available_quantity ?? row.remaining_quantity ?? row.quantity ?? row.qty ?? 0,
    );

    return (
      !sourceMrNumber &&
      Number.isFinite(quantity) &&
      quantity > 0 &&
      row.issued !== true &&
      row.issued !== 1
    );
  });

  return {
    rows: inStoreRows.map((row) => {
      const details =
        row.component_details ||
        row.component_obj ||
        row.component_data ||
        row.componentInfo ||
        row.component_info ||
        (typeof row.component === "object" ? row.component : null);
      const references = [
        row.component_pk,
        row.component_db_id,
        row.componentDatabaseId,
        row.component,
        row.component_id,
        row.componentId,
        row.component_code,
        row.componentCode,
        row.component_name,
        row.componentName,
        details?.id,
        details?.pk,
        details?.component_id,
        details?.component_code,
        details?.code,
        details?.name,
        details?.component_name,
      ]
        .filter((value) => value !== undefined && value !== null && value !== "")
        .map(String);
      const component = normalizedComponents.find((candidate) => {
        const aliases = [
          candidate?.id,
          candidate?.pk,
          candidate?.component_id,
          candidate?.component_code,
          candidate?.code,
          candidate?.name,
          candidate?.component_name,
        ]
          .filter((value) => value !== undefined && value !== null && value !== "")
          .map(String);

        return references.some((reference) => aliases.includes(reference));
      });
      const displayValue = (...values) => {
        const value = values.find(
          (candidate) => candidate !== undefined && candidate !== null && candidate !== "",
        );
        if (value && typeof value === "object") {
          return (
            value.name ||
            value.label ||
            value.component_id ||
            value.component_code ||
            value.code ||
            ""
          );
        }
        return value ?? "";
      };
      const componentId = displayValue(
        row.source_component_id,
        component?.component_id,
        component?.component_code,
        component?.code,
        row.component_code,
        row.componentCode,
        row.component_id,
        row.componentId,
        details?.component_id,
        details?.component_code,
        details?.code,
      );

      return {
        ...row,
        component_id: /^\d+$/.test(String(componentId)) ? "N/A" : componentId || "N/A",
        specification:
          displayValue(
            row.specifications,
            row.source_specification,
            row.specification,
            row.component_specifications,
            row.componentSpecification,
            row.specs,
            row.spec,
            details?.specifications,
            details?.specification,
            details?.specs,
            details?.spec,
            component?.specifications,
            component?.specification,
            component?.specs,
            component?.spec,
          ) || "—",
        component_type:
          displayValue(
            row.component_type,
            row.componentType,
            details?.component_type,
            details?.componentType,
            component?.component_type,
            component?.componentType,
          ) || "—",
        quantity: row.available_quantity ?? row.remaining_quantity ?? row.quantity ?? row.qty ?? 0,
        uom:
          displayValue(
            row.uom,
            row.unit,
            row.unit_of_measurements,
            row.unitOfMeasurements,
            details?.uom,
            details?.unit,
            details?.unit_of_measurements,
            details?.unit_of_measurement,
            component?.uom,
            component?.unit,
            component?.unit_of_measurements,
            component?.unit_of_measurement,
          ) || "—",
      };
    }),
    componentError:
      componentResult.status === "rejected"
        ? `Inventory loaded, but component details could not be loaded: ${
            componentResult.reason?.message || "Component master request failed."
          }`
        : "",
  };
}

export default function EngineerInventoryPage() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [componentError, setComponentError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedComponent, setExpandedComponent] = useState("");
  const [filteredRowCount, setFilteredRowCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setComponentError("");

    fetchEngineerStoreRows()
      .then(({ rows: data, componentError: warning }) => {
        if (active) {
          setRows(data);
          setComponentError(warning);
        }
      })
      .catch((requestError) => {
        if (active) {
          setRows([]);
          setError(requestError?.message || "Unable to load In-Store inventory.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const visibleRows = useMemo(() => {
    const groupedRows = new Map();

    rows.forEach((row) => {
      const componentReference =
        row.component_pk ?? row.component_db_id ?? row.component?.id ?? row.component ?? row.id;
      const identity = row.component_id === "N/A" ? componentReference : row.component_id;
      const groupKey = [identity, row.component_id, row.specification, row.component_type].join(
        "|",
      );
      const existing = groupedRows.get(groupKey);

      if (existing) {
        existing.stockEntries.push(row);
        existing.quantity += Number(row.quantity) || 0;
      } else {
        groupedRows.set(groupKey, {
          ...row,
          groupKey,
          originalOrder: groupedRows.size,
          quantity: Number(row.quantity) || 0,
          stockEntries: [row],
        });
      }
    });

    const query = search.trim().toLowerCase();
    return Array.from(groupedRows.values()).filter((row) => {
      if (!query) return true;

      const searchableValues = [
        row.originalOrder + 1,
        row.component_id,
        row.specification,
        row.component_type,
        row.quantity,
        ...row.stockEntries.flatMap((entry) => [
          entry.component_id,
          entry.specification,
          entry.component_type,
          entry.quantity,
          entry.uom,
        ]),
      ];

      return searchableValues.some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(query),
      );
    });
  }, [rows, search]);

  const columns = useMemo(
    () => [
      {
        key: "sno",
        header: "S.No",
        className: "w-[10%] text-center",
        render: (_, index) => index + 1,
        sortValue: (row) => row.originalOrder,
        filterValue: (row) => row.originalOrder + 1,
      },
      {
        key: "component_id",
        header: "Component ID",
        className: "w-[20%] text-center",
        render: (row) => {
          const isExpanded = expandedComponent === row.groupKey;

          return (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => setExpandedComponent(isExpanded ? "" : row.groupKey)}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium text-primary hover:underline"
              >
                {isExpanded ? (
                  <ChevronDown className="size-4 shrink-0" />
                ) : (
                  <ChevronRight className="size-4 shrink-0" />
                )}
                {row.component_id || "N/A"}
              </button>
              {isExpanded && (
                <div className="w-full min-w-[180px] rounded-lg bg-muted/30 p-3 text-left">
                  <div className="mb-2 text-xs font-semibold text-foreground">
                    Quantity breakdown
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-2 py-1">
                          S.No
                        </th>
                        <th scope="col" className="px-2 py-1 text-right">
                          Qty
                        </th>
                        <th scope="col" className="px-2 py-1">
                          UOM
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {row.stockEntries.map((entry, entryIndex) => (
                        <tr key={entry.id ?? `${row.groupKey}-${entryIndex}`}>
                          <td className="px-2 py-1">{entryIndex + 1}</td>
                          <td className="px-2 py-1 text-right font-medium">{entry.quantity}</td>
                          <td className="px-2 py-1">{entry.uom || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        },
        sortValue: (row) => row.component_id,
        filterValue: (row) => row.component_id,
      },
      {
        key: "specification",
        header: "Specification",
        className: "w-[22%] text-center",
        render: (row) => row.specification || "—",
        sortValue: (row) => row.specification,
        filterValue: (row) => row.specification,
      },
      {
        key: "component_type",
        header: "Component Type",
        className: "w-[20%] text-center",
        render: (row) => row.component_type || "—",
        sortValue: (row) => row.component_type,
        filterValue: (row) => row.component_type,
      },
      {
        key: "quantity",
        header: "Qty",
        className: "w-[14%] text-center",
        render: (row) => row.quantity,
        sortValue: (row) => row.quantity,
        filterValue: (row) =>
          [row.quantity, ...row.stockEntries.map((entry) => entry.quantity)].join(" "),
      },
      {
        key: "uom",
        header: "UOM",
        className: "w-[14%] text-center",
        render: (row) =>
          Array.from(new Set(row.stockEntries.map((entry) => entry.uom || "—"))).join(", "),
        sortValue: (row) =>
          Array.from(new Set(row.stockEntries.map((entry) => entry.uom || "—"))).join(", "),
        filterValue: (row) => row.stockEntries.map((entry) => entry.uom || "—").join(" "),
      },
    ],
    [expandedComponent],
  );

  return (
    <PageShell>
      <PageHeader
        title="In-Store Inventory"
        subtitle="View component IDs, specifications, and current In-Store quantities."
      />

      <section className="space-y-4" aria-label="In-Store inventory">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search all inventory columns..."
              aria-label="Search all In-Store inventory columns"
              className="w-full rounded-2xl border border-border bg-card py-3 pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </label>
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {loading
            ? "Loading In-Store components..."
            : `${filteredRowCount} component${filteredRowCount === 1 ? "" : "s"}`}
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}
        {componentError && (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            {componentError}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <DataTable
            columns={columns}
            rows={visibleRows}
            keyField="groupKey"
            enableColumnTools
            loading={loading}
            loadingTitle="Loading In-Store Inventory..."
            loadingDescription="Fetching in-store stock and component details."
            onFilteredRowCountChange={setFilteredRowCount}
          />
        </div>
      </section>
    </PageShell>
  );
}
