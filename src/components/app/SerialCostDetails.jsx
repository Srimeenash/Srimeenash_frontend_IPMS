import {
  Fragment,
  useEffect,
  useState,
} from "react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  PageShell,
  PageHeader,
} from "@/components/app/PageShell";

import {
  fetchAuthenticatedJson,
} from "@/api";

import config from "@/config";


/* =========================================================
   COST DETAILS CSS
   ========================================================= */

const SERIAL_COST_CSS = `
.serial-cost-panel{
  width:100%;
  min-width:0;
  border:1px solid #dce3ee;
  border-radius:12px;
  background:#fff;
  color:#172033;
  margin:16px 0;
}

.serial-cost-heading{
  padding:18px 20px;
  border-bottom:1px solid #dce3ee;
}

.serial-cost-heading h2{
  margin:0;
  font-size:17px;
  font-weight:600;
}

.serial-cost-heading p{
  margin:5px 0 0;
  font-size:13px;
  color:#64748b;
}

.serial-cost-table{
  width:100%;
  max-width:100%;
  table-layout:fixed;
  border-collapse:collapse;
  font-size:12px;
}

.serial-cost-table th,
.serial-cost-table td{
  padding:12px 8px;
  border-bottom:1px solid #e2e8f0;
  text-align:right;
  vertical-align:top;
  white-space:normal;
  overflow-wrap:anywhere;
}

.serial-cost-table th{
  background:#f6f8fb;
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:.03em;
  color:#52617a;
}

.serial-cost-table th:first-child,
.serial-cost-table td:first-child{
  text-align:left;
}

.serial-cost-table tr:last-child > td{
  border-bottom:0;
}

.serial-cost-component{
  display:block;
  text-align:left;
  color:#be3459;
  font-weight:600;
  font-size:13px;
  cursor:pointer;
  white-space:normal;
  overflow-wrap:anywhere;
}

.serial-cost-component:focus-visible{
  outline:2px solid #be3459;
  outline-offset:3px;
}

.serial-cost-muted{
  font-size:11px;
  font-weight:400;
  color:#64748b;
  line-height:1.6;
  margin-top:3px;
}

.serial-cost-warning{
  font-size:12px;
  color:#a16207;
  line-height:1.5;
  margin:6px 0;
}

.serial-cost-source{
  font-size:12px;
  margin-bottom:10px;
  text-align:left;
  color:#475569;
}


/* Center Cost Details button */

.serial-cost-column,
td:has(
  button.serial-cost-component:not(
    [aria-expanded]
  )
){
  text-align:center !important;
  vertical-align:middle !important;
}

td :is(div,span):has(
  button.serial-cost-component:not(
    [aria-expanded]
  )
){
  width:100% !important;
  justify-content:center !important;
  text-align:center !important;
}

button.serial-cost-component:not(
  [aria-expanded]
){
  display:block !important;
  width:100% !important;
  min-width:0;
  box-sizing:border-box;
  margin-left:auto !important;
  margin-right:auto !important;
  text-align:center !important;
}


.serial-cost-expanded > td{
  padding:12px;
  background:#fafbfe;
}

.serial-cost-scroll{
  max-height:320px;
  overflow-y:auto;
  border:1px solid #dce3ee;
  border-radius:8px;
}

.serial-cost-serials thead th{
  position:sticky;
  top:0;
  z-index:1;
}

.serial-cost-serials{
  background:#fff;
  font-size:11px;
}

.serial-cost-back{
  margin:0 0 16px;
  font-size:13px;
  color:#be3459;
  font-weight:600;
}

.serial-cost-mr{
  padding:18px 20px;
  border:1px solid #dce3ee;
  border-radius:12px;
  background:#fff;
  margin-bottom:16px;
}

.serial-cost-mr > span{
  display:block;
  font-size:10px;
  font-weight:600;
  color:#64748b;
  letter-spacing:.05em;
}

.serial-cost-mr > strong{
  display:block;
  margin-top:5px;
  font-size:17px;
  overflow-wrap:anywhere;
}

.serial-cost-empty{
  padding:18px;
  border:1px solid #dce3ee;
  border-radius:10px;
  font-size:13px;
  color:#64748b;
}

.serial-cost-invoice input{
  width:100%;
  min-width:0;
  max-width:100%;
  border-radius:6px;
}


/* =========================================================
   TOTAL OF ALL COMPONENTS
   ========================================================= */

.serial-cost-table tfoot td{
  border-top:2px solid #cbd5e1;
  border-bottom:0;
  background:#f8fafc;
  font-weight:700;
}

.serial-cost-grand-total td{
  vertical-align:middle !important;
}

.serial-cost-grand-total td:first-child{
  text-transform:uppercase;
  letter-spacing:.03em;
}


/* =========================================================
   DARK MODE
   ========================================================= */

.dark .serial-cost-panel,
.dark .serial-cost-mr,
.dark .serial-cost-serials{
  background:#0f172a;
  color:#e2e8f0;
  border-color:#334155;
}

.dark .serial-cost-table th,
.dark .serial-cost-expanded > td{
  background:#1e293b;
  color:#cbd5e1;
}

.dark .serial-cost-table td,
.dark .serial-cost-heading,
.dark .serial-cost-scroll{
  border-color:#334155;
}

.dark .serial-cost-muted,
.dark .serial-cost-source{
  color:#94a3b8;
}

.dark .serial-cost-component,
.dark .serial-cost-back{
  color:#fb7185;
}

.dark .serial-cost-table tfoot td{
  background:#162033;
  border-top-color:#475569;
  color:#f8fafc;
}


@media(max-width:900px){

  .serial-cost-table th,
  .serial-cost-table td{
    padding:9px 4px;
  }

  .serial-cost-table{
    font-size:11px;
  }

  .serial-cost-table th{
    font-size:9px;
  }

  .serial-cost-component{
    font-size:12px;
  }
}
`;


