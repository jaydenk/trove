import { useState } from "react";
import { api, getToken, setToken, ApiError } from "../api";
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
// AccountSettings
// ---------------------------------------------------------------------------

interface AccountSettingsProps {
  user: User;
}

export default function AccountSettings({ user }: AccountSettingsProps) {
  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Token state
  const [showToken, setShowToken] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenSuccess, setTokenSuccess] = useState<string | null>(null);

  const currentToken = getToken() ?? "";

  function maskedToken(token: string): string {
    if (token.length <= 6) return token;
    return "\u2022".repeat(token.length - 6) + token.slice(-6);
  }

  // ----- Password change -----

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!newPassword) {
      setPasswordError("Please enter a new password.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      await api.updateMe({ password: newPassword });
      setPasswordSuccess("Password updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err instanceof ApiError) {
        setPasswordError(err.message);
      } else {
        setPasswordError("Failed to update password.");
      }
    } finally {
      setPasswordSaving(false);
    }
  }

  // ----- Token regeneration -----

  async function handleRegenerateToken() {
    setTokenError(null);
    setTokenSuccess(null);
    setRegenerating(true);
    try {
      const result = await api.regenerateToken();
      setToken(result.token);
      setShowToken(true);
      setConfirmRegenerate(false);
      setTokenSuccess("API token regenerated. Your new token is shown below.");
    } catch (err) {
      if (err instanceof ApiError) {
        setTokenError(err.message);
      } else {
        setTokenError("Failed to regenerate token.");
      }
    } finally {
      setRegenerating(false);
    }
  }

  function handleCopyToken() {
    const token = getToken();
    if (!token) return;
    navigator.clipboard.writeText(token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  }

  const inputClass =
    "w-full rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark text-neutral-900 dark:text-neutral-100 placeholder:text-muted dark:placeholder:text-dark-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 transition-colors";

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
      {/* Profile info */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Profile
        </h3>
        <div className="border border-border dark:border-dark-border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted dark:text-dark-muted w-20 shrink-0">Name</span>
            <span className="text-neutral-900 dark:text-neutral-100 font-medium">{user.name}</span>
          </div>
          {user.username && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted dark:text-dark-muted w-20 shrink-0">Username</span>
              <span className="text-neutral-900 dark:text-neutral-100 font-medium">@{user.username}</span>
            </div>
          )}
          {user.email && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted dark:text-dark-muted w-20 shrink-0">Email</span>
              <span className="text-neutral-900 dark:text-neutral-100">{user.email}</span>
            </div>
          )}
        </div>
      </section>

      {/* Change password */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Change Password
        </h3>

        {passwordSuccess && (
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
            <p className="text-xs text-green-700 dark:text-green-300">{passwordSuccess}</p>
          </div>
        )}
        {passwordError && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <p className="text-xs text-red-700 dark:text-red-300">{passwordError}</p>
          </div>
        )}

        <div className="border border-border dark:border-dark-border rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted dark:text-dark-muted mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted dark:text-dark-muted mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className={inputClass}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleChangePassword();
                }
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleChangePassword}
            disabled={passwordSaving || !newPassword || !confirmPassword}
            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {passwordSaving && <Spinner className="h-3 w-3" />}
            {passwordSaving ? "Saving..." : "Update Password"}
          </button>
        </div>
      </section>

      {/* API Token */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          API Token
        </h3>
        <p className="text-xs text-muted dark:text-dark-muted">
          Used by the browser extension, iOS Shortcut, and other API clients to authenticate without a password.
        </p>

        {tokenSuccess && (
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
            <p className="text-xs text-green-700 dark:text-green-300">{tokenSuccess}</p>
          </div>
        )}
        {tokenError && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <p className="text-xs text-red-700 dark:text-red-300">{tokenError}</p>
          </div>
        )}

        <div className="border border-border dark:border-dark-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-white dark:bg-neutral-900 rounded px-2 py-1.5 text-neutral-900 dark:text-neutral-200 border border-border dark:border-dark-border select-all break-all">
              {showToken ? currentToken : maskedToken(currentToken)}
            </code>
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="shrink-0 text-xs px-2 py-1.5 rounded border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover transition-colors"
            >
              {showToken ? "Hide" : "Show"}
            </button>
            <button
              type="button"
              onClick={handleCopyToken}
              className="shrink-0 text-xs px-2 py-1.5 rounded border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover transition-colors"
            >
              {tokenCopied ? "Copied" : "Copy"}
            </button>
          </div>

          {confirmRegenerate ? (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                This will invalidate your current token. The browser extension, iOS Shortcut, and any other API clients will need to be reconfigured with the new token.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRegenerateToken}
                  disabled={regenerating}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
                >
                  {regenerating && <Spinner className="h-3 w-3" />}
                  {regenerating ? "Regenerating..." : "Confirm Regenerate"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRegenerate(false)}
                  disabled={regenerating}
                  className="text-xs px-2 py-1.5 rounded border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRegenerate(true)}
              className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
            >
              Regenerate Token
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
