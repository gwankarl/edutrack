import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginRequestSchema, type LoginRequest } from "@edutrack/contracts";
import { Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";

type LoginFormInput = z.input<typeof loginRequestSchema>;
type LoginFormOutput = z.output<typeof loginRequestSchema>;

interface LoginFormProps {
  onSubmit?: (values: LoginRequest) => void | Promise<void>;
  isPending?: boolean;
  errorMessage?: string;
  successMessage?: string;
}

const inputClassName =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-danger";

export default function LoginForm({
  onSubmit,
  isPending = false,
  errorMessage,
  successMessage,
}: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInput, unknown, LoginFormOutput>({
    resolver: zodResolver(loginRequestSchema),
    mode: "onBlur",
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const submitForm = handleSubmit(async (values) => {
    const loginValues: LoginRequest = {
      email: values.email,
      password: values.password,
    };

    await onSubmit?.(loginValues);
  });

  const isBusy = isSubmitting || isPending;

  return (
    <form className="space-y-5" noValidate onSubmit={submitForm}>
      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor="login-email"
        >
          Email
        </label>
        <input
          {...register("email")}
          autoComplete="email"
          className={inputClassName}
          id="login-email"
          type="email"
          aria-describedby={errors.email ? "login-email-error" : undefined}
          aria-invalid={Boolean(errors.email)}
        />
        {errors.email?.message && (
          <p
            className="text-sm text-danger"
            id="login-email-error"
            role="alert"
          >
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor="login-password"
        >
          Password
        </label>
        <div className="relative">
          <input
            {...register("password")}
            autoComplete="current-password"
            className={`${inputClassName} pr-12`}
            id="login-password"
            type={showPassword ? "text" : "password"}
            aria-describedby={
              errors.password ? "login-password-error" : undefined
            }
            aria-invalid={Boolean(errors.password)}
          />
          <button
            aria-controls="login-password"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 inline-flex min-h-11 min-w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            onClick={() => setShowPassword((visible) => !visible)}
            type="button"
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="size-5" />
            ) : (
              <Eye aria-hidden="true" className="size-5" />
            )}
          </button>
        </div>
        {errors.password?.message && (
          <p
            className="text-sm text-danger"
            id="login-password-error"
            role="alert"
          >
            {errors.password.message}
          </p>
        )}
      </div>

      <button
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 font-semibold text-inverse hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isBusy}
        type="submit"
      >
        {isBusy ? "Signing in..." : "Sign in"}
      </button>

      {errorMessage && (
        <p aria-live="polite" className="text-sm text-danger" role="alert">
          {errorMessage}
        </p>
      )}

      {successMessage && (
        <p aria-live="polite" className="text-sm text-success" role="status">
          {successMessage}
        </p>
      )}

      <nav
        aria-label="Account navigation"
        className="space-y-3 border-t border-border pt-4 text-sm"
      >
        <p>
          <Link
            className="font-medium text-primary hover:underline"
            to="/forgot-password"
          >
            Forgot your password?
          </Link>
        </p>
        <p className="text-muted-foreground">
          Don’t have an account?{" "}
          <Link
            className="font-medium text-primary hover:underline"
            to="/register"
          >
            Register
          </Link>
        </p>
      </nav>
    </form>
  );
}
