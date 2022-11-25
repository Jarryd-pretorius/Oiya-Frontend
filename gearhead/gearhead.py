#!/usr/bin/python3

import traceback
import os
import time
import concurrent.futures
import queue
import asyncio
import websockets
import json
import functools
from .ghdef import *
from . import ghdef

def threadInit(m,d):
	# run this function in its own runloop on this thread
	asyncio.run(threadLoop(m,d))

async def threadLoop(m,d):
	d.loop = asyncio.get_running_loop()
	await d.inst.handleLoop(m,d)


async def wsConn(ws):
	print('Got WS conn',ws)
	ws.watches = {}
	try:
		async for m in ws:
			print('Got message',m)
			mj = json.loads(m)
			reqFunc = mj.get('req')
			reqCoro = globals().get('handleWS_'+reqFunc) if type(reqFunc) == str else None
			if not reqCoro: return print('Unknown req func',reqFunc)
			await reqCoro(ws,mj)
	except Exception as e:
		traceback.print_exc()
		print('Err WS conn',e,)
	else:
		print('End WS conn')
	for k in ws.watches.keys():
		machinesByName[k].watches.remove(ws)
	ws.watches = {}

async def handleWS_machines(ws,mj):
	await ws.send(json.dumps({'req':'machines','status':'OK','res':list([m.name for m in gear.machines])}))

async def handleWS_spec(ws,mj):
	m = machinesByName[mj['machine']]
	await ws.send(json.dumps({'req':'spec','status':'OK','machine':m.name,'res':m.spec.__dict__}))

async def handleWS_watch(ws,mj):
	m = machinesByName[mj['machine']]
	ws.watches[m.name] = Base(last=[0.,0.],state={},task=[0,0])
	if ws not in m.watches:		# ws might watch again if it lost full state somehow
		m.watches.append(ws)
	await updateWatcher(ws,m,m.state,1)

async def updateWatcher(ws,m,mup,bigun):
	# ensure socket did not disappear while we waited to be run
	wr = ws.watches.get(m.name)
	if not wr: return

	# if this watch is already waiting for time then accumulate our data and get out
	if wr.task[bigun]:
		if not bigun: dict_updeep(wr.sacc,mup)
		return

	# wait if we updated too recently (coroutine thinking!)
	tnow = gear.loop.time()
	timeToWait = wr.last[bigun]+(0.1,1.)[bigun] - tnow
	if timeToWait > 0.:
		print('updateWatcher sleeping',bigun,timeToWait)
		wr.task[bigun] = 1
		wr.sacc = {}
		await asyncio.sleep(timeToWait)
		if not ws.watches.get(m.name): return	# disappeared while waiting
		wr.task[bigun] = 0
		if not bigun:
			dict_updeep(mup,wr.sacc)
			wr.sacc = {}
		else:
			mup = m.state

	# send the socket all values changed from what it has
	wup = dict_ups(mup,wr.state)	# deep updates search
	if not wup: return	# nothing to change

	# okay going ahead with this update!
	wr.last[bigun] = tnow
	#wr.state.update(wup)
	dict_updeep(wr.state,wup)		# deep update
	await ws.send(json.dumps({'req':'watch','status':'OK','res':wup}))
	print('Updated watcher with',wup)

async def updateWatchers(m,mup,bigun,hard=False):
	# react to the latest state if update sensed from hardware
	# no awaits here lest updates get out of order
	if hard: reactState(m, DictSnoop(m.state,mup))
	# schedule informing all watchers concurrently rather than sequentially
	await asyncio.gather(storeHistory(m,mup),*(updateWatcher(ws,m,mup,bigun) for ws in m.watches))
	# could just create_task for them all as we do not care about the result,
	#  but since we are running in our own task anyway, no harm in using gather


async def handleWS_fetch(ws,mj):
	m = machinesByName[mj['machine']]
	ok = await m.inst.handleFetch(mj['fetch'],mj.get('args'))
	await ws.send(json.dumps({'req':'fetch','status':'OK' if ok is True else ('Fail' if not ok else str(ok))}))

