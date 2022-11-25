function de(x) { return document.getElementById(x); }
function qa(x) { return document.querySelectorAll(x); }
function ce(tag,con=null,klass=null) { var n = document.createElement(tag); if (klass) n.className = klass; if (con !== null) n.textContent = con; return n; }

var machineName, spec, modelState;

var ws;
function wsInit()
{	// assume we were using https
	//ws = new WebSocket('wss://'+document.location.href.substr(8)+'/hmi.ws','json');
	ws = new WebSocket('ws://localhost:8433/hmi.ws');	// ,'json' breaks on Windows
	ws.onopen = wsOpen;
	ws.onclose = wsClose;
	ws.onmessage = wsRes;
}
function wsOpen(e)
{
	// de('disco').style.display = 'none';
    console.log("active");
	if (!machineName) req_machines();
	else req_spec();
}
function wsClose(e)
{
	de('disco').style.display = '';
	if (machineName)
		de('discoWhy').textContent = 'Server Disconnected',
		setTimeout(function(){window.location.reload();},5000);
	else
		de('discoWhy').textContent = 'Server Unreachable',
		setTimeout(wsInit,3000);
}
function wsReq(req,args={})
{
	args.req = req;
	ws.send(JSON.stringify(args));
}
function wsRes(e)
{
	var p = JSON.parse(e.data);
	console.log('Received message',p);
	window['res_'+p.req](p);
}


function req_machines()
{
	wsReq('machines');
}
function res_machines(p)
{
	machineName = p.res[0];
	de('Safety-data').textContent = machineName;
	req_spec();
}

function req_spec()
{
	wsReq('spec',{machine:machineName})
}
function res_spec(p)
{
	spec = p.res;
	if (!spec.partf.length)
	{
		de('worknCont').style.display = 'none';
		de('schedCont').style.display = 'none';
		de('availCont').style.display = 'none';
		var gb = de('globut'), wc = de('worknCont'), wcp = wc.parentNode;
		gb.parentNode.removeChild(gb);
		gb.style.position = 'relative';
		gb.style.right = '0px';
		wcp.insertBefore(gb,wc);
		de('model').style.height='800px';
		var bos = document.querySelectorAll('.but-lover');
		for (var i = 0; i < bos.length; i++) bos[i].style.opacity='0';
	}

	spec.mcode = spec.mcode ? eval(spec.mcode) : {};
	var mn = de('model');
	mn.innerHTML = spec.model
	var svgn = mn.firstChild;
	svgn.style.width = '100%';
	svgn.style.height = '100%';
	svgn.setAttribute('viewBox',spec.mview);

	var zn = de('zeroref');
	if (zn)
	{
		let bb = zn.getBBox();
		spec.zeroref = bb.x+bb.width*0.5;
	}
	else spec.zeroref = 0.

	for (var toolName in spec.tools)
	{
		var tool = spec.tools[toolName];
		if (!(tool.model = de('tool:'+toolName))) continue;
		if (tool.toolx)
		{	// center tools in accurate position on machine
			let bb = tool.model.getBBox();
			let havex = bb.x+bb.width*0.5, dx = spec.zeroref+tool.toolx - havex;
			if (dx) tool.model.style.transform='translateX('+dx+'px)';
		}
		tool.model.dataTool = toolName;	// already the id, this helps us find it
		tool.model.addEventListener('click',goTool);
		tool.model.style.cursor = 'pointer';
		// store the model for the mark that this tool makes
		if (!(tool.mark = de('mark:'+toolName))) continue;
		let bb = tool.mark.getBBox();
		tool.mcx = bb.x+bb.width*0.5, tool.mcy = bb.y+bb.height*0.5;
		tool.mark.parentNode.removeChild(tool.mark);
	}
	var prodn = de('product');
	if (prodn)
	{
		let bb = prodn.getBBox();
		prodn.ceny = bb.y+bb.height*0.5;
		prodn.style.visibility = 'hidden';
	}

	var modens = de('globut').querySelectorAll('.bbut[data-mode]'), names = ((spec.modes||{}).names||[]);
	if (names.length) for (var i = 0; i < modens.length; i++)
		if (i < names.length) modens[i].textContent = names[i]; else modens[i].style.display = 'none';
	var modeExt = (spec.modes||{}).ext;
	for (var i = 0; i < modens.length; i++) if (!modeExt) modens[i].onclick=goMode;
		else modens[i].onmousedown=goModeDn, modens[i].onmouseup=goModeUp;

	var knobns = mn.querySelectorAll('[data-knob],[data-knob-hold],[data-knob-free]');
	for (var i = 0; i < knobns.length; i++)
	{
		var kn = knobns[i];
		if (!kn.getAttribute('data-knob-hold'))	// assume data-knob
			kn.addEventListener('click',goKnob);
		else
		{
			kn.addEventListener('mousedown',goKnobDown);
			kn.addEventListener('mouseup',goKnobFree);
			kn.addEventListener('mouseleave',goKnobFree);
		}
		kn.style.cursor = 'pointer';
	}

	var fmn = de('fetchMenu');
	fmn.textContent = '';
	if (spec.fetch) for (var i = 0; i < spec.fetch.length; i++)
	{
		var fe = spec.fetch[i], fmi;
		fmn.appendChild(fmi=ce('div','From '+fe.name));
		fmi.dataFetchIdx = i;
		fmi.onclick=goFetch;
	}

	spec.rules = [];
	var rulers = mn.querySelectorAll('[data-rule]');
	for (var i = 0, rn; i < rulers.length; i++)
		spec.rules.push({n:rn=rulers[i],f:eval('(function(s,rn,rs){'+rn.getAttribute('data-rule')+'})')});
	if (spec.mcode.onMachineShow) spec.mcode.onMachineShow(spec);

	req_watch();
}

