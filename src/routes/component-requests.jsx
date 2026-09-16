import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ExternalLink,
  Pencil,
  Plus,
  Save,
  X,
} from "lucide-react";

import {
  PageHeader,
  PageShell,
} from "@/components/app/PageShell";
import { DataTable } from "@/components/app/DataTable";

import {
  fetchAuthenticatedJson,
} from "@/api";

const COMPONENT_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;
const COMPONENT_CATEGORY_OPTIONS = [
  "ACCESSORIES",
  "AIRFRAMES",
  "COMMUNICATION",
  "ELECTRICALS",
  "ELECTRONICS",
  "PAYLOAD",
  "TOOLS",
];
const EMPTY_EDIT_FORM = {
  component_id: "",
  version: "",
  category: "",
  component_type: "",
  product_link: "",
  specification: "",
  hsn_no: "",
  sku_no: "",
  part_no: "",
  tally_reference: "",
};


function normalizeRequest(row) {
  return {
    id: row.id,
    component_id:
      row.component_id ||
      row.id ||
      "",
    version:
      row.version || "",
    category:
      row.category || "",
    component_type:
      row.component_type ||
      row.componentType ||
      "",
    product_link:
      row.product_link || "",
    specification:
      row.specification ||
      row.specifications ||
      "",
    hsn_no:
      row.hsn_no ||
      row.hsn_numbers ||
      "",
    sku_no:
      row.sku_no ||
      row.sku_numbers ||
      "",
    part_no:
      row.part_no ||
      row.part_numbers ||
      "",
    tally_reference:
      row.tally_reference || "",
    date:
      row.date ||
      row.created_at ||
      row.createdAt ||
      "",
  };
}


function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  return `${day}-${month}-${date.getFullYear()}`;
}


function getErrorMessage(error) {
  return (
    error?.message ||
    "Unable to update the component."
  );
}


