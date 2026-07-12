#!/bin/bash
npm run build
npm run bundle
VERSION=`jq -r '.version' package.json`
echo version from package.json = $VERSION

echo "----------------------------------------------------------------------"
sed -i "s/^version: .*/version: \"${VERSION}\"/" snap/snapcraft.yaml
cat snap/snapcraft.yaml
echo "----------------------------------------------------------------------"
npm install
snapcraft 
echo  to install locally:  snap install  opcua-commander_${VERSION}_amd64.snap --dangerous
echo  to publish:  snapcraft upload --release=stable opcua-commander_${VERSION}_amd64.snap


