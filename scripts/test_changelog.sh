# !/bin/bash

LAST_TAG=$(git describe --abbrev=0 --tags HEAD)

echo "Test changelog output for latest tag:"
echo "------------------------------------"
sed -nzE "s/^.*## $LAST_TAG([^#]*).*$/\1/p" CHANGELOG.md  | sed -e '/./,$!d' -e :a -e '/^\n*$/{$d;N;ba' -e '}'
echo "------------------------------------"