function req_watch()
{
	modelState = {}
	wsReq('watch',{machine:machineName});
}
function res_watch(p)
{
	//Object.assign(modelState,p.res);	// overwrite provided but keep missing
	object_merge(modelState,p.res);		// as above but deeply
	updateModel(p.res)
}

function object_merge(tgt,src)
{
	var sv, tv;
	for (var k in src) if (typeof(sv=src[k]) === "object" && typeof(tv=tgt[k]) === "object")
		object_merge(tv,sv); else tgt[k] = sv;
}

var actCol = {'-1':'grey',0:'white',1:'orange',2:'green',3:'red',4:'brown'};
var actLab = {'-1':'Off',0:'Rest',1:'Next',2:'Ripe',3:'Fire',4:'Done'};

function updateModel(ups)
{
	var s = modelState;

	// first the main mode
	if ('mode' in ups)
	{
		let mbs = qa('[data-mode]');
		for (let i = 0; i < mbs.length; i++)
			mbs[i].classList.toggle('lit',mbs[i].getAttribute('data-mode') == s.mode);
	}

	// update the model gui
	var mn = de('model');
	if (spec.mcode.onModelState) spec.mcode.onModelState(mn,s);
	/*
	var rulers = mn.querySelectorAll('[data-rule]');
	for (var i = 0; i < rulers.length; i++)
	{
		var rn = rulers[i], rs = rn.style;
		eval(rn.getAttribute('data-rule'));		// origin is this server so should not be a security worry
	}
	*/
	for (var toolName in spec.tools)
	{
		var te = spec.tools[toolName], ts = s[toolName]||0;
		if (te.model) te.model.style.fill = actCol[ts];
		if (te.popop) te.popop.textContent = actLab[ts];
	}
	for (var i = 0, r; i < spec.rules.length; i++) (r=spec.rules[i]).f(s,r.n,r.n.style);

	// the log and alarms
	if ('log' in ups || 'alarm' in ups) updateLog(ups)

	// and the tables of parts
	if ('parts' in ups || 'shead' in ups || 'phead' in ups || 'ohead' in ups) updateParts()
	else if ('encx' in ups) updatePartsOnModel();
}

var availJobs, availParts, schedParts, prodParts, outParts;

