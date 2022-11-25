#!/bin/bash
dt=`date +'%Y%m%d'`
echo 'Dist for' $dt
if [ -d dist/$dt ]; then
	echo Dist already exists
	exit
fi
mkdir dist/$dt
zip -r dist/$dt/gearhead_$dt.zip gearhead html
echo 'Done'
scp dist/$dt/gearhead_$dt.zip fy:defyne.org/html/ghd/
echo curl -O https://defyne.org/ghd/gearhead_$dt.zip
