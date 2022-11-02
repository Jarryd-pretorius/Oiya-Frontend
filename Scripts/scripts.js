
const getAlarmCode = (alarmStatus) => {
    
    switch(alarmStatus) {
        case "alarmTriggered":
        return "alarm-active"
        default:
        return "alarm-inactive"
    }
}

const updateAlarmStatus = (alarmStatus) => {
   document.getElementById("alarm").className = getAlarmCode(alarmStatus)
   console.log(alarmStatus)
}

function updateMachineStatus(machineStatus) {
    const machine = document.getElementById("machine-status")
    machine.className = machineStatus
    machine.innerHTML = machineStatus
    openPopup()
}

function openPopup(message) {
    var popup = document.getElementById("myPopup");
    popup.classList.toggle("show");
    popup.innerHTML = message
    setTimeout(closePopup, 5000)
}

function closePopup() {
    var popup = document.getElementById("myPopup");
    popup.classList.toggle("show");
}

function openData() {
    var blur = document.getElementById("centerPanel")
    var popup = document.getElementById("dataPopup")
    blur.classList.toggle('active')
    popup.classList.toggle('show')
}

function importAlarmLogs(logs) {
    logs.map(() => {

    })
}

function enterTableData() {
  let amount = document.getElementById("description").value;
  let description = document.getElementById("amount").value;
  const table = [{description: description, amount: amount}]
    renderTableData("table-data")
}


function renderAlarmLogs(alarmData) {
    const tableBody = document.getElementById("alarm-data");
    let html = ''

    for(let object of dataArray) {
        html += `<tr><td>${object.time}</td><td>${object.description}</td></tr>`
    }
    tableBody.innerHTML = html
}


function renderTableData (obj) {
    const tableBody = document.getElementById("table-data");
    let html = ''
    
        html += `<tr><td>${obj.description}</td><td>${obj.value}</td></tr>`
    
    tableBody.innerHTML = html
}
