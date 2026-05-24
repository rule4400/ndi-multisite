export const IPC = {
  STREAM_VIDEO_FRAME:    'stream:videoFrame',
  STREAM_SOURCE_LIST:    'stream:sourceList',
  STREAM_STATUS_UPDATE:  'stream:statusUpdate',
  STREAM_CONNECT_SITE:   'stream:connectSite',    // siteId, sourceName?
  STREAM_DISCONNECT_SITE:'stream:disconnectSite', // siteId
  STREAM_GET_SOURCES:    'stream:getSources',     // → NDISource[]
  STREAM_PUSH_FRAME:     'stream:pushFrame',      // renderer→main: video frame
  STREAM_PUSH_AUDIO:     'stream:pushAudio',      // renderer→main: audio chunk
  STREAM_AUDIO_FRAME:    'stream:audioFrame',     // main→renderer: NDI受信音声
  STREAM_NETWORK_STATUS: 'stream:networkStatus',  // main→renderer: 拠点ネットワーク到達性

  DEVICE_GET_CAMERAS:    'device:getCameras',     // → MediaDeviceInfo[]

  CTRL_SET_CAMERA:       'control:setCamera',
  CTRL_SET_MIC:          'control:setMic',
  CTRL_SET_SPEAKER:      'control:setSpeaker',
  CTRL_SET_VOLUME:       'control:setVolume',
  CTRL_SET_SITE_VOLUME:  'control:setSiteVolume',
  CTRL_GET_DEVICE_STATE: 'control:getDeviceState',

  CONFIG_GET:            'config:get',
  CONFIG_SET:            'config:set',
  CONFIG_ADD_SITE:       'config:addSite',
  CONFIG_REMOVE_SITE:    'config:removeSite',
  CONFIG_GET_MONITORS:   'config:getMonitors',

  UPDATE_CHECK:          'update:check',       // renderer → main: 手動チェック
  UPDATE_INSTALL:        'update:install',     // renderer → main: 今すぐ再起動して適用
  UPDATE_CHECKING:       'update:checking',    // main → renderer: チェック中
  UPDATE_AVAILABLE:      'update:available',   // main → renderer: 新バージョンあり
  UPDATE_NOT_AVAILABLE:  'update:notAvailable',// main → renderer: 最新版
  UPDATE_PROGRESS:       'update:progress',    // main → renderer: ダウンロード進捗
  UPDATE_DOWNLOADED:     'update:downloaded',  // main → renderer: ダウンロード完了
  UPDATE_ERROR:          'update:error',       // main → renderer: エラー

  SYSTEM_CONFIGURE_FIREWALL: 'system:configureFirewall',  // renderer→main: ファイアウォール設定実行
  SYSTEM_FIREWALL_STATUS:    'system:firewallStatus',     // main→renderer: 設定済みかどうか

  AUTH_LOGIN:            'auth:login',
  AUTH_LOGOUT:           'auth:logout',
  AUTH_GET_ROLE:         'auth:getRole',
  AUTH_SET_PASSWORD:     'auth:setPassword',
  AUTH_IS_FIRST_RUN:     'auth:isFirstRun',
} as const;
