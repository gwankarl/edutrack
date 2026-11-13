export interface ApiErrorOptions {
  status: number | null;
  title: string;
  detail?: string;
  validationErrors?: unknown;
}

export class ApiError extends Error {
  readonly status: number | null;
  readonly title: string;
  readonly detail?: string;
  readonly validationErrors?: unknown;

  constructor(options: ApiErrorOptions) {
    super(options.detail ?? options.title);

    this.name = "ApiError";
    this.status = options.status;
    this.title = options.title;
    this.detail = options.detail;
    this.validationErrors = options.validationErrors;
  }
}
