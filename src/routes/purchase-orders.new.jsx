import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { FormShell, FormGrid, Field, Input, Select, SearchableSelect } from "@/components/app/FormShell";
import { vendors as mockVendors, components } from "@/lib/mock-data";
import config from "@/config";
import { fetchAuthenticatedJson } from "@/api";
import { useAuth } from "@/AuthContext";
import { canWork } from "@/permissions";

const POComponentSelect = ({name, value, options, placeholder, onChange, lastPurchasePrice, lastPurchaseVendor, lastPurchaseDate, lastPriceSummary, lastPriceStatus}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const [active, setActive] = useState(-1);
  const inputRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(null);
  useEffect(() => { setQuery(value || ""); }, [value]);
  const updateMenuPosition = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPosition({
      left: rect.left,
      top: rect.bottom + 4,
      width: Math.max(rect.width, 280),
    });
  };
  const matches = options.filter(option => String(option.label).toLowerCase().includes(query.toLowerCase()));
  const choose = (option) => {
    setQuery(option.value);
    setOpen(false);
    setActive(-1);
    onChange({target: {name, value: option.value}});
  };
  return _jsxs("div", {
    className: "po-component-search",
    onBlur: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); },
    children: [
      _jsx("input", {
        ref: inputRef, type: "text", name, value: query, placeholder, autoComplete: "off",
        role: "combobox", "aria-label": "Search component", "aria-autocomplete": "list",
        "aria-expanded": open, "aria-controls": `${name}-options`,
        "aria-activedescendant": open && active >= 0 ? `${name}-option-${active}` : undefined,
        onFocus: () => { updateMenuPosition(); setOpen(true); setActive(-1); },
        onChange: (event) => { setQuery(event.target.value); setOpen(true); setActive(-1); onChange({target:{name,value:event.target.value}}); },
        onKeyDown: (event) => {
          if (event.key === "Escape") { setOpen(false); setActive(-1); }
          if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive(i => Math.min(i+1,matches.length-1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActive(i => Math.max(i-1,0)); }
          if (event.key === "Enter" && open) { event.preventDefault(); if (matches[active]) choose(matches[active]); }
        }
      }),
      open && _jsx("div", {
        id: `${name}-options`, role: "listbox", className: "po-component-options",
        style: menuPosition ? {position: "fixed", left: menuPosition.left, top: menuPosition.top, width: menuPosition.width} : undefined,
        children: matches.length ? matches.map((option,index) => _jsx("button", {
          type: "button", role: "option", id: `${name}-option-${index}`, "aria-selected": index === active,
          onMouseDown: event => event.preventDefault(), onClick: () => choose(option), children: option.label
        }, option.value)) : _jsx("div", {className:"p-3 text-sm",children:"No matching components"})
      }),
      value && _jsx("div", {className:"po-component-value", children:value}),
      value && lastPriceStatus && _jsx("div", {
        className: "mt-2 text-xs font-medium text-muted-foreground",
        style: {whiteSpace: "normal", overflowWrap: "anywhere"},
        "aria-live": "polite",
        children: lastPriceStatus === "loading"
          ? "Loading last purchase unit price..."
          : lastPriceStatus === "error"
          ? "Unable to load last purchase unit price."
          : lastPriceStatus === "found"
          ? _jsxs("div", {children: [
              _jsx("div", {children: `Last Purchase Unit Price: ₹${Number(lastPurchasePrice).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})} • Vendor: ${lastPurchaseVendor || "Not provided in purchase history"} • Date: ${lastPurchaseDate || "Not provided"}`}),
              lastPriceSummary && _jsxs("div", {className: "mt-1", children: [
                `Lowest Price: ₹${Number(lastPriceSummary.lowest?.price || 0).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})} • Vendor: ${lastPriceSummary.lowest?.vendor || "-"} • Date: ${lastPriceSummary.lowest?.date || "-"}`,
                _jsx("br", {}),
                `Highest Price: ₹${Number(lastPriceSummary.highest?.price || 0).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})} • Vendor: ${lastPriceSummary.highest?.vendor || "-"} • Date: ${lastPriceSummary.highest?.date || "-"}`
              ]})
            ]})
          : "No previous purchase found",
      })
    ]
  });
};

const getFinancialYearCode = (
  date = new Date()
) => {
  const calendarYear =
    date.getFullYear();

  const monthIndex =
    date.getMonth();

  // April to March financial year
  const startYear =
    monthIndex >= 3
      ? calendarYear
      : calendarYear - 1;

  const endYear =
    startYear + 1;

  return `${String(startYear).slice(
    -2
  )}-${String(endYear).slice(-2)}`;
};

const getNextPurchaseOrderNumber =
  async () => {
    const financialYear =
      getFinancialYearCode();

    const response = await fetchAuthenticatedJson(
      "/procurement/purchase-orders/next-number/",
      { cache: "no-store" },
    );

    return response?.po_number || `01/${financialYear}`;
  };
const PurchaseOrdersPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const canManagePO =
    canWork(user, "purchase-order");
  const [loading, setLoading] = useState(false);
  const submitLockRef = useRef(false);
  const [componentsList, setComponentsList] = useState([]);
  const [vendors, setVendors] = useState(mockVendors);
 const [formData, setFormData] = useState({
  vendor: "",
  poDate: "",
  expected_delivery_date: "",
  roundOff: "",
});
  const [lineItems, setLineItems] = useState([
  {
    componentId: "",
    componentName: "",
    specification: "",
    hsnNo: "",
    quantity: 1,
    uom: "",
    unitPrice: 0,
    discount: 0,
    gst: 0,
    freightCost: 0,
    freightGst: 0,
  },
]);

  const CATEGORY_CHOICES = [
    "ACCESSORIES",
    "AIRFRAMES",
    "COMMUNICATION",
    "ELECTRICALS",
    "ELECTRONICS",
    "PAYLOAD",
    "TOOLS",
  ];

  const CATEGORY_PREFIXES = {
    ACCESSORIES: "AC",
    AIRFRAMES: "AF",
    COMMUNICATION: "CM",
    ELECTRICALS: "EL",
    ELECTRONICS: "EN",
    PAYLOAD: "PL",
    TOOLS: "TL",
  };

  const [showComponentModal, setShowComponentModal] = useState(false);
  const [componentForm, setComponentForm] = useState({
    component_id: "AC_0001",
    category: CATEGORY_CHOICES[0],
    component_type: "",
    specifications: "",
    hsn_no: "",
    sku_no: "",
    part_no: "",
    tally_reference: "",
    unit_of_measurements: "",
    product_link: "",
  });

  const generateNextComponentId = async (category) => {
    try {
      const cleanCategory = String(category || "").trim().toUpperCase();
      const prefix = CATEGORY_PREFIXES[cleanCategory];
      if (!prefix) throw new Error("Invalid component category.");

      const response = await fetch(
        `${config.baseURL}/components/components/?page_size=5000`,
        { cache: "no-store" }
      );

      if (!response.ok) throw new Error("Unable to generate Component ID.");

      const data = await response.json();
      const componentList = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
          ? data.results
          : [];

      const pattern = /^[A-Z]+_(\d{4})$/i;

      const highestNumber = componentList.reduce((highest, component) => {
        const value = String(
          component?.component_id ||
          component?.component_code ||
          component?.code ||
          ""
        ).trim();

        const match = value.match(pattern);
        if (!match) return highest;

        const number = Number(match[1]);
        return Number.isFinite(number)
          ? Math.max(highest, number)
          : highest;
      }, 0);

      return `${prefix}_${String(highestNumber + 1).padStart(4, "0")}`;
    } catch (error) {
      console.error("Unable to generate next Component ID:", error);
      const prefix = CATEGORY_PREFIXES[String(category || "").trim().toUpperCase()];
      return prefix ? `${prefix}_0001` : "";
    }
  };

  const handleComponentChange = async (e) => {
    const { name, value } = e.target;

    if (name === "category") {
      setComponentForm((previous) => ({
        ...previous,
        category: value,
        component_id: "",
      }));

      const nextId = await generateNextComponentId(value);

      setComponentForm((previous) => ({
        ...previous,
        category: value,
        component_id: nextId,
      }));
      return;
    }

    setComponentForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const saveComponent = async () => {
    if (!canManagePO) {
      return;
    }

    const componentType = String(
      componentForm.component_type || ""
    ).trim();

    let componentId = String(
      componentForm.component_id || ""
    ).trim().toUpperCase();

    const selectedPrefix =
      CATEGORY_PREFIXES[componentForm.category];

    const expectedPattern = selectedPrefix
      ? new RegExp(`^${selectedPrefix}_\\d{4}$`, "i")
      : null;

    if (
      !expectedPattern ||
      !expectedPattern.test(componentId)
    ) {
      componentId =
        await generateNextComponentId(
          componentForm.category
        );

      setComponentForm((previous) => ({
        ...previous,
        component_id: componentId,
      }));
    }

    const payload = {
      component_id: componentId,
      category: componentForm.category,
      component_type: componentType,
      specifications: componentForm.specifications,
      unit_of_measurements: componentForm.unit_of_measurements,
      hsn_numbers: componentForm.hsn_no,
      sku_numbers: componentForm.sku_no,
      part_numbers: componentForm.part_no,
      tally_reference: componentForm.tally_reference,
      product_link: componentForm.product_link,
      ordering_id: null,
      unit_price: 0,
      stock_quantity: 0,
      reorder_level: 0,
      is_active: true,
    };

    try {
      const res = await fetch(`${config.baseURL}/components/components/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        console.error("Failed to create component", data);
        alert("Failed to add component");
        return;
      }

      alert("Component added successfully");
      setComponentForm({
        component_id: "AC_0001",
        category: CATEGORY_CHOICES[0],
        component_type: "",
        specifications: "",
        hsn_no: "",
        sku_no: "",
        part_no: "",
        tally_reference: "",
        unit_of_measurements: "",
        product_link: "",
      });
      setShowComponentModal(false);

      const listRes = await fetch(`${config.baseURL}/components/components/`, {
        headers: { "Content-Type": "application/json" },
      });
      const listData = await listRes.json();
      setComponentsList(
        (listData?.results || listData || []).map((c) => ({
          id: c.id,
          code: c.component_id,
          component_type:
            c.component_type || c.componentType || "",
          hsnNo:
            c.hsn_numbers ||
            c.hsn_no ||
            "",
        }))
      );
    } catch (error) {
      console.error(error);
      alert("Error adding component");
    }
  };

  const getComponentKey = (component) =>
    component.id ?? component.component_id ?? component.componentId ?? component.request_id ?? component.code ?? null;

  const getComponentLabel = (component) => {
    const key = getComponentKey(component);
    return key ? String(key) : "";
  };

  const handleLineChange = (index, field, value) => {
    setLineItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
        ...(field === "unitPrice" ? {unitPriceEdited: true} : {}),
      };
      return updated;
    });
  };

  const loadLastUnitPrice = async (componentId) => {
    if (!componentId) return null;

    try {
      const data = await fetchAuthenticatedJson(
        `/procurement/purchase-orders/last-unit-price/?component_id=${encodeURIComponent(
          componentId
        )}`
      );

      if (
        !data?.has_previous_purchase ||
        data?.unit_price === null ||
        data?.unit_price === undefined ||
        data?.unit_price === ""
      ) {
        return null;
      }

      const price = Number(data.unit_price);
      if (!Number.isFinite(price)) return null;
      // Use the vendor from the same historical purchase as the returned price.
      // Never substitute the vendor selected for the new PO.
      const purchaseRecord = Array.isArray(data)
        ? data[0]
        : data?.data || data;
      const purchaseOrder =
        purchaseRecord?.purchase_order ||
        purchaseRecord?.po ||
        {};
      const vendor =
        purchaseRecord?.vendor ?? purchaseOrder?.vendor;
      const vendorName = [
        purchaseRecord?.vendor_name,
        purchaseRecord?.vendorName,
        purchaseOrder?.vendor_name,
        purchaseOrder?.vendorName,
        vendor?.name,
        vendor?.vendor_name,
        typeof vendor === "string" ? vendor : "",
      ].find(value => typeof value === "string" && value.trim());
      let purchaseDate = [
        purchaseRecord?.purchase_date,
        purchaseRecord?.purchaseDate,
        purchaseRecord?.last_purchase_date,
        purchaseRecord?.po_date,
        purchaseRecord?.date,
        purchaseOrder?.purchase_date,
        purchaseOrder?.purchaseDate,
        purchaseOrder?.last_purchase_date,
        purchaseOrder?.po_date,
        purchaseOrder?.date,
        purchaseOrder?.created_at,
        purchaseRecord?.created_at,
      ].find(value => value);

      let lastPriceSummary = null;
      try {
        const purchaseOrdersPayload = await fetchAuthenticatedJson(
          "/procurement/purchase-orders/?page_size=5000",
          { cache: "no-store" },
        );
        const purchaseOrders = Array.isArray(purchaseOrdersPayload)
          ? purchaseOrdersPayload
          : purchaseOrdersPayload?.results || [];
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - 24);
        const componentKey = String(componentId);
        const matchingPurchases = purchaseOrders.flatMap((order) => {
          const orderDate = order?.po_date || order?.date || order?.created_at;
          const parsedDate = orderDate ? new Date(orderDate) : null;
          if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate < cutoff) return [];
          const items = Array.isArray(order?.items) ? order.items : [];
          const item = items.find((entry) => {
            const itemComponent = entry?.component;
            const itemComponentId = typeof itemComponent === "object" ? itemComponent?.id : itemComponent;
            return [
              itemComponentId,
              entry?.component_id,
              entry?.componentId,
            ].some((value) => String(value ?? "") === componentKey);
          });
          if (!item) return [];
          const itemPrice = Number(item?.unit_price ?? item?.unitPrice ?? item?.price ?? 0);
          if (!Number.isFinite(itemPrice)) return [];
          const orderVendor = order?.vendor_name || order?.vendor?.name || order?.vendor || "-";
          return [{
            price: itemPrice,
            vendor: orderVendor,
            date: parsedDate.toLocaleDateString("en-IN"),
            rawDate: parsedDate,
          }];
        });

        if (matchingPurchases.length) {
          lastPriceSummary = {
            lowest: matchingPurchases.reduce((lowest, current) => current.price < lowest.price ? current : lowest),
            highest: matchingPurchases.reduce((highest, current) => current.price > highest.price ? current : highest),
          };

          if (!purchaseDate) {
            const latest = matchingPurchases.reduce((latest, current) => current.rawDate > latest.rawDate ? current : latest);
            purchaseDate = latest.rawDate;
          }
        }
      } catch (error) {
        console.warn("Unable to load purchase price summary:", error);
      }

      if (!purchaseDate) {
        try {
          const purchaseOrdersPayload = await fetchAuthenticatedJson(
            "/procurement/purchase-orders/?page_size=5000",
            { cache: "no-store" },
          );
          const purchaseOrders = Array.isArray(purchaseOrdersPayload)
            ? purchaseOrdersPayload
            : purchaseOrdersPayload?.results || [];
          const componentKey = String(componentId);
          const matchingOrders = purchaseOrders.filter((order) => {
            const items = Array.isArray(order?.items) ? order.items : [];

            return items.some((item) => {
              const itemComponent = item?.component;
              const itemComponentId =
                typeof itemComponent === "object"
                  ? itemComponent?.id
                  : itemComponent;

              return [
                itemComponentId,
                item?.component_id,
                item?.componentId,
              ].some((value) => String(value ?? "") === componentKey);
            });
          });

          matchingOrders.sort(
            (left, right) =>
              new Date(
                right?.po_date ||
                  right?.date ||
                  right?.created_at ||
                  0,
              ) -
              new Date(
                left?.po_date ||
                  left?.date ||
                  left?.created_at ||
                  0,
              ),
          );

          purchaseDate = matchingOrders[0]?.po_date ||
            matchingOrders[0]?.date ||
            matchingOrders[0]?.created_at ||
            "";
        } catch (error) {
          console.warn("Unable to load previous PO date:", error);
        }
      }

      return {
        unitPrice: price,
        vendorName: String(vendorName || "").trim(),
        purchaseDate: purchaseDate ? new Date(purchaseDate).toLocaleDateString("en-IN") : "",
        priceSummary: lastPriceSummary,
      };
    } catch (error) {
      console.warn("Unable to load last purchase price:", error);
      throw error;
    }
  };

  const selectComponentForLine = async (index, component, displayValue) => {
    const priceRequest = Symbol("last-price");
    const componentDisplayValue = [
      component?.code || displayValue,
      component?.component_type,
    ].filter(Boolean).join(" - ");

    setLineItems((previous) => previous.map((row, rowIndex) =>
      rowIndex === index
        ? {
            ...row,
            componentName: componentDisplayValue,
            componentId: component?.id || "",
            specification: component?.specification || row.specification || "",
            hsnNo: component?.hsnNo || "",
            unitPrice: 0,
            unitPriceEdited: false,
            lastPurchasePrice: null,
            lastPurchaseVendor: "",
            lastPurchaseDate: "",
            lastPriceSummary: null,
            lastPriceStatus: component?.id ? "loading" : "",
            priceRequest,
          }
        : row,
    ));

    if (!component?.id) return;

    try {
      const lastPurchase = await loadLastUnitPrice(component.id);
      const lastPrice = lastPurchase?.unitPrice ?? null;
      setLineItems((previous) => previous.map((row) =>
        row.priceRequest === priceRequest
          ? {
              ...row,
              lastPurchasePrice: lastPrice,
              lastPurchaseVendor: lastPurchase?.vendorName || "",
              lastPurchaseDate: lastPurchase?.purchaseDate || "",
              lastPriceSummary: lastPurchase?.priceSummary || null,
              lastPriceStatus: lastPrice !== null ? "found" : "empty",
              unitPrice: !row.unitPriceEdited && lastPrice !== null ? lastPrice : row.unitPrice,
            }
          : row,
      ));
    } catch {
      setLineItems((previous) => previous.map((row) =>
        row.priceRequest === priceRequest
          ? { ...row, lastPriceStatus: "error" }
          : row,
      ));
    }
  };

  const calculateLine = (item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const discount = Math.max(Number(item.discount || 0), 0);
    const gst = Math.max(Number(item.gst || 0), 0);
    const freightCost = Math.max(Number(item.freightCost || 0), 0);
    const freightGst = Math.max(Number(item.freightGst || 0), 0);

    const basicAmount = quantity * unitPrice;
    const taxableAmount = Math.max(basicAmount - discount, 0);
    const gstAmount = (taxableAmount * gst) / 100;
    const freightGstAmount = (freightCost * freightGst) / 100;
    const lineTotal = taxableAmount + gstAmount + freightCost + freightGstAmount;

    return {
      basicAmount,
      taxableAmount,
      gstAmount,
      freightGstAmount,
      lineTotal,
    };
  };

  const handleAddItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        componentId: "",
        componentName: "",
        hsnNo: "",
        quantity: 1,
        uom: "",
        unitPrice: 0,
        discount: 0,
        gst: 0,
        freightCost: 0,
        freightGst: 0,
      },
    ]);
  };

  const handleDeleteItem = (index) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    let updatedData = {
      ...formData,
      [name]: value,
    };

    const quantity = Number(updatedData.quantity) || 0;
    const unitPrice = Number(updatedData.unitPrice) || 0;

    // Price = Quantity × Unit Price
    const price = quantity * unitPrice;

    const gst = Number(updatedData.gst) || 0;

    // Total = Price + GST%
    const totalPrice = price + (price * gst) / 100;

    updatedData.price = price ? price.toFixed(2) : "";
    updatedData.totalPrice = totalPrice ? totalPrice.toFixed(2) : "";

    setFormData(updatedData);
  };
  useEffect(() => {
    async function loadVendors() {
      try {
        const res = await fetch(`${config.baseURL}/vendors/`, {
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error("Failed to fetch vendors");
        const data = await res.json();
        setVendors(Array.isArray(data) ? data : data.results || mockVendors);
      } catch (err) {
        console.warn("Vendor fetch failed, using mock vendor list", err);
        setVendors(mockVendors);
      }
    }

    async function loadComponents() {
      try {
        const res = await fetch(`${config.baseURL}/components/components/`, {
          headers: { "Content-Type": "application/json" },
        });

        const data = await res.json();

        const list = (data?.results || data || []).map((c) => ({
          id: c.id,
          code: c.component_id || c.component_code || c.code || String(c.id || ""),
          specification:
            c.specification ||
            c.specifications ||
            c.component_specifications ||
            "",
          component_type:
            c.component_type || c.componentType || "",
          hsnNo:
            c.hsn_numbers ||
            c.hsn_no ||
            c.hsn_number ||
            c.hsnNumber ||
            c.hsn ||
            "",
        }));

        setComponentsList(list);
      } catch (err) {
        console.error("Failed to load components", err);
        setComponentsList([]);
      }
    }

    loadVendors();
    loadComponents();
  }, []);

  const handleSubmit = async () => {
    if (
      !canManagePO ||
      submitLockRef.current
    ) {
      return;
    }

    try {
      // Validate basic fields
      if (!formData.vendor || !formData.poDate) {
        alert("Please fill in Vendor and PO Date");
        return;
      }

      // Validate that we have at least one line item with all required fields
      if (!lineItems || lineItems.length === 0) {
        alert("Please add at least one line item");
        return;
      }

      const invalidItems = lineItems.filter(
        (item) => !item.componentId || !item.quantity || !item.unitPrice
      );

      if (invalidItems.length > 0) {
        alert("Please fill in all required fields in line items (Component, Qty, Unit Price)");
        return;
      }

      /*
       * Immediate synchronous lock. loading=true gives visual feedback,
       * while the ref prevents a second request before React re-renders.
       */
      submitLockRef.current = true;
      setLoading(true);

    const poNumber =
  await getNextPurchaseOrderNumber();

      // Build items array from lineItems
      const items = lineItems.map((item) => ({
        component_id: Number(item.componentId),
        quantity: Number(item.quantity),
        uom: String(item.uom || "").trim(),
        hsn_no: String(item.hsnNo || "").trim(),
        unit_price: Number(item.unitPrice),
        discount: Math.max(Number(item.discount || 0), 0),
        gst_percentage: Math.min(
          100,
          Math.max(Number(item.gst || 0), 0)
        ),
        freight_cost: Math.max(Number(item.freightCost || 0), 0),
        freight_gst_percentage: Math.min(
          100,
          Math.max(Number(item.freightGst || 0), 0)
        ),
      }));

      /*
       * DIRECT PO APPROVAL FLOW:
       *
       * Create -> Manager -> Finance -> Ordered -> Delivery
       *
       * PENDING is the existing model value used for the Manager-pending
       * stage. The UI displays it as "Pending Manager Approval".
       * Finance does NOT receive this Direct PO until Manager approves it.
       */
      const payloadData = {
        vendor_name: formData.vendor,
        po_number: poNumber,
        status: "PENDING",
        approval_status: "PENDING",
        po_date: formData.poDate,
        expected_delivery_date: formData.expected_delivery_date || null,
        round_off: Number(formData.roundOff || 0),
        items: items,
      };

      /*
       * Create with the authenticated helper.
       *
       * Django will:
       *   1. store the Direct PO as Manager-pending,
       *   2. create the Manager notification,
       *   3. send the Manager email,
       *   4. create Finance notification/email only AFTER Manager Approves.
       */
      const data = await fetchAuthenticatedJson(
        "/procurement/purchase-orders/",
        {
          method: "POST",
          body: JSON.stringify(payloadData),
          timeoutMs: 60000,
        },
      );

      console.log(
        "Direct PO created and sent to Manager:",
        data,
      );

      if (selectedVendorId) {
        try {
          const vendorDetails = await fetchAuthenticatedJson(
            `${config.baseURL}/vendors/${encodeURIComponent(selectedVendorId)}/`,
            { cache: "no-store" },
          );

          const existingProducts = Array.isArray(vendorDetails?.products)
            ? vendorDetails.products
            : [];
          const existingComponentIds = new Set(
            existingProducts.map((product) =>
              String(
                product?.product_id ||
                  product?.component_id ||
                  product?.product ||
                  "",
              ).trim().toUpperCase(),
            ),
          );

          const newProducts = lineItems
            .map((item) => {
              const component = componentsList.find(
                (candidate) => String(candidate.id) === String(item.componentId),
              );
              const componentCode = String(
                component?.code || item.componentName || "",
              ).trim();

              if (!componentCode) return null;

              return {
                id: null,
                product: componentCode,
                product_version: String(component?.component_type || "").trim(),
                quantity: Number(item.quantity || 0),
                unit: String(item.uom || "").trim(),
                price: Number(item.unitPrice || 0),
                gst: Number(item.gst || 0),
              };
            })
            .filter((product) => {
              const key = product.product.toUpperCase();
              if (existingComponentIds.has(key)) return false;
              existingComponentIds.add(key);
              return true;
            });

          if (newProducts.length > 0) {
            await fetchAuthenticatedJson(
              `${config.baseURL}/vendors/${encodeURIComponent(selectedVendorId)}/`,
              {
                method: "PUT",
                body: JSON.stringify({
                  ...vendorDetails,
                  products: [...existingProducts, ...newProducts],
                }),
              },
            );
          }
        } catch (vendorError) {
          console.error(
            "PO was created, but the vendor component list could not be updated:",
            vendorError,
          );
        }
      }

      const purchaseOrderId =
        data?.id ||
        data?.pk ||
        data?.purchase_order_id ||
        data?.purchaseOrderId ||
        data?.purchase_order?.id ||
        data?.purchaseOrder?.id;

      if (purchaseOrderId) {
        try {
          const existingNotifications =
            await fetchAuthenticatedJson(
              `${config.baseURL}/notifications/?category=PO&receiver=MANAGER&reference_id=${encodeURIComponent(
                purchaseOrderId,
              )}`,
              { cache: "no-store" },
            );

          const notifications = Array.isArray(existingNotifications)
            ? existingNotifications
            : existingNotifications?.results || [];

          const hasManagerNotification = notifications.some(
            (notification) =>
              String(notification?.category || "").toUpperCase() === "PO" &&
              String(notification?.receiver || "").toUpperCase() === "MANAGER" &&
              String(notification?.reference_id || "") === String(purchaseOrderId) &&
              ["PENDING_MANAGER", "PENDING"].includes(
                String(notification?.status || "").toUpperCase(),
              ),
          );

          if (!hasManagerNotification) {
            await fetchAuthenticatedJson(
              `${config.baseURL}/notifications/`,
              {
                method: "POST",
                body: JSON.stringify({
                  category: "PO",
                  title: `PO APPROVAL REQUEST - ${poNumber}`,
                  message: `Approval requested for Purchase Order ${poNumber}`,
                  reference_id: String(purchaseOrderId),
                  status: "PENDING_MANAGER",
                  receiver: "MANAGER",
                  is_read: false,
                }),
              },
            );
          }
        } catch (notificationError) {
          console.error(
            "Direct PO was created, but the Manager notification could not be created:",
            notificationError,
          );
        }
      }

      window.dispatchEvent(
        new Event("notificationsUpdated")
      );

      navigate("/purchase-orders");
    } catch (err) {
      console.error(err);
      alert("Error creating PO: " + err.message);
    } finally {
      submitLockRef.current = false;
      setLoading(false);
    }
  };

  const activeVendors = vendors
    .filter((v) => v.is_active || v.status === "Active" || v.status === "active")
    .map((v) => ({
      value: v.name || v.vendor_name,
      label: v.name || v.vendor_name,
    }));

  const selectedVendor = vendors.find(
    (vendor) =>
      String(
        vendor?.name ||
          vendor?.vendor_name ||
          "",
      ).trim() === String(formData.vendor || "").trim(),
  );

  // Read the full vendor record: list serializers may omit terms.
  const selectedVendorKey = String(formData.vendor || "").trim();
  const selectedVendorId = selectedVendor?.id ?? selectedVendor?.pk ?? selectedVendor?.vendor_id;
  const listVendorTerms = selectedVendor?.terms_and_conditions;
  const [vendorTermsState, setVendorTermsState] = useState({
    key: "", text: "", loading: false, error: "",
  });

  useEffect(() => {
    let cancelled = false;
    const fallbackTerms = String(listVendorTerms ?? "").trim();
    if (!selectedVendorKey) {
      setVendorTermsState({key: "", text: "", loading: false, error: ""});
      return;
    }
    if (selectedVendorId == null || selectedVendorId === "") {
      setVendorTermsState({
        key: selectedVendorKey, text: fallbackTerms, loading: false,
        error: listVendorTerms == null ? "Vendor details are unavailable. Please select a vendor from the list." : "",
      });
      return;
    }
    setVendorTermsState({key: selectedVendorKey, text: "", loading: true, error: ""});
    async function loadVendorTerms() {
      try {
        const response = await fetchAuthenticatedJson(
          `/vendors/${encodeURIComponent(selectedVendorId)}/`,
          {cache: "no-store"},
        );
        const detail = response?.data ?? response;
        if (detail?.terms_and_conditions === undefined && listVendorTerms == null) {
          throw new Error("Vendor terms were not included in the response.");
        }
        if (!cancelled) {
          setVendorTermsState({
            key: selectedVendorKey,
            text: String(detail?.terms_and_conditions ?? listVendorTerms ?? "").trim(),
            loading: false, error: "",
          });
        }
      } catch (error) {
        if (!cancelled) {
          setVendorTermsState({
            key: selectedVendorKey, text: fallbackTerms, loading: false,
            error: fallbackTerms
              ? "Could not refresh vendor terms. Showing the terms from the vendor list."
              : "Unable to load this vendor’s terms and conditions. Please reselect the vendor to try again.",
          });
        }
      }
    }
    void loadVendorTerms();
    // Ignore late responses when a different vendor is selected.
    return () => { cancelled = true; };
  }, [selectedVendorKey, selectedVendorId, listVendorTerms]);

  const vendorTermsLoading = Boolean(selectedVendorKey) &&
    (vendorTermsState.key !== selectedVendorKey || vendorTermsState.loading);
  const selectedVendorTerms = vendorTermsState.key === selectedVendorKey
    ? vendorTermsState.text : "";
  const vendorTermsError = vendorTermsState.key === selectedVendorKey
    ? vendorTermsState.error : "";

  const componentOptions = componentsList.map((c) => ({
    value: c.code,
    label: [c.code, c.component_type].filter(Boolean).join(" - "),
    componentId: c.id,
    code: c.code,
    componentType: c.component_type || "",
    specification: c.specification || "",
    hsnNo: c.hsnNo || "",
  }));

  const specificationOptions = Array.from(
    new Map(
      componentOptions
        .filter((option) => option.specification.trim())
        .map((option) => [option.specification.trim(), option]),
    ).values(),
  ).map((option) => ({
    value: option.specification,
    label: option.specification,
  }));

  const basicSubtotal = lineItems.reduce(
    (sum, item) => sum + calculateLine(item).basicAmount,
    0
  );

  const discountTotal = lineItems.reduce(
    (sum, item) => sum + Math.max(Number(item.discount || 0), 0),
    0
  );

  const gstTotal = lineItems.reduce(
    (sum, item) => sum + calculateLine(item).gstAmount,
    0
  );

  const freightTotal = lineItems.reduce(
    (sum, item) => sum + Math.max(Number(item.freightCost || 0), 0),
    0
  );

  const freightGstTotal = lineItems.reduce(
    (sum, item) => sum + calculateLine(item).freightGstAmount,
    0
  );

  const subtotal = lineItems.reduce(
    (sum, item) => sum + calculateLine(item).lineTotal,
    0
  );

  const roundOff = Number(formData.roundOff || 0);
  const grandTotal = subtotal + roundOff;

  // View-only users may see the PO list/detail, but cannot open /purchase-orders/new.
  if (!canManagePO) {
    return _jsx(Navigate, {
      to: "/purchase-orders",
      replace: true,
    });
  }

  return _jsxs(PageShell, {
    children: [
      _jsx("style", { children: "\n.po-new-layout,.po-detail-layout{width:100%;max-width:100%;min-width:0;}\n.po-new-layout *,.po-detail-layout *{box-sizing:border-box;}\n.po-new-layout{padding:12px 0 24px;}\n.po-header-fields{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1fr);gap:24px;}\n.po-header-fields>div{min-width:0;}\n.po-header-fields input,.po-header-fields button{width:100%;min-width:0;min-height:44px;}\n.po-items{display:table;width:100%;max-width:100%;min-width:0;table-layout:fixed;border-collapse:collapse;font-size:12px;}\n.po-items thead{display:table-header-group;background:#f8fafc;color:#475569;}\n.po-items tbody{display:table-row-group;}\n.po-items tr{display:table-row;border-bottom:1px solid #e2e8f0;}\n.po-items tbody tr:last-child{border-bottom:0;}\n.po-items th,.po-items td{display:table-cell;min-width:0;padding:14px 7px;vertical-align:top;white-space:normal;overflow-wrap:anywhere;}\n.po-items th{font-size:10px;line-height:1.5;font-weight:600;letter-spacing:.025em;text-transform:uppercase;vertical-align:middle;}\n.po-items td{line-height:1.5;}\n.po-items td::before,.po-items th::after{content:none;}\n.po-items tbody tr:hover{background:#f8fafc;}\n.po-items td input:not([type=checkbox]){width:100%;min-width:0;height:38px;padding:7px 5px;border:1px solid #dbe3ee;border-radius:6px;background:#fff;color:#0f172a;font-size:12px;}\n.po-items input:focus{outline:2px solid #f6c0cd;outline-offset:1px;}\n.po-items input[type=number]{appearance:textfield;-moz-appearance:textfield;}\n.po-items input::-webkit-inner-spin-button,.po-items input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}\n.po-items input[type=checkbox]{width:16px;height:16px;}\n.po-new-items th:nth-child(1){width:26%;}\n.po-new-items th:nth-child(2),.po-new-items th:nth-child(3){width:6%;}\n.po-new-items th:nth-child(4){width:10%;}\n.po-new-items th:nth-child(5),.po-new-items th:nth-child(6){width:9%;}\n.po-new-items th:nth-child(7),.po-new-items th:nth-child(8){width:10%;}\n.po-new-items th:nth-child(9){width:9%;}\n.po-new-items th:nth-child(10){width:5%;}\n.po-new-items td:nth-last-child(2){font-weight:700;color:#0f172a;padding-top:23px;}\n.po-new-items td:last-child button{font-size:11px;margin-top:9px;}\n.po-detail-items th:nth-child(1){width:3%;}\n.po-detail-items th:nth-child(2){width:23%;}\n.po-detail-items th:nth-child(3){width:10%;}\n.po-detail-items th:nth-child(4),.po-detail-items th:nth-child(5){width:5%;}\n.po-detail-items th:nth-child(6){width:9%;}\n.po-detail-items th:nth-child(7){width:8%;}\n.po-detail-items th:nth-child(8),.po-detail-items th:nth-child(9),.po-detail-items th:nth-child(10){width:9%;}\n.po-detail-items th:nth-child(11){width:10%;}\n.po-detail-items td:nth-child(2){font-weight:600;line-height:1.65;}\n.po-detail-items td:last-child{font-weight:700;}\n.po-detail-items td span{max-width:100%;white-space:normal;}\n.po-detail-layout section,.po-detail-layout section>div{min-width:0;overflow-wrap:anywhere;}\n.po-component-search{position:relative;width:100%;min-width:0;}\n.po-component-search:focus-within{z-index:60;}\n.po-component-options{position:absolute;top:44px;left:0;width:min(440px,calc(100vw - 72px));min-width:100%;z-index:100;max-height:260px;overflow-y:auto;padding:6px;background:#fff;color:#0f172a;border:1px solid #dbe3ee;border-radius:8px;box-shadow:0 10px 24px rgba(15,23,42,.16);}\n.po-component-options button{display:block;width:100%;height:auto;min-height:38px;padding:10px;text-align:left;white-space:normal;overflow-wrap:anywhere;font-size:13px;line-height:1.5;border:0;border-radius:5px;background:#fff;color:#0f172a;cursor:pointer;}\n.po-component-options button:hover,.po-component-options button[aria-selected=true]{background:#fff1f4;color:#9f1239;}\n.po-component-value{margin-top:7px;white-space:normal;overflow-wrap:anywhere;font-size:11px;line-height:1.6;color:#475569;}\n.dark .po-items thead,.dark .po-items tbody tr:hover{background:#1e293b;color:#cbd5e1;}\n.dark .po-items tr{border-color:#334155;}\n.dark .po-items td input:not([type=checkbox]),.dark .po-component-options,.dark .po-component-options button{background:#0f172a;color:#f1f5f9;border-color:#334155;}\n.dark .po-component-options button:hover,.dark .po-component-options button[aria-selected=true]{background:#334155;}\n.dark .po-component-value{color:#cbd5e1;}\n.dark .po-new-items td:nth-last-child(2){color:#f1f5f9;}\n@media(max-width:900px){.po-header-fields{grid-template-columns:repeat(2,minmax(0,1fr));}.po-header-fields>div:first-child{grid-column:1/-1;}.po-items th,.po-items td{padding:10px 4px;}.po-items,.po-items td input:not([type=checkbox]){font-size:11px;}.po-items th{font-size:9px;}}\n@media(max-width:520px){.po-header-fields{grid-template-columns:minmax(0,1fr);gap:16px;}.po-items th,.po-items td{padding:8px 2px;}.po-items td input:not([type=checkbox]){padding:5px 2px;}}\n\n.po-summary-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,340px);gap:24px;align-items:start;}.po-summary-layout>section,.po-summary-layout>div{min-width:0;}@media(max-width:767px){.po-summary-layout{grid-template-columns:minmax(0,1fr);}}\n" }),
      _jsx("style", { children: "\n.po-items-scroll{overflow-x:auto;overflow-y:visible;}\n.po-new-items th:nth-child(11),.po-new-items td:nth-child(11){min-width:96px;white-space:nowrap;}\n" }),
      _jsx(PageHeader, {
        title: "Create Purchase Order",
        subtitle: "Raise a PO against components or vendors",
        back: true,
        backTo: "/purchase-orders",
      }),
      _jsxs("div", {
        className: "po-new-layout",
        children: [
          _jsxs("div", {
            className: "w-full min-w-0 grid gap-6",
            children: [
              _jsx("div", {
                className: "rounded-lg border border-border bg-card p-6 shadow-sm",
                children: _jsxs("div", {
                  className: "po-header-fields",
                  children: [
                    _jsxs("div", {
                      children: [
                        _jsx("label", {
                          className: "block text-sm font-medium mb-2",
                          children: "Vendor *"
                        }),
                        _jsx(SearchableSelect, {
                          name: "vendor",
                          value: formData.vendor,
                          onChange: handleInputChange,
                          options: activeVendors,
                          placeholder: "Select vendor...",
                        })
                      ]
                    }),
                    _jsxs("div", {
                      children: [
                        _jsx("label", {
                          className: "block text-sm font-medium mb-2",
                          children: "PO Date *"
                        }),
                        _jsx(Input, {
                          type: "date",
                          name: "poDate",
                          value: formData.poDate,
                          onChange: handleInputChange,
                          min: "2024-01-01",
                          max: "2099-12-31",
                          className: "h-10 rounded-md border border-input",
                        })
                      ]
                    }),
                    _jsxs("div", {
                      children: [
                        _jsx("label", {
                          className: "block text-sm font-medium mb-2",
                          children: "Expected Delivery"
                        }),
                        _jsx(Input, {
                          type: "date",
                          name: "expected_delivery_date",
                          value: formData.expected_delivery_date,
                          onChange: handleInputChange,
                          min: formData.poDate || new Date().toISOString().split("T")[0],
                          className: "h-10 rounded-md border border-input",
                        })
                      ]
                    })
                  ]
                })
              }),
              _jsxs("div", {
                className: "rounded-lg border border-border bg-card shadow-sm",
                children: [
                  _jsxs("div", {
                    className: "border-b border-border p-6",
                    children: [
                      _jsxs("div", {
                        className: "flex flex-wrap items-center justify-between gap-4",
                        children: [
                          _jsxs("div", {
                            children: [
                              _jsx("h2", {
                                className: "text-lg font-semibold",
                                children: "Line Items"
                              }),
                              _jsx("p", {
                                className: "text-sm text-muted-foreground",
                                children: "Add one or more components"
                              })
                            ]
                          }),
                          _jsxs("div", {
                            className: "flex gap-2",
                            children: [
                              _jsx("button", {
                                type: "button",
                                onClick: async () => {
                                  const category =
                                    componentForm.category || "ACCESSORIES";
                                  const nextId =
                                    await generateNextComponentId(category);
                                  setComponentForm((previous) => ({
                                    ...previous,
                                    category,
                                    component_id: nextId,
                                  }));
                                  setShowComponentModal(true);
                                },
                                className: "rounded-md bg-primary px-3 py-2 text-sm text-white hover:bg-primary/90",
                                children: "+ Add Component"
                              }),
                              _jsx("button", {
                                type: "button",
                                onClick: handleAddItem,
                                className: "rounded-md bg-primary px-3 py-2 text-sm text-white hover:bg-primary/90",
                                children: "+ Add Item"
                              })
                            ]
                          })
                        ]
                      })
                    ]
                  }),
                  _jsx("div", {
                    className: "po-items-scroll min-w-0",
                    children: _jsxs("table", {
                      className: "po-items po-new-items text-sm",
                      children: [
                        _jsx("thead", {
                          children: _jsx("tr", {
                            className: "border-b border-border bg-muted/50",
                            children: [
                              _jsx("th", { key: "specification", className: "px-4 py-3 text-left font-medium", children: "Specification" }),
                              _jsx("th", { key: "component", className: "px-4 py-3 text-left font-medium", children: "Component ID / Type" }),
                              _jsx("th", { key: "hsn", className: "px-4 py-3 text-left font-medium", children: "HSN No" }),
                              _jsx("th", { key: "quantity", className: "px-4 py-3 text-right font-medium", children: "Qty" }),
                              _jsx("th", { key: "uom", className: "px-4 py-3 text-left font-medium", children: "UOM" }),
                              _jsx("th", { key: "unit-price", className: "px-4 py-3 text-right font-medium", children: "Unit Price (₹)" }),
                              _jsx("th", { key: "discount", className: "px-4 py-3 text-right font-medium", children: "Discount (₹)" }),
                              _jsx("th", { key: "gst", className: "px-4 py-3 text-right font-medium", children: "GST % / Amount" }),
                              _jsx("th", { key: "freight", className: "px-4 py-3 text-right font-medium", children: "Freight Cost (₹)" }),
                              _jsx("th", { key: "freight-gst", className: "px-4 py-3 text-right font-medium", children: "Freight GST % / Amount" }),
                              _jsx("th", { key: "line-total", className: "px-4 py-3 text-right font-medium", children: "Line Total (₹)" }),
                              _jsx("th", { key: "action", className: "px-4 py-3 text-center font-medium", children: "Action" })
                            ]
                          })
                        }),
                        _jsx("tbody", {
                          children: lineItems.map((item, idx) => {
                            const line = calculateLine(item);
                            return _jsxs("tr", {
                              className: "border-b border-border hover:bg-muted/30",
                              children: [
                                _jsx("td", {
                                  key: "specification",
                                  "data-label": "Specification",
                                  className: "px-6 py-4",
                                  children: _jsx(SearchableSelect, {
                                    name: `specification-${idx}`,
                                    value: item.specification || "",
                                    options: specificationOptions,
                                    placeholder: "Search specification...",
                                    onChange: (e) => {
                                      const specification = e.target.value;
                                      const component = componentsList.find(
                                        (candidate) => candidate.specification === specification,
                                      );
                                      if (component) {
                                        void selectComponentForLine(idx, component, component.code);
                                      } else {
                                        handleLineChange(idx, "specification", specification);
                                      }
                                    },
                                  }),
                                }),
                                _jsx("td", {
                                  key: "component",
                                    "data-label": "Component ID / Type",
                                  className: "px-6 py-4",
                                  children: _jsx(POComponentSelect, {
                                    name: `component-${idx}`,
                                    value: item.componentName,
                                    options: componentOptions,
                                    lastPurchasePrice: item.lastPurchasePrice,
                                    lastPurchaseVendor: item.lastPurchaseVendor,
                                    lastPurchaseDate: item.lastPurchaseDate,
                                    lastPriceSummary: item.lastPriceSummary,
                                    lastPriceStatus: item.lastPriceStatus,
                                    placeholder: "Search component ID or type...",
                                    onChange: (e) => {
                                      const value = String(
                                        e?.target?.value ?? e?.value ?? ""
                                      );

                                      const comp = componentsList.find(
                                        (c) => c.code === value
                                      );
                                      if (comp) {
                                        void selectComponentForLine(idx, comp, value);
                                      } else {
                                        handleLineChange(idx, "componentName", value);
                                      }
                                    }
                                  })
                                }),
                                _jsx("td", {
                                  key: "hsn",
                                  "data-label": "HSN No",
                                  className: "px-4 py-4",
                                  children: item.hsnNo || "-",
                                }),
                                _jsx("td", {
                                  key: "quantity",
                                  "data-label": "Qty",
                                  className: "px-4 py-4 text-right",
                                  children: _jsx("input", {
                                    type: "number",
                                    min: "1",
                                    className: "h-9 w-20 rounded border border-input px-2 text-right",
                                    value: item.quantity,
                                    onChange: (e) => handleLineChange(idx, "quantity", e.target.value)
                                  })
                                }),
                                _jsx("td", {
                                  key: "uom",
                                  "data-label": "UOM",
                                  className: "px-4 py-4",
                                  children: _jsx("input", {
                                    type: "text",
                                    className: "h-9 w-20 rounded border border-input px-2",
                                    value: item.uom || "",
                                    placeholder: "NOS",
                                    onChange: (e) => handleLineChange(idx, "uom", e.target.value)
                                  })
                                }),
                                _jsx("td", {
                                  key: "unit-price",
                                  "data-label": "Unit Price (\u20b9)",
                                  className: "px-4 py-4 text-right",
                                  children: _jsx("input", {
                                    type: "number",
                                    min: "0",
                                    step: "0.01",
                                    className: "h-9 w-24 rounded border border-input px-2 text-right",
                                    value: item.unitPrice,
                                    onChange: (e) => handleLineChange(idx, "unitPrice", e.target.value)
                                  })
                                }),
                                _jsx("td", {
                                  key: "discount",
                                  "data-label": "Discount (\u20b9)",
                                  className: "px-4 py-4 text-right",
                                  children: _jsx("input", {
                                    type: "number", min: "0", step: "0.01",
                                    className: "h-9 w-24 rounded border border-input px-2 text-right",
                                    value: item.discount,
                                    onChange: (e) => handleLineChange(idx, "discount", e.target.value)
                                  })
                                }),
                                _jsx("td", {
                                  key: "gst",
                                  "data-label": "GST % / Amount",
                                  className: "px-4 py-4 text-right",
                                  children: _jsxs("div", {
                                    className: "space-y-1",
                                    children: [
                                      _jsx("input", {
                                        type: "number", min: "0", max: "100", step: "0.01",
                                        className: "h-9 w-20 rounded border border-input px-2 text-right",
                                        value: item.gst,
                                        onChange: (e) => handleLineChange(idx, "gst", e.target.value)
                                      }),
                                      _jsx("div", {
                                        className: "text-[11px] text-muted-foreground",
                                        children: `₹${line.gstAmount.toFixed(2)}`
                                      })
                                    ]
                                  })
                                }),
                                _jsx("td", {
                                  key: "freight",
                                  "data-label": "Freight Cost (\u20b9)",
                                  className: "px-4 py-4 text-right",
                                  children: _jsx("input", {
                                    type: "number", min: "0", step: "0.01",
                                    className: "h-9 w-24 rounded border border-input px-2 text-right",
                                    value: item.freightCost,
                                    onChange: (e) => handleLineChange(idx, "freightCost", e.target.value)
                                  })
                                }),
                                _jsx("td", {
                                  key: "freight-gst",
                                  "data-label": "Freight GST % / Amount",
                                  className: "px-4 py-4 text-right",
                                  children: _jsxs("div", {
                                    className: "space-y-1",
                                    children: [
                                      _jsx("input", {
                                        type: "number", min: "0", max: "100", step: "0.01",
                                        className: "h-9 w-20 rounded border border-input px-2 text-right",
                                        value: item.freightGst,
                                        onChange: (e) => handleLineChange(idx, "freightGst", e.target.value)
                                      }),
                                      _jsx("div", {
                                        className: "text-[11px] text-muted-foreground",
                                        children: `₹${line.freightGstAmount.toFixed(2)}`
                                      })
                                    ]
                                  })
                                }),
                                _jsx("td", {
                                  key: "line-total",
                                  "data-label": "Line Total (\u20b9)",
                                  className: "px-4 py-4 text-right font-medium",
                                  children: `₹${line.lineTotal.toFixed(2)}`
                                }),
                                _jsx("td", {
                                  key: "action",
                                  "data-label": "Action",
                                  className: "px-6 py-4 text-center",
                                  children: _jsx("button", {
                                    type: "button",
                                    onClick: () => handleDeleteItem(idx),
                                    className: "text-sm text-red-600 hover:text-red-800",
                                    children: "Delete"
                                  })
                                })
                              ]
                            }, idx);
                          })
                        })
                      ]
                    })
                  })
                ]
              }),
              _jsxs("div", {
                className: "po-summary-layout",
                children: [
                  _jsxs("section", {
                    className: "min-w-0 rounded-lg border border-border bg-card p-6 shadow-sm",
                    "aria-label": "Vendor terms and conditions",
                    "aria-busy": vendorTermsLoading,
                    children: [
                      _jsx("h3", {
                        className: "mb-2 text-lg font-semibold",
                        children: "Vendor Terms and Conditions",
                      }),
                      selectedVendorKey && _jsx("p", {
                        className: "mb-4 text-sm font-medium text-muted-foreground",
                        children: selectedVendorKey,
                      }),
                      _jsx("div", {
                        className: "whitespace-pre-wrap break-words text-sm leading-6",
                        style: {overflowWrap: "anywhere"},
                        "aria-live": "polite",
                        children: !selectedVendorKey
                          ? "Select a vendor to view their terms and conditions."
                          : vendorTermsLoading
                          ? "Loading vendor terms and conditions..."
                          : selectedVendorTerms || (vendorTermsError ? "" : "No terms and conditions have been added for this vendor."),
                      }),
                      !vendorTermsLoading && vendorTermsError && _jsx("p", {
                        role: "status",
                        className: "mt-3 text-sm text-amber-700 dark:text-amber-300",
                        children: vendorTermsError,
                      }),
                    ],
                  }),
                  _jsxs("div", {
                    className: "min-w-0 w-full rounded-lg border border-border bg-card p-6 shadow-sm",
                    children: [
                      _jsx("h3", {
                        className: "mb-4 text-lg font-semibold",
                        children: "Order Summary"
                      }),
                      _jsxs("div", {
                        className: "space-y-3",
                        children: [
                          _jsxs("div", { className: "flex justify-between text-sm", children: [
                            _jsx("span", { children: "Basic Amount" }),
                            _jsx("span", { children: `₹${basicSubtotal.toFixed(2)}` })
                          ] }),
                          _jsxs("div", { className: "flex justify-between text-sm", children: [
                            _jsx("span", { children: "Discount" }),
                            _jsx("span", { children: `- ₹${discountTotal.toFixed(2)}` })
                          ] }),
                          _jsxs("div", { className: "flex justify-between text-sm", children: [
                            _jsx("span", { children: "GST" }),
                            _jsx("span", { children: `₹${gstTotal.toFixed(2)}` })
                          ] }),
                          _jsxs("div", { className: "flex justify-between text-sm", children: [
                            _jsx("span", { children: "Freight Cost" }),
                            _jsx("span", { children: `₹${freightTotal.toFixed(2)}` })
                          ] }),
                          _jsxs("div", { className: "flex justify-between text-sm", children: [
                            _jsx("span", { children: "Freight GST" }),
                            _jsx("span", { children: `₹${freightGstTotal.toFixed(2)}` })
                          ] }),
                          _jsxs("div", { className: "flex justify-between text-sm font-semibold", children: [
                            _jsx("span", { children: "Subtotal" }),
                            _jsx("span", { children: `₹${subtotal.toFixed(2)}` })
                          ] }),
                          _jsxs("div", {
                            className: "space-y-1 border-t border-border pt-3",
                            children: [
                              _jsx("label", { className: "block text-xs font-medium", children: "Round-Off (+ / -)" }),
                              _jsx("input", {
                                type: "number", step: "0.01", name: "roundOff",
                                value: formData.roundOff, onChange: handleInputChange,
                                placeholder: "0.27 or -0.27",
                                className: "h-9 w-full rounded border border-input px-2 text-right"
                              })
                            ]
                          }),
                          _jsxs("div", {
                            className: "flex justify-between text-lg font-bold",
                            children: [
                              _jsx("span", { children: "Grand Total" }),
                              _jsx("span", { children: `₹${grandTotal.toFixed(2)}` })
                            ]
                          })
                        ]
                      })
                    ]
                  })
                ]
              }),
              _jsx("div", {
                className: "flex justify-end gap-3",
                children: [
                  _jsx("a", {
                    key: "cancel",
                    href: "/purchase-orders",
                    className: "rounded-md border border-input px-4 py-2 hover:bg-muted",
                    children: "Cancel"
                  }),
                  _jsx("button", {
                    key: "create",
                    type: "button",
                    onClick: handleSubmit,
                    disabled: loading,
                    className: "rounded-md bg-primary px-6 py-2 text-white hover:bg-primary/90 disabled:opacity-50",
                    children: loading ? "Creating..." : "Create PO"
                  })
                ]
              }),
              canManagePO && showComponentModal && _jsx("div", {
                className: "fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 dark:bg-black/70 px-4",
                children: _jsxs("div", {
                  className: "w-full max-w-[700px] rounded-xl border border-border bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto dark:border-slate-700 dark:bg-slate-900",
                  children: [
                    _jsx("h2", {
                      className: "text-xl font-semibold mb-6 text-slate-900 dark:text-slate-100",
                      children: "Add New Component"
                    }),
                    _jsxs(FormGrid, {
                      children: [
                        _jsx(Field, {
                          label: "Component ID",
                          children: _jsx(Input, {
                            name: "component_id",
                            value: componentForm.component_id,
                            onChange: handleComponentChange
                          })
                        }),
                        _jsx(Field, {
                          label: "Category",
                          children: _jsx(Select, {
                            name: "category",
                            value: componentForm.category,
                            onChange: handleComponentChange,
                            options: CATEGORY_CHOICES
                          })
                        }),
                        _jsx(Field, {
                          label: "Component Type",
                          children: _jsx(Input, {
                            name: "component_type",
                            value: componentForm.component_type,
                            onChange: handleComponentChange,
                            placeholder: "Example: Flight Controller"
                          })
                        }),
                        _jsx(Field, {
                          label: "Specification",
                          children: _jsx(Input, {
                            name: "specifications",
                            value: componentForm.specifications,
                            onChange: handleComponentChange
                          })
                        }),
                        _jsx(Field, {
                          label: "SKU No",
                          children: _jsx(Input, {
                            name: "sku_no",
                            value: componentForm.sku_no,
                            onChange: handleComponentChange
                          })
                        }),
                        _jsx(Field, {
                          label: "Part No",
                          children: _jsx(Input, {
                            name: "part_no",
                            value: componentForm.part_no,
                            onChange: handleComponentChange
                          })
                        }),
                        _jsx(Field, {
                          label: "Tally Reference",
                          children: _jsx(Input, {
                            name: "tally_reference",
                            value: componentForm.tally_reference,
                            onChange: handleComponentChange
                          })
                        }),
                        _jsx(Field, {
                          label: "UOM",
                          children: _jsx(Input, {
                            name: "unit_of_measurements",
                            value: componentForm.unit_of_measurements,
                            onChange: handleComponentChange
                          })
                        }),
                        _jsx(Field, {
                          label: "Product Link",
                          children: _jsx(Input, {
                            name: "product_link",
                            value: componentForm.product_link,
                            onChange: handleComponentChange
                          })
                        })
                      ]
                    }),
                    _jsxs("div", {
                      className: "mt-6 flex justify-end gap-3",
                      children: [
                        _jsx("button", {
                          type: "button",
                          onClick: () => setShowComponentModal(false),
                          className: "rounded-lg border px-4 py-2",
                          children: "Cancel"
                        }),
                        _jsx("button", {
                          type: "button",
                          onClick: saveComponent,
                          className: "rounded-lg bg-primary px-4 py-2 text-white",
                          children: "Save Component"
                        })
                      ]
                    })
                  ]
                })
              })
            ]
          })
        ]
      })
    ]
  });
};

export default PurchaseOrdersPage;