function updateParts()
{
	var s = modelState;
	var availObj = Object.assign({},s.parts);
	function followLList(uid)
	{
		var ret = [], p;
		while (uid)
		{
			ret.push({uid:uid,part:(p=availObj[uid])})
			delete availObj[uid];
			uid = p.next;
		}
		return ret;
	}
	schedParts = followLList(s.shead);
	prodParts = followLList(s.phead);
	outParts = followLList(s.ohead);

	availJobs = {}, availParts = [];
	for (var uid in availObj)
	{
		var part = availObj[uid];
		if (part.int) continue;
		if (!availJobs[part.job]) availJobs[part.job] = {job:s.jobs[part.job],parts:[]};
		availJobs[part.job].parts.push({uid:uid,part:part});
	}
	for (var job in availJobs)
	{
		var part, parts = availJobs[job].parts, sump = {job:job,form:null,length:0.,tools:[]};
		for (var i = 0; i < parts.length; i++)
		{
			sump.length += (part=parts[i].part).length;
			sump.tools.push(...part.tools);
			sump.form = (sump.form === null || part.form == sump.form) ? part.form : '';
		}
		availParts.push({uid:null,part:sump});
		availParts.push(...parts);
	}
	//availParts.push({uid:uid,part:availObj[uid]});

	//console.log(availParts,schedParts,prodParts,outParts);
	buildPartsTable(availParts,'avail',1);
	buildPartsTable(schedParts,'sched',0);
	//buildPartsTable(prodParts,null,0);
	updatePartsOnModel(1);
	workOutParts = outParts.concat(prodParts);	// concat returns new array :(
	buildPartsTable(workOutParts,'workOut',0);
}

function updateMotorStatus(motorStatus) {
	document.getElementById("motor-icon").fill = "#ffffff"
}

function buildPartsTable(parts,tpre,byJob)
{
	var tabn = de(tpre+'Table');
	tabn.textContent = '';
	var thr = ce('tr');
	thr.appendChild(ce('th',!byJob?'#':'⋮'));
	thr.appendChild(ce('th','Job'));
	thr.appendChild(ce('th','Id'));
	thr.appendChild(ce('th','Form'));
	thr.appendChild(ce('th','Length'));
	thr.appendChild(ce('th','Tools'));
	thr.appendChild(ce('th','Model'));
	tabn.appendChild(thr);
	var partTNum = 0, partTLen = 0., partTTools = new Set();
	//for (var i = byJob?0:parts.length-1; byJob?(i < parts.length):(i >= 0); i += byJob?1:-1)
	for (var i = 0; i < parts.length; i += 1)	// why did I ever want to display this backwards?
	{
		var part = parts[i].part;
		var tr = ce('tr'), tn;
		tr.dataUid = parts[i].uid;
		if (tpre == 'workOut') tr.className = (i >= outParts.length) ? 'working' : '';
		if (!byJob) tr.appendChild(ce('td',1+i));
		if (byJob && !tr.dataUid) tr.appendChild(ce('td','▾')), tr.className = 'outdent';
		tr.appendChild(tn=ce('td',modelState.jobs[part.job].name));
		if (byJob && tr.dataUid) tn.colSpan = 2;
		tr.appendChild(ce('td',tr.dataUid));
		tr.appendChild(ce('td',part.form));
		tr.appendChild(tn=ce('td',part.length));
		if (tpre == 'workOut' && i >= outParts.length)
			tn.insertBefore(ce('span',parts[i].donel,'done'),tn.firstChild);
		tr.appendChild(tn=ce('td',part.tools.length));
		if (tpre == 'workOut' && i >= outParts.length)
			tn.insertBefore(ce('span',parts[i].donet,'done'),tn.firstChild);
		tr.appendChild(ce('tr',null,'modelf'));
		// TODO: draw the model of the part
		tabn.appendChild(tr);

		if (tr.dataUid)
		{
			++partTNum;
			if (tpre == 'sched') for (var ti = 0; ti < part.tools.length; ti++)
			{
				var te = part.tools[ti], tool = spec.tools[te.tool];
				partTTools.add(parseInt(partTLen+(tool.toolx||spec.length)+te.x));
			}
			partTLen += part.length;
		}
	}

	var sumn = de(tpre+'Summary'), ppl = prodParts.length, s = modelState;
	if (tpre == 'avail') sumn.textContent = partTNum ? partTNum+' Part'+(partTNum>1?'s':'') : '';
	else if (tpre == 'sched') sumn.textContent = partTNum ? partTNum+' Part'+(partTNum>1?'s':'')+' / '+
		Math.ceil(partTLen*1e-3).toFixed(0)+' m / '+
		(modelState.stockKgPerM ? Math.ceil(partTLen*1e-3*s.stockKgPerM).toFixed(0)+' kg / ' : '')+
		nicetime(partTLen / s.runSpeed + partTTools.size * s.toolLapse) : '';
	else if (tpre == 'workOut') tabn.lastChild.scrollIntoView(),
		sumn.textContent = (ppl ? ppl+' part'+(ppl>1?'s':'')+' in machine'+
			(partTNum > ppl ? ' + ' : '') : '') + (outParts.length ? outParts.length+' done' : '');
	
	updateSelActions(tabn,byJob);
}