/* =========================================================
   STYLES
   ========================================================= */

function useSerialCostStyles() {

  useEffect(() => {

    if (
      typeof document === "undefined"
    ) {
      return;
    }

    const styleId =
      "ipms-serial-cost-details-styles";

    let styleElement =
      document.getElementById(
        styleId
      );

    if (!styleElement) {

      styleElement =
        document.createElement(
          "style"
        );

      styleElement.id =
        styleId;

      document.head.appendChild(
        styleElement
      );
    }

    if (
      styleElement.textContent !==
      SERIAL_COST_CSS
    ) {

      styleElement.textContent =
        SERIAL_COST_CSS;
    }

  }, []);
}


/* =========================================================
   MONEY HELPERS
   ========================================================= */

export const costMoney = (
  value
) => {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return `₹${Number(
    value
  ).toLocaleString(
    "en-IN",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )}`;
};


const amounts = [
  "basic_amount",
  "discount",
  "gst_amount",
  "freight_cost",
  "freight_gst_amount",
  "round_off",
  "other_charges",
  "rounding_adjustment",
  "allocated_cost",
];


const sumRows = (
  rows
) => {

  return Object.fromEntries(

    amounts.map(
      (key) => [

        key,

        (
          rows.reduce(
            (
              sum,
              row
            ) =>
              sum +
              Math.round(
                Number(
                  row?.[key] || 0
                ) * 100
              ),
            0
          ) / 100
        ).toFixed(2),

      ]
    )
  );
};


const unique = (
  values
) => [

  ...new Set(
    values.filter(
      Boolean
    )
  ),

];


const normalizeCostIdentity = (
  value
) =>
  String(
    value ?? ""
  )
    .trim()
    .toLowerCase();


const getRecordMrNumber = (
  record = {}
) =>
  String(
    record.material_request_number ??
    record.materialRequestNumber ??
    record.source_mr_number ??
    record.material_request_id ??
    ""
  ).trim();


const splitInDroneGroupBySource = (
  record,
  group
) => {
  const serialRows =
    Array.isArray(
      group?.serials
    )
      ? group.serials
      : [];

  if (!serialRows.length) {
    return [];
  }

  const currentMr =
    normalizeCostIdentity(
      getRecordMrNumber(
        record
      )
    );

  const buckets =
    new Map();

  serialRows.forEach(
    (row) => {
      const rowMr =
        normalizeCostIdentity(
          row?.mr_number
        );

      const poNumber =
        String(
          row?.po_number ??
          ""
        ).trim();

      const orderType =
        String(
          row?.order_type ??
          ""
        )
          .trim()
          .toUpperCase();

      const replacementRound =
        Number(
          row?.replacement_round ??
          0
        );

      /*
       * A serial is treated as current-MR procurement only when
       * its immutable purchase-cost source points to this MR.
       * Stock purchased for an older MR and later issued here is
       * correctly shown as In Store.
       */
      const isCurrentMrPurchase =
        Boolean(
          currentMr &&
          rowMr &&
          currentMr === rowMr &&
          poNumber
        );

      const isReplacement =
        isCurrentMrPurchase &&
        (
          orderType ===
            "REPLACEMENT" ||
          replacementRound > 0 ||
          Boolean(
            String(
              row?.replacement_for_po_number ??
              ""
            ).trim()
          )
        );

      let bucketKey;
      let sourceLabel;
      let sourceType;

      if (
        isCurrentMrPurchase &&
        isReplacement
      ) {
        bucketKey =
          `reorder:${poNumber}`;

        sourceType =
          "reordered";

        sourceLabel =
          `Reordered PO${
            replacementRound > 0
              ? ` R${replacementRound}`
              : ""
          } · ${poNumber}`;

      } else if (
        isCurrentMrPurchase
      ) {
        bucketKey =
          `original:${poNumber}`;

        sourceType =
          "original";

        sourceLabel =
          `Original PO · ${poNumber}`;

      } else {
        bucketKey =
          "instore";

        sourceType =
          "instore";

        sourceLabel =
          "In Store";
      }

      if (
        !buckets.has(
          bucketKey
        )
      ) {
        buckets.set(
          bucketKey,
          {
            rows: [],
            sourceLabel,
            sourceType,
            poNumber:
              isCurrentMrPurchase
                ? poNumber
                : "",
            replacementRound:
              isReplacement
                ? replacementRound
                : 0,
          }
        );
      }

      buckets
        .get(bucketKey)
        .rows
        .push(row);
    }
  );

  return [
    ...buckets.entries()
  ].map(
    ([
      sourceKey,
      bucket,
    ]) => {
      const rows = [
        ...new Map(
          bucket.rows.map(
            (row) => [
              row.serial_number,
              row,
            ]
          )
        ).values(),
      ];

      const known =
        rows.filter(
          (row) =>
            row.cost_available
        );

      return {
        ...group,

        serials:
          rows,

        quantity:
          rows.length,

        totals:
          sumRows(
            known
          ),

        receipt_totals:
          undefined,

        pending_costs:
          [],

        cost_complete:
          known.length ===
          rows.length,

        unpriced_quantity:
          Math.max(
            rows.length -
            known.length,
            0
          ),

        cost_source_key:
          sourceKey,

        cost_source_type:
          bucket.sourceType,

        cost_source_label:
          bucket.sourceLabel,

        cost_source_po:
          bucket.poNumber,

        replacement_round:
          bucket.replacementRound,
      };
    }
  );
};


