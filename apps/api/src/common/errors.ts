export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly messageAr: string,
    public readonly messageEn: string,
  ) {
    super(messageEn);
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthorized: () =>
    new AppError('UNAUTHORIZED', 401, 'غير مصرح', 'Unauthorized'),
  forbidden: () =>
    new AppError('FORBIDDEN', 403, 'لا تملك صلاحية لهذا الإجراء', 'Forbidden'),
  notFound: (entity: string) =>
    new AppError('NOT_FOUND', 404, `${entity} غير موجود`, `${entity} not found`),
  conflict: (code: string, ar: string, en: string) => new AppError(code, 409, ar, en),
  badRequest: (code: string, ar: string, en: string) => new AppError(code, 400, ar, en),
  invalid: (ar: string, en: string) => new AppError('VALIDATION_ERROR', 400, ar, en),
};
