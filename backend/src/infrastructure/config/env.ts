import "dotenv/config";
import { z } from "zod";

const smtpFieldNames = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "EMAIL_FROM",
] as const;

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    FRONTEND_URL: z.string().url().default("http://localhost:5173"),
    DATABASE_URL: z
      .string()
      .min(1)
      .refine(
        (value) =>
          value.startsWith("postgres://") || value.startsWith("postgresql://"),
        "DATABASE_URL must use the postgres:// or postgresql:// scheme",
      ),
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(2_592_000)
      .default(604_800),
    SMTP_HOST: z.string().trim().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SMTP_USER: z.string().trim().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    EMAIL_FROM: z.string().trim().min(1).optional(),
  })
  .superRefine((environment, context) => {
    const configuredCount = smtpFieldNames.filter(
      (name) => environment[name] !== undefined,
    ).length;

    if (configuredCount === 0 || configuredCount === smtpFieldNames.length) {
      return;
    }

    for (const name of smtpFieldNames) {
      if (environment[name] === undefined) {
        context.addIssue({
          code: "custom",
          path: [name],
          message: "All SMTP settings must be configured together.",
        });
      }
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(
  values: NodeJS.ProcessEnv = process.env,
): Environment {
  return environmentSchema.parse(values);
}
