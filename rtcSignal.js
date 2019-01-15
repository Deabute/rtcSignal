// rtcSignal.js ~ copyright 2019 Paul Beaudet ~ MIT License
var crypto = require('crypto');

var user = { // definitely use a database for this
    s: [],   // array of connected clients, so long as server is up
    connect:  function(peer, me, offer){ // find a specific peer to connect with
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].id === peer && !user.s[i].con){   // if peer id matches a socket that is connected
                user.s[i].con = true;                      // set user as connected to someone
                user.s[i].ws.send(JSON.stringify({type: 'offer', from: me, offer: offer}));
                return true;
            }
        }
        return false;
    },
    rando:  function(id){ // find a specific peer to connect with
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].id !== id && !user.s[i].con){return user.s[i].id;}
        }
        return 0;
    }
};

var signal = {
    token: function(onToken){ // "its so random colisions are unlikely" sounds alot like optimism
        crypto.randomBytes(8, function onRandom(err, buffer){onToken(buffer.toString('hex'));});
    }
};

var socket = {
    server: null,
    init: function(port){
        var WebSocket = require('ws');
        socket.server = new WebSocket.Server({ port: port });
        socket.server.on('connection', function connection(ws) {
            signal.token(function(token){
                user.s.push({ws: ws, id: token, con: false});         // on token create a user
                ws.send(JSON.stringify({type:'token', data: token})); // show client what their id is so that they can share it
            });
            ws.on('message', function incoming(message) {             // handle incoming request
                var res = socket.incoming(message);
                if(res.type){ws.send(JSON.stringify(res));}           // given default response object was manipulated respond to client
            });

        });
    },
    incoming: function(message){
        var req = {type: null};                              // defaut request assumption
        try{req = JSON.parse(message);} catch(error){console.log(error);}       // try to parse JSON if its JSON if not we have a default object
        var res = {type: null};                              // default response
        if(req.type === 'offer'){                            // case where sdp and ice canidate are being traded
            if(user.connect(req.friend, req.me, req.offer)){ // given this is a legitimate connection to make
                res.type = 'match';                          // ack match
            } else {res.type = 'nomatch';}                   // ack no match was founds so client can do something different
        } else if(req.type === 'rando'){
            res.peer = user.rando(req.id);
            if(!res.peer){console.log('no peer?');}
            res.type = 'rando';
        } else {
            console.log('not JSON: ' + message);                            // given message was just a string or something other than JSON
        }
        return res;                                          // change default res object to respond to client
    }
};

socket.init(process.env.PORT); // set up socket server and related event handlers