function nicetime(s)
{
	s = parseInt(s);
	return s < 3600 ? Math.ceil(s/60.)+' mins' : (s/3600).toFixed(0)+' hours '+Math.ceil(s%3600/60.)+' mins';
}

function goToggleRow(avail)
{
	var tr = event.target;
	while (tr && tr.tagName != 'TR') tr = tr.parentNode;
	if (!tr) return;

	if (de('schedMoveB').style.display != 'none')
	{
		if (tr.parentNode.id == 'schedTable' && !tr.classList.contains('sel'))
			goPartsMove('s','s',tr.dataUid);
		return schedMoveDone();
	}

	var selOn = tr.classList.toggle('sel');
	if (avail && !tr.dataUid)
		for (var tp = tr.nextSibling; tp && tp.dataUid; tp = tp.nextSibling)
			tp.classList.toggle('sel',selOn);

	updateSelActions(tr.parentNode,avail);
}

function updateSelActions(tm,avail)
{
	var selNum = 0;
	for (var tw = tm.firstChild; tw; tw = tw.nextSibling)
		if (tw.classList.contains('sel') && (!avail || tw.dataUid)) ++selNum;

	if (avail)
		de('availSelNum').textContent = selNum ? selNum+' Selected Part'+(selNum>1?'s':'') : 'All Parts'
	else if (tm.id == 'schedTable')
		schedMoveDone(),
		de('schedSelNum').textContent = selNum ? 'Move '+selNum+' Selected Part'+(selNum>1?'s…':'…') : 'Clear All Parts';
	else if (tm.id == 'workOutTable')
		de('workOutSelNum').textContent = selNum ? 'Rerun '+selNum+' Selected Part'+(selNum>1?'szs':'') :
			!prodParts.length ? 'Rerun All Parts' : 'Abort Parts In Machine';
}

function goAvailSchedule()
{
	var uids = [], tm = de('availTable');
	var selOnly = tm.querySelector('.sel');
	for (var tw = tm.firstChild; tw; tw = tw.nextSibling)
		if ((!selOnly || tw.classList.contains('sel')) && tw.dataUid) uids.push(tw.dataUid);
	req_sched(uids,'as');
}

function goSchedMove()
{
	if (de('schedTable').querySelector('.sel'))
	{
		de('schedMoveA').style.display='none';
		de('schedMoveB').style.display='';
		return;
	}
	
	var uids = [];
	for (var i = 0; i < schedParts.length; i++) uids.push(schedParts[i].uid);
	req_sched(uids,'sa');
}

function schedMoveDone()
{
	de('schedMoveA').style.display='';
	de('schedMoveB').style.display='none';
}

function goPartsMove(src,dst,next=null)
{
	schedMoveDone();

	var uids = [], tm = de(src=='s'?'schedTable':'workOutTable');
	for (var tw = tm.firstChild; tw; tw = tw.nextSibling)
		if (tw.classList.contains('sel')) uids.push(tw.dataUid);
	req_sched(uids,src+dst,next);
}

function req_sched(uids,move,next)
{
	a = {machine:machineName,uids:uids,move:move};
	if (next) a.next = next;
	wsReq('sched',a);
}
function res_sched(p)
{
}

function goWorkOutAbortRerun()
{
	var uidsA = [], uidsB = [], uids = uidsA, tm = de('workOutTable');
	if (tm.querySelector('.sel'))
	{
		for (var tw = tm.firstChild; tw; tw = tw.nextSibling)
		{
			if (tw.dataUid == modelState.phead) uids = uidsB;
			if (tw.classList.contains('sel')) uids.push(tw.dataUid);
		}
		if (uidsB.length) goPartsMove(uidsB,'ps',modelState.shead);
		if (uidsA.length) goPartsMove(uidsA,'os',uidsB.length?uidsB[0]:modelState.shead);
	}

	var l = prodParts.length ? prodParts : outParts;
	for (var i = 0; i < l.length; i++) uids.push(l[i].uid);
	if (uids.length) req_sched(uids,(prodParts.length?'p':'o')+'s',modelState.shead);
}


