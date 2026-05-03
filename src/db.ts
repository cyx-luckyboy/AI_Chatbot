import Dexie, { type EntityTable } from 'dexie'
import { providers } from './testData'
import { ProviderProps, ConversationProps, MessageProps } from './types'

export const db = new Dexie('vChatDatabase') as Dexie & {
  providers: EntityTable<ProviderProps, 'id'>;
  conversations: EntityTable<ConversationProps, 'id'>;
  messages: EntityTable<MessageProps,'id'>;
}

db.version(1).stores({
  providers: '++id, name',
  conversations: '++id, providerId',
  messages: '++id, conversationId'
})

export const initProviders = async () => {
  const count = await db.providers.count()
  if (count === 0) {
    await db.providers.bulkAdd(providers)
    return
  }
  const existingNames = new Set((await db.providers.toArray()).map((p) => p.name))
  for (const p of providers) {
    if (!existingNames.has(p.name)) {
      const { id: _omit, ...row } = p
      await db.providers.add(row)
    } else {
      const row = await db.providers.where('name').equals(p.name).first()
      if (row?.id != null) {
        await db.providers.update(row.id, {
          title: p.title,
          desc: p.desc,
          models: p.models,
          avatar: p.avatar,
          updatedAt: p.updatedAt,
        })
      }
    }
  }
}