
class Base:
	def __init__(self,**args):
		self.__dict__.update(args)
def baser(o):
	return Base(**{k:baser(v) for k, v in o.items()}) if hasattr(o,'keys') else [baser(v) for v in o] if isinstance(o,list) else o

def dict_ups(ups,old):		# note: no way to ever delete old keys... fine
	return {k:(uv if not ovisd else dur) for k,uv in ups.items()
		if (ov:=old.get(k)) != uv and (not (ovisd:=hasattr(ov,'keys')) or len(dur:=dict_ups(uv,ov)))}
	# dicts could be different but have no updates if ups lacks keys in old

def dict_updeep(old,ups):
	for k, uv in ups.items():
		if not hasattr(uv,'keys'): old[k] = uv
		else:	# never assign a dict in case it later changes
			if not hasattr(ov:=old.get(k),'keys'): ov = old[k] = dict()
			dict_updeep(ov,uv)

class DictSnoop:
	def __init__(self,d,u=None):
		self._d = d
		self._u = u if u is not None else {}
	def __getitem__(self,k):	# assumes it is a dict
		return DictSnoop(self._d[k],self._u.setdefault(k,{}))
	def __setitem__(self,k,v):
		self._d[k] = v
		self._u[k] = v

histFileRoll = 1024*1024

modes = Base(off=0, stop=1, manual=2, semi=3, full=4)

toolOps = Base(off=-1, rest=0, next=1, ripe=2, fire=3, done=4)

hopms = Base(move=1, tool=2)	# bitmap


