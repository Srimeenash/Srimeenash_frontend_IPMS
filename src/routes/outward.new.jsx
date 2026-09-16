import {
  jsx as _jsx,
  jsxs as _jsxs,
} from "react/jsx-runtime";

import {
  Navigate,
} from "react-router-dom";

import {
  FormShell,
  FormGrid,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/app/FormShell";

import {
  components,
} from "@/lib/mock-data";

import {
  useAuth,
} from "@/AuthContext";

import {
  canWork,
} from "@/permissions";


const OutwardPage = () => {
  const { user } = useAuth();

  /*
   * Only:
   * ADMIN
   * PROCUREMENT
   * INVENTORY
   *
   * can create/work on Outward.
   */
  const canManageOutward =
    canWork(user, "outward");

  /*
   * Other users may see /outward,
   * but cannot access the create page.
   */
  if (!canManageOutward) {
    return _jsx(Navigate, {
      to: "/outward",
      replace: true,
    });
  }

  return _jsxs(FormShell, {
    title: "Create Outward Entry",

    subtitle:
      "Ship or sell components. Inventory is decremented on submit.",

    backTo: "/outward",

    backLabel: "Back to outward",

    submitLabel: "Record Outward",

    children: [
      _jsxs(FormGrid, {
        children: [
          _jsx(Field, {
            label: "Customer Name",
            required: true,

            children: _jsx(Input, {
              placeholder:
                "Customer / destination",
            }),
          }),

          _jsx(Field, {
            label: "Component",
            required: true,

            children: _jsx(Select, {
              options: components.map(
                (component) =>
                  `${component.code} · ${component.name}`,
              ),
            }),
          }),

          _jsx(Field, {
            label: "Quantity",
            required: true,

            children: _jsx(Input, {
              type: "number",
              min: 1,
            }),
          }),

          _jsx(Field, {
            label: "Selling Price (₹)",
            required: true,

            children: _jsx(Input, {
              type: "number",
              min: 0,
              step: "0.01",
            }),
          }),
        ],
      }),

      _jsx(Field, {
        label: "Remarks",

        children: _jsx(Textarea, {
          placeholder: "Notes…",
        }),
      }),
    ],
  });
};


export default OutwardPage;