import { useState } from "react";

interface LoginScreenProps {
  onLogin: (username: string, password: string) => Promise<void>;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUser = username.trim();
    if (!trimmedUser || !password) return;

    setError(null);
    setLoading(true);

    try {
      await onLogin(trimmedUser, password);
    } catch {
      setError("Invalid username or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-dark px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
            Trove
          </h1>
          <p className="mt-2 text-muted dark:text-dark-muted">
            Sign in to your account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="sr-only">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoFocus
              autoComplete="username"
              disabled={loading}
              className="w-full rounded-lg border border-border dark:border-dark-border
                         bg-card dark:bg-dark-card
                         text-neutral-900 dark:text-neutral-100
                         placeholder:text-muted dark:placeholder:text-dark-muted
                         px-4 py-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600
                         disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="password" className="sr-only">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              disabled={loading}
              className="w-full rounded-lg border border-border dark:border-dark-border
                         bg-card dark:bg-dark-card
                         text-neutral-900 dark:text-neutral-100
                         placeholder:text-muted dark:placeholder:text-dark-muted
                         px-4 py-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600
                         disabled:opacity-50"
            />
          </div>

          {error && (
            <p className="text-red-600 dark:text-red-400 text-sm text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            className="w-full rounded-lg bg-neutral-900 dark:bg-neutral-100
                       text-white dark:text-neutral-900
                       py-3 text-sm font-medium
                       hover:bg-neutral-800 dark:hover:bg-neutral-200
                       focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
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
                Signing in...
              </span>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
