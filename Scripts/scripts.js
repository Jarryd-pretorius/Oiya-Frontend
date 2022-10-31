
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
    setTimeout(openPopup, 5000)
}

function openPopup() {
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
    renderTableData(table, "table-data")
}

function enterAlarmLogs(alarmData) {
    renderTableData(alarmData, "alarm-data")
}


function renderTableData (dataArray, table) {
    const tableBody = document.getElementById(table);
    let html = ''

    for(let object of dataArray) {
        html += `<tr><td>${object.amount}</td><td>${object.description}</td></tr>`
    }
    tableBody.innerHTML = html
}
