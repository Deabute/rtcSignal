// rtcSignal.js ~ copyright 2019 Paul Beaudet ~ MIT License


var webS = {
    ocket: require('ws'),
    ocketServer: null,
    init: function(port){
        webS.ocketServer = new webS.ocket({ port: port });
        webS.ocketServer.on('connection', function connection(ws) {
          ws.on('message', function incoming(message) {
            console.log('received: %s', message);
          });
          ws.send('something');
        });
    }
};
