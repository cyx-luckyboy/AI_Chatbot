/** 小文件：渲染进程用 data URL 内联，超过此大小改走主进程按路径复制 */
export const MAX_INLINE_ATTACHMENT_BYTES = 14 * 1024 * 1024

/** 主进程复制到 userData/attachments 的上限 */
export const MAX_IMPORT_ATTACHMENT_BYTES = 50 * 1024 * 1024
