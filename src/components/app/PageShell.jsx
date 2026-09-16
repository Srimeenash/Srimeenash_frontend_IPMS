import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
export function PageShell({ children }) {
  return _jsxs("div", {
    className: "flex min-h-screen bg-background",
    children: [
      _jsx(Sidebar, {}),
      _jsxs("div", {
        className: "flex-1 flex flex-col min-w-0",
        children: [
          _jsx(Topbar, {}),
          _jsx("main", { className: "flex-1 p-6 md:p-8", children: children }),
          _jsx("footer", {
            className: "border-t border-border py-4 text-center text-xs text-muted-foreground",
            children: "\u00A9 2026 IPMS. All rights reserved.",
          }),
        ],
      }),
    ],
  });
}
export function PageHeader({ title, subtitle, right, left, backTo, backLabel }) {
  const navigate = useNavigate();
  const location = useLocation();
  const showBack = !left && location.pathname !== "/";
  const backButton = showBack ? (
    <button
      type="button"
      onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
      className="inline-flex items-center gap-2 text-primary hover:underline"
    >
      <ArrowLeft className="size-4" /> {backLabel ?? "Back"}
    </button>
  ) : null;

  return _jsxs("div", {
    className: "flex flex-wrap items-end justify-between gap-4 mb-6",
    children: [
      _jsxs("div", {
        className: "flex flex-col gap-3",
        children: [
          left || backButton,
          _jsxs("div", {
            children: [
              _jsx("h1", { className: "text-2xl font-bold tracking-tight", children: title }),
              subtitle &&
                _jsx("p", { className: "mt-1 text-sm text-muted-foreground", children: subtitle }),
            ],
          }),
        ],
      }),
      right,
    ],
  });
}
