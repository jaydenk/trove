import { useState, useEffect, useCallback } from "react";
import { api, ApiError } from "../api";
import type { User } from "../api";

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

function formatDate(dateString: string): string {
  const normalised = dateString.includes("T")
    ? dateString
    : dateString.replace(" ", "T") + "Z";
  const date = new Date(normalised);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// UserManagement
// ---------------------------------------------------------------------------

interface UserManagementProps {
  currentUser: User;
}

export default function UserManagement({ currentUser }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add user form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.admin.listUsers();
      setUsers(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load users.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleCreateUser() {
    if (!newName.trim() || !newUsername.trim() || !newPassword) return;
    setIsCreating(true);
    setError(null);
    try {
      const result = await api.admin.createUser({
        name: newName.trim(),
        username: newUsername.trim(),
        password: newPassword,
        email: newEmail.trim() || undefined,
      });
      setCreatedToken(result.apiToken);
      setNewName("");
      setNewUsername("");
      setNewPassword("");
      setNewEmail("");
      fetchUsers();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to create user.");
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteUser(id: string) {
    setIsDeleting(true);
    setError(null);
    try {
      await api.admin.deleteUser(id);
      setDeletingId(null);
      fetchUsers();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to delete user.");
      }
    } finally {
      setIsDeleting(false);
    }
  }

  function handleCopyToken() {
    if (!createdToken) return;
    navigator.clipboard.writeText(createdToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-5 w-5 text-muted dark:text-dark-muted" />
      </div>
    );
  }

  const inputClass =
    "w-full rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark text-neutral-900 dark:text-neutral-100 placeholder:text-muted dark:placeholder:text-dark-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 transition-colors";

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Success banner (shown once after creating a user) */}
      {createdToken && (
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 space-y-2">
          <p className="text-xs font-medium text-green-800 dark:text-green-300">
            User created successfully. They can sign in with the username and password you provided.
          </p>
          <p className="text-xs text-green-700 dark:text-green-400">
            API token for extension and API access (copy now — it will not be shown again):
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-white dark:bg-neutral-900 rounded px-2 py-1.5 text-green-900 dark:text-green-200 border border-green-200 dark:border-green-800 select-all break-all">
              {createdToken}
            </code>
            <button
              type="button"
              onClick={handleCopyToken}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            >
              {tokenCopied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCreatedToken(null)}
            className="text-xs text-green-600 dark:text-green-400 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* User list */}
      <div className="border border-border dark:border-dark-border rounded-lg overflow-hidden">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex items-center gap-3 px-4 py-3 border-b border-border dark:border-dark-border last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                  {u.name}
                </span>
                {u.username && (
                  <span className="text-xs text-muted dark:text-dark-muted">
                    @{u.username}
                  </span>
                )}
                {u.isAdmin && (
                  <span className="inline-block px-1.5 py-0.5 rounded text-[11px] leading-tight bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                    Admin
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted dark:text-dark-muted mt-0.5">
                {u.email && <span className="truncate">{u.email}</span>}
                {u.email && <span aria-hidden>·</span>}
                <span className="whitespace-nowrap">
                  Joined {formatDate(u.createdAt)}
                </span>
              </div>
            </div>

            {u.id === currentUser.id ? (
              <span className="text-xs text-muted dark:text-dark-muted shrink-0">
                You
              </span>
            ) : deletingId === u.id ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setDeletingId(null)}
                  disabled={isDeleting}
                  className="text-xs px-2 py-1 rounded border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteUser(u.id)}
                  disabled={isDeleting}
                  className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 transition-colors inline-flex items-center gap-1"
                >
                  {isDeleting && <Spinner className="h-3 w-3" />}
                  Confirm
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDeletingId(u.id)}
                className="shrink-0 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add user form */}
      {showAddForm ? (
        <div className="border border-border dark:border-dark-border rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Add User
          </p>
          <div>
            <label className="block text-xs font-medium text-muted dark:text-dark-muted mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Display name"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted dark:text-dark-muted mb-1">
              Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Username for sign in"
              autoComplete="off"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted dark:text-dark-muted mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Password"
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted dark:text-dark-muted mb-1">
              Email <span className="text-xs text-muted dark:text-dark-muted font-normal">(optional)</span>
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              className={inputClass}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateUser();
                }
              }}
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleCreateUser}
              disabled={isCreating || !newName.trim() || !newUsername.trim() || !newPassword}
              className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isCreating && <Spinner className="h-3 w-3" />}
              {isCreating ? "Creating..." : "Create User"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setNewName("");
                setNewUsername("");
                setNewPassword("");
                setNewEmail("");
              }}
              className="text-sm text-muted dark:text-dark-muted hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-3 py-1.5 text-sm hover:bg-hover dark:hover:bg-dark-hover transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Add User
        </button>
      )}
    </div>
  );
}
