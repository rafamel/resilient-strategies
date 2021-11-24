export declare namespace ExecutionError {
  type Reason = 'cancel' | 'bulkhead' | 'circuit';

  interface Params<R extends string> {
    reason: R;
    message?: string;
  }
}

export class ExecutionError<
  R extends ExecutionError.Reason = ExecutionError.Reason
> extends Error {
  public static is<R extends ExecutionError.Reason = ExecutionError.Reason>(
    error: unknown,
    reason?: R
  ): error is ExecutionError<R> {
    const isExecutionError =
      error instanceof Error && Boolean((error as any).isExecutionError);

    if (!isExecutionError || !reason) return isExecutionError;
    return (error as any).reason === reason;
  }
  public readonly reason: R;
  public constructor(params: ExecutionError.Params<R>) {
    super(
      `Execution error: ${params.reason}` +
        (params.message ? `, ${params.message}` : '')
    );
    this.reason = params.reason;
  }
  public get isExecutionError(): boolean {
    return true;
  }
}
