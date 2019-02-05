// rtcSignal.js ~ copyright 2019 Paul Beaudet ~ MIT License
var crypto = require('crypto');
var WebSocket = require('ws');

var user = { // definitely use a database for this
    s: [],   // array of connected clients, so long as server is up
    endChat: function(oid){
        for(var i = 0; i < user.s.length; i++){
            user.s[i].send({type: 'pool', count: 1});       // increment counter for users reconnecting
            if(user.s[i].id === oid){ user.s[i].con = ''; } // find user by oid and remove previous connection
        }
    },
    offer: function(wsID, sdp, sendFunc){                       // find a specific peer to connect with
        user.shuffle();                                         // shuffle array for a random result
        var deadUsers = [];
        var res = {type:'nomatch'};
        for(var i = 0; i < user.s.length; i++){
            if(!user.s[i].con && user.s[i].id !== wsID){
                if(user.s[i].send({type: 'offer', id: wsID, sdp: sdp})){
                    user.s[i].con = wsID;              // note who this peer is about to be connected to
                    res.type = 'match';
                    break;
                } else { deadUsers.push(i); }
            }
        }
        sendFunc(res);
        user.bringOutYouDead(deadUsers); // blow away dead users after a match is found
    },
    bringOutYouDead: function(theDead){
        for(var i = 0; i < theDead.length; i++){user.s.splice(i, 1);} // if connection was closed remove user
        user.s.forEach(function each(client){client.send({type:'pool', count: -theDead.length});}); // broadcast to others
    },
    answer: function(wsID, sdp, peerId, sendFunc){ // find a specific peer to connect with
        var res = {type:'nomatch'};
        var deadUsers = [];
        for(var i = 0; i < user.s.length; i++){
            if(!user.s[i].con && peerId === user.s[i].id){
                if(user.s[i].send({type: 'answer', id: wsID, sdp: sdp})){
                    user.s[i].con = wsID;              // note who this peer is about to be connected to
                    res.type = 'match';
                    user.s.forEach(function each(client){client.send({type:'pool', count: -2});}); // broadcast to others
                    break;
                } else { deadUsers.push(i); }
            }
        }
        sendFunc(res);
        user.bringOutYouDead(deadUsers); // blow away dead users after a match is found
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
    },
    addToPool: function(sendFunc, oid){
        var existingEntry = null;
        var newHere = true;
        var count = 1;
        for(var i = 0; i < user.s.length; i++){ // count connected users and check for douple ganger
            if(user.s[i].id === oid){          // this might occur should someone reload their page
                newHere = false;
                existingEntry = i;
            } else {
                if(!user.s[i].con){count++;}    // figure availible users
            }
        }
        if(newHere){
            user.s.forEach(function each(client){client.send({type:'pool', count: 1});}); // broadcast to others
            user.s.push({send: sendFunc, id: oid, con: ''});
        } else {
            user.s[existingEntry].send = sendFunc;
            if(user.s[existingEntry].con){
                console.log('Reloaded in the middle of a conversation?');
                user.s[existingEntry].con = ''; // might want to check this, incase of dual entrys or reloding in middle of conversation
            }
        }
        sendFunc({type:'pool', count: count});     // sends availible users in connection pool
    }
};

var socket = {
    server: null,
    init: function(port){
        socket.server = new WebSocket.Server({ port: port });
        socket.server.on('connection', function connection(ws) {
            ws.on('message', function incoming(message) {                          // handle incoming request
                socket.incoming(message, socket.send(ws));
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
    incoming: function(message, sendFunc){
        var req = {type: null};                              // defaut request assumption
        try{req = JSON.parse(message);} catch(error){console.log(error);}       // try to parse JSON if its JSON if not we have a default object
        if(req.type === 'offer'){
            user.offer(req.oid, req.sdp, sendFunc);
        } else if(req.type === 'connected'){
            if(req.oid){ user.addToPool(sendFunc, req.oid); }
            else       { console.log('malformed connection'); }
        } else if(req.type === 'answer'){
            user.answer(req.oid, req.sdp, req.peerId, sendFunc);
        } else if(req.type === 'ice'){
            user.ice(req.oid, req.canidate);
        } else if(req.type === 'disconnect'){
            user.endChat(req.oid);
        } else { console.log('thats a wooper: ' + message); }      // given message was just a string or something other than JSON
    }
};

socket.init(process.env.PORT); // set up socket server and related event handlers