function Page() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] =
    useState(true);
  const [searchTerm, setSearchTerm] =
    useState("");

  const [
    debouncedSearch,
    setDebouncedSearch,
  ] = useState("");

  const [page, setPage] =
    useState(1);

  const [totalCount, setTotalCount] =
    useState(0);

  const [
    hasNextPage,
    setHasNextPage,
  ] = useState(false);

  const [
    hasPreviousPage,
    setHasPreviousPage,
  ] = useState(false);

  const [loadError, setLoadError] =
    useState("");
  const [
    selectedRowKeys,
    setSelectedRowKeys,
  ] = useState([]);

  const [
    selectionMode,
    setSelectionMode,
  ] = useState(false);

  const [
    selectedRow,
    setSelectedRow,
  ] = useState(null);

  const [isEditing, setIsEditing] =
    useState(false);

  const [editForm, setEditForm] =
    useState(EMPTY_EDIT_FORM);

  const [saving, setSaving] =
    useState(false);

  const [popupError, setPopupError] =
    useState("");


  /*
   * Wait 300 ms after typing before sending
   * the search request to Django.
   */
  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        setDebouncedSearch(
          searchTerm.trim(),
        );

        setPage(1);
      }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchTerm]);


  /*
   * Reload whenever page/search changes.
   */
  useEffect(() => {
    void loadComponentRequests();
  }, [page, debouncedSearch]);


  async function loadComponentRequests() {
    try {
      setLoading(true);
      setLoadError("");

      const params =
        new URLSearchParams({
          paginate: "1",
          page: String(page),
          page_size: String(
            COMPONENT_PAGE_SIZE,
          ),
        });

      if (debouncedSearch) {
        params.set(
          "search",
          debouncedSearch,
        );
      }

      const data =
        await fetchAuthenticatedJson(
          `/components/components/?${params.toString()}`,
        );

      const remote =
        Array.isArray(data)
          ? data
          : Array.isArray(
                data?.results,
              )
            ? data.results
            : [];

      setRows(
        remote.map(
          normalizeRequest,
        ),
      );

      /*
       * Compatibility:
       * If backend still returns old [] format,
       * this page will still work.
       */
      if (Array.isArray(data)) {
        setTotalCount(
          remote.length,
        );

        setHasNextPage(false);
        setHasPreviousPage(false);
      } else {
        setTotalCount(
          Number(
            data?.count || 0,
          ),
        );

        setHasNextPage(
          Boolean(data?.next),
        );

        setHasPreviousPage(
          Boolean(data?.previous),
        );
      }
    } catch (error) {
      console.error(
        "Component requests load failed:",
        error,
      );

      setRows([]);
      setTotalCount(0);
      setHasNextPage(false);
      setHasPreviousPage(false);

      setLoadError(
        error?.message ||
          "Unable to load components.",
      );
    } finally {
      setLoading(false);
    }
  }



  const openComponentDetails = (row) => {
    setSelectedRow(row);
    setEditForm({
      component_id:
        row.component_id || "",
      version:
        row.version || "",
      category:
        row.category || "",
      component_type:
        row.component_type || "",
      product_link:
        row.product_link || "",
      specification:
        row.specification || "",
      hsn_no:
        row.hsn_no || "",
      sku_no:
        row.sku_no || "",
      part_no:
        row.part_no || "",
      tally_reference:
        row.tally_reference || "",
    });

    setPopupError("");
    setIsEditing(false);
  };


  const closeComponentDetails = () => {
    if (saving) return;

    setSelectedRow(null);
    setEditForm(EMPTY_EDIT_FORM);
    setPopupError("");
    setIsEditing(false);
  };


  const startEditing = () => {
    setPopupError("");
    setIsEditing(true);
  };


  const cancelEditing = () => {
    if (!selectedRow) return;

    setEditForm({
      component_id:
        selectedRow.component_id || "",
      version:
        selectedRow.version || "",
      category:
        selectedRow.category || "",
      component_type:
        selectedRow.component_type || "",
      product_link:
        selectedRow.product_link || "",
      specification:
        selectedRow.specification || "",
      hsn_no:
        selectedRow.hsn_no || "",
      sku_no:
        selectedRow.sku_no || "",
      part_no:
        selectedRow.part_no || "",
      tally_reference:
        selectedRow.tally_reference || "",
    });

    setPopupError("");
    setIsEditing(false);
  };


  const updateEditField = (
    field,
    value,
  ) => {
    setPopupError("");

    setEditForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };


  const saveComponentChanges =
    async () => {
      if (!selectedRow?.id) {
        setPopupError(
          "Component record ID is missing.",
        );
        return;
      }

      try {
        setSaving(true);
        setPopupError("");

        const payload = {
          version:
            editForm.version.trim(),
          category:
            editForm.category.trim(),
          component_type:
            editForm.component_type.trim(),
          product_link:
            editForm.product_link.trim(),
          specification:
            editForm.specification.trim(),
          hsn_no:
            editForm.hsn_no.trim(),
          sku_no:
            editForm.sku_no.trim(),
          part_no:
            editForm.part_no.trim(),
          tally_reference:
            editForm
              .tally_reference
              .trim(),
        };

        const response =
          await fetchAuthenticatedJson(
            `/components/components/${selectedRow.id}/`,
            {
              method: "PATCH",
              body: JSON.stringify(
                payload,
              ),
            },
          );

        const updatedRow =
          normalizeRequest({
            ...selectedRow,
            ...payload,
            ...(response || {}),
          });

        setRows((previous) =>
          previous.map((row) =>
            String(row.id) ===
            String(selectedRow.id)
              ? updatedRow
              : row,
          ),
        );

        setSelectedRow(updatedRow);

        setEditForm({
          component_id:
            updatedRow.component_id ||
            "",
          version:
            updatedRow.version || "",
          category:
            updatedRow.category || "",
          component_type:
            updatedRow.component_type || "",
          product_link:
            updatedRow.product_link ||
            "",
          specification:
            updatedRow.specification ||
            "",
          hsn_no:
            updatedRow.hsn_no || "",
          sku_no:
            updatedRow.sku_no || "",
          part_no:
            updatedRow.part_no || "",
          tally_reference:
            updatedRow
              .tally_reference ||
            "",
        });

        setIsEditing(false);
      } catch (error) {
        console.error(
          "Component update failed:",
          error,
        );

        setPopupError(
          getErrorMessage(error),
        );
      } finally {
        setSaving(false);
      }
    };


  const handleEnableSelectionMode =
    () => {
      setSelectedRowKeys([]);
      setSelectionMode(true);
    };


  const handleCancelSelectionMode =
    () => {
      setSelectedRowKeys([]);
      setSelectionMode(false);
    };


const handleDeleteSelected =
  async () => {
    if (!selectedRowKeys.length) {
      return;
    }

    try {
      await Promise.all(
        selectedRowKeys.map((id) =>
          fetchAuthenticatedJson(
            `/components/components/${id}/`,
            {
              method: "DELETE",
            },
          ),
        ),
      );

      setSelectedRowKeys([]);
      setSelectionMode(false);

      await loadComponentRequests();
    } catch (error) {
      console.error(
        "Failed to delete selected component requests:",
        error,
      );

      window.alert(
        "Unable to delete selected component requests. Please try again.",
      );
    }
  };