/* =========================================================
   VIEW DETAILS BUTTON
   ========================================================= */

export function CostDetailsButton({
  onClick,
}) {

  useSerialCostStyles();

  return (

    <button
      type="button"
      className="serial-cost-component"
      onClick={onClick}
    >

      View Details

    </button>
  );
}


/* =========================================================
   COST DETAILS TABLE COLUMN
   ========================================================= */

export function costDetailsColumn(
  kind,
  openCostDetails,
  key = "serialPurchaseCosts"
) {

  return {

    key,

    header:
      "Cost Details",

    className:
      "serial-cost-column text-center align-middle",

    render:
      (row) => (

        <CostDetailsButton
          onClick={() =>
            openCostDetails(
              kind,
              row
            )
          }
        />

      ),

  };
}


/* =========================================================
   COMPONENT COST TABLE
   ========================================================= */

export function CostLineItems({
  groups = [],
  title = "Component Line Items",
}) {

  useSerialCostStyles();

  const [
    expanded,
    setExpanded,
  ] = useState({});


  if (!groups.length) {

    return (

      <div className="serial-cost-empty">

        No component cost details are
        available for this record.

      </div>
    );
  }


  /* =======================================================
     TOTAL QUANTITY OF ALL COMPONENTS
     ======================================================= */

  const grandQuantity =
    groups.reduce(
      (
        sum,
        group
      ) =>
        sum +
        Number(
          group?.quantity || 0
        ),
      0
    );


  /* =======================================================
     TOTAL PRICE OF ALL COMPONENTS

     For In Drone:
     - issued In Store components
     - issued QC passed PO components
     - issued replacement PO components

     QC failed items are already excluded before reaching
     this table.
     ======================================================= */

  const grandTotals =
    sumRows(

      groups.map(
        (group) =>
          group?.receipt_totals ||
          group?.totals ||
          {}
      )

    );


  const grandAdjustment =

    Number(
      grandTotals.round_off || 0
    )

    +

    Number(
      grandTotals.other_charges ||
      0
    )

    +

    Number(
      grandTotals
        .rounding_adjustment ||
      0
    );


  return (

    <section
      className="serial-cost-panel"
    >

      <div
        className="serial-cost-heading"
      >

        <h2>
          {title}
        </h2>

        <p>
          Click a component to view
          its serial numbers and
          purchase costs.
        </p>

      </div>


      <table
        className="serial-cost-table"
      >

        <colgroup>

          <col
            style={{
              width: "24%",
            }}
          />

          <col
            style={{
              width: "6%",
            }}
          />

          <col
            style={{
              width: "6%",
            }}
          />

          <col
            style={{
              width: "10%",
            }}
          />

          <col
            style={{
              width: "8%",
            }}
          />

          <col
            style={{
              width: "10%",
            }}
          />

          <col
            style={{
              width: "9%",
            }}
          />

          <col
            style={{
              width: "9%",
            }}
          />

          <col
            style={{
              width: "8%",
            }}
          />

          <col
            style={{
              width: "10%",
            }}
          />

        </colgroup>


        <thead>

          <tr>

            <th>
              Component
            </th>

            <th>
              Qty
            </th>

            <th>
              UOM
            </th>

            <th>
              Basic amount
            </th>

            <th>
              Discount
            </th>

            <th>
              GST
            </th>

            <th>
              Freight
            </th>

            <th>
              Freight GST
            </th>

            <th>
              Adjustments
            </th>

            <th>
              Total cost
            </th>

          </tr>

        </thead>


        <tbody>

          {groups.map(
            (
              group,
              index
            ) => {

              const key =
                `${group.component_id}-${index}`;


              const rows =
                group.serials || [];


              const totals =

                group.receipt_totals ||

                group.totals ||

                {};


              const isReceipt =
                Boolean(
                  group.receipt_totals
                );


              const hasCost =

                isReceipt ||

                rows.some(
                  (row) =>
                    row.cost_available
                );


              const adjustment =

                Number(
                  totals.round_off ||
                  0
                )

                +

                Number(
                  totals.other_charges ||
                  0
                )

                +

                Number(
                  totals
                    .rounding_adjustment ||
                  0
                );


              const prices =
                unique(

                  rows

                    .filter(
                      (row) =>
                        row.cost_available
                    )

                    .map(
                      (row) =>
                        row.unit_price
                    )

                );


              if (
                !prices.length
              ) {

                prices.push(
                  ...unique(
                    (
                      group.pending_costs ||
                      []
                    ).map(
                      (row) =>
                        row.unit_price
                    )
                  )
                );
              }

              const uom = [
                group.uom,
                group.unit,
                group.unit_of_measurements,
                group.unitOfMeasurements,
                ...rows.map(
                  (row) =>
                    row.uom ||
                    row.unit ||
                    row.unit_of_measurements ||
                    row.unitOfMeasurements,
                ),
                ...(group.pending_costs || []).map(
                  (row) =>
                    row.uom ||
                    row.unit ||
                    row.unit_of_measurements ||
                    row.unitOfMeasurements,
                ),
              ].find(
                (value) => String(value || "").trim(),
              ) || "-";


              return (

                <Fragment
                  key={key}
                >

                  {/* ======================================
                      COMPONENT SUMMARY ROW
                      ====================================== */}

                  <tr>

                    <td>

                      <button

                        type="button"

                        className=
                          "serial-cost-component"

                        aria-expanded={
                          Boolean(
                            expanded[key]
                          )
                        }

                        onClick={() =>

                          setExpanded(
                            (
                              previous
                            ) => ({

                              ...previous,

                              [key]:
                                !previous[
                                  key
                                ],

                            })
                          )

                        }
                      >

                        {
                          expanded[key]
                            ? "▾"
                            : "▸"
                        }

                        {" "}

                        {
                          group.component_name ||
                          "Component"
                        }

                      </button>


                      <div
                        className=
                          "serial-cost-muted"
                      >

                        {
                          group.component_code
                        }

                      </div>


                      {
                        group.cost_source_label && (
                          <div
                            className=
                              "serial-cost-muted"
                            style={{
                              fontWeight: 600,
                              marginTop: "4px",
                            }}
                          >
                            {
                              group.cost_source_label
                            }
                          </div>
                        )
                      }


                      <div
                        className=
                          "serial-cost-muted"
                      >

                        Unit price:{" "}

                        {
                          prices.length === 1

                            ? costMoney(
                                prices[0]
                              )

                            : prices.length

                              ? `${costMoney(
                                  Math.min(
                                    ...prices.map(
                                      Number
                                    )
                                  )
                                )} – ${costMoney(
                                  Math.max(
                                    ...prices.map(
                                      Number
                                    )
                                  )
                                )}`

                              : "—"
                        }

                      </div>

                    </td>


                    <td>
                      {group.quantity}
                    </td>

                    <td>
                      {uom}
                    </td>


                    {[
                      "basic_amount",
                      "discount",
                      "gst_amount",
                      "freight_cost",
                      "freight_gst_amount",
                    ].map(
                      (
                        field
                      ) => (

                        <td
                          key={field}
                        >

                          {
                            hasCost
                              ? costMoney(
                                  totals[
                                    field
                                  ]
                                )
                              : "—"
                          }

                        </td>

                      )
                    )}


                    <td>

                      {
                        hasCost
                          ? costMoney(
                              adjustment
                            )
                          : "—"
                      }

                    </td>


                    <td>

                      <strong>

                        {
                          hasCost
                            ? costMoney(
                                totals
                                  .allocated_cost
                              )
                            : "—"
                        }

                      </strong>


                      {
                        !isReceipt &&
                        !group.cost_complete && (

                          <div
                            className=
                              "serial-cost-warning"
                          >

                            {
                              group
                                .unpriced_quantity
                            }{" "}
                            unpriced

                          </div>

                        )
                      }

                    </td>

                  </tr>


                  {/* ======================================
                      SERIAL LEVEL DETAILS
                      ====================================== */}

                  {
                    expanded[key] && (

                      <tr
                        className=
                          "serial-cost-expanded"
                      >

                        <td
                          colSpan={10}
                        >

                          {
                            group.cost_error && (

                              <p
                                className=
                                  "serial-cost-warning"
                              >

                                {
                                  group.cost_error
                                }

                              </p>

                            )
                          }


                          {
                            group.receipt_source && (

                              <div
                                className=
                                  "serial-cost-source"
                              >

                                Vendor:{" "}

                                {
                                  group
                                    .receipt_source
                                    .vendor_name ||
                                  "—"
                                }

                                {" · "}

                                PO:{" "}

                                {
                                  group
                                    .receipt_source
                                    .po_number ||
                                  "Direct inward"
                                }

                                {" · "}

                                Basis:{" "}

                                {
                                  group
                                    .receipt_source
                                    .basis
                                }

                              </div>

                            )
                          }


                          <div

                            className=
                              "serial-cost-scroll"

                            tabIndex={0}

                            aria-label={
                              `Serial costs for ${
                                group
                                  .component_name
                              }`
                            }

                          >

                            <table
                              className=
                                "serial-cost-table serial-cost-serials"
                            >

                              <colgroup>

                                <col
                                  style={{
                                    width:
                                      "24%",
                                  }}
                                />

                                <col
                                  style={{
                                    width:
                                      "10%",
                                  }}
                                />

                                <col
                                  style={{
                                    width:
                                      "9%",
                                  }}
                                />

                                <col
                                  style={{
                                    width:
                                      "9%",
                                  }}
                                />

                                <col
                                  style={{
                                    width:
                                      "9%",
                                  }}
                                />

                                <col
                                  style={{
                                    width:
                                      "9%",
                                  }}
                                />

                                <col
                                  style={{
                                    width:
                                      "9%",
                                  }}
                                />

                                <col
                                  style={{
                                    width:
                                      "11%",
                                  }}
                                />

                                <col
                                  style={{
                                    width:
                                      "10%",
                                  }}
                                />

                              </colgroup>


                              <thead>

                                <tr>

                                  <th>
                                    Serial /
                                    source
                                  </th>

                                  <th>
                                    Unit price
                                  </th>

                                  <th>
                                    Discount
                                  </th>

                                  <th>
                                    GST
                                  </th>

                                  <th>
                                    Freight
                                  </th>

                                  <th>
                                    Freight GST
                                  </th>

                                  <th>
                                    Adjustments
                                  </th>

                                  <th>
                                    Serial cost
                                  </th>

                                  <th>
                                    Status
                                  </th>

                                </tr>

                              </thead>


                              <tbody>

                                {
                                  rows.map(
                                    (
                                      row,
                                      rowIndex
                                    ) => (

                                      <tr
                                        key={
                                          `${row.serial_number}-${rowIndex}`
                                        }
                                      >

                                        <td>

                                          <strong>

                                            {
                                              row
                                                .serial_number
                                            }

                                          </strong>


                                          <div
                                            className=
                                              "serial-cost-muted"
                                          >

                                            {
                                              row
                                                .vendor_name ||
                                              "Vendor unavailable"
                                            }

                                          </div>


                                          <div
                                            className=
                                              "serial-cost-muted"
                                          >

                                            PO:{" "}

                                            {
                                              row
                                                .po_number ||
                                              "—"
                                            }

                                            {" · "}

                                            Inward:{" "}

                                            {
                                              row
                                                .inward_code ||

                                              row
                                                .inventory_code ||

                                              "—"
                                            }

                                          </div>


                                          <div
                                            className=
                                              "serial-cost-muted"
                                          >

                                            {
                                              row
                                                .invoice_number

                                                ? `Invoice: ${
                                                    row
                                                      .invoice_number
                                                  }`

                                                : (
                                                    row.invoices ||
                                                    []
                                                  )

                                                    .map(
                                                      (
                                                        invoice
                                                      ) =>
                                                        invoice
                                                          .invoice_number
                                                    )

                                                    .filter(
                                                      Boolean
                                                    )

                                                    .join(
                                                      ", "
                                                    )
                                            }

                                          </div>

                                        </td>


                                        <td>

                                          {
                                            row
                                              .cost_available

                                              ? costMoney(
                                                  row
                                                    .unit_price
                                                )

                                              : "—"
                                          }


                                          <div
                                            className=
                                              "serial-cost-muted"
                                          >

                                            Basic:{" "}

                                            {
                                              row
                                                .cost_available

                                                ? costMoney(
                                                    row
                                                      .basic_amount
                                                  )

                                                : "—"
                                            }

                                          </div>

                                        </td>


                                        <td>

                                          {
                                            row
                                              .cost_available

                                              ? costMoney(
                                                  row
                                                    .discount
                                                )

                                              : "—"
                                          }

                                        </td>


                                        <td>

                                          {
                                            row
                                              .cost_available

                                              ? costMoney(
                                                  row
                                                    .gst_amount
                                                )

                                              : "—"
                                          }


                                          <div
                                            className=
                                              "serial-cost-muted"
                                          >

                                            {
                                              row
                                                .cost_available

                                                ? `${
                                                    row
                                                      .gst_percentage ||
                                                    0
                                                  }%`

                                                : ""
                                            }

                                          </div>

                                        </td>


                                        <td>

                                          {
                                            row
                                              .cost_available

                                              ? costMoney(
                                                  row
                                                    .freight_cost
                                                )

                                              : "—"
                                          }

                                        </td>


                                        <td>

                                          {
                                            row
                                              .cost_available

                                              ? costMoney(
                                                  row
                                                    .freight_gst_amount
                                                )

                                              : "—"
                                          }


                                          <div
                                            className=
                                              "serial-cost-muted"
                                          >

                                            {
                                              row
                                                .cost_available

                                                ? `${
                                                    row
                                                      .freight_gst_percentage ||
                                                    0
                                                  }%`

                                                : ""
                                            }

                                          </div>

                                        </td>


                                        <td>

                                          {
                                            row
                                              .cost_available

                                              ? costMoney(

                                                  Number(
                                                    row
                                                      .round_off ||
                                                    0
                                                  )

                                                  +

                                                  Number(
                                                    row
                                                      .other_charges ||
                                                    0
                                                  )

                                                  +

                                                  Number(
                                                    row
                                                      .rounding_adjustment ||
                                                    0
                                                  )

                                                )

                                              : "—"
                                          }

                                        </td>


                                        <td>

                                          <strong>

                                            {
                                              row
                                                .cost_available

                                                ? costMoney(
                                                    row
                                                      .allocated_cost
                                                  )

                                                : "Unpriced"
                                            }

                                          </strong>

                                        </td>


                                        <td>

                                          {
                                            row.status ||
                                            "Recorded"
                                          }

                                        </td>

                                      </tr>

                                    )
                                  )
                                }


                                {
                                  !rows.length && (

                                    <tr>

                                      <td
                                        colSpan={9}
                                      >

                                        Serial
                                        numbers will
                                        appear after
                                        QC saves
                                        them.

                                      </td>

                                    </tr>

                                  )
                                }

                              </tbody>

                            </table>

                          </div>


                          {
                            group
                              .pending_costs
                              ?.length > 0 && (

                              <p
                                className=
                                  "serial-cost-muted"
                              >

                                {
                                  group
                                    .pending_costs
                                    .length
                                }{" "}
                                unit(s)
                                awaiting
                                serial cost
                                assignment.
                                Receipt total
                                includes these
                                units.

                              </p>

                            )
                          }

                        </td>

                      </tr>

                    )
                  }

                </Fragment>

              );

            }
          )}

        </tbody>


        {/* =================================================
            TOTAL OF ALL COMPONENTS
            ================================================= */}

        <tfoot>

          <tr
            className=
              "serial-cost-grand-total"
          >

            <td>

              Total of all components

            </td>


            <td>

              {grandQuantity}

            </td>


            <td>

              —

            </td>


            <td>

              {costMoney(
                grandTotals.basic_amount
              )}

            </td>


            <td>

              {costMoney(
                grandTotals.discount
              )}

            </td>


            <td>

              {costMoney(
                grandTotals.gst_amount
              )}

            </td>


            <td>

              {costMoney(
                grandTotals.freight_cost
              )}

            </td>


            <td>

              {costMoney(
                grandTotals
                  .freight_gst_amount
              )}

            </td>


            <td>

              {costMoney(
                grandAdjustment
              )}

            </td>


            <td>

              <strong>

                {costMoney(
                  grandTotals
                    .allocated_cost
                )}

              </strong>

            </td>

          </tr>

        </tfoot>

      </table>

    </section>
  );
}


