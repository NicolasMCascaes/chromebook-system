import type { ApiErrorBody } from "@chromebook/shared";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ApiErrorBody["details"],
  ) {
    super(message);
    this.name = "AppError";
  }

  static unauthorized(message = "Sua sessão expirou ou é inválida. Entre novamente.") {
    return new AppError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Você não tem permissão para realizar esta ação.") {
    return new AppError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Registro não encontrado.") {
    return new AppError(404, "NOT_FOUND", message);
  }

  static conflict(message: string, code = "CONFLICT") {
    return new AppError(409, code, message);
  }

  static validation(message: string, details?: ApiErrorBody["details"]) {
    return new AppError(422, "VALIDATION_ERROR", message, details);
  }

  toBody(): ApiErrorBody {
    const body: ApiErrorBody = { code: this.code, message: this.message };
    if (this.details) body.details = this.details;
    return body;
  }
}
