// Copyright (c) 2013, Derek Elkins
// See LICENSE.
//

var static = require('node-static');
var WebSocketServer = require('websocket').server;
var http = require('http');
var url = require('url');

var webroot = './public';
var port = 8181;

// example:
// {
//     chat: [{key: 'abc', sdp: 'v=0...', webSocket: [object]}, {key: '3', sdp: 'v=0...', webSocket: [object]}],
//     voip: [{key: '1', sdp: 'v=0...', webSocket: [object]}]
// }
var endpoints = {};

var file = new (static.Server)(webroot);

var server = http.createServer(function(request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
    var urlObj = url.parse(request.url, true);
    if(request.method === 'POST') { 
        request.setEncoding();
        var s = '';
        request.on('data', function(chunk) { s += chunk; });
        request.on('end', function() {
            console.log('Received AJAX Message: ' + s);
            //example: { endpoint: 'chat', sdp: 'v=0...' }
            var json = JSON.parse(s);
            var endpoint = json.endpoint;
            var sdp = json.sdp;
            if(endpoint && sdp && endpoint in endpoints && endpoints[endpoint].length > 0) {
                var local = endpoints[endpoint].shift();
                response.write(JSON.stringify({ sdp: local.sdp, key: local.key }));
                response.end();
                local.webSocket.sendUTF(JSON.stringify({ key: local.key, remotesdp: sdp }));
            } else {
                response.writeHead(404);
                response.end();
            }
        });
    } else if(urlObj.query.endpoint) {
        var endpoint = urlObj.query.endpoint;
        if(endpoint && endpoint in endpoints && endpoints[endpoint].length > 0) {
            var local = endpoints[endpoint][0];
            response.write(JSON.stringify({ sdp: local.sdp }));
            response.end();
        } else {
            response.writeHead(404);
            response.end();
        }
    } else {
        file.serve(request, response, function(err, result) {
            if(err) {
                response.writeHead(err.status, err.headers);
                response.end();
            }
        });
    }
}).listen(port, function() {
    console.log((new Date()) + ' Server is listening on port ' + port);
});

var wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});

function originIsAllowed(origin) {
    return origin === 'http://localhost:'+port;
}

wsServer.on('request', function(request) {
    if (!originIsAllowed(request.origin)) {
        // Make sure we only accept requests from an allowed origin
        request.reject();
        console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
        return;
    }

    var connection = request.accept('browserhub', request.origin);
    console.log((new Date()) + ' Connection accepted.');
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            console.log('Received WebSocket Message: ' + message.utf8Data);
            // example: { endpoint: 'chat', key: '1', sdp: 'v=0...' }
            var json = JSON.parse(message.utf8Data);
            if(endpoints[json.endpoint]) {
                endpoints[json.endpoint].push({key: json.key, sdp: json.sdp, webSocket: connection});
            } else {
                endpoints[json.endpoint] = [{key: json.key, sdp: json.sdp, webSocket: connection}];
            }
        }
    });
    connection.on('close', function(reasonCode, description) {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
        endpoints = {};
    });
});
