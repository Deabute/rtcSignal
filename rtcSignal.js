// rtcSignal.js ~ copyright 2019 Paul Beaudet ~ MIT License

var socket = {
    server: null,
    init: function(port){
        var WebSocket = require('ws');
        socket.server = new WebSocket.Server({ port: port });
        socket.server.on('connection', function connection(ws) {
          ws.on('message', function incoming(message) {
            console.log('received: %s', message);
          });
          ws.send('something');
        });
    }
};

socket.init(process.env.PORT);
