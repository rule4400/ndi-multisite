export const IPC = {
  STREAM_VIDEO_FRAME:    'stream:videoFrame',
  STREAM_SOURCE_LIST:    'stream:sourceList',
  STREAM_STATUS_UPDATE:  'stream:statusUpdate',
  STREAM_CONNECT_SITE:   'stream:connectSite',    // siteId, sourceName?
  STREAM_DISCONNECT_SITE:'stream:disconnectSite', // siteId
  STREAM_GET_SOURCES:    'stream:getSources',     // → NDISource[]

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

  AUTH_LOGIN:            'auth:login',
  AUTH_LOGOUT:           'auth:logout',
  AUTH_GET_ROLE:         'auth:getRole',
  AUTH_SET_PASSWORD:     'auth:setPassword',
  AUTH_IS_FIRST_RUN:     'auth:isFirstRun',
} as const;