function updatePartsOnModel(regen)
{
	var prodn = de('product');
	if (!prodn) return;
	if (regen) while (prodn.nextSibling && prodn.nextSibling.className && prodn.nextSibling.className.baseVal == 'part')
		prodn.parentNode.removeChild(prodn.nextSibling);

	var wotc = de('workOutTable').children, wot0idx = wotc.length-prodParts.length;
	for (var i = 0; i < prodParts.length; i++)
	{
		var po = prodParts[i], part = po.part;
		var canx = spec.zeroref + (modelState.encx - part.begx);

		if (!po.node || regen)
		{
			po.node = createModelNode(po);
			prodn.parentNode.insertBefore(po.node,prodn.nextSibling);
		}
		po.node.style.transform='translate('+(canx-part.length)+'px,'+(prodn.ceny-spec.forms[part.form].width*0.5)+'px)';
		// overflow hidden with white boxes... or we could be in a group with clipPath,
		// ... anyway, not our problem!

		po.donel = Math.min(part.length,Math.max(0.,modelState.encx-spec.length-part.begx)), po.donet = 0;
		var t0idx = po.node.children.length-part.tools.length;
		for (var ti = 0; ti < part.tools.length; ti++)
		{
			var te = part.tools[ti], tool = spec.tools[te.tool];
			var mn = po.node.children[t0idx+ti];
			var wantDash = canx-te.x < spec.zeroref+(tool.toolx||spec.length);
			if (mn.dataDash != wantDash) updateToolMarkDash(mn,wantDash);
			if (!wantDash) ++po.donet;
		}
		if (!regen)
		{	// update table here too... if regen it will be done after us
			var ns = wotc[wot0idx+i].querySelectorAll('.done');
			ns[0].textContent = po.donel.toFixed(0);
			ns[1].textContent = po.donet;
		}
	}
}

function cesvg(tag,prop,style={})
{
	var sns = 'http://www.w3.org/2000/svg';
	var n = document.createElementNS(sns,tag);
	for (k in prop) n.setAttributeNS(null,k,prop[k]);
	for (k in style) n.style[k] = style[k];
	return n;
}

function createModelNode(po,dash=true)
{
	var part = po.part, form = spec.forms[part.form];
	// outline rectangle
	var n = cesvg('g',{});
	n.className.baseVal = 'part';
	n.appendChild(cesvg('rect',{x:0,y:0,width:part.length,height:form.width},
		{stroke:'black',strokeWidth:'2px',fill:'white'}));
	// bends in our form, usually the fold lines in the 'net' of the 3D product
	for (var i = 0, y; i < form.bends.length; i++)
		n.appendChild(cesvg('line',{x1:0,y1:(y=form.bends[i]),x2:part.length,y2:y},
			{stroke:'black',strokeWidth:'1px'}));
	// tool marks
	for (var i = 0; i < part.tools.length; i++)
	{
		var te = part.tools[i], tool = spec.tools[te.tool];
		var mn = tool.mark.cloneNode(true);
		mn.id = '';
		mn.style.transform = 'translate('+(part.length-te.x-tool.mcx)+'px,'+(tool.marky-tool.mcy)+'px)';
		mn.dataDash = true;
		if (!dash) updateToolMarkDash(mn,dash);
		n.appendChild(mn);
	}
	return n;
}

function updateToolMarkDash(mn,wantDash)
{
	if (wantDash)
	{
		mn.style.stroke='#bcbcbc';
		mn.style.strokeDasharray = '6,3';
	}
	else
	{
		mn.style.stroke='black';
		mn.style.strokeDasharray = '';
	}
	mn.dataDash = wantDash;
}


