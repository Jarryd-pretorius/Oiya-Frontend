
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
}

// updateAlarmStatus("alarmTriggered")