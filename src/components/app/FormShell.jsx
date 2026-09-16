import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "./PageShell";

const formatLabel = (text) => {
  if (typeof text !== "string") return text;

  // removes leading "1 — " or "12 - "
  return text.replace(/^\s*\d+\s*[—-]\s*/, "");
};
export function FormShell({
  title,
  subtitle,
  backTo,
  backLabel,
  children,
  onSubmit,
  submitLabel = "Submit",
  wide = false,
}) {
  return _jsxs(PageShell, {
    children: [
      _jsxs(Link, {
        to: backTo,
        className:
          "inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4",
        children: [_jsx(ArrowLeft, { className: "size-4" }), " ", backLabel],
      }),
      _jsxs("div", {
        className: "mb-6",
        children: [
          _jsx("h1", { className: "text-3xl font-bold tracking-tight", children: title }),
          subtitle &&
            _jsx("p", { className: "mt-2 text-base text-muted-foreground max-w-4xl", children: subtitle }),
        ],
      }),
      _jsxs("form", {
        onSubmit: (e) => {
          e.preventDefault();
          onSubmit?.();
        },
        className: `rounded-3xl border border-border bg-card p-8 space-y-8 w-full ${
          wide ? "w-full max-w-none" : "max-w-6xl mx-auto"
        }`,
        children: [
          children,
          _jsxs("div", {
            className: "flex justify-end gap-2 pt-4 border-t border-border",
            children: [
              _jsx(Link, {
                to: backTo,
                className:
                  "rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-secondary",
                children: "Cancel",
              }),
              _jsx("button", {
                type: "submit",
                className:
                  "rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90",
                children: submitLabel,
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
export function Field({ label, children, span = 1, required }) {
  return _jsxs("label", {
    className: `block ${span === 2 ? "md:col-span-2" : ""}`,
    children: [
      _jsxs("span", {
        className: "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        children: [
          label,
          required && _jsx("span", { className: "text-destructive ml-0.5", children: "*" }),
        ],
      }),
      _jsx("div", { className: "mt-1.5", children: children }),
    ],
  });
}
export function Input(props) {
  return _jsx("input", {
    ...props,
    className:
      "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
  });
}
export function Select({ options, ...props }) {
  return _jsxs("select", {
    ...props,
    className:
      "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
    children: [
      _jsx("option", { value: "", children: "\u2014 Select \u2014" }),
      options.map((option) =>
        typeof option === "string"
          ? _jsx("option", { value: option, children: option }, option)
          : _jsx(
              "option",
              { value: option.value, children: option.label },
              option.value,
            ),
      ),
    ],
  });
}
export function SearchableSelect({
  options = [],
  name,
  value,
  onChange,
  placeholder,
}) {
  const listId = `${name}-list`;

  return (
    <div className="w-full">
      <input
        autoComplete="off"
        list={listId}
        name={name}
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />

      <datalist id={listId}>
        {options.map((opt, i) =>
          typeof opt === "string" ? (
            <option key={i} value={opt} />
          ) : (
            <option key={opt.value} value={opt.label} />
          )
        )}
      </datalist>
    </div>
  );
}
export function SearchableObjectSelect({
  options = [],
  name,
  value,
  onChange,
  placeholder,
}) {
  const listId = `${name}-${Math.random().toString(36).slice(2)}`;

  const handleChange = (event) => {
    const rawValue = event.target.value;
    const selectedOption = options.find(
      (option) => option.label === rawValue || option.value === rawValue,
    );

    if (onChange) {
      onChange(selectedOption || { value: rawValue, label: rawValue });
    }
  };

  return (
    <>
      <input
        autoComplete="off"
        list={listId}
        name={name}
        value={value || ""}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.label} />
        ))}
      </datalist>
    </>
  );
}

export function Textarea(props) {
  return _jsx("textarea", {
    rows: 3,
    ...props,
    className:
      "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
  });
}
export function FormGrid({ children }) {
  return _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-5", children: children });
}
