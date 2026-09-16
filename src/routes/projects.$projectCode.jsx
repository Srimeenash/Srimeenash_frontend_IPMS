import { useEffect, useState } from "react";
import {
  Link,
  useParams,
} from "react-router-dom";
import {
  ArrowLeft,
  BadgeIndianRupee,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  FileText,
  Hash,
  UserRound,
} from "lucide-react";
import {
  PageShell,
  PageHeader,
} from "@/components/app/PageShell";
import config from "@/config";
import { useAuth } from "@/AuthContext";
import { canViewCosting } from "@/permissions";

const toApiList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString(
    "en-IN",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  );

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  );
};

const getManagerValue = (project) =>
  project?.manager_name ||
  project?.manager ||
  project?.managerName ||
  project?.assigned_manager ||
  project?.lead_name ||
  "—";

const getStatusBadgeClass = (status) => {
  const normalized = String(status || "")
    .trim()
    .toUpperCase();

  const classes = {
    PLANNED:
      "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    IN_PROGRESS:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
    COMPLETED:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
    ON_HOLD:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
    CANCELLED:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  };

  return (
    classes[normalized] ||
    classes.PLANNED
  );
};

function DetailCard({
  icon: Icon,
  label,
  value,
}) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="size-4" />
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>

          <p className="mt-1 truncate text-sm font-semibold text-foreground" title={String(value || "—")}>
            {value || "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const { projectCode } = useParams();
  const { user, activeRole } = useAuth();

  const canSeeCosting =
    canViewCosting(
      user,
      activeRole,
    );

  const [project, setProject] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    async function loadProject() {
      setLoading(true);
      setError("");

      try {
        /*
         * Load Project Master and select the exact project code.
         * This avoids depending on optional backend filter support.
         */
        const response = await fetch(
          `${config.baseURL}/projects/projects/?page_size=5000`,
          {
            headers: {
              "Content-Type":
                "application/json",
            },
          },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to load project (${response.status})`,
          );
        }

        const rows = toApiList(
          await response.json(),
        );

        const match = rows.find(
          (row) =>
            String(
              row?.project_code || "",
            ).trim() ===
            String(
              projectCode || "",
            ).trim(),
        );

        if (!match) {
          throw new Error(
            `No project exists for ${projectCode}.`,
          );
        }

        setProject(match);
      } catch (loadError) {
        console.error(
          "Project detail load failed:",
          loadError,
        );

        setProject(null);
        setError(
          loadError?.message ||
            "Unable to load project.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadProject();
  }, [projectCode]);

  if (loading) {
    return (
      <PageShell>
        <PageHeader
          title="Project Details"
          subtitle={`Loading ${projectCode}...`}
          left={
            <Link
              to="/projects"
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              <ArrowLeft className="size-4" />
              Back to Projects
            </Link>
          }
        />

        <div className="rounded-3xl border border-border bg-card p-12 text-center text-muted-foreground shadow-sm">
          Loading project details...
        </div>
      </PageShell>
    );
  }

  if (!project) {
    return (
      <PageShell>
        <PageHeader
          title="Project Details"
          subtitle="Project could not be loaded."
          left={
            <Link
              to="/projects"
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              <ArrowLeft className="size-4" />
              Back to Projects
            </Link>
          }
        />

        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-red-700">
          {error ||
            "Project not found."}
        </div>
      </PageShell>
    );
  }

  const status = String(
    project.status || "PLANNED",
  )
    .trim()
    .toUpperCase();

  return (
    <PageShell>
      <PageHeader
        title="Project Details"
        subtitle="Project master overview."
        left={
          <Link
            to="/projects"
            className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
          >
            <ArrowLeft className="size-4" />
            Back to Projects
          </Link>
        }
      />

      <div className="space-y-4">
        {/* Compact Project Master */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  Project Master
                </p>

                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    {project.name || "Unnamed Project"}
                  </h1>

                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(
                      status,
                    )}`}
                  >
                    {status.replaceAll("_", " ")}
                  </span>
                </div>

                <div className="mt-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs font-semibold">
                    <Hash className="size-3.5 text-primary" />
                    {project.project_code}
                  </span>
                </div>
              </div>

              <div className="min-w-[150px] rounded-xl border border-border bg-background/80 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Project Type
                </p>
                <p className="mt-1 text-base font-bold">
                  {project.project_type ||
                    project.project_type_display ||
                    "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DetailCard
                icon={Building2}
                label="Department"
                value={project.department || "—"}
              />

              <DetailCard
                icon={UserRound}
                label="Project Manager"
                value={getManagerValue(project)}
              />

              <DetailCard
                icon={CalendarDays}
                label="Start Date"
                value={formatDate(project.start_date)}
              />

              <DetailCard
                icon={CalendarDays}
                label="End Date"
                value={formatDate(project.end_date)}
              />
            </div>
          </div>
        </section>

        {/* Compact lower content */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <FileText className="size-4" />
              </div>

              <div>
                <h2 className="text-base font-semibold">
                  Project Description
                </h2>
                <p className="text-xs text-muted-foreground">
                  Scope and project information.
                </p>
              </div>
            </div>

            <div className="mt-3 min-h-[72px] max-h-[110px] overflow-y-auto rounded-xl border border-border bg-background px-4 py-3">
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {project.description ||
                  "No description has been added for this project."}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <BadgeIndianRupee className="size-4" />
              </div>

              <div>
                <h2 className="text-base font-semibold">
                  Project Summary
                </h2>
                <p className="text-xs text-muted-foreground">
                  {canSeeCosting
                    ? "Budget and record details."
                    : "Project record details."}
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-3">
              {canSeeCosting && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                      Budget
                    </p>

                    <p className="text-xl font-bold text-emerald-950 dark:text-emerald-100">
                      ₹{formatCurrency(project.budget)}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-background px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <BriefcaseBusiness className="size-4 text-primary" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Type
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold">
                        {project.project_type ||
                          project.project_type_display ||
                          "—"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-primary" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Created
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold">
                        {formatDate(project.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  );
}