/* =========================================================
   BUILD DETAIL REFERENCES
   ========================================================= */

function referencesFor(
  kind,
  row
) {

  if (
    kind === "materialRequest" ||
    kind === "inDrone"
  ) {

    return [
      {
        kind,
        id: String(
          row.backendId ??
          row.id ??
          row.material_request_id ??
          ""
        ),
      },
    ];
  }


  if (
    (
      kind === "inventory" ||
      kind === "projectInventory"
    ) &&
    row.source === "inward"
  ) {

    return unique(

      row.inwardIds?.length

        ? row.inwardIds

        : [
            row.inwardId ??
            row.backendId
          ]

    ).map(
      (id) => ({
        kind:
          "inwardPassed",
        id:
          String(id),
      })
    );
  }


  if (
    kind === "inventory" &&
    row.backendIds?.length
  ) {

    return unique(
      row.backendIds
    ).map(
      (id) => ({
        kind,
        id:
          String(id),
      })
    );
  }


  if (
    kind === "projectInventory" &&
    row.inwardIds?.length &&
    row.inwardId
  ) {

    return unique(
      row.inwardIds
    ).map(
      (id) => ({
        kind:
          "inwardPassed",
        id:
          String(id),
      })
    );
  }


  const children =

    Array.isArray(
      row.componentRows
    ) &&
    row.componentRows.length

      ? row.componentRows

      : [row];


  return children

    .map(
      (item) => {

        const raw =
          String(
            item.id ??
            item.backendId ??
            item.outward_id ??
            ""
          );


        if (
          raw.startsWith(
            "qc-failed-"
          ) ||
          kind === "failedQc"
        ) {

          const inwardId =

            item.inward_id ??

            item.inwardId ??

            item.inwardEntryId ??

            raw.match(
              /^qc-failed-(\d+)/
            )?.[1];


          if (inwardId) {

            return {

              kind:
                "failedQc",

              id:
                String(
                  inwardId
                ),

            };
          }
        }


        return {

          kind,

          id:
            String(
              item.backendId ??
              item.id ??
              item.outward_id ??
              ""
            ),

        };

      }
    )

    .filter(
      (reference) =>
        reference.id
    );
}


