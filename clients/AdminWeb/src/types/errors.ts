export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

export class AppError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const handleApiError = (error: unknown): string => {
  if (error instanceof AppError) {
    return error.message;
  }
  
  if (typeof error === 'object' && error !== null) {
    const apiError = error as any;
    return apiError.response?.data?.message || apiError.message || 'An unexpected error occurred';
  }
  
  return 'An unexpected error occurred';
};