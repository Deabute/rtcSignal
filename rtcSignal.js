// rtcSignal.js ~ copyright 2019 Paul Beaudet ~ MIT License
var crypto = require('crypto');
var WebSocket = require('ws');

var user = { // definitely use a database for this
    s: [],   // array of connected clients, so long as server is up
    pause: function(oid, sendFunc){
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].id === oid){
                if(user.s[i].con){ user.s[i].con = 'done';}
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
        if(free % 2 === 0){ sendFunc({action:'makeOffer'}); }
    },
    offer: function(oid, sdp, sendFunc, lastMatches){          // find a specific peer to connect with
        user.shuffle();                                        // shuffle array for a random result
        var deadUsers = [];
        var res = {action:'nomatch'};
        var match = '';
        for(var i = 0; i < user.s.length; i++){
            if(lastMatches){
                if(!user.s[i].con && user.s[i].active && user.s[i].id !== oid && lastMatches[0] !== user.s[i].id){ // able, active, not self
                    if(user.s[i].send({action: 'offer', id: oid, sdp: sdp, gwid: 'erm'})){
                        user.s[i].con = oid;              // note who this peer is about to be connected to
                        res.action = 'match';
                        match = user.s[i].id;
                        break;
                    } else { deadUsers.push(i); }
                }
            } else {
                if(!user.s[i].con && user.s[i].active && user.s[i].id !== oid){ // able, active, not self
                    if(user.s[i].send({action: 'offer', id: oid, sdp: sdp, gwid: 'erm'})){
                        user.s[i].con = oid;              // note who this peer is about to be connected to
                        res.action = 'match';
                        match = user.s[i].id;
                        break;
                    } else { deadUsers.push(i); }
                }
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
            var activeDead = 0;
            for(var i = 0; i < theDead.length; i++){ if(theDead[i].active){activeDead++;} }
            theDead.forEach(function eachDead(dead){user.s.splice(dead, 1);}); // if connection was closed remove user
            if(activeDead){
                user.s.forEach(function eachRemaining(client){
                    client.send({action:'pool', count: -activeDead});
                }); // broadcast to others
            }
        }
    },
    answer: function(oid, sdp, peerId, sendFunc){ // find a specific peer to connect with
        var res = {action:'nomatch'};
        var deadUsers = [];
        for(var i = 0; i < user.s.length; i++){
            if(peerId === user.s[i].id){
                if(user.s[i].send({action: 'answer', id: oid, sdp: sdp, gwid: 'erm'})){
                    res.action = 'match';
                    break;
                } else { deadUsers.push(i); }
            }
        }
        sendFunc(res);
        user.bringOutYouDead(deadUsers); // blow away dead users after a match is found
    },
    ice: function(oid, candidates){
        var deadUsers = [];
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].con === oid){
                if(user.s[i].send({action: 'ice', candidates: candidates})){
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
    freeOffers: 0,
    reduce: function(oid, pause){
        var deadUsers = [];
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].id === oid){
                user.s[i].active = false;
                if(pause){user.s[i].con = 'done';}         // don't connect anyone to this client until they are ready
            }
            if(user.s[i].send({action: 'pool', count: -1})){ // notify users a new connection has been added to pool
            } else {deadUsers.push(i);}
        }
        user.bringOutYouDead(deadUsers); // blow away dead users after a match is found
    },
    add: function(oid, sendFunc, amount, lastMatches){
        var deadUsers = [];
        var conP = 0;
        var free = 0;
        var matchPotential = 0;
        for(var i = 0; i < user.s.length; i++){
            if(user.s[i].id === oid){
                console.log('existing user');
                user.s[i].con = '';
                user.s[i].active = true;
                user.s[i].send = sendFunc;
                conP++; free++;
            } else {
                if(user.s[i].send({action: 'pool', count: amount})){ // sending zero make be wastefull, but we need to check and increment
                    if(lastMatches){
                        if(user.s[i].id !== lastMatches[0]){matchPotential++; console.log('adding potential');}
                    } else {matchPotential++; console.log('adding potential');}
                    if(user.s[i].active){conP++;}                  // count active participants able to be match
                    if(!user.s[i].con)  {free++;}
                } else { deadUsers.push(i); }                      // notify all users a new connection has been added to pool
            }
        }
        function match(fromFreeOffer){
            if(matchPotential){
                console.log('making match potential offer');
                if(fromFreeOffer){pool.freeOffers--;}
                sendFunc({action:'makeOffer', pool: conP});
            } else { // no potential match
                console.log('no match no potential');
                pool.freeOffers++;
                sendFunc({action:'setPool', pool: conP});
            }
        }
        if(pool.freeOffers){
            match(true);}
        else if(free % 2 === 0){
            console.log('typical match case, divisable by two');
            match(false);}
        else {sendFunc({action:'setPool', pool: conP});}
        user.bringOutYouDead(deadUsers); // blow away dead users after a match is found
    },
    join: function(oid, sendFunc, lastMatches){
        var newUser = true;
        var addToPool = 1;
        for(var i = 0; i < user.s.length; i++){ // count connected users and check for douple ganger
            if(user.s[i].id === oid){          // this might occur should someone reload their page
                newUser = false;
                user.s[i].send = sendFunc;
                if(user.s[i].active){addToPool = 0;}// TODO if previous connection can reconnect?
            }
        }
        if(newUser){user.s.push({send: sendFunc, id: oid, con: '', active: true});}
        pool.add(oid, sendFunc, addToPool, lastMatches);
    }
};

var socket = {
    server: null,
    open: true,
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
        var req = {action: null};                              // defaut request assumption
        try{req = JSON.parse(message);} catch(error){console.log(error);}       // try to parse JSON if its JSON if not we have a default object
        if(socket.open){
            if(req.action === 'offer'){
                user.offer(req.oid, req.sdp, sendFunc, req.lastMatches);
            } else if(req.action === 'connected'){
                if(req.oid){ pool.join(req.oid, sendFunc, req.lastMatches); console.log(req.oid + ' ');}
                else       { console.log('malformed connection'); }
            } else if(req.action === 'answer'){
                user.answer(req.oid, req.sdp, req.peerId, sendFunc);
            } else if(req.action === 'ice'){
                user.ice(req.oid, req.candidates);
            } else if(req.action === 'unmatched'){
                user.rematch(req.oid, sendFunc);
            } else if(req.action === 'repool'){
                pool.add(req.oid, sendFunc, 1, req.lastMatches);
            } else if(req.action === 'reduce'){
                pool.reduce(req.oid, req.pause);
            } else if(req.action === 'pause'){
                user.pause(req.oid, sendFunc);
            } else if(req.action === 'error'){
                console.log('client error: ' + req.error);
            } else { console.log('thats a wooper: ' + message); }      // given message was just a string or something other than JSON
        }
        if(req.action === 'startup'){
            if(req.pass === process.env.PASS){
                socket.open = true;
                setTimeout(function(){
                    socket.open = false;
                }, req.time);
            }
        }
    }
};

socket.init(process.env.PORT); // set up socket server and related event handlers
