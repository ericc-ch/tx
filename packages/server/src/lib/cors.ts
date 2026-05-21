import { Context, Effect } from "effect"
import {
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http"

const wantsPrivateNetworkAccess = (request: HttpServerRequest.HttpServerRequest) =>
  request.headers["access-control-request-private-network"] === "true"

const allowPrivateNetworkAccess = (
  request: HttpServerRequest.HttpServerRequest,
  response: HttpServerResponse.HttpServerResponse,
) =>
  wantsPrivateNetworkAccess(request)
    ? HttpServerResponse.setHeader(
        response,
        "access-control-allow-private-network",
        "true",
      )
    : response

/** CORS for extension content scripts on public queue pages calling localhost. */
export const corsForExtension = () =>
  HttpRouter.middleware(
    (httpApp) =>
      Effect.withFiber((fiber) => {
        const request = Context.getUnsafe(fiber.context, HttpServerRequest.HttpServerRequest)
        return HttpMiddleware.cors()(httpApp).pipe(
          Effect.map((response) => allowPrivateNetworkAccess(request, response)),
        )
      }),
    { global: true },
  )
