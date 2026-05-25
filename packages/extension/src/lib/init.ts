import { INIT_PAYLOAD_PARAM, InitPayloadFromUrlParam } from "@tx/server/schema"
import { Effect, Option, Schema } from "effect"

export const initPayloadFromUrl = (url: string) =>
  Effect.gen(function* () {
    const encoded = new URL(url).searchParams.get(INIT_PAYLOAD_PARAM)
    if (encoded === null) return Option.none()

    const payload = yield* Schema.decodeUnknownEffect(InitPayloadFromUrlParam)(encoded).pipe(
      Effect.orDie,
    )
    return Option.some(payload)
  })
