// rtcSignal.js ~ copyright 2019 Paul Beaudet ~ MIT License
var crypto = require('crypto');
var WebSocket = require('ws');

var user = { // definitely use a database for this
    s: [],   // array of connected clients, so long as server is up
    pause: function(oid, sendFunc){
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].id === oid){
                user.s[i].con = 'done';
                return;
            }  // find user by oid and remove previous connection
        }
    },
    rematch: function(oid, sendFunc){
        var free = 1; // there is at least one connection (requesting client)
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].id === oid){user.s[i].con = '';}
            else if(!user.s[i].con) {free++;}
        }
        if(free % 2 === 0){ sendFunc({type:'makeOffer'}); }
    },
    offer: function(oid, sdp, sendFunc){                       // find a specific peer to connect with
        user.shuffle();                                        // shuffle array for a random result
        var deadUsers = [];
        var res = {type:'nomatch'};
        var match = '';
        for(var i = 0; i < user.s.length; i++){
            if(!user.s[i].con && user.s[i].active && user.s[i].id !== oid){ // able, active, not self
                if(user.s[i].send({type: 'offer', id: oid, sdp: sdp})){
                    user.s[i].con = oid;              // note who this peer is about to be connected to
                    res.type = 'match';
                    match = user.s[i].id;
                    break;
                } else { deadUsers.push(i); }
            }
        }
        if(match){
            for(var u = 0; u < user.s.length; u++){
                if(user.s[u].id === oid){
                    user.s[u].con = match;
                    break;
                }
            }
        }
        sendFunc(res);
        user.bringOutYouDead(deadUsers); // blow away dead users after a match is found
    },
    bringOutYouDead: function(theDead){
        if(theDead.length){
            console.log('deadcount: ' + theDead.length);
            var activeDead = 0;
            for(var i = 0; i < theDead.length; i++){ if(theDead[i].active){activeDead++;} }
            theDead.forEach(function eachDead(dead){user.s.splice(dead, 1);}); // if connection was closed remove user
            if(activeDead){
                user.s.forEach(function eachRemaining(client){
                    console.log(client.id + ' got sent a reduce');
                    client.send({type:'pool', count: -activeDead});
                }); // broadcast to others
            }
        }
    },
    answer: function(oid, sdp, peerId, sendFunc){ // find a specific peer to connect with
        var res = {type:'nomatch'};
        var deadUsers = [];
        for(var i = 0; i < user.s.length; i++){
            if(peerId === user.s[i].id){
                if(user.s[i].send({type: 'answer', id: oid, sdp: sdp})){
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
};

var pool = {
    reduce: function(oid){
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].id === oid){user.s[i].active = false;}
            user.s[i].send({type: 'pool', count: -1}); // notify users a new connection has been added to pool
        }
    },
    add: function(oid, sendFunc, amount){
        var deadUsers = [];
        var pool = 0;
        var free = 0;
        // console.log('about to add total ' + user.s.length);
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].id === oid){
                user.s[i].con = '';
                user.s[i].active = true;
                pool++; free++;
            } else {
                if(user.s[i].send({type: 'pool', count: amount})){ // sending zero make be wastefull, but we need to check and increment
                    if(user.s[i].active){pool++;}                  // count active participants able to be match
                    if(!user.s[i].con)  {free++;}
                    console.log(user.s[i].id + ' got sent pool increment');
                } else {
                    console.log('could not sent to ' + user.s[i].id);
                    deadUsers.push(i);
                }         // notify all users a new connection has been added to pool
            }
        }
        console.log(oid + ' saw ' + pool + ' in the pool');
        console.log(oid + ' saw ' + free + ' as free connections');
        if(free % 2 === 0){sendFunc({type:'makeOffer', pool: pool});}
        else {sendFunc({type:'pool', count: pool});}
        user.bringOutYouDead(deadUsers); // blow away dead users after a match is found
    },
    join: function(oid, sendFunc){
        var newUser = true;
        var addToPool = 1;
        console.log('new user ' + oid + ' being added');
        for(var i = 0; i < user.s.length; i++){ // count connected users and check for douple ganger
            if(user.s[i].id === oid){          // this might occur should someone reload their page
                newUser = false;
                user.s[i].send = sendFunc;
                if(user.s[i].active){
                    console.log('everyone thinks this user was active before, not adding them to pool');
                    addToPool = 0;
                }
                // TODO if previous connection can reconnect?
            }
        }
        if(newUser){user.s.push({send: sendFunc, id: oid, con: '', active: true});}
        pool.add(oid, sendFunc, addToPool);
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
            if(req.oid){ pool.join(req.oid, sendFunc); }
            else       { console.log('malformed connection'); }
        } else if(req.type === 'answer'){
            user.answer(req.oid, req.sdp, req.peerId, sendFunc);
        } else if(req.type === 'ice'){
            user.ice(req.oid, req.candidate);
        } else if(req.type === 'unmatched'){
            user.rematch(req.oid, sendFunc);
        } else if(req.type === 'repool'){
            pool.add(req.oid, sendFunc, 1);
        } else if(req.type === 'reduce'){
            pool.reduce(req.oid);
        } else if(req.type === 'pause'){
            user.pause(req.oid, sendFunc);
        } else { console.log('thats a wooper: ' + message); }      // given message was just a string or something other than JSON
    }
};

socket.init(process.env.PORT); // set up socket server and related event handlers
