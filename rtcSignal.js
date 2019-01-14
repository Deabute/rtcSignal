// rtcSignal.js ~ copyright 2019 Paul Beaudet ~ MIT License
var crypto = require('crypto');

var user = { // definitely use a database for this
    s: [],
    connect:  function(friend, me, offer){
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].id === friend){
                user.s[i].ws.send(JSON.stringify({type: 'offer', from: me, offer: offer}));
                return true;
            }
        }
        return false;
    }
};

var signal = {
    token: function(onToken){
        crypto.randomBytes(8, function onRandom(err, buffer){
            onToken(buffer.toString('hex'));
        });
    }
};

var socket = {
    server: null,
    init: function(port){
        var WebSocket = require('ws');
        socket.server = new WebSocket.Server({ port: port });
        socket.server.on('connection', function connection(ws) {
            signal.token(function(token){
                user.s.push({ws: ws, id: token});
                ws.send(JSON.stringify({type:'token', data: token}));
            });
            ws.on('message', function incoming(message) {
                var res = socket.incoming(message);
                if(res.type){ws.send(JSON.stringify(res));}
            });

        });
    },
    incoming: function(message){
        var req = JSON.parse(message);
        var res = {type: null};
        if(req.type === 'offer'){
            if(user.connect(req.friend, req.me, req.offer) === true){
                res.type = 'connected';
            } else {res.type = 'nouser';}
        } else {
            console.log(message);
        }
        return res;
    }
};

socket.init(process.env.PORT);
