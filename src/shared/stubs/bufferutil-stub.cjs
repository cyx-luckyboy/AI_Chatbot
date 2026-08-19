'use strict';

/** ws 可选原生依赖占位：纯 JS 实现 mask/unmask，供 Vite 打包主进程时使用 */
function mask(source, mask, output, offset, length) {
  for (let i = 0; i < length; i++) {
    output[offset + i] = source[i] ^ mask[i & 3];
  }
}

function unmask(buffer, mask) {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] ^= mask[i & 3];
  }
}

module.exports = { mask, unmask };
