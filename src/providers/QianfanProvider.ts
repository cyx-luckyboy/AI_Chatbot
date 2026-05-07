import { ChatCompletion } from "@baiducloud/qianfan"
import { BaseProvider } from './BaseProvider'
import { ChatMessageProps, UniversalChunkProps, BaiduChunkProps } from '../types'
import { convertMessages } from '../helper'

export class QianfanProvider extends BaseProvider {
  private client: any;
  constructor(accessKey: string, secretKey: string) {
    super()
    this.client = new ChatCompletion({ QIANFAN_ACCESS_KEY: accessKey, QIANFAN_SECRET_KEY: secretKey })
  }
  async chat(messages: ChatMessageProps[], model: string) {
    const converted = await convertMessages(messages)
    const stream = await this.client.chat(
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: converted as any,
        stream: true,
      },
      model,
    )
    const self = this
    return {
      async *[Symbol.asyncIterator]() {
        let sawEnd = false
        for await (const chunk of stream) {
          const out = self.transformResponse(chunk)
          if (out.is_end) sawEnd = true
          yield out
        }
        if (!sawEnd) {
          yield { is_end: true, result: '' }
        }
      }
    }
  }
  protected transformResponse(chunk: BaiduChunkProps): UniversalChunkProps {
    return {
      is_end: chunk.is_end,
      result: chunk.result
    }
  }
}