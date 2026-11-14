import {
  registrationRequestSchema,
  type RegistrationRequest,
} from "@edutrack/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

const registrationFormSchema = registrationRequestSchema
  .extend({
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });

type RegistrationFormInput = z.input<typeof registrationFormSchema>;
type RegistrationFormOutput = z.output<typeof registrationFormSchema>;
type RegistrationField = "displayName" | "email" | "password";

interface RegistrationFormProps {
  onSubmit: (values: RegistrationRequest) => Promise<void>;
  isPending?: boolean;
  fieldErrors?: Partial<Record<RegistrationField, string>>;
  errorMessage?: string;
  successMessage?: string;
}

const inputClassName =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-danger";

export default function RegistrationForm({
  onSubmit,
  isPending = false,
  fieldErrors = {},
  errorMessage,
  successMessage,
}: RegistrationFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationFormInput, unknown, RegistrationFormOutput>({
    resolver: zodResolver(registrationFormSchema),
    mode: "onBlur",
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const submitForm = handleSubmit(async (values) => {
    const registrationValues: RegistrationRequest = {
      displayName: values.displayName,
      email: values.email,
      password: values.password,
    };

    await onSubmit(registrationValues);
  });

  const displayNameError =
    errors.displayName?.message ?? fieldErrors.displayName;
  const emailError = errors.email?.message ?? fieldErrors.email;
  const passwordError = errors.password?.message ?? fieldErrors.password;
  const isBusy = isSubmitting || isPending;

  return (
    <form className="space-y-5" noValidate onSubmit={submitForm}>
      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor="registration-display-name"
        >
          Display name
        </label>
        <input
          {...register("displayName")}
          autoComplete="name"
          className={inputClassName}
          id="registration-display-name"
          aria-describedby={
            displayNameError ? "registration-display-name-error" : undefined
          }
          aria-invalid={Boolean(displayNameError)}
        />
        {displayNameError && (
          <p
            className="text-sm text-danger"
            id="registration-display-name-error"
            role="alert"
          >
            {displayNameError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor="registration-email"
        >
          Email
        </label>
        <input
          {...register("email")}
          autoComplete="email"
          className={inputClassName}
          id="registration-email"
          type="email"
          aria-describedby={emailError ? "registration-email-error" : undefined}
          aria-invalid={Boolean(emailError)}
        />
        {emailError && (
          <p
            className="text-sm text-danger"
            id="registration-email-error"
            role="alert"
          >
            {emailError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor="registration-password"
        >
          Password
        </label>
        <input
          {...register("password")}
          autoComplete="new-password"
          className={inputClassName}
          id="registration-password"
          type="password"
          aria-describedby={
            passwordError ? "registration-password-error" : undefined
          }
          aria-invalid={Boolean(passwordError)}
        />
        {passwordError && (
          <p
            className="text-sm text-danger"
            id="registration-password-error"
            role="alert"
          >
            {passwordError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor="registration-confirm-password"
        >
          Confirm password
        </label>
        <input
          {...register("confirmPassword")}
          autoComplete="new-password"
          className={inputClassName}
          id="registration-confirm-password"
          type="password"
          aria-describedby={
            errors.confirmPassword
              ? "registration-confirm-password-error"
              : undefined
          }
          aria-invalid={Boolean(errors.confirmPassword)}
        />
        {errors.confirmPassword?.message && (
          <p
            className="text-sm text-danger"
            id="registration-confirm-password-error"
            role="alert"
          >
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <button
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 font-semibold text-inverse hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        disabled={isBusy}
        type="submit"
      >
        {isBusy ? "Creating account..." : "Create account"}
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
    </form>
  );
}
