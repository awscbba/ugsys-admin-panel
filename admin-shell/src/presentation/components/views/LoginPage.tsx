import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "@nanostores/react";
import { LoginCard } from "@ugsys/ui-lib";
import { $isLoading, $error, $user, login } from "../../../stores/authStore";

/**
 * LoginPage — delegates all rendering to LoginCard from @ugsys/ui-lib.
 * Only owns: auth store wiring and redirect logic.
 *
 * Requirements: 8.5
 */
export function LoginPage(): React.ReactElement {
  const isLoading = useStore($isLoading);
  const authError = useStore($error);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
    if ($user.get() !== null) {
      navigate(redirect, { replace: true });
    }
  };

  return (
    <LoginCard
      title="Admin Panel"
      email={email}
      password={password}
      isLoading={isLoading}
      error={authError}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={handleSubmit}
    />
  );
}