async def handleWS_sched(ws,mj):
	m = machinesByName[mj['machine']]
	move = mj['move']
	if move[0] in 'aspo' and move[1] in 'as':
		ok = True
		sw = DictSnoop(m.state)
		if move[0] != 'a':
			ok &= clearParts(m,sw,mj['uids'],move[0]+'head')
		if ok and move[1] != 'a':
			ok &= schedParts(m,sw,mj['uids'],mj.get('next'))
		if sw._u: await updateWatchers(m,sw._u,0)
	else: ok = False
	await ws.send(json.dumps({'req':'sched','status':'OK' if ok else 'Fail'}))

def schedParts(m,sw,uids,uidb=None):		# like insertBefore
	s = m.state
	uids = list(uid for uid in uids if not s['parts'][uid].get('int'))
	if not uids: return True

	# ensure not already in some list
	tails = []
	for k in ('shead','phead','ohead'):
		uidl = s[k]
		if uidl:
			while (uidn:=s['parts'][uidl]['next']): uidl = uidn
			tails.append(uidl)
	for uid in uids:
		if not s['parts'].get(uid) or s['parts'][uid].get('next'): return False
		if uid in tails: return False

	# best structure for minimal changes on reordering is... a linked list
	uidl = s['shead']
	if not uidl and s['mode'] >= modes.manual: return False # cannot first sched in run mode
	if uidl == uidb: uidl = None
	elif uidl:	# find the part before which we are inserting the uids
		while uidl and (uidn:=s['parts'][uidl]['next']) != uidb: uidl = uidn
		if not uidl: return False	# uidb specified but not in sched list

	for uid in uids:
		if uidl: sw['parts'][uidl]['next'] = uid
		else: sw['shead'] = uid
		uidl = uid
	sw['parts'][uidl]['next'] = uidb
	return True

def clearParts(m,sw,uids,khead):
	if not uids: return True

	s = m.state
	if s['mode'] > modes.stop:
		logAdd(m,sw,2,'M001','Must stop Run to clear schedule')
		return False

	uidd = {}
	for uid in uids: uidd[uid] = 1

	uidi, uidp = s[khead], None
	if not uidi: return False

	while True:
		uidn = s['parts'][uidi].get('next')
		if uidi in uidd:
			del uidd[uidi]
			sw['parts'][uidi]['next'] = None
			if uidp: sw['parts'][uidp]['next'] = uidn
			else: sw[khead] = uidn
		else:
			uidp = uidi
		if not uidn: break
		uidi = uidn
	return len(uidd) == 0
	

async def handleWS_mode(ws,mj):
	m = machinesByName[mj['machine']]
	if m.modeExt:
		await m.inst.handleModeReq(int(mj['want']),mj.get('down'))
		return await ws.send(json.dumps({'req':'mode','status':'OK'}))
	if m.modeUp is not None:
		return await ws.send(json.dumps({'req':'mode','status':'Busy'}))
	m.modeUp = 1
	sw = DictSnoop(m.state)
	ok = await switchMode(m,int(mj['want']),sw)		# avoid 'try' so exception breaks us
	if sw._u: await updateWatchers(m,sw._u,0)
	m.modeUp = None
	# client should enforce only one outstanding mode request, so no need to identify it here
	await ws.send(json.dumps({'req':'mode','status':('OK' if ok else 'Fail')}))	# logged if failed