var curDragBeg = null;
function dragBegDiv()
{
	var tgt = event.target;
	if (!tgt.dataDraggable) return;	// avoid drag from child node
	if (tgt.dataDraggable === 'up')
		{ tgt = tgt.parentNode; while (tgt && !tgt.dataDraggable) tgt = tgt.parentNode; if (!tgt) return; }

	var mmn = document.body;//tgt;
	curDragBeg = {tgt:tgt,mmn:mmn,mx:event.screenX,my:event.screenY,et:tgt.style.transform};
	mmn.onmousemove = dragJogDiv;
	mmn.onmouseup = dragEndDiv;
	mmn.onmouseleave = dragEndDiv;
	return false;
}
function dragJogDiv()
{
	var db = curDragBeg, tgt = curDragBeg.tgt;
	var dx = event.screenX-db.mx, dy = event.screenY-db.my;
	if (db.et) dx += parseFloat(db.et.split('(')[1]), dy += parseFloat(db.et.split(',')[1]);
	tgt.style.transform = 'translate('+dx+'px,'+dy+'px)';
}
function dragEndDiv()
{
	var mmn = curDragBeg.mmn;
	mmn.onmousemove = null;
	mmn.onmouseleave = null;
	mmn.onmouseout = null;
	curDragBeg = null;
}

function makePopup(popid)
{
	if (popups[popid])
	{	// bring to front instead of making another
		var pd = popups[popid];
		pd.parentNode.removeChild(pd);
		de('model').appendChild(pd);
		return;
	}

	var pd = ce('div',null,'popup');
	pd.dataPopId = popid;
	pd.dataDraggable = true;
	pd.onmousedown = dragBegDiv;
	popups[popid] = pd;
	de('model').appendChild(pd);
	return pd;
}
function donePopup(pd)
{
	var popid = pd.dataPopId;
	popups[popid] = null;
	pd.parentNode.removeChild(pd);
}

function goTool()
{
	var tmn = event.target;
	while (tmn && !tmn.dataTool) tmn = tmn.parentNode;
	if (!tmn) return;

	var tn = tmn.id.substr(5), pd, n;
	if (!(pd = makePopup('tool:'+tn))) return;
	pd.appendChild(n=ce('div',tn.replaceAll('_',' ')+' Tool','knob caps'));
	n.dataDraggable = 'up';
	{
		var te = spec.tools[tn];
		var ln = ce('div',null,'line');
		ln.appendChild(ce('div','Location'));
		ln.appendChild(ce('div','toolx' in te ? te.toolx : spec.length,'value'));
		ln.appendChild(ce('div','mm','unit'));
		pd.appendChild(ln);
		var ln = ce('div',null,'line');
		ln.appendChild(ce('div','Operation'));
		ln.appendChild(n=ce('div',null,'value'));
		spec.tools[tn].popop = n;
		pd.appendChild(ln);
		var ln = ce('div',null,'line');
		ln.appendChild(ce('div','Posture'));
		ln.appendChild(n=ce('div',null,'value'));
		spec.tools[tn].poppt = n;
		pd.appendChild(ln);
	}
	pd.appendChild(n=ce('button','Fire'));
	n.setAttribute('type','button');
	n.style.float = 'right';
	n.onclick = function() {
		var s = modelState;
		if (s.mode != 1 && s.mode != 2) return;	// only possible in Stop and Manual modes
		req_tool(tn);
	};
	pd.appendChild(n=ce('button','Close'));
	n.setAttribute('type','button');
	n.style.float = 'left';
	n.onclick = function() { donePopup(pd); }
}
function req_tool(tn)
{
	wsReq('tool',{machine:machineName,tool:tn});
}
function res_tool(p)
{
}


function goKnob(arg)
{
	var kn = arg.kn || event.target, ka, sat;
	while (kn && !(ka = kn.getAttribute(arg.an||'data-knob'))) kn = kn.parentNode;
	if ((sat = ka.indexOf(' ')) < 0) return goKnobPopup(ka);

	var s = modelState;
	var knob = ka.substr(0,sat), args = eval('('+ka.substr(sat+1)+')');
	req_knob(knob,args);
}
var knobHolding = null, knobTimer = null;
function goKnobDown()
{
	var kn = event.target, ka;
	while (kn && !(ka=kn.getAttribute('data-knob')) && !kn.getAttribute('data-knob-hold')) kn = kn.parentNode;
	if (!kn) return;
	knobHolding = kn;
	if (!ka) goKnobHold(kn);
	else knobTimer = window.setTimeout(goKnobHold,500,kn);
}
function goKnobHold(kn)
{
	knobTimer = null;
	goKnob({kn:kn,an:'data-knob-hold'});
}
function goKnobFree()
{
	if (!knobHolding) return;
	var kn = knobHolding;
	knobHolding = null;

	if (knobTimer)
	{	// released before timer expired so treat as a click
		clearTimeout(knobTimer);
		knobTimer = null;
		goKnob({kn:kn});
	}
	else
	{	// release while holding so invoke that attribute
		goKnob({kn:kn,an:'data-knob-free'});
	}
}
function req_knob(knob,args={})
{
	console.log('req_knob',knob,args);
	wsReq('knob',{machine:machineName,knob:knob,args:args});
}
function res_knob(p)
{
}

