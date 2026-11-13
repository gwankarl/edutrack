import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) =>
        value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must use the postgres:// or postgresql:// scheme",
    ),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(
  values: NodeJS.ProcessEnv = process.env,
): Environment {
  return environmentSchema.parse(values);
}
