'use strict';

/** ws 可选原生依赖占位：会议 ASR 客户端以二进制 PCM 发送，此处用宽松校验即可 */
module.exports = function isValidUTF8(_buf) {
  return true;
};
