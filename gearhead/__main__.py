import sys
import os
import asyncio
from . import gearhead
import traceback
gearhead.makeMachines('--blankSlate' in sys.argv)
try:
	asyncio.run(gearhead.main())
except KeyboardInterrupt:
	print('\nKeyboard interrupt. Terminating gearhead server')
	os._exit(0)
except BaseException:
	print('\nCopped exception:')
	traceback.print_exc()
	print('Terminating gearhead server')
	os._exit(1)
print('Internal error: main loop completed')
os._exit(2)
print('Internal error: unable to terminate')
