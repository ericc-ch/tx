import { Context, Effect } from "effect"
import {
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http"

/** CORS for extension content scripts on public queue pages calling localhost. */
export const corsForExtension = () =>
  HttpRouter.middleware(
    (httpApp) =>
      Effect.withFiber((fiber) => {
        const request = Context.getUnsafe(fiber.context, HttpServerRequest.HttpServerRequest)
        return HttpMiddleware.cors()(httpApp).pipe(
          Effect.map((response) =>
            request.headers["access-control-request-private-network"] === "true"
              ? HttpServerResponse.setHeader(
                  response,
                  "access-control-allow-private-network",
                  "true",
                )
              : response,
          ),
        )
      }),
    { global: true },
  )
