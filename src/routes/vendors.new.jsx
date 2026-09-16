import { useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/AuthContext";
import { canWork } from "@/permissions";

export default function VendorNewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const canManageVendor =
    canWork(user, "vendor");

  const [saving, setSaving] = useState(false);
  const submitLockRef = useRef(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    phone_number: "",
    email: "",
    gst_number: "",
    address: "",
    city: "",
    state: "",
    state_code: "",
    pincode: "",
    terms_and_conditions: "",
    additional_notes: "",
    is_active: true,
  });

  const [products, setProducts] = useState([
    {
      product: "",
      product_version: "",
      quantity: 1,
      unit: "pcs",
      unit_price: 0,
      price: 0,
      gst: 0,
    },
  ]);

  const [productErrors, setProductErrors] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({
    phone_number: "",
    email: "",
  });

  // View-only users may see /vendors, but cannot open the create page.
  if (!canManageVendor) {
    return (
      <Navigate
        to="/vendors"
        replace
      />
    );
  }

  function validatePhoneNumber(value) {
    const phone = String(value || "").trim();

    // The backend allows an empty phone number. Validate it only when entered.
    if (!phone) return "";
    if (!/^\d{10}$/.test(phone)) {
      return "Enter a valid 10-digit phone number.";
    }

    return "";
  }

  function validateEmail(value) {
    const email = String(value || "").trim();

    // The backend allows an empty email. Validate it only when entered.
    if (!email) return "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return "Enter a valid email address, for example name@company.com.";
    }

    return "";
  }

  function validateContactFields() {
    const nextErrors = {
      phone_number: validatePhoneNumber(formData.phone_number),
      email: validateEmail(formData.email),
    };

    setFieldErrors(nextErrors);
    return !nextErrors.phone_number && !nextErrors.email;
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function handleProductChange(index, field, value) {
    const updated = [...products];
    updated[index][field] = value;
    if (field === "quantity" || field === "unit_price") {
      updated[index].price = Number(updated[index].quantity) * Number(updated[index].unit_price || 0);
    }
    setProducts(updated);
  }

  function addProduct() {
    setProducts([
      ...products,
      { product: "", product_version: "", quantity: 1, unit_price: 0, price: 0, gst: 0 },
    ]);
  }

  function removeProduct(index) {
    setProducts(products.filter((_, i) => i !== index));
  }

  const grandTotal = products.reduce((sum, item) => {
    const price = Number(item.price || 0);
    const total = price + (price * Number(item.gst || 0)) / 100;
    return sum + total;
  }, 0);

  async function handleSubmit(e) {
    e.preventDefault();

    if (
      !canManageVendor ||
      submitLockRef.current
    ) {
      return;
    }

    submitLockRef.current = true;

    try {
      setSaving(true);
      setError("");

      const contactFieldsValid = validateContactFields();

    const errors = products.map((item) => ({
      product: !item.product.trim(),
    }));

    setProductErrors(errors);

    const hasErrors = errors.some((error) => error.product);

    if (!contactFieldsValid || hasErrors) {
      if (hasErrors) {
        setError("Please enter at least one component.");
      }
      submitLockRef.current = false;
      setSaving(false);
      return;
    }

      const payload = {
        name: formData.name,
        contact_person: formData.contact_person,
        phone_number: formData.phone_number,
        email: formData.email,
        gst_number: formData.gst_number,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        state_code: formData.state_code,
        pincode: formData.pincode,
        terms_and_conditions: formData.terms_and_conditions,
        additional_notes: formData.additional_notes,
        is_active: formData.is_active,

        products: products.map((p) => ({
          product: p.product,
          product_version: p.product_version,
          quantity: Number(p.quantity),
          price: Number(p.price),
          gst: Number(p.gst),
        })),
      };

      let res = await fetch("/api/vendors/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errBody = null;
        try {
          errBody = await res.json();
        } catch (e) {
          errBody = null;
        }

        const bodyText = JSON.stringify(errBody || {});
        const nameConflict = /name|unique|already/i.test(bodyText);

        if (nameConflict) {
          payload.name = `${payload.name} - ${Date.now().toString().slice(-5)}`;
          res = await fetch("/api/vendors/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }

        if (!res.ok) {
          try {
            errBody = await res.json();
          } catch (e) {
            errBody = null;
          }

          const backendPhoneError = Array.isArray(errBody?.phone_number)
            ? errBody.phone_number[0]
            : errBody?.phone_number;
          const backendEmailError = Array.isArray(errBody?.email)
            ? errBody.email[0]
            : errBody?.email;

          if (backendPhoneError || backendEmailError) {
            setFieldErrors((previous) => ({
              ...previous,
              phone_number: backendPhoneError || previous.phone_number,
              email: backendEmailError || previous.email,
            }));
            submitLockRef.current = false;
            setSaving(false);
            return;
          }

          console.log(errBody);
          throw new Error((errBody && (errBody.detail || JSON.stringify(errBody))) || "Failed to save vendor");
        }
      }

      navigate("/vendors");
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      submitLockRef.current = false;
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <PageHeader title="Add Vendor" subtitle="Create a new vendor." backTo="/vendors" />

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-2 text-destructive">
          {error}
        </div>
      )}

      <div className="mx-auto w-[96vw] max-w-[1500px] min-h-[60vh] rounded-xl border border-border bg-card p-6 shadow-xl">
        <form onSubmit={handleSubmit} className="grid min-h-[60vh] grid-cols-1 content-start gap-x-5 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <label className="mb-1 block text-xs font-semibold text-foreground">Company Name</label>
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-1">
            <label className="mb-1 block text-xs font-semibold text-foreground">Contact Person</label>
            <input
              name="contact_person"
              value={formData.contact_person}
              onChange={handleChange}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="vendor-phone-number"
              className="mb-1 block text-xs font-semibold text-foreground"
            >
              Phone
            </label>

            <input
              id="vendor-phone-number"
              type="tel"
              name="phone_number"
              value={formData.phone_number}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 10);

                setFormData((prev) => ({
                  ...prev,
                  phone_number: value,
                }));

                if (fieldErrors.phone_number) {
                  setFieldErrors((previous) => ({
                    ...previous,
                    phone_number: validatePhoneNumber(value),
                  }));
                }
              }}
              onBlur={(e) =>
                setFieldErrors((previous) => ({
                  ...previous,
                  phone_number: validatePhoneNumber(e.target.value),
                }))
              }
              maxLength={10}
              inputMode="numeric"
              placeholder="Enter 10-digit phone number"
              aria-invalid={Boolean(fieldErrors.phone_number)}
              aria-describedby={fieldErrors.phone_number ? "vendor-phone-error" : undefined}
              className={`h-9 w-full rounded-md border bg-background px-3 text-sm shadow-sm text-foreground transition-all focus:outline-none focus:ring-2 ${
                fieldErrors.phone_number
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                  : "border-border focus:border-primary focus:ring-primary/20"
              }`}
            />

            {fieldErrors.phone_number && (
              <p id="vendor-phone-error" className="text-xs font-medium text-red-500">
                {fieldErrors.phone_number}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="vendor-email"
              className="mb-1 block text-xs font-semibold text-foreground"
            >
              Email
            </label>
            <input
              id="vendor-email"
              type="email"
              name="email"
              value={formData.email}
              onChange={(e) => {
                const value = e.target.value;

                setFormData((previous) => ({
                  ...previous,
                  email: value,
                }));

                if (fieldErrors.email) {
                  setFieldErrors((previous) => ({
                    ...previous,
                    email: validateEmail(value),
                  }));
                }
              }}
              onBlur={(e) =>
                setFieldErrors((previous) => ({
                  ...previous,
                  email: validateEmail(e.target.value),
                }))
              }
              placeholder="name@company.com"
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "vendor-email-error" : undefined}
              className={`h-9 w-full rounded-md border bg-background px-3 text-sm shadow-sm text-foreground transition-all focus:outline-none focus:ring-2 ${
                fieldErrors.email
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                  : "border-border focus:border-primary focus:ring-primary/20"
              }`}
            />

            {fieldErrors.email && (
              <p id="vendor-email-error" className="text-xs font-medium text-red-500">
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Address */}
          <div className="space-y-1">
            <label className="mb-1 block text-xs font-semibold text-foreground">
              Address
            </label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Enter vendor address"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* City */}
          <div className="space-y-1">
            <label className="mb-1 block text-xs font-semibold text-foreground">
              City
            </label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              placeholder="Enter city"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Pincode */}
          <div className="space-y-1">
            <label className="mb-1 block text-xs font-semibold text-foreground">
              Pincode
            </label>
            <input
              type="text"
              name="pincode"
              value={formData.pincode}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                setFormData((previous) => ({
                  ...previous,
                  pincode: value,
                }));
              }}
              maxLength={6}
              inputMode="numeric"
              placeholder="Enter 6-digit pincode"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* State */}
          <div className="space-y-1">
            <label className="mb-1 block text-xs font-semibold text-foreground">
              State
            </label>
            <input
              type="text"
              name="state"
              value={formData.state}
              onChange={handleChange}
              placeholder="Enter state"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* State Code */}
          <div className="space-y-1">
            <label className="mb-1 block text-xs font-semibold text-foreground">
              State Code
            </label>
            <input
              type="text"
              name="state_code"
              value={formData.state_code}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 2);
                setFormData((previous) => ({
                  ...previous,
                  state_code: value,
                }));
              }}
              maxLength={2}
              inputMode="numeric"
              placeholder="Example: 33"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* GST Number */}
          <div className="space-y-1">
            <label className="mb-1 block text-xs font-semibold text-foreground">
              GST Number
            </label>
            <input
              type="text"
              name="gst_number"
              value={formData.gst_number}
              onChange={handleChange}
              placeholder="Enter GST number"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Terms and Conditions */}
          <div className="space-y-1">
            <label className="mb-1 block text-xs font-semibold text-foreground">
              Terms and Conditions
            </label>
            <textarea
              name="terms_and_conditions"
              value={formData.terms_and_conditions}
              onChange={handleChange}
              rows={3}
              placeholder="Enter vendor terms and conditions"
              className="min-h-[84px] w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Additional Notes */}
          <div className="space-y-1">
            <label className="mb-1 block text-xs font-semibold text-foreground">
              Additional Notes
            </label>
            <input
              type="text"
              name="additional_notes"
              value={formData.additional_notes}
              onChange={handleChange}
              placeholder="Enter additional vendor notes"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Status */}
          <div className="space-y-1">
            <label className="mb-1 block text-xs font-semibold text-foreground">
              Status
            </label>
            <select
              value={formData.is_active ? "active" : "inactive"}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  is_active: e.target.value === "active",
                }))
              }
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="md:col-span-2 xl:col-span-4 mt-4 w-full">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold">Component</h3>

              <button type="button" onClick={addProduct} className="rounded-md px-3 py-1.5 text-sm text-white font-medium" style={{ backgroundColor: "#E85D75" }}>
                + Add Components
              </button>
            </div>

            <div className="mt-2 w-full overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full border-collapse">
                <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="border-b border-border px-2 py-2">Component</th>
                    <th className="border-b border-border px-2 py-2">Version</th>
                    <th className="border-b border-border px-2 py-2">Qty</th>
                    <th className="border-b border-border px-2 py-2">Unit Price</th>
                    <th className="border-b border-border px-2 py-2">Price</th>
                    <th className="border-b border-border px-2 py-2">GST %</th>
                    <th className="border-b border-border px-2 py-2">Total</th>
                    <th className="border-b border-border px-2 py-2">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((item, index) => {
                    const price = Number(item.price || 0);
                    const total = price + (price * Number(item.gst || 0)) / 100;
                    return (
                      <tr key={index}>
                        <td className="border-b border-border px-2 py-2">
                          <input
  value={item.product}
  onChange={(e) => {
    handleProductChange(index, "product", e.target.value);

    setProductErrors((prev) => {
      const updated = [...prev];

      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          product: !e.target.value.trim(),
        };
      }

      return updated;
    });
  }}
  className={`w-full rounded border px-2 py-1 bg-background text-foreground ${
    productErrors[index]?.product
      ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500"
      : "border-border"
  }`}
/>

{productErrors[index]?.product && (
  <p className="mt-1 text-xs text-red-500">
    Component is required
  </p>
)}
                        </td>
                        <td className="border-b border-border px-2 py-2">
                          <input value={item.product_version} onChange={(e) => handleProductChange(index, "product_version", e.target.value)} className="w-full min-w-[120px] rounded border px-2 py-1 bg-background text-foreground" />
                        </td>
                        <td className="border-b border-border px-2 py-2">
                          <input type="number" value={item.quantity} onChange={(e) => handleProductChange(index, "quantity", e.target.value)} className="w-16 rounded border px-2 py-1 bg-background text-foreground" />
                        </td>
                        <td className="border-b border-border px-2 py-2">
                          <input type="number" value={item.unit_price} onChange={(e) => handleProductChange(index, "unit_price", e.target.value)} className="w-20 rounded border px-2 py-1 bg-background text-foreground" />
                        </td>
                        <td className="border-b border-border px-2 py-2">
                          <input value={item.price} readOnly className="w-20 rounded border bg-muted px-2 py-1 text-foreground" />
                        </td>
                        <td className="border-b border-border px-2 py-2">
                          <input type="number" value={item.gst} onChange={(e) => handleProductChange(index, "gst", e.target.value)} className="w-16 rounded border px-2 py-1 bg-background text-foreground" />
                        </td>
                        <td className="border p-2 font-semibold text-foreground">₹{total.toFixed(2)}</td>
                        <td className="border p-2 text-center">
                          <button type="button" onClick={() => removeProduct(index)} className="rounded-md p-2 text-destructive transition hover:bg-destructive/10">
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex justify-end border-t pt-2">
              <div className="text-base font-semibold text-foreground">
                Grand Total :
                <span className="ml-3 text-destructive">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 xl:col-span-4 flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => navigate("/vendors")} className="h-9 rounded-md border border-border px-5 text-sm font-medium hover:bg-muted/50 transition">
              Cancel
            </button>

            <button type="submit" disabled={saving} className="h-9 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? "Saving..." : "Save Vendor"}
            </button>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
