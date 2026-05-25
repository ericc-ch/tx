import { MessageRpcClientLayer } from "@/lib/protocol"
import { RemoteLoggerLayer } from "@/lib/logger"
import { Layer } from "effect"

export const ContentScriptLive = RemoteLoggerLayer.pipe(Layer.provideMerge(MessageRpcClientLayer))
