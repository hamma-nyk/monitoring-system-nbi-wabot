const Service = require('node-windows').Service
console.log('Starting service...')
const svc = new Service({
	name: 'MonitoringBOT',
	description: 'WhatsappBOT Service',
	script: 'D:\\PROJECT\\monitoring-bot\\server.js'
})

svc.on('install', function(){
	svc.start()
})

svc.install()