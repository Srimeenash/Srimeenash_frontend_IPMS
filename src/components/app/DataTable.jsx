import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Filter,
  Loader2,
  Search,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";


/* =========================================================
 * HELPERS
 * ========================================================= */

const normalizeValue = (value) => {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
};


const getRenderedNodeText = (node) => {
  if (
    node === null ||
    node === undefined ||
    typeof node === "boolean"
  ) {
    return "";
  }

  if (
    typeof node === "string" ||
    typeof node === "number"
  ) {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node
      .map(getRenderedNodeText)
      .filter(Boolean)
      .join(" ");
  }

  if (
    typeof node === "object" &&
    node?.props
  ) {
    return getRenderedNodeText(
      node.props.children,
    );
  }

  return "";
};


const getColumnValue = (
  column,
  row,
  index,
  purpose = "filter",
) => {
  const resolver =
    purpose === "sort"
      ? column.sortValue
      : column.filterValue;

  if (typeof resolver === "function") {
    return resolver(
      row,
      index,
    );
  }

  if (
    typeof column.value ===
    "function"
  ) {
    return column.value(
      row,
      index,
    );
  }

  if (
    typeof column.accessor ===
    "function"
  ) {
    return column.accessor(
      row,
      index,
    );
  }

  const directValue =
    row?.[column.key];

  if (
    directValue !== undefined &&
    directValue !== null &&
    directValue !== ""
  ) {
    return directValue;
  }

  /*
   * Some columns only show their value
   * through render().
   *
   * For client-side sorting/filtering,
   * try to extract plain text.
   */
  if (
    typeof column.render ===
    "function"
  ) {
    try {
      return getRenderedNodeText(
        column.render(
          row,
          index,
        ),
      );
    } catch {
      return directValue;
    }
  }

  return directValue;
};


const isNumericValue = (value) => {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return false;
  }

  return Number.isFinite(
    Number(value),
  );
};


const MENU_WIDTH = 288;
const MENU_GAP = 8;
const VIEWPORT_GAP = 12;


/* =========================================================
 * LOADING COPY
 * ========================================================= */

const getTableLoadingCopy = (
  columns = [],
) => {
  const pathname =
    typeof window !== "undefined"
      ? String(
          window.location.pathname ||
            "",
        ).toLowerCase()
      : "";

  const headers = (
    Array.isArray(columns)
      ? columns
      : []
  )
    .map((column) =>
      String(
        column?.header ||
          column?.key ||
          "",
      ),
    )
    .join(" ")
    .toLowerCase();

  const source =
    `${pathname} ${headers}`;


  if (
    source.includes(
      "returnable",
    )
  ) {
    return {
      title:
        "Loading Returnable workflow...",
      description:
        "Checking MR, Inventory, Procurement, issue and return status.",
    };
  }


  if (
    source.includes(
      "material request",
    ) ||
    source.includes(
      "material-request",
    ) ||
    source.includes(
      "material_request",
    ) ||
    source.includes(
      "mr status",
    )
  ) {
    return {
      title:
        "Loading Material Request records...",
      description:
        "Fetching the latest Material Request and approval details.",
    };
  }


  if (
    source.includes(
      "bill of materials",
    ) ||
    source.includes(
      "/bom",
    ) ||
    source.includes(
      "bom id",
    )
  ) {
    return {
      title:
        "Loading BOM records...",
      description:
        "Fetching the latest Bill of Materials and approval details.",
    };
  }


  if (
    source.includes(
      "vendor",
    )
  ) {
    return {
      title:
        "Loading vendors...",
      description:
        "Fetching the latest vendor and component details.",
    };
  }


  if (
    source.includes(
      "purchase order",
    ) ||
    source.includes(
      "purchase-order",
    ) ||
    source.includes(
      "po number",
    )
  ) {
    return {
      title:
        "Loading Purchase Order records...",
      description:
        "Fetching the latest Purchase Order and approval details.",
    };
  }


  if (
    source.includes(
      "inward",
    )
  ) {
    return {
      title:
        "Loading Inward records...",
      description:
        "Fetching the latest inward, delivery and QC details.",
    };
  }


  if (
    source.includes(
      "outward",
    )
  ) {
    return {
      title:
        "Loading Outward records...",
      description:
        "Fetching the latest outward and component details.",
    };
  }


  if (
    source.includes(
      "project",
    )
  ) {
    return {
      title:
        "Loading Project records...",
      description:
        "Fetching the latest project and workflow details.",
    };
  }


  if (
    source.includes(
      "finance",
    )
  ) {
    return {
      title:
        "Loading Finance records...",
      description:
        "Fetching the latest project and Purchase Order finance details.",
    };
  }


  if (
    source.includes(
      "inventory",
    )
  ) {
    return {
      title:
        "Loading Inventory records...",
      description:
        "Fetching the latest inventory and component details.",
    };
  }


  if (
    source.includes(
      "procurement",
    )
  ) {
    return {
      title:
        "Loading Procurement records...",
      description:
        "Fetching the latest procurement and workflow details.",
    };
  }


  if (
    source.includes(
      "scrap",
    )
  ) {
    return {
      title:
        "Loading Scrap records...",
      description:
        "Fetching the latest scrap and component details.",
    };
  }


  return {
    title:
      "Loading records...",
    description:
      "Fetching the latest records and workflow details.",
  };
};