var popups = {}
function goKnobPopup(knob)
{
	var ks = spec.knobs[knob], s = modelState, n, pd;
	if (!(pd = makePopup('knob:'+knob))) return;
	pd.appendChild(n=ce('div',knob.replaceAll('_',' '),'knob caps'));
	n.dataDraggable = 'up';
	for (var i = 0; i < ks.length; i++)
	{
		var ae = ks[i];
		var ln = ce('div',null,'line');
		ln.appendChild(ce('div',ae.title||ae.name.replaceAll('_',' '),!ae.title?'caps':''));
		ln.appendChild(n=ce('input'));
		n.setAttribute('type','text');
		n.dataArg = ae.name;
		if (ae.eval) try { n.value = eval(ae.eval); } catch {};
		if (ae.unit) ln.appendChild(ce('div',ae.unit,'unit'));
		pd.appendChild(ln);
	}
	pd.appendChild(n=ce('button','Submit'));
	n.setAttribute('type','button');
	n.style.float = 'right';
	n.onclick = function() {
		var args = {}, ns = pd.querySelectorAll('input');
		for (var i = 0; i < ns.length; i++) args[(n=ns[i]).dataArg] = n.value;
		req_knob(knob,args);
		donePopup(pd);
	};
	pd.appendChild(n=ce('button','Cancel'));
	n.setAttribute('type','button');
	n.style.float = 'left';
	n.onclick = function() { donePopup(pd); }
}


function updateLog(ups,debug=0)
{
	de('alackBut').classList.toggle('alarm',modelState.alarm);
	var ln = de('logTable'), trs = ln.children, li;
	for (var li = 1, tr; li < trs.length; li++)
	{
		if ((tr=trs[li]).className != 'unack') break;
		if (tr.dataKey in ups.log) tr.parentNode.removeChild(tr), li--;
	}	// recreate if unacked updated (probably now acked)
	for (var lek in ups.log || [])
	{
		var le = modelState.log[lek], leTime = parseFloat(lek), rm, rM;
		// binary search for the row before us, in table partitioned at first log index li
		if (!le.unack) rm = li, rM = trs.length; else rm = 1, rM = li;	// min and Max
		if (debug) console.log(leTime);
		while (rm != rM)
		{
			var rt = parseInt((rm+rM)*0.5), ro = trs[rt];
			if (debug) console.log(rm,rM,rt,ro.dataTime);
			if (leTime < ro.dataTime) rm = rt+1; else rM = rt;
		}
		if (debug) console.log(rm);
		var tra = null, tr, tn;
		if (rm >= trs.length || (tr=tra=trs[rm]).dataKey != lek)
			ln.insertBefore(tr=ce('tr'),tra), tr.dataKey = lek, tr.dataTime = leTime;

		tr.textContent = '';
		tr.appendChild(ce('td',le.l < 9 ? le.l : 'Alarm'));
		tr.appendChild(ce('td',le.c));
		var d = new Date(leTime*1000);
		tr.appendChild(tn=ce('td',('0'+d.getHours()).slice(-2)+':'+
			('0'+d.getMinutes()).slice(-2)+':'+('0'+d.getSeconds()).slice(-2),'timedate'));
		tn.setAttribute('data-date',d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+
			('0'+d.getDate()).slice(-2)+' '+tn.textContent+((leTime%1).toFixed(6)).substr(1));
		tr.appendChild(ce('td',le.m));
		if (le.unack) tr.className = 'unack', li++;
		tr.setAttribute('data-level',le.l);
	}
}

