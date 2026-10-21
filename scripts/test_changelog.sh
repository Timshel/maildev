# !/bin/bash

LAST_TAG=$(git describe --abbrev=0 --tags HEAD)

echo "Test changelog output for latest tag:"
echo "------------------------------------"
sed -n "/## $LAST_TAG/,/##/p" CHANGELOG.md | grep -v "^##" | grep .
echo "------------------------------------"