async def switchMode(m,mnew,sw):
	if m.modeExt: return	# should not be called anyway
	s = m.state
	mold = s['mode']

	onWant, onHave = mnew > modes.off, mold > modes.off
	runWant, runHave = mnew > modes.stop, mold > modes.stop

	if not runWant and runHave:
		sw['hopm'] = 0
		sw['mode'] = modes.stop
		m.inst.handleHop()

	if onWant != onHave:
		if not await m.inst.handlePower(onWant): return
		sw['mode'] = modes.stop if onWant else modes.off
		if not onWant: return True
	
	if runWant and mnew != mold:
		if s['alarm']:
			logAdd(m,sw,2,'M002','Must acknowledge alarms to Run')
			return False
		if not (s['phead'] or s['shead']):	# beginNextHop would stop us anyway
			logAdd(m,sw,2,'M003','Need schedule or work to Run')
			return False
		sw['mode'] = mnew
		if mnew == modes.manual and mold > modes.manual:
			sw['hopm'] = 0
			m.inst.handleHop()
		elif mnew == modes.semi and mold == modes.full:
			sw['hopm'] = hopms.move if m.hopop != toolOps.ripe else hopms.tool
			m.inst.handleHop()
		reactState(m,sw)	# trigger next part and hop

	print('Switch mode: old %d, req %d, new %d' % (mold,mnew,s['mode']))
	return True


def logAdd(m,sw,lev,code,*args):
	k = '%.6f'%time.time()
	obj = Base(l=lev,c=code,m=' '.join(str(a) for a in args))
	while k in m.state['log']:
		k = '%.6f'%time.time()	# spinwait 1us hopefully acceptable :)
	if lev == 9:
		obj.unack = 1
		sw['alarm'] = m.state['alarm']+1
	sw['log'][k] = obj.__dict__

async def logAddAndUpdate(m,lev,code,*args):
	sw = DictSnoop(m.state)
	logAdd(m,sw,lev,code,*args)
	await updateWatchers(m,sw._u,0)

def logOff(m,sw,lev,code,*args):
	if lev != 9: return
	s = m.state
	for k in s['log']:
		if (ld:=s['log'][k])['c'] == code and ld['unack']:
			sw['log'][k]['unack'] = 0
			sw['alarm'] = s['alarm']-1

async def handleWS_alack(ws,mj):
	m = machinesByName[mj['machine']]
	ks = mj['ks']
	sw = DictSnoop(m.state)
	for k in (ks if not m.modeExt else []):
		if (ld:=m.state['log'].get(k)) and ld.get('unack') == 1:
			sw['log'][k]['unack'] = 0	# otherwise just ignore it yeah, maybe log trimmed
			sw['alarm'] = m.state['alarm']-1
	await m.inst.handleAlack()
	if sw._u: await updateWatchers(m,sw._u,0)
	await ws.send(json.dumps({'req':'alack','status':'OK'}))

def logRecover(m):
	# if this breaks (e.g. duplicate codes, parameterised messages) just move loglv into m.state...
	s = m.state
	for k, ld in s.get('log',{}).items():
		if ld['l'] != 9 or not ld['unack']: continue
		bsee = (9,ld['c'],ld['m'])
		for kp, bits in m.logms.items():
			for bi in range(len(bits)):
				if bits[bi] == bsee: m.loglv[kp] = m.loglv.get(kp,0) | (1<<bi)

