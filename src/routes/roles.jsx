import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
  ArrowUpDown,
} from "lucide-react";

import { useAuth } from "@/AuthContext";
import {
  PageHeader,
  PageShell,
} from "@/components/app/PageShell";
import {
  fetchAuthenticatedJson,
} from "@/api";

const ROLE_OPTIONS = [
  {
    value: "admin",
    label: "Admin",
  },
  {
    value: "manager",
    label: "Manager",
  },
  {
    value: "management",
    label: "Management",
  },
  {
    value: "procurement",
    label: "Procurement",
  },
  {
    value: "inventory",
    label: "Inventory",
  },
  {
    value: "engineer",
    label: "Engineer",
  },
  {
    value: "finance",
    label: "Finance",
  },
];
  const USERS_PAGE_SIZE = 50;

const EMPTY_FORM = {
  employee_name: "",
  email: "",
  password: "",
  confirm_password: "",
  role: "engineer",
  additional_roles: [],
  designation: "",
  is_active: true,
  profile_image: null,
};

const formatRole = (role) =>
  ROLE_OPTIONS.find(
    (option) =>
      option.value ===
      String(role || "").toLowerCase(),
  )?.label ||
  role ||
  "-";

const getProfileImage = (user) =>
  user?.profile_image ||
  user?.profileImage ||
  "";

