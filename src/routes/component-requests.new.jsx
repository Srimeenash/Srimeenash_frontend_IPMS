import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FormShell,
  FormGrid,
  Field,
  Input,
  Select,
} from "@/components/app/FormShell";
import config from "@/config";

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

const ComponentRequestsPage = () => {
  const navigate = useNavigate();

  const submitLockRef = useRef(false);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [errorModal, setErrorModal] =
    useState({
      open: false,
      message: "",
    });

  const [form, setForm] = useState({
    component_id: "",
    version: "",
    category: CATEGORY_CHOICES[0],
    component_type: "",
    specification: "",
    hsn_no: "",
    sku_no: "",
    part_no: "",
    tally_reference: "",
    product_link: "",
  });

  async function generateNextComponentId(category) {
    try {
      const cleanCategory = String(
        category || "",
      ).trim();

      const prefix =
        CATEGORY_PREFIXES[cleanCategory];

      if (!prefix) {
        throw new Error(
          "Invalid component category.",
        );
      }

      const response = await fetch(
        `${config.baseURL}/components/components/?page_size=5000`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(
          "Unable to load existing components.",
        );
      }

      const data = await response.json();

      const componentList =
        Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : [];

      const idPattern = /^[A-Z]+_(\d{4})$/i;

      const highestNumber =
        componentList.reduce(
          (highest, component) => {
            const value = String(
              component?.component_id ||
                component?.code ||
                "",
            ).trim();

            const match =
              value.match(idPattern);

            if (!match) {
              return highest;
            }

            const number =
              Number(match[1]);

            if (
              !Number.isFinite(number)
            ) {
              return highest;
            }

            return Math.max(
              highest,
              number,
            );
          },
          0,
        );

      return `${prefix}_${String(
        highestNumber + 1,
      ).padStart(4, "0")}`;

    } catch (error) {
      console.error(
        "Unable to generate Component ID:",
        error,
      );

      const prefix =
        CATEGORY_PREFIXES[
          String(category || "").trim()
        ];

      return prefix
        ? `${prefix}_0001`
        : "";
    }
  }

  useEffect(() => {
    let active = true;

    const loadComponentId =
      async () => {
        const defaultCategory =
          CATEGORY_CHOICES[0];

        const nextId =
          await generateNextComponentId(
            defaultCategory,
          );

        if (!active) {
          return;
        }

        setForm((previous) => ({
          ...previous,
          component_id: nextId,
        }));
      };

    void loadComponentId();

    return () => {
      active = false;
    };
  }, []);

  async function handleChange(e) {
    const { name, value } = e.target;

    if (name === "component_id") {
      return;
    }

    if (name === "category") {
      const selectedCategory =
        String(value || "").trim();

      setForm((previous) => ({
        ...previous,
        category: selectedCategory,
        component_id: "",
      }));

      const nextId =
        await generateNextComponentId(
          selectedCategory,
        );

      setForm((previous) => ({
        ...previous,
        category: selectedCategory,
        component_id: nextId,
      }));

      return;
    }

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit() {
    if (submitLockRef.current) {
      return;
    }

    const componentType =
      String(
        form.component_type || "",
      ).trim();

    if (!componentType) {
      setErrorModal({
        open: true,
        message:
          "Component Type is required.",
      });
      return;
    }

    const category =
      form.category &&
      form.category.includes("::")
        ? form.category.split("::")[1]
        : form.category;

    const cleanCategory =
      String(
        category || "",
      ).trim();

    const prefix =
      CATEGORY_PREFIXES[
        cleanCategory
      ];

    if (!prefix) {
      setErrorModal({
        open: true,
        message:
          "Please select a valid category.",
      });
      return;
    }

    let componentId =
      String(
        form.component_id || "",
      ).trim();

    const expectedIdPattern =
      new RegExp(
        `^${prefix}_\\d{4}$`,
        "i",
      );

    if (
      !expectedIdPattern.test(
        componentId,
      )
    ) {
      componentId =
        await generateNextComponentId(
          cleanCategory,
        );

      setForm((previous) => ({
        ...previous,
        component_id: componentId,
      }));
    }

    if (!componentId) {
      setErrorModal({
        open: true,
        message:
          "Unable to generate Component ID.",
      });
      return;
    }

    const newRequest = {
      component_id: componentId,
      version:
        String(
          form.version || "",
        ).trim(),
      category: cleanCategory,
      component_type:
        componentType,
      specifications:
        String(
          form.specification || "",
        ).trim(),
      hsn_numbers:
        String(
          form.hsn_no || "",
        ).trim(),
      sku_numbers:
        String(
          form.sku_no || "",
        ).trim(),
      part_numbers:
        String(
          form.part_no || "",
        ).trim(),
      product_link:
        String(
          form.product_link || "",
        ).trim(),
      tally_reference:
        String(
          form.tally_reference || "",
        ).trim(),
      ordering_id: null,
      unit_price: 0,
      stock_quantity: 0,
      reorder_level: 0,
      is_active: true,
    };

    submitLockRef.current = true;
    setIsSubmitting(true);

    try {
      const res = await fetch(
        `${config.baseURL}/components/components/`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            newRequest,
          ),
        },
      );

      if (res.ok) {
        await res
          .json()
          .catch(() => null);

        navigate(
          "/component-requests",
        );

        return;
      }

      let errorData = {};

      try {
        errorData =
          await res.json();
      } catch {
        errorData = {};
      }

      const errorText =
        JSON.stringify(
          errorData || {},
        );

      if (
        errorData.component_id ||
        /component_id|already exists|unique/i.test(
          errorText,
        )
      ) {
        const nextId =
          await generateNextComponentId(
            cleanCategory,
          );

        setForm((previous) => ({
          ...previous,
          component_id: nextId,
        }));

        setErrorModal({
          open: true,
          message:
            `Component ID already exists. ` +
            `The next ${cleanCategory} Component ID has been generated automatically: ${nextId}. ` +
            `Please submit again.`,
        });
      } else {
        let message =
          errorData?.detail ||
          errorData?.message;

        if (!message) {
          const firstErrorKey =
            Object.keys(
              errorData || {},
            )[0];

          if (firstErrorKey) {
            const firstError =
              errorData[
                firstErrorKey
              ];

            if (
              Array.isArray(
                firstError,
              )
            ) {
              message =
                `${firstErrorKey}: ${firstError.join(
                  ", ",
                )}`;
            } else if (
              typeof firstError ===
              "string"
            ) {
              message =
                `${firstErrorKey}: ${firstError}`;
            }
          }
        }

        setErrorModal({
          open: true,
          message:
            message ||
            "Unable to save component.",
        });
      }

    } catch (err) {
      console.error(
        "Component create error:",
        err,
      );

      setErrorModal({
        open: true,
        message:
          "Server connection failed.",
      });

    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  return _jsxs(FormShell, {
    title:
      "New Component",

    subtitle:
      "Components from inventory.",

    backTo:
      "/component-requests",

    backLabel:
      "Back to requests",

    submitLabel:
      isSubmitting
        ? "Submitting..."
        : "Submit Request",

    onSubmit:
      handleSubmit,

    loading:
      isSubmitting,

    children: [
      _jsxs("div", {
        className:
          "grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-2 lg:grid-cols-3",

        children: [
          _jsx(Field, {
            label:
              "Component ID",

            required:
              true,

            children:
              _jsx(Input, {
                name:
                  "component_id",

                value:
                  form.component_id,

                readOnly:
                  true,

                tabIndex:
                  -1,

                title:
                  "Component ID is generated automatically based on category",

                placeholder:
                  "Generated automatically",

                className:
                  "h-9 cursor-not-allowed bg-muted font-mono",
              }),
          }),

          _jsx(Field, {
            label:
              "Version",

            children:
              _jsx(Input, {
                name:
                  "version",

                value:
                  form.version,

                onChange:
                  handleChange,

                placeholder:
                  "Example: V1.0",

                className:
                  "h-9",
              }),
          }),

          _jsx(Field, {
            label:
              "Category",

            required:
              true,

            children:
              _jsx(Select, {
                name:
                  "category",

                value:
                  form.category,

                onChange:
                  handleChange,

                options:
                  CATEGORY_CHOICES,

                className:
                  "h-9",
              }),
          }),

          _jsx(Field, {
            label:
              "Component Type",

            required:
              true,

            children:
              _jsx(Input, {
                name:
                  "component_type",

                value:
                  form.component_type,

                onChange:
                  handleChange,

                placeholder:
                  "Example: Flight Controller",

                required:
                  true,

                className:
                  "h-9",
              }),
          }),

          _jsx(Field, {
            label:
              "Specification",

            children:
              _jsx(Input, {
                name:
                  "specification",

                value:
                  form.specification,

                onChange:
                  handleChange,

                className:
                  "h-9",
              }),
          }),

          _jsx(Field, {
            label:
              "HSN.No",

            children:
              _jsx(Input, {
                name:
                  "hsn_no",

                value:
                  form.hsn_no,

                onChange:
                  handleChange,

                inputMode:
                  "numeric",

                pattern:
                  "\\d{4,8}",

                minLength:
                  4,

                maxLength:
                  8,

                title:
                  "Enter 4 to 8 digits, or leave blank.",

                className:
                  "h-9",
              }),
          }),

          _jsx(Field, {
            label:
              "SKU.No",

            children:
              _jsx(Input, {
                name:
                  "sku_no",

                value:
                  form.sku_no,

                onChange:
                  handleChange,

                className:
                  "h-9",
              }),
          }),

          _jsx(Field, {
            label:
              "Part.No",

            children:
              _jsx(Input, {
                name:
                  "part_no",

                value:
                  form.part_no,

                onChange:
                  handleChange,

                className:
                  "h-9",
              }),
          }),

          _jsx(Field, {
            label:
              "Tally Reference",

            children:
              _jsx(Input, {
                name:
                  "tally_reference",

                value:
                  form.tally_reference,

                onChange:
                  handleChange,

                className:
                  "h-9",
              }),
          }),

          _jsx(Field, {
            label:
              "Product Link",

            children:
              _jsx(Input, {
                name:
                  "product_link",

                value:
                  form.product_link,

                onChange:
                  handleChange,

                placeholder:
                  "https://",

                className:
                  "h-9",
              }),
          }),
        ],
      }),

      errorModal.open &&
        _jsx("div", {
          className:
            "fixed inset-0 z-50 flex items-center justify-center bg-black/50",

          children:
            _jsxs(
              "div",
              {
                className:
                  "w-[400px] rounded-xl bg-white p-6 shadow-xl",

                children: [
                  _jsx("h3", {
                    className:
                      "mb-3 text-lg font-semibold text-red-600",

                    children:
                      "Error",
                  }),

                  _jsx("p", {
                    className:
                      "text-sm text-gray-700",

                    children:
                      errorModal.message,
                  }),

                  _jsx("div", {
                    className:
                      "mt-6 flex justify-end",

                    children:
                      _jsx(
                        "button",
                        {
                          type:
                            "button",

                          onClick:
                            () =>
                              setErrorModal(
                                {
                                  open:
                                    false,
                                  message:
                                    "",
                                },
                              ),

                          className:
                            "rounded-lg bg-primary px-4 py-2 text-white",

                          children:
                            "OK",
                        },
                      ),
                  }),
                ],
              },
            ),
        }),
    ],
  });
};

export default ComponentRequestsPage;