def reactState(m,sw):
	# note: we piggyback on to an update from the hardware, so we must use sw for state writes;
	#  changes are reflected immediately in m.state
	s = m.state

	# check and update log and alarms
	loga = []
	for kp, bits in m.logms.items():	# not certain this is the best format
		nv = functools.reduce(lambda d, k:d[k],kp,s)
		if (ov:=m.loglv.get(kp,0)) == nv or nv is None: continue
		for bi in range(len(bits)):
			if (nvb:=(nv & (1<<bi))) == (ov & (1<<bi)): continue
			elif nvb: logAdd(m,sw,*bits[bi])
			else: logOff(m,sw,*bits[bi])
		m.loglv[kp] = nv
		loga.append(kp)
	if loga: m.inst.handleLogged(loga)

	# stop if alarmed
	if not m.modeExt and s['mode'] > modes.stop and s['alarm']:
		if s['hopm']:
			sw['hopm'] = 0
			m.inst.handleHop()
		sw['mode'] = modes.stop
		logAdd(m,sw,0,0,'Stopped due to alarm')

	# nothing further to do if stopped
	if s['mode'] <= modes.stop: return
	encx = s['encx']

	# see if we have finished any parts
	if phuid:=s['phead']:
		part = s['parts'][phuid]
		if encx > part['begx']+part['length']+m.spec.length:
			sw['phead'] = part['next']
			if not s['phead']:	# no more parts, so stop
				sw['mode'] = modes.stop
				logAdd(m,sw,0,0,'Last work part done',phuid)

			luid = s['ohead']
			if luid:
				while (nuid:=s['parts'][luid]['next']): luid = nuid
				sw['parts'][luid]['next'] = phuid
			else: sw['ohead'] = phuid
			sw['parts'][phuid]['next'] = None
			logAdd(m,sw,0,0,'Output part',phuid)

			if s['mode'] <= modes.stop: return

	# see if we can start producing another part
	while s['shead']:
		luid = s['phead']
		if luid:
			while (nuid:=s['parts'][luid]['next']): luid = nuid
			part = s['parts'][luid]
			endx = part['begx']+part['length']
		else: endx = 0
		if encx+m.spec.length >= endx:
			wuid = m.inst.handleWrapRun(sw,0) if not luid else None	# wrap run: beg
			shuid = wuid or s['shead']
			part, partw = s['parts'][shuid], sw['parts'][shuid]
			if not wuid: sw['shead'] = part['next']
			partw['next'] = None
			partw['begx'] = endx + m.spec.kerf if not wuid else -(m.spec.kerf + part['length'])
			if luid: sw['parts'][luid]['next'] = shuid
			else: sw['phead'] = shuid
			injectPart(m,sw,shuid)
			if not s['shead'] and (wuid:=m.inst.handleWrapRun(sw,1)):	# wrap run: end
				partew = sw['parts'][wuid]
				partew['next'] = None
				partew['begx'] = part['begx']+part['length'] + m.spec.kerf
				partw['next'] = wuid
				injectPart(m,sw,wuid)
		else: break
	
	if m.modeExt: return	# external control will call beginNextHop and update tools etc
	
	# see if we are yet to reach the target x for this hop
	hopx = s['hopx']
	if s['move'] or (abs(hopx-encx) >= 0.01 and m.hopxi != -1):
		# ensure we will move if we (re)entered auto from manual
		if s['mode'] > modes.manual and s['hopm'] == 0:
			sw['hopm'] = hopms.move
			m.inst.handleHop()
		return

	# set tools to ripe if not yet done
	if m.hopop == toolOps.next:
		# unless in full auto where tools already firing
		if s['mode'] < modes.full: hopSet(m,sw,toolOps.ripe)
		else: m.hopop = toolOps.ripe	# but say we did so not overwritten if mode switches

		# flick back to manual if we finished moving in semi auto
		if s['mode'] == modes.semi:
			sw['hopm'] = 0
			sw['mode'] = modes.manual
			m.inst.handleHop()

	# see if we have any tools not yet done
	if any(s[tn] != toolOp.done for uid,ti,tn in s['hopt']):
		# ensure tools will fire if we (re)entered auto from manual
		if s['mode'] > modes.manual and s['hopm'] == 0:
			sw['hopm'] = hopms.tool
			m.inst.handleHop()
		return

	# flick back to manual if we finished moving in semi auto
	if s['mode'] == modes.semi and m.hopxi != -1:
		sw['hopm'] = 0
		sw['mode'] = modes.manual
		#m.inst.handleHop()	# called by beginNextHop below

	# get cracking on the next hop!
	beginNextHop(m,sw)

