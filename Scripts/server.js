// var http = require('http');
// var fs = require('fs');

// const PORT=8000; 


// fs.readFile('../html/index.html', function (err, html) {

//     if (err) throw err;    

//     http.createServer(function(request, response) {  
//         response.writeHeader(200, {"Content-Type": "text/html"});  
//         response.write(html);  
//         response.end();  
//     }).listen(PORT);
// });


document.addEventListener('DOMContentLoaded', function(){

    const websocketClient = new WebSocket("ws://localhost:8500/")

    const descriptionInput = document.getElementById("description")
    const amountInput = document.getElementById("amount")
    const dataButton = document.getElementById("data-button")

    websocketClient.onopen = function(){
        console.log("client connected")

        dataButton.onclick = function(){
            websocketClient.send(JSON.stringify({
                name: "input",
                description: descriptionInput.value,
                value: amountInput.value
            }))
        }

        websocketClient.onmessage = function(message) {
            console.log(message)
            const data = JSON.parse(message.data)
            console.log(data)

            switch(data.name) {
                case "input":
                    return renderTableData(data)
                case "notification":
                    return openPopup(data.message)
                default:
                    return
            }
        }


    }


}, false)