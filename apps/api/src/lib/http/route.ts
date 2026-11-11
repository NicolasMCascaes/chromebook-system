import { toErrorResponse } from "./responses";

type Params = Record<string, string>;

export interface HandlerContext<P extends Params> {
  params: Promise<P>;
}

export function route<P extends Params = Params>(handler: (request: Request, params: P) => Promise<Response>) {
  return async (request: Request, context: HandlerContext<P>): Promise<Response> => {
    try {
      const params = context?.params ? await context.params : ({} as P);
      return await handler(request, params);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
