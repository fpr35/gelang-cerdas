/* app/js/rtc-config.js */
window.TELECARE_RTC = {
  stun: [
    'stun:stun.relay.metered.ca:80',
    'stun:stun.l.google.com:19302'
  ],
  servers: [
    {
      urls: [
      'turn:global.relay.metered.ca:80',
      'turns:global.relay.metered.ca:443?transport=tcp'
      ],
      username: '0582d1fd87322d87c739264a',
      credential: 'z8wyFNNibZ7nH+47'
    }
  ],
  paksaRelay: false
};