/* =========================================================
 * DATA TABLE
 * ========================================================= */

export function DataTable({
  columns = [],
  rows = [],
  className,

  keyField = null,

  selectable = false,
  selectedRowKeys = [],
  onSelectedRowKeysChange,
  selectionKey = null,

  enableColumnTools = true,

  /*
   * Existing CLIENT pagination.
   *
   * Keep these because some old pages
   * may still use client-side mode.
   */
  page = null,
  pageSize = null,

  onFilteredRowCountChange,

  /*
   * =====================================================
   * NEW SERVER-SIDE MODE
   * =====================================================
   *
   * serverSide=false:
   *   Existing behavior.
   *   DataTable filters/sorts/paginates rows locally.
   *
   * serverSide=true:
   *   Backend already filters/sorts/paginates.
   *   DataTable only displays rows returned by Django.
   */
  serverSide = false,

  /*
   * Called when user chooses:
   * Ascending / Descending / Clear.
   *
   * Example:
   *
   * {
   *   key: "component_name",
   *   direction: "asc"
   * }
   */
  onSortChange = null,

  /*
   * Called whenever column filter changes.
   *
   * Example:
   *
   * {
   *   component_name: "motor",
   *   category: "AIRFRAMES"
   * }
   */
  onFilterChange = null,

  /*
   * Loading remains controlled by
   * the actual API loading boolean.
   */
  loading = false,

  loadingTitle = null,
  loadingDescription = null,

  hideEmptyState = false,
}) {
  const activeSelectionKey =
    selectionKey ||
    keyField ||
    "id";


  const [
    columnFilters,
    setColumnFilters,
  ] = useState({});


  const [
    sortConfig,
    setSortConfig,
  ] = useState({
    key: "",
    direction: "",
  });


  const [
    openTools,
    setOpenTools,
  ] = useState(null);


  const tableRef =
    useRef(null);

  const menuRef =
    useRef(null);


  /*
   * Never infer loading from rows.length.
   *
   * Empty API response is valid data.
   */
  const isTableLoading =
    Boolean(loading);


  const automaticLoadingCopy =
    useMemo(
      () =>
        getTableLoadingCopy(
          columns,
        ),
      [columns],
    );


  const resolvedLoadingTitle =
    loadingTitle ||
    automaticLoadingCopy.title;


  const resolvedLoadingDescription =
    loadingDescription ??
    automaticLoadingCopy.description;


  /* =====================================================
   * ROW KEYS
   * ===================================================== */

  const getRowKey = (
    row,
    index,
  ) => {
    const keyValue =
      row?.[
        activeSelectionKey
      ];

    return (
      keyValue !== undefined &&
      keyValue !== null
    )
      ? String(keyValue)
      : `row-${index}`;
  };


  const selectedKeys =
    new Set(
      Array.isArray(
        selectedRowKeys,
      )
        ? selectedRowKeys.map(
            String,
          )
        : [],
    );


  /* =====================================================
   * COLUMN TOOLS
   * ===================================================== */

  const columnCanUseTools = (
    column,
  ) => {
    if (
      !enableColumnTools
    ) {
      return false;
    }

    if (
      column
        ?.disableColumnTools ===
      true
    ) {
      return false;
    }

    return ![
      "actions",
      "action",
      "serialPurchaseCosts",
      "costDetails",
    ].includes(
      column?.key,
    );
  };


  /*
   * Quick filter values are CLIENT-side only.
   *
   * In server mode we only have the current
   * 50 rows, so showing quick values could
   * incorrectly imply that they are all
   * values in the database.
   */
  const uniqueValuesByColumn =
    useMemo(
      () => {
        if (serverSide) {
          return {};
        }

        const result = {};

        columns.forEach(
          (column) => {
            if (
              !columnCanUseTools(
                column,
              )
            ) {
              return;
            }

            const values =
              Array.from(
                new Set(
                  rows
                    .map(
                      (
                        row,
                        index,
                      ) =>
                        normalizeValue(
                          getColumnValue(
                            column,
                            row,
                            index,
                            "filter",
                          ),
                        ).trim(),
                    )
                    .filter(
                      Boolean,
                    ),
                ),
              );

            result[
              column.key
            ] = values
              .sort(
                (
                  left,
                  right,
                ) =>
                  left.localeCompare(
                    right,
                    undefined,
                    {
                      numeric: true,
                      sensitivity:
                        "base",
                    },
                  ),
              )
              .slice(
                0,
                50,
              );
          },
        );

        return result;
      },
      [
        columns,
        rows,
        enableColumnTools,
        serverSide,
      ],
    );


  /* =====================================================
   * FILTER + SORT
   * ===================================================== */

  const filteredAndSortedRows =
    useMemo(
      () => {
        /*
         * SERVER-SIDE MODE
         *
         * Django already performed:
         *
         * filter
         * search
         * ordering
         * pagination
         *
         * Therefore DO NOT modify the
         * returned page inside DataTable.
         */
        if (serverSide) {
          return rows.map(
            (
              row,
              originalIndex,
            ) => ({
              row,
              originalIndex,
            }),
          );
        }


        /*
         * CLIENT-SIDE MODE
         *
         * Keep your previous behavior
         * for older pages.
         */
        let output =
          rows.map(
            (
              row,
              originalIndex,
            ) => ({
              row,
              originalIndex,
            }),
          );


        Object.entries(
          columnFilters,
        ).forEach(
          ([
            key,
            rawFilter,
          ]) => {
            const filterValue =
              String(
                rawFilter ||
                  "",
              )
                .trim()
                .toLowerCase();


            if (!filterValue) {
              return;
            }


            const column =
              columns.find(
                (item) =>
                  item.key ===
                  key,
              );


            if (!column) {
              return;
            }


            output =
              output.filter(
                ({
                  row,
                  originalIndex,
                }) =>
                  normalizeValue(
                    getColumnValue(
                      column,
                      row,
                      originalIndex,
                      "filter",
                    ),
                  )
                    .toLowerCase()
                    .includes(
                      filterValue,
                    ),
              );
          },
        );


        if (
          sortConfig.key &&
          sortConfig.direction
        ) {
          const column =
            columns.find(
              (item) =>
                item.key ===
                sortConfig.key,
            );


          if (column) {
            output =
              [...output].sort(
                (
                  left,
                  right,
                ) => {
                  const leftRaw =
                    getColumnValue(
                      column,
                      left.row,
                      left.originalIndex,
                      "sort",
                    );


                  const rightRaw =
                    getColumnValue(
                      column,
                      right.row,
                      right.originalIndex,
                      "sort",
                    );


                  let comparison =
                    0;


                  if (
                    isNumericValue(
                      leftRaw,
                    ) &&
                    isNumericValue(
                      rightRaw,
                    )
                  ) {
                    comparison =
                      Number(
                        leftRaw,
                      ) -
                      Number(
                        rightRaw,
                      );
                  } else {
                    comparison =
                      normalizeValue(
                        leftRaw,
                      ).localeCompare(
                        normalizeValue(
                          rightRaw,
                        ),
                        undefined,
                        {
                          numeric: true,
                          sensitivity:
                            "base",
                        },
                      );
                  }


                  return (
                    sortConfig.direction ===
                    "asc"
                  )
                    ? comparison
                    : -comparison;
                },
              );
          }
        }


        return output;
      },
      [
        rows,
        columns,
        columnFilters,
        sortConfig,
        serverSide,
      ],
    );


  /*
   * Existing callback is preserved.
   *
   * NOTE:
   * In server-side mode this is the
   * current returned page count,
   * NOT database total count.
   *
   * Database total must come from:
   *
   * response.count
   */
  useEffect(() => {
    onFilteredRowCountChange?.(
      filteredAndSortedRows.length,
    );
  }, [
    filteredAndSortedRows.length,
    onFilteredRowCountChange,
  ]);


  /* =====================================================
   * DISPLAYED ROWS
   * ===================================================== */

  const displayedRows =
    useMemo(
      () => {
        /*
         * IMPORTANT:
         *
         * Django already returned
         * page 1 / page 2 / etc.
         *
         * Never slice the server page again.
         */
        if (serverSide) {
          return (
            filteredAndSortedRows
          );
        }


        if (
          !Number.isInteger(
            page,
          ) ||
          !Number.isInteger(
            pageSize,
          ) ||
          pageSize <= 0
        ) {
          return (
            filteredAndSortedRows
          );
        }


        const startIndex =
          Math.max(
            0,
            page - 1,
          ) *
          pageSize;


        return (
          filteredAndSortedRows.slice(
            startIndex,
            startIndex +
              pageSize,
          )
        );
      },
      [
        filteredAndSortedRows,
        page,
        pageSize,
        serverSide,
      ],
    );


  /* =====================================================
   * SELECTION
   * ===================================================== */

  const displayedRowKeys =
    useMemo(
      () =>
        displayedRows.map(
          ({
            row,
            originalIndex,
          }) =>
            getRowKey(
              row,
              originalIndex,
            ),
        ),
      [
        displayedRows,
        activeSelectionKey,
      ],
    );


  const allSelected =
    displayedRowKeys.length >
      0 &&
    displayedRowKeys.every(
      (key) =>
        selectedKeys.has(
          key,
        ),
    );


  const handleSelectAll = (
    checked,
  ) => {
    if (
      !onSelectedRowKeysChange
    ) {
      return;
    }


    const nextKeys =
      new Set(
        selectedKeys,
      );


    displayedRowKeys.forEach(
      (key) => {
        if (checked) {
          nextKeys.add(
            key,
          );
        } else {
          nextKeys.delete(
            key,
          );
        }
      },
    );


    onSelectedRowKeysChange(
      Array.from(
        nextKeys,
      ),
    );
  };


  const handleSelectRow = (
    row,
    index,
    checked,
  ) => {
    if (
      !onSelectedRowKeysChange
    ) {
      return;
    }


    const rowKey =
      getRowKey(
        row,
        index,
      );


    const nextKeys =
      new Set(
        selectedKeys,
      );


    if (checked) {
      nextKeys.add(
        rowKey,
      );
    } else {
      nextKeys.delete(
        rowKey,
      );
    }


    onSelectedRowKeysChange(
      Array.from(
        nextKeys,
      ),
    );
  };


  /* =====================================================
   * SERVER-AWARE FILTER HANDLERS
   * ===================================================== */

  const setFilter = (
    columnKey,
    value,
  ) => {
    const next = {
      ...columnFilters,
      [columnKey]:
        value,
    };


    setColumnFilters(
      next,
    );


    /*
     * Route page can debounce
     * this before calling API.
     */
    if (serverSide) {
      onFilterChange?.(
        next,
      );
    }
  };


  const clearColumnFilter = (
    columnKey,
  ) => {
    const next = {
      ...columnFilters,
    };


    delete next[
      columnKey
    ];


    setColumnFilters(
      next,
    );


    if (serverSide) {
      onFilterChange?.(
        next,
      );
    }
  };


  /* =====================================================
   * SERVER-AWARE SORT HANDLER
   * ===================================================== */

  const applySort = (
    column,
    direction,
  ) => {
    const nextSort = {
      key: column.key,
      direction,
    };


    setSortConfig(
      nextSort,
    );


    if (serverSide) {
      onSortChange?.(
        nextSort,
      );
    }


    setOpenTools(
      null,
    );
  };


  const clearSort = () => {
    const emptySort = {
      key: "",
      direction: "",
    };


    setSortConfig(
      emptySort,
    );


    if (serverSide) {
      onSortChange?.(
        emptySort,
      );
    }
  };


  const clearAllColumnTools =
    () => {
      setColumnFilters(
        {},
      );

      setSortConfig({
        key: "",
        direction: "",
      });

      setOpenTools(
        null,
      );


      if (serverSide) {
        onFilterChange?.(
          {},
        );

        onSortChange?.({
          key: "",
          direction: "",
        });
      }
    };


  const hasActiveColumnTools =
    Object.values(
      columnFilters,
    ).some(
      (value) =>
        String(
          value || "",
        ).trim(),
    ) ||
    Boolean(
      sortConfig.key,
    );


  /* =====================================================
   * COLUMN TOOL POPUP POSITION
   * ===================================================== */

  const calculateMenuPosition = (
    buttonRect,
  ) => {
    const viewportWidth =
      window.innerWidth;

    const viewportHeight =
      window.innerHeight;


    let left =
      buttonRect.left;


    left =
      Math.max(
        VIEWPORT_GAP,
        left,
      );


    if (
      left +
        MENU_WIDTH >
      viewportWidth -
        VIEWPORT_GAP
    ) {
      left =
        viewportWidth -
        MENU_WIDTH -
        VIEWPORT_GAP;
    }


    const estimatedHeight =
      360;


    const roomBelow =
      viewportHeight -
      buttonRect.bottom;


    let top =
      buttonRect.bottom +
      MENU_GAP;


    if (
      roomBelow <
      estimatedHeight +
        MENU_GAP
    ) {
      top =
        Math.max(
          VIEWPORT_GAP,
          buttonRect.top -
            estimatedHeight -
            MENU_GAP,
        );
    }


    return {
      left,
      top,
    };
  };


  const handleOpenColumnTools =
    (
      column,
      event,
    ) => {
      const button =
        event.currentTarget;


      const buttonRect =
        button.getBoundingClientRect();


      setOpenTools(
        (previous) => {
          if (
            previous?.key ===
            column.key
          ) {
            return null;
          }


          return {
            key:
              column.key,

            buttonRect: {
              left:
                buttonRect.left,

              top:
                buttonRect.top,

              right:
                buttonRect.right,

              bottom:
                buttonRect.bottom,

              width:
                buttonRect.width,

              height:
                buttonRect.height,
            },

            ...calculateMenuPosition(
              buttonRect,
            ),
          };
        },
      );
    };


  /* =====================================================
   * CLOSE POPUP ON OUTSIDE CLICK
   * ===================================================== */

  useEffect(() => {
    if (!openTools) {
      return undefined;
    }


    const handlePointerDown =
      (event) => {
        const clickedInsideMenu =
          menuRef.current?.contains(
            event.target,
          );


        const clickedToolButton =
          event.target?.closest?.(
            "[data-datatable-column-tool='true']",
          );


        if (
          !clickedInsideMenu &&
          !clickedToolButton
        ) {
          setOpenTools(
            null,
          );
        }
      };


    document.addEventListener(
      "mousedown",
      handlePointerDown,
    );


    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointerDown,
      );
    };
  }, [
    openTools,
  ]);


  /*
   * Close filter popup if table/page scrolls.
   */
  useEffect(() => {
    if (!openTools) {
      return undefined;
    }


    const close =
      () =>
        setOpenTools(
          null,
        );


    window.addEventListener(
      "resize",
      close,
    );


    window.addEventListener(
      "scroll",
      close,
      true,
    );


    return () => {
      window.removeEventListener(
        "resize",
        close,
      );


      window.removeEventListener(
        "scroll",
        close,
        true,
      );
    };
  }, [
    openTools,
  ]);


  /* =====================================================
   * ACTIVE COLUMN TOOL DATA
   * ===================================================== */

  const activeColumn =
    openTools
      ? columns.find(
          (column) =>
            column.key ===
            openTools.key,
        )
      : null;


  const activeFilterValue =
    activeColumn
      ? columnFilters[
          activeColumn.key
        ] || ""
      : "";


  const activeIsSorted =
    activeColumn
      ? sortConfig.key ===
        activeColumn.key
      : false;


  const activeValues =
    activeColumn &&
    !serverSide
      ? uniqueValuesByColumn[
          activeColumn.key
        ] || []
      : [];


  const showActiveQuickValues =
    !serverSide &&
    activeValues.length >
      0 &&
    activeValues.length <=
      20;


  /* =====================================================
   * COLUMN TOOL PORTAL
   * ===================================================== */

  const columnToolsPortal =
    activeColumn &&
    openTools &&
    typeof document !==
      "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[99999] w-72 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            style={{
              left:
                `${openTools.left}px`,
              top:
                `${openTools.top}px`,
            }}
          >
            <div className="max-h-[min(420px,70vh)] overflow-y-auto p-3">

              <div className="mb-2 flex items-center justify-between gap-2">

                <div className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {
                    activeColumn.header
                  }
                </div>


                <button
                  type="button"
                  onClick={() =>
                    setOpenTools(
                      null,
                    )
                  }
                  className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Close column filter"
                >
                  <X className="size-3.5" />
                </button>

              </div>


              {/* FILTER SEARCH */}

              <div className="relative">

                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />


                <input
                  type="text"
                  value={
                    activeFilterValue
                  }
                  onChange={(
                    event,
                  ) =>
                    setFilter(
                      activeColumn.key,
                      event.target.value,
                    )
                  }
                  placeholder={`Search ${String(
                    activeColumn.header,
                  ).toLowerCase()}...`}
                  className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-9 text-sm font-normal text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  autoFocus
                />


                {activeFilterValue && (
                  <button
                    type="button"
                    onClick={() =>
                      clearColumnFilter(
                        activeColumn.key,
                      )
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Clear ${activeColumn.header} filter`}
                  >
                    <X className="size-3.5" />
                  </button>
                )}

              </div>


              {/* SORT BUTTONS */}

              <div className="mt-3 grid grid-cols-2 gap-2">

                <button
                  type="button"
                  onClick={() =>
                    applySort(
                      activeColumn,
                      "asc",
                    )
                  }
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition",

                    activeIsSorted &&
                    sortConfig.direction ===
                      "asc"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary hover:text-primary",
                  )}
                >
                  <ArrowUp className="size-3.5" />

                  Ascending
                </button>


                <button
                  type="button"
                  onClick={() =>
                    applySort(
                      activeColumn,
                      "desc",
                    )
                  }
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition",

                    activeIsSorted &&
                    sortConfig.direction ===
                      "desc"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary hover:text-primary",
                  )}
                >
                  <ArrowDown className="size-3.5" />

                  Descending
                </button>

              </div>


              {/* QUICK VALUES - CLIENT MODE ONLY */}

              {showActiveQuickValues && (
                <div className="mt-3 border-t border-border pt-3">

                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Values
                  </div>


                  <div className="space-y-1">

                    <button
                      type="button"
                      onClick={() => {
                        clearColumnFilter(
                          activeColumn.key,
                        );

                        setOpenTools(
                          null,
                        );
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      All
                    </button>


                    {activeValues.map(
                      (value) => (
                        <button
                          key={`${activeColumn.key}-${value}`}
                          type="button"
                          onClick={() => {
                            setFilter(
                              activeColumn.key,
                              value,
                            );

                            setOpenTools(
                              null,
                            );
                          }}
                          className={cn(
                            "block w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition hover:bg-muted",

                            activeFilterValue ===
                              value
                              ? "bg-primary/10 text-primary"
                              : "text-foreground",
                          )}
                        >
                          {value}
                        </button>
                      ),
                    )}

                  </div>

                </div>
              )}


              {/* CLEAR CURRENT COLUMN */}

              <div className="mt-3 flex justify-end border-t border-border pt-3">

                <button
                  type="button"
                  onClick={() => {
                    clearColumnFilter(
                      activeColumn.key,
                    );


                    if (
                      sortConfig.key ===
                      activeColumn.key
                    ) {
                      clearSort();
                    }


                    setOpenTools(
                      null,
                    );
                  }}
                  className="text-xs font-semibold text-muted-foreground hover:text-primary"
                >
                  Clear this column
                </button>

              </div>

            </div>
          </div>,

          document.body,
        )
      : null;


  /* =====================================================
   * RENDER
   * ===================================================== */

  return (
    <>

      <div
        ref={tableRef}
        className={cn(
          "relative max-h-[60vh] overflow-auto rounded-2xl border border-border bg-card shadow-sm",
          className,
        )}
      >

        {/* CLEAR ALL FILTERS */}

        {enableColumnTools &&
          hasActiveColumnTools && (
            <div className="sticky left-0 top-0 z-[70] flex justify-end border-b border-border bg-card/95 px-3 py-2 backdrop-blur">

              <button
                type="button"
                onClick={
                  clearAllColumnTools
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                <X className="size-3.5" />

                Clear table filters
              </button>

            </div>
          )}


        <table className="w-full table-fixed border-collapse text-sm">

          <thead className="sticky top-0 z-40 bg-slate-50 transition-colors duration-300 dark:bg-slate-800">

            <tr>

              {selectable && (
                <th className="w-12 min-w-[48px] max-w-[48px] px-2 py-3 text-center align-middle">

                  <input
                    type="checkbox"
                    checked={
                      allSelected
                    }
                    onChange={(
                      event,
                    ) =>
                      handleSelectAll(
                        event.target
                          .checked,
                      )
                    }
                    className="h-4 w-4 rounded border border-border text-primary focus:ring-primary"
                    aria-label="Select all visible rows"
                  />

                </th>
              )}


              {columns.map(
                (column) => {
                  const colClass =
                    column.key ===
                    "actions"
                      ? "text-center w-[120px]"
                      : column.className ||
                        "text-center";


                  const toolsEnabled =
                    columnCanUseTools(
                      column,
                    );


                  const filterValue =
                    columnFilters[
                      column.key
                    ] || "";


                  const isSorted =
                    sortConfig.key ===
                    column.key;


                  return (
                    <th
                      key={
                        column.key
                      }
                      className={cn(
                        "sticky top-0 z-50 border-b border-slate-200 bg-slate-50 px-4 py-3 align-middle text-xs font-semibold uppercase text-slate-700 transition-colors duration-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
                        colClass,
                      )}
                    >

                      <div className="flex items-center justify-center gap-1.5">

                        <span className="whitespace-normal break-words">
                          {
                            column.header
                          }
                        </span>


                        {toolsEnabled && (
                          <button
                            type="button"
                            data-datatable-column-tool="true"
                            onClick={(
                              event,
                            ) =>
                              handleOpenColumnTools(
                                column,
                                event,
                              )
                            }
                            className={cn(
                              "inline-flex size-7 shrink-0 items-center justify-center rounded-lg border transition",

                              filterValue ||
                              isSorted
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-transparent text-slate-400 hover:border-slate-300 hover:bg-white hover:text-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-900 dark:hover:text-slate-100",
                            )}
                            title={`Filter or sort ${column.header}`}
                          >

                            {isSorted &&
                            sortConfig.direction ===
                              "asc" ? (

                              <ArrowUp className="size-3.5" />

                            ) : isSorted &&
                              sortConfig.direction ===
                                "desc" ? (

                              <ArrowDown className="size-3.5" />

                            ) : filterValue ? (

                              <Filter className="size-3.5" />

                            ) : (

                              <ArrowUpDown className="size-3.5" />

                            )}

                          </button>
                        )}

                      </div>

                    </th>
                  );
                },
              )}

            </tr>

          </thead>


          <tbody>

            {/* LOADING */}

            {isTableLoading ? (

              <tr>

                <td
                  colSpan={
                    columns.length +
                    (
                      selectable
                        ? 1
                        : 0
                    )
                  }
                  className="px-6 py-10 text-center align-middle"
                >

                  <div className="flex min-h-[170px] w-full items-center justify-center bg-background">

                    <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">

                      <Loader2 className="size-7 animate-spin text-primary" />


                      <div>

                        <p className="text-sm font-semibold text-foreground">
                          {
                            resolvedLoadingTitle
                          }
                        </p>


                        {resolvedLoadingDescription && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {
                              resolvedLoadingDescription
                            }
                          </p>
                        )}

                      </div>

                    </div>

                  </div>

                </td>

              </tr>

            ) : displayedRows.length >
              0 ? (

              displayedRows.map(
                (
                  {
                    row,
                    originalIndex,
                  },
                  visibleIndex,
                ) => {

                  const rowKey =
                    getRowKey(
                      row,
                      originalIndex,
                    );


                  return (
                    <tr
                      key={
                        rowKey
                      }
                      className={cn(
                        "border-t border-border transition-colors hover:bg-secondary/40",

                        visibleIndex %
                          2 ===
                          0
                          ? "bg-background"
                          : "bg-card",
                      )}
                    >

                      {selectable && (
                        <td className="w-12 min-w-[48px] max-w-[48px] px-2 py-3 text-center align-middle">

                          <input
                            type="checkbox"
                            checked={
                              selectedKeys.has(
                                rowKey,
                              )
                            }
                            onChange={(
                              event,
                            ) =>
                              handleSelectRow(
                                row,
                                originalIndex,
                                event.target
                                  .checked,
                              )
                            }
                            className="mx-auto block h-4 w-4 rounded border border-border text-primary focus:ring-primary"
                            aria-label={`Select row ${visibleIndex + 1}`}
                          />

                        </td>
                      )}


                      {columns.map(
                        (
                          column,
                        ) => {

                          const colClass =
                            column.key ===
                            "actions"
                              ? "text-center w-[120px]"
                              : column.className ||
                                "text-center";


                          return (
                            <td
                              key={`${column.key}-${rowKey}`}
                              className={cn(
                                "min-w-0 overflow-visible whitespace-normal break-words px-4 py-3 align-middle text-sm",
                                colClass,
                              )}
                            >

                              {column.render
                                ? column.render(
                                    row,
                                    originalIndex,
                                  )
                                : String(
                                    row?.[
                                      column
                                        .key
                                    ] ??
                                      "",
                                  )}

                            </td>
                          );
                        },
                      )}

                    </tr>
                  );
                },
              )

            ) : hideEmptyState ? null : (

              <tr>

                <td
                  colSpan={
                    columns.length +
                    (
                      selectable
                        ? 1
                        : 0
                    )
                  }
                  className="px-6 py-10 text-center text-sm text-muted-foreground"
                >

                  {hasActiveColumnTools &&
                  !serverSide
                    ? "No rows match the current table filters."
                    : "No data available."}

                </td>

              </tr>

            )}

          </tbody>

        </table>

      </div>


      {columnToolsPortal}

    </>
  );
}


/* =========================================================
 * STATUS BADGE
 * ========================================================= */

export function StatusBadge({
  status,
  rejectedBy,
}) {
  const value =
    String(
      status || "",
    ).toUpperCase();


  const tone = {
    PENDING:
      "bg-gray-100 text-gray-800 border border-gray-300",

    REQUESTED:
      "bg-yellow-100 text-yellow-800 border border-yellow-300",

    PENDING_ADMIN:
      "bg-yellow-100 text-yellow-800 border border-yellow-300",

    PENDING_MANAGER:
      "bg-yellow-100 text-yellow-800 border border-yellow-300",

    PENDING_FINANCE:
      "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700",

    MANAGER_APPROVED:
      "bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700",

    ADMIN_APPROVED:
      "bg-cyan-100 text-cyan-800 border border-cyan-300 dark:bg-cyan-900 dark:text-cyan-200 dark:border-cyan-700",

    APPROVED:
      "bg-green-100 text-green-800 border border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700",

    FINANCE_APPROVED:
      "bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700",

    FINANCE_REJECTED:
      "bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-900 dark:text-rose-200 dark:border-rose-700",

    ORDERED:
      "bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-700",

    DELIVERED:
      "bg-green-100 text-green-800 border border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700",

    REJECTED:
      "bg-red-100 text-red-800 border border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700",

    MANAGER_REJECTED:
      "bg-red-100 text-red-800 border border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700",

    COMPLETED:
      "bg-green-100 text-green-800 border border-green-300",

    PASS:
      "bg-green-100 text-green-800 border border-green-300",

    FAIL:
      "bg-red-100 text-red-800 border border-red-300",

    ACTIVE:
      "bg-green-100 text-green-800 border border-green-300",

    INACTIVE:
      "bg-red-100 text-red-800 border border-red-300",
  };


  const labelMap = {
    PENDING:
      "Pending",

    REQUESTED:
      "Requested",

    PENDING_ADMIN:
      "Pending Admin",

    PENDING_MANAGER:
      "Pending Manager",

    PENDING_FINANCE:
      "Pending Finance",

    MANAGER_APPROVED:
      "Manager Approved",

    ADMIN_APPROVED:
      "Admin Approved",

    FINANCE_APPROVED:
      "Finance Approved",

    FINANCE_REJECTED:
      "Finance Rejected",

    APPROVED:
      "Approved",

    ORDERED:
      "Ordered",

    DELIVERED:
      "Delivered",

    REJECTED:
      "Rejected",

    MANAGER_REJECTED:
      "Manager Rejected",

    COMPLETED:
      "Completed",

    PASS:
      "Pass",

    FAIL:
      "Fail",

    ACTIVE:
      "Active",

    INACTIVE:
      "Inactive",
  };


  const rejectLabel = () => {
    const actor =
      String(
        rejectedBy || "",
      )
        .trim()
        .toLowerCase();


    if (
      value ===
      "MANAGER_REJECTED"
    ) {
      return (
        "Manager Rejected"
      );
    }


    if (
      actor ===
      "manager"
    ) {
      return (
        "Manager Rejected"
      );
    }


    if (
      actor ===
      "admin"
    ) {
      return (
        "Admin Rejected"
      );
    }


    return "Rejected";
  };


  const label =
    value ===
      "REJECTED" ||
    value ===
      "MANAGER_REJECTED"
      ? rejectLabel()
      : labelMap[
          value
        ] ||
        value.replace(
          /_/g,
          " ",
        );


  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",

        tone[value] ??
          "bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
      )}
    >
      {label}
    </span>
  );
}