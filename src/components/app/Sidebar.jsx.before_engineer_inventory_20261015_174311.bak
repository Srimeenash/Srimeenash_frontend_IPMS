// src/components/Sidebar.jsx

import { Link, useLocation } from "react-router-dom";

import {
  LayoutDashboard,
  Boxes,
  Users,
  FileText,
  ClipboardCheck,
  ShoppingCart,
  TrendingUp,
  Wrench,
  Briefcase,
  Package,
  Truck,
  Shield,
  Trash2,
  Bell,
} from "lucide-react";

import { useState } from "react";
import { cn } from "../../lib/utils.js";
import { useAuth } from "../../AuthContext";

export function Sidebar() {
  const location = useLocation();

  const [isExpanded, setIsExpanded] =
    useState(false);

  const {
    user,
    activeRole,
  } = useAuth();

  const role = String(
    activeRole ||
      user?.active_role ||
      user?.role?.name ||
      user?.role ||
      "guest",
  )
    .trim()
    .toLowerCase();

  const navGroups = [
    // =========================================================
    // MAIN
    // =========================================================
    {
      label: "MAIN",

      items: [
        {
          to: "/dashboard",
          label: "Dashboard",
          icon: LayoutDashboard,

          // ORIGINAL ACCESS + MANAGEMENT
          roles: [
            "admin",
            "manager",
            "procurement",
            "finance",
            "inventory",
            "management",
          ],
        },

        {
          to: "/roles",
          label: "Roles",
          icon: Shield,

          // ADMIN ONLY - UNCHANGED
          roles: [
            "admin",
          ],
        },

        // =====================================================
        // NEW MANAGEMENT NOTIFICATION PAGE
        // =====================================================
        {
          to: "/management-notifications",
          label: "Sales Approvals",
          icon: Bell,

          roles: [
            "management",
          ],
        },
      ],
    },

    // =========================================================
    // OPERATIONS
    // =========================================================
    {
      label: "OPERATIONS",

      items: [
        // -----------------------------------------------------
        // MANAGEMENT VIEW LINKS
        // Management can review Procurement and Components but cannot work
        // in either module.
        // -----------------------------------------------------
        {
          to: "/procurement",
          label: "Procurement",
          icon: ShoppingCart,
          roles: ["management"],
        },
        {
          to: "/component-requests",
          label: "Components",
          icon: Boxes,
          roles: ["management"],
        },

        // -----------------------------------------------------
        // INVENTORY
        // OLD ACCESS - UNCHANGED
        // -----------------------------------------------------
        {
          to: "/inventory",
          label: "Inventory",
          icon: Boxes,

          roles: [
            "admin",
            "manager",
            "procurement",
            "finance",
            "inventory",
            "management",
          ],
        },

        // -----------------------------------------------------
        // FINANCE
        // OLD ACCESS - UNCHANGED
        // -----------------------------------------------------
        {
          to: "/finance",
          label: "Finance",
          icon: TrendingUp,

          roles: [
            "admin",
            "manager",
            "management",
          ],
        },

        // -----------------------------------------------------
        // VENDORS
        // OLD ACCESS - UNCHANGED
        // -----------------------------------------------------
        {
          to: "/vendors",
          label: "Vendors",
          icon: Users,

          roles: [
            "admin",
            "manager",
            "procurement",
            "finance",
            "management",
          ],
        },

        // -----------------------------------------------------
        // BOM
        // OLD ACCESS - UNCHANGED
        // -----------------------------------------------------
        {
          to: "/bom",
          label: "BOM",
          icon: FileText,

          roles: [
            "admin",
            "manager",
            "engineer",
            "management",
          ],
        },

        // -----------------------------------------------------
        // MATERIAL REQUEST
        // OLD ACCESS - UNCHANGED
        // -----------------------------------------------------
        {
          to: "/material-requests",
          label: "Material Request",
          icon: ClipboardCheck,

          roles: [
            "admin",
            "manager",
            "inventory",
            "engineer",
            "management",
          ],
        },

        // -----------------------------------------------------
        // PURCHASE ORDER
        // OLD ACCESS - UNCHANGED
        // -----------------------------------------------------
        {
          to: "/purchase-orders",
          label: "Purchase Order",
          icon: ShoppingCart,

          roles: [
            "admin",
            "manager",
            "procurement",
            "finance",
            "inventory",
            "management",
          ],
        },

        // -----------------------------------------------------
        // INWARD
        // OLD ACCESS - UNCHANGED
        // -----------------------------------------------------
        {
          to: "/inward",
          label: "Inward",
          icon: Package,

          roles: [
            "admin",
            "manager",
            "procurement",
            "finance",
            "inventory",
            "management",
          ],
        },

        // -----------------------------------------------------
        // OUTWARD
        //
        // OLD ACCESS PRESERVED.
        // MANAGEMENT ADDED because Management must be able to
        // see Sales after approving it.
        // -----------------------------------------------------
        {
          to: "/outward",
          label: "Outward",
          icon: Truck,

          roles: [
            "admin",
            "manager",
            "procurement",
            "finance",
            "inventory",

            // NEW
            "management",
          ],
        },

        // -----------------------------------------------------
        // RETURNABLE
        // OLD ACCESS - UNCHANGED
        // -----------------------------------------------------
        {
          // Keep existing route.
          to: "/component-usage",
          label: "Returnable",
          icon: Wrench,

          roles: [
            "admin",
            "manager",
            "procurement",
            "inventory",
            "engineer",
            "management",
          ],
        },

        // -----------------------------------------------------
        // PROJECTS
        // OLD ACCESS - UNCHANGED
        // -----------------------------------------------------
        {
          to: "/projects",
          label: "Projects",
          icon: Briefcase,

          roles: [
            "admin",
            "manager",
            "engineer",
            "management",
          ],
        },

        // -----------------------------------------------------
        // SCRAP
        // OLD ACCESS - UNCHANGED
        // -----------------------------------------------------
        {
          to: "/scrap",
          label: "Scrap",
          icon: Trash2,

          roles: [
            "engineer",
            "management",
          ],
        },
      ],
    },
  ];

  return (
    <aside
      onMouseEnter={() =>
        setIsExpanded(true)
      }
      onMouseLeave={() =>
        setIsExpanded(false)
      }
      className={cn(
        "hidden md:sticky md:top-0 md:self-start md:h-screen md:flex shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200 ease-out overflow-hidden",
        isExpanded
          ? "w-64"
          : "w-16",
      )}
    >
      {/* =====================================================
          LOGO
      ====================================================== */}
      <div
        className={cn(
          "flex items-center gap-3 border-b border-sidebar-border transition-all duration-200",
          isExpanded
            ? "px-5 py-5"
            : "justify-center px-0 py-4",
        )}
      >
        <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="size-6 text-primary"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {/* Premium quadcopter drone icon */}

            {/* Propellers */}
            <ellipse cx="5" cy="5.5" rx="3.2" ry="1.25" />
            <ellipse cx="19" cy="5.5" rx="3.2" ry="1.25" />
            <ellipse cx="5" cy="18.5" rx="3.2" ry="1.25" />
            <ellipse cx="19" cy="18.5" rx="3.2" ry="1.25" />

            {/* Rotor hubs */}
            <circle cx="5" cy="5.5" r="0.7" />
            <circle cx="19" cy="5.5" r="0.7" />
            <circle cx="5" cy="18.5" r="0.7" />
            <circle cx="19" cy="18.5" r="0.7" />

            {/* Drone arms */}
            <path d="M7.2 7.2 9.7 9.6" />
            <path d="M16.8 7.2 14.3 9.6" />
            <path d="M7.2 16.8 9.7 14.4" />
            <path d="M16.8 16.8 14.3 14.4" />

            {/* Main drone body */}
            <path d="M10 9.5h4l1.6 2.5-1.6 2.5h-4L8.4 12 10 9.5Z" />

            {/* Camera / sensor */}
            <circle cx="12" cy="12" r="1.05" />
            <path d="M11.2 14.5 10.7 16M12.8 14.5l.5 1.5" />
          </svg>
        </div>

        <div
          className={cn(
            "leading-tight overflow-hidden transition-all duration-200",
            isExpanded
              ? "opacity-100 max-w-full"
              : "opacity-0 max-w-0",
          )}
        >
          <div className="text-base font-semibold tracking-tight text-sidebar-foreground dark:text-white">
            IPMS
          </div>

          <div className="text-[10px] text-sidebar-muted">
            Inventory & Procurement
            <br />
            Management System
          </div>
        </div>
      </div>

      {/* =====================================================
          NAVIGATION
      ====================================================== */}
      <nav className="flex-1 overflow-y-auto">
        {navGroups.map((group) => {
          const visibleItems =
            group.items.filter(
              (item) =>
                item.roles.includes(
                  role,
                ),
            );

          if (!visibleItems.length) {
            return null;
          }

          return (
            <div key={group.label}>
              <div
                className={cn(
                  "px-5 pt-5 pb-2 text-[11px] font-semibold tracking-widest text-sidebar-muted transition-all duration-200",
                  isExpanded
                    ? "block"
                    : "hidden",
                )}
              >
                {group.label}
              </div>

              <div className="px-3 space-y-1">
                {visibleItems.map(
                  (item) => {
                    const active =
                      location.pathname ===
                        item.to ||
                      location.pathname.startsWith(
                        `${item.to}/`,
                      );

                    const Icon =
                      item.icon;

                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        title={
                          !isExpanded
                            ? item.label
                            : undefined
                        }
                        className={cn(
                          "flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-all duration-200",
                          isExpanded
                            ? "px-3 justify-start"
                            : "justify-center px-0",
                          active
                            ? "bg-sidebar-active text-sidebar-active-foreground shadow-sm"
                            : "text-sidebar-foreground hover:bg-primary/30",
                        )}
                      >
                        <Icon className="size-[18px] shrink-0" />

                        <span
                          className={cn(
                            "overflow-hidden whitespace-nowrap transition-all duration-200",
                            isExpanded
                              ? "max-w-full opacity-100"
                              : "max-w-0 opacity-0",
                          )}
                        >
                          {item.label}
                        </span>
                      </Link>
                    );
                  },
                )}
              </div>
            </div>
          );
        })}
      </nav>

      {/* =====================================================
          FOOTER
      ====================================================== */}
      <div
        className={cn(
          "p-4 text-[11px] text-sidebar-muted border-t border-sidebar-border transition-all duration-200",
          isExpanded
            ? "block"
            : "hidden",
        )}
      >
        <div className="mb-2">
          <div className="text-[9px] uppercase tracking-wider">
            Current Login
          </div>

          <div className="mt-1 capitalize text-sidebar-foreground">
            {role}
          </div>
        </div>

        v1.1 · © 2026 IPMS
      </div>
    </aside>
  );
}