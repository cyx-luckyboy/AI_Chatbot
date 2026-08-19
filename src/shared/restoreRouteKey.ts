/** 整页 reload 前写入 `sessionStorage`，`renderer.ts` 启动时读取并 `router.replace`，避免 memory 路由回到首页 */
export const RESTORE_ROUTE_AFTER_RELOAD_KEY = 'vchat-restore-after-reload'
