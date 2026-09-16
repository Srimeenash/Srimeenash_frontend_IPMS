import { CostLineItems, costMoney } from "@/components/app/SerialCostDetails";
import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { ArrowLeft } from "lucide-react";
import config from "@/config";
import { fetchJson, fetchAuthenticatedJson } from "@/api";
import { useAuth } from "@/AuthContext";
import { canWork } from "@/permissions";

export default function InwardQCPage() {
  const { grnId } = useParams();
  const { user } = useAuth();

  const canManageInward =
    canWork(user, "inward");
  const [headerPass, setHeaderPass] = useState(false);
const [headerFail, setHeaderFail] = useState(false);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [inwardEntry, setInwardEntry] = useState(null);
  const [qcRows, setQcRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
const [selectedRows, setSelectedRows] = useState([]);
const [showQcQuestions, setShowQcQuestions] = useState(false);
const [showCompletionConfirm, setShowCompletionConfirm] = useState(false);
const [showAllPassConfirm, setShowAllPassConfirm] = useState(false);
const [qcCompleted, setQcCompleted] = useState(false);


const handleRemarkChange = (index, value) => {
  if (!canManageInward) {
    return;
  }

  setQcRows((prev) =>
    prev.map((row, i) =>
      i === index
        ? {
            ...row,
            remarks: value,
          }
        : row
    )
  );
};
const [qcQuestions, setQcQuestions] = useState([
  { id: 1, question: "Is the physical condition acceptable?", answer: "" },
  { id: 2, question: "Does it match purchase specifications?", answer: "" },
]);

  useEffect(() => {
    loadEntry();
  }, [grnId]);
  const formatInwCode = (code, id) => {
    try {
      const key = "dream-to-life-inw-overrides";
      if (typeof window !== "undefined") {
        const overrides = JSON.parse(window.localStorage.getItem(key) || "{}");
        if (overrides && overrides[String(id)]) return overrides[String(id)];
      }

      if (typeof code === "string") {
        const m = code.match(/INW[-_ ]?(\d+)/i);
        if (m) {
          const n = Number(m[1]);
          if (Number.isFinite(n) && n <= 9999) return `INW-${String(n).padStart(4, "0")}`;
        }
      }

      if (id != null && !Number.isNaN(Number(id))) {
        return `INW-${String(Number(id)).padStart(4, "0")}`;
      }

      return code || "";
    } catch (e) {
      return code || "";
    }
  };

function normalizeQcRows(rows, resultType) {
  if (!Array.isArray(rows)) return [];

  return rows.map((row, index) => ({
    ...row,
    id: row.id ?? index + 1,

    serialNumber:
      row.serialNumber ??
      row.serial_number ??
      "",

    result: resultType,

    remarks:
      row.remarks ??
      row.remark ??
      row.reason ??
      "",

    // A saved QC row is locked when the user returns to continue QC.
    saved: true,
  }));
}

  function formatSerialNumber(
    entry,
    rowIndex,
  ) {
    /*
     * Each Inward entry is a separate batch.
     * Use the Inward identity so two batches
     * of the same component never generate
     * duplicate serial numbers.
     */
    const batchValue =
      entry.code ||
      entry.grn ||
      entry.inward_code ||
      entry.id ||
      grnId ||
      "";

    let batchDigits = (
      String(batchValue).match(
        /\d+/g,
      ) || []
    ).join("");

    if (!batchDigits) {
      const componentValue =
        entry.component_code ||
        entry.component_id ||
        entry.component ||
        "";

      batchDigits = (
        String(
          typeof componentValue ===
            "object"
            ? componentValue.component_id ||
                componentValue.id ||
                ""
            : componentValue,
        ).match(/\d+/g) || []
      ).join("");
    }

    batchDigits = batchDigits
      .padStart(5, "0")
      .slice(-5);

    const rowDigits = String(
      rowIndex + 1,
    ).padStart(5, "0");

    return (
      `C_${batchDigits}` +
      `S${rowDigits}`
    );
  }


function handleHeaderPass(checked) {
  if (!canManageInward) {
    return;
  }

  setMessage("");

  if (checked) {
    setShowAllPassConfirm(true);
    return;
  }

  setHeaderPass(false);

  setQcRows((prev) =>
    prev.map((row) => {
      if (row.saved) return row;

      return {
        ...row,
        result:
          row.result === "Pass"
            ? "Pending"
            : row.result,
        remarks:
          row.result === "Pass" &&
          ["all ok", "qc ok"].includes(
            String(row.remarks || "")
              .trim()
              .toLowerCase(),
          )
            ? ""
            : row.remarks || "",
      };
    })
  );
}

function confirmAllPass() {
  if (!canManageInward) {
    return;
  }

  setQcRows((prev) =>
    prev.map((row) =>
      row.saved
        ? row
        : {
            ...row,
            result: "Pass",
            remarks: "QC OK",
          }
    )
  );

  setHeaderPass(true);
  setHeaderFail(false);
  setShowAllPassConfirm(false);
  setMessage("");
}

function cancelAllPass() {
  if (!canManageInward) {
    return;
  }

  setHeaderPass(false);
  setShowAllPassConfirm(false);
}

function handleHeaderFail(checked) {
  if (!canManageInward) {
    return;
  }

  setHeaderFail(checked);
  setHeaderPass(false);
  setShowAllPassConfirm(false);
  setMessage("");

  setQcRows((prev) =>
    prev.map((row) => {
      if (row.saved) return row;

      return {
        ...row,
        result: checked
          ? "Fail"
          : "Pending",
        remarks:
          ["all ok", "qc ok"].includes(
            String(row.remarks || "")
              .trim()
              .toLowerCase(),
          )
            ? ""
            : row.remarks || "",
      };
    })
  );
}

function handleResultChange(index, result) {
  if (!canManageInward) {
    return;
  }

  setQcRows((prev) =>
    prev.map((row, i) => {
      if (i !== index || row.saved) {
        return row;
      }

      const previousRemark = String(
        row.remarks || ""
      );

      const wasAutomaticAllOk =
        previousRemark
          .trim()
          .toLowerCase() === "all ok";

      return {
        ...row,

        result:
          result || "Pending",

        remarks:
          result === "Fail" &&
          wasAutomaticAllOk
            ? ""
            : previousRemark,
      };
    })
  );

  setHeaderPass(false);
  setHeaderFail(false);
  setMessage("");
}
  function buildRows(entry) {
    const count = Math.max(
      Number(
        entry.quantity_received ||
          entry.quantity ||
          entry.items ||
          1,
      ) || 1,
      1,
    );

    const passedRows = normalizeQcRows(
      entry.passedRows ?? entry.qc_passed_rows,
      "Pass",
    );
    const failedRows = normalizeQcRows(
      entry.failedRows ?? entry.qc_failed_rows,
      "Fail",
    );
    const savedRows = [...passedRows, ...failedRows];

    const savedById = new Map();
    const savedBySerial = new Map();

    savedRows.forEach((row) => {
      if (row.id !== undefined && row.id !== null) {
        savedById.set(String(row.id), row);
      }

      const serial = String(
        row.serialNumber || "",
      ).trim();

      if (serial) {
        savedBySerial.set(serial, row);
      }
    });

    return Array.from(
      { length: count },
      (_, index) => {
        const id = index + 1;
        const generatedSerial =
          formatSerialNumber(entry, index);

        const saved =
          savedById.get(String(id)) ||
          savedBySerial.get(generatedSerial) ||
          null;

        return {
          id,
          serialNumber:
            saved?.serialNumber ||
            generatedSerial,
          result:
            saved?.result ||
            "Pending",
          remarks:
            saved?.remarks ||
            "",
          saved: Boolean(saved),
        };
      },
    );
  }

  function getInspectedQuantity(entry) {
    const passedRows = normalizeQcRows(
      entry?.passedRows ??
        entry?.qc_passed_rows,
      "Pass",
    );
    const failedRows = normalizeQcRows(
      entry?.failedRows ??
        entry?.qc_failed_rows,
      "Fail",
    );

    return passedRows.length + failedRows.length;
  }

  function isQcComplete(entry) {
    const received = Math.max(
      Number(
        entry?.quantity_received ||
          entry?.quantity ||
          entry?.items ||
          0,
      ) || 0,
      0,
    );

    const inspected =
      getInspectedQuantity(entry);

    const status = String(
      entry?.qc_status ||
        entry?.inspection_status ||
        entry?.qc_results?.status ||
        entry?.qc?.status ||
        "",
    )
      .trim()
      .toUpperCase();

    return (
      received > 0 &&
      inspected >= received &&
      [
        "PASS",
        "FAIL",
        "COMPLETED",
        "QC COMPLETED",
        "QC_DONE",
      ].includes(status)
    );
  }

async function loadEntry() {
  try {
    setLoading(true);

    const data = await fetchAuthenticatedJson(
      `${config.baseURL}/inward/${grnId}/`
    );

    const [vendors, components, purchaseOrders] = await Promise.all([
      fetchAuthenticatedJson(`${config.baseURL}/vendors/`),
      fetchAuthenticatedJson(`${config.baseURL}/components/components/`),
      fetchAuthenticatedJson(
        `${config.baseURL}/procurement/purchase-orders/`
      ),
    ]);

    const vendorList = Array.isArray(vendors)
      ? vendors
      : vendors.results || [];

    const componentList = Array.isArray(components)
      ? components
      : components.results || [];

    const poList = Array.isArray(purchaseOrders)
      ? purchaseOrders
      : purchaseOrders.results || [];

    const vendor = vendorList.find(
      (v) => String(v.id) === String(data.vendor)
    );

    const component = componentList.find(
      (c) => String(c.id) === String(data.component)
    );

    const po = poList.find(
      (p) => String(p.id) === String(data.purchase_order)
    );

    const normalizedEntry = {
      ...data,

      vendor:
        vendor?.name ||
        vendor?.vendor_name ||
        "-",

      /*
       * Preserve the raw component database ID.
       * component_display is used only by the UI.
       */
      component:
        data.component,

      component_id:
        component?.id ??
        data.component,

      component_code:
        component?.component_id ||
        component?.component_code ||
        component?.code ||
        "",

      component_name:
        component?.name ||
        component?.component_name ||
        component?.component_id ||
        "-",

      component_display:
        [
          component?.component_id,
          component?.name ||
            component?.component_name,
        ]
          .filter(Boolean)
          .join(" — ") ||
        component?.name ||
        component?.component_name ||
        component?.component_id ||
        "-",

      purchase_order:
        data.purchase_order,

      source_mr_number:
        data.source_mr_number ||
        data.sourceMrNumber ||
        po?.source_mr_number ||
        po?.sourceMrNumber ||
        "",

      po:
        po?.po ||
        po?.po_number ||
        "-",
    };

    setInwardEntry(normalizedEntry);
    setQcRows(buildRows(normalizedEntry));
    setQcCompleted(isQcComplete(normalizedEntry));
  } catch (err) {
    console.error(err);
  } finally {
    setLoading(false);
  }
}

  function updateRow(index, field, value) {
    if (!canManageInward) {
      return;
    }

    setQcRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setMessage("");
  }

  function handleSerialChange(index, value) {
    updateRow(index, "serialNumber", value);
  }

  function handleResult(index, result) {
    updateRow(index, "result", result);
  }

  function toggleSelectAll(e) {
  if (!canManageInward) {
    return;
  }

  if (e.target.checked) {
    setSelectedRows(qcRows.map((row) => row.id));
  } else {
    setSelectedRows([]);
  }
}

function toggleRow(id) {
  if (!canManageInward) {
    return;
  }

  setSelectedRows((prev) =>
    prev.includes(id)
      ? prev.filter((x) => x !== id)
      : [...prev, id]
  );
}

function updateSelectedRows(result) {
  if (!canManageInward) {
    return;
  }

  setQcRows((prev) =>
    prev.map((row) =>
      selectedRows.includes(row.id)
        ? { ...row, result }
        : row
    )
  );
}
function handleQcAction(resultType) {
  if (!canManageInward) {
    return;
  }

  updateSelectedRows(resultType);
  setShowQcQuestions(true);
}

function handleQuestionChange(id, value) {
  if (!canManageInward) {
    return;
  }

  setQcQuestions((prev) =>
    prev.map((q) =>
      q.id === id ? { ...q, answer: value } : q
    )
  );
}

  async function handleSave() {
    if (!canManageInward) {
      return false;
    }

    if (!inwardEntry) return false;

    if (showQcQuestions) {
      const incomplete = qcQuestions.some(
        (q) => !q.answer.trim(),
      );

      if (incomplete) {
        setMessage(
          "Please answer all QC questions before submission.",
        );
        return false;
      }
    }

    const inspectedRows = qcRows.filter(
      (row) =>
        row.result === "Pass" ||
        row.result === "Fail",
    );

    const newlyInspectedRows =
      inspectedRows.filter(
        (row) => !row.saved,
      );

    if (!inspectedRows.length) {
      setMessage(
        "Inspect at least one component before submitting QC progress.",
      );
      return false;
    }

    if (!newlyInspectedRows.length) {
      setMessage(
        "No new QC result was added. Inspect at least one remaining component before submitting again.",
      );
      return false;
    }

    const missingSerial =
      inspectedRows.find(
        (row) =>
          !String(
            row.serialNumber || "",
          ).trim(),
      );

    if (missingSerial) {
      setMessage(
        "Please enter a serial number for every inspected component.",
      );
      return false;
    }

    const failedRowWithoutRemark =
      inspectedRows.find(
        (row) =>
          row.result === "Fail" &&
          !String(
            row.remarks || "",
          ).trim(),
      );

    if (failedRowWithoutRemark) {
      setMessage(
        `Remarks are mandatory for failed item ${
          failedRowWithoutRemark.serialNumber ||
          failedRowWithoutRemark.id
        }.`,
      );
      return false;
    }

    const serializeQcRow = (row) => ({
      ...row,
      serialNumber: String(
        row.serialNumber || "",
      ).trim(),
      serial_number: String(
        row.serialNumber || "",
      ).trim(),

      /*
       * Every table row represents exactly one physical component.
       * Pass rows without a manual remark get a standard QC remark so
       * they satisfy the backend audit requirement.
       */
      remarks:
        row.result === "Pass"
          ? String(
              row.remarks || "QC OK",
            ).trim() || "QC OK"
          : String(
              row.remarks || "",
            ).trim(),

      qty: 1,
      quantity: 1,
    });

    const passedRows = inspectedRows
      .filter(
        (row) => row.result === "Pass",
      )
      .map(serializeQcRow);

    const failedRows = inspectedRows
      .filter(
        (row) => row.result === "Fail",
      )
      .map(serializeQcRow);

    setSaving(true);

    const payload = {
      passedRows,
      failedRows,
      qcQuestions,
      purchase_order:
        inwardEntry.purchase_order,
      source_mr_number:
        inwardEntry.source_mr_number ||
        "",
      timestamp:
        new Date().toISOString(),
    };

    try {
      const result =
        await fetchAuthenticatedJson(
          `${config.baseURL}/inward/${grnId}/qc/`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );

      if (!result) {
        throw new Error(
          "Failed to save QC results.",
        );
      }

      const sourceMrNumber =
        result?.source_mr_number ||
        result?.sourceMrNumber ||
        inwardEntry.source_mr_number ||
        "";

      const completed =
        String(
          result?.qc_status || "",
        )
          .trim()
          .toUpperCase() ===
        "COMPLETED";

      const updatedEntry = {
        ...inwardEntry,
        qc_status:
          result?.qc_status ||
          (completed
            ? "COMPLETED"
            : "PARTIALLY_INSPECTED"),
        passedRows:
          result?.passedRows ||
          passedRows,
        failedRows:
          result?.failedRows ||
          failedRows,
        qc_passed_rows:
          result?.passedRows ||
          passedRows,
        qc_failed_rows:
          result?.failedRows ||
          failedRows,
      };

      setInwardEntry(updatedEntry);
      setQcRows(buildRows(updatedEntry));
      setQcCompleted(completed);
      setSelectedRows([]);
      setHeaderPass(false);
      setHeaderFail(false);
      setShowQcQuestions(false);

      window.dispatchEvent(
        new CustomEvent(
          "inventory:changed",
          {
            detail: {
              type: sourceMrNumber
                ? "projectInventoryQcPassed"
                : "storeQcPassed",
              inwardId:
                inwardEntry.id ||
                grnId,
              purchaseOrderId:
                inwardEntry.purchase_order,
              sourceMrNumber,
              qcStatus:
                result?.qc_status,
              inspectedCount:
                result?.inspectedCount ??
                passedRows.length +
                  failedRows.length,
              remainingCount:
                result?.remainingCount,
            },
          },
        ),
      );

      window.dispatchEvent(
        new Event("inwardUpdated"),
      );

      const inspectedCount =
        Number(
          result?.inspectedCount ??
            passedRows.length +
              failedRows.length,
        ) || 0;

      const remainingCount =
        Math.max(
          Number(
            result?.remainingCount ??
              qcRows.length -
                inspectedCount,
          ) || 0,
          0,
        );

      if (completed) {
        setMessage(
          sourceMrNumber
            ? `QC completed. ${passedRows.length} passed component(s) are synchronized to Project Inventory for ${sourceMrNumber}.`
            : `QC completed. ${passedRows.length} passed component(s) are synchronized to In Store.`,
        );
      } else {
        setMessage(
          sourceMrNumber
            ? `QC progress saved: ${inspectedCount}/${qcRows.length} inspected, ${remainingCount} pending. The ${passedRows.length} QC-passed component(s) are now available in Project Inventory and Inventory Notification for ${sourceMrNumber}.`
            : `QC progress saved: ${inspectedCount}/${qcRows.length} inspected, ${remainingCount} pending. Passed components are now available in In Store.`,
        );
      }

      return true;
    } catch (err) {
      console.error(
        "Error saving QC results:",
        err,
      );
      setMessage(
        err.message ||
          "Unable to save QC results.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  const inspectedCount = qcRows.filter(
    (row) =>
      row.result === "Pass" ||
      row.result === "Fail",
  ).length;

  const pendingCount = Math.max(
    qcRows.length - inspectedCount,
    0,
  );

  const savedInspectedCount =
    qcRows.filter(
      (row) => row.saved,
    ).length;

  if (loading) {
    return (
      <PageShell>
        <div className="text-center text-muted-foreground">Loading QC details...</div>
      </PageShell>
    );
  }

  if (!inwardEntry) {
    return (
      <PageShell>
        <div className="text-center text-muted-foreground">Inward entry not found.</div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={`QC for ${formatInwCode(inwardEntry.code, inwardEntry.id || grnId)}`}
        subtitle={`Verify ${qcRows.length} serial numbers before moving stock.`}
left={
  <Link
    to="/inward"
    className="inline-flex items-center gap-2 text-primary hover:underline"
  >
    <ArrowLeft className="size-4" /> Back 
  </Link>
}
      />

      <div className="w-full space-y-6">
        <div className="rounded-[28px] border border-border bg-card p-7 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            {[
              { label: "Vendor", value: inwardEntry.vendor },
              { label: "PO #", value: inwardEntry.po || inwardEntry.poNumber },
              {
                label: "Component",
                value:
                  inwardEntry.component_display ||
                  inwardEntry.component_name ||
                  inwardEntry.component,
              },
              { label: "Quantity", value: qcRows.length },
            ].map((item) => (
              <div key={item.label} className="rounded-3xl border border-border/80 bg-background p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{item.label}</div>
                <div className="mt-2 text-sm font-medium text-foreground">{item.value ?? "-"}</div>
              </div>
            ))}
          </div>
{showQcQuestions && (
  <div className="mb-6 rounded-2xl border p-4 bg-secondary/20">
    <h3 className="mb-3 text-sm font-semibold">
      Mandatory QC Verification
    </h3>

    <div className="space-y-4">
      {qcQuestions.map((q) => (
        <div key={q.id}>
          <label className="text-sm font-medium">
            {q.question}
          </label>

          <input
            type="text"
            value={q.answer}
            disabled={!canManageInward}
            onChange={(e) =>
              handleQuestionChange(q.id, e.target.value)
            }
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="Enter your answer"
          />
        </div>
      ))}
    </div>
  </div>
)}

          <CostLineItems groups={inwardEntry?.cost_details || []} />
          <div className="overflow-x-auto rounded-3xl border border-border bg-background">
            <table className="min-w-full text-sm">
<thead className="bg-secondary/40 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
  <tr>
    <th className="px-4 py-4">S.No</th>
    <th className="px-4 py-4">Serial Number / Purchase Cost</th>
<th className="px-4 py-4 text-center">
  <div className="flex flex-col items-center gap-1">
  <span>All Pass</span>
    <input
      type="checkbox"
      checked={headerPass}
      disabled={!canManageInward}
      onChange={(e) => handleHeaderPass(e.target.checked)}
    />
  </div>
</th>

<th className="px-4 py-4 text-center">
  <div className="flex flex-col items-center gap-1">
    <span>Fail</span>
    <input
      type="checkbox"
      checked={headerFail}
      disabled={!canManageInward}
      onChange={(e) => handleHeaderFail(e.target.checked)}
    />
  </div>
</th>
  <th className="px-4 py-4">
  Remarks{" "}
  <span className="text-red-500">
    * for Fail
  </span>
</th>
    <th className="px-4 py-4">QC Result</th>
    <th className="px-4 py-4">Action</th>
  </tr>
</thead>
<tbody className="divide-y divide-border">
  {qcRows.map((row, idx) => (
    <tr key={row.id} className="hover:bg-secondary/20 transition-colors">
      <td className="px-4 py-4">{idx + 1}</td>

      <td className="px-4 py-4">
        <input
          type="text"
          value={row.serialNumber}
          onChange={(e) => handleSerialChange(idx, e.target.value)}
          disabled={row.saved || !canManageInward}
          placeholder="Enter serial number"
          className="w-full rounded-xl border px-3 py-2"
        />
        <div className="serial-cost-muted">Allocated cost: {costMoney(
          inwardEntry?.cost_details?.[0]?.serials?.find(item => item.serial_number === row.serialNumber)?.allocated_cost
          ?? inwardEntry?.cost_details?.[0]?.pending_costs?.find(item => item.unit_index === row.id - 1)?.allocated_cost
        )}</div>
      </td>

      {/* PASS */}
      <td className="px-4 py-4 text-center">
        <input
          type="checkbox"
          checked={row.result === "Pass"}
          disabled={row.saved || !canManageInward}
          onChange={(e) =>
            handleResultChange(idx, e.target.checked ? "Pass" : "")
          }
        />
      </td>

      {/* FAIL */}
      <td className="px-4 py-4 text-center">
        <input
          type="checkbox"
          checked={row.result === "Fail"}
          disabled={row.saved || !canManageInward}
          onChange={(e) =>
            handleResultChange(idx, e.target.checked ? "Fail" : "")
          }
        />
      </td>

      {/* REMARKS */}
      <td className="px-4 py-4">
       <input
  type="text"
  value={row.remarks || ""}
  onChange={(e) =>
    handleRemarkChange(
      idx,
      e.target.value
    )
  }
  disabled={row.saved || !canManageInward}
  required={row.result === "Fail"}
  aria-required={
    row.result === "Fail"
  }
  placeholder={
    row.result === "Fail"
      ? "Required: enter failure reason"
      : "Optional remarks"
  }
  className={`w-full rounded-xl border px-3 py-2 ${
    row.result === "Fail" &&
    !String(row.remarks || "").trim()
      ? "border-red-500 bg-red-50 dark:bg-red-950/20"
      : "border-border"
  }`}
/>

{row.result === "Fail" &&
  !String(row.remarks || "").trim() && (
    <p className="mt-1 text-xs font-medium text-red-600">
      Failure remark is mandatory.
    </p>
  )}
      </td>

      {/* RESULT */}
      <td className="px-4 py-4">
        <span
          className={`rounded-full px-3 py-1 text-sm ${
            row.result === "Pass"
              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"
              : row.result === "Fail"
              ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200"
              : "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          {row.result || "Pending"}
          {row.saved &&
          row.result !== "Pending"
            ? " ✓"
            : ""}
        </span>
      </td>

      {/* ACTION */}
      <td className="px-4 py-4">
        {row.result === "Pass"
          ? inwardEntry.source_mr_number
            ? "Move to Project Inventory"
            : "Move to In Store"
          : row.result === "Fail"
          ? "Move to Outward"
          : "Pending"}
      </td>
    </tr>
  ))}
</tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                  Inspected: {inspectedCount}/{qcRows.length}
                </span>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                  Pending: {pendingCount}
                </span>
                {savedInspectedCount > 0 && !qcCompleted && (
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-700">
                    Partial QC saved
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {inwardEntry.source_mr_number
                  ? `After QC, passed rows are added to Project Inventory for ${inwardEntry.source_mr_number}. Failed rows are recorded as outward scrap.`
                  : "After QC, passed rows are added to In Store. Failed rows are recorded as outward scrap."}
              </p>
              {message && <p className="mt-2 text-sm text-foreground">{message}</p>}
            </div>
            {canManageInward && (
              <button
                onClick={() => setShowCompletionConfirm(true)}
                disabled={saving || qcCompleted}
                className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {qcCompleted
                  ? "QC Completed"
                  : saving
                    ? "Saving QC..."
                    : savedInspectedCount > 0
                      ? "Submit More QC Progress"
                      : "Submit QC Progress"}
              </button>
            )}
          </div>
        </div>
      </div>
{canManageInward && showAllPassConfirm && (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 py-6">
    <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-950 dark:shadow-black/30">

      <div className="border-b border-border px-6 py-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Confirm All Pass
        </h2>
      </div>

      <div className="space-y-3 px-6 py-5 text-sm text-slate-700 dark:text-slate-300">
        <p>
          Mark all {qcRows.length} items as
          passed?
        </p>

        <p className="text-slate-500 dark:text-slate-400">
          The remark for every item will
          automatically be set to
          <strong> “QC OK”</strong>.
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-border bg-slate-50 px-6 py-4 dark:bg-slate-900 sm:flex-row sm:justify-end">

        <button
          type="button"
          onClick={cancelAllPass}
          className="rounded-full border border-border bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={confirmAllPass}
          className="rounded-full bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700"
        >
          Mark All as Pass
        </button>

      </div>
    </div>
  </div>
)}


      {canManageInward && showCompletionConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-950 dark:shadow-black/30">
            <div className="border-b border-border px-6 py-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Confirm QC Progress
              </h2>
            </div>
            <div className="space-y-4 px-6 py-5 text-sm text-slate-700 dark:text-slate-300">
              <p>
                You have inspected <strong>{inspectedCount}</strong> of{" "}
                <strong>{qcRows.length}</strong> component(s).
              </p>
              {pendingCount > 0 ? (
                <p className="text-amber-700 dark:text-amber-300">
                  {pendingCount} component(s) will remain Pending. Passed
                  components will be released to the next Inventory stage now.
                </p>
              ) : (
                <p>
                  All components are inspected. This will complete QC.
                </p>
              )}
              {/* <p className="text-sm text-slate-500 dark:text-slate-400">If you need more time, click Cancel to review or update QC entries.</p> */}
            </div>
            <div className="flex flex-col gap-3 border-t border-border bg-slate-50 px-6 py-4 dark:bg-slate-900 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowCompletionConfirm(false)}
                className="rounded-full border border-border bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowCompletionConfirm(false);
                  await handleSave();
                }}
                className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}