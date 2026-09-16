import { useCostDetails } from "@/components/app/SerialCostDetails";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import {
  PageHeader,
  PageShell,
} from "@/components/app/PageShell";
import { useAuth } from "@/AuthContext";
import { canViewCosting, canWork, getUserRole } from "@/permissions";
import {
  fetchAuthenticatedJson,
} from "@/api";
import config from "@/config";


const today = () =>
  new Date()
    .toISOString()
    .split("T")[0];


const SCRAP_PAGE_SIZE = 50;


const EMPTY_FORM = {
  out_date: today(),
  scrap_origin: "MR",
  material_request: "",
  component: "",
  selected_serials: [],
  quantity: 1,
  remarks: "",

  scrap_mode: "PARTIAL",
};


const unwrapList = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (
    Array.isArray(payload?.results)
  ) {
    return payload.results;
  }

  if (
    Array.isArray(payload?.data)
  ) {
    return payload.data;
  }

  return [];
};


const cleanUserName = (value) => {
  const raw = String(
    value || "",
  ).trim();

  if (!raw) {
    return "User";
  }

  if (raw.includes("@")) {
    return (
      raw.split("@")[0]
        ?.trim() ||
      "User"
    );
  }

  return raw;
};


const getStatus = (row) => {
  if (
    row?.moved_to_inventory === true
  ) {
    return "MOVED_TO_INVENTORY";
  }

  const raw = String(
    row?.approval_status ||
      row?.status ||
      "",
  )
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (
    [
      "REQUESTED",
      "PENDING_MANAGER",
    ].includes(raw)
  ) {
    return "PENDING_MANAGER";
  }

  if (raw === "PENDING_FINANCE") {
    return "PENDING_FINANCE";
  }

  if (
    raw === "MANAGER_APPROVED"
  ) {
    return "MANAGER_APPROVED";
  }

  if (
    [
      "REJECTED",
      "MANAGER_REJECTED",
      "FINANCE_REJECTED",
    ].includes(raw)
  ) {
    return "REJECTED";
  }

  if (raw === "APPROVED") {
    return row?.moved_to_inventory
      ? "MOVED_TO_INVENTORY"
      : "APPROVED";
  }

  return raw || "PENDING_MANAGER";
};


const getStatusLabel = (status) => {
  const labels = {
    PENDING_MANAGER:
      "Pending Manager",
    PENDING_FINANCE:
      "Pending Finance",
    MANAGER_APPROVED:
      "Manager Approved",
    REJECTED:
      "Rejected",
    APPROVED:
      "Approved",
    MOVED_TO_INVENTORY:
      "Moved to Scrap",
  };

  return (
    labels[status] ||
    String(status || "")
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(
        /\b\w/g,
        (letter) =>
          letter.toUpperCase(),
      )
  );
};


const getStatusClass = (status) => {
  if (
    [
      "MANAGER_APPROVED",
      "APPROVED",
    ].includes(status)
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300";
  }

  if (status === "REJECTED") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300";
  }

  if (
    status ===
    "MOVED_TO_INVENTORY"
  ) {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300";
};