function RolesPage() {
  const {
    user: loggedInUser,
    activeRole,
    updateUser,
  } = useAuth();

  const currentRole = String(
    activeRole ||
      loggedInUser?.active_role ||
      loggedInUser?.role ||
      "",
  )
    .trim()
    .toLowerCase();

  const isAdmin =
    currentRole === "admin" ||
    loggedInUser?.is_superuser === true;

  const [users, setUsers] = useState([]);
    const [usersPage, setUsersPage] = useState(1);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState("");
  const [notice, setNotice] =
    useState("");
  const [searchTerm, setSearchTerm] =
    useState("");
  const [roleFilter, setRoleFilter] =
    useState("all");
  const [userSort, setUserSort] = useState({ key: "", direction: "" });
  const [busy, setBusy] =
    useState(false);
  const [
    confirmAction,
    setConfirmAction,
  ] = useState(null);

  const [addUserOpen, setAddUserOpen] =
    useState(false);
  const [showPassword, setShowPassword] =
    useState(false);
  const [form, setForm] =
    useState(EMPTY_FORM);
  const [imagePreview, setImagePreview] =
    useState("");

  const [
    viewedUserImage,
    setViewedUserImage,
  ] = useState(null);

  const [
    accessEditor,
    setAccessEditor,
  ] = useState(null);

  const showMessage = (message) => {
    setNotice(message);

    window.clearTimeout(
      showMessage.timer,
    );

    showMessage.timer =
      window.setTimeout(
        () => setNotice(""),
        3000,
      );
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError("");

      const payload = await fetchAuthenticatedJson(
        "/auth/users/",
      );

      const rows = Array.isArray(payload)
        ? payload
        : payload?.results || [];

      setUsers(
        rows.map((item) => ({
          ...item,
          id:
            item.id ??
            item.user_id,
          name:
            item.employee_name ||
            item.name ||
            item.email ||
            "User",
          client_type: String(
            item.role || "",
          ).toLowerCase(),
          additional_roles:
            Array.isArray(
              item.additional_roles,
            )
              ? item.additional_roles
                  .map((role) =>
                    String(role || "")
                      .trim()
                      .toLowerCase(),
                  )
                  .filter(Boolean)
              : [],
          roles:
            Array.isArray(item.roles)
              ? item.roles
              : [],
          is_active:
            typeof item.is_active ===
            "boolean"
              ? item.is_active
              : true,
        })),
      );
    } catch (requestError) {
      console.error(requestError);
      setError(
        requestError?.message ||
          "Failed to load users.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    if (!viewedUserImage) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setViewedUserImage(null);
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [viewedUserImage]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm
      .trim()
      .toLowerCase();

    return users.filter((item) => {
      const matchesSearch =
        !term ||
        String(item.name || "")
          .toLowerCase()
          .includes(term) ||
        String(item.email || "")
          .toLowerCase()
          .includes(term) ||
        String(
          item.designation || "",
        )
          .toLowerCase()
          .includes(term);

      const matchesRole =
        roleFilter === "all" ||
        String(
          item.client_type || "",
        ).toLowerCase() === roleFilter;

      return (
        matchesSearch &&
        matchesRole
      );
    });
  }, [
    users,
    searchTerm,
    roleFilter,
  ]);

  const sortedUsers = useMemo(() => {
    if (!userSort.key || !userSort.direction) {
      return filteredUsers;
    }

    const getSortValue = (item) => {
      if (userSort.key === "additional_roles") {
        return (item.additional_roles || []).join(", ");
      }

      if (userSort.key === "is_active") {
        return item.is_active ? "Active" : "Inactive";
      }

      return item[userSort.key] || "";
    };

    return [...filteredUsers].sort((left, right) => {
      const comparison = String(getSortValue(left)).localeCompare(
        String(getSortValue(right)),
        undefined,
        { numeric: true, sensitivity: "base" },
      );

      return userSort.direction === "asc"
        ? comparison
        : -comparison;
    });
  }, [filteredUsers, userSort]);

  const usersPageCount = Math.max(
    1,
    Math.ceil(
      sortedUsers.length / USERS_PAGE_SIZE,
    ),
  );

  const paginatedUsers = useMemo(() => {
    const startIndex =
      (usersPage - 1) * USERS_PAGE_SIZE;

    return sortedUsers.slice(
      startIndex,
      startIndex + USERS_PAGE_SIZE,
    );
  }, [sortedUsers, usersPage]);

  const toggleUserSort = (key) => {
    setUserSort((previous) => ({
      key,
      direction:
        previous.key === key && previous.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  useEffect(() => {
    setUsersPage(1);
  }, [searchTerm, roleFilter]);

  useEffect(() => {
    setUsersPage((currentPage) =>
      Math.min(currentPage, usersPageCount),
    );
  }, [usersPageCount]);

  const closeAddUser = () => {
    if (busy) return;

    setAddUserOpen(false);
    setForm(EMPTY_FORM);
    setImagePreview("");
    setShowPassword(false);
  };

  const updateForm = (
    field,
    value,
  ) => {
    setError("");

    setForm((previous) => {
      if (field === "role") {
        const nextRole = String(
          value || "",
        )
          .trim()
          .toLowerCase();

        return {
          ...previous,
          role: nextRole,
          additional_roles:
            nextRole === "engineer"
              ? []
              : (
                  previous
                    .additional_roles ||
                  []
                ).filter(
                  (role) =>
                    role !==
                      nextRole &&
                    role !==
                      "engineer",
                ),
        };
      }

      return {
        ...previous,
        [field]: value,
      };
    });
  };


  const toggleFormAdditionalRole = (
    role,
  ) => {
    const normalizedRole = String(
      role || "",
    )
      .trim()
      .toLowerCase();

    if (
      !normalizedRole ||
      normalizedRole ===
        "engineer" ||
      normalizedRole ===
        form.role ||
      form.role ===
        "engineer"
    ) {
      return;
    }

    setForm((previous) => {
      const current =
        Array.isArray(
          previous.additional_roles,
        )
          ? previous.additional_roles
          : [];

      const exists =
        current.includes(
          normalizedRole,
        );

      return {
        ...previous,
        additional_roles:
          exists
            ? current.filter(
                (item) =>
                  item !==
                  normalizedRole,
              )
            : [
                ...current,
                normalizedRole,
              ],
      };
    });
  };

  const handleImageChange = (
    event,
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError(
        "Profile image must be 5 MB or smaller.",
      );
      event.target.value = "";
      return;
    }

    updateForm(
      "profile_image",
      file,
    );

    const reader = new FileReader();

    reader.onload = () => {
      setImagePreview(
        String(reader.result || ""),
      );
    };

    reader.readAsDataURL(file);
  };

  const validateCreateForm = () => {
    if (!form.employee_name.trim()) {
      return "Employee name is required.";
    }

    if (!form.email.trim()) {
      return "Email is required.";
    }

    if (form.password.length < 4) {
      return (
        "Password must contain at least " +
        "4 characters."
      );
    }

    if (
      form.password !==
      form.confirm_password
    ) {
      return "Passwords do not match.";
    }

    if (!form.role) {
      return "Role is required.";
    }

    if (
      form.role === "engineer" &&
      form.additional_roles.length > 0
    ) {
      return (
        "Engineer users cannot have " +
        "additional role access."
      );
    }

    if (
      form.additional_roles.includes(
        "engineer",
      )
    ) {
      return (
        "Engineer cannot be assigned " +
        "as an additional role."
      );
    }

    return "";
  };

  const handleCreateUser = async (
    event,
  ) => {
    event.preventDefault();

    const validationError =
      validateCreateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setBusy(true);
      setError("");

      const formData = new FormData();

      formData.append(
        "employee_name",
        form.employee_name.trim(),
      );
      formData.append(
        "email",
        form.email.trim().toLowerCase(),
      );
      formData.append(
        "password",
        form.password,
      );
      formData.append(
        "role",
        form.role,
      );
      formData.append(
        "additional_roles",
        JSON.stringify(
          form.additional_roles || [],
        ),
      );
      formData.append(
        "designation",
        form.designation.trim(),
      );
      formData.append(
        "is_active",
        String(form.is_active),
      );

      if (form.profile_image) {
        formData.append(
          "profile_image",
          form.profile_image,
        );
      }

      await fetchAuthenticatedJson(
        "/auth/users/",
        {
          method: "POST",
          body: formData,
        },
      );

      closeAddUser();
      await loadUsers();
      showMessage(
        "User created successfully.",
      );
    } catch (requestError) {
      console.error(requestError);
      setError(
        requestError?.message ||
          "Failed to create user.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRoleUpdate = async (
    selectedUser,
    role,
  ) => {
    try {
      setBusy(true);

      const normalizedRole =
        String(role || "")
          .trim()
          .toLowerCase();

      const currentAdditionalRoles =
        Array.isArray(
          selectedUser
            .additional_roles,
        )
          ? selectedUser
              .additional_roles
          : [];

      const nextAdditionalRoles =
        normalizedRole ===
        "engineer"
          ? []
          : currentAdditionalRoles.filter(
              (item) =>
                item !==
                  normalizedRole &&
                item !==
                  "engineer",
            );

      const updatedUser = await fetchAuthenticatedJson(
        `/auth/users/${selectedUser.id}/`,
        {
          method: "PATCH",
          body: JSON.stringify({
            role:
              normalizedRole,

            additional_roles:
              nextAdditionalRoles,
          }),
        },
      );

      if (
        String(updatedUser?.id) ===
        String(loggedInUser?.id)
      ) {
        updateUser(updatedUser);
      }

      await loadUsers();

      showMessage(
        "Primary role updated successfully.",
      );
    } catch (requestError) {
      console.error(
        requestError,
      );

      setError(
        requestError?.message ||
          "Failed to update role.",
      );
    } finally {
      setBusy(false);
    }
  };


  const handleAdditionalRolesUpdate =
    async () => {
      if (!accessEditor?.user) {
        return;
      }

      const selectedUser =
        accessEditor.user;

      const primaryRole =
        String(
          selectedUser.role ||
            selectedUser.client_type ||
            "",
        )
          .trim()
          .toLowerCase();

      const nextRoles =
        primaryRole === "engineer"
          ? []
          : (
              accessEditor.roles ||
              []
            )
              .map((role) =>
                String(role || "")
                  .trim()
                  .toLowerCase(),
              )
              .filter(
                (role, index, list) =>
                  role &&
                  role !==
                    primaryRole &&
                  role !==
                    "engineer" &&
                  list.indexOf(role) ===
                    index,
              );

      try {
        setBusy(true);
        setError("");

        const updatedUser = await fetchAuthenticatedJson(
          `/auth/users/${selectedUser.id}/`,
          {
            method: "PATCH",
            body: JSON.stringify({
              additional_roles:
                nextRoles,
            }),
          },
        );

        if (
          String(updatedUser?.id) ===
          String(loggedInUser?.id)
        ) {
          updateUser(updatedUser);
        }

        setAccessEditor(null);
        await loadUsers();

        showMessage(
          "Additional role access updated successfully.",
        );
      } catch (requestError) {
        console.error(
          requestError,
        );

        setError(
          requestError?.message ||
            "Failed to update additional role access.",
        );
      } finally {
        setBusy(false);
      }
    };


  const toggleAccessEditorRole = (
    role,
  ) => {
    const normalizedRole =
      String(role || "")
        .trim()
        .toLowerCase();

    setAccessEditor(
      (previous) => {
        if (!previous) {
          return previous;
        }

        const primaryRole =
          String(
            previous.user?.role ||
              previous.user
                ?.client_type ||
              "",
          )
            .trim()
            .toLowerCase();

        if (
          !normalizedRole ||
          normalizedRole ===
            primaryRole ||
          normalizedRole ===
            "engineer" ||
          primaryRole ===
            "engineer"
        ) {
          return previous;
        }

        const current =
          Array.isArray(
            previous.roles,
          )
            ? previous.roles
            : [];

        const exists =
          current.includes(
            normalizedRole,
          );

        return {
          ...previous,
          roles:
            exists
              ? current.filter(
                  (item) =>
                    item !==
                    normalizedRole,
                )
              : [
                  ...current,
                  normalizedRole,
                ],
        };
      },
    );
  };

  const handleToggleStatus = async (
    selectedUser,
  ) => {
    try {
      setBusy(true);

      await fetchAuthenticatedJson(
        `/auth/users/${selectedUser.id}/`,
        {
          method: "PATCH",
          body: JSON.stringify({
            is_active:
              !selectedUser.is_active,
          }),
        },
      );

      await loadUsers();

      showMessage(
        selectedUser.is_active
          ? "User deactivated."
          : "User activated.",
      );
    } catch (requestError) {
      console.error(requestError);
      setError(
        requestError?.message ||
          "Failed to update status.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteUser = async (
    selectedUser,
  ) => {
    try {
      setBusy(true);

      await fetchAuthenticatedJson(
        `/auth/users/${selectedUser.id}/`,
        {
          method: "DELETE",
        },
      );

      await loadUsers();
      showMessage(
        "User deleted successfully.",
      );
    } catch (requestError) {
      console.error(requestError);
      setError(
        requestError?.message ||
          "Failed to delete user.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmAction =
    async () => {
      if (!confirmAction) return;

      const action = confirmAction;
      setConfirmAction(null);

      if (action.type === "role") {
        await handleRoleUpdate(
          action.user,
          action.role,
        );
      }

      if (action.type === "status") {
        await handleToggleStatus(
          action.user,
        );
      }

      if (action.type === "delete") {
        await handleDeleteUser(
          action.user,
        );
      }
    };

  return (
    <PageShell>
      <div className="space-y-6">
        <PageHeader
          title="Roles"
          subtitle="Admin user management, access control, and IPMS account creation."
        />

        <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
<div className="flex w-full max-w-sm items-center gap-2 rounded-lg border border-border px-3 py-2">
  <Search className="size-4 shrink-0 text-muted-foreground" />

  <input
    value={searchTerm}
    onChange={(event) =>
      setSearchTerm(event.target.value)
    }
    placeholder="Search name, email, or designation"
    className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
  />
</div>

              <select
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(
                    event.target.value,
                  )
                }
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="all">
                  All roles
                </option>

                {ROLE_OPTIONS.map(
                  (option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ),
                )}
              </select>
            </div>

            {isAdmin ? (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setAddUserOpen(true);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
              >
                <Plus className="size-4" />
                Add User
              </button>
            ) : null}
          </div>

          {notice ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {notice}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-6 flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No users found.
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full table-fixed divide-y divide-border text-sm">
                <thead>
                  <tr className="text-center text-muted-foreground">
                    {[
                      ["name", "User", "w-[24%] px-6 py-3 text-left"],
                      ["email", "Email", "w-[25%] px-3 py-3"],
                      ["client_type", "Primary Role", "w-[16%] px-3 py-3"],
                      ["additional_roles", "Additional Access", "w-[20%] px-3 py-3"],
                      ["is_active", "Status", "w-[12%] px-3 py-3"],
                    ].map(([key, label, width]) => (
                      <th key={key} className={`${width} font-medium`}>
                        <button
                          type="button"
                          onClick={() => toggleUserSort(key)}
                          className="inline-flex items-center gap-1.5"
                        >
                          {label}
                          <ArrowUpDown className="size-3.5" />
                        </button>
                      </th>
                    ))}
                    <th className="w-[14%] px-3 py-3 font-medium">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {paginatedUsers.map(
                    (item) => {
                      const image =
                        getProfileImage(
                          item,
                        );

                      return (
                        <tr
                          key={item.id}
                          className="transition-colors hover:bg-muted/30"
                        >
                          <td className="px-6 py-3.5">
                            <div className="flex min-w-0 items-center gap-3">
                              {image ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewedUserImage(
                                      {
                                        src: image,
                                        name:
                                          item.name,
                                        email:
                                          item.email,
                                      },
                                    )
                                  }
                                  className="group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                  title={`View ${item.name}'s profile image`}
                                  aria-label={`View ${item.name}'s profile image`}
                                >
                                  <img
                                    src={image}
                                    alt={item.name}
                                    className="size-10 shrink-0 cursor-zoom-in rounded-full border border-border object-cover shadow-sm transition group-hover:scale-105 group-hover:opacity-90"
                                  />
                                </button>
                              ) : (
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
                                  {String(
                                    item.name ||
                                      item.email ||
                                      "U",
                                  )
                                    .charAt(0)
                                    .toUpperCase()}
                                </div>
                              )}

                              <div className="min-w-0 flex-1 text-left">
                                <div className="flex min-w-0 items-center">
                                  <span className="truncate font-semibold leading-5 text-foreground">
                                    {item.name}
                                  </span>
                                </div>

                                <div className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">
                                  {item.designation ||
                                    "No designation"}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="break-all px-3 py-3 text-center">
                            {item.email}
                          </td>

                          <td className="px-3 py-3">
                            <select
                              value={
                                item.client_type ||
                                ""
                              }
                              disabled={busy}
                              onChange={(event) =>
                                setConfirmAction(
                                  {
                                    type: "role",
                                    title:
                                      "Change role",
                                    message: `Change ${item.name}'s role to ${formatRole(
                                      event
                                        .target
                                        .value,
                                    )}?`,
                                    confirmLabel:
                                      "Update role",
                                    user: item,
                                    role:
                                      event
                                        .target
                                        .value,
                                  },
                                )
                              }
                              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                            >
                              {ROLE_OPTIONS.map(
                                (
                                  option,
                                ) => (
                                  <option
                                    key={
                                      option.value
                                    }
                                    value={
                                      option.value
                                    }
                                  >
                                    {
                                      option.label
                                    }
                                  </option>
                                ),
                              )}
                            </select>
                          </td>

                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              {item.client_type ===
                              "engineer" ? (
                                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                  Single role
                                </span>
                              ) : item.additional_roles
                                  ?.length ? (
                                item.additional_roles.map(
                                  (role) => (
                                    <span
                                      key={role}
                                      className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                                    >
                                      {formatRole(
                                        role,
                                      )}
                                    </span>
                                  ),
                                )
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  None
                                </span>
                              )}

                              {isAdmin &&
                              item.client_type !==
                                "engineer" ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    setAccessEditor({
                                      user: item,
                                      roles:
                                        Array.isArray(
                                          item.additional_roles,
                                        )
                                          ? [
                                              ...item.additional_roles,
                                            ]
                                          : [],
                                    })
                                  }
                                  className="rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                                >
                                  Edit
                                </button>
                              ) : null}
                            </div>
                          </td>

                          <td className="px-3 py-3 text-center">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setConfirmAction(
                                  {
                                    type: "status",
                                    title:
                                      item.is_active
                                        ? "Deactivate user"
                                        : "Activate user",
                                    message: `${item.name} will be ${
                                      item.is_active
                                        ? "deactivated"
                                        : "activated"
                                    }. Continue?`,
                                    confirmLabel:
                                      item.is_active
                                        ? "Deactivate"
                                        : "Activate",
                                    user: item,
                                  },
                                )
                              }
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                item.is_active
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {item.is_active
                                ? "Active"
                                : "Inactive"}
                            </button>
                          </td>

                          <td className="px-3 py-3 text-center">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setConfirmAction(
                                  {
                                    type: "delete",
                                    title:
                                      "Delete user",
                                    message: `Delete ${item.name}? This cannot be undone.`,
                                    confirmLabel:
                                      "Delete user",
                                    user: item,
                                  },
                                )
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>

              {usersPageCount > 1 ? (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                  <div className="text-sm text-muted-foreground">
                    Page {usersPage} of {usersPageCount}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setUsersPage((currentPage) =>
                          Math.max(1, currentPage - 1),
                        )
                      }
                      disabled={usersPage === 1}
                      className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setUsersPage((currentPage) =>
                          Math.min(
                            usersPageCount,
                            currentPage + 1,
                          ),
                        )
                      }
                      disabled={usersPage === usersPageCount}
                      className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {viewedUserImage ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Profile image viewer"
          onClick={() =>
            setViewedUserImage(null)
          }
        >
          <div
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-card shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">
                  {viewedUserImage.name}
                </h2>

                <p className="truncate text-sm text-muted-foreground">
                  {viewedUserImage.email}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setViewedUserImage(null)
                }
                className="ml-4 rounded-full p-2 transition hover:bg-muted"
                aria-label="Close image viewer"
                title="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center bg-black/95 p-4">
              <img
                src={viewedUserImage.src}
                alt={`${viewedUserImage.name} profile`}
                className="max-h-[75vh] max-w-full rounded-xl object-contain shadow-2xl"
              />
            </div>

            <div className="border-t border-border px-5 py-3 text-center text-xs text-muted-foreground">
              Click outside the image or press Escape to close.
            </div>
          </div>
        </div>
      ) : null}

      {addUserOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/55 px-4 py-8">
          <form
            onSubmit={handleCreateUser}
            className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Add IPMS User
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create login credentials and assign access.
                </p>
              </div>

              <button
                type="button"
                onClick={closeAddUser}
                disabled={busy}
                className="rounded-full p-2 hover:bg-muted"
              >
                <X className="size-5" />
              </button>
            </div>

            {error ? (
              <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="grid gap-5 p-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="flex items-center gap-4">
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt="Profile preview"
                      className="size-20 rounded-full border-2 border-border object-cover"
                    />
                  ) : (
                    <div className="flex size-20 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground">
                      <ImagePlus className="size-6" />
                    </div>
                  )}

                  <div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                      <ImagePlus className="size-4" />
                      Choose Profile Image
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleImageChange}
                      />
                    </label>
                    <p className="mt-2 text-xs text-muted-foreground">
                      JPG, PNG, or WEBP. Maximum 5 MB.
                    </p>
                  </div>
                </div>
              </div>

              <label className="space-y-1.5">
                <span className="text-sm font-medium">
                  Employee Name *
                </span>
                <input
                  value={form.employee_name}
                  onChange={(event) =>
                    updateForm(
                      "employee_name",
                      event.target.value,
                    )
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  required
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium">
                  Email *
                </span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    updateForm(
                      "email",
                      event.target.value,
                    )
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  required
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium">
                  Role *
                </span>
                <select
                  value={form.role}
                  onChange={(event) =>
                    updateForm(
                      "role",
                      event.target.value,
                    )
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {ROLE_OPTIONS.map(
                    (option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <div className="space-y-2 md:col-span-2">
                <div>
                  <span className="text-sm font-medium">
                    Additional Role Access
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    These roles become available from Profile Settings. Entering another role requires password verification.
                  </p>
                </div>

                {form.role === "engineer" ? (
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                    Engineer accounts are single-role only.
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {ROLE_OPTIONS.filter(
                      (option) =>
                        option.value !==
                          form.role &&
                        option.value !==
                          "engineer",
                    ).map((option) => {
                      const checked =
                        form.additional_roles.includes(
                          option.value,
                        );

                      return (
                        <label
                          key={option.value}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                            checked
                              ? "border-primary/40 bg-primary/10"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleFormAdditionalRole(
                                option.value,
                              )
                            }
                            className="size-4"
                          />

                          <span>
                            {option.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <label className="space-y-1.5">
                <span className="text-sm font-medium">
                  Designation
                </span>
                <input
                  value={form.designation}
                  onChange={(event) =>
                    updateForm(
                      "designation",
                      event.target.value,
                    )
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium">
                  Password *
                </span>
                <div className="relative">
                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    autoComplete="new-password"
                    minLength={4}
                    value={form.password}
                    onChange={(event) =>
                      updateForm(
                        "password",
                        event.target.value,
                      )
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (previous) =>
                          !previous,
                      )
                    }
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium">
                  Confirm Password *
                </span>
                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="new-password"
                  minLength={4}
                  value={
                    form.confirm_password
                  }
                  onChange={(event) =>
                    updateForm(
                      "confirm_password",
                      event.target.value,
                    )
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  required
                />
              </label>

              <label className="flex items-center gap-3 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) =>
                    updateForm(
                      "is_active",
                      event.target.checked,
                    )
                  }
                  className="size-4"
                />
                <span className="text-sm">
                  Activate this account immediately
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={closeAddUser}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {busy
                  ? "Creating..."
                  : "Create User"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {accessEditor ? (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/55 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">
                  Additional Role Access
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  {accessEditor.user.name}
                </p>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setAccessEditor(null)
                }
                className="rounded-full p-2 hover:bg-muted disabled:opacity-50"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              Primary Role:{" "}
              <span className="font-semibold">
                {formatRole(
                  accessEditor.user.role ||
                    accessEditor.user
                      .client_type,
                )}
              </span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {ROLE_OPTIONS.filter(
                (option) =>
                  option.value !==
                    String(
                      accessEditor.user
                        .role ||
                        accessEditor.user
                          .client_type ||
                        "",
                    ).toLowerCase() &&
                  option.value !==
                    "engineer",
              ).map((option) => {
                const checked =
                  accessEditor.roles.includes(
                    option.value,
                  );

                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      checked
                        ? "border-primary/40 bg-primary/10"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        toggleAccessEditorRole(
                          option.value,
                        )
                      }
                      className="size-4"
                    />

                    <span>
                      {option.label}
                    </span>
                  </label>
                );
              })}
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              These roles will appear in the employee's Profile Settings. Selecting another role requires password verification; the user is not logged out first.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setAccessEditor(null)
                }
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={
                  handleAdditionalRolesUpdate
                }
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy
                  ? "Saving..."
                  : "Save Access"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmAction ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold">
              {confirmAction.title}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirmAction.message}
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setConfirmAction(null)
                }
                className="rounded-lg border border-border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmAction}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                {busy
                  ? "Processing..."
                  : confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

export default RolesPage;