def injectPart(m,sw,uid):
	logAdd(m,sw,0,0,'Working part',uid)
	part = m.state['parts'][uid]
	px = part['begx']
	txmin = px+1e9
	for ti in range(len(part['tools'])):
		te = part['tools'][ti]
		tx = px + te['x'] + m.spec.tools[te['tool']].get('toolx',m.spec.length)
		tx = int(tx*100)
		m.hops.setdefault(tx,[]).append((uid,ti,te['tool']))
		if txmin > tx: txmin = tx
	txmin = m.inst.handleInjectPart(sw,uid,txmin)
	print('Injected part, hops keys', list(m.hops.keys()))
	# if we have a tool before the current hop target, switch to hop to it instead!
	if m.hopxi >= 0 and txmin < m.hopxi:
		# part should be injected early enough that this never happens
		if not m.modeExt: beginNextHop(m,sw)
		else:	# could happen if added to schedule while running
			logAdd(m,sw,8,'M004','Injected part requires machine to retarget')
			asyncio.create_task(m.inst.handleInternalStop())

def beginNextHop(m,sw):
	if m.hopxi != -1:
		hopSet(m,sw,toolOps.rest)
		del m.hops[m.hopxi]
		m.hopxi = -1
		sw['hopx'] = -1
	if m.hops:
		hxi = min(m.hops.keys())
		sw['hopx'] = hxi*0.01
		m.hopxi = hxi
		hopSet(m,sw,toolOps.next)
		if not m.modeExt:
			mode = m.state['mode']
			# semi only possible here when switching from stop or called from injectPart
			sw['hopm'] = 0 if mode <= modes.manual else hopms.move if mode == modes.semi else (hopms.move|hopms.tool)
	elif not m.modeExt:
		sw['hopm'] = 0
		sw['mode'] = modes.stop		# cannot be in a run mode without hops
		logAdd(m,sw,0,0,'Stopped as nothing to do')
	m.inst.handleHop()	# caller assumes handleHop called

def hopSet(m,sw,op):
	hopt, parts = m.hops[m.hopxi], m.state['parts']
	sw['hopt'] = list(hopt) if op == toolOps.next else []	# copy just in case
	for uid, ti, tn in hopt: sw[tn] = op
	m.hopop = op

async def handleWS_tool(ws,mj):
	m = machinesByName[mj['machine']]
	ok = False
	if (mode:=m.state['mode']) == modes.stop or mode == modes.manual:
		ok = await m.inst.handleTool(mj['tool'],mj.get('down'))
	await ws.send(json.dumps({'req':'tool','status':'OK' if ok else 'Fail'}))

async def handleWS_knob(ws,mj):
	m = machinesByName[mj['machine']]
	ok = await m.inst.handleKnob(mj['knob'],mj['args'])
	await ws.send(json.dumps({'req':'knob','status':'OK' if ok else 'Fail'}))


async def main():
	gear.loop = asyncio.get_running_loop()
	gear.runOnMachineThread = run_gearthread

	# say hello to all the gear
	for m in gear.machines:
		him = getattr(m.inst,'handleInit',None)
		if him: await him(m)

	# start all dev threads
	ndev = sum(len(m.devices) for m in gear.machines)
	tpool = concurrent.futures.ThreadPoolExecutor(max_workers=len(gear.machines)+ndev+4)
	for m in gear.machines:
		gear.loop.run_in_executor(tpool,writeHistoryThread,m)	# and the history writer
		for d in m.devices:
			#d.inst = functools.reduce(lambda x,y:getattr(x,y),d.classPath.split('.') if d.classPath else [],m.module)(m,d)
			d.inst = getattr(__import__('gearhead.'+d.classPath[:(cs:=d.classPath.rfind('.'))],fromlist=['']),d.classPath[cs+1:])(m,d)
			gear.loop.run_in_executor(tpool,threadInit,m,d)	# do not await the result
	
	# listen for websocket connections
	async with websockets.serve(wsConn,"localhost",8433):
		await asyncio.Future()	# wait forever

async def storeHistory(m,mup):
	# note: mup may be whole m.state but usually only updated paths
	tstr = '%.6f'%time.time()
	if m.histsize > histFileRoll:
		m.histstate = {}
		dict_updeep(m.histstate,m.state)
		hser = json.dumps(m.histstate).encode()
		m.histqueue.put((1,tstr,hser))
		m.histsize = len(hser)
	else:
		# find changes since history last stored
		hup = dict_ups(mup,m.histstate)
		if not hup: return
		dict_updeep(m.histstate,hup)
		hser = json.dumps(hup).encode()
		m.histqueue.put((0,tstr,hser))
		m.histsize += len(hser)

