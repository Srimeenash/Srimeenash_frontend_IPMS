import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { DataTable } from "@/components/app/DataTable";
import { PaginationControls } from "@/components/app/PaginationControls";
import config from "@/config";
import { Loader2, Plus } from "lucide-react";
import { fetchJson, fetchAuthenticatedJson } from "@/api";
import { useAuth } from "@/AuthContext";

const BOM_PAGE_SIZE = 50;

function BomPage() {
  const { user, activeRole } = useAuth();
  const role = String(activeRole || user?.active_role || user?.role?.name || user?.role || "").trim().toLowerCase();
  const canAdministerBom = role !== "engineer";
  const navigate = useNavigate();
  const location = useLocation();
  const [bomList, setBomList] = useState([]);
  const [bomPage, setBomPage] = useState(1);
  const [bomDisplayedCount, setBomDisplayedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
const [selectionMode, setSelectionMode] = useState(false);

const [statusFilter, setStatusFilter] =
  useState("ALL");

const [
  rejectionPopup,
  setRejectionPopup,
] = useState(null);
  const handleEnableSelectionMode = () => {
    setSelectedRowKeys([]);
    setSelectionMode(true);
  };

  const handleCancelSelectionMode = () => {
    setSelectedRowKeys([]);
    setSelectionMode(false);
  };

  const loadBOMs = async () => {
    setLoading(true);

    try {
      const data = await fetchAuthenticatedJson(
        `${config.baseURL}/bom/bom/`,
        {
          cache: "no-store",
        },
      );

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
          ? data.results
          : [];

      // Backend is the source of truth. Never restore deleted BOMs
      // from mock-data when the real API returns an empty list.
      setBomList(list);
    } catch (err) {
      console.error("Failed to load BOM records:", err);

      // Avoid showing fake/stale rows when the backend request fails.
      setBomList([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedRowKeys.length) return;

    const rowsToDelete = bomList.filter((row, index) => {
      const key = String(
        row?.id ??
          row?.bom_number ??
          row?.code ??
          `row-${index}`,
      );

      return selectedRowKeys.includes(key);
    });

    if (!rowsToDelete.length) {
      setSelectedRowKeys([]);
      setSelectionMode(false);
      await loadBOMs();
      return;
    }

    try {
      const results = await Promise.allSettled(
        rowsToDelete.map((row) => {
          const id =
            row?.id ??
            row?.bom_number ??
            row?.code;

          return fetchAuthenticatedJson(
            `${config.baseURL}/bom/bom/${encodeURIComponent(id)}/`,
            {
              method: "DELETE",
            },
          );
        }),
      );

      const realFailures = results.filter((result) => {
        if (result.status !== "rejected") {
          return false;
        }

        const message = String(
          result.reason?.message ||
            result.reason?.detail ||
            result.reason ||
            "",
        ).toLowerCase();

        // If Django says the BOM is already gone, the desired state
        // has already been reached. Do not treat that as a UI failure.
        return !(
          message.includes("no bom matches") ||
          message.includes("not found") ||
          message.includes("404")
        );
      });

      setSelectedRowKeys([]);
      setSelectionMode(false);

      // Always reload from the database after deletion.
      await loadBOMs();

      window.dispatchEvent(
        new Event("notificationsUpdated"),
      );

      if (realFailures.length > 0) {
        console.error(
          "Some BOM records could not be deleted:",
          realFailures,
        );

        alert(
          "Some BOM records could not be deleted. The BOM list has been refreshed from the backend.",
        );
      }
    } catch (err) {
      console.error(
        "Failed to delete selected BOM records:",
        err,
      );

      setSelectedRowKeys([]);
      setSelectionMode(false);

      await loadBOMs();

      alert(
        "Unable to complete the BOM deletion. The BOM list has been refreshed from the backend.",
      );
    }
  };

  useEffect(() => {
    loadBOMs();
  }, [location.key]);
const getStatusStyle = (status) => {
  const normalized = String(
    status || ""
  ).toUpperCase();

  const styles = {
    PENDING_MANAGER:
      "bg-yellow-100 text-yellow-700",

    APPROVED:
      "bg-green-100 text-green-700",

    MANAGER_REJECTED:
      "bg-orange-100 text-orange-700",

    MODIFIED:
      "bg-blue-100 text-blue-700",
  };

  return (
    styles[normalized] ||
    "bg-gray-100 text-gray-700"
  );
};


const getStatusLabel = (status) => {
  const labels = {
    PENDING_MANAGER: "Pending Manager",
    APPROVED: "Approved",
    MANAGER_REJECTED: "Sent for Modification",
    MODIFIED: "Modified",
  };

  return (
    labels[String(status || "").toUpperCase()] ||
    status ||
    "-"
  );
};
const filteredBomList =
  statusFilter === "ALL"
    ? bomList
    : bomList.filter((bom) => {
        const currentStatus = String(
          bom.status || "PENDING_MANAGER"
        )
          .trim()
          .toUpperCase();

        return (
          currentStatus ===
          String(statusFilter)
            .trim()
            .toUpperCase()
        );
      });

const bomPageCount = Math.max(
  1,
  Math.ceil(bomDisplayedCount / BOM_PAGE_SIZE),
);

useEffect(() => {
  setBomPage(1);
}, [statusFilter]);

useEffect(() => {
  setBomPage((currentPage) =>
    Math.min(currentPage, bomPageCount),
  );
}, [bomPageCount]);
  return _jsxs(PageShell, {
    children: [
_jsx(PageHeader, {
  title: "Bill of Materials",

  subtitle:
    "Engineered drone builds with full component breakdown.",

  right: _jsxs("div", {
    className: "flex items-center gap-2",

    children: [
      _jsxs("select", {
        value: statusFilter,

        onChange: (event) => {
          setStatusFilter(
            event.target.value
          );

          setSelectedRowKeys([]);
          setSelectionMode(false);
        },

        className:
          "h-10 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-slate-900",

        children: [
          _jsx("option", {
            value: "ALL",
            children: "All Status",
          }),

          _jsx("option", {
            value: "PENDING_MANAGER",
            children: "Pending Manager",
          }),

          _jsx("option", {
            value: "APPROVED",
            children: "Approved",
          }),

          _jsx("option", {
            value: "MANAGER_REJECTED",
            children: "Sent for Modification",
          }),

          _jsx("option", {
            value: "MODIFIED",
            children: "Modified",
          }),
        ],
      }),

      canAdministerBom && _jsx("button", {
        type: "button",

        onClick: selectionMode
          ? handleDeleteSelected
          : handleEnableSelectionMode,

        disabled:
          selectionMode &&
          selectedRowKeys.length === 0,

        className:
          "inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50",

        style: {
          backgroundColor: "#E85D75",
        },

        children: selectionMode
          ? `Delete Selected (${selectedRowKeys.length})`
          : "Delete",
      }),

      selectionMode &&
        _jsx("button", {
          type: "button",

          onClick:
            handleCancelSelectionMode,

          className:
            "inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary",

          children: "Cancel",
        }),

      _jsx(Link, {
        to: "/bom/new",

        className:
          "inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90",

        children: _jsxs("span", {
          className: "inline-flex items-center gap-2",
          children: [
            _jsx(Plus, {
              className: "size-4",
            }),
            "Create BOM",
          ],
        }),
      }),
    ],
  }),
}),
      _jsx(DataTable, {
        enableColumnTools: true,
        selectable: canAdministerBom && selectionMode,
        selectedRowKeys: selectedRowKeys,
        onSelectedRowKeysChange: setSelectedRowKeys,
        columns: [
{
  key: "sno",
  header: "S.No",
  className: "w-[5rem] text-center",
  disableColumnTools: true,
  render: (_row, index) =>
    (bomPage - 1) * BOM_PAGE_SIZE +
    index +
    1,
},
{
  key: "bom_number",
  header: "BOM ID",
  className: "text-center",
  render: (row) => (
    <Link
      to={`/bom/${encodeURIComponent(row.bom_number || row.code || "")}`}
      style={{
        fontWeight: 700,
        fontSize: "15px",
        color: "#E85D75",
        textDecoration: "underline",
      }}
    >
      {row.bom_number || row.code}
    </Link>
  ),
},
          { key: "bom_name", header: "BOM Name", className: "text-center font-semibold" },
          {
            key: "product_name",
            header: "Product Name",
            className: "text-center",
          },
          { key: "version", header: "Version", className: "text-center" },

          {
            key: "items",
            header: "Number of Components",
            className: "text-center",
            render: (row) => {
              if (Array.isArray(row.items)) return row.items.length;
              if (typeof row.items === "number") return row.items;
              return row.component_count || 0;
            },
          },
          { key: "created_by", header: "Created By", className: "text-center" },
          {
            key: "created_at",
            header: "Created Date",
            className: "text-center",
            render: (row) => {
              if (!row.created_at) return "-";
              return new Date(row.created_at).toLocaleDateString("en-IN");
            }
          },
                    {
  key: "status",
  header: "Status",
  className: "text-center",

  render: (row) => {
    const status = String(
      row.status || "PENDING_MANAGER"
    ).toUpperCase();

    const badge = (
      <span
        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(
          status
        )}`}
      >
        {getStatusLabel(status)}
      </span>
    );

    if (
      status === "MANAGER_REJECTED"
    ) {
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();

            setRejectionPopup({
              bomNumber:
                row.bom_number ||
                row.code,

              reason:
                row.manager_rejection_reason ||
                "No rejection remarks provided.",

              rejectedBy:
                row.manager_rejected_by ||
                "Manager",
            });
          }}
        >
          {badge}
        </button>
      );
    }

    return badge;
  },
},
          // Project Type column removed
        ],
      rows: filteredBomList,
       page: bomPage,
       pageSize: BOM_PAGE_SIZE,
       onFilteredRowCountChange: setBomDisplayedCount,
        loading: loading,
      }),

      _jsx(PaginationControls, {
        page: bomPage,
        totalCount: bomDisplayedCount,
        pageSize: BOM_PAGE_SIZE,
        hasPreviousPage: bomPage > 1,
        hasNextPage: bomPage < bomPageCount,
        loading: loading,
        onPrevious: () => setBomPage((currentPage) => Math.max(1, currentPage - 1)),
        onNext: () => setBomPage((currentPage) => Math.min(bomPageCount, currentPage + 1)),
      }),

      rejectionPopup &&
  _jsx("div", {
    className:
      "fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4",

    children: _jsxs("div", {
      className:
        "w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-950",

      children: [
        _jsx("h2", {
          className:
            "text-lg font-semibold",

          children:
            "Manager Rejection Remarks",
        }),

        _jsx("p", {
          className:
            "mt-2 text-sm text-muted-foreground",

          children:
            rejectionPopup.bomNumber,
        }),

        _jsx("div", {
          className:
            "mt-4 rounded-xl border bg-muted/40 p-4",

          children:
            rejectionPopup.reason,
        }),

        _jsx("p", {
          className:
            "mt-3 text-sm text-muted-foreground",

          children:
            `Rejected by: ${rejectionPopup.rejectedBy}`,
        }),

        _jsx("div", {
          className:
            "mt-5 flex justify-end",

          children: _jsx("button", {
            type: "button",

            className:
              "rounded-lg border px-4 py-2",

            onClick: () =>
              setRejectionPopup(null),

            children: "Close",
          }),
        }),
      ],
    }),
  }),
    ],
  });
}

export default BomPage;