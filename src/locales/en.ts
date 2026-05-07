export default {
  settings: {
    title: 'Settings',
    language: 'Language',
    fontSize: 'Font Size',
    selectLanguage: 'Select Language...',
    general: 'General',
    models: 'Models',
    baiduSpeech: 'Baidu speech (China)',
    baiduAsrApiKeyPlaceholder: 'API Key (console → Speech)',
    baiduAsrSecretKeyPlaceholder: 'Secret Key',
    baiduSpeechHint:
      'After saving keys, voice uses Baidu first (works in China). Without keys, Web Speech is used when available (often Google). Keys stay on device.',
  },
  contextMenu: {
    deleteConversation: 'Delete Conversation'
  },
  common: {
    send: 'Send',
    removeImage: 'Remove image',
    removeAttachment: 'Remove',
    attachFiles: 'Add attachments',
    attachImages: 'Add images',
    attachMenuAll: 'Upload files or images',
    attachMenuImages: 'Images only',
    attachAddButton: 'Add attachment',
    reloadApp: 'Reload',
    voiceInputStart: 'Voice input',
    voiceInputStop: 'Stop dictation',
    voiceInputUnsupported:
      'Voice input unavailable: add Baidu speech keys in Settings, or use Chrome with network (Web Speech).',
    voiceErr_network:
      'Speech recognition uses Google’s cloud service in Chromium. If you see this, the network cannot reach it—try a VPN/proxy, or dictate with the OS keyboard and paste here.',
    voiceErr_not_allowed: 'Microphone permission denied. Allow the app in system privacy → Microphone.',
    voiceErr_service_not_allowed: 'Speech recognition is blocked in this environment.',
    voiceErr_audio_capture: 'Cannot access the microphone. Check that it is connected and not in use by another app.',
    voiceErr_language_not_supported: 'This language is not supported for recognition. Try changing the app language in Settings.',
    voiceErr_unknown: 'Voice recognition failed. Please try again.',
    voiceErr_baidu: 'Baidu speech recognition returned an error.',
    voiceErr_baidu_network: 'Could not complete recognition. Check network and API credentials.',
    voiceErr_baidu_empty: 'No audio captured. Speak before stopping recording.',
    voiceErr_baidu_decode: 'Could not decode the recording. Try again or update the app.',
    voiceErr_baidu_no_result:
      'No text recognized (too quiet or too short). Speak clearly, then stop recording.',
    voiceErr_web_start_failed: 'Could not start speech recognition. Check microphone permission.',
    voiceErr_voice_engine_unavailable: 'No speech engine available. Configure Baidu keys in Settings.',
    voiceErr_voice_empty_session:
      'No speech was recognized. Without Baidu keys, Web Speech may not reach Google from your network—add Baidu keys in Settings.',
    voiceErr_voice_timeout_no_result:
      'No recognition for ~18s. Check mic and network; add Baidu keys in Settings if you are in China.',
    voiceErr_speech_other_error: 'The speech engine reported an error.',
    voiceErr_voice_no_match: 'Could not turn speech into text. Speak more clearly.',
    voiceHint_baiduSecondClick:
      'Recording: click the mic again to stop; text appears in the box above.',
    imageOnlyTitle: 'Image message',
    attachmentOnlyTitle: 'Attachment message',
    chinese: 'Chinese',
    english: 'English',
    newChat: 'New Chat',
    settings: 'Settings'
  },
  menu: {
    app: {
      newConversation: 'New Conversation',
      settings: 'Settings',
      quit: 'Quit'
    },
    edit: {
      title: 'Edit',
      undo: 'Undo',
      redo: 'Redo',
      cut: 'Cut',
      copy: 'Copy',
      paste: 'Paste',
      selectAll: 'Select All',
      speech: {
        title: 'Speech',
        startSpeaking: 'Start Speaking',
        stopSpeaking: 'Stop Speaking'
      },
      emoji: 'Emoji & Symbols'
    },
    view: {
      title: 'View',
      reload: 'Reload',
      forceReload: 'Force Reload',
      toggleDevTools: 'Toggle Developer Tools',
      resetZoom: 'Reset Zoom',
      zoomIn: 'Zoom In',
      zoomOut: 'Zoom Out',
      togglefullscreen: 'Toggle Full Screen'
    }
  },
  provider: {
    selectModel: 'Select a model...'
  }
} 