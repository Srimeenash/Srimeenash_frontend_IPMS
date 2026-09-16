function resolveValue(source, keys) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return "";
}

function extractVendorName(purchaseOrder) {
  const directVendor = resolveValue(purchaseOrder, ["vendor_name", "vendorName", "vendor"]);
  if (directVendor && typeof directVendor === "object") {
    return resolveValue(directVendor, ["name", "vendor_name"]) || "";
  }

  return directVendor || resolveValue(purchaseOrder?.vendor, ["name", "vendor_name"]) || "";
}

function extractLineItems(purchaseOrder) {
  const candidates = [
    purchaseOrder?.items,
    purchaseOrder?.lineItems,
    purchaseOrder?.line_items,
    purchaseOrder?.order_items,
    purchaseOrder?.line_items_list,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate;
    }
  }

  return [];
}

function buildComponentLabel(lineItem, components = []) {
  const componentRef = lineItem?.component;
  const componentValue =
    resolveValue(lineItem, ["component", "component_id", "componentId"]) ||
    (componentRef && typeof componentRef === "object" ? componentRef.component_id || componentRef.id || componentRef.code : "");
  const componentName = resolveValue(lineItem, ["component_name", "componentName", "name"]) ||
    (componentRef && typeof componentRef === "object" ? componentRef.name || componentRef.component_name : "");

  const matchedComponent = components.find((component) => {
    const componentIdValues = [component.id, component.component_id, component.code]
      .filter(Boolean)
      .map((value) => String(value));

    return (
      componentIdValues.includes(String(componentValue)) ||
      component?.name === componentName ||
      component?.component_name === componentName
    );
  });

  if (matchedComponent) {
    const matchedId = matchedComponent.component_id ?? matchedComponent.id ?? componentValue;
    const matchedName = matchedComponent.name || matchedComponent.component_name || componentName;
    return matchedId && matchedName ? `${matchedId} - ${matchedName}` : matchedName || "";
  }

  if (componentValue && componentName) {
    return `${componentValue} - ${componentName}`;
  }

  return componentName || "";
}

export function getLineItemsFromPO(purchaseOrder) {
  return extractLineItems(purchaseOrder);
}

export function getMatchingLineItemFromPO(purchaseOrder, component) {
  const lineItems = getLineItemsFromPO(purchaseOrder);
  const componentId = component?.component_id ?? component?.id ?? component?.code;
  const componentName = component?.name || component?.component_name;

  return lineItems.find((lineItem) => {
    const itemComponentId = resolveValue(lineItem, ["component", "component_id", "componentId"]);
    const itemComponentName = resolveValue(lineItem, ["component_name", "componentName", "name"]);

    return (
      (componentId && String(itemComponentId) === String(componentId)) ||
      (componentName && itemComponentName === componentName)
    );
  });
}

export function getAutofillFromPO(purchaseOrder, components = []) {
  if (!purchaseOrder) return {};

  const vendor = extractVendorName(purchaseOrder);
  const lineItems = getLineItemsFromPO(purchaseOrder);
  const firstLineItem = lineItems[0] || {};

  const quantity = resolveValue(firstLineItem, ["quantity", "qty", "quantity_received", "quantityReceived"]);
  const unitPrice = resolveValue(firstLineItem, ["unit_price", "unitPrice", "price", "rate"]);
  const gstPercentage = resolveValue(firstLineItem, ["gst_percentage", "gstPercentage", "gst", "tax_percentage", "tax"]);

  return {
    vendor,
    component: buildComponentLabel(firstLineItem, components),
    unitPrice: unitPrice === "" ? "" : String(unitPrice),
    gstPercentage: gstPercentage === "" ? "" : String(gstPercentage),
    quantityReceived: quantity === "" ? "" : String(quantity),
  };
}
