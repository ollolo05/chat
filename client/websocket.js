window.onload = function () {

    let name = null
    while (name === "" || name === null || name === undefined){
        console.log(name)
        name = prompt("Inserisci il tuo nome","");
    }

    let socket = connect(name);



    let sendButton = document.getElementById("send-button")
    let textInputElement = document.getElementById("text-input")
    let chatBoxElement = document.getElementById("chat-box")

    sendButton.addEventListener("click", handleSend)

    textInputElement.addEventListener("keydown", handleKeyDown)

    // Listen for messages
    socket.addEventListener("message", (event) => {
        console.log(event)
        let data = JSON.parse(event.data)
        switch (data.type){
            case 'message':
                createReceivedMessage(data, chatBoxElement)
                break;
            case 'registration':
                console.log(data)
                break;
            default:
                console.log(data)
                break;
        }

    });

    function handleSend(){
        let data = {
            type: "message",
            name: name,
            text: textInputElement.value
        }
        textInputElement.value = "";
        createSentMessage(data, chatBoxElement)
        sendMessage(socket, data)
    }

    function handleKeyDown(event){
        if (event.key === "Enter"){
            handleSend()
        }
    }


}


function connect(name){
    const socket = new WebSocket("ws://localhost:8100");

    // Connection opened
    socket.addEventListener("open", (event) => {
        console.log("Connected!")
        sendRegistration(socket, name);
    });

    return socket
}

function sendRegistration(socket, name){
    let data = {
        type: "registration",
        clientId: localStorage.getItem('clientId'),
        name: name,
    }
    sendMessage(socket, data)
}

function sendMessage(socket, data){
    socket.send(JSON.stringify(data))
}

function createSentMessage(data, chatBoxElement){
    let sentMessage = document.createElement("div")
    sentMessage.className = "sent-message"

    let text = document.createElement("p")
    text.innerText = data.text

    let time = document.createElement("div")
    time.className = "time-white"
    time.innerText = getCurrentTime()

    let checkIconDiv = document.createElement("div")
    checkIconDiv.className = "check-icon"

    let checkIcon = document.createElement("img")
    checkIcon.src = "assets/check-white.svg"
    checkIcon.alt = "No image"

    checkIconDiv.appendChild(checkIcon)
    time.appendChild(checkIconDiv)
    sentMessage.appendChild(text)
    sentMessage.appendChild(time)
    let firstChild = chatBoxElement.firstChild;

    chatBoxElement.insertBefore(sentMessage, firstChild);
}

function createReceivedMessage(data, chatBoxElement){
    let receivedMessage = document.createElement("div")
    receivedMessage.className = "received-message"

    let username = document.createElement("p")
    username.className = "username"
    username.innerText = data.name

    let text = document.createElement("p")
    text.innerText = data.text

    let time = document.createElement("div")
    time.className = "time-black"
    time.innerText = getCurrentTime()

    let checkIconDiv = document.createElement("div")
    checkIconDiv.className = "check-icon"

    let checkIcon = document.createElement("img")
    checkIcon.src = "assets/check-black.svg"
    checkIcon.alt = "No image"

    checkIconDiv.appendChild(checkIcon)
    time.appendChild(checkIconDiv)
    receivedMessage.appendChild(username)
    receivedMessage.appendChild(text)
    receivedMessage.appendChild(time)
    let firstChild = chatBoxElement.firstChild;

    chatBoxElement.insertBefore(receivedMessage, firstChild);
}

function getCurrentTime() {
    const now = new Date();

    let hours = now.getHours();
    let minutes = now.getMinutes();

    hours = (hours < 10) ? `0${hours}` : hours;
    minutes = (minutes < 10) ? `0${minutes}` : minutes;

    return `${hours}:${minutes}`;
}

