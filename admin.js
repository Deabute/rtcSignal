var WebSocket = require('ws');

var trigger = {
    start: function(){
        var ws = new WebSocket(process.env.SERVER);
        ws.on('open', function open(){
            ws.send(JSON.stringify({type: 'startup', time: process.env.TIME, pass: process.env.PASS}));
        });
    }
};

trigger.start();