/* =========================================================
   COST DETAILS HOOK
   ========================================================= */

export function useCostDetails() {

  useSerialCostStyles();

  const location =
    useLocation();

  const navigate =
    useNavigate();


  const params =
    new URLSearchParams(
      location.search
    );


  const encoded =
    params.get(
      "costDetails"
    );


  const openCostDetails = (
    kind,
    row
  ) => {

    const refs =
      referencesFor(
        kind,
        row
      );


    const next =
      new URLSearchParams(
        location.search
      );


    next.set(
      "costDetails",
      JSON.stringify(
        refs
      )
    );


    navigate({

      pathname:
        location.pathname,

      search:
        `?${next}`,

    });
  };


  const close = () => {

    const next =
      new URLSearchParams(
        location.search
      );


    next.delete(
      "costDetails"
    );


    navigate({

      pathname:
        location.pathname,

      search:
        next.toString()
          ? `?${next}`
          : "",

    });
  };


  return {

    openCostDetails,

    costDetailsPage:
      encoded

        ? (

          <StockCostDetails
            key={encoded}
            encoded={encoded}
            onBack={close}
          />

        )

        : null,

  };
}


/* =========================================================
   COST DETAILS PAGE
   ========================================================= */

function StockCostDetails({
  encoded,
  onBack,
}) {

  const [
    state,
    setState,
  ] = useState({

    loading: true,

    error: "",

    records: [],

  });


  useEffect(
    () => {

      let cancelled =
        false;


      async function load() {

        try {

          const refs =
            JSON.parse(
              encoded
            );


          if (
            !Array.isArray(
              refs
            ) ||
            !refs.length ||
            refs.length > 200
          ) {

            throw new Error(
              "Invalid detail reference."
            );
          }


          const endpoints = {

            outward:
              "outward",

            inventory:
              "inventory/inventory",

            projectInventory:
              "inventory/project-inventory",

            failedQc:
              "inward",

            inwardPassed:
              "inward",

            inward:
              "inward",

            engineerScrap:
              "outward",

            materialRequest:
              "materialrequest/material-requests",

            inDrone:
              "materialrequest/material-requests",

          };


          const records =
            await Promise.all(

              refs.map(
                async (
                  reference
                ) => {

                  if (
                    !endpoints[
                      reference.kind
                    ] ||
                    !/^\d+$/.test(
                      reference.id
                    )
                  ) {

                    throw new Error(
                      "This row has no saved detail reference."
                    );
                  }


                  let record;


                  /* =======================================
                     ENGINEER SCRAP
                     ======================================= */

                  if (
                    reference.kind ===
                    "engineerScrap"
                  ) {

                    const data =
                      await fetchAuthenticatedJson(

                        `${config.baseURL}/outward/engineer-scrap/`

                      );


                    const list =
                      Array.isArray(
                        data
                      )

                        ? data

                        : data.results ||
                          [];


                    record =
                      list.find(
                        (item) =>
                          String(
                            item.id
                          ) ===
                          reference.id
                      );


                    if (!record) {

                      throw new Error(
                        "Scrap record was not found or is unavailable to your account."
                      );
                    }

                  }

                  else {

                    record =
                      await fetchAuthenticatedJson(

                        `${config.baseURL}/${endpoints[reference.kind]}/${reference.id}/`,

                        {
                          cache:
                            "no-store",
                        }

                      );
                  }


                  /* =======================================
                     IN DRONE

                     IMPORTANT:
                     Only actual ISSUED serials are counted.

                     This means:

                     In Store issued       -> included
                     Original PO QC pass   -> included
                     Replacement PO pass   -> included

                     QC failed             -> excluded
                     Scrap                 -> excluded
                     Available/not issued  -> excluded
                     ======================================= */

                  if (
                    reference.kind ===
                    "inDrone"
                  ) {
                    const sourceGroups =
                      Array.isArray(
                        record
                          .drone_cost_details
                      )
                        ? record
                            .drone_cost_details
                        : record
                            .cost_details ||
                          [];

                    const issuedDetails =
                      sourceGroups.flatMap(
                        (group) => {
                          const issuedSerials =
                            (
                              group.serials ||
                              []
                            ).filter(
                              (serialRow) =>
                                String(
                                  serialRow
                                    .status ||
                                  ""
                                )
                                  .trim()
                                  .toLowerCase() ===
                                "issued"
                            );

                          if (
                            !issuedSerials.length
                          ) {
                            return [];
                          }

                          return (
                            splitInDroneGroupBySource(
                              record,
                              {
                                ...group,
                                serials:
                                  issuedSerials,
                                quantity:
                                  issuedSerials
                                    .length,
                                receipt_totals:
                                  undefined,
                              }
                            )
                          );
                        }
                      );

                    record = {
                      ...record,
                      cost_details:
                        issuedDetails,
                    };
                  }


                  /* =======================================
                     INWARD PASS / FAILED DETAILS
                     ======================================= */

                  if (
                    reference.kind ===
                      "failedQc" ||

                    reference.kind ===
                      "inwardPassed"
                  ) {

                    record = {

                      ...record,

                      cost_details:
                        (
                          record
                            .cost_details ||
                          []
                        ).map(
                          (
                            group
                          ) => {

                            const serialRows =
                              (
                                group.serials ||
                                []
                              ).filter(
                                (
                                  serialRow
                                ) =>
                                  serialRow
                                    .status ===
                                  (
                                    reference.kind ===
                                    "failedQc"

                                      ? "QC failed"

                                      : "QC passed"
                                  )
                              );


                            const known =
                              serialRows.filter(
                                (
                                  serialRow
                                ) =>
                                  serialRow
                                    .cost_available
                              );


                            return {

                              ...group,

                              serials:
                                serialRows,

                              quantity:
                                serialRows
                                  .length,

                              totals:
                                sumRows(
                                  known
                                ),

                              receipt_totals:
                                undefined,

                              pending_costs:
                                [],

                              cost_complete:
                                known
                                  .length ===
                                serialRows
                                  .length,

                              unpriced_quantity:
                                serialRows
                                  .length -
                                known
                                  .length,

                            };

                          }
                        ),

                    };
                  }


                  return record;

                }
              )
            );


          if (!cancelled) {

            setState({

              loading:
                false,

              error:
                "",

              records,

            });
          }

        }

        catch (
          error
        ) {

          if (
            !cancelled
          ) {

            setState({

              loading:
                false,

              error:
                error.message ||
                "Unable to load details.",

              records:
                [],

            });
          }
        }
      }


      void load();


      return () => {

        cancelled =
          true;

      };

    },

    [encoded]
  );


  /* =======================================================
     MERGE SAME COMPONENT FROM MULTIPLE SOURCES / POs

     Example:

     Propeller:
       Original PO passed serials
       +
       Replacement PO passed serials

     They appear as one component row, while serial details
     still show their original PO / Inward source.
     ======================================================= */

  const groups = [

    ...state.records

      .flatMap(
        (
          record
        ) =>
          record.cost_details ||
          []
      )

      .reduce(
        (
          map,
          group
        ) => {

          const key =
            String(
              group.cost_source_key
                ? `${
                    group.component_id ??
                    group.component_name
                  }|${
                    group.cost_source_key
                  }`
                : (
                    group.component_id ??
                    group.component_name
                  )
            );


          const previous =
            map.get(
              key
            );


          if (
            !previous
          ) {

            map.set(
              key,
              {
                ...group,
              }
            );

            return map;
          }


          /* ===============================================
             REMOVE DUPLICATE SERIALS

             Same physical serial must never be counted
             twice.
             =============================================== */

          const rows = [

            ...new Map(

              [

                ...(
                  previous.serials ||
                  []
                ),

                ...(
                  group.serials ||
                  []
                ),

              ].map(
                (
                  row
                ) => [

                  row.serial_number,

                  row,

                ]
              )

            ).values(),

          ];


          const known =
            rows.filter(
              (
                row
              ) =>
                row.cost_available
            );


          /*
           * Use unique merged serial count whenever serial
           * rows are present. This prevents the same serial
           * being counted twice if multiple API records
           * reference it.
           */
          const quantity =
            rows.length > 0
              ? rows.length
              : (
                  Number(
                    previous.quantity ||
                    0
                  )
                  +
                  Number(
                    group.quantity ||
                    0
                  )
                );


          const merged = {

            ...previous,

            serials:
              rows,

            quantity,

            totals:
              sumRows(
                known
              ),

            cost_complete:
              known.length ===
              quantity,

            unpriced_quantity:
              Math.max(
                quantity -
                known.length,
                0
              ),

          };


          if (
            previous
              .receipt_totals &&
            group
              .receipt_totals
          ) {

            merged
              .receipt_totals =
                sumRows(
                  [

                    previous
                      .receipt_totals,

                    group
                      .receipt_totals,

                  ]
                );
          }


          map.set(
            key,
            merged
          );


          return map;

        },

        new Map()
      )

      .values(),

  ];


  /* =======================================================
     MR NUMBER
     ======================================================= */

  const currentMrs =
    unique(

      state.records.map(
        (
          record
        ) =>

          record
            .material_request_number ||

          record
            .materialRequestNumber ||

          record
            .source_mr_number ||

          record
            .material_request_id

      )

    );


  const mrs =

    currentMrs.length

      ? currentMrs

      : unique(

          groups.flatMap(
            (
              group
            ) =>

              (
                group.serials ||
                []
              ).map(
                (
                  serialRow
                ) =>
                  serialRow
                    .mr_number
              )

          )

        );


  return (

    <PageShell>

      <PageHeader

        title=
          "Component Details"

        subtitle=
          "Purchase costs and serial traceability"

      />


      <button

        type="button"

        onClick={
          onBack
        }

        className=
          "serial-cost-back"

      >

        ← Back to list

      </button>


      {
        state.loading

          ? (

            <p
              role="status"
            >

              Loading component
              details...

            </p>

          )

          : state.error

            ? (

              <p

                role="alert"

                className=
                  "serial-cost-warning"

              >

                {
                  state.error
                }

              </p>

            )

            : (

              <>

                <div
                  className=
                    "serial-cost-mr"
                >

                  <span>

                    MR NUMBER

                  </span>


                  <strong>

                    {
                      mrs.join(
                        ", "
                      ) ||
                      "Direct stock / no MR"
                    }

                  </strong>


                  <div
                    className=
                      "serial-cost-muted"
                  >

                    {
                      unique(

                        state.records.map(
                          (
                            record
                          ) =>

                            record.code ||

                            record
                              .inventory_code

                        )

                      ).join(
                        " · "
                      )
                    }

                  </div>

                </div>


                <CostLineItems
                  groups={
                    groups
                  }
                />

              </>

            )
      }

    </PageShell>
  );
}