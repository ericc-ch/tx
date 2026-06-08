// https://docs.discord.com/developers/resources/webhook#execute-webhook

export type WebhookEmbed = {
  readonly title?: string
  readonly description?: string
  readonly url?: string
  readonly color?: number
  readonly fields?: ReadonlyArray<{
    readonly name: string
    readonly value: string
    readonly inline?: boolean
  }>
  readonly image?: { readonly url: string }
  readonly thumbnail?: { readonly url: string }
}

export type WebhookExecute = {
  readonly content?: string
  readonly username?: string
  readonly avatar_url?: string
  readonly tts?: boolean
  readonly embeds?: ReadonlyArray<WebhookEmbed>
}

export type WebhookFile = {
  readonly name: string
  readonly data: Uint8Array
  readonly contentType?: string
}

export type WebhookMessage = {
  readonly payload: WebhookExecute
  readonly files: ReadonlyArray<WebhookFile>
}

type MutableWebhookExecute = {
  -readonly [Key in keyof WebhookExecute]: WebhookExecute[Key]
}

export const discordWebhook = () => {
  const payload: MutableWebhookExecute = {}
  const files: Array<WebhookFile> = []

  const builder = {
    content(text: string) {
      payload.content = text
      return builder
    },
    username(name: string) {
      payload.username = name
      return builder
    },
    avatarUrl(url: string) {
      payload.avatar_url = url
      return builder
    },
    tts(enabled = true) {
      payload.tts = enabled
      return builder
    },
    embed(embed: WebhookEmbed) {
      payload.embeds = [...(payload.embeds ?? []), embed]
      return builder
    },
    file(name: string, data: Uint8Array, contentType?: string) {
      files.push(
        contentType === undefined ? { name, data } : { name, data, contentType },
      )
      return builder
    },
    build(): WebhookMessage {
      if (!payload.content && !payload.embeds?.length && !files.length) {
        throw new Error("Discord webhook message requires content, embeds, or files")
      }
      return { payload, files }
    },
  }

  return builder
}
