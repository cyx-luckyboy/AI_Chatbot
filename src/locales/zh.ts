export default {
  settings: {
    title: '设置',
    language: '语言',
    fontSize: '字体大小',
    selectLanguage: '选择语言...',
    general: '通用',
    models: '模型',
    baiduSpeech: '百度语音输入',
    baiduAsrApiKeyPlaceholder: 'API Key（控制台 → 语音技术）',
    baiduAsrSecretKeyPlaceholder: 'Secret Key',
    baiduSpeechHint:
      '填写并保存后，语音输入会优先走百度（适合国内网络）。不填时若系统支持 Web Speech 则走实时上屏（常依赖 Google）。密钥仅存本机。',
  },
  contextMenu: {
    deleteConversation: '删除对话'
  },
  common: {
    send: '发送',
    removeImage: '移除图片',
    removeAttachment: '移除',
    attachFiles: '添加附件',
    attachImages: '添加图片',
    attachMenuAll: '上传文件或图片',
    attachMenuImages: '仅选择图片',
    attachAddButton: '添加附件',
    reloadApp: '刷新',
    voiceInputStart: '语音输入',
    voiceInputStop: '结束语音',
    voiceInputUnsupported:
      '无法使用语音输入：请在上方设置中填写百度语音 Key，或使用 Chrome 并联网（Web Speech）。',
    voiceErr_network:
      '语音识别需要连接云端（Chrome 内核走 Google 服务）。当前网络无法连通时会失败：可尝试可用的系统代理/VPN，或使用系统自带语音输入后再粘贴到此处。',
    voiceErr_not_allowed: '麦克风权限被拒绝：请在 Windows「隐私与安全 → 麦克风」中允许本应用。',
    voiceErr_service_not_allowed: '当前环境禁止了语音识别服务。',
    voiceErr_audio_capture: '无法访问麦克风：请检查设备是否插入、是否被其他程序占用。',
    voiceErr_language_not_supported: '所选识别语言不受支持，可在设置中切换界面语言后重试。',
    voiceErr_unknown: '语音识别出错，请稍后重试。',
    voiceErr_baidu: '百度语音识别返回错误。',
    voiceErr_baidu_network: '无法完成语音识别：请检查网络、密钥是否正确，或稍后重试。',
    voiceErr_baidu_empty: '未采集到有效音频，请说话后再结束录音。',
    voiceErr_baidu_decode: '无法解析录音格式，请重试或更新应用。',
    voiceErr_baidu_no_result:
      '未识别到文字（可能是环境太安静或发音太短）。请大声清晰说话后再结束录音。',
    voiceErr_web_start_failed: '无法启动语音识别，请检查麦克风权限后重试。',
    voiceErr_voice_engine_unavailable: '当前无法使用语音引擎，请在设置中配置百度语音密钥。',
    voiceErr_voice_empty_session:
      '未识别到语音内容。若未配置百度密钥，Web Speech 在国内常连不上谷歌服务；请在设置中填写百度语音 Key 后重试。',
    voiceErr_voice_timeout_no_result:
      '约 18 秒内没有任何识别结果。请检查麦克风与网络；国内建议在设置中填写百度语音 Key。',
    voiceErr_speech_other_error: '语音识别引擎报错。',
    voiceErr_voice_no_match: '未能识别成文字，请大声、清晰、慢一点再说。',
    voiceHint_baiduSecondClick: '录音中：请再次点击麦克风结束录音，识别结果会填入上方输入框。',
    imageOnlyTitle: '图片消息',
    visionImageReplyUnusable:
      '未收到有效回答。带**图片**的对话需要选用支持**视觉/多模态**的模型（例如通义 **qwen-vl-plus**、**GPT-4o**、Kimi 多模态等）；纯文本模型可能只返回空内容或单个标点。**说明**：大模型请求在 Electron **主进程**发出，在页面 Network 里通常看不到接口请求，属正常现象。请使用 `npm start` 启动桌面端。',
    attachmentOnlyTitle: '附件消息',
    chinese: '中文',
    english: 'English',
    newChat: '新建聊天',
    settings: '应用设置'
  },
  menu: {
    app: {
      newConversation: '新建对话',
      settings: '设置',
      quit: '退出'
    },
    edit: {
      title: '编辑',
      undo: '撤销',
      redo: '重做',
      cut: '剪切',
      copy: '复制',
      paste: '粘贴',
      selectAll: '全选',
      speech: {
        title: '语音',
        startSpeaking: '开始朗读',
        stopSpeaking: '停止朗读'
      },
      emoji: '表情与符号'
    },
    view: {
      title: '视图',
      reload: '重新加载',
      forceReload: '强制重新加载',
      toggleDevTools: '开发者工具',
      resetZoom: '重置缩放',
      zoomIn: '放大',
      zoomOut: '缩小',
      togglefullscreen: '切换全屏'
    }
  },
  provider: {
    selectModel: '选择模型...'
  }
} 