def writeHistoryThread(m):			# thread for writing out the state history for a machine
	while True:
		newf, tstr, hser = m.histqueue.get()
		# we do not try to coalesce updates here, which we could do with nonblocking gets to drain the queue..
		# hopefully the destination is always at least as fast as data is generated, and it is helpful
		# for forensics to not miss any data (that polling did not already miss)
		# if we wanted to do coalescing, it'd make more sense to send the dictionary
		# (or a deep copy if whole m.state) and coalesce within this thread here, rather than in storeHistory..
		if newf:
			if m.histfile: m.histfile.write(b'\x04')	# intentionally no \r\n
			m.histfile = open('state/'+m.name+'/hist_'+tstr.replace('.','_')+'.json','ab')
		m.histfile.write(tstr.encode()+hser+b'\r\n')
		if m.histqueue.empty(): m.histfile.flush()	# only flush if we have nothing waiting

def learnHistory(m):
	hdir = 'state/'+m.name
	maxt, maxf = 0, None
	for af in os.listdir(hdir):
		if not af.startswith('hist_'): continue
		tfor = int(af[5:].split('.')[0].replace('_',''))
		if maxt < tfor: maxt, maxf = tfor, af
	if not maxf: return {}		# no state history files found
	s = {}
	for l in open(hdir+'/'+maxf,'rb').readlines():
		if l[0] == 4: return s	# EOT, normal end of file
		su = json.loads(l[l.find(b'{'):])
		if not s: s = su
		else: dict_updeep(s,su)
	#raise Exception('Machine '+m.name+' state history is corrupt')
	# could have some option to continue regardless... would need to also catch json.loads exceptions
	print(m.name,'state recovered from unterminated history file, may be out of date')
	# TODO: implement a shutdown method and terminate the file nicely then!

	return s

def run_gearthread(coro):	# this function executes on the device thread
	confut = asyncio.run_coroutine_threadsafe(coro,gear.loop)
	def errchk(confut):
		if not (exc:=confut.exception()): return
		print('Copped exception in task scheduled from device thread')
		try:
			confut.result()		# trigger the exception with somewhat useful traceback
		except:
			traceback.print_exc()
			os._exit(0)
	confut.add_done_callback(errchk)

def makeMachines(blankSlate):			# this function executes before the runloop starts
	global machinesByName, gear
	ghdef.gear = gear = baser(json.load(open('gear.json','rb')))
	machinesByName = {}
	for m in gear.machines: makeMachine(m,blankSlate)

def makeMachine(m,blankSlate):
	mcp = m.classPath.split('.')
	m.module = __import__('gearhead.'+mcp[0],fromlist=[mcp[0]])
	m.inst = getattr(m.module,mcp[1])()
	m.__dict__.update( m.inst.machine.__dict__ )
	machinesByName[m.name] = m
	m.modeExt = m.spec.modes.get('ext')
	m.modeUp = None
	m.loglv = {}
	m.hops, m.hopxi, m.hopop = {}, -1, toolOps.off
	m.watches = []
	m.histstate, m.histfile, m.histsize, m.histqueue = {}, None, histFileRoll<<1, queue.SimpleQueue()
	m.state = learnHistory(m) if not blankSlate else {}
	logRecover(m)
	m.runOnMachineThread = lambda coro: run_gearthread(coro)	# threadsafe
	m.updateWatches = lambda mup,bigun: updateWatchers(m,dict(mup),bigun,True)	# not threadsafe
	m.logAdd = lambda lev,code,*msg: logAddAndUpdate(m,lev,code,*msg)	# not threadsafe
	m.beginNextHop = lambda sw: beginNextHop(m,sw)	# not threadsafe

if __name__ == '__main__':
	from . import __main__

