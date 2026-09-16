import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";

import { PageShell, PageHeader } from "@/components/app/PageShell";
import { DataTable } from "@/components/app/DataTable";
import { boms, componentRequests, materialRequests } from "@/lib/mock-data";
import { Zap, Plus, FileText } from "lucide-react";



function EngineerPage() {
  const totalBOMs = boms.length;
  const totalCRs = componentRequests.length;
  const pendingMRs = materialRequests.filter((mr) => mr.status === "Pending").length;

  return _jsxs(PageShell, {
    children: [
      _jsx(PageHeader, {
        title: "Engineer Module",
        subtitle: "Design drone builds, request components, and manage BOMs.",
      }),
      _jsx("div", {
        className: "grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6",
        children: [
          _jsxs("div", {
            className: "rounded-2xl border border-border bg-card p-5",
            children: [
              _jsxs("div", {
                className: "flex items-start gap-4",
                children: [
                  _jsx("div", {
                    className: "size-12 rounded-xl bg-chart-3/10 flex items-center justify-center",
                    children: _jsx(FileText, { className: "size-6 text-chart-3" }),
                  }),
                  _jsxs("div", {
                    className: "flex-1",
                    children: [
                      _jsx("div", {
                        className: "text-sm text-muted-foreground",
                        children: "BOMs Created",
                      }),
                      _jsx("div", {
                        className: "text-2xl font-bold tracking-tight mt-1",
                        children: totalBOMs,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          _jsxs("div", {
            className: "rounded-2xl border border-border bg-card p-5",
            children: [
              _jsxs("div", {
                className: "flex items-start gap-4",
                children: [
                  _jsx("div", {
                    className: "size-12 rounded-xl bg-info/10 flex items-center justify-center",
                    children: _jsx(Zap, { className: "size-6 text-info" }),
                  }),
                  _jsxs("div", {
                    className: "flex-1",
                    children: [
                      _jsx("div", {
                        className: "text-sm text-muted-foreground",
                        children: "Component Requests",
                      }),
                      _jsx("div", {
                        className: "text-2xl font-bold tracking-tight mt-1",
                        children: totalCRs,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          _jsxs("div", {
            className: "rounded-2xl border border-border bg-card p-5",
            children: [
              _jsxs("div", {
                className: "flex items-start gap-4",
                children: [
                  _jsx("div", {
                    className: "size-12 rounded-xl bg-warning/10 flex items-center justify-center",
                    children: _jsx(Plus, { className: "size-6 text-warning" }),
                  }),
                  _jsxs("div", {
                    className: "flex-1",
                    children: [
                      _jsx("div", {
                        className: "text-sm text-muted-foreground",
                        children: "Pending Requests",
                      }),
                      _jsx("div", {
                        className: "text-2xl font-bold tracking-tight mt-1",
                        children: pendingMRs,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      _jsxs("div", {
        className: "grid grid-cols-1 lg:grid-cols-2 gap-6",
        children: [
          _jsxs("div", {
            className: "rounded-2xl border border-border bg-card p-5",
            children: [
              _jsxs("div", {
                className: "flex items-center justify-between mb-4",
                children: [
                  _jsx("h3", { className: "font-semibold", children: "Bill of Materials" }),
                  _jsxs("button", {
                    className:
                      "inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-medium hover:bg-primary/90",
                    children: [_jsx(Plus, { className: "size-3.5" }), " Create BOM"],
                  }),
                ],
              }),
              _jsx(DataTable, {
                columns: [
                  { key: "code", header: "BOM #", className: "font-mono text-xs" },
                  { key: "project", header: "Project" },
                  { key: "version", header: "Version" },
                  { key: "items", header: "Items" },
                  { key: "createdBy", header: "Created By" },
                ],
                rows: boms,
              }),
            ],
          }),
          _jsxs("div", {
            className: "rounded-2xl border border-border bg-card p-5",
            children: [
              _jsxs("div", {
                className: "flex items-center justify-between mb-4",
                children: [
                  _jsx("h3", { className: "font-semibold", children: "Component Requests" }),
                  _jsxs("button", {
                    className:
                      "inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-medium hover:bg-primary/90",
                    children: [_jsx(Plus, { className: "size-3.5" }), " Request"],
                  }),
                ],
              }),
              _jsx(DataTable, {
                columns: [
                  { key: "code", header: "CR #", className: "font-mono text-xs" },
                  { key: "department", header: "Dept" },
                  { key: "requester", header: "Requester" },
                  { key: "items", header: "Items" },
                  { key: "status", header: "Status" },
                ],
                rows: componentRequests,
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

export default EngineerPage;
