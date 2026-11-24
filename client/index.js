import WebSocket, { WebSocketServer } from 'ws';

const url = 'mongodb://localhost:27017';

const dbName = 'realTimeChat'

const wss = new WebSocketServer({ port: 8100 });
let connectedClients = []

function heartbeat() {
    this.isAlive = true;
}

const interval = setInterval(function ping() {
    console.log(" ")
    updateConnectedClient(wss);
    wss.clients.forEach(function each(ws) {
        console.log(ws.name + " " + ws.clientId + " " + ws.isAlive)
        if (ws.isAlive === false) {
            console.log(ws.name + " disconnected!")
            sendDeregistrationToClients(wss, ws.clientId)
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 3000);

wss.on('connection', function connection(ws, req) {
    ws.isAlive = true;
    //console.log("New connection!")

    ws.on('error', console.error);
    ws.on('pong', heartbeat);

    sendRegisteredClients(wss, ws)

    ws.on('message', function message(data, isBinary) {
        let parsedData = JSON.parse(data)
        //console.log("New message: " + data)

        if(parsedData.type === "registration"){
            ws.clientId = parsedData.clientId
            ws.name = parsedData.name
            addConnectedClient(parsedData)
        }

        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(data, { binary: isBinary });
            }
        });
    });
});

function sendRegisteredClients(wss, ws){
    wss.clients.forEach(function each(client){
        if(client !== ws && client.readyState === WebSocket.OPEN){
            let data = {
                type: "registration",
                name: client.name,
                clientId: client.clientId
            }
            ws.send(JSON.stringify(data))
        }
    })
}

function sendDeregistrationToClients(wss, clientId){
    wss.clients.forEach(function each(client){
        if(client.readyState === WebSocket.OPEN){
            let data = {
                type: "deregistration",
                clientId: clientId
            }
            client.send(JSON.stringify(data))
        }
    })
}

function addConnectedClient(clientData){
    connectedClients.push({
        clientId: clientData.clientId
    })
}

function updateConnectedClient(wss){
    let tempList = []
    wss.clients.forEach(function each(client){
        if(client.isAlive){
            tempList.push(client)
        }
    })

    connectedClients.forEach(function each(client){
        let findedClient = tempList.find(it => it.clientId === client.clientId);
        if(!findedClient){
            console.log(findedClient)
            sendDeregistrationToClients(wss, client.clientId)
        }
    })

    connectedClients = tempList
}





