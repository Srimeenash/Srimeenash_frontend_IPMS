import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { DataTable } from "@/components/app/DataTable";
import {
  FormGrid,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/app/FormShell";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  FolderKanban,
  Search,
  Trash2,
  X,
} from "lucide-react";
import config from "@/config";
import { useAuth } from "@/AuthContext";
import { canWork, getUserRole } from "@/permissions";

const PROJECT_TYPE_OPTIONS = ["R&D", "OPS", "SER", "MISC", "U/D"];
const STATUS_OPTIONS = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "ON_HOLD",
  "CANCELLED",
];

const toApiList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

/*
 * Sequential Project ID:
 * PRJ_00001
 * PRJ_00002
 * PRJ_00003
 *
 * We deliberately choose the first free number rather than using Date.now().
 * This also prevents old random PRJ_12345-style IDs from forcing the new
 * sequence to start at a large number.
 */
const getNextProjectCode = (projectRows = []) => {
  const usedNumbers = new Set();

  projectRows.forEach((project) => {
    const code = String(project?.project_code || "").trim();
    const match = code.match(/^PRJ_(\d{5})$/i);

    if (!match) return;

    const sequence = Number(match[1]);

    if (
      Number.isInteger(sequence) &&
      sequence > 0
    ) {
      usedNumbers.add(sequence);
    }
  });

  let nextNumber = 1;

  while (usedNumbers.has(nextNumber)) {
    nextNumber += 1;
  }

  return `PRJ_${String(nextNumber).padStart(5, "0")}`;
};

const getStatusStyle = (status) => {
  const normalized = String(status || "").toUpperCase();

  const styles = {
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
    styles[normalized] ||
    "border-slate-200 bg-slate-100 text-slate-700"
  );
};

const getStatusLabel = (status) =>
  String(status || "N/A")
    .toUpperCase()
    .replaceAll("_", " ");