export default function ScrapPage() {
  const { openCostDetails, costDetailsPage } = useCostDetails();

  const { user, activeRole } = useAuth();

  const canManageScrap =
    canWork(
      user,
      "scrap",
      activeRole,
    );

  const canSeeCosting =
    canViewCosting(
      user,
      activeRole,
    );

  const [rows, setRows] =
    useState([]);

  const [scrapPage, setScrapPage] =
    useState(1);

  const scrapPageCount = Math.max(
    1,
    Math.ceil(rows.length / SCRAP_PAGE_SIZE),
  );

  const paginatedScrapRows = useMemo(() => {
    const startIndex =
      (scrapPage - 1) * SCRAP_PAGE_SIZE;

    return rows.slice(
      startIndex,
      startIndex + SCRAP_PAGE_SIZE,
    );
  }, [rows, scrapPage]);

  useEffect(() => {
    setScrapPage((currentPage) =>
      Math.min(currentPage, scrapPageCount),
    );
  }, [scrapPageCount]);

  const [
    components,
    setComponents,
  ] = useState([]);

  const [
    mrOptions,
    setMrOptions,
  ] = useState([]);

  const [
    loadingMrOptions,
    setLoadingMrOptions,
  ] = useState(false);

  const [
    showCreate,
    setShowCreate,
  ] = useState(false);

  const [
    form,
    setForm,
  ] = useState(EMPTY_FORM);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const submitLockRef =
    useRef(false);

  const [
    movingId,
    setMovingId,
  ] = useState(null);

  // Custom Move-to-Store confirmation popup.
  // Opening this popup does NOT execute the move.
  // The move happens only after the Engineer clicks OK.
  const [
    moveConfirmation,
    setMoveConfirmation,
  ] = useState(null);

  const [
    moveConfirmationLoading,
    setMoveConfirmationLoading,
  ] = useState(false);

  const [
    moveConfirmationError,
    setMoveConfirmationError,
  ] = useState("");

  const [
    selectionMode,
    setSelectionMode,
  ] = useState(false);

  const [
    selectedRowIds,
    setSelectedRowIds,
  ] = useState([]);

  const [
    deletingSelected,
    setDeletingSelected,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    rejectionDetails,
    setRejectionDetails,
  ] = useState(null);

  const [
    componentDetails,
    setComponentDetails,
  ] = useState(null);

  // Compact Scrap-table serial popup.
  // Selected Qty and Scrap Qty open this popup.
  const [
    serialDetails,
    setSerialDetails,
  ] = useState(null);


  const role = getUserRole(
    user,
    activeRole,
  );

  const requesterName =
    cleanUserName(
      user?.employee_name ||
        user?.employeeName ||
        user?.full_name ||
        user?.fullName ||
        user?.name ||
        user?.username ||
        user?.email ||
        "User",
    );


  const getComponentTableLabel = (row) => {
    const code = String(
      row?.component_code ||
        row?.componentCode ||
        "",
    ).trim();

    const name = String(
      row?.component_name ||
        row?.componentName ||
        "",
    ).trim();

    const productName = String(
      row?.product_name ||
        row?.productName ||
        "",
    ).trim();

    if (
      code &&
      name
    ) {
      return `${code} - ${name}`;
    }

    if (
      code &&
      productName &&
      productName
        .toLowerCase()
        .startsWith(
          code.toLowerCase(),
        )
    ) {
      return productName;
    }

    return (
      productName ||
      name ||
      code ||
      "-"
    );
  };


  const getScrapAuditMetadata = (row) => {
    const raw =
      row?.inventory_allocations ??
      row?.inventoryAllocations ??
      {};

    if (
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw)
    ) {
      return raw;
    }

    if (typeof raw === "string") {
      try {
        const parsed =
          JSON.parse(raw);

        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          return parsed;
        }
      } catch (_error) {
        // Ignore invalid legacy metadata.
      }
    }

    return {};
  };


  const getAuditItems = (
    metadata,
    key,
  ) => {
    const items =
      metadata?.[key];

    return Array.isArray(items)
      ? items
      : [];
  };


  const getAuditSerials = (items) =>
    Array.from(
      new Set(
        (Array.isArray(items)
          ? items
          : []
        )
          .flatMap((item) =>
            Array.isArray(
              item?.serial_numbers
            )
              ? item.serial_numbers
              : Array.isArray(
                  item?.serialNumbers
                )
                ? item.serialNumbers
                : []
          )
          .map((value) =>
            String(
              value || ""
            ).trim()
          )
          .filter(Boolean)
      )
    );


  const getAuditQuantity = (
    items,
  ) => {
    const serials =
      getAuditSerials(items);

    if (serials.length > 0) {
      return serials.length;
    }

    return (
      Array.isArray(items)
        ? items.reduce(
            (sum, item) =>
              sum +
              Math.max(
                Number(
                  item?.quantity || 0
                ) || 0,
                0
              ),
            0
          )
        : 0
    );
  };


  const getAuditComponentSummary =
    (items) => {
      const labels =
        (Array.isArray(items)
          ? items
          : []
        )
          .map((item) =>
            String(
              item?.label ||
                item?.component_name ||
                item?.componentName ||
                item?.component_code ||
                item?.componentCode ||
                ""
            ).trim()
          )
          .filter(Boolean);

      const unique =
        Array.from(
          new Set(labels)
        );

      return unique.length
        ? unique.join(", ")
        : "-";
    };


  const getScrapAudit = (row) => {
    const metadata =
      getScrapAuditMetadata(row);

    const scrapMode = String(
      metadata?.scrap_mode ||
        metadata?.scrapMode ||
        ""
    )
      .trim()
      .toUpperCase();

    const reorderChoice = String(
      metadata?.reorder_choice ||
        metadata?.reorderChoice ||
        ""
    )
      .trim()
      .toUpperCase();

    const goodItems =
      getAuditItems(
        metadata,
        "good_items"
      );

    const selectedItems =
      getAuditItems(
        metadata,
        "selected_items"
      );

    const reorderItems =
      getAuditItems(
        metadata,
        "reorder_items"
      );

    const returnItems =
      getAuditItems(
        metadata,
        "return_items"
      );

    const scrapItems =
      getAuditItems(
        metadata,
        "scrap_items"
      );

    /*
     * FINAL Scrap meaning:
     *
     * scrap_items = Engineer-selected DAMAGED / SCRAP serials.
     * good_items  = Engineer-unselected GOOD / REUSABLE serials.
     *
     * Good components must be visible even BEFORE Manager chooses YES/NO.
     *
     * Legacy fallback order:
     * good_items -> reorder_items -> return_items -> selected_items
     */
    const actionItems =
      goodItems.length
        ? goodItems
        : reorderItems.length
          ? reorderItems
          : returnItems.length
            ? returnItems
            : selectedItems;

    const selectedSerials =
      getAuditSerials(
        actionItems
      );

    const scrapSerials =
      getAuditSerials(
        scrapItems
      );

    const selectedQuantity =
      getAuditQuantity(
        actionItems
      );

    const scrapQuantity =
      getAuditQuantity(
        scrapItems
      ) ||
      (
        scrapMode === "TOTAL"
          ? Number(
              metadata
                ?.scrap_quantity ||
                row?.quantity ||
                0
            ) || 0
          : 0
      );

    return {
      metadata,
      scrapMode,
      reorderChoice,
      selectedItems:
        actionItems,
      scrapItems,
      selectedSerials,
      scrapSerials,
      selectedQuantity,
      scrapQuantity,
      selectedComponents:
        getAuditComponentSummary(
          actionItems
        ),
      scrapComponents:
        getAuditComponentSummary(
          scrapItems
        ),
      sourceMr:
        row
          ?.material_request_number ||
        row
          ?.materialRequestNumber ||
        metadata
          ?.source_mr_number ||
        "-",
      newMr:
        metadata
          ?.replacement_mr_number ||
        metadata
          ?.replacementMrNumber ||
        "",
      returnedInventoryIds:
        Array.isArray(
          metadata
            ?.returned_inventory_ids
        )
          ? metadata
              .returned_inventory_ids
          : [],
      processed:
        Boolean(
          metadata
            ?.disposition_processed
        ),
    };
  };


  const openSerialDetails = (
    title,
    items,
    fallbackSerialNumbers = []
  ) => {
    const sourceItems =
      Array.isArray(items)
        ? items
        : [];

    const groups =
      sourceItems
        .map((item, index) => {
          const code = String(
            item?.component_code ||
              item?.componentCode ||
              ""
          ).trim();

          const name = String(
            item?.component_name ||
              item?.componentName ||
              ""
          ).trim();

          const label = String(
            item?.label ||
              [code, name]
                .filter(Boolean)
                .join(" - ") ||
              `Component ${index + 1}`
          ).trim();

          const serialNumbers =
            Array.from(
              new Set(
                (
                  Array.isArray(
                    item?.serial_numbers
                  )
                    ? item.serial_numbers
                    : Array.isArray(
                        item?.serialNumbers
                      )
                      ? item.serialNumbers
                      : []
                )
                  .map((value) =>
                    String(
                      value || ""
                    ).trim()
                  )
                  .filter(Boolean)
              )
            );

          return {
            code,
            name,
            label,
            serialNumbers,
          };
        })
        .filter(
          (group) =>
            group.label ||
            group.serialNumbers.length >
              0
        );

    /*
     * Legacy fallback:
     * If old records only contain a flat serial list, still show it
     * under one generic component section rather than losing the data.
     */
    if (
      groups.length === 0 &&
      Array.isArray(
        fallbackSerialNumbers
      ) &&
      fallbackSerialNumbers.length >
        0
    ) {
      groups.push({
        code: "",
        name: "",
        label: "Component",
        serialNumbers:
          Array.from(
            new Set(
              fallbackSerialNumbers
                .map((value) =>
                  String(
                    value || ""
                  ).trim()
                )
                .filter(Boolean)
            )
          ),
      });
    }

    setSerialDetails({
      title,
      groups,
    });
  };


  const getRowSerialNumbers = (row) => {
    const raw =
      row?.serial_numbers ||
      row?.serialNumbers ||
      [];

    if (Array.isArray(raw)) {
      return raw
        .map((value) =>
          String(
            value || "",
          ).trim(),
        )
        .filter(Boolean);
    }

    if (typeof raw === "string") {
      try {
        const parsed =
          JSON.parse(raw);

        if (Array.isArray(parsed)) {
          return parsed
            .map((value) =>
              String(
                value || "",
              ).trim(),
            )
            .filter(Boolean);
        }
      } catch (_error) {
        return raw
          .split(",")
          .map((value) =>
            value.trim(),
          )
          .filter(Boolean);
      }
    }

    return [];
  };


  const openComponentDetails = (row) => openCostDetails("engineerScrap", row);


  const componentOptions =
    useMemo(
      () =>
        components.map(
          (component) => {
            const id =
              component?.id ??
              component?.pk;

            const code =
              component
                ?.component_id ||
              component
                ?.component_code ||
              component?.code ||
              "";

            const name =
              component?.name ||
              component
                ?.component_name ||
              "";

            const label = [
              code,
              name,
            ]
              .filter(Boolean)
              .join(" - ");

            return {
              id,
              code,
              name,
              label:
                label ||
                String(
                  id || "Component",
                ),
            };
          },
        ),
      [components],
    );


  const selectedComponent =
    useMemo(
      () =>
        componentOptions.find(
          (item) =>
            String(item.id) ===
            String(
              form.component,
            ),
        ) || null,
      [
        componentOptions,
        form.component,
      ],
    );


  const selectedMr = useMemo(
    () => mrOptions.find((item) =>
      String(item.option_id || item.id) === String(form.material_request)
    ) || null,
    [mrOptions, form.material_request],
  );

  const selectedMrAvailableSerials =
    useMemo(
      () =>
        (selectedMr?.components || [])
          .flatMap((item) =>
            Array.isArray(
              item?.available_serials
            )
              ? item.available_serials
              : [],
          )
          .map((serial) =>
            String(serial || "").trim()
          )
          .filter(Boolean),
      [selectedMr],
    );

  const selectedMrAvailableCount =
    selectedMrAvailableSerials.length;

  /*
   * FINAL Engineer Scrap selection meaning:
   *
   * SELECTED serials   = DAMAGED / SCRAP
   * UNSELECTED serials = GOOD / REUSABLE
   *
   * Manager later decides:
   * YES -> GOOD serials are reused in the new From-Scrap MR
   * NO  -> GOOD serials return to In Store
   */
  const selectedScrapCount =
    form.scrap_mode === "TOTAL"
      ? selectedMrAvailableCount
      : form.selected_serials.length;

  const goodReusableCount =
    form.scrap_mode === "TOTAL"
      ? 0
      : Math.max(
          selectedMrAvailableCount -
            selectedScrapCount,
          0,
        );

  const buildSelectedScrapItems =
    useCallback(() => {
      if (!selectedMr) {
        return [];
      }

      const selectedSet =
        new Set(
          form.scrap_mode === "TOTAL"
            ? selectedMrAvailableSerials
            : form.selected_serials,
        );

      return (
        selectedMr.components || []
      )
        .map((item) => {
          const available =
            Array.isArray(
              item?.available_serials
            )
              ? item.available_serials
              : [];

          const serials =
            available.filter((serial) =>
              selectedSet.has(serial),
            );

          if (serials.length === 0) {
            return null;
          }

          return {
            component:
              item.component,
            serial_numbers:
              serials,
            quantity:
              serials.length,
          };
        })
        .filter(Boolean);
    }, [
      selectedMr,
      selectedMrAvailableSerials,
      form.scrap_mode,
      form.selected_serials,
    ]);

  const loadRows =
    useCallback(async () => {
      try {
        const payload =
          await fetchAuthenticatedJson(
            `${config.baseURL}/outward/engineer-scrap/`,
          );

        setRows(
          unwrapList(payload),
        );
      } catch (requestError) {
        console.error(
          "Unable to load Engineer Scrap:",
          requestError,
        );

        setError(
          requestError?.message ||
            "Unable to load Scrap requests.",
        );
      } finally {
        setLoading(false);
      }
    }, []);


  const loadComponents =
    useCallback(async () => {
      try {
        const payload =
          await fetchAuthenticatedJson(
            `${config.baseURL}/components/components/`,
          );

        setComponents(
          unwrapList(payload),
        );
      } catch (requestError) {
        console.error(
          "Unable to load components:",
          requestError,
        );
      }
    }, []);


  const loadMrOptions = useCallback(async () => {
    try {
      setLoadingMrOptions(true);

      /*
       * Add Scrap must use the SAME availability boundary as the In-Drone
       * Action column.
       *
       * An MR is selectable only while the drone is idle/free:
       *   - no active/pending Sales
       *   - no active Flight Test
       *   - no active Customer Demo / Trials
       *   - no active Event
       *
       * Returned Flight/Demo/Event becomes eligible again only after:
       *   Return QC = OK
       *   AND return_approval_status = COMPLETED
       *
       * The backend applies the same rule authoritatively. This frontend
       * overlay keeps the popup correct immediately even if an older backend
       * response is briefly cached.
       */
      const [
        optionsPayload,
        componentUsagePayload,
        outwardPayload,
      ] = await Promise.all([
        fetchAuthenticatedJson(
          `${config.baseURL}/outward/engineer-scrap-options/`,
          {
            cache: "no-store",
          },
        ),

        fetchAuthenticatedJson(
          `${config.baseURL}/component-usage/?page_size=5000`,
          {
            cache: "no-store",
          },
        ).catch(() => []),

        fetchAuthenticatedJson(
          `${config.baseURL}/outward/?page_size=5000`,
          {
            cache: "no-store",
          },
        ).catch(() => []),
      ]);

      const rawOptions =
        Array.isArray(
          optionsPayload?.material_requests,
        )
          ? optionsPayload.material_requests
          : [];

      const usageRows =
        unwrapList(componentUsagePayload);

      const outwardRows =
        unwrapList(outwardPayload);

      const normalizeReference = (
        value,
      ) =>
        String(value ?? "")
          .trim()
          .toUpperCase();

      const getMrReferences = (
        mr = {},
      ) =>
        new Set(
          [
            mr?.id,
            mr?.pk,
            mr?.material_request_id,
            mr?.request_id,
            mr?.mr_id,
          ]
            .map(normalizeReference)
            .filter(Boolean),
        );

      const rowMatchesMr = (
        row = {},
        references,
      ) => {
        const rowReferences = [
          row?.material_request,
          row?.material_request_id,
          row?.material_request_number,
          row?.materialRequest,
          row?.materialRequestId,
          row?.materialRequestNumber,
          row?.request_id,
          row?.mr_id,
        ]
          .map((value) => {
            if (
              value &&
              typeof value === "object"
            ) {
              return [
                value?.id,
                value?.pk,
                value?.material_request_id,
                value?.request_id,
                value?.mr_id,
              ];
            }

            return [value];
          })
          .flat()
          .map(normalizeReference)
          .filter(Boolean);

        return rowReferences.some(
          (reference) =>
            references.has(reference),
        );
      };

      const rejectedStates =
        new Set([
          "REJECTED",
          "MANAGER_REJECTED",
          "FINANCE_REJECTED",
          "CANCELLED",
          "CANCELED",
        ]);

      const hasActiveSales = (
        references,
      ) =>
        outwardRows.some((row) => {
          if (
            normalizeReference(
              row?.outward_type ||
                row?.type_of_outward ||
                row?.type,
            ) !== "SALES"
          ) {
            return false;
          }

          if (
            !rowMatchesMr(
              row,
              references,
            )
          ) {
            return false;
          }

          const approvalStatus =
            normalizeReference(
              row?.approval_status ||
                row?.approvalStatus,
            );

          const rowStatus =
            normalizeReference(
              row?.status,
            );

          return (
            !rejectedStates.has(
              approvalStatus,
            ) &&
            !rejectedStates.has(
              rowStatus,
            )
          );
        });

      const activeUsagePurposes =
        new Set([
          "FLIGHT_TEST",
          "CUSTOMER_DEMO",
          "EVENT",
        ]);

      const hasActiveTemporaryUsage = (
        references,
      ) =>
        usageRows.some((usage) => {
          if (
            !rowMatchesMr(
              usage,
              references,
            )
          ) {
            return false;
          }

          const purpose =
            normalizeReference(
              usage?.purpose ||
                usage?.usage_purpose,
            );

          if (
            !activeUsagePurposes.has(
              purpose,
            )
          ) {
            return false;
          }

          const approval =
            normalizeReference(
              usage?.return_approval_status ||
                usage?.returnApprovalStatus,
            );

          if (
            rejectedStates.has(
              approval,
            )
          ) {
            return false;
          }

          const condition =
            normalizeReference(
              usage?.return_condition ||
                usage?.returnCondition,
            );

          /*
           * Only a successful completed return makes the drone available
           * again. Until that point Flight/Demo/Event owns the MR.
           */
          const fullyReleased =
            condition === "OK" &&
            approval === "COMPLETED";

          return !fullyReleased;
        });

      const availableOptions =
        rawOptions.filter((mr) => {
          /*
           * New backend options are already physical DroneInstance rows and
           * only AVAILABLE _01/_02 instances are returned. Do not apply the
           * old MR-wide Sales/Returnable filter, because a busy _01 must not
           * hide a free _02 sibling.
           */
          if (mr?.drone_instance_id) {
            return true;
          }

          const references =
            getMrReferences(mr);

          if (
            hasActiveSales(
              references,
            )
          ) {
            return false;
          }

          if (
            hasActiveTemporaryUsage(
              references,
            )
          ) {
            return false;
          }

          return true;
        });

      setMrOptions(
        availableOptions,
      );

      /*
       * If an Engineer had the popup open while another action claimed the
       * drone, clear that now-invalid selection immediately.
       */
      setForm((previous) => {
        if (
          !previous.material_request
        ) {
          return previous;
        }

        const stillAvailable =
          availableOptions.some(
            (mr) =>
              String(mr?.option_id || mr?.id) ===
              String(previous.material_request),
          );

        if (stillAvailable) {
          return previous;
        }

        return {
          ...previous,
          material_request: "",
          selected_serials: [],
          quantity: 1,
          scrap_mode: "PARTIAL",
        };
      });
    } catch (requestError) {
      console.error(
        "Unable to load available In-Drone Material Requests for Scrap:",
        requestError,
      );
      setMrOptions([]);
    } finally {
      setLoadingMrOptions(false);
    }
  }, []);


  useEffect(() => {
    void loadRows();
    void loadComponents();
    void loadMrOptions();

    /*
     * Manager/Finance may approve from another browser/session.
     * Poll so Engineer sees each approval-stage change automatically.
     */
    const intervalId =
      window.setInterval(
        () => {
          void loadRows();
          void loadMrOptions();
        },
        5000,
      );

    const handleUpdate = () => {
      void loadRows();
      void loadMrOptions();
    };

    window.addEventListener(
      "notificationsUpdated",
      handleUpdate,
    );

    window.addEventListener(
      "inventory:changed",
      handleUpdate,
    );

    return () => {
      window.clearInterval(
        intervalId,
      );

      window.removeEventListener(
        "notificationsUpdated",
        handleUpdate,
      );

      window.removeEventListener(
        "inventory:changed",
        handleUpdate,
      );
    };
  }, [
    loadRows,
    loadComponents,
    loadMrOptions,
  ]);


  const ensureManagerNotification =
    async (createdRow) => {
      const referenceId =
        createdRow?.id ??
        createdRow?.pk;

      if (
        referenceId === undefined ||
        referenceId === null ||
        referenceId === ""
      ) {
        throw new Error(
          "Scrap request was created but its reference ID is missing.",
        );
      }

      const existingPayload =
        await fetchAuthenticatedJson(
          `${config.baseURL}/notifications/?category=SCRAP&receiver=MANAGER&reference_id=${encodeURIComponent(
            referenceId,
          )}`,
        );

      const existing =
        unwrapList(
          existingPayload,
        );

      if (
        existing.some(
          (notification) =>
            String(
              notification
                ?.reference_id,
            ) ===
            String(referenceId) &&
            String(
              notification
                ?.receiver ||
                "",
            )
              .trim()
              .toUpperCase() ===
              "MANAGER" &&
            String(
              notification
                ?.category ||
                "",
            )
              .trim()
              .toUpperCase() ===
              "SCRAP",
        )
      ) {
        return;
      }

      await fetchAuthenticatedJson(
        `${config.baseURL}/notifications/`,
        {
          method: "POST",
          body: JSON.stringify({
            category: "SCRAP",

            /*
             * Notification backend also captures request.user,
             * but send the display name as a safe fallback.
             */
            title:
              requesterName,
            requested_by:
              requesterName,

            // Same remarks as the Engineer Scrap row.
            message:
              createdRow?.remarks ||
              form.remarks ||
              "Scrap",

            reference_id:
              String(
                referenceId,
              ),

            status:
              "PENDING_MANAGER",

            receiver:
              "MANAGER",

            is_read:
              false,
          }),
        },
      );

      window.dispatchEvent(
        new Event(
          "notificationsUpdated",
        ),
      );
    };


  const toggleMrSerial = (serial) => {
    const value = String(serial || "").trim();
    if (!value) return;
    setForm((previous) => {
      const selected = Array.isArray(previous.selected_serials)
        ? previous.selected_serials
        : [];
      return {
        ...previous,
        selected_serials: selected.includes(value)
          ? selected.filter((item) => item !== value)
          : [...selected, value],
      };
    });
  };


  const createScrap =
    async (event) => {
      event.preventDefault();

      if (
        !canManageScrap ||
        submitLockRef.current
      ) {
        return;
      }

      if (!form.out_date) {
        setError(
          "Select the Scrap date.",
        );
        return;
      }

      const scrapOrigin = String(form.scrap_origin || "OTHER").trim().toUpperCase();

      if (scrapOrigin === "MR" && !form.material_request) {
        setError("Select a Material Request ID.");
        return;
      }

      let quantity = 0;
      let selectedScrapItems = [];

      if (scrapOrigin === "MR") {
        if (!selectedMr) {
          setError(
            "Select an idle / available In-Drone Material Request."
          );
          return;
        }

        const scrapMode = String(
          form.scrap_mode || "PARTIAL"
        ).toUpperCase();

        if (
          !["PARTIAL", "TOTAL"].includes(
            scrapMode
          )
        ) {
          setError(
            "Select Partial Scrap or Total Scrap."
          );
          return;
        }

        selectedScrapItems =
          buildSelectedScrapItems();

        quantity = selectedScrapItems.reduce(
          (total, item) =>
            total +
            Number(
              item?.quantity || 0
            ),
          0,
        );

        if (
          String(
            form.scrap_mode || "PARTIAL"
          ).toUpperCase() === "PARTIAL" &&
          quantity <= 0
        ) {
          setError(
            "Select at least one issued serial number."
          );
          return;
        }
      } else {
        if (!form.component) {
          setError("Select a component.");
          return;
        }

        quantity = Number(
          form.quantity
        );

        if (
          !Number.isInteger(quantity) ||
          quantity <= 0
        ) {
          setError(
            "Quantity must be greater than zero."
          );
          return;
        }
      }

      if (
        !String(
          form.remarks || "",
        ).trim()
      ) {
        setError(
          "Enter Scrap remarks.",
        );
        return;
      }

      submitLockRef.current = true;

      try {
        setSaving(true);
        setError("");

        const created =
          await fetchAuthenticatedJson(
            `${config.baseURL}/outward/engineer-scrap/`,
            {
              method: "POST",
              body: JSON.stringify({
                out_date:
                  form.out_date,

                scrap_origin:
                  scrapOrigin,

                material_request:
                  scrapOrigin === "MR"
                    ? (selectedMr?.id || selectedMr?.material_request_id)
                    : null,

                drone_instance_id:
                  scrapOrigin === "MR"
                    ? selectedMr?.drone_instance_id
                    : null,

                component:
                  scrapOrigin === "MR"
                    ? (
                        selectedScrapItems.length === 1
                          ? selectedScrapItems[0].component
                          : null
                      )
                    : form.component,

                serial_numbers:
                  scrapOrigin === "MR"
                    ? selectedScrapItems.flatMap(
                        (item) =>
                          item.serial_numbers || [],
                      )
                    : [],

                quantity,

                scrap_mode:
                  scrapOrigin === "MR"
                    ? String(
                        form.scrap_mode ||
                          "PARTIAL"
                      ).toUpperCase()
                    : null,

                scrap_items:
                  scrapOrigin === "MR"
                    ? selectedScrapItems
                    : [],

                remarks:
                  String(form.remarks).trim(),

                product_name:
                  scrapOrigin === "MR"
                    ? (
                        selectedScrapItems.length === 1
                          ? (
                              selectedMr?.components?.find(
                                (item) =>
                                  String(
                                    item.component
                                  ) ===
                                  String(
                                    selectedScrapItems[0]
                                      .component
                                  ),
                              )?.label ||
                              "MR Scrap"
                            )
                          : `${quantity} Scrap item(s) - ${
                              selectedMr
                                ?.material_request_id ||
                              ""
                            }`
                      )
                    : selectedComponent?.label || "",
              }),
            },
          );

        /*
         * Backend owns the Manager-first notification + approval email.
         * Avoid the old second notification request.
         */
        window.dispatchEvent(
          new Event(
            "notificationsUpdated",
          ),
        );

        setForm({
          ...EMPTY_FORM,
          out_date: today(),
        });

        setShowCreate(false);

        void Promise.all([
          loadRows(),
          loadMrOptions(),
        ]).catch((refreshError) => {
          console.warn(
            "Engineer Scrap background refresh failed:",
            refreshError,
          );
        });
      } catch (requestError) {
        console.error(
          "Unable to create Engineer Scrap:",
          requestError,
        );

        setError(
          requestError?.message ||
            "Unable to create Scrap request.",
        );
      } finally {
        submitLockRef.current = false;
        setSaving(false);
      }
    };


  const normalizeDispositionMetadata =
    (value) => {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        return value;
      }

      if (typeof value === "string") {
        try {
          const parsed =
            JSON.parse(value);

          if (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
          ) {
            return parsed;
          }
        } catch (_error) {
          // Not JSON; fall through.
        }
      }

      return {};
    };


  const getDispositionSerials =
    (items) => {
      if (!Array.isArray(items)) {
        return [];
      }

      return Array.from(
        new Set(
          items
            .flatMap((item) =>
              Array.isArray(
                item?.serial_numbers
              )
                ? item.serial_numbers
                : Array.isArray(
                    item?.serialNumbers
                  )
                  ? item.serialNumbers
                  : []
            )
            .map((serial) =>
              String(
                serial || ""
              ).trim()
            )
            .filter(Boolean)
        )
      );
    };


  const buildMoveConfirmation =
    (row, source = row) => {
      const metadata =
        normalizeDispositionMetadata(
          source?.inventory_allocations ??
            source?.inventoryAllocations ??
            row?.inventory_allocations ??
            row?.inventoryAllocations ??
            {}
        );

      const scrapMode = String(
        metadata?.scrap_mode ||
          metadata?.scrapMode ||
          "PARTIAL"
      )
        .trim()
        .toUpperCase();

      const reorderChoice = String(
        metadata?.reorder_choice ||
          metadata?.reorderChoice ||
          "NONE"
      )
        .trim()
        .toUpperCase();

      const goodItems =
        Array.isArray(
          metadata?.good_items
        )
          ? metadata.good_items
          : [];

      const selectedItems =
        Array.isArray(
          metadata?.selected_items
        )
          ? metadata.selected_items
          : [];

      const reorderItems =
        Array.isArray(
          metadata?.reorder_items
        )
          ? metadata.reorder_items
          : [];

      const returnItems =
        Array.isArray(
          metadata?.return_items
        )
          ? metadata.return_items
          : [];

      const scrapItems =
        Array.isArray(
          metadata?.scrap_items
        )
          ? metadata.scrap_items
          : [];

      /*
       * The popup always displays the actual GOOD set.
       * Manager YES only changes its destination to the new MR.
       * Manager NO changes its destination to Central In Store.
       */
      const actionItems =
        goodItems.length
          ? goodItems
          : reorderItems.length
            ? reorderItems
            : returnItems.length
              ? returnItems
              : selectedItems;

      const actionSerials =
        getDispositionSerials(
          actionItems
        );

      const scrapSerials =
        getDispositionSerials(
          scrapItems
        );

      const actionQuantity =
        actionSerials.length ||
        actionItems.reduce(
          (sum, item) =>
            sum +
            Math.max(
              Number(
                item?.quantity || 0
              ) || 0,
              0
            ),
          0
        );

      const scrapQuantity =
        scrapSerials.length ||
        scrapItems.reduce(
          (sum, item) =>
            sum +
            Math.max(
              Number(
                item?.quantity || 0
              ) || 0,
              0
            ),
          0
        ) ||
        (
          scrapMode === "TOTAL"
            ? Number(
                metadata
                  ?.scrap_quantity ||
                  source?.quantity ||
                  row?.quantity ||
                  0
              ) || 0
            : 0
        );

      return {
        row,
        source,
        metadata,
        scrapMode,
        reorderChoice,
        actionItems,
        scrapItems,
        actionSerials,
        scrapSerials,
        actionQuantity,
        scrapQuantity,
        materialRequest:
          source
            ?.material_request_number ||
          source
            ?.materialRequestNumber ||
          row
            ?.material_request_number ||
          row
            ?.materialRequestNumber ||
          metadata
            ?.source_mr_number ||
          "-",
      };
    };


  const openMoveConfirmation =
    async (row) => {
      if (!canManageScrap) {
        return;
      }

      const id =
        row?.id ??
        row?.pk;

      if (!id) {
        return;
      }

      setMoveConfirmationError("");
      setMoveConfirmationLoading(true);

      /*
       * Do NOT open the modal with a temporary "Loading..." body.
       * First fetch the exact latest backend disposition, then open
       * the popup only when the details are ready.
       */
      setMoveConfirmation(null);

      try {
        const latest =
          await fetchAuthenticatedJson(
            `${config.baseURL}/outward/${encodeURIComponent(
              id
            )}/`
          );

        setMoveConfirmation(
          buildMoveConfirmation(
            row,
            latest
          )
        );
      } catch (requestError) {
        console.warn(
          "Unable to refresh Scrap disposition details:",
          requestError
        );

        /*
         * If the detail refresh fails, use the already-loaded row data,
         * but still open only AFTER the loading attempt has finished.
         */
        setMoveConfirmationError(
          requestError?.message ||
            "Unable to refresh the latest serial details."
        );

        setMoveConfirmation(
          buildMoveConfirmation(
            row
          )
        );
      } finally {
        setMoveConfirmationLoading(false);
      }
    };

  const closeMoveConfirmation =
    () => {
      if (movingId) {
        return;
      }

      setMoveConfirmation(null);
      setMoveConfirmationError("");
      setMoveConfirmationLoading(false);
    };


  const confirmMoveToInventory =
    async () => {
      const row =
        moveConfirmation?.row;

      const id =
        row?.id ??
        row?.pk;

      if (!id) {
        return;
      }

      try {
        setMovingId(id);
        setMoveConfirmationError("");
        setError("");

        /*
         * IMPORTANT:
         * The backend disposition runs only here, after OK.
         *
         * Reordering YES:
         *   GOOD / reusable serials -> NEW From-Scrap MR
         *   DAMAGED serials         -> Scrap
         *
         * Reordering NO:
         *   GOOD / reusable serials -> Inventory / In Store
         *   DAMAGED serials         -> Scrap
         */
        await fetchAuthenticatedJson(
          `${config.baseURL}/outward/${encodeURIComponent(
            id,
          )}/move-to-inventory/`,
          {
            method: "POST",
          },
        );

        setMoveConfirmation(null);

        await Promise.all([
          loadRows(),
          loadMrOptions(),
        ]);

        window.dispatchEvent(
          new CustomEvent(
            "inventory:changed",
            {
              detail: {
                type:
                  "engineerScrapMoved",
                id,
              },
            },
          ),
        );

        window.dispatchEvent(
          new Event(
            "outwardUpdated",
          ),
        );

        window.dispatchEvent(
          new Event(
            "notificationsUpdated",
          ),
        );
      } catch (requestError) {
        console.error(
          "Unable to move Scrap:",
          requestError,
        );

        setMoveConfirmationError(
          requestError?.message ||
            "Unable to complete the Scrap movement.",
        );
      } finally {
        setMovingId(null);
      }
    };


  const getRowId = (row) =>
    row?.id ??
    row?.pk ??
    null;


  const isRowDeleteEligible = (row) => {
    const id =
      getRowId(row);

    return (
      id !== null &&
      id !== undefined &&
      id !== ""
    );
  };


  const deleteEligibleIds =
    useMemo(
      () =>
        rows
          .filter(
            isRowDeleteEligible,
          )
          .map(getRowId)
          .filter(
            (id) =>
              id !== null &&
              id !== undefined &&
              id !== "",
          )
          .map(String),
      [rows],
    );


  const handleEnableSelectionMode =
    () => {
      if (!canManageScrap) {
        return;
      }

      setError("");
      setSelectionMode(true);
      setSelectedRowIds([]);
    };


  const handleCancelSelectionMode =
    () => {
      setSelectionMode(false);
      setSelectedRowIds([]);
      setError("");
    };


  const toggleRowSelection =
    (row) => {
      if (
        !selectionMode ||
        !isRowDeleteEligible(row)
      ) {
        return;
      }

      const id =
        getRowId(row);

      if (
        id === null ||
        id === undefined ||
        id === ""
      ) {
        return;
      }

      const key = String(id);

      setSelectedRowIds(
        (previous) =>
          previous.includes(key)
            ? previous.filter(
                (item) =>
                  item !== key,
              )
            : [
                ...previous,
                key,
              ],
      );
    };


  const allDeleteEligibleSelected =
    deleteEligibleIds.length > 0 &&
    deleteEligibleIds.every(
      (id) =>
        selectedRowIds.includes(
          id,
        ),
    );


  const toggleSelectAll =
    () => {
      if (!selectionMode) {
        return;
      }

      if (
        allDeleteEligibleSelected
      ) {
        setSelectedRowIds([]);
        return;
      }

      setSelectedRowIds(
        deleteEligibleIds,
      );
    };


  const handleDeleteSelected =
    async () => {
      if (!canManageScrap) {
        return;
      }

      if (
        selectedRowIds.length === 0
      ) {
        setError(
          "Select at least one Engineer Scrap record to delete.",
        );
        return;
      }

      const confirmed =
        window.confirm(
          `Remove ${selectedRowIds.length} selected Engineer Scrap record${
            selectedRowIds.length === 1
              ? ""
              : "s"
          } from the Engineer Scrap page?\n\nPending / Manager Approved / Rejected requests will be deleted.\nMoved-to-Inventory records will be removed ONLY from this Engineer Scrap page and will remain in Inventory and Outward.`,
        );

      if (!confirmed) {
        return;
      }

      try {
        setDeletingSelected(true);
        setError("");

        await fetchAuthenticatedJson(
          `${config.baseURL}/outward/engineer-scrap-bulk-delete/`,
          {
            method: "POST",
            body: JSON.stringify({
              ids:
                selectedRowIds,
            }),
          },
        );

        const deletedSet =
          new Set(
            selectedRowIds.map(
              String,
            ),
          );

        setRows(
          (previous) =>
            previous.filter(
              (row) =>
                !deletedSet.has(
                  String(
                    getRowId(
                      row,
                    ),
                  ),
                ),
            ),
        );

        setSelectedRowIds([]);
        setSelectionMode(false);

        await Promise.all([
          loadRows(),
          loadMrOptions(),
        ]);

        try {
          window.dispatchEvent(
            new Event(
              "notificationsUpdated",
            ),
          );
        } catch (_eventError) {
          // Ignore browser event errors.
        }
      } catch (requestError) {
        console.error(
          "Unable to delete selected Engineer Scrap records:",
          requestError,
        );

        setError(
          requestError?.message ||
            "Unable to delete selected Engineer Scrap records.",
        );
      } finally {
        setDeletingSelected(false);
      }
    };


  const openRejectDetails =
    (row) => {
      setRejectionDetails({
        rejectedBy:
          cleanUserName(
            row?.rejected_by ||
              row?.rejectedBy ||
              "Manager",
          ),

        reason:
          row?.rejection_reason ||
          row?.rejectionReason ||
          "No rejection reason was provided.",
      });
    };


  if (costDetailsPage) return costDetailsPage;
  return (
    <PageShell>
      <PageHeader
        title="Scrap"
        subtitle="Engineer selects reusable components â†’ Manager chooses disposition â†’ Finance gives final approval."
        right={
          canManageScrap ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={
                  selectionMode
                    ? handleDeleteSelected
                    : handleEnableSelectionMode
                }
                disabled={
                  deletingSelected ||
                  (
                    selectionMode &&
                    selectedRowIds.length ===
                      0
                  )
                }
                className="inline-flex items-center gap-2 rounded-lg bg-[#E85D75] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="size-4" />

                {deletingSelected
                  ? "Deleting..."
                  : selectionMode
                  ? `Delete Selected (${selectedRowIds.length})`
                  : "Delete"}
              </button>

              {selectionMode && (
                <button
                  type="button"
                  onClick={
                    handleCancelSelectionMode
                  }
                  disabled={
                    deletingSelected
                  }
                  className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                >
                  Cancel
                </button>
              )}

              {!selectionMode && (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setForm({ ...EMPTY_FORM, out_date: today() });
                    setShowCreate(true);
                    void loadMrOptions();
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="size-4" />
                  Add Scrap
                </button>
              )}
            </div>
          ) : null
        }
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {role === "admin"
            ? "Admin can view and manage all Engineer Scrap requests."
            : role === "management"
              ? "Management view only — costing is visible, workflow actions are disabled."
              : "Only your Engineer Scrap requests are shown."}
        </div>


      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-[5%] px-2 py-3 text-center">
                {selectionMode ? (
                  <input
                    type="checkbox"
                    checked={
                      allDeleteEligibleSelected
                    }
                    onChange={
                      toggleSelectAll
                    }
                    disabled={
                      deleteEligibleIds.length ===
                        0 ||
                      deletingSelected
                    }
                    className="size-4 cursor-pointer accent-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Select all Engineer Scrap records"
                  />
                ) : (
                  "S.No"
                )}
              </th>

              <th className="w-[8%] px-2 py-3 text-center">
                Date
              </th>

              <th className="w-[11%] px-2 py-3 text-center">
                Source MR
              </th>

              <th className="w-[8%] px-2 py-3 text-center">
                Reordering
              </th>

              <th className="w-[16%] px-2 py-3 text-center">
                Good Component(s)
              </th>

              <th className="w-[8%] px-2 py-3 text-center">
                Good Qty
              </th>

              <th className="w-[15%] px-2 py-3 text-center">
                Scrap Component(s)
              </th>

              <th className="w-[7%] px-2 py-3 text-center">
                Scrap Qty
              </th>

              <th className="w-[10%] px-2 py-3 text-center">
                New MR
              </th>

              {canSeeCosting && (
                <th className="w-[10%] px-2 py-3 text-center">
                  Cost Details
                </th>
              )}

              <th className="w-[12%] px-2 py-3 text-center">
                Status / Action
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td
                  colSpan={canSeeCosting ? 11 : 10}
                  className="p-10 text-center text-sm text-muted-foreground"
                >
                  Loading Scrap requests...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={canSeeCosting ? 11 : 10}
                  className="p-10 text-center text-sm text-muted-foreground"
                >
                  No Engineer Scrap requests yet.
                </td>
              </tr>
            ) : (
              paginatedScrapRows.map(
                (row, index) => {
                  const status =
                    getStatus(row);

                  const audit =
                    getScrapAudit(row);

                  const rowId =
                    getRowId(row);

                  return (
                    <tr
                      key={
                        rowId ??
                        index
                      }
                      className="align-middle hover:bg-muted/30"
                    >
                      <td className="px-2 py-4 text-center">
                        {selectionMode ? (
                          <input
                            type="checkbox"
                            checked={
                              selectedRowIds.includes(
                                String(
                                  rowId
                                )
                              )
                            }
                            onChange={() =>
                              toggleRowSelection(
                                row
                              )
                            }
                            disabled={
                              deletingSelected
                            }
                            className="size-4 cursor-pointer accent-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label={`Select Scrap row ${
                              index + 1
                            }`}
                          />
                        ) : (
                          index + 1
                        )}
                      </td>

                      <td className="px-2 py-4 text-center text-xs">
                        {row?.out_date ||
                        row?.outDate
                          ? new Date(
                              `${
                                row.out_date ||
                                row.outDate
                              }T00:00:00`
                            ).toLocaleDateString(
                              "en-IN"
                            )
                          : "-"}
                      </td>

                      <td className="px-2 py-4 text-center">
                        <div className="break-words text-xs font-semibold">
                          {audit.sourceMr}
                        </div>
                      </td>

                      <td className="px-2 py-4 text-center">
                        {audit.scrapMode ===
                        "TOTAL" ? (
                          <span className="text-xs text-muted-foreground">
                            N/A
                          </span>
                        ) : (
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${
                              audit.reorderChoice ===
                              "YES"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                                : audit.reorderChoice ===
                                    "NO"
                                  ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
                                  : "border-border bg-muted text-muted-foreground"
                            }`}
                          >
                            {audit.reorderChoice ||
                              "-"}
                          </span>
                        )}
                      </td>

                      <td className="px-2 py-4 text-center">
                        <div
                          className="line-clamp-3 break-words text-xs font-medium"
                          title={
                            audit.selectedComponents
                          }
                        >
                          {audit.selectedComponents}
                        </div>
                      </td>

                      <td className="px-2 py-4 text-center">
                        {audit.scrapMode ===
                        "TOTAL" ? (
                          <span className="text-xs text-muted-foreground">
                            0
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              openSerialDetails(
                                "Good / Reusable Serial Numbers",
                                audit.selectedItems,
                                audit.selectedSerials
                              )
                            }
                            disabled={
                              audit.selectedQuantity <=
                              0
                            }
                            className="inline-flex min-w-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-default disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                            title="Click to view good / reusable serial numbers"
                          >
                            {audit.selectedQuantity}
                          </button>
                        )}
                      </td>

                      <td className="px-2 py-4 text-center">
                        <div
                          className="line-clamp-3 break-words text-xs font-medium"
                          title={
                            audit.scrapComponents
                          }
                        >
                          {audit.scrapComponents}
                        </div>
                      </td>

                      <td className="px-2 py-4 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            openSerialDetails(
                              "Scrap Serial Numbers",
                              audit.scrapItems,
                              audit.scrapSerials
                            )
                          }
                          disabled={
                            audit.scrapQuantity <=
                            0
                          }
                          className="inline-flex min-w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-default disabled:opacity-50 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                          title="Click to view Scrap serial numbers"
                        >
                          {audit.scrapQuantity}
                        </button>
                      </td>

                      <td className="px-2 py-4 text-center">
                        {audit.newMr ? (
                          <span
                            className="inline-block max-w-full break-words rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                            title={
                              audit.newMr
                            }
                          >
                            {audit.newMr}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            {audit.reorderChoice ===
                              "YES" &&
                            !audit.processed
                              ? "After Move"
                              : "-"}
                          </span>
                        )}
                      </td>

                      {canSeeCosting && (
                        <td className="px-2 py-4 text-center">
                          <button
                            type="button"
                            className="serial-cost-component"
                            onClick={() => openComponentDetails(row)}
                          >
                            View Details
                          </button>
                        </td>
                      )}

                      <td className="px-2 py-4 text-center">
                        <div className="flex flex-col items-center gap-2">
                          {status ===
                          "REJECTED" ? (
                            <button
                              type="button"
                              onClick={() =>
                                openRejectDetails(
                                  row
                                )
                              }
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold hover:opacity-80 ${getStatusClass(
                                status
                              )}`}
                            >
                              {getStatusLabel(
                                status
                              )}
                            </button>
                          ) : (
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${getStatusClass(
                                status
                              )}`}
                            >
                              {getStatusLabel(
                                status
                              )}
                            </span>
                          )}

                          {!selectionMode &&
                            status ===
                              "REJECTED" && (
                              <button
                                type="button"
                                onClick={() =>
                                  openRejectDetails(
                                    row
                                  )
                                }
                                className="rounded-lg border border-red-200 px-2.5 py-1.5 text-[10px] font-semibold text-red-700 hover:bg-red-50"
                              >
                                View Reason
                              </button>
                            )}

                          {!selectionMode &&
                            status ===
                              "MOVED_TO_INVENTORY" && (
                              <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                Moved
                              </span>
                            )}

                          {selectionMode && (
                            <span className="text-[10px] text-muted-foreground">
                              {selectedRowIds.includes(
                                String(
                                  rowId
                                )
                              )
                                ? "Selected"
                                : "Select Row"}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }
              )
            )}
          </tbody>
        </table>
      </div>

      {scrapPageCount > 1 ? (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <div className="text-sm text-muted-foreground">
            Page {scrapPage} of {scrapPageCount}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setScrapPage((currentPage) =>
                  Math.max(1, currentPage - 1),
                )
              }
              disabled={scrapPage === 1}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            <button
              type="button"
              onClick={() =>
                setScrapPage((currentPage) =>
                  Math.min(
                    scrapPageCount,
                    currentPage + 1,
                  ),
                )
              }
              disabled={scrapPage === scrapPageCount}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {serialDetails && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">
                {serialDetails.title}
              </h2>

              <button
                type="button"
                onClick={() =>
                  setSerialDetails(
                    null
                  )
                }
                className="rounded-full border border-border p-2 hover:bg-muted"
                aria-label="Close serial details"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4">
              {Array.isArray(
                serialDetails?.groups
              ) &&
              serialDetails.groups.length >
                0 ? (
                <div className="max-h-[60vh] space-y-3 overflow-y-auto">
                  {serialDetails.groups.map(
                    (
                      group,
                      groupIndex
                    ) => (
                      <div
                        key={`${group.label}-${groupIndex}`}
                        className="rounded-xl border border-border bg-background p-4"
                      >
                        <div className="mb-3">
                          <p className="text-sm font-semibold text-foreground">
                            {group.name ||
                              group.label ||
                              "Component"}
                          </p>

                          {group.code ? (
                            <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                              Component Code:{" "}
                              {group.code}
                            </p>
                          ) : null}
                        </div>

                        {Array.isArray(
                          group.serialNumbers
                        ) &&
                        group.serialNumbers
                          .length > 0 ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {group.serialNumbers.map(
                              (
                                serial,
                                serialIndex
                              ) => (
                                <div
                                  key={`${group.label}-${serial}-${serialIndex}`}
                                  className="rounded-lg bg-muted px-3 py-2 text-center text-sm font-semibold"
                                >
                                  {serial}
                                </div>
                              )
                            )}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                            No serial numbers available for this component.
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No component or serial details available.
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  setSerialDetails(
                    null
                  )
                }
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Component / MR / Serial details */}
      

      {/* Create Scrap */}
      {showCreate && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-3">
          <form
            onSubmit={createScrap}
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Add Engineer Scrap
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  This request will go to Manager approval first.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowCreate(false)
                }
                className="rounded-full border border-border p-2 hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-3 grid gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Scrap Date</label>
                <input
                  type="date"
                  value={form.out_date}
                  onChange={(event) => setForm((previous) => ({ ...previous, out_date: event.target.value }))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Scrap Source</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setForm((previous) => ({
                        ...previous,
                        scrap_origin: "MR",
                        material_request: "",
                        component: "",
                        selected_serials: [],
                        quantity: 1,
                        scrap_mode: "PARTIAL",
                      }));
                      void loadMrOptions();
                    }}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition ${form.scrap_origin === "MR" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
                  >
                    <div className="font-semibold">Material Request</div>
                    <div className="mt-1 text-xs text-muted-foreground">Fully issued / In-Drone MR with exact issued serial numbers.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((previous) => ({
                        ...previous,
                        scrap_origin: "OTHER",
                        material_request: "",
                        component: "",
                        selected_serials: [],
                        quantity: 1,
                        scrap_mode: "PARTIAL",
                      }))}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition ${form.scrap_origin === "OTHER" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
                  >
                    <div className="font-semibold">Other Component</div>
                    <div className="mt-1 text-xs text-muted-foreground">Normal component without Material Request link.</div>
                  </button>
                </div>
              </div>

              {form.scrap_origin === "MR" ? (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Material Request ID</label>
                    <select
                      value={form.material_request}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          material_request:
                            event.target.value,
                          component: "",
                          selected_serials: [],
                          quantity: 1,
                          scrap_mode: "PARTIAL",
                        }))
                      }
                      disabled={loadingMrOptions}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 disabled:opacity-60"
                      required
                    >
                      <option value="">{loadingMrOptions ? "Loading issued Material Requests..." : "Select Material Request"}</option>
                      {mrOptions.map((mr) => (
                        <option
                          key={mr.option_id || `${mr.id}:${mr.drone_instance_id || "legacy"}`}
                          value={mr.option_id || mr.id}
                        >
                          {[
                            mr.display_material_request_id || mr.material_request_id,
                            mr.project,
                          ].filter(Boolean).join(" - ")}
                        </option>
                      ))}
                    </select>
                    {!loadingMrOptions && mrOptions.length === 0 ? (
                      <p className="mt-2 text-xs text-amber-600">No idle / available In-Drone Material Request is currently eligible for Scrap.</p>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Only AVAILABLE physical In-Drone instances are shown. A busy/sold/scrapped _01 does not hide an available _02 from the same MR.</p>
                    )}
                  </div>

                  {selectedMr ? (
                    <>
                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Scrap Type
                        </label>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setForm(
                                (previous) => ({
                                  ...previous,
                                  scrap_mode:
                                    "PARTIAL",
                                  selected_serials:
                                    [],
                                }),
                              )
                            }
                            className={`rounded-xl border px-3 py-3 text-left transition ${
                              form.scrap_mode ===
                              "PARTIAL"
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border hover:bg-muted"
                            }`}
                          >
                            <div className="font-semibold">
                              Partial Scrap
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Select the DAMAGED serial numbers/components that should go to Scrap. Unselected items are treated as GOOD / Reusable.
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setForm(
                                (previous) => ({
                                  ...previous,
                                  scrap_mode:
                                    "TOTAL",
                                  selected_serials:
                                    [],
                                }),
                              )
                            }
                            className={`rounded-xl border px-3 py-3 text-left transition ${
                              form.scrap_mode ===
                              "TOTAL"
                                ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                                : "border-border hover:bg-muted"
                            }`}
                          >
                            <div className="font-semibold">
                              Total Scrap
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Every available issued component in this MR will go to Scrap.
                            </div>
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <label className="block text-sm font-medium">
                            SCRAP / Damaged Components and Serial Numbers
                          </label>

                          <span className="text-xs text-muted-foreground">
                            {selectedScrapCount} Scrap ·{" "}
                            {goodReusableCount} Good
                          </span>
                        </div>

                        <div className="max-h-56 space-y-3 overflow-y-auto rounded-xl border border-border bg-background p-3">
                          {(selectedMr.components || []).map(
                            (component) => {
                              const available =
                                Array.isArray(
                                  component?.available_serials,
                                )
                                  ? component.available_serials
                                  : [];

                              return (
                                <div
                                  key={
                                    component.component
                                  }
                                  className="rounded-xl border border-border p-3"
                                >
                                  <div className="mb-2 flex items-center justify-between gap-2">
                                    <div className="text-sm font-semibold">
                                      {component.label}
                                    </div>

                                    <span className="text-xs text-muted-foreground">
                                      {available.length} issued
                                    </span>
                                  </div>

                                  {available.length ===
                                  0 ? (
                                    <div className="text-xs text-muted-foreground">
                                      No available issued serials.
                                    </div>
                                  ) : (
                                    <div className="grid gap-1.5 sm:grid-cols-2">
                                      {available.map(
                                        (serial) => {
                                          const checked =
                                            form.scrap_mode ===
                                              "TOTAL" ||
                                            form.selected_serials.includes(
                                              serial,
                                            );

                                          return (
                                            <label
                                              key={`${component.component}-${serial}`}
                                              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${
                                                checked
                                                  ? "border-rose-300 bg-rose-50 dark:bg-rose-950/20"
                                                  : "border-border hover:bg-muted"
                                              } ${
                                                form.scrap_mode ===
                                                "TOTAL"
                                                  ? "cursor-not-allowed opacity-80"
                                                  : "cursor-pointer"
                                              }`}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={
                                                  checked
                                                }
                                                disabled={
                                                  form.scrap_mode ===
                                                  "TOTAL"
                                                }
                                                onChange={() =>
                                                  toggleMrSerial(
                                                    serial,
                                                  )
                                                }
                                                className="size-4 accent-rose-500"
                                              />

                                              <span className="font-medium">
                                                {serial}
                                              </span>
                                            </label>
                                          );
                                        },
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            },
                          )}
                        </div>
                      </div>

                      {form.scrap_mode ===
                      "PARTIAL" ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                          Select only the DAMAGED / SCRAP serial numbers or components. Unselected items are treated as GOOD / REUSABLE. The Manager will decide whether the good items are reused in a new From-Scrap MR or returned to In Store. Nothing moves until Finance gives final approval.
                        </div>
                      ) : (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                          Total Scrap: all{" "}
                          {selectedMrAvailableCount}{" "}
                          available issued serial(s) will go to Scrap. No New MR is created and nothing is returned to Inventory.
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-muted p-3 text-center">
                          <div className="text-xs text-muted-foreground">
                            Issued / Available
                          </div>
                          <div className="mt-1 text-lg font-semibold">
                            {selectedMrAvailableCount}
                          </div>
                        </div>

                        <div className="rounded-xl bg-emerald-50 p-3 text-center dark:bg-emerald-950/20">
                          <div className="text-xs text-emerald-600 dark:text-emerald-300">
                            Good / Reusable
                          </div>
                          <div className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-200">
                            {goodReusableCount}
                          </div>
                        </div>

                        <div className="rounded-xl bg-red-50 p-3 text-center dark:bg-red-950/20">
                          <div className="text-xs text-red-600 dark:text-red-300">
                            Damaged / Scrap
                          </div>
                          <div className="mt-1 text-lg font-semibold text-red-700 dark:text-red-200">
                            {selectedScrapCount}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Scrap Quantity
                        </label>
                        <input
                          type="number"
                          value={selectedScrapCount}
                          readOnly
                          className="w-full cursor-not-allowed rounded-xl border border-border bg-muted px-3 py-2 text-muted-foreground"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          This is the damaged Scrap quantity submitted for Manager review. Unselected quantity is GOOD / Reusable.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      Select a fully issued / In-Drone MR to view its issued components.
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Component</label>
                    <select value={form.component} onChange={(event) => setForm((previous) => ({ ...previous, component: event.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2" required>
                      <option value="">Select Component</option>
                      {componentOptions.map((component) => (
                        <option key={component.id} value={component.id}>{component.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Quantity</label>
                    <input type="number" min="1" step="1" value={form.quantity} onChange={(event) => setForm((previous) => ({ ...previous, quantity: event.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2" required />
                  </div>
                </>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium">Remarks</label>
                <textarea rows={2} value={form.remarks} onChange={(event) => setForm((previous) => ({ ...previous, remarks: event.target.value }))} placeholder="Example: Motor damaged during flight testing..." className="w-full rounded-xl border border-border bg-background px-3 py-2" required />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setShowCreate(false)
                }
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="size-4" />

                {saving
                  ? "Saving..."
                  : "Submit for Manager Approval"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rejection details */}
      {moveConfirmation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
            <div className="border-b border-border px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Confirm Scrap Movement
                  </h2>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Review where the selected and unselected serial numbers will move.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeMoveConfirmation}
                  disabled={Boolean(movingId)}
                  className="rounded-full border border-border p-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Close movement confirmation"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-6">
              <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    Material Request
                  </span>

                  <span className="font-semibold text-foreground">
                    {moveConfirmation.materialRequest}
                  </span>
                </div>
              </div>

              {moveConfirmationLoading ? (
                <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                  Loading exact Scrap disposition...
                </div>
              ) : (
                <>
                  {moveConfirmation.scrapMode === "TOTAL" ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
                      <div className="text-sm font-semibold text-red-700 dark:text-red-300">
                        Total Scrap
                      </div>

                      <div className="mt-2 text-sm leading-6 text-red-700 dark:text-red-200">
                        All{" "}
                        <span className="font-bold">
                          {moveConfirmation.scrapQuantity}
                        </span>{" "}
                        serial number(s) will move to Scrap.
                      </div>
                    </div>
                  ) : moveConfirmation.reorderChoice === "YES" ? (
                    <div className="grid gap-4">
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                        <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                          Good / Reusable → New MR
                        </div>

                        <div className="mt-2 text-sm leading-6 text-emerald-800 dark:text-emerald-200">
                          <span className="font-bold">
                            {moveConfirmation.actionQuantity}
                          </span>{" "}
                          GOOD / reusable serial number(s) will be used in the new From-Scrap MR.
                        </div>

                        {moveConfirmation.actionSerials.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {moveConfirmation.actionSerials.map(
                              (serial) => (
                                <span
                                  key={`move-mr-${serial}`}
                                  className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                >
                                  {serial}
                                </span>
                              ),
                            )}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
                        <div className="text-sm font-semibold text-red-700 dark:text-red-300">
                          Damaged / Scrap → Scrap
                        </div>

                        <div className="mt-2 text-sm leading-6 text-red-800 dark:text-red-200">
                          The damaged{" "}
                          <span className="font-bold">
                            {moveConfirmation.scrapQuantity}
                          </span>{" "}
                          serial number(s) will move to Scrap.
                        </div>

                        {moveConfirmation.scrapSerials.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {moveConfirmation.scrapSerials.map(
                              (serial) => (
                                <span
                                  key={`move-scrap-${serial}`}
                                  className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                                >
                                  {serial}
                                </span>
                              ),
                            )}
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                        Click OK to create the new MR for the selected{" "}
                        {moveConfirmation.actionQuantity} serial number(s) and move the remaining{" "}
                        {moveConfirmation.scrapQuantity} serial number(s) to Scrap.
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
                        <div className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                          Good / Reusable → Inventory / In Store
                        </div>

                        <div className="mt-2 text-sm leading-6 text-blue-800 dark:text-blue-200">
                          <span className="font-bold">
                            {moveConfirmation.actionQuantity}
                          </span>{" "}
                          GOOD / reusable serial number(s) will return to Inventory / In Store.
                        </div>

                        {moveConfirmation.actionSerials.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {moveConfirmation.actionSerials.map(
                              (serial) => (
                                <span
                                  key={`move-store-${serial}`}
                                  className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                                >
                                  {serial}
                                </span>
                              ),
                            )}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
                        <div className="text-sm font-semibold text-red-700 dark:text-red-300">
                          Damaged / Scrap → Scrap
                        </div>

                        <div className="mt-2 text-sm leading-6 text-red-800 dark:text-red-200">
                          The damaged{" "}
                          <span className="font-bold">
                            {moveConfirmation.scrapQuantity}
                          </span>{" "}
                          serial number(s) will move to Scrap.
                        </div>
                      </div>

                      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                        Click OK to return the selected{" "}
                        {moveConfirmation.actionQuantity} serial number(s) to Inventory and move the remaining{" "}
                        {moveConfirmation.scrapQuantity} serial number(s) to Scrap.
                      </div>
                    </div>
                  )}
                </>
              )}

              {moveConfirmationError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                  {moveConfirmationError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={closeMoveConfirmation}
                disabled={Boolean(movingId)}
                className="rounded-xl border border-border px-5 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() =>
                  void confirmMoveToInventory()
                }
                disabled={
                  Boolean(movingId) ||
                  moveConfirmationLoading
                }
                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {movingId
                  ? "Moving..."
                  : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectionDetails && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-red-700 dark:text-red-300">
                  Scrap Rejection Details
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Manager rejection details.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setRejectionDetails(
                    null,
                  )
                }
                className="rounded-full border border-border p-2 hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-5 rounded-xl bg-muted p-3">
              <div className="text-xs font-medium text-muted-foreground">
                Rejected By
              </div>

              <div className="mt-1 text-sm font-semibold">
                {
                  rejectionDetails
                    .rejectedBy
                }
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Rejection Reason
              </div>

              <div className="min-h-[110px] whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
                {
                  rejectionDetails
                    .reason
                }
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  setRejectionDetails(
                    null,
                  )
                }
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
