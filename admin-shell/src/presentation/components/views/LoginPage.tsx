import React, { useState } from "react";
import { useStore } from "@nanostores/react";
import { $isLoading, login } from "../../../stores/authStore";

/**
 * LoginPage — standalone authentication screen.
 *
 * Uses Design_Tokens via Tailwind utility classes:
 *   bg-primary  (#161d2b) — full-page background
 *   bg-brand    (#FF9900) — submit button background
 *   text-primary          — submit button text (dark on orange for contrast)
 *   font-sans             — Open Sans (set via tokens.css --font-sans)
 *
 * Requirements: 8.5
 */
export function LoginPage(): React.ReactElement {
  const isLoading = useStore($isLoading);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      await login(email, password);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-primary font-sans">
      <form
        onSubmit={handleSubmit}
        aria-label="Login form"
        className="flex flex-col gap-4 p-10 bg-white rounded-xl shadow-lg w-[360px]"
      >
        <h1 className="m-0 text-[22px] font-bold text-gray-900">Admin Panel</h1>

        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>

        {loginError && (
          <p role="alert" className="m-0 text-[13px] text-red-600">
            {loginError}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="py-2.5 bg-brand hover:bg-brand/90 text-primary border-none rounded-md text-sm font-semibold cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
