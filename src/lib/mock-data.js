import data from "./data.json";
import { Boxes, Plane, Trash2 } from "lucide-react";

const icons = { Boxes, Plane, Trash2 };

// Maintain backwards-compatible grouped export for older imports
export const mockData = data;

export const kpis = data.kpis;
export const inventorySummary = data.inventorySummary.map((entry) => ({
  ...entry,
  icon: icons[entry.icon],
}));
export const inventoryTabs = data.inventoryTabs;
export const procurementSeries = data.procurementSeries;
export const categoryBreakdown = data.categoryBreakdown;
export const recentActivity = data.recentActivity;
export const lowStock = data.lowStock;
export const categories = data.categories;
export const components = data.components;
export const inDrone = data.inDrone;
export const scrap = data.scrap;
export const vendors = data.vendors;
export const purchaseOrders = data.purchaseOrders;
export const boms = data.boms;
export const materialRequests = data.materialRequests;
export const inward = data.inward;
export const outward = data.outward;
export const componentRequests = data.componentRequests;
