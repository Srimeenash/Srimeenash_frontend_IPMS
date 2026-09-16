import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import config from "@/config";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { useEffect, useState } from "react";
import { ShoppingCart, Plus, TrendingUp, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";

function ProcurementPage() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);

  const [vendorForm, setVendorForm] = useState({
    name: "",
    product: "",
    product_version: "",
    contact_person: "",
    phone: "",
    gst_number: "",
    rating: "",
    is_active: true,
  });

  const totalPOs = purchaseOrders.length;
  const totalVendors = vendors.length;
  const activeVendors = vendors.filter((v) => v.is_active).length;

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const headers = {
        "Content-Type": "application/json",
      };

      const [poRes, vendorRes] = await Promise.all([
        fetch(`${config.baseURL}/procurement/purchase-orders/`, {
          headers,
        }),
        fetch(`${config.baseURL}/vendors/`, { headers }),
      ]);

      const poData = await poRes.json();
      const vendorData = await vendorRes.json();

      setPurchaseOrders(Array.isArray(poData) ? poData : poData.results || []);
      setVendors(Array.isArray(vendorData) ? vendorData : vendorData.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function createVendor() {
    try {
      const rating = Number(vendorForm.rating);

      if (rating < 0 || rating > 5) {
        toast.error("Rating must be between 0 and 5");
        return;
      }

      const res = await fetch(`${config.baseURL}/vendors/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vendorForm),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error(errorData);
        alert("vendor with this name already exists.");
        return;
      }

      toast.success("Vendor created successfully!", {
        position: "top-center",
        autoClose: 2000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: false,
        draggable: true,
        theme: "dark",
        style: {
          background: "#111827",
          color: "#fff",
          borderRadius: "12px",
          fontSize: "14px",
          padding: "14px 18px",
          marginTop: "60px",
        },
      });

      setShowVendorModal(false);
      setVendorForm({
        name: "",
        product: "",
        product_version: "",
        contact_person: "",
        phone: "",
        gst_number: "",
        rating: "",
        is_active: true,
      });
      loadData();
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  }

  return _jsxs(PageShell, {
    children: [
      _jsxs("div", {
        className: "flex justify-between items-center mb-6",
        children: [
          _jsx(PageHeader, {
            title: "Procurement Module",
            subtitle: "Manage purchase orders and vendor relationships.",
          }),
          _jsx("button", {
            onClick: () => setShowVendorModal(true),
            className: "flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg",
            children: [_jsx(Plus, { size: 16 }), "Add Vendor"],
          }),
        ],
      }),

      loading &&
        _jsx("div", {
          className: "mb-4 text-sm text-muted-foreground",
          children: "Loading procurement data...",
        }),

      /* STATS */
      _jsxs("div", {
        className: "grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6",
        children: [
          _jsxs("div", {
            className: "rounded-2xl border bg-card p-5",
            children: [
              _jsx(ShoppingCart, {}),
              _jsx("div", { className: "text-sm", children: "Purchase Orders" }),
              _jsx("div", { className: "text-2xl font-bold", children: totalPOs }),
              _jsx(Link, {
                to: "/purchase-orders",
                className: "text-xs text-blue-600 hover:underline mt-2 inline-block",
                children: "View all →",
              }),
            ],
          }),
          _jsxs("div", {
            className: "rounded-2xl border bg-card p-5",
            children: [
              _jsx(ShoppingCart, {}),
              _jsx("div", { className: "text-sm", children: "Vendors" }),
              _jsx("div", { className: "text-2xl font-bold", children: totalVendors }),
            ],
          }),
          _jsxs("div", {
            className: "rounded-2xl border bg-card p-5",
            children: [
              _jsx(TrendingUp, {}),
              _jsx("div", { className: "text-sm", children: "Active Vendors" }),
              _jsx("div", { className: "text-2xl font-bold", children: activeVendors }),
            ],
          }),
        ],
      }),

      /* VENDOR MODAL */
      showVendorModal &&
        _jsx("div", {
          className: "fixed inset-0 bg-white/-30 backdrop-blur-sm flex items-center justify-center z-50",
          children: _jsxs("div", {
            className: "bg-card text-foreground p-6 rounded-xl w-[600px] shadow-2xl border",
            children: [
              _jsxs("div", {
                className: "flex justify-between items-center mb-4",
                children: [
                  _jsx("h3", {
                    className: "text-lg font-semibold",
                    children: "Create Vendor",
                  }),
                  _jsx("button", {
                    onClick: () => setShowVendorModal(false),
                    className: "hover:text-red-400",
                    children: _jsx(X, {}),
                  }),
                ],
              }),

              _jsxs("div", {
                className: "grid grid-cols-2 gap-3",
                children: [
                  _jsx("input", {
                    placeholder: "Vendor Name",
                    className:
                      "w-full rounded p-2 border bg-white text-black dark:bg-gray-800 dark:text-white dark:border-gray-600",
                    value: vendorForm.name,
                    onChange: (e) =>
                      setVendorForm({ ...vendorForm, name: e.target.value }),
                  }),
                  _jsx("input", {
                    placeholder: "Product",
                    className:
                      "w-full rounded p-2 border bg-white text-black dark:bg-gray-800 dark:text-white dark:border-gray-600",
                    value: vendorForm.product,
                    onChange: (e) =>
                      setVendorForm({ ...vendorForm, product: e.target.value }),
                  }),
                  _jsx("input", {
                    placeholder: "Version",
                    className:
                      "w-full rounded p-2 border bg-white text-black dark:bg-gray-800 dark:text-white dark:border-gray-600",
                    value: vendorForm.product_version,
                    onChange: (e) =>
                      setVendorForm({
                        ...vendorForm,
                        product_version: e.target.value,
                      }),
                  }),
                  _jsx("input", {
                    placeholder: "Contact Person",
                    className:
                      "w-full rounded p-2 border bg-white text-black dark:bg-gray-800 dark:text-white dark:border-gray-600",
                    value: vendorForm.contact_person,
                    onChange: (e) =>
                      setVendorForm({
                        ...vendorForm,
                        contact_person: e.target.value,
                      }),
                  }),
                  _jsx("input", {
                    placeholder: "Phone",
                    className:
                      "w-full rounded p-2 border bg-white text-black dark:bg-gray-800 dark:text-white dark:border-gray-600",
                    value: vendorForm.phone,
                    onChange: (e) =>
                      setVendorForm({ ...vendorForm, phone: e.target.value }),
                  }),
                  _jsx("input", {
                    placeholder: "GST Number",
                    className:
                      "w-full rounded p-2 border bg-white text-black dark:bg-gray-800 dark:text-white dark:border-gray-600",
                    value: vendorForm.gst_number,
                    onChange: (e) =>
                      setVendorForm({
                        ...vendorForm,
                        gst_number: e.target.value,
                      }),
                  }),
                  _jsx("input", {
                    type: "number",
                    min: "0",
                    max: "5",
                    step: "0.1",
                    placeholder: "Rating (0-5)",
                    className:
                      "w-full rounded p-2 border bg-white text-black dark:bg-gray-800 dark:text-white dark:border-gray-600",
                    value: vendorForm.rating,
                    onChange: (e) =>
                      setVendorForm({
                        ...vendorForm,
                        rating: e.target.value,
                      }),
                  }),
                  _jsx("select", {
                    className:
                      "border rounded p-2 bg-white text-black dark:bg-gray-800 dark:text-white dark:border-gray-600",
                    value: vendorForm.is_active,
                    onChange: (e) =>
                      setVendorForm({
                        ...vendorForm,
                        is_active: e.target.value === "true",
                      }),
                    children: [
                      _jsx("option", { value: true, children: "Active" }),
                      _jsx("option", { value: false, children: "Inactive" }),
                    ],
                  }),
                ],
              }),

              _jsx("button", {
                onClick: createVendor,
                className: "w-full mt-4 bg-primary text-white py-2 rounded",
                children: "Save Vendor",
              }),
            ],
          }),
        }),
    ],
  });
}

export default ProcurementPage;
