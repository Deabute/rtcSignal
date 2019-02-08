// rtcSignal.js ~ copyright 2019 Paul Beaudet ~ MIT License
var crypto = require('crypto');
var WebSocket = require('ws');

var user = { // definitely use a database for this
    s: [],   // array of connected clients, so long as server is up
    endChat: function(oid, sendFunc){
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].id === oid){
                user.s[i].con = '';
                return;
            }  // find user by oid and remove previous connection
        }
    },
    rematch: function(oid, sendFunc){
        var count = 1;
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].id === oid){user.s[i].active = true;}
            else if(user.s[i].active){count++;}
        }
        if(count % 2 === 0){ sendFunc({type:'makeOffer'}); }
    },
    repool: function(oid, sendFunc){
        var count = 1;
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].id === oid){user.s[i].active = true;}
            else if(user.s[i].active){count++;}
            user.s[i].send({type: 'pool', count: 1}); // notify users a new connection has been added to pool
        }
        if(count % 2 === 0){ sendFunc({type:'makeOffer'}); }
    },
    offer: function(wsID, sdp, sendFunc){                       // find a specific peer to connect with
        user.shuffle();                                         // shuffle array for a random result
        var deadUsers = [];
        var res = {type:'nomatch'};
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].active && user.s[i].id !== wsID){
                if(user.s[i].send({type: 'offer', id: wsID, sdp: sdp})){
                    user.s[i].active = false;
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
        user.s.forEach(function each(client){
            console.log(client.id + ' got sent a reduce');
            client.send({type:'pool', count: -theDead.length});
        }); // broadcast to others
    },
    answer: function(wsID, sdp, peerId, sendFunc){ // find a specific peer to connect with
        var res = {type:'nomatch'};
        var deadUsers = [];
        for(var i = 0; i < user.s.length; i++){
            if(peerId === user.s[i].id){
                if(user.s[i].send({type: 'answer', id: wsID, sdp: sdp})){
                    user.s[i].active = false;
                    user.s[i].con = wsID;              // note who this peer is about to be connected to
                    res.type = 'match';
                    break;
                } else { deadUsers.push(i); }
            }
        }
        sendFunc(res);
        user.bringOutYouDead(deadUsers); // blow away dead users after a match is found
    },
    ice: function(oid, candidate){
        var deadUsers = [];
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].con === oid){
                if(user.s[i].send({type: 'ice', candidate: candidate})){
                    return true;                           // confirm match was made
                } else { deadUsers.push(i); }              // if connection was closed remove user
            }
        }
        user.bringOutYouDead(deadUsers);
        return false; // disconnected from user probably
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
        var active = false;
        var newHere = true;
        var count = 0;
        console.log('new user ' + oid + ' being added');
        for(var i = 0; i < user.s.length; i++){ // count connected users and check for douple ganger
            if(user.s[i].id === oid){          // this might occur should someone reload their page
                user.s[i].send = sendFunc;
                if(user.s[i].active){active = true;}
                user.s[i].active = true;
                user.s[i].con = '';
                newHere = false;
            } else if(user.s[i].active){
                console.log('user ' + user.s[i].id + ' is active');
                count++;}    // figure availible users
        }
        if(!active){
            user.s.forEach(function each(client){
                if(client.id !== oid){
                    console.log(client.id + 'got sent an increment');
                    client.send({type:'pool', count: 1});
                }
            }); // broadcast to others not user
            count++;
            if(newHere){user.s.push({send: sendFunc, id: oid, con: '', active: true});}
        }
        if(count && count % 2 === 0){sendFunc({type:'makeOffer'}); }
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
            user.ice(req.oid, req.candidate);
        } else if(req.type === 'unmatched'){
            user.rematch(req.oid, sendFunc);
        } else if(req.type === 'unpool'){
            user.s.forEach(function each(client){client.send({type:'pool', count: -1});});
        } else if(req.type === 'repool'){
            user.repool(req.oid, sendFunc);
        } else if(req.type === 'chatEnd'){
            user.endChat(req.oid, sendFunc);
        } else { console.log('thats a wooper: ' + message); }      // given message was just a string or something other than JSON
    }
};

socket.init(process.env.PORT); // set up socket server and related event handlers