const categoryOptions = Array.from(
  new Set(
    [
      ...COMPONENT_CATEGORY_OPTIONS,
      editForm.category,
    ].filter(Boolean),
  ),
);


  const detailFields = [
    {
      key: "component_id",
      label: "Component ID",
      readOnly: true,
    },
    {
      key: "version",
      label: "Version",
    },
    {
      key: "category",
      label: "Category",
      select: true,
    },
    {
      key: "component_type",
      label: "Component Type",
    },
    {
      key: "product_link",
      label: "Product Link",
      type: "url",
    },
    {
      key: "specification",
      label: "Specification",
    },
    {
      key: "hsn_no",
      label: "HSN No.",
    },
    {
      key: "sku_no",
      label: "SKU No.",
    },
    {
      key: "part_no",
      label: "Part No.",
    },
    {
      key: "tally_reference",
      label: "Tally Reference",
    },
  ];


  return (
    <PageShell>
      <PageHeader
        title="Components"
        subtitle="Components from inventory."
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={
                selectionMode
                  ? handleDeleteSelected
                  : handleEnableSelectionMode
              }
              disabled={
                selectionMode &&
                selectedRowKeys.length === 0
              }
              className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor:
                  "#E85D75",
              }}
            >
              {selectionMode
                ? `Delete Selected (${selectedRowKeys.length})`
                : "Delete"}
            </button>

            {selectionMode ? (
              <button
                type="button"
                onClick={
                  handleCancelSelectionMode
                }
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
            ) : null}

            <Link
              to="/component-requests/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" />
              New Request
            </Link>
          </div>
        }
      />
      <div className="flex h-[calc(100vh-170px)] min-h-0 flex-col overflow-hidden">
      {/* COMPONENT SEARCH */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-md">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(
                event.target.value
              )
            }
            placeholder="Search component ID, name or type..."
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="text-sm text-muted-foreground">
          {loading
            ? "Loading..."
            : `${totalCount} component(s)`}
        </div>
      </div>

      {/* API ERROR */}
      {loadError ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />

          <span>
            {loadError}
          </span>
        </div>
      ) : null}
      {/*
       * Keep the complete Components table inside the available page width.
       * table-fixed + percentage columns prevents the table from growing
       * wider than the card, and long values wrap instead of creating a
       * left/right horizontal scrollbar.
       */}
<div
  className="
    w-full
    max-w-full
    min-h-0
    max-h-[calc(100vh-360px)]
    overflow-x-hidden
    overflow-y-hidden
    [&_table]:w-full
    [&_table]:max-w-full
    [&_table]:table-fixed
    [&_th]:whitespace-normal
    [&_td]:whitespace-normal
    [&_th]:break-words
    [&_td]:break-words
    [&_th]:px-2
    [&_td]:px-2
    [&_th]:text-xs
    [&_td]:text-xs
  "
>
  <DataTable
          loading={loading}
          loadingTitle="Loading Component records..."
          loadingDescription="Fetching the latest component and inventory details."
          enableColumnTools
          selectable={selectionMode}
        selectedRowKeys={
          selectedRowKeys
        }
        onSelectedRowKeysChange={
          setSelectedRowKeys
        }
        selectionKey="id"
        columns={[
          {
            key: "component_id",
            header: "Component ID",
            className:
              "w-[11%] px-2 text-center font-mono text-xs whitespace-normal break-words",
            render: (row) => (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() =>
                    openComponentDetails(
                      row,
                    )
                  }
                  className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  {row.component_id}
                </button>
              </div>
            ),
          },
          {
            key: "version",
            header: "Version",
            className:
              "w-[8%] px-2 text-center text-xs whitespace-normal break-words",
            render: (row) => (
              <div className="text-center">
                {row.version || "-"}
              </div>
            ),
          },
          {
            key: "category",
            header: "Category",
            className:
              "w-[11%] px-2 text-center text-xs whitespace-normal break-words",
          },
          {
            key: "component_type",
            header: "Component Type",
            className:
              "w-[14%] px-2 text-center text-xs whitespace-normal break-words",
            render: (row) => (
              <div className="break-words text-center leading-5">
                {row.component_type || "-"}
              </div>
            ),
          },
          {
            key: "specification",
            header: "Specification",
            className:
              "w-[20%] px-2 text-center text-xs whitespace-normal break-words",
            render: (row) => (
              <div
                className="break-words text-center leading-5"
                title={row.specification || ""}
              >
                {row.specification || "-"}
              </div>
            ),
          },
          {
            key: "product_link",
            header: "Product Link",
            className:
              "w-[8%] px-2 text-center text-xs whitespace-normal break-words",
            render: (row) => (
              <div className="flex justify-center">
                {row.product_link ? (
                  <a
                    href={row.product_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={row.product_link}
                    aria-label={`Open product link for ${
                      row.component_id
                    }`}
                    className="font-medium text-primary underline underline-offset-4 transition hover:text-primary/80"
                  >
                    Link
                  </a>
                ) : (
                  "-"
                )}
              </div>
            ),
          },
          {
            key: "date",
            header: "Date",
            className:
              "w-[11%] px-2 text-center text-xs whitespace-normal break-words",
            sortValue: (row) => {
              const timestamp =
                new Date(row.date).getTime();

              return Number.isNaN(timestamp)
                ? String(row.date || "")
                : timestamp;
            },
            filterValue: (row) =>
              formatDate(row.date),
            render: (row) => (
              <div className="text-center">
                {formatDate(row.date)}
              </div>
            ),
          },
        ]}
          rows={rows}
        />
      </div>