export default function Page() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Existing Sidebar/routes decide who can SEE Projects.
  // Only Admin + Engineer can CREATE / DELETE / CHANGE Project data.
  // IMPORTANT: this key matches permissions.js exactly: "projects".
  const canManageProjects =
    canWork(user, "projects");
  const canAdministerProjects =
    canManageProjects && getUserRole(user) !== "engineer";

  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const [statusEditor, setStatusEditor] = useState({
    open: false,
    project: null,
    status: "",
    saving: false,
    error: "",
  });

  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);

  const emptyForm = {
    project_code: "",
    project_type: PROJECT_TYPE_OPTIONS[0],
    name: "",
    description: "",
    department: "",
    status: STATUS_OPTIONS[0],
    budget: "0",
    start_date: "",
    end_date: "",
    manager: "",
  };

  const [form, setForm] = useState(emptyForm);

  const loadProjects = async () => {
    setLoading(true);

    try {
      const response = await fetch(
        `${config.baseURL}/projects/projects/?page_size=5000`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch projects (${response.status})`,
        );
      }

      const data = await response.json();
      const rows = toApiList(data);

      setProjects(rows);

      return rows;
    } catch (error) {
      console.error("Project fetch failed:", error);
      setProjects([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleDialogChange = async (value) => {
    if (!canManageProjects) {
      return;
    }

    setOpen(value);

    if (!value) return;

    const latestRows = await loadProjects();

    setForm({
      ...emptyForm,
      project_code: getNextProjectCode(latestRows),
    });
  };

  const handleChange = (event) => {
    if (!canManageProjects) {
      return;
    }

    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canManageProjects) {
      return;
    }

    if (!form.name.trim()) {
      alert("Please enter Project Name.");
      return;
    }

    setCreating(true);

    try {
      /*
       * Refresh immediately before saving so the generated Project ID
       * is based on the latest Project Master records.
       */
      const listResponse = await fetch(
        `${config.baseURL}/projects/projects/?page_size=5000`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      let latestRows = projects;

      if (listResponse.ok) {
        latestRows = toApiList(
          await listResponse.json(),
        );
      }

      const displayedCode =
        String(form.project_code || "").trim();

      const codeAlreadyExists = latestRows.some(
        (project) =>
          String(project?.project_code || "").trim() ===
          displayedCode,
      );

      const projectCode =
        !displayedCode || codeAlreadyExists
          ? getNextProjectCode(latestRows)
          : displayedCode;

      const payload = {
        project_code: projectCode,
        project_type: form.project_type,
        name: form.name.trim(),
        description: form.description.trim(),
        department: form.department.trim(),
        status: form.status,
        budget: Number(form.budget) || 0,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        manager: form.manager.trim(),
        manager_name: form.manager.trim(),
        team: [],
        is_active: true,
      };

      const response = await fetch(
        `${config.baseURL}/projects/projects/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const responseText = await response.text();

      let created = null;

      try {
        created = responseText
          ? JSON.parse(responseText)
          : null;
      } catch {
        created = null;
      }

      if (!response.ok) {
        throw new Error(
          created?.detail ||
            created?.project_code?.[0] ||
            responseText ||
            `Project create failed (${response.status})`,
        );
      }

      setProjects((previous) => [
        created,
        ...previous.filter(
          (row) => row.id !== created.id,
        ),
      ]);

      setOpen(false);
      setForm(emptyForm);

      navigate(
        `/projects/${encodeURIComponent(
          created.project_code || projectCode,
        )}`,
      );
    } catch (error) {
      console.error("Failed to create project:", error);
      alert(
        error?.message ||
          "Failed to create project.",
      );
    } finally {
      setCreating(false);
    }
  };

  const openStatusEditor = (project) => {
    if (!canAdministerProjects) {
      return;
    }

    setStatusEditor({
      open: true,
      project,
      status:
        String(project?.status || "PLANNED")
          .trim()
          .toUpperCase(),
      saving: false,
      error: "",
    });
  };

  const closeStatusEditor = () => {
    if (statusEditor.saving) return;

    setStatusEditor({
      open: false,
      project: null,
      status: "",
      saving: false,
      error: "",
    });
  };

  const saveProjectStatus = async () => {
    if (!canAdministerProjects) {
      return;
    }

    const project = statusEditor.project;
    const nextStatus = String(
      statusEditor.status || "",
    )
      .trim()
      .toUpperCase();

    if (!project?.id) {
      setStatusEditor((previous) => ({
        ...previous,
        error: "Project database ID was not found.",
      }));
      return;
    }

    if (!STATUS_OPTIONS.includes(nextStatus)) {
      setStatusEditor((previous) => ({
        ...previous,
        error: "Please select a valid project status.",
      }));
      return;
    }

    if (
      nextStatus ===
      String(project.status || "")
        .trim()
        .toUpperCase()
    ) {
      closeStatusEditor();
      return;
    }

    setStatusEditor((previous) => ({
      ...previous,
      saving: true,
      error: "",
    }));

    try {
      const response = await fetch(
        `${config.baseURL}/projects/projects/${project.id}/`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
          }),
        },
      );

      const responseText = await response.text();

      let updatedProject = null;

      try {
        updatedProject = responseText
          ? JSON.parse(responseText)
          : null;
      } catch {
        updatedProject = null;
      }

      if (!response.ok) {
        throw new Error(
          updatedProject?.detail ||
            updatedProject?.status?.[0] ||
            responseText ||
            `Unable to update project status (${response.status})`,
        );
      }

      setProjects((previous) =>
        previous.map((row) =>
          row.id === project.id
            ? {
                ...row,
                ...(updatedProject || {}),
                status: nextStatus,
              }
            : row,
        ),
      );

      setStatusEditor({
        open: false,
        project: null,
        status: "",
        saving: false,
        error: "",
      });
    } catch (error) {
      console.error(
        "Failed to update project status:",
        error,
      );

      setStatusEditor((previous) => ({
        ...previous,
        saving: false,
        error:
          error?.message ||
          "Unable to update project status.",
      }));
    }
  };

  const getProjectRowKey = (row) =>
    String(row?.id);

  const handleEnableSelectionMode = () => {
    if (!canAdministerProjects) {
      return;
    }

    setSelectedRowKeys([]);
    setSelectionMode(true);
  };

  const handleCancelSelectionMode = () => {
    setSelectedRowKeys([]);
    setSelectionMode(false);
  };

  const handleDeleteSelected = async () => {
    if (!canAdministerProjects) {
      return;
    }

    if (!selectedRowKeys.length) return;

    const confirmed = window.confirm(
      `Delete ${selectedRowKeys.length} selected project(s)?`,
    );

    if (!confirmed) return;

    try {
      const rowsToDelete = projects.filter(
        (row) =>
          selectedRowKeys.includes(
            getProjectRowKey(row),
          ),
      );

      for (const row of rowsToDelete) {
        const response = await fetch(
          `${config.baseURL}/projects/projects/${row.id}/`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (!response.ok) {
          const text = await response.text();

          throw new Error(
            text || "Unable to delete project.",
          );
        }
      }

      setProjects((previous) =>
        previous.filter(
          (row) =>
            !selectedRowKeys.includes(
              getProjectRowKey(row),
            ),
        ),
      );

      setSelectedRowKeys([]);
      setSelectionMode(false);
    } catch (error) {
      console.error(
        "Failed to delete selected projects:",
        error,
      );

      alert(
        error?.message ||
          "Unable to delete selected projects.",
      );
    }
  };

  const visibleProjects = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    if (!query) return projects;

    return projects.filter((project) =>
      [
        project.project_code,
        project.name,
        project.project_type,
        project.department,
        project.status,
        project.manager,
        project.manager_name,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(query),
        ),
    );
  }, [projects, search]);

  const columns = [
    {
      key: "project_code",
      header: "Project ID",
      className: "w-[11rem] text-center",
      render: (row) => (
        <button
          type="button"
          onClick={() =>
            navigate(
              `/projects/${encodeURIComponent(
                row.project_code,
              )}`,
            )
          }
        className="font-semibold text-[#E85D75] hover:underline dark:text-[#E85D75]"
        >
          {row.project_code}
        </button>
      ),
    },
    {
      key: "name",
      header: "Project Name",
      className: "w-[18rem] text-center",
      render: (row) => (
        <span className="font-semibold text-foreground">
          {row.name || "-"}
        </span>
      ),
    },
    {
      key: "project_type",
      header: "Project Type",
      className: "w-[12rem] text-center",
      render: (row) =>
        row.project_type ||
        row.project_type_display ||
        row.project_type_name ||
        row.project_type_obj?.name ||
        "-",
    },
    {
      key: "department",
      header: "Department",
      className: "w-[13rem] text-center",
      render: (row) =>
        row.department || "-",
    },
    {
      key: "status",
      header: "Status",
      className: "w-[13rem] text-center",
      render: (row) => {
        const normalizedStatus = String(
          row.status || "PLANNED",
        )
          .trim()
          .toUpperCase();

        const badgeContent = (
          <>
            <span
              className={`size-2 rounded-full ${
                normalizedStatus === "COMPLETED"
                  ? "bg-emerald-500"
                  : normalizedStatus === "IN_PROGRESS"
                    ? "bg-blue-500"
                    : normalizedStatus === "ON_HOLD"
                      ? "bg-amber-500"
                      : normalizedStatus === "CANCELLED"
                        ? "bg-red-500"
                        : "bg-slate-400"
              }`}
            />
            {getStatusLabel(normalizedStatus)}
          </>
        );

        if (!canAdministerProjects) {
          return (
            <span
              className={`inline-flex min-w-[122px] items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm ${getStatusStyle(
                normalizedStatus,
              )}`}
              title="Project status"
            >
              {badgeContent}
            </span>
          );
        }

        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openStatusEditor(row);
            }}
            className={`group inline-flex min-w-[122px] items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30 ${getStatusStyle(
              normalizedStatus,
            )}`}
            title="Click to change project status"
          >
            {badgeContent}
            <span className="ml-0.5 text-[10px] opacity-60 transition group-hover:opacity-100">
              ▾
            </span>
          </button>
        );
      },
    },
    {
      key: "budget",
      header: "Budget",
      className: "w-[11rem] text-center",
      render: (row) =>
        `₹${Number(
          row.budget || 0,
        ).toLocaleString("en-IN")}`,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Projects"
        subtitle="Create and manage project masters."
        right={
          canManageProjects ? (
          <div className="flex flex-wrap items-center gap-2">
            {canAdministerProjects && selectionMode ? (
              <>
                <button
                  type="button"
                  onClick={handleCancelSelectionMode}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary"
                >
                  <X className="size-4" />
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={!selectedRowKeys.length}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                  Delete Selected (
                  {selectedRowKeys.length})
                </button>
              </>
            ) : canAdministerProjects ? (
              <button
                type="button"
                onClick={handleEnableSelectionMode}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                <Trash2 className="size-4" />
                Delete
              </button>
            ) : null}

            <Dialog
              open={open}
              onOpenChange={handleDialogChange}
            >
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  <Plus className="size-4" />
                  New Project
                </button>
              </DialogTrigger>

              <DialogContent className="max-w-3xl">
                <form onSubmit={handleSubmit}>
                  <DialogHeader>
                    <DialogTitle>
                      Create New Project
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">
                      Project ID is generated automatically in the PRJ_00001 sequence.
                    </p>
                  </DialogHeader>

                  <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/30">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
                      Next Project ID
                    </div>
                    <div className="mt-1 text-xl font-bold text-blue-950 dark:text-blue-100">
                      {form.project_code ||
                        "Generating..."}
                    </div>
                  </div>

                  <div className="mt-6">
                    <FormGrid>
                      <Field
                        label="Project ID"
                        required
                      >
                        <Input
                          name="project_code"
                          value={form.project_code}
                          readOnly
                        />
                      </Field>

                      <Field
                        label="Project Name"
                        required
                      >
                        <Input
                          name="name"
                          value={form.name}
                          onChange={handleChange}
                          placeholder="Enter project name"
                        />
                      </Field>

                      <Field
                        label="Project Type"
                        required
                      >
                        <Select
                          name="project_type"
                          value={form.project_type}
                          onChange={handleChange}
                          options={
                            PROJECT_TYPE_OPTIONS
                          }
                        />
                      </Field>

                      <Field label="Department">
                        <Input
                          name="department"
                          value={form.department}
                          onChange={handleChange}
                          placeholder="Enter department"
                        />
                      </Field>

                      <Field
                        label="Status"
                        required
                      >
                        <Select
                          name="status"
                          value={form.status}
                          onChange={handleChange}
                          options={STATUS_OPTIONS}
                        />
                      </Field>

                      <Field label="Project Manager">
                        <Input
                          name="manager"
                          value={form.manager}
                          onChange={handleChange}
                          placeholder="Enter manager name"
                        />
                      </Field>

                      <Field label="Start Date">
                        <Input
                          type="date"
                          name="start_date"
                          value={form.start_date}
                          onChange={handleChange}
                        />
                      </Field>

                      <Field label="End Date">
                        <Input
                          type="date"
                          name="end_date"
                          value={form.end_date}
                          onChange={handleChange}
                        />
                      </Field>

                      <Field label="Budget">
                        <Input
                          type="number"
                          min="0"
                          name="budget"
                          value={form.budget}
                          onChange={handleChange}
                        />
                      </Field>

                      <Field label="Description">
                        <Textarea
                          name="description"
                          value={form.description}
                          onChange={handleChange}
                          placeholder="Brief project description"
                        />
                      </Field>
                    </FormGrid>
                  </div>

                  <DialogFooter>
                    <div className="mt-6 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setOpen(false)
                        }
                        className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-secondary"
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        disabled={creating}
                        className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {creating
                          ? "Creating..."
                          : "Create Project"}
                      </button>
                    </div>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          ) : null
        }
      />

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <FolderKanban className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Total Projects
              </p>
              <p className="mt-1 text-2xl font-bold">
                {projects.length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            In Progress
          </p>
          <p className="mt-2 text-2xl font-bold">
            {
              projects.filter(
                (project) =>
                  String(project.status)
                    .toUpperCase() ===
                  "IN_PROGRESS",
              ).length
            }
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Completed
          </p>
          <p className="mt-2 text-2xl font-bold">
            {
              projects.filter(
                (project) =>
                  String(project.status)
                    .toUpperCase() ===
                  "COMPLETED",
              ).length
            }
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
        <Search className="size-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          placeholder="Search project ID, name, department, manager or status..."
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {canAdministerProjects && (
      <Dialog
        open={statusEditor.open}
        onOpenChange={(value) => {
          if (!value) {
            closeStatusEditor();
          }
        }}
      >
        <DialogContent className="max-w-md overflow-hidden p-0">
          <div className="border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-5">
            <DialogHeader>
              <DialogTitle className="text-xl">
                Update Project Status
              </DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Change the current workflow status for this project.
              </p>
            </DialogHeader>
          </div>

          <div className="px-6 py-5">
            {statusEditor.project && (
              <div className="mb-5 rounded-2xl border border-border bg-muted/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Selected Project
                </div>

                <div className="mt-2 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-foreground">
                      {statusEditor.project.name || "Unnamed Project"}
                    </div>
                    <div className="mt-1 font-mono text-xs font-medium text-muted-foreground">
                      {statusEditor.project.project_code || "-"}
                    </div>
                  </div>

                  <span
                    className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getStatusStyle(
                      statusEditor.project.status,
                    )}`}
                  >
                    {getStatusLabel(
                      statusEditor.project.status,
                    )}
                  </span>
                </div>
              </div>
            )}

            <Field label="New Status" required>
              <Select
                name="project_status"
                value={statusEditor.status}
                onChange={(event) =>
                  setStatusEditor((previous) => ({
                    ...previous,
                    status: event.target.value,
                    error: "",
                  }))
                }
                options={STATUS_OPTIONS}
              />
            </Field>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() =>
                    setStatusEditor((previous) => ({
                      ...previous,
                      status,
                      error: "",
                    }))
                  }
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${
                    statusEditor.status === status
                      ? `${getStatusStyle(
                          status,
                        )} ring-2 ring-primary/15`
                      : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <span>
                    {getStatusLabel(status)}
                  </span>

                  {statusEditor.status === status && (
                    <span className="text-primary">
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>

            {statusEditor.error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {statusEditor.error}
              </div>
            )}
          </div>

          <DialogFooter>
            <div className="flex w-full justify-end gap-2 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={closeStatusEditor}
                disabled={statusEditor.saving}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveProjectStatus}
                disabled={statusEditor.saving}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {statusEditor.saving
                  ? "Updating..."
                  : "Update Status"}
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <DataTable
            enableColumnTools
columns={columns}
          rows={visibleProjects}
          loading={loading}
          selectable={canAdministerProjects && selectionMode}
          selectedRowKeys={selectedRowKeys}
          onSelectedRowKeysChange={setSelectedRowKeys}
          selectionKey="id"
          keyField="id"
        />
      </div>
    </PageShell>
  );
}