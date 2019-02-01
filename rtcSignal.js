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
    offer: function(wsID, sdp){                                 // find a specific peer to connect with
        user.shuffle();                                         // shuffle array for a random result
        for(var i = 0; i < user.s.length; i++){
            if(!user.s[i].con && user.s[i].id !== wsID){
                if(user.connect(wsID, 'offer', i, sdp)){return true;}
            }
        } return false;
    },
    connect: function(wsID, type, index, sdp){
        user.s[index].con = wsID;                  // note who this peer is about to be connected to
        if(user.s[index].send({type: type, id: wsID, sdp: sdp})){
            return true;                           // confirm match was made
        } else {
            user.s.splice(index, 1);              // if connection was closed remove user
            return false;
        }
    },
    answer: function(wsID, sdp, friendId){               // find a specific peer to connect with
        for(var i = 0; i < user.s.length; i++){
            if(!user.s[i].con && friendId === user.s[i].id){
                if(user.connect(wsID, 'answer', i, sdp)){return true;}
            }
        } return false;
    },
    ice: function(wsID, canidate){
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].con === wsID){
                if(user.s[i].send({type: 'ice', canidate: canidate})){
                    return true;                           // confirm match was made
                } else {user.s.splice(i, 1);}              // if connection was closed remove user
            }
        } return false; // disconnected from user probably
    },
    shuffle: function(){
        for(var i = user.s.length - 1; i > 0; i--){
            var randIndex = Math.floor(Math.random() * (i + 1));
            var placeholder = user.s[i];
            user.s[i] = user.s[randIndex];
            user.s[randIndex] = placeholder;
        }
    }
};

var socket = {
    server: null,
    init: function(port){
        socket.server = new WebSocket.Server({ port: port });
        socket.server.on('connection', function connection(ws) {
            ws.on('message', function incoming(message) {                          // handle incoming request
                socket.incoming(message, ws);
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
    incoming: function(message, ws){
        var req = {type: null};                              // defaut request assumption
        try{req = JSON.parse(message);} catch(error){console.log(error);}       // try to parse JSON if its JSON if not we have a default object
        var res = {type: null};                              // default response
        if(req.type === 'offer'){
            if(user.offer(req.oid, req.sdp)){
                res.type = 'match';
            } else {res.type = 'nomatch';}
        } else if(req.type === 'connected'){
            if(req.oid){
                user.s.push({send: socket.send(ws), id: req.oid, con: ''});
            } else {console.log('malformed connection');}
        } else if(req.type === 'answer'){
            if(user.answer(req.oid, req.sdp, req.friendId)){
                res.type = 'match';
            } else {res.type = 'nomatch';}
        } else if(req.type === 'ice'){
            user.ice(req.oid, req.canidate);
        } else if(req.type === 'disconnect'){
            user.endChat(req.oid);
        } else {
            console.log('thats a wooper: ' + message);       // given message was just a string or something other than JSON
        }
        if(res.type){socket.send(ws)(res);}                 // given default response object was manipulated respond to
    }
};

socket.init(process.env.PORT); // set up socket server and related event handlers