function goFetch()
{
	var tgt = event.target;
	var fe = spec.fetch[tgt.dataFetchIdx];
	if (!fe.file && !fe.fields) return req_fetch(fe.name);
	
	// TODO: combine this with goKnobPopup...
	var pd, n, fin = null;
	if (!(pd = makePopup('fetch:'+fe.name))) return;
	pd.appendChild(n=ce('div','Fetch Jobs From '+fe.name,'knob caps'));
	n.dataDraggable = 'up';
	if (fe.file)
	{
		n = ce('div',null,'line');
		fin = ce('input');
		fin.type = 'file';
		fin.accept = fe.file;
		fin.dataArg = 'file';
		n.appendChild(fin);
		pd.appendChild(n);
	}
	for (var i = 0; i < (fe.fields ? fe.fields.length : 0); i++)
	{
		var ae = fe.fields[i];
		var ln = ce('div',null,'line');
		ln.appendChild(ce('div',ae.title||ae.name.replaceAll('_',' '),!ae.title?'caps':''));
		ln.appendChild(n=ce('input'));
		n.setAttribute('type','text');
		n.dataArg = ae.name;
		if (ae.eval) try { n.value = eval(ae.eval); } catch {};
		if (ae.unit) ln.appendChild(ce('div',ae.unit,'unit'));
		pd.appendChild(ln);
	}

	pd.appendChild(n=ce('button','Submit'));
	n.setAttribute('type','button');
	n.style.float = 'right';
	n.onclick = function() {
		var args = {}, ns = pd.querySelectorAll('input');
		var sendAndClose = function() {
			req_fetch(fe.name,args);
			donePopup(pd);
		}
		for (var i = 0; i < ns.length; i++) args[(n=ns[i]).dataArg] = n.value;
		if (!fin) return sendAndClose();

		if (!fin.files.length) return alert('No file selected');
		var fr = new FileReader();
		fr.onload = function() {
			args.fileData = fr.result;
			sendAndClose();
		};
		fr.readAsText(fin.files[0]);
	};
	pd.appendChild(n=ce('button','Cancel'));
	n.setAttribute('type','button');
	n.style.float = 'left';
	n.onclick = function() { donePopup(pd); }

	if (fin) fin.click();
}

function req_fetch(fname,args)
{
	wsReq('fetch',{machine:machineName,fetch:fname,args:args});
}
function res_fetch(p)
{
	if (p.status != 'OK') alert('Fetch error: '+p.status);
}



var modeHit = -1;
function goMode(du)
{
	if (!du && modeHit >= 0) return;	// already switching to another mode, sorry...
	let but = event.target;
	let mnew = parseInt(but.getAttribute('data-mode'));
	if (du) return req_mode(mnew,du=='d'?1:0);
	
	if (mnew == modelState.mode) return;

	modeHit = mnew;
	but.classList.toggle('hit',true);

	req_mode(mnew,-1);
}
function goModeDn(du) { goMode('d'); }
function goModeUp(du) { goMode('u'); }
function req_mode(mnew,down)
{
	wsReq('mode',{machine:machineName,want:mnew,down:down});
}
function res_mode(p)
{
	var bh = qa('.bbut.hit');
	if (bh && bh.length) bh[0].classList.toggle('hit',false);
	modeHit = -1;
}

function goMinmax()
{
	var tn = event.target, mh = 30;
	while (tn && tn.className != 'stitle') tn = tn.parentNode;
	if (!tn) return;
	tn = tn.parentNode;
	var pn = tn.id == 'schedCont' ? tn.nextElementSibling : tn.previousElementSibling;
	if (!tn.dataOrigHeight) tn.dataOrigHeight = parseFloat(tn.style.height),
		pn.dataOrigHeight = parseFloat(pn.style.height);
	var th = parseFloat(tn.style.height), tho = tn.dataOrigHeight, bh = tho+pn.dataOrigHeight;
	var hgts = th > tho+1 ? [tho,pn.dataOrigHeight] : [bh-mh,mh];
	tn.style.height = hgts[0]+'px';
	pn.style.height = hgts[1]+'px';
}

function goAlack()
{
	var s = modelState, ks = [];
	for (var lek in s.log) if (s.log[lek].unack) ks.push(lek);
	req_alack(ks);
}
function req_alack(ks)
{
	wsReq('alack',{machine:machineName,ks:ks});
}
function res_alack(p)
{
}


wsInit();