{(
  totalCount > COMPONENT_PAGE_SIZE ||
  page > 1
) ? (
  <div className="mt-3 flex shrink-0 items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
    <div className="text-sm text-muted-foreground">
      Page {page}
    </div>

    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() =>
          setPage((previous) =>
            Math.max(
              1,
              previous - 1
            )
          )
        }
        disabled={
          loading ||
          !hasPreviousPage
        }
        className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        Previous
      </button>

      <button
        type="button"
        onClick={() =>
          setPage((previous) =>
            previous + 1
          )
        }
        disabled={
          loading ||
          !hasNextPage
        }
        className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        Next
      </button>
    </div>
  </div>
) : null}
</div>
      {selectedRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-8"
          onClick={
            closeComponentDetails
          }
        >
          <div
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-xl font-bold">
                  Component Details
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedRow.component_id}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Pencil className="size-4" />
                    Edit
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={
                    closeComponentDetails
                  }
                  disabled={saving}
                  className="rounded-full p-2 hover:bg-muted disabled:opacity-50"
                  aria-label="Close component details"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-6">
              {popupError ? (
                <div className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{popupError}</span>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {detailFields.map(
                  (field) => (
                    <div
                      key={field.key}
                      className="min-w-0"
                    >
                      <label className="mb-1.5 block text-sm font-semibold">
                        {field.label}
                        {field.required
                          ? " *"
                          : ""}
                      </label>

                      {isEditing ? (
                        field.readOnly ? (
                          <div className="h-10 w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                            {selectedRow[
                              field.key
                            ] || "-"}
                          </div>
                        ) : field.select ? (
                          <select
                            value={
                              editForm[
                                field.key
                              ] || ""
                            }
                            onChange={(
                              event,
                            ) =>
                              updateEditField(
                                field.key,
                                event.target
                                  .value,
                              )
                            }
                            className="h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          >
                            <option value="">
                              Select Category
                            </option>

                            {editForm.category &&
                            !categoryOptions.includes(
                              editForm.category,
                            ) ? (
                              <option
                                value={
                                  editForm.category
                                }
                              >
                                {
                                  editForm.category
                                }
                              </option>
                            ) : null}

                            {categoryOptions.map(
                              (category) => (
                                <option
                                  key={category}
                                  value={category}
                                >
                                  {category}
                                </option>
                              ),
                            )}
                          </select>
                        ) : field.multiline ? (
                          <textarea
                            value={
                              editForm[
                                field.key
                              ] || ""
                            }
                            onChange={(
                              event,
                            ) =>
                              updateEditField(
                                field.key,
                                event.target
                                  .value,
                              )
                            }
                            rows={4}
                            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                        ) : (
                          <input
                            type={
                              field.type ||
                              "text"
                            }
                            value={
                              editForm[
                                field.key
                              ] || ""
                            }
                            onChange={(
                              event,
                            ) =>
                              updateEditField(
                                field.key,
                                event.target
                                  .value,
                              )
                            }
                            required={
                              field.required
                            }
                            className="h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                        )
                      ) : field.key ===
                          "product_link" &&
                        selectedRow[
                          field.key
                        ] ? (
                        <a
                          href={
                            selectedRow[
                              field.key
                            ]
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-10 w-full items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-primary underline"
                        >
                          {
                            selectedRow[
                              field.key
                            ]
                          }
                          <ExternalLink className="size-4 shrink-0" />
                        </a>
                      ) : (
                        <div className="h-10 w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                          {selectedRow[
                            field.key
                          ] || "-"}
                        </div>
                      )}
                    </div>
                  ),
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-semibold">
                    Created Date
                  </label>

                  <div className="h-10 w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                    {formatDate(
                      selectedRow.date,
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={saving}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={
                      saveComponentChanges
                    }
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Save className="size-4" />
                    {saving
                      ? "Saving..."
                      : "Save Changes"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={
                    closeComponentDetails
                  }
                  className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}


export default Page;