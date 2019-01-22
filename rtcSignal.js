// rtcSignal.js ~ copyright 2019 Paul Beaudet ~ MIT License
var crypto = require('crypto');
var WebSocket = require('ws');

var user = { // definitely use a database for this
    s: [],   // array of connected clients, so long as server is up
    endChat: function(wsID){
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].id === wsID){          // find wsID
                user.s[i].con = '';             // remove connection from requesters obj
            } else if (user.s[i].con === wsID){ // find who is connected to wsID
                user.s[i].con = '';             // remove connection from their peer to free them up
            }
        }
    },
    sdp: function(wsID, sdp, peerID){               // find a specific peer to connect with
        if(peerID){
            for(var i = 0; i < user.s.length; i++){
                if(!user.s[i].con && peerID === user.s[i].id){
                    user.s[i].con = wsID;                      // note who this peer is about to be connected to
                    if(user.s[i].send({type: 'sdp', from: wsID, sdp: sdp})){
                        return true;                           // confirm match was made
                    } else {user.s.splice(i, 1);}              // if connection was closed remove user
                }
            }
        } else {
            for(var rando = 0; rando < user.s.length; rando++){
                if(!user.s[rando].con && user.s[rando].id !== wsID){  // if peer id matches a socket that is connected and they are not engadges in a connection
                    user.s[rando].con = wsID;                         // note who this peer is about to be connected to
                    if(user.s[rando].send({type: 'sdp', peerID: wsID, sdp: sdp})){
                        return true;
                    } else {user.s.splice(rando, 1);}                 // if connection was closed remove user
                }
            }
        } return false; // note if no match was made
    },
    ice: function(wsID, canidate){
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].con === wsID){
                if(user.s[i].send({type: 'ice', canidate: canidate})){
                    return true;                           // confirm match was made
                } else {user.s.splice(i, 1);}              // if connection was closed remove user
            }
        } return false; // disconnected from user probably
    }
};

var socket = {
    server: null,
    id: function(onToken){ // "its so random colisions are unlikely" sounds alot like optimism
        crypto.randomBytes(8, function onRandom(err, buffer){onToken(buffer.toString('hex'));});
    },
    init: function(port){
        socket.server = new WebSocket.Server({ port: port });
        socket.server.on('connection', function connection(ws) {
            socket.id(function(wsID){
                // ws.con = ''; ws.id = wsID; // seems like it could work this way?
                user.s.push({send: socket.send(ws), id: wsID, con: false});         // on token create a user
                ws.send(JSON.stringify({type:'token', data: wsID})); // show client what their id is so that they can share it
                ws.on('message', function incoming(message) {             // handle incoming request
                    var res = socket.incoming(wsID, message);
                    if(res.type){ws.send(JSON.stringify(res));}           // given default response object was manipulated respond to client
                });
            });
        });
    },
    send: function(ws){
        return function(msgObj){
            var msg = '';
            try{msg = JSON.stringify(msgObj);}catch(err){console.log(error);}
            if(ws.readyState === WebSocket.OPEN){
                ws.send(msg);
                return true;
            } else { return false; }
        };
    },
    incoming: function(wsID, message){
        var req = {type: null};                              // defaut request assumption
        try{req = JSON.parse(message);} catch(error){console.log(error);}       // try to parse JSON if its JSON if not we have a default object
        var res = {type: null};                              // default response
        if(req.type === 'sdp'){
            if(user.sdp(wsID, req.sdp, req.peerID)){
                res.type = 'match';
            } else {res.type = 'nomatch';}
        } else if(req.type === 'ice'){
            user.ice(wsID, req.canidate);
        } else if(req.type === 'disconnect'){
            user.endChat(wsID);
        } else {
            console.log('thats a wooper: ' + message);       // given message was just a string or something other than JSON
        }
        return res;                                          // change default res object to respond to client
    }
};

socket.init(process.env.PORT); // set up socket server and related